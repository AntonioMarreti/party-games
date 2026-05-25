<?php
// 011_add_achievement_metadata.php
// Idempotent metadata columns for the existing achievements system.

require_once __DIR__ . '/../config.php';

if (!isset($pdo) || !$pdo instanceof PDO) {
    echo "Migration 011 skipped: database connection is not available in this environment.\n";
    exit(1);
}

function achievement_metadata_column_exists(PDO $pdo, string $column): bool
{
    $stmt = $pdo->prepare("
        SELECT COUNT(*)
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'achievements'
          AND COLUMN_NAME = ?
    ");
    $stmt->execute([$column]);
    return (int) $stmt->fetchColumn() > 0;
}

try {
    if (!achievement_metadata_column_exists($pdo, 'icon_type')) {
        $pdo->exec("ALTER TABLE achievements ADD COLUMN icon_type VARCHAR(24) NOT NULL DEFAULT 'bootstrap' AFTER icon");
        echo "Migration 011: added achievements.icon_type.\n";
    }

    if (!achievement_metadata_column_exists($pdo, 'rarity')) {
        $pdo->exec("ALTER TABLE achievements ADD COLUMN rarity VARCHAR(24) NOT NULL DEFAULT 'common' AFTER condition_value");
        echo "Migration 011: added achievements.rarity.\n";
    }

    if (!achievement_metadata_column_exists($pdo, 'sort_order')) {
        $pdo->exec("ALTER TABLE achievements ADD COLUMN sort_order INT NOT NULL DEFAULT 100 AFTER rarity");
        echo "Migration 011: added achievements.sort_order.\n";
    }

    echo "Migration 011: achievement metadata schema is ready.\n";
} catch (PDOException $e) {
    echo "Migration 011 Error: " . $e->getMessage() . "\n";
}
