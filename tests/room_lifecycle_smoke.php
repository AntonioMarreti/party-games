<?php

require_once __DIR__ . '/../server/lib/TelegramLogger.php';
require_once __DIR__ . '/../server/lib/room_lifecycle.php';

class RoomLifecycleSmokeStmt
{
    private RoomLifecycleSmokePdo $pdo;
    private string $sql;
    private array $result = [];

    public function __construct(RoomLifecycleSmokePdo $pdo, string $sql)
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

class RoomLifecycleSmokePdo
{
    public array $rooms;
    public array $roomPlayers;
    public array $users;
    public array $publicRooms;
    public int $nextRoomPlayerId = 1000;

    public function __construct(array $rooms, array $roomPlayers, array $users, array $publicRooms = [])
    {
        $this->rooms = $rooms;
        $this->roomPlayers = $roomPlayers;
        $this->users = $users;
        $this->publicRooms = $publicRooms;
    }

    public function prepare(string $sql): RoomLifecycleSmokeStmt
    {
        return new RoomLifecycleSmokeStmt($this, $sql);
    }

    public function beginTransaction(): void
    {
    }

    public function commit(): void
    {
    }

    public function rollBack(): void
    {
    }

    public function executeSql(string $sql, array $params): array
    {
        if (str_contains($sql, 'SELECT id FROM users WHERE id = ? FOR UPDATE')) {
            $userId = (int) $params[0];
            return isset($this->users[$userId]) ? [['id' => $userId]] : [];
        }

        if (str_contains($sql, 'SELECT * FROM rooms WHERE room_code = ? FOR UPDATE')) {
            $roomCode = (string) $params[0];
            foreach ($this->rooms as $room) {
                if (($room['room_code'] ?? null) === $roomCode) {
                    return [$room];
                }
            }
            return [];
        }

        if (str_contains($sql, 'SELECT rp.room_id, rp.is_host FROM room_players rp WHERE rp.user_id = ?')) {
            $userId = (int) $params[0];
            $rows = array_values(array_filter($this->roomPlayers, static fn($rp) => (int) $rp['user_id'] === $userId));
            usort($rows, static fn($a, $b) => ($a['id'] ?? 0) <=> ($b['id'] ?? 0));
            return array_map(static fn($rp) => ['room_id' => $rp['room_id'], 'is_host' => $rp['is_host']], $rows);
        }

        if (str_contains($sql, 'SELECT room_code, host_user_id, status FROM rooms WHERE id = ?')) {
            $roomId = (int) $params[0];
            return isset($this->rooms[$roomId]) ? [$this->rooms[$roomId]] : [];
        }

        if (str_contains($sql, 'SELECT COUNT(*) FROM room_players WHERE room_id = ? AND is_bot = 1')) {
            $roomId = (int) $params[0];
            $count = count(array_filter($this->roomPlayers, static fn($rp) => (int) $rp['room_id'] === $roomId && (int) $rp['is_bot'] === 1));
            return [[0 => $count]];
        }

        if (str_contains($sql, 'DELETE FROM room_players WHERE room_id = ? AND user_id = ?')) {
            $roomId = (int) $params[0];
            $userId = (int) $params[1];
            $this->roomPlayers = array_values(array_filter(
                $this->roomPlayers,
                static fn($rp) => !((int) $rp['room_id'] === $roomId && (int) $rp['user_id'] === $userId)
            ));
            return [];
        }

        if (str_contains($sql, 'SELECT room_id FROM room_players WHERE user_id = ? ORDER BY id DESC LIMIT 1 FOR UPDATE')) {
            $userId = (int) $params[0];
            $rows = array_values(array_filter($this->roomPlayers, static fn($rp) => (int) $rp['user_id'] === $userId));
            usort($rows, static fn($a, $b) => ($b['id'] ?? 0) <=> ($a['id'] ?? 0));
            if (!$rows) {
                return [];
            }
            return [[0 => $rows[0]['room_id']]];
        }

        if (str_contains($sql, 'COUNT(*) AS total_players')) {
            $roomId = (int) $params[0];
            $players = array_values(array_filter($this->roomPlayers, static fn($rp) => (int) $rp['room_id'] === $roomId));
            $total = count($players);
            $humans = count(array_filter($players, static fn($rp) => (int) $rp['is_bot'] === 0));
            $activeHumans = count(array_filter($players, function ($rp) {
                if ((int) $rp['is_bot'] !== 0) {
                    return false;
                }
                $lastActive = strtotime($rp['last_active'] ?? 'now');
                return $lastActive !== false && $lastActive >= time() - 600;
            }));

            return [[
                'total_players' => $total,
                'human_players' => $humans,
                'active_humans' => $activeHumans,
            ]];
        }

        if (str_contains($sql, 'DELETE FROM public_rooms WHERE room_id = ?')) {
            $roomId = (int) $params[0];
            $this->publicRooms = array_values(array_filter($this->publicRooms, static fn($pr) => (int) $pr['room_id'] !== $roomId));
            return [];
        }

        if (str_contains($sql, 'DELETE FROM room_players WHERE room_id = ?')) {
            $roomId = (int) $params[0];
            $this->roomPlayers = array_values(array_filter($this->roomPlayers, static fn($rp) => (int) $rp['room_id'] !== $roomId));
            return [];
        }

        if (str_contains($sql, 'DELETE FROM rooms WHERE id = ?')) {
            $roomId = (int) $params[0];
            unset($this->rooms[$roomId]);
            return [];
        }

        if (str_contains($sql, 'SELECT rp.user_id FROM room_players rp JOIN users u ON u.id = rp.user_id')) {
            $roomId = (int) $params[0];
            $candidates = array_values(array_filter($this->roomPlayers, function ($rp) use ($roomId) {
                if ((int) $rp['room_id'] !== $roomId || (int) $rp['is_bot'] !== 0) {
                    return false;
                }
                $user = $this->users[(int) $rp['user_id']] ?? null;
                if (!$user || (int) ($user['is_bot'] ?? 0) !== 0) {
                    return false;
                }
                $lastActive = strtotime($rp['last_active'] ?? 'now');
                return $lastActive !== false && $lastActive >= time() - 600;
            }));
            usort($candidates, static fn($a, $b) => ($a['id'] ?? 0) <=> ($b['id'] ?? 0));
            if (!$candidates) {
                return [];
            }
            return [[0 => $candidates[0]['user_id']]];
        }

        if (str_contains($sql, 'UPDATE room_players SET is_host = 0 WHERE room_id = ?')) {
            $roomId = (int) $params[0];
            foreach ($this->roomPlayers as &$rp) {
                if ((int) $rp['room_id'] === $roomId) {
                    $rp['is_host'] = 0;
                }
            }
            unset($rp);
            return [];
        }

        if (str_contains($sql, 'UPDATE room_players SET is_host = 1 WHERE room_id = ? AND user_id = ?')) {
            $roomId = (int) $params[0];
            $userId = (int) $params[1];
            foreach ($this->roomPlayers as &$rp) {
                if ((int) $rp['room_id'] === $roomId && (int) $rp['user_id'] === $userId) {
                    $rp['is_host'] = 1;
                }
            }
            unset($rp);
            return [];
        }

        if (str_contains($sql, 'UPDATE rooms SET host_user_id = ? WHERE id = ?')) {
            $hostUserId = (int) $params[0];
            $roomId = (int) $params[1];
            if (isset($this->rooms[$roomId])) {
                $this->rooms[$roomId]['host_user_id'] = $hostUserId;
            }
            return [];
        }

        if (str_contains($sql, 'INSERT INTO room_players (room_id, user_id) VALUES (?, ?)')) {
            $this->roomPlayers[] = [
                'id' => $this->nextRoomPlayerId++,
                'room_id' => (int) $params[0],
                'user_id' => (int) $params[1],
                'is_host' => 0,
                'is_bot' => 0,
                'last_active' => date('Y-m-d H:i:s'),
            ];
            return [];
        }

        throw new RuntimeException('Unhandled SQL in smoke test: ' . $sql);
    }
}

function assertTrue($condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

function makePdoForHostTransfer(): RoomLifecycleSmokePdo
{
    $now = date('Y-m-d H:i:s');

    return new RoomLifecycleSmokePdo(
        rooms: [
            10 => ['id' => 10, 'room_code' => 'ROOM10', 'host_user_id' => 1, 'status' => 'waiting'],
        ],
        roomPlayers: [
            ['id' => 1, 'room_id' => 10, 'user_id' => 1, 'is_host' => 1, 'is_bot' => 0, 'last_active' => $now],
            ['id' => 2, 'room_id' => 10, 'user_id' => 2, 'is_host' => 0, 'is_bot' => 0, 'last_active' => $now],
            ['id' => 3, 'room_id' => 10, 'user_id' => 200, 'is_host' => 0, 'is_bot' => 1, 'last_active' => $now],
        ],
        users: [
            1 => ['id' => 1, 'is_bot' => 0],
            2 => ['id' => 2, 'is_bot' => 0],
            200 => ['id' => 200, 'is_bot' => 1],
        ],
        publicRooms: [
            ['room_id' => 10],
        ]
    );
}

function makePdoForLastHumanCleanup(): RoomLifecycleSmokePdo
{
    $now = date('Y-m-d H:i:s');

    return new RoomLifecycleSmokePdo(
        rooms: [
            20 => ['id' => 20, 'room_code' => 'ROOM20', 'host_user_id' => 1, 'status' => 'waiting'],
        ],
        roomPlayers: [
            ['id' => 1, 'room_id' => 20, 'user_id' => 1, 'is_host' => 1, 'is_bot' => 0, 'last_active' => $now],
            ['id' => 2, 'room_id' => 20, 'user_id' => 201, 'is_host' => 0, 'is_bot' => 1, 'last_active' => $now],
        ],
        users: [
            1 => ['id' => 1, 'is_bot' => 0],
            201 => ['id' => 201, 'is_bot' => 1],
        ],
        publicRooms: [
            ['room_id' => 20],
        ]
    );
}

function makePdoForJoinScenarios(): RoomLifecycleSmokePdo
{
    $now = date('Y-m-d H:i:s');
    $fullRoomPlayers = [];
    for ($i = 0; $i < 16; $i++) {
        $fullRoomPlayers[] = [
            'id' => 100 + $i,
            'room_id' => 40,
            'user_id' => 1000 + $i,
            'is_host' => $i === 0 ? 1 : 0,
            'is_bot' => 0,
            'last_active' => $now,
        ];
    }

    return new RoomLifecycleSmokePdo(
        rooms: [
            30 => ['id' => 30, 'room_code' => 'ROOM30', 'host_user_id' => 3, 'status' => 'waiting', 'password' => null],
            31 => ['id' => 31, 'room_code' => 'ROOM31', 'host_user_id' => 4, 'status' => 'waiting', 'password' => null],
            32 => ['id' => 32, 'room_code' => 'ROOM32', 'host_user_id' => 5, 'status' => 'playing', 'password' => null],
            40 => ['id' => 40, 'room_code' => 'ROOM40', 'host_user_id' => 1000, 'status' => 'waiting', 'password' => null],
        ],
        roomPlayers: array_merge([
            ['id' => 10, 'room_id' => 30, 'user_id' => 1, 'is_host' => 0, 'is_bot' => 0, 'last_active' => $now],
            ['id' => 11, 'room_id' => 30, 'user_id' => 3, 'is_host' => 1, 'is_bot' => 0, 'last_active' => $now],
            ['id' => 12, 'room_id' => 31, 'user_id' => 4, 'is_host' => 1, 'is_bot' => 0, 'last_active' => $now],
            ['id' => 13, 'room_id' => 32, 'user_id' => 5, 'is_host' => 1, 'is_bot' => 0, 'last_active' => $now],
        ], $fullRoomPlayers),
        users: [
            1 => ['id' => 1, 'is_bot' => 0],
            2 => ['id' => 2, 'is_bot' => 0],
            3 => ['id' => 3, 'is_bot' => 0],
            4 => ['id' => 4, 'is_bot' => 0],
            5 => ['id' => 5, 'is_bot' => 0],
            1000 => ['id' => 1000, 'is_bot' => 0],
        ] + array_reduce(range(1, 15), function ($acc, $n) {
            $id = 1000 + $n;
            $acc[$id] = ['id' => $id, 'is_bot' => 0];
            return $acc;
        }, [])
    );
}

echo ">>> ROOM LIFECYCLE SMOKE <<<\n";

try {
    $pdo = makePdoForHostTransfer();
    clearUserRooms($pdo, 1);
    assertTrue(isset($pdo->rooms[10]), 'Room should survive when another human remains');
    assertTrue((int) $pdo->rooms[10]['host_user_id'] === 2, 'Host should transfer to next active human');
    $newHostRow = array_values(array_filter($pdo->roomPlayers, static fn($rp) => (int) $rp['room_id'] === 10 && (int) $rp['user_id'] === 2))[0] ?? null;
    assertTrue($newHostRow !== null && (int) $newHostRow['is_host'] === 1, 'Next human membership should become host');
    echo "[+] Host transfer scenario passed\n";

    $pdo = makePdoForLastHumanCleanup();
    clearUserRooms($pdo, 1);
    assertTrue(!isset($pdo->rooms[20]), 'Room should be deleted when last human leaves');
    assertTrue(count($pdo->roomPlayers) === 0, 'All room memberships should be deleted on cleanup');
    assertTrue(count($pdo->publicRooms) === 0, 'Public room listing should be removed on cleanup');
    echo "[+] Last human cleanup scenario passed\n";

    clearUserRooms($pdo, 1);
    assertTrue(!isset($pdo->rooms[20]), 'Repeated leave should remain a noop after cleanup');
    assertTrue(count($pdo->roomPlayers) === 0, 'Repeated leave should not recreate memberships');
    echo "[+] Repeated leave noop scenario passed\n";

    $pdo = makePdoForJoinScenarios();
    $result = performRoomJoin($pdo, ['id' => 1], 'ROOM30');
    assertTrue(($result['lifecycle_action'] ?? null) === 'join_noop', 'Joining same room should be noop');
    $userMemberships = array_values(array_filter($pdo->roomPlayers, static fn($rp) => (int) $rp['user_id'] === 1));
    assertTrue(count($userMemberships) === 1 && (int) $userMemberships[0]['room_id'] === 30, 'Noop join must not duplicate membership');
    echo "[+] Join noop scenario passed\n";

    $pdo = makePdoForJoinScenarios();
    $result = performRoomJoin($pdo, ['id' => 1], 'ROOM31');
    assertTrue(($result['lifecycle_action'] ?? null) === 'joined', 'Joining another waiting room should succeed');
    $userMemberships = array_values(array_filter($pdo->roomPlayers, static fn($rp) => (int) $rp['user_id'] === 1));
    assertTrue(count($userMemberships) === 1 && (int) $userMemberships[0]['room_id'] === 31, 'User should end up in exactly one new room after join transfer');
    echo "[+] Join transfer scenario passed\n";

    $pdo = makePdoForJoinScenarios();
    try {
        performRoomJoin($pdo, ['id' => 2], 'ROOM32');
        throw new RuntimeException('Expected playing-room join to fail');
    } catch (RuntimeException $e) {
        assertTrue($e->getMessage() === 'В эту комнату сейчас нельзя войти', 'Playing-room join should reject with waiting guard');
    }
    echo "[+] Join non-waiting reject scenario passed\n";

    $pdo = makePdoForJoinScenarios();
    try {
        performRoomJoin($pdo, ['id' => 2], 'ROOM40');
        throw new RuntimeException('Expected full-room join to fail');
    } catch (RuntimeException $e) {
        assertTrue($e->getMessage() === 'Комната заполнена', 'Full room join should reject with capacity guard');
    }
    echo "[+] Join full-room reject scenario passed\n";

    echo "PASS\n";
} catch (Throwable $e) {
    fwrite(STDERR, "[!!!] FAIL: " . $e->getMessage() . "\n");
    exit(1);
}
