<?php
// 009_add_gamification_daily_tasks.php
// Backend foundation for idempotent gamification events, XP rewards, and daily tasks.

require_once __DIR__ . '/../config.php';

if (!isset($pdo) || !$pdo instanceof PDO) {
    echo "Migration 009 skipped: database connection is not available in this environment.\n";
    exit(1);
}

try {
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS gamification_events (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            user_id BIGINT NOT NULL,
            event_type VARCHAR(64) NOT NULL,
            source_type VARCHAR(64) NOT NULL,
            source_id VARCHAR(128) NOT NULL,
            payload JSON NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uniq_gamification_event_source (user_id, event_type, source_type, source_id),
            INDEX idx_gamification_events_user_created (user_id, created_at),
            INDEX idx_gamification_events_type_created (event_type, created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");

    $pdo->exec("
        CREATE TABLE IF NOT EXISTS xp_transactions (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            user_id BIGINT NOT NULL,
            source_type VARCHAR(64) NOT NULL,
            source_id VARCHAR(128) NOT NULL,
            amount INT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uniq_xp_transaction_source (user_id, source_type, source_id),
            INDEX idx_xp_transactions_user_created (user_id, created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");

    $pdo->exec("
        CREATE TABLE IF NOT EXISTS daily_tasks (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            code VARCHAR(64) NOT NULL,
            title VARCHAR(120) NOT NULL,
            description VARCHAR(255) NULL,
            event_type VARCHAR(64) NOT NULL,
            target_count INT NOT NULL DEFAULT 1,
            xp_reward INT NOT NULL DEFAULT 0,
            is_active TINYINT(1) NOT NULL DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uniq_daily_tasks_code (code),
            INDEX idx_daily_tasks_active_event (is_active, event_type)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");

    $pdo->exec("
        CREATE TABLE IF NOT EXISTS user_daily_tasks (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            user_id BIGINT NOT NULL,
            task_date DATE NOT NULL,
            task_id BIGINT NOT NULL,
            progress INT NOT NULL DEFAULT 0,
            target_count INT NOT NULL DEFAULT 1,
            status ENUM('active', 'completed', 'claimed') NOT NULL DEFAULT 'active',
            completed_at DATETIME NULL,
            claimed_at DATETIME NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uniq_user_daily_task (user_id, task_date, task_id),
            INDEX idx_user_daily_tasks_user_date (user_id, task_date),
            INDEX idx_user_daily_tasks_task (task_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");

    $tasks = [
        ['play_one_game', 'Сыграй игру', 'Заверши одну игру сегодня', 'game_finished', 1, 50],
        ['win_one_game', 'Победи в игре', 'Займи первое место в игре сегодня', 'win', 1, 75],
        ['create_room', 'Создай комнату', 'Создай игровую комнату сегодня', 'room_created', 1, 30],
        ['schedule_game', 'Запланируй игру', 'Создай запланированную игру сегодня', 'scheduled_created', 1, 40],
        ['join_scheduled', 'Запишись на игру', 'Запишись на запланированную игру сегодня', 'scheduled_subscribed', 1, 40],
    ];

    $stmt = $pdo->prepare("
        INSERT INTO daily_tasks (code, title, description, event_type, target_count, xp_reward, is_active)
        VALUES (?, ?, ?, ?, ?, ?, 1)
        ON DUPLICATE KEY UPDATE
            title = VALUES(title),
            description = VALUES(description),
            event_type = VALUES(event_type),
            target_count = VALUES(target_count),
            xp_reward = VALUES(xp_reward),
            is_active = VALUES(is_active)
    ");

    foreach ($tasks as $task) {
        $stmt->execute($task);
    }

    echo "Migration 009: gamification daily task schema is ready.\n";
} catch (PDOException $e) {
    echo "Migration 009 Error: " . $e->getMessage() . "\n";
}
