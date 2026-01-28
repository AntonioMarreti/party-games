<?php
// tests/simulate_bunker.php

// 1. Mock Environment & DB
// We assume this runs in the project root context or we include necessary files.
// Adjust paths as needed.

define('ROOT_DIR', __DIR__ . '/..');
// (db_connect.php removed)
// If db_connect doesn't exist, we might need to mock or find the real one. 
// Let's assume standard structure or try to find it. 
// Actually, let's look for where global $pdo comes from in the project. 
// Usually 'server/api.php' includes it.

// Helper to mock the environment if needed
// Include the real config which establishes $pdo
$configFile = ROOT_DIR . '/server/config.php';
if (!file_exists($configFile)) {
    die("Error: Config file not found at $configFile\n");
}
require_once $configFile;

// $pdo is now available from config.php

if (!defined('BUNKER_PACK')) define('BUNKER_PACK', ROOT_DIR . '/server/games/packs/bunker/base.json');
require_once ROOT_DIR . '/server/games/bunker.php';


// We also need general game actions like 'updateGameState'. 
// Since those might be in `server/actions/game.php` or mixed, we might need to mock them 
// if they are not easily includable without session context.

// MOCKING updateGameState to just print or store local state
$GLOBAL_STATE = []; // map roomId -> state
function updateGameState($roomId, $state) {
    global $GLOBAL_STATE;
    $GLOBAL_STATE[$roomId] = $state;
    // echo "  [DEBUG] State Updated for Room $roomId. Phase: {$state['phase']}\n";
}

// We need a DB connection.
// Let's try to include the real config if possible, or fail if we can't connect.
// DB Connection is handled by config.php included above.
if (!isset($pdo) || !$pdo) {
    die("Error: \$pdo not initialized by config.php\n");
}

// === SIMULATION UTILS ===

function createTestRoom($pdo) {
    $code = 'TEST' . rand(100, 999);
    $stmt = $pdo->prepare("INSERT INTO rooms (room_code, status, game_type) VALUES (?, 'active', 'bunker')");
    $stmt->execute([$code]);
    return $pdo->lastInsertId();
}

function createTestUser($pdo, $name) {
    // Check if exists or create
    // Simple mock user
    $t = time();
    $stmt = $pdo->prepare("INSERT INTO users (first_name, telegram_id) VALUES (?, ?)");
    $stmt->execute([$name, $t . rand(100,999)]);
    return $pdo->lastInsertId();
}

function joinRoom($pdo, $roomId, $userId, $isHost = 0) {
    $stmt = $pdo->prepare("INSERT INTO room_players (room_id, user_id, is_host) VALUES (?, ?, ?)");
    $stmt->execute([$roomId, $userId, $isHost]);
}

// === MAIN TEST SCENARIO ===

echo ">>> STARTING BUNKER SIMULATION <<<\n";

