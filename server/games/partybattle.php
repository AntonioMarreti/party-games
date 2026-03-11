<?php
// server/games/partybattle.php

function getInitialState()
{
    // Return base state for the lobby
    return [
        'phase' => 'lobby', // lobby, round_situation, round_submission, round_voting, round_results, results
        'mode' => 'meme', // meme, joke, whoami
        'current_round' => 0,
        'total_rounds' => 5,
        'situations_deck' => [],
        'current_situation' => null,
        'scores' => [], // { userId: score }
        'history' => [],
        'hands' => [], // For meme mode: { userId: [gifs] }
        'submissions' => [], // { userId: text/url }
        'votes' => [] // { voterId: targetId_or_submissionId }
    ];
}

function handleGameAction($pdo, $room, $user, $postData)
{
    $state = json_decode($room['game_state'], true);
    $type = $postData['type'];
    $userId = (string) $user['id'];

    if ($type === 'start_game') {
        error_log("PartyBattle: Starting game... rounds=" . ($postData['rounds'] ?? 5));
        if (!$room['is_host'])
            return ['status' => 'error', 'message' => 'Only host'];

        $rounds = max(1, min(20, (int) ($postData['rounds'] ?? 5)));
        $modes = $postData['mode'] ?? ['meme'];
        if (!is_array($modes)) {
            $modes = [$modes];
        }
        if (empty($modes))
            $modes = ['meme'];

        $theme = $postData['theme'] ?? 'base';
        $aiMode = !empty($postData['ai_mode']);
        $customTopic = $postData['custom_topic'] ?? '';

        $state['phase'] = 'round_situation';
        $state['mode'] = $modes[0];
        $state['current_round'] = 1;
        $state['total_rounds'] = $rounds;
        $state['scores'] = [];
        $state['theme'] = $theme;
        $state['ai_mode'] = $aiMode;

        // Init scores
        $stmt = $pdo->prepare("SELECT user_id FROM room_players WHERE room_id = ?");
        $stmt->execute([$room['id']]);
        $allIds = $stmt->fetchAll(PDO::FETCH_COLUMN);
        foreach ($allIds as $id) {
            $state['scores'][(string) $id] = 0;
        }

        error_log("PartyBattle: Generating deck for modes: " . implode(',', $modes));
        // Generate mixed deck
        $mixedDeck = [];
        foreach ($modes as $m) {
            $deck = pb_generateDeck($pdo, $m, $theme, $aiMode, $customTopic, $rounds);
            if (empty($deck)) {
                error_log("PartyBattle: WARNING: Deck for mode $m is empty!");
                continue;
            }
            shuffle($deck);
            // Take up to $rounds from each to ensure enough variety after final shuffle
            $limit = max(3, $rounds);
            $deck = array_slice($deck, 0, $limit);
            foreach ($deck as $card) {
                $mixedDeck[] = ['_mode' => $m, 'situation' => $card];
            }
        }
        shuffle($mixedDeck);

        // Ensure enough cards
        if (count($mixedDeck) < $rounds && count($mixedDeck) > 0) {
            $baseRounds = $rounds;
            while (count($mixedDeck) < $baseRounds) {
                $mixedDeck = array_merge($mixedDeck, $mixedDeck);
            }
        }

        if (empty($mixedDeck)) {
            error_log("PartyBattle: ERROR: Failed to generate deck!");
            return ['status' => 'error', 'message' => 'Не удалось сгенерировать колоду. Попробуйте другой набор или отключите AI.'];
        }

        $state['situations_deck'] = array_slice($mixedDeck, 0, $rounds);

        error_log("PartyBattle: Deck generated, starting first round.");
        pb_nextRound($state);
        updateGameState($room['id'], $state);
        return ['status' => 'ok'];
    }

    if ($type === 'refresh_hand') {
        if ($state['mode'] !== 'meme')
            return ['status' => 'error'];
        if ($state['phase'] !== 'round_submission')
            return ['status' => 'error'];

        require_once __DIR__ . '/../lib/GifProvider.php';
        $gifProvider = GifProviderFactory::create();

        $situation = pb_getSituationText($state['current_situation']);
        $keywords = pb_extractKeywords($situation);
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


    if ($type === 'search_gifs') {
        if ($state['mode'] !== 'meme')
            return ['status' => 'error', 'message' => 'Not in meme mode'];

        require_once __DIR__ . '/../lib/GifProvider.php';
        $gifProvider = GifProviderFactory::create();
        $query = trim($postData['query'] ?? 'funny');
        if (empty($query))
            $query = 'funny meme';

        try {
            $data = $gifProvider->search($query, 12);
            $results = $data['results'] ?? [];
            return ['status' => 'ok', 'results' => $results];
        } catch (Exception $e) {
            return ['status' => 'error', 'message' => $e->getMessage()];
        }
    }

    if ($type === 'submit_answer') {
        if ($state['phase'] !== 'round_submission')
            return ['status' => 'error', 'message' => 'Wrong phase'];
        if (isset($state['submissions'][$userId]))
            return ['status' => 'error', 'message' => 'Already submitted'];

        $answer = trim($postData['answer'] ?? '');
        if (empty($answer))
            return ['status' => 'error', 'message' => 'Empty answer'];

        $state['submissions'][$userId] = $answer;

        $stmt = $pdo->prepare("SELECT user_id FROM room_players WHERE room_id = ?");
        $stmt->execute([$room['id']]);
        $allIds = $stmt->fetchAll(PDO::FETCH_COLUMN);

        if (count($state['submissions']) >= count($allIds)) {
            if ($state['mode'] === 'bluff') {
                // Inject the true fact
                $state['submissions']['truth'] = $state['current_situation']['truth'] ?? 'ПРАВДА ПОТЕРЯНА';
            }
            $state['phase'] = 'round_voting';
            $state['votes'] = [];
        }

        updateGameState($room['id'], $state);
        return ['status' => 'ok'];
    }

    if ($type === 'vote') {
        if ($state['phase'] !== 'round_voting')
            return ['status' => 'error', 'message' => 'Wrong phase'];
        if (isset($state['votes'][$userId]))
            return ['status' => 'error', 'message' => 'Already voted'];

        $targetId = $postData['target_id'];
        // В WhoAmI разрешено «голосовать за себя», в других режимах — нет
        if ($state['mode'] !== 'whoami' && $targetId === $userId)
            return ['status' => 'error', 'message' => 'Cannot vote for self'];

        $state['votes'][$userId] = $targetId;

        $stmt = $pdo->prepare("SELECT COUNT(*) FROM room_players WHERE room_id = ?");
        $stmt->execute([$room['id']]);
        $playerCount = $stmt->fetchColumn();

        if (count($state['votes']) >= $playerCount) {
            $roundScores = [];
            foreach ($state['votes'] as $voter => $target) {
                if ($state['mode'] === 'bluff') {
                    if ($target === 'truth') {
                        // Voter guessed the truth correctly
                        if (!isset($state['scores'][$voter]))
                            $state['scores'][$voter] = 0;
                        $state['scores'][$voter] += 100;
                        $roundScores[$voter] = ($roundScores[$voter] ?? 0) + 1; // Mark that voter got it right
                    } else {
                        // Voter fell for someone's lie. Award points to the liar.
                        if (!isset($state['scores'][$target]))
                            $state['scores'][$target] = 0;
                        $state['scores'][$target] += 100;
                        $roundScores[$target] = ($roundScores[$target] ?? 0) + 1;
                    }
                } else {
                    // Standard scoring for all other modes: target gets points
                    if (!isset($state['scores'][$target]))
                        $state['scores'][$target] = 0;
                    $state['scores'][$target] += 100;
                    $roundScores[$target] = ($roundScores[$target] ?? 0) + 1;
                }
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
            if ($state['mode'] === 'whoami') {
                // WhoAmI не требует submission, сразу к голосованию
                $state['phase'] = 'round_voting';
                $state['submissions'] = (object) []; // пустой объект, не массив
                $state['votes'] = [];
            } else {
                $state['phase'] = 'round_submission';
                if ($state['mode'] === 'meme') {
                    pb_generateHands($pdo, $room, $state);
                }
                $state['submissions'] = [];
                $state['votes'] = [];
            }
        } elseif ($state['phase'] === 'round_results') {
            $state['current_round']++;
            if ($state['current_round'] > $state['total_rounds']) {
                $state['phase'] = 'results';
            } else {
                pb_nextRound($state);
            }
        }

        updateGameState($room['id'], $state);
        return ['status' => 'ok'];
    }

    if ($type === 'back_to_lobby') {
        if ($room['is_host']) {
            $pdo->prepare("UPDATE rooms SET game_type = 'lobby', status = 'waiting', game_state = NULL WHERE id = ?")
                ->execute([$room['id']]);
        }
        return ['status' => 'ok', 'redirect' => 'lobby'];
    }

    return ['status' => 'ok'];
}

function processGameBots($pdo, $room, &$state)
{
    $allPlayers = [];
    $stmt = $pdo->prepare("SELECT user_id, is_bot FROM room_players WHERE room_id = ?");
    $stmt->execute([$room['id']]);
    while ($row = $stmt->fetch()) {
        $allPlayers[(string) $row['user_id']] = $row['is_bot'];
    }

    $bots = array_filter($allPlayers, function ($isBot) {
        return $isBot;
    });

    if (empty($bots))
        return false;

    $changed = false;

    // Phase 1: Round Submission
    if ($state['phase'] === 'round_submission') {
        foreach ($bots as $botId => $_) {
            if (!isset($state['submissions'][$botId])) {
                // Determine bot answer based on mode
                $answer = null;
                if ($state['mode'] === 'meme') {
                    $hand = $state['hands'][$botId] ?? [];
                    if (!empty($hand)) {
                        $card = $hand[array_rand($hand)];
                        $answer = $card['media_formats']['tinygif']['url'] ?? $card['media_formats']['gif']['url'] ?? $card['url'];
                    }
                } elseif (in_array($state['mode'], ['joke', 'advice', 'acronym', 'bluff', 'caption'])) {
                    $contentPath = __DIR__ . '/packs/partybattle_bots.json';
                    $funnyLibrary = ["Я здесь просто ради еды.", "Ахаха, лол.", "Я не понял шутку.", "Это слишком сложно."]; // Fallback
                    if (file_exists($contentPath)) {
                        $contentData = json_decode(file_get_contents($contentPath), true);
                        if (!empty($contentData['bot_jokes'])) {
                            $funnyLibrary = $contentData['bot_jokes'];
                        }
                    }
                    $answer = $funnyLibrary[array_rand($funnyLibrary)];
                }

                if ($answer) {
                    $state['submissions'][$botId] = $answer;
                    $changed = true;
                }
            }
        }

        // Check if all submitted
        if (count($state['submissions']) >= count($allPlayers)) {
            $state['phase'] = 'round_voting';
            $state['votes'] = [];
            $changed = true;
        }
    }

    // Phase 2: Round Voting
    if ($state['phase'] === 'round_voting') {
        foreach ($bots as $botId => $_) {
            if (!isset($state['votes'][$botId])) {
                // Bot picks a favorite (can't be self in meme/joke)
                $candidates = array_keys($allPlayers);
                if ($state['mode'] !== 'whoami') {
                    $candidates = array_filter($candidates, function ($id) use ($botId) {
                        return $id !== $botId;
                    });
                }

                // In bluff mode, bots should sometimes pick the truth
                if ($state['mode'] === 'bluff') {
                    $candidates[] = 'truth';
                }

                if (!empty($candidates)) {
                    $targetId = $candidates[array_rand($candidates)];
                    $state['votes'][$botId] = $targetId;
                    $changed = true;
                }
            }
        }

        // Check if all voted
        if (count($state['votes']) >= count($allPlayers)) {
            $roundScores = [];
            foreach ($state['votes'] as $voter => $target) {
                if (!isset($state['scores'][$target]))
                    $state['scores'][$target] = 0;
                $state['scores'][$target] += 100;
                $roundScores[$target] = ($roundScores[$target] ?? 0) + 1;
            }

            $state['phase'] = 'round_results';
            $state['last_round_data'] = [
                'votes' => $state['votes'],
                'scores' => $roundScores
            ];
            $changed = true;
        }
    }

    return $changed;
}

/* HELPER FUNCTIONS */

function pb_nextRound(&$state)
{
    if (empty($state['situations_deck'])) {
        $state['phase'] = 'results';
        return;
    }

    $card = array_shift($state['situations_deck']);
    if (is_array($card) && isset($card['_mode'])) {
        $state['mode'] = $card['_mode'];
        $state['current_situation'] = $card['situation'];
    } else {
        $state['current_situation'] = $card;
    }

    $state['submissions'] = [];
    $state['votes'] = [];
    unset($state['last_round_data']);

    // Determine initial phase for this round
    // Text-based modes can skip the focus screen and go straight to input
    $fastModes = ['acronym', 'advice', 'joke', 'bluff'];
    if (in_array($state['mode'], $fastModes)) {
        $state['phase'] = 'round_submission';
    } else {
        $state['phase'] = 'round_situation';
    }

    $state['timer_start'] = time();
}

function pb_generateHands($pdo, $room, &$state)
{
    require_once __DIR__ . '/../lib/GifProvider.php';
    $gifProvider = GifProviderFactory::create();

    $situation = pb_getSituationText($state['current_situation']);
    $keywords = pb_extractKeywords($situation);
    $query = !empty($keywords) ? implode(' ', array_slice($keywords, 0, 3)) : 'funny meme';

    try {
        $data = $gifProvider->search($query, 30);
        $pool = $data['results'] ?? [];
        if (count($pool) < 20) {
            $pool = array_merge($pool, $gifProvider->search('funny', 30)['results'] ?? []);
        }

        $stmt = $pdo->prepare("SELECT user_id FROM room_players WHERE room_id = ?");
        $stmt->execute([$room['id']]);
        $players = $stmt->fetchAll(PDO::FETCH_COLUMN);

        $state['hands'] = [];
        foreach ($players as $pid) {
            shuffle($pool);
            $state['hands'][(string) $pid] = array_slice($pool, 0, 6);
        }
    } catch (Exception $e) {
        if (class_exists('TelegramLogger'))
            TelegramLogger::logError('partybattle_hands', ['message' => $e->getMessage()]);
    }
}

function pb_getSituationText($situation)
{
    if (is_array($situation)) {
        return $situation['text'] ?? $situation['question'] ?? json_encode($situation);
    }
    return (string) $situation;
}

function pb_extractKeywords($text)
{
    $words = mb_split('\s+', $text);
    return array_filter($words, function ($w) {
        return mb_strlen($w) > 3;
    });
}

function pb_generateDeck($pdo, $mode, $theme, $aiMode = false, $customTopic = '', $rounds = 5)
{
    // Mapping for themes
    if ($theme === 'adult')
        $theme = '18plus';

    $situations = [];

    // WhoAmI logic
    if ($mode === 'whoami') {
        $packPath = __DIR__ . "/packs/partybattle/whoami/{$theme}.json";
        if (!file_exists($packPath)) {
            $files = glob(__DIR__ . '/packs/partybattle/whoami/*.json');
            $packPath = $files[0] ?? '';
        }
        if (file_exists($packPath)) {
            $pack = json_decode(file_get_contents($packPath), true);
            $situations = $pack['questions'] ?? [];
        }
        shuffle($situations);
        return $situations;
    }

    // Standard text-based modes (Joke, Advice, Acronym, Caption, Bluff)
    if ($aiMode && $mode === 'joke') {
        require_once __DIR__ . '/../lib/AI/AIService.php';
        try {
            $prompt = "Придумай {$rounds} коротких сетапов (начало шутки) для игры 'Добивка'. 
            Люди будут придумывать смешные концовки сами.
            Формат JSON: {\"situations\": [\"Заходит улитка в бар и говорит...\", \"Самый плохой совет на первом свидании это...\"]}
            Не используй Markdown, только чистый JSON.";

            $response = AIService::getProvider('text')->text([['role' => 'user', 'content' => $prompt]], ['temperature' => 0.8]);
            $content = trim(preg_replace('/```json|```/i', '', $response['content'] ?? ''));
            $aiData = json_decode($content, true);
            if ($aiData && !empty($aiData['situations']))
                $situations = $aiData['situations'];
        } catch (Exception $e) {
            // Fallback
        }
    }

    if (empty($situations)) {
        $validModes = ['joke', 'advice', 'acronym', 'caption', 'bluff'];
        if (in_array($mode, $validModes)) {
            $packPath = __DIR__ . "/packs/partybattle/{$mode}/{$theme}.json";
            if (!file_exists($packPath)) {
                $packPath = __DIR__ . "/packs/partybattle/{$mode}/base.json";
            }
            if (!file_exists($packPath) && $mode === 'caption') {
                // Fallback images for caption if no pack exists
                $situations = [
                    "https://media.giphy.com/media/l41lFw057lAJQMwg0/giphy.gif",
                    "https://media.giphy.com/media/JIX9t2j0ZTN9S/giphy.gif"
                ];
            } else if (file_exists($packPath)) {
                $pack = json_decode(file_get_contents($packPath), true);
                if ($mode === 'bluff') {
                    // Bluff mode has 'truths' and 'lies'
                    $situations = array_merge($pack['truths'] ?? [], $pack['lies'] ?? []);
                } else {
                    if (!empty($pack['situations'])) {
                        $situations = $pack['situations'];
                    }
                }
            }
            // Ultimate fallback
            if (empty($situations)) {
                $situations = ["Разработчик забыл добавить карточки для этого режима..."];
            }
        }
    }

    shuffle($situations);
    return array_slice($situations, 0, $rounds);

    // Meme mode logic
    $packPath = __DIR__ . "/packs/memebattle/{$theme}.json";
    if (!file_exists($packPath))
        $packPath = __DIR__ . '/packs/memebattle/base.json';
    if (file_exists($packPath)) {
        $pack = json_decode(file_get_contents($packPath), true);
        $situations = $pack['situations'] ?? [];
    }
    shuffle($situations);
    return $situations;
}
