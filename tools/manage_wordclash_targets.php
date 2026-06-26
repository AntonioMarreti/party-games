<?php

declare(strict_types=1);

const WCT_LENGTHS = [5, 6, 7];

main($argv);

function main(array $argv): void
{
    try {
        if (PHP_SAPI !== 'cli') {
            fail('CLI only');
        }

        $command = $argv[1] ?? '';
        $wordRaw = $argv[2] ?? '';
        if (!in_array($command, ['check', 'add', 'remove', 'ban'], true) || count($argv) !== 3) {
            fail('Usage: php tools/manage_wordclash_targets.php check|add|remove|ban <слово>');
        }

        $word = normalizeWord($wordRaw);
        $length = validateManagedWord($word);
        $paths = buildManagedPaths();
        $targets = readWordList($paths['targets'][$length], $length);
        $blacklist = readWordList($paths['blacklist'], null);

        $targetSet = array_fill_keys($targets, true);
        $blacklistSet = array_fill_keys($blacklist, true);

        if ($command === 'check') {
            printJson([
                'word' => $word,
                'length' => $length,
                'in_target' => isset($targetSet[$word]),
                'in_blacklist' => isset($blacklistSet[$word]),
            ]);
            return;
        }

        if ($command === 'add') {
            if (isset($blacklistSet[$word])) {
                fail('Cannot add: word is in blacklist');
            }
            if (isset($targetSet[$word])) {
                fail('Cannot add: word already exists in target dictionary');
            }
            $targets[] = $word;
            writeWordList($paths['targets'][$length], $targets);
            printJson(['status' => 'ok', 'action' => 'add', 'word' => $word, 'length' => $length]);
            return;
        }

        if ($command === 'remove') {
            if (!isset($targetSet[$word])) {
                fail('Cannot remove: word is not in target dictionary');
            }
            $targets = array_values(array_filter($targets, static fn(string $item): bool => $item !== $word));
            writeWordList($paths['targets'][$length], $targets);
            printJson(['status' => 'ok', 'action' => 'remove', 'word' => $word, 'length' => $length]);
            return;
        }

        if ($command === 'ban') {
            $changed = false;
            if (isset($targetSet[$word])) {
                $targets = array_values(array_filter($targets, static fn(string $item): bool => $item !== $word));
                writeWordList($paths['targets'][$length], $targets);
                $changed = true;
            }
            if (!isset($blacklistSet[$word])) {
                $blacklist[] = $word;
                writeWordList($paths['blacklist'], $blacklist);
                $changed = true;
            }
            printJson(['status' => 'ok', 'action' => 'ban', 'word' => $word, 'length' => $length, 'changed' => $changed]);
        }
    } catch (Throwable $e) {
        fwrite(STDERR, $e->getMessage() . PHP_EOL);
        exit(1);
    }
}

function buildManagedPaths(): array
{
    $root = realpath(__DIR__ . '/..');
    if ($root === false) {
        fail('Repository root not found');
    }

    return [
        'targets' => [
            5 => $root . '/words/russian_5_targets.json',
            6 => $root . '/words/russian_6_targets.json',
            7 => $root . '/words/russian_7_targets.json',
        ],
        'blacklist' => $root . '/words/wordclash_target_blacklist.json',
    ];
}

function normalizeWord(string $word): string
{
    return mb_strtolower(trim($word), 'UTF-8');
}

function validateManagedWord(string $word): int
{
    $length = mb_strlen($word, 'UTF-8');
    if (!in_array($length, WCT_LENGTHS, true) || !preg_match('/^[а-яё]+$/u', $word)) {
        fail('Word must be a lowercase Russian word with length 5, 6, or 7');
    }
    return $length;
}

function readWordList(string $file, ?int $expectedLength): array
{
    if (!is_file($file)) {
        fail('Required file not found: ' . $file);
    }

    $decoded = json_decode((string) file_get_contents($file), true);
    if (!is_array($decoded) || !array_is_list($decoded)) {
        fail('Invalid JSON word list: ' . $file);
    }

    $words = [];
    $seen = [];
    foreach ($decoded as $index => $value) {
        if (!is_string($value)) {
            fail('Invalid item #' . ($index + 1) . ' in ' . $file);
        }
        $word = normalizeWord($value);
        if ($word !== $value || !preg_match('/^[а-яё]+$/u', $word)) {
            fail('Invalid word "' . $value . '" in ' . $file);
        }
        if ($expectedLength !== null && mb_strlen($word, 'UTF-8') !== $expectedLength) {
            fail('Wrong length for "' . $word . '" in ' . $file);
        }
        if (isset($seen[$word])) {
            fail('Duplicate word "' . $word . '" in ' . $file);
        }
        $seen[$word] = true;
        $words[] = $word;
    }

    return $words;
}

function writeWordList(string $file, array $words): void
{
    $unique = [];
    foreach ($words as $word) {
        $word = normalizeWord((string) $word);
        if ($word === '') {
            continue;
        }
        $unique[$word] = $word;
    }
    $words = array_values($unique);
    sort($words, SORT_STRING);

    $json = json_encode($words, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
    if ($json === false) {
        fail('Cannot encode JSON');
    }

    $tmp = $file . '.tmp.' . getmypid();
    if (file_put_contents($tmp, $json . PHP_EOL, LOCK_EX) === false) {
        fail('Cannot write temporary file');
    }
    if (!rename($tmp, $file)) {
        @unlink($tmp);
        fail('Cannot replace file atomically');
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
