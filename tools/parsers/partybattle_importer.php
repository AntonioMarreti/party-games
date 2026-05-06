<?php

declare(strict_types=1);

// Import offline datasets into canonical Party Battle packs.
//
// Examples:
// php tools/parsers/partybattle_importer.php \
//   --source=data/import/jokes.txt \
//   --mode=joke \
//   --theme=base \
//   --format=lines
//
// php tools/parsers/partybattle_importer.php \
//   --manifest=tools/parsers/partybattle_import_manifest.example.json

const PB_REPO_ROOT = __DIR__ . '/../../';
const PB_IMPORT_ROOT = __DIR__ . '/../../server/games/packs/partybattle';

main($argv);

function main(array $argv): void
{
    $options = getopt('', [
        'manifest:',
        'source:',
        'mode:',
        'theme:',
        'format:',
        'profile::',
        'preview-limit::',
        'field::',
        'output::',
        'kind::',
        'dry-run',
    ]);

    $dryRun = array_key_exists('dry-run', $options);

    if (!empty($options['manifest'])) {
        runManifestImport((string) $options['manifest'], $dryRun);
        return;
    }

    $source = trim((string) ($options['source'] ?? ''));
    $mode = trim((string) ($options['mode'] ?? ''));
    $theme = trim((string) ($options['theme'] ?? 'base'));
    $format = trim((string) ($options['format'] ?? 'lines'));
    $profile = trim((string) ($options['profile'] ?? pb_defaultProfileForMode($mode)));
    $previewLimit = max(0, (int) ($options['preview-limit'] ?? 0));
    $field = trim((string) ($options['field'] ?? 'text'));
    $output = trim((string) ($options['output'] ?? pb_defaultOutputPath($mode, $theme)));
    $kind = trim((string) ($options['kind'] ?? pb_expectedPackKind($mode)));

    if ($source === '' || $mode === '') {
        fwrite(STDERR, "Usage: php tools/parsers/partybattle_importer.php --source=FILE --mode=MODE --theme=THEME --format=lines|jsonl|json_array|csv|hf_conversations_json [--field=text]\n");
        exit(1);
    }

    $summary = importSourceToPack([
        'source_path' => $source,
        'mode' => $mode,
        'theme' => $theme,
        'format' => $format,
        'profile' => $profile,
        'preview_limit' => $previewLimit,
        'field' => $field,
        'output' => $output,
        'kind' => $kind,
    ], $dryRun);

    echo json_encode($summary, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT) . PHP_EOL;
}

function runManifestImport(string $manifestPath, bool $dryRun): void
{
    $manifest = pb_readJson(pb_resolvePath($manifestPath));
    $imports = $manifest['imports'] ?? null;
    if (!is_array($imports)) {
        throw new RuntimeException("Invalid manifest: imports[] missing");
    }

    $results = [];
    foreach ($imports as $job) {
        if (!is_array($job)) {
            continue;
        }
        $results[] = importSourceToPack($job, $dryRun);
    }

    echo json_encode(['results' => $results], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT) . PHP_EOL;
}