try {
    // 1. Setup Room & Players
    $roomId = createTestRoom($pdo);
    echo "[+] Created Room ID: $roomId\n";

    $players = [];
    for ($i = 0; $i < 6; $i++) {
        $uid = createTestUser($pdo, "Bot_$i");
        joinRoom($pdo, $roomId, $uid, $i === 0 ? 1 : 0);
        $players[] = ['id' => $uid, 'name' => "Bot_$i"];
    }
    echo "[+] Added 6 players (Host: {$players[0]['name']})\n";

    // 2. Mock Room Data for Handler
    $roomRow = [
        'id' => $roomId,
        'is_host' => 1, // We act as host for init
        'game_state' => json_encode(getInitialState())
    ];

    // 3. Init Game
    echo "[.] Initializing Game...\n";
    $hostUser = $players[0];
    $res = handleGameAction($pdo, $roomRow, $hostUser, ['type' => 'init_bunker']);
    
    // Refresh State
    $state = $GLOBAL_STATE[$roomId];
    if (empty($state['players_cards'])) die("[-] FAILED: No cards distributed.\n");
    echo "[+] Game Initialized. Scenario: {$state['catastrophe']['title']}\n";
    echo "[+] Features: " . implode(", ", $state['bunker_features']) . "\n";
    
    // 4. Play 6 Rounds (0 to 5, where 5 transitions to Outro)
    for ($round = 1; $round <= 6; $round++) {
        echo "\n--- SIMULATION STEP $round ---\n";
        
        // Ensure state is synced
        $roomRow['game_state'] = json_encode($state);
        
        // Reveal Feature (happens automatically in Next Round logic usually, 
        // but let's check what logic we put in `goToNextRound`).
        // `goToNextRound` is called inside `handleGameAction` usually on 'next_phase' or vote end.
        
        // Start Vote
        echo "  [.] Starting Vote Phase...\n";
        // To start voting, we might verify briefing -> round or similar.
        // Current phase should be 'round'.
        // Host clicks "Start Vote" -> probably 'next_phase' or specific action?
        // Let's look at UI. UI calls `sendGameAction('vote_query_answer')`?
        // Wait, standard flow is: Round -> Vote Query (skip?) -> Voting -> Results -> Next Round.
        
        // Let's trigger 'vote_kick' directly to simulate users voting.
        // In this simple engine, maybe we just mock votes.
        
        // Force phase to 'voting' for test if needed, or follow flow.
        // Assuming we are in 'round'. Host clicks 'next_phase' -> 'vote_query'.
        handleGameAction($pdo, $roomRow, $hostUser, ['type' => 'next_phase']);
        $state = $GLOBAL_STATE[$roomId];
        echo "    Phase: {$state['phase']}\n"; // Should be vote_query or voting
        
        if ($state['phase'] === 'vote_query') {
            // Everyone votes YES to kick
            foreach ($players as $p) {
                // handleGameAction($pdo, ['id'=>$roomId, 'game_state'=>json_encode($state)], $p, ['type'=>'vote_query_answer', 'answer'=>'yes']);
                // Mock direct state update for speed
                $state['vote_query_result'][$p['id']] = 'yes';
            }
            updateGameState($roomId, $state);
            // Check result
            $roomRow['game_state'] = json_encode($state);
            handleGameAction($pdo, $roomRow, $hostUser, ['type' => 'force_finish_voting']); // reuse/mock trigger
            // Actually `checkVoteQuery` logic usually handles transition.
            
            // Let's just manually kick logic to 'voting' if needed
            $state['phase'] = 'voting';
            updateGameState($roomId, $state);
        }
        
        echo "  [.] Casting Votes (Kick)...\n";
        $victim = $players[count($players)-1]; // Kick the last one
        foreach ($players as $p) {
             if (in_array($p['id'], $state['kicked_players'])) continue;
             
             $roomRow['game_state'] = json_encode($state); // Update local mock
             handleGameAction($pdo, $roomRow, $p, ['type' => 'vote_kick', 'target_id' => $victim['id']]);
             $state = $GLOBAL_STATE[$roomId]; // Refresh
        }
        
        echo "    Vote Result: " . (in_array($victim['id'], $state['kicked_players']) ? "Kicked {$victim['id']}" : "Not Kicked") . "\n";
        
        // Complete Round (Next Phase -> Results -> Next Phase -> Round X+1)
        if ($state['phase'] === 'vote_results') {
             $roomRow['game_state'] = json_encode($state);
             handleGameAction($pdo, $roomRow, $hostUser, ['type' => 'next_phase']);
             $state = $GLOBAL_STATE[$roomId];
        }
        
        echo "    New Round: {$state['current_round']}, Phase: {$state['phase']}\n";
        if (!empty($state['revealed_features'])) {
            echo "    Revealed: " . end($state['revealed_features']) . "\n";
        }
    }
    
    // 5. End Game
    echo "\n--- END GAME ---\n";
    // Should be in 'outro'
    if ($state['phase'] === 'outro') {
        echo "[+] Reached Outro Successfully.\n";
        echo "[+] Threats Resolution:\n";
        foreach ($state['threat_results'] as $t) {
            echo "    Threat: {$t['title']} -> " . ($t['success'] ? "SUCCESS" : "FAIL") . "\n";
            echo "    ({$t['result_text']})\n";
        }
    } else {
        echo "[-] FAILED: Did not reach 'outro'. stuck in {$state['phase']}\n";
    }

} catch (Exception $e) {
    echo "\n[!!!] EXCEPTION: " . $e->getMessage() . "\n";
    echo $e->getTraceAsString();
}
