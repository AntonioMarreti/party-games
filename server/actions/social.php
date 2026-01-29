<?php

// === FRIENDSHIP ACTIONS ===

function action_add_friend($pdo, $user, $data) {
    $friendId = (int)($data['friend_id'] ?? 0);
    
    // Validation
    if (!$friendId || $friendId == $user['id']) sendError('Invalid user ID');
    
    // Check if target user exists
    $stmt = $pdo->prepare("SELECT id FROM users WHERE id = ?");
    $stmt->execute([$friendId]);
    if (!$stmt->fetch()) sendError('User not found');
    
    try {
        // Check existing friendship
        $stmt = $pdo->prepare("SELECT * FROM friendships WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)");
        $stmt->execute([$user['id'], $friendId, $friendId, $user['id']]);
        $existing = $stmt->fetch();
        
        if ($existing) {
            if ($existing['status'] === 'blocked') sendError('Action not allowed');
            if ($existing['status'] === 'accepted') sendError('Already friends');
            if ($existing['status'] === 'pending') {
                if ($existing['user_id'] == $user['id']) sendError('Request already sent');
                else {
                    // This is actually an accept action if the other person sent it, 
                    // but let's force them to use accept_friend for clarity, or auto-accept?
                    // Strategy says: "Request already sent".
                    sendError('Request pending');
                }
            }
        }
        
        // Create Request
        $stmt = $pdo->prepare("INSERT INTO friendships (user_id, friend_id, status) VALUES (?, ?, 'pending')");
        $stmt->execute([$user['id'], $friendId]);
        
        // Notify Target inside App
        createNotification($pdo, $friendId, 'friend_request', $user['id']);

        // Notify Target via Telegram
        try {
            $stmt = $pdo->prepare("SELECT telegram_id, first_name FROM users WHERE id = ?");
            $stmt->execute([$friendId]);
            $targetUser = $stmt->fetch();

            if ($targetUser && !empty($targetUser['telegram_id'])) {
                $msg = "👋 <b>Боец, у тебя новая заявка в друзья!</b>\n\n" .
                       "👤 <b>" . htmlspecialchars($user['custom_name'] ?? $user['first_name']) . "</b> хочет добавить тебя.";
                
                $keyboard = [
                    'inline_keyboard' => [[
                        ['text' => '🎮 Открыть Party Games', 'web_app' => ['url' => 'https://lapin.live/mpg/']]
                    ]]
                ];

                TelegramLogger::sendRequest('sendMessage', [
                    'chat_id' => $targetUser['telegram_id'],
                    'text' => $msg,
                    'parse_mode' => 'HTML',
                    'reply_markup' => json_encode($keyboard)
                ]);
            }
        } catch (Exception $e) {
            // Ignore telegram sending errors (blocked bot etc)
        }
        
        echo json_encode(['status' => 'ok', 'friendship_status' => 'pending']);
        
    } catch (Exception $e) {
        TelegramLogger::logError('database', [
            'message' => $e->getMessage(),
            'code' => $e->getCode(),
            'stack' => $e->getTraceAsString()
        ], [
            'user_id' => $user['id'],
            'action' => 'add_friend',
            'friend_id' => $friendId
        ]);
        sendError('Database Error');
    }
}

