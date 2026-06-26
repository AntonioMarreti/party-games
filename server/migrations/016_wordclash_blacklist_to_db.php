<?php
// 016_wordclash_blacklist_to_db.php
// Imports the historical Wordclash target blacklist into wordclash_target_words.state = banned once.

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../lib/wordclash_dictionary.php';

if (!isset($pdo) || !$pdo instanceof PDO) {
    echo "Migration 016 skipped: database connection is not available in this environment.\n";
    exit(1);
}

try {
    if (!wc_dict_seed_complete($pdo)) {
        echo "Migration 016 stopped: Wordclash dictionary DB seed is not complete. Run migration 015 first.\n";
        exit(1);
    }

    if (wc_dict_meta_get($pdo, 'blacklist_import_complete') === '1') {
        echo "Migration 016: Wordclash blacklist import already complete.\n";
        exit(0);
    }

    $blacklistWords = wc_migration_016_load_blacklist_words();

    $activeBefore = wc_migration_016_state_counts($pdo, 'active');
    $bannedBefore = wc_migration_016_state_counts($pdo, 'banned');

    $pdo->beginTransaction();

    $select = $pdo->prepare("SELECT id, state FROM wordclash_target_words WHERE word = ? LIMIT 1");
    $insert = $pdo->prepare("
        INSERT INTO wordclash_target_words (word, word_length, state, source)
        VALUES (?, ?, 'banned', 'admin')
    ");
    $update = $pdo->prepare("
        UPDATE wordclash_target_words
        SET state = 'banned'
        WHERE word = ? AND state <> 'banned'
    ");

    $inserted = 0;
    $updated = 0;
    $alreadyBanned = 0;
    foreach ($blacklistWords as $word) {
        $length = wc_dict_word_length($word);
        $select->execute([$word]);
        $row = $select->fetch(PDO::FETCH_ASSOC) ?: null;

        if (!$row) {
            $insert->execute([$word, $length]);
            $inserted++;
        } elseif ((string) $row['state'] === 'banned') {
            $alreadyBanned++;
        } else {
            $update->execute([$word]);
            $updated++;
        }

        wc_dict_audit($pdo, null, 'blacklist_import', $word, $length, 'words/wordclash_target_blacklist.json');
    }

    $meta = $pdo->prepare("
        INSERT INTO wordclash_dictionary_meta (meta_key, meta_value)
        VALUES (?, ?)
        ON DUPLICATE KEY UPDATE meta_value = VALUES(meta_value)
    ");
    $meta->execute(['blacklist_import_complete', '1']);
    $meta->execute(['blacklist_import_source', 'words/wordclash_target_blacklist.json']);
    $meta->execute(['blacklist_import_count', (string) count($blacklistWords)]);
    $meta->execute(['blacklist_import_completed_at', date('c')]);

    $pdo->commit();

    $activeAfter = wc_migration_016_state_counts($pdo, 'active');
    $bannedAfter = wc_migration_016_state_counts($pdo, 'banned');

    echo "Migration 016: imported Wordclash blacklist into DB. "
        . "blacklist=" . count($blacklistWords)
        . ", inserted={$inserted}, updated={$updated}, already_banned={$alreadyBanned}, "
        . "active_before=" . wc_migration_016_counts_string($activeBefore)
        . ", active_after=" . wc_migration_016_counts_string($activeAfter)
        . ", banned_before=" . wc_migration_016_counts_string($bannedBefore)
        . ", banned_after=" . wc_migration_016_counts_string($bannedAfter)
        . ".\n";
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    echo "Migration 016 Error: " . $e->getMessage() . "\n";
    exit(1);
}

function wc_migration_016_load_blacklist_words(): array
{
    $path = dirname(__DIR__, 2) . '/words/wordclash_target_blacklist.json';
    if (!is_file($path)) {
        throw new RuntimeException("Blacklist JSON missing: {$path}");
    }
    $decoded = json_decode((string) file_get_contents($path), true);
    if (!is_array($decoded) || !array_is_list($decoded)) {
        throw new RuntimeException("Blacklist JSON is not a list: {$path}");
    }

    $words = [];
    $seen = [];
    foreach ($decoded as $index => $value) {
        if (!is_string($value)) {
            throw new RuntimeException("Invalid blacklist item #" . ($index + 1));
        }
        $word = wc_dict_normalize_word($value);
        $length = wc_dict_word_length($word);
        if ($word !== $value || !preg_match('/^[а-яё]+$/u', $word) || !wc_dict_valid_length($length)) {
            throw new RuntimeException("Invalid blacklist word '{$value}'");
        }
        if (isset($seen[$word])) {
            throw new RuntimeException("Duplicate blacklist word '{$word}'");
        }
        $seen[$word] = true;
        $words[] = $word;
    }
    return $words;
}

function wc_migration_016_state_counts(PDO $pdo, string $state): array
{
    $stmt = $pdo->prepare("
        SELECT word_length, COUNT(*) AS cnt
        FROM wordclash_target_words
        WHERE state = ?
        GROUP BY word_length
    ");
    $stmt->execute([$state]);
    $counts = [];
    foreach (WORDCLASH_LENGTHS as $length) {
        $counts[(string) $length] = 0;
    }
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $length = (string) $row['word_length'];
        if (array_key_exists($length, $counts)) {
            $counts[$length] = (int) $row['cnt'];
        }
    }
    return $counts;
}

function wc_migration_016_counts_string(array $counts): string
{
    return ($counts['5'] ?? 0) . '/' . ($counts['6'] ?? 0) . '/' . ($counts['7'] ?? 0);
}
