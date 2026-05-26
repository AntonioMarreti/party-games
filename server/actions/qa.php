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

    $userId = (int) ($user['id'] ?? 0);
    // Minimal no-migration rate limit. QA Bug Reporter v2 should move this into persistent storage.
    $rateFile = sys_get_temp_dir() . '/pgb_qa_bug_' . $userId . '.rate';
    $lastSent = is_file($rateFile) ? (int) @file_get_contents($rateFile) : 0;
    if ($lastSent > 0 && time() - $lastSent < 10) {
        sendError('Rate limited');
    }

    $metadata = qa_extract_report_metadata($report);
    $context = [
        'user_id' => $userId ?: null,
        'telegram_id' => $user['telegram_id'] ?? null,
        'username' => qa_limit_text($user['username'] ?? null, 255),
        'first_name' => qa_limit_text($user['first_name'] ?? null, 255),
        'is_tester' => qa_truthy($user['is_tester'] ?? null) ? 1 : 0,
        'is_admin' => qa_truthy($user['is_admin'] ?? null) ? 1 : 0,
        'created_at' => date('c')
    ];

    $debugJson = qa_extract_debug_json($data);
    $reportId = qa_store_bug_report($pdo, $context, $metadata, $report, $debugJson);
    @file_put_contents($rateFile, (string) time(), LOCK_EX);

    if (class_exists('TelegramLogger')) {
        TelegramLogger::$lastError = null;
    }

    qa_send_bug_report_to_logger(qa_build_logger_notification($reportId, $context, $metadata, $report));

    echo json_encode(['status' => 'ok', 'report_id' => $reportId]);
}

