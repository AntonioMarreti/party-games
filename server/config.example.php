<?php
// server/config.example.php
// Rename this file to config.php and fill in your credentials

// Database Settings
$db_host = 'localhost';
$db_name = 'your_database_name';
$db_user = 'your_database_user';
$db_pass = 'your_database_password';

// Telegram Bot Settings (Get from @BotFather)
define('BOT_TOKEN', '123456789:ABCDefGhIjKlMnOpQrStUvWxYz');
define('LOG_CHANNEL_ID', '-100xxxxxxxxxx'); // Optional: Channel for logs
define('BOT_USERNAME', 'your_bot_username');

// Admin IDs (Integer Telegram IDs)
define('ADMIN_IDS', [
    123456789, 
]);

// Telegram Logger (Optional)
// require_once __DIR__ . '/lib/TelegramLogger.php';

// PDO Connection
try {
    $pdo = new PDO("mysql:host=$db_host;dbname=$db_name;charset=utf8mb4", $db_user, $db_pass);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
} catch (PDOException $e) {
    die(json_encode(['error' => 'Database connection failed']));
}
?>
