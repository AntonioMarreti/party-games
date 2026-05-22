<?php

function qa_is_tester_or_admin($user)
{
    return !empty($user['is_admin'])
        || $user['is_tester'] === true
        || $user['is_tester'] === 1
        || $user['is_tester'] === '1';
}

function action_submit_qa_bug_report($pdo, $user, $data)
{
    if (!qa_is_tester_or_admin($user)) {
        sendError('Access Denied');
    }

    $report = trim((string) ($data['report'] ?? ''));
    if ($report === '') {
        sendError('Empty report');
    }

    $report = function_exists('mb_substr')
        ? mb_substr($report, 0, 12000, 'UTF-8')
        : substr($report, 0, 12000);

    if (!defined('BOT_TOKEN') || !defined('LOG_CHANNEL_ID') || empty(LOG_CHANNEL_ID)) {
        sendError('Logger unavailable');
    }

    $userId = (int) ($user['id'] ?? 0);
    $rateFile = sys_get_temp_dir() . '/pgb_qa_bug_' . $userId . '.rate';
    $lastSent = is_file($rateFile) ? (int) @file_get_contents($rateFile) : 0;
    if ($lastSent > 0 && time() - $lastSent < 10) {
        sendError('Rate limited');
    }
    @file_put_contents($rateFile, (string) time(), LOCK_EX);

    TelegramLogger::logEvent('qa_bug', 'Tester bug report', [
        'report' => $report,
        'user_id' => $userId ?: null,
        'telegram_id' => $user['telegram_id'] ?? null,
        'is_tester' => $user['is_tester'] ?? null,
        'is_admin' => $user['is_admin'] ?? null,
        'created_at' => date('c')
    ]);

    if (!empty(TelegramLogger::$lastError)) {
        sendError('Logger unavailable');
    }

    echo json_encode(['status' => 'ok']);
}
