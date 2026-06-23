<?php
// 014_add_users_hide_profile_badge.php
// Tester-controlled visibility for the public profile badge.

require_once __DIR__ . '/../config.php';

if (!isset($pdo) || !$pdo instanceof PDO) {
    echo "Migration 014 skipped: database connection is not available in this environment.\n";
    exit(1);
}

try {
    $stmt = $pdo->prepare("SHOW COLUMNS FROM `users` LIKE ?");
    $stmt->execute(['hide_profile_badge']);

    if (!$stmt->fetch()) {
        $pdo->exec("ALTER TABLE `users` ADD COLUMN `hide_profile_badge` TINYINT(1) NOT NULL DEFAULT 0");
        echo "Migration 014: added users.hide_profile_badge.\n";
    } else {
        echo "Migration 014: users.hide_profile_badge already exists.\n";
    }
} catch (PDOException $e) {
    echo "Migration 014 Error: " . $e->getMessage() . "\n";
    exit(1);
}
