<?php
// 015_wordclash_targets_db.php
// Moves Wordclash target dictionaries into database tables and seeds once from curated JSON snapshots.

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../lib/wordclash_dictionary.php';

if (!isset($pdo) || !$pdo instanceof PDO) {
    echo "Migration 015 skipped: database connection is not available in this environment.\n";
    exit(1);
}

const WC_SEED_COUNTS = [5 => 850, 6 => 851, 7 => 803];

try {
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS wordclash_target_words (
            id INT AUTO_INCREMENT PRIMARY KEY,
            word VARCHAR(32) NOT NULL,
            word_length TINYINT NOT NULL,
            state ENUM('active', 'removed', 'banned') NOT NULL DEFAULT 'active',
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            updated_by_user_id INT NULL,
            source ENUM('seed', 'admin', 'suggestion') NOT NULL DEFAULT 'seed',
            UNIQUE KEY uq_wordclash_target_word (word),
            INDEX idx_wordclash_target_length_state (word_length, state),
            INDEX idx_wordclash_target_state (state)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");

    $pdo->exec("
        CREATE TABLE IF NOT EXISTS wordclash_word_suggestions (
            id INT AUTO_INCREMENT PRIMARY KEY,
            word VARCHAR(32) NOT NULL,
            word_length TINYINT NOT NULL,
            comment VARCHAR(180) NULL,
            author_user_id INT NOT NULL,
            state ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
            reviewed_by_user_id INT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            reviewed_at DATETIME NULL,
            INDEX idx_wordclash_suggestions_state (state),
            INDEX idx_wordclash_suggestions_word (word)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");

    $pdo->exec("
        CREATE TABLE IF NOT EXISTS wordclash_word_audit (
            id INT AUTO_INCREMENT PRIMARY KEY,
            timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            actor_user_id INT NULL,
            action VARCHAR(32) NOT NULL,
            word VARCHAR(32) NOT NULL,
            word_length TINYINT NOT NULL,
            source_context VARCHAR(255) NULL,
            INDEX idx_wordclash_audit_time (timestamp),
            INDEX idx_wordclash_audit_word (word)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");

    $pdo->exec("
        CREATE TABLE IF NOT EXISTS wordclash_dictionary_meta (
            meta_key VARCHAR(64) PRIMARY KEY,
            meta_value VARCHAR(255) NOT NULL,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");

    $seedComplete = wc_dict_meta_get($pdo, 'seed_complete') === '1';
    if ($seedComplete) {
        echo "Migration 015: Wordclash dictionary seed already complete.\n";
        exit(0);
    }

    $existingRows = (int) $pdo->query("SELECT COUNT(*) FROM wordclash_target_words")->fetchColumn();
    if ($existingRows > 0) {
        echo "Migration 015 stopped: wordclash_target_words contains data but seed_complete is not set.\n";
        exit(1);
    }

    $seedWords = [];
    foreach (WC_SEED_COUNTS as $length => $expectedCount) {
        $words = wc_migration_load_seed_words($length, $expectedCount);
        foreach ($words as $word) {
            $seedWords[] = [$word, $length];
        }
    }

    $pdo->beginTransaction();
    $insert = $pdo->prepare("
        INSERT INTO wordclash_target_words (word, word_length, state, source)
        VALUES (?, ?, 'active', 'seed')
    ");
    foreach ($seedWords as [$word, $length]) {
        $insert->execute([$word, $length]);
    }

    foreach (WC_SEED_COUNTS as $length => $expectedCount) {
        $stmt = $pdo->prepare("SELECT COUNT(*) FROM wordclash_target_words WHERE word_length = ? AND state = 'active' AND source = 'seed'");
        $stmt->execute([$length]);
        $actual = (int) $stmt->fetchColumn();
        if ($actual !== $expectedCount) {
            throw new RuntimeException("Seed count mismatch for {$length}: expected {$expectedCount}, got {$actual}");
        }
    }

    $meta = $pdo->prepare("
        INSERT INTO wordclash_dictionary_meta (meta_key, meta_value)
        VALUES (?, ?)
        ON DUPLICATE KEY UPDATE meta_value = VALUES(meta_value)
    ");
    $meta->execute(['schema_version', (string) WORDCLASH_DB_SCHEMA_VERSION]);
    $meta->execute(['seed_complete', '1']);
    $meta->execute(['seed_source', 'words/russian_*_targets.json']);
    $meta->execute(['seed_completed_at', date('c')]);

    $pdo->commit();
    echo "Migration 015: seeded Wordclash targets 850 / 851 / 803.\n";
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    echo "Migration 015 Error: " . $e->getMessage() . "\n";
    exit(1);
}

function wc_migration_load_seed_words(int $length, int $expectedCount): array
{
    $path = dirname(__DIR__, 2) . "/words/russian_{$length}_targets.json";
    if (!is_file($path)) {
        throw new RuntimeException("Seed JSON missing: {$path}");
    }
    $decoded = json_decode((string) file_get_contents($path), true);
    if (!is_array($decoded) || !array_is_list($decoded)) {
        throw new RuntimeException("Seed JSON is not a list: {$path}");
    }

    $words = [];
    $seen = [];
    foreach ($decoded as $index => $value) {
        if (!is_string($value)) {
            throw new RuntimeException("Invalid seed item #" . ($index + 1) . " for {$length}");
        }
        $word = wc_dict_normalize_word($value);
        if ($word !== $value || !preg_match('/^[а-яё]+$/u', $word) || wc_dict_word_length($word) !== $length) {
            throw new RuntimeException("Invalid seed word '{$value}' for {$length}");
        }
        if (isset($seen[$word])) {
            throw new RuntimeException("Duplicate seed word '{$word}' for {$length}");
        }
        $seen[$word] = true;
        $words[] = $word;
    }

    if (count($words) !== $expectedCount) {
        throw new RuntimeException("Seed JSON count mismatch for {$length}: expected {$expectedCount}, got " . count($words));
    }
    return $words;
}
