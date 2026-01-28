<?php

function action_create_room($pdo, $user, $data) {
    global $currentUser; // Fallback if passed differently

    try {
        $pdo->beginTransaction();

        // 1. Сначала удаляем игрока из старых комнат
        clearUserRooms($pdo, $user['id']);

        $code = strtoupper(substr(md5(uniqid()), 0, 4));
        $pass = !empty($data['password']) ? password_hash($data['password'], PASSWORD_DEFAULT) : null;
        
        $pdo->prepare("INSERT INTO rooms (room_code, host_user_id, password) VALUES (?, ?, ?)")->execute([$code, $user['id'], $pass]);
        $rid = $pdo->lastInsertId();
        
        $pdo->prepare("INSERT INTO room_players (room_id, user_id, is_host) VALUES (?, ?, 1)")->execute([$rid, $user['id']]);
        
        $pdo->commit();
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
    clearUserRooms($pdo, $user['id']);
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
    
    $stmt = $pdo->prepare("SELECT u.id, u.first_name, u.photo_url, u.custom_name, u.custom_avatar, rp.is_host, rp.score 
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
    
    echo json_encode([
        'status' => 'in_room', 
        'user' => $user, 
        'room' => $room, 
        'players' => $players, 
        'is_host' => $room['is_host'],
        'notifications' => $notifs
    ]);
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
