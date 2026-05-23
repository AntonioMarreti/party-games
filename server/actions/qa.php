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

    if (!isset($data['report']) || is_array($data['report']) || is_object($data['report'])) {
        sendError('Invalid report');
    }

    $report = trim((string) $data['report']);
    if ($report === '') {
        sendError('Empty report');
    }

    $report = function_exists('mb_substr')
        ? mb_substr($report, 0, 12000, 'UTF-8')
        : substr($report, 0, 12000);

    if (strpos($report, '#qa_bug') === false) {
        $report = "#qa_bug #party_games\n\n" . $report;
    }

    if (!defined('BOT_TOKEN') || !defined('LOG_CHANNEL_ID') || empty(LOG_CHANNEL_ID)) {
        sendError('Logger unavailable');
    }

    $userId = (int) ($user['id'] ?? 0);
    // Minimal no-migration rate limit. QA Bug Reporter v2 should move this into persistent storage.
    $rateFile = sys_get_temp_dir() . '/pgb_qa_bug_' . $userId . '.rate';
    $lastSent = is_file($rateFile) ? (int) @file_get_contents($rateFile) : 0;
    if ($lastSent > 0 && time() - $lastSent < 10) {
        sendError('Rate limited');
    }
    @file_put_contents($rateFile, (string) time(), LOCK_EX);

    $context = [
        'user_id' => $userId ?: null,
        'telegram_id' => $user['telegram_id'] ?? null,
        'username' => $user['username'] ?? null,
        'first_name' => $user['first_name'] ?? null,
        'is_tester' => $user['is_tester'] ?? null,
        'is_admin' => $user['is_admin'] ?? null,
        'created_at' => date('c')
    ];

    TelegramLogger::$lastError = null;

    $header = "QA BUG REPORT\n"
        . "user_id=" . ($context['user_id'] ?? 'unknown') . "\n"
        . "telegram_id=" . ($context['telegram_id'] ?? 'unknown') . "\n"
        . "username=" . ($context['username'] ?? 'unknown') . "\n"
        . "first_name=" . ($context['first_name'] ?? 'unknown') . "\n"
        . "is_tester=" . ($context['is_tester'] ?? 'unknown') . "\n"
        . "is_admin=" . ($context['is_admin'] ? 1 : 0) . "\n"
        . "server_time=" . $context['created_at'] . "\n\n";

    qa_send_bug_report_to_logger($report . "\n\n" . $header);

    if (!empty(TelegramLogger::$lastError)) {
        sendError('Logger unavailable');
    }

    echo json_encode(['status' => 'ok']);
}

function qa_send_bug_report_to_logger($text)
{
    if (!class_exists('TelegramLogger')) {
        sendError('Logger unavailable');
    }

    $chunks = qa_split_text($text, 3200);
    $total = count($chunks);
    foreach ($chunks as $index => $chunk) {
        $title = $total > 1 ? "QA bug report " . ($index + 1) . "/$total" : "QA bug report";
        TelegramLogger::sendRequest('sendMessage', [
            'chat_id' => LOG_CHANNEL_ID,
            'text' => "<b>" . htmlspecialchars($title, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') . "</b>\n<pre>"
                . htmlspecialchars($chunk, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8')
                . "</pre>",
            'parse_mode' => 'HTML'
        ]);

        if (!empty(TelegramLogger::$lastError)) {
            return;
        }
    }
}

function qa_split_text($text, $limit)
{
    $chunks = [];
    $length = function_exists('mb_strlen') ? mb_strlen($text, 'UTF-8') : strlen($text);
    for ($offset = 0; $offset < $length; $offset += $limit) {
        $chunks[] = function_exists('mb_substr')
            ? mb_substr($text, $offset, $limit, 'UTF-8')
            : substr($text, $offset, $limit);
    }
    return $chunks ?: [''];
}
