<?php
// server/games/spyfall.php

define('SPYFALL_PACKS_DIR', __DIR__ . '/packs/spyfall/');

function getInitialState()
{
    $packs = [];
    if (is_dir(SPYFALL_PACKS_DIR)) {
        $files = glob(SPYFALL_PACKS_DIR . '*.json');
        foreach ($files as $file) {
            $data = json_decode(file_get_contents($file), true);
            if ($data) {
                $packs[] = [
                    'id' => basename($file, '.json'),
                    'name' => $data['name'] ?? 'Без названия',
                    'desc' => $data['description'] ?? ''
                ];
            }
        }
    }

    return [
        'phase' => 'setup',
        'available_packs' => $packs,
        'selected_packs' => ['base'],
        'time_limit' => 8, // minutes
        'location' => null,
        'roles' => [], // user_id => role_name
        'spy_id' => null,
        'start_time' => null,
        'end_time' => null,
        'active_pair' => null, // ['asker' => user_id, 'answerer' => user_id]
        'round_queue' => [], // array of user_ids to manage turns
        'votes' => [], // user_id => voted_for_user_id
        'winner' => null, // 'spy' or 'locals'
        'scores' => [] // user_id => score
    ];
}

function handleGameAction($pdo, $room, $user, $postData)
{
    $state = json_decode($room['game_state'], true);
    if (!$state)
        $state = getInitialState();

    $type = $postData['type'] ?? '';

    // Only host can change settings
    if ($type === 'update_settings' && $room['is_host']) {
        if (isset($postData['time_limit'])) {
            $state['time_limit'] = (int) $postData['time_limit'];
        }
        if (isset($postData['packs']) && is_array($postData['packs'])) {
            $state['selected_packs'] = array_map('basename', $postData['packs']);
        }
        updateGameState($room['id'], $state);
        return ['status' => 'ok'];
    }

    if ($type === 'start_game' && $room['is_host']) {
        // Gather players
        $stmt = $pdo->prepare("SELECT user_id FROM room_players WHERE room_id = ?");
        $stmt->execute([$room['id']]);
        $players = $stmt->fetchAll(PDO::FETCH_COLUMN);

        if (count($players) < 3) {
            return ['status' => 'error', 'message' => 'Минимум 3 игрока'];
        }

        // Load locations from selected packs
        $all_locations = [];
        foreach ($state['selected_packs'] as $packId) {
            $file = SPYFALL_PACKS_DIR . $packId . '.json';
            if (file_exists($file)) {
                $data = json_decode(file_get_contents($file), true);
                if (isset($data['locations'])) {
                    $all_locations = array_merge($all_locations, $data['locations']);
                }
            }
        }

        if (empty($all_locations)) {
            return ['status' => 'error', 'message' => 'Нет доступных локаций'];
        }

        // Select Random Location
        $locNames = array_keys($all_locations);
        $selectedLoc = $locNames[array_rand($locNames)];
        $state['location'] = $selectedLoc;

        // Assign Roles
        $rolesAvailable = $all_locations[$selectedLoc];
        shuffle($rolesAvailable);

        // Pick Spy
        $spyIndex = array_rand($players);
        $state['spy_id'] = $players[$spyIndex];

        $state['roles'] = [];
        foreach ($players as $pid) {
            if ($pid === $state['spy_id']) {
                $state['roles'][(string) $pid] = 'Шпион';
            } else {
                $state['roles'][(string) $pid] = array_pop($rolesAvailable) ?? 'Местный житель';
            }
        }

        // Setup Turn Mechanics
        shuffle($players);
        $state['round_queue'] = $players;

        $asker = array_shift($state['round_queue']);
        // Temporarily put asker at the end so they can answer later
        array_push($state['round_queue'], $asker);
        $answerer = $state['round_queue'][0]; // The next person in queue

        $state['active_pair'] = [
            'asker' => (string) $asker,
            'answerer' => (string) $answerer
        ];

        // Start Timer
        $state['phase'] = 'playing';
        $state['start_time'] = time();
        $state['end_time'] = time() + ($state['time_limit'] * 60);
        $state['votes'] = [];
        $state['winner'] = null;

        updateGameState($room['id'], $state);
        return ['status' => 'ok'];
    }

    if ($type === 'next_turn' && $state['phase'] === 'playing') {
        // Only the current answerer can pass the turn
        if ((string) $user['id'] !== $state['active_pair']['answerer']) {
            return ['status' => 'error', 'message' => 'Не ваш ход'];
        }

        $queue = $state['round_queue'];
        $currentAnswerer = array_shift($queue);
        array_push($queue, $currentAnswerer);

        $nextAsker = $currentAnswerer;
        $nextAnswerer = $queue[0];

        // If the next answerer is the same as the asker (shouldn't happen with 3+ players, but just in case)
        if ($nextAsker === $nextAnswerer) {
            $nextAnswerer = $queue[1] ?? $queue[0];
        }

        $state['round_queue'] = $queue;
        $state['active_pair'] = [
            'asker' => (string) $nextAsker,
            'answerer' => (string) $nextAnswerer
        ];

        updateGameState($room['id'], $state);
        return ['status' => 'ok'];
    }

    if ($type === 'vote_spy' && $state['phase'] === 'playing') {
        $targetId = $postData['target_id'] ?? null;
        if ($targetId) {
            $state['votes'][(string) $user['id']] = (string) $targetId;

            // Check if all players (except the voted one or spy) have voted for the same person?
            // Usually spyfall voting requires a unanimous vote. We will simplified: 
            // If majority of players vote for someone, the game ends.

            $stmt = $pdo->prepare("SELECT COUNT(*) FROM room_players WHERE room_id = ?");
            $stmt->execute([$room['id']]);
            $totalPlayers = $stmt->fetchColumn();
            $requiredVotes = ceil($totalPlayers / 2); // Simple majority for MVP

            $counts = array_count_values($state['votes']);
            arsort($counts);
            $topTarget = array_key_first($counts);
            $topVotes = $counts[$topTarget];

            if ($topVotes >= $requiredVotes) {
                $state['phase'] = 'results';
                if ($topTarget === (string) $state['spy_id']) {
                    $state['winner'] = 'locals'; // Spy caught
                } else {
                    $state['winner'] = 'spy'; // Wrong person caught
                }
            }

            updateGameState($room['id'], $state);
        }
        return ['status' => 'ok'];
    }

    if ($type === 'guess_location' && $state['phase'] === 'playing') {
        // Only spy can guess
        if ((string) $user['id'] !== (string) $state['spy_id']) {
            return ['status' => 'error', 'message' => 'Вы не шпион'];
        }

        $guess = $postData['guess'] ?? '';
        $state['phase'] = 'results';

        if (mb_strtolower($guess) === mb_strtolower($state['location'])) {
            $state['winner'] = 'spy';
        } else {
            $state['winner'] = 'locals';
        }

        updateGameState($room['id'], $state);
        return ['status' => 'ok'];
    }

    // Time check logic can be implemented here or on client side to trigger end_game
    if ($type === 'end_time' && $state['phase'] === 'playing') {
        // If time runs out, the spy wins (because locals failed to identify the spy)
        $state['phase'] = 'results';
        $state['winner'] = 'spy';
        updateGameState($room['id'], $state);
        return ['status' => 'ok'];
    }

    // Reset back to lobby
    if ($type === 'back_to_lobby' && $room['is_host']) {
        $state = getInitialState();
        // Persist cumulative scores if needed, but we'll reset for now
        updateGameState($room['id'], $state);
        return ['status' => 'ok'];
    }

    return ['status' => 'ignored'];
}
