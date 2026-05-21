<?php
// server/auth.php
require_once 'config.php';

const MAX_SESSIONS_PER_USER = 5;

// ─── Telegram Mini App signature check ───────────────────────────────────────
function checkTmaAuth($initDataString)
{
    parse_str($initDataString, $data);

    if (!isset($data['hash']))
        return false;
    $check_hash = $data['hash'];
    unset($data['hash']);

    ksort($data);

    $data_check_arr = [];
    foreach ($data as $key => $value) {
        $data_check_arr[] = $key . '=' . $value;
    }
    $data_check_string = implode("\n", $data_check_arr);

    $secret_key = hash_hmac('sha256', BOT_TOKEN, "WebAppData", true);
    $hash = bin2hex(hash_hmac('sha256', $data_check_string, $secret_key, true));

    if (hash_equals($hash, (string) $check_hash)) {
        if (isset($data['auth_date']) && (time() - $data['auth_date'] > 86400)) {
            return false;
        }
        return json_decode($data['user'], true);
    }
    return false;
}

// ─── Parse a friendly device description from User-Agent ─────────────────────
function parseDeviceFromUA($ua)
{
    if (empty($ua))
        return 'Неизвестное устройство';

    // Telegram clients
    if (stripos($ua, 'TelegramBot') !== false)
        return 'Telegram Bot';
    if (stripos($ua, 'Telegram') !== false)
        return 'Telegram';

    // OS detection
    $os = 'Неизвестная ОС';
    if (preg_match('/iPhone OS ([\d_]+)/', $ua, $m))
        $os = 'iPhone (iOS ' . str_replace('_', '.', $m[1]) . ')';
    elseif (preg_match('/iPad.*OS ([\d_]+)/', $ua, $m))
        $os = 'iPad (iOS ' . str_replace('_', '.', $m[1]) . ')';
    elseif (preg_match('/Android ([\d.]+)/', $ua, $m))
        $os = 'Android ' . $m[1];
    elseif (stripos($ua, 'Windows NT') !== false)
        $os = 'Windows';
    elseif (stripos($ua, 'Macintosh') !== false)
        $os = 'Mac';
    elseif (stripos($ua, 'Linux') !== false)
        $os = 'Linux';

    // Browser detection
    $browser = '';
    if (preg_match('/Chrome\/([\d.]+)/', $ua, $m) && stripos($ua, 'Chromium') === false && stripos($ua, 'Edg') === false)
        $browser = ' · Chrome ' . explode('.', $m[1])[0];
    elseif (preg_match('/Edg\/([\d.]+)/', $ua, $m))
        $browser = ' · Edge ' . explode('.', $m[1])[0];
    elseif (preg_match('/Firefox\/([\d.]+)/', $ua, $m))
        $browser = ' · Firefox ' . explode('.', $m[1])[0];
    elseif (preg_match('/Safari\/([\d.]+)/', $ua, $m) && stripos($ua, 'Chrome') === false)
        $browser = ' · Safari';

    return $os . $browser;
}

// ─── Register or login; returns a new session token ──────────────────────────
function registerOrLoginUser($tg_user, $platform = 'web', $device = null)
{
    global $pdo;

    $telegram_id = $tg_user['id'];
    $first_name = $tg_user['first_name'] ?? '';
    $photo_url = $tg_user['photo_url'] ?? '';

    if ($device === null) {
        $ua = $_SERVER['HTTP_USER_AGENT'] ?? '';
        $device = parseDeviceFromUA($ua);
    }

    // Schema (user_sessions table, users.session_ttl_days) is provisioned by
    // migrations/010_session_tables.php — not on the request path.

    // Find or create user
    $stmt = $pdo->prepare("SELECT * FROM users WHERE telegram_id = ?");
    $stmt->execute([$telegram_id]);
    $user = $stmt->fetch();

    if ($user) {
        // Update basic profile info
        $pdo->prepare("UPDATE users SET first_name = ?, photo_url = ? WHERE id = ?")
            ->execute([$first_name, $photo_url, $user['id']]);
        $userId = $user['id'];
    } else {
        // New user
        $pdo->prepare("INSERT INTO users (telegram_id, first_name, photo_url) VALUES (?, ?, ?)")
            ->execute([$telegram_id, $first_name, $photo_url]);
        $userId = $pdo->lastInsertId();

        // AUTO-INIT STATS
        $pdo->prepare("INSERT IGNORE INTO user_statistics (user_id) VALUES (?)")->execute([$userId]);

        if (class_exists('TelegramLogger')) {
            TelegramLogger::logEvent('user', "New User Registered", [
                'id' => intval($userId),
                'name' => $first_name,
                'telegram_id' => $telegram_id,
            ]);
        }
    }

    // Enforce session limit: remove oldest sessions if at limit
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM user_sessions WHERE user_id = ?");
    $stmt->execute([$userId]);
    $sessionCount = (int) $stmt->fetchColumn();

    if ($sessionCount >= MAX_SESSIONS_PER_USER) {
        $toRemove = $sessionCount - MAX_SESSIONS_PER_USER + 1;
        $pdo->prepare("DELETE FROM user_sessions WHERE user_id = ? ORDER BY last_used ASC LIMIT " . $toRemove)
            ->execute([$userId]);
    }

    // Create new session
    $token = bin2hex(random_bytes(32));
    $pdo->prepare("INSERT INTO user_sessions (user_id, auth_token, platform, device) VALUES (?, ?, ?, ?)")
        ->execute([$userId, $token, $platform, $device]);

    return $token;
}

// ─── Look up user by session token; updates last_used ────────────────────────
function getUserByToken($token)
{
    global $pdo;
    if (empty($token))
        return false;

    $stmt = $pdo->prepare("
        SELECT u.*, s.id AS session_id, s.platform, s.device, s.created_at AS session_created, s.last_used AS session_last_used
        FROM users u
        JOIN user_sessions s ON s.user_id = u.id
        WHERE s.auth_token = ?
        LIMIT 1
    ");
    $stmt->execute([$token]);
    $user = $stmt->fetch();

    if ($user) {
        $user['is_admin'] = in_array((int) $user['telegram_id'], ADMIN_IDS);
        // Throttle the last_used write: this runs on every API call (incl. the 3s
        // poll), so only refresh when the stored value is more than 60s stale.
        $lastUsed = $user['session_last_used'] ?? null;
        if ($lastUsed === null || strtotime($lastUsed) < time() - 60) {
            $pdo->prepare("UPDATE user_sessions SET last_used = NOW() WHERE id = ?")
                ->execute([$user['session_id']]);
        }
    }

    return $user;
}

// ─── Cleanup sessions older than user's TTL setting ──────────────────────────
function cleanupExpiredSessions($userId)
{
    global $pdo;
    $stmt = $pdo->prepare("SELECT session_ttl_days FROM users WHERE id = ?");
    $stmt->execute([$userId]);
    $ttl = (int) ($stmt->fetchColumn() ?? 30);

    if ($ttl <= 0)
        return; // 0 = never

    $pdo->prepare("DELETE FROM user_sessions WHERE user_id = ? AND last_used < NOW() - INTERVAL ? DAY")
        ->execute([$userId, $ttl]);
}
?>