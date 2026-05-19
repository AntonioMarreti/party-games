<?php
// server/games/bunker.php

if (!defined('BUNKER_PACK')) {
    define('BUNKER_PACK', __DIR__ . '/packs/bunker/base.json');
}

$ROUNDS_CONFIG = [
    0 => ['vote' => 'mandatory'],
    1 => ['vote' => 'optional'],
    2 => ['vote' => 'optional'],
    3 => ['vote' => 'optional'],
    4 => ['vote' => 'optional'],
    5 => ['vote' => 'mandatory']
];

$SPECIAL_CARDS = ['luggage', 'facts'];

function getInitialState()
{
    return [
        'phase' => 'briefing',
        'current_round' => 0,

        // Turn-Based Mechanics
        'active_player_index' => 0, // Index in aliveIds array
        'current_player_id' => null, // Explicit ID for easier frontend checks
        'turn_phase' => 'reveal', // 'reveal' -> 'discussion' -> 'next'
        'timer_start' => 0,
        'turn_queue' => [], // List of user IDs for the current round order

        'catastrophe' => [],
        'players_cards' => [],
        'bunker_places' => 0,
        'bunker_features' => [], // Hidden list of 5 features
        'revealed_features' => [], // Features revealed so far
        'threats' => [], // Hidden end-game threats
        'threat_results' => [], // Results of threats after game
        'kicked_players' => [],
        'votes' => [],
        'vote_results' => [],
        'vote_query_result' => [],
        'tie_candidates' => [],
        'tie_revealed_count' => 0,
        'tie_revealed_players' => [],
        'history' => []
    ];
}

function getAliveIds($pdo, $roomId, $kickedList)
{
    $stmt = $pdo->prepare("SELECT user_id FROM room_players WHERE room_id = ?");
    $stmt->execute([$roomId]);
    $allIdsRaw = $stmt->fetchAll(PDO::FETCH_COLUMN);
    $allIds = array_map('strval', $allIdsRaw);
    $kicked = array_map('strval', $kickedList ?? []);
    return array_values(array_diff($allIds, $kicked));
}

function bunkerNormalizeIds($ids)
{
    return array_values(array_map('strval', $ids ?? []));
}

function bunkerHiddenTieOptions($state, $userId)
{
    $cards = $state['players_cards'][(string) $userId] ?? [];
    $options = [];
    foreach (['facts', 'luggage'] as $cardType) {
        if (isset($cards[$cardType]) && empty($cards[$cardType]['revealed'])) {
            $options[] = $cardType;
        }
    }
    return $options;
}

function bunkerAdvanceTieRevealIfReady(&$state)
{
    $candidates = bunkerNormalizeIds($state['tie_candidates'] ?? []);
    $revealedPlayers = bunkerNormalizeIds($state['tie_revealed_players'] ?? []);

    foreach ($candidates as $candidateId) {
        if (!in_array($candidateId, $revealedPlayers, true) && empty(bunkerHiddenTieOptions($state, $candidateId))) {
            $revealedPlayers[] = $candidateId;
        }
    }

    $state['tie_revealed_players'] = array_values(array_unique($revealedPlayers));
    $state['tie_revealed_count'] = count($state['tie_revealed_players']);

    if ($state['tie_revealed_count'] >= count($candidates)) {
        $state['phase'] = 'tie_voting';
        $state['votes'] = [];
    }
}

function bunkerValidVoteTargets($state, $aliveIds, $voterId)
{
    $aliveIds = bunkerNormalizeIds($aliveIds);
    $voterId = (string) $voterId;
    $targets = ($state['phase'] ?? '') === 'tie_voting'
        ? bunkerNormalizeIds($state['tie_candidates'] ?? [])
        : $aliveIds;

    return array_values(array_diff(array_intersect($targets, $aliveIds), [$voterId]));
}

function bunkerLogUseCardAttempt($room, $actorUserId, $cardType, $targetId, $reason, $extra = [])
{
    if (!class_exists('TelegramLogger')) {
        return;
    }

    TelegramLogger::logEvent('game', 'Bunker invalid use_card attempt', array_merge([
        'action' => 'bunker_use_card_rejected',
        'room_id' => (int) ($room['id'] ?? 0),
        'room_code' => $room['room_code'] ?? null,
        'actor_user_id' => (string) $actorUserId,
        'card_type' => $cardType,
        'target_id' => $targetId !== null ? (string) $targetId : null,
        'reason' => $reason,
        'phase' => $extra['phase'] ?? null,
        'turn_phase' => $extra['turn_phase'] ?? null,
        'current_player_id' => $extra['current_player_id'] ?? null,
    ], $extra));
}

function bunkerLogEvent($message, $payload = [])
{
    if (!class_exists('TelegramLogger')) {
        return;
    }

    TelegramLogger::logEvent('game', $message, $payload);
}

