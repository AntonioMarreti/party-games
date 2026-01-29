<?php
// Migration: 003_add_bots (Recovered)

try {
    $pdo->exec("ALTER TABLE users ADD COLUMN is_bot TINYINT(1) DEFAULT 0");
    echo "Added is_bot to users\n";
} catch (Exception $e) { echo "is_bot exists in users\n"; }

try {
    $pdo->exec("ALTER TABLE room_players ADD COLUMN is_bot TINYINT(1) DEFAULT 0");
    echo "Added is_bot to room_players\n";
} catch (Exception $e) { echo "is_bot exists in room_players\n"; }

try {
    $pdo->exec("ALTER TABLE room_players ADD COLUMN bot_difficulty VARCHAR(16) DEFAULT 'medium'");
    echo "Added bot_difficulty to room_players\n";
} catch (Exception $e) { echo "bot_difficulty exists in room_players\n"; }
