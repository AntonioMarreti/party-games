<?php

interface GifProviderInterface
{
    public function search($query, $limit = 20);
}

class GiphyProvider implements GifProviderInterface
{
    private $apiKey;

    public function __construct($apiKey = null)
    {
        $this->apiKey = $apiKey ?: (defined('GIPHY_API_KEY') ? GIPHY_API_KEY : getenv('GIPHY_API_KEY'));
    }

    public function search($query, $limit = 20)
    {
        if (!$this->apiKey) {
            error_log("Giphy API Key is missing!");
            return ['results' => []];
        }

        $url = "https://api.giphy.com/v1/gifs/search?" . http_build_query([
            'api_key' => $this->apiKey,
            'q' => $query,
            'limit' => $limit,
            'rating' => 'g',
            'lang' => 'ru' // Optional: localize searches
        ]);

        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        curl_setopt($ch, CURLOPT_TIMEOUT, 5);
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);

        if ($httpCode !== 200) {
            TelegramLogger::logError('giphy_api', ['code' => $httpCode, 'response' => substr($response, 0, 200)]);
            return ['results' => []];
        }

        $data = json_decode($response, true);

        // Transform to Klipy-compatible format
        $results = [];
        foreach ($data['data'] ?? [] as $gif) {
            $originalUrl = $this->normalizeGiphyAssetUrl(
                $gif['images']['original']['url']
                ?? $gif['images']['downsized_large']['url']
                ?? ''
            );
            $previewUrl = $this->normalizeGiphyAssetUrl(
                $gif['images']['fixed_height_small']['url']
                ?? $gif['images']['preview_gif']['url']
                ?? $gif['images']['fixed_height']['url']
                ?? ''
            );

            $results[] = [
                'id' => $gif['id'],
                'url' => $originalUrl,
                'preview' => $previewUrl ?: $originalUrl,
                'title' => $gif['title'] ?? '',
                'source' => 'giphy',
                'media_formats' => [
                    'tinygif' => ['url' => $previewUrl],
                    'gif' => ['url' => $originalUrl]
                ]
            ];
        }

        return ['results' => $results];
    }

    private function normalizeGiphyAssetUrl($url)
    {
        $url = trim((string) $url);
        if ($url === '') {
            return '';
        }

        if (preg_match('#https?://(?:media\d*|media)\.giphy\.com/media/([^/]+)/#i', $url, $matches)) {
            $path = parse_url($url, PHP_URL_PATH) ?: '';
            $filename = basename($path);
            if ($filename !== '') {
                return 'https://i.giphy.com/media/' . $matches[1] . '/' . $filename;
            }
            return 'https://i.giphy.com/media/' . $matches[1] . '/giphy.gif';
        }

        return $url;
    }
}

class KlipyProvider implements GifProviderInterface
{
    private $apiKey;
    private $clientKey;

    public function __construct($apiKey = null)
    {
        $this->apiKey = $apiKey ?: (defined('KLIPY_API_KEY') ? KLIPY_API_KEY : getenv('KLIPY_API_KEY'));
        $this->clientKey = defined('KLIPY_CLIENT_KEY') ? KLIPY_CLIENT_KEY : 'PartyGamesApp';
    }

    public function search($query, $limit = 20)
    {
        if (!$this->apiKey) {
            return ['results' => []];
        }

        $url = "https://api.klipy.com/api/v1/gifs/search?" . http_build_query([
            'key' => $this->apiKey,
            'q' => $query,
            'limit' => $limit,
        ]);

        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        curl_setopt($ch, CURLOPT_TIMEOUT, 3);

        $headers = [
            'X-KLIPY-API-KEY: ' . $this->apiKey
        ];
        curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);

        if ($httpCode !== 200) {
            throw new Exception("Klipy API Error: $httpCode");
        }

        $data = json_decode($response, true);

        return $data;
    }
}

class GifProviderFactory
{
    public static function create()
    {
        try {
            $klipy = new KlipyProvider();
            // We verify connectivity with a quick light query
            $test = $klipy->search('hi', 1);
            if (!empty($test['results'])) {
                return $klipy;
            }
        } catch (Exception $e) {
            // error_log("Klipy Fallback: " . $e->getMessage());
        }

        return new GiphyProvider();
    }
}
