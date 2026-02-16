<?php
require_once __DIR__ . '/../config.php';

try {
    // Add total_donated_stars column to users table
    $pdo->exec("ALTER TABLE users ADD COLUMN total_donated_stars INT DEFAULT 0");
    echo "Migration 005: Added total_donated_stars column to users table.\n";
} catch (PDOException $e) {
    if (strpos($e->getMessage(), "Duplicate column") !== false) {
        echo "Migration 005: Column total_donated_stars already exists.\n";
    } else {
        echo "Migration 005 Error: " . $e->getMessage() . "\n";
    }
}
