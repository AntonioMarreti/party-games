<?php

declare(strict_types=1);

require_once __DIR__ . '/../server/games/partybattle.php';

main();

function main(): void
{
    $root = realpath(__DIR__ . '/../server/games/packs/partybattle');
    if ($root === false) {
        fwrite(STDERR, "Party Battle packs directory not found\n");
        exit(1);
    }

    $registry = pb_getPartyBattlePackRegistry();
    $registeredPaths = [];
    $activeByMode = [];

    foreach ($registry as $mode => $themes) {
        foreach ($themes as $theme => $paths) {
            foreach ((array) $paths as $path) {
                $real = realpath($path);
                if ($real === false) {
                    continue;
                }
                $registeredPaths[$real] = [
                    'mode' => (string) $mode,
                    'theme' => (string) $theme,
                ];
                $activeByMode[$mode][] = $theme;
            }
        }
    }

    $files = glob($root . '/*/*.json') ?: [];
    sort($files);

    $packs = [];
    $summaryByMode = [];
    $unregistered = [];
    $missingRegistered = [];

    foreach ($registry as $mode => $themes) {
        $summaryByMode[$mode] = [
            'recommended_pool_size' => pb_getRecommendedThemePoolSize((string) $mode),
            'registered_themes' => array_values(array_unique(array_map('strval', array_keys($themes)))),
            'active_pack_count' => 0,
            'total_entries_in_active_packs' => 0,
        ];

        foreach ($themes as $theme => $paths) {
            foreach ((array) $paths as $path) {
                $real = realpath($path);
                if ($real === false) {
                    $missingRegistered[] = [
                        'mode' => (string) $mode,
                        'theme' => (string) $theme,
                        'path' => $path,
                    ];
                }
            }
        }
    }

    foreach ($files as $file) {
        $real = realpath($file);
        if ($real === false) {
            continue;
        }

        $pack = pb_readJsonFile($real);
        $meta = is_array($pack['meta'] ?? null) ? $pack['meta'] : [];
        $entries = is_array($pack['entries'] ?? null) ? $pack['entries'] : [];
        $mode = (string) ($meta['mode'] ?? basename(dirname($real)));
        $theme = (string) ($meta['theme'] ?? pathinfo($real, PATHINFO_FILENAME));
        $kind = (string) ($meta['kind'] ?? '');
        $isRegistered = isset($registeredPaths[$real]);
        $entryCount = count($entries);
        $recommended = pb_getRecommendedThemePoolSize($mode);

        $duplicateIds = [];
        $seenIds = [];
        foreach ($entries as $entry) {
            if (!is_array($entry)) {
                continue;
            }
            $id = trim((string) ($entry['id'] ?? ''));
            if ($id === '') {
                continue;
            }
            if (isset($seenIds[$id])) {
                $duplicateIds[$id] = true;
            }
            $seenIds[$id] = true;
        }

        $packRow = [
            'mode' => $mode,
            'theme' => $theme,
            'kind' => $kind,
            'path' => relativePath($real),
            'entries' => $entryCount,
            'registered' => $isRegistered,
            'recommended_pool_size' => $recommended,
            'below_recommended_raw_size' => $entryCount < $recommended,
            'duplicate_ids' => array_values(array_keys($duplicateIds)),
        ];

        $packs[] = $packRow;

        if ($isRegistered) {
            $summaryByMode[$mode]['active_pack_count']++;
            $summaryByMode[$mode]['total_entries_in_active_packs'] += $entryCount;
        } else {
            $unregistered[] = $packRow;
        }
    }

    $out = [
        'summary_by_mode' => $summaryByMode,
        'missing_registered_files' => $missingRegistered,
        'unregistered_packs_on_disk' => $unregistered,
        'packs' => $packs,
    ];

    echo json_encode($out, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT) . PHP_EOL;
}

function relativePath(string $path): string
{
    $root = realpath(__DIR__ . '/..');
    if ($root !== false && str_starts_with($path, $root . DIRECTORY_SEPARATOR)) {
        return substr($path, strlen($root) + 1);
    }

    return $path;
}
