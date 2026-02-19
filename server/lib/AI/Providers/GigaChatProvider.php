<?php
// server/lib/AI/Providers/GigaChatProvider.php

require_once __DIR__ . '/../AIProvider.php';

class GigaChatProvider implements AIProvider
{
    private $accessToken = null;
    private $tokenFile = __DIR__ . '/../../../../logs/gigachat_token.json'; // Cache token
    private $usageFile = __DIR__ . '/../../../../logs/gigachat_usage.json'; // Usage tracker
    private $auditFile = __DIR__ . '/../../../../logs/gigachat_audit.json'; // Rate limit audit

    private $clientId;
    private $clientSecret;
    private $scope;
    private $model;

    public function __construct()
    {
        if (!defined('GIGACHAT_CLIENT_ID') || !defined('GIGACHAT_CLIENT_SECRET')) {
            throw new Exception("GigaChat Config Missing");
        }
        $this->clientId = GIGACHAT_CLIENT_ID;
        $this->clientSecret = GIGACHAT_CLIENT_SECRET;
        $this->scope = defined('GIGACHAT_SCOPE') ? GIGACHAT_SCOPE : 'GIGACHAT_API_PERS';
        $this->model = defined('GIGACHAT_MODEL') ? GIGACHAT_MODEL : 'GigaChat:latest';
    }

