<?php

function action_create_room($pdo, $user, $data) {
    global $currentUser; // Fallback if passed differently

    // 0. Garbage Collection (Clean old rooms)
    cleanupOldRooms($pdo);

    try {
        $pdo->beginTransaction();

        // 1. Сначала удаляем игрока из старых комнат
        clearUserRooms($pdo, $user['id']);

        $code = strtoupper(substr(md5(uniqid()), 0, 6)); // 6 chars
        $pass = !empty($data['password']) ? password_hash($data['password'], PASSWORD_DEFAULT) : null;
        
        $pdo->prepare("INSERT INTO rooms (room_code, host_user_id, password) VALUES (?, ?, ?)")->execute([$code, $user['id'], $pass]);
        $rid = $pdo->lastInsertId();
        
        $pdo->prepare("INSERT INTO room_players (room_id, user_id, is_host) VALUES (?, ?, 1)")->execute([$rid, $user['id']]);
        
        $pdo->commit();

        TelegramLogger::logEvent('room', "Room Created", [
            'id' => $rid,
            'code' => $code,
            'host' => $user['first_name'] . " (ID: " . $user['id'] . ")"
        ]);

        echo json_encode(['status' => 'ok', 'room_code' => $code]);
    } catch (Exception $e) {
        $pdo->rollBack();
        TelegramLogger::log("Create Room Error", ['error' => $e->getMessage(), 'user_id' => $user['id']]);
        sendError('Database Error');
    }
}

function action_join_room($pdo, $user, $data) {
    $code = strtoupper($data['room_code'] ?? '');
    
    $stmt = $pdo->prepare("SELECT * FROM rooms WHERE room_code = ?");
    $stmt->execute([$code]);
    $room = $stmt->fetch();
    
    if (!$room) sendError('Комната не найдена');
    if ($room['password'] && !password_verify($data['password'] ?? '', $room['password'])) sendError('Неверный пароль');
    
    try {
        $pdo->beginTransaction();

        // 1. Сначала удаляем игрока из старых комнат
        clearUserRooms($pdo, $user['id']);
        
        // 2. Добавляем в новую
        $pdo->prepare("INSERT INTO room_players (room_id, user_id) VALUES (?, ?)")->execute([$room['id'], $user['id']]);
        
        $pdo->commit();
        echo json_encode(['status' => 'ok', 'room_code' => $code]);
    } catch (Exception $e) {
        $pdo->rollBack();
        TelegramLogger::log("Join Room Error", ['error' => $e->getMessage(), 'user_id' => $user['id']]);
        sendError('Join Error');
    }
}

function action_leave_room($pdo, $user, $data) {
    // 1. Get Room BEFORE leaving (to check if it becomes empty)
    $room = getRoom($user['id']);
    
    // 2. Remove User
    clearUserRooms($pdo, $user['id']);
    
    // 3. Cleanup Logic
    if ($room) {
        $roomId = $room['id'];
        
        // Count REMAINING Humans
        // We join with users table and check is_bot flag
        // (Assuming we added is_bot column in previous repairs, or we check telegram_id < 0)
        // Safer to check room_players count where associated user is NOT a bot.
        
        // Note: RP table now has is_bot column (added in migration/repair).
        // Let's use that for efficiency.
        $stmt = $pdo->prepare("SELECT COUNT(*) FROM room_players WHERE room_id = ? AND is_bot = 0");
        $stmt->execute([$roomId]);
        $humansLeft = $stmt->fetchColumn();
        
        if ($humansLeft == 0) {
            // No humans left. Kill the room and all bots in it.
            
            // A. Get Bot User IDs to delete their Shadow User accounts
            $stmt = $pdo->prepare("SELECT user_id FROM room_players WHERE room_id = ? AND is_bot = 1");
            $stmt->execute([$roomId]);
            $botIds = $stmt->fetchAll(PDO::FETCH_COLUMN);
            
            // B. Delete Room
            $pdo->prepare("DELETE FROM rooms WHERE id = ?")->execute([$roomId]);
            
            // C. Delete Room Players (Cascade might handle this if FK, but do explicit)
            $pdo->prepare("DELETE FROM room_players WHERE room_id = ?")->execute([$roomId]);
            
            // D. Delete Shadow Users (Clean up users table) - DISABLED FOR SINGLETON BOTS
            // We now want bots to persist to keep their stats/achievements.
            // if (!empty($botIds)) {
            //    $placeholders = implode(',', array_fill(0, count($botIds), '?'));
            //    $pdo->prepare("DELETE FROM users WHERE id IN ($placeholders)")->execute($botIds);
            // }
            
            TelegramLogger::logEvent('room_cleanup', "Cleaned Bot Room (Bots Persisted)", ['room_id' => $roomId, 'bots_in_room' => count($botIds)]);
        }
    }

    echo json_encode(['status' => 'ok']);
}

