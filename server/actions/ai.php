<?php
// server/actions/ai.php

function action_generate_content($pdo, $currentUser, $params)
{
    if (!isset($currentUser['id'])) {
        echo json_encode(['status' => 'error', 'message' => 'Auth required']);
        return;
    }

    // require_once __DIR__ . '/../lib/GigaChat.php'; // Deprecated
    require_once __DIR__ . '/../lib/AI/AIService.php';

    $type = $params['type'] ?? '';
    // $data could be already an array in some frameworks, but here it's likely a JSON string or array from $_POST
    $data = isset($params['data']) ? (is_array($params['data']) ? $params['data'] : json_decode($params['data'], true)) : [];

    try {
        $prompt = "";
        $system = "Ты помощник для игры. Отвечай только в формате JSON.";

        switch ($type) {
            case 'generate_image':
                $userPrompt = $data['prompt'] ?? 'Avatar';
                $finalPrompt = $userPrompt;

                // 1. Translate/Optimize Prompt
                try {
                    // Prefer Yandex for translation as it is better at RU->EN
                    $translator = defined('YANDEX_API_KEY') ? AIService::getProvider('text', 'yandex') : AIService::getProvider('text');

                    $transSystem = "Translate the user's text to English. Output ONLY the English translation.";
                    $transRes = $translator->text([
                        ['role' => 'system', 'content' => $transSystem],
                        ['role' => 'user', 'content' => $userPrompt]
                    ]);

                    if (!empty($transRes['content'])) {
                        $finalPrompt = trim($transRes['content']);
                        // Cleanup if AI was chatty
                        if (strpos($finalPrompt, ':') !== false) {
                            $parts = explode(':', $finalPrompt);
                            $finalPrompt = end($parts);
                        }
                    }
                } catch (Exception $e) {
                    // Ignore translation errors, use original
                    if (class_exists('TelegramLogger'))
                        TelegramLogger::logError('prompt_trans_fail', ['e' => $e->getMessage()]);
                }

                $imageUrl = AIService::generateImage($finalPrompt);
                echo json_encode(['status' => 'ok', 'data' => ['url' => $imageUrl, 'prompt_used' => $finalPrompt]]);
                return;

            case 'quiz_question':
                $topic = $data['topic'] ?? 'General Knowledge';
                $system .= " Создай вопрос для викторины.";
                $prompt = "Придумай сложный вопрос на тему '$topic'. 
                Формат JSON:
                {
                    \"question\": \"Текст вопроса\",
                    \"options\": [\"Вариант 1\", \"Вариант 2\", \"Вариант 3\", \"Вариант 4\"],
                    \"correct_index\": 0,
                    \"explanation\": \"Почему это правильно\"
                }";
                break;

            case 'bunker_character':
                $system .= " Создай персонажа для игры Бункер. Будь креативным и смешным.";
                $prompt = "Сгенерируй случайного персонажа.
                Формат JSON:
                {
                    \"profession\": \"Профессия (стаж)\",
                    \"health\": \"Болезнь или состояние\",
                    \"hobby\": \"Хобби\",
                    \"phobia\": \"Фобия\",
                    \"inventory\": \"Предмет в инвентаре\",
                    \"fact\": \"Дополнительный факт\"
                }";
                break;

            case 'word_hint':
                $word = $data['word'] ?? '';
                $system = "Ты ведущий игры. Дай подсказку.";
                $prompt = "Дай подсказку к слову '$word', не называя его и однокоренные слова. Максимум 1 предложение.";
                break;

            default:
                echo json_encode(['status' => 'error', 'message' => 'Unknown type']);
                return;
        }

        $messages = [
            ['role' => 'system', 'content' => $system],
            ['role' => 'user', 'content' => $prompt]
        ];

        // Call API via AIService
        $response = AIService::getProvider('text')->text($messages);

        if (isset($response['content'])) {
            $content = $response['content'];

            // Try to parse JSON if expected
            if ($type !== 'word_hint') {
                if (preg_match('/```json(.*?)```/s', $content, $matches)) {
                    $content = trim($matches[1]);
                }

                $json = json_decode($content, true);
                if ($json) {
                    echo json_encode(['status' => 'ok', 'data' => $json]);
                    return;
                }
            }

            echo json_encode(['status' => 'ok', 'data' => $content]);
        } else {
            echo json_encode(['status' => 'error', 'message' => 'API Error (No Content)', 'debug' => $response]);
        }

    } catch (Exception $e) {
        echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
    }
}
