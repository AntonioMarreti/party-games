<?php

// === GAME HISTORY & STATS ===

function action_game_finished($pdo, $user, $data) {
    // 1. Validation
    $room = getRoom($user['id']);
    if (!$room) sendError('No room');
    
    // Only Host can submit results to prevent cheating/spam
    if (!$room['is_host']) sendError('Only host can submit results');

    $gameType = $room['game_type'];
    $playersData = $data['players_data'] ?? []; // Array of {user_id, rank, score, ...}
    
    // If sent as JSON string from client
    if (is_string($playersData)) {
        $playersData = json_decode($playersData, true) ?? [];
    }
    
    try {
        $pdo->beginTransaction();

        // Use Helper
        recordGameStats($pdo, $room, $playersData, (int)($data['duration'] ?? 0));

        // 4. Update Room State (Back to Lobby)
        $pdo->prepare("UPDATE rooms SET game_type = 'lobby', status = 'waiting', game_state = NULL WHERE id = ?")->execute([$room['id']]);

        $pdo->commit();
        echo json_encode(['status' => 'ok']);
        
    } catch (Exception $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        TelegramLogger::log("Game Finish Error", ['error' => $e->getMessage(), 'room' => $room['room_code']]);
        sendError('Stats Error');
    }
}

function recordGameStats($pdo, $room, $playersData, $duration) {
    // 2. Create Game History
    $stmt = $pdo->prepare("INSERT INTO game_history (room_code, game_type, host_user_id, players_count, duration_seconds) VALUES (?, ?, ?, ?, ?)");
    $stmt->execute([
        $room['room_code'], 
        $room['game_type'], 
        $room['host_user_id'], 
        count($playersData),
        $duration
    ]);
    $gameHistoryId = $pdo->lastInsertId();

    // 3. Process Each Player
    foreach ($playersData as $pData) {
        $pid = (int)$pData['user_id'];
        $rank = (int)$pData['rank']; // 1 = winner
        $dScore = (int)($pData['score'] ?? 0);
        
        // A. Record History Player
        $pdo->prepare("INSERT INTO game_history_players (game_history_id, user_id, final_position, final_score) VALUES (?, ?, ?, ?)")
            ->execute([$gameHistoryId, $pid, $rank, $dScore]);
        
        // B. Update User Stats (Atomic Update)
        updateUserStats($pdo, $pid, $rank, $dScore, $gameHistoryId);
    }

    TelegramLogger::logEvent('game', "Game Finished", [
        'id' => $gameHistoryId,
        'type' => $room['game_type'],
        'players' => count($playersData)
    ]);

    // 5. Trigger Achievements for ALL players
    foreach ($playersData as $pData) {
        if (function_exists('check_achievements')) {
            $context = $pData;
            $context['game_type'] = $room['game_type'];
            check_achievements($pdo, $pData['user_id'], $context);
        }
    }
}

function updateUserStats($pdo, $userId, $rank, $score, $gameId) {
    // Get current stats (for Elo and Streak)
    $stmt = $pdo->prepare("SELECT * FROM user_statistics WHERE user_id = ?");
    $stmt->execute([$userId]);
    $stats = $stmt->fetch();
    
    if (!$stats) {
        $pdo->prepare("INSERT IGNORE INTO user_statistics (user_id) VALUES (?)")->execute([$userId]);
        $stats = ['total_wins' => 0, 'total_losses' => 0, 'win_streak' => 0, 'longest_win_streak' => 0, 'rating' => 1000, 'total_points_earned' => 0];
    }
    
    $isWin = ($rank === 1);
    
    // Calc New Stats
    $newWins = $stats['total_wins'] + ($isWin ? 1 : 0);
    $newLosses = $stats['total_losses'] + ($isWin ? 0 : 1);
    $newStreak = $isWin ? ($stats['win_streak'] + 1) : 0;
    $newMaxStreak = max($stats['longest_win_streak'], $newStreak);
    
    // Use the balanced helper
    $xpGained = calculateXP($rank, $score);
    $newPoints = $stats['total_points_earned'] + $xpGained;
    
    // ELO CALCULATION (Simplified)
    // Real Elo needs opponent rating. Here we assume "Environment Rating" = 1200 or Average of room?
    // Let's use simple constant gain/loss for now to keep it robust
    $k = 32;
    $ratingChange = 0;
    if ($isWin) $ratingChange = $k; 
    else $ratingChange = -$k / 2; // Lose less than win
    
    $newRating = max(0, $stats['rating'] + $ratingChange); // No negative rating
    
    // UPDATE DB
    $sql = "UPDATE user_statistics SET 
        total_games_played = total_games_played + 1,
        total_wins = ?,
        total_losses = ?,
        win_streak = ?,
        longest_win_streak = ?,
        total_points_earned = ?,
        rating = ?
        WHERE user_id = ?";
        
    $pdo->prepare($sql)->execute([
        $newWins, $newLosses, $newStreak, $newMaxStreak, $newPoints, $newRating, $userId
    ]);
}

