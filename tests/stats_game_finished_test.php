<?php

require_once __DIR__ . '/../server/lib/TelegramLogger.php';
require_once __DIR__ . '/../server/lib/shared_helpers.php';
require_once __DIR__ . '/../server/lib/gamification.php';

class StatsActionTestError extends Error
{
}

if (!function_exists('sendError')) {
    function sendError($message)
    {
        throw new StatsActionTestError($message);
    }
}

require_once __DIR__ . '/../server/actions/stats.php';

function statsAssert($condition, $message)
{
    if (!$condition) {
        throw new RuntimeException("Assertion failed: {$message}");
    }
}

class StatsActionTestStmt
{
    private StatsActionTestPdo $pdo;
    private string $sql;
    private array $result = [];

    public function __construct(StatsActionTestPdo $pdo, string $sql)
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

    public function rowCount(): int
    {
        return count($this->result);
    }
}

class StatsActionTestPdo
{
    public array $room;
    public array $roomPlayers;
    public array $users;
    public array $userStats = [];
    public array $gameHistory = [];
    public array $gameHistoryPlayers = [];
    public int $mutationCount = 0;
    public int $rollbackCount = 0;
    public int $commitCount = 0;
    private bool $inTransaction = false;

    public function __construct(array $room, array $roomPlayers, array $users = [])
    {
        $this->room = $room;
        $this->roomPlayers = array_map(static function ($rp) use ($room) {
            $rp['room_id'] = $room['id'];
            return $rp;
        }, $roomPlayers);
        $this->users = $users;
    }

    public function prepare(string $sql): StatsActionTestStmt
    {
        return new StatsActionTestStmt($this, $sql);
    }

    public function query(string $sql): StatsActionTestStmt
    {
        $stmt = $this->prepare($sql);
        $stmt->execute();
        return $stmt;
    }

    public function beginTransaction(): void
    {
        $this->inTransaction = true;
    }

