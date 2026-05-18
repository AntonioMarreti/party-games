<?php

function failGameLifecycle($message, $data = [])
{
    logRoomLifecycle('game_guard_rejected', $data, $message);
    sendError($message);
}

function getMinPlayersForGame(string $gameName): int
{
    $minPlayers = [
        'bunker' => 4,
        'brainbattle' => 1,
        'partybattle' => 3,
        'tictactoe_ultimate' => 2,
        'blokus' => 2,
        'wordclash' => 1,
        'tictactoe' => 2,
        'spyfall' => 3,
        'minesweeper_br' => 2,
        'backgammon_game' => 2,
    ];

    return $minPlayers[$gameName] ?? 2;
}

function getPlayerNoun(int $count): string
{
    $mod100 = $count % 100;
    if ($mod100 >= 11 && $mod100 <= 14) {
        return 'игроков';
    }

    $mod10 = $count % 10;
    if ($mod10 === 1) {
        return 'игрок';
    }
    if ($mod10 >= 2 && $mod10 <= 4) {
        return 'игрока';
    }

    return 'игроков';
}

function action_start_game($pdo, $user, $data)
{
    $room = getRoom($user['id']);
    if (!$room)
        failGameLifecycle('No room', ['actor_user_id' => (int) $user['id'], 'requested_action' => 'start_game']);
    if (!$room['is_host'])
        failGameLifecycle('Not host', ['actor_user_id' => (int) $user['id'], 'room_id' => (int) $room['id'], 'room_code' => $room['room_code'] ?? null, 'requested_action' => 'start_game']);

    $gameName = preg_replace('/[^a-z0-9_]/', '', $data['game_name'] ?? '');
    if ($gameName === '') {
        failGameLifecycle('Game is required', ['actor_user_id' => (int) $user['id'], 'room_id' => (int) $room['id'], 'room_code' => $room['room_code'] ?? null, 'requested_action' => 'start_game']);
    }

    if (!isRoomWaitingState($room)) {
        if (isRoomPlayingState($room) && ($room['game_type'] ?? '') === $gameName) {
            logRoomLifecycle('game_start_noop', [
                'room_id' => (int) $room['id'],
                'room_code' => $room['room_code'] ?? null,
                'actor_user_id' => (int) $user['id'],
                'host_user_id' => (int) $room['host_user_id'],
                'game_type' => $room['game_type'] ?? null,
                'status' => $room['status'] ?? null,
            ], 'Game start noop');
            echo json_encode(['status' => 'ok']);
            return;
        }

        failGameLifecycle('Game already started', ['actor_user_id' => (int) $user['id'], 'room_id' => (int) $room['id'], 'room_code' => $room['room_code'] ?? null, 'requested_action' => 'start_game', 'status' => $room['status'] ?? null, 'game_type' => $room['game_type'] ?? null]);
    }

    $counts = getRoomPlayerCounts($pdo, $room['id']);
    $minPlayers = getMinPlayersForGame($gameName);
    if ($counts['total_players'] < $minPlayers) {
        failGameLifecycle("Для этой игры нужно минимум {$minPlayers} " . getPlayerNoun($minPlayers), [
            'actor_user_id' => (int) $user['id'],
            'room_id' => (int) $room['id'],
            'room_code' => $room['room_code'] ?? null,
            'requested_action' => 'start_game',
            'game_type' => $gameName,
            'min_players' => $minPlayers,
            'players_total' => $counts['total_players'],
            'humans_total' => $counts['human_players'],
        ]);
    }

    $gameFile = __DIR__ . "/../games/$gameName.php";

    if (file_exists($gameFile)) {
        require_once $gameFile;
        if (function_exists('getInitialState')) {
            $initialState = getInitialState();
            if ($gameName === 'partybattle' && function_exists('pb_extractPersistedRecentCards')) {
                $persistedRecentCards = pb_extractPersistedRecentCards($room['game_state'] ?? null);
                if (!empty($persistedRecentCards)) {
                    $initialState['recent_cards'] = $persistedRecentCards;
                }
            }
            $pdo->prepare("UPDATE rooms SET game_type = ?, status = 'playing', game_state = ? WHERE id = ?")
                ->execute([$gameName, json_encode($initialState), $room['id']]);

            logRoomLifecycle('game_started', [
                'room_id' => (int) $room['id'],
                'room_code' => $room['room_code'] ?? null,
                'actor_user_id' => (int) $user['id'],
                'host_user_id' => (int) $room['host_user_id'],
                'game_type' => $gameName,
                'players_total' => $counts['total_players'],
                'humans_total' => $counts['human_players'],
                'previous_status' => $room['status'] ?? null,
                'new_status' => 'playing',
            ], 'Game started');

            echo json_encode(['status' => 'ok']);
        } else {
            TelegramLogger::log("Start Game Error: getInitialState not found", ['game' => $gameName]);
            echo json_encode(['status' => 'error', 'message' => 'Game state error']);
        }
    } else {
        TelegramLogger::log("Start Game Error: File not found", ['file' => $gameFile]);
        sendError('Game file not found');
    }
}

