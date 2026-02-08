<?php
// server/lib/AI/AIProvider.php

interface AIProvider
{
    /**
     * Generate text completion
     * @param array $messages Chat history [['role' => 'user', 'content' => '...']]
     * @param array $options ['temperature' => 0.7, 'max_tokens' => 1024]
     * @return array Standardized response ['content' => '...', 'usage' => ...]
     */
    public function text(array $messages, array $options = []);

    /**
     * Generate image from prompt
     * @param string $prompt Text description
     * @param array $options ['width' => 512, 'height' => 512]
     * @return string URL or Base64 of the generated image
     */
    public function image(string $prompt, array $options = []);
}
