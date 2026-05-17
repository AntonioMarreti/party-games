<?php

function scheduled_send_ok($payload = [])
{
    echo json_encode(array_merge(['status' => 'ok'], $payload), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function scheduled_clamp_int($value, $min, $max, $fallback)
{
    $int = filter_var($value, FILTER_VALIDATE_INT);
    if ($int === false) return $fallback;
    return max($min, min($max, $int));
}

function scheduled_text($value, $fallback, $limit)
{
    $text = trim((string) ($value ?? ''));
    if ($text === '') $text = $fallback;
    if (function_exists('mb_substr')) {
        return mb_substr($text, 0, $limit);
    }
    return substr($text, 0, $limit);
}

function scheduled_game_type($value)
{
    $gameType = preg_replace('/[^a-z0-9_\-]/i', '', (string) ($value ?? ''));
    if ($gameType === '') {
        throw new RuntimeException('Выберите игру');
    }
    return $gameType;
}

function scheduled_parse_datetime($value)
{
    $raw = trim((string) ($value ?? ''));
    if ($raw === '') {
        throw new RuntimeException('Укажите время старта');
    }

    $timestamp = strtotime($raw);
    if ($timestamp === false) {
        throw new RuntimeException('Некорректное время старта');
    }

    $min = time() + 5 * 60;
    $max = time() + 30 * 24 * 60 * 60;
    if ($timestamp < $min) {
        throw new RuntimeException('Старт должен быть хотя бы через 5 минут');
    }
    if ($timestamp > $max) {
        throw new RuntimeException('Планировать можно максимум на 30 дней');
    }

    return date('Y-m-d H:i:s', $timestamp);
}

function scheduled_opens_at($startsAt)
{
    return date('Y-m-d H:i:s', strtotime($startsAt) - 10 * 60);
}

function scheduled_expires_at($startsAt)
{
    return date('Y-m-d H:i:s', strtotime($startsAt) + 30 * 60);
}

function scheduled_cleanup_expired($pdo)
{
    $pdo->exec("
        UPDATE scheduled_games
        SET status = 'expired'
        WHERE status = 'scheduled'
          AND starts_at < (NOW() - INTERVAL 15 MINUTE)
          AND room_id IS NULL
    ");

    $pdo->exec("
        UPDATE scheduled_games
        SET status = 'expired'
        WHERE status = 'open'
          AND starts_at < (NOW() - INTERVAL 30 MINUTE)
          AND room_id IS NULL
    ");
}

function scheduled_find_for_update($pdo, $id)
{
    $stmt = $pdo->prepare("SELECT * FROM scheduled_games WHERE id = ? FOR UPDATE");
    $stmt->execute([(int) $id]);
    $game = $stmt->fetch();
    if (!$game) {
        throw new RuntimeException('Запланированная игра не найдена');
    }
    return $game;
}

function scheduled_create_live_room($pdo, $user, $game)
{
    clearUserRooms($pdo, $user['id']);

    $code = strtoupper(substr(md5(uniqid('', true)), 0, 6));
    $ip = $_SERVER['REMOTE_ADDR'] ?? '';
    $ipHash = null;
    if ($ip && defined('IP_SALT')) {
        $ipHash = hash('sha256', $ip . IP_SALT);
    }

    $stmt = $pdo->prepare("
        INSERT INTO rooms (room_code, host_user_id, ip_hash)
        VALUES (?, ?, ?)
    ");
    $stmt->execute([$code, $user['id'], $ipHash]);
    $roomId = (int) $pdo->lastInsertId();

    $pdo->prepare("INSERT INTO room_players (room_id, user_id, is_host) VALUES (?, ?, 1)")
        ->execute([$roomId, $user['id']]);

    $title = scheduled_text($game['title'] ?? '', 'Открытая игра', 64);
    $description = scheduled_text($game['description'] ?? '', 'Запланированная открытая игра', 255);
    $pdo->prepare("
        INSERT INTO public_rooms (room_id, title, description, visibility)
        VALUES (?, ?, ?, 'public')
        ON DUPLICATE KEY UPDATE title = VALUES(title), description = VALUES(description), visibility = VALUES(visibility)
    ")->execute([$roomId, $title, $description]);

    logRoomLifecycle('scheduled_room_opened', [
        'room_id' => $roomId,
        'room_code' => $code,
        'scheduled_game_id' => (int) $game['id'],
        'actor_user_id' => (int) $user['id'],
        'host_user_id' => (int) $user['id'],
        'game_type' => $game['game_type'],
        'status' => 'waiting',
    ], 'Scheduled game opened as live room');

    return ['room_id' => $roomId, 'room_code' => $code];
}

function action_create_scheduled_game($pdo, $user, $data)
{
    scheduled_cleanup_expired($pdo);

    try {
        $gameType = scheduled_game_type($data['game_type'] ?? '');
        $startsAt = scheduled_parse_datetime($data['starts_at'] ?? '');
        $opensAt = scheduled_opens_at($startsAt);
        $expiresAt = scheduled_expires_at($startsAt);
        $title = scheduled_text($data['title'] ?? '', 'Открытая игра', 120);
        $description = scheduled_text($data['description'] ?? '', '', 500);
        $minPlayers = scheduled_clamp_int($data['min_players'] ?? 2, 1, 16, 2);
        $maxPlayers = scheduled_clamp_int($data['max_players'] ?? 8, 2, 16, 8);
        if ($minPlayers > $maxPlayers) $minPlayers = $maxPlayers;

        $stmt = $pdo->prepare("
            INSERT INTO scheduled_games
                (host_user_id, game_type, title, description, visibility, status, starts_at, opens_at, expires_at, min_players, max_players)
            VALUES
                (?, ?, ?, ?, 'public', 'scheduled', ?, ?, ?, ?, ?)
        ");
        $stmt->execute([
            $user['id'],
            $gameType,
            $title,
            $description,
            $startsAt,
            $opensAt,
            $expiresAt,
            $minPlayers,
            $maxPlayers
        ]);

        $scheduledId = (int) $pdo->lastInsertId();
        $notifyAt = max(time(), strtotime($opensAt));
        $subStmt = $pdo->prepare("
            INSERT INTO room_subscriptions (scheduled_game_id, user_id, status, notify_at)
            VALUES (?, ?, 'subscribed', ?)
            ON DUPLICATE KEY UPDATE status = 'subscribed', notify_at = VALUES(notify_at), notified_at = NULL
        ");
        $subStmt->execute([$scheduledId, $user['id'], date('Y-m-d H:i:s', $notifyAt)]);

        scheduled_send_ok(['scheduled_game_id' => $scheduledId]);
    } catch (RuntimeException $e) {
        sendError($e->getMessage());
    } catch (Exception $e) {
        TelegramLogger::logError('scheduled_games', ['message' => $e->getMessage(), 'action' => 'create']);
        sendError('Scheduled game error');
    }
}

function action_update_scheduled_game($pdo, $user, $data)
{
    scheduled_cleanup_expired($pdo);

    try {
        $pdo->beginTransaction();
        $game = scheduled_find_for_update($pdo, $data['scheduled_game_id'] ?? 0);
        if ((int) $game['host_user_id'] !== (int) $user['id']) {
            throw new RuntimeException('Изменить игру может только хост');
        }
        if ($game['status'] !== 'scheduled') {
            throw new RuntimeException('Изменить можно только запланированную игру');
        }

        $startsAt = scheduled_parse_datetime($data['starts_at'] ?? '');
        $opensAt = scheduled_opens_at($startsAt);
        $expiresAt = scheduled_expires_at($startsAt);
        $title = scheduled_text($data['title'] ?? '', 'Открытая игра', 120);
        $description = scheduled_text($data['description'] ?? '', '', 500);
        $minPlayers = scheduled_clamp_int($data['min_players'] ?? $game['min_players'], 1, 16, (int) $game['min_players']);
        $maxPlayers = scheduled_clamp_int($data['max_players'] ?? $game['max_players'], 2, 16, (int) $game['max_players']);
        if ($minPlayers > $maxPlayers) $minPlayers = $maxPlayers;

        $stmt = $pdo->prepare("
            UPDATE scheduled_games
            SET title = ?,
                description = ?,
                starts_at = ?,
                opens_at = ?,
                expires_at = ?,
                min_players = ?,
                max_players = ?,
                updated_at = NOW()
            WHERE id = ?
        ");
        $stmt->execute([
            $title,
            $description,
            $startsAt,
            $opensAt,
            $expiresAt,
            $minPlayers,
            $maxPlayers,
            (int) $game['id']
        ]);

        $notifyAt = max(time(), strtotime($opensAt));
        $pdo->prepare("
            UPDATE room_subscriptions
            SET notify_at = ?, notified_at = NULL
            WHERE scheduled_game_id = ? AND status = 'subscribed'
        ")->execute([date('Y-m-d H:i:s', $notifyAt), (int) $game['id']]);

        $pdo->commit();
        scheduled_send_ok(['scheduled_game_id' => (int) $game['id']]);
    } catch (RuntimeException $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        sendError($e->getMessage());
    } catch (Exception $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        TelegramLogger::logError('scheduled_games', ['message' => $e->getMessage(), 'action' => 'update']);
        sendError('Scheduled update error');
    }
}

function action_get_scheduled_games($pdo, $user, $data)
{
    scheduled_cleanup_expired($pdo);

    $stmt = $pdo->prepare("
        SELECT sg.*,
               u.first_name as host_name,
               u.photo_url as host_avatar,
               COALESCE(subs.subscribers_count, 0) as subscribers_count,
               CASE WHEN mine.status = 'subscribed' THEN 1 ELSE 0 END as is_subscribed
        FROM scheduled_games sg
        JOIN users u ON u.id = sg.host_user_id
        LEFT JOIN (
            SELECT scheduled_game_id, COUNT(*) as subscribers_count
            FROM room_subscriptions
            WHERE status = 'subscribed'
            GROUP BY scheduled_game_id
        ) subs ON subs.scheduled_game_id = sg.id
        LEFT JOIN room_subscriptions mine ON mine.scheduled_game_id = sg.id AND mine.user_id = ?
        WHERE sg.visibility = 'public'
          AND sg.status IN ('scheduled', 'open')
          AND sg.expires_at > NOW()
        ORDER BY sg.starts_at ASC, sg.id ASC
        LIMIT 30
    ");
    $stmt->execute([$user['id']]);
    scheduled_send_ok(['games' => $stmt->fetchAll()]);
}

function action_get_my_scheduled_games($pdo, $user, $data)
{
    scheduled_cleanup_expired($pdo);

    $stmt = $pdo->prepare("
        SELECT sg.*,
               u.first_name as host_name,
               u.photo_url as host_avatar,
               COALESCE(subs.subscribers_count, 0) as subscribers_count,
               mine.status as my_subscription_status
        FROM scheduled_games sg
        JOIN users u ON u.id = sg.host_user_id
        LEFT JOIN (
            SELECT scheduled_game_id, COUNT(*) as subscribers_count
            FROM room_subscriptions
            WHERE status = 'subscribed'
            GROUP BY scheduled_game_id
        ) subs ON subs.scheduled_game_id = sg.id
        LEFT JOIN room_subscriptions mine ON mine.scheduled_game_id = sg.id AND mine.user_id = ?
        WHERE sg.host_user_id = ? OR mine.user_id = ?
        ORDER BY sg.starts_at DESC, sg.id DESC
        LIMIT 50
    ");
    $stmt->execute([$user['id'], $user['id'], $user['id']]);
    scheduled_send_ok(['games' => $stmt->fetchAll()]);
}

function action_subscribe_scheduled_game($pdo, $user, $data)
{
    scheduled_cleanup_expired($pdo);

    try {
        $pdo->beginTransaction();
        $game = scheduled_find_for_update($pdo, $data['scheduled_game_id'] ?? 0);
        if ($game['visibility'] !== 'public' || !in_array($game['status'], ['scheduled', 'open'], true)) {
            throw new RuntimeException('Эта игра уже недоступна');
        }

        $notifyAt = max(time(), strtotime($game['opens_at'] ?: $game['starts_at']) ?: time());
        $stmt = $pdo->prepare("
            INSERT INTO room_subscriptions (scheduled_game_id, user_id, status, notify_at)
            VALUES (?, ?, 'subscribed', ?)
            ON DUPLICATE KEY UPDATE status = 'subscribed', notify_at = VALUES(notify_at), notified_at = NULL
        ");
        $stmt->execute([(int) $game['id'], $user['id'], date('Y-m-d H:i:s', $notifyAt)]);
        $pdo->commit();
        scheduled_send_ok();
    } catch (RuntimeException $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        sendError($e->getMessage());
    } catch (Exception $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        TelegramLogger::logError('scheduled_games', ['message' => $e->getMessage(), 'action' => 'subscribe']);
        sendError('Scheduled subscription error');
    }
}

function action_unsubscribe_scheduled_game($pdo, $user, $data)
{
    $stmt = $pdo->prepare("
        UPDATE room_subscriptions
        SET status = 'cancelled'
        WHERE scheduled_game_id = ? AND user_id = ?
    ");
    $stmt->execute([(int) ($data['scheduled_game_id'] ?? 0), $user['id']]);
    scheduled_send_ok();
}

function action_cancel_scheduled_game($pdo, $user, $data)
{
    scheduled_cleanup_expired($pdo);

    try {
        $pdo->beginTransaction();
        $game = scheduled_find_for_update($pdo, $data['scheduled_game_id'] ?? 0);
        if ((int) $game['host_user_id'] !== (int) $user['id']) {
            throw new RuntimeException('Отменить игру может только хост');
        }
        if (!in_array($game['status'], ['scheduled', 'open'], true)) {
            throw new RuntimeException('Эту игру уже нельзя отменить');
        }

        $pdo->prepare("UPDATE scheduled_games SET status = 'cancelled' WHERE id = ?")->execute([(int) $game['id']]);
        $pdo->prepare("UPDATE room_subscriptions SET status = 'cancelled' WHERE scheduled_game_id = ?")->execute([(int) $game['id']]);
        $pdo->commit();
        scheduled_send_ok();
    } catch (RuntimeException $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        sendError($e->getMessage());
    } catch (Exception $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        TelegramLogger::logError('scheduled_games', ['message' => $e->getMessage(), 'action' => 'cancel']);
        sendError('Scheduled cancel error');
    }
}

function action_open_scheduled_game($pdo, $user, $data)
{
    scheduled_cleanup_expired($pdo);

    try {
        $pdo->beginTransaction();
        $game = scheduled_find_for_update($pdo, $data['scheduled_game_id'] ?? 0);
        if ((int) $game['host_user_id'] !== (int) $user['id']) {
            throw new RuntimeException('Открыть игру может только хост');
        }
        if (!in_array($game['status'], ['scheduled', 'open'], true)) {
            throw new RuntimeException('Эту игру уже нельзя открыть');
        }

        if (!empty($game['room_id'])) {
            $roomStmt = $pdo->prepare("SELECT room_code FROM rooms WHERE id = ? FOR UPDATE");
            $roomStmt->execute([(int) $game['room_id']]);
            $roomCode = $roomStmt->fetchColumn();
            if ($roomCode) {
                $pdo->commit();
                scheduled_send_ok(['room_code' => $roomCode, 'scheduled_game_id' => (int) $game['id']]);
            }
        }

        $room = scheduled_create_live_room($pdo, $user, $game);
        $pdo->prepare("
            UPDATE scheduled_games
            SET room_id = ?, status = 'open'
            WHERE id = ?
        ")->execute([$room['room_id'], (int) $game['id']]);
        $pdo->prepare("
            UPDATE room_subscriptions
            SET status = 'joined'
            WHERE scheduled_game_id = ? AND user_id = ?
        ")->execute([(int) $game['id'], $user['id']]);

        $pdo->commit();
        scheduled_send_ok(['room_code' => $room['room_code'], 'scheduled_game_id' => (int) $game['id']]);
    } catch (RuntimeException $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        sendError($e->getMessage());
    } catch (Exception $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        TelegramLogger::logError('scheduled_games', ['message' => $e->getMessage(), 'action' => 'open']);
        sendError('Scheduled open error');
    }
}

function action_join_scheduled_game($pdo, $user, $data)
{
    scheduled_cleanup_expired($pdo);

    try {
        $pdo->beginTransaction();
        $game = scheduled_find_for_update($pdo, $data['scheduled_game_id'] ?? 0);
        if (!in_array($game['status'], ['scheduled', 'open'], true)) {
            throw new RuntimeException('Эта игра уже недоступна');
        }

        if (empty($game['room_id'])) {
            if ((int) $game['host_user_id'] === (int) $user['id']) {
                $room = scheduled_create_live_room($pdo, $user, $game);
                $pdo->prepare("UPDATE scheduled_games SET room_id = ?, status = 'open' WHERE id = ?")
                    ->execute([$room['room_id'], (int) $game['id']]);
                $pdo->prepare("
                    UPDATE room_subscriptions
                    SET status = 'joined'
                    WHERE scheduled_game_id = ? AND user_id = ?
                ")->execute([(int) $game['id'], $user['id']]);
                $pdo->commit();
                scheduled_send_ok(['room_code' => $room['room_code'], 'scheduled_game_id' => (int) $game['id']]);
            }

            $notifyAt = max(time(), strtotime($game['opens_at'] ?: $game['starts_at']) ?: time());
            $pdo->prepare("
                INSERT INTO room_subscriptions (scheduled_game_id, user_id, status, notify_at)
                VALUES (?, ?, 'subscribed', ?)
                ON DUPLICATE KEY UPDATE status = 'subscribed', notify_at = VALUES(notify_at), notified_at = NULL
            ")->execute([(int) $game['id'], $user['id'], date('Y-m-d H:i:s', $notifyAt)]);
            $pdo->commit();
            scheduled_send_ok(['subscribed' => true]);
        }

        $roomStmt = $pdo->prepare("SELECT room_code FROM rooms WHERE id = ? FOR UPDATE");
        $roomStmt->execute([(int) $game['room_id']]);
        $roomCode = $roomStmt->fetchColumn();
        if (!$roomCode) {
            throw new RuntimeException('Комната ещё не открыта');
        }

        $result = performRoomJoin($pdo, $user, $roomCode, '');
        $pdo->prepare("
            UPDATE room_subscriptions
            SET status = 'joined'
            WHERE scheduled_game_id = ? AND user_id = ?
        ")->execute([(int) $game['id'], $user['id']]);

        logRoomLifecycle($result['lifecycle_action'], [
            'room_id' => (int) $result['room']['id'],
            'room_code' => $result['room_code'],
            'scheduled_game_id' => (int) $game['id'],
            'actor_user_id' => (int) $user['id'],
            'host_user_id' => (int) $result['room']['host_user_id'],
            'status' => $result['room']['status'],
            'players_total' => $result['counts']['total_players'],
            'humans_total' => $result['counts']['human_players'],
        ], 'Scheduled game member joined');

        $pdo->commit();
        scheduled_send_ok(['room_code' => $result['room_code'], 'scheduled_game_id' => (int) $game['id']]);
    } catch (RuntimeException $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        sendError($e->getMessage());
    } catch (Exception $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        TelegramLogger::logError('scheduled_games', ['message' => $e->getMessage(), 'action' => 'join']);
        sendError('Scheduled join error');
    }
}
