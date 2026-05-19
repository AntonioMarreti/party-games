<?php
// Sends one MVP reminder for scheduled games that start within the next 5 minutes.
// Run manually or from cron later:
// php server/jobs/send_scheduled_game_reminders.php
// php server/jobs/send_scheduled_game_reminders.php --dry-run

require_once __DIR__ . '/../config.php';

if (php_sapi_name() !== 'cli') {
    http_response_code(403);
    echo "CLI only\n";
    exit(1);
}

if (!isset($pdo) || !$pdo instanceof PDO) {
    echo "Scheduled reminders skipped: database connection is not available.\n";
    exit(1);
}

$dryRun = in_array('--dry-run', $argv ?? [], true);
$appUrl = defined('BOT_USERNAME') ? ('https://t.me/' . BOT_USERNAME . '/app') : 'https://t.me/';

// TODO: Replace null with actual custom emoji id when available.
const SCHEDULED_REMINDER_CUSTOM_EMOJI_ID = null;

function scheduledReminderTableExists(PDO $pdo, string $table): bool
{
    $stmt = $pdo->prepare("SHOW TABLES LIKE ?");
    $stmt->execute([$table]);
    return (bool) $stmt->fetchColumn();
}

function scheduledReminderGameName($gameType)
{
    $names = [
        'bunker' => 'Бункер',
        'brainbattle' => 'Мозговая Битва',
        'partybattle' => 'Party Battle',
        'tictactoe' => 'Крестики-нолики',
        'tictactoe_ultimate' => 'Крестики-нолики Ultimate',
        'blokus' => 'Blokus',
        'wordclash' => 'WordClash',
        'backgammon' => 'Нарды',
        'minesweeper' => 'Сапёр',
        'minesweeper_br' => 'Сапёр',
        'spyfall' => 'Шпион',
    ];
    return $names[$gameType] ?? (string) $gameType;
}

function scheduledReminderFormatStartsAt($startsAt)
{
    $timestamp = strtotime((string) $startsAt);
    if ($timestamp === false) {
        return (string) $startsAt;
    }
    return date('H:i', $timestamp);
}

function scheduledReminderEmoji(): string
{
    if (defined('SCHEDULED_REMINDER_CUSTOM_EMOJI_ID') && SCHEDULED_REMINDER_CUSTOM_EMOJI_ID) {
        return '<tg-emoji emoji-id="' . htmlspecialchars((string) SCHEDULED_REMINDER_CUSTOM_EMOJI_ID, ENT_QUOTES, 'UTF-8') . '">🎮</tg-emoji> ';
    }
    return '';
}