function action_stop_game($pdo, $user, $data)
{
    $room = getRoom($user['id']);
    if (!$room)
        failGameLifecycle('No room', ['actor_user_id' => (int) $user['id'], 'requested_action' => 'stop_game']);
    if (!$room['is_host'])
        failGameLifecycle('Not host', ['actor_user_id' => (int) $user['id'], 'room_id' => (int) $room['id'], 'room_code' => $room['room_code'] ?? null, 'requested_action' => 'stop_game']);
    if (!isRoomPlayingState($room)) {
        logRoomLifecycle('game_stop_noop', [
            'room_id' => (int) $room['id'],
            'room_code' => $room['room_code'] ?? null,
            'actor_user_id' => (int) $user['id'],
            'game_type' => $room['game_type'] ?? null,
            'status' => $room['status'] ?? null,
        ], 'Game stop noop');
        echo json_encode(['status' => 'ok']);
        return;
    }
    $persistedState = null;
    if (($room['game_type'] ?? '') === 'partybattle') {
        $gameFile = __DIR__ . "/../games/partybattle.php";
        if (file_exists($gameFile)) {
            require_once $gameFile;
            if (function_exists('pb_buildPersistentLobbyState')) {
                $decodedState = json_decode($room['game_state'] ?? '', true);
                $persistedState = json_encode(pb_buildPersistentLobbyState(is_array($decodedState) ? $decodedState : []));
            }
        }
    }
    $pdo->prepare("UPDATE rooms SET game_type = 'lobby', status = 'waiting', game_state = ? WHERE id = ?")->execute([$persistedState, $room['id']]);

    logRoomLifecycle('game_stopped', [
        'room_id' => (int) $room['id'],
        'room_code' => $room['room_code'] ?? null,
        'actor_user_id' => (int) $user['id'],
        'host_user_id' => (int) $room['host_user_id'],
        'game_type' => $room['game_type'] ?? null,
        'previous_status' => $room['status'] ?? null,
        'new_status' => 'waiting',
    ], 'Game stopped');

    echo json_encode(['status' => 'ok']);
}

