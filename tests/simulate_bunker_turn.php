<?php
// tests/simulate_bunker_turn.php

if (!defined('BUNKER_PACK')) {
    define('BUNKER_PACK', __DIR__ . '/../server/games/packs/bunker/base.json');
}

require_once __DIR__ . '/../server/games/bunker.php';

final class FakePdoStatement
{
    private array $rows = [];
    private int $fetchIndex = 0;

    public function __construct(private FakePdo $pdo, private string $sql)
    {
    }

    public function execute(array $params = []): bool
    {
        $this->rows = $this->pdo->runQuery($this->sql, $params);
        $this->fetchIndex = 0;
        return true;
    }

    public function fetchAll($mode = null): array
    {
        if ($mode === PDO::FETCH_COLUMN) {
            return array_map(static fn(array $row) => reset($row), $this->rows);
        }
        return $this->rows;
    }

    public function fetchColumn(int $column = 0): mixed
    {
        if (empty($this->rows)) {
            return false;
        }
        $row = $this->rows[0];
        return array_values($row)[$column] ?? false;
    }

    public function fetch($mode = null): array|false
    {
        if (!isset($this->rows[$this->fetchIndex])) {
            return false;
        }
        return $this->rows[$this->fetchIndex++];
    }
}

final class FakePdo
{
    public function __construct(private array $roomPlayers, private array $users)
    {
    }

    public function prepare(string $sql): FakePdoStatement
    {
        return new FakePdoStatement($this, $sql);
    }

    public function runQuery(string $sql, array $params): array
    {
        if (str_contains($sql, 'SELECT user_id FROM room_players WHERE room_id = ?')) {
            $roomId = (string) ($params[0] ?? '');
            $rows = array_filter($this->roomPlayers, static fn(array $row) => (string) $row['room_id'] === $roomId);
            return array_map(static fn(array $row) => ['user_id' => $row['user_id']], array_values($rows));
        }

        if (str_contains($sql, 'SELECT is_bot FROM room_players WHERE room_id = ? AND user_id = ?')) {
            [$roomId, $userId] = $params;
            foreach ($this->roomPlayers as $row) {
                if ((string) $row['room_id'] === (string) $roomId && (string) $row['user_id'] === (string) $userId) {
                    return [['is_bot' => $row['is_bot']]];
                }
            }
            return [];
        }

        if (str_contains($sql, 'SELECT first_name FROM users WHERE id = ?')) {
            $userId = (string) ($params[0] ?? '');
            return isset($this->users[$userId]) ? [['first_name' => $this->users[$userId]['first_name']]] : [];
        }

        return [];
    }
}

$GLOBALS['TEST_BUNKER_STATE'] = null;

function updateGameState($roomId, $state)
{
    $GLOBALS['TEST_BUNKER_STATE'] = $state;
}

