<?php
header('Content-Type: application/json');
require_once 'config.php';
require_once 'auth.php';
require_once 'lib/TelegramLogger.php';

// Error Handling
ini_set('display_errors', 0);
ini_set('log_errors', 1);
set_exception_handler(function ($e) {
    TelegramLogger::logError('api', [
        'message' => $e->getMessage(),
        'code' => $e->getCode(),
        'stack' => $e->getTraceAsString()
    ], [
        'endpoint' => $_SERVER['REQUEST_URI'] ?? 'N/A',
        'method' => $_SERVER['REQUEST_METHOD'] ?? 'N/A'
    ]);
    echo json_encode(['status' => 'error', 'message' => 'Internal Server Error']);
});

$action = $_POST['action'] ?? '';
$token = $_POST['token'] ?? '';

// === AUTH ACTIONS (No Token Required) ===
if ($action === 'login_tma') {
    try {
        $userData = checkTmaAuth($_POST['initData']);
        if ($userData) {
            $token = registerOrLoginUser($userData);
            $user = getUserByToken($token);
            echo json_encode(['status' => 'ok', 'token' => $token, 'user' => $user]);
        } else {
            TelegramLogger::logError('auth', [
                'message' => 'TMA Auth Failed - Invalid signature',
                'code' => 'INVALID_SIGNATURE'
            ], [
                'action' => 'login_tma',
                'method' => 'POST'
            ]);
            echo json_encode(['status' => 'error', 'message' => 'Invalid TMA signature']);
        }
    } catch (Exception $e) {
        TelegramLogger::logError('auth', [
            'message' => $e->getMessage(),
            'code' => $e->getCode(),
            'stack' => $e->getTraceAsString()
        ], [
            'action' => 'login_tma',
            'method' => 'POST'
        ]);
        echo json_encode(['status' => 'error', 'message' => 'Login Error']);
    }
    exit;
}

if ($action === 'login_widget') {
    try {
        $userData = checkWidgetAuth(json_decode($_POST['user_data'], true));
        if ($userData) {
            $token = registerOrLoginUser($userData);
            $user = getUserByToken($token);
            echo json_encode(['status' => 'ok', 'token' => $token, 'user' => $user]);
        } else {
            TelegramLogger::log("Widget Auth Failed", ['data' => $_POST['user_data']]);
            echo json_encode(['status' => 'error', 'message' => 'Invalid Widget signature']);
        }
    } catch (Exception $e) {
        TelegramLogger::log("Login Widget Error", ['error' => $e->getMessage()]);
        echo json_encode(['status' => 'error', 'message' => 'Login Error']);
    }
    exit;
}
if ($action === 'create_auth_session') {
    // Ensure table exists (fallback for failed migration)
    $pdo->exec("CREATE TABLE IF NOT EXISTS auth_sessions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        temp_code VARCHAR(64) UNIQUE NOT NULL,
        telegram_id BIGINT DEFAULT NULL,
        auth_token VARCHAR(64) DEFAULT NULL,
        status ENUM('pending', 'authorized') DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME DEFAULT (CURRENT_TIMESTAMP + INTERVAL 10 MINUTE),
        INDEX idx_code (temp_code),
        INDEX idx_status (status)
    )");

    $tempCode = 'auth_' . bin2hex(random_bytes(16));
    $stmt = $pdo->prepare("INSERT INTO auth_sessions (temp_code) VALUES (?)");
    $stmt->execute([$tempCode]);

    $botUrl = "https://t.me/" . BOT_USERNAME . "?start=" . $tempCode;
    echo json_encode(['status' => 'ok', 'temp_code' => $tempCode, 'bot_url' => $botUrl]);
    exit;
}

if ($action === 'poll_auth_session') {
    $tempCode = $_POST['temp_code'] ?? '';
    $stmt = $pdo->prepare("SELECT * FROM auth_sessions WHERE temp_code = ? AND expires_at > NOW()");
    $stmt->execute([$tempCode]);
    $session = $stmt->fetch();

    if ($session && $session['status'] === 'authorized') {
        $user = getUserByToken($session['auth_token']);
        echo json_encode(['status' => 'ok', 'token' => $session['auth_token'], 'user' => $user]);
        // Опционально: удалить сессию после успеха
        $pdo->prepare("DELETE FROM auth_sessions WHERE id = ?")->execute([$session['id']]);
    } else {
        echo json_encode(['status' => 'pending']);
    }
    exit;
}

// === DEV LOGIN (TEMPORARY - REMOVE IN PRODUCTION) ===
if ($action === 'dev_login') {
    try {
        $index = isset($_POST['index']) ? (int) $_POST['index'] : 1;
        if ($index < 1)
            $index = 1;

        $tgId = 999999990 + $index; // 999999991, 999999992...

        // Create or get test user
        $stmt = $pdo->prepare("SELECT * FROM users WHERE telegram_id = ?");
        $stmt->execute([$tgId]);
        $testUser = $stmt->fetch();

        if (!$testUser) {
            // Create test user
            $token = bin2hex(random_bytes(32));
            $name = "DevPlayer " . $index;
            $username = "dev" . $index;
            $stmt = $pdo->prepare("INSERT INTO users (telegram_id, first_name, username, auth_token, custom_name) VALUES (?, ?, ?, ?, ?)");
            $stmt->execute([$tgId, $name, $username, $token, $name]);
            $testUser = getUserByToken($token);
        } else {
            // Update token
            $token = bin2hex(random_bytes(32));
            $pdo->prepare("UPDATE users SET auth_token = ? WHERE id = ?")->execute([$token, $testUser['id']]);
            $testUser['auth_token'] = $token;
        }

        echo json_encode(['status' => 'ok', 'token' => $testUser['auth_token'], 'user' => $testUser]);
    } catch (Exception $e) {
        echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
    }
    exit;
}

