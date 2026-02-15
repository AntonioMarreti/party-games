<?php
// server/games/tictactoe_ultimate.php

function getInitialState()
{
    return [
        'phase' => 'lobby',
        'boards' => array_fill(0, 9, array_fill(0, 9, null)),
        'mini_wins' => array_fill(0, 9, null),
        'active_mini_board' => null, // null/ -1 means any
        'current_turn' => null,
        'winner' => null,
        'winning_line' => null,
        'history' => []
    ];
}

function handleGameAction($pdo, $room, $user, $postData)
{
    $state = json_decode($room['game_state'], true);
    $type = $postData['type'];
    $userId = (string) $user['id'];

    $stmt = $pdo->prepare("SELECT user_id, is_bot FROM room_players WHERE room_id = ? ORDER BY id ASC");
    $stmt->execute([$room['id']]);
    $playersData = $stmt->fetchAll();
    $players = array_map(function ($p) {
        return strval($p['user_id']); }, $playersData);

    if (empty($players))
        return ['status' => 'error', 'message' => 'No players'];

    // Bot Delegation
    if ($state['current_turn'] && $userId !== strval($state['current_turn']) && $room['is_host']) {
        foreach ($playersData as $pd) {
            if (strval($pd['user_id']) === strval($state['current_turn']) && $pd['is_bot']) {
                $userId = strval($state['current_turn']);
                break;
            }
        }
    }

    $symbols = [];
    if (isset($players[0]))
        $symbols[$players[0]] = 'X';
    if (isset($players[1]))
        $symbols[$players[1]] = 'O';

    if ($type === 'start_game') {
        if (!$room['is_host'])
            return ['status' => 'error'];
        $state = getInitialState();
        $state['current_turn'] = $players[0];
        $state['phase'] = 'playing';
        updateGameState($room['id'], $state);
        return ['status' => 'ok'];
    }

    if ($type === 'make_move') {
        if ($state['phase'] !== 'playing')
            return ['status' => 'error', 'message' => 'Game finished'];
        if ($state['current_turn'] !== $userId)
            return ['status' => 'error', 'message' => 'Not your turn'];

        $boardIdx = (int) $postData['board_index'];
        $cellIdx = (int) $postData['cell_index'];

        // Validate board_index
        if ($state['active_mini_board'] !== null && $state['active_mini_board'] != -1) {
            if ($boardIdx != $state['active_mini_board']) {
                return ['status' => 'error', 'message' => 'Wrong board'];
            }
        }

        // Validate if board is already won
        if ($state['mini_wins'][$boardIdx] !== null) {
            return ['status' => 'error', 'message' => 'Board already won'];
        }

        // Validate if cell is empty
        if ($state['boards'][$boardIdx][$cellIdx] !== null) {
            return ['status' => 'error', 'message' => 'Occupied'];
        }

        $symbol = $symbols[$userId] ?? null;
        if (!$symbol)
            return ['status' => 'error'];

        // Make move
        $state['boards'][$boardIdx][$cellIdx] = $symbol;

        // 1. Check mini-board win
        $win = checkUltimateWinner($state['boards'][$boardIdx]);
        if ($win) {
            $state['mini_wins'][$boardIdx] = $win['symbol'];
            // 2. Check macro-board win
            $macroWin = checkUltimateWinner($state['mini_wins']);
            if ($macroWin) {
                $state['phase'] = 'finished';
                $state['winner'] = $macroWin['symbol'];
                $state['winning_line'] = $macroWin['line'];
            }
        } else {
            // Check mini-draw
            if (!in_array(null, $state['boards'][$boardIdx])) {
                $state['mini_wins'][$boardIdx] = 'draw';
            }
        }

        // 3. Set next active_mini_board
        if ($state['phase'] !== 'finished') {
            // The next mini-board is the one corresponding to the cell_index played
            if ($state['mini_wins'][$cellIdx] !== null) {
                $state['active_mini_board'] = -1; // Any board if target is won/drawn
            } else {
                $state['active_mini_board'] = $cellIdx;
            }

            // Toggle turn
            $state['current_turn'] = ($userId === $players[0]) ? ($players[1] ?? $players[0]) : $players[0];
        }

        updateGameState($room['id'], $state);

        // Result Reporting
        if ($state['phase'] === 'finished') {
            $results = [];
            foreach ($players as $pid) {
                $results[] = [
                    'user_id' => $pid,
                    'rank' => ($state['winner'] === $symbols[$pid]) ? 1 : 2,
                    'score' => ($state['winner'] === 'draw') ? 1 : 0
                ];
            }
            return ['status' => 'ok', 'game_over' => true, 'players_data' => $results];
        }

        return ['status' => 'ok'];
    }

    if ($type === 'restart_game') {
        if (!$room['is_host'])
            return ['status' => 'error'];
        $state = getInitialState();
        $state['current_turn'] = $players[0];
        $state['phase'] = 'playing';
        updateGameState($room['id'], $state);
        return ['status' => 'ok'];
    }

    return ['status' => 'ok'];
}

function checkUltimateWinner($board)
{
    $lines = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
    foreach ($lines as $line) {
        $a = $line[0];
        $b = $line[1];
        $c = $line[2];
        if ($board[$a] && $board[$a] !== 'draw' && $board[$a] === $board[$b] && $board[$a] === $board[$c]) {
            return ['symbol' => $board[$a], 'line' => $line];
        }
    }
    return null;
}
