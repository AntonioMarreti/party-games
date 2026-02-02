<?php
// server/games/wordclash.php

// Cache for loaded words to avoid re-reading file on every check in the same request
$wordCache = [];

// Load words by length
function loadWords($length = 5)
{
    global $wordCache;
    if (isset($wordCache[$length]))
        return $wordCache[$length];

    $file = __DIR__ . '/../../words/russian_' . $length . '.json';
    if (!file_exists($file)) {
        return ['пират', 'слово', 'игра']; // Fallback
    }
    $words = json_decode(file_get_contents($file), true);
    $result = is_array($words) ? $words : [];

    // Normalize words just in case
    $result = array_map(function ($w) {
        return mb_strtolower(trim($w), 'UTF-8');
    }, $result);

    $wordCache[$length] = $result;
    return $result;
}

// Validate word exists in dictionary
function isValidWord($word, $length)
{
    $words = loadWords($length);
    return in_array(mb_strtolower(trim($word), 'UTF-8'), $words);
}

function getInitialState()
{
    return [
        'phase' => 'setup', // NEW: setup, playing, intermission, game_over
        'word_length' => 5, // Default
        'round_count' => null, // null = infinite
        'current_round' => 0,
        'secret_word' => '',
        'history' => [],
        'scores' => [],
        'winner_id' => null,
        'game_over' => false
    ];
}

