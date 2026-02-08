<?php
// server/games/bunker.php

define('BUNKER_PACK', __DIR__ . '/packs/bunker/base.json');

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

function handleGameAction($pdo, $room, $user, $postData)
{
    global $ROUNDS_CONFIG, $SPECIAL_CARDS;
    $state = json_decode($room['game_state'], true);
    $type = $postData['type'];
    $userId = (string) $user['id'];

    if ($state['current_player_id'] && $userId !== strval($state['current_player_id']) && $room['is_host']) {
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
        $scenario = $data['catastrophes'][array_rand($data['catastrophes'])];
        $state['catastrophe'] = $scenario;
        $state['bunker_places'] = ceil(count($allIds) * $scenario['survival_rate']);
        $state['game_mode'] = $postData['mode'] ?? 'normal';
        $feats = $data['bunker_features'] ?? [];
        shuffle($feats);
        $state['bunker_features'] = array_slice($feats, 0, 5);
        $state['revealed_features'] = [];
        if (!empty($state['bunker_features'])) {
            $state['revealed_features'][] = $state['bunker_features'][0];
        }
        $threats = $data['threats'] ?? [];
        shuffle($threats);
        $state['threats'] = array_slice($threats, 0, 2);
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
                        startVotingPhase($state);
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

        if ($state['phase'] === 'voting' || $state['phase'] === 'tie_voting') {
            $aliveIds = getAliveIds($pdo, $room['id'], $state['kicked_players'] ?? []);
            $candidates = ($state['phase'] === 'tie_voting') ? ($state['tie_candidates'] ?? []) : $aliveIds;
            $botsChanged = false;
            foreach ($aliveIds as $pid) {
                if (isset($state['votes'][$pid]))
                    continue;
                $stmt = $pdo->prepare("SELECT is_bot FROM room_players WHERE room_id = ? AND user_id = ?");
                $stmt->execute([$room['id'], $pid]);
                if ($stmt->fetchColumn()) {
                    $targets = array_diff($candidates, [$pid]);
                    if (!empty($targets)) {
                        $state['votes'][$pid] = $targets[array_rand($targets)];
                        $botsChanged = true;
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
        return ['status' => 'ok'];
    }

    if ($type === 'reveal_card') {
        $cardType = $postData['card_type'];
        if ($state['phase'] === 'tie_reveal') {
            if (!in_array($userId, $state['tie_candidates']))
                return ['status' => 'error', 'message' => 'Не вы кандидат'];
            if (!in_array($cardType, ['facts', 'luggage']))
                return ['status' => 'error', 'message' => 'Только Факт или Багаж'];
            $state['players_cards'][$userId][$cardType]['revealed'] = true;
            $state['tie_revealed_count']++;
            if ($state['tie_revealed_count'] >= count($state['tie_candidates'])) {
                $state['phase'] = 'tie_voting';
                $state['votes'] = [];
            }
            updateGameState($room['id'], $state);
            return ['status' => 'ok'];
        }
        if ($state['phase'] !== 'round')
            return ['status' => 'error', 'message' => 'Не фаза раунда'];
        if ($userId !== $state['current_player_id'])
            return ['status' => 'error', 'message' => 'Не ваш ход'];
        if (isset($state['players_cards'][$userId][$cardType])) {
            $state['players_cards'][$userId][$cardType]['revealed'] = true;
            $state['turn_phase'] = 'discussion';
            $state['timer_start'] = time();
            $state['history'][] = ['type' => 'reveal', 'user_id' => $userId, 'card_type' => $cardType, 'text' => $state['players_cards'][$userId][$cardType]['text'] ?? '...'];
            updateGameState($room['id'], $state);
            return ['status' => 'ok'];
        }
    }

    if ($type === 'end_turn') {
        if ($state['phase'] !== 'round')
            return ['status' => 'error'];
        if ($userId !== $state['current_player_id'] && !$room['is_host'])
            return ['status' => 'error'];
        $aliveIdsInQueue = array_values(array_intersect($state['turn_queue'], $aliveIds));
        $currentIndex = array_search($state['current_player_id'], $aliveIdsInQueue);
        if ($currentIndex >= count($aliveIdsInQueue) - 1) {
            startVotingPhase($state);
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
        $aliveIds = getAliveIds($pdo, $room['id'], $state['kicked_players'] ?? []);
        $candidates = ($state['phase'] === 'tie_voting') ? ($state['tie_candidates'] ?? []) : $aliveIds;
        foreach ($aliveIds as $pid) {
            if (!isset($state['votes'][$pid])) {
                $targets = array_diff($candidates, [$pid]);
                $state['votes'][$pid] = !empty($targets) ? $targets[array_rand($targets)] : $pid;
            }
        }
        processVotingResults($state, $aliveIds);
        updateGameState($room['id'], $state);
        return ['status' => 'ok'];
    }

    if ($type === 'vote_kick') {
        $targetId = (string) $postData['target_id'];
        if ($state['phase'] === 'tie_voting' && !in_array($targetId, $state['tie_candidates'] ?? []))
            return ['status' => 'error'];
        $state['votes'][$userId] = $targetId;
        if (count($state['votes']) >= count($aliveIds))
            processVotingResults($state, $aliveIds);
        updateGameState($room['id'], $state);
        return ['status' => 'ok'];
    }

    if ($type === 'use_card') {
        $cardType = $postData['card_type']; // 'luggage', 'condition', etc.
        $targetId = $postData['target_id'] ?? null;

        // 1. Validate
        if (!isset($state['players_cards'][$userId][$cardType]))
            return ['status' => 'error', 'message' => 'Нет такой карты'];
        $card = &$state['players_cards'][$userId][$cardType];

        if (!$card['revealed'] && $cardType !== 'condition')
            return ['status' => 'error', 'message' => 'Карта должна быть раскрыта'];
        if (empty($card['action']) && empty($card['data']['action']))
            return ['status' => 'error', 'message' => 'Это не активная карта'];
        if (!empty($card['used']))
            return ['status' => 'error', 'message' => 'Карта уже использована'];

        $action = $card['action'] ?? $card['data']['action'];
        $targetName = '???';

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
        } else if ($action === 'steal_luggage') {
            if (!$targetId || $targetId === $userId)
                return ['status' => 'error', 'message' => 'Нужна цель'];

            $myLuggage = $state['players_cards'][$userId]['luggage'];
            $targetLuggage = $state['players_cards'][$targetId]['luggage'];

            // Swap
            $state['players_cards'][$userId]['luggage'] = $targetLuggage; // Takes their luggage
            $state['players_cards'][$targetId]['luggage'] = $myLuggage; // Gives mine

            // Mark both as revealed? Or keep state? 
            // Better keep state. If I stole hidden luggage, it's hidden for me? 
            // Let's say we swap Objects, but 'revealed' status stays with the CARD or the SLOT?
            // Usually in Bunker you swap the physical card. unique item.
            // So we swap the entire object including revealed status.

            $stmt = $pdo->prepare("SELECT first_name FROM users WHERE id = ?");
            $stmt->execute([$targetId]);
            $targetName = $stmt->fetchColumn();

            $msg = "незаметно обменялся багажом с {$targetName}!";
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

    return ['status' => 'ok'];
}

function startVotingPhase(&$state)
{
    $state['phase'] = 'voting';
    $state['votes'] = [];
    $state['current_player_id'] = null;
    $state['timer_start'] = time();
}

function processVotingResults(&$state, $aliveIds)
{
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
            $state['tie_candidates'] = $candidates;
            $state['tie_revealed_count'] = 0;
            $state['votes'] = [];
        }
    } else {
        finishKick($state, $leaderId, $counts, false);
    }
}

function finishKick(&$state, $leaderId, $counts, $wasTie, $isRandom = false)
{
    $state['kicked_players'][] = (string) $leaderId;
    $state['vote_results'] = ['kicked_id' => $leaderId, 'counts' => $counts, 'is_tie' => $wasTie, 'is_random' => $isRandom];
    $state['phase'] = 'vote_results';
}

function goToNextRound(&$state, $aliveIds)
{
    if ($state['current_round'] < 5) {
        $state['current_round']++;
        $state['phase'] = 'round';
        $state['votes'] = [];
        $state['vote_results'] = [];
        $queue = array_values($aliveIds);
        shuffle($queue);
        $state['turn_queue'] = $queue;
        $state['active_player_index'] = 0;
        $state['current_player_id'] = $queue[0];
        $state['turn_phase'] = 'reveal';
        if (isset($state['bunker_features'][$state['current_round']])) {
            $state['revealed_features'][] = $state['bunker_features'][$state['current_round']];
        }
    } else {
        $state['phase'] = 'outro';
        resolveThreats($state);
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
    foreach (($state['revealed_features'] ?? []) as $f) {
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
        $chance = 40 + (count($survivorsIds) * 5) + ($matches * 20);
        $chance = max(5, min(95, $chance));
        $success = rand(0, 100) < $chance;
        $results[] = [
            'title' => $threat['title'],
            'desc' => $threat['desc'],
            'success' => $success,
            'result_text' => ($success ? "Группа справилась." : "Не хватило ресурсов.") . ($matches > 0 ? " (Использовано: " . implode(', ', $matchedTags) . ")" : ""),
            'chance' => $chance
        ];
    }
    $state['threat_results'] = $results;
}
?>