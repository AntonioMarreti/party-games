<?php
require_once 'config.php';

try {
    $pdo->exec("CREATE TABLE IF NOT EXISTS auth_sessions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        temp_code VARCHAR(64) UNIQUE NOT NULL,
        telegram_id BIGINT DEFAULT NULL,
        auth_token VARCHAR(64) DEFAULT NULL,
        status ENUM('pending', 'authorized') DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME DEFAULT (CURRENT_TIMESTAMP + INTERVAL 10 MINUTE),
        INDEX idx_code (temp_code),
        INDEX idx_status (status)
    )");
    echo "Table 'auth_sessions' created/checked.\n";
} catch (PDOException $e) {
    echo "Migration Error: " . $e->getMessage() . "\n";
}
