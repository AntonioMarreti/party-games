<?php
// Isolated regression: execute the real action with DB/Telegram stubs, no network/config.
define('BOT_USERNAME', 'party_games_test_bot');
class TelegramLogger {
    public static array $responses = [];
    public static array $calls = [];
    public static int $analytics = 0;
    public static function sendRequest($method, $params = []) {
        self::$calls[] = ['method' => $method, 'params' => $params];
        if (!self::$responses) throw new LogicException('Unexpected Telegram request');
        $response = array_shift(self::$responses);
        if ($response instanceof Throwable) throw $response;
        return $response;
    }
    public static function sendAnalytics(...$args) { self::$analytics++; }
    public static function logError(...$args) { throw new LogicException('Unexpected action validation error'); }
}
function sendError($message) { throw new RuntimeException($message); }
require_once __DIR__ . '/../server/actions/social.php';
function inviteCheck($condition, $message) {
    if (!$condition) throw new RuntimeException($message);
}
class InviteTestStmt {
    private array $rows;
    public function __construct(array $rows) { $this->rows = $rows; }
    public function execute($params) {}
    public function fetch() { return $this->rows[0] ?? false; }
    public function fetchAll() { return $this->rows; }
}
class InviteTestPdo {
    private array $friends;
    private string $roomCode;
    public function __construct(int $count, string $roomCode) {
        $this->roomCode = $roomCode;
        $this->friends = [];
        for ($id = 2; $id < 2 + $count; $id++) {
            $this->friends[] = ['id' => $id, 'telegram_id' => 1000 + $id, 'first_name' => 'Test'];
        }
    }
    public function prepare($sql) {
        if ($sql === 'SELECT id, room_code FROM rooms WHERE id = ?') {
            return new InviteTestStmt([['id' => 1, 'room_code' => $this->roomCode]]);
        }
        if (str_starts_with($sql, 'SELECT id, telegram_id, first_name FROM users WHERE id IN (')) {
            return new InviteTestStmt($this->friends);
        }
        throw new LogicException('Unexpected test SQL');
    }
}
function inviteRun(array $responses, int $friends = 1, array $user = [], string $roomCode = 'TEST42') {
    TelegramLogger::$responses = $responses;
    TelegramLogger::$calls = [];
    TelegramLogger::$analytics = 0;
    ob_start();
    try {
        action_invite_friends(new InviteTestPdo($friends, $roomCode),
            array_merge(['id' => 1, 'first_name' => 'Анна'], $user),
            ['room_id' => 1, 'friends' => range(2, 1 + $friends)]);
        return json_decode(ob_get_contents(), true, 512, JSON_THROW_ON_ERROR);
    } finally { ob_end_clean(); }
}
$ok = json_encode(['ok' => true, 'result' => ['message_id' => 1]]);
$rejected = json_encode(['ok' => false, 'error_code' => 400, 'description' => 'Unsupported rich message']);
$logFile = tempnam(sys_get_temp_dir(), 'room-invite-test-');
$previousLog = ini_get('error_log');
ini_set('error_log', $logFile);
try {
    $result = inviteRun([$ok]);
    inviteCheck($result['sent_count'] === 1 && count(TelegramLogger::$calls) === 1, 'Rich success counts once without fallback');
    $call = TelegramLogger::$calls[0];
    inviteCheck($call['method'] === 'sendRichMessage', 'Rich method first');
    $html = $call['params']['rich_message']['html'];
    inviteCheck(str_contains($html, '<h3>🎮 Приглашение в игру</h3>'), 'Existing invite heading');
    inviteCheck(str_contains($html, '<p>Анна зовёт тебя поиграть!</p>'), 'Inviter name in rich body');
    inviteCheck(str_contains($html, '<p>Заходи, пока место не заняли!</p>'), 'Existing invite meaning');
    $roomUrl = 'https://t.me/' . BOT_USERNAME . '/app?startapp=TEST42';
    inviteCheck(str_contains($html, '<tg-button-row align="center"><tg-button type="url" style="primary" url="' . $roomUrl . '">Зайти в комнату</tg-button></tg-button-row>'), 'Separate centered primary URL CTA');

    $result = inviteRun([$rejected, $ok]);
    inviteCheck($result['sent_count'] === 1, 'Successful fallback counts once');
    inviteCheck(array_column(TelegramLogger::$calls, 'method') === ['sendRichMessage', 'sendMessage'], 'Explicit rejection invokes legacy fallback');
    $fallback = TelegramLogger::$calls[1]['params'];
    inviteCheck($fallback['text'] === "<tg-emoji emoji-id=\"6023852878597200124\">🎮</tg-emoji> <b>Приглашение в игру!</b>\n\nАнна зовет тебя поиграть!\nЗаходи, пока место не заняли!", 'Fallback preserves existing text');
    inviteCheck($fallback['parse_mode'] === 'HTML', 'Fallback HTML mode');
    inviteCheck($fallback['reply_markup']['inline_keyboard'][0][0] === ['text' => 'Зайти в комнату', 'url' => $roomUrl], 'Fallback same deep link and CTA');

    $result = inviteRun([$rejected, $rejected, $ok], 2);
    inviteCheck($result['sent_count'] === 1, 'Failed rich and fallback do not count; next recipient succeeds');
    inviteCheck(array_column(TelegramLogger::$calls, 'method') === ['sendRichMessage', 'sendMessage', 'sendRichMessage'], 'Batch continues after rejection');
    inviteCheck(TelegramLogger::$calls[2]['params']['chat_id'] === 1003, 'Next recipient receives its own invite');

    foreach ([false, '', '{invalid', 'null', '[]', '{"ok":"false"}', '{"error_code":502}', new RuntimeException('secret-marker timeout')] as $ambiguous) {
        $result = inviteRun([$ambiguous, $ok], 2);
        inviteCheck($result['sent_count'] === 1, 'Ambiguous result does not count; batch continues');
        inviteCheck(array_column(TelegramLogger::$calls, 'method') === ['sendRichMessage', 'sendRichMessage'], 'No duplicate fallback after ambiguity');
    }
    $result = inviteRun([$rejected, false]);
    inviteCheck($result['sent_count'] === 0 && count(TelegramLogger::$calls) === 2, 'Ambiguous fallback is not counted or retried');

    $name = '<b>A&B "name"</b>\' <tg-button type="url">';
    foreach ([['custom_name' => $name], ['first_name' => $name]] as $user) {
        inviteRun([$rejected, $ok], 1, $user, 'TEST"&42');
        $escaped = htmlspecialchars($name, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $html = TelegramLogger::$calls[0]['params']['rich_message']['html'];
        inviteCheck(str_contains($html, $escaped) && !str_contains($html, $name), 'Dynamic name is escaped');
        inviteCheck(str_contains($html, 'startapp=TEST&quot;&amp;42'), 'URL attribute is escaped');
        inviteCheck(str_contains(TelegramLogger::$calls[1]['params']['text'], $escaped), 'Fallback name is escaped');
        inviteCheck(TelegramLogger::$calls[1]['params']['reply_markup']['inline_keyboard'][0][0]['url'] === 'https://t.me/' . BOT_USERNAME . '/app?startapp=TEST"&42', 'Fallback URL is passed as data');
    }
    $logs = file_get_contents($logFile);
    inviteCheck(str_contains($logs, 'rejected') && str_contains($logs, 'ambiguous') && str_contains($logs, 'exception'), 'Failures are logged');
    inviteCheck(!str_contains($logs, 'secret-marker'), 'Raw exception data is not logged');
    echo "PASS room invite: rich payload, fallback, confirmed counts, batch isolation, ambiguity, escaping\n";
} finally {
    ini_set('error_log', $previousLog);
    unlink($logFile);
}
