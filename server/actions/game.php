<?php

function action_start_game($pdo, $user, $data) {
    $room = getRoom($user['id']);
    if (!$room || !$room['is_host']) return;
    
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

function action_stop_game($pdo, $user, $data) {
    $room = getRoom($user['id']);
    if (!$room || !$room['is_host']) return;
    $pdo->prepare("UPDATE rooms SET game_type = 'lobby', status = 'waiting', game_state = NULL WHERE id = ?")->execute([$room['id']]);
    echo json_encode(['status' => 'ok']);
}

function action_finish_game_session($pdo, $user, $data) {
    $room = getRoom($user['id']);
    if (!$room || !$room['is_host']) return;
    
    // Logic: Move to lobby but keep players
    // NOTE: Statistics are normally saved via 'game_finished' action (stats.php).
    // This action (finish_game_session) is for forced stop.
    // We could optionally log a "cancelled" game event here if desired.
    
    $pdo->prepare("UPDATE rooms SET game_type = 'lobby', status = 'waiting', game_state = NULL WHERE id = ?")
        ->execute([$room['id']]);
    echo json_encode(['status' => 'ok']);
}

function action_game_action($pdo, $user, $data) {
    $room = getRoom($user['id']);
    if (!$room) sendError('No room');
    
    $gameName = $room['game_type'];
    $gameFile = __DIR__ . "/../games/$gameName.php";

    if (file_exists($gameFile)) {
        require_once $gameFile;
        try {
            $pdo->beginTransaction();
            // Assuming handleGameAction is defined in the game file
            $result = handleGameAction($pdo, $room, $user, $data);
            $pdo->commit();
            echo json_encode($result ?? ['status' => 'ok']);
        } catch (Exception $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            TelegramLogger::log("Game Action Error", ['error' => $e->getMessage(), 'game' => $gameName, 'data' => $data]);
            // DEBUG: Expose error message to client
            echo json_encode(['status' => 'error', 'message' => "Error: " . $e->getMessage()]);
        }
    } else {
        sendError('Game file not found');
    }
}