function action_finish_game_session($pdo, $user, $data)
{
    $room = getRoom($user['id']);
    if (!$room)
        failGameLifecycle('No room', ['actor_user_id' => (int) $user['id'], 'requested_action' => 'finish_game_session']);
    if (!$room['is_host'])
        failGameLifecycle('Not host', ['actor_user_id' => (int) $user['id'], 'room_id' => (int) $room['id'], 'room_code' => $room['room_code'] ?? null, 'requested_action' => 'finish_game_session']);
    if (!isRoomPlayingState($room)) {
        logRoomLifecycle('game_finish_noop', [
            'room_id' => (int) $room['id'],
            'room_code' => $room['room_code'] ?? null,
            'actor_user_id' => (int) $user['id'],
            'game_type' => $room['game_type'] ?? null,
            'status' => $room['status'] ?? null,
        ], 'Game finish noop');
        echo json_encode(['status' => 'ok']);
        return;
    }

    // Logic: Move to lobby but keep players
    // NOTE: Statistics are normally saved via 'game_finished' action (stats.php).
    // This action (finish_game_session) is for forced stop.
    // We could optionally log a "cancelled" game event here if desired.

    $persistedState = null;
    if (($room['game_type'] ?? '') === 'partybattle') {
        $gameFile = __DIR__ . "/../games/partybattle.php";
        if (file_exists($gameFile)) {
            require_once $gameFile;
            if (function_exists('pb_buildPersistentLobbyState')) {
                $decodedState = json_decode($room['game_state'] ?? '', true);
                $persistedState = json_encode(pb_buildPersistentLobbyState(is_array($decodedState) ? $decodedState : []));
            }
        }
    }

    $pdo->prepare("UPDATE rooms SET game_type = 'lobby', status = 'waiting', game_state = ? WHERE id = ?")
        ->execute([$persistedState, $room['id']]);

    logRoomLifecycle('game_finished_session', [
        'room_id' => (int) $room['id'],
        'room_code' => $room['room_code'] ?? null,
        'actor_user_id' => (int) $user['id'],
        'host_user_id' => (int) $room['host_user_id'],
        'game_type' => $room['game_type'] ?? null,
        'previous_status' => $room['status'] ?? null,
        'new_status' => 'waiting',
    ], 'Game session finished');

    echo json_encode(['status' => 'ok']);
}

function action_game_action($pdo, $user, $data)
{
    $room = getRoom($user['id']);
    if (!$room)
        sendError('No room');

    $gameName = $room['game_type'];
    $gameFile = __DIR__ . "/../games/$gameName.php";

    if (file_exists($gameFile)) {
        require_once $gameFile;
        // Debug logging
        if (!function_exists('handleGameAction')) {
            TelegramLogger::log("API Error: handleGameAction not found after require", ['gameFile' => $gameFile]);
        }
        try {
            $pdo->beginTransaction();
            // Assuming handleGameAction is defined in the game file
            $result = handleGameAction($pdo, $room, $user, $data);
            
            // Persist the state if the game handler returned it
            if (isset($result['state'])) {
                $pdo->prepare("UPDATE rooms SET game_state = ? WHERE id = ?")
                    ->execute([json_encode($result['state']), $room['id']]);
            }
            
            $pdo->commit();
            echo json_encode($result ?? ['status' => 'ok']);
        } catch (Exception $e) {
            if ($pdo->inTransaction())
                $pdo->rollBack();
            TelegramLogger::log("Game Action Error", ['error' => $e->getMessage(), 'game' => $gameName, 'data' => $data]);
            // DEBUG: Expose error message to client
            echo json_encode(['status' => 'error', 'message' => "Error: " . $e->getMessage()]);
        }
    } else {
        sendError('Game file not found');
    }
}

function action_send_reaction($pdo, $user, $data)
{
    global $room; // Potentially needed if used inside game context, but here we get room explicitly.
    $room = getRoom($user['id']);
    if (!$room)
        sendError('No room');

    $type = $data['type'] ?? 'emoji';
    $payloadData = $data['payload'] ?? '[]';

    // If payload is a string (which it is from FormData), decode it first to avoid double encoding
    if (is_string($payloadData)) {
        $decoded = json_decode($payloadData, true);
        if ($decoded !== null) {
            $payloadData = $decoded;
        }
    }

    try {
        $pdo->prepare("INSERT INTO room_events (room_id, user_id, type, payload) VALUES (?, ?, ?, ?)")
            ->execute([$room['id'], $user['id'], $type, json_encode($payloadData)]);
        echo json_encode(['status' => 'ok']);
    } catch (Exception $e) {
        TelegramLogger::log("Reaction Error", ['error' => $e->getMessage()]);
        echo json_encode(['status' => 'error']);
    }
}
