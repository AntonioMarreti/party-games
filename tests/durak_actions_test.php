<?php

require_once __DIR__ . '/../server/lib/TelegramLogger.php';
require_once __DIR__ . '/../server/lib/room_lifecycle.php';

class DurakActionTestError extends Error
{
}

function sendError($message)
{
    throw new DurakActionTestError($message);
}

require_once __DIR__ . '/../server/actions/room.php';
require_once __DIR__ . '/../server/actions/stats.php';

function durakActionAssert($condition, $message)
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

class DurakActionTestStmt
{
    private DurakActionTestPdo $pdo;
    private string $sql;
    private array $result = [];

    public function __construct(DurakActionTestPdo $pdo, string $sql)
    {
        $this->pdo = $pdo;
        $this->sql = trim(preg_replace('/\s+/', ' ', $sql));
    }

    public function execute(array $params = []): bool
    {
        $this->result = $this->pdo->executeSql($this->sql, $params);
        return true;
    }

    public function fetch()
    {
        return $this->result[0] ?? false;
    }

    public function fetchAll($mode = null): array
    {
        if ($mode === PDO::FETCH_COLUMN) {
            return array_map(static function ($row) {
                return is_array($row) ? array_values($row)[0] : $row;
            }, $this->result);
        }

        return $this->result;
    }

    public function fetchColumn(int $column = 0)
    {
        $row = $this->result[0] ?? null;
        if (!is_array($row)) {
            return $row;
        }

        $values = array_values($row);
        return $values[$column] ?? false;
    }
}

class DurakActionTestPdo
{
    public array $room;
    public array $roomPlayers;
    public array $botUsers;
    public int $mutationCount = 0;
    public int $rollbackCount = 0;
    private bool $inTransaction = false;

    public function __construct(array $room, array $roomPlayers, array $botUsers = [101])
    {
        $this->room = $room;
        $this->roomPlayers = $roomPlayers;
        $this->botUsers = $botUsers;
    }

    public function prepare(string $sql): DurakActionTestStmt
    {
        return new DurakActionTestStmt($this, $sql);
    }

    public function beginTransaction(): void
    {
        $this->inTransaction = true;
    }

    public function commit(): void
    {
        $this->inTransaction = false;
    }

    public function rollBack(): void
    {
        $this->inTransaction = false;
        $this->rollbackCount++;
    }

    public function inTransaction(): bool
    {
        return $this->inTransaction;
    }

    public function executeSql(string $sql, array $params): array
    {
        if (str_contains($sql, 'SELECT r.*, rp.is_host')) {
            return [$this->room];
        }

        if (str_contains($sql, 'SELECT COUNT(*) FROM room_players WHERE room_id = ?')) {
            $roomId = (int) $params[0];
            $count = count(array_filter($this->roomPlayers, static fn($player) => (int) $player['room_id'] === $roomId));
            return [[0 => $count]];
        }

        if (str_contains($sql, 'SELECT user_id FROM room_players WHERE room_id = ? AND is_bot = 1')) {
            $roomId = (int) $params[0];
            return array_map(
                static fn($player) => ['user_id' => $player['user_id']],
                array_filter($this->roomPlayers, static fn($player) =>
                    (int) $player['room_id'] === $roomId && (int) $player['is_bot'] === 1
                )
            );
        }

        if (str_contains($sql, 'SELECT id FROM users WHERE telegram_id BETWEEN')) {
            return array_map(static fn($id) => ['id' => $id], $this->botUsers);
        }

        if (str_contains($sql, 'SELECT is_bot FROM room_players WHERE room_id = ? AND user_id = ?')) {
            $roomId = (int) $params[0];
            $userId = (int) $params[1];
            foreach ($this->roomPlayers as $player) {
                if ((int) $player['room_id'] === $roomId && (int) $player['user_id'] === $userId) {
                    return [[0 => (int) $player['is_bot']]];
                }
            }
            return [];
        }

        if (str_contains($sql, 'SELECT is_bot FROM users WHERE id = ?')) {
            $userId = (int) $params[0];
            return in_array($userId, $this->botUsers, true) ? [[0 => 1]] : [[0 => 0]];
        }

        if (str_contains($sql, 'INSERT INTO room_players')) {
            $this->mutationCount++;
            $this->roomPlayers[] = [
                'id' => count($this->roomPlayers) + 100,
                'room_id' => (int) $params[0],
                'user_id' => (int) $params[1],
                'is_bot' => 1,
                'bot_difficulty' => $params[2],
            ];
            return [];
        }

        if (str_contains($sql, 'DELETE FROM room_players WHERE room_id = ? AND user_id = ?')) {
            $this->mutationCount++;
            $roomId = (int) $params[0];
            $userId = (int) $params[1];
            $this->roomPlayers = array_values(array_filter($this->roomPlayers, static fn($player) =>
                !((int) $player['room_id'] === $roomId && (int) $player['user_id'] === $userId)
            ));
            return [];
        }

        return [];
    }
}

function expectDurakActionError(callable $action, string $expectedMessage): void
{
    try {
        $action();
    } catch (DurakActionTestError $e) {
        durakActionAssert($e->getMessage() === $expectedMessage, "Unexpected action error: {$e->getMessage()}");
        return;
    }

    throw new RuntimeException('Expected action to be rejected');
}

$uiSource = file_get_contents(__DIR__ . '/../js/modules/room-manager.js');
durakActionAssert(
    preg_match("/else if \(sgId === 'durak'\) botLimit = 5;/", $uiSource) === 1,
    'Durak should expose a five-player bot limit in the room UI'
);
durakActionAssert(
    preg_match('/players\.length < botLimit/', $uiSource) === 1,
    'Durak bot add slot should disappear at the configured limit'
);

