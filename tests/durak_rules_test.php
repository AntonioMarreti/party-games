<?php

require __DIR__ . '/../server/games/durak.php';

function durakTestAssert($condition, $message)
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

function durakTestState(array $overrides = []): array
{
    $state = [
        'schema_version' => DURAK_SCHEMA_VERSION,
        'rules' => ['allow_throw_in' => true, 'allow_transfer' => false],
        'phase' => 'attack',
        'deck_profile_id' => DURAK_DECK_PROFILE_ID,
        'player_order' => ['1', '2', '3'],
        'in_game_players' => ['1', '2', '3'],
        'finish_order' => [],
        'rematch_requests' => [],
        'stats_recorded' => false,
        'hands' => [
            '1' => ['6S', '7H'],
            '2' => ['7S', '8C'],
            '3' => ['6H', '9D'],
        ],
        'draw_pile' => ['10C'],
        'trump' => ['suit' => 'D', 'card' => '6D'],
        'table' => [],
        'discard' => [],
        'roles' => ['attacker_id' => '1', 'defender_id' => '2'],
        'actor_id' => '1',
        'passed_throwers' => [],
        'defender_mode' => 'defending',
        'attack_limit' => 2,
        'result' => ['loser_id' => null, 'reason' => null],
    ];

    foreach ($overrides as $key => $value) {
        $state[$key] = $value;
    }

    return $state;
}

foreach ([2, 3, 4] as $playerCount) {
    foreach ([DURAK_DECK_PROFILE_ID => 36, DURAK_DECK_PROFILE_52_ID => 52] as $profileId => $deckSize) {
        $players = array_map('strval', range(1, $playerCount));
        $state = durakBuildInitialState($players, $profileId, ['allow_throw_in' => true, 'allow_transfer' => false]);
        $handCount = array_sum(array_map('count', $state['hands']));

        durakTestAssert(count(durakBuildDeck($profileId)) === $deckSize, "{$profileId} deck size");
        durakTestAssert($handCount === $playerCount * DURAK_HAND_SIZE, "{$playerCount} players receive six cards");
        durakTestAssert(count($state['draw_pile']) === $deckSize - $handCount, "{$playerCount}/{$profileId} draw pile size");
        durakTestAssert(in_array($state['trump']['card'], $state['draw_pile'], true), "{$profileId} trump remains at the bottom of the pile");
        durakTestAssert(in_array($state['roles']['attacker_id'], $players, true), "{$playerCount}/{$profileId} attacker is a player");
        durakTestAssert(in_array($state['roles']['defender_id'], $players, true), "{$playerCount}/{$profileId} defender is a player");
        durakTestAssert($state['actor_id'] === $state['roles']['attacker_id'], "{$playerCount}/{$profileId} attacker acts first");
    }
}

foreach ([
    ['allow_throw_in' => true, 'allow_transfer' => false],
    ['allow_throw_in' => true, 'allow_transfer' => true],
    ['allow_throw_in' => false, 'allow_transfer' => false],
    ['allow_throw_in' => false, 'allow_transfer' => true],
] as $rules) {
    $state = durakBuildInitialState(['1', '2', '3'], DURAK_DECK_PROFILE_ID, $rules);
    durakTestAssert($state['rules'] === $rules, 'Configured rules persist in the match state');
}

$state = durakTestState();
$result = durakHandleAttackCard($state, '1', '6S');
durakTestAssert($result['status'] === 'ok', 'Valid attack is accepted');
durakTestAssert($result['state']['phase'] === 'defense' && $result['state']['actor_id'] === '2', 'Valid attack passes control to defender');

$state = durakTestState();
durakTestAssert(durakHandleAttackCard($state, '2', '8C')['status'] === 'error', 'Wrong player cannot attack');
durakTestAssert(durakHandleAttackCard($state, '1', 'AS')['status'] === 'error', 'Card outside hand cannot attack');

$state = durakTestState(['hands' => ['1' => ['6S'], '2' => ['7S'], '3' => ['6H', '9D']], 'draw_pile' => []]);
$state = durakHandleAttackCard($state, '1', '6S')['state'];
$result = durakHandleDefendCard($state, '2', '6S', '7S');
durakTestAssert($result['status'] === 'ok', 'Valid defense is accepted');
durakTestAssert($result['state']['phase'] === 'attack' && $result['state']['actor_id'] === '3', 'Third player receives the next throw-in turn');