function action_get_public_profile($pdo, $user, $data) {
    $targetId = (int)($data['user_id'] ?? 0);
    if (!$targetId) sendError('Invalid user ID');
    
    // 1. Get User Info
    $stmt = $pdo->prepare("SELECT id, first_name, custom_name, photo_url, custom_avatar FROM users WHERE id = ?");
    $stmt->execute([$targetId]);
    $targetUser = $stmt->fetch();
    
    if (!$targetUser) sendError('User not found');
    
    // 2. Get Stats
    $stmt = $pdo->prepare("SELECT total_wins, total_games_played, rating, total_points_earned FROM user_statistics WHERE user_id = ?");
    $stmt->execute([$targetId]);
    $stats = $stmt->fetch();
    if (!$stats) $stats = ['total_wins' => 0, 'total_games_played' => 0, 'rating' => 1000, 'total_points_earned' => 0];
    
    // Add Level
    $stats['level'] = calculateLevel($stats['total_points_earned'] ?? 0);
    
    // 3. Get Friendship Status
    $friendStatus = 'none'; // none, pending_out, pending_in, accepted, self
    
    if ($targetId == $user['id']) {
        $friendStatus = 'self';
    } else {
        $stmt = $pdo->prepare("SELECT * FROM friendships WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)");
        $stmt->execute([$user['id'], $targetId, $targetId, $user['id']]);
        $rel = $stmt->fetch();
        
        if ($rel) {
            if ($rel['status'] === 'accepted') {
                $friendStatus = 'accepted';
            } elseif ($rel['status'] === 'pending') {
                if ($rel['user_id'] == $user['id']) $friendStatus = 'pending_out'; // I sent it
                else $friendStatus = 'pending_in'; // They sent it
            }
        }
    }
    
    // 4. Get Achievements
    $stmt = $pdo->prepare("SELECT a.*, ua.unlocked_at FROM achievements a JOIN user_achievements ua ON ua.achievement_id = a.id WHERE ua.user_id = ?");
    $stmt->execute([$targetId]);
    $achievements = $stmt->fetchAll();

    echo json_encode([
        'status' => 'ok',
        'profile' => array_merge($targetUser, $stats),
        'friend_status' => $friendStatus,
        'achievements' => $achievements
    ]);
}

function action_accept_friend($pdo, $user, $data) {
    $requesterId = (int)($data['friend_id'] ?? 0);
    if (!$requesterId) sendError('Invalid ID');
    
    try {
        // Find the pending request where I am the friend_id
        $stmt = $pdo->prepare("SELECT id FROM friendships WHERE user_id = ? AND friend_id = ? AND status = 'pending'");
        $stmt->execute([$requesterId, $user['id']]);
        $request = $stmt->fetch();
        
        if (!$request) {
            TelegramLogger::logError('friend_debug', [
                'message' => 'No pending request found', 
                'requester_id' => $requesterId, 
                'my_id' => $user['id']
            ]);
            sendError('No pending request found');
        }
        
        // Update status
        $pdo->prepare("UPDATE friendships SET status = 'accepted' WHERE id = ?")->execute([$request['id']]);
        
        // Notify Requester inside App
        createNotification($pdo, $requesterId, 'friend_accepted', $user['id']);

        // Check Achievements for both
        check_achievements($pdo, $user['id']);
        check_achievements($pdo, $requesterId);

        // Notify Requester via Telegram
        try {
            $stmt = $pdo->prepare("SELECT telegram_id, first_name FROM users WHERE id = ?");
            $stmt->execute([$requesterId]);
            $requester = $stmt->fetch();

            if ($requester && !empty($requester['telegram_id'])) {
                $msg = "✅ <b>Ура! Новая дружба!</b>\n\n" .
                       "👤 <b>" . htmlspecialchars($user['custom_name'] ?? $user['first_name']) . "</b> принял(а) твою заявку в друзья.\n\n" .
                       "Теперь вы можете видеть друг друга в таблице лидеров друзей!";
                
                $keyboard = [
                    'inline_keyboard' => [[
                        ['text' => '🎮 Открыть Party Games', 'web_app' => ['url' => 'https://lapin.live/mpg/']]
                    ]]
                ];

                TelegramLogger::sendRequest('sendMessage', [
                    'chat_id' => $requester['telegram_id'],
                    'text' => $msg,
                    'parse_mode' => 'HTML',
                    'reply_markup' => json_encode($keyboard)
                ]);
            }
        } catch (Exception $e) {}
        
        echo json_encode(['status' => 'ok']);
        
    } catch (Exception $e) {
        TelegramLogger::logError('database', [
            'message' => $e->getMessage(),
            'code' => $e->getCode(),
            'stack' => $e->getTraceAsString()
        ], [
            'user_id' => $user['id'],
            'action' => 'accept_friend',
            'requester_id' => $requesterId
        ]);
        sendError('Database Error');
    }
}

function action_remove_friend($pdo, $user, $data) {
    $targetId = (int)($data['friend_id'] ?? 0);
    if (!$targetId) sendError('Invalid ID');
    
    try {
        // Delete any friendship record between these two
        $stmt = $pdo->prepare("DELETE FROM friendships WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)");
        $stmt->execute([$user['id'], $targetId, $targetId, $user['id']]);
        
        echo json_encode(['status' => 'ok']);
    } catch (Exception $e) {
        sendError('Database Error');
    }
}

