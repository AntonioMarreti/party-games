<?php
// server/lib/AI/Bot/BotBrain.php

require_once __DIR__ . '/../AIService.php';
require_once __DIR__ . '/BotPersona.php';

class BotBrain
{
    private $persona;
    private $provider;

    public function __construct(BotPersona $persona)
    {
        $this->persona = $persona;
    }

    private function getProvider()
    {
        if (!$this->provider) {
            $this->provider = AIService::getProvider('text');
        }
        return $this->provider;
    }

    /**
     * Generate a chat message from the bot
     * @param array $chatHistory Array of ['from' => 'User', 'message' => '...']
     * @param string $gameContext Describe what's happening (e.g. "Round 2, Vovan is winning")
     */
    public function generateChatResponse(array $chatHistory, string $gameContext = "")
    {
        $systemPrompt = $this->persona->systemPrompt . "\n" .
            "Context: $gameContext\n" .
            "Chat History (last few messages):\n";

        foreach (array_slice($chatHistory, -5) as $msg) {
            $systemPrompt .= "- " . $msg['from'] . ": " . $msg['message'] . "\n";
        }

        $systemPrompt .= "\nRespond to the chat as your persona using 1 short sentence. Be reactive.";

        try {
            // Low temp for consistent character, but high enough for variety
            $response = $this->getProvider()->text([
                ['role' => 'system', 'content' => $systemPrompt],
                ['role' => 'user', 'content' => "Say something mostly relevant to the last message or the game state."]
            ], ['temperature' => 0.9]);

            return $response['content'] ?? "...";
        } catch (Exception $e) {
            return "beep boop error";
        }
    }

    /**
     * Decide on an answer for a quiz question.
     * Guaranteed correctness rate based on difficulty (1-10).
     * 1 = 10% correct, 10 = 95% correct.
     * 
     * @param int $correctIndex The index of the correct answer
     * @param int $totalOptions Total number of options
     * @return int The chosen index
     */
    public function answerQuiz(int $correctIndex, int $totalOptions = 4)
    {
        // Difficulty 1 => 10% chance
        // Difficulty 5 => 50% chance
        // Difficulty 10 => 90% chance
        $chance = $this->persona->difficulty * 10;
        $roll = rand(1, 100);

        if ($roll <= $chance) {
            return $correctIndex;
        }

        // Pick a wrong answer
        $wrongOptions = [];
        for ($i = 0; $i < $totalOptions; $i++) {
            if ($i !== $correctIndex)
                $wrongOptions[] = $i;
        }

        return $wrongOptions[array_rand($wrongOptions)];
    }

    public function getPersona()
    {
        return $this->persona;
    }

    /**
     * Generate a guess for WordClash (Wordle)
     * @param string $secretWord The target word
     * @param array $history Previous guesses [['word' => '...', 'pattern' => [...]], ...]
     * @param array $dictionary List of valid words
     * @return string The chosen word
     */
    public function playWordClash(string $secretWord, array $history, array $dictionary)
    {
        // 1. Easy (1-3): Just pick a random word
        if ($this->persona->difficulty <= 3) {
            return $dictionary[array_rand($dictionary)];
        }

        // 2. Medium (4-7): Respect GREEN letters, ignore others
        // 3. Hard (8-10): Respect GREEN and YELLOW and GREY (True Solver)
        $isHard = $this->persona->difficulty >= 8;

        // Compile constraints from history
        $knownGreens = []; // index => char
        $knownYellows = []; // char => [bad_indices]
        $knownGreys = []; // char

        foreach ($history as $entry) {
            $word = $entry['word'];
            $pattern = $entry['pattern']; // 2=Green, 1=Yellow, 0=Grey
            $chars = mb_str_split($word);

            foreach ($chars as $i => $char) {
                $status = $pattern[$i];
                if ($status == 2) {
                    $knownGreens[$i] = $char;
                } elseif ($status == 1) {
                    if (!isset($knownYellows[$char]))
                        $knownYellows[$char] = [];
                    $knownYellows[$char][] = $i; // Char is present but NOT at $i
                } elseif ($status == 0) {
                    if (!in_array($char, $knownGreys) && !in_array($char, $knownGreens) && !isset($knownYellows[$char])) {
                        $knownGreys[] = $char;
                    }
                }
            }
        }

        // Filter dictionary
        $candidates = [];
        $usedWords = array_column($history, 'word');

        foreach ($dictionary as $word) {
            if (in_array($word, $usedWords))
                continue; // Don't repeat guesses

            $chars = mb_str_split($word);
            $isValid = true;

            // Check Greens (Must match position)
            foreach ($knownGreens as $i => $char) {
                if (($chars[$i] ?? '') !== $char) {
                    $isValid = false;
                    break;
                }
            }
            if (!$isValid)
                continue;

            if ($isHard) {
                // Check Greys (Must NOT be present)
                foreach ($knownGreys as $char) {
                    if (mb_strpos($word, $char) !== false) {
                        $isValid = false;
                        break;
                    }
                }
                if (!$isValid)
                    continue;

                // Check Yellows (Must be present somewhere, but NOT at bad index)
                foreach ($knownYellows as $char => $badIndices) {
                    if (mb_strpos($word, $char) === false) {
                        $isValid = false; // Missing yellow char entirely
                        break;
                    }
                    foreach ($badIndices as $badIdx) {
                        if (($chars[$badIdx] ?? '') === $char) {
                            $isValid = false; // Yellow char at known wrong position
                            break;
                        }
                    }
                    if (!$isValid)
                        break;
                }
            }

            if ($isValid) {
                $candidates[] = $word;
            }
        }

        if (empty($candidates)) {
            // Should not happen if dictionary matches secret, but fallback to random
            return $dictionary[array_rand($dictionary)];
        }

        return $candidates[array_rand($candidates)];
    }
}
