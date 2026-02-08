<?php
// server/auth_redirect.php
require_once 'config.php';
require_once 'auth.php';

// Телеграм вернет данные GET-параметрами (id, first_name, hash...)
$data = $_GET;

if (checkWidgetAuth($data)) {
    // Авторизация успешна!
    $userArr = [
        'id' => $data['id'],
        'first_name' => $data['first_name'],
        'photo_url' => $data['photo_url'] ?? ''
    ];
    $token = registerOrLoginUser($userArr);

    TelegramLogger::log("Web Auth Success", ['user_id' => $data['id'], 'first_name' => $data['first_name']]);

    // Перенаправляем обратно в приложение с токеном
    header("Location: https://lapin.live/mpg/index.php#auth_token=" . $token);
} else {
    TelegramLogger::logError('auth', [
        'message' => 'Widget Auth Failed - Invalid signature',
        'data' => $data
    ]);
    echo "Ошибка авторизации: Неверная подпись данных.";
}
exit;
?>