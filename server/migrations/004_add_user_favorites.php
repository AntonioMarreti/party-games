<?php
require_once __DIR__ . '/../config.php';

try {
    $pdo->exec("CREATE TABLE IF NOT EXISTS user_favorites (
        user_id INT NOT NULL,
        game_id VARCHAR(32) NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, game_id),
        INDEX idx_user (user_id)
    )");
    echo "Migration 004: user_favorites table created successfully.\n";
} catch (PDOException $e) {
    echo "Migration 004 Error: " . $e->getMessage() . "\n";
}
