<?php

require __DIR__ . '/../server/games/backgammon_game.php';

function bgTestAssert($condition, $message)
{
    if (!$condition) {
        throw new Exception($message);
    }
}

function bgTestState($player = 'white', $dice = [1])
{
    $state = getInitialState();
    $state['status'] = 'playing';
    $state['turn'] = $player;
    $state['board'] = array_fill(0, 24, null);
    $state['dice'] = $dice;
    $state['movesLeft'] = $dice;
    $state['whiteOff'] = 0;
    $state['blackOff'] = 0;
    $state['headMoved'] = 0;
    $state['isFirstTurn'] = ['white' => false, 'black' => false];
    $state['winner'] = null;
    $state['lastMove'] = null;
    return $state;
}

$state = bgTestState('white', [3]);
$state['board'][23] = ['player' => 'white', 'count' => 15];
$state['board'][20] = ['player' => 'black', 'count' => 1];
bgTestAssert(empty(bgGetLegalMoves($state, 'white', 23)), 'Opponent point must block a move');

$state = bgTestState('white', [6, 6, 6, 6]);
$state['isFirstTurn']['white'] = true;
$state['board'][23] = ['player' => 'white', 'count' => 15];
$state['headMoved'] = 1;
bgTestAssert(!empty(bgGetLegalMoves($state, 'white', 23)), 'First 6-6 should allow a second head checker');
$state['headMoved'] = 2;
bgTestAssert(empty(bgGetLegalMoves($state, 'white', 23)), 'First 6-6 should not allow a third head checker');

$state = bgTestState('white', [6]);
$state['board'][2] = ['player' => 'white', 'count' => 14];
$state['board'][5] = ['player' => 'white', 'count' => 1];
bgTestAssert(!isset(bgGetLegalMoves($state, 'white', 2)['off']), 'Higher die bear-off must wait for checkers behind');

$state = bgTestState('white', [6]);
$state['board'][5] = ['player' => 'white', 'count' => 15];
bgTestAssert(isset(bgGetLegalMoves($state, 'white', 5)['off']), 'Exact bear-off should be legal');

$state = bgTestState('white', [2]);
$state['board'][1] = ['player' => 'white', 'count' => 1];
$state['whiteOff'] = 14;
bgApplyMove($state, 'white', 1, 'off');
bgTestAssert($state['status'] === 'finished', 'Bearing off the last checker should finish the game');
bgTestAssert($state['winner'] === 'white', 'White should be the winner after bearing off 15 checkers');
bgTestAssert(($state['lastMove']['to'] ?? null) === 'off', 'Last move should record bear-off target');

echo "Backgammon rules tests passed\n";