function action_kick_player($pdo, $user, $data) {
    $room = getRoom($user['id']);
    if (!$room) sendError('No room');
    if (!$room['is_host']) sendError('Not host');
    
    $targetId = $data['target_id'] ?? 0;
    if ($targetId == $user['id']) return; // Cannot kick self here, use leave
    
    $stmt = $pdo->prepare("DELETE FROM room_players WHERE room_id = ? AND user_id = ?");
    $stmt->execute([$room['id'], $targetId]);
    echo json_encode(['status' => 'ok']);
}

function action_add_bot($pdo, $user, $data) {
    global $currentUser;
    $room = getRoom($user['id']);
    if (!$room) sendError('No room');
    if (!$room['is_host']) sendError('Not host');
    
    // Check limit
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM room_players WHERE room_id = ?");
    $stmt->execute([$room['id']]);
    if ($stmt->fetchColumn() >= 12) sendError('Room is full (Max 12)');

    $difficulty = $data['difficulty'] ?? 'medium';
    if (!in_array($difficulty, ['easy', 'medium', 'hard'])) $difficulty = 'medium';

    // Bot Pool Ranges
    $ranges = [
        'easy'   => [-100, -109],
        'medium' => [-200, -209],
        'hard'   => [-300, -309]
    ];
    
    $range = $ranges[$difficulty];
    $start = $range[0]; // e.g. -100
    $end = $range[1];   // e.g. -109
    
    // We need to find valid USERS that have telegram_id in this range.
    // AND are not already in the room.
    
    // 1. Get List of Bots currently in the room (user_id list)
    $stmt = $pdo->prepare("SELECT user_id FROM room_players WHERE room_id = ? AND is_bot = 1");
    $stmt->execute([$room['id']]);
    $existingBotUserIds = $stmt->fetchAll(PDO::FETCH_COLUMN); // These are users.id
    
    // 2. Find Available Candidates from Users table
    // We search by telegram_id range, but select users.id
    // Note: SQL BETWEEN is inclusive and usually expects min AND max.
    // Since IDs are negative: -109 is min, -100 is max.
    $min = min($start, $end);
    $max = max($start, $end);
    
    $sql = "SELECT id FROM users WHERE telegram_id BETWEEN ? AND ? AND is_bot = 1";
    $stmt = $pdo->prepare($sql);
    $stmt->execute([$min, $max]);
    $allPoolIds = $stmt->fetchAll(PDO::FETCH_COLUMN); // These are users.id
    
    $candidates = array_diff($allPoolIds, $existingBotUserIds);
    
    if (empty($candidates)) {
        sendError("No more $difficulty bots available in pool!");
    }
    
    // 3. Pick Random Candidate
    // array_diff preserves keys, so re-index or use array_rand carefully
    $botUserId = $candidates[array_rand($candidates)];
    
    try {
        $pdo->beginTransaction();
        
        $pdo->prepare("INSERT INTO room_players (room_id, user_id, is_bot, bot_difficulty) VALUES (?, ?, 1, ?)")
            ->execute([$room['id'], $botUserId, $difficulty]);
            
        // Log it
        TelegramLogger::logEvent('room_event', "Added Bot to Room", ['room_id' => $room['id'], 'bot_id' => $botUserId, 'diff' => $difficulty]);
        
        $pdo->commit();
        echo json_encode(['status' => 'ok', 'user_id' => $botUserId]);
        
    } catch (Exception $e) {
        $pdo->rollBack();
        TelegramLogger::log("Add Bot Error", ['error' => $e->getMessage()]);
        sendError('Could not add bot');
    }
}

function action_remove_bot($pdo, $user, $data) {
    $room = getRoom($user['id']);
    if (!$room) sendError('No room');
    if (!$room['is_host']) sendError('Not host');
    
    $targetId = $data['target_id'] ?? 0;
    
    // Verify it is a bot
    $stmt = $pdo->prepare("SELECT is_bot FROM room_players WHERE room_id = ? AND user_id = ?");
    $stmt->execute([$room['id'], $targetId]);
    $isBot = $stmt->fetchColumn();
    
    // Verify it is a bot (Check flag OR negative ID OR name prefix for legacy cleanup)
    $stmt = $pdo->prepare("SELECT is_bot, first_name FROM users WHERE id = ?");
    $stmt->execute([$targetId]);
    $u = $stmt->fetch();
    
    // Allow removal if: is_bot flag in room_players is 1 OR user ID < 0 OR user name starts with "Bot "
    // Note: strpos returns 0 if found at start.
    $name = $u['first_name'] ?? '';
    if (!$isBot && $targetId > 0 && strpos($name, 'Bot ') !== 0) {
         sendError('Target is not a bot');
    }
    
    $pdo->prepare("DELETE FROM room_players WHERE room_id = ? AND user_id = ?")->execute([$room['id'], $targetId]);
    // Optionally delete shadow user to keep DB clean
    $pdo->prepare("DELETE FROM users WHERE id = ?")->execute([$targetId]);
    
    echo json_encode(['status' => 'ok']);
}

