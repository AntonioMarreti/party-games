<?php
// server/games/minesweeper_br.php

function getInitialState()
{
    return [
        'status' => 'setup', // setup, playing, finished
        'grid' => null,      // Will be initialized on first move
        'boardSize' => [10, 10], // rows, cols
        'mineCount' => 12,
        'revealed' => [],    // index -> user_id
        'flags' => [],       // index -> user_id
        'scores' => [],      // user_id -> int
        'playersInfo' => [], // user_id -> { name, avatar }
        'stunned' => [],     // user_id -> int (remaining turns to skip)
        'difficulty' => 'medium', // easy, medium, hard
        'turnOrder' => [],
        'currentTurnIndex' => 0,
        'safeCellsRemaining' => 0,
        'history' => []
    ];
}

function handleGameAction($pdo, $room, $user, $data)
{
    $state = json_decode($room['game_state'], true);
    if (!$state)
        $state = getInitialState();

    $action = $data['type'] ?? $data['game_action'] ?? '';

    // Global action: back_to_lobby works from any state
    if ($action === 'back_to_lobby') {
        if ($room['is_host']) {
            $pdo->prepare("UPDATE rooms SET game_type = 'lobby', status = 'waiting', game_state = NULL WHERE id = ?")
                ->execute([$room['id']]);
        }
        return ['status' => 'ok'];
    }

    if ($state['status'] === 'setup') {
        if ($action === 'set_difficulty') {
            if (!$room['is_host'])
                throw new Exception("Only host can change difficulty");
            $diff = $data['difficulty'] ?? 'medium';
            if (!in_array($diff, ['easy', 'medium', 'hard']))
                $diff = 'medium';
            $state['difficulty'] = $diff;
            updateGameState($room['id'], $state);
            return ['status' => 'ok', 'state' => $state];
        }

        if ($action === 'start_game') {
            if (!$room['is_host'])
                throw new Exception("Only host can start");

            // Re-fetch players to set turn order
            $stmt = $pdo->prepare("SELECT user_id FROM room_players WHERE room_id = ? ORDER BY id ASC");
            $stmt->execute([$room['id']]);
            $uids = $stmt->fetchAll(PDO::FETCH_COLUMN);

            $state['turnOrder'] = $uids;
            $state['status'] = 'playing';
            $state['currentTurnIndex'] = 0;
            $state['scores'] = array_fill_keys($uids, 0);
            $state['stunned'] = array_fill_keys($uids, 0);

            // Board settings based on difficulty
            $rows = 9;
            $cols = 9;
            $mines = 14; // Medium
            if ($state['difficulty'] === 'easy') {
                $rows = 8;
                $cols = 8;
                $mines = 10;
            }
            if ($state['difficulty'] === 'hard') {
                $rows = 10;
                $cols = 12;
                $mines = 22;
            }

            $state['boardSize'] = [$rows, $cols];
            $state['mineCount'] = $mines;
            $state['safeCellsRemaining'] = ($rows * $cols) - $mines;

            updateGameState($room['id'], $state);
            return ['status' => 'ok', 'state' => $state];
        }
        return ['status' => 'ok', 'state' => $state];
    }

    // --- PLAYING PHASE ---
    $currentUid = $state['turnOrder'][$state['currentTurnIndex']];
    if ((string) $currentUid !== (string) $user['id']) {
        throw new Exception("Not your turn");
    }

    if ($action === 'reveal_cell') {
        $idx = (int) $data['index'];
        if (isset($state['revealed'][$idx]))
            return ['status' => 'ok']; // Already revealed

        // 1. Initial Generation if needed
        if ($state['grid'] === null) {
            $state['grid'] = generateSafeBoard($state['boardSize'], $state['mineCount'], $idx);
        }

        // 2. Perform Reveal
        $cellValue = $state['grid'][$idx];
        if ($cellValue === -1) {
            $state['revealed'][$idx] = $user['id'];
            $state['scores'][$user['id']] = max(0, ($state['scores'][$user['id']] ?? 0) - 50);
            $state['stunned'][$user['id']] = 1; // Stun for 1 turn
            advanceTurn($state);
        } else {
            $before = $state['safeCellsRemaining'];
            revealRecursively($state, $idx, $user['id']);
            $opened = $before - $state['safeCellsRemaining'];
            if ($opened > 0) {
                $state['scores'][$user['id']] = ($state['scores'][$user['id']] ?? 0) + ($opened * 10);
            }
            advanceTurn($state);
        }

        checkVictory($pdo, $room['id'], $state);
        updateGameState($room['id'], $state);
        return ['status' => 'ok', 'state' => $state];
    }

    if ($action === 'toggle_flag') {
        $idx = (int) $data['index'];

        if ($state['grid'] === null) {
            return ['status' => 'error', 'message' => 'Первый ход должен быть открытием клетки'];
        }

        if (isset($state['revealed'][$idx]))
            return ['status' => 'ok'];

        if (isset($state['flags'][$idx])) {
            // Removing a flag is free (correction, not a move)
            unset($state['flags'][$idx]);
        } else {
            // Placing a flag costs a turn, but gives no points to prevent "sonar" exploit
            $state['flags'][$idx] = $user['id'];
            advanceTurn($state);
        }

        updateGameState($room['id'], $state);
        return ['status' => 'ok', 'state' => $state];
    }

    if ($action === 'chord') {
        $idx = (int) $data['index'];
        if (!isset($state['revealed'][$idx]))
            throw new Exception("Cell not revealed");
        $val = $state['grid'][$idx];
        if ($val <= 0)
            throw new Exception("Cannot chord here");

        $neighbors = getNeighbors($idx, $state['boardSize'][0], $state['boardSize'][1]);
        $flagCount = 0;
        foreach ($neighbors as $n) {
            if (isset($state['flags'][$n]))
                $flagCount++;
        }

        if ($flagCount === $val) {
            $before = $state['safeCellsRemaining'];
            $hitMine = false;
            foreach ($neighbors as $n) {
                if (!isset($state['revealed'][$n]) && !isset($state['flags'][$n])) {
                    if ($state['grid'][$n] === -1) {
                        $state['revealed'][$n] = $user['id'];
                        $state['scores'][$user['id']] = max(0, ($state['scores'][$user['id']] ?? 0) - 50);
                        $state['stunned'][$user['id']] = 1;
                        $hitMine = true;
                    } else {
                        revealRecursively($state, $n, $user['id']);
                    }
                }
            }

            $opened = $before - $state['safeCellsRemaining'];
            if ($opened > 0 && !$hitMine)
                $state['scores'][$user['id']] = ($state['scores'][$user['id']] ?? 0) + ($opened * 10);

            advanceTurn($state);
        }

        checkVictory($pdo, $room['id'], $state);
        updateGameState($room['id'], $state);
        return ['status' => 'ok', 'state' => $state];
    }

    return ['status' => 'error', 'message' => 'Unknown action'];
}

