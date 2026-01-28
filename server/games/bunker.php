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

function getInitialState() {
    return [
        'phase' => 'briefing',
        'current_round' => 0,
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

function getAliveIds($pdo, $roomId, $kickedList) {
    $stmt = $pdo->prepare("SELECT user_id FROM room_players WHERE room_id = ?");
    $stmt->execute([$roomId]);
    $allIdsRaw = $stmt->fetchAll(PDO::FETCH_COLUMN);
    $allIds = array_map('strval', $allIdsRaw);
    $kicked = array_map('strval', $kickedList ?? []);
    return array_values(array_diff($allIds, $kicked));
}

function handleGameAction($pdo, $room, $user, $postData) {
    global $ROUNDS_CONFIG, $SPECIAL_CARDS;
    $state = json_decode($room['game_state'], true);
    $type = $postData['type'];
    $userId = (string)$user['id'];
    
    $aliveIds = getAliveIds($pdo, $room['id'], $state['kicked_players']);
    $aliveCount = count($aliveIds);

    // === 1. ИНИЦИАЛИЗАЦИЯ ===
    if ($type === 'init_bunker' && empty($state['players_cards'])) {
        if (!$room['is_host']) return;
        
        $json = file_get_contents(BUNKER_PACK);
        $data = json_decode($json, true);
        $stmt = $pdo->prepare("SELECT user_id FROM room_players WHERE room_id = ?");
        $stmt->execute([$room['id']]);
        $allIds = $stmt->fetchAll(PDO::FETCH_COLUMN);

        $scenario = $data['catastrophes'][array_rand($data['catastrophes'])];
        $state['catastrophe'] = $scenario;
        $state['bunker_places'] = ceil(count($allIds) * $scenario['survival_rate']);
        $state['game_mode'] = $postData['mode'] ?? 'normal'; // Save mode
        
        // --- NEW: Init Features & Threats ---
        $feats = $data['bunker_features'] ?? [];
        shuffle($feats);
        $state['bunker_features'] = array_slice($feats, 0, 5);
        $state['revealed_features'] = [];
        
        // Reveal 1st feature immediately (Round 0)
        if (!empty($state['bunker_features'])) {
             $state['revealed_features'][] = $state['bunker_features'][0];
        }

        $threats = $data['threats'] ?? [];
        shuffle($threats);
        $state['threats'] = array_slice($threats, 0, 2); // Pick 2 random threats
        // -------------------------------------

        $state['players_cards'] = [];
        
        $cats = array_keys($data['cards']);
        foreach ($allIds as $uid) {
            $uid = (string)$uid;
            $cards = [];
            foreach ($cats as $cat) {
                $cardObj = $data['cards'][$cat][array_rand($data['cards'][$cat])];
                // Ensure legacy compatibility if some cards are simple strings
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
        $state['phase'] = 'round';
        foreach ($state['players_cards'] as &$pc) { $pc['professions']['revealed'] = true; }
        
        updateGameState($room['id'], $state);
        return ['status' => 'ok'];
    }

    // === 2. РАСКРЫТИЕ КАРТЫ (СВОБОДНЫЙ РЕЖИМ) ===
    if ($type === 'reveal_card') {
        $cardType = $postData['card_type'];
        $currentRound = (int)($state['current_round'] ?? 0);
        
        // В раунде 0 можно только профессию, факт, багаж.
        // В раундах 1+ можно ВСЁ.
        $canReveal = true;
        if ($currentRound === 0) {
            if (!in_array($cardType, ['professions', 'facts', 'luggage', 'condition'])) {
                $canReveal = false;
            }
        }
        // Removed block for condition

        // Если это фаза ничьей - можно только кандидатам и только факт/багаж
        if ($state['phase'] === 'tie_reveal') {
            if (!in_array($userId, $state['tie_candidates'])) return ['status' => 'error', 'message' => 'Не вы кандидат'];
            if (!in_array($cardType, ['facts', 'luggage'])) return ['status' => 'error', 'message' => 'Только Факт или Багаж'];
            
            if (isset($state['players_cards'][$userId][$cardType])) {
                $state['players_cards'][$userId][$cardType]['revealed'] = true;
                $state['tie_revealed_count']++;
                if ($state['tie_revealed_count'] >= count($state['tie_candidates'])) {
                    $state['phase'] = 'tie_voting';
                    $state['votes'] = [];
                }
                updateGameState($room['id'], $state);
                return ['status' => 'ok'];
            }
        }

        if (!$canReveal) return ['status' => 'error', 'message' => "Рано!"];
        
        if (isset($state['players_cards'][$userId][$cardType])) {
            $state['players_cards'][$userId][$cardType]['revealed'] = true;
            updateGameState($room['id'], $state);
            return ['status' => 'ok'];
        }
    }

    // === 3. СМЕНА ФАЗЫ ===
    if ($type === 'next_phase') {
        if (!$room['is_host']) return;
        $round = $state['current_round'];
        
        // ПРОВЕРКА НА АВТО-ПОБЕДУ
        // Если мест хватает всем живым -> сразу финал
        if ($aliveCount <= $state['bunker_places']) {
            $state['phase'] = 'outro';
            updateGameState($room['id'], $state);
            return ['status' => 'ok'];
        }

        if ($state['phase'] === 'round') {
            if ($ROUNDS_CONFIG[$round]['vote'] === 'mandatory') {
                $state['phase'] = 'voting';
                $state['votes'] = [];
            } else {
                $state['phase'] = 'vote_query';
                $state['vote_query_result'] = [];
            }
        }
        else if ($state['phase'] === 'vote_results') {
            goToNextRound($state);
        }
        
        updateGameState($room['id'], $state);
        return ['status' => 'ok'];
    }

    // === 4. ОПРОС ===
    if ($type === 'vote_query_answer') {
        if (!in_array($userId, $aliveIds)) return;
        $state['vote_query_result'][$userId] = $postData['answer'];
        
        if (count($state['vote_query_result']) >= $aliveCount) {
            $yes = 0; $no = 0;
            foreach ($state['vote_query_result'] as $v) ($v === 'yes') ? $yes++ : $no++;
            if ($yes > $no) {
                $state['phase'] = 'voting';
                $state['votes'] = [];
            } else {
                goToNextRound($state);
            }
        }
        updateGameState($room['id'], $state);
        return ['status' => 'ok'];
    }

    // === 5. ГОЛОСОВАНИЕ ===
    if ($type === 'vote_kick') {
        if (!in_array($userId, $aliveIds)) return;
        
        $targetId = (string)$postData['target_id'];
        
        if ($state['phase'] === 'tie_voting') {
            if (!in_array($targetId, $state['tie_candidates'])) return ['status' => 'error', 'message' => 'Только за кандидатов!'];
        }

        $state['votes'][$userId] = $targetId;
        
        if (count($state['votes']) >= $aliveCount) {
            processVotingResults($state);
        }
        
        updateGameState($room['id'], $state);
        return ['status' => 'ok'];
    }

    if ($type === 'force_finish_voting') {
        if (!$room['is_host']) return;
        processVotingResults($state);
        updateGameState($room['id'], $state);
        return ['status' => 'ok'];
    }
    
    if ($type === 'skip_tie_reveal') {
        if (!$room['is_host']) return;
        $state['phase'] = 'tie_voting';
        $state['votes'] = [];
        updateGameState($room['id'], $state);
        return ['status' => 'ok'];
    }

    return ['status' => 'ok'];
}

function processVotingResults(&$state) {
    if (empty($state['votes'])) {
        goToNextRound($state);
        return;
    }

    $counts = array_count_values($state['votes']);
    arsort($counts);
    
    $leaderId = array_key_first($counts);
    $maxVotes = current($counts);
    $candidates = array_keys($counts, $maxVotes);
    
    if (count($candidates) > 1) {
        if ($state['phase'] === 'tie_voting') {
            $leaderId = $candidates[array_rand($candidates)];
            finishKick($state, $leaderId, $counts, true, true); // True for Tie, True for Random
        } 
        else {
            $state['phase'] = 'tie_reveal';
            $state['tie_candidates'] = $candidates;
            $state['tie_revealed_count'] = 0;
            $state['votes'] = [];
        }
    } else {
        finishKick($state, $leaderId, $counts, false, false);
    }
}

function finishKick(&$state, $leaderId, $counts, $wasTie, $isRandom = false) {
    $state['kicked_players'][] = (string)$leaderId;
    $state['vote_results'] = [
        'kicked_id' => $leaderId,
        'counts' => $counts,
        'is_tie' => $wasTie,
        'is_random' => $isRandom // NEW: Flag for UI
    ];
    $state['phase'] = 'vote_results';
}

// ... (previous code)

function goToNextRound(&$state) {
    if ($state['current_round'] < 5) {
        $state['current_round']++;
        $state['phase'] = 'round';
        
        // Reveal next feature
        $r = $state['current_round'];
        if (isset($state['bunker_features'][$r])) {
            $state['revealed_features'][] = $state['bunker_features'][$r];
        }
    } else {
        $state['phase'] = 'outro';
        resolveThreats($state);
    }
}

function resolveThreats(&$state) {
    $results = [];
    $survivorsIds = array_keys(array_filter($state['players_cards'], function($k) use ($state) {
        return !in_array($k, $state['kicked_players']);
    }, ARRAY_FILTER_USE_KEY));
    
    // 1. Collect all tags from Survivors & Bunker
    $groupTags = [];
    
    // Survivors
    foreach ($survivorsIds as $uid) {
        $cards = $state['players_cards'][$uid];
        foreach ($cards as $k => $v) {
            // Check 'tags' array
            if (isset($v['tags']) && is_array($v['tags'])) {
                foreach ($v['tags'] as $t) $groupTags[mb_strtolower($t)] = true;
            }
            // Also keep 'text' for fallback or specific logic? Not needed for now.
        }
    }
    
    // Bunker Features
    $features = $state['revealed_features'] ?? [];
    foreach ($features as $f) {
        if (isset($f['tags']) && is_array($f['tags'])) {
            foreach ($f['tags'] as $t) $groupTags[mb_strtolower($t)] = true;
        }
    }
    
    // 2. Resolve Each Threat
    foreach (($state['threats'] ?? []) as $threat) {
        $reqs = $threat['requirements'] ?? []; 
        $matches = 0;
        $matchedTags = [];
        
        foreach ($reqs as $req) {
            // Requirements e.g. "Soldier", "Gun"
            // Clean up: "Luggage.Gun" -> "gun"
            $parts = explode('.', $req);
            $cleanReq = mb_strtolower(end($parts));
            
            if (isset($groupTags[$cleanReq])) {
                $matches++;
                $matchedTags[] = $cleanReq;
            }
        }
        
        // Calculation Logic
        // Base: 40%
        // Per Survivor: +5%
        // Per Match: +20%
        
        $chance = 40 + (count($survivorsIds) * 5);
        $chance += ($matches * 20);
        
        if ($chance > 95) $chance = 95;
        if ($chance < 5) $chance = 5;
        
        $roll = rand(0, 100);
        $success = $roll < $chance;
        
        $resultText = $success 
            ? "Группа объединила усилия и справилась." 
            : "Вам не хватило специалистов или ресурсов.";
            
        if ($matches > 0) {
            $resultText .= " (Использовано: " . implode(', ', $matchedTags) . ")";
        }
        
        $results[] = [
            'title' => $threat['title'],
            'desc' => $threat['desc'],
            'success' => $success,
            'result_text' => $resultText,
            'chance' => $chance // debug info
        ];
    }
    
    $state['threat_results'] = $results;
}
?>