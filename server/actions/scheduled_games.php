<?php

function scheduled_send_ok($payload = [])
{
    echo json_encode(array_merge(['status' => 'ok'], $payload), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
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

function scheduled_int($value, $fallback)
{
    $int = filter_var($value, FILTER_VALIDATE_INT);
    return $int === false ? $fallback : $int;
}

function scheduled_game_type($value)
{
    $gameType = preg_replace('/[^a-z0-9_]/', '', strtolower((string) ($value ?? '')));
    if ($gameType === '') {
        throw new RuntimeException('Выберите игру');
    }

    $gameFile = __DIR__ . "/../games/$gameType.php";
    if (!file_exists($gameFile)) {
        throw new RuntimeException('Игра недоступна');
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
    $max = time() + 7 * 24 * 60 * 60;
    if ($timestamp < $min) {
        throw new RuntimeException('Старт должен быть хотя бы через 5 минут');
    }
    if ($timestamp > $max) {
        throw new RuntimeException('Планировать можно максимум на 7 дней');
    }

    return date('Y-m-d H:i:s', $timestamp);
}

function scheduled_cleanup_expired($pdo)
{
    // TODO: add maintenance cleanup for expired/cancelled scheduled games older than 90 days.
    $pdo->exec("
        UPDATE scheduled_games
        SET status = 'expired'
        WHERE status = 'scheduled'
          AND starts_at < (NOW() - INTERVAL 1 HOUR)
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

function scheduled_table_has_column($pdo, $table, $column)
{
    static $cache = [];
    $key = $table . '.' . $column;
    if (array_key_exists($key, $cache)) {
        return $cache[$key];
    }

    $stmt = $pdo->prepare("SHOW COLUMNS FROM `$table` LIKE ?");
    $stmt->execute([$column]);
    $cache[$key] = (bool) $stmt->fetch();
    return $cache[$key];
}

function scheduled_table_exists($pdo, $table)
{
    static $cache = [];
    if (array_key_exists($table, $cache)) {
        return $cache[$table];
    }

    $stmt = $pdo->prepare("SHOW TABLES LIKE ?");
    $stmt->execute([$table]);
    $cache[$table] = (bool) $stmt->fetchColumn();
    return $cache[$table];
}

function scheduled_log_warning($message, $data = [])
{
    if (class_exists('TelegramLogger')) {
        TelegramLogger::logError('scheduled_games_warning', array_merge(['message' => $message], $data));
    }
}

function scheduled_host_column($pdo)
{
    return scheduled_table_has_column($pdo, 'scheduled_games', 'host_id')
        ? 'host_id'
        : 'host_user_id';
}

function scheduled_column_select($pdo, $table, $column, $alias, $fallbackSql = 'NULL')
{
    return scheduled_table_has_column($pdo, $table, $column)
        ? "$column as $alias"
        : "$fallbackSql as $alias";
}

function scheduled_get_subscribers_count($pdo, $scheduledGameId)
{
    if (!scheduled_table_exists($pdo, 'scheduled_game_subscriptions')) {
        return 0;
    }

    $stmt = $pdo->prepare("
        SELECT COUNT(*)
        FROM scheduled_game_subscriptions
        WHERE scheduled_game_id = ?
          AND status = 'subscribed'
    ");
    $stmt->execute([(int) $scheduledGameId]);
    return (int) $stmt->fetchColumn();
}

function scheduled_create_room($pdo, $user, $game, $hostId)
{
    clearUserRooms($pdo, $hostId);

    $code = strtoupper(substr(md5(uniqid('', true)), 0, 6));
    $ip = $_SERVER['REMOTE_ADDR'] ?? '';
    $ipHash = null;
    if ($ip && defined('IP_SALT')) {
        $ipHash = hash('sha256', $ip . IP_SALT);
    }

    $stmt = $pdo->prepare("
        INSERT INTO rooms (room_code, host_user_id, ip_hash, game_type)
        VALUES (?, ?, ?, ?)
    ");
    $stmt->execute([$code, $hostId, $ipHash, $game['game_type']]);
    $roomId = (int) $pdo->lastInsertId();

    $pdo->prepare("INSERT INTO room_players (room_id, user_id, is_host) VALUES (?, ?, 1)")
        ->execute([$roomId, $hostId]);

    $title = scheduled_text($game['title'] ?? '', 'Открытая игра', 64);
    $description = scheduled_text($game['description'] ?? '', 'Запланированная открытая игра', 255);
    $pdo->prepare("
        INSERT INTO public_rooms (room_id, title, description, visibility)
        VALUES (?, ?, ?, 'public')
        ON DUPLICATE KEY UPDATE title = VALUES(title), description = VALUES(description), visibility = VALUES(visibility)
    ")->execute([$roomId, $title, $description]);

    logRoomLifecycle('scheduled_opened', [
        'room_id' => $roomId,
        'room_code' => $code,
        'scheduled_game_id' => (int) $game['id'],
        'actor_user_id' => (int) ($user['id'] ?? 0),
        'host_user_id' => (int) $hostId,
        'game_type' => $game['game_type'],
        'status' => 'waiting',
    ], 'Scheduled game opened as room');

    return ['room_id' => $roomId, 'room_code' => $code];
}

function action_create_scheduled_game($pdo, $user, $data)
{
    scheduled_cleanup_expired($pdo);

    try {
        $gameType = scheduled_game_type($data['game_type'] ?? '');
        $startsAt = scheduled_parse_datetime($data['starts_at'] ?? '');
        $title = scheduled_text($data['title'] ?? '', 'Открытая игра', 120);
        $description = scheduled_text($data['description'] ?? '', '', 500);
        $minPlayers = scheduled_int($data['min_players'] ?? 2, 2);
        $maxPlayers = scheduled_int($data['max_players'] ?? 8, 8);

        if ($minPlayers < 1) {
            throw new RuntimeException('Минимум игроков должен быть не меньше 1');
        }
        if ($maxPlayers < $minPlayers) {
            throw new RuntimeException('Лимит игроков должен быть не меньше минимума');
        }
        if ($maxPlayers > 16) {
            throw new RuntimeException('Максимум можно указать 16 игроков');
        }

        $hostColumn = scheduled_host_column($pdo);
        $columns = [$hostColumn, 'game_type', 'title', 'description', 'starts_at', 'min_players', 'max_players', 'status'];
        $values = [
            $user['id'],
            $gameType,
            $title,
            $description,
            $startsAt,
            $minPlayers,
            $maxPlayers,
            'scheduled',
        ];

        if ($hostColumn === 'host_id' && scheduled_table_has_column($pdo, 'scheduled_games', 'host_user_id')) {
            array_unshift($columns, 'host_user_id');
            array_unshift($values, $user['id']);
        }

        $placeholders = implode(', ', array_fill(0, count($columns), '?'));
        $columnSql = implode(', ', $columns);
        $stmt = $pdo->prepare("INSERT INTO scheduled_games ($columnSql) VALUES ($placeholders)");
        $stmt->execute($values);

        scheduled_send_ok(['scheduled_game_id' => (int) $pdo->lastInsertId()]);
    } catch (RuntimeException $e) {
        sendError($e->getMessage());
    } catch (Exception $e) {
        TelegramLogger::logError('scheduled_games', ['message' => $e->getMessage(), 'action' => 'create']);
        sendError('Scheduled game error');
    }
}

function action_get_scheduled_games($pdo, $user, $data)
{
    scheduled_cleanup_expired($pdo);
    $hostColumn = scheduled_host_column($pdo);
    $hasSubscriptions = scheduled_table_exists($pdo, 'scheduled_game_subscriptions');
    $roomIdSelect = scheduled_column_select($pdo, 'scheduled_games', 'room_id', 'room_id');
    $roomCodeSelect = scheduled_column_select($pdo, 'scheduled_games', 'room_code', 'room_code');
    $openedAtSelect = scheduled_column_select($pdo, 'scheduled_games', 'opened_at', 'opened_at');

    if (!$hasSubscriptions) {
        scheduled_log_warning('scheduled_game_subscriptions table is missing', [
            'action' => 'get_scheduled_games',
            'user_id' => (int) ($user['id'] ?? 0),
        ]);

        $stmt = $pdo->prepare("
            SELECT sg.id,
                   sg.$hostColumn as host_id,
                   sg.game_type,
                   sg.title,
                   sg.description,
                   sg.starts_at,
                   sg.min_players,
                   sg.max_players,
                   sg.status,
                   $roomIdSelect,
                   $roomCodeSelect,
                   $openedAtSelect,
                   sg.created_at,
                   u.first_name as host_name,
                   1 as subscribers_count,
                   0 as is_subscribed,
                   GREATEST(sg.max_players - 1, 0) as spots_left,
                   CASE WHEN sg.$hostColumn = ? THEN 1 ELSE 0 END as is_host
            FROM scheduled_games sg
            JOIN users u ON u.id = sg.$hostColumn
            WHERE (sg.status = 'scheduled' AND sg.starts_at >= NOW())
               OR sg.status = 'live'
            ORDER BY sg.starts_at ASC, sg.id ASC
            LIMIT 30
        ");
        $stmt->execute([$user['id']]);
        scheduled_send_ok(['games' => $stmt->fetchAll(), 'subscriptions_available' => false]);
    }

    $stmt = $pdo->prepare("
        SELECT sg.id,
               sg.$hostColumn as host_id,
               sg.game_type,
               sg.title,
               sg.description,
               sg.starts_at,
               sg.min_players,
               sg.max_players,
               sg.status,
               $roomIdSelect,
               $roomCodeSelect,
               $openedAtSelect,
               sg.created_at,
               u.first_name as host_name,
               (COALESCE(subs.subscribers_count, 0) + 1) as subscribers_count,
               CASE WHEN mine.status = 'subscribed' THEN 1 ELSE 0 END as is_subscribed,
               GREATEST(sg.max_players - (COALESCE(subs.subscribers_count, 0) + 1), 0) as spots_left,
               CASE WHEN sg.$hostColumn = ? THEN 1 ELSE 0 END as is_host
        FROM scheduled_games sg
        JOIN users u ON u.id = sg.$hostColumn
        LEFT JOIN (
            SELECT scheduled_game_id, COUNT(*) as subscribers_count
            FROM scheduled_game_subscriptions
            WHERE status = 'subscribed'
            GROUP BY scheduled_game_id
        ) subs ON subs.scheduled_game_id = sg.id
        LEFT JOIN scheduled_game_subscriptions mine
            ON mine.scheduled_game_id = sg.id
           AND mine.user_id = ?
        WHERE (sg.status = 'scheduled' AND sg.starts_at >= NOW())
           OR sg.status = 'live'
        ORDER BY sg.starts_at ASC, sg.id ASC
        LIMIT 30
    ");
    $stmt->execute([$user['id'], $user['id']]);
    scheduled_send_ok(['games' => $stmt->fetchAll()]);
}

function action_update_scheduled_game($pdo, $user, $data)
{
    scheduled_cleanup_expired($pdo);

    try {
        $pdo->beginTransaction();
        $game = scheduled_find_for_update($pdo, $data['scheduled_game_id'] ?? 0);
        $hostId = $game['host_id'] ?? ($game['host_user_id'] ?? null);
        if ((int) $hostId !== (int) $user['id']) {
            throw new RuntimeException('Изменить игру может только хост');
        }
        if ($game['status'] !== 'scheduled') {
            throw new RuntimeException('Изменить можно только запланированную игру');
        }

        $startsAt = scheduled_parse_datetime($data['starts_at'] ?? '');
        $title = scheduled_text($data['title'] ?? '', 'Открытая игра', 120);
        $description = scheduled_text($data['description'] ?? '', '', 500);
        $minPlayers = scheduled_int($data['min_players'] ?? $game['min_players'], (int) $game['min_players']);
        $maxPlayers = scheduled_int($data['max_players'] ?? $game['max_players'], (int) $game['max_players']);

        if ($minPlayers < 1) {
            throw new RuntimeException('Минимум игроков должен быть не меньше 1');
        }
        if ($maxPlayers < $minPlayers) {
            throw new RuntimeException('Лимит игроков должен быть не меньше минимума');
        }
        if ($maxPlayers > 16) {
            throw new RuntimeException('Максимум можно указать 16 игроков');
        }

        $stmt = $pdo->prepare("
            UPDATE scheduled_games
            SET title = ?,
                description = ?,
                starts_at = ?,
                min_players = ?,
                max_players = ?
            WHERE id = ?
        ");
        $stmt->execute([
            $title,
            $description,
            $startsAt,
            $minPlayers,
            $maxPlayers,
            (int) $game['id'],
        ]);

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

function action_subscribe_scheduled_game($pdo, $user, $data)
{
    scheduled_cleanup_expired($pdo);

    try {
        if (!scheduled_table_exists($pdo, 'scheduled_game_subscriptions')) {
            scheduled_log_warning('scheduled_game_subscriptions table is missing', [
                'action' => 'subscribe_scheduled_game',
                'user_id' => (int) ($user['id'] ?? 0),
            ]);
            throw new RuntimeException('Запись на игры временно недоступна');
        }

        $pdo->beginTransaction();
        $game = scheduled_find_for_update($pdo, $data['scheduled_game_id'] ?? 0);
        $hostId = $game['host_id'] ?? ($game['host_user_id'] ?? null);

        if ($game['status'] !== 'scheduled' || strtotime($game['starts_at']) < time()) {
            throw new RuntimeException('Эта игра уже недоступна');
        }
        if ((int) $hostId === (int) $user['id']) {
            $pdo->commit();
            scheduled_send_ok(['already_host' => true]);
        }

        $countStmt = $pdo->prepare("
            SELECT COUNT(*)
            FROM scheduled_game_subscriptions
            WHERE scheduled_game_id = ?
              AND status = 'subscribed'
        ");
        $countStmt->execute([(int) $game['id']]);
        $subscribers = (int) $countStmt->fetchColumn();
        $participants = $subscribers + 1; // Host counts automatically.
        if ($participants >= (int) $game['max_players']) {
            throw new RuntimeException('Мест уже нет');
        }

        $stmt = $pdo->prepare("
            INSERT INTO scheduled_game_subscriptions
                (scheduled_game_id, user_id, status, remind_before_minutes, reminder_sent_at, cancelled_at)
            VALUES
                (?, ?, 'subscribed', 15, NULL, NULL)
            ON DUPLICATE KEY UPDATE
                status = 'subscribed',
                cancelled_at = NULL,
                reminder_sent_at = NULL
        ");
        $stmt->execute([(int) $game['id'], $user['id']]);

        $pdo->commit();
        scheduled_send_ok();
    } catch (RuntimeException $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        sendError($e->getMessage());
    } catch (Exception $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        TelegramLogger::logError('scheduled_games', ['message' => $e->getMessage(), 'action' => 'subscribe']);
        sendError('Scheduled subscribe error');
    }
}

function action_unsubscribe_scheduled_game($pdo, $user, $data)
{
    scheduled_cleanup_expired($pdo);

    try {
        if (!scheduled_table_exists($pdo, 'scheduled_game_subscriptions')) {
            scheduled_log_warning('scheduled_game_subscriptions table is missing', [
                'action' => 'unsubscribe_scheduled_game',
                'user_id' => (int) ($user['id'] ?? 0),
            ]);
            throw new RuntimeException('Запись на игры временно недоступна');
        }

        $pdo->beginTransaction();
        $game = scheduled_find_for_update($pdo, $data['scheduled_game_id'] ?? 0);
        $hostId = $game['host_id'] ?? ($game['host_user_id'] ?? null);

        if ((int) $hostId === (int) $user['id']) {
            throw new RuntimeException('Хост не может отменить свою запись');
        }
        if ($game['status'] !== 'scheduled') {
            throw new RuntimeException('Эта игра уже недоступна');
        }

        $stmt = $pdo->prepare("
            UPDATE scheduled_game_subscriptions
            SET status = 'cancelled',
                cancelled_at = NOW()
            WHERE scheduled_game_id = ?
              AND user_id = ?
        ");
        $stmt->execute([(int) $game['id'], $user['id']]);

        $pdo->commit();
        scheduled_send_ok();
    } catch (RuntimeException $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        sendError($e->getMessage());
    } catch (Exception $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        TelegramLogger::logError('scheduled_games', ['message' => $e->getMessage(), 'action' => 'unsubscribe']);
        sendError('Scheduled unsubscribe error');
    }
}

function action_open_scheduled_game($pdo, $user, $data)
{
    scheduled_cleanup_expired($pdo);

    try {
        $pdo->beginTransaction();
        $game = scheduled_find_for_update($pdo, $data['scheduled_game_id'] ?? 0);
        $hostId = $game['host_id'] ?? ($game['host_user_id'] ?? null);

        if ((int) $hostId !== (int) $user['id']) {
            throw new RuntimeException('Открыть игру может только хост');
        }
        if ($game['status'] !== 'scheduled') {
            throw new RuntimeException('Эту игру уже нельзя открыть');
        }

        $startsAt = strtotime($game['starts_at']);
        if ($startsAt !== false && $startsAt - time() > 5 * 60) {
            throw new RuntimeException('Открыть игру можно за 5 минут до старта');
        }

        $subscribers = scheduled_get_subscribers_count($pdo, (int) $game['id']);
        $participants = $subscribers + 1; // Host counts automatically.
        $warning = null;
        if ($participants < (int) $game['min_players']) {
            $warning = 'Минимум игроков ещё не набран';
        }

        $room = scheduled_create_room($pdo, $user, $game, (int) $hostId);

        $sets = ["status = 'live'"];
        $params = [];
        if (scheduled_table_has_column($pdo, 'scheduled_games', 'room_id')) {
            $sets[] = 'room_id = ?';
            $params[] = $room['room_id'];
        }
        if (scheduled_table_has_column($pdo, 'scheduled_games', 'room_code')) {
            $sets[] = 'room_code = ?';
            $params[] = $room['room_code'];
        }
        if (scheduled_table_has_column($pdo, 'scheduled_games', 'opened_at')) {
            $sets[] = 'opened_at = NOW()';
        }
        $params[] = (int) $game['id'];

        $stmt = $pdo->prepare("UPDATE scheduled_games SET " . implode(', ', $sets) . " WHERE id = ?");
        $stmt->execute($params);

        $pdo->commit();
        scheduled_send_ok([
            'room_id' => $room['room_id'],
            'room_code' => $room['room_code'],
            'warning' => $warning,
        ]);
    } catch (RuntimeException $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        sendError($e->getMessage());
    } catch (Exception $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        TelegramLogger::logError('scheduled_games', ['message' => $e->getMessage(), 'action' => 'open']);
        sendError('Scheduled open error');
    }
}

function action_cancel_scheduled_game($pdo, $user, $data)
{
    scheduled_cleanup_expired($pdo);

    try {
        $pdo->beginTransaction();
        $game = scheduled_find_for_update($pdo, $data['scheduled_game_id'] ?? 0);
        $hostId = $game['host_id'] ?? ($game['host_user_id'] ?? null);
        if ((int) $hostId !== (int) $user['id']) {
            throw new RuntimeException('Отменить игру может только хост');
        }
        if ($game['status'] !== 'scheduled') {
            throw new RuntimeException('Эту игру уже нельзя отменить');
        }

        $pdo->prepare("
            UPDATE scheduled_games
            SET status = 'cancelled', cancelled_at = NOW()
            WHERE id = ?
        ")->execute([(int) $game['id']]);

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
