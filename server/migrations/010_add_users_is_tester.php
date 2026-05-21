<?php
// 010_add_users_is_tester.php
// Minimal tester flag for gated QA tools.

require_once __DIR__ . '/../config.php';

if (!isset($pdo) || !$pdo instanceof PDO) {
    echo "Migration 010 skipped: database connection is not available in this environment.\n";
    exit(1);
}

try {
    $stmt = $pdo->prepare("SHOW COLUMNS FROM `users` LIKE ?");
    $stmt->execute(['is_tester']);

    if (!$stmt->fetch()) {
        $pdo->exec("ALTER TABLE `users` ADD COLUMN `is_tester` TINYINT(1) NOT NULL DEFAULT 0");
        echo "Migration 010: added users.is_tester.\n";
    } else {
        echo "Migration 010: users.is_tester already exists.\n";
    }
} catch (PDOException $e) {
    echo "Migration 010 Error: " . $e->getMessage() . "\n";
    exit(1);
}
