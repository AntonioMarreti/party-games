<?php
// server/bot.php

require_once 'config.php'; // Подключаем твой конфиг с PDO и BOT_TOKEN
require_once 'auth.php';   // НУЖНО для регистрации юзеров
require_once 'lib/shared_helpers.php'; // Missing helper functions (check_achievements, etc)
require_once 'actions/admin.php'; // For db repair tool

function botWebhookLog($message, $data = [])
{
    if (class_exists('TelegramLogger')) {
        TelegramLogger::info('bot_webhook_' . $message, $data);
    }
}

function detectBotUpdateType($update)
{
    if (isset($update['pre_checkout_query'])) {
        return 'pre_checkout_query';
    }
    if (isset($update['message']['successful_payment'])) {
        return 'successful_payment';
    }
    if (isset($update['callback_query'])) {
        return 'callback_query';
    }
    if (isset($update['message'])) {
        return 'message';
    }
    return 'unknown';
}

function getBotWebhookLogData($update)
{
    $type = detectBotUpdateType($update);
    $data = [
        'update_id' => $update['update_id'] ?? null,
        'update_type' => $type,
        'has_message' => isset($update['message']),
        'has_callback_query' => isset($update['callback_query']),
        'has_pre_checkout_query' => isset($update['pre_checkout_query']),
    ];

    if ($type === 'pre_checkout_query') {
        $pcq = $update['pre_checkout_query'] ?? [];
        $from = $pcq['from'] ?? [];
        return array_merge($data, [
            'user_id' => $from['id'] ?? null,
            'username' => $from['username'] ?? null,
            'first_name' => $from['first_name'] ?? null,
            'chat_id' => null,
            'message_text' => null,
            'currency' => $pcq['currency'] ?? null,
            'total_amount' => $pcq['total_amount'] ?? null,
            'invoice_payload' => $pcq['invoice_payload'] ?? null,
        ]);
    }

    if ($type === 'successful_payment') {
        $message = $update['message'] ?? [];
        $payment = $message['successful_payment'] ?? [];
        $from = $message['from'] ?? [];
        return array_merge($data, [
            'user_id' => $from['id'] ?? null,
            'username' => $from['username'] ?? null,
            'first_name' => $from['first_name'] ?? null,
            'chat_id' => $message['chat']['id'] ?? null,
            'message_text' => null,
            'currency' => $payment['currency'] ?? null,
            'total_amount' => $payment['total_amount'] ?? null,
            'invoice_payload' => $payment['invoice_payload'] ?? null,
            'telegram_payment_charge_id' => $payment['telegram_payment_charge_id'] ?? null,
            'provider_payment_charge_id' => $payment['provider_payment_charge_id'] ?? null,
        ]);
    }

    if ($type === 'callback_query') {
        $callback = $update['callback_query'] ?? [];
        $from = $callback['from'] ?? [];
        return array_merge($data, [
            'user_id' => $from['id'] ?? null,
            'username' => $from['username'] ?? null,
            'first_name' => $from['first_name'] ?? null,
            'chat_id' => $callback['message']['chat']['id'] ?? null,
            'message_text' => null,
            'callback_data' => $callback['data'] ?? null,
        ]);
    }

    $message = $update['message'] ?? [];
    $from = $message['from'] ?? [];
    return array_merge($data, [
        'user_id' => $from['id'] ?? null,
        'username' => $from['username'] ?? null,
        'first_name' => $from['first_name'] ?? null,
        'chat_id' => $message['chat']['id'] ?? null,
        'message_text' => $message['text'] ?? '',
    ]);
}

function shouldLogBotWebhook($update, $chatId)
{
    try {
        if (isTesterChatAllowed($chatId)) {
            return false;
        }
    } catch (Throwable $e) {
        // If config/helpers are broken, keep logging instead of hiding diagnostics.
        return true;
    }

    return true;
}

register_shutdown_function(function () {
    $error = error_get_last();
    if (!$error) {
        return;
    }

    $fatalTypes = [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR];
    if (!in_array($error['type'], $fatalTypes, true)) {
        return;
    }

    botWebhookLog('fatal_error', [
        'message' => $error['message'] ?? '',
        'file' => basename($error['file'] ?? ''),
        'line' => $error['line'] ?? null,
    ]);
});

// Получаем данные от Telegram
$rawInput = file_get_contents("php://input");
$update = json_decode($rawInput, true);

// Если это не сообщение (например, пустой запрос) — выходим
if (!$update) {
    botWebhookLog('invalid_request', [
        'method' => $_SERVER['REQUEST_METHOD'] ?? '',
        'content_length' => $_SERVER['CONTENT_LENGTH'] ?? '',
        'raw_length' => strlen($rawInput),
        'json_error' => json_last_error_msg(),
    ]);
    echo 'ok';
    exit;
}

if (!isset($update['message']) && !isset($update['pre_checkout_query']) && !isset($update['callback_query'])) {
    botWebhookLog('unsupported_update', [
        'update_id' => $update['update_id'] ?? null,
        'update_type' => detectBotUpdateType($update),
        'keys' => array_keys($update),
    ]);
    echo 'ok';
    exit;
}

$message = $update['message'] ?? null;
$chatId = $message['chat']['id'] ?? ($update['callback_query']['message']['chat']['id'] ?? 0);
$text = $message['text'] ?? '';

if (shouldLogBotWebhook($update, $chatId)) {
    botWebhookLog('received', getBotWebhookLogData($update));
}
syncTelegramUserFromBotUpdate($pdo, $update);

if (!empty($message['new_chat_members'])) {
    handleTesterChatWelcome($chatId, $message['new_chat_members']);
    exit;
}

// Логика команды /start
if (isset($update['pre_checkout_query'])) {
    $pcq = $update['pre_checkout_query'];
    $id = $pcq['id'];

    // Auto-approve as we don't hold physical stock
    $res = sendTelegram('answerPreCheckoutQuery', [
        'pre_checkout_query_id' => $id,
        'ok' => true
    ]);
    exit;
}

if (isset($message['successful_payment'])) {
    $sp = $message['successful_payment'];
    $amount = $sp['total_amount']; // XTR amount (Stars)
    $payload = $sp['invoice_payload']; // donation_USERID_TIME

    // Extract User ID from payload
    $parts = explode('_', $payload);
    $userId = isset($parts[1]) ? (int) $parts[1] : 0;

    if ($userId > 0) {
        try {
            // Update User Total Donation
            $stmt = $pdo->prepare("UPDATE users SET total_donated_stars = total_donated_stars + ? WHERE id = ?");
            $stmt->execute([$amount, $userId]);

            // Log transaction
            TelegramLogger::logEvent('payment', 'Payment Success', [
                'user_id' => $userId,
                'amount' => $amount,
                'tg_id' => $message['from']['id']
            ]);

            // Send Thank You Message
            reply($chatId, getSfEmoji('success') . " <b>Спасибо за поддержку!</b>\n\nВы пожертвовали <b>$amount Stars</b>. Ваша поддержка помогает нам развиваться! 💖");

        } catch (Exception $e) {
            TelegramLogger::logError('payment_db', ['error' => $e->getMessage()]);
        }
    }
    exit;
}