function qa_send_bug_report_to_logger($text)
{
    if (!class_exists('TelegramLogger')) {
        return false;
    }

    if (!defined('BOT_TOKEN') || !defined('LOG_CHANNEL_ID') || empty(LOG_CHANNEL_ID)) {
        return false;
    }

    TelegramLogger::sendRequest('sendMessage', [
        'chat_id' => LOG_CHANNEL_ID,
        'text' => "<b>QA bug report</b>\n<pre>"
            . htmlspecialchars($text, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8')
            . "</pre>",
        'parse_mode' => 'HTML'
    ]);

    if (!empty(TelegramLogger::$lastError)) {
        return false;
    }

    return true;
}

function qa_store_bug_report(PDO $pdo, array $context, array $metadata, string $report, ?string $debugJson): int
{
    try {
        $stmt = $pdo->prepare("
            INSERT INTO qa_bug_reports (
                user_id, telegram_id, username, first_name, is_tester, is_admin,
                type, severity, screen, report_text, debug_json
            ) VALUES (
                :user_id, :telegram_id, :username, :first_name, :is_tester, :is_admin,
                :type, :severity, :screen, :report_text, :debug_json
            )
        ");
        $stmt->execute([
            ':user_id' => $context['user_id'],
            ':telegram_id' => $context['telegram_id'],
            ':username' => $context['username'],
            ':first_name' => $context['first_name'],
            ':is_tester' => $context['is_tester'],
            ':is_admin' => $context['is_admin'],
            ':type' => $metadata['type'],
            ':severity' => $metadata['severity'],
            ':screen' => $metadata['screen'],
            ':report_text' => $report,
            ':debug_json' => $debugJson
        ]);

        return (int) $pdo->lastInsertId();
    } catch (Throwable $e) {
        if (class_exists('TelegramLogger')) {
            TelegramLogger::logError('qa_bug_report_storage', [
                'message' => $e->getMessage(),
                'user_id' => $context['user_id'] ?? null
            ]);
        }
        sendError('Failed to save report');
    }
}

function qa_extract_report_metadata(string $report): array
{
    $type = 'bug';
    $typeTags = [
        '#ux' => 'ux',
        '#theme' => 'theme',
        '#scroll' => 'scroll',
        '#copy' => 'copy',
        '#idea' => 'idea'
    ];
    foreach ($typeTags as $tag => $value) {
        if (stripos($report, $tag) !== false) {
            $type = $value;
            break;
        }
    }

    $severity = null;
    if (preg_match('/^severity=([a-z0-9_-]+)/mi', $report, $matches)) {
        $severity = strtolower($matches[1]);
    }

    $screen = null;
    if (preg_match('/^Экран:\s*[\r\n]+([^\r\n]+)/mu', $report, $matches)) {
        $screen = trim($matches[1]);
    } elseif (preg_match('/^screen=([^\r\n]+)/mi', $report, $matches)) {
        $screen = trim($matches[1]);
    }

    return [
        'type' => qa_limit_text($type, 50),
        'severity' => qa_limit_text($severity, 50),
        'screen' => qa_limit_text($screen, 120)
    ];
}

function qa_extract_debug_json($data): ?string
{
    if (!isset($data['debug_json'])) {
        return null;
    }

    if (is_array($data['debug_json']) || is_object($data['debug_json'])) {
        $encoded = json_encode($data['debug_json'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        return $encoded === false ? null : qa_limit_text($encoded, 60000);
    }

    $debugJson = trim((string) $data['debug_json']);
    if ($debugJson === '') {
        return null;
    }

    return qa_limit_text($debugJson, 60000);
}

function qa_build_logger_notification(int $reportId, array $context, array $metadata, string $report): string
{
    $username = $context['username'] ? '@' . ltrim((string) $context['username'], '@') : 'unknown';
    $actual = qa_extract_report_section($report, 'Что не так', ['Как должно быть', 'Шаги', 'Экран', 'Элемент', 'Контекст']);
    $expected = qa_extract_report_section($report, 'Как должно быть', ['Шаги', 'Экран', 'Элемент', 'Контекст']);
    $element = qa_extract_report_section($report, 'Элемент', ['Последние QA события', 'Контекст']);

    return "#qa_bug #party_games\n"
        . "report_id=$reportId\n"
        . "type=" . ($metadata['type'] ?: 'unknown') . "\n"
        . "severity=" . ($metadata['severity'] ?: 'unknown') . "\n"
        . "screen=" . ($metadata['screen'] ?: 'unknown') . "\n"
        . "user_id=" . ($context['user_id'] ?? 'unknown') . "\n"
        . "telegram_id=" . ($context['telegram_id'] ?? 'unknown') . "\n"
        . "username=" . $username . "\n"
        . "first_name=" . ($context['first_name'] ?: 'unknown') . "\n"
        . "is_tester=" . ($context['is_tester'] ? 1 : 0) . " is_admin=" . ($context['is_admin'] ? 1 : 0) . "\n"
        . "server_time=" . date('c') . "\n\n"
        . "Что не так:\n" . ($actual ?: 'not provided') . "\n\n"
        . "Как должно быть:\n" . ($expected ?: 'not provided') . "\n\n"
        . "Элемент:\n" . ($element ?: 'not selected') . "\n\n"
        . "Full report is stored in DB as qa_bug_reports.id = #$reportId";
}

function qa_limit_text($value, int $limit): ?string
{
    if ($value === null) {
        return null;
    }

    $text = trim((string) $value);
    if ($text === '') {
        return null;
    }

    return function_exists('mb_substr')
        ? mb_substr($text, 0, $limit, 'UTF-8')
        : substr($text, 0, $limit);
}

function qa_extract_report_section(string $report, string $heading, array $nextHeadings = [], int $limit = 500): ?string
{
    $lines = preg_split('/\R/u', $report);
    if (!is_array($lines)) {
        return null;
    }

    $target = $heading . ':';
    $nextLookup = array_fill_keys(array_map(static fn($item) => $item . ':', $nextHeadings), true);
    $collecting = false;
    $collected = [];

    foreach ($lines as $line) {
        $trimmed = trim($line);
        if (!$collecting && $trimmed === $target) {
            $collecting = true;
            continue;
        }

        if ($collecting && isset($nextLookup[$trimmed])) {
            break;
        }

        if ($collecting) {
            $collected[] = $line;
        }
    }

    if (!$collecting) {
        return null;
    }

    $section = preg_replace('/\R{3,}/u', "\n\n", trim(implode("\n", $collected)));
    return qa_limit_text($section, $limit);
}

function qa_truthy($value): bool
{
    return $value === true || $value === 1 || $value === '1';
}
