<?php
// Massive list of Acronyms for the Acronym mode
$acronyms = [
    // Добавьте новые аббревиатуры сюда, чтобы скрипт дописал их в базу

];

$dirPath = __DIR__ . '/../../server/games/packs/partybattle/acronym';
if (!is_dir($dirPath)) {
    mkdir($dirPath, 0777, true);
}

// Function to safely merge and unique arrays
function appendUnique($file, $newItems)
{
    $existing = [];
    if (file_exists($file)) {
        $existingData = json_decode(file_get_contents($file), true);
        if (isset($existingData['situations']) && is_array($existingData['situations'])) {
            $existing = $existingData['situations'];
        }
    }

    $merged = array_unique(array_merge($existing, $newItems));

    $output = ['situations' => array_values($merged)];
    file_put_contents($file, json_encode($output, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
    return count($merged) - count($existing);
}

$addedBase = appendUnique($dirPath . '/base.json', $acronyms);
echo "Successfully appended " . $addedBase . " NEW acronyms into acronym/base.json\n";

// Generate 18+ acronyms
$acronyms18 = [
    // Добавьте новые аббревиатуры 18+ сюда

];

$added18 = appendUnique($dirPath . '/18plus.json', $acronyms18);
echo "Successfully appended " . $added18 . " NEW acronyms into acronym/18plus.json\n";
?>