<?php

declare(strict_types=1);

const PB_BLUFF_PACKS_DIR = __DIR__ . '/../../server/games/packs/partybattle/bluff';
const PB_IMPORT_DIR = __DIR__ . '/../../data/import';

main();

function main(): void
{
    if (!is_dir(PB_BLUFF_PACKS_DIR)) {
        fwrite(STDERR, "Bluff packs directory not found\n");
        exit(1);
    }

    if (!is_dir(PB_IMPORT_DIR)) {
        mkdir(PB_IMPORT_DIR, 0777, true);
    }

    $files = glob(PB_BLUFF_PACKS_DIR . '/*.json') ?: [];
    sort($files);

    $results = [];
    foreach ($files as $file) {
        $pack = json_decode((string) file_get_contents($file), true);
        if (!is_array($pack)) {
            continue;
        }

        $meta = is_array($pack['meta'] ?? null) ? $pack['meta'] : [];
        $entries = is_array($pack['entries'] ?? null) ? $pack['entries'] : [];
        $theme = trim((string) ($meta['theme'] ?? pathinfo($file, PATHINFO_FILENAME)));
        if ($theme === '') {
            continue;
        }

        $normalized = [];
        foreach ($entries as $entry) {
            if (!is_array($entry)) {
                continue;
            }
            $text = trim((string) ($entry['text'] ?? ''));
            $truth = trim((string) ($entry['truth'] ?? ''));
            if ($text === '' || $truth === '') {
                continue;
            }

            $row = [
                'text' => $text,
                'truth' => $truth,
            ];

            $tags = array_values(array_filter(array_map('strval', $entry['tags'] ?? [])));
            if ($tags !== []) {
                $row['tags'] = $tags;
            }

            $normalized[] = $row;
        }

        $suffix = str_ends_with($theme, '_facts') ? $theme : ($theme . '_facts');
        $target = PB_IMPORT_DIR . '/bluff_' . $suffix . '.json';
        file_put_contents(
            $target,
            json_encode($normalized, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT) . PHP_EOL
        );

        $results[] = [
            'theme' => $theme,
            'entries' => count($normalized),
            'output' => relativePath($target),
        ];
    }

    echo json_encode(['results' => $results], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT) . PHP_EOL;
}

function relativePath(string $path): string
{
    $root = realpath(__DIR__ . '/../../');
    $real = realpath($path);
    if ($root !== false && $real !== false && str_starts_with($real, $root . DIRECTORY_SEPARATOR)) {
        return substr($real, strlen($root) + 1);
    }

    return $path;
}
