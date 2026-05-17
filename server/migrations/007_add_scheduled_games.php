<?php
// 007_add_scheduled_games.php
// MVP schema for planned public games. Scheduled events are separate from live rooms.

require_once __DIR__ . '/../config.php';

try {
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS scheduled_games (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            host_user_id BIGINT NOT NULL,
            room_id BIGINT NULL,
            game_type VARCHAR(64) NOT NULL,
            title VARCHAR(120) NOT NULL,
            description TEXT NULL,
            visibility ENUM('public', 'private') DEFAULT 'public',
            status ENUM('scheduled', 'open', 'started', 'cancelled', 'expired') DEFAULT 'scheduled',
            starts_at DATETIME NOT NULL,
            opens_at DATETIME NULL,
            expires_at DATETIME NULL,
            min_players INT DEFAULT 2,
            max_players INT DEFAULT 8,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_scheduled_games_status_starts (status, starts_at),
            INDEX idx_scheduled_games_host (host_user_id),
            INDEX idx_scheduled_games_room (room_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");

    $pdo->exec("
        CREATE TABLE IF NOT EXISTS room_subscriptions (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            scheduled_game_id BIGINT NOT NULL,
            user_id BIGINT NOT NULL,
            status ENUM('subscribed', 'joined', 'cancelled', 'notified') DEFAULT 'subscribed',
            notify_at DATETIME NULL,
            notified_at DATETIME NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uniq_room_subscriptions_game_user (scheduled_game_id, user_id),
            INDEX idx_room_subscriptions_notify (status, notify_at),
            INDEX idx_room_subscriptions_user (user_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");

    echo "Migration 007: scheduled_games and room_subscriptions are ready.\n";
} catch (PDOException $e) {
    echo "Migration 007 Error: " . $e->getMessage() . "\n";
}