if (strpos($text, '/start') === 0) {
    // Извлекаем код комнаты (startapp параметр)
    // Telegram присылает это как "/start ABCD"
    $parts = explode(' ', $text);
    $startParam = isset($parts[1]) ? $parts[1] : '';

    // Формируем ссылку на Mini App
    // ЗАМЕНИ mpartygamebot на юзернейм своего бота
    $appUrl = "https://t.me/" . BOT_USERNAME . "/app";
    if (!empty($startParam)) {

        // --- НОВАЯ ЛОГИКА: АВТОРИЗАЦИЯ ЧЕРЕЗ БОТА ---
        if (strpos($startParam, 'auth_') === 0) {
            $tempCode = $startParam;

            // 1. Регистрируем/логиним юзера в нашей системе
            $tgUser = [
                'id' => $message['from']['id'],
                'first_name' => $message['from']['first_name'] ?? 'Guest',
                'username' => $message['from']['username'] ?? '',
                'photo_url' => '' // Фото через бота сложнее достать сразу
            ];
            $token = registerOrLoginUser($tgUser);

            // 2. Обновляем сессию в БД
            $stmt = $pdo->prepare("UPDATE auth_sessions SET telegram_id = ?, auth_token = ?, status = 'authorized' WHERE temp_code = ? AND status = 'pending'");
            $stmt->execute([$tgUser['id'], $token, $tempCode]);

            if ($stmt->rowCount() > 0) {
                if (class_exists('TelegramLogger')) {
                    TelegramLogger::logEvent('auth', 'bot_auth_confirmed', [
                        'telegram_id' => $tgUser['id'],
                        'temp_code_prefix' => substr($tempCode, 0, 12)
                    ]);
                }
                reply($chatId, getSfEmoji('success') . " <b>Авторизация успешна!</b>\n\nВернитесь в браузер, вы уже вошли в свой аккаунт.");
            } else {
                reply($chatId, getSfEmoji('error') . " <b>Ошибка:</b> Сессия не найдена или уже истекла.");
            }
            exit;
        }

        $appUrl .= "?startapp=" . $startParam;
    }

    $responseText = "Привет! " . getSfEmoji('greeting') . "\n\nГотов к крутой вечеринке? Жми на кнопку ниже, чтобы создать комнату или войти к друзьям!";
    if (!empty($startParam)) {
        $responseText = "Тебя пригласили в игру! " . getSfEmoji('game') . "\n\nЖми кнопку ниже, чтобы войти в комнату: **$startParam**";
    }

    $response = [
        'chat_id' => $chatId,
        'text' => $responseText,
        'parse_mode' => 'HTML',
        'reply_markup' => json_encode([
            'inline_keyboard' => [
                [
                    [
                        'text' => "ИГРАТЬ",
                        'url' => $appUrl
                    ]
                ]
            ]
        ])
    ];

    sendTelegram('sendMessage', $response);
}

// === BOT COMMANDS ===
$isAdmin = in_array($message['from']['id'], ADMIN_IDS);
$cmd = trim($text);
$commandParts = preg_split('/\s+/', trim($cmd));
$commandName = strtolower(explode('@', $commandParts[0] ?? '')[0]);

// /bug, /report - Tester bug report instructions
if (in_array($commandName, ['/bug', '/report'], true)) {
    reply($chatId, getTesterBugHelpMessage());
    exit;
}

// /help - Tester/user help
if ($commandName === '/help') {
    reply($chatId, getTesterHelpMessage());
    exit;
}

// /tester_me - self-enable tester access inside allowlisted tester chat
if ($commandName === '/tester_me') {
    if (!isTesterChatAllowed($chatId)) {
        reply($chatId, "Эта команда работает только в чате тестеров.");
        exit;
    }

    if (empty($message['from']['id'])) {
        reply($chatId, getSfEmoji('error') . " Не удалось определить пользователя.");
        exit;
    }

    enableTesterAccessFromChat($pdo, $message['from'], $chatId);
    reply($chatId, getSfEmoji('success') . " Tester-доступ включён. Если приложение уже открыто, перезапусти Mini App.");
    exit;
}

// /help_admin - Список команд (только для админов)
if ($commandName === '/help_admin') {
    if (!$isAdmin) {
        reply($chatId, getSfEmoji('error') . " Доступ запрещен");
        exit;
    }

    reply($chatId, getAdminHelpMessage());
    exit;
}

// /tester, /tester_on, /tester_off - Manage tester flag
if (in_array($commandName, ['/tester', '/tester_on', '/tester_off'], true)) {
    if (!$isAdmin) {
        reply($chatId, getSfEmoji('error') . " Недостаточно прав");
        exit;
    }

    $target = $commandParts[1] ?? '';
    $replyTesterUser = null;
    $mode = 'status';
    if ($commandName === '/tester_on') {
        $mode = 'on';
    } elseif ($commandName === '/tester_off') {
        $mode = 'off';
    } elseif (isset($commandParts[2])) {
        $mode = strtolower(trim($commandParts[2]));
    }

    if ($target === '' && in_array($commandName, ['/tester', '/tester_on'], true) && !empty($message['reply_to_message']['from']['id'])) {
        if (!isTesterChatAllowed($chatId)) {
            reply($chatId, "Reply-режим /tester работает только в чате тестеров.");
            exit;
        }

        $replyTesterUser = $message['reply_to_message']['from'];
        $target = (string) $replyTesterUser['id'];
        $mode = 'on';
    }

    if ($target === '' || !in_array($mode, ['status', 'on', 'off'], true)) {
        reply($chatId, getTesterCommandUsage());
        exit;
    }

    try {
        if ($replyTesterUser !== null) {
            $beforeResolved = findTesterTargetUser($pdo, $target);
            $before = $beforeResolved['status'] === 'ok' ? (int) ($beforeResolved['user']['is_tester'] ?? 0) : 0;

            enableTesterAccessFromChat($pdo, $replyTesterUser, $chatId);

            $resolved = findTesterTargetUser($pdo, $target);
            if ($resolved['status'] !== 'ok') {
                reply($chatId, getSfEmoji('error') . " Не удалось создать или найти пользователя.");
                exit;
            }

            reply($chatId, formatTesterStatusReply($resolved['user'], $before, 1, 'on'));
            exit;
        }

        $resolved = findTesterTargetUser($pdo, $target);
        if ($resolved['status'] === 'not_found') {
            reply($chatId, "Пользователь не найден. Он должен сначала открыть Mini App.");
            exit;
        }
        if ($resolved['status'] === 'multiple') {
            reply($chatId, formatTesterCandidates($resolved['users']));
            exit;
        }

        $targetUser = $resolved['user'];
        $before = (int) ($targetUser['is_tester'] ?? 0);
        $after = $before;

        if ($mode !== 'status') {
            $after = $mode === 'on' ? 1 : 0;
            $stmt = $pdo->prepare("UPDATE users SET is_tester = ? WHERE telegram_id = ?");
            $stmt->execute([$after, $targetUser['telegram_id']]);
            if (class_exists('TelegramLogger')) {
                TelegramLogger::logEvent('admin', 'Tester flag changed', [
                    'admin_telegram_id' => $message['from']['id'] ?? null,
                    'target_user_id' => $targetUser['id'] ?? null,
                    'target_telegram_id' => $targetUser['telegram_id'] ?? null,
                    'before' => $before,
                    'after' => $after
                ]);
            }
        }

        reply($chatId, formatTesterStatusReply($targetUser, $before, $after, $mode));
    } catch (Throwable $e) {
        if (class_exists('TelegramLogger')) {
            TelegramLogger::logError('admin', [
                'message' => 'Tester command failed',
                'stack' => $e->getMessage()
            ], [
                'user_id' => $message['from']['id'] ?? null,
                'action' => $commandName
            ]);
        }
        reply($chatId, getSfEmoji('error') . " Ошибка управления tester flag");
    }
    exit;
}

