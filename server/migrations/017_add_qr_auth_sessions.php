<?php
// 017_add_qr_auth_sessions.php
// Creates the qr_auth_sessions table for QR login.

require_once __DIR__ . '/../config.php';

if (!isset($pdo) || !$pdo instanceof PDO) {
    echo "Migration 017 skipped: database connection is not available in this environment.\n";
    exit(1);
}

try {
    $pdo->beginTransaction();

    $pdo->exec("
        CREATE TABLE IF NOT EXISTS qr_auth_sessions (
            id INT AUTO_INCREMENT PRIMARY KEY,
            intent_id VARCHAR(64) UNIQUE NOT NULL,
            scan_secret_hash VARCHAR(255) NOT NULL,
            browser_secret_hash VARCHAR(255) NOT NULL,
            user_id INT DEFAULT NULL,
            device_label VARCHAR(150) NOT NULL,
            status ENUM('pending', 'scanned', 'approved', 'denied', 'consumed') DEFAULT 'pending',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            expires_at DATETIME NOT NULL,
            scanned_at DATETIME DEFAULT NULL,
            approved_at DATETIME DEFAULT NULL,
            denied_at DATETIME DEFAULT NULL,
            consumed_at DATETIME DEFAULT NULL,
            INDEX idx_intent (intent_id),
            INDEX idx_status_expires (status, expires_at),
            CONSTRAINT fk_qr_auth_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ");

    $pdo->commit();
    echo "Migration 017: Created qr_auth_sessions table successfully.\n";
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    echo "Migration 017 Error: " . $e->getMessage() . "\n";
    exit(1);
}
