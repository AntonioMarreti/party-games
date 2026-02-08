<?php
// tests/verify_bot.php

require_once __DIR__ . '/../server/config.php';
require_once __DIR__ . '/../server/lib/AI/Bot/BotBrain.php';

echo "=== Verifying Bot Brain ===\n\n";

// 1. Test Quiz Logic (Deterministic-ish)
echo "Testing Quiz Answer (Difficulty logic)...\n";
$personaStupid = BotPersona::getPreset('vovan'); // Diff 3
$personaSmart = BotPersona::getPreset('albert');  // Diff 9

$brainStupid = new BotBrain($personaStupid);
$brainSmart = new BotBrain($personaSmart);

$correctIndex = 2; // Option C
$total = 4;

$stupidWins = 0;
$smartWins = 0;
$runs = 100;

for ($i = 0; $i < $runs; $i++) {
    if ($brainStupid->answerQuiz($correctIndex, $total) === $correctIndex)
        $stupidWins++;
    if ($brainSmart->answerQuiz($correctIndex, $total) === $correctIndex)
        $smartWins++;
}

echo "Vovan (Diff 3) Correct Rate: $stupidWins/$runs (" . ($personaStupid->difficulty * 10) . "% expected)\n";
echo "Albert (Diff 9) Correct Rate: $smartWins/$runs (" . ($personaSmart->difficulty * 10) . "% expected)\n";

echo "\n-------------------\n\n";

// 2. Test Chat Generation (AI)
echo "Testing Chat Generation...\n";

$chatHistory = [
    ['from' => 'Antonio', 'message' => 'Всем привет! Кто сегодня победит?'],
    ['from' => 'User2', 'message' => 'Я точно не проиграю!']
];

try {
    echo "Bot: " . $personaStupid->name . "\n";
    $response = $brainStupid->generateChatResponse($chatHistory, "Game starting");
    echo "Response: $response\n\n";

    echo "Bot: " . $personaSmart->name . "\n";
    $response = $brainSmart->generateChatResponse($chatHistory, "Game starting");
    echo "Response: $response\n";

} catch (Exception $e) {
    echo "❌ Chat Error: " . $e->getMessage() . "\n";
}

echo "\n=== Done ===\n";