$state = durakTestState([
    'hands' => ['1' => ['6S'], '2' => ['7S'], '3' => ['6H', '9D']],
    'draw_pile' => [],
    'table' => [['attack' => '6S', 'defend' => '7S']],
    'phase' => 'attack',
    'actor_id' => '3',
    'attack_limit' => 2,
]);
$result = durakHandleAttackCard($state, '3', '6H');
durakTestAssert($result['status'] === 'ok', 'Matching rank can be thrown in');
$state = $result['state'];
durakTestAssert(durakHandlePassThrowIn($state, '2')['status'] === 'error', 'Defender cannot pass as a thrower');

$state = durakTestState([
    'hands' => ['1' => [], '2' => [], '3' => ['9D']],
    'draw_pile' => [],
    'table' => [['attack' => '6S', 'defend' => '7S']],
    'phase' => 'attack',
    'actor_id' => '3',
    'attack_limit' => 2,
]);
$result = durakHandlePassThrowIn($state, '3');
durakTestAssert($result['status'] === 'ok', 'Pass is accepted after covered attacks');
durakTestAssert($result['state']['phase'] === 'finished', 'Last player with cards finishes the game');
durakTestAssert($result['state']['result']['loser_id'] === '3', 'Last player is the loser');
durakTestAssert($result['state']['finish_order'] === ['1', '2'], 'Finish order is preserved');

$state = durakTestState([
    'hands' => ['1' => ['6S'], '2' => ['6H'], '3' => ['8C', '9D']],
    'draw_pile' => [],
    'table' => [['attack' => '6S', 'defend' => null]],
    'phase' => 'defense',
    'actor_id' => '2',
    'rules' => ['allow_throw_in' => true, 'allow_transfer' => true],
    'attack_limit' => 2,
]);
$result = durakHandleTransferCard($state, '2', '6H');
durakTestAssert($result['status'] === 'ok', 'Valid transfer is accepted');
durakTestAssert($result['state']['roles'] === ['attacker_id' => '2', 'defender_id' => '3'], 'Transfer moves defense to the next player');
durakTestAssert(durakHandleTransferCard($result['state'], '3', '8C')['status'] === 'error', 'Transfer is not available after the new defense turn starts');

$state = durakTestState([
    'hands' => ['1' => ['6H'], '2' => ['8C'], '3' => ['9D']],
    'draw_pile' => ['10S'],
    'table' => [['attack' => '6S', 'defend' => null]],
    'phase' => 'defense',
    'actor_id' => '2',
]);
$result = durakHandleTakeCards($state, '2');
durakTestAssert($result['status'] === 'ok' && $result['state']['defender_mode'] === 'taking', 'Defender can take cards');
durakTestAssert($result['state']['phase'] === 'attack' && $result['state']['actor_id'] === '1', 'Taking opens the throw-in phase');

$finishedState = durakTestState([
    'player_order' => ['10', '20', '30', '40'],
    'finish_order' => ['30', '10', '20'],
    'result' => ['loser_id' => '40', 'reason' => 'last_player_with_cards'],
    'phase' => 'finished',
]);
$resultPlayers = durakBuildResultPlayersData($finishedState);
durakTestAssert(array_column($resultPlayers, 'user_id') === [30, 10, 20, 40], 'Server result order follows finish order and loser');
durakTestAssert(array_column($resultPlayers, 'rank') === [1, 2, 3, 4], 'Server ranks are deterministic');

$allFinishedState = durakTestState([
    'player_order' => ['10', '20', '30'],
    'finish_order' => ['20', '10', '30'],
    'result' => ['loser_id' => null, 'reason' => 'all_finished'],
    'phase' => 'finished',
]);
durakTestAssert(array_column(durakBuildResultPlayersData($allFinishedState), 'user_id') === [20, 10, 30], 'All-finished result still has an ordered ranking');

$projectionState = durakBuildInitialState(['1', '2', '3', '4'], DURAK_DECK_PROFILE_52_ID);
$projection = durakBuildPlayerProjection($projectionState, '1');
durakTestAssert(isset($projectionState['hands'], $projectionState['draw_pile']), 'Stored state keeps private card data');
durakTestAssert(isset($projection['my_hand'], $projection['opponent_hands'], $projection['draw_count']), 'Projection keeps viewer data and public counts');
durakTestAssert(!isset($projection['hands'], $projection['draw_pile']), 'Projection does not expose private card arrays');
durakTestAssert(count($projection['opponent_hands']) === 3, 'Projection includes all opponents by count');

$rematchState = durakBuildInitialState(['1', '2', '3'], DURAK_DECK_PROFILE_52_ID, ['allow_throw_in' => true, 'allow_transfer' => true]);
durakTestAssert($rematchState['finish_order'] === [] && $rematchState['rematch_requests'] === [], 'New match resets finish and rematch state');
durakTestAssert($rematchState['stats_recorded'] === false, 'New match resets the stats marker');

echo "Durak rules tests passed\n";
