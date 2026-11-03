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

foreach (['36' => DURAK_DECK_PROFILE_ID, '52' => DURAK_DECK_PROFILE_52_ID] as $label => $profileId) {
    $players = array_map('strval', range(1, 5));
    $state = durakBuildInitialState($players, $profileId);
    $handCount = array_sum(array_map('count', $state['hands']));

    durakTestAssert($handCount === 5 * DURAK_HAND_SIZE, "Five players receive six cards for {$label}-card deck");
    durakTestAssert(count($state['draw_pile']) === (int) $label - 5 * DURAK_HAND_SIZE, "Five-player {$label}-card draw pile size");
    durakTestAssert(in_array($state['trump']['card'], $state['draw_pile'], true), "Five-player {$label}-card trump remains in pile");
    durakTestAssert(in_array($state['roles']['attacker_id'], $players, true), "Five-player {$label}-card attacker is in roster");
    durakTestAssert(in_array($state['roles']['defender_id'], $players, true), "Five-player {$label}-card defender is in roster");
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
durakTestAssert(array_column($resultPlayers, 'rank') === [1, 1, 1, 4], 'All escaped players win with rank 1 and loser gets last rank');

$allFinishedState = durakTestState([
    'player_order' => ['10', '20', '30'],
    'finish_order' => ['20', '10', '30'],
    'result' => ['loser_id' => null, 'reason' => 'all_finished'],
    'phase' => 'finished',
]);
$allFinishedPlayers = durakBuildResultPlayersData($allFinishedState);
durakTestAssert(array_column($allFinishedPlayers, 'user_id') === [20, 10, 30], 'All-finished result still has an ordered ranking');
durakTestAssert(array_column($allFinishedPlayers, 'rank') === [1, 1, 1], 'All-finished result assigns no false losses');

$projectionState = durakBuildInitialState(['1', '2', '3', '4'], DURAK_DECK_PROFILE_52_ID);
$projection = durakBuildPlayerProjection($projectionState, '1');
durakTestAssert(isset($projectionState['hands'], $projectionState['draw_pile']), 'Stored state keeps private card data');
durakTestAssert(isset($projection['my_hand'], $projection['opponent_hands'], $projection['draw_count']), 'Projection keeps viewer data and public counts');
durakTestAssert(!isset($projection['hands'], $projection['draw_pile']), 'Projection does not expose private card arrays');
durakTestAssert(count($projection['opponent_hands']) === 3, 'Projection includes all opponents by count');

$rematchState = durakBuildInitialState(['1', '2', '3'], DURAK_DECK_PROFILE_52_ID, ['allow_throw_in' => true, 'allow_transfer' => true]);
durakTestAssert($rematchState['finish_order'] === [] && $rematchState['rematch_requests'] === [], 'New match resets finish and rematch state');
durakTestAssert($rematchState['stats_recorded'] === false, 'New match resets the stats marker');

function durakTestExpectRosterError(array $roster, string $message): void
{
    try {
        durakValidateLivePlayerRoster($roster);
    } catch (RuntimeException $error) {
        return;
    }

    throw new RuntimeException($message);
}

$mixedRoster = [
    ['user_id' => 10, 'is_bot' => 0],
    ['user_id' => 200, 'is_bot' => 1, 'bot_difficulty' => 'easy'],
];
durakTestAssert(durakValidateLivePlayerRoster($mixedRoster) === ['10', '200'], 'One human and one bot are valid');
durakTestAssert(durakGetBotDifficultiesFromRoster($mixedRoster) === ['200' => 'easy'], 'Bot difficulty is kept in roster order');

$fourPlayerRoster = [
    ['user_id' => 10, 'is_bot' => 0],
    ['user_id' => 201, 'is_bot' => 1, 'bot_difficulty' => 'easy'],
    ['user_id' => 202, 'is_bot' => 1, 'bot_difficulty' => 'medium'],
    ['user_id' => 203, 'is_bot' => 1, 'bot_difficulty' => 'hard'],
];
durakTestAssert(durakValidateLivePlayerRoster($fourPlayerRoster) === ['10', '201', '202', '203'], 'One human and three bots are valid');
durakTestAssert(durakValidateLivePlayerRoster([
    ['user_id' => 10, 'is_bot' => 0],
    ['user_id' => 11, 'is_bot' => 0],
    ['user_id' => 201, 'is_bot' => 1],
    ['user_id' => 202, 'is_bot' => 1],
]) === ['10', '11', '201', '202'], 'Two humans and two bots are valid');
durakTestExpectRosterError([
    ['user_id' => 201, 'is_bot' => 1],
    ['user_id' => 202, 'is_bot' => 1],
], 'A bot-only Durak roster must be rejected');
durakTestAssert(durakValidateLivePlayerRoster([
    ['user_id' => 10, 'is_bot' => 0],
    ['user_id' => 11, 'is_bot' => 0],
]) === ['10', '11'], 'Two participants are accepted');
durakTestAssert(durakValidateLivePlayerRoster([
    ['user_id' => 10, 'is_bot' => 0],
    ['user_id' => 201, 'is_bot' => 1],
    ['user_id' => 202, 'is_bot' => 1],
    ['user_id' => 203, 'is_bot' => 1],
    ['user_id' => 204, 'is_bot' => 1],
]) === ['10', '201', '202', '203', '204'], 'Five participants are accepted');
durakTestExpectRosterError([
    ['user_id' => 10, 'is_bot' => 0],
], 'One participant must be rejected');
durakTestExpectRosterError([
    ['user_id' => 10, 'is_bot' => 0],
    ['user_id' => 201, 'is_bot' => 1],
    ['user_id' => 202, 'is_bot' => 1],
    ['user_id' => 203, 'is_bot' => 1],
    ['user_id' => 204, 'is_bot' => 1],
    ['user_id' => 205, 'is_bot' => 1],
], 'Six participants must be rejected');

$fiveBotSetup = durakBuildSetupState(
    ['10', '201', '202', '203', '204'],
    ['201' => 'easy', '202' => 'medium', '203' => 'hard', '204' => 'medium']
);
durakTestAssert($fiveBotSetup['player_order'] === ['10', '201', '202', '203', '204'], 'Five-player setup preserves mixed roster order');
durakTestAssert(count($fiveBotSetup['bot_difficulties']) === 4, 'One human and four bots keep all difficulties');
$fiveBotMatch = durakBuildInitialState(
    ['10', '201', '202', '203', '204'],
    DURAK_DECK_PROFILE_ID,
    ['allow_throw_in' => true, 'allow_transfer' => true],
    ['201' => 'easy', '202' => 'medium', '203' => 'hard', '204' => 'medium']
);
durakTestAssert(count($fiveBotMatch['hands']) === 5 && array_sum(array_map('count', $fiveBotMatch['hands'])) === 30, 'One human and four bots can start a five-player match');
durakTestAssert(count(durakBuildInitialState(
    ['10', '11', '12', '201', '202'],
    DURAK_DECK_PROFILE_ID,
    ['allow_throw_in' => true, 'allow_transfer' => false],
    ['201' => 'easy', '202' => 'hard']
)['hands']) === 5, 'Three humans and two bots can start a five-player match');

$fiveRulesState = durakTestState([
    'player_order' => ['1', '2', '3', '4', '5'],
    'in_game_players' => ['1', '2', '3', '4', '5'],
    'hands' => [
        '1' => ['6S'],
        '2' => ['7S', '7H'],
        '3' => ['6H'],
        '4' => ['9D'],
        '5' => ['10C'],
    ],
    'draw_pile' => ['JH', 'QC'],
    'roles' => ['attacker_id' => '1', 'defender_id' => '2'],
    'actor_id' => '1',
    'attack_limit' => 3,
]);
$fiveRulesState = durakHandleAttackCard($fiveRulesState, '1', '6S')['state'];
$fiveRulesState = durakHandleDefendCard($fiveRulesState, '2', '6S', '7S')['state'];
$fiveRulesState = durakHandleAttackCard($fiveRulesState, '3', '6H')['state'];
$fiveRulesState = durakHandleDefendCard($fiveRulesState, '2', '6H', '7H')['state'];
durakTestAssert($fiveRulesState['actor_id'] === '4', 'Five-player throw-in advances to the fourth participant');
$fiveRulesState = durakHandlePassThrowIn($fiveRulesState, '4')['state'];
$fiveRulesState = durakHandlePassThrowIn($fiveRulesState, '5')['state'];
durakTestAssert($fiveRulesState['roles']['attacker_id'] === '4', 'Five-player trick completion skips finished participants');

$fiveTransferState = durakTestState([
    'player_order' => ['1', '2', '3', '4', '5'],
    'in_game_players' => ['1', '2', '3', '4', '5'],
    'rules' => ['allow_throw_in' => true, 'allow_transfer' => true],
    'hands' => [
        '1' => ['8C'],
        '2' => ['6H'],
        '3' => ['9D', '10C'],
        '4' => ['JH'],
        '5' => ['QC'],
    ],
    'table' => [['attack' => '6S', 'defend' => null]],
    'phase' => 'defense',
    'roles' => ['attacker_id' => '1', 'defender_id' => '2'],
    'actor_id' => '2',
]);
$fiveTransferResult = durakHandleTransferCard($fiveTransferState, '2', '6H');
durakTestAssert($fiveTransferResult['status'] === 'ok' && $fiveTransferResult['state']['roles']['defender_id'] === '3', 'Five-player transfer selects the next active defender');

$fiveTakeState = durakTestState([
    'player_order' => ['1', '2', '3', '4', '5'],
    'in_game_players' => ['1', '2', '3', '4', '5'],
    'hands' => [
        '1' => [],
        '2' => ['2D'],
        '3' => ['9D'],
        '4' => ['JH'],
        '5' => ['QC'],
    ],
    'table' => [['attack' => '6S', 'defend' => null]],
    'phase' => 'defense',
    'roles' => ['attacker_id' => '1', 'defender_id' => '2'],
    'actor_id' => '2',
]);
$fiveTakeResult = durakHandleTakeCards($fiveTakeState, '2');
durakTestAssert($fiveTakeResult['status'] === 'ok' && $fiveTakeResult['state']['actor_id'] === '3', 'Five-player take opens throw-in for the next participant');

$fiveRefillState = durakTestState([
    'player_order' => ['1', '2', '3', '4', '5'],
    'in_game_players' => ['1', '2', '3', '4', '5'],
    'hands' => ['1' => ['6C'], '2' => ['7H'], '3' => ['8C'], '4' => ['9D'], '5' => ['10S']],
    'draw_pile' => ['JH', 'QC'],
    'table' => [['attack' => '6S', 'defend' => '7S']],
    'roles' => ['attacker_id' => '1', 'defender_id' => '2'],
    'actor_id' => '3',
    'attack_limit' => 1,
]);
durakCompleteTrick($fiveRefillState, false);
durakTestAssert($fiveRefillState['draw_pile'] === [] && $fiveRefillState['roles']['attacker_id'] === '2', 'Five-player refill follows attacker order and rotates roles');

$fiveFinishState = durakTestState([
    'player_order' => ['1', '2', '3', '4', '5'],
    'finish_order' => ['3', '1', '4', '2'],
    'result' => ['loser_id' => '5', 'reason' => 'last_player_with_cards'],
    'phase' => 'finished',
]);
$fiveResultPlayers = durakBuildResultPlayersData($fiveFinishState);
durakTestAssert(array_column($fiveResultPlayers, 'rank') === [1, 1, 1, 1, 5], 'Five-player result awards rank 1 to all four winners and rank 5 to loser');
durakTestAssert(array_column($fiveResultPlayers, 'user_id') === [3, 1, 4, 2, 5], 'Five-player result preserves finish order and loser');

$fiveBotChainState = durakTestState([
    'player_order' => ['1', '2', '3', '4', '5'],
    'in_game_players' => ['1', '2', '3', '4', '5'],
    'hands' => [
        '1' => ['6S'],
        '2' => ['7S', '7H'],
        '3' => ['6H'],
        '4' => ['9D'],
        '5' => [],
    ],
    'draw_pile' => ['10C'],
    'roles' => ['attacker_id' => '1', 'defender_id' => '2'],
    'actor_id' => '1',
    'attack_limit' => 3,
    'bot_difficulties' => ['2' => 'easy', '3' => 'medium', '5' => 'hard'],
]);
$humanAttack = durakHandleAttackCard($fiveBotChainState, '1', '6S');
$fiveBotChain = durakAdvanceBots(null, [], $humanAttack['state']);
durakTestAssert($fiveBotChain['status'] === 'ok' && $fiveBotChain['state']['actor_id'] === '4', 'Five-player human to bot to bot chain returns to a human');
durakTestAssert(count($fiveBotChain['state']['hands']) === 5, 'Five-player bot chain retains all participant hands');

$fiveProjection = durakBuildPlayerProjection(durakBuildInitialState(['1', '2', '3', '4', '5'], DURAK_DECK_PROFILE_52_ID), '1');
durakTestAssert(count($fiveProjection['opponent_hands']) === 4, 'Five-player projection exposes four opponent counts');
durakTestAssert(!isset($fiveProjection['hands'], $fiveProjection['draw_pile']), 'Five-player projection keeps private cards hidden');

$fiveRematchState = durakBuildInitialState(
    ['10', '201', '202', '203', '204'],
    DURAK_DECK_PROFILE_ID,
    ['allow_throw_in' => true, 'allow_transfer' => true],
    ['201' => 'easy', '202' => 'medium', '203' => 'hard', '204' => 'medium']
);
durakTestAssert(count($fiveRematchState['player_order']) === 5, 'Five-player rematch keeps the roster');
durakTestAssert($fiveRematchState['finish_order'] === [] && $fiveRematchState['stats_recorded'] === false, 'Five-player rematch resets lifecycle markers');

$botAttackState = durakTestState([
    'player_order' => ['1', '2', '3'],
    'in_game_players' => ['1', '2', '3'],
    'actor_id' => '1',
    'bot_difficulties' => ['1' => 'easy'],
]);
$attackActions = durakListLegalBotActions($botAttackState, '1');
durakTestAssert(count($attackActions) >= 1, 'Bot attack actions are available');

$botDefenseState = durakTestState([
    'phase' => 'defense',
    'actor_id' => '2',
    'roles' => ['attacker_id' => '1', 'defender_id' => '2'],
    'hands' => ['1' => ['6C'], '2' => ['7S', 'AD'], '3' => ['8C', '9D']],
    'table' => [['attack' => '6S', 'defend' => null]],
    'trump' => ['suit' => 'D', 'card' => '6D'],
    'bot_difficulties' => ['2' => 'medium'],
]);
$defenseActions = durakListLegalBotActions($botDefenseState, '2');
durakTestAssert(count(array_filter($defenseActions, static fn($action) => $action['type'] === 'defend_card')) === 2, 'Bot defense candidates use the defense handler');
durakTestAssert(count(array_filter($defenseActions, static fn($action) => $action['type'] === 'take_cards')) === 1, 'Bot can take cards');

$botThrowInState = durakTestState([
    'phase' => 'attack',
    'actor_id' => '3',
    'hands' => ['1' => ['8C'], '2' => ['7S'], '3' => ['6H', '9D']],
    'table' => [['attack' => '6S', 'defend' => '7S']],
    'bot_difficulties' => ['3' => 'hard'],
]);
$throwInActions = durakListLegalBotActions($botThrowInState, '3');
durakTestAssert(count(array_filter($throwInActions, static fn($action) => $action['type'] === 'attack_card')) === 1, 'Bot can throw in a matching rank');
durakTestAssert(count(array_filter($throwInActions, static fn($action) => $action['type'] === 'pass_throw_in')) === 1, 'Bot can pass a throw-in');

$botTransferState = durakTestState([
    'phase' => 'defense',
    'actor_id' => '2',
    'rules' => ['allow_throw_in' => true, 'allow_transfer' => true],
    'roles' => ['attacker_id' => '1', 'defender_id' => '2'],
    'hands' => ['1' => ['8C'], '2' => ['6H', '7S'], '3' => ['9D', '10C']],
    'table' => [['attack' => '6S', 'defend' => null]],
    'bot_difficulties' => ['2' => 'hard'],
]);
$transferActions = durakListLegalBotActions($botTransferState, '2');
durakTestAssert(count(array_filter($transferActions, static fn($action) => $action['type'] === 'transfer_card')) === 1, 'Bot can transfer an attack');

foreach (['easy', 'medium', 'hard'] as $difficulty) {
    $chosenAttack = durakChooseBotAction($botAttackState, '1', $difficulty);
    durakTestAssert(in_array($chosenAttack, $attackActions, true), "{$difficulty} attack choice is legal");
    $chosenDefense = durakChooseBotAction($botDefenseState, '2', $difficulty);
    durakTestAssert(in_array($chosenDefense, $defenseActions, true), "{$difficulty} defense choice is legal");
    $chosenThrowIn = durakChooseBotAction($botThrowInState, '3', $difficulty);
    durakTestAssert(in_array($chosenThrowIn, $throwInActions, true), "{$difficulty} throw-in choice is legal");
    $chosenTransfer = durakChooseBotAction($botTransferState, '2', $difficulty);
    durakTestAssert(in_array($chosenTransfer, $transferActions, true), "{$difficulty} transfer choice is legal");
}

$mediumDefenseChoice = durakChooseBotAction($botDefenseState, '2', 'medium');
durakTestAssert($mediumDefenseChoice['type'] === 'defend_card' && $mediumDefenseChoice['card_id'] === '7S', 'Medium chooses the cheaper non-trump defense');
durakTestAssert(durakChooseBotAction($botDefenseState, '2', 'medium')['card_id'] !== 'AD', 'Medium saves the available trump');
$hardTransferChoice = durakChooseBotAction($botTransferState, '2', 'hard');
$mediumTransferChoice = durakChooseBotAction($botTransferState, '2', 'medium');
durakTestAssert($hardTransferChoice['type'] === 'transfer_card', 'Hard chooses the strategic transfer');
durakTestAssert($mediumTransferChoice['type'] !== 'transfer_card', 'Medium keeps the simpler defense heuristic');

$botStartsState = durakTestState([
    'player_order' => ['1', '2'],
    'in_game_players' => ['1', '2'],
    'hands' => ['1' => ['6S'], '2' => ['7S', '8C']],
    'draw_pile' => ['9D'],
    'roles' => ['attacker_id' => '1', 'defender_id' => '2'],
    'actor_id' => '1',
    'attack_limit' => 2,
    'bot_difficulties' => ['1' => 'easy'],
]);
$advanced = durakAdvanceBots(null, [], $botStartsState);
durakTestAssert($advanced['status'] === 'ok' && $advanced['state']['phase'] === 'defense', 'A bot opening attack advances automatically');
durakTestAssert($advanced['state']['actor_id'] === '2', 'Auto advancement stops at the human defender');

$humanThenBotState = durakTestState([
    'player_order' => ['1', '2', '3'],
    'in_game_players' => ['1', '2', '3'],
    'hands' => ['1' => ['6S', '8C'], '2' => ['7S'], '3' => ['9D']],
    'draw_pile' => ['10C'],
    'roles' => ['attacker_id' => '1', 'defender_id' => '2'],
    'actor_id' => '1',
    'bot_difficulties' => ['2' => 'medium'],
]);
$humanMove = durakHandleAttackCard($humanThenBotState, '1', '6S');
$advanced = durakAdvanceBots(null, [], $humanMove['state']);
durakTestAssert($advanced['status'] === 'ok' && $advanced['state']['actor_id'] === '1', 'Human action advances through a bot defender back to the human');

$severalBotsState = durakTestState([
    'player_order' => ['1', '2', '3'],
    'in_game_players' => ['1', '2', '3'],
    'hands' => ['1' => ['6S'], '2' => ['7S'], '3' => ['8C']],
    'draw_pile' => ['9D'],
    'table' => [],
    'roles' => ['attacker_id' => '1', 'defender_id' => '2'],
    'actor_id' => '1',
    'attack_limit' => 2,
    'bot_difficulties' => ['1' => 'medium', '2' => 'hard'],
]);
$advanced = durakAdvanceBots(null, [], $severalBotsState);
durakTestAssert($advanced['status'] === 'ok' && $advanced['state']['actor_id'] === '3', 'Several consecutive bot turns are drained automatically');

$botFinishState = durakTestState([
    'player_order' => ['1', '2'],
    'in_game_players' => ['1', '2'],
    'hands' => ['1' => ['8H'], '2' => ['9H']],
    'draw_pile' => [],
    'table' => [['attack' => '7S', 'defend' => '8S']],
    'roles' => ['attacker_id' => '1', 'defender_id' => '2'],
    'actor_id' => '1',
    'attack_limit' => 2,
    'bot_difficulties' => ['1' => 'hard', '2' => 'medium'],
]);
$advanced = durakAdvanceBots(null, [], $botFinishState);
durakTestAssert($advanced['status'] === 'ok' && in_array('1', $advanced['state']['finish_order'], true), 'A bot can finish its cards');

$allFinishedBotState = durakTestState([
    'player_order' => ['1', '2', '3'],
    'in_game_players' => ['1', '2', '3'],
    'hands' => ['1' => ['8H'], '2' => ['9H'], '3' => []],
    'draw_pile' => [],
    'table' => [['attack' => '7S', 'defend' => '8S']],
    'roles' => ['attacker_id' => '1', 'defender_id' => '2'],
    'actor_id' => '1',
    'attack_limit' => 2,
    'bot_difficulties' => ['1' => 'hard', '2' => 'medium'],
]);
$advanced = durakAdvanceBots(null, [], $allFinishedBotState);
durakTestAssert($advanced['status'] === 'ok' && $advanced['state']['phase'] === 'finished', 'A bot-only tail can finish the match');

$botProjection = durakBuildPlayerProjection($advanced['state'], '3');
durakTestAssert(isset($advanced['state']['hands'], $advanced['state']['draw_pile']), 'Authoritative state retains bot hands and draw pile');
durakTestAssert(!isset($botProjection['hands'], $botProjection['draw_pile'], $botProjection['bot_difficulties']), 'Human projection does not expose bot internals');
durakTestAssert(isset($botProjection['opponent_hands']) && count($botProjection['opponent_hands']) === 2, 'Human projection exposes only opponent card counts');

// === Stage 1 Regression Tests ===

// 1.1a: Two-player refill order — attacker draws first, defender gets bottom trump last
$twoPlayerRefill = durakTestState([
    'player_order' => ['1', '2'],
    'in_game_players' => ['1', '2'],
    'hands' => ['1' => ['8C', '9C', '10C', 'JC', 'QC'], '2' => ['8H', '9H', '10H', 'JH', 'QH']],
    'draw_pile' => ['KS', '6D'],
    'trump' => ['suit' => 'D', 'card' => '6D'],
    'table' => [['attack' => '6S', 'defend' => '7S']],
    'roles' => ['attacker_id' => '1', 'defender_id' => '2'],
    'trick_attacker_id' => '1',
    'actor_id' => '1',
    'attack_limit' => 6,
]);
durakCompleteTrick($twoPlayerRefill, false);
durakTestAssert(in_array('KS', $twoPlayerRefill['hands']['1'], true), '2p attacker draws top card first');
durakTestAssert(in_array('6D', $twoPlayerRefill['hands']['2'], true), '2p defender draws bottom trump last');

// 1.1b: Three-player refill order — thrower draws BEFORE defender
$threePlayerRefill = durakTestState([
    'player_order' => ['1', '2', '3'],
    'in_game_players' => ['1', '2', '3'],
    'hands' => [
        '1' => ['8C', '9C', '10C', 'JC', 'QC'],
        '2' => ['8H', '9H', '10H', 'JH'],
        '3' => ['8S', '9S', '10S', 'JS', 'QS'],
    ],
    'draw_pile' => ['KC', 'KS', 'AD', '6D'],
    'trump' => ['suit' => 'D', 'card' => '6D'],
    'table' => [['attack' => '6S', 'defend' => '7S'], ['attack' => '6H', 'defend' => '7H']],
    'roles' => ['attacker_id' => '1', 'defender_id' => '2'],
    'trick_attacker_id' => '1',
    'actor_id' => '1',
    'attack_limit' => 6,
]);
durakCompleteTrick($threePlayerRefill, false);
durakTestAssert(in_array('KC', $threePlayerRefill['hands']['1'], true), '3p attacker draws 1st');
durakTestAssert(in_array('KS', $threePlayerRefill['hands']['3'], true), '3p thrower draws 2nd before defender');
durakTestAssert(
    in_array('AD', $threePlayerRefill['hands']['2'], true) && in_array('6D', $threePlayerRefill['hands']['2'], true),
    '3p defender draws strictly last including bottom trump'
);

// 1.1c: Four-player refill order after transfer — trick_attacker_id preserved, final defender draws last
$fourTransferRefill = durakTestState([
    'player_order' => ['1', '2', '3', '4'],
    'in_game_players' => ['1', '2', '3', '4'],
    'rules' => ['allow_throw_in' => true, 'allow_transfer' => true],
    'hands' => [
        '1' => ['6S', '10C', 'JC', 'QC', 'KC', 'AC'],
        '2' => ['6H', '10H', 'JH', 'QH', 'KH', 'AH'],
        '3' => ['7S', '7H', '7D', '10S', 'JS', 'QS'],
        '4' => ['6C', '9C', '9H', '9S', 'JD', 'QD'],
    ],
    'draw_pile' => ['8C', '8H', '8S', '8D', 'KD'],
    'trump' => ['suit' => 'D', 'card' => 'KD'],
    'roles' => ['attacker_id' => '1', 'defender_id' => '2'],
    'actor_id' => '1',
    'attack_limit' => 6,
]);
$fourTransferRefill = durakHandleAttackCard($fourTransferRefill, '1', '6S')['state'];
$fourTransferRefill = durakHandleTransferCard($fourTransferRefill, '2', '6H')['state'];
durakTestAssert($fourTransferRefill['trick_attacker_id'] === '1', 'Transfer preserves original trick_attacker_id');
$fourTransferRefill = durakHandleDefendCard($fourTransferRefill, '3', '6S', '7S')['state'];
$fourTransferRefill = durakHandleDefendCard($fourTransferRefill, '3', '6H', '7H')['state'];
$fourTransferRefill = durakHandlePassThrowIn($fourTransferRefill, '2')['state'];
$fourTransferRefill = durakHandleAttackCard($fourTransferRefill, '4', '6C')['state'];
$fourTransferRefill = durakHandleDefendCard($fourTransferRefill, '3', '6C', '7D')['state'];
durakTestAssert($fourTransferRefill['actor_id'] === '4', 'Player 2 is not asked to pass again when 7D adds no new rank');
$fourTransferRefill = durakHandlePassThrowIn($fourTransferRefill, '4')['state'];
$fourTransferRefill = durakHandlePassThrowIn($fourTransferRefill, '1')['state'];
durakTestAssert(in_array('8C', $fourTransferRefill['hands']['1'], true), '4p transfer refill starts at original trick attacker 1');
durakTestAssert(in_array('8H', $fourTransferRefill['hands']['2'], true), '4p transfer refill serves transferring player 2 second');
durakTestAssert(in_array('8S', $fourTransferRefill['hands']['4'], true), '4p transfer refill serves thrower 4 before defender 3');
durakTestAssert(
    in_array('8D', $fourTransferRefill['hands']['3'], true) && in_array('KD', $fourTransferRefill['hands']['3'], true),
    '4p transfer refill serves final defender 3 strictly last'
);

// 1.1d: Three-player full-circle transfer back to initial attacker (1 -> 2 -> 3 -> 1)
$wrapTransferState = durakTestState([
    'player_order' => ['1', '2', '3'],
    'in_game_players' => ['1', '2', '3'],
    'rules' => ['allow_throw_in' => false, 'allow_transfer' => true],
    'hands' => [
        '1' => ['6S', '7S', '7H', '7C', '10C', 'JC'],
        '2' => ['6H', '10H', 'JH', 'QH', 'KH', 'AH'],
        '3' => ['6C', '10S', 'JS', 'QS', 'KS', 'AS'],
    ],
    'draw_pile' => ['9C', '9H', '9S', '9D', 'QD'],
    'trump' => ['suit' => 'D', 'card' => 'QD'],
    'roles' => ['attacker_id' => '1', 'defender_id' => '2'],
    'actor_id' => '1',
    'attack_limit' => 6,
]);
$wrapTransferState = durakHandleAttackCard($wrapTransferState, '1', '6S')['state'];
$wrapTransferState = durakHandleTransferCard($wrapTransferState, '2', '6H')['state'];
$wrapTransferState = durakHandleTransferCard($wrapTransferState, '3', '6C')['state'];
durakTestAssert($wrapTransferState['roles']['defender_id'] === '1', 'Full-circle transfer makes opener the defender');
$wrapTransferState = durakHandleDefendCard($wrapTransferState, '1', '6S', '7S')['state'];
$wrapTransferState = durakHandleDefendCard($wrapTransferState, '1', '6H', '7H')['state'];
$wrapTransferState = durakHandleDefendCard($wrapTransferState, '1', '6C', '7C')['state'];
durakTestAssert(in_array('9C', $wrapTransferState['hands']['2'], true), 'Wrap transfer refill serves player 2 first');
durakTestAssert(in_array('9H', $wrapTransferState['hands']['3'], true), 'Wrap transfer refill serves player 3 second');
durakTestAssert(in_array('QD', $wrapTransferState['hands']['1'], true), 'Wrap transfer final defender 1 draws last');

// 1.1e: Five-player nearly-empty deck refill order
$fiveNearlyEmpty = durakTestState([
    'player_order' => ['1', '2', '3', '4', '5'],
    'in_game_players' => ['1', '2', '3', '4', '5'],
    'hands' => [
        '1' => ['8C', '9S', '10C', 'JC', 'QC'],
        '2' => ['8H'],
        '3' => ['8S', '10S', 'JS', 'QS', 'KS'],
        '4' => ['9C'],
        '5' => ['9H'],
    ],
    'draw_pile' => ['AC', '6D'],
    'trump' => ['suit' => 'D', 'card' => '6D'],
    'table' => [['attack' => '6S', 'defend' => '7S']],
    'roles' => ['attacker_id' => '1', 'defender_id' => '2'],
    'trick_attacker_id' => '1',
    'actor_id' => '1',
    'attack_limit' => 1,
]);
durakCompleteTrick($fiveNearlyEmpty, false);
durakTestAssert(in_array('AC', $fiveNearlyEmpty['hands']['1'], true), '5p nearly-empty deck gives 1st card to attacker 1');
durakTestAssert(in_array('6D', $fiveNearlyEmpty['hands']['3'], true), '5p nearly-empty deck skips defender 2 and gives 2nd card to player 3');
durakTestAssert(count($fiveNearlyEmpty['hands']['2']) === 1, '5p nearly-empty deck leaves defender 2 without drawing early');

// 1.2a: passed_throwers resets when defense introduces a NEW rank, but stays when rank was already on table
$newRankThrowState = durakTestState([
    'player_order' => ['1', '2', '3'],
    'in_game_players' => ['1', '2', '3'],
    'hands' => [
        '1' => ['6S', '8C', 'KC'],
        '2' => ['7S', '8H', 'QD'],
        '3' => ['7H', 'KS'],
    ],
    'draw_pile' => ['AC'],
    'trump' => ['suit' => 'D', 'card' => '6D'],
    'roles' => ['attacker_id' => '1', 'defender_id' => '2'],
    'actor_id' => '1',
    'attack_limit' => 3,
]);
$newRankThrowState = durakHandleAttackCard($newRankThrowState, '1', '6S')['state'];
$newRankThrowState = durakHandleDefendCard($newRankThrowState, '2', '6S', '7S')['state'];
$newRankThrowState = durakHandlePassThrowIn($newRankThrowState, '1')['state'];
durakTestAssert($newRankThrowState['passed_throwers'] === ['1'] && $newRankThrowState['actor_id'] === '3', 'Player 1 pass advances to player 3');
$newRankThrowState = durakHandleAttackCard($newRankThrowState, '3', '7H')['state'];
$newRankThrowState = durakHandleDefendCard($newRankThrowState, '2', '7H', '8H')['state'];
durakTestAssert($newRankThrowState['passed_throwers'] === [] && $newRankThrowState['actor_id'] === '1', 'New defense rank 8 clears passed_throwers and gives player 1 throw-in opportunity');
$rethrowRes = durakHandleAttackCard($newRankThrowState, '1', '8C');
durakTestAssert($rethrowRes['status'] === 'ok', 'Player 1 can throw in matching new rank 8 after earlier pass');

$sameRankDefendState = durakTestState([
    'player_order' => ['1', '2', '3'],
    'in_game_players' => ['1', '2', '3'],
    'hands' => [
        '1' => ['6S', 'KC'],
        '2' => ['7S', '6D', 'QD'],
        '3' => ['6H', '7H', 'KS'],
    ],
    'draw_pile' => ['AC'],
    'trump' => ['suit' => 'D', 'card' => '9D'],
    'roles' => ['attacker_id' => '1', 'defender_id' => '2'],
    'actor_id' => '1',
    'attack_limit' => 3,
]);
$sameRankDefendState = durakHandleAttackCard($sameRankDefendState, '1', '6S')['state'];
$sameRankDefendState = durakHandleDefendCard($sameRankDefendState, '2', '6S', '7S')['state'];
$sameRankDefendState = durakHandlePassThrowIn($sameRankDefendState, '1')['state'];
$sameRankDefendState = durakHandleAttackCard($sameRankDefendState, '3', '6H')['state'];
$sameRankDefendState = durakHandleDefendCard($sameRankDefendState, '2', '6H', '6D')['state'];
durakTestAssert($sameRankDefendState['passed_throwers'] === ['1'] && $sameRankDefendState['actor_id'] === '3', 'Defense with rank 6 already on table preserves passed_throwers and returns turn to player 3');

// 1.2b: Switching to take_cards clears passed_throwers, and current thrower keeps turn for sequential throw-ins
$takeSequentialState = durakTestState([
    'player_order' => ['1', '2', '3'],
    'in_game_players' => ['1', '2', '3'],
    'hands' => [
        '1' => ['6S', '6C', '7C', 'KC'],
        '2' => ['7S', '8C', '9C', '10C'],
        '3' => ['7H', '7D', 'KS'],
    ],
    'draw_pile' => ['AC'],
    'trump' => ['suit' => 'D', 'card' => 'AD'],
    'roles' => ['attacker_id' => '1', 'defender_id' => '2'],
    'actor_id' => '1',
    'attack_limit' => 4,
]);
$takeSequentialState = durakHandleAttackCard($takeSequentialState, '1', '6S')['state'];
$takeSequentialState = durakHandleDefendCard($takeSequentialState, '2', '6S', '7S')['state'];
$takeSequentialState = durakHandlePassThrowIn($takeSequentialState, '1')['state'];
$takeSequentialState = durakHandleAttackCard($takeSequentialState, '3', '7H')['state'];
$takeSequentialState = durakHandleTakeCards($takeSequentialState, '2')['state'];
durakTestAssert(
    $takeSequentialState['passed_throwers'] === [] && $takeSequentialState['actor_id'] === '1',
    'Defender taking cards clears passed_throwers so attacker 1 can throw in'
);
$takeSequentialState = durakHandleAttackCard($takeSequentialState, '1', '6C')['state'];
durakTestAssert($takeSequentialState['actor_id'] === '1', 'Current thrower keeps turn during sequential throw-ins in taking mode');
$takeSequentialState = durakHandleAttackCard($takeSequentialState, '1', '7C')['state'];
durakTestAssert(
    $takeSequentialState['phase'] === 'attack' && $takeSequentialState['table'] === [] && count($takeSequentialState['hands']['2']) === 8,
    'Hitting attack_limit (4 attacks) during sequential throw-in immediately completes the taking trick'
);

// 1.3: Chronological finish_order when deck is empty (independent of room join order)
$chronoFinishState = durakTestState([
    'player_order' => ['10', '20', '30'],
    'in_game_players' => ['10', '20', '30'],
    'hands' => [
        '10' => ['7S'],
        '20' => ['9C', '10C'],
        '30' => ['6S'],
    ],
    'draw_pile' => [],
    'roles' => ['attacker_id' => '30', 'defender_id' => '10'],
    'actor_id' => '30',
    'attack_limit' => 1,
]);
$chronoFinishState = durakHandleAttackCard($chronoFinishState, '30', '6S')['state'];
$chronoFinishState = durakHandleDefendCard($chronoFinishState, '10', '6S', '7S')['state'];
durakTestAssert($chronoFinishState['phase'] === 'finished', 'Game finishes when only player 20 has cards left');
durakTestAssert($chronoFinishState['finish_order'] === ['30', '10'], 'finish_order reflects actual exit order (30 before 10), not join order');
durakTestAssert($chronoFinishState['result']['loser_id'] === '20', 'Player 20 is the sole loser');

// 1.4a: Endgame transfer skips 0-card finished player when deck is empty
$endgameTransferState = durakTestState([
    'player_order' => ['1', '2', '3'],
    'in_game_players' => ['1', '2', '3'],
    'rules' => ['allow_throw_in' => true, 'allow_transfer' => true],
    'hands' => [
        '1' => ['6S'],
        '2' => ['6H', '9D', '10D', 'JD'],
        '3' => ['6C', '8C'],
    ],
    'draw_pile' => [],
    'trump' => ['suit' => 'D', 'card' => 'AD'],
    'roles' => ['attacker_id' => '1', 'defender_id' => '2'],
    'actor_id' => '1',
    'attack_limit' => 4,
]);
$endgameTransferState = durakHandleAttackCard($endgameTransferState, '1', '6S')['state'];
durakTestAssert($endgameTransferState['phase'] === 'defense', 'Emptying hand on opening attack does not prematurely end trick');
$firstEndgameTransfer = durakHandleTransferCard($endgameTransferState, '2', '6H');
durakTestAssert($firstEndgameTransfer['status'] === 'ok', 'First transfer to player 3 (2 cards >= 2 attacks) succeeds');
$endgameTransferState = $firstEndgameTransfer['state'];
$secondEndgameTransfer = durakHandleTransferCard($endgameTransferState, '3', '6C');
durakTestAssert($secondEndgameTransfer['status'] === 'ok', 'Endgame transfer skips 0-card finished player 1 and reaches player 2');
$endgameTransferState = $secondEndgameTransfer['state'];
durakTestAssert($endgameTransferState['roles']['defender_id'] === '2', 'Player 2 becomes defender after skipping finished player 1');

// 1.4b: Transferring with one's very last card keeps current trick alive so new defender can answer open attacks
$lastCardTransferState = durakTestState([
    'player_order' => ['1', '2', '3'],
    'in_game_players' => ['1', '2', '3'],
    'rules' => ['allow_throw_in' => true, 'allow_transfer' => true],
    'hands' => [
        '1' => ['6S'],
        '2' => ['6H'],
        '3' => ['9D', '10D'],
    ],
    'draw_pile' => [],
    'trump' => ['suit' => 'D', 'card' => 'AD'],
    'roles' => ['attacker_id' => '1', 'defender_id' => '2'],
    'actor_id' => '1',
    'attack_limit' => 1,
]);
$lastCardTransferState = durakHandleAttackCard($lastCardTransferState, '1', '6S')['state'];
$lastCardTransferRes = durakHandleTransferCard($lastCardTransferState, '2', '6H');
durakTestAssert($lastCardTransferRes['status'] === 'ok', 'Defender with 1 card can transfer single attack to next player with 2 cards');
$lastCardTransferState = $lastCardTransferRes['state'];
durakTestAssert($lastCardTransferState['phase'] === 'defense' && $lastCardTransferState['actor_id'] === '3', 'Trick stays alive after both player 1 and player 2 shed their last cards');
$lastCardTransferState = durakHandleDefendCard($lastCardTransferState, '3', '6S', '9D')['state'];
$lastCardTransferState = durakHandleDefendCard($lastCardTransferState, '3', '6H', '10D')['state'];
durakTestAssert(
    $lastCardTransferState['phase'] === 'finished' && $lastCardTransferState['result']['reason'] === 'all_finished',
    'Player 3 beating both transferred attacks with last 2 cards finishes match as all_finished'
);
durakTestAssert($lastCardTransferState['finish_order'] === ['1', '2', '3'], 'Chronological finish order 1 -> 2 -> 3 is preserved');

// Two-player endgame: cannot transfer back to opponent who already played their last card with empty deck
$twoPlayerEndTransfer = durakTestState([
    'player_order' => ['1', '2'],
    'in_game_players' => ['1', '2'],
    'rules' => ['allow_throw_in' => true, 'allow_transfer' => true],
    'hands' => ['1' => ['6S'], '2' => ['6H', '9D']],
    'draw_pile' => [],
    'roles' => ['attacker_id' => '1', 'defender_id' => '2'],
    'actor_id' => '1',
    'attack_limit' => 2,
]);
$twoPlayerEndTransfer = durakHandleAttackCard($twoPlayerEndTransfer, '1', '6S')['state'];
durakTestAssert(
    durakHandleTransferCard($twoPlayerEndTransfer, '2', '6H')['status'] === 'error',
    '2p defender cannot transfer to opponent with 0 cards when deck is empty'
);

// Card conservation invariant across full bot-simulated games (36 and 52 cards, 2-5 players)
foreach ([2, 3, 4, 5] as $simPlayersCount) {
    foreach ([DURAK_DECK_PROFILE_ID => 36, DURAK_DECK_PROFILE_52_ID => 52] as $simProfile => $expectedTotal) {
        $simPlayers = array_map('strval', range(1, $simPlayersCount));
        $simBots = array_fill_keys($simPlayers, 'medium');
        $simState = durakBuildInitialState(
            $simPlayers,
            $simProfile,
            ['allow_throw_in' => true, 'allow_transfer' => true],
            $simBots
        );
        $simResult = durakAdvanceBots(null, [], $simState);
        durakTestAssert($simResult['status'] === 'ok', "Full bot simulation completes cleanly ({$simPlayersCount}p / {$simProfile})");
        $finalSimState = $simResult['state'];
        durakTestAssert($finalSimState['phase'] === 'finished', "Simulated match reaches finished phase ({$simPlayersCount}p / {$simProfile})");
        $allCards = array_merge(
            $finalSimState['draw_pile'],
            $finalSimState['discard'],
            durakTableCards($finalSimState),
            ...array_values($finalSimState['hands'])
        );
        durakTestAssert(
            count($allCards) === $expectedTotal && count(array_unique($allCards)) === $expectedTotal,
            "Card conservation holds with {$expectedTotal} unique cards ({$simPlayersCount}p / {$simProfile})"
        );
    }
}

// Stage 3: Russian localization of gameplay errors + public last_bot_actions projection
$localizedErrorState = durakTestState([
    'table' => [['attack' => '6S', 'defend' => null]],
    'phase' => 'attack',
    'actor_id' => '1',
    'hands' => ['1' => ['8H'], '2' => ['9S']],
]);
$mismatchThrowInError = durakHandleAttackCard($localizedErrorState, '1', '8H');
durakTestAssert(
    $mismatchThrowInError['status'] === 'error'
    && preg_match('/[А-Яа-яЁё]/u', $mismatchThrowInError['message']) === 1
    && preg_match('/[A-Za-z]/', $mismatchThrowInError['message']) === 0,
    'Throw-in rank mismatch returns a pure Russian error message'
);
$wrongTurnError = durakHandleDefendCard($localizedErrorState, '2', '6S', '9S');
durakTestAssert(
    $wrongTurnError['status'] === 'error'
    && preg_match('/[А-Яа-яЁё]/u', $wrongTurnError['message']) === 1
    && preg_match('/[A-Za-z]/', $wrongTurnError['message']) === 0,
    'Wrong-phase defense returns a pure Russian error message'
);
$disabledTransferError = durakHandleTransferCard(
    durakTestState([
        'phase' => 'defense',
        'actor_id' => '2',
        'rules' => ['allow_throw_in' => true, 'allow_transfer' => false],
        'table' => [['attack' => '6S', 'defend' => null]],
        'hands' => ['1' => ['8H'], '2' => ['6H']],
    ]),
    '2',
    '6H'
);
durakTestAssert(
    $disabledTransferError['status'] === 'error'
    && preg_match('/[А-Яа-яЁё]/u', $disabledTransferError['message']) === 1
    && preg_match('/[A-Za-z]/', $disabledTransferError['message']) === 0,
    'Disabled transfer returns a pure Russian error message'
);

$botSummaryState = durakTestState([
    'player_order' => ['1', '2'],
    'in_game_players' => ['1', '2'],
    'bot_difficulties' => ['2' => 'medium'],
    'hands' => [
        '1' => ['6S', '10C'],
        '2' => ['8S', 'KH'],
    ],
    'draw_pile' => [],
    'trump' => ['suit' => 'D', 'card' => 'AD'],
    'roles' => ['attacker_id' => '1', 'defender_id' => '2'],
    'actor_id' => '1',
    'attack_limit' => 2,
]);
$botSummaryRes = handleGameAction(
    null,
    ['id' => 1, 'game_state' => json_encode($botSummaryState)],
    ['id' => 1],
    ['type' => 'attack_card', 'card_id' => '6S']
);
durakTestAssert($botSummaryRes['status'] === 'ok', 'Human attack succeeds');
$botSummaryAdvanced = durakAdvanceBots(null, ['id' => 1], $botSummaryRes['state']);
durakTestAssert($botSummaryAdvanced['status'] === 'ok', 'Bot advancement after human attack succeeds');
$projectedBotView = durakBuildPlayerProjection($botSummaryAdvanced['state'], '1');
durakTestAssert(
    count($projectedBotView['last_bot_actions']) === 1
    && $projectedBotView['last_bot_actions'][0]['player_id'] === '2'
    && $projectedBotView['last_bot_actions'][0]['type'] === 'defend_card'
    && $projectedBotView['last_bot_actions'][0]['card_id'] === '8S'
    && $projectedBotView['last_bot_actions'][0]['attack_card_id'] === '6S'
    && !isset($projectedBotView['hands']),
    'last_bot_actions records public bot defense move without exposing hidden hands'
);
$nextHumanPass = handleGameAction(
    null,
    ['id' => 1, 'game_state' => json_encode($botSummaryAdvanced['state'])],
    ['id' => 1],
    ['type' => 'pass_throw_in']
);
$nextBotOpening = durakAdvanceBots(null, ['id' => 1], $nextHumanPass['state']);
$projectedBotOpening = durakBuildPlayerProjection($nextBotOpening['state'], '1');
durakTestAssert(
    count($projectedBotOpening['last_bot_actions']) === 1
    && $projectedBotOpening['last_bot_actions'][0]['player_id'] === '2'
    && $projectedBotOpening['last_bot_actions'][0]['type'] === 'open_attack'
    && $projectedBotOpening['last_bot_actions'][0]['card_id'] === 'KH',
    'Next human action resets previous bot log and records bot open_attack cleanly'
);

echo "Durak rules tests passed\n";