function generateSafeBoard($size, $mineCount, $firstClickIdx)
{
    list($rows, $cols) = $size;
    $totalCells = $rows * $cols;

    // Simple logic: keep trying until board is solvable and first click is 0.
    for ($attempt = 0; $attempt < 50; $attempt++) {
        $grid = array_fill(0, $totalCells, 0);
        $minesPlaced = 0;

        // Define safety zone (3x3 around first click)
        $safety = getNeighbors($firstClickIdx, $rows, $cols);
        $safety[] = $firstClickIdx;

        while ($minesPlaced < $mineCount) {
            $r = rand(0, $totalCells - 1);
            if ($grid[$r] !== -1 && !in_array($r, $safety)) {
                $grid[$r] = -1;
                $minesPlaced++;
            }
        }

        // Calculate neighbors
        for ($i = 0; $i < $totalCells; $i++) {
            if ($grid[$i] === -1)
                continue;
            $count = 0;
            foreach (getNeighbors($i, $rows, $cols) as $n) {
                if ($grid[$n] === -1)
                    $count++;
            }
            $grid[$i] = $count;
        }

        // NO-GUESS SOLVER CHECK
        if (isSolvable($grid, $size, $firstClickIdx)) {
            return $grid;
        }
    }

    return $grid; // Fallback
}