function action_get_friends($pdo, $user, $data) {
    try {
        // Get all ACCEPTED friendships
        // We need to join users to get names/avatars
        // Complex query because user could be user_id OR friend_id
        
        $sql = "
            SELECT u.id, u.first_name, u.custom_name, u.photo_url, u.custom_avatar, f.status
            FROM friendships f
            JOIN users u ON (u.id = CASE WHEN f.user_id = ? THEN f.friend_id ELSE f.user_id END)
            WHERE (f.user_id = ? OR f.friend_id = ?) AND f.status = 'accepted'
        ";
        
        $stmt = $pdo->prepare($sql);
        $stmt->execute([$user['id'], $user['id'], $user['id']]);
        $friends = $stmt->fetchAll();
        
        // Also get pending requests (incoming)
        $sqlPending = "
            SELECT u.id, u.first_name, u.custom_name, u.photo_url, u.custom_avatar
            FROM friendships f
            JOIN users u ON u.id = f.user_id
            WHERE f.friend_id = ? AND f.status = 'pending'
        ";
        $stmt = $pdo->prepare($sqlPending);
        $stmt->execute([$user['id']]);
        $requests = $stmt->fetchAll();
        
        echo json_encode(['status' => 'ok', 'friends' => $friends, 'requests' => $requests]);
        
    } catch (Exception $e) {
        TelegramLogger::logError('database', [
            'message' => $e->getMessage(),
            'code' => $e->getCode(),
            'stack' => $e->getTraceAsString()
        ], [
            'user_id' => $user['id'],
            'action' => 'get_friends'
        ]);
        sendError('Database Error');
    }
}

// === SUBSCRIPTION ACTIONS ===

function action_subscribe($pdo, $user, $data) {
    $targetId = (int)($data['target_id'] ?? 0);
    if (!$targetId || $targetId == $user['id']) sendError('Invalid ID');
    
    try {
        // IGNORE to prevent duplicates
        $pdo->prepare("INSERT IGNORE INTO subscriptions (follower_id, following_id) VALUES (?, ?)")
            ->execute([$user['id'], $targetId]);
            
        createNotification($pdo, $targetId, 'new_follower', $user['id']);
        
        echo json_encode(['status' => 'ok']);
    } catch (Exception $e) {
        sendError('Database Error');
    }
}

function action_unsubscribe($pdo, $user, $data) {
    $targetId = (int)($data['target_id'] ?? 0);
    if (!$targetId) sendError('Invalid ID');
    
    $pdo->prepare("DELETE FROM subscriptions WHERE follower_id = ? AND following_id = ?")
        ->execute([$user['id'], $targetId]);
        
    echo json_encode(['status' => 'ok']);
}

function action_get_social_graph($pdo, $user, $data) {
    // Return followers and following counts/lists
    // For now, simpler version
    
    $followers = $pdo->prepare("SELECT COUNT(*) FROM subscriptions WHERE following_id = ?");
    $followers->execute([$user['id']]);
    $followersCount = $followers->fetchColumn();
    
    $following = $pdo->prepare("SELECT COUNT(*) FROM subscriptions WHERE follower_id = ?");
    $following->execute([$user['id']]);
    $followingCount = $following->fetchColumn();
    
    echo json_encode([
        'status' => 'ok', 
        'followers_count' => $followersCount, 
        'following_count' => $followingCount
    ]);
}

// === ACHIEVEMENTS ===

function action_get_achievements($pdo, $user, $data) {
    $stmt = $pdo->prepare("SELECT a.*, ua.unlocked_at FROM achievements a LEFT JOIN user_achievements ua ON ua.achievement_id = a.id AND ua.user_id = ?");
    $stmt->execute([$user['id']]);
    echo json_encode(['status' => 'ok', 'achievements' => $stmt->fetchAll()]);
}


// === INVITE SYSTEM ===

