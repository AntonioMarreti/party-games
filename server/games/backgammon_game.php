<?php
// server/games/backgammon_game.php

function getInitialState()
{
    $board = array_fill(0, 24, null);
    $board[23] = ['player' => 'white', 'count' => 15];
    $board[11] = ['player' => 'black', 'count' => 15];

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
        'startingRolls' => ['white' => null, 'black' => null],
        'readyToStart' => ['white' => false, 'black' => false],
        'lastMove' => null,
        'started_at' => null,
        'stats_recorded' => false
    ];
}

function bgGetPlayers($pdo, $roomId)
{
    $stmt = $pdo->prepare("SELECT user_id, is_host FROM room_players WHERE room_id = ? ORDER BY id ASC");
    $stmt->execute([$roomId]);
    return $stmt->fetchAll();
}

function bgGetPlayerColor($pdo, $roomId, $userId)
{
    $players = bgGetPlayers($pdo, $roomId);
    foreach ($players as $idx => $player) {
        if ((int) $player['user_id'] === (int) $userId) {
            return $idx === 0 ? 'white' : 'black';
        }
    }
    return null;
}

function bgProgressFor($player, $index)
{
    if ($player === 'white') {
        return (23 - $index + 24) % 24;
    }
    return (11 - $index + 24) % 24;
}

function bgCanLandOn($state, $player, $targetIndex)
{
    $cell = $state['board'][$targetIndex];
    if (!$cell) {
        return true;
    }
    return ($cell['player'] ?? null) === $player;
}

function bgCanBearOff($state, $player)
{
    $offCount = $player === 'white' ? (int) $state['whiteOff'] : (int) $state['blackOff'];
    $inHome = $offCount;

    for ($i = 0; $i < 24; $i++) {
        $cell = $state['board'][$i];
        if ($cell && ($cell['player'] ?? null) === $player) {
            $progress = bgProgressFor($player, $i);
            if ($progress < 18) {
                return false;
            }
            $inHome += (int) $cell['count'];
        }
    }

    return $inHome === 15;
}

function bgHasCheckerBehind($state, $player, $index)
{
    $progress = bgProgressFor($player, $index);

    for ($i = 0; $i < 24; $i++) {
        $cell = $state['board'][$i] ?? null;
        if ($cell && ($cell['player'] ?? null) === $player) {
            $otherProgress = bgProgressFor($player, $i);
            if ($otherProgress >= 18 && $otherProgress < $progress) {
                return true;
            }
        }
    }

    return false;
}

function bgFindMovesRecursive($state, $player, $fromIndex, $curIndex, $availDice, $usedIdx, &$found)
{
    $canBearOff = bgCanBearOff($state, $player);
    $curProgress = bgProgressFor($player, $curIndex);

    foreach ($availDice as $i => $die) {
        if (in_array($i, $usedIdx, true)) {
            continue;
        }

        $target = ($curIndex - (int) $die + 24) % 24;
        $targetProgress = bgProgressFor($player, $target);

        if ($targetProgress > $curProgress && bgCanLandOn($state, $player, $target)) {
            $newUsed = $usedIdx;
            $newUsed[] = $i;
            $found[(string) $target] = $newUsed;
            bgFindMovesRecursive($state, $player, $fromIndex, $target, $availDice, $newUsed, $found);
        }

        $die = (int) $die;
        if ($canBearOff && $curProgress >= 18 && ($curProgress + $die === 24 || ($curProgress + $die > 24 && !bgHasCheckerBehind($state, $player, $curIndex)))) {
            $newUsed = $usedIdx;
            $newUsed[] = $i;
            $found['off'] = $newUsed;
        }
    }
}

function bgGetLegalMoves($state, $player, $fromIndex)
{
    if (($state['status'] ?? '') !== 'playing' || empty($state['movesLeft'])) {
        return [];
    }

    $cell = $state['board'][$fromIndex] ?? null;
    if (!$cell || ($cell['player'] ?? null) !== $player) {
        return [];
    }

    $headIndex = $player === 'white' ? 23 : 11;
    $headLimit = 1;
    if (!empty($state['isFirstTurn'][$player]) && count($state['dice'] ?? []) === 4 && in_array((int) $state['dice'][0], [3, 4, 6], true)) {
        $headLimit = 2;
    }
    if ($fromIndex === $headIndex && (int) ($state['headMoved'] ?? 0) >= $headLimit) {
        return [];
    }

    $found = [];
    bgFindMovesRecursive($state, $player, $fromIndex, $fromIndex, $state['movesLeft'], [], $found);
    return $found;
}

function bgHasLegalMoves($state, $player)
{
    for ($i = 0; $i < 24; $i++) {
        if (!empty(bgGetLegalMoves($state, $player, $i))) {
            return true;
        }
    }
    return false;
}

