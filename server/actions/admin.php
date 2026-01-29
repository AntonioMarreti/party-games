<?php

function action_admin_get_stats($pdo, $user, $data) {
    // Basic security: Check if user is an admin
    // For now, we can hardcode specific user IDs or add an 'is_admin' column to users.
    // Let's rely on a secret token for now or just open (as requested Strategy says "Telegram commands", but here we do API).
    // Better: Allow only if user ID matches specific IDs (e.g., Developer).
    
    // TEMPORARY: Allow anyone for demo, OR check specific ID
    // if ($user['id'] != 12345) sendError('Access Denied');
    
    $secret = $data['admin_secret'] ?? '';
    if ($secret !== 'MySuperSecretAdminKey123') sendError('Access Denied'); // Simple protection

    $stats = [];
    
    // 1. Total Users
    $stats['total_users'] = $pdo->query("SELECT COUNT(*) FROM users")->fetchColumn();
    
    // 2. Active Rooms
    $stats['active_rooms'] = $pdo->query("SELECT COUNT(*) FROM rooms WHERE status = 'playing'")->fetchColumn();
    
    // 3. Games Today
    $stats['games_today'] = $pdo->query("SELECT COUNT(*) FROM game_history WHERE created_at >= CURDATE()")->fetchColumn();
    
    // 4. Popular Games
    $popular = $pdo->query("SELECT game_type, COUNT(*) as count FROM game_history GROUP BY game_type ORDER BY count DESC LIMIT 5")->fetchAll();
    $stats['popular_games'] = $popular;
    
    echo json_encode(['status' => 'ok', 'analytics' => $stats]);
}