$activePlayers = [
    ['id' => 1, 'room_id' => 10, 'user_id' => 1, 'is_bot' => 0, 'bot_difficulty' => null],
    ['id' => 2, 'room_id' => 10, 'user_id' => 2, 'is_bot' => 1, 'bot_difficulty' => 'easy'],
    ['id' => 3, 'room_id' => 10, 'user_id' => 3, 'is_bot' => 1, 'bot_difficulty' => 'medium'],
    ['id' => 4, 'room_id' => 10, 'user_id' => 4, 'is_bot' => 1, 'bot_difficulty' => 'hard'],
    ['id' => 5, 'room_id' => 10, 'user_id' => 5, 'is_bot' => 1, 'bot_difficulty' => 'easy'],
];
$activeRoom = [
    'id' => 10,
    'room_code' => 'ACTIVE10',
    'host_user_id' => 1,
    'is_host' => 1,
    'game_type' => 'durak',
    'status' => 'playing',
    'game_state' => json_encode([
        'player_order' => [1, 2, 3, 4, 5],
        'actor_id' => 2,
        'defender_id' => 3,
        'players' => [2 => ['is_bot' => true, 'bot_difficulty' => 'easy']],
    ]),
];

foreach ([
    ['action' => 'add', 'target' => [], 'label' => 'add_bot'],
    ['action' => 'remove', 'target' => ['target_id' => 2], 'label' => 'remove_bot'],
    ['action' => 'kick', 'target' => ['target_id' => 2], 'label' => 'kick_player'],
] as $mutation) {
    $pdo = new DurakActionTestPdo($activeRoom, $activePlayers);
    $playersBefore = $pdo->roomPlayers;
    $roomBefore = $pdo->room;
    $user = ['id' => 1];
    $action = $mutation['action'] === 'add' ? 'action_add_bot' : ($mutation['action'] === 'remove' ? 'action_remove_bot' : 'action_kick_player');

    expectDurakActionError(
        static function () use ($action, $pdo, $user, $mutation) {
            $action($pdo, $user, $mutation['target']);
        },
        'Durak roster is frozen while the match is active'
    );
    durakActionAssert($pdo->rollbackCount === 1, "{$mutation['label']} should roll back the rejected mutation");
    durakActionAssert($pdo->mutationCount === 0, "{$mutation['label']} must not mutate room_players");
    durakActionAssert($pdo->roomPlayers === $playersBefore, "{$mutation['label']} changed room_players");
    durakActionAssert($pdo->room === $roomBefore, "{$mutation['label']} changed authoritative room state");
}

$waitingRoom = $activeRoom;
$waitingRoom['status'] = 'waiting';
$waitingPdo = new DurakActionTestPdo($waitingRoom, [$activePlayers[0], $activePlayers[1]], [101]);
ob_start();
action_add_bot($waitingPdo, ['id' => 1], ['difficulty' => 'easy']);
$addResponse = json_decode(ob_get_clean(), true);
durakActionAssert(($addResponse['status'] ?? null) === 'ok', 'Waiting Durak should still allow adding a bot');
durakActionAssert(count($waitingPdo->roomPlayers) === 3, 'Waiting Durak bot add should change the roster');

ob_start();
action_remove_bot($waitingPdo, ['id' => 1], ['target_id' => 2]);
$removeResponse = json_decode(ob_get_clean(), true);
durakActionAssert(($removeResponse['status'] ?? null) === 'ok', 'Waiting Durak should still allow removing a bot');
durakActionAssert(count($waitingPdo->roomPlayers) === 2, 'Waiting Durak bot remove should change the roster');

foreach ([
    ['game_type' => 'durak', 'status' => 'playing', 'state' => ['stats_recorded' => false]],
    ['game_type' => 'durak', 'status' => 'finished', 'state' => ['stats_recorded' => true]],
] as $case) {
    $statsRoom = $activeRoom;
    $statsRoom['game_type'] = $case['game_type'];
    $statsRoom['status'] = $case['status'];
    $statsRoom['game_state'] = json_encode($case['state']);
    $statsPdo = new DurakActionTestPdo($statsRoom, $activePlayers);
    expectDurakActionError(
        static function () use ($statsPdo) {
            action_game_finished($statsPdo, ['id' => 1], [
                'players_data' => [['user_id' => 1, 'rank' => 1]],
                'duration' => 12,
            ]);
        },
        'Durak results are server-authoritative'
    );
    durakActionAssert($statsPdo->rollbackCount === 1, 'Forged Durak results should roll back');
    durakActionAssert($statsPdo->mutationCount === 0, 'Forged Durak results must not write stats or state');
}

$genericRoom = $activeRoom;
$genericRoom['game_type'] = 'partybattle';
$genericRoom['game_state'] = json_encode(['stats_recorded' => true]);
$genericPdo = new DurakActionTestPdo($genericRoom, $activePlayers);
ob_start();
action_game_finished($genericPdo, ['id' => 1], ['players_data' => [['user_id' => 1, 'rank' => 1]]]);
$genericResponse = json_decode(ob_get_clean(), true);
durakActionAssert(($genericResponse['status'] ?? null) === 'ok', 'Non-Durak game_finished must keep its existing path');
durakActionAssert($genericPdo->rollbackCount === 0, 'Non-Durak game_finished should not hit Durak rejection');

echo "Durak action regression tests passed\n";
