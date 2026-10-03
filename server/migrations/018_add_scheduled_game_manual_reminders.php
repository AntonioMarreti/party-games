<?php
// Owns the manual reminder schema previously created in the request path.
require_once __DIR__ . '/../config.php';

if (!isset($pdo) || !$pdo instanceof PDO) {
    echo "Migration 018 skipped: database connection is not available.\n";
    exit(1);
}

try {
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS scheduled_game_manual_reminders (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            scheduled_game_id BIGINT NOT NULL,
            actor_user_id BIGINT NOT NULL,
            sent_count INT NOT NULL DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            KEY idx_scheduled_game_created_at (scheduled_game_id, created_at),
            KEY idx_actor_user_id (actor_user_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");
    echo "Migration 018: scheduled_game_manual_reminders is ready.\n";
} catch (PDOException $e) {
    echo "Migration 018 error: " . $e->getMessage() . "\n";
    exit(1);
}
