<?php
// 007_add_scheduled_games.php
// Safe MVP schema for planned public games. Scheduled games do not create rooms yet.

require_once __DIR__ . '/../config.php';

if (!isset($pdo) || !$pdo instanceof PDO) {
    echo "Migration 007 skipped: database connection is not available in this environment.\n";
    exit(1);
}

function scheduledAddColumnIfMissing($pdo, $table, $column, $definition, &$fixes)
{
    try {
        $stmt = $pdo->prepare("SHOW COLUMNS FROM `$table` LIKE ?");
        $stmt->execute([$column]);
        if (!$stmt->fetch()) {
            $pdo->exec("ALTER TABLE `$table` ADD COLUMN $column $definition");
            $fixes[] = "Added $table.$column";
        }
    } catch (PDOException $e) {
        $fixes[] = "Skipped $table.$column: " . $e->getMessage();
    }
}

function scheduledAddIndexIfMissing($pdo, $table, $index, $definition, &$fixes)
{
    try {
        $stmt = $pdo->prepare("SHOW INDEX FROM `$table` WHERE Key_name = ?");
        $stmt->execute([$index]);
        if (!$stmt->fetch()) {
            $pdo->exec("ALTER TABLE `$table` ADD INDEX $index $definition");
            $fixes[] = "Added $table.$index";
        }
    } catch (PDOException $e) {
        $fixes[] = "Skipped $table.$index: " . $e->getMessage();
    }
}

try {
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS scheduled_games (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            host_id BIGINT NOT NULL,
            game_type VARCHAR(64) NOT NULL,
            title VARCHAR(120) NOT NULL,
            description TEXT NULL,
            starts_at DATETIME NOT NULL,
            min_players INT DEFAULT 2,
            max_players INT DEFAULT 8,
            status ENUM('scheduled', 'live', 'cancelled', 'expired') DEFAULT 'scheduled',
            room_id BIGINT NULL,
            room_code VARCHAR(16) NULL,
            opened_at DATETIME NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            cancelled_at DATETIME NULL,
            INDEX idx_scheduled_games_status_starts (status, starts_at),
            INDEX idx_scheduled_games_host (host_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");

    $fixes = [];
    scheduledAddColumnIfMissing($pdo, 'scheduled_games', 'host_id', 'BIGINT NULL AFTER id', $fixes);
    scheduledAddColumnIfMissing($pdo, 'scheduled_games', 'cancelled_at', 'DATETIME NULL AFTER created_at', $fixes);
    scheduledAddColumnIfMissing($pdo, 'scheduled_games', 'room_id', 'BIGINT NULL AFTER status', $fixes);
    scheduledAddColumnIfMissing($pdo, 'scheduled_games', 'room_code', 'VARCHAR(16) NULL AFTER room_id', $fixes);
    scheduledAddColumnIfMissing($pdo, 'scheduled_games', 'opened_at', 'DATETIME NULL AFTER room_code', $fixes);
    scheduledAddIndexIfMissing($pdo, 'scheduled_games', 'idx_scheduled_games_status_starts', '(status, starts_at)', $fixes);
    scheduledAddIndexIfMissing($pdo, 'scheduled_games', 'idx_scheduled_games_host', '(host_id)', $fixes);

    try {
        $pdo->exec("
            ALTER TABLE scheduled_games
            MODIFY status ENUM('scheduled', 'live', 'cancelled', 'expired', 'open', 'started') DEFAULT 'scheduled'
        ");
        $fixes[] = "Ensured scheduled_games.status supports live";
    } catch (PDOException $e) {
        $fixes[] = "Skipped scheduled_games.status enum update: " . $e->getMessage();
    }

    $pdo->exec("
        CREATE TABLE IF NOT EXISTS scheduled_game_subscriptions (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            scheduled_game_id BIGINT NOT NULL,
            user_id BIGINT NOT NULL,
            status ENUM('subscribed', 'cancelled') DEFAULT 'subscribed',
            remind_before_minutes INT DEFAULT 15,
            reminder_sent_at DATETIME NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            cancelled_at DATETIME NULL,
            UNIQUE KEY uniq_scheduled_game_subscriptions_game_user (scheduled_game_id, user_id),
            INDEX idx_scheduled_game_subscriptions_game (scheduled_game_id),
            INDEX idx_scheduled_game_subscriptions_user (user_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");

    try {
        $pdo->exec("
            UPDATE scheduled_games
            SET host_id = host_user_id
            WHERE host_id IS NULL
              AND host_user_id IS NOT NULL
        ");
    } catch (PDOException $e) {
        // Fresh MVP installs do not have host_user_id. Existing draft installs may.
    }

    echo "Migration 007: scheduled_games MVP schema is ready.\n";
    foreach ($fixes as $fix) {
        echo "- $fix\n";
    }
} catch (PDOException $e) {
    echo "Migration 007 Error: " . $e->getMessage() . "\n";
}
