<?php
// server/games/wordclash.php

define('WC_WORDS_FILE', __DIR__ . '/packs/wordclash/words.json');

function getInitialState() {
    $words = [];
    if (file_exists(WC_WORDS_FILE)) {
        $words = json_decode(file_get_contents(WC_WORDS_FILE), true);
    }
    
    // Fallback if file missing
    if (empty($words)) $words = ['пират'];

    $secret = $words[array_rand($words)];

    return [
        'phase' => 'round', // No setup needed really, just jump to round 1
        'round_count' => 1,
        'secret_word' => $secret, // Note: In a real secure app, we wouldn't send this to client. But for MVP/Local, it's fine or we filter it in api.php if needed.
        // Actually, let's keep it here but Client UI should NOT peek at it.
        // Actually, let's keep it here but Client UI should NOT peek at it.
        'history' => [], // Array of { user_id, word, pattern, timestamp }
        'scores' => [], // UserID -> Points
        'winner_id' => null,
        'game_over' => false
    ];
}

function handleGameAction($pdo, $room, $user, $postData) {
    $state = json_decode($room['game_state'], true);
    $type = $postData['type'];

    // --- RESTART / NEXT ROUND ---
    if ($type === 'restart') {
        // Allow anyone to restart for now, or just host? Let's say Host.
        if (!$room['is_host']) return ['error' => 'Only host can restart'];
        
        $state = getInitialState();
        $state['round_count'] = ($state['round_count'] ?? 0) + 1;
        
        updateGameState($room['id'], $state);
        return ['status' => 'ok'];
    }

    // --- SUBMIT GUESS ---
    if ($type === 'submit_guess') {
        if ($state['game_over']) return ['status' => 'error', 'message' => 'Game is over'];
        
        $guess = mb_strtolower(trim($postData['word']));
        
        
        // 1. Validate Length
        if (mb_strlen($guess) !== 5) return ['status' => 'error', 'message' => 'Слово должно быть из 5 букв'];

        // 2. Validate Dictionary
        $words = [];
        if (file_exists(WC_WORDS_FILE)) {
            $words = json_decode(file_get_contents(WC_WORDS_FILE), true);
        }
        if (!in_array($guess, $words)) {
            return ['status' => 'error', 'message' => 'Такого слова нет в словаре'];
        }

        // 3. Calculate Pattern
        // 2 = Green, 1 = Yellow, 0 = Grey
        $secret = $state['secret_word'];
        $pattern = [0, 0, 0, 0, 0];
        $secretArr = mb_str_split($secret);
        $guessArr = mb_str_split($guess);
        
        // Pass 1: Greens (Exact matches)
        $secretUsed = array_fill(0, 5, false);
        $guessUsed = array_fill(0, 5, false);

        for ($i = 0; $i < 5; $i++) {
            if ($guessArr[$i] === $secretArr[$i]) {
                $pattern[$i] = 2;
                $secretUsed[$i] = true;
                $guessUsed[$i] = true;
            }
        }

        // Pass 2: Yellows (Wrong position)
        for ($i = 0; $i < 5; $i++) {
            if ($guessUsed[$i]) continue; // Already green

            for ($j = 0; $j < 5; $j++) {
                if (!$secretUsed[$j] && $guessArr[$i] === $secretArr[$j]) {
                    $pattern[$i] = 1;
                    $secretUsed[$j] = true; // Mark this secret letter as "used" for a yellow match
                    break;
                }
            }
        }

        // 4. Calculate Score & Add to History
        $points = 0;
        foreach ($pattern as $p) {
            if ($p === 2) $points += 2;
            elseif ($p === 1) $points += 1;
        }

        // Init score if needed
        if (!isset($state['scores'])) $state['scores'] = [];
        if (!isset($state['scores'][$user['id']])) $state['scores'][$user['id']] = 0;

        $state['scores'][$user['id']] += $points;

        $entry = [
            'user_id' => $user['id'],
            'word' => $guess,
            'pattern' => $pattern,
            'score_delta' => $points, // Store detailed delta for animations
            'timestamp' => time()
        ];
        
        $state['history'][] = $entry;

        // 5. Check Win
        if ($guess === $secret) {
            $state['winner_id'] = $user['id'];
            $state['game_over'] = true;
            $state['scores'][$user['id']] += 10; // Bonus for winning
        }

        updateGameState($room['id'], $state);
        return ['status' => 'ok'];
    }

    return ['status' => 'ok'];
}

// Helper for splitting multibyte string
if (!function_exists('mb_str_split')) {
    function mb_str_split($string) {
        return preg_split('/(?<!^)(?!$)/u', $string);
    }
}
