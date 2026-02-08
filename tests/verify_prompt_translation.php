<?php
// tests/verify_prompt_translation.php

require_once __DIR__ . '/../server/config.php';
require_once __DIR__ . '/../server/lib/AI/AIService.php';

echo "=== Verifying Prompt Translation ===\n\n";

$userPrompt = "Рыжий кот в скафандре на луне, пиксель арт";
echo "Input: $userPrompt\n";

try {
    $transSystem = "You are a prompt engineer. Translate this to English for Stable Diffusion. Output ONLY comma-separated keywords. No native language text.";

    $start = microtime(true);
    // Simulate production logic
    $translator = defined('YANDEX_API_KEY') ? AIService::getProvider('text', 'yandex') : AIService::getProvider('text');
    echo "Using Provider: " . get_class($translator) . "\n";

    $transSystem = "Translate to English. Output ONLY key words.";
    $transRes = $translator->text([
        ['role' => 'system', 'content' => $transSystem],
        ['role' => 'user', 'content' => $userPrompt]
    ]);
    $duration = round(microtime(true) - $start, 2);

    if (!empty($transRes['content'])) {
        $finalPrompt = trim($transRes['content']);
        echo "✅ Translated ({$duration}s): $finalPrompt\n";
    } else {
        echo "❌ Translation Failed: Empty response\n";
    }

} catch (Exception $e) {
    echo "❌ Error: " . $e->getMessage() . "\n";
}
