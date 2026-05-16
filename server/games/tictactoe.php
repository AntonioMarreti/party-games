<?php
// server/games/tictactoe.php

function getInitialState()
{
    return [
        'phase' => 'lobby', // lobby, playing, finished
        'board' => array_fill(0, 9, null),
        'current_turn' => null, // Will be set to the first player who joins or starts
        'winner' => null, // 'X', 'O', or 'draw'
        'winning_line' => null, // [a, b, c]
        'history' => [],
        'scores' => [], // {userId: score}
        'started_at' => null,
        'stats_recorded' => false
    ];
}

function handleGameAction($pdo, $room, $user, $postData)
{
    $state = json_decode($room['game_state'], true);
    $type = $postData['type'];
    $userId = (string) $user['id'];

    // 1. Get Players (Ordered by join date/ID in room_players)
    $stmt = $pdo->prepare("SELECT user_id, is_bot FROM room_players WHERE room_id = ? ORDER BY id ASC");
    $stmt->execute([$room['id']]);
    $playersData = $stmt->fetchAll();
    $players = array_map(function ($p) {
        return strval($p['user_id']);
    }, $playersData);

    if (empty($players))
        return ['status' => 'error', 'message' => 'No players'];

    // 1.1 Bot Delegation: If it's a bot's turn, the host can send the move
    if ($state['current_turn'] && $userId !== strval($state['current_turn']) && $room['is_host']) {
        foreach ($playersData as $pd) {
            if (strval($pd['user_id']) === strval($state['current_turn']) && $pd['is_bot']) {
                $userId = strval($state['current_turn']); // Delegate ID
                break;
            }
        }
    }

    // Assign symbols based on join order
    $symbols = [];
    if (isset($players[0]))
        $symbols[$players[0]] = 'X';
    if (isset($players[1]))
        $symbols[$players[1]] = 'O';

    // 2. Actions
    if ($type === 'start_game') {
        if (!$room['is_host'])
            return ['status' => 'error', 'message' => 'Only host'];

        $state = getInitialState();
        $state['current_turn'] = $players[0]; // X starts
        $state['phase'] = 'playing';
        $state['started_at'] = time();
        updateGameState($room['id'], $state);
        return ['status' => 'ok'];
    }

    if ($type === 'make_move') {
        if ($state['phase'] !== 'playing')
            return ['status' => 'error', 'message' => 'Game finished'];
        if ($state['current_turn'] !== $userId)
            return ['status' => 'error', 'message' => 'Not your turn'];

        $index = (int) $postData['index'];
        if ($index < 0 || $index > 8 || $state['board'][$index] !== null) {
            return ['status' => 'error', 'message' => 'Invalid move'];
        }

        $symbol = $symbols[$userId] ?? null;
        if (!$symbol)
            return ['status' => 'error', 'message' => 'Not a player'];

        $state['board'][$index] = $symbol;

        // Check Win
        $win = checkWinner($state['board']);
        if ($win) {
            $state['phase'] = 'finished';
            $state['winner'] = $win['symbol'];
            $state['winning_line'] = $win['line'];
        } else if (!in_array(null, $state['board'])) {
            $state['phase'] = 'finished';
            $state['winner'] = 'draw';
        } else {
            // Toggle turn
            $state['current_turn'] = ($userId === $players[0]) ? ($players[1] ?? $players[0]) : $players[0];
        }

        // If finished, return results for the client to submit to stats
        if ($state['phase'] === 'finished') {
            $results = tttBuildPlayersData($players, $symbols, $state['winner']);
            tttRecordFinalStatsIfNeeded($pdo, $room, $state, $results);
            updateGameState($room['id'], $state);
            return ['status' => 'ok', 'game_over' => true, 'players_data' => $results];
        }

        updateGameState($room['id'], $state);
        return ['status' => 'ok'];
    }

    if ($type === 'restart_game') {
        if (!$room['is_host'])
            return ['status' => 'error'];
        $state = getInitialState();
        $state['current_turn'] = $players[0];
        updateGameState($room['id'], $state);
        return ['status' => 'ok'];
    }

    return ['status' => 'ok'];
}

function tttBuildPlayersData($players, $symbols, $winner)
{
    $results = [];
    foreach ($players as $pid) {
        $sym = $symbols[$pid] ?? null;
        $rank = 2;
        $score = 0;
        if ($winner === 'draw') {
            $rank = 2;
            $score = 1;
        } elseif ($winner === $sym) {
            $rank = 1;
        }
        $results[] = [
            'user_id' => $pid,
            'rank' => $rank,
            'score' => $score
        ];
    }
    return $results;
}

function tttRecordFinalStatsIfNeeded($pdo, $room, &$state, $playersData)
{
    if (!empty($state['stats_recorded']) || empty($playersData)) {
        return;
    }

    require_once __DIR__ . '/../actions/stats.php';

    $startedAt = (int) ($state['started_at'] ?? 0);
    $duration = $startedAt > 0 ? max(0, time() - $startedAt) : 0;
    recordGameStats($pdo, $room, $playersData, $duration);
    $state['stats_recorded'] = true;
}

function checkWinner($board)
{
    $lines = [
        [0, 1, 2],
        [3, 4, 5],
        [6, 7, 8], // Rows
        [0, 3, 6],
        [1, 4, 7],
        [2, 5, 8], // Cols
        [0, 4, 8],
        [2, 4, 6]             // Diagonals
    ];

    foreach ($lines as $line) {
        $a = $line[0];
        $b = $line[1];
        $c = $line[2];
        if ($board[$a] && $board[$a] === $board[$b] && $board[$a] === $board[$c]) {
            return ['symbol' => $board[$a], 'line' => $line];
        }
    }
    return null;
}
