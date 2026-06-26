<?php

declare(strict_types=1);

require_once __DIR__ . '/../server/config.php';
require_once __DIR__ . '/../server/lib/wordclash_dictionary.php';

main($argv);

function main(array $argv): void
{
    global $pdo;

    try {
        if (PHP_SAPI !== 'cli') {
            fail('CLI only');
        }
        $command = $argv[1] ?? '';
        $word = $argv[2] ?? '';
        if (!in_array($command, ['check', 'add', 'remove', 'ban'], true) || count($argv) !== 3) {
            fail('Usage: php tools/manage_wordclash_targets.php check|add|remove|ban <слово>');
        }

        [$ok, $message, $normalized, $length] = wc_dict_validate_shape($word);
        if (!$ok) {
            fail((string) $message);
        }

        if ($command === 'check') {
            $status = wc_dict_status($pdo instanceof PDO ? $pdo : null, $normalized);
            printJson([
                'word' => $normalized,
                'length' => $length,
                'state' => $status['state'] ?? 'unknown',
                'source' => $status['source'] ?? null,
                'in_target' => ($status['state'] ?? null) === 'active',
                'in_blacklist' => !empty($status['in_static_blacklist']),
                'in_broad_guess' => !empty($status['in_broad_guess']),
                'db_seed_complete' => !empty($status['db_seed_complete']),
            ]);
            return;
        }

        if (!$pdo instanceof PDO) {
            fail('Database connection is not available');
        }

        if (!wc_dict_seed_complete($pdo)) {
            fail('Wordclash dictionary DB seed is not complete. Run migration 015 first.');
        }

        if ($command === 'add') {
            printJson(['status' => 'ok', 'action' => 'add', 'result' => wc_dict_add_word($pdo, $normalized, null, 'admin', 'cli')]);
            return;
        }

        if ($command === 'remove') {
            printJson(['status' => 'ok', 'action' => 'remove', 'result' => wc_dict_remove_word($pdo, $normalized, null)]);
            return;
        }

        if ($command === 'ban') {
            printJson(['status' => 'ok', 'action' => 'ban', 'result' => wc_dict_ban_word($pdo, $normalized, null)]);
            return;
        }
    } catch (Throwable $e) {
        fwrite(STDERR, $e->getMessage() . PHP_EOL);
        exit(1);
    }
}

function printJson(array $payload): void
{
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT) . PHP_EOL;
}

function fail(string $message): never
{
    throw new RuntimeException($message);
}
