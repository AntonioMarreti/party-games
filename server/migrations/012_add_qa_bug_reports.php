<?php
// 012_add_qa_bug_reports.php
// Persistent storage for tester QA bug reports.

require_once __DIR__ . '/../config.php';

if (!isset($pdo) || !$pdo instanceof PDO) {
    echo "Migration 012 skipped: database connection is not available in this environment.\n";
    exit(1);
}

try {
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS qa_bug_reports (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NULL,
            telegram_id BIGINT NULL,
            username VARCHAR(255) NULL,
            first_name VARCHAR(255) NULL,
            is_tester TINYINT(1) NOT NULL DEFAULT 0,
            is_admin TINYINT(1) NOT NULL DEFAULT 0,
            type VARCHAR(50) NULL,
            severity VARCHAR(50) NULL,
            screen VARCHAR(120) NULL,
            report_text MEDIUMTEXT NOT NULL,
            debug_json MEDIUMTEXT NULL,
            status VARCHAR(40) NOT NULL DEFAULT 'new',
            admin_note TEXT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NULL,
            INDEX idx_qa_bug_reports_status_created (status, created_at),
            INDEX idx_qa_bug_reports_user_created (user_id, created_at),
            INDEX idx_qa_bug_reports_telegram_created (telegram_id, created_at),
            INDEX idx_qa_bug_reports_type_created (type, created_at),
            INDEX idx_qa_bug_reports_severity_created (severity, created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");

    echo "Migration 012: qa_bug_reports table is ready.\n";
} catch (PDOException $e) {
    echo "Migration 012 Error: " . $e->getMessage() . "\n";
}
