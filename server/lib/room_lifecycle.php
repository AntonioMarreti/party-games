<?php

function roomLifecycleFail(string $message): void
{
    throw new RuntimeException($message);
}

function isRoomWaitingState($room)
{
    return isset($room['status']) && $room['status'] === 'waiting';
}

function isRoomPlayingState($room)
{
    return isset($room['status']) && $room['status'] === 'playing';
}

function getRoomPlayerCounts($pdo, $roomId)
{
    $stmt = $pdo->prepare("
        SELECT
            COUNT(*) AS total_players,
            SUM(CASE WHEN rp.is_bot = 0 THEN 1 ELSE 0 END) AS human_players,
            SUM(
                CASE
                    WHEN rp.is_bot = 0
                     AND COALESCE(rp.last_active, NOW()) > (NOW() - INTERVAL 10 MINUTE)
                    THEN 1
                    ELSE 0
                END
            ) AS active_humans
        FROM room_players rp
        WHERE rp.room_id = ?
    ");
    $stmt->execute([$roomId]);
    $counts = $stmt->fetch() ?: [];

    return [
        'total_players' => (int) ($counts['total_players'] ?? 0),
        'human_players' => (int) ($counts['human_players'] ?? 0),
        'active_humans' => (int) ($counts['active_humans'] ?? 0),
    ];
}

function logRoomLifecycle($action, $data = [], $message = '')
{
    $payload = array_merge([
        'action' => $action,
    ], $data);

    TelegramLogger::logEvent('room', $message !== '' ? $message : $action, $payload);
}

function expireScheduledLiveRoom($pdo, $roomId): void
{
    try {
        $tableStmt = $pdo->prepare("SHOW TABLES LIKE ?");
        $tableStmt->execute(['scheduled_games']);
        if (!$tableStmt->fetchColumn()) {
            return;
        }

        $columnStmt = $pdo->prepare("SHOW COLUMNS FROM scheduled_games LIKE ?");
        $columnStmt->execute(['room_id']);
        if (!$columnStmt->fetch()) {
            return;
        }

        $pdo->prepare("
            UPDATE scheduled_games
            SET status = 'expired'
            WHERE room_id = ?
              AND status = 'live'
        ")->execute([(int) $roomId]);
    } catch (Throwable $e) {
        if (class_exists('TelegramLogger')) {
            TelegramLogger::logError('scheduled_live_room_cleanup', [
                'room_id' => (int) $roomId,
                'message' => $e->getMessage(),
            ]);
        }
    }
}

function clearUserRooms($pdo, $userId)
{
    $stmt = $pdo->prepare("
        SELECT rp.room_id, rp.is_host
        FROM room_players rp
        WHERE rp.user_id = ?
        ORDER BY rp.id ASC
    ");
    $stmt->execute([$userId]);
    $memberships = $stmt->fetchAll();

    foreach ($memberships as $membership) {
        $roomId = (int) ($membership['room_id'] ?? 0);
        $wasHost = (int) ($membership['is_host'] ?? 0) === 1;
        if ($roomId <= 0) {
            continue;
        }

        $roomSnapshotStmt = $pdo->prepare("SELECT room_code, host_user_id, status FROM rooms WHERE id = ?");
        $roomSnapshotStmt->execute([$roomId]);
        $roomSnapshot = $roomSnapshotStmt->fetch() ?: ['room_code' => null, 'host_user_id' => null, 'status' => null];

        $botCountStmt = $pdo->prepare("SELECT COUNT(*) FROM room_players WHERE room_id = ? AND is_bot = 1");
        $botCountStmt->execute([$roomId]);
        $botCount = (int) $botCountStmt->fetchColumn();

        $pdo->prepare("DELETE FROM room_players WHERE room_id = ? AND user_id = ?")->execute([$roomId, $userId]);

        $counts = getRoomPlayerCounts($pdo, $roomId);
        $humansLeft = $counts['human_players'];
        $totalPlayersLeft = $counts['total_players'];

        logRoomLifecycle('member_left', [
            'room_id' => $roomId,
            'room_code' => $roomSnapshot['room_code'],
            'actor_user_id' => $userId,
            'was_host' => $wasHost,
            'humans_left' => $humansLeft,
            'players_left' => $totalPlayersLeft,
            'bots_left' => max(0, $totalPlayersLeft - $humansLeft),
            'previous_status' => $roomSnapshot['status'],
        ], 'Room member left');

        if ($humansLeft <= 0) {
            $pdo->prepare("DELETE FROM public_rooms WHERE room_id = ?")->execute([$roomId]);
            $pdo->prepare("DELETE FROM room_players WHERE room_id = ?")->execute([$roomId]);
            $pdo->prepare("DELETE FROM rooms WHERE id = ?")->execute([$roomId]);
            expireScheduledLiveRoom($pdo, $roomId);

            logRoomLifecycle('room_cleanup', [
                'room_id' => $roomId,
                'room_code' => $roomSnapshot['room_code'],
                'actor_user_id' => $userId,
                'previous_host_user_id' => $roomSnapshot['host_user_id'],
                'previous_status' => $roomSnapshot['status'],
                'bots_in_room' => $botCount,
            ], 'Room cleaned up');
            continue;
        }

        if ($wasHost) {
            $stmtNextHost = $pdo->prepare("
                SELECT rp.user_id
                FROM room_players rp
                JOIN users u ON u.id = rp.user_id
                WHERE rp.room_id = ?
                  AND rp.is_bot = 0
                  AND u.is_bot = 0
                  AND COALESCE(rp.last_active, NOW()) > (NOW() - INTERVAL 10 MINUTE)
                ORDER BY rp.id ASC
                LIMIT 1
            ");
            $stmtNextHost->execute([$roomId]);
            $nextHostId = $stmtNextHost->fetchColumn();

            if ($nextHostId) {
                $pdo->prepare("UPDATE room_players SET is_host = 0 WHERE room_id = ?")->execute([$roomId]);
                $pdo->prepare("UPDATE room_players SET is_host = 1 WHERE room_id = ? AND user_id = ?")->execute([$roomId, $nextHostId]);
                $pdo->prepare("UPDATE rooms SET host_user_id = ? WHERE id = ?")->execute([$nextHostId, $roomId]);

                logRoomLifecycle('host_transferred', [
                    'room_id' => $roomId,
                    'room_code' => $roomSnapshot['room_code'],
                    'actor_user_id' => $userId,
                    'previous_host_user_id' => $userId,
                    'new_host_user_id' => (int) $nextHostId,
                    'humans_left' => $humansLeft,
                    'players_left' => $totalPlayersLeft,
                ], 'Room host transferred');
            } else {
                $pdo->prepare("DELETE FROM public_rooms WHERE room_id = ?")->execute([$roomId]);
                $pdo->prepare("DELETE FROM room_players WHERE room_id = ?")->execute([$roomId]);
                $pdo->prepare("DELETE FROM rooms WHERE id = ?")->execute([$roomId]);
                expireScheduledLiveRoom($pdo, $roomId);

                logRoomLifecycle('room_cleanup_no_active_host', [
                    'room_id' => $roomId,
                    'room_code' => $roomSnapshot['room_code'],
                    'actor_user_id' => $userId,
                    'previous_host_user_id' => $userId,
                    'humans_left' => $humansLeft,
                    'players_left' => $totalPlayersLeft,
                    'bots_in_room' => $botCount,
                ], 'Room cleaned up: no active human host');
            }
        }
    }
}

function performRoomJoin($pdo, array $user, string $roomCode, string $password = ''): array
{
    $code = strtoupper($roomCode);

    $userLockStmt = $pdo->prepare("SELECT id FROM users WHERE id = ? FOR UPDATE");
    $userLockStmt->execute([$user['id']]);

    $stmt = $pdo->prepare("SELECT * FROM rooms WHERE room_code = ? FOR UPDATE");
    $stmt->execute([$code]);
    $room = $stmt->fetch();

    if (!$room) {
        roomLifecycleFail('Комната не найдена');
    }
    if (!isRoomWaitingState($room)) {
        roomLifecycleFail('В эту комнату сейчас нельзя войти');
    }
    if (!empty($room['password']) && !password_verify($password, $room['password'])) {
        roomLifecycleFail('Неверный пароль');
    }

    $stmt = $pdo->prepare("SELECT room_id FROM room_players WHERE user_id = ? ORDER BY id DESC LIMIT 1 FOR UPDATE");
    $stmt->execute([$user['id']]);
    $currentRoomId = (int) $stmt->fetchColumn();

    if ($currentRoomId === (int) $room['id']) {
        return [
            'status' => 'ok',
            'room_code' => $code,
            'room' => $room,
            'counts' => getRoomPlayerCounts($pdo, $room['id']),
            'lifecycle_action' => 'join_noop',
            'lifecycle_message' => 'Room join noop',
        ];
    }

    $counts = getRoomPlayerCounts($pdo, $room['id']);
    if ($counts['total_players'] >= 16) {
        roomLifecycleFail('Комната заполнена');
    }

    clearUserRooms($pdo, $user['id']);
    $pdo->prepare("INSERT INTO room_players (room_id, user_id) VALUES (?, ?)")->execute([$room['id'], $user['id']]);

    return [
        'status' => 'ok',
        'room_code' => $code,
        'room' => $room,
        'counts' => getRoomPlayerCounts($pdo, $room['id']),
        'lifecycle_action' => 'joined',
        'lifecycle_message' => 'Room member joined',
    ];
}
