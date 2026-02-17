<?php
// 006_add_room_ip_hash.php

require_once __DIR__ . '/../config.php';

try {
    // Add ip_hash column to rooms table
    $pdo->exec("ALTER TABLE rooms ADD COLUMN ip_hash VARCHAR(64) DEFAULT NULL");
    $pdo->exec("CREATE INDEX idx_rooms_ip_hash ON rooms(ip_hash)");

    echo "Added ip_hash column to rooms table.\n";
} catch (PDOException $e) {
    if (strpos($e->getMessage(), 'Duplicate column') !== false) {
        echo "Column ip_hash already exists.\n";
    } else {
        throw $e;
    }
}