// /user - Admin user diagnostics
if ($commandName === '/user') {
    if (!$isAdmin) {
        reply($chatId, getSfEmoji('error') . " Недостаточно прав");
        exit;
    }

    $target = $commandParts[1] ?? '';
    if ($target === '') {
        reply($chatId, "Использование:\n/user 207737178\n/user @username");
        exit;
    }

    try {
        $resolved = findAdminTargetUser($pdo, $target);
        if ($resolved['status'] === 'not_found') {
            reply($chatId, "Пользователь не найден. Он должен сначала открыть Mini App.");
            exit;
        }
        if ($resolved['status'] === 'multiple') {
            reply($chatId, formatTesterCandidates($resolved['users']));
            exit;
        }

        reply($chatId, formatAdminUserInfoReply($resolved['user']));
    } catch (Throwable $e) {
        if (class_exists('TelegramLogger')) {
            TelegramLogger::logError('admin', [
                'message' => 'User diagnostics command failed',
                'stack' => $e->getMessage()
            ], [
                'admin_telegram_id' => $message['from']['id'] ?? null,
                'action' => '/user'
            ]);
        }
        reply($chatId, getSfEmoji('error') . " Ошибка диагностики пользователя");
    }
    exit;
}

// /tester_list - Admin tester list
if ($commandName === '/tester_list') {
    if (!$isAdmin) {
        reply($chatId, getSfEmoji('error') . " Недостаточно прав");
        exit;
    }

    try {
        $stmt = $pdo->query("SELECT id, telegram_id, username, first_name, is_tester FROM users WHERE is_tester = 1 ORDER BY id ASC LIMIT 50");
        $testers = $stmt->fetchAll();
        usort($testers, function ($a, $b) {
            $adminCompare = (int) isBotAdminUser($b) <=> (int) isBotAdminUser($a);
            if ($adminCompare !== 0) {
                return $adminCompare;
            }
            return (int) ($a['id'] ?? 0) <=> (int) ($b['id'] ?? 0);
        });

        reply($chatId, formatTesterListReply($testers));
    } catch (Throwable $e) {
        reply($chatId, getSfEmoji('error') . " Ошибка получения списка тестеров");
    }
    exit;
}

// /build - Safe app build diagnostics
if ($commandName === '/build') {
    $build = getAppBuildVersion();
    $serverTime = date('c');
    reply($chatId, "🏷 <b>Build</b>\n\n"
        . "app_build: <b>" . htmlspecialchars($build) . "</b>\n"
        . "server_time: <b>" . htmlspecialchars($serverTime) . "</b>");
    exit;
}

// /qa_help - QA reports command help
if ($commandName === '/qa_help') {
    if (!$isAdmin) {
        reply($chatId, getSfEmoji('error') . " Недостаточно прав");
        exit;
    }

    reply($chatId, getQaCommandHelp());
    exit;
}

