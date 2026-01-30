<?php
require_once 'config.php';

// Bot Configuration
// Ranges:
// Easy:   -100 to -109
// Medium: -200 to -209
// Hard:   -300 to -309

$pools = [
    'easy' =>   ['start' => -100, 'end' => -109, 'name_prefix' => 'Bot Easy',   'avatar' => '🤖'],
    'medium' => ['start' => -200, 'end' => -209, 'name_prefix' => 'Bot Medium', 'avatar' => '🦾'],
    'hard' =>   ['start' => -300, 'end' => -309, 'name_prefix' => 'Bot Hard',   'avatar' => '👹'],
];

echo "Starting Bot Pool Seeding...\n";

try {
    $pdo->beginTransaction();

    foreach ($pools as $diff => $cfg) {
        echo "Processing $diff ({$cfg['start']} to {$cfg['end']})...\n";
        
        // Iterate backwards because negative IDs (start is higher than end technically in numeric value, but logic handles range)
        // Actually, let's just loop 0 to 9 offsets.
        
        for ($i = 0; $i < 10; $i++) {
            $id = $cfg['start'] - $i; // -100, -101 ... -109
            $name = $cfg['name_prefix'] . " " . ($i + 1);
            
            // Upsert Bot User
            // We use ON DUPLICATE KEY UPDATE to ensure we just update existing ones if re-run
            $sql = "INSERT INTO users (telegram_id, first_name, is_bot, photo_url, custom_name, is_hidden_in_leaderboard) 
                    VALUES (:id, :name, 1, NULL, :name, 1)
                    ON DUPLICATE KEY UPDATE 
                        first_name = VALUES(first_name),
                        custom_name = VALUES(custom_name),
                        is_bot = 1,
                        is_hidden_in_leaderboard = 1";
            
            $stmt = $pdo->prepare($sql);
            $stmt->execute(['id' => $id, 'name' => $name]);
        }
    }
    
    $pdo->commit();
    echo "✅ Bot Pool Seeding Complete.\n";
    
} catch (Exception $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    echo "❌ Error: " . $e->getMessage() . "\n";
}
