<?php
// Simple script to generate Base and 18+ Advice situations
$adviceBase = [
    // Добавьте новые фразы сюда, чтобы скрипт дописал их в базу

];

$advice18 = [
    // Добавьте новые фразы 18+ сюда

];

$dirPath = __DIR__ . '/../../server/games/packs/partybattle/advice';
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

// base
$addedBase = appendUnique($dirPath . '/base.json', $adviceBase);
echo "Successfully appended " . $addedBase . " NEW advices into advice/base.json\n";

// 18+
$added18 = appendUnique($dirPath . '/18plus.json', $advice18);
echo "Successfully appended " . $added18 . " NEW 18+ advices into advice/18plus.json\n";
?>