// === LEADERBOARDS ===

function action_get_leaderboard($pdo, $user, $data) {
    $type = $data['type'] ?? 'global'; // 'global', 'friends'
    $limit = (int)($data['limit'] ?? 50);
    if ($limit > 100) $limit = 100;
    
    try {
        if ($type === 'global') {
            $sql = "
                SELECT s.rating, s.total_wins, s.total_points_earned, u.id, u.first_name, u.custom_name, u.photo_url, u.custom_avatar
                FROM user_statistics s
                JOIN users u ON u.id = s.user_id
                WHERE u.is_hidden_in_leaderboard = 0
                ORDER BY s.total_points_earned DESC
                LIMIT $limit
            ";
            $board = $pdo->query($sql)->fetchAll();
            foreach ($board as &$entry) {
                $entry['level'] = calculateLevel($entry['total_points_earned'] ?? 0); // Note: verify if total_points_earned is selected
            }
        } 
        elseif ($type === 'friends') {
            // Get friends IDs first
            // Reuse logic from get_friends query but simplified
            $friendsSql = "
                SELECT CASE WHEN user_id = ? THEN friend_id ELSE user_id END as uid
                FROM friendships 
                WHERE (user_id = ? OR friend_id = ?) AND status = 'accepted'
            ";
            $stmt = $pdo->prepare($friendsSql);
            $stmt->execute([$user['id'], $user['id'], $user['id']]);
            $fids = $stmt->fetchAll(PDO::FETCH_COLUMN);
            $fids[] = $user['id']; // Include self
            
            $placeholders = implode(',', array_fill(0, count($fids), '?'));
            
            $sql = "
                SELECT s.rating, s.total_wins, s.total_points_earned, u.id, u.first_name, u.custom_name, u.photo_url, u.custom_avatar
                FROM user_statistics s
                JOIN users u ON u.id = s.user_id
                WHERE s.user_id IN ($placeholders)
                ORDER BY s.total_points_earned DESC
                LIMIT $limit
            ";
            $stmt = $pdo->prepare($sql);
            $stmt->execute($fids);
            $board = $stmt->fetchAll();
            foreach ($board as &$entry) {
                $entry['level'] = calculateLevel($entry['total_points_earned'] ?? 0);
            }
        }
        else {
            $board = [];
        }
        
        echo json_encode(['status' => 'ok', 'leaderboard' => $board]);
        
    } catch (Exception $e) {
        TelegramLogger::log("Leaderboard Error", ['error' => $e->getMessage()]);
        sendError('Database Error');
    }
}

function action_get_stats($pdo, $user, $data) {
    $targetId = (int)($data['user_id'] ?? $user['id']);
    
    $stmt = $pdo->prepare("SELECT * FROM user_statistics WHERE user_id = ?");
    $stmt->execute([$targetId]);
    $stats = $stmt->fetch();
    
    if (!$stats) {
        // Return empty stats if not played yet, but strictly formatted
        $stats = [
            'user_id' => $targetId,
            'total_games_played' => 0,
            'total_wins' => 0,
            'total_losses' => 0,
            'win_streak' => 0,
            'longest_win_streak' => 0,
            'rating' => 1000,
            'total_points_earned' => 0
        ];
    }
    
    $stats['level'] = calculateLevel($stats['total_points_earned']);
    
    // Add Level
    $stats['level'] = calculateLevel($stats['total_points_earned'] ?? 0);

    // Add Achievements
    $stmt = $pdo->prepare("SELECT a.*, ua.unlocked_at FROM achievements a JOIN user_achievements ua ON ua.achievement_id = a.id WHERE ua.user_id = ?");
    $stmt->execute([$targetId]);
    $stats['achievements'] = $stmt->fetchAll();

    echo json_encode(['status' => 'ok', 'stats' => $stats]);
}
