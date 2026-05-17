<?php
// 008_enrich_game_history.php
// Adds optional result/replay payloads for the History retention screen.

require_once __DIR__ . '/../config.php';

if (!isset($pdo) || !$pdo instanceof PDO) {
    echo "Migration 008 skipped: database connection is not available in this environment.\n";
    exit(1);
}

function addColumnIfMissing($pdo, $table, $column, $definition, &$fixes)
{
    try {
        $stmt = $pdo->prepare("SHOW COLUMNS FROM `$table` LIKE ?");
        $stmt->execute([$column]);
        if (!$stmt->fetch()) {
            $pdo->exec("ALTER TABLE `$table` ADD COLUMN $column $definition");
            $fixes[] = "Added $table.$column";
        }
    } catch (PDOException $e) {
        $fixes[] = "Skipped $table.$column: " . $e->getMessage();
    }
}

try {
    $fixes = [];

    addColumnIfMissing($pdo, 'game_history', 'winner_user_id', 'BIGINT NULL AFTER duration_seconds', $fixes);
    addColumnIfMissing($pdo, 'game_history', 'winner_name', 'VARCHAR(255) NULL AFTER winner_user_id', $fixes);
    addColumnIfMissing($pdo, 'game_history', 'summary_text', 'VARCHAR(500) NULL AFTER winner_name', $fixes);
    addColumnIfMissing($pdo, 'game_history', 'result_payload', 'JSON NULL AFTER summary_text', $fixes);
    addColumnIfMissing($pdo, 'game_history', 'replay_payload', 'JSON NULL AFTER result_payload', $fixes);

    addColumnIfMissing($pdo, 'game_history_players', 'xp_gained', 'INT DEFAULT 0 AFTER final_score', $fixes);
    addColumnIfMissing($pdo, 'game_history_players', 'result_label', 'VARCHAR(255) NULL AFTER xp_gained', $fixes);
    addColumnIfMissing($pdo, 'game_history_players', 'result_payload', 'JSON NULL AFTER result_label', $fixes);

    echo "Migration 008: game history payload fields are ready.\n";
    foreach ($fixes as $fix) {
        echo "- $fix\n";
    }
} catch (PDOException $e) {
    echo "Migration 008 Error: " . $e->getMessage() . "\n";
}
