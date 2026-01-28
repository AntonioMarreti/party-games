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
