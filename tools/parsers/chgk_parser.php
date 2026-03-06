<?php
// Simple script to fetch and parse questions from the ChGK database API
// https://db.chgk.info/

$apiUrl = "https://db.chgk.info/xml/random/types1/limit100";
$content = file_get_contents($apiUrl);

if (!$content) {
    die("Failed to fetch data from ChGK database.\n");
}

$xml = simplexml_load_string($content);
$bluffFacts = [];

foreach ($xml->question as $q) {
    $questionText = trim((string) $q->Question);
    $answerText = trim((string) $q->Answer);

    // We want short questions that can be formatted as "fill in the blank" facts
    // Avoid too long questions or questions depending on handouts (Раздаточный материал)
    if (mb_strlen($questionText) < 200 && mb_strlen($answerText) < 30 && !strpos($questionText, "Раздаточный") && !strpos($questionText, "Внимание")) {

        // Clean up the text
        $questionText = str_replace(["\n", "\r", '   ', '  '], ' ', $questionText);
        $answerText = str_replace(["\n", "\r", '.', '"'], '', $answerText);

        // Remove standard ChGK question endings like "Назовите его." or "Что это?"
        $endings = [
            '/Назовите (его|ее|их)\.?/iu',
            '/Что (это|такое|он сделал)\??/iu',
            '/Ответьте двумя словами\.?/iu',
            '/Ответьте максимально точно\.?/iu',
            '/Какое слово (мы заменили|пропущено)\??/iu',
            '/О чем (идет речь|речь)\??/iu'
        ];
        foreach ($endings as $ending) {
            $questionText = preg_replace($ending, '', $questionText);
        }

        $questionText = trim($questionText, " .?,!");

        // Add a blank at the end if it doesn't already have one
        if (!str_ends_with($questionText, "_______") && !str_ends_with($questionText, "...")) {
            $questionText .= " _______.";
        }

        $bluffFacts[] = [
            "text" => $questionText,
            "truth" => $answerText
        ];
    }
}

// Ensure the directory exists
$dirPath = __DIR__ . '/../server/games/packs/partybattle/bluff';
if (!is_dir($dirPath)) {
    mkdir($dirPath, 0777, true);
}

// Load existing base.json
$baseFile = $dirPath . '/base.json';
$existing = [];
if (file_exists($baseFile)) {
    $existingData = json_decode(file_get_contents($baseFile), true);
    $existing = $existingData['situations'] ?? [];
}

// Merge and save
$merged = array_merge($existing, $bluffFacts);
// Remove duplicates based on text
$uniqueFacts = [];
$seen = [];
foreach ($merged as $fact) {
    if (!isset($seen[$fact['text']])) {
        $seen[$fact['text']] = true;
        $uniqueFacts[] = $fact;
    }
}

$output = ['situations' => $uniqueFacts];
file_put_contents($baseFile, json_encode($output, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));

echo "Successfully parsed and saved " . count($bluffFacts) . " new facts from ChGK database. Total facts in base.json: " . count($uniqueFacts) . "\n";
?>