// /qa_last - Recent QA bug reports
if ($commandName === '/qa_last') {
    if (!$isAdmin) {
        reply($chatId, getSfEmoji('error') . " Недостаточно прав");
        exit;
    }

    try {
        $stmt = $pdo->query("
            SELECT id, user_id, telegram_id, username, first_name, type, severity, screen, status, report_text, created_at
            FROM qa_bug_reports
            ORDER BY id DESC
            LIMIT 5
        ");
        reply($chatId, formatQaLastReportsReply($stmt->fetchAll()));
    } catch (Throwable $e) {
        reply($chatId, getSfEmoji('error') . " Ошибка чтения QA-репортов");
    }
    exit;
}

// /qa <id> - QA bug report details
if ($commandName === '/qa') {
    if (!$isAdmin) {
        reply($chatId, getSfEmoji('error') . " Недостаточно прав");
        exit;
    }

    $reportId = isset($commandParts[1]) ? (int) $commandParts[1] : 0;
    if ($reportId <= 0) {
        reply($chatId, "Использование:\n/qa 42");
        exit;
    }

    try {
        $stmt = $pdo->prepare("
            SELECT id, user_id, telegram_id, username, first_name, is_tester, is_admin,
                   type, severity, screen, report_text, status, admin_note, created_at, updated_at
            FROM qa_bug_reports
            WHERE id = ?
            LIMIT 1
        ");
        $stmt->execute([$reportId]);
        $report = $stmt->fetch();
        if (!$report) {
            reply($chatId, "QA report #<b>" . htmlspecialchars((string) $reportId) . "</b> не найден");
            exit;
        }

        reply($chatId, formatQaReportDetailsReply($report));
    } catch (Throwable $e) {
        reply($chatId, getSfEmoji('error') . " Ошибка чтения QA-репорта");
    }
    exit;
}

// /qa_status <id> <status> [note] - Update QA bug report status
if ($commandName === '/qa_status') {
    if (!$isAdmin) {
        reply($chatId, getSfEmoji('error') . " Недостаточно прав");
        exit;
    }

    $allowedStatuses = ['new', 'triaged', 'in_progress', 'fixed', 'duplicate', 'wontfix', 'need_info'];
    if (!preg_match('/^\/qa_status(?:@\w+)?\s+(\d+)\s+([a-z_]+)(?:\s+([\s\S]+))?$/i', $cmd, $matches)) {
        reply($chatId, "Использование:\n/qa_status 42 triaged Profile edit contrast issue\n\nСтатусы: " . implode(', ', $allowedStatuses));
        exit;
    }

    $reportId = (int) $matches[1];
    $status = strtolower($matches[2]);
    $note = trim((string) ($matches[3] ?? ''));
    if (!in_array($status, $allowedStatuses, true)) {
        reply($chatId, "Недопустимый status: <b>" . htmlspecialchars($status) . "</b>\n\nСтатусы: " . implode(', ', $allowedStatuses));
        exit;
    }

    try {
        if ($note !== '') {
            $stmt = $pdo->prepare("UPDATE qa_bug_reports SET status = ?, admin_note = ?, updated_at = NOW() WHERE id = ?");
            $stmt->execute([$status, botLimitText($note, 1000), $reportId]);
        } else {
            $stmt = $pdo->prepare("UPDATE qa_bug_reports SET status = ?, updated_at = NOW() WHERE id = ?");
            $stmt->execute([$status, $reportId]);
        }

        if ($stmt->rowCount() <= 0) {
            reply($chatId, "QA report #<b>" . htmlspecialchars((string) $reportId) . "</b> не найден или не изменён");
            exit;
        }

        $msg = "QA report #<b>" . htmlspecialchars((string) $reportId) . "</b> updated\n"
            . "status: <b>" . htmlspecialchars($status) . "</b>";
        if ($note !== '') {
            $msg .= "\nnote: " . htmlspecialchars(botLimitText($note, 600));
        }
        reply($chatId, $msg);
    } catch (Throwable $e) {
        reply($chatId, getSfEmoji('error') . " Ошибка обновления QA-репорта");
    }
    exit;
}

// /stats - Общая статистика
if (strpos($cmd, '/stats') === 0) {
    if (!$isAdmin) {
        reply($chatId, getSfEmoji('error') . " Доступ запрещен");
        exit;
    }

    try {
        $users = $pdo->query("SELECT COUNT(*) FROM users")->fetchColumn();
        $games = $pdo->query("SELECT COUNT(*) FROM game_history")->fetchColumn();
        $today = $pdo->query("SELECT COUNT(*) FROM game_history WHERE created_at >= CURDATE()")->fetchColumn();
        $rooms = $pdo->query("SELECT COUNT(*) FROM rooms WHERE status != 'finished'")->fetchColumn();

        $msg = getSfEmoji('stats') . " <b>Статистика Сервера</b>\n\n";
        $msg .= getSfEmoji('users') . " Пользователей: <b>$users</b>\n";
        $msg .= getSfEmoji('game') . " Игр сыграно: <b>$games</b>\n";
        $msg .= getSfEmoji('calendar') . " Игр сегодня: <b>$today</b>\n";
        $msg .= getSfEmoji('house') . " Активных комнат: <b>$rooms</b>";

        reply($chatId, $msg);
    } catch (Throwable $e) {
        reply($chatId, getSfEmoji('error') . " Ошибка: " . htmlspecialchars($e->getMessage()));
    }
}

// /users - Топ активных
if (strpos($cmd, '/users') === 0) {
    if (!$isAdmin) {
        reply($chatId, getSfEmoji('error') . " Доступ запрещен");
        exit;
    }

    // Parse limit
    $parts = explode(' ', $cmd);
    $limit = isset($parts[1]) ? (int) $parts[1] : 5;
    if ($limit < 1)
        $limit = 5;
    if ($limit > 50)
        $limit = 50; // Cap at 50

    try {
        $top = $pdo->query("SELECT * FROM users ORDER BY id DESC LIMIT $limit")->fetchAll();
        if (!$top) {
            reply($chatId, getSfEmoji('empty') . " Пользователей пока нет");
            exit;
        }

        $msg = getSfEmoji('users') . " <b>Последние $limit регистраций:</b>\n\n";
        foreach ($top as $u) {
            $uId = $u['id'];
            $fName = htmlspecialchars($u['first_name'] ?? 'Аноним');
            $uName = !empty($u['username']) ? "@" . htmlspecialchars($u['username']) : "";

            $displayName = $uName ?: $fName;

            // Make name a link to profile
            if (!empty($u['username'])) {
                $link = "<a href=\"https://t.me/" . htmlspecialchars($u['username']) . "\">{$displayName}</a>";
            } elseif (!empty($u['telegram_id'])) {
                $link = "<a href=\"tg://user?id={$u['telegram_id']}\">{$displayName}</a>";
            } else {
                $link = $displayName; // No link for users without TG ID
            }

            $msg .= "• {$link} (ID: {$uId})\n";
        }
        reply($chatId, $msg);
    } catch (Throwable $e) {
        reply($chatId, getSfEmoji('error') . " Ошибка: " . htmlspecialchars($e->getMessage()));
    }
}

// /public - Публичные комнаты
if (strpos($cmd, '/public') === 0) {
    try {
        $rooms = $pdo->query("SELECT * FROM public_rooms WHERE visibility='public'")->fetchAll();
        if (!$rooms) {
            reply($chatId, getSfEmoji('empty') . " Нет публичных комнат");
            exit;
        }
        $msg = getSfEmoji('public') . " <b>Публичные комнаты:</b>\n\n";
        foreach ($rooms as $r) {
            $msg .= "• " . htmlspecialchars($r['title']) . " (Slots: ?)\n";
        }
        reply($chatId, $msg);
    } catch (Throwable $e) {
        reply($chatId, getSfEmoji('error') . " Ошибка: " . htmlspecialchars($e->getMessage()));
    }
}

// /repair - DB Repair Tool
if (strpos($cmd, '/repair') === 0 || strpos($cmd, '/db_repair') === 0) {
    if (!$isAdmin) {
        reply($chatId, getSfEmoji('error') . " Доступ запрещен");
        exit;
    }

    reply($chatId, "<tg-emoji emoji-id=\"6021401276904905698\">🛠</tg-emoji> <b>Запуск диагностики и ремонта БД...</b>");

    try {
        // Reuse logic from actions/admin.php
        $res = perform_db_repair($pdo);

        if ($res['status'] === 'ok') {
            $msg = getSfEmoji('success') . " <b>Ремонт завершен!</b>\n\n";
            if (empty($res['fixes'])) {
                $msg .= "✅ Проблем не обнаружено.";
            } else {
                foreach ($res['fixes'] as $fix) {
                    $msg .= "• " . htmlspecialchars($fix) . "\n";
                }
            }
        } else {
            $msg = getSfEmoji('error') . " <b>Ошибка:</b> " . htmlspecialchars($res['error']);
        }
        reply($chatId, $msg);

    } catch (Throwable $e) {
        reply($chatId, getSfEmoji('error') . " Критическая Ошибка: " . htmlspecialchars($e->getMessage()));
    }
}


// /clear - Remove Reply Keyboard
if (strpos($cmd, '/clear') === 0) {
    sendTelegram('sendMessage', [
        'chat_id' => $chatId,
        'text' => getSfEmoji('success') . " Клавиатура удалена!",
        'reply_markup' => json_encode(['remove_keyboard' => true])
    ]);
}

// === HELPER FUNCTIONS (Must be triggering-safe) ===

function reply($chatId, $text)
{
    sendTelegram('sendMessage', [
        'chat_id' => $chatId,
        'text' => $text,
        'parse_mode' => 'HTML'
    ]);
}

/**
 * Универсальная функция отправки в Telegram
 * Использует константу BOT_TOKEN из config.php
 */
function sendTelegram($method, $data)
{
    foreach ($data as $key => $value) {
        if (is_array($value) || is_object($value)) {
            $data[$key] = json_encode($value, JSON_UNESCAPED_UNICODE);
        }
    }

    $url = "https://tgproxy.regucka1998.workers.dev/bot" . BOT_TOKEN . "/$method";

    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_POST, 1);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $data);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    $res = curl_exec($ch);
    curl_close($ch);
    return $res;
}

