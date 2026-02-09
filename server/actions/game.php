<?php

function action_start_game($pdo, $user, $data)
{
    $room = getRoom($user['id']);
    if (!$room || !$room['is_host'])
        return;

    $gameName = preg_replace('/[^a-z0-9_]/', '', $data['game_name'] ?? '');
    $gameFile = __DIR__ . "/../games/$gameName.php";

    if (file_exists($gameFile)) {
        require_once $gameFile;
        if (function_exists('getInitialState')) {
            $initialState = getInitialState();
            $pdo->prepare("UPDATE rooms SET game_type = ?, status = 'playing', game_state = ? WHERE id = ?")
                ->execute([$gameName, json_encode($initialState), $room['id']]);
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
    if (!$room || !$room['is_host'])
        return;
    $pdo->prepare("UPDATE rooms SET game_type = 'lobby', status = 'waiting', game_state = NULL WHERE id = ?")->execute([$room['id']]);
    echo json_encode(['status' => 'ok']);
}

function action_finish_game_session($pdo, $user, $data)
{
    $room = getRoom($user['id']);
    if (!$room || !$room['is_host'])
        return;

    // Logic: Move to lobby but keep players
    // NOTE: Statistics are normally saved via 'game_finished' action (stats.php).
    // This action (finish_game_session) is for forced stop.
    // We could optionally log a "cancelled" game event here if desired.

    $pdo->prepare("UPDATE rooms SET game_type = 'lobby', status = 'waiting', game_state = NULL WHERE id = ?")
        ->execute([$room['id']]);
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
