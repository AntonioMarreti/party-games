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

// Reject forged webhook calls. When a secret token is configured, Telegram echoes
// it back in this header on every webhook request; calls without the matching
// token did not come from Telegram and must not be trusted.
if (defined('BOT_WEBHOOK_SECRET') && BOT_WEBHOOK_SECRET !== '') {
    $providedSecret = $_SERVER['HTTP_X_TELEGRAM_BOT_API_SECRET_TOKEN'] ?? '';
    if (!hash_equals(BOT_WEBHOOK_SECRET, $providedSecret)) {
        botWebhookLog('rejected_bad_secret', ['method' => $_SERVER['REQUEST_METHOD'] ?? '']);
        http_response_code(403);
        echo 'forbidden';
        exit;
    }
}

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
        'keys' => array_keys($update),
    ]);
    echo 'ok';
    exit;
}

$message = $update['message'] ?? null;
$chatId = $message['chat']['id'] ?? ($update['callback_query']['message']['chat']['id'] ?? 0);
$text = $message['text'] ?? '';

botWebhookLog('received', [
    'update_id' => $update['update_id'] ?? null,
    'user_id' => $message['from']['id'] ?? ($update['callback_query']['from']['id'] ?? null),
    'chat_id' => $chatId,
    'message_text' => $text,
    'has_message' => isset($update['message']),
    'has_callback_query' => isset($update['callback_query']),
    'has_pre_checkout_query' => isset($update['pre_checkout_query']),
]);

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
                'photo_url' => '' // Фото через бота сложнее достать сразу
            ];
            $token = registerOrLoginUser($tgUser);

            // 2. Обновляем сессию в БД
            $stmt = $pdo->prepare("UPDATE auth_sessions SET telegram_id = ?, auth_token = ?, status = 'authorized' WHERE temp_code = ? AND status = 'pending'");
            $stmt->execute([$tgUser['id'], $token, $tempCode]);

            if ($stmt->rowCount() > 0) {
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

// === ADMIN COMMANDS ===
$isAdmin = in_array($message['from']['id'], ADMIN_IDS);

// /help - Список команд (только для админов)
$cmd = trim($text);
if (strpos($cmd, '/help') === 0) {
    if (!$isAdmin) {
        reply($chatId, getSfEmoji('error') . " Доступ запрещен");
        exit;
    }

    $msg = getSfEmoji('admin') . " <b>Панель управления (Admin)</b>\n\n";
    $msg .= getSfEmoji('stats') . " /stats — Общая статистика сервера\n";
    $msg .= getSfEmoji('users') . " /users — Последние регистрации\n";
    $msg .= getSfEmoji('public') . " /public — Список публичных комнат\n";
    $msg .= "❓ /help — Список всех команд";

    reply($chatId, $msg);
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
