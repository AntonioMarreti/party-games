<?php
// server/games/backgammon_game.php

function getInitialState()
{
    $board = array_fill(0, 24, null);
    $board[23] = ['player' => 'white', 'count' => 15];  // White head: Top-Right
    $board[11] = ['player' => 'black', 'count' => 15];  // Black head: Bottom-Left

    return [
        'status' => 'starting',
        'turn' => 'white',
        'board' => $board,
        'dice' => [],
        'movesLeft' => [],
        'whiteOff' => 0,
        'blackOff' => 0,
        'headMoved' => 0,
        'isFirstTurn' => ['white' => true, 'black' => true],
        'winner' => null,
        'version' => 0,
        'startingRolls' => ['white' => null, 'black' => null]
    ];
}

function handleGameAction($pdo, $room, $user, $data)
{
    $state = json_decode($room['game_state'], true);
    if (!$state) $state = getInitialState();

    $action = $data['type'] ?? $data['game_action'] ?? '';

    // Required generic handler to return to lobby
    if ($action === 'back_to_lobby') {
        if ($room['is_host']) {
            $pdo->prepare("UPDATE rooms SET game_type = 'lobby', status = 'waiting', game_state = NULL WHERE id = ?")
                ->execute([$room['id']]);
        }
        return ['status' => 'ok'];
    }

    // For now we allow clients to just push full state updates to the server to sync multiplayer
    if ($action === 'sync_state') {
        if (isset($data['state'])) {
            $newState = is_string($data['state']) ? json_decode($data['state'], true) : $data['state'];
            
            $pdo->prepare("UPDATE rooms SET game_state = ? WHERE id = ?")
                ->execute([json_encode($newState), $room['id']]);
                
            return ['status' => 'ok', 'state' => $newState];
        }
    }

    // Starting the actual play phase
    if ($action === 'start_game') {
        if (!$room['is_host']) throw new Exception("Only host can start");

        // Always reset to correct initial state when starting
        $freshState = getInitialState();
        $pdo->prepare("UPDATE rooms SET game_state = ? WHERE id = ?")
            ->execute([json_encode($freshState), $room['id']]);

        return ['status' => 'ok', 'state' => $freshState];
    }

    return ['status' => 'error', 'message' => 'Unknown action'];
}