function handleGameAction($pdo, $room, $user, $postData)
{
    $state = json_decode($room['game_state'], true);
    $type = $postData['type'];

    // --- CONFIGURE GAME (Setup Phase) ---
    if ($type === 'configure_game') {
        if (!$room['is_host'])
            return ['error' => 'Only host can configure game'];
        if ($state['phase'] !== 'setup')
            return ['error' => 'Game already started'];

        $wordLength = isset($postData['word_length']) ? (int) $postData['word_length'] : ($state['word_length'] ?? 5);

        $roundCount = $state['round_count'];
        if (isset($postData['round_count'])) {
            $roundCount = $postData['round_count'];
            if ($roundCount === 'null' || $roundCount === '')
                $roundCount = null;
            else
                $roundCount = (int) $roundCount;
        }

        $shouldStart = isset($postData['start']) && ($postData['start'] === true || $postData['start'] === 'true' || $postData['start'] === '1');

        // Validate
        if (!in_array($wordLength, [5, 6, 7])) {
            return ['error' => 'Invalid word length'];
        }

        // Update state with new settings
        $state['word_length'] = $wordLength;
        $state['round_count'] = $roundCount; // null or number

        // Only start game if 'start' flag is true
        if ($shouldStart) {
            // Load word list and select secret word
            $words = loadWords($wordLength);
            if (empty($words)) {
                return ['error' => 'Word database not found'];
            }

            $state['current_round'] = 1;
            $state['secret_word'] = $words[array_rand($words)];
            $state['phase'] = 'playing';
            $state['history'] = [];
            $state['scores'] = [];
        }

        updateGameState($room['id'], $state);
        return ['status' => 'ok'];
    }

    // --- NEXT ROUND (Intermission Phase) ---
    if ($type === 'next_round') {
        if (!$room['is_host'])
            return ['error' => 'Only host can start next round'];
        if ($state['phase'] !== 'intermission')
            return ['error' => 'Not in intermission'];

        $words = loadWords($state['word_length']);
        $state['current_round']++;
        $state['secret_word'] = $words[array_rand($words)];
        $state['history'] = [];
        $state['winner_id'] = null;
        $state['game_over'] = false;
        $state['phase'] = 'playing';

        updateGameState($room['id'], $state);
        return ['status' => 'ok'];
    }

    // --- RESTART / NEXT ROUND ---
    if ($type === 'restart') {
        if (!$room['is_host'])
            return ['error' => 'Only host can restart'];

        $wordLength = $state['word_length'] ?? 5;
        $words = loadWords($wordLength);

        $state['secret_word'] = $words[array_rand($words)];
        $state['current_round'] = ($state['current_round'] ?? 0) + 1;
        $state['history'] = [];
        $state['winner_id'] = null;
        $state['game_over'] = false;
        $state['phase'] = 'playing';

        updateGameState($room['id'], $state);
        return ['status' => 'ok'];
    }

    // --- SUBMIT GUESS ---
    if ($type === 'submit_guess') {
        if ($state['game_over'])
            return ['status' => 'error', 'message' => 'Game is over'];

        // Set internal encoding to be safe
        mb_internal_encoding("UTF-8");

        $guess = mb_strtolower(trim($postData['word']), 'UTF-8');
        $wordLength = (int) ($state['word_length'] ?? 5);

        // 1. Validate Length
        $actualLen = mb_strlen($guess, 'UTF-8');
        if ($actualLen !== $wordLength) {
            return ['status' => 'error', 'message' => "Слово '$guess' ($actualLen) должно быть из $wordLength букв"];
        }

        // 2. Validate Dictionary
        $words = loadWords($wordLength);
        if (!in_array($guess, $words)) {
            $count = count($words);
            return ['status' => 'error', 'message' => "Слова '$guess' нет в базе ($count слов)"];
        }

        // 2.1 Check for Duplicates (Round History)
        if (isset($state['history'])) {
            foreach ($state['history'] as $entry) {
                if ($entry['word'] === $guess) {
                    return ['status' => 'error', 'message' => "Это слово уже было использовано!"];
                }
            }
        }

        // 3. Calculate Pattern (2 = Green, 1 = Yellow, 0 = Grey)
        $secret = $state['secret_word'];
        $secretArr = mb_str_split($secret);
        $guessArr = mb_str_split($guess);
        $length = mb_strlen($secret);

        $pattern = array_fill(0, $length, 0);
        $secretUsed = array_fill(0, $length, false);
        $guessUsed = array_fill(0, $length, false);

        // Pass 1: Greens (Exact matches)
        for ($i = 0; $i < $length; $i++) {
            if ($guessArr[$i] === $secretArr[$i]) {
                $pattern[$i] = 2;
                $secretUsed[$i] = true;
                $guessUsed[$i] = true;
            }
        }

        // Pass 2: Yellows (Wrong position)
        for ($i = 0; $i < $length; $i++) {
            if ($guessUsed[$i])
                continue;
            for ($j = 0; $j < $length; $j++) {
                if (!$secretUsed[$j] && $guessArr[$i] === $secretArr[$j]) {
                    $pattern[$i] = 1;
                    $secretUsed[$j] = true;
                    break;
                }
            }
        }

        // 4. Calculate Score & Add to History
        $points = 0;
        foreach ($pattern as $p) {
            if ($p === 2)
                $points += 2;
            elseif ($p === 1)
                $points += 1;
        }

        // Init score if needed
        if (!isset($state['scores']))
            $state['scores'] = [];
        if (!isset($state['scores'][$user['id']]))
            $state['scores'][$user['id']] = 0;

        $state['scores'][$user['id']] += $points;

        $entry = [
            'user_id' => $user['id'],
            'word' => $guess,
            'pattern' => $pattern,
            'score_delta' => $points, // Store detailed delta for animations
            'timestamp' => time()
        ];

        $state['history'][] = $entry;

        // 5. Check Row Win (Word guessed correctly)
        if ($guess === $secret) {
            $state['winner_id'] = $user['id'];
            $state['scores'][$user['id']] += 10; // Bonus for winning the round

            // Check if final round
            $isFinal = ($state['round_count'] !== null && $state['current_round'] >= $state['round_count']);

            if ($isFinal) {
                $state['phase'] = 'game_over';
                $state['game_over'] = true;
            } else {
                $state['phase'] = 'intermission';
                $state['game_over'] = false; // Still active game, just round over
            }
        }

        updateGameState($room['id'], $state);
        return ['status' => 'ok'];
    }

    return ['status' => 'ok'];
}

// Helper for splitting multibyte string
if (!function_exists('mb_str_split')) {
    function mb_str_split($string)
    {
        return preg_split('/(?<!^)(?!$)/u', $string);
    }
}
