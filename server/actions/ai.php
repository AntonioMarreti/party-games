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

            case 'bunker_summary':
                // --- SERVER-SIDE CACHING ---
                $room = null;
                if (function_exists('getRoom')) {
                    $room = getRoom($currentUser['id']);
                }

                if ($room) {
                    $state = json_decode($room['game_state'], true);
                    if (isset($state['ai_summary'])) {
                        echo json_encode(['status' => 'ok', 'data' => $state['ai_summary'], 'cached' => true]);
                        return;
                    }
                }
                // ---------------------------

                $system = "Ты летописец постапокалиптического мира. Напиши краткий, атмосферный и выразительный эпилог для группы выживших в бункере. Будь серьезным или слегка ироничным (в зависимости от состава группы).";
                $catastrophe = $data['catastrophe'] ?? 'Неизвестная катастрофа';
                $players = $data['players'] ?? [];
                $threats = $data['threats'] ?? [];
                $capacity = $data['capacity'] ?? 0;

                $survivorsText = "";
                $kickedText = "";
                $survivorsCount = 0;
                foreach ($players as $p) {
                    $txt = "- {$p['name']} ({$p['profession']}, здоровье: {$p['health']}, хобби: {$p['hobby']})";
                    if (!empty($p['story']))
                        $txt .= " [Итог: {$p['story']}]";

                    if ($p['is_kicked']) {
                        $kickedText .= $txt . "\n";
                    } else {
                        $survivorsText .= $txt . "\n";
                        $survivorsCount++;
                    }
                }

                $threatsText = "";
                foreach ($threats as $t) {
                    $threatsText .= "- {$t['title']}: " . ($t['success'] ? "Справились" : "Провал") . ". {$t['result_text']}\n";
                }

                $features = $data['features'] ?? [];
                $featuresText = "";
                $incidentsText = "";
                foreach ($features as $f) {
                    $bonusStr = ($f['bonus'] ?? 0) > 0 ? "+{$f['bonus']}%" : ($f['bonus'] ?? 0) . "%";
                    if (isset($f['type']) && $f['type'] === 'incident') {
                        $incidentsText .= "- {$f['text']} (" . ($f['fixed'] ? 'ИСПРАВЛЕНО' : 'ДЕЙСТВУЕТ') . ", эффект: {$bonusStr})\n";
                    } else {
                        $featuresText .= "- {$f['text']} (эффект: {$bonusStr})\n";
                    }
                }

                $prompt = "### КАТАСТРОФА: $catastrophe
                ### МЕСТ В БУНКЕРЕ: $capacity (Выжило: $survivorsCount)
                
                ### СОСТОЯНИЕ БУНКЕРА (ОБЪЕКТЫ):
                " . ($featuresText ?: "Нет данных\n") . "
                
                ### ПОЛОМКИ И ПРОИСШЕСТВИЯ:
                " . ($incidentsText ?: "Поломок нет\n") . "

                ### КТО ВНУТРИ (ТОЛЬКО ЭТИ ИМЕНА МОЖНО ИСПОЛЬЗОВАТЬ КАК ВЫЖИВШИХ):
                $survivorsText
                
                ### КТО ОСТАЛСЯ СНАРУЖИ (ИЗГНАНЫ):
                " . ($kickedText ?: "Никто\n") . "
                
                ### ИТОГИ УГРОЗ:
                $threatsText
                
                ### ЗАДАНИЕ:
                Напиши атмосферный эпилог (макс 800 символов), который подведет ИТОГ ИГРЫ. 
                В центре истории — жизнь ВНУТРИ бункера, но обязательно вплети в повествование судьбу тех, кто остался СНАРУЖИ, и как их отсутствие или присутствие повлияло на финал.
                
                ### СТРОГИЕ ПРАВИЛА:
                1. КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО использовать Markdown (никаких **, #, _, `). Только чистый текст.
                2. Используй ТОЛЬКО реальные имена из списков.
                3. Опиши быт и атмосферу внутри: как выжившие (имена из списка) справлялись с угрозами и ПОЛОМКАМИ. Упомяни, помогли ли ОБЪЕКТЫ бункера.
                4. Упомяни изгнанных: к каким последствиям для тех, кто внутри, привело их отсутствие.
                5. ФИНАЛЬНЫЙ ВЕРДИКТ: В самом конце (последним предложением) вынеси четкий вердикт: выжила ли группа в итоге или все погибли.
                6. Тон: драматичный, живой, глубокий. Сделай так, чтобы игроки почувствовали вес своих решений.";
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

            // --- SAVE TO CACHE IF IT'S A BUNKER SUMMARY ---
            if ($type === 'bunker_summary' && isset($room['id'])) {
                $state = json_decode($room['game_state'], true);
                $state['ai_summary'] = $content;
                if (function_exists('updateGameState')) {
                    updateGameState($room['id'], $state);
                }
            }
            // ----------------------------------------------

            // Try to parse JSON if expected
            if ($type !== 'word_hint' && $type !== 'bunker_summary') {
                if (preg_match('/```json(.*?)```/s', $content, $matches)) {
                    $content = trim($matches[1]);
                }

                $json = json_decode($content, true);
                if ($json) {
                    echo json_encode(['status' => 'ok', 'data' => $json, 'debug_messages' => $messages]);
                    return;
                }
            }

            echo json_encode(['status' => 'ok', 'data' => $content, 'debug_messages' => $messages]);
        } else {
            echo json_encode(['status' => 'error', 'message' => 'API Error (No Content)', 'debug' => $response, 'debug_messages' => $messages]);
        }

    } catch (Exception $e) {
        echo json_encode(['status' => 'error', 'message' => $e->getMessage(), 'debug_messages' => $messages ?? []]);
    }
}
