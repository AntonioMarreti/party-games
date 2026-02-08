<?php
// server/lib/AI/Providers/YandexGPTProvider.php

require_once __DIR__ . '/../AIProvider.php';

class YandexGPTProvider implements AIProvider
{
    private $apiKey;
    private $folderId;

    public function __construct()
    {
        if (!defined('YANDEX_API_KEY') || !defined('YANDEX_FOLDER_ID')) {
            throw new Exception("Yandex Config Missing");
        }
        $this->apiKey = YANDEX_API_KEY;
        $this->folderId = YANDEX_FOLDER_ID;
    }

    /**
     * Generate text completion using YandexGPT
     */
    public function text(array $messages, array $options = [])
    {
        $temperature = $options['temperature'] ?? 0.6;
        $maxTokens = $options['max_tokens'] ?? 1000;

        // Convert standard messages format to Yandex format
        // Standard: [['role' => 'user', 'content' => '...']]
        // Yandex: [['role' => 'user', 'text' => '...']]
        $yandexMessages = array_map(function ($m) {
            return [
                'role' => $m['role'],
                'text' => $m['content']
            ];
        }, $messages);

        $url = "https://llm.api.cloud.yandex.net/foundationModels/v1/completion";

        $payload = [
            'modelUri' => "gpt://{$this->folderId}/yandexgpt/latest",
            'completionOptions' => [
                'stream' => false,
                'temperature' => $temperature,
                'maxTokens' => $maxTokens
            ],
            'messages' => $yandexMessages
        ];

        $response = $this->request($url, $payload);

        if (!isset($response['result']['alternatives'][0]['message']['text'])) {
            throw new Exception("YandexGPT Error: Invalid response format " . json_encode($response));
        }

        return [
            'content' => $response['result']['alternatives'][0]['message']['text'],
            'usage' => $response['result']['usage'] ?? []
        ];
    }

    /**
     * Generate image using YandexART (Kandinsky)
     * Note: This is async operations.
     */
    public function image(string $prompt, array $options = [])
    {
        $url = "https://llm.api.cloud.yandex.net/foundationModels/v1/imageGenerationAsync";

        $payload = [
            'modelUri' => "art://{$this->folderId}/yandex-art/latest",
            'generationOptions' => [
                'seed' => rand(1000, 999999)
            ],
            'messages' => [
                [
                    'weight' => 1,
                    'text' => $prompt
                ]
            ]
        ];

        // 1. Start generation
        $initialResponse = $this->request($url, $payload);

        if (!isset($initialResponse['id'])) {
            throw new Exception("YandexART Error: Failed to start generation");
        }

        $operationId = $initialResponse['id'];

        // 2. Poll for result
        $attempts = 0;
        $maxAttempts = 30; // 30 * 1s = 30s timeout

        while ($attempts < $maxAttempts) {
            sleep(1);
            $checkUrl = "https://llm.api.cloud.yandex.net/operations/" . $operationId;
            $checkResponse = $this->request($checkUrl, [], 'GET');

            if (isset($checkResponse['done']) && $checkResponse['done'] === true) {
                if (isset($checkResponse['response']['image'])) {
                    // Yandex returns Base64 image
                    $base64 = $checkResponse['response']['image'];
                    return "data:image/jpeg;base64," . $base64;
                }
                if (isset($checkResponse['error'])) {
                    throw new Exception("YandexART Gen Error: " . json_encode($checkResponse['error']));
                }
            }
            $attempts++;
        }

        throw new Exception("YandexART Timeout");
    }

    private function request($url, $payload = [], $method = 'POST')
    {
        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            "Content-Type: application/json",
            "Authorization: Api-Key " . $this->apiKey,
            "x-folder-id: " . $this->folderId
        ]);

        if ($method === 'POST') {
            curl_setopt($ch, CURLOPT_POST, true);
            curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($payload));
        }

        $result = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);

        if ($curlError = curl_error($ch)) {
            curl_close($ch);
            throw new Exception("Yandex API Request Error: $curlError");
        }

        curl_close($ch);

        $json = json_decode($result, true);

        if ($httpCode >= 400) {
            $msg = $json['message'] ?? $json['error']['message'] ?? $result;
            throw new Exception("Yandex API Error ($httpCode): $msg");
        }

        return $json;
    }
}
