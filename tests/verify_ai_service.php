<?php
// tests/verify_ai_service.php

require_once __DIR__ . '/../server/config.php';
require_once __DIR__ . '/../server/lib/AI/AIService.php';

echo "=== Verifying AIService ===\n\n";

try {
    // 1. Text Generation (GigaChat)
    echo "Testing Text Generation (GigaChatProvider)...\n";
    $messages = [
        ['role' => 'system', 'content' => 'Ты тестовый бот.'],
        ['role' => 'user', 'content' => 'Скажи "Привет, мир!"']
    ];

    $start = microtime(true);
    $response = AIService::getProvider('text')->text($messages);
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
    // 2. Image Generation (HuggingFace)
    echo "Testing Image Generation (HuggingFaceProvider)...\n";
    $prompt = "A cute robot, minimalist vector art";

    $start = microtime(true);
    $url = AIService::generateImage($prompt);
    $duration = round(microtime(true) - $start, 2);

    if ($url) {
        echo "✅ Image Success ({$duration}s): URL generated (length " . strlen($url) . ")\n";
    } else {
        echo "❌ Image Failed: No URL returned.\n";
    }

} catch (Exception $e) {
    echo "❌ Image Error: " . $e->getMessage() . "\n";
}

echo "\n=== Done ===\n";
