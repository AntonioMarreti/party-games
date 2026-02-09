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
            $candidates = $state['tie_candidates'] ?? [];
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

                // Check if already revealed
                $cards = $state['players_cards'][$cidStr] ?? null;
                if (!$cards)
                    continue;

                $revealedSomething = false;
                if (($cards['facts']['revealed'] ?? false) || ($cards['luggage']['revealed'] ?? false)) {
                    $revealedSomething = true;
                }


                if (!$revealedSomething) {
                    // Reveal Random
                    $opts = [];
                    if (!($cards['facts']['revealed'] ?? false))
                        $opts[] = 'facts';
                    if (!($cards['luggage']['revealed'] ?? false))
                        $opts[] = 'luggage';

                    if (!empty($opts)) {
                        $pick = $opts[array_rand($opts)];
                        $state['players_cards'][$cid][$pick]['revealed'] = true;
                        $state['tie_revealed_count']++;
                        $botsRevealed = true;
                    }
                }
            }

            if ($botsRevealed) {
                if ($state['tie_revealed_count'] >= count($state['tie_candidates'])) {
                    $state['phase'] = 'tie_voting';
                    $state['votes'] = [];
                }
                updateGameState($room['id'], $state);
                return ['status' => 'ok', 'action' => 'bot_tie_reveal'];
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

            // Recalculate how many candidates have revealed at least one card
            $revealedCount = 0;
            foreach ($state['tie_candidates'] as $cid) {
                $cid = (string) $cid;
                $pCards = $state['players_cards'][$cid] ?? null;
                // Check if EITHER fact OR luggage is revealed
                if ($pCards && (($pCards['facts']['revealed'] ?? false) || ($pCards['luggage']['revealed'] ?? false))) {
                    $revealedCount++;
                }
            }
            $state['tie_revealed_count'] = $revealedCount;

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

            // Fix for Condition cards which have data.title instead of text
            $cardData = $state['players_cards'][$userId][$cardType];
            $text = $cardData['text'] ?? ($cardData['data']['title'] ?? '...');

            $state['history'][] = ['type' => 'reveal', 'user_id' => $userId, 'card_type' => $cardType, 'text' => $text];
            updateGameState($room['id'], $state);
            return ['status' => 'ok'];
        }
    }

    if ($type === 'skip_tie_reveal') {
        if (!$room['is_host'])
            return ['status' => 'error'];
        if ($state['phase'] !== 'tie_reveal')
            return ['status' => 'error'];

        foreach ($state['tie_candidates'] as $cid) {
            $cards = $state['players_cards'][$cid];
            // Check if already revealed pertinent card?
            // Logic: we need to find if they revealed fact or luggage.
            // Simplified: just check if they have unrevealed options and reveal one.
            // Or better: ensure everyone has 1 revealed from set.

            $revealedSomething = false;
            if (($cards['facts']['revealed'] ?? false) || ($cards['luggage']['revealed'] ?? false)) {
                $revealedSomething = true;
            }

            if (!$revealedSomething) {
                // Force reveal
                $opts = [];
                if (!($cards['facts']['revealed'] ?? false))
                    $opts[] = 'facts';
                if (!($cards['luggage']['revealed'] ?? false))
                    $opts[] = 'luggage';

                if (!empty($opts)) {
                    $pick = $opts[array_rand($opts)];
                    $state['players_cards'][$cid][$pick]['revealed'] = true;
                }
            }
        }

        $state['phase'] = 'tie_voting';
        $state['votes'] = [];
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

    if ($type === 'vote_query_answer') {
        $answer = $postData['answer']; // 'yes' or 'no'
        if ($state['phase'] !== 'vote_query')
            return ['status' => 'error'];
        if (isset($state['vote_query_result'][$userId]))
            return ['status' => 'error', 'message' => 'Уже голосовали'];

        $state['vote_query_result'][$userId] = $answer;

        // Check if all alive players voted
        $aliveIds = getAliveIds($pdo, $room['id'], $state['kicked_players'] ?? []);
        if (count($state['vote_query_result']) >= count($aliveIds)) {
            // Tally results
            $yes = 0;
            $no = 0;
            foreach ($state['vote_query_result'] as $ans) {
                if ($ans === 'yes')
                    $yes++;
                else
                    $no++;
            }

            if ($yes > $no) {
                // Proceed to Kick Voting
                startVotingPhase($state);
            } else {
                // Skip Voting -> Next Round
                goToNextRound($state, $aliveIds);
            }
        }
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
        $queue = array_values($aliveIds);
        shuffle($queue);
        $state['turn_queue'] = $queue;
        $state['active_player_index'] = 0;
        $state['current_player_id'] = $queue[0];
        $state['turn_phase'] = 'reveal';
        if (isset($state['bunker_features'][$state['current_round'] - 1])) {
            $state['revealed_features'][] = $state['bunker_features'][$state['current_round'] - 1];
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