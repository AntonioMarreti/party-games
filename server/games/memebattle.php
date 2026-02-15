<?php
// server/games/memebattle.php

define('MEMEBATTLE_PACK', __DIR__ . '/packs/memebattle/base.json');

function getInitialState()
{
    // Load situations from pack
    $pack = json_decode(file_get_contents(MEMEBATTLE_PACK), true);
    $situations = $pack['situations'] ?? [];
    shuffle($situations);

    return [
        'phase' => 'lobby', // lobby, round_situation, round_submission, round_voting, round_results, results
        'current_round' => 0,
        'total_rounds' => 5,
        'situations_deck' => $situations,
        'current_situation' => null,
        'scores' => [], // { userId: score }
        'history' => [],
        'hands' => [] // { userId: [gifs] }
    ];
}

function handleGameAction($pdo, $room, $user, $postData)
{
    $state = json_decode($room['game_state'], true);
    $type = $postData['type'];
    $userId = (string) $user['id'];

    if ($type === 'start_game') {
        if (!$room['is_host'])
            return ['status' => 'error', 'message' => 'Only host'];

        // 1. Config
        $rounds = max(1, min(20, (int) ($postData['rounds'] ?? 5)));
        $theme = $postData['theme'] ?? 'base';
        $aiMode = !empty($postData['ai_mode']);
        $customTopic = $postData['custom_topic'] ?? '';

        $state['phase'] = 'round_situation';
        $state['current_round'] = 1;
        $state['total_rounds'] = $rounds;
        $state['scores'] = [];
        $state['theme'] = $theme;
        $state['ai_mode'] = $aiMode;

        // 2. Load Content
        $situations = [];

        if ($aiMode) {
            require_once __DIR__ . '/../lib/GigaChat.php';
            try {
                $gc = GigaChat::getInstance();
                $topicPrompt = $theme === 'custom' ? $customTopic : $theme;
                // Add context for predefined themes
                if ($theme === 'school')
                    $topicPrompt = "Школа, уроки, студенты, экзамены";
                if ($theme === 'office')
                    $topicPrompt = "Работа, офис, начальник, дедлайны";
                if ($theme === 'it')
                    $topicPrompt = "Программирование, IT, разработчики, баги";
                if ($theme === 'relationships')
                    $topicPrompt = "Отношения, свидания, бывшие, любовь";
                if ($theme === 'base')
                    $topicPrompt = "Жизненные смешные ситуации";

                $prompt = "Придумай {$rounds} смешных и жизненных ситуаций для игры 'Мемология' на тему: '{$topicPrompt}'. 
                 Ситуации должны быть короткими (1-2 предложения), смешными и понятными.
                 Формат JSON:
                 {
                    \"situations\": [
                        \"Твое лицо, когда...\",
                        \"Когда...\"
                    ]
                 }
                 Не используй Markdown, только JSON.";

                $response = $gc->chat([['role' => 'user', 'content' => $prompt]]);
                $content = $response['choices'][0]['message']['content'] ?? '';
                $content = str_replace(['```json', '```'], '', $content);
                $aiData = json_decode($content, true);

                if ($aiData && !empty($aiData['situations'])) {
                    $situations = $aiData['situations'];
                    // Ensure we have enough
                    while (count($situations) < $rounds) {
                        $situations[] = "ИИ устал, вот запасная ситуация #" . count($situations);
                    }
                    $situations = array_slice($situations, 0, $rounds);

                    // Save to Library
                    foreach ($situations as $sit) {
                        // Ensure string for DB
                        $sitStr = is_string($sit) ? $sit : json_encode($sit);
                        saveGameContent($pdo, 'memebattle', 'situation', $sitStr, [$theme, 'ai_round']);
                    }
                } else {
                    throw new Exception("AI returned invalid JSON");
                }
            } catch (Exception $e) {
                TelegramLogger::logError('memebattle_ai', ['message' => $e->getMessage()]);
                // Fallback to base pack if AI fails
                $pack = json_decode(file_get_contents(__DIR__ . '/packs/memebattle/base.json'), true);
                $situations = $pack['situations'] ?? [];
                shuffle($situations);
            }
        } else {
            // Load specific pack
            $packPath = __DIR__ . "/packs/memebattle/{$theme}.json";
            if (!file_exists($packPath))
                $packPath = __DIR__ . '/packs/memebattle/base.json';

            $pack = json_decode(file_get_contents($packPath), true);
            $situations = $pack['situations'] ?? [];
            shuffle($situations);
        }

        // 3. Setup Deck
        // Ensure we have enough cards for requested rounds
        if (count($situations) < $rounds && !$aiMode) {
            // If local pack is too small, just loop it or fill with base
            $basePack = json_decode(file_get_contents(__DIR__ . '/packs/memebattle/base.json'), true);
            $situations = array_merge($situations, $basePack['situations'] ?? []);
        }

        // Flatten and ensure strings
        $flatSituations = [];
        foreach ($situations as $s) {
            if (is_string($s)) {
                $flatSituations[] = $s;
            } elseif (is_array($s) && isset($s['text'])) {
                $flatSituations[] = $s['text'];
            } elseif (is_array($s)) {
                $flatSituations[] = json_encode($s);
            } else {
                $flatSituations[] = (string) $s;
            }
        }

        $state['situations_deck'] = array_slice($flatSituations, 0, $rounds);

        // 4. Init Scores
        $stmt = $pdo->prepare("SELECT user_id FROM room_players WHERE room_id = ?");
        $stmt->execute([$room['id']]);
        $allIds = $stmt->fetchAll(PDO::FETCH_COLUMN);
        foreach ($allIds as $id) {
            $state['scores'][$id] = 0;
        }

        nextRound($state);
        updateGameState($room['id'], $state);
        return ['status' => 'ok'];
    }

    if ($type === 'refresh_hand') {
        if ($state['phase'] !== 'round_submission')
            return ['status' => 'error', 'message' => 'Wrong phase'];

        require_once __DIR__ . '/../lib/GifProvider.php';
        $gifProvider = GifProviderFactory::create();

        $situation = $state['current_situation']['text'] ?? '';
        // Defensive string check
        if (is_array($situation) || is_object($situation)) {
            $situation = json_encode($situation);
        }
        $situation = (string) $situation;

        // Simple keyword extraction (split by space, filter small words)
        $words = explode(' ', $situation);
        $keywords = array_filter($words, function ($w) {
            return mb_strlen($w) > 3;
        });
        $query = !empty($keywords) ? implode(' ', array_slice($keywords, 0, 3)) : 'funny meme';

        try {
            $data = $gifProvider->search($query, 12);
            $gifs = $data['results'] ?? [];
            if (empty($gifs))
                $gifs = $gifProvider->search('funny', 12)['results'] ?? [];

            shuffle($gifs);
            $state['hands'][$userId] = array_slice($gifs, 0, 6);
            updateGameState($room['id'], $state);
            return ['status' => 'ok', 'hand' => $state['hands'][$userId]];
        } catch (Exception $e) {
            return ['status' => 'error', 'message' => $e->getMessage()];
        }
    }

    if ($type === 'submit_meme') {
        if ($state['phase'] !== 'round_submission')
            return ['status' => 'error', 'message' => 'Wrong phase'];
        if (isset($state['submissions'][$userId]))
            return ['status' => 'error', 'message' => 'Already submitted'];

        $url = $postData['url'];
        $state['submissions'][$userId] = $url;

        // Check if all submitted
        $stmt = $pdo->prepare("SELECT user_id FROM room_players WHERE room_id = ?");
        $stmt->execute([$room['id']]);
        $allIds = $stmt->fetchAll(PDO::FETCH_COLUMN);

        if (count($state['submissions']) >= count($allIds)) {
            $state['phase'] = 'round_voting';
            $state['votes'] = [];
        }

        updateGameState($room['id'], $state);
        return ['status' => 'ok'];
    }

    if ($type === 'vote_meme') {
        if ($state['phase'] !== 'round_voting')
            return ['status' => 'error', 'message' => 'Wrong phase'];

        $targetId = $postData['target_id'];
        if ($targetId === $userId)
            return ['status' => 'error', 'message' => 'Cannot vote for self'];

        $state['votes'][$userId] = $targetId;

        // Check if all voted
        $stmt = $pdo->prepare("SELECT COUNT(*) FROM room_players WHERE room_id = ?");
        $stmt->execute([$room['id']]);
        $playerCount = $stmt->fetchColumn();

        if (count($state['votes']) >= $playerCount) {
            // Calculate scores
            $roundScores = [];
            foreach ($state['votes'] as $voter => $target) {
                if (!isset($state['scores'][$target]))
                    $state['scores'][$target] = 0;
                $state['scores'][$target] += 100; // 100 points per vote
                $roundScores[$target] = ($roundScores[$target] ?? 0) + 1;
            }

            $state['phase'] = 'round_results';
            $state['last_round_data'] = [
                'votes' => $state['votes'],
                'scores' => $roundScores
            ];
        }

        updateGameState($room['id'], $state);
        return ['status' => 'ok'];
    }

    if ($type === 'next_round') {
        if (!$room['is_host'])
            return ['status' => 'error'];

        if ($state['phase'] === 'round_situation') {
            $state['phase'] = 'round_submission';
            generateHands($pdo, $room, $state);
        } elseif ($state['phase'] === 'round_results') {
            // Next round or End Game
            $state['current_round']++;
            if ($state['current_round'] > $state['total_rounds']) {
                $state['phase'] = 'results';
            } else {
                nextRound($state);
            }
        }

        updateGameState($room['id'], $state);
        return ['status' => 'ok'];
    }

    return ['status' => 'ok'];
}

