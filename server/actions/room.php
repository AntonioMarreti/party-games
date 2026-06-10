<?php

require_once __DIR__ . '/../lib/gamification.php';

// TODO(scheduled-games): keep this file focused on live rooms only.
// Scheduled open games live in actions/scheduled_games.php and must not affect
// the existing room lifecycle until a later explicit open/start stage.

function action_create_room($pdo, $user, $data)
{
    global $currentUser; // Fallback if passed differently

    // 0. Garbage Collection (Clean old rooms)
    cleanupOldRooms($pdo);

    try {
        $pdo->beginTransaction();

        $existingStmt = $pdo->prepare("
            SELECT r.*, rp.is_host
            FROM room_players rp
            JOIN rooms r ON r.id = rp.room_id
            WHERE rp.user_id = ?
            ORDER BY rp.id DESC
            LIMIT 1
            FOR UPDATE
        ");
        $existingStmt->execute([$user['id']]);
        $existingRoom = $existingStmt->fetch();

        if (
            $existingRoom
            && (int) ($existingRoom['is_host'] ?? 0) === 1
            && isRoomWaitingState($existingRoom)
            && !empty($existingRoom['created_at'])
        ) {
            $createdAtTs = strtotime($existingRoom['created_at']);
            if ($createdAtTs !== false && (time() - $createdAtTs) <= 10) {
                $pdo->commit();
                logRoomLifecycle('create_noop', [
                    'room_id' => (int) $existingRoom['id'],
                    'room_code' => $existingRoom['room_code'],
                    'actor_user_id' => (int) $user['id'],
                    'host_user_id' => (int) $existingRoom['host_user_id'],
                    'status' => $existingRoom['status'] ?? null,
                ], 'Room create noop');
                echo json_encode(['status' => 'ok', 'room_code' => $existingRoom['room_code']]);
                return;
            }
        }

        // 1. Сначала удаляем игрока из старых комнат
        clearUserRooms($pdo, $user['id']);

        $pass = !empty($data['password']) ? password_hash($data['password'], PASSWORD_DEFAULT) : null;

        // IP Hash for Local Discovery
        $ip = $_SERVER['REMOTE_ADDR'] ?? '';
        $ipHash = null;
        if ($ip && defined('IP_SALT')) {
            $ipHash = hash('sha256', $ip . IP_SALT);
        }

        $roomStmt = $pdo->prepare("INSERT INTO rooms (room_code, host_user_id, password, ip_hash) VALUES (?, ?, ?, ?)");
        $rid = null;
        for ($attempt = 0; $attempt < 8; $attempt++) {
            $code = generateAvailableRoomCode($pdo);
            try {
                $roomStmt->execute([$code, $user['id'], $pass, $ipHash]);
                $rid = $pdo->lastInsertId();
                break;
            } catch (PDOException $e) {
                if (isDuplicateKeyException($e)) {
                    continue;
                }
                throw $e;
            }
        }
        if (!$rid) {
            throw new RuntimeException('Unable to create room with a unique code');
        }

        $pdo->prepare("INSERT INTO room_players (room_id, user_id, is_host) VALUES (?, ?, 1)")->execute([$rid, $user['id']]);

        $pdo->commit();

        logRoomLifecycle('created', [
            'room_id' => (int) $rid,
            'room_code' => $code,
            'actor_user_id' => (int) $user['id'],
            'host_user_id' => (int) $user['id'],
            'has_password' => $pass ? 1 : 0,
            'status' => 'waiting',
        ], 'Room created');
        recordGamificationEvent($pdo, (int) $user['id'], 'room_created', 'room', $rid, [
            'room_code' => $code,
            'has_password' => $pass ? 1 : 0,
        ]);

        echo json_encode(['status' => 'ok', 'room_code' => $code]);
    } catch (Exception $e) {
        $pdo->rollBack();
        TelegramLogger::log("Create Room Error", ['error' => $e->getMessage(), 'user_id' => $user['id']]);
        sendError('Database Error');
    }
}

function action_join_room($pdo, $user, $data)
{
    try {
        $pdo->beginTransaction();
        $result = performRoomJoin(
            $pdo,
            $user,
            (string) ($data['room_code'] ?? ''),
            (string) ($data['password'] ?? '')
        );
        $pdo->commit();

        $room = $result['room'];
        $updatedCounts = $result['counts'];
        $code = $result['room_code'];
        logRoomLifecycle($result['lifecycle_action'], [
            'room_id' => (int) $room['id'],
            'room_code' => $code,
            'actor_user_id' => (int) $user['id'],
            'host_user_id' => (int) $room['host_user_id'],
            'status' => $room['status'],
            'players_total' => $updatedCounts['total_players'],
            'humans_total' => $updatedCounts['human_players'],
        ], $result['lifecycle_message']);
        echo json_encode(['status' => 'ok', 'room_code' => $code]);
    } catch (RuntimeException $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        sendError($e->getMessage());
    } catch (Exception $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        TelegramLogger::log("Join Room Error", ['error' => $e->getMessage(), 'user_id' => $user['id']]);
        sendError('Join Error');
    }
}

function action_leave_room($pdo, $user, $data)
{
    try {
        $pdo->beginTransaction();

        $userLockStmt = $pdo->prepare("SELECT id FROM users WHERE id = ? FOR UPDATE");
        $userLockStmt->execute([$user['id']]);

        $membershipCheckStmt = $pdo->prepare("SELECT COUNT(*) FROM room_players WHERE user_id = ? FOR UPDATE");
        $membershipCheckStmt->execute([$user['id']]);
        $membershipsCount = (int) $membershipCheckStmt->fetchColumn();

        if ($membershipsCount <= 0) {
            $pdo->commit();
            logRoomLifecycle('leave_noop', [
                'actor_user_id' => (int) $user['id'],
            ], 'Room leave noop');
            echo json_encode(['status' => 'ok']);
            return;
        }

        clearUserRooms($pdo, $user['id']);
        $pdo->commit();
        echo json_encode(['status' => 'ok']);
    } catch (Exception $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        TelegramLogger::log("Leave Room Error", ['error' => $e->getMessage(), 'user_id' => $user['id']]);
        sendError('Leave Error');
    }
}

function action_kick_player($pdo, $user, $data)
{
    $room = getRoom($user['id']);
    if (!$room)
        sendError('No room');
    if (!$room['is_host'])
        sendError('Not host');

    $targetId = $data['target_id'] ?? 0;
    if ($targetId == $user['id'])
        return; // Cannot kick self here, use leave

    $stmt = $pdo->prepare("DELETE FROM room_players WHERE room_id = ? AND user_id = ?");
    $stmt->execute([$room['id'], $targetId]);

    logRoomLifecycle('member_kicked', [
        'room_id' => (int) $room['id'],
        'room_code' => $room['room_code'] ?? null,
        'actor_user_id' => (int) $user['id'],
        'target_user_id' => (int) $targetId,
        'status' => $room['status'] ?? null,
    ], 'Room member kicked');

    echo json_encode(['status' => 'ok']);
}

function action_add_bot($pdo, $user, $data)
{
    global $currentUser;
    $room = getRoom($user['id']);
    if (!$room)
        sendError('No room');
    if (!$room['is_host'])
        sendError('Not host');

    // Check limit
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM room_players WHERE room_id = ?");
    $stmt->execute([$room['id']]);
    if ($stmt->fetchColumn() >= 12)
        sendError('Room is full (Max 12)');

    $difficulty = $data['difficulty'] ?? 'medium';
    if (!in_array($difficulty, ['easy', 'medium', 'hard']))
        $difficulty = 'medium';

    // Bot Pool Ranges
    $ranges = [
        'easy' => [-100, -109],
        'medium' => [-200, -209],
        'hard' => [-300, -309]
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
        logRoomLifecycle('bot_added', [
            'room_id' => (int) $room['id'],
            'room_code' => $room['room_code'] ?? null,
            'actor_user_id' => (int) $user['id'],
            'target_user_id' => (int) $botUserId,
            'difficulty' => $difficulty,
        ], 'Bot added to room');

        $pdo->commit();
        echo json_encode(['status' => 'ok', 'user_id' => $botUserId]);

    } catch (Exception $e) {
        $pdo->rollBack();
        TelegramLogger::log("Add Bot Error", ['error' => $e->getMessage()]);
        sendError('Could not add bot');
    }
}

function action_remove_bot($pdo, $user, $data)
{
    $room = getRoom($user['id']);
    if (!$room)
        sendError('No room');
    if (!$room['is_host'])
        sendError('Not host');

    $targetId = $data['target_id'] ?? 0;

    // Verify it is a bot
    $stmt = $pdo->prepare("SELECT is_bot FROM room_players WHERE room_id = ? AND user_id = ?");
    $stmt->execute([$room['id'], $targetId]);
    $isBot = $stmt->fetchColumn();

    $stmt = $pdo->prepare("SELECT is_bot FROM users WHERE id = ?");
    $stmt->execute([$targetId]);
    $globalIsBot = $stmt->fetchColumn();

    if (!$isBot && !$globalIsBot) {
        sendError('Target is not a bot');
    }

    $pdo->prepare("DELETE FROM room_players WHERE room_id = ? AND user_id = ?")->execute([$room['id'], $targetId]);

    logRoomLifecycle('bot_removed', [
        'room_id' => (int) $room['id'],
        'room_code' => $room['room_code'] ?? null,
        'actor_user_id' => (int) $user['id'],
        'target_user_id' => (int) $targetId,
    ], 'Bot removed from room');

    echo json_encode(['status' => 'ok']);
}

function action_get_state($pdo, $user, $data)
{
    $room = getRoom($user['id']);

    // Get User Favorites (Always needed)
    $favorites = [];
    try {
        $fStmt = $pdo->prepare("SELECT game_id FROM user_favorites WHERE user_id = ?");
        $fStmt->execute([$user['id']]);
        $favorites = $fStmt->fetchAll(PDO::FETCH_COLUMN);
    } catch (Exception $e) {
    }

    // Если комнаты нет
    if (!$room) {
        echo json_encode([
            'status' => 'no_room',
            'user' => $user,
            'favorites' => $favorites
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
    $players = normalize_user_public_list($stmt->fetchAll());

    // Optimized Polling: Insert Notifications
    // We fetch unread notifications here to avoid separate polling request in game
    $notifs = [];
    try {
        $nStmt = $pdo->prepare("SELECT type FROM notifications WHERE user_id = ? AND is_read = 0");
        $nStmt->execute([$user['id']]);
        $notifs = $nStmt->fetchAll(PDO::FETCH_COLUMN);
    } catch (Exception $e) {
    }

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

    // Get Recent Achievements
    $newAchievements = [];
    try {
        $aStmt = $pdo->prepare("SELECT a.* FROM user_achievements ua JOIN achievements a ON a.id = ua.achievement_id WHERE ua.user_id = ? AND ua.unlocked_at > (NOW() - INTERVAL 10 SECOND)");
        $aStmt->execute([$user['id']]);
        $newAchievements = $aStmt->fetchAll();
    } catch (Exception $e) {
    }

    // STATE SANITIZATION (Hide secrets from clients)
    $gameType = strtolower($room['game_type'] ?? '');
    if (($gameType === 'spyfall' || $gameType === 'spy') && !empty($room['game_state'])) {
        $state = json_decode($room['game_state'], true);
        if ($state && $state['phase'] === 'playing') {
            $myId = (string) $user['id'];
            $spyId = isset($state['spy_id']) ? (string) $state['spy_id'] : '';
            $isSpy = ($myId === $spyId);

            if ($isSpy) {
                // The spy should not know the location or the actual roles
                $state['location'] = '???';
                // Only keep their own role to avoid revealing others' roles
                $state['roles'] = [$myId => 'Шпион'];
            } else {
                // Locals should only see their own role, not others
                $myRole = $state['roles'][$myId] ?? 'Местный житель';
                $state['roles'] = [$myId => $myRole];
                // Hide the spy's identity from locals
                unset($state['spy_id']);
            }
            $room['game_state'] = json_encode($state, JSON_UNESCAPED_UNICODE);
        }
    } elseif ($gameType === 'bunker' && !empty($room['game_state'])) {
        $state = json_decode($room['game_state'], true);
        if (is_array($state) && !empty($state['players_cards']) && is_array($state['players_cards'])) {
            $myId = (string) $user['id'];
            foreach ($state['players_cards'] as $playerId => &$cards) {
                $playerId = (string) $playerId;
                if (!is_array($cards) || $playerId === $myId) {
                    continue;
                }

                foreach ($cards as $cardKey => &$card) {
                    if (!is_array($card)) {
                        continue;
                    }

                    $isRevealed = !empty($card['revealed']);
                    if ($isRevealed) {
                        continue;
                    }

                    $cards[$cardKey] = [
                        'revealed' => false,
                        'used' => !empty($card['used']),
                    ];
                }
                unset($card);
            }
            unset($cards);
            $room['game_state'] = json_encode($state, JSON_UNESCAPED_UNICODE);
        }
    }

    echo json_encode([
        'status' => 'in_room',
        'user' => $user,
        'room' => $room,
        'players' => $players,
        'is_host' => $room['is_host'],
        'notifications' => $notifs,
        'events' => $events,
        'new_achievements' => $newAchievements,
        'favorites' => $favorites // NEW
    ]);
}

function cleanupOldRooms($pdo)
{
    if (rand(1, 20) !== 1)
        return; // 5% chance to run
    try {
        // 1. Delete old rooms (assuming FK Cascade might not exist)
        // We use a multi-table delete or just delete orphans after.
        // Let's delete rooms, then delete orphans.

        $pdo->exec("DELETE FROM rooms WHERE created_at < (NOW() - INTERVAL 24 HOUR)");

        // 2. Delete orphaned room_players (where room_id no longer exists)
        // This ensures bots (and humans) are removed from the mapping table if the room is gone.
        $pdo->exec("DELETE FROM room_players WHERE room_id NOT IN (SELECT id FROM rooms)");
        $pdo->exec("DELETE FROM public_rooms WHERE room_id NOT IN (SELECT id FROM rooms)");

    } catch (Exception $e) {
        // Ignore cleanup errors
    }
}

// === PUBLIC ROOMS ===

function action_make_room_public($pdo, $user, $data)
{
    $room = getRoom($user['id']);
    if (!$room || !$room['is_host'])
        sendError('Not host');
    if (!isRoomWaitingState($room))
        sendError('Публичной может быть только waiting-комната');

    $counts = getRoomPlayerCounts($pdo, $room['id']);
    if ($counts['active_humans'] <= 0)
        sendError('Для публичной комнаты нужен активный хост');

    $title = trim($data['title'] ?? 'Party Game');
    $desc = trim($data['description'] ?? '');
    $visibility = $data['visibility'] ?? 'public'; // public, friends_only

    if (mb_strlen($title) > 64)
        $title = mb_substr($title, 0, 64);
    if (mb_strlen($desc) > 255)
        $desc = mb_substr($desc, 0, 255);

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

function action_get_public_rooms($pdo, $user, $data)
{
    $stmt = $pdo->query("
        SELECT pr.id, pr.room_id, pr.title, pr.description, pr.visibility,
               r.game_type, r.room_code,
               CASE WHEN r.password IS NULL OR r.password = '' THEN 0 ELSE 1 END as has_password,
               COUNT(rp_count.user_id) as players_count,
               u.photo_url as host_avatar, u.first_name as host_name,
               COALESCE(host_rp.last_active, r.created_at) as host_last_active
        FROM public_rooms pr
        JOIN rooms r ON r.id = pr.room_id
        JOIN room_players host_rp ON host_rp.room_id = r.id AND host_rp.user_id = r.host_user_id AND host_rp.is_host = 1
        LEFT JOIN room_players rp_count ON rp_count.room_id = r.id
        JOIN users u ON u.id = host_rp.user_id
        WHERE r.status = 'waiting' 
        AND pr.visibility = 'public'
        AND u.is_bot = 0
        AND COALESCE(host_rp.last_active, r.created_at) > (NOW() - INTERVAL 10 MINUTE)
        GROUP BY pr.id, pr.room_id, pr.title, pr.description, pr.visibility,
                 r.game_type, r.room_code, r.password, u.photo_url, u.first_name,
                 host_rp.last_active, r.created_at
        ORDER BY players_count DESC, host_last_active DESC, pr.id DESC
        LIMIT 20
    ");
    $rooms = normalize_user_public_list($stmt->fetchAll());

    echo json_encode(['status' => 'ok', 'rooms' => $rooms]);
}

function action_get_local_rooms($pdo, $user, $data)
{
    $ip = $_SERVER['REMOTE_ADDR'] ?? '';

    if (!$ip || !defined('IP_SALT')) {
        echo json_encode(['status' => 'ok', 'rooms' => []]);
        return;
    }

    $ipHash = hash('sha256', $ip . IP_SALT);

    // Get rooms created with Same IP Hash
    // AND specify status=waiting
    // AND specify not locked/private? (Maybe allow private too if they have password)
    // AND limit to recent? (already handled by creating_at cleanup)

    $stmt = $pdo->prepare("
        SELECT r.room_code, r.game_type, r.game_state,
               CASE WHEN r.password IS NULL OR r.password = '' THEN 0 ELSE 1 END as has_password,
               (SELECT COUNT(*) FROM room_players WHERE room_id = r.id) as players_count,
               u.photo_url as host_avatar, u.first_name as host_name,
               COALESCE(host_rp.last_active, r.created_at) as host_last_active
        FROM rooms r
        JOIN room_players host_rp ON host_rp.room_id = r.id AND host_rp.user_id = r.host_user_id AND host_rp.is_host = 1
        JOIN users u ON u.id = host_rp.user_id
        WHERE r.ip_hash = ? 
        AND r.status = 'waiting'
        AND u.is_bot = 0
        AND COALESCE(host_rp.last_active, r.created_at) > (NOW() - INTERVAL 10 MINUTE)
        ORDER BY players_count DESC, host_last_active DESC, r.id DESC
        LIMIT 10
    ");
    $stmt->execute([$ipHash]);
    $rooms = normalize_user_public_list($stmt->fetchAll());

    echo json_encode(['status' => 'ok', 'rooms' => $rooms]);
}
