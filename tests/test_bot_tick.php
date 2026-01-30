<?php
// tests/test_bot_tick.php
require_once __DIR__ . '/../server/config.php';
require_once __DIR__ . '/../server/games/bunker.php';

// Mock PDO for dry run
class MockPDO {
    public function prepare($sql) { return new MockStmt(); }
    public function beginTransaction() {}
    public function commit() {}
}
class MockStmt {
    public function execute($params) {}
    public function fetchColumn() { return 1; } // Simulate "is_bot" = true
    public function fetchAll($mode = null) { return []; }
}

$pdo = new MockPDO();
$room = [
    'id' => 1,
    'is_host' => true,
    'game_type' => 'bunker',
    'game_state' => json_encode([
        'phase' => 'round',
        'turn_phase' => 'reveal',
        'current_player_id' => 'bot_1',
        'timer_start' => time() - 10, // 10 seconds ago
        'players_cards' => [
            'bot_1' => [
                'professions' => ['text' => 'Doctor', 'revealed' => false],
                'biology' => ['text' => 'Male', 'revealed' => false]
            ]
        ],
        'history' => []
    ])
];
$user = ['id' => 999]; // Host
$data = ['type' => 'tick'];

// We need to define updateGameState since it's global
function updateGameState($roomId, $state) {
    echo "Updating State: " . json_encode($state, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . "\n";
}

echo "Running tick simulation...\n";
$result = handleGameAction($pdo, $room, $user, $data);
echo "Result: " . json_encode($result) . "\n";
