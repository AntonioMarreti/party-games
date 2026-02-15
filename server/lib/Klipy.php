<?php
// server/lib/Klipy.php

class Klipy
{
    private $apiKey;
    private $clientKey;
    private $endpoint = "https://api.klipy.com/v2";

    public function __construct()
    {
        $this->apiKey = defined('KLIPY_API_KEY') ? KLIPY_API_KEY : getenv('KLIPY_API_KEY');
        $this->clientKey = defined('KLIPY_CLIENT_KEY') ? KLIPY_CLIENT_KEY : 'PartyGamesApp';

        if (!$this->apiKey) {
            error_log("Klipy API Key is missing!");
        }
    }

    public function search($query, $limit = 20, $pos = null)
    {
        if (!$this->apiKey) {
            return ['results' => []]; // Fail gracefully if no key
        }

        $params = [
            'q' => $query,
            'key' => $this->apiKey,
            'client_key' => $this->clientKey,
            'limit' => $limit,
            'media_filter' => 'gif,tinygif', // Optimize for speed/size
            'contentfilter' => 'high' // Safe search
        ];

        if ($pos) {
            $params['pos'] = $pos;
        }

        $url = $this->endpoint . "/search?" . http_build_query($params);

        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        // Add User-Agent just in case
        curl_setopt($ch, CURLOPT_USERAGENT, 'PartyGamesApp/1.0');
        curl_setopt($ch, CURLOPT_TIMEOUT, 3); // Wait max 3 seconds
        curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 2);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($httpCode !== 200) {
            error_log("Klipy API Error: $httpCode | Response: $response");
            // Fallback empty
            return ['results' => []];
        }

        $data = json_decode($response, true);

        if (json_last_error() !== JSON_ERROR_NONE) {
            TelegramLogger::logError('klipy_api', ['message' => 'JSON Decode Error: ' . json_last_error_msg(), 'response' => substr($response, 0, 200)]);
            return ['results' => []];
        }

        if (empty($data['results'])) {
            TelegramLogger::info('klipy_empty', ['query' => $query, 'response_keys' => array_keys($data)]);
        }

        return $data;
    }
}