function nextRound(&$state)
{
    if (empty($state['situations_deck'])) {
        $state['phase'] = 'results';
        return;
    }

    $situation = array_shift($state['situations_deck']);
    $state['current_situation'] = ['text' => $situation];
    $state['submissions'] = [];
    $state['votes'] = [];

    // Reset round specific data
    unset($state['last_round_data']);

    $state['phase'] = 'round_situation';
    $state['timer_start'] = time();
}
function generateHands($pdo, $room, &$state)
{
    require_once __DIR__ . '/../lib/GifProvider.php';
    $gifProvider = GifProviderFactory::create();

    $situation = $state['current_situation']['text'] ?? '';

    // Safety check: ensure string (defensive coding against [object Object])
    if (is_array($situation) || is_object($situation)) {
        $situation = json_encode($situation);
    }
    $situation = (string) $situation;

    // Simple keyword extraction (split by space, filter small words)
    $words = explode(' ', $situation);
    $keywords = array_filter($words, function ($w) {
        return mb_strlen($w) > 3;
    });
    $query = !empty($keywords) ? implode(' ', array_slice($keywords, 0, 3)) : 'funny meme';

    try {
        // Fetch from multiple sources if possible
        $data = $gifProvider->search($query, 30);
        $pool = $data['results'] ?? [];

        if (count($pool) < 20) {
            $extra = $gifProvider->search('funny', 30);
            $pool = array_merge($pool, $extra['results'] ?? []);
        }

        if (count($pool) < 10) {
            $extra2 = $gifProvider->search('meme', 30);
            $pool = array_merge($pool, $extra2['results'] ?? []);
        }

        TelegramLogger::info('memebattle_hands', ['query' => $query, 'pool_size' => count($pool)]);

        $stmt = $pdo->prepare("SELECT user_id FROM room_players WHERE room_id = ?");
        $stmt->execute([$room['id']]);
        $players = $stmt->fetchAll(PDO::FETCH_COLUMN);

        $state['hands'] = [];
        foreach ($players as $pid) {
            shuffle($pool);
            $state['hands'][(string) $pid] = array_slice($pool, 0, 6);
        }
    } catch (Exception $e) {
        TelegramLogger::logError('memebattle_hands', ['message' => $e->getMessage()]);
    }
}
?>