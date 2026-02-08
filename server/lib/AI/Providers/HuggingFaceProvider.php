<?php
// server/lib/AI/Providers/HuggingFaceProvider.php

require_once __DIR__ . '/../AIProvider.php';

class HuggingFaceProvider implements AIProvider
{
    private $apiKey;
    private $imageModel = 'stabilityai/stable-diffusion-xl-base-1.0';
    private $textModel = 'mistralai/Mistral-7B-Instruct-v0.2';

    public function __construct()
    {
        if (!defined('HUGGINGFACE_API_KEY')) {
            throw new Exception("Hugging Face API Key missing");
        }
        $this->apiKey = HUGGINGFACE_API_KEY;
    }

    public function text(array $messages, array $options = [])
    {
        // Simple implementation for chat (HF Inference API is raw, usually needs formatting)
        // For now, we focus on Image Generation logic as requested
        throw new Exception("Text generation via HF not yet implemented fully");
    }

    public function image(string $prompt, array $options = [])
    {
        // New endpoint as of late 2024/2025
        $url = "https://router.huggingface.co/hf-inference/models/" . $this->imageModel;

        $headers = [
            "Authorization: Bearer " . $this->apiKey,
            "Content-Type: application/json"
        ];

        $data = [
            "inputs" => $prompt,
            "options" => [
                "wait_for_model" => true
            ]
        ];

        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_POST, 1);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
        curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($httpCode !== 200) {
            $error = json_decode($response, true);
            throw new Exception("HF API Error ($httpCode): " . ($error['error'] ?? 'Unknown'));
        }

        // HF returns raw binary image data for image models
        $base64 = base64_encode($response);
        return "data:image/jpeg;base64," . $base64;
    }
}
