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
const PB_FILTER_STATS_LIMIT = 20;

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
        'max-entries::',
        'rebuild',
        'dry-run',
    ]);

    $dryRun = array_key_exists('dry-run', $options);
    $rebuild = array_key_exists('rebuild', $options);

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
    $maxEntries = max(0, (int) ($options['max-entries'] ?? 0));

    if ($source === '' || $mode === '') {
        fwrite(STDERR, "Usage: php tools/parsers/partybattle_importer.php --source=FILE --mode=MODE --theme=THEME --format=lines|jsonl|json_array|csv|parquet|hf_conversations_json [--field=text]\n");
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
        'max_entries' => $maxEntries,
        'rebuild' => $rebuild,
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
    $maxEntries = max(0, (int) ($job['max_entries'] ?? 0));
    $rebuild = !empty($job['rebuild']);

    if ($sourcePath === '' || $mode === '' || $output === '') {
        throw new RuntimeException('Import job is missing source_path, mode, or output');
    }

    $sourcePath = pb_resolvePath($sourcePath);
    $output = pb_resolvePath($output);
    pb_resetFilterStats();
    $existingPack = file_exists($output) ? pb_readJson($output) : [];
    $existingEntries = is_array($existingPack['entries'] ?? null) ? $existingPack['entries'] : [];
    $existingNormalized = $rebuild ? [] : pb_normalizeExistingEntries($existingEntries, $mode, $theme);
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

    $mergedEntries = pb_applyDiversityFilter($mergedEntries, $profile, $maxEntries);

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
        'rebuild' => $rebuild,
        'max_entries' => $maxEntries,
        'existing_entries' => count($existingNormalized),
        'raw_items' => $rawItemsCount,
        'final_entries' => count($mergedEntries),
        'added_entries' => max(0, count($mergedEntries) - count($existingNormalized)),
        'dry_run' => $dryRun,
        'filter_stats' => pb_getFilterStats(),
        'preview' => pb_finalizePreviewRows($previewRows, $profile, $previewLimit),
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
    return [$merged, $rawItemsCount, $previewRows];
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
        case 'parquet':
            return pb_loadParquet($sourcePath, $field);
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

function pb_loadParquet(string $sourcePath, string $field): array
{
    $python = pb_resolvePythonForParquet();
    $script = <<<'PY'
import json
import sys
import pyarrow.parquet as pq

path = sys.argv[1]
field = sys.argv[2]
table = pq.read_table(path, columns=[field])
column = table.column(field)

for value in column.to_pylist():
    if value is None:
        continue
    sys.stdout.write(json.dumps(value, ensure_ascii=False) + "\n")
PY;

    $command = escapeshellarg($python)
        . ' -c '
        . escapeshellarg($script)
        . ' '
        . escapeshellarg($sourcePath)
        . ' '
        . escapeshellarg($field);

    $descriptorSpec = [
        0 => ['pipe', 'r'],
        1 => ['pipe', 'w'],
        2 => ['pipe', 'w'],
    ];

    $process = proc_open($command, $descriptorSpec, $pipes, PB_REPO_ROOT);
    if (!is_resource($process)) {
        throw new RuntimeException('Failed to start parquet reader process');
    }

    fclose($pipes[0]);
    $items = [];
    while (($line = fgets($pipes[1])) !== false) {
        $value = json_decode(trim($line), true);
        if ($value !== null && $value !== '') {
            $items[] = $value;
        }
    }

    $stderr = stream_get_contents($pipes[2]);
    fclose($pipes[1]);
    fclose($pipes[2]);
    $exitCode = proc_close($process);

    if ($exitCode !== 0) {
        throw new RuntimeException("Parquet reader failed: " . trim((string) $stderr));
    }

    return $items;
}

function pb_resolvePythonForParquet(): string
{
    $venvPython = PB_REPO_ROOT . '.venv/bin/python';
    if (file_exists($venvPython)) {
        return $venvPython;
    }
    return 'python3';
}

function pb_resetFilterStats(): void
{
    $GLOBALS['pb_filter_stats'] = [];
}

function pb_noteFilterReason(string $reason): void
{
    if (!isset($GLOBALS['pb_filter_stats']) || !is_array($GLOBALS['pb_filter_stats'])) {
        $GLOBALS['pb_filter_stats'] = [];
    }
    if (!isset($GLOBALS['pb_filter_stats'][$reason])) {
        $GLOBALS['pb_filter_stats'][$reason] = 0;
    }
    $GLOBALS['pb_filter_stats'][$reason]++;
}

function pb_getFilterStats(): array
{
    $stats = $GLOBALS['pb_filter_stats'] ?? [];
    if (!is_array($stats)) {
        return [];
    }
    arsort($stats);
    return array_slice($stats, 0, PB_FILTER_STATS_LIMIT, true);
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
    if (!$trustExisting) {
        $filterReason = pb_filterTextReason($mode, $text, $profile);
        if ($filterReason !== null) {
            pb_noteFilterReason($filterReason);
            return null;
        }
    }

    return [
        'id' => trim((string) ((is_array($item) ? ($item['id'] ?? '') : '') ?: pb_buildImportId($mode, $theme, $text))),
        'text' => $text,
        'tags' => pb_normalizeTags($tags),
    ];
}

function pb_passesTextFilters(string $mode, string $text, string $profile): bool
{
    return pb_filterTextReason($mode, $text, $profile) === null;
}

function pb_filterTextReason(string $mode, string $text, string $profile): ?string
{
    if (!pb_isMostlyRussian($text)) {
        return 'stage1_language';
    }
    if (pb_looksLikeNoise($text)) {
        return 'stage1_noise';
    }
    if (pb_isToxicOrUnsupported($text)) {
        return 'stage1_toxic_or_unsupported';
    }
    if (pb_isLikelyDialogue($text)) {
        return 'stage1_dialogue';
    }
    if (pb_isLikelyFinishedAnecdote($text)) {
        return 'stage1_finished_anecdote';
    }
    if (pb_isWeakForProfile($text, $profile)) {
        return 'stage2_profile_mismatch';
    }

    $length = mb_strlen($text);
    $limits = pb_lengthLimits($mode, $profile);
    if ($length < $limits['min'] || $length > $limits['max']) {
        return 'stage3_length';
    }

    $score = pb_scoreTextForProfile($text, $profile);
    if ($score < pb_minScoreForProfile($profile)) {
        return 'stage4_score';
    }

    return null;
}

function pb_lengthLimits(string $mode, string $profile): array
{
    switch ($profile) {
        case 'meme_prompt':
            return ['min' => 8, 'max' => 110];
        case 'advice_prompt':
        case 'advice_question':
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
        case 'advice_question':
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
        case 'advice_question':
            return pb_scoreAdviceQuestion($text);
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
        'bucket' => pb_diversityBucketForProfile($text, $profile),
    ];
}

function pb_finalizePreviewRows(array $previewRows, ?string $profile = null, ?int $previewLimit = null): array
{
    if ($previewLimit !== null && $previewLimit > 0) {
        $previewRows = pb_trimPreviewRows($previewRows, $profile ?? '', $previewLimit);
    }

    return array_values(array_map(function ($row) {
        return [
            'score' => (int) ($row['score'] ?? 0),
            'text' => (string) ($row['text'] ?? ''),
        ];
    }, $previewRows));
}

function pb_trimPreviewRows(array $previewRows, string $profile, int $previewLimit): array
{
    usort($previewRows, function ($a, $b) {
        if (($a['score'] ?? 0) === ($b['score'] ?? 0)) {
            return strcmp((string) ($a['text'] ?? ''), (string) ($b['text'] ?? ''));
        }
        return (($b['score'] ?? 0) <=> ($a['score'] ?? 0));
    });

    if ($profile !== 'advice_question') {
        return array_slice($previewRows, 0, $previewLimit);
    }

    $bucketQueues = [];
    $bucketOrder = [];
    foreach ($previewRows as $row) {
        $bucket = (string) ($row['bucket'] ?? '__default');
        if (!isset($bucketQueues[$bucket])) {
            $bucketQueues[$bucket] = [];
            $bucketOrder[] = $bucket;
        }
        $bucketQueues[$bucket][] = $row;
    }

    usort($bucketOrder, function ($a, $b) use ($bucketQueues) {
        return count($bucketQueues[$b]) <=> count($bucketQueues[$a]);
    });

    $result = [];
    while (count($result) < $previewLimit) {
        $progress = false;
        foreach ($bucketOrder as $bucket) {
            if (!empty($bucketQueues[$bucket])) {
                $result[] = array_shift($bucketQueues[$bucket]);
                $progress = true;
                if (count($result) >= $previewLimit) {
                    break 2;
                }
            }
        }
        if (!$progress) {
            break;
        }
    }

    return $result;
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

function pb_scoreAdviceQuestion(string $text): int
{
    $score = 0;
    $lower = mb_strtolower($text);

    foreach ([
        'что делать',
        'как объяснить',
        'как выкрутиться',
        'что сказать',
        'как отказать',
        'как отмазаться',
        'как намекнуть',
        'как вести себя',
        'как пережить',
        'как выбраться',
        'как скрыть',
        'как не спалиться',
    ] as $needle) {
        if (mb_strpos($lower, $needle) !== false) {
            $score += 3;
            break;
        }
    }

    foreach (['если', 'случайно', 'опоздал', 'забыл', 'сказал', 'соврал', 'начальник', 'друг', 'мама', 'папа', 'кот', 'девушка', 'парень'] as $needle) {
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
        if (!pb_hasAdviceLead($text)) {
            return true;
        }
        if (preg_match('/:\s*-\s*/u', $text)) {
            return true;
        }
        if (preg_match('/(журнал|рубрика|полезные советы|антивирусная программа|девочки, подскажите|вы же психолог|что сказать женщине)/ui', $lower)) {
            return true;
        }
        if (preg_match('/(это всегда работает|гордитьс[яь]|послать другу|ну что тут скажешь)/ui', $lower)) {
            return true;
        }
        if (preg_match('/(словар[ья]|смайлик в вк|знакомая мышь|костюме медсестры|семейное положение написано|личная жизнь, если ты и с обычной|средневековья прошли|находящееся под угрозой исчезновения|что делать если работа это не твое|что делать если работа это не твоё)/ui', $lower)) {
            return true;
        }
        if (preg_match('/(?:^|\s)[0-9]+\)\s/u', $text)) {
            return true;
        }
        if (preg_match('/^[A-ZА-ЯЁ0-9 ,:!?()-]{20,}$/u', $text)) {
            return true;
        }
        if (preg_match('/\b(посоветуйте|подскажите)\b/ui', $lower) && !preg_match('/\?\s*$/u', $text)) {
            return true;
        }
    }

    if ($profile === 'advice_question') {
        if (!pb_hasAdviceQuestionLead($text)) {
            return true;
        }
        if (!preg_match('/\?\s*$/u', $text)) {
            return true;
        }
        if (preg_match('/\.{2,}|\?\?+|!\?|\?[^[:alnum:]]*$/u', $text) && !preg_match('/\?\s*$/u', $text)) {
            return true;
        }
        if (preg_match('/:\s*-\s*/u', $text)) {
            return true;
        }
        if (preg_match('/\b(кто такой|что такое|где находится|когда родился|сколько стоит|сколько лет|какая столица|почему небо|как переводится)\b/ui', $lower)) {
            return true;
        }
        if (preg_match('/\b(реферат|доклад|контрольн|домашн|экзамен|егэ|википед|формул|теорем|уравнен|перевод слова)\b/ui', $lower)) {
            return true;
        }
        if (preg_match('/\b(уголовн|суде|потерпевш|заложник\w*|террорист\w*|теракт|убийств|изнасил|параной\w*|умерл\w*|умер\b|смерт\w*|похорон|гибел\w*|рак\b|туберкул|болезн|инсульт|инфаркт|гопник\w*|давк\w*|фальшив\w+\s+купюр\w*|агрессивн\w+\s+толп\w*|драк\w+\s+в\s+метро|провалил\w+\s+на\s+лед|лед[, ]*если\s+провалил|выбратьс\w*\s+на\s+лед|тон[еу]шь|утонул|пмс\b|вирт\w*|угрожа\w+\s+и\s+оскорбля\w+|сахарн\w+\s+диабет\w*|инсулин\w*|врач\w*|клещ\w*|уха\b|онемел\w*|онемела\b|иммунитет\w*|простуд\w*|беремен\w*|менструац\w*|желудок\b|зуб\w*|кров\w*|ушиб\w*|травм\w*|импотент\w*|эрекци\w*|суставн\w+\s+жидк\w*|лечени\w*|психологическ\w+\s+(?:травм\w*|здоров\w*)|позвоночник\w*|коленк\w*|оса\b|медвед\w*|ребенок\s+ходит\s+на\s+носочк\w*|оппозици\w*|путин\w*|граб\w*|полици\w*|паспорт\w*|ядерн\w+\s+войн\w*|умира\w*|умирать|не\s+хочется\s+да\s+и\s+страшно|никому\s+не\s+нужн\w*)\b/ui', $lower)) {
            return true;
        }
        if (preg_match('/\b(евро\s*20\d{2}|фан-зон\w*|одноклассник\w*|вконтакт\w*|в\s+контакте|windows\s+live\s+mail|дом-2|шурик\w*|д\.\s*мороз\w*)\b/ui', $lower)) {
            return true;
        }
        if (preg_match('/\b(томно\s+погля|не\s+дву\.{2,}|не\s+дву\W*$)\b/ui', $lower)) {
            return true;
        }
        if (preg_match('/(если\s+он\s+клад|что\s+делать\s+будете\s+если|за\s+правду\s+в\s+психушк|в\s+кармане\s+500\s+руб|как\s+скрыть\s+большой\s+нос|подобрать\s+макияж|бров[а-яё]*|злых\s+птичек|стер\s+брови|чихнул\s+в\s+маршрутк|маршрутк\w+.*пуговиц\w+|банкомат\w*|не\s+выдал\s+деньги|зачислил\w*\s+на\s+счет|не\s+выдал\s+чек|адрес\s+e-?mail|программы\s+через\s+пуск|компьютер\s+не\s+видит|внешний\s+жестк\w+\s+диск|вышел\s+из\s+строя\s+кулер|наличие\s+у\s+человека\s+совести|с\s+точки\s+зрения\s+эволюции|новые\s+туфли\s+растянулись|крупах\s+завелась\s+моль|переплатил|активный\s+запах|чтобы\s+не\s+жить\s+обыденно|когда\s+закончится\s+лето|воруют\s+дрова|подарили\s+деньги\s+на\s+др\s+на\s+работе|маринованными\s+грибами|слишком\s+много\s+уксуса|гладиолус\w*|гранатов\w+\s+дерев\w*|барбарис\w*|черепк\w*|народн\w+\s+рецепт\w*|учебник\w*|школах\s+россии|учитель\s+занижа\w+\s+оценк\w*|учител\w+\s+сильно\s+пахнет\s+алкоголем|английского\s+языка|значение\s+слова\s+аккаунт|табеле\s+рабочим|страхован\w+\s+квартир\w*|полисе\s+на\s+страхован|клиенту\s+в\s+скидк\w*|зачем\s+ему\s+яички|простую\s+истину|крестного\s+отца|тесто\s+в\s+холодильнике|супер\s+героями|опавшими\s+яблоками|джигурд\w*|кроме\s+себя\s+полюбить\s+некого|ругается\s+матом|бывш\w+\s+супруг\w+\s+не\s+дает\s+видеться\s+с\s+ребенк\w*|родители\s+делят\s+детей|не\s+хочешь\s+выводить\s+собаку|от\s+человека\s+исходит\s+негатив|полиняли\s+цветные\s+вещи|разбитом\s+состоянии|склонн\w+\s+к\s+истерик\w*|поющ\w+\s+под\s+фонограмм\w*|коллеге\s+объявили\s+бойкот|бойкотировать|очередь\s+в\s+детский\s+сад|не\s+кушает\s+в\s+садик\w*|нечаянно\s+пожелал\s+зла|ребенок\s+от\s+первого\s+брака|выглядеть\s+умным\s+в\s+глазах\s+женщин\w*|полет\s+в\s+самолете|пол[её]т\s+в\s+самол[её]те|капуста\s+трескается|при\s+дальней\s+поездке\s+за\s+рулем|кушать\s+хочется,\s+а\s+на\s+часах\s+давно\s+за\s+18:00|в\s+интернете\??|больничн\w*|майнкрафт\w*|minecraft|игра\s+minecraft|взятк\w*)\b/ui', $lower)) {
            return true;
        }
    }

    return false;
}

function pb_hasAdviceLead(string $text): bool
{
    return (bool) preg_match(
        '/^\s*(что делать(?:, если|\s+если)?|как объяснить|как выкрутиться|что сказать|как отказать|как отмазаться|как намекнуть|как сказать|как вести себя|как элегантно выйти|по поводу\b|зачем тебе\b)/ui',
        $text
    );
}

function pb_hasAdviceQuestionLead(string $text): bool
{
    return (bool) preg_match(
        '/^\s*(что делать(?:, если|\s+если)?|как объяснить|как выкрутиться|что сказать|как отказать|как отмазаться|как намекнуть|как сказать|как вести себя|как элегантно выйти|как пережить|как выбраться|как скрыть|как перестать|как реагировать|как признаться|как не спалиться|почему\s+я\b|зачем\s+я\b)/ui',
        $text
    );
}

function pb_cleanText(string $text): string
{
    $text = str_replace(["\r\n", "\r"], "\n", trim($text));
    $text = preg_replace('/[ \t]+/u', ' ', $text);
    $text = preg_replace('/\s+([,.!?:;])/u', '$1', $text);
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

function pb_applyDiversityFilter(array $entries, string $profile, int $maxEntries = 0): array
{
    $caps = pb_diversityCapsForProfile($profile);
    if ($caps === [] && $maxEntries <= 0) {
        return $entries;
    }

    $bucketCounts = [];
    $filtered = [];

    foreach ($entries as $entry) {
        $text = (string) ($entry['text'] ?? '');
        if ($text === '') {
            $filtered[] = $entry;
            continue;
        }

        $bucket = pb_diversityBucketForProfile($text, $profile);
        $cap = $caps[$bucket] ?? ($caps['__default'] ?? null);
        if ($cap !== null) {
            $current = $bucketCounts[$bucket] ?? 0;
            if ($current >= $cap) {
                pb_noteFilterReason('stage5_diversity');
                continue;
            }
            $bucketCounts[$bucket] = $current + 1;
        }

        $filtered[] = $entry;
    }

    if ($maxEntries > 0 && count($filtered) > $maxEntries) {
        $overflow = count($filtered) - $maxEntries;
        for ($i = 0; $i < $overflow; $i++) {
            pb_noteFilterReason('stage6_max_entries');
        }
        $filtered = array_slice($filtered, 0, $maxEntries);
    }

    return $filtered;
}

function pb_diversityCapsForProfile(string $profile): array
{
    if ($profile === 'advice_question') {
        return [
            'как вести себя' => 80,
            'что делать' => 220,
            'как объяснить' => 180,
            'как сказать' => 120,
            'как намекнуть' => 80,
            'как скрыть' => 80,
            'как пережить' => 80,
            'как выбраться' => 40,
            '__default' => 260,
        ];
    }

    return [];
}

function pb_diversityBucketForProfile(string $text, string $profile): string
{
    $lower = mb_strtolower(trim($text));

    if ($profile === 'advice_question') {
        foreach ([
            'как вести себя',
            'что делать',
            'как объяснить',
            'как сказать',
            'как намекнуть',
            'как скрыть',
            'как пережить',
            'как выбраться',
        ] as $prefix) {
            if (str_starts_with($lower, $prefix)) {
                return $prefix;
            }
        }
    }

    return '__default';
}

function pb_entryIdentity(string $mode, array $entry): string
{
    if ($mode === 'caption') {
        return mb_strtolower(trim((string) ($entry['media_url'] ?? '')));
    }
    if ($mode === 'bluff') {
        return pb_normalizeIdentityText((string) ($entry['text'] ?? '')) . '|' . pb_normalizeIdentityText((string) ($entry['truth'] ?? ''));
    }
    return pb_normalizeIdentityText((string) ($entry['text'] ?? ''));
}

function pb_normalizeIdentityText(string $text): string
{
    $text = mb_strtolower(trim($text));
    $text = str_replace('ё', 'е', $text);
    $text = preg_replace('/[^\p{L}\p{N}]+/u', ' ', $text);
    $text = preg_replace('/\s+/u', ' ', (string) $text);
    return trim((string) $text);
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