function assertTrue(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

$roomId = 'room-test';
$users = [
    '101' => ['id' => '101', 'first_name' => 'HostUser'],
    '102' => ['id' => '102', 'first_name' => 'PlayerTwo'],
    '103' => ['id' => '103', 'first_name' => 'PlayerThree'],
];
$roomPlayers = [
    ['room_id' => $roomId, 'user_id' => '101', 'is_bot' => 0],
    ['room_id' => $roomId, 'user_id' => '102', 'is_bot' => 0],
    ['room_id' => $roomId, 'user_id' => '103', 'is_bot' => 0],
];
$pdo = new FakePdo($roomPlayers, $users);

$state = getInitialState();
$state['turn_queue'] = ['101', '102', '103'];
$state['current_round'] = 1;
$state['phase'] = 'round';
$state['active_player_index'] = 0;
$state['current_player_id'] = '101';
$state['turn_phase'] = 'reveal';
$state['bunker_places'] = 1;
$state['bunker_features'] = [
    ['text' => 'Solar panels'],
    ['text' => 'Water recycler'],
    ['text' => 'Hydroponics'],
    ['text' => 'Air filters'],
    ['text' => 'Workshop'],
];
$state['revealed_features'] = [$state['bunker_features'][0]];
$state['players_cards']['101'] = [
    'professions' => ['text' => 'Doctor', 'revealed' => false, 'tags' => []],
    'health' => ['text' => 'Healthy', 'revealed' => false, 'tags' => []],
    'facts' => ['text' => 'Can fix generators', 'revealed' => false, 'tags' => []],
    'luggage' => ['text' => 'Medical kit', 'revealed' => false, 'tags' => []],
];
$state['players_cards']['102'] = [
    'professions' => ['text' => 'Soldier', 'revealed' => false, 'tags' => []],
    'health' => ['text' => 'Sprained ankle', 'revealed' => false, 'tags' => []],
    'facts' => ['text' => 'Afraid of darkness', 'revealed' => false, 'tags' => []],
    'luggage' => ['text' => 'Rope', 'revealed' => false, 'tags' => []],
];
$state['players_cards']['103'] = [
    'professions' => ['text' => 'Engineer', 'revealed' => false, 'tags' => []],
    'health' => ['text' => 'Healthy', 'revealed' => false, 'tags' => []],
    'facts' => ['text' => 'Knows ventilation', 'revealed' => false, 'tags' => []],
    'luggage' => ['text' => 'Toolbox', 'revealed' => false, 'tags' => []],
];

$room = [
    'id' => $roomId,
    'is_host' => true,
    'game_state' => json_encode($state),
];

echo "=== Bunker turn smoke test ===\n";

try {
    $host = $users['101'];
    $guest = $users['102'];
    $third = $users['103'];

    $result = handleGameAction($pdo, $room, $host, ['type' => 'reveal_card', 'card_type' => 'health']);
    assertTrue(($result['status'] ?? null) === 'error', 'Health before profession should be rejected');

    $result = handleGameAction($pdo, $room, $host, ['type' => 'reveal_card', 'card_type' => 'professions']);
    assertTrue(($result['status'] ?? null) === 'ok', 'Host profession reveal should succeed');
    $state = $GLOBALS['TEST_BUNKER_STATE'];
    assertTrue($state['players_cards']['101']['professions']['revealed'] === true, 'Host profession card should be revealed');
    assertTrue($state['turn_phase'] === 'discussion', 'Turn should switch to discussion after reveal');

    $result = handleGameAction($pdo, ['id' => $roomId, 'is_host' => true, 'game_state' => json_encode($state)], $host, ['type' => 'reveal_card', 'card_type' => 'health']);
    assertTrue(($result['status'] ?? null) === 'error', 'Second reveal in same turn should be rejected');

    $room['game_state'] = json_encode($state);
    $result = handleGameAction($pdo, $room, $host, ['type' => 'end_turn']);
    assertTrue(($result['status'] ?? null) === 'ok', 'Host end_turn should succeed');
    $state = $GLOBALS['TEST_BUNKER_STATE'];
    assertTrue($state['current_player_id'] === '102', 'Turn should pass to second player');
    assertTrue($state['turn_phase'] === 'reveal', 'Second player should start in reveal phase');

    $room['game_state'] = json_encode($state);
    $result = handleGameAction($pdo, $room, $guest, ['type' => 'reveal_card', 'card_type' => 'professions']);
    assertTrue(($result['status'] ?? null) === 'ok', 'Second player reveal should succeed');
    $state = $GLOBALS['TEST_BUNKER_STATE'];

    $room['game_state'] = json_encode($state);
    $result = handleGameAction($pdo, $room, $guest, ['type' => 'end_turn']);
    assertTrue(($result['status'] ?? null) === 'ok', 'Second player end_turn should succeed');
    $state = $GLOBALS['TEST_BUNKER_STATE'];
    assertTrue($state['current_player_id'] === '103', 'Turn should pass to third player');

    $room['game_state'] = json_encode($state);
    $result = handleGameAction($pdo, $room, $third, ['type' => 'reveal_card', 'card_type' => 'professions']);
    assertTrue(($result['status'] ?? null) === 'ok', 'Third player reveal should succeed');
    $state = $GLOBALS['TEST_BUNKER_STATE'];

    $room['game_state'] = json_encode($state);
    $result = handleGameAction($pdo, $room, $third, ['type' => 'end_turn']);
    assertTrue(($result['status'] ?? null) === 'ok', 'Third player end_turn should succeed');
    $state = $GLOBALS['TEST_BUNKER_STATE'];
    assertTrue($state['phase'] === 'vote_query', 'Round should enter optional vote query after last player turn');

    $room['game_state'] = json_encode($state);
    $result = handleGameAction($pdo, $room, $host, ['type' => 'vote_kick', 'target_id' => '102']);
    assertTrue(($result['status'] ?? null) === 'error', 'Kick vote before voting phase should be rejected');

    foreach (['101', '102', '103'] as $voterId) {
        $room['game_state'] = json_encode($state);
        handleGameAction($pdo, $room, $users[$voterId], ['type' => 'vote_query_answer', 'answer' => 'yes']);
        $state = $GLOBALS['TEST_BUNKER_STATE'];
    }
    assertTrue($state['phase'] === 'voting', 'Yes majority should start voting');

    $room['game_state'] = json_encode($state);
    handleGameAction($pdo, $room, $host, ['type' => 'vote_kick', 'target_id' => '102']);
    $state = $GLOBALS['TEST_BUNKER_STATE'];
    $room['game_state'] = json_encode($state);
    $selfVote = handleGameAction($pdo, $room, $guest, ['type' => 'vote_kick', 'target_id' => '102']);
    assertTrue(($selfVote['status'] ?? null) === 'error', 'Self vote should be rejected');
    handleGameAction($pdo, $room, $guest, ['type' => 'vote_kick', 'target_id' => '101']);
    $state = $GLOBALS['TEST_BUNKER_STATE'];
    $room['game_state'] = json_encode($state);
    handleGameAction($pdo, $room, $third, ['type' => 'vote_kick', 'target_id' => '102']);
    $state = $GLOBALS['TEST_BUNKER_STATE'];

    assertTrue(in_array('102', $state['kicked_players'], true), 'Second player should be kicked by majority vote');
    assertTrue($state['phase'] === 'vote_results', 'Game should show vote results when more players than capacity remain');

    echo "PASS\n";
} catch (Throwable $e) {
    fwrite(STDERR, "FAIL: " . $e->getMessage() . "\n");
    exit(1);
}