    /**
     * Generate text completion
     * @param array $messages Chat history [['role' => 'user', 'content' => '...']]
     * @param array $options ['temperature' => 0.7, 'max_tokens' => 1024]
     * @return array Standardized response ['content' => '...', 'usage' => ...]
     */
    public function text(array $messages, array $options = [])
    {
        $temperature = $options['temperature'] ?? 0.7;
        $maxTokens = $options['max_tokens'] ?? 1024;

        $reqTime = $this->enforceLimits();
        $token = $this->getToken();

        $payload = [
            'model' => $this->model,
            'messages' => $messages,
            'temperature' => $temperature,
            'max_tokens' => $maxTokens,
            'stream' => false
        ];

        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, "https://gigachat.devices.sberbank.ru/api/v1/chat/completions");
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Content-Type: application/json',
            'Accept: application/json',
            'Authorization: Bearer ' . $token
        ]);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);

        // Check for 401 (Auth expired) -> Retry once
        if ($httpCode == 401) {
            curl_close($ch);
            // Delete cache file to force refresh
            if (file_exists($this->tokenFile))
                unlink($this->tokenFile);

            return $this->text($messages, $options); // retry
        }

        if ($curlError = curl_error($ch)) {
            curl_close($ch);
            throw new Exception("GigaChat Requests Error: $curlError");
        }

        curl_close($ch);
        $json = json_decode($response, true);

        if (!isset($json['choices'][0]['message']['content'])) {
            $msg = $json['message'] ?? 'Unknown Error';
            // Log error
            if (class_exists('TelegramLogger')) {
                $context = [
                    'response' => $response,
                    'code' => $httpCode,
                    'user_id' => $options['user_id'] ?? 'N/A',
                    'user_name' => $options['user_name'] ?? 'N/A',
                    'ip' => $options['client_ip'] ?? 'N/A',
                    'request_type' => $options['request_type'] ?? 'N/A',
                    'input_messages' => json_encode($messages, JSON_UNESCAPED_UNICODE)
                ];

                if ($httpCode === 429) {
                    TelegramLogger::logError('gigachat_rate_limit', $context);
                } else {
                    TelegramLogger::logError('gigachat_error', $context);
                }
            }
            throw new Exception("GigaChat API Error: $msg");
        }

        // Track usage
        $this->trackUsage($json, $reqTime);

        return [
            'content' => $json['choices'][0]['message']['content'],
            'usage' => $json['usage'] ?? []
        ];
    }

    /**
     * Generate image (Not implemented yet for GigaChat in this provider)
     */
    public function image(string $prompt, array $options = [])
    {
        // GigaChat Kandinsky integration could go here
        throw new Exception("Image generation not implemented for GigaChat yet.");
    }

    // === INTERNALS (Ported from GigaChat.php) ===

    private function getToken()
    {
        // 1. Try to load from file
        if (file_exists($this->tokenFile)) {
            $data = json_decode(file_get_contents($this->tokenFile), true);
            if ($data && isset($data['access_token']) && isset($data['expires_at'])) {
                if (time() < ($data['expires_at'] - 60)) { // Buffer 60s
                    return $data['access_token'];
                }
            }
        }
        // 2. Request new token
        return $this->refreshToken();
    }

    private function refreshToken()
    {
        $uuid = $this->getUuidV4();
        $authData = base64_encode($this->clientId . ':' . $this->clientSecret);

        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, "https://ngw.devices.sberbank.ru:9443/api/v2/oauth");
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Content-Type: application/x-www-form-urlencoded',
            'Accept: application/json',
            'RqUID: ' . $uuid,
            'Authorization: Basic ' . $authData
        ]);
        curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query([
            'scope' => $this->scope
        ]));
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);
        curl_close($ch);

        $json = json_decode($response, true);

        if ($httpCode !== 200 || !isset($json['access_token'])) {
            $errMsg = "Auth Failed (HTTP $httpCode): " . ($json['message'] ?? $response);
            if ($curlError)
                $errMsg .= " CURL: $curlError";

            if (class_exists('TelegramLogger')) {
                TelegramLogger::logError('gigachat_auth', ['response' => $response, 'code' => $httpCode, 'error' => $errMsg]);
            }
            throw new Exception($errMsg);
        }

        // Save to cache
        $cache = [
            'access_token' => $json['access_token'],
            'expires_at' => $json['expires_at'] // Usually unix timestamp in ms
        ];

        if ($cache['expires_at'] > time() * 1000) {
            $cache['expires_at'] = floor($cache['expires_at'] / 1000);
        }

        if (!is_dir(dirname($this->tokenFile))) {
            mkdir(dirname($this->tokenFile), 0777, true);
        }
        file_put_contents($this->tokenFile, json_encode($cache));

        return $cache['access_token'];
    }

    private function getUuidV4()
    {
        $data = random_bytes(16);
        $data[6] = chr(ord($data[6]) & 0x0f | 0x40);
        $data[8] = chr(ord($data[8]) & 0x3f | 0x80);
        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($data), 4));
    }

    private function enforceLimits()
    {
        if (!defined('GIGACHAT_TOKEN_LIMIT'))
            return null;

        $limit = GIGACHAT_TOKEN_LIMIT;

        // 1. Check Global Limit
        $usage = 0;
        if (file_exists($this->usageFile)) {
            $data = json_decode(file_get_contents($this->usageFile), true);
            $usage = $data['total'] ?? 0;
        }

        if ($usage >= $limit) {
            $this->alertAdmin("⛔️ GigaChat Limit Exceeded! ($usage / $limit). Generation blocked.");
            throw new Exception("GigaChat Limit Exceeded");
        }

        if ($usage >= ($limit * 0.8)) {
            $this->alertAdmin("⚠️ GigaChat Limit Approaching ($usage / $limit).", 'warning_80');
        }

        // 2. Check Rate Limit (RPM & TPM)
        $audit = [];
        if (file_exists($this->auditFile)) {
            $audit = json_decode(file_get_contents($this->auditFile), true) ?? [];
        }

        $now = microtime(true);
        // Filter last 60 seconds
        $audit = array_filter($audit, function ($entry) use ($now) {
            return ($now - $entry[0]) <= 60;
        });

        // RPM Check
        if (count($audit) >= 20) {
            $this->alertAdmin("⚠️ Rate Limit Hit (RPM > 20)", 'rpm_limit');
            throw new Exception("Rate Limit Exceeded (RPM)");
        }

        // TPM Check
        $tokensInMinute = array_reduce($audit, function ($carry, $item) {
            return $carry + ($item[1] ?? 0);
        }, 0);

        if ($tokensInMinute > 10000) {
            $this->alertAdmin("⚠️ Rate Limit Hit (TPM > 10k)", 'tpm_limit');
            throw new Exception("Rate Limit Exceeded (TPM)");
        }

        // Log start
        $audit[] = [$now, 0];
        file_put_contents($this->auditFile, json_encode(array_values($audit)));

        return $now;
    }

    private function trackUsage($response, $requestTimestamp = null)
    {
        if (!isset($response['usage']['total_tokens']))
            return;

        $tokens = $response['usage']['total_tokens'];

        // 1. Update Global Usage
        $data = ['total' => 0, 'alerts' => []];
        if (file_exists($this->usageFile)) {
            $data = json_decode(file_get_contents($this->usageFile), true);
        }
        $data['total'] = ($data['total'] ?? 0) + $tokens;
        $data['last_updated'] = time();
        file_put_contents($this->usageFile, json_encode($data));

        // 2. Update Audit Log
        if ($requestTimestamp && file_exists($this->auditFile)) {
            $audit = json_decode(file_get_contents($this->auditFile), true) ?? [];
            foreach ($audit as &$entry) {
                if (abs($entry[0] - $requestTimestamp) < 0.0001) {
                    $entry[1] = $tokens;
                    break;
                }
            }
            file_put_contents($this->auditFile, json_encode($audit));
        }
    }

    private function alertAdmin($msg, $alertType = 'limit_hit')
    {
        if (!defined('GIGACHAT_ALERT_ID') || !class_exists('TelegramLogger'))
            return;

        $data = file_exists($this->usageFile) ? json_decode(file_get_contents($this->usageFile), true) : [];
        $today = date('Y-m-d');

        if (isset($data['alerts'][$alertType]) && $data['alerts'][$alertType] === $today) {
            return;
        }

        TelegramLogger::sendToUser(GIGACHAT_ALERT_ID, $msg);

        $data['alerts'][$alertType] = $today;
        file_put_contents($this->usageFile, json_encode($data));
    }
}