function handleGameAction($pdo, $room, $user, $postData)
{
    global $ROUNDS_CONFIG, $SPECIAL_CARDS;
    $state = json_decode($room['game_state'] ?? '', true);
    if (!is_array($state)) {
        $type = $postData['type'] ?? '';
        $rawState = $room['game_state'] ?? '';
        $canBootstrapInitialState = $type === 'init_bunker' && ($rawState === null || $rawState === '');
        if ($canBootstrapInitialState) {
            $state = getInitialState();
        } else {
            bunkerLogEvent('Bunker invalid state', [
                'action' => 'bunker_invalid_state',
                'room_id' => (int) ($room['id'] ?? 0),
                'room_code' => $room['room_code'] ?? null,
                'actor_user_id' => (int) ($user['id'] ?? 0),
                'requested_action' => $type,
                'raw_state_preview' => is_string($rawState) ? mb_substr($rawState, 0, 300) : null,
            ]);
            return ['status' => 'error', 'message' => 'Состояние игры повреждено'];
        }
    }
    $type = $postData['type'] ?? '';
    $userId = (string) $user['id'];

    if (!empty($state['current_player_id']) && $userId !== strval($state['current_player_id']) && $room['is_host']) {
        $stmtB = $pdo->prepare("SELECT is_bot FROM room_players WHERE room_id = ? AND user_id = ?");
        $stmtB->execute([$room['id'], $state['current_player_id']]);
        $isBot = $stmtB->fetchColumn();
        if ($isBot) {
            $userId = strval($state['current_player_id']);
        }
    }

    $aliveIds = getAliveIds($pdo, $room['id'], $state['kicked_players'] ?? []);
    $aliveCount = count($aliveIds);

    // === 1. ИНИЦИАЛИЗАЦИЯ ===
    if ($type === 'init_bunker' && empty($state['players_cards'])) {
        if (!$room['is_host'])
            return;
        $json = file_get_contents(BUNKER_PACK);
        $data = json_decode($json, true);
        $stmt = $pdo->prepare("SELECT user_id FROM room_players WHERE room_id = ?");
        $stmt->execute([$room['id']]);
        $allIds = $stmt->fetchAll(PDO::FETCH_COLUMN);
        shuffle($allIds);
        $aliveIds = array_map('strval', $allIds);
        if (empty($aliveIds)) {
            return ['status' => 'error', 'message' => 'Нет игроков для старта'];
        }

        $scenario = $data['catastrophes'][array_rand($data['catastrophes'])];

        // === AI GENERATION ===
        if (!empty($postData['ai_mode'])) {
            require_once __DIR__ . '/../lib/GigaChat.php';
            try {
                $gc = GigaChat::getInstance();
                $prompt = "Придумай уникальную глобальную катастрофу для игры Бункер. 
                Формат JSON:
                {
                    \"title\": \"Название\",
                    \"intro_text\": \"Описание 2-3 предложения\",
                    \"duration\": \"длительность (напр. 5 лет)\",
                    \"survival_rate\": 0.5 (число от 0.1 до 0.9),
                    \"win_conditions\": [\"Цель 1\", \"Цель 2\"],
                    \"external_threats\": [\"Угроза 1\", \"Угроза 2\"]
                }
                Не используй Markdown. Только чистый JSON.";

                $response = $gc->chat([['role' => 'user', 'content' => $prompt]]);
                $content = $response['choices'][0]['message']['content'] ?? '';

                // Clean MD code blocks if present
                $content = str_replace(['```json', '```'], '', $content);

                $aiData = json_decode($content, true);
                if ($aiData && isset($aiData['title'])) {
                    $scenario = array_merge($scenario, $aiData);
                    $scenario['desc'] = $scenario['intro_text']; // Compatibility
                    $state['ai_generated'] = true;

                    // Convert AI textual threats to Game Objects
                    if (!empty($aiData['external_threats']) && is_array($aiData['external_threats'])) {
                        $generatedThreats = [];
                        foreach ($aiData['external_threats'] as $tTitle) {
                            $generatedThreats[] = [
                                'title' => $tTitle,
                                'desc' => 'Глобальная угроза, сгенерированная ИИ',
                                'requirements' => [] // No specific tags for now
                            ];
                            // Save Threat
                            saveGameContent($pdo, 'bunker', 'threat', $tTitle, ['ai_generated']);
                        }
                        // Override default random threats
                        if (!empty($generatedThreats)) {
                            $state['threats'] = array_slice($generatedThreats, 0, 3);
                        }
                    }

                    // Save Catastrophe
                    saveGameContent($pdo, 'bunker', 'catastrophe', $scenario, ['ai_generated']);
                }
            } catch (Exception $e) {
                TelegramLogger::logError('bunker_ai', ['error' => $e->getMessage()]);
            }
        }

        $state['catastrophe'] = $scenario;
        $allPlayersCount = count($allIds);
        $calcPlaces = ceil($allPlayersCount * ($scenario['survival_rate'] ?? 0.5));
        // Trust the catastrophe survival rate, but ensure at least 1 person survives
        $state['bunker_places'] = max(1, $calcPlaces);
        $state['game_mode'] = $postData['mode'] ?? 'normal';

        // 1. Prepare Bunker Features & Events (Study Phase)
        $potentialFeatures = $data['bunker_features'] ?? [];
        $potentialIncidents = $data['study_events'] ?? [];

        $mixedFeatures = [];
        shuffle($potentialFeatures);
        shuffle($potentialIncidents);

        // Select 5 items for the 5 rounds: 3 features + 2 incidents (weighted)
        for ($i = 0; $i < 5; $i++) {
            if ($i > 0 && rand(0, 100) < 40 && !empty($potentialIncidents)) {
                $item = array_shift($potentialIncidents);
            } else {
                $item = array_shift($potentialFeatures);
            }
            if ($item)
                $mixedFeatures[] = $item;
        }

        $state['bunker_features'] = $mixedFeatures;
        $state['revealed_features'] = [];
        if (!empty($state['bunker_features'])) {
            $state['revealed_features'][] = $state['bunker_features'][0];
        }

        // If prompts didn't override threats, load defaults
        if (empty($state['threats'])) {
            $threats = $data['threats'] ?? [];
            shuffle($threats);
            $state['threats'] = array_slice($threats, 0, 2);
        }
        $state['players_cards'] = [];
        $cats = array_keys($data['cards']);
        foreach ($aliveIds as $uid) {
            $uid = (string) $uid;
            $cards = [];
            foreach ($cats as $cat) {
                $cardObj = $data['cards'][$cat][array_rand($data['cards'][$cat])];
                if (is_string($cardObj)) {
                    $cards[$cat] = ['text' => $cardObj, 'revealed' => false, 'tags' => []];
                } else {
                    $cards[$cat] = $cardObj + ['revealed' => false];
                }
            }
            $cond = $data['conditions'][array_rand($data['conditions'])];
            $cards['condition'] = ['data' => $cond, 'revealed' => false];
            $state['players_cards'][$uid] = $cards;
        }

        // === AI BACKSTORIES ===
        if (!empty($state['ai_generated']) && isset($gc) && isset($aiData)) {
            try {
                // Collect basic info for all players to give context to AI
                $playersContext = [];
                foreach ($aliveIds as $uid) {
                    $c = $state['players_cards'][$uid];
                    $playersContext[] = [
                        'id' => $uid,
                        'prof' => $c['professions']['text'],
                        'health' => $c['health']['text'],
                        'hobby' => $c['hobby']['text']
                    ];
                }

                $prompt = "Катастрофа: " . $scenario['title'] . ". " . $scenario['intro_text'] . "\n\n";
                $prompt .= "Для каждого игрока придумай короткий (1 предложение) и смешной/ироничный факт (Судьбу), связывающий его профессию/хобби с этой катастрофой. Почему он оказался в бункере?
                Формат JSON:
                {
                    \"backstories\": {
                        \"USER_ID_1\": \"Текст судьбы...\",
                        \"USER_ID_2\": \"Текст судьбы...\"
                    }
                }
                Игроки:\n" . json_encode($playersContext, JSON_UNESCAPED_UNICODE);

                $response2 = $gc->chat([['role' => 'user', 'content' => $prompt]]);
                $content2 = $response2['choices'][0]['message']['content'] ?? '';
                $content2 = str_replace(['```json', '```'], '', $content2);
                $bsData = json_decode($content2, true);

                if ($bsData && isset($bsData['backstories'])) {
                    foreach ($bsData['backstories'] as $uid => $text) {
                        if (isset($state['players_cards'][$uid])) {
                            $state['players_cards'][$uid]['backstory'] = [
                                'text' => $text,
                                'revealed' => false,
                                'tags' => ['AI']
                            ];
                        }
                    }
                }
            } catch (Exception $e) {
                TelegramLogger::logError('bunker_ai_backstory', ['error' => $e->getMessage()]);
            }
        }

        $state['current_round'] = 0;
        $state['turn_queue'] = [];
        $state['active_player_index'] = -1;
        $state['current_player_id'] = null;
        $state['phase'] = 'intro';
        $state['turn_phase'] = 'intro';
        updateGameState($room['id'], $state);
        return ['status' => 'ok'];
    }

    if ($type === 'finish_intro') {
        if (!$room['is_host'])
            return;
        if ($state['phase'] !== 'intro')
            return;
        $aliveIds = getAliveIds($pdo, $room['id'], $state['kicked_players']);
        $state['current_round'] = 1;
        $state['turn_queue'] = $aliveIds;
        $state['active_player_index'] = 0;
        $state['current_player_id'] = $aliveIds[0];
        $state['phase'] = 'round';
        $state['turn_phase'] = 'reveal';
        $state['timer_start'] = time();
        $state['history'][] = ['type' => 'system', 'text' => 'Игра началась! Раунд 1.'];
        updateGameState($room['id'], $state);
        return ['status' => 'ok'];
    }

    // === SERVER TICK (Bot Logic) ===
    if ($type === 'tick') {
        if ($state['phase'] === 'round' && $state['turn_phase'] === 'reveal') {
            $currentPlayerId = $state['current_player_id'];
            $stmt = $pdo->prepare("SELECT is_bot FROM room_players WHERE room_id = ? AND user_id = ?");
            $stmt->execute([$room['id'], $currentPlayerId]);
            if ($stmt->fetchColumn()) {
                $elapsed = time() - (int) ($state['timer_start'] ?? 0);
                if ($elapsed >= 2) {
                    $cards = $state['players_cards'][$currentPlayerId] ?? [];
                    $candidates = [];
                    foreach ($cards as $key => $c) {
                        if (is_array($c) && isset($c['revealed']) && !$c['revealed'])
                            $candidates[] = $key;
                    }
                    if (!empty($candidates)) {
                        $toReveal = $candidates[array_rand($candidates)];
                        $state['players_cards'][$currentPlayerId][$toReveal]['revealed'] = true;
                        $state['history'][] = [
                            'type' => 'reveal',
                            'user_id' => $currentPlayerId,
                            'card_type' => $toReveal,
                            'text' => $state['players_cards'][$currentPlayerId][$toReveal]['text'] ?? '???'
                        ];
                    }
                    $state['turn_phase'] = 'discussion';
                    $state['timer_start'] = time();
                    updateGameState($room['id'], $state);
                    return ['status' => 'ok', 'action' => 'bot_reveal'];
                }
            }
        }

        if ($state['phase'] === 'round' && $state['turn_phase'] === 'discussion') {
            $currentPlayerId = $state['current_player_id'];
            $stmt = $pdo->prepare("SELECT is_bot FROM room_players WHERE room_id = ? AND user_id = ?");
            $stmt->execute([$room['id'], $currentPlayerId]);
            if ($stmt->fetchColumn()) {
                $elapsed = time() - (int) ($state['timer_start'] ?? 0);
                if ($elapsed >= 4) {
                    $aliveIds = getAliveIds($pdo, $room['id'], $state['kicked_players'] ?? []);
                    $aliveIdsInQueue = array_values(array_intersect($state['turn_queue'], $aliveIds));
                    $currentIndex = array_search($state['current_player_id'], $aliveIdsInQueue);
                    if ($currentIndex === false)
                        $currentIndex = -1;

                    if ($currentIndex >= count($aliveIdsInQueue) - 1) {
                        startPostRoundPhase($state);
                    } else {
                        $nextId = $aliveIdsInQueue[$currentIndex + 1];
                        $state['active_player_index'] = $currentIndex + 1;
                        $state['current_player_id'] = $nextId;
                        $state['turn_phase'] = 'reveal';
                        $state['timer_start'] = time();
                    }
                    updateGameState($room['id'], $state);
                    return ['status' => 'ok', 'action' => 'bot_end_turn'];
                }
            }
        }

        if ($state['phase'] === 'vote_query') {
            $aliveIds = getAliveIds($pdo, $room['id'], $state['kicked_players'] ?? []);
            $botsChanged = false;
            foreach ($aliveIds as $pid) {
                if (isset($state['vote_query_result'][$pid]))
                    continue;

                $stmt = $pdo->prepare("SELECT is_bot FROM room_players WHERE room_id = ? AND user_id = ?");
                $stmt->execute([$room['id'], $pid]);
                if ($stmt->fetchColumn()) {
                    $state['vote_query_result'][(string) $pid] = 'yes';
                    $botsChanged = true;
                }
            }

            if ($botsChanged) {
                finishVoteQueryIfReady($state, $aliveIds);
                updateGameState($room['id'], $state);
                return ['status' => 'ok', 'action' => 'bot_vote_query'];
            }
        }

        if ($state['phase'] === 'voting' || $state['phase'] === 'tie_voting') {
            $aliveIds = getAliveIds($pdo, $room['id'], $state['kicked_players'] ?? []);
            $candidates = ($state['phase'] === 'tie_voting')
                ? ($state['tie_candidates'] ?? [])
                : $aliveIds;

            // Cast candidates to strings for consistent comparison
            $candidatesStr = array_map('strval', $candidates);

            $botsChanged = false;
            foreach ($aliveIds as $pid) {
                if (isset($state['votes'][$pid]))
                    continue;

                $pidStr = (string) $pid;

                $stmt = $pdo->prepare("SELECT is_bot FROM room_players WHERE room_id = ? AND user_id = ?");
                $stmt->execute([$room['id'], $pidStr]);
                if ($stmt->fetchColumn()) {
                    // Filter out self from candidates
                    $targets = array_diff($candidatesStr, [$pidStr]);

                    if (!empty($targets)) {
                        $voteTarget = $targets[array_rand($targets)];
                        $state['votes'][$pid] = $voteTarget;
                        $botsChanged = true;
                        error_log("Bot Voted: Room {$room['id']}, Bot {$pidStr} -> Target {$voteTarget} (Phase: {$state['phase']})");
                    } else {
                        error_log("Bot No Targets: Room {$room['id']}, Bot {$pidStr} (Phase: {$state['phase']})");
                    }
                }
            }
            if ($botsChanged) {
                if (count($state['votes'] ?? []) >= count($aliveIds)) {
                    processVotingResults($state, $aliveIds);
                }
                updateGameState($room['id'], $state);
                return ['status' => 'ok', 'action' => 'bot_voted'];
            }
        }

        if ($state['phase'] === 'tie_reveal') {
            bunkerAdvanceTieRevealIfReady($state);
            if ($state['phase'] !== 'tie_reveal') {
                updateGameState($room['id'], $state);
                return ['status' => 'ok', 'action' => 'tie_reveal_complete'];
            }

            $botsRevealed = false;

            foreach ($state['tie_candidates'] as $cid) {
                $cidStr = (string) $cid;

                // Check if bot
                $stmt = $pdo->prepare("SELECT is_bot FROM room_players WHERE room_id = ? AND user_id = ?");
                $stmt->execute([$room['id'], $cidStr]);
                if (!$stmt->fetchColumn())
                    continue;

                // LOGGING
                error_log("Bot Check Tie Reveal: Room {$room['id']}, Bot {$cidStr}");

                if (in_array($cidStr, bunkerNormalizeIds($state['tie_revealed_players'] ?? []), true)) {
                    continue;
                }

                $cards = $state['players_cards'][$cidStr] ?? null;
                if (!$cards)
                    continue;

                $opts = bunkerHiddenTieOptions($state, $cidStr);
                if (!empty($opts)) {
                    $pick = $opts[array_rand($opts)];
                    $state['players_cards'][$cidStr][$pick]['revealed'] = true;
                    $state['tie_revealed_players'][] = $cidStr;
                    $botsRevealed = true;
                }
            }

            if ($botsRevealed) {
                bunkerAdvanceTieRevealIfReady($state);
                updateGameState($room['id'], $state);
                return ['status' => 'ok', 'action' => 'bot_tie_reveal'];
            }
        }

        return ['status' => 'ok'];
    }

    if ($type === 'reveal_card') {
        $cardType = $postData['card_type'] ?? '';
        if ($state['phase'] === 'tie_reveal') {
            if (!in_array($userId, bunkerNormalizeIds($state['tie_candidates'] ?? []), true))
                return ['status' => 'error', 'message' => 'Не вы кандидат'];
            if (in_array($userId, bunkerNormalizeIds($state['tie_revealed_players'] ?? []), true))
                return ['status' => 'error', 'message' => 'Вы уже раскрыли карту для дуэли'];
            if (!in_array($cardType, ['facts', 'luggage'], true))
                return ['status' => 'error', 'message' => 'Только Факт или Багаж'];
            if (!isset($state['players_cards'][$userId][$cardType]) || !empty($state['players_cards'][$userId][$cardType]['revealed']))
                return ['status' => 'error', 'message' => 'Эта карта уже раскрыта'];

            $state['players_cards'][$userId][$cardType]['revealed'] = true;
            $state['tie_revealed_players'][] = $userId;
            bunkerAdvanceTieRevealIfReady($state);
            updateGameState($room['id'], $state);
            return ['status' => 'ok'];
        }
        if ($state['phase'] !== 'round')
            return ['status' => 'error', 'message' => 'Не фаза раунда'];
        if (($state['turn_phase'] ?? '') !== 'reveal')
            return ['status' => 'error', 'message' => 'Сейчас не этап раскрытия'];
        if ($userId !== $state['current_player_id'])
            return ['status' => 'error', 'message' => 'Не ваш ход'];
        if (!in_array($userId, $aliveIds, true))
            return ['status' => 'error', 'message' => 'Вы уже не участвуете'];
        if (!isset($state['players_cards'][$userId][$cardType]))
            return ['status' => 'error', 'message' => 'Нет такой карты'];
        if (!empty($state['players_cards'][$userId][$cardType]['revealed']))
            return ['status' => 'error', 'message' => 'Карта уже раскрыта'];
        if (empty($state['players_cards'][$userId]['professions']['revealed']) && $cardType !== 'professions')
            return ['status' => 'error', 'message' => 'Сначала нужно раскрыть профессию'];

        $state['players_cards'][$userId][$cardType]['revealed'] = true;
        $state['turn_phase'] = 'discussion';
        $state['timer_start'] = time();

        // Fix for Condition cards which have data.title instead of text
        $cardData = $state['players_cards'][$userId][$cardType];
        $text = $cardData['text'] ?? ($cardData['data']['title'] ?? '...');

        $state['history'][] = ['type' => 'reveal', 'user_id' => $userId, 'card_type' => $cardType, 'text' => $text];
        updateGameState($room['id'], $state);
        return ['status' => 'ok'];
    }

    if ($type === 'skip_tie_reveal') {
        if (!$room['is_host'])
            return ['status' => 'error'];
        if ($state['phase'] !== 'tie_reveal')
            return ['status' => 'error'];

        $state['tie_revealed_players'] = bunkerNormalizeIds($state['tie_revealed_players'] ?? []);
        foreach (bunkerNormalizeIds($state['tie_candidates'] ?? []) as $cid) {
            if (!in_array($cid, $state['tie_revealed_players'], true)) {
                $opts = bunkerHiddenTieOptions($state, $cid);
                if (!empty($opts)) {
                    $pick = $opts[array_rand($opts)];
                    $state['players_cards'][$cid][$pick]['revealed'] = true;
                }
                $state['tie_revealed_players'][] = $cid;
            }
        }

        bunkerAdvanceTieRevealIfReady($state);
        updateGameState($room['id'], $state);
        return ['status' => 'ok'];
    }

    if ($type === 'end_turn') {
        if ($state['phase'] !== 'round')
            return ['status' => 'error'];
        if ($userId !== $state['current_player_id'] && !$room['is_host'])
            return ['status' => 'error'];
        $aliveIdsInQueue = array_values(array_intersect($state['turn_queue'], $aliveIds));
        $currentIndex = array_search($state['current_player_id'], $aliveIdsInQueue);
        if ($currentIndex === false)
            $currentIndex = -1;
        if ($currentIndex >= count($aliveIdsInQueue) - 1) {
            startPostRoundPhase($state);
        } else {
            $nextId = $aliveIdsInQueue[$currentIndex + 1];
            $state['active_player_index'] = $currentIndex + 1;
            $state['current_player_id'] = $nextId;
            $state['turn_phase'] = 'reveal';
            $state['timer_start'] = time();
        }
        updateGameState($room['id'], $state);
        return ['status' => 'ok'];
    }

    if ($type === 'force_skip_voting') {
        if (!$room['is_host'])
            return ['status' => 'error'];
        if (!in_array($state['phase'] ?? '', ['voting', 'tie_voting'], true))
            return ['status' => 'error', 'message' => 'Сейчас нет голосования'];
        $aliveIds = getAliveIds($pdo, $room['id'], $state['kicked_players'] ?? []);
        foreach ($aliveIds as $pid) {
            if (!isset($state['votes'][$pid])) {
                $targets = bunkerValidVoteTargets($state, $aliveIds, $pid);
                $state['votes'][$pid] = !empty($targets) ? $targets[array_rand($targets)] : $pid;
            }
        }
        processVotingResults($state, $aliveIds);
        updateGameState($room['id'], $state);
        return ['status' => 'ok'];
    }

    if ($type === 'next_phase') {
        if (!$room['is_host'])
            return ['status' => 'error'];

        $aliveIds = getAliveIds($pdo, $room['id'], $state['kicked_players'] ?? []);

        // Check if game over (win condition for survivors?)
        // Usually bunker lasts 5 rounds.
        // goToNextRound handles round increment and checks < 5.

        goToNextRound($state, $aliveIds);
        updateGameState($room['id'], $state);
        return ['status' => 'ok'];
    }

    if ($type === 'vote_kick') {
        if (!in_array($state['phase'] ?? '', ['voting', 'tie_voting'], true))
            return ['status' => 'error', 'message' => 'Сейчас нет голосования'];
        if (!in_array($userId, $aliveIds, true))
            return ['status' => 'error', 'message' => 'Вы уже не участвуете'];
        if (isset($state['votes'][$userId]))
            return ['status' => 'error', 'message' => 'Вы уже голосовали'];

        $targetId = (string) ($postData['target_id'] ?? '');
        $validTargets = bunkerValidVoteTargets($state, $aliveIds, $userId);
        if (!in_array($targetId, $validTargets, true))
            return ['status' => 'error', 'message' => 'Нельзя голосовать за эту цель'];

        $state['votes'][$userId] = $targetId;
        if (count($state['votes']) >= count($aliveIds))
            processVotingResults($state, $aliveIds);
        updateGameState($room['id'], $state);
        return ['status' => 'ok'];
    }

    if ($type === 'use_card') {
        $cardType = (string) ($postData['card_type'] ?? ''); // 'luggage', 'condition', etc.
        $targetId = $postData['target_id'] ?? null;
        $phase = (string) ($state['phase'] ?? '');
        $turnPhase = (string) ($state['turn_phase'] ?? '');
        $requiresTargetActions = ['heal', 'steal_luggage', 'swap_luggage', 'spy_card', 'force_reveal', 'copy_luggage'];

        if ($phase !== 'round' || $turnPhase !== 'discussion') {
            bunkerLogUseCardAttempt($room, $userId, $cardType, $targetId, 'invalid_phase', [
                'phase' => $phase,
                'turn_phase' => $turnPhase,
            ]);
            return ['status' => 'error', 'message' => 'Сейчас нельзя использовать способности'];
        }

        if (!in_array($userId, bunkerNormalizeIds($aliveIds), true)) {
            bunkerLogUseCardAttempt($room, $userId, $cardType, $targetId, 'actor_not_alive', [
                'phase' => $phase,
                'turn_phase' => $turnPhase,
            ]);
            return ['status' => 'error', 'message' => 'Вы уже не участвуете в игре'];
        }

        if ((string) ($state['current_player_id'] ?? '') !== $userId) {
            bunkerLogUseCardAttempt($room, $userId, $cardType, $targetId, 'not_current_player', [
                'phase' => $phase,
                'turn_phase' => $turnPhase,
                'current_player_id' => (string) ($state['current_player_id'] ?? ''),
            ]);
            return ['status' => 'error', 'message' => 'Сейчас не ваш ход'];
        }

        if ($cardType === '' || !isset($state['players_cards'][$userId]) || !is_array($state['players_cards'][$userId])) {
            bunkerLogUseCardAttempt($room, $userId, $cardType, $targetId, 'actor_cards_missing', [
                'phase' => $phase,
                'turn_phase' => $turnPhase,
            ]);
            return ['status' => 'error', 'message' => 'Не удалось найти ваши карты'];
        }

        // 1. Validate
        if (!isset($state['players_cards'][$userId][$cardType])) {
            bunkerLogUseCardAttempt($room, $userId, $cardType, $targetId, 'card_not_owned', [
                'phase' => $phase,
                'turn_phase' => $turnPhase,
            ]);
            return ['status' => 'error', 'message' => 'Нет такой карты'];
        }
        $card = &$state['players_cards'][$userId][$cardType];

        if (!$card['revealed'] && $cardType !== 'condition')
            return ['status' => 'error', 'message' => 'Карта должна быть раскрыта'];
        if (empty($card['action']) && empty($card['data']['action']))
            return ['status' => 'error', 'message' => 'Это не активная карта'];
        if (!empty($card['used'])) {
            bunkerLogUseCardAttempt($room, $userId, $cardType, $targetId, 'card_already_used', [
                'phase' => $phase,
                'turn_phase' => $turnPhase,
            ]);
            return ['status' => 'error', 'message' => 'Карта уже использована'];
        }

        $action = $card['action'] ?? $card['data']['action'];
        $targetName = '???';

        if (in_array($action, $requiresTargetActions, true)) {
            $targetId = $targetId !== null ? (string) $targetId : null;
            if ($targetId === null || $targetId === '') {
                bunkerLogUseCardAttempt($room, $userId, $cardType, $targetId, 'missing_target', [
                    'phase' => $phase,
                    'turn_phase' => $turnPhase,
                    'card_action' => $action,
                ]);
                return ['status' => 'error', 'message' => 'Нужна цель'];
            }

            if (!in_array($targetId, bunkerNormalizeIds($aliveIds), true)) {
                bunkerLogUseCardAttempt($room, $userId, $cardType, $targetId, 'target_not_alive', [
                    'phase' => $phase,
                    'turn_phase' => $turnPhase,
                    'card_action' => $action,
                ]);
                return ['status' => 'error', 'message' => 'Эта цель уже недоступна'];
            }

            if (!isset($state['players_cards'][$targetId]) || !is_array($state['players_cards'][$targetId])) {
                bunkerLogUseCardAttempt($room, $userId, $cardType, $targetId, 'target_missing_cards', [
                    'phase' => $phase,
                    'turn_phase' => $turnPhase,
                    'card_action' => $action,
                ]);
                return ['status' => 'error', 'message' => 'Цель недоступна'];
            }
        }

        // 2. Execute
        if ($action === 'heal' || $action === 'heal_self') {
            $tid = ($action === 'heal_self') ? $userId : $targetId;
            if (!$tid)
                return ['status' => 'error', 'message' => 'Нужна цель'];

            // Logic: Remove 'health' tags that are bad
            $targetCards = &$state['players_cards'][$tid];
            $healed = false;

            if (isset($targetCards['health'])) {
                $badTags = ['sick', 'virus', 'infection', 'asthma', 'cancer', 'hiv', 'diabetes'];
                $newTags = array_diff($targetCards['health']['tags'], $badTags);
                if (count($newTags) !== count($targetCards['health']['tags'])) {
                    $targetCards['health']['tags'] = array_values($newTags);
                    $targetCards['health']['text'] .= ' (Вылечен)';
                    $healed = true;
                }
            }
            // Also check condition
            if (!$healed && isset($targetCards['condition'])) {
                // Maybe cure condition? Complex. Let's stick to health card for now.
            }

            $stmt = $pdo->prepare("SELECT first_name FROM users WHERE id = ?");
            $stmt->execute([$tid]);
            $targetName = $stmt->fetchColumn();

            $msg = $healed ? "вылечил игрока {$targetName}!" : "попытался вылечить {$targetName}, но он был здоров.";
        } else if ($action === 'threaten') {
            $msg = "наставил оружие на всех! 'Никто не двигается!'";
        } else if ($action === 'reveal_feature') {
            if (count($state['revealed_features']) < count($state['bunker_features'])) {
                $nextFeat = $state['bunker_features'][count($state['revealed_features'])];
                $state['revealed_features'][] = $nextFeat;
                $msg = "взломал терминал и узнал факт о бункере: " . $nextFeat['text'];
            } else {
                return ['status' => 'error', 'message' => 'Всё уже раскрыто'];
            }
        } else if ($action === 'steal_luggage' || $action === 'swap_luggage') {
            if (!$targetId || $targetId === $userId)
                return ['status' => 'error', 'message' => 'Нужна цель'];

            $myLuggage = $state['players_cards'][$userId]['luggage'];
            $targetLuggage = $state['players_cards'][$targetId]['luggage'];

            $state['players_cards'][$userId]['luggage'] = $targetLuggage;
            $state['players_cards'][$targetId]['luggage'] = $myLuggage;

            $stmt = $pdo->prepare("SELECT first_name FROM users WHERE id = ?");
            $stmt->execute([$targetId]);
            $targetName = $stmt->fetchColumn();

            $msg = "незаметно обменялся багажом с {$targetName}!";
        } else if ($action === 'fix_system') {
            // Fix most recent incident
            $fixed = false;
            foreach (array_reverse($state['revealed_features'], true) as $idx => $feat) {
                if (isset($feat['type']) && $feat['type'] === 'incident' && empty($feat['fixed'])) {
                    $state['revealed_features'][$idx]['fixed'] = true;
                    $state['revealed_features'][$idx]['text'] .= ' (ИСПРАВЛЕНО)';
                    $msg = "починил неисправность: " . $feat['text'];
                    $fixed = true;
                    break;
                }
            }
            if (!$fixed)
                return ['status' => 'error', 'message' => 'Нечего чинить'];
        } else if ($action === 'spy_card') {
            if (!$targetId || $targetId === $userId)
                return ['status' => 'error', 'message' => 'Нужна цель'];
            $targetCards = &$state['players_cards'][$targetId];
            $candidates = [];
            foreach ($targetCards as $k => $c) {
                if (is_array($c) && empty($c['revealed']))
                    $candidates[] = $k;
            }
            if (empty($candidates))
                return ['status' => 'error', 'message' => 'Игроку нечего скрывать'];

            $toSpy = $candidates[array_rand($candidates)];
            $text = $targetCards[$toSpy]['text'] ?? ($targetCards[$toSpy]['data']['title'] ?? '...');
            $msg = "подсмотрел тайную карту игрока!"; // Message for others
            // Private message/info would be better, but for now we log it for the user
            $state['history'][] = ['type' => 'private', 'user_id' => $userId, 'text' => "Вы узнали секрет ({$toSpy}): {$text}"];
        } else if ($action === 'override_event') {
            // Replace next incident in bunker_features with a fresh feature
            $replaced = false;
            $json = file_get_contents(BUNKER_PACK);
            $data = json_decode($json, true);
            $potentialFeatures = $data['bunker_features'] ?? [];

            for ($i = count($state['revealed_features']); $i < count($state['bunker_features']); $i++) {
                if (isset($state['bunker_features'][$i]['type']) && $state['bunker_features'][$i]['type'] === 'incident') {
                    $state['bunker_features'][$i] = $potentialFeatures[array_rand($potentialFeatures)];
                    $msg = "перехватил управление бункером и предотвратил будущую поломку!";
                    $replaced = true;
                    break;
                }
            }
            if (!$replaced)
                return ['status' => 'error', 'message' => 'В будущем не предвидится поломок'];
        } else if ($action === 'force_reveal') {
            if (!$targetId || $targetId === $userId)
                return ['status' => 'error', 'message' => 'Нужна цель'];
            $targetCards = &$state['players_cards'][$targetId];
            $candidates = [];
            foreach ($targetCards as $k => $c) {
                if (is_array($c) && empty($c['revealed']))
                    $candidates[] = $k;
            }
            if (empty($candidates))
                return ['status' => 'error', 'message' => 'Игроку нечего скрывать'];

            $toReveal = $candidates[array_rand($candidates)];
            $targetCards[$toReveal]['revealed'] = true;

            $stmt = $pdo->prepare("SELECT first_name FROM users WHERE id = ?");
            $stmt->execute([$targetId]);
            $targetName = $stmt->fetchColumn();

            $val = $targetCards[$toReveal]['text'] ?? ($targetCards[$toReveal]['data']['title'] ?? '...');
            $msg = "разоблачил игрока {$targetName}! Раскрыта карта: {$val}";
        } else if ($action === 'copy_luggage') {
            if (!$targetId || $targetId === $userId)
                return ['status' => 'error', 'message' => 'Нужна цель'];
            $myLuggage = $state['players_cards'][$userId]['luggage'];
            $state['players_cards'][$targetId]['luggage'] = $myLuggage;

            $stmt = $pdo->prepare("SELECT first_name FROM users WHERE id = ?");
            $stmt->execute([$targetId]);
            $targetName = $stmt->fetchColumn();
            $msg = "поделился своим багажом с игроком {$targetName}!";
        } else {
            return ['status' => 'error', 'message' => 'Неизвестное действие'];
        }

        // 3. Update State
        $card['used'] = true; // Mark as used
        $state['history'][] = [
            'type' => 'action',
            'user_id' => $userId,
            'action' => $action,
            'text' => $msg
        ];

        updateGameState($room['id'], $state);
        return ['status' => 'ok'];
    }

    if ($type === 'vote_query_answer') {
        $answer = $postData['answer']; // 'yes' or 'no'
        if ($state['phase'] !== 'vote_query')
            return ['status' => 'error'];
        if (!in_array($userId, $aliveIds, true))
            return ['status' => 'error', 'message' => 'Вы уже не участвуете'];
        if (isset($state['vote_query_result'][$userId]))
            return ['status' => 'error', 'message' => 'Уже голосовали'];

        $state['vote_query_result'][$userId] = $answer === 'yes' ? 'yes' : 'no';

        $aliveIds = getAliveIds($pdo, $room['id'], $state['kicked_players'] ?? []);
        finishVoteQueryIfReady($state, $aliveIds);
        updateGameState($room['id'], $state);
        return ['status' => 'ok'];
    }

    bunkerLogEvent('Bunker unknown action', [
        'action' => 'bunker_unknown_action',
        'room_id' => (int) ($room['id'] ?? 0),
        'room_code' => $room['room_code'] ?? null,
        'actor_user_id' => (int) ($user['id'] ?? 0),
        'requested_action' => $type,
        'phase' => $state['phase'] ?? null,
        'turn_phase' => $state['turn_phase'] ?? null,
    ]);
    return ['status' => 'error', 'message' => 'Неизвестное действие'];
}

