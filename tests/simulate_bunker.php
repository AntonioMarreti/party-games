<?php
// tests/simulate_bunker.php

if (!defined('BUNKER_PACK')) {
    define('BUNKER_PACK', __DIR__ . '/../server/games/packs/bunker/base.json');
}

require_once __DIR__ . '/bunker_test_support.php';
require_once __DIR__ . '/../server/games/bunker.php';

$GLOBALS['TEST_BUNKER_SIM_STATE'] = null;

function updateGameState($roomId, $state)
{
    $GLOBALS['TEST_BUNKER_SIM_STATE'] = $state;
}

$roomId = 'room-sim';
$users = [];
$roomPlayers = [];
for ($i = 1; $i <= 6; $i++) {
    $userId = (string) (100 + $i);
    $users[$userId] = ['id' => $userId, 'first_name' => 'Player' . $i];
    $roomPlayers[] = ['room_id' => $roomId, 'user_id' => $userId, 'is_bot' => 0];
}

$pdo = new FakePdo($roomPlayers, $users);
$room = [
    'id' => $roomId,
    'is_host' => true,
    'game_state' => json_encode(getInitialState()),
];

echo ">>> STARTING BUNKER SIMULATION <<<\n";

try {
    $host = $users['101'];

    $result = handleGameAction($pdo, $room, $host, ['type' => 'init_bunker']);
    assertTrue(($result['status'] ?? null) === 'ok', 'Init should succeed');
    $state = $GLOBALS['TEST_BUNKER_SIM_STATE'];
    assertTrue(!empty($state['players_cards']), 'Init should distribute cards');
    assertTrue($state['phase'] === 'intro', 'Game should enter intro after init');
    echo "[+] Init ok, bunker places: {$state['bunker_places']}\n";

    $room['game_state'] = json_encode($state);
    $result = handleGameAction($pdo, $room, $host, ['type' => 'finish_intro']);
    assertTrue(($result['status'] ?? null) === 'ok', 'finish_intro should succeed');
    $state = $GLOBALS['TEST_BUNKER_SIM_STATE'];
    assertTrue($state['phase'] === 'round', 'Game should enter first round');
    assertTrue($state['current_round'] === 1, 'First round should start after intro');
    echo "[+] Intro finished, round {$state['current_round']}\n";

    $aliveIds = array_keys($state['players_cards']);
    $turnCount = count($aliveIds);

    for ($i = 0; $i < $turnCount; $i++) {
        $currentId = (string) $state['current_player_id'];
        $cards = $state['players_cards'][$currentId];
        $cardType = empty($cards['professions']['revealed'])
            ? 'professions'
            : array_key_first(array_filter(
                $cards,
                static fn($card) => is_array($card) && array_key_exists('revealed', $card) && !$card['revealed']
            ));
        assertTrue($cardType !== null, "Player {$currentId} should have a card to reveal");

        $room['game_state'] = json_encode($state);
        handleGameAction($pdo, $room, $users[$currentId], ['type' => 'reveal_card', 'card_type' => $cardType]);
        $state = $GLOBALS['TEST_BUNKER_SIM_STATE'];

        $room['game_state'] = json_encode($state);
        handleGameAction($pdo, $room, $users[$currentId], ['type' => 'end_turn']);
        $state = $GLOBALS['TEST_BUNKER_SIM_STATE'];
    }

    assertTrue($state['phase'] === 'vote_query', 'Optional round should ask whether to vote');
    echo "[+] All players completed a turn, vote query started\n";

    $room['game_state'] = json_encode($state);
    foreach (array_keys($users) as $voterId) {
        $voterId = (string) $voterId;
        handleGameAction($pdo, $room, $users[$voterId], ['type' => 'vote_query_answer', 'answer' => 'yes']);
        $state = $GLOBALS['TEST_BUNKER_SIM_STATE'];
        $room['game_state'] = json_encode($state);
    }
    assertTrue($state['phase'] === 'voting', 'Yes majority should start kick voting');

    foreach (array_keys($users) as $voterId) {
        $voterId = (string) $voterId;
        if ($voterId === '106') {
            handleGameAction($pdo, $room, $users[$voterId], ['type' => 'vote_kick', 'target_id' => '105']);
        } else {
            handleGameAction($pdo, $room, $users[$voterId], ['type' => 'vote_kick', 'target_id' => '106']);
        }
        $state = $GLOBALS['TEST_BUNKER_SIM_STATE'];
        $room['game_state'] = json_encode($state);
    }

    assertTrue(in_array('106', $state['kicked_players'], true), 'Expected kicked player 106');
    assertTrue(in_array($state['phase'], ['vote_results', 'outro'], true), 'Vote should produce results or end game');
    echo "[+] Voting resolved, phase: {$state['phase']}\n";
    echo "PASS\n";
} catch (Throwable $e) {
    fwrite(STDERR, "[!!!] FAIL: " . $e->getMessage() . "\n");
    exit(1);
}