function action_get_state($pdo, $user, $data) {
    $room = getRoom($user['id']);
    
    // Если комнаты нет
    if (!$room) {
        echo json_encode([
            'status' => 'no_room', 
            'user' => $user
        ]);
        return;
    }

    // Optimisation: Update last_active at most once every 60 seconds
    // Note: We might want to do this less frequently or async, but SQL is fast enough for now
    $pdo->prepare("UPDATE room_players SET last_active = NOW() WHERE room_id = ? AND user_id = ? AND last_active < (NOW() - INTERVAL 60 SECOND)")->execute([$room['id'], $user['id']]);
    
    $stmt = $pdo->prepare("SELECT u.id, u.first_name, u.photo_url, u.custom_name, u.custom_avatar, rp.is_host, rp.score, rp.is_bot, rp.bot_difficulty 
                    FROM room_players rp 
                    JOIN users u ON u.id = rp.user_id 
                    WHERE rp.room_id = ?
                    ORDER BY rp.id ASC");
    $stmt->execute([$room['id']]);
    $players = $stmt->fetchAll();
    
    // Optimized Polling: Insert Notifications
    // We fetch unread notifications here to avoid separate polling request in game
    $notifs = []; 
    try {
        $nStmt = $pdo->prepare("SELECT type FROM notifications WHERE user_id = ? AND is_read = 0");
        $nStmt->execute([$user['id']]);
        $notifs = $nStmt->fetchAll(PDO::FETCH_COLUMN);
    } catch (Exception $e) {}
    
    // Get Recent Room Events (Live Reactions)
    // Last 3 seconds
    $events = [];
    try {
        $eStmt = $pdo->prepare("SELECT type, payload, user_id, created_at FROM room_events WHERE room_id = ? AND created_at > (NOW() - INTERVAL 3 SECOND) ORDER BY created_at ASC");
        $eStmt->execute([$room['id']]);
        $events = $eStmt->fetchAll();
    } catch (Exception $e) {
        // Table might not exist yet if migration didn't run
    }

    echo json_encode([
        'status' => 'in_room', 
        'user' => $user, 
        'room' => $room, 
        'players' => $players, 
        'is_host' => $room['is_host'],
        'notifications' => $notifs,
        'events' => $events
    ]);
}

function cleanupOldRooms($pdo) {
    if (rand(1, 20) !== 1) return; // 5% chance to run
    try {
        // 1. Delete old rooms (assuming FK Cascade might not exist)
        // We use a multi-table delete or just delete orphans after.
        // Let's delete rooms, then delete orphans.
        
        $pdo->exec("DELETE FROM rooms WHERE created_at < (NOW() - INTERVAL 24 HOUR)");
        
        // 2. Delete orphaned room_players (where room_id no longer exists)
        // This ensures bots (and humans) are removed from the mapping table if the room is gone.
        $pdo->exec("DELETE FROM room_players WHERE room_id NOT IN (SELECT id FROM rooms)");
        
    } catch (Exception $e) {
        // Ignore cleanup errors
    }
}

// === PUBLIC ROOMS ===

function action_make_room_public($pdo, $user, $data) {
    $room = getRoom($user['id']);
    if (!$room || !$room['is_host']) sendError('Not host');
    
    $title = trim($data['title'] ?? 'Party Game');
    $desc = trim($data['description'] ?? '');
    $visibility = $data['visibility'] ?? 'public'; // public, friends_only
    
    if (mb_strlen($title) > 64) $title = mb_substr($title, 0, 64);
    if (mb_strlen($desc) > 255) $desc = mb_substr($desc, 0, 255);
    
    try {
        $stmt = $pdo->prepare("INSERT INTO public_rooms (room_id, title, description, visibility) VALUES (?, ?, ?, ?) 
                               ON DUPLICATE KEY UPDATE title=VALUES(title), description=VALUES(description), visibility=VALUES(visibility)");
        $stmt->execute([$room['id'], $title, $desc, $visibility]);
        
        echo json_encode(['status' => 'ok']);
    } catch (Exception $e) {
        TelegramLogger::log("Make Public Error", ['error' => $e->getMessage()]);
        sendError('Database Error');
    }
}

function action_get_public_rooms($pdo, $user, $data) {
    $stmt = $pdo->query("
        SELECT pr.*, r.game_type, r.room_code, r.game_state,
               (SELECT COUNT(*) FROM room_players WHERE room_id = r.id) as players_count,
               u.photo_url as host_avatar, u.first_name as host_name
        FROM public_rooms pr
        JOIN rooms r ON r.id = pr.room_id
        JOIN users u ON u.id = r.host_user_id
        WHERE r.status = 'waiting' 
        AND pr.visibility = 'public'
        LIMIT 20
    ");
    $rooms = $stmt->fetchAll();
    
    echo json_encode(['status' => 'ok', 'rooms' => $rooms]);
}