function startVotingPhase(&$state)
{
    $state['phase'] = 'voting';
    $state['votes'] = [];
    $state['vote_query_result'] = [];
    $state['tie_candidates'] = [];
    $state['tie_revealed_players'] = [];
    $state['tie_revealed_count'] = 0;
    $state['current_player_id'] = null;
    $state['timer_start'] = time();
}

function startPostRoundPhase(&$state)
{
    global $ROUNDS_CONFIG;

    $round = (int) ($state['current_round'] ?? 0);
    $voteMode = $ROUNDS_CONFIG[$round]['vote'] ?? 'mandatory';
    $state['current_player_id'] = null;
    $state['timer_start'] = time();

    if ($voteMode === 'optional') {
        $state['phase'] = 'vote_query';
        $state['vote_query_result'] = [];
        $state['votes'] = [];
        return;
    }

    startVotingPhase($state);
}

function finishVoteQueryIfReady(&$state, $aliveIds)
{
    $aliveIds = bunkerNormalizeIds($aliveIds);
    $answers = array_intersect_key($state['vote_query_result'] ?? [], array_flip($aliveIds));
    $state['vote_query_result'] = $answers;

    if (count($answers) < count($aliveIds)) {
        return;
    }

    $yes = 0;
    $no = 0;
    foreach ($answers as $answer) {
        if ($answer === 'yes')
            $yes++;
        else
            $no++;
    }

    if ($yes > $no) {
        startVotingPhase($state);
    } else {
        goToNextRound($state, $aliveIds);
    }
}