function syncTelegramUserFromBotUpdate($pdo, $update)
{
    $from = getBotUpdateFromUser($update);
    $telegramId = $from['id'] ?? null;
    if (!$telegramId) {
        return;
    }

    $username = sanitize_public_username($from['username'] ?? '');
    $firstName = sanitize_public_text($from['first_name'] ?? '', 64);
    if ($username === '' && $firstName === '') {
        return;
    }

    $updates = [];
    $params = [];
    if ($username !== '') {
        $updates[] = 'username = ?';
        $params[] = $username;
    }
    if ($firstName !== '') {
        $updates[] = 'first_name = ?';
        $params[] = sanitize_display_name($firstName, $username, '', 'Игрок');
    }
    if (!$updates) {
        return;
    }

    $params[] = (string) $telegramId;
    try {
        $pdo->prepare("UPDATE users SET " . implode(', ', $updates) . " WHERE telegram_id = ?")
            ->execute($params);
    } catch (Throwable $e) {
        if (class_exists('TelegramLogger')) {
            TelegramLogger::logError('bot_user_sync', [
                'message' => $e->getMessage(),
            ], [
                'telegram_id' => $telegramId,
            ]);
        }
    }
}

function getBotUpdateFromUser($update)
{
    if (isset($update['message']['from'])) {
        return $update['message']['from'];
    }
    if (isset($update['callback_query']['from'])) {
        return $update['callback_query']['from'];
    }
    if (isset($update['pre_checkout_query']['from'])) {
        return $update['pre_checkout_query']['from'];
    }
    return [];
}

function handleTesterChatWelcome($chatId, $members)
{
    if (!isTesterChatAllowed($chatId)) {
        return;
    }

    $members = is_array($members) ? $members : [];
    if (!$members) {
        return;
    }

    foreach ($members as $member) {
        if (isBotSelfMember($member)) {
            reply($chatId, "Бот подключён. /help — памятка тестера.");
            return;
        }
    }

    foreach ($members as $member) {
        enableTesterAccessFromChat($GLOBALS['pdo'] ?? null, $member, $chatId);
    }

    reply($chatId, getTesterChatWelcomeMessage());
}

function isTesterChatAllowed($chatId)
{
    $allowed = getTesterChatAllowedIds();
    if (!$allowed) {
        return false;
    }

    return in_array((string) $chatId, $allowed, true);
}

function getTesterChatAllowedIds()
{
    $raw = [];
    if (defined('TESTER_CHAT_IDS')) {
        $raw = array_merge($raw, (array) TESTER_CHAT_IDS);
    }
    if (defined('TESTER_CHAT_ID')) {
        $raw[] = TESTER_CHAT_ID;
    }

    $allowed = [];
    foreach ($raw as $value) {
        foreach (explode(',', (string) $value) as $id) {
            $id = trim($id);
            if ($id !== '') {
                $allowed[] = $id;
            }
        }
    }

    return array_values(array_unique($allowed));
}

function isBotSelfMember($member)
{
    $botId = null;
    if (defined('BOT_TOKEN') && preg_match('/^(\d+):/', BOT_TOKEN, $matches)) {
        $botId = $matches[1];
    }

    if (!$botId) {
        return false;
    }

    return (string) ($member['id'] ?? '') === (string) $botId;
}

function enableTesterAccessFromChat($pdo, $member, $chatId)
{
    if (!$pdo instanceof PDO || empty($member['id'])) {
        return;
    }

    $telegramId = (string) $member['id'];
    $username = sanitize_public_username($member['username'] ?? '');
    $incomingFirstName = sanitize_public_text($member['first_name'] ?? '', 64);
    $firstName = sanitize_display_name($incomingFirstName, $username, '', 'Игрок');

    try {
        $stmt = $pdo->prepare("SELECT id, username, first_name, is_tester FROM users WHERE telegram_id = ? LIMIT 1");
        $stmt->execute([$telegramId]);
        $user = $stmt->fetch();

        if ($user) {
            $updates = ['is_tester = 1'];
            $params = [];
            if ($username !== '') {
                $updates[] = 'username = ?';
                $params[] = $username;
            }
            if ($incomingFirstName !== '') {
                $updates[] = 'first_name = ?';
                $params[] = $firstName;
            }
            $params[] = (int) $user['id'];
            $pdo->prepare("UPDATE users SET " . implode(', ', $updates) . " WHERE id = ?")
                ->execute($params);
            $userId = (int) $user['id'];
        } else {
            $pdo->prepare("INSERT INTO users (telegram_id, first_name, username, photo_url, is_tester) VALUES (?, ?, ?, ?, 1)")
                ->execute([$telegramId, $firstName, $username ?: null, '']);
            $userId = (int) $pdo->lastInsertId();
            $pdo->prepare("INSERT IGNORE INTO user_statistics (user_id) VALUES (?)")->execute([$userId]);
        }

        if (class_exists('TelegramLogger')) {
            TelegramLogger::logEvent('admin', 'tester_access_enabled_from_chat', [
                'chat_id' => $chatId,
                'user_id' => $userId,
                'telegram_id' => $telegramId,
                'username' => $username ?: null,
                'first_name' => $incomingFirstName ?: null
            ]);
        }
    } catch (Throwable $e) {
        if (class_exists('TelegramLogger')) {
            TelegramLogger::logError('tester_chat_onboarding', [
                'message' => $e->getMessage()
            ], [
                'telegram_id' => $telegramId,
                'chat_id' => $chatId
            ]);
        }
    }
}

