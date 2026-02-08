<?php
// tests/verify_yandex.php

require_once __DIR__ . '/../server/config.php';
require_once __DIR__ . '/../server/lib/AI/AIService.php';

echo "=== Verifying YandexGPT ===\n\n";

try {
    // 1. Text Generation
    echo "Testing Text Generation...\n";
    $provider = AIService::getProvider('text', 'yandex');

    $messages = [
        ['role' => 'system', 'content' => 'Ты умный помощник.'],
        ['role' => 'user', 'content' => 'Сколько будет 2+2? Ответь одним числом.']
    ];

    $start = microtime(true);
    $response = $provider->text($messages);
    $duration = round(microtime(true) - $start, 2);

    if (isset($response['content'])) {
        echo "✅ Text Success ({$duration}s): " . $response['content'] . "\n";
        echo "   Usage: " . json_encode($response['usage']) . "\n";
    } else {
        echo "❌ Text Failed: No content returned.\n";
        print_r($response);
    }

} catch (Exception $e) {
    echo "❌ Text Error: " . $e->getMessage() . "\n";
}

echo "\n-------------------\n\n";

try {
    // 2. Image Generation
    echo "Testing Image Generation (YandexART)...\n";
    $provider = AIService::getProvider('image', 'yandex');

    $prompt = "Future technologies, cyberpunk style, high detail";

    $start = microtime(true);
    $url = $provider->image($prompt);
    $duration = round(microtime(true) - $start, 2);

    if ($url && strpos($url, 'data:image') === 0) {
        echo "✅ Image Success ({$duration}s): Base64 Image generated.\n";
        // Check length
        echo "   Size: " . round(strlen($url) / 1024, 2) . " KB\n";
    } else {
        echo "❌ Image Failed: Invalid response.\n";
        echo substr($url, 0, 100) . "...\n";
    }

} catch (Exception $e) {
    echo "❌ Image Error: " . $e->getMessage() . "\n";
}

echo "\n=== Done ===\n";