// === HELPER FUNCTIONS (Available to Actions) ===
require_once 'lib/shared_helpers.php';

function getUserByToken($token)
{
    global $pdo;
    $stmt = $pdo->prepare("SELECT * FROM users WHERE auth_token = ?");
    $stmt->execute([$token]);
    $user = $stmt->fetch();

    if ($user) {
        $user['is_admin'] = in_array((int) $user['telegram_id'], ADMIN_IDS);
    }

    return $user;
}

function getRoom($userId)
{
    global $pdo;
    $stmt = $pdo->prepare("SELECT r.*, rp.is_host FROM room_players rp JOIN rooms r ON r.id = rp.room_id WHERE rp.user_id = ? ORDER BY rp.id DESC LIMIT 1");
    $stmt->execute([$userId]);
    return $stmt->fetch();
}

/**
 * Обновляет состояние игры в базе данных
 */
function updateGameState($roomId, $state)
{
    global $pdo;
    $pdo->prepare("UPDATE rooms SET game_state = ? WHERE id = ?")
        ->execute([json_encode($state), $roomId]);
}

function clearUserRooms($pdo, $userId)
{
    $pdo->prepare("DELETE FROM room_players WHERE user_id = ?")->execute([$userId]);
}

function sendError($message)
{
    $res = ['status' => 'error', 'message' => $message];
    if (class_exists('TelegramLogger') && TelegramLogger::$lastError) {
        $res['debug_log_error'] = TelegramLogger::$lastError;
    }
    echo json_encode($res);
    exit;
}

// === AUTHENTICATION ===

$currentUser = getUserByToken($token);
if (!$currentUser) {
    echo json_encode(['status' => 'auth_error']);
    exit;
}

// === ACTION ROUTING ===

$routes = [
    'create_room' => 'actions/room.php',
    'join_room' => 'actions/room.php',
    'leave_room' => 'actions/room.php',
    'kick_player' => 'actions/room.php',
    'get_state' => 'actions/room.php',
    'add_bot' => 'actions/room.php', // NEW
    'remove_bot' => 'actions/room.php', // NEW

    'start_game' => 'actions/game.php',
    'stop_game' => 'actions/game.php',
    'finish_game_session' => 'actions/game.php',
    'game_action' => 'actions/game.php',

    'update_profile' => 'actions/user.php',
    'update_settings' => 'actions/user.php',
    'get_me' => 'actions/user.php', // NEW
    'toggle_like' => 'actions/user.php', // NEW
    'get_favorites' => 'actions/user.php', // NEW

    // Social
    'search_users' => 'actions/social.php', // NEW
    'add_friend' => 'actions/social.php',
    'accept_friend' => 'actions/social.php',
    'remove_friend' => 'actions/social.php',
    'get_friends' => 'actions/social.php',
    'get_public_profile' => 'actions/social.php', // NEW
    'invite_friends' => 'actions/social.php', // NEW
    'subscribe' => 'actions/social.php',
    'unsubscribe' => 'actions/social.php',
    'get_social_graph' => 'actions/social.php',
    'get_notifications' => 'actions/social.php', // NEW
    'mark_notification_read' => 'actions/social.php', // NEW

    'get_achievements' => 'actions/social.php',

    'game_finished' => 'actions/stats.php',
    'get_leaderboard' => 'actions/stats.php',
    'get_stats' => 'actions/stats.php',

    'make_room_public' => 'actions/room.php',
    'get_public_rooms' => 'actions/room.php',

    'admin_stats' => 'actions/admin.php',
    'reset_leaderboard' => 'actions/admin.php',
    'seed_achievements' => 'actions/admin.php',
    'setup_reactions' => 'actions/admin.php', // NEW
    'db_doctor' => 'actions/admin.php', // NEW
    'db_repair' => 'actions/admin.php', // NEW

    // AI
    'generate_content' => 'actions/ai.php',

    // REACTIONS
    'send_reaction' => 'actions/game.php', // NEW

    // PAYMENTS
    'create_invoice' => 'actions/payment.php',
];

if (isset($routes[$action])) {
    require_once $routes[$action];
    $funcName = "action_$action";

    if (function_exists($funcName)) {
        try {
            $funcName($pdo, $currentUser, $_POST);
        } catch (Exception $e) {
            TelegramLogger::logError('api', [
                'message' => $e->getMessage(),
                'code' => $e->getCode(),
                'stack' => $e->getTraceAsString()
            ], [
                'user_id' => $currentUser['id'],
                'action' => $action,
                'endpoint' => $_SERVER['REQUEST_URI'] ?? '/server/api.php'
            ]);
            sendError('Server Error');
        }
    } else {
        TelegramLogger::log("Action Not Found in File", ['action' => $action]);
        sendError('Action not implemented');
    }
} else {
    // Optional: Log unknown actions (could be noisy)
    // TelegramLogger::log("Unknown Action", ['action' => $action]);
    sendError('Unknown action');
}