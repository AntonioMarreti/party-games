<?php
require_once 'config.php';

try {
    echo "Starting Phase 1 Migration...<br>";
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    // 1. friendships
    $pdo->exec("CREATE TABLE IF NOT EXISTS friendships (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        friend_id INT NOT NULL,
        status ENUM('pending', 'accepted', 'blocked') DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_friendship (user_id, friend_id),
        INDEX idx_user (user_id),
        INDEX idx_friend (friend_id)
    )");
    echo "Table 'friendships' created/checked.<br>";

    // 2. subscriptions
    $pdo->exec("CREATE TABLE IF NOT EXISTS subscriptions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        follower_id INT NOT NULL,
        following_id INT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY unique_subscription (follower_id, following_id),
        INDEX idx_follower (follower_id),
        INDEX idx_following (following_id)
    )");
    echo "Table 'subscriptions' created/checked.<br>";

    // 3. achievements
    $pdo->exec("CREATE TABLE IF NOT EXISTS achievements (
        id INT AUTO_INCREMENT PRIMARY KEY,
        code VARCHAR(64) UNIQUE NOT NULL,
        name VARCHAR(128) NOT NULL,
        description VARCHAR(255),
        icon VARCHAR(255),
        category ENUM('game', 'social', 'milestone') DEFAULT 'game',
        condition_type VARCHAR(64),
        condition_value INT DEFAULT 0,
        is_hidden TINYINT(1) DEFAULT 0
    )");
    echo "Table 'achievements' created/checked.<br>";

    // 4. user_achievements
    $pdo->exec("CREATE TABLE IF NOT EXISTS user_achievements (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        achievement_id INT NOT NULL,
        unlocked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY unique_user_achievement (user_id, achievement_id),
        INDEX idx_user (user_id)
    )");
    echo "Table 'user_achievements' created/checked.<br>";

    // 5. user_statistics
    $pdo->exec("CREATE TABLE IF NOT EXISTS user_statistics (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL UNIQUE,
        total_games_played INT DEFAULT 0,
        total_wins INT DEFAULT 0,
        total_losses INT DEFAULT 0,
        win_streak INT DEFAULT 0,
        longest_win_streak INT DEFAULT 0,
        average_game_duration INT DEFAULT 0,
        total_points_earned INT DEFAULT 0,
        rating INT DEFAULT 1000,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )");
    echo "Table 'user_statistics' created/checked.<br>";

    // 6. game_history
    $pdo->exec("CREATE TABLE IF NOT EXISTS game_history (
        id INT AUTO_INCREMENT PRIMARY KEY,
        room_code VARCHAR(10),
        game_type VARCHAR(64),
        host_user_id INT,
        players_count INT DEFAULT 0,
        winner_user_id INT DEFAULT NULL,
        duration_seconds INT DEFAULT 0,
        game_data JSON,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_host (host_user_id),
        INDEX idx_game_type (game_type)
    )");
    echo "Table 'game_history' created/checked.<br>";

    // 7. game_history_players
    $pdo->exec("CREATE TABLE IF NOT EXISTS game_history_players (
        id INT AUTO_INCREMENT PRIMARY KEY,
        game_history_id INT NOT NULL,
        user_id INT NOT NULL,
        final_position INT DEFAULT 0,
        final_score INT DEFAULT 0,
        performance_data JSON,
        INDEX idx_game (game_history_id),
        INDEX idx_user (user_id)
    )");
    echo "Table 'game_history_players' created/checked.<br>";

    // 8. leaderboards (denormalized)
    $pdo->exec("CREATE TABLE IF NOT EXISTS leaderboards (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        leaderboard_type VARCHAR(32) NOT NULL,
        game_type VARCHAR(64) DEFAULT NULL,
        rank_position INT NOT NULL,
        score INT NOT NULL,
        period_start DATE DEFAULT NULL,
        period_end DATE DEFAULT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_type (leaderboard_type, game_type)
    )");
    echo "Table 'leaderboards' created/checked.<br>";

    // 9. notifications
    $pdo->exec("CREATE TABLE IF NOT EXISTS notifications (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        type VARCHAR(64) NOT NULL,
        actor_user_id INT DEFAULT NULL,
        related_id INT DEFAULT NULL,
        message TEXT,
        is_read TINYINT(1) DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME DEFAULT NULL,
        INDEX idx_user_read (user_id, is_read)
    )");
    echo "Table 'notifications' created/checked.<br>";

    // 10. public_rooms
    $pdo->exec("CREATE TABLE IF NOT EXISTS public_rooms (
        id INT AUTO_INCREMENT PRIMARY KEY,
        room_id INT NOT NULL UNIQUE,
        title VARCHAR(64),
        description VARCHAR(255),
        visibility ENUM('public', 'friends_only', 'private') DEFAULT 'public',
        is_featured TINYINT(1) DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )");
    echo "Table 'public_rooms' created/checked.<br>";

    echo "Migration Completed Successfully.";

} catch (PDOException $e) {
    echo "Migration Error: " . $e->getMessage();
}