function scheduledReminderMessage(array $game, $isHost)
{
    $gameName = scheduledReminderGameName($game['game_type'] ?? '');
    $title = trim((string) ($game['title'] ?? ''));
    $displayName = htmlspecialchars($title !== '' ? $title : $gameName, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    $time = htmlspecialchars(scheduledReminderFormatStartsAt($game['starts_at'] ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    $subscribersCount = (int) ($game['subscribers_count'] ?? 0);
    $maxPlayers = (int) ($game['max_players'] ?? 0);
    $emoji = scheduledReminderEmoji();

    if ($isHost) {
        return $emoji . "Ваша игра «{$displayName}» начнётся в <b>{$time}</b>.\n\n"
            . "Записались: {$subscribersCount}/{$maxPlayers}. Откройте комнату, когда будете готовы.";
    }

    return $emoji . "Игра «{$displayName}», на которую вы записались, начнётся в <b>{$time}</b>.\n\n"
        . "Хост скоро откроет комнату. Зайдите в приложение, чтобы не пропустить старт.";
}

function scheduledReminderSend($chatId, $text, $buttonText, $buttonUrl, $dryRun)
{
    if (!$chatId) {
        return false;
    }

    $replyMarkup = [
        'inline_keyboard' => [
            [
                [
                    'text' => $buttonText,
                    'url' => $buttonUrl,
                ],
            ],
        ],
    ];

    if ($dryRun) {
        $usesCustomEmoji = strpos($text, '<tg-emoji') !== false ? 'yes' : 'no';
        echo "[dry-run] send to {$chatId}: " . strip_tags($text) . "\n";
        echo "[dry-run]   button label: {$buttonText}\n";
        echo "[dry-run]   button url: {$buttonUrl}\n";
        echo "[dry-run]   custom emoji entity used: {$usesCustomEmoji}\n";
        return true;
    }

    $result = TelegramLogger::sendRequest('sendMessage', [
        'chat_id' => $chatId,
        'text' => $text,
        'parse_mode' => 'HTML',
        'disable_web_page_preview' => true,
        'reply_markup' => $replyMarkup,
    ]);
    $decoded = json_decode((string) $result, true);
    return is_array($decoded) && !empty($decoded['ok']);
}

function scheduledReminderLogEvent($action, array $data, string $message): void
{
    if (class_exists('TelegramLogger')) {
        TelegramLogger::logEvent('scheduled_game_reminders', $message, array_merge([
            'action' => $action,
        ], $data));
    }
}

function scheduledReminderLogError($action, array $data, string $message): void
{
    if (class_exists('TelegramLogger')) {
        TelegramLogger::logError('scheduled_game_reminders', array_merge([
            'action' => $action,
            'message' => $message,
        ], $data));
    }
}

function scheduledReminderPrintDryRunDiagnostics(PDO $pdo): void
{
    $nowStmt = $pdo->query("SELECT NOW() as server_now, NOW() + INTERVAL 5 MINUTE as window_until");
    $window = $nowStmt->fetch() ?: ['server_now' => 'unknown', 'window_until' => 'unknown'];

    echo "[dry-run] Server NOW(): {$window['server_now']}\n";
    echo "[dry-run] Search window: {$window['server_now']} -> {$window['window_until']}\n";
    echo "[dry-run] Nearest scheduled games:\n";

    $stmt = $pdo->query("
        SELECT sg.id,
               sg.host_id,
               sg.title,
               sg.status,
               sg.starts_at,
               COALESCE(subs.subscribers_count, 0) as subscribers_count,
               host_reminder.reminder_sent_at as host_reminder_sent_at,
               COALESCE(sent_subs.sent_subscribers_count, 0) as sent_subscribers_count
        FROM scheduled_games sg
        LEFT JOIN (
            SELECT scheduled_game_id, COUNT(*) as subscribers_count
            FROM scheduled_game_subscriptions
            WHERE status = 'subscribed'
            GROUP BY scheduled_game_id
        ) subs ON subs.scheduled_game_id = sg.id
        LEFT JOIN (
            SELECT scheduled_game_id, COUNT(*) as sent_subscribers_count
            FROM scheduled_game_subscriptions
            WHERE status = 'subscribed'
              AND reminder_sent_at IS NOT NULL
            GROUP BY scheduled_game_id
        ) sent_subs ON sent_subs.scheduled_game_id = sg.id
        LEFT JOIN scheduled_game_host_reminders host_reminder
            ON host_reminder.scheduled_game_id = sg.id
        ORDER BY sg.starts_at ASC, sg.id ASC
        LIMIT 5
    ");
    $rows = $stmt->fetchAll();

    if (!$rows) {
        echo "[dry-run]   no scheduled_games found\n";
        return;
    }

    $serverNow = strtotime((string) $window['server_now']);
    $windowUntil = strtotime((string) $window['window_until']);

    foreach ($rows as $row) {
        $startsAt = strtotime((string) $row['starts_at']);
        $reasons = [];

        if (($row['status'] ?? '') !== 'scheduled') {
            $reasons[] = 'status не scheduled';
        }
        if ($startsAt === false || $serverNow === false || $windowUntil === false || $startsAt < $serverNow || $startsAt > $windowUntil) {
            $reasons[] = 'starts_at вне окна';
        }
        if (!empty($row['host_reminder_sent_at']) && (int) ($row['sent_subscribers_count'] ?? 0) >= (int) ($row['subscribers_count'] ?? 0)) {
            $reasons[] = 'reminder уже отправлен';
        } elseif (!empty($row['host_reminder_sent_at'])) {
            $reasons[] = 'host reminder уже отправлен';
        } elseif ((int) ($row['sent_subscribers_count'] ?? 0) > 0) {
            $reasons[] = 'часть subscriber reminders уже отправлена';
        }

        echo "[dry-run]   #{$row['id']} | {$row['title']} | status={$row['status']} | starts_at={$row['starts_at']} | subscribers={$row['subscribers_count']} | host_id={$row['host_id']}\n";
        echo "[dry-run]      " . ($reasons ? 'не попала: ' . implode('; ', $reasons) : 'попадает в окно') . "\n";
    }
}

function scheduledReminderDeepLinkUrl(int $scheduledGameId, string $appUrl): string
{
    return $appUrl . '?startapp=scheduled_' . $scheduledGameId;
}

try {
    if (!scheduledReminderTableExists($pdo, 'scheduled_game_host_reminders')) {
        echo "Scheduled reminders skipped: table scheduled_game_host_reminders does not exist. Run migration 007.\n";
        exit(1);
    }

    $lock = $pdo->query("SELECT GET_LOCK('scheduled_game_reminders', 5)")->fetchColumn();
    if ((int) $lock !== 1) {
        echo "Scheduled reminders skipped: another run is active.\n";
        exit(0);
    }

    if ($dryRun) {
        scheduledReminderPrintDryRunDiagnostics($pdo);
    }

    $stmt = $pdo->query("
        SELECT sg.id,
               sg.host_id,
               sg.game_type,
               sg.title,
               sg.starts_at,
               sg.max_players,
               COALESCE(subs.subscribers_count, 0) as subscribers_count,
               host.telegram_id as host_telegram_id
        FROM scheduled_games sg
        JOIN users host ON host.id = sg.host_id
        LEFT JOIN (
            SELECT scheduled_game_id, COUNT(*) AS subscribers_count
            FROM scheduled_game_subscriptions
            WHERE status = 'subscribed'
            GROUP BY scheduled_game_id
        ) subs ON subs.scheduled_game_id = sg.id
        WHERE sg.status = 'scheduled'
          AND sg.starts_at BETWEEN NOW() AND (NOW() + INTERVAL 5 MINUTE)
        ORDER BY sg.starts_at ASC, sg.id ASC
    ");
    $games = $stmt->fetchAll();

    $sentHosts = 0;
    $sentSubscribers = 0;

    foreach ($games as $game) {
        $gameId = (int) $game['id'];

        $hostReminderStmt = $pdo->prepare("
            SELECT reminder_sent_at
            FROM scheduled_game_host_reminders
            WHERE scheduled_game_id = ?
            LIMIT 1
        ");
        $hostReminderStmt->execute([$gameId]);
        $hostReminderSentAt = $hostReminderStmt->fetchColumn();

        if (!$hostReminderSentAt && !empty($game['host_telegram_id'])) {
            $buttonUrl = scheduledReminderDeepLinkUrl($gameId, $appUrl);
            $sent = scheduledReminderSend(
                $game['host_telegram_id'],
                scheduledReminderMessage($game, true),
                'Открыть комнату',
                $buttonUrl,
                $dryRun
            );
            if ($sent) {
                $sentHosts++;
                scheduledReminderLogEvent('reminder_sent', [
                    'scheduled_game_id' => $gameId,
                    'recipient_role' => 'host',
                    'host_user_id' => (int) ($game['host_id'] ?? 0),
                    'chat_id' => (int) $game['host_telegram_id'],
                ], 'Scheduled reminder sent');
                if (!$dryRun) {
                    $markHostStmt = $pdo->prepare("
                        INSERT INTO scheduled_game_host_reminders (scheduled_game_id, reminder_sent_at)
                        VALUES (?, NOW())
                        ON DUPLICATE KEY UPDATE reminder_sent_at = COALESCE(reminder_sent_at, NOW())
                    ");
                    $markHostStmt->execute([$gameId]);
                }
            } else {
                scheduledReminderLogError('reminder_failed', [
                    'scheduled_game_id' => $gameId,
                    'recipient_role' => 'host',
                    'host_user_id' => (int) ($game['host_id'] ?? 0),
                    'chat_id' => (int) ($game['host_telegram_id'] ?? 0),
                ], 'Scheduled reminder failed');
            }
        }

        $subscribersStmt = $pdo->prepare("
            SELECT s.id as subscription_id,
                   u.telegram_id
            FROM scheduled_game_subscriptions s
            JOIN users u ON u.id = s.user_id
            WHERE s.scheduled_game_id = ?
              AND s.status = 'subscribed'
              AND s.reminder_sent_at IS NULL
              AND u.telegram_id IS NOT NULL
              AND u.telegram_id != ''
        ");
        $subscribersStmt->execute([$gameId]);
        $subscribers = $subscribersStmt->fetchAll();

        foreach ($subscribers as $subscriber) {
            $buttonUrl = scheduledReminderDeepLinkUrl($gameId, $appUrl);
            $sent = scheduledReminderSend(
                $subscriber['telegram_id'],
                scheduledReminderMessage($game, false),
                'Открыть игру',
                $buttonUrl,
                $dryRun
            );
            if ($sent) {
                $sentSubscribers++;
                scheduledReminderLogEvent('reminder_sent', [
                    'scheduled_game_id' => $gameId,
                    'recipient_role' => 'subscriber',
                    'subscription_id' => (int) ($subscriber['subscription_id'] ?? 0),
                    'chat_id' => (int) $subscriber['telegram_id'],
                ], 'Scheduled reminder sent');
                if (!$dryRun) {
                    $markSubscriberStmt = $pdo->prepare("
                        UPDATE scheduled_game_subscriptions
                        SET reminder_sent_at = NOW()
                        WHERE id = ?
                          AND reminder_sent_at IS NULL
                    ");
                    $markSubscriberStmt->execute([(int) $subscriber['subscription_id']]);
                }
            } else {
                scheduledReminderLogError('reminder_failed', [
                    'scheduled_game_id' => $gameId,
                    'recipient_role' => 'subscriber',
                    'subscription_id' => (int) ($subscriber['subscription_id'] ?? 0),
                    'chat_id' => (int) ($subscriber['telegram_id'] ?? 0),
                ], 'Scheduled reminder failed');
            }
        }
    }

    $pdo->query("SELECT RELEASE_LOCK('scheduled_game_reminders')");
    echo "Scheduled reminders done. Games: " . count($games)
        . ", hosts: {$sentHosts}, subscribers: {$sentSubscribers}"
        . ($dryRun ? " (dry-run)" : "")
        . "\n";
} catch (Throwable $e) {
    try {
        $pdo->query("SELECT RELEASE_LOCK('scheduled_game_reminders')");
    } catch (Throwable $ignored) {
        // Ignore release failures.
    }
    if (class_exists('TelegramLogger')) {
        TelegramLogger::logError('scheduled_game_reminders', [
            'message' => $e->getMessage(),
        ]);
    }
    echo "Scheduled reminders error: " . $e->getMessage() . "\n";
    exit(1);
}