function getTesterCommandUsage()
{
    return "Использование:\n"
        . "/tester 207737178\n"
        . "/tester_on 207737178\n"
        . "/tester_off 207737178\n"
        . "/tester @username\n\n"
        . "В чате тестеров можно ответить на сообщение пользователя командой /tester\n\n"
        . "Можно также: /tester 207737178 on|off|status";
}

function findAdminTargetUser($pdo, $target)
{
    $target = trim((string) $target);
    if ($target === '') {
        return ['status' => 'not_found'];
    }

    $columns = getAdminUserSelectColumns($pdo);

    if (preg_match('/^\d+$/', $target)) {
        $stmt = $pdo->prepare("SELECT $columns FROM users WHERE telegram_id = ? LIMIT 2");
        $stmt->execute([$target]);
        $users = $stmt->fetchAll();
    } else {
        $username = trim(ltrim($target, '@'));
        if ($username === '') {
            return ['status' => 'not_found'];
        }

        $stmt = $pdo->prepare("SELECT $columns FROM users WHERE LOWER(username) = LOWER(?) LIMIT 6");
        $stmt->execute([$username]);
        $users = $stmt->fetchAll();
    }

    if (!$users) {
        return ['status' => 'not_found'];
    }
    if (count($users) > 1) {
        return ['status' => 'multiple', 'users' => $users];
    }
    return ['status' => 'ok', 'user' => $users[0]];
}

function getAdminUserSelectColumns($pdo)
{
    $columns = ['id', 'telegram_id', 'username', 'first_name', 'is_tester'];
    foreach (['created_at', 'updated_at', 'last_seen'] as $optionalColumn) {
        if (botUserColumnExists($pdo, $optionalColumn)) {
            $columns[] = $optionalColumn;
        }
    }
    return implode(', ', $columns);
}

function botUserColumnExists($pdo, $column)
{
    static $cache = [];
    if (array_key_exists($column, $cache)) {
        return $cache[$column];
    }

    try {
        $stmt = $pdo->prepare("SHOW COLUMNS FROM users LIKE ?");
        $stmt->execute([$column]);
        $cache[$column] = (bool) $stmt->fetch();
    } catch (Throwable $e) {
        $cache[$column] = false;
    }

    return $cache[$column];
}

function formatAdminUserInfoReply($user)
{
    $username = formatBotUsername($user['username'] ?? null);
    $firstName = formatBotValue($user['first_name'] ?? null);
    $createdAt = formatBotValue($user['created_at'] ?? null);
    $updatedAt = formatBotValue($user['updated_at'] ?? ($user['last_seen'] ?? null));

    $msg = "👤 <b>User</b>\n\n"
        . "id: <b>" . htmlspecialchars((string) ($user['id'] ?? '—')) . "</b>\n"
        . "telegram_id: <b>" . htmlspecialchars((string) ($user['telegram_id'] ?? '—')) . "</b>\n"
        . "username: <b>" . htmlspecialchars($username) . "</b>\n"
        . "first_name: <b>" . htmlspecialchars($firstName) . "</b>\n"
        . "is_tester: <b>" . (int) ($user['is_tester'] ?? 0) . "</b>\n"
        . "is_admin: <b>" . (isBotAdminUser($user) ? 1 : 0) . "</b>";

    if ($createdAt !== '—') {
        $msg .= "\ncreated_at: <b>" . htmlspecialchars($createdAt) . "</b>";
    }
    if ($updatedAt !== '—') {
        $msg .= "\nlast_seen/updated_at: <b>" . htmlspecialchars($updatedAt) . "</b>";
    }

    return $msg;
}

function formatTesterListReply($testers)
{
    if (!$testers) {
        return "🧪 Тестеров пока нет";
    }

    $msg = "🧪 <b>Testers: " . count($testers) . "</b>\n\n";
    foreach ($testers as $index => $tester) {
        $name = formatBotValue($tester['first_name'] ?? null);
        if ($name === '—') {
            $name = formatBotUsername($tester['username'] ?? null);
        }
        if ($name === '—') {
            $name = 'Игрок';
        }

        $msg .= ($index + 1) . ". <b>" . htmlspecialchars($name) . "</b>\n"
            . "id=" . htmlspecialchars((string) ($tester['id'] ?? '—'))
            . " tg=" . htmlspecialchars((string) ($tester['telegram_id'] ?? '—'))
            . " username=" . htmlspecialchars(formatBotUsername($tester['username'] ?? null))
            . " admin=" . (isBotAdminUser($tester) ? 1 : 0) . "\n";
    }

    return $msg;
}

function getAppBuildVersion()
{
    $versionFile = __DIR__ . '/../layout/version.php';
    if (!is_file($versionFile)) {
        return '—';
    }

    $contents = @file_get_contents($versionFile);
    if (is_string($contents) && preg_match('/\$v\s*=\s*[\'"]([^\'"]+)[\'"]/', $contents, $matches)) {
        return $matches[1];
    }

    return '—';
}

function getTesterBugHelpMessage()
{
    return "🐞 <b>Как отправить баг</b>\n\n"
        . "1. Открой приложение.\n"
        . "2. Перейди в <b>Настройки → Сообщить об ошибке</b>.\n"
        . "3. Опиши:\n"
        . "— что не так;\n"
        . "— как должно быть;\n"
        . "— что ты делал перед багом.\n"
        . "4. Если проблема с конкретным элементом — нажми <b>Выбрать элемент</b>.\n"
        . "5. Отправь репорт.\n\n"
        . "После отправки появится номер вроде:\n"
        . "<b>Баг-репорт отправлен #12</b>\n\n"
        . "Этот номер можно скинуть в чат, если хочешь обсудить баг.\n\n"
        . "Если кнопки <b>Сообщить об ошибке</b> нет — напиши в чат, возможно тебе ещё не включили tester-доступ.";
}

