<?php

function gamificationJsonEncode($value)
{
    return json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}

function ensureUserDailyTasks($pdo, $userId)
{
    $userId = (int) $userId;
    if ($userId <= 0) {
        return;
    }

    $stmt = $pdo->prepare("
        INSERT INTO user_daily_tasks (user_id, task_date, task_id, progress, target_count, status)
        SELECT ?, CURDATE(), id, 0, target_count, 'active'
        FROM daily_tasks
        WHERE is_active = 1
        ON DUPLICATE KEY UPDATE
            target_count = VALUES(target_count)
    ");
    $stmt->execute([$userId]);
}

function recordGamificationEvent($pdo, $userId, $eventType, $sourceType, $sourceId, $payload = [])
{
    try {
        $userId = (int) $userId;
        $eventType = trim((string) $eventType);
        $sourceType = trim((string) $sourceType);
        $sourceId = trim((string) $sourceId);

        if ($userId <= 0 || $eventType === '' || $sourceType === '' || $sourceId === '') {
            return ['inserted' => false, 'progress_changed' => 0];
        }

        $payloadJson = $payload === null ? null : gamificationJsonEncode($payload);
        $stmt = $pdo->prepare("
            INSERT IGNORE INTO gamification_events (user_id, event_type, source_type, source_id, payload)
            VALUES (?, ?, ?, ?, ?)
        ");
        $stmt->execute([$userId, $eventType, $sourceType, $sourceId, $payloadJson]);

        if ($stmt->rowCount() <= 0) {
            return ['inserted' => false, 'progress_changed' => 0];
        }

        $changed = applyDailyTaskProgress($pdo, $userId, $eventType, $sourceType, $sourceId);
        return ['inserted' => true, 'progress_changed' => $changed];
    } catch (Exception $e) {
        if (class_exists('TelegramLogger')) {
            TelegramLogger::logError('gamification', [
                'message' => $e->getMessage(),
                'action' => 'record_event',
                'event_type' => $eventType ?? null,
                'source_type' => $sourceType ?? null,
                'source_id' => $sourceId ?? null,
            ]);
        }
        return ['inserted' => false, 'progress_changed' => 0];
    }
}

function applyDailyTaskProgress($pdo, $userId, $eventType, $sourceType, $sourceId)
{
    $userId = (int) $userId;
    $eventType = trim((string) $eventType);
    if ($userId <= 0 || $eventType === '') {
        return 0;
    }

    ensureUserDailyTasks($pdo, $userId);

    $stmt = $pdo->prepare("
        UPDATE user_daily_tasks udt
        JOIN daily_tasks dt ON dt.id = udt.task_id
        SET
            udt.progress = LEAST(udt.target_count, udt.progress + 1),
            udt.status = CASE
                WHEN LEAST(udt.target_count, udt.progress + 1) >= udt.target_count THEN 'completed'
                ELSE udt.status
            END,
            udt.completed_at = CASE
                WHEN LEAST(udt.target_count, udt.progress + 1) >= udt.target_count AND udt.completed_at IS NULL THEN NOW()
                ELSE udt.completed_at
            END
        WHERE udt.user_id = ?
          AND udt.task_date = CURDATE()
          AND udt.status = 'active'
          AND udt.progress < udt.target_count
          AND dt.is_active = 1
          AND dt.event_type = ?
    ");
    $stmt->execute([$userId, $eventType]);

    return $stmt->rowCount();
}

function addXpTransaction($pdo, $userId, $sourceType, $sourceId, $amount)
{
    $userId = (int) $userId;
    $sourceType = trim((string) $sourceType);
    $sourceId = trim((string) $sourceId);
    $amount = (int) $amount;

    if ($userId <= 0 || $sourceType === '' || $sourceId === '' || $amount <= 0) {
        return ['inserted' => false, 'amount' => 0];
    }

    $stmt = $pdo->prepare("
        INSERT IGNORE INTO xp_transactions (user_id, source_type, source_id, amount)
        VALUES (?, ?, ?, ?)
    ");
    $stmt->execute([$userId, $sourceType, $sourceId, $amount]);

    if ($stmt->rowCount() <= 0) {
        return ['inserted' => false, 'amount' => 0];
    }

    $pdo->prepare("INSERT IGNORE INTO user_statistics (user_id) VALUES (?)")
        ->execute([$userId]);
    $pdo->prepare("
        UPDATE user_statistics
        SET total_points_earned = total_points_earned + ?
        WHERE user_id = ?
    ")->execute([$amount, $userId]);

    return ['inserted' => true, 'amount' => $amount];
}
