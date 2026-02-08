<?php
// tests/verify_wc_bot.php

require_once __DIR__ . '/../server/lib/AI/Bot/BotBrain.php';
require_once __DIR__ . '/../server/lib/AI/Bot/BotPersona.php';

// Mock Words Load
function loadWords($length = 5)
{
    if (file_exists(__DIR__ . '/../server/words/russian_5.json')) {
        return json_decode(file_get_contents(__DIR__ . '/../server/words/russian_5.json'), true);
    }
    return ['адепт', 'пират', 'клоун', 'арбуз', 'книга'];
}

// Helper to calc pattern
function calcPattern($guess, $secret)
{
    $len = mb_strlen($secret);
    $guessArr = preg_split('//u', $guess, -1, PREG_SPLIT_NO_EMPTY);
    $secretArr = preg_split('//u', $secret, -1, PREG_SPLIT_NO_EMPTY);

    $pattern = array_fill(0, $len, 0);
    $secretUsed = array_fill(0, $len, false);
    $guessUsed = array_fill(0, $len, false);

    for ($i = 0; $i < $len; $i++) {
        if ($guessArr[$i] === $secretArr[$i]) {
            $pattern[$i] = 2;
            $secretUsed[$i] = true;
            $guessUsed[$i] = true;
        }
    }
    for ($i = 0; $i < $len; $i++) {
        if ($guessUsed[$i])
            continue;
        for ($j = 0; $j < $len; $j++) {
            if (!$secretUsed[$j] && $guessArr[$i] === $secretArr[$j]) {
                $pattern[$i] = 1;
                $secretUsed[$j] = true;
                break;
            }
        }
    }
    return $pattern;
}


$dictionary = loadWords(5);
$secret = $dictionary[array_rand($dictionary)];

echo "Testing WordClash Bot Strategy\n";
echo "Target Secret: $secret\n";
echo "Dictionary Size: " . count($dictionary) . "\n\n";

// Test Hard Bot
$persona = new BotPersona("Solver", "Smart", "You are smart", 10);
$brain = new BotBrain($persona);

$history = [];
$won = false;

for ($turn = 1; $turn <= 20; $turn++) {
    echo "Turn $turn: ";
    $guess = $brain->playWordClash($secret, $history, $dictionary);
    echo "Guess: $guess ";

    if ($guess === $secret) {
        echo "[WIN!]\n";
        $won = true;
        break;
    }

    $pattern = calcPattern($guess, $secret);
    echo "Pattern: " . implode('', $pattern) . "\n";

    $history[] = [
        'word' => $guess,
        'pattern' => $pattern
    ];
}

if (!$won) {
    echo "Result: FAILED to guess in 20 turns\n";
} else {
    echo "Result: SUCCESS\n";
}
