<?php
require_once 'config.php';

try {
    echo "Starting Phase 3 Migration (Privacy Settings)...<br>";
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    // Add is_hidden_in_leaderboard to users table if it doesn't exist
    // MySQL specific syntax for checking column existence or using idempotent ADD logic
    // A simple way is to try-catch or check information_schema, but for this project's style:
    
    // Check if column exists
    $stmt = $pdo->prepare("SHOW COLUMNS FROM users LIKE 'is_hidden_in_leaderboard'");
    $stmt->execute();
    if (!$stmt->fetch()) {
        $pdo->exec("ALTER TABLE users ADD COLUMN is_hidden_in_leaderboard TINYINT(1) DEFAULT 0");
        echo "Column 'is_hidden_in_leaderboard' added to 'users'.<br>";
    } else {
        echo "Column 'is_hidden_in_leaderboard' already exists.<br>";
    }

    echo "Migration Phase 3 Completed Successfully.";

} catch (PDOException $e) {
    echo "Migration Error: " . $e->getMessage();
}
