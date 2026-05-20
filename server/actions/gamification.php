<?php

require_once __DIR__ . '/../lib/gamification.php';

function action_get_daily_tasks($pdo, $user, $data)
{
    try {
        $pdo->beginTransaction();
        ensureUserDailyTasks($pdo, $user['id']);

        $stmt = $pdo->prepare("
            SELECT
                udt.id,
                udt.task_date,
                udt.task_id,
                dt.code,
                dt.title,
                dt.description,
                dt.event_type,
                udt.progress,
                udt.target_count,
                udt.status,
                dt.xp_reward,
                udt.completed_at,
                udt.claimed_at
            FROM user_daily_tasks udt
            JOIN daily_tasks dt ON dt.id = udt.task_id
            WHERE udt.user_id = ?
              AND udt.task_date = CURDATE()
              AND dt.is_active = 1
            ORDER BY dt.id ASC
        ");
        $stmt->execute([(int) $user['id']]);
        $tasks = $stmt->fetchAll();

        $pdo->commit();
        echo json_encode([
            'status' => 'ok',
            'task_date' => date('Y-m-d'),
            'tasks' => $tasks,
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    } catch (Exception $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        TelegramLogger::logError('gamification', ['message' => $e->getMessage(), 'action' => 'get_daily_tasks']);
        sendError('Daily tasks error');
    }
}

function action_claim_daily_task($pdo, $user, $data)
{
    try {
        $taskId = isset($data['task_id']) ? (int) $data['task_id'] : 0;
        $taskCode = trim((string) ($data['code'] ?? ''));
        if ($taskId <= 0 && $taskCode === '') {
            sendError('Task is required');
        }

        $pdo->beginTransaction();
        ensureUserDailyTasks($pdo, $user['id']);

        $where = $taskId > 0 ? 'udt.task_id = ?' : 'dt.code = ?';
        $params = [(int) $user['id'], $taskId > 0 ? $taskId : $taskCode];
        $stmt = $pdo->prepare("
            SELECT
                udt.id,
                udt.task_id,
                udt.progress,
                udt.target_count,
                udt.status,
                udt.claimed_at,
                dt.code,
                dt.xp_reward
            FROM user_daily_tasks udt
            JOIN daily_tasks dt ON dt.id = udt.task_id
            WHERE udt.user_id = ?
              AND udt.task_date = CURDATE()
              AND dt.is_active = 1
              AND $where
            LIMIT 1
            FOR UPDATE
        ");
        $stmt->execute($params);
        $task = $stmt->fetch();

        if (!$task) {
            $pdo->rollBack();
            sendError('Task not found');
        }
        if ($task['status'] === 'claimed' || !empty($task['claimed_at'])) {
            $pdo->commit();
            echo json_encode([
                'status' => 'ok',
                'already_claimed' => true,
                'amount' => 0,
            ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            return;
        }
        if ($task['status'] !== 'completed' || (int) $task['progress'] < (int) $task['target_count']) {
            $pdo->rollBack();
            sendError('Task is not completed');
        }

        $sourceId = date('Y-m-d') . ':' . $task['code'];
        $xpResult = addXpTransaction($pdo, (int) $user['id'], 'daily_task', $sourceId, (int) $task['xp_reward']);

        $pdo->prepare("
            UPDATE user_daily_tasks
            SET status = 'claimed', claimed_at = COALESCE(claimed_at, NOW())
            WHERE id = ?
        ")->execute([(int) $task['id']]);

        $pdo->commit();
        echo json_encode([
            'status' => 'ok',
            'amount' => (int) $xpResult['amount'],
            'already_paid' => !$xpResult['inserted'],
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    } catch (Exception $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        TelegramLogger::logError('gamification', ['message' => $e->getMessage(), 'action' => 'claim_daily_task']);
        sendError('Daily task claim error');
    }
}