function action_invite_friends($pdo, $user, $data) {
    if (!isset($data['friends']) || !is_array($data['friends']) || empty($data['friends'])) {
        sendError('Не выбраны друзья для приглашения');
    }
    if (!isset($data['room_id'])) {
        sendError('Не указана комната');
    }

    $roomId = intval($data['room_id']);
    // Check if room exists AND get code
    $stmt = $pdo->prepare("SELECT id, room_code FROM rooms WHERE id = ?"); 
    $stmt->execute([$roomId]);
    $room = $stmt->fetch();

    if (!$room) {
        TelegramLogger::logError('invite_debug', ['message' => 'Room not found or inactive', 'room_id' => $roomId]);
        sendError('Комната не найдена (или закрыта)');
    }

    $friendIds = $data['friends'];

    $sentCount = 0;
    
    // Optimize: Fetch telegram_ids for all friends in one query
    $in  = str_repeat('?,', count($friendIds) - 1) . '?';
    $sql = "SELECT id, telegram_id, first_name FROM users WHERE id IN ($in)";
    $stmt = $pdo->prepare($sql);
    $stmt->execute($friendIds);
    $friends = $stmt->fetchAll();

    foreach ($friends as $friend) {
        if (!empty($friend['telegram_id'])) {
            try {
                // Determine user name
                $senderName = !empty($user['custom_name']) ? $user['custom_name'] : $user['first_name'];
                
                $message = "<tg-emoji emoji-id=\"6023852878597200124\">🎮</tg-emoji> <b>Приглашение в игру!</b>\n\n";
                $message .= "$senderName зовет тебя поиграть!\n";
                $message .= "Заходи, пока место не заняли!";

                $keyboard = [
                    'inline_keyboard' => [[
                        [
                            'text' => 'Зайти в комнату',
                            'url' => "https://t.me/" . BOT_USERNAME . "/app?startapp={$room['room_code']}"
                        ]
                    ]]
                ];

                TelegramLogger::sendAnalytics("Invite Sent", "User {$user['id']} invited friend {$friend['id']} to room $roomId");

                // Use direct curl for custom message with keyboard
                $url = "https://api.telegram.org/bot" . BOT_TOKEN . "/sendMessage";
                $postData = [
                    'chat_id' => $friend['telegram_id'],
                    'text' => $message,
                    'parse_mode' => 'HTML',
                    'reply_markup' => json_encode($keyboard)
                ];

                $ch = curl_init();
                curl_setopt($ch, CURLOPT_URL, $url);
                curl_setopt($ch, CURLOPT_POST, 1);
                curl_setopt($ch, CURLOPT_POSTFIELDS, $postData);
                curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
                curl_setopt($ch, CURLOPT_TIMEOUT, 2); 
                curl_exec($ch);
                curl_close($ch);
                
                $sentCount++;
            } catch (Exception $e) {
                TelegramLogger::logError('invite_send_error', ['user' => $friend['id'], 'msg' => $e->getMessage()]);
            }
        }
    }

    echo json_encode(['status' => 'ok', 'sent_count' => $sentCount]);
}

// === NOTIFICATIONS ===

function action_get_notifications($pdo, $user, $data) {
    try {
        // Fetch unread + last 20 read
        $stmt = $pdo->prepare("
            SELECT n.*, u.first_name as actor_name, u.photo_url as actor_avatar
            FROM notifications n
            LEFT JOIN users u ON u.id = n.actor_user_id
            WHERE n.user_id = ?
            ORDER BY n.created_at DESC
            LIMIT 50
        ");
        $stmt->execute([$user['id']]);
        $notifs = $stmt->fetchAll();
        
        // Count unread
        $unread = 0;
        foreach ($notifs as $n) {
            if ($n['is_read'] == 0) $unread++;
        }
        
        echo json_encode(['status' => 'ok', 'notifications' => $notifs, 'unread_count' => $unread]);
    } catch (Exception $e) {
        TelegramLogger::logError('database', ['msg' => $e->getMessage()], ['user' => $user['id']]);
        sendError('Database Error');
    }
}

function action_mark_notification_read($pdo, $user, $data) {
    $nid = intval($data['notification_id'] ?? 0);
    if (!$nid) sendError('Invalid ID');
    
    $pdo->prepare("UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?")
        ->execute([$nid, $user['id']]);
        
    echo json_encode(['status' => 'ok']);
}