function bgAdvanceTurn(&$state)
{
    $current = $state['turn'];
    $state['isFirstTurn'][$current] = false;
    $state['turn'] = $current === 'white' ? 'black' : 'white';
    $state['movesLeft'] = [];
    $state['dice'] = [];
    $state['headMoved'] = 0;
    $state['version'] = (int) $state['version'] + 1;
}

function bgApplyMove(&$state, $player, $fromIndex, $targetIndex)
{
    $legalMoves = bgGetLegalMoves($state, $player, $fromIndex);
    $targetKey = $targetIndex === 'off' ? 'off' : (string) (int) $targetIndex;
    if (!isset($legalMoves[$targetKey])) {
        throw new Exception('Illegal move');
    }

    $diceUsed = $legalMoves[$targetKey];
    $diceValues = array_map(function ($idx) use ($state) {
        return (int) $state['movesLeft'][$idx];
    }, $diceUsed);

    $diceIndices = $diceUsed;
    rsort($diceIndices);
    foreach ($diceIndices as $idx) {
        array_splice($state['movesLeft'], $idx, 1);
    }

    $cell = &$state['board'][$fromIndex];
    $cell['count'] = (int) $cell['count'] - 1;
    if ($cell['count'] <= 0) {
        $state['board'][$fromIndex] = null;
    }

    $headIndex = $player === 'white' ? 23 : 11;
    if ($fromIndex === $headIndex) {
        $state['headMoved'] = (int) $state['headMoved'] + 1;
    }

    if ($targetIndex === 'off') {
        if ($player === 'white') {
            $state['whiteOff'] = (int) $state['whiteOff'] + 1;
            if ((int) $state['whiteOff'] === 15) {
                $state['status'] = 'finished';
                $state['winner'] = 'white';
            }
        } else {
            $state['blackOff'] = (int) $state['blackOff'] + 1;
            if ((int) $state['blackOff'] === 15) {
                $state['status'] = 'finished';
                $state['winner'] = 'black';
            }
        }
    } else {
        $targetIndex = (int) $targetIndex;
        $dest = $state['board'][$targetIndex];
        if (!$dest) {
            $state['board'][$targetIndex] = ['player' => $player, 'count' => 1];
        } else {
            $state['board'][$targetIndex]['count'] = (int) $state['board'][$targetIndex]['count'] + 1;
        }
    }

    $state['lastMove'] = [
        'player' => $player,
        'from' => (int) $fromIndex,
        'to' => $targetIndex === 'off' ? 'off' : (int) $targetIndex,
        'dice' => $diceValues,
        'version' => (int) $state['version'] + 1
    ];
    $state['version'] = (int) $state['version'] + 1;

    if (($state['status'] ?? '') !== 'finished' && (empty($state['movesLeft']) || !bgHasLegalMoves($state, $player))) {
        bgAdvanceTurn($state);
    }
}

