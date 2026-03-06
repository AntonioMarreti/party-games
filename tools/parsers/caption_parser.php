<?php
// Simple script to generate some weird/awkward GIF URLs for the Caption mode
// We will use standard Tenor GIFs similar to Meme mode

$searchTerms = ['awkward', 'weird', 'funny reaction', 'what', 'shock', 'cat meme'];
$urls = [];

// Instead of hitting a live API since we don't have a key here, 
// let's bootstrap with a curated list of reliable direct media links
$bootstrapGifs = [
    // Вставьте прямые ссылки на новые GIF сюда ("https://...", "https://...")

];

$dirPath = __DIR__ . '/../../server/games/packs/partybattle/caption';
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
    file_put_contents($file, json_encode($output, JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT));
    return count($merged) - count($existing);
}

$addedBase = appendUnique($dirPath . '/base.json', $bootstrapGifs);
echo "Successfully appended " . $addedBase . " NEW caption GIFs into caption/base.json\n";
?>