function processVotingResults(&$state, $aliveIds)
{
    $aliveIds = bunkerNormalizeIds($aliveIds);
    $cleanVotes = [];
    foreach (($state['votes'] ?? []) as $voterId => $targetId) {
        $voterId = (string) $voterId;
        $targetId = (string) $targetId;
        if (!in_array($voterId, $aliveIds, true)) {
            continue;
        }
        if (!in_array($targetId, bunkerValidVoteTargets($state, $aliveIds, $voterId), true)) {
            continue;
        }
        $cleanVotes[$voterId] = $targetId;
    }
    $state['votes'] = $cleanVotes;

    if (empty($state['votes'])) {
        goToNextRound($state, $aliveIds);
        return;
    }
    $counts = array_count_values($state['votes']);
    arsort($counts);
    $leaderId = array_key_first($counts);
    $maxVotes = current($counts);
    $candidates = array_keys($counts, $maxVotes);
    if (count($candidates) > 1) {
        if ($state['phase'] === 'tie_voting') {
            finishKick($state, $candidates[array_rand($candidates)], $counts, true, true);
        } else {
            $state['phase'] = 'tie_reveal';
            $state['tie_candidates'] = bunkerNormalizeIds($candidates);
            $state['tie_revealed_players'] = [];
            $state['votes'] = [];
            bunkerAdvanceTieRevealIfReady($state);
        }
    } else {
        finishKick($state, $leaderId, $counts, false);
    }
}