function isSolvable($grid, $size, $startIdx)
{
    list($rows, $cols) = $size;
    $revealed = [];
    $flags = [];
    $safeToOpen = [$startIdx];

    while (!empty($safeToOpen)) {
        while (!empty($safeToOpen)) {
            $curr = array_pop($safeToOpen);
            if (isset($revealed[$curr]))
                continue;
            $revealed[$curr] = true;
            if ($grid[$curr] === 0) {
                foreach (getNeighbors($curr, $rows, $cols) as $n) {
                    if (!isset($revealed[$n]))
                        $safeToOpen[] = $n;
                }
            }
        }

        // Deduction
        $progress = false;
        foreach (array_keys($revealed) as $idx) {
            $val = $grid[$idx];
            if ($val <= 0)
                continue;

            $neighbors = getNeighbors($idx, $rows, $cols);
            $unrev = array_filter($neighbors, function ($n) use (&$revealed) {
                return !isset($revealed[$n]);
            });
            $f = array_filter($neighbors, function ($n) use (&$flags) {
                return isset($flags[$n]);
            });

            if (count($unrev) === $val) {
                foreach ($unrev as $u) {
                    if (!isset($flags[$u])) {
                        $flags[$u] = true;
                        $progress = true;
                    }
                }
            }

            if (count($f) === $val) {
                foreach ($unrev as $u) {
                    if (!isset($flags[$u]) && !isset($revealed[$u])) {
                        $safeToOpen[] = $u;
                        $progress = true;
                    }
                }
            }
        }
        if (!$progress)
            break;
    }

    $safeCount = 0;
    foreach ($grid as $v)
        if ($v !== -1)
            $safeCount++;
    return count($revealed) === $safeCount;
}

function getNeighbors($idx, $rows, $cols)
{
    $r = floor($idx / $cols);
    $c = $idx % $cols;
    $res = [];
    for ($dr = -1; $dr <= 1; $dr++) {
        for ($dc = -1; $dc <= 1; $dc++) {
            if ($dr === 0 && $dc === 0)
                continue;
            $nr = $r + $dr;
            $nc = $c + $dc;
            if ($nr >= 0 && $nr < $rows && $nc >= 0 && $nc < $cols) {
                $res[] = $nr * $cols + $nc;
            }
        }
    }
    return $res;
}

function revealRecursively(&$state, $idx, $uid)
{
    if (isset($state['revealed'][$idx]))
        return;
    if ($state['grid'][$idx] === -1)
        return; // Don't auto-reveal mines in flood fill

    $state['revealed'][$idx] = $uid;
    $state['safeCellsRemaining']--;
    unset($state['flags'][$idx]); // Clear flag if revealed

    if ($state['grid'][$idx] === 0) {
        foreach (getNeighbors($idx, $state['boardSize'][0], $state['boardSize'][1]) as $n) {
            revealRecursively($state, $n, $uid);
        }
    }
}

function advanceTurn(&$state)
{
    $state['currentTurnIndex'] = ($state['currentTurnIndex'] + 1) % count($state['turnOrder']);

    // Check if next player is stunned
    $nextUid = $state['turnOrder'][$state['currentTurnIndex']];
    if (($state['stunned'][$nextUid] ?? 0) > 0) {
        $state['stunned'][$nextUid]--;
        advanceTurn($state); // Skip this turn
    }
}

function checkVictory($pdo, $roomId, &$state)
{
    if ($state['safeCellsRemaining'] <= 0) {
        $state['status'] = 'finished';
        finalizeMinesweeper($pdo, $roomId, $state);
    }
}

function finalizeMinesweeper($pdo, $roomId, &$state)
{
    $scores = $state['scores'];
    arsort($scores);

    $playersData = [];
    $rank = 1;
    $prevScore = null;
    $realRank = 1;

    foreach ($scores as $uid => $score) {
        if ($prevScore !== null && $score < $prevScore) {
            $rank = $realRank;
        }
        $playersData[] = [
            'user_id' => $uid,
            'score' => $score,
            'rank' => $rank
        ];
        $prevScore = $score;
        $realRank++;
    }

    $state['gameResults'] = $playersData;

    // Save Stats
    $statsFile = __DIR__ . '/../actions/stats.php';
    if (file_exists($statsFile)) {
        require_once $statsFile;
        if (function_exists('recordGameStats')) {
            $roomStmt = $pdo->prepare("SELECT * FROM rooms WHERE id = ?");
            $roomStmt->execute([$roomId]);
            $roomInfo = $roomStmt->fetch(PDO::FETCH_ASSOC);
            if ($roomInfo) {
                recordGameStats($pdo, $roomInfo, $playersData, 0);
            }
        }
    }
}
