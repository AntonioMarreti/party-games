<?php
// 010_session_tables.php
// Creates the session tables and adds users.session_ttl_days. This DDL used to
// run on every login/auth request inside auth.php and api.php; moving it here
// keeps schema changes out of the request hot path.

require_once __DIR__ . '/../config.php';

if (!isset($pdo) || !$pdo instanceof PDO) {
    echo "Migration 010 skipped: database connection is not available in this environment.\n";
    exit(1);
}

try {
    $pdo->exec("CREATE TABLE IF NOT EXISTS user_sessions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        auth_token VARCHAR(64) UNIQUE NOT NULL,
        platform ENUM('tma','web','dev') DEFAULT 'web',
        device VARCHAR(150) DEFAULT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_used DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_token (auth_token),
        INDEX idx_user (user_id),
        INDEX idx_last (last_used)
    )");
    echo "Migration 010: user_sessions table is ready.\n";

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
    echo "Migration 010: auth_sessions table is ready.\n";

    $stmt = $pdo->prepare("SHOW COLUMNS FROM `users` LIKE ?");
    $stmt->execute(['session_ttl_days']);
    if (!$stmt->fetch()) {
        $pdo->exec("ALTER TABLE users ADD COLUMN session_ttl_days INT DEFAULT 30");
        echo "Migration 010: added users.session_ttl_days.\n";
    }

    // One-time migration of legacy tokens stored directly on the users table.
    $migrated = $pdo->exec("INSERT IGNORE INTO user_sessions (user_id, auth_token, platform, device)
        SELECT id, auth_token, 'web', 'Перенесено из старой системы'
        FROM users WHERE auth_token IS NOT NULL AND auth_token != ''");
    echo "Migration 010: migrated $migrated legacy token(s).\n";
} catch (PDOException $e) {
    echo "Migration 010 Error: " . $e->getMessage() . "\n";
}