function getTesterHelpMessage()
{
    return "🎮 <b>Party Games — памятка тестера</b>\n\n"
        . "<b>Полезные команды:</b>\n"
        . "🐞 /bug или /report — как отправить баг\n"
        . "🧪 /tester_me — включить tester-доступ в чате тестеров\n"
        . "🏷 /build — текущая версия приложения\n"
        . "❓ /help — эта памятка\n\n"
        . "<b>Что особенно полезно проверять:</b>\n"
        . "— непонятные экраны;\n"
        . "— плохой контраст текста;\n"
        . "— кнопки, которые не нажимаются;\n"
        . "— странные отступы/перекрытия;\n"
        . "— ошибки после игр;\n"
        . "— проблемы в Telegram Desktop и на телефоне.\n\n"
        . "Баги лучше отправлять через приложение:\n"
        . "<b>Настройки → Сообщить об ошибке</b>";
}

function getTesterChatWelcomeMessage()
{
    return "Привет! Это чат тестеров Party Games 🎮\n\n"
        . "Я включил тебе tester-доступ.\n\n"
        . "Если заметишь баг или странный экран — лучше отправить репорт прямо из приложения:\n"
        . "<b>Настройки → Сообщить об ошибке</b>\n\n"
        . "После отправки появится номер репорта. Его можно скинуть сюда, если хочешь обсудить проблему.\n\n"
        . "<b>Команды:</b>\n"
        . "/bug — как отправить баг\n"
        . "/tester_me — включить tester-доступ\n"
        . "/build — текущая версия\n"
        . "/help — памятка тестера\n\n"
        . "Спасибо, что помогаешь тестировать 🙏";
}

function getAdminHelpMessage()
{
    return getSfEmoji('admin') . " <b>Admin help</b>\n\n"
        . "<b>Диагностика</b>\n"
        . getSfEmoji('stats') . " /stats — общая статистика сервера\n"
        . getSfEmoji('users') . " /users [limit] — последние регистрации\n"
        . "<tg-emoji emoji-id=\"6024039683904772353\">👤</tg-emoji> /user &lt;telegram_id|@username&gt; — карточка пользователя\n"
        . "<tg-emoji emoji-id=\"6019102674832595118\">⚠️</tg-emoji> /build — текущая сборка и server_time\n"
        . getSfEmoji('public') . " /public — публичные комнаты\n\n"
        . "<b>Тестеры</b>\n"
        . "<tg-emoji emoji-id=\"6021835657012320577\">💉</tg-emoji> /tester &lt;telegram_id|@username&gt; — статус tester flag\n"
        . "<tg-emoji emoji-id=\"5807642902066634351\">➕</tg-emoji> /tester_on &lt;telegram_id|@username&gt; — включить tester flag\n"
        . "<tg-emoji emoji-id=\"5807405618008433289\">➖</tg-emoji> /tester_off &lt;telegram_id|@username&gt; — выключить tester flag\n"
        . "<tg-emoji emoji-id=\"6026029580907715757\">📋</tg-emoji> /tester_list — список тестеров\n\n"
        . "<b>QA reports</b>\n"
        . "<tg-emoji emoji-id=\"6021401276904905698\">🛠</tg-emoji> /qa_last — последние 5 QA-репортов\n"
        . "<tg-emoji emoji-id=\"6021401276904905698\">🛠</tg-emoji> /qa &lt;id&gt; — подробный QA-репорт\n"
        . "<tg-emoji emoji-id=\"6021401276904905698\">🛠</tg-emoji> /qa_status &lt;id&gt; &lt;status&gt; [note] — обновить статус\n"
        . "<tg-emoji emoji-id=\"6021401276904905698\">🛠</tg-emoji> /qa_help — краткая справка по QA-командам\n\n"
        . "<b>Сервис</b>\n"
        . "<tg-emoji emoji-id=\"5945270344473386298\">🪛</tg-emoji> /repair или /db_repair — диагностика/ремонт БД\n"
        . "<tg-emoji emoji-id=\"5807623222526484584\">⌨️</tg-emoji> /clear — убрать reply keyboard\n"
        . "<tg-emoji emoji-id=\"6021435576513730578\">📋</tg-emoji> /help_admin — эта справка";
}

function getQaCommandHelp()
{
    return "🐞 <b>QA reports</b>\n\n"
        . "/qa_last — последние QA-репорты\n"
        . "/qa &lt;id&gt; — подробный QA-репорт\n"
        . "/qa_status &lt;id&gt; &lt;status&gt; [note] — обновить статус\n\n"
        . "Статусы: new, triaged, in_progress, fixed, duplicate, wontfix, need_info";
}

function formatQaLastReportsReply($reports)
{
    if (!$reports) {
        return "🐞 QA-репортов пока нет";
    }

    $msg = "🐞 <b>Последние QA reports</b>\n\n";
    foreach ($reports as $report) {
        $preview = botExtractQaReportSection($report['report_text'] ?? '', 'Что не так', ['Как должно быть', 'Шаги', 'Экран', 'Элемент', 'Контекст'], 220);
        if ($preview === '—') {
            $preview = botLimitText(preg_replace('/\s+/u', ' ', (string) ($report['report_text'] ?? '')), 220);
        }

        $msg .= "#<b>" . htmlspecialchars((string) ($report['id'] ?? '—')) . "</b> "
            . htmlspecialchars(formatBotValue($report['severity'] ?? null)) . " "
            . htmlspecialchars(formatBotValue($report['type'] ?? null)) . " "
            . htmlspecialchars(formatBotValue($report['status'] ?? null)) . "\n"
            . "screen: " . htmlspecialchars(formatBotValue($report['screen'] ?? null)) . "\n"
            . "user: " . htmlspecialchars(formatQaReportUser($report)) . "\n"
            . "created: " . htmlspecialchars(formatBotValue($report['created_at'] ?? null)) . "\n"
            . "Что не так: " . htmlspecialchars($preview) . "\n\n";
    }

    return $msg;
}

