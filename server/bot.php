<?php
// server/bot.php
require_once 'config.php'; // Подключаем твой конфиг с PDO и BOT_TOKEN
require_once 'auth.php';   // НУЖНО для регистрации юзеров
require_once 'lib/shared_helpers.php'; // Missing helper functions (check_achievements, etc)
require_once 'actions/admin.php'; // For db repair tool

// Получаем данные от Telegram
$content = file_get_contents("php://input");
$update = json_decode($content, true);

// Если это не сообщение (например, пустой запрос) — выходим
if (!$update) exit;

// ВРЕМЕННЫЙ ДЕБАГ: Пишем всё в лог
file_put_contents(__DIR__ . '/bot_debug.log', date('Y-m-d H:i:s') . " - " . $content . "\n", FILE_APPEND);

if (!isset($update['message'])) {
    exit;
}

$message = $update['message'];
$chatId = $message['chat']['id'];
$text = $message['text'] ?? '';

// Логика команды /start
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
    $limit = isset($parts[1]) ? (int)$parts[1] : 5;
    if ($limit < 1) $limit = 5;
    if ($limit > 50) $limit = 50; // Cap at 50

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


// /test_buttons - Test Layer 224 Button Styles
if (strpos($cmd, '/test_buttons') === 0) {
    // Public command now

    // 1. Inline Keyboard with Custom Icons
    // Using 'rocket' emoji ID: 5258332798409783582
    $inlineKeyboard = [
        'inline_keyboard' => [
            [
                [
                    'text' => 'Icon Test',
                    'callback_data' => 'test_1',
                    'icon_custom_emoji_id' => '5258332798409783582' // Rocket
                ],
                [
                    'text' => 'No Icon',
                    'callback_data' => 'test_2'
                ]
            ]
        ]
    ];

    sendTelegram('sendMessage', [
        'chat_id' => $chatId,
        'text' => "🧪 <b>Inline Buttons Test</b>\n\nПроверка <code>icon_custom_emoji_id</code>.",
        'parse_mode' => 'HTML',
        'reply_markup' => json_encode($inlineKeyboard)
    ]);

    // 2. Reply Keyboard with Colors
    // We will hardcode the JSON structure for the reply keyboard to be safe
    // Trying 'color' field based on Telegram's usual naming conventions for recent features
    $replyJson = '{
        "keyboard": [
            [
                { "text": "🔵 Primary", "color": "primary" }, 
                { "text": "🔴 Danger", "color": "danger" }
            ],
            [
                 { "text": "🟢 Success", "color": "success" },
                 { "text": "Normal" }
            ]
        ],
        "resize_keyboard": true
    }';
    
    sendTelegram('sendMessage', [
        'chat_id' => $chatId,
        'text' => "🎨 <b>Reply Buttons Test</b>\n\nПроверка цветов кнопок (<code>color</code>: primary/danger/success).",
        'parse_mode' => 'HTML',
        'reply_markup' => $replyJson
    ]);
}

function reply($chatId, $text) {
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
function sendTelegram($method, $data) {
    $url = "https://api.telegram.org/bot" . BOT_TOKEN . "/$method";

    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_POST, 1);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $data);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    $res = curl_exec($ch);
    curl_close($ch);
    return $res;
}

function getSfEmoji($key) {
    if ($key === 'empty') return '<tg-emoji emoji-id="6021770695631969012">📭</tg-emoji>';

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