function finishKick(&$state, $leaderId, $counts, $wasTie, $isRandom = false)
{
    $state['kicked_players'][] = (string) $leaderId;
    $state['vote_results'] = ['kicked_id' => $leaderId, 'counts' => $counts, 'is_tie' => $wasTie, 'is_random' => $isRandom];

    // Check if game should end immediately after kick
    // If we have enough places for everyone left, or no one left
    $aliveIds = array_diff(array_keys($state['players_cards'] ?? []), bunkerNormalizeIds($state['kicked_players'] ?? []));
    if (count($aliveIds) <= ($state['bunker_places'] ?? 1)) {
        $state['phase'] = 'outro';
        resolveThreats($state);
    } else {
        $state['phase'] = 'vote_results';
    }
}

function resolveThreats(&$state)
{
    $results = [];
    $survivorsIds = array_keys(array_filter($state['players_cards'], function ($k) use ($state) {
        return !in_array($k, $state['kicked_players']);
    }, ARRAY_FILTER_USE_KEY));

    $groupTags = [];
    foreach ($survivorsIds as $uid) {
        foreach ($state['players_cards'][$uid] as $v) {
            if (isset($v['tags']) && is_array($v['tags'])) {
                foreach ($v['tags'] as $t)
                    $groupTags[mb_strtolower($t)] = true;
            }
        }
    }
    // 3. Survival modifiers from features and incidents
    $featureBonus = 0;
    foreach (($state['revealed_features'] ?? []) as $f) {
        if (isset($f['bonus'])) {
            // Negative bonus for incidents unless fixed
            if (isset($f['type']) && $f['type'] === 'incident' && !empty($f['fixed'])) {
                continue; // Skip fixed incidents
            }
            $featureBonus += $f['bonus'];
        }

        if (isset($f['tags']) && is_array($f['tags'])) {
            foreach ($f['tags'] as $t)
                $groupTags[mb_strtolower($t)] = true;
        }
    }

    foreach (($state['threats'] ?? []) as $threat) {
        $reqs = $threat['requirements'] ?? [];
        $matches = 0;
        $matchedTags = [];
        foreach ($reqs as $req) {
            $parts = explode('.', $req);
            $cleanReq = mb_strtolower(end($parts));
            if (isset($groupTags[$cleanReq])) {
                $matches++;
                $matchedTags[] = $cleanReq;
            }
        }

        // Base chance + survivors + feature bonuses + match bonuses
        $chance = 20 + $featureBonus + (count($survivorsIds) * 5) + ($matches * 20);
        $chance = max(5, min(95, $chance));
        $success = rand(0, 100) < $chance;

        $results[] = [
            'title' => $threat['text'] ?? ($threat['title'] ?? 'Неизвестная угроза'),
            'desc' => $threat['desc'] ?? '',
            'success' => $success,
            'result_text' => ($success ? "Группа справилась." : "Не хватило ресурсов.") . ($matches > 0 ? " (Использовано: " . implode(', ', $matchedTags) . ")" : ""),
            'chance' => $chance
        ];
    }
    $state['threat_results'] = $results;
}

