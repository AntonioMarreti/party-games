<?php
// server/lib/TelegramLogger.php

class TelegramLogger
{

    private static $emoji = [
        'database' => '🗄️',
        'api' => '🔗',
        'validation' => '⚠️',
        'auth' => '🔐',
        'blockchain' => '⛓️',
        'payment' => '💳',
        'game' => '🎮',
        'room' => '🚪',
        'achievement' => '🏆',
        'user' => '👤',
        'social' => '🤝',
        'unknown' => '❌'
    ];

    public static function log($message, $data = [])
    {
        self::logEvent('unknown', $message, $data);
    }

    public static function logEvent($eventType, $message, $data = [])
    {
        if (!defined('BOT_TOKEN') || !defined('LOG_CHANNEL_ID') || empty(LOG_CHANNEL_ID))
            return;

        $emoji = self::$emoji[$eventType] ?? 'ℹ️';
        $text = "$emoji <b>" . strtoupper($eventType) . "</b>\n\n";
        $text .= "<b>Message:</b> " . htmlspecialchars($message) . "\n";

        if (!empty($data)) {
            $text .= "<b>Data:</b>\n<pre>" . htmlspecialchars(json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE)) . "</pre>";
        }

        $text .= "\n<b>Time:</b> " . date('Y-m-d H:i:s');

        self::sendRequest('sendMessage', [
            'chat_id' => LOG_CHANNEL_ID,
            'text' => $text,
            'parse_mode' => 'HTML'
        ], self::LOG_TIMEOUT);
    }

    public static function logError($errorType, $errorData, $context = [])
    {
        if (!defined('BOT_TOKEN') || !defined('LOG_CHANNEL_ID') || empty(LOG_CHANNEL_ID)) {
            error_log("TG LOG FAILED (No Config): " . ($errorData['message'] ?? 'Unknown error'));
            return;
        }

        $emoji = self::$emoji[$errorType] ?? self::$emoji['unknown'];
        $title = $emoji . ' <b>' . strtoupper($errorType) . ' ERROR</b>';

        $message = $title . "\n\n";
        $message .= "📝 <b>Message:</b> " . htmlspecialchars($errorData['message'] ?? 'N/A') . "\n";

        if (!empty($errorData['code'])) {
            $message .= "🔢 <b>Code:</b> " . htmlspecialchars($errorData['code']) . "\n";
        }

        $message .= "\n<b>CONTEXT:</b>\n";
        $message .= "👤 User: " . ($context['user_id'] ?? 'N/A') . "\n";
        $message .= "🔗 Endpoint: " . ($context['endpoint'] ?? $_SERVER['REQUEST_URI'] ?? 'N/A') . "\n";
        $message .= "📍 Method: " . ($context['method'] ?? $_SERVER['REQUEST_METHOD'] ?? 'N/A') . "\n";

        if (!empty($context['action'])) {
            $message .= "⚙️ Action: " . $context['action'] . "\n";
        }

        $message .= "🌍 Env: " . ($context['environment'] ?? 'production') . "\n";
        $message .= "⏰ Time: " . date('Y-m-d H:i:s') . "\n";

        if (!empty($errorData['stack'])) {
            $stack = substr($errorData['stack'], 0, 800);
            $message .= "\n📋 <b>Stack:</b>\n<pre>" . htmlspecialchars($stack) . "</pre>";
        }

        self::sendRequest('sendMessage', [
            'chat_id' => LOG_CHANNEL_ID,
            'text' => $message,
            'parse_mode' => 'HTML'
        ], self::LOG_TIMEOUT);
    }

    public static function sendAnalytics($title, $text, $chatId = null)
    {
        if (!defined('BOT_TOKEN'))
            return;

        $targetChat = $chatId ?? LOG_CHANNEL_ID;
        if (empty($targetChat))
            return;

        $message = "<b>$title</b>\n\n$text";

        self::sendRequest('sendMessage', [
            'chat_id' => $targetChat,
            'text' => $message,
            'parse_mode' => 'HTML'
        ]);
    }

    public static function info($message, $data = [])
    {
        if (!defined('LOG_CHANNEL_ID') || empty(LOG_CHANNEL_ID))
            return;

        $text = "ℹ️ <b>Info</b>\n\n";
        $text .= htmlspecialchars($message) . "\n";

        if (!empty($data)) {
            $text .= "\n<pre>" . htmlspecialchars(json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE)) . "</pre>";
        }

        $text .= "\n⏰ " . date('Y-m-d H:i:s');

        self::sendRequest('sendMessage', [
            'chat_id' => LOG_CHANNEL_ID,
            'text' => $text,
            'parse_mode' => 'HTML'
        ], self::LOG_TIMEOUT);
    }

    public static function sendToUser($chatId, $message)
    {
        if (!defined('BOT_TOKEN'))
            return;

        self::sendRequest('sendMessage', [
            'chat_id' => $chatId,
            'text' => $message,
            'parse_mode' => 'HTML'
        ]);
    }

    public static $lastError = null;

    // Shorter budget for log/telemetry calls so a slow proxy cannot stall a
    // user-facing request for the full default timeout.
    const LOG_TIMEOUT = 3;

    public static function sendRequest($method, $params = [], $timeout = 5)
    {
        if (!defined('BOT_TOKEN')) {
            self::$lastError = "BOT_TOKEN not defined";
            return false;
        }

        foreach ($params as $key => $value) {
            if (is_array($value) || is_object($value)) {
                $params[$key] = json_encode($value, JSON_UNESCAPED_UNICODE);
            }
        }

        $url = "https://tgproxy.regucka1998.workers.dev/bot" . BOT_TOKEN . "/" . $method;

        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_POST, 1);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $params);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 2);
        curl_setopt($ch, CURLOPT_TIMEOUT, $timeout);

        $result = curl_exec($ch);

        if (curl_errno($ch)) {
            self::$lastError = 'Curl Error: ' . curl_error($ch);
            error_log("TG CURL ERROR: " . self::$lastError);
        } else {
            $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            if ($httpCode >= 400) {
                self::$lastError = "HTTP $httpCode: $result";
                error_log("TG API ERROR: " . self::$lastError);
            }
        }

        curl_close($ch);

        return $result;
    }
}