function action_reset_leaderboard($pdo, $user, $data) {
    // SECURITY: Demo only. Resets ALL stats.
    
    try {
        // Reset user_statistics to defaults
        $pdo->exec("UPDATE user_statistics SET 
            total_games_played = 0,
            total_wins = 0,
            total_losses = 0,
            win_streak = 0,
            longest_win_streak = 0,
            total_points_earned = 0,
            rating = 1000
        ");
        
        // Optional: Clear game history? 
        // For now, let's keep history but reset stats so leaderboard is clean.
        // If we want total wipe: $pdo->exec("TRUNCATE TABLE game_history"); 
        
        echo json_encode(['status' => 'ok', 'message' => "All stats reset to defaults"]);
    } catch (Exception $e) {
        sendError('Reset failed: ' . $e->getMessage());
    }
}

function action_seed_achievements($pdo, $user, $data) {
    // Basic Security: Admin only
    // if (!in_array($user['id'], ADMIN_IDS)) sendError('Access Denied');

    $achievements = [
        [
            'code' => 'first_win',
            'name' => 'First Victory',
            'description' => 'Win your first game',
            'icon' => '🏆',
            'category' => 'game',
            'condition_type' => 'wins',
            'condition_value' => 1
        ],
        [
            'code' => 'social_butterfly',
            'name' => 'Social Butterfly',
            'description' => 'Add 3 friends',
            'icon' => '🦋',
            'category' => 'social',
            'condition_type' => 'friends_added',
            'condition_value' => 3
        ],
        [
            'code' => 'veteran',
            'name' => 'Veteran',
            'description' => 'Play 50 games',
            'icon' => '🎖️',
            'category' => 'milestone',
            'condition_type' => 'games_played',
            'condition_value' => 50
        ],
        [
            'code' => 'champion',
            'name' => 'Champion',
            'description' => 'Win 10 games',
            'icon' => '👑',
            'category' => 'game',
            'condition_type' => 'wins',
            'condition_value' => 10
        ],
        [
            'code' => 'pacifist',
            'name' => '🕊️ Pacifist',
            'description' => 'Win Blokus without blocking anyone',
            'icon' => '🕊️',
            'category' => 'game',
            'condition_type' => 'game_event',
            'condition_value' => 0
        ],
        [
            'code' => 'flash',
            'name' => '⚡ Flash',
            'description' => 'Answer in under 0.5s',
            'icon' => '⚡',
            'category' => 'game',
            'condition_type' => 'game_event',
            'condition_value' => 500
        ],
        [
            'code' => 'brute',
            'name' => '🔪 Brute',
            'description' => 'Kick 3 people in Bunker',
            'icon' => '🔪',
            'category' => 'game',
            'condition_type' => 'game_event',
            'condition_value' => 3
        ]
    ];
    
    try {
        $stmt = $pdo->prepare("INSERT INTO achievements (code, name, description, icon, category, condition_type, condition_value) VALUES (?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE name=VALUES(name), description=VALUES(description), condition_value=VALUES(condition_value), icon=VALUES(icon)");
        
        foreach ($achievements as $ach) {
            $stmt->execute([
                $ach['code'], $ach['name'], $ach['description'], $ach['icon'], $ach['category'], $ach['condition_type'], $ach['condition_value']
            ]);
        }
        
        echo json_encode(['status' => 'ok', 'message' => 'Achievements seeded']);
    } catch (Exception $e) {
        sendError('Seeding failed: ' . $e->getMessage());
    }
}

function action_setup_reactions($pdo, $user, $data) {
    try {
        // 1. Room Events Table
        $sql = "CREATE TABLE IF NOT EXISTS room_events (
            id INT AUTO_INCREMENT PRIMARY KEY,
            room_id INT NOT NULL,
            user_id INT NOT NULL,
            type VARCHAR(32) NOT NULL,
            payload JSON DEFAULT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_room_time (room_id, created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;";
        $pdo->exec($sql);

        // 2. Add created_at to rooms if missing
        try {
            $pdo->exec("ALTER TABLE rooms ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP AFTER password");
        } catch (Exception $e) {
            // Probably already exists
        }
        
        echo json_encode(['status' => 'ok', 'message' => 'Migrations executed: room_events checked, rooms schema updated']);
    } catch (Exception $e) {
        sendError('Migration failed: ' . $e->getMessage());
    }
}

function action_db_doctor($pdo, $user, $data) {
    if (!$user['is_admin']) { 
        $secret = $data['admin_secret'] ?? '';
        if ($secret !== 'MySuperSecretAdminKey123') sendError('Access Denied');
    }

    $report = [
        'orphans' => [],
        'consistency' => [],
        'indices' => [],
        'stale_data' => [],
        'achievements' => []
    ];

    // 1. Orphaned Records
    $report['orphans']['room_players'] = $pdo->query("SELECT COUNT(*) FROM room_players rp LEFT JOIN users u ON rp.user_id = u.id WHERE u.id IS NULL")->fetchColumn();
    $report['orphans']['user_achievements'] = $pdo->query("SELECT COUNT(*) FROM user_achievements ua LEFT JOIN users u ON ua.user_id = u.id WHERE u.id IS NULL")->fetchColumn();
    $report['orphans']['user_statistics'] = $pdo->query("SELECT COUNT(*) FROM user_statistics us LEFT JOIN users u ON us.user_id = u.id WHERE u.id IS NULL")->fetchColumn();

    // 2. Missing Statistics (GAP: 41 users vs 14 stats)
    $report['consistency']['users_without_stats'] = $pdo->query("SELECT COUNT(*) FROM users u LEFT JOIN user_statistics us ON u.id = us.user_id WHERE us.user_id IS NULL")->fetchColumn();

    // 3. Room Leaks (Abandoned rooms)
    $report['stale_data']['total_rooms'] = $pdo->query("SELECT COUNT(*) FROM rooms")->fetchColumn();
    $report['stale_data']['empty_rooms'] = $pdo->query("SELECT COUNT(*) FROM rooms r LEFT JOIN room_players rp ON r.id = rp.room_id WHERE rp.user_id IS NULL")->fetchColumn();
    $report['stale_data']['ghost_events'] = $pdo->query("SELECT COUNT(*) FROM room_events re LEFT JOIN rooms r ON re.room_id = r.id WHERE r.id IS NULL")->fetchColumn();

    // 4. Missing Indices Check
    $indices = $pdo->query("SHOW INDEX FROM users")->fetchAll(PDO::FETCH_COLUMN, 2);
    if (!in_array('auth_token', $indices)) $report['indices'][] = 'Missing index on users(auth_token)';
    
    $indices_stats = $pdo->query("SHOW INDEX FROM user_statistics")->fetchAll(PDO::FETCH_COLUMN, 2);
    if (!in_array('user_id', $indices_stats)) $report['indices'][] = 'Missing index on user_statistics(user_id)';

    // 5. Achievement Stats
    $report['achievements']['total_unlocked'] = $pdo->query("SELECT COUNT(*) FROM user_achievements")->fetchColumn();
    $report['achievements']['available_types'] = $pdo->query("SELECT COUNT(*) FROM achievements")->fetchColumn();

    echo json_encode(['status' => 'ok', 'report' => $report]);
}

function action_db_repair($pdo, $user, $data) {
    if (!$user['is_admin']) {
        $secret = $data['admin_secret'] ?? '';
        if ($secret !== 'MySuperSecretAdminKey123') sendError('Access Denied');
    }

    $res = perform_db_repair($pdo);
    if ($res['status'] === 'ok') {
        echo json_encode(['status' => 'ok', 'fixes' => $res['fixes']]);
    } else {
        if ($pdo->inTransaction()) $pdo->rollBack(); // jic
        sendError($res['error']);
    }
}

/**
 * Reusable DB Repair Logic (Returns array ['status'=>'ok', 'fixes'=>[...]] or ['status'=>'error', ...])
 */
function perform_db_repair($pdo) {
    $fixes = [];
    try {
        // Note: We do NOT use a global transaction here because DDL statements (ALTER TABLE)
        // cause implicit commits in MySQL, breaking the transaction chain.
        // Since this is a repair script, partial execution is acceptable/expected compared to crashing.

        // Fix 0: Schema Updates (Bots)
        try {
            $pdo->exec("ALTER TABLE users ADD COLUMN is_bot TINYINT(1) DEFAULT 0");
            $fixes[] = "Added is_bot to users";
        } catch (Exception $e) {}

        try {
            $pdo->exec("ALTER TABLE room_players ADD COLUMN is_bot TINYINT(1) DEFAULT 0");
            $fixes[] = "Added is_bot to room_players";
        } catch (Exception $e) {}
        
        try {
            $pdo->exec("ALTER TABLE room_players ADD COLUMN bot_difficulty VARCHAR(16) DEFAULT 'medium'");
             $fixes[] = "Added bot_difficulty to room_players";
        } catch (Exception $e) {}

        // Fix 1: Initialize missing user stats
        $usersMissingStats = $pdo->query("SELECT u.id FROM users u LEFT JOIN user_statistics us ON u.id = us.user_id WHERE us.user_id IS NULL")->fetchAll(PDO::FETCH_COLUMN);
        if ($usersMissingStats) {
            $stmt = $pdo->prepare("INSERT IGNORE INTO user_statistics (user_id) VALUES (?)");
            foreach ($usersMissingStats as $uid) {
                $stmt->execute([$uid]);
            }
            $fixes[] = "Initialized stats for " . count($usersMissingStats) . " users";
        }

        // Fix 2: Add missing indices (if they don't exist)
        try {
            $pdo->exec("CREATE INDEX idx_users_auth ON users(auth_token)");
            $fixes[] = "Added index idx_users_auth";
        } catch (Exception $e) {}

        try {
            $pdo->exec("CREATE INDEX idx_stats_user ON user_statistics(user_id)");
            $fixes[] = "Added index idx_stats_user";
        } catch (Exception $e) {}

        // Fix 3: Clean up orphans and leaks
        $deletedPlayers = $pdo->exec("DELETE rp FROM room_players rp LEFT JOIN users u ON rp.user_id = u.id WHERE u.id IS NULL");
        if ($deletedPlayers) $fixes[] = "Cleaned $deletedPlayers orphaned players";

        // Fix 4: Clean up abandoned empty rooms (More aggressive for testing)
        // Delete rooms that have no players (any time)
        $deletedRooms = $pdo->exec("DELETE r FROM rooms r LEFT JOIN room_players rp ON r.id = rp.room_id WHERE rp.user_id IS NULL");
        if ($deletedRooms) $fixes[] = "Purged $deletedRooms abandoned empty rooms";

        // Fix 5: Clean up events of deleted rooms
        $deletedEvents = $pdo->exec("DELETE re FROM room_events re LEFT JOIN rooms r ON re.room_id = r.id WHERE r.id IS NULL");
        if ($deletedEvents) $fixes[] = "Cleaned $deletedEvents orphaned events";

        // Fix 6: Retroactive Achievements
        $allUserIds = $pdo->query("SELECT id FROM users")->fetchAll(PDO::FETCH_COLUMN);
        foreach ($allUserIds as $uid) {
            check_achievements($pdo, $uid);
        }
        $fixes[] = "Performed retroactive achievement check for " . count($allUserIds) . " users";

        // Fix 7: Retroactive XP Recalculation
        foreach ($allUserIds as $uid) {
            $stmt = $pdo->prepare("SELECT final_position, final_score FROM game_history_players WHERE user_id = ?");
            $stmt->execute([$uid]);
            $history = $stmt->fetchAll();
            
            $totalXP = 0;
            foreach ($history as $game) {
                $totalXP += calculateXP((int)$game['final_position'], (int)$game['final_score']);
            }
            
            $pdo->prepare("UPDATE user_statistics SET total_points_earned = ? WHERE user_id = ?")->execute([$totalXP, $uid]);
        }
        $fixes[] = "Recalculated XP for " . count($allUserIds) . " users based on game history";

        return ['status' => 'ok', 'fixes' => $fixes];

    } catch (Exception $e) {
        return ['status' => 'error', 'error' => $e->getMessage()];
    }
}