function formatQaReportDetailsReply($report)
{
    $fullReport = (string) ($report['report_text'] ?? '');
    $limitedReport = botLimitText($fullReport, 1800);
    $isTruncated = botTextLength($fullReport) > botTextLength($limitedReport);

    $msg = "🐞 <b>QA report #" . htmlspecialchars((string) ($report['id'] ?? '—')) . "</b>\n\n"
        . "status: <b>" . htmlspecialchars(formatBotValue($report['status'] ?? null)) . "</b>\n"
        . "type: <b>" . htmlspecialchars(formatBotValue($report['type'] ?? null)) . "</b>\n"
        . "severity: <b>" . htmlspecialchars(formatBotValue($report['severity'] ?? null)) . "</b>\n"
        . "screen: <b>" . htmlspecialchars(formatBotValue($report['screen'] ?? null)) . "</b>\n"
        . "user_id: <b>" . htmlspecialchars(formatBotValue($report['user_id'] ?? null)) . "</b>\n"
        . "telegram_id: <b>" . htmlspecialchars(formatBotValue($report['telegram_id'] ?? null)) . "</b>\n"
        . "username: <b>" . htmlspecialchars(formatBotUsername($report['username'] ?? null)) . "</b>\n"
        . "first_name: <b>" . htmlspecialchars(formatBotValue($report['first_name'] ?? null)) . "</b>\n"
        . "is_tester: <b>" . (int) ($report['is_tester'] ?? 0) . "</b> "
        . "is_admin: <b>" . (int) ($report['is_admin'] ?? 0) . "</b>\n"
        . "created_at: <b>" . htmlspecialchars(formatBotValue($report['created_at'] ?? null)) . "</b>\n"
        . "updated_at: <b>" . htmlspecialchars(formatBotValue($report['updated_at'] ?? null)) . "</b>";

    if (formatBotValue($report['admin_note'] ?? null) !== '—') {
        $msg .= "\nadmin_note: " . htmlspecialchars(botLimitText($report['admin_note'], 500));
    }

    $msg .= "\n\n<b>report_text:</b>\n<pre>"
        . htmlspecialchars($limitedReport !== '' ? $limitedReport : '—')
        . "</pre>";

    if ($isTruncated) {
        $msg .= "\nПолный текст хранится в БД: qa_bug_reports.id = #"
            . htmlspecialchars((string) ($report['id'] ?? '—'));
    }

    return $msg;
}

function formatQaReportUser($report)
{
    $name = formatBotValue($report['first_name'] ?? null);
    $username = formatBotUsername($report['username'] ?? null);
    if ($name !== '—' && $username !== '—') {
        return "$name / $username";
    }
    if ($name !== '—') {
        return $name;
    }
    if ($username !== '—') {
        return $username;
    }
    return 'user_id=' . formatBotValue($report['user_id'] ?? null);
}

function botExtractQaReportSection($report, $heading, $nextHeadings = [], $limit = 500)
{
    $lines = preg_split('/\R/u', (string) $report);
    if (!is_array($lines)) {
        return '—';
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
        return '—';
    }

    $section = trim(preg_replace('/\s+/u', ' ', implode("\n", $collected)));
    return $section !== '' ? botLimitText($section, $limit) : '—';
}

function botLimitText($value, $limit)
{
    $text = trim((string) ($value ?? ''));
    if ($text === '') {
        return '';
    }

    if (botTextLength($text) <= $limit) {
        return $text;
    }

    $suffix = '…';
    $sliceLimit = max(0, $limit - botTextLength($suffix));
    $slice = function_exists('mb_substr')
        ? mb_substr($text, 0, $sliceLimit, 'UTF-8')
        : substr($text, 0, $sliceLimit);
    return rtrim($slice) . $suffix;
}

function botTextLength($value)
{
    $text = (string) ($value ?? '');
    return function_exists('mb_strlen') ? mb_strlen($text, 'UTF-8') : strlen($text);
}

function isBotAdminUser($user)
{
    $adminIds = defined('ADMIN_IDS') ? ADMIN_IDS : [];
    $adminIds = array_map('intval', (array) $adminIds);
    return in_array((int) ($user['telegram_id'] ?? 0), $adminIds, true);
}

function formatBotUsername($username)
{
    $username = trim((string) ($username ?? ''));
    if ($username === '') {
        return '—';
    }
    return '@' . ltrim($username, '@');
}

function formatBotValue($value)
{
    $value = trim((string) ($value ?? ''));
    return $value !== '' ? $value : '—';
}

function findTesterTargetUser($pdo, $target)
{
    $target = trim((string) $target);
    if ($target === '') {
        return ['status' => 'not_found'];
    }

    if (preg_match('/^\d+$/', $target)) {
        $stmt = $pdo->prepare("SELECT id, telegram_id, username, first_name, is_tester FROM users WHERE telegram_id = ? LIMIT 2");
        $stmt->execute([$target]);
        $users = $stmt->fetchAll();
    } else {
        $username = ltrim($target, '@');
        $username = trim($username);
        if ($username === '') {
            return ['status' => 'not_found'];
        }

        $stmt = $pdo->prepare("SELECT id, telegram_id, username, first_name, is_tester FROM users WHERE LOWER(username) = LOWER(?) LIMIT 6");
        $stmt->execute([$username]);
        $users = $stmt->fetchAll();
    }

    if (!$users) {
        return ['status' => 'not_found'];
    }
    if (count($users) > 1) {
        return ['status' => 'multiple', 'users' => $users];
    }
    return ['status' => 'ok', 'user' => $users[0]];
}

function formatTesterCandidates($users)
{
    $msg = "Найдено несколько пользователей. Используй telegram_id:\n\n";
    foreach ($users as $user) {
        $msg .= "• user_id=" . htmlspecialchars((string) ($user['id'] ?? '')) .
            ", telegram_id=" . htmlspecialchars((string) ($user['telegram_id'] ?? '')) .
            ", username=" . htmlspecialchars(formatBotUsername($user['username'] ?? null)) .
            ", first_name=" . htmlspecialchars(formatBotValue($user['first_name'] ?? null)) . "\n";
    }
    return $msg;
}

function formatTesterStatusReply($user, $before, $after, $mode)
{
    $title = $mode === 'status' ? 'Статус tester flag' : 'Tester flag обновлён';
    $username = formatBotUsername($user['username'] ?? null);
    return "🧪 <b>$title</b>\n\n"
        . "user_id: <b>" . htmlspecialchars((string) ($user['id'] ?? '')) . "</b>\n"
        . "telegram_id: <b>" . htmlspecialchars((string) ($user['telegram_id'] ?? '')) . "</b>\n"
        . "username: <b>" . htmlspecialchars($username) . "</b>\n"
        . "first_name: <b>" . htmlspecialchars(formatBotValue($user['first_name'] ?? null)) . "</b>\n"
        . "is_tester before: <b>$before</b>\n"
        . "is_tester after: <b>$after</b>";
}

function getSfEmoji($key)
{
    if ($key === 'empty')
        return '<tg-emoji emoji-id="6021770695631969012">📭</tg-emoji>';

    $emojis = [
        'success' => '6021868492037298942',
        'error' => '6019548599812103366',
        'game' => '6023852878597200124',
        'greeting' => '6023985511482268644',
        'admin' => '6021622729713652937',
        'stats' => '6021728265650051545',
        'users' => '6021690418398239007',
        'public' => '5807928135139728476',
        'calendar' => '6023880246128810031',
        'house' => '6023896773162967617',
        'rocket' => '5258332798409783582',
    ];
    $id = $emojis[$key] ?? '';

    if ($id) {
        // Using '🔹' as fallback/alt char
        return '<tg-emoji emoji-id="' . $id . '">🔹</tg-emoji>';
    }
    return '';
}
