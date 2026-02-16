<?php
// server/auth.php
require_once 'config.php';

function checkTmaAuth($initDataString) {
    parse_str($initDataString, $data);
    
    if (!isset($data['hash'])) return false;
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
    
    if (strcmp($hash, $check_hash) === 0) {
        if (isset($data['auth_date']) && (time() - $data['auth_date'] > 86400)) {
            return false;
        }
        return json_decode($data['user'], true);
    }
    return false;
}

function checkWidgetAuth($data) {
    if (!isset($data['hash'])) return false;
    $check_hash = $data['hash'];
    unset($data['hash']);
    
    // ВАЖНО: Telegram Widget присылает строго определенный набор полей. 
    // Если сервер добавляет свои (например, _url), подпись не совпадет.
    $allowed_fields = ['id', 'first_name', 'last_name', 'username', 'photo_url', 'auth_date'];
    $filtered_data = [];
    foreach ($data as $key => $value) {
        if (in_array($key, $allowed_fields)) {
            $filtered_data[] = $key . '=' . $value;
        }
    }

    // Сортируем ключи по алфавиту
    sort($filtered_data);
    $data_check_string = implode("\n", $filtered_data);
    
    // Секретный ключ для виджета - это SHA256 от токена (raw binary)
    $secret_key = hash('sha256', BOT_TOKEN, true);
    $hash = bin2hex(hash_hmac('sha256', $data_check_string, $secret_key, true));
    
    if (strcmp($hash, $check_hash) === 0) {
        if (isset($data['auth_date']) && (time() - $data['auth_date'] > 86400)) {
            TelegramLogger::logError('auth', [
                'message' => 'Widget Auth Timeout',
                'data' => $data
            ]);
            return false;
        }
        return $data;
    }
    
    // Логируем детали для отладки, если подпись не совпала
    TelegramLogger::logError('auth', [
        'message' => 'Invalid Widget Signature Details',
        'code' => 'SIGNATURE_MISMATCH',
        'stack' => "CheckString: $data_check_string\nComputed: $hash\nReceived: $check_hash"
    ]);

    return false;
}

function registerOrLoginUser($tg_user) {
    global $pdo;
    
    $telegram_id = $tg_user['id'];
    $first_name = $tg_user['first_name'];
    $photo_url = $tg_user['photo_url'] ?? '';
/*************  ✨ Windsurf Command ⭐  *************/
/**
 * Регистрация или авторизация пользователя Telegram
 * 
 * @param array $tg_user - массив с данными пользователя Telegram
 * 
 * @return string - токен сессии
 */
/*******  d24f6ab4-f810-44a0-b7b3-a89d4cdca2a6  *******/    
    // Ищем юзера
    $stmt = $pdo->prepare("SELECT * FROM users WHERE telegram_id = ?");
    $stmt->execute([$telegram_id]);
    $user = $stmt->fetch();
    
    $token = bin2hex(random_bytes(32)); 
    
    if ($user) {
        $stmt = $pdo->prepare("UPDATE users SET auth_token = ?, first_name = ?, photo_url = ? WHERE id = ?");
        $stmt->execute([$token, $first_name, $photo_url, $user['id']]);
    } else {
        $stmt = $pdo->prepare("INSERT INTO users (telegram_id, first_name, photo_url, auth_token) VALUES (?, ?, ?, ?)");
        $stmt->execute([$telegram_id, $first_name, $photo_url, $token]);
        $newUserId = $pdo->lastInsertId();
        
        // AUTO-INIT STATS
        $pdo->prepare("INSERT IGNORE INTO user_statistics (user_id) VALUES (?)")->execute([$newUserId]);

        // LOG NEW USER
        TelegramLogger::logEvent('user', "New User Registered", [
            'id' => intval($newUserId),
            'name' => $first_name,
            'telegram_id' => $telegram_id
        ]);
    }
    
    return $token;
}
?>