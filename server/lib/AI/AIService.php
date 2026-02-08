<?php
// server/lib/AI/AIService.php

require_once __DIR__ . '/Providers/HuggingFaceProvider.php';
require_once __DIR__ . '/Providers/GigaChatProvider.php';
require_once __DIR__ . '/Providers/YandexGPTProvider.php';

class AIService
{
    /**
     * @param string $type 'text' | 'image'
     * @param string $providerName 'gigachat' | 'huggingface' | 'yandex' | 'auto'
     * @return AIProvider
     */
    public static function getProvider($type = 'text', $providerName = 'auto')
    {
        // Explicit selection
        if ($providerName === 'yandex') {
            return new YandexGPTProvider();
        }
        if ($providerName === 'gigachat') {
            return new GigaChatProvider();
        }
        if ($providerName === 'huggingface') {
            return new HuggingFaceProvider();
        }

        // Auto selection
        if ($type === 'image') {
            // Default to HuggingFace for now, but Yandex is available
            return new HuggingFaceProvider();
        }

        // Default to GigaChat for text
        return new GigaChatProvider();
    }

    // Helper for image generation (Legacy/Convenience)
    public static function generateImage($prompt)
    {
        $provider = self::getProvider('image');
        return $provider->image($prompt);
    }
}