function handleGameAction($pdo, $room, $user, $data)
{
    $state = json_decode($room['game_state'] ?? '', true);
    if (!$state) {
        $state = getInitialState();
    }

    $action = $data['type'] ?? $data['game_action'] ?? '';
    $playerColor = bgGetPlayerColor($pdo, $room['id'], $user['id']);

    if (!$playerColor && $action !== 'back_to_lobby') {
        throw new Exception('Player is not part of the game');
    }

    if ($action === 'back_to_lobby') {
        if ($room['is_host']) {
            if (($state['status'] ?? '') === 'finished') {
                bgRecordFinalStatsIfNeeded($pdo, $room, $state);
            }
            $pdo->prepare("UPDATE rooms SET game_type = 'lobby', status = 'waiting', game_state = NULL WHERE id = ?")
                ->execute([$room['id']]);
        }
        return ['status' => 'ok'];
    }

    if ($action === 'start_game' || $action === 'restart_game') {
        if (!$room['is_host']) {
            throw new Exception('Only host can start');
        }
        $state = getInitialState();
        return ['status' => 'ok', 'state' => $state];
    }

    if ($action === 'roll_for_start') {
        if (($state['status'] ?? '') !== 'starting') {
            throw new Exception('Game already started');
        }
        if (!empty($state['startingRolls']['white']) && !empty($state['startingRolls']['black']) &&
            (int) $state['startingRolls']['white'] === (int) $state['startingRolls']['black']) {
            $state['startingRolls'] = ['white' => null, 'black' => null];
            $state['readyToStart'] = ['white' => false, 'black' => false];
        }
        if (!empty($state['startingRolls'][$playerColor])) {
            throw new Exception('Starting roll already made');
        }

        $state['startingRolls'][$playerColor] = random_int(1, 6);
        $state['version'] = (int) $state['version'] + 1;

        if (!empty($state['startingRolls']['white']) && !empty($state['startingRolls']['black'])) {
            if ((int) $state['startingRolls']['white'] === (int) $state['startingRolls']['black']) {
                $state['version'] = (int) $state['version'] + 1;
                $state['readyToStart'] = ['white' => false, 'black' => false];
            } else {
                $state['turn'] = (int) $state['startingRolls']['white'] > (int) $state['startingRolls']['black'] ? 'white' : 'black';
            }
        }

        return ['status' => 'ok', 'state' => $state];
    }

    if ($action === 'acknowledge_start') {
        if (($state['status'] ?? '') !== 'starting') {
            throw new Exception('Game already started');
        }
        if (empty($state['startingRolls']['white']) || empty($state['startingRolls']['black'])) {
            throw new Exception('Starting rolls not finished');
        }
        if ((int) $state['startingRolls']['white'] === (int) $state['startingRolls']['black']) {
            throw new Exception('Need a new starting roll');
        }

        $state['readyToStart'][$playerColor] = true;
        $state['version'] = (int) $state['version'] + 1;

        if (!empty($state['readyToStart']['white']) && !empty($state['readyToStart']['black'])) {
            $state['status'] = 'playing';
            $state['dice'] = [];
            $state['movesLeft'] = [];
            $state['headMoved'] = 0;
            $state['started_at'] = time();
            $state['stats_recorded'] = false;
            $state['turn'] = (int) $state['startingRolls']['white'] > (int) $state['startingRolls']['black'] ? 'white' : 'black';
        }

        return ['status' => 'ok', 'state' => $state];
    }

    if ($action === 'roll_dice') {
        if (($state['status'] ?? '') !== 'playing') {
            throw new Exception('Game is not in playing state');
        }
        if ($state['turn'] !== $playerColor) {
            throw new Exception('Not your turn');
        }
        if (!empty($state['movesLeft'])) {
            throw new Exception('Complete current turn first');
        }

        $d1 = random_int(1, 6);
        $d2 = random_int(1, 6);
        $state['dice'] = $d1 === $d2 ? [$d1, $d1, $d1, $d1] : [$d1, $d2];
        $state['movesLeft'] = $state['dice'];
        $state['headMoved'] = 0;
        $state['version'] = (int) $state['version'] + 1;

        return ['status' => 'ok', 'state' => $state];
    }

    if ($action === 'move_checker') {
        if (($state['status'] ?? '') !== 'playing') {
            throw new Exception('Game is not in playing state');
        }
        if ($state['turn'] !== $playerColor) {
            throw new Exception('Not your turn');
        }

        $fromIndex = isset($data['from']) ? (int) $data['from'] : null;
        $targetIndex = ($data['to'] ?? null) === 'off' ? 'off' : (int) ($data['to'] ?? -1);
        if ($fromIndex === null || ($targetIndex !== 'off' && ($targetIndex < 0 || $targetIndex > 23))) {
            throw new Exception('Invalid move payload');
        }

        bgApplyMove($state, $playerColor, $fromIndex, $targetIndex);
        if (($state['status'] ?? '') === 'finished') {
            bgRecordFinalStatsIfNeeded($pdo, $room, $state);
        }
        return ['status' => 'ok', 'state' => $state];
    }

    if ($action === 'pass_turn') {
        if (($state['status'] ?? '') !== 'playing') {
            throw new Exception('Game is not in playing state');
        }
        if ($state['turn'] !== $playerColor) {
            throw new Exception('Not your turn');
        }
        if (empty($state['movesLeft'])) {
            throw new Exception('No active dice to pass');
        }
        if (bgHasLegalMoves($state, $playerColor)) {
            throw new Exception('Legal moves still available');
        }

        bgAdvanceTurn($state);
        return ['status' => 'ok', 'state' => $state];
    }

    return ['status' => 'error', 'message' => 'Unknown action'];
}

function bgRecordFinalStatsIfNeeded($pdo, $room, &$state)
{
    if (!empty($state['stats_recorded']) || ($state['status'] ?? '') !== 'finished') {
        return;
    }

    $players = bgGetPlayers($pdo, $room['id']);
    if (empty($players)) {
        return;
    }

    $winner = $state['winner'] ?? null;
    $playersData = [];
    foreach ($players as $index => $player) {
        $color = $index === 0 ? 'white' : 'black';
        $isWinner = $winner === $color;
        $offCount = $color === 'white' ? (int) ($state['whiteOff'] ?? 0) : (int) ($state['blackOff'] ?? 0);
        $playersData[] = [
            'user_id' => (int) $player['user_id'],
            'rank' => $isWinner ? 1 : 2,
            'score' => $offCount,
        ];
    }

    require_once __DIR__ . '/../actions/stats.php';

    $startedAt = (int) ($state['started_at'] ?? 0);
    $duration = $startedAt > 0 ? max(0, time() - $startedAt) : 0;
    recordGameStats($pdo, $room, $playersData, $duration);
    $state['stats_recorded'] = true;
}