function goToNextRound(&$state, $aliveIds)
{
    $survivorsCount = count($aliveIds);
    $capacity = $state['bunker_places'];

    if ($state['current_round'] < 5) {
        $state['current_round']++;
        $state['phase'] = 'round';
        $state['votes'] = [];
        $state['vote_results'] = [];
        $state['vote_query_result'] = [];
        $state['tie_candidates'] = [];
        $state['tie_revealed_players'] = [];
        $state['tie_revealed_count'] = 0;
        $queue = array_values($aliveIds);
        shuffle($queue);
        $state['turn_queue'] = $queue;
        $state['active_player_index'] = 0;
        $state['current_player_id'] = !empty($queue) ? $queue[0] : null;
        $state['turn_phase'] = 'reveal';

        if (!$state['current_player_id']) {
            // Safety: if no one left to take turns, go to voting/outro
            $state['phase'] = (count($aliveIds) > $capacity) ? 'voting' : 'outro';
            if ($state['phase'] === 'outro')
                resolveThreats($state);
            return;
        }

        $revealedCount = count($state['revealed_features'] ?? []);
        if ($revealedCount < $state['current_round'] && isset($state['bunker_features'][$revealedCount])) {
            $state['revealed_features'][] = $state['bunker_features'][$revealedCount];
        }
    } else {
        // Round 5 reached. Check capacity.
        if ($survivorsCount > $capacity) {
            // Need to kick more people!
            $state['phase'] = 'voting';
            $state['phase_title'] = "Финальный отбор";
            $state['votes'] = [];
            $state['vote_results'] = [];
            $state['current_player_id'] = null;
            $state['timer_start'] = time();
        } else {
            $state['phase'] = 'outro';
            resolveThreats($state);
        }
    }
}
?>
