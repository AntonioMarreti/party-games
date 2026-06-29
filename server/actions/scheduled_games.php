<?php

require_once __DIR__ . '/../lib/gamification.php';

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
    $expiredStmt = $pdo->query("
        SELECT id
        FROM scheduled_games
        WHERE status = 'scheduled'
          AND starts_at < (NOW() - INTERVAL 1 HOUR)
    ");
    $expiredIds = array_map('intval', array_column($expiredStmt->fetchAll(), 'id'));
    if ($expiredIds) {
        $pdo->exec("
            UPDATE scheduled_games
            SET status = 'expired'
            WHERE status = 'scheduled'
              AND starts_at < (NOW() - INTERVAL 1 HOUR)
        ");
        foreach ($expiredIds as $scheduledGameId) {
            scheduled_log_event('scheduled_expired', [
                'scheduled_game_id' => $scheduledGameId,
                'reason' => 'start_time_passed',
            ], 'Scheduled game expired');
        }
    }

    if (scheduled_table_has_column($pdo, 'scheduled_games', 'room_id')) {
        $orphanedStmt = $pdo->query("
            SELECT sg.id, sg.room_id
            FROM scheduled_games sg
            LEFT JOIN rooms r ON r.id = sg.room_id
            WHERE sg.status = 'live'
              AND sg.room_id IS NOT NULL
              AND r.id IS NULL
        ");
        $orphanedGames = $orphanedStmt->fetchAll();
        if ($orphanedGames) {
            $pdo->exec("
                UPDATE scheduled_games sg
                LEFT JOIN rooms r ON r.id = sg.room_id
                SET sg.status = 'expired'
                WHERE sg.status = 'live'
                  AND sg.room_id IS NOT NULL
                  AND r.id IS NULL
            ");
            foreach ($orphanedGames as $game) {
                scheduled_log_event('scheduled_live_orphan_expired', [
                    'scheduled_game_id' => (int) ($game['id'] ?? 0),
                    'room_id' => (int) ($game['room_id'] ?? 0),
                    'reason' => 'linked_room_missing',
                ], 'Orphaned live scheduled game expired');
            }
        }
    }
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

function scheduled_log_event($action, $data = [], $message = '')
{
    if (class_exists('TelegramLogger')) {
        TelegramLogger::logEvent('scheduled_games', $message !== '' ? $message : $action, array_merge([
            'action' => $action,
        ], $data));
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

function scheduled_ensure_manual_reminders_schema($pdo)
{
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS scheduled_game_manual_reminders (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            scheduled_game_id BIGINT NOT NULL,
            actor_user_id BIGINT NOT NULL,
            sent_count INT NOT NULL DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            KEY idx_scheduled_game_created_at (scheduled_game_id, created_at),
            KEY idx_actor_user_id (actor_user_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");
}

function scheduled_deep_link_url($scheduledGameId)
{
    if (defined('BOT_USERNAME') && BOT_USERNAME) {
        return 'https://t.me/' . BOT_USERNAME . '/app?startapp=scheduled_' . (int) $scheduledGameId;
    }
    return 'https://t.me/mpartygamebot/app?startapp=scheduled_' . (int) $scheduledGameId;
}

function scheduled_room_deep_link_url($roomCode)
{
    if (defined('BOT_USERNAME') && BOT_USERNAME) {
        return 'https://t.me/' . BOT_USERNAME . '/app?startapp=' . $roomCode;
    }
    return 'https://t.me/mpartygamebot/app?startapp=' . $roomCode;
}

function scheduled_manual_reminder_message(array $game)
{
    $title = trim((string) ($game['title'] ?? ''));
    $displayTitle = htmlspecialchars($title !== '' ? $title : 'Открытая игра', ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');

    if (($game['status'] ?? '') === 'live') {
        return "Игра «{$displayTitle}» уже открыта. Можно заходить.\n\nОткройте приложение, чтобы не пропустить старт.";
    }

    return "Хост напоминает: игра «{$displayTitle}» скоро начнётся.\n\nОткройте приложение, чтобы не пропустить старт.";
}

function scheduled_create_room($pdo, $user, $game, $hostId)
{
    clearUserRooms($pdo, $hostId);

    $ip = $_SERVER['REMOTE_ADDR'] ?? '';
    $ipHash = null;
    if ($ip && defined('IP_SALT')) {
        $ipHash = hash('sha256', $ip . IP_SALT);
    }

    $stmt = $pdo->prepare("
        INSERT INTO rooms (room_code, host_user_id, ip_hash, game_type)
        VALUES (?, ?, ?, ?)
    ");
    $roomId = null;
    for ($attempt = 0; $attempt < 8; $attempt++) {
        $code = generateAvailableRoomCode($pdo);
        try {
            $stmt->execute([$code, $hostId, $ipHash, $game['game_type']]);
            $roomId = (int) $pdo->lastInsertId();
            break;
        } catch (PDOException $e) {
            if (isDuplicateKeyException($e)) {
                continue;
            }
            throw $e;
        }
    }
    if (!$roomId) {
        throw new RuntimeException('Unable to create scheduled room with a unique code');
    }

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

function scheduled_notify_subscribers($pdo, $gameId, $text, $buttonText = null, $buttonUrl = null)
{
    if (!class_exists('TelegramLogger')) {
        return;
    }
    if (!scheduled_table_exists($pdo, 'scheduled_game_subscriptions')) {
        return;
    }

    $stmt = $pdo->prepare("
        SELECT u.telegram_id
        FROM scheduled_game_subscriptions s
        JOIN users u ON u.id = s.user_id
        WHERE s.scheduled_game_id = ?
          AND s.status = 'subscribed'
          AND u.telegram_id IS NOT NULL
          AND u.telegram_id != ''
    ");
    $stmt->execute([(int) $gameId]);
    $subscribers = $stmt->fetchAll();

    if (!$subscribers) {
        return;
    }

    $replyMarkup = null;
    if ($buttonText && $buttonUrl) {
        $replyMarkup = [
            'inline_keyboard' => [ [ ['text' => $buttonText, 'url' => $buttonUrl] ] ]
        ];
    }

    foreach ($subscribers as $sub) {
        $params = [
            'chat_id' => $sub['telegram_id'],
            'text' => $text,
            'parse_mode' => 'HTML',
            'disable_web_page_preview' => true,
        ];
        if ($replyMarkup) {
            $params['reply_markup'] = $replyMarkup;
        }
        TelegramLogger::sendRequest('sendMessage', $params);
    }
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
        $scheduledGameId = (int) $pdo->lastInsertId();
        scheduled_log_event('create_scheduled_game', [
            'scheduled_game_id' => $scheduledGameId,
            'host_user_id' => (int) ($user['id'] ?? 0),
            'game_type' => $gameType,
            'starts_at' => $startsAt,
            'min_players' => $minPlayers,
            'max_players' => $maxPlayers,
        ], 'Scheduled game created');
        recordGamificationEvent($pdo, (int) $user['id'], 'scheduled_created', 'scheduled_game', $scheduledGameId, [
            'game_type' => $gameType,
            'starts_at' => $startsAt,
        ]);

        scheduled_send_ok(['scheduled_game_id' => $scheduledGameId]);
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

function action_reschedule_scheduled_game($pdo, $user, $data)
{
    scheduled_cleanup_expired($pdo);

    try {
        $pdo->beginTransaction();
        $game = scheduled_find_for_update($pdo, $data['scheduled_game_id'] ?? 0);
        $hostId = $game['host_id'] ?? ($game['host_user_id'] ?? null);
        if ((int) $hostId !== (int) $user['id']) {
            throw new RuntimeException('Перенести игру может только хост');
        }
        if ($game['status'] !== 'scheduled') {
            throw new RuntimeException('Перенести можно только запланированную игру');
        }

        $startsAt = scheduled_parse_datetime($data['starts_at'] ?? '');

        if ($startsAt !== $game['starts_at']) {
            $stmt = $pdo->prepare("
                UPDATE scheduled_games
                SET starts_at = ?
                WHERE id = ?
            ");
            $stmt->execute([
                $startsAt,
                (int) $game['id'],
            ]);

            if (scheduled_table_exists($pdo, 'scheduled_game_host_reminders')) {
                $pdo->prepare("UPDATE scheduled_game_host_reminders SET reminder_sent_at = NULL WHERE scheduled_game_id = ?")->execute([(int)$game['id']]);
            }
            if (scheduled_table_exists($pdo, 'scheduled_game_subscriptions')) {
                $pdo->prepare("UPDATE scheduled_game_subscriptions SET reminder_sent_at = NULL WHERE scheduled_game_id = ?")->execute([(int)$game['id']]);
            }

            $title = htmlspecialchars(trim((string)($game['title'] ?? '')) ?: 'Открытая игра', ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
            $timeFormatted = date('d.m.Y H:i', strtotime($startsAt));
            scheduled_notify_subscribers($pdo, (int)$game['id'], "Время игры «{$title}» изменилось. Новый старт: {$timeFormatted}.", "Открыть игру", scheduled_deep_link_url((int)$game['id']));
        }

        $pdo->commit();
        scheduled_log_event('reschedule_scheduled_game', [
            'scheduled_game_id' => (int) $game['id'],
            'host_user_id' => (int) ($user['id'] ?? 0),
            'starts_at' => $startsAt,
        ], 'Scheduled game rescheduled');
        scheduled_send_ok(['scheduled_game_id' => (int) $game['id']]);
    } catch (RuntimeException $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        sendError($e->getMessage());
    } catch (Exception $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        TelegramLogger::logError('scheduled_games', ['message' => $e->getMessage(), 'action' => 'reschedule']);
        sendError('Scheduled reschedule error');
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
        scheduled_log_event('subscribe_scheduled_game', [
            'scheduled_game_id' => (int) $game['id'],
            'user_id' => (int) ($user['id'] ?? 0),
            'host_user_id' => (int) $hostId,
        ], 'User subscribed to scheduled game');
        recordGamificationEvent($pdo, (int) $user['id'], 'scheduled_subscribed', 'scheduled_game', (int) $game['id'], [
            'host_user_id' => (int) $hostId,
        ]);
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
        scheduled_log_event('unsubscribe_scheduled_game', [
            'scheduled_game_id' => (int) $game['id'],
            'user_id' => (int) ($user['id'] ?? 0),
            'host_user_id' => (int) $hostId,
        ], 'User unsubscribed from scheduled game');
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

        $title = htmlspecialchars(trim((string)($game['title'] ?? '')) ?: 'Открытая игра', ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        scheduled_notify_subscribers($pdo, (int)$game['id'], "Комната для игры «{$title}» открыта. Можно заходить.", "Зайти в комнату", scheduled_room_deep_link_url($room['room_code']));

        scheduled_log_event('open_scheduled_game', [
            'scheduled_game_id' => (int) $game['id'],
            'host_user_id' => (int) $hostId,
            'room_id' => (int) $room['room_id'],
            'room_code' => $room['room_code'],
            'warning' => $warning,
        ], 'Scheduled game opened');
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

        $title = htmlspecialchars(trim((string)($game['title'] ?? '')) ?: 'Открытая игра', ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        scheduled_notify_subscribers($pdo, (int)$game['id'], "Игра «{$title}» отменена.");

        scheduled_log_event('cancel_scheduled_game', [
            'scheduled_game_id' => (int) $game['id'],
            'host_user_id' => (int) ($user['id'] ?? 0),
        ], 'Scheduled game cancelled');
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

function action_send_scheduled_game_manual_reminder($pdo, $user, $data)
{
    scheduled_cleanup_expired($pdo);

    try {
        if (!scheduled_table_exists($pdo, 'scheduled_game_subscriptions')) {
            throw new RuntimeException('Запись на игры временно недоступна');
        }

        scheduled_ensure_manual_reminders_schema($pdo);

        $pdo->beginTransaction();
        $game = scheduled_find_for_update($pdo, $data['scheduled_game_id'] ?? 0);
        $hostId = $game['host_id'] ?? ($game['host_user_id'] ?? null);

        if ((int) $hostId !== (int) $user['id']) {
            throw new RuntimeException('Напоминание может отправить только хост');
        }
        if (!in_array($game['status'], ['scheduled', 'live'], true)) {
            throw new RuntimeException('Для этой игры напоминание уже недоступно');
        }

        $cooldownStmt = $pdo->prepare("
            SELECT created_at
            FROM scheduled_game_manual_reminders
            WHERE scheduled_game_id = ?
              AND created_at > (NOW() - INTERVAL 10 MINUTE)
            ORDER BY created_at DESC
            LIMIT 1
        ");
        $cooldownStmt->execute([(int) $game['id']]);
        $recentReminderAt = $cooldownStmt->fetchColumn();
        if ($recentReminderAt) {
            $pdo->rollBack();
            scheduled_log_event('manual_reminder_rate_limited', [
                'scheduled_game_id' => (int) $game['id'],
                'actor_user_id' => (int) ($user['id'] ?? 0),
                'recent_created_at' => $recentReminderAt,
            ], 'Scheduled manual reminder rate limited');
            sendError('Напоминание уже отправлялось недавно');
        }

        $subscribersTotalStmt = $pdo->prepare("
            SELECT COUNT(*)
            FROM scheduled_game_subscriptions
            WHERE scheduled_game_id = ?
              AND status = 'subscribed'
        ");
        $subscribersTotalStmt->execute([(int) $game['id']]);
        $subscribersTotal = (int) $subscribersTotalStmt->fetchColumn();
        if ($subscribersTotal <= 0) {
            throw new RuntimeException('Пока некому отправлять напоминание');
        }

        $recipientsStmt = $pdo->prepare("
            SELECT s.id as subscription_id,
                   s.user_id,
                   u.telegram_id
            FROM scheduled_game_subscriptions s
            JOIN users u ON u.id = s.user_id
            WHERE s.scheduled_game_id = ?
              AND s.status = 'subscribed'
              AND u.telegram_id IS NOT NULL
              AND u.telegram_id != ''
        ");
        $recipientsStmt->execute([(int) $game['id']]);
        $recipients = $recipientsStmt->fetchAll();
        if (!$recipients) {
            throw new RuntimeException('У записавшихся игроков нет доступного Telegram-контакта');
        }

        $insertReminderStmt = $pdo->prepare("
            INSERT INTO scheduled_game_manual_reminders
                (scheduled_game_id, actor_user_id, sent_count)
            VALUES
                (?, ?, 0)
        ");
        $insertReminderStmt->execute([(int) $game['id'], (int) $user['id']]);
        $manualReminderId = (int) $pdo->lastInsertId();

        $pdo->commit();

        $message = scheduled_manual_reminder_message($game);
        $buttonUrl = scheduled_deep_link_url((int) $game['id']);
        $sentCount = 0;
        $skippedCount = max(0, $subscribersTotal - count($recipients));

        foreach ($recipients as $recipient) {
            $result = TelegramLogger::sendRequest('sendMessage', [
                'chat_id' => $recipient['telegram_id'],
                'text' => $message,
                'parse_mode' => 'HTML',
                'disable_web_page_preview' => true,
                'reply_markup' => [
                    'inline_keyboard' => [[
                        [
                            'text' => 'Открыть игру',
                            'url' => $buttonUrl,
                        ]
                    ]]
                ],
            ]);

            $decoded = json_decode((string) $result, true);
            if (is_array($decoded) && !empty($decoded['ok'])) {
                $sentCount++;
                continue;
            }

            $skippedCount++;
            scheduled_log_event('manual_reminder_failed', [
                'scheduled_game_id' => (int) $game['id'],
                'manual_reminder_id' => $manualReminderId,
                'actor_user_id' => (int) ($user['id'] ?? 0),
                'recipient_user_id' => (int) ($recipient['user_id'] ?? 0),
                'subscription_id' => (int) ($recipient['subscription_id'] ?? 0),
                'chat_id' => (int) ($recipient['telegram_id'] ?? 0),
                'telegram_error' => TelegramLogger::$lastError,
            ], 'Scheduled manual reminder failed');
        }

        $updateReminderStmt = $pdo->prepare("
            UPDATE scheduled_game_manual_reminders
            SET sent_count = ?
            WHERE id = ?
        ");
        $updateReminderStmt->execute([$sentCount, $manualReminderId]);

        scheduled_log_event('manual_reminder_sent', [
            'scheduled_game_id' => (int) $game['id'],
            'manual_reminder_id' => $manualReminderId,
            'actor_user_id' => (int) ($user['id'] ?? 0),
            'status' => $game['status'],
            'sent_count' => $sentCount,
            'skipped_count' => $skippedCount,
        ], 'Scheduled manual reminder sent');

        scheduled_send_ok([
            'sent_count' => $sentCount,
            'skipped_count' => $skippedCount,
            'message' => 'Напоминание отправлено: ' . $sentCount . ' игрокам',
        ]);
    } catch (RuntimeException $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        sendError($e->getMessage());
    } catch (Exception $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        scheduled_log_event('manual_reminder_failed', [
            'scheduled_game_id' => (int) ($data['scheduled_game_id'] ?? 0),
            'actor_user_id' => (int) ($user['id'] ?? 0),
            'error' => $e->getMessage(),
        ], 'Scheduled manual reminder failed');
        TelegramLogger::logError('scheduled_games', ['message' => $e->getMessage(), 'action' => 'manual_reminder']);
        sendError('Scheduled reminder error');
    }
}