function importSourceToPack(array $job, bool $dryRun): array
{
    $sourcePath = trim((string) ($job['source_path'] ?? ''));
    $mode = trim((string) ($job['mode'] ?? ''));
    $theme = trim((string) ($job['theme'] ?? 'base'));
    $format = trim((string) ($job['format'] ?? 'lines'));
    $profile = trim((string) ($job['profile'] ?? pb_defaultProfileForMode($mode)));
    $previewLimit = max(0, (int) ($job['preview_limit'] ?? 0));
    $field = trim((string) ($job['field'] ?? 'text'));
    $output = trim((string) ($job['output'] ?? pb_defaultOutputPath($mode, $theme)));
    $kind = trim((string) ($job['kind'] ?? pb_expectedPackKind($mode)));

    if ($sourcePath === '' || $mode === '' || $output === '') {
        throw new RuntimeException('Import job is missing source_path, mode, or output');
    }

    $sourcePath = pb_resolvePath($sourcePath);
    $output = pb_resolvePath($output);
    $existingPack = file_exists($output) ? pb_readJson($output) : [];
    $existingEntries = is_array($existingPack['entries'] ?? null) ? $existingPack['entries'] : [];
    $existingNormalized = pb_normalizeExistingEntries($existingEntries, $mode, $theme);
    $rawItemsCount = 0;
    $previewRows = [];

    if ($format === 'lines') {
        [$mergedEntries, $rawItemsCount, $previewRows] = pb_mergeLineSourceIntoEntries($sourcePath, $mode, $theme, $profile, $existingNormalized, $previewLimit);
    } else {
        $rawItems = pb_loadSourceItems($sourcePath, $format, $field);
        $rawItemsCount = count($rawItems);
        $importedEntries = [];
        foreach ($rawItems as $item) {
            $normalized = pb_normalizeImportedItem($mode, $theme, $item, false, $profile);
            if ($normalized !== null) {
                $importedEntries[] = $normalized;
                pb_collectPreviewCandidate($previewRows, $normalized, $profile, $previewLimit);
            }
        }
        $mergedEntries = pb_mergeEntries($mode, $existingNormalized, $importedEntries);
    }

    $pack = [
        'meta' => [
            'mode' => $mode,
            'theme' => $theme,
            'kind' => $kind,
        ],
        'entries' => array_values($mergedEntries),
    ];

    if (!$dryRun) {
        $dir = dirname($output);
        if (!is_dir($dir)) {
            mkdir($dir, 0777, true);
        }
        file_put_contents($output, json_encode($pack, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT) . PHP_EOL);
    }

    return [
        'source_path' => $sourcePath,
        'mode' => $mode,
        'theme' => $theme,
        'format' => $format,
        'profile' => $profile,
        'preview_limit' => $previewLimit,
        'output' => $output,
        'existing_entries' => count($existingNormalized),
        'raw_items' => $rawItemsCount,
        'final_entries' => count($mergedEntries),
        'added_entries' => max(0, count($mergedEntries) - count($existingNormalized)),
        'dry_run' => $dryRun,
        'preview' => pb_finalizePreviewRows($previewRows),
    ];
}

function pb_mergeLineSourceIntoEntries(string $sourcePath, string $mode, string $theme, string $profile, array $existingEntries, int $previewLimit = 0): array
{
    $merged = [];
    $seen = [];
    $previewRows = [];

    foreach ($existingEntries as $entry) {
        $key = pb_entryIdentity($mode, $entry);
        if ($key === '') {
            continue;
        }
        $seen[$key] = true;
        $merged[] = $entry;
    }

    $rawItemsCount = 0;
    $handle = fopen($sourcePath, 'rb');
    if ($handle === false) {
        throw new RuntimeException("Failed to open source file: {$sourcePath}");
    }

    while (($line = fgets($handle)) !== false) {
        $rawItemsCount++;
        $normalized = pb_normalizeImportedItem($mode, $theme, $line, false, $profile);
        if ($normalized === null) {
            continue;
        }
        $key = pb_entryIdentity($mode, $normalized);
        if ($key === '' || isset($seen[$key])) {
            continue;
        }
        $seen[$key] = true;
        $merged[] = $normalized;
        pb_collectPreviewCandidate($previewRows, $normalized, $profile, $previewLimit);
    }

    fclose($handle);
    return [$merged, $rawItemsCount, pb_finalizePreviewRows($previewRows)];
}

function pb_loadSourceItems(string $sourcePath, string $format, string $field): array
{
    if (!file_exists($sourcePath)) {
        throw new RuntimeException("Source file not found: {$sourcePath}");
    }

    switch ($format) {
        case 'lines':
            return pb_loadLines($sourcePath);
        case 'jsonl':
            return pb_loadJsonl($sourcePath, $field);
        case 'json_array':
            return pb_loadJsonArray($sourcePath, $field);
        case 'csv':
            return pb_loadCsv($sourcePath, $field);
        case 'hf_conversations_json':
            return pb_loadHfConversationsJson($sourcePath);
        default:
            throw new RuntimeException("Unsupported format: {$format}");
    }
}

