<?php
// 013_add_wcp_moderation.php
// Tables for word moderation and AI review.

require_once __DIR__ . '/../config.php';

if (!isset($pdo) || !$pdo instanceof PDO) {
    echo "Migration 013 skipped: database connection is not available in this environment.\n";
    exit(1);
}

try {
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS wcp_word_reports (
            id INT AUTO_INCREMENT PRIMARY KEY,
            word VARCHAR(100) NOT NULL,
            normalized_word VARCHAR(100) NOT NULL,
            game_type VARCHAR(50) NOT NULL DEFAULT 'wordclash_party',
            word_length INT NOT NULL,
            reporter_user_id INT NOT NULL,
            room_id INT NOT NULL,
            reason VARCHAR(255) DEFAULT 'bad_word',
            status VARCHAR(32) NOT NULL DEFAULT 'pending',
            
            ai_decision VARCHAR(32) NULL,
            ai_category VARCHAR(64) NULL,
            ai_confidence DECIMAL(3,2) NULL,
            ai_reason TEXT NULL,
            ai_checked_at DATETIME NULL,
            
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            reviewed_by INT NULL,
            reviewed_at DATETIME NULL,
            
            UNIQUE KEY uq_wcp_word_reports_dedupe (normalized_word, reporter_user_id, room_id),
            INDEX idx_wcp_word_reports_status (status),
            INDEX idx_wcp_word_reports_normalized_word (normalized_word)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");

    $pdo->exec("
        CREATE TABLE IF NOT EXISTS wcp_dynamic_blacklist (
            normalized_word VARCHAR(100) NOT NULL,
            word VARCHAR(100) NOT NULL,
            game_type VARCHAR(50) NOT NULL DEFAULT 'wordclash_party',
            word_length INT NOT NULL,
            source VARCHAR(32) NOT NULL DEFAULT 'tester',
            added_by INT NULL,
            reason VARCHAR(255) NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            
            UNIQUE KEY uq_wcp_dynamic_blacklist_game_word (game_type, normalized_word)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");

    echo "Migration 013: wcp_word_reports and wcp_dynamic_blacklist tables are ready.\n";
} catch (PDOException $e) {
    echo "Migration 013 Error: " . $e->getMessage() . "\n";
}
