require_once 'config.php';
require_once __DIR__ . '/lib/AI/Bot/BotPersona.php';

// Bot Configuration
// Ranges:
// Easy:   -100 to -109
// Medium: -200 to -209
// Hard:   -300 to -309

$pools = [
    'easy' => ['start' => -100, 'end' => -109, 'name_prefix' => 'Vovan', 'avatar' => '🍺', 'persona' => 'vovan'],
    'medium' => ['start' => -200, 'end' => -209, 'name_prefix' => 'Joker', 'avatar' => '🤡', 'persona' => 'joker'],
    'hard' => ['start' => -300, 'end' => -309, 'name_prefix' => 'Albert', 'avatar' => '🧠', 'persona' => 'albert'],
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
            $persona = BotPersona::getPreset($cfg['persona']);
            $name = $cfg['name_prefix'] . " " . ($i + 1);
            $photoUrl = $persona->photo_url;

            // Upsert Bot User
            $sql = "INSERT INTO users (id, telegram_id, first_name, is_bot, photo_url, custom_name, is_hidden_in_leaderboard) 
                    VALUES (:id, :id, :name, 1, :photo, :name, 1)
                    ON DUPLICATE KEY UPDATE 
                        first_name = VALUES(first_name),
                        custom_name = VALUES(custom_name),
                        photo_url = VALUES(photo_url),
                        is_bot = 1,
                        is_hidden_in_leaderboard = 1";

            $stmt = $pdo->prepare($sql);
            $stmt->execute(['id' => $id, 'name' => $name, 'photo' => $photoUrl]);
        }
    }

    $pdo->commit();
    echo "✅ Bot Pool Seeding Complete.\n";

} catch (Exception $e) {
    if ($pdo->inTransaction())
        $pdo->rollBack();
    echo "❌ Error: " . $e->getMessage() . "\n";
}