function pb_loadLines(string $sourcePath): array
{
    $lines = @file($sourcePath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    return is_array($lines) ? array_values($lines) : [];
}

function pb_loadJsonl(string $sourcePath, string $field): array
{
    $items = [];
    foreach (pb_loadLines($sourcePath) as $line) {
        $row = json_decode((string) $line, true);
        if (is_array($row) && isset($row[$field])) {
            $items[] = $row[$field];
        }
    }
    return $items;
}

function pb_loadJsonArray(string $sourcePath, string $field): array
{
    $data = pb_readJson($sourcePath);
    if (isset($data['entries']) && is_array($data['entries'])) {
        $data = $data['entries'];
    }

    $items = [];
    foreach ($data as $row) {
        if (is_string($row)) {
            $items[] = $row;
            continue;
        }
        if (is_array($row) && isset($row[$field])) {
            $items[] = $row[$field];
        }
    }
    return $items;
}

function pb_loadCsv(string $sourcePath, string $field): array
{
    $handle = fopen($sourcePath, 'rb');
    if ($handle === false) {
        return [];
    }

    $header = fgetcsv($handle, 0, ',', '"', '\\');
    if (!is_array($header)) {
        fclose($handle);
        return [];
    }

    $index = array_search($field, $header, true);
    if ($index === false) {
        fclose($handle);
        throw new RuntimeException("CSV field not found: {$field}");
    }

    $items = [];
    while (($row = fgetcsv($handle, 0, ',', '"', '\\')) !== false) {
        if (isset($row[$index])) {
            $items[] = $row[$index];
        }
    }
    fclose($handle);
    return $items;
}

function pb_loadHfConversationsJson(string $sourcePath): array
{
    $data = pb_readJson($sourcePath);
    if (!is_array($data)) {
        return [];
    }

    $items = [];
    foreach ($data as $row) {
        if (!is_array($row)) {
            continue;
        }
        $conversations = $row['conversations'] ?? null;
        if (!is_array($conversations)) {
            continue;
        }
        foreach ($conversations as $message) {
            if (!is_array($message)) {
                continue;
            }
            if (($message['from'] ?? '') === 'gpt' && !empty($message['value'])) {
                $items[] = (string) $message['value'];
            }
        }
    }
    return $items;
}

function pb_normalizeExistingEntries(array $entries, string $mode, string $theme): array
{
    $normalized = [];
    foreach ($entries as $entry) {
        $candidate = pb_normalizeImportedItem($mode, $theme, $entry, true, pb_defaultProfileForMode($mode));
        if ($candidate !== null) {
            $normalized[] = $candidate;
        }
    }
    return $normalized;
}

function pb_normalizeImportedItem(string $mode, string $theme, $item, bool $trustExisting = false, ?string $profile = null): ?array
{
    $profile = $profile ?: pb_defaultProfileForMode($mode);

    if ($mode === 'caption') {
        $url = '';
        if (is_string($item)) {
            $url = trim($item);
        } elseif (is_array($item)) {
            $url = trim((string) ($item['media_url'] ?? ''));
        }
        if ($url === '') {
            return null;
        }
        return [
            'id' => trim((string) (($item['id'] ?? '') ?: pb_buildImportId($mode, $theme, $url))),
            'media_url' => $url,
            'tags' => pb_normalizeTags(is_array($item) ? ($item['tags'] ?? []) : []),
        ];
    }

    if ($mode === 'bluff') {
        if (!is_array($item)) {
            return null;
        }
        $text = pb_cleanText((string) ($item['text'] ?? ''));
        $truth = pb_cleanText((string) ($item['truth'] ?? ''));
        if ($text === '' || $truth === '') {
            return null;
        }
        if (!$trustExisting && (!pb_isMostlyRussian($text) || !pb_isMostlyRussian($truth))) {
            return null;
        }
        return [
            'id' => trim((string) (($item['id'] ?? '') ?: pb_buildImportId($mode, $theme, $text . '|' . $truth))),
            'text' => $text,
            'truth' => $truth,
            'tags' => pb_normalizeTags($item['tags'] ?? []),
        ];
    }

    $text = '';
    $tags = [];
    if (is_string($item)) {
        $text = $item;
    } elseif (is_array($item)) {
        $text = (string) ($item['text'] ?? '');
        $tags = $item['tags'] ?? [];
    }

    $text = pb_cleanText($text);
    if ($text === '') {
        return null;
    }
    if (!$trustExisting && !pb_passesTextFilters($mode, $text, $profile)) {
        return null;
    }

    return [
        'id' => trim((string) ((is_array($item) ? ($item['id'] ?? '') : '') ?: pb_buildImportId($mode, $theme, $text))),
        'text' => $text,
        'tags' => pb_normalizeTags($tags),
    ];
}

function pb_passesTextFilters(string $mode, string $text, string $profile): bool
{
    if (!pb_isMostlyRussian($text)) {
        return false;
    }
    if (pb_looksLikeNoise($text)) {
        return false;
    }
    if (pb_isToxicOrUnsupported($text)) {
        return false;
    }
    if (pb_isLikelyDialogue($text)) {
        return false;
    }
    if (pb_isLikelyFinishedAnecdote($text)) {
        return false;
    }
    if (pb_isWeakForProfile($text, $profile)) {
        return false;
    }

    $length = mb_strlen($text);
    $limits = pb_lengthLimits($mode, $profile);
    if ($length < $limits['min'] || $length > $limits['max']) {
        return false;
    }

    $score = pb_scoreTextForProfile($text, $profile);
    return $score >= pb_minScoreForProfile($profile);
}

function pb_lengthLimits(string $mode, string $profile): array
{
    switch ($profile) {
        case 'meme_prompt':
            return ['min' => 8, 'max' => 110];
        case 'advice_prompt':
            return ['min' => 20, 'max' => 180];
        case 'joke_setup':
            return ['min' => 20, 'max' => 160];
    }

    switch ($mode) {
        case 'meme':
            return ['min' => 8, 'max' => 140];
        case 'acronym':
            return ['min' => 2, 'max' => 24];
        case 'whoami':
            return ['min' => 8, 'max' => 160];
        case 'advice':
        case 'joke':
            return ['min' => 12, 'max' => 180];
        default:
            return ['min' => 8, 'max' => 180];
    }
}

function pb_defaultProfileForMode(string $mode): string
{
    switch ($mode) {
        case 'meme':
            return 'meme_prompt';
        case 'advice':
            return 'advice_prompt';
        case 'joke':
            return 'joke_setup';
        default:
            return 'generic_text';
    }
}

function pb_minScoreForProfile(string $profile): int
{
    switch ($profile) {
        case 'meme_prompt':
            return 4;
        case 'advice_prompt':
            return 4;
        case 'joke_setup':
            return 4;
        default:
            return 1;
    }
}

function pb_scoreTextForProfile(string $text, string $profile): int
{
    switch ($profile) {
        case 'meme_prompt':
            return pb_scoreMemePrompt($text);
        case 'advice_prompt':
            return pb_scoreAdvicePrompt($text);
        case 'joke_setup':
            return pb_scoreJokeSetup($text);
        default:
            return 1;
    }
}

function pb_collectPreviewCandidate(array &$previewRows, array $entry, string $profile, int $previewLimit): void
{
    if ($previewLimit <= 0) {
        return;
    }

    $text = '';
    if (isset($entry['text'])) {
        $text = (string) $entry['text'];
    } elseif (isset($entry['media_url'])) {
        $text = (string) $entry['media_url'];
    }
    if ($text === '') {
        return;
    }

    $previewRows[] = [
        'score' => pb_scoreTextForProfile($text, $profile),
        'text' => $text,
    ];

    usort($previewRows, function ($a, $b) {
        if ($a['score'] === $b['score']) {
            return strcmp($a['text'], $b['text']);
        }
        return $b['score'] <=> $a['score'];
    });

    if (count($previewRows) > $previewLimit) {
        $previewRows = array_slice($previewRows, 0, $previewLimit);
    }
}

function pb_finalizePreviewRows(array $previewRows): array
{
    return array_values(array_map(function ($row) {
        return [
            'score' => (int) ($row['score'] ?? 0),
            'text' => (string) ($row['text'] ?? ''),
        ];
    }, $previewRows));
}

function pb_scoreMemePrompt(string $text): int
{
    $score = 0;
    $lower = mb_strtolower($text);

    foreach (['когда', 'твое лицо', 'твоё лицо', 'утро', 'опять', 'снова', 'всегда', 'никогда'] as $needle) {
        if (mb_strpos($lower, $needle) !== false) {
            $score += 2;
            break;
        }
    }

    if (preg_match('/^(когда|твое лицо, когда|твоё лицо, когда|утро|вечер|понедельник|пятница)/ui', $text)) {
        $score += 2;
    }
    if (preg_match('/^(когда|твое лицо, когда|твоё лицо, когда)/ui', $text)) {
        $score += 2;
    }
    if (mb_strlen($text) <= 90) {
        $score += 1;
    }
    if (!preg_match('/[.!?]\s*$/u', $text)) {
        $score += 1;
    }
    if (preg_match('/["«»]/u', $text)) {
        $score -= 1;
    }

    return $score;
}

function pb_scoreAdvicePrompt(string $text): int
{
    $score = 0;
    $lower = mb_strtolower($text);

    foreach (['что делать', 'как объяснить', 'как выкрутиться', 'что сказать', 'как отказать', 'как отмазаться'] as $needle) {
        if (mb_strpos($lower, $needle) !== false) {
            $score += 3;
        }
    }
    foreach (['если', 'когда', 'случайно', 'забыл', 'опоздал', 'начальник', 'друг', 'девушка', 'парень', 'жена', 'муж'] as $needle) {
        if (mb_strpos($lower, $needle) !== false) {
            $score += 1;
            break;
        }
    }
    if (preg_match('/\?\s*$/u', $text)) {
        $score += 1;
    }

    return $score;
}

function pb_scoreJokeSetup(string $text): int
{
    $score = 0;
    $lower = mb_strtolower($text);

    if (preg_match('/\.\.\.\s*$/u', $text)) {
        $score += 3;
    }
    if (preg_match('/\?\s*$/u', $text)) {
        $score += 2;
    }
    if (preg_match('/^(если|что будет, если|что будет если|когда|а что если|а если)/ui', $text)) {
        $score += 2;
    }
    foreach (['если', 'что будет', 'когда', 'подошел', 'не пью', 'что у', 'мужик', 'девушка'] as $needle) {
        if (mb_strpos($lower, $needle) !== false) {
            $score += 1;
            break;
        }
    }
    if (!preg_match('/[.!]\s*$/u', $text)) {
        $score += 1;
    }

    return $score;
}

function pb_isMostlyRussian(string $text): bool
{
    $letters = preg_match_all('/\p{L}/u', $text);
    if (!$letters) {
        return false;
    }
    $cyr = preg_match_all('/[А-Яа-яЁё]/u', $text);
    return ($cyr / max(1, $letters)) >= 0.45;
}

function pb_looksLikeNoise(string $text): bool
{
    $clean = mb_strtolower($text);
    $blacklist = [
        'http://',
        'https://',
        'www.',
        '@gmail.com',
        'подпишись',
        'ставьте лайк',
        'telegram',
        'instagram',
        'tiktok',
        'vk.com',
        'youtube',
        'facebook',
    ];
    foreach ($blacklist as $needle) {
        if (mb_strpos($clean, $needle) !== false) {
            return true;
        }
    }
    return false;
}

function pb_isToxicOrUnsupported(string $text): bool
{
    $patterns = [
        '/\b(пид[ао]р|хуй|еба[тц]|ебан|муд[ао]к|черножоп|даун|инвалид\b|жид\b|дроч|кончил|жоп(а|у|е|ой)|проститут|секс\b|шлюх|ебуч)/ui',
        '/\b(скрипал|генпрокуратур|крым|путин|байден|зеленск|малахов|семенович|моисеев|шатунов|эрнст|абрамович)\b/ui',
        '/\b(штирлиц|вовочка|чукча|новый русский|абрам|рабинович)\b/ui',
    ];
    foreach ($patterns as $pattern) {
        if (preg_match($pattern, $text)) {
            return true;
        }
    }
    return false;
}

function pb_isLikelyDialogue(string $text): bool
{
    if (preg_match('/^\s*[-–—]\s*/u', $text)) {
        return true;
    }
    if (preg_match_all('/(?:^|\s)[-–—]\s+/u', $text) >= 2) {
        return true;
    }
    if (preg_match('/["«][^"»]{1,80}["»]\s*[-–—]\s*["«]/u', $text)) {
        return true;
    }
    if (preg_match('/:\s*["«]/u', $text)) {
        return true;
    }
    return false;
}

function pb_isLikelyFinishedAnecdote(string $text): bool
{
    if (preg_match('/:\s*-\s*/u', $text)) {
        return true;
    }
    if (preg_match('/\?[^?!.\n]{0,120}[-–—]\s*\p{L}/u', $text)) {
        return true;
    }
    if (preg_match('/\b(вопрос|ответ|мораль)\b/ui', $text)) {
        return true;
    }
    if (preg_match('/(?:^|\s)[-–—]\s*[^-–—\n]{1,120}[.!?]\s*$/u', $text) && preg_match('/\?/', $text)) {
        return true;
    }
    if (preg_match('/\b(мораль|вывод|оказывается)\b/ui', $text)) {
        return true;
    }
    return false;
}

function pb_isWeakForProfile(string $text, string $profile): bool
{
    $lower = mb_strtolower($text);

    if ($profile === 'meme_prompt') {
        if (preg_match('/[?]/u', $text)) {
            return true;
        }
        if (preg_match('/\b(штирлиц|вовочка|чукча|новый русский|абрам|рабинович)\b/ui', $text)) {
            return true;
        }
        if (preg_match('/^[a-zа-яё0-9 ,.-]{1,60}$/u', $text) && !preg_match('/^(когда|утро|вечер|понедельник|пятница)/ui', $text)) {
            return true;
        }
        if (preg_match('/\([^)]{0,30}\)/u', $text)) {
            return true;
        }
        if (!preg_match('/^(когда|твое лицо, когда|твоё лицо, когда|утро|вечер|понедельник|пятница|снова|опять)/ui', $text)) {
            return true;
        }
    }

    if ($profile === 'joke_setup') {
        if (preg_match('/^(утро|вечер|понедельник|пятница)\b/ui', $text)) {
            return true;
        }
        if (!preg_match('/(\.\.\.\s*$|\?\s*$|^(если|что будет, если|что будет если|когда|а что если|а если))/ui', $text)) {
            return true;
        }
        if (mb_strlen($text) < 28) {
            return true;
        }
        if (preg_match('/\b(германи(я|ю)|япони(я|ю)|советский союз|флаг)\b/ui', $text)) {
            return true;
        }
    }

    if ($profile === 'advice_prompt') {
        if (!preg_match('/\b(что делать|как объяснить|как выкрутиться|что сказать|как отказать|как отмазаться)\b/ui', $lower)) {
            return true;
        }
        if (preg_match('/:\s*-\s*/u', $text)) {
            return true;
        }
    }

    return false;
}

function pb_cleanText(string $text): string
{
    $text = str_replace(["\r\n", "\r"], "\n", trim($text));
    $text = preg_replace('/[ \t]+/u', ' ', $text);
    $text = preg_replace('/\n{3,}/u', "\n\n", $text);
    $text = trim((string) $text, "\"' \t\n\r\0\x0B");
    return trim((string) $text);
}

function pb_normalizeTags($tags): array
{
    if (!is_array($tags)) {
        return [];
    }
    $normalized = [];
    foreach ($tags as $tag) {
        $tag = trim((string) $tag);
        if ($tag !== '') {
            $normalized[] = $tag;
        }
    }
    return array_values(array_unique($normalized));
}

function pb_mergeEntries(string $mode, array $existingEntries, array $newEntries): array
{
    $seen = [];
    $merged = [];
    foreach (array_merge($existingEntries, $newEntries) as $entry) {
        $key = pb_entryIdentity($mode, $entry);
        if ($key === '' || isset($seen[$key])) {
            continue;
        }
        $seen[$key] = true;
        $merged[] = $entry;
    }
    return $merged;
}

function pb_entryIdentity(string $mode, array $entry): string
{
    if ($mode === 'caption') {
        return mb_strtolower(trim((string) ($entry['media_url'] ?? '')));
    }
    if ($mode === 'bluff') {
        return mb_strtolower(trim((string) ($entry['text'] ?? '')) . '|' . trim((string) ($entry['truth'] ?? '')));
    }
    return mb_strtolower(trim((string) ($entry['text'] ?? '')));
}

function pb_buildImportId(string $mode, string $theme, string $value): string
{
    return $mode . '_' . $theme . '_' . substr(sha1($mode . '|' . $theme . '|' . $value), 0, 16);
}

function pb_defaultOutputPath(string $mode, string $theme): string
{
    return 'server/games/packs/partybattle/' . $mode . '/' . $theme . '.json';
}

function pb_expectedPackKind(string $mode): string
{
    switch ($mode) {
        case 'caption':
            return 'image';
        case 'whoami':
            return 'player_question';
        case 'bluff':
            return 'fact';
        default:
            return 'text';
    }
}

function pb_readJson(string $path): array
{
    $content = @file_get_contents($path);
    if ($content === false) {
        throw new RuntimeException("Failed to read JSON: {$path}");
    }
    $data = json_decode($content, true);
    if (!is_array($data)) {
        throw new RuntimeException("Invalid JSON: {$path}");
    }
    return $data;
}

function pb_resolvePath(string $path): string
{
    $path = trim($path);
    if ($path === '') {
        return $path;
    }

    if (preg_match('#^(?:/|[A-Za-z]:[\\\\/])#', $path)) {
        return $path;
    }

    return rtrim(PB_REPO_ROOT, '/\\') . '/' . ltrim($path, '/\\');
}