    public function commit(): void
    {
        $this->inTransaction = false;
        $this->commitCount++;
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

    public function lastInsertId(): int
    {
        return count($this->gameHistory);
    }

    public function executeSql(string $sql, array $params): array
    {
        if (str_contains($sql, 'SELECT * FROM achievements')) {
            return [];
        }

        if (str_contains($sql, 'SELECT achievement_id FROM user_achievements')) {
            return [];
        }

        if (str_contains($sql, 'SELECT r.*, rp.is_host')) {
            $userId = (int) $params[0];
            $match = null;
            foreach ($this->roomPlayers as $rp) {
                if ((int) $rp['user_id'] === $userId && (int) $rp['room_id'] === (int) $this->room['id']) {
                    $match = $rp;
                    break;
                }
            }
            if (!$match) {
                return [];
            }
            $row = $this->room;
            $row['is_host'] = (int) ($match['is_host'] ?? 0);
            return [$row];
        }

        if (str_contains($sql, 'SELECT user_id FROM room_players WHERE room_id = ?')) {
            $roomId = (int) $params[0];
            return array_map(
                static fn($player) => ['user_id' => $player['user_id']],
                array_values(array_filter($this->roomPlayers, static fn($player) => (int) $player['room_id'] === $roomId))
            );
        }

        if (str_contains($sql, 'SHOW COLUMNS FROM')) {
            return [['Field' => 'dummy']];
        }

        if (str_contains($sql, 'SELECT id, COALESCE')) {
            return array_map(static fn($u) => [
                'id' => $u['id'],
                'display_name' => $u['first_name'] ?? ('User ' . $u['id'])
            ], $this->users);
        }

        if (str_contains($sql, 'SELECT * FROM user_statistics WHERE user_id = ?')) {
            $uid = (int) $params[0];
            return isset($this->userStats[$uid]) ? [$this->userStats[$uid]] : [];
        }

        if (str_contains($sql, 'INSERT INTO game_history (')) {
            $this->mutationCount++;
            $this->gameHistory[] = $params;
            return [];
        }

        if (str_contains($sql, 'UPDATE game_history SET')) {
            $this->mutationCount++;
            return [];
        }

        if (str_contains($sql, 'INSERT INTO game_history_players')) {
            $this->mutationCount++;
            $this->gameHistoryPlayers[] = $params;
            return [];
        }

        if (str_contains($sql, 'INSERT IGNORE INTO user_statistics')) {
            $this->mutationCount++;
            $uid = (int) $params[0];
            if (!isset($this->userStats[$uid])) {
                $this->userStats[$uid] = [
                    'user_id' => $uid,
                    'total_wins' => 0,
                    'total_losses' => 0,
                    'win_streak' => 0,
                    'longest_win_streak' => 0,
                    'rating' => 1000,
                    'total_points_earned' => 0,
                    'total_games_played' => 0
                ];
            }
            return [];
        }

        if (str_contains($sql, 'UPDATE user_statistics SET')) {
            $this->mutationCount++;
            $uid = (int) end($params);
            $this->userStats[$uid] = [
                'user_id' => $uid,
                'total_wins' => $params[0],
                'total_losses' => $params[1],
                'win_streak' => $params[2],
                'longest_win_streak' => $params[3],
                'total_points_earned' => $params[4],
                'rating' => $params[5],
                'total_games_played' => ($this->userStats[$uid]['total_games_played'] ?? 0) + 1
            ];
            return [];
        }

        if (str_contains($sql, 'INSERT INTO gamification_events')) {
            $this->mutationCount++;
            return [];
        }

        if (str_contains($sql, 'UPDATE rooms SET game_state = ? WHERE id = ?')) {
            $this->mutationCount++;
            $this->room['game_state'] = $params[0];
            return [];
        }

        return [];
    }
}

function expectStatsError(callable $action, string $expectedMessage): void
{
    try {
        $action();
    } catch (StatsActionTestError $e) {
        statsAssert($e->getMessage() === $expectedMessage, "Expected '{$expectedMessage}', got '{$e->getMessage()}'");
        return;
    }

    throw new RuntimeException("Expected action to fail with '{$expectedMessage}', but no error was thrown");
}

function runStatsAction(StatsActionTestPdo $pdo, array $user, array $data): array
{
    ob_start();
    action_game_finished($pdo, $user, $data);
    $output = ob_get_clean();
    $res = json_decode($output, true);
    statsAssert(is_array($res), "Invalid JSON output from action_game_finished: {$output}");
    return $res;
}

// ==========================================
// Test 1: Запись результатов незапущенной игры отклоняется
// ==========================================
$waitingRoom = [
    'id' => 1,
    'room_code' => 'WAIT01',
    'host_user_id' => 1,
    'game_type' => 'lobby',
    'status' => 'waiting',
    'game_state' => null,
];
$waitingPlayers = [
    ['id' => 1, 'room_id' => 1, 'user_id' => 1, 'is_host' => 1],
    ['id' => 2, 'room_id' => 1, 'user_id' => 2, 'is_host' => 0],
];
$pdo1 = new StatsActionTestPdo($waitingRoom, $waitingPlayers);
expectStatsError(function () use ($pdo1) {
    action_game_finished($pdo1, ['id' => 1], ['players_data' => [['user_id' => 1, 'rank' => 1]]]);
}, 'Game is not active');
statsAssert($pdo1->rollbackCount === 1, 'Test 1: Transaction must roll back on unstarted game');
statsAssert($pdo1->mutationCount === 0, 'Test 1: No mutations on unstarted game');

// ==========================================
// Test 2: Запись результатов незавершённой игры отклоняется
// ==========================================
// 2a. Bunker in round 1
$activeBunkerRoom = [
    'id' => 2,
    'room_code' => 'BUNK02',
    'host_user_id' => 1,
    'game_type' => 'bunker',
    'status' => 'playing',
    'game_state' => json_encode(['phase' => 'round', 'current_round' => 1]),
];
$activeBunkerPlayers = [
    ['id' => 1, 'room_id' => 2, 'user_id' => 1, 'is_host' => 1],
    ['id' => 2, 'room_id' => 2, 'user_id' => 2, 'is_host' => 0],
];
$pdo2a = new StatsActionTestPdo($activeBunkerRoom, $activeBunkerPlayers);
expectStatsError(function () use ($pdo2a) {
    action_game_finished($pdo2a, ['id' => 1], ['players_data' => [['user_id' => 1, 'rank' => 1]]]);
}, 'Game is not finished');
statsAssert($pdo2a->rollbackCount === 1, 'Test 2a: Transaction must roll back on unfinished Bunker game');
statsAssert($pdo2a->mutationCount === 0, 'Test 2a: No mutations on unfinished Bunker game');

// 2b. Spyfall in playing phase
$activeSpyRoom = [
    'id' => 3,
    'room_code' => 'SPY003',
    'host_user_id' => 1,
    'game_type' => 'spyfall',
    'status' => 'playing',
    'game_state' => json_encode(['phase' => 'playing']),
];
$pdo2b = new StatsActionTestPdo($activeSpyRoom, $activeBunkerPlayers);
expectStatsError(function () use ($pdo2b) {
    action_game_finished($pdo2b, ['id' => 1], ['players_data' => [['user_id' => 1, 'rank' => 1]]]);
}, 'Game is not finished');
statsAssert($pdo2b->rollbackCount === 1, 'Test 2b: Unfinished Spyfall game must roll back');

// 2c. Minesweeper in playing status
$activeSweeperRoom = [
    'id' => 4,
    'room_code' => 'MINE04',
    'host_user_id' => 1,
    'game_type' => 'minesweeper_br',
    'status' => 'playing',
    'game_state' => json_encode(['status' => 'playing']),
];
$pdo2c = new StatsActionTestPdo($activeSweeperRoom, $activeBunkerPlayers);
expectStatsError(function () use ($pdo2c) {
    action_game_finished($pdo2c, ['id' => 1], ['players_data' => [['user_id' => 1, 'rank' => 1]]]);
}, 'Game is not finished');
statsAssert($pdo2c->rollbackCount === 1, 'Test 2c: Unfinished Minesweeper must roll back');

// ==========================================
// Test 3: Отсутствующее или некорректное состояние отклоняется
// ==========================================
$invalidStateRoom = [
    'id' => 5,
    'room_code' => 'INV005',
    'host_user_id' => 1,
    'game_type' => 'bunker',
    'status' => 'playing',
    'game_state' => '{not_valid_json',
];
$pdo3 = new StatsActionTestPdo($invalidStateRoom, $activeBunkerPlayers);
expectStatsError(function () use ($pdo3) {
    action_game_finished($pdo3, ['id' => 1], ['players_data' => [['user_id' => 1, 'rank' => 1]]]);
}, 'Game state is missing or invalid');
statsAssert($pdo3->rollbackCount === 1, 'Test 3: Invalid game_state must roll back');

// ==========================================
// Test 4: Попытка изменения статистики постороннего пользователя отклоняется
// ==========================================
$finishedBunkerRoom = [
    'id' => 6,
    'room_code' => 'BUNK06',
    'host_user_id' => 1,
    'game_type' => 'bunker',
    'status' => 'playing',
    'game_state' => json_encode(['phase' => 'outro', 'kicked_players' => [2]]),
];
$room6Players = [
    ['id' => 1, 'room_id' => 6, 'user_id' => 1, 'is_host' => 1],
    ['id' => 2, 'room_id' => 6, 'user_id' => 2, 'is_host' => 0],
];
$pdo4 = new StatsActionTestPdo($finishedBunkerRoom, $room6Players);
expectStatsError(function () use ($pdo4) {
    action_game_finished($pdo4, ['id' => 1], [
        'players_data' => [
            ['user_id' => 1, 'rank' => 1],
            ['user_id' => 999, 'rank' => 2] // 999 is NOT in room 6!
        ]
    ]);
}, 'Player does not belong to this room');
statsAssert($pdo4->rollbackCount === 1, 'Test 4: Outsider player must roll back');
statsAssert($pdo4->mutationCount === 0, 'Test 4: Outsider attempt must not write mutations');

// ==========================================
// Test 5: Попытка отправки дублирующихся user_id отклоняется
// ==========================================
$pdo5 = new StatsActionTestPdo($finishedBunkerRoom, $room6Players);
expectStatsError(function () use ($pdo5) {
    action_game_finished($pdo5, ['id' => 1], [
        'players_data' => [
            ['user_id' => 1, 'rank' => 1],
            ['user_id' => 1, 'rank' => 2] // Duplicate user 1
        ]
    ]);
}, 'Duplicate players in game results');
statsAssert($pdo5->rollbackCount === 1, 'Test 5: Duplicate player IDs must roll back');

// ==========================================
// Test 6: Не-хост не может отправлять результаты
// ==========================================
$pdo6 = new StatsActionTestPdo($finishedBunkerRoom, $room6Players);
expectStatsError(function () use ($pdo6) {
    action_game_finished($pdo6, ['id' => 2], [ // User 2 is not host
        'players_data' => [['user_id' => 1, 'rank' => 1], ['user_id' => 2, 'rank' => 2]]
    ]);
}, 'Only host can submit results');
statsAssert($pdo6->rollbackCount === 1, 'Test 6: Non-host submission must roll back');

// ==========================================
// Test 6b: Подмена победителя среди настоящих участников (tampered rank) отклоняется
// ==========================================
// В finishedBunkerRoom: user 2 в kicked_players (ранг 2), user 1 выжил (ранг 1).
// Хост пытается объявить изгнанного user 2 победителем (ранг 1), а выжившего user 1 проигравшим (ранг 2).
$pdo6b = new StatsActionTestPdo($finishedBunkerRoom, $room6Players);
expectStatsError(function () use ($pdo6b) {
    action_game_finished($pdo6b, ['id' => 1], [
        'players_data' => [
            ['user_id' => 1, 'rank' => 2, 'score' => 0],
            ['user_id' => 2, 'rank' => 1, 'score' => 0]
        ]
    ]);
}, 'Game results do not match server state (tampered rank)');
statsAssert($pdo6b->rollbackCount === 1, 'Test 6b: Tampered rank must roll back');
statsAssert($pdo6b->mutationCount === 0, 'Test 6b: Tampered rank must not write mutations');

// ==========================================
// Test 6c: Изменение очков настоящих участников (tampered score) отклоняется
// ==========================================
// В Bunker счёт всегда 0. Хост пытается начислить себе 5000 очков.
$pdo6c = new StatsActionTestPdo($finishedBunkerRoom, $room6Players);
expectStatsError(function () use ($pdo6c) {
    action_game_finished($pdo6c, ['id' => 1], [
        'players_data' => [
            ['user_id' => 1, 'rank' => 1, 'score' => 5000],
            ['user_id' => 2, 'rank' => 2, 'score' => 0]
        ]
    ]);
}, 'Game results do not match server state (tampered score)');
statsAssert($pdo6c->rollbackCount === 1, 'Test 6c: Tampered score must roll back');
statsAssert($pdo6c->mutationCount === 0, 'Test 6c: Tampered score must not write mutations');

// ==========================================
// Test 6d: Пропуск участников комнаты в результатах отклоняется
// ==========================================
// В комнате 2 игрока, хост отправляет результаты только для одного, скрывая поражение второго.
$pdo6d = new StatsActionTestPdo($finishedBunkerRoom, $room6Players);
expectStatsError(function () use ($pdo6d) {
    action_game_finished($pdo6d, ['id' => 1], [
        'players_data' => [
            ['user_id' => 1, 'rank' => 1, 'score' => 0]
        ]
    ]);
}, 'Game results do not include all room players');
statsAssert($pdo6d->rollbackCount === 1, 'Test 6d: Missing players must roll back');
statsAssert($pdo6d->mutationCount === 0, 'Test 6d: Missing players must not write mutations');

// ==========================================
// Test 7: Законное завершение поддерживаемой игры (Bunker в outro) успешно записывает статистику
// ==========================================
$users7 = [
    ['id' => 1, 'first_name' => 'HostPlayer'],
    ['id' => 2, 'first_name' => 'SurvivorPlayer'],
];
$pdo7 = new StatsActionTestPdo($finishedBunkerRoom, $room6Players, $users7);
$res7 = runStatsAction($pdo7, ['id' => 1], [
    'players_data' => [
        ['user_id' => 1, 'rank' => 1, 'score' => 0],
        ['user_id' => 2, 'rank' => 2, 'score' => 0]
    ],
    'duration' => 60
]);
statsAssert(($res7['status'] ?? null) === 'ok', 'Test 7: Legitimate game completion should return ok');
statsAssert($pdo7->commitCount === 1, 'Test 7: Transaction must be committed');
statsAssert($pdo7->rollbackCount === 0, 'Test 7: No rollbacks on valid completion');
statsAssert(count($pdo7->gameHistory) === 1, 'Test 7: Game history must be recorded');
statsAssert(count($pdo7->gameHistoryPlayers) === 2, 'Test 7: Both players must be in game history');
statsAssert(($pdo7->userStats[1]['total_wins'] ?? 0) === 1, 'Test 7: Winner must get a win');
statsAssert(($pdo7->userStats[2]['total_losses'] ?? 0) === 1, 'Test 7: Rank 2 must get a loss');

// Verify that rooms.game_state now has stats_recorded = true
$updatedState7 = json_decode($pdo7->room['game_state'], true);
statsAssert(!empty($updatedState7['stats_recorded']), 'Test 7: game_state must be updated with stats_recorded = true');

// ==========================================
// Test 8: Повторное завершение не начисляет награды повторно (идемпотентность)
// ==========================================
$mutationsBefore = $pdo7->mutationCount;
$commitsBefore = $pdo7->commitCount;
$res8 = runStatsAction($pdo7, ['id' => 1], [
    'players_data' => [
        ['user_id' => 1, 'rank' => 1, 'score' => 0],
        ['user_id' => 2, 'rank' => 2, 'score' => 0]
    ]
]);
statsAssert(($res8['status'] ?? null) === 'ok', 'Test 8: Replay must return ok');
statsAssert(($res8['already_recorded'] ?? null) === true, 'Test 8: Replay must report already_recorded = true');
statsAssert($pdo7->mutationCount === $mutationsBefore, 'Test 8: Replay must NOT write any new mutations');
statsAssert(count($pdo7->gameHistory) === 1, 'Test 8: No duplicate history entries');
statsAssert(($pdo7->userStats[1]['total_wins'] ?? 0) === 1, 'Test 8: Wins must not increase on replay');

// ==========================================
// Test 9: Два одновременных запроса Bunker не создают дублирующих результатов
// ==========================================
// Симуляция: Запрос 1 выполняет запись и фиксирует stats_recorded = true.
// Запрос 2, ожидавший на блокировке FOR UPDATE, считывает актуализированный state с stats_recorded = true.
$simRoom = [
    'id' => 9,
    'room_code' => 'CONCUR9',
    'host_user_id' => 1,
    'game_type' => 'bunker',
    'status' => 'playing',
    'game_state' => json_encode(['phase' => 'outro', 'kicked_players' => [2]]),
];
$simPlayers = [
    ['id' => 1, 'room_id' => 9, 'user_id' => 1, 'is_host' => 1],
    ['id' => 2, 'room_id' => 9, 'user_id' => 2, 'is_host' => 0],
];
$pdo9 = new StatsActionTestPdo($simRoom, $simPlayers, $users7);

// Request 1 succeeds and records
$req1 = runStatsAction($pdo9, ['id' => 1], [
    'players_data' => [['user_id' => 1, 'rank' => 1, 'score' => 0], ['user_id' => 2, 'rank' => 2, 'score' => 0]]
]);
statsAssert(($req1['status'] ?? null) === 'ok', 'Test 9: Request 1 must succeed');
statsAssert(empty($req1['already_recorded']), 'Test 9: Request 1 records for first time');

// Request 2 (concurrent after lock unblocks) sees stats_recorded = true
$req2 = runStatsAction($pdo9, ['id' => 1], [
    'players_data' => [['user_id' => 1, 'rank' => 1, 'score' => 0], ['user_id' => 2, 'rank' => 2, 'score' => 0]]
]);
statsAssert(($req2['status'] ?? null) === 'ok', 'Test 9: Request 2 must succeed');
statsAssert(($req2['already_recorded'] ?? null) === true, 'Test 9: Request 2 must be marked as already_recorded');
statsAssert(count($pdo9->gameHistory) === 1, 'Test 9: Exactly one history record created, no race duplicate');
statsAssert(($pdo9->userStats[1]['total_wins'] ?? 0) === 1, 'Test 9: Exactly 1 win recorded');

// ==========================================
// Test 10: Durak по-прежнему отклоняется как server-authoritative
// ==========================================
$durakRoom = [
    'id' => 10,
    'room_code' => 'DURAK10',
    'host_user_id' => 1,
    'game_type' => 'durak',
    'status' => 'playing',
    'game_state' => json_encode(['phase' => 'finished']),
];
$pdo10 = new StatsActionTestPdo($durakRoom, $room6Players);
expectStatsError(function () use ($pdo10) {
    action_game_finished($pdo10, ['id' => 1], ['players_data' => [['user_id' => 1, 'rank' => 1]]]);
}, 'Durak results are server-authoritative');
statsAssert($pdo10->rollbackCount === 1, 'Test 10: Durak submission must roll back');

// ==========================================
// Test 11: Игры с серверной записью (Spyfall, Wordclash, Minesweeper) идемпотентно возвращают ok при stats_recorded
// ==========================================
$recordedRoom = [
    'id' => 11,
    'room_code' => 'REC011',
    'host_user_id' => 1,
    'game_type' => 'spyfall',
    'status' => 'playing',
    'game_state' => json_encode(['phase' => 'results', 'stats_recorded' => true]),
];
$pdo11 = new StatsActionTestPdo($recordedRoom, $room6Players, $users7);
$res11 = runStatsAction($pdo11, ['id' => 1], [
    'players_data' => [
        ['user_id' => 1, 'rank' => 1, 'score' => 100],
        ['user_id' => 2, 'rank' => 2, 'score' => 0],
    ]
]);
statsAssert(($res11['status'] ?? null) === 'ok', 'Test 11: Already recorded server-authoritative game must return ok');
statsAssert(($res11['already_recorded'] ?? null) === true, 'Test 11: Must report already_recorded = true');
statsAssert($pdo11->mutationCount === 0, 'Test 11: No duplicate mutations written');

// ==========================================
// Test 12: Клиентский вызов game_finished для незаписанных не-Bunker игр отклоняется как server-authoritative
// ==========================================
$unrecordedWcRoom = [
    'id' => 12,
    'room_code' => 'WC012',
    'host_user_id' => 1,
    'game_type' => 'wordclash',
    'status' => 'playing',
    'game_state' => json_encode(['phase' => 'game_over']),
];
$pdo12 = new StatsActionTestPdo($unrecordedWcRoom, $room6Players, $users7);
expectStatsError(function () use ($pdo12) {
    action_game_finished($pdo12, ['id' => 1], [
        'players_data' => [
            ['user_id' => 1, 'rank' => 1, 'score' => 100],
            ['user_id' => 2, 'rank' => 2, 'score' => 10],
        ]
    ]);
}, 'Game results are server-authoritative');
statsAssert($pdo12->rollbackCount === 1, 'Test 12: Non-bunker client recording must roll back');
statsAssert($pdo12->mutationCount === 0, 'Test 12: Non-bunker client recording must not write mutations');

// ==========================================
// Test 13: Bunker с несколькими победителями (2 выживших, 1 изгнанный)
// ==========================================
$multiWinRoom = [
    'id' => 13,
    'room_code' => 'BUNK13',
    'host_user_id' => 1,
    'game_type' => 'bunker',
    'status' => 'playing',
    'game_state' => json_encode(['phase' => 'outro', 'kicked_players' => [3]]),
];
$multiWinPlayers = [
    ['id' => 1, 'room_id' => 13, 'user_id' => 1, 'is_host' => 1],
    ['id' => 2, 'room_id' => 13, 'user_id' => 2, 'is_host' => 0],
    ['id' => 3, 'room_id' => 13, 'user_id' => 3, 'is_host' => 0],
];
$users13 = [
    ['id' => 1, 'first_name' => 'Survivor1'],
    ['id' => 2, 'first_name' => 'Survivor2'],
    ['id' => 3, 'first_name' => 'KickedPlayer'],
];
$pdo13 = new StatsActionTestPdo($multiWinRoom, $multiWinPlayers, $users13);
$res13 = runStatsAction($pdo13, ['id' => 1], [
    'players_data' => [
        ['user_id' => 1, 'rank' => 1, 'score' => 0],
        ['user_id' => 2, 'rank' => 1, 'score' => 0],
        ['user_id' => 3, 'rank' => 2, 'score' => 0],
    ]
]);
statsAssert(($res13['status'] ?? null) === 'ok', 'Test 13: Multi-winner Bunker completion succeeds');
statsAssert(($pdo13->userStats[1]['total_wins'] ?? 0) === 1, 'Test 13: Survivor 1 gets win');
statsAssert(($pdo13->userStats[2]['total_wins'] ?? 0) === 1, 'Test 13: Survivor 2 gets win');
statsAssert(($pdo13->userStats[3]['total_losses'] ?? 0) === 1, 'Test 13: Kicked player gets loss');

// ==========================================
// Test 14: Bunker с вышедшим до финала игроком (корректная обработка оставшихся участников)
// ==========================================
// Игрок 3 покинул комнату (DELETE FROM room_players), в комнате остались игроки 1 и 2.
// Игрок 1 выжил, игрок 2 был изгнан голосованием.
$leaverRoom = [
    'id' => 14,
    'room_code' => 'BUNK14',
    'host_user_id' => 1,
    'game_type' => 'bunker',
    'status' => 'playing',
    'game_state' => json_encode(['phase' => 'outro', 'kicked_players' => [2, 3]]),
];
$remainingPlayers = [
    ['id' => 1, 'room_id' => 14, 'user_id' => 1, 'is_host' => 1],
    ['id' => 2, 'room_id' => 14, 'user_id' => 2, 'is_host' => 0],
];
$pdo14 = new StatsActionTestPdo($leaverRoom, $remainingPlayers, $users13);
$res14 = runStatsAction($pdo14, ['id' => 1], [
    'players_data' => [
        ['user_id' => 1, 'rank' => 1, 'score' => 0],
        ['user_id' => 2, 'rank' => 2, 'score' => 0],
    ]
]);
statsAssert(($res14['status'] ?? null) === 'ok', 'Test 14: Bunker with leaver finishes cleanly for remaining room members');
statsAssert(($pdo14->userStats[1]['total_wins'] ?? 0) === 1, 'Test 14: Remaining survivor gets win');
statsAssert(($pdo14->userStats[2]['total_losses'] ?? 0) === 1, 'Test 14: Remaining kicked player gets loss');

echo "All stats game_finished security and regression tests passed successfully!\n";
