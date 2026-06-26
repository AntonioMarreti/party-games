<?php

const WORDCLASH_DB_SCHEMA_VERSION = 1;
const WORDCLASH_LENGTHS = [5, 6, 7];

function wc_dict_normalize_word($word): string
{
    return mb_strtolower(trim((string) $word), 'UTF-8');
}

function wc_dict_word_length(string $word): int
{
    return mb_strlen($word, 'UTF-8');
}

function wc_dict_valid_length(int $length): bool
{
    return in_array($length, WORDCLASH_LENGTHS, true);
}

function wc_dict_validate_shape(string $word): array
{
    $word = wc_dict_normalize_word($word);
    $length = wc_dict_word_length($word);
    if (!wc_dict_valid_length($length) || !preg_match('/^[а-яё]+$/u', $word)) {
        return [false, 'Слово должно быть русским словом из 5–7 букв', $word, $length];
    }
    return [true, null, $word, $length];
}

function wc_dict_root(): string
{
    return dirname(__DIR__, 2);
}

function wc_dict_read_json_words(string $path, ?int $length = null): array
{
    if (!is_file($path)) {
        return [];
    }
    $decoded = json_decode((string) file_get_contents($path), true);
    if (!is_array($decoded)) {
        return [];
    }

    $words = [];
    $seen = [];
    foreach ($decoded as $value) {
        if (!is_string($value)) {
            continue;
        }
        $word = wc_dict_normalize_word($value);
        if ($word === '' || !preg_match('/^[а-яё]+$/u', $word)) {
            continue;
        }
        if ($length !== null && wc_dict_word_length($word) !== $length) {
            continue;
        }
        if (isset($seen[$word])) {
            continue;
        }
        $seen[$word] = true;
        $words[] = $word;
    }
    return $words;
}

function wc_dict_base_targets(int $length): array
{
    static $cache = [];
    if (isset($cache[$length])) {
        return $cache[$length];
    }
    if (!wc_dict_valid_length($length)) {
        return [];
    }
    $cache[$length] = wc_dict_read_json_words(wc_dict_root() . "/words/russian_{$length}_targets.json", $length);
    return $cache[$length];
}

function wc_dict_guess_words(int $length): array
{
    static $cache = [];
    if (isset($cache[$length])) {
        return $cache[$length];
    }
    if (!wc_dict_valid_length($length)) {
        return [];
    }
    $cache[$length] = wc_dict_read_json_words(wc_dict_root() . "/words/russian_{$length}.json", $length);
    return $cache[$length];
}

function wc_dict_static_blacklist(): array
{
    static $cache = null;
    if ($cache !== null) {
        return $cache;
    }
    $cache = wc_dict_read_json_words(wc_dict_root() . '/words/wordclash_target_blacklist.json', null);
    return $cache;
}

function wc_dict_table_ready(PDO $pdo, string $table): bool
{
    try {
        $stmt = $pdo->prepare("
            SELECT COUNT(*)
            FROM information_schema.tables
            WHERE table_schema = DATABASE() AND table_name = ?
        ");
        $stmt->execute([$table]);
        return (int) $stmt->fetchColumn() > 0;
    } catch (Throwable $e) {
        return false;
    }
}

function wc_dict_db_ready(?PDO $pdo): bool
{
    static $ready = null;
    if (!$pdo instanceof PDO) {
        return false;
    }
    if ($ready !== null) {
        return $ready;
    }
    $required = [
        'wordclash_target_words',
        'wordclash_word_suggestions',
        'wordclash_word_audit',
        'wordclash_dictionary_meta',
    ];
    foreach ($required as $table) {
        if (!wc_dict_table_ready($pdo, $table)) {
            $ready = false;
            return false;
        }
    }
    $ready = true;
    return true;
}

function wc_dict_meta_get(PDO $pdo, string $key): ?string
{
    $stmt = $pdo->prepare("SELECT meta_value FROM wordclash_dictionary_meta WHERE meta_key = ? LIMIT 1");
    $stmt->execute([$key]);
    $value = $stmt->fetchColumn();
    return $value === false ? null : (string) $value;
}

function wc_dict_seed_complete(?PDO $pdo): bool
{
    if (!$pdo instanceof PDO || !wc_dict_db_ready($pdo)) {
        return false;
    }
    try {
        return wc_dict_meta_get($pdo, 'seed_complete') === '1'
            && wc_dict_meta_get($pdo, 'schema_version') === (string) WORDCLASH_DB_SCHEMA_VERSION;
    } catch (Throwable $e) {
        return false;
    }
}

function wc_dict_active_targets(?PDO $pdo, int $length): array
{
    if (!wc_dict_valid_length($length)) {
        return [];
    }

    if ($pdo instanceof PDO && wc_dict_seed_complete($pdo)) {
        try {
            $stmt = $pdo->prepare("
                SELECT word
                FROM wordclash_target_words
                WHERE word_length = ? AND state = 'active'
                ORDER BY id ASC
            ");
            $stmt->execute([$length]);
            $words = array_values(array_map('wc_dict_normalize_word', $stmt->fetchAll(PDO::FETCH_COLUMN)));
            if (!empty($words)) {
                return $words;
            }
        } catch (Throwable $e) {
            // Fall back below; games must keep starting safely.
        }
    }

    return wc_dict_base_targets($length);
}

function wc_dict_is_active_target(?PDO $pdo, string $word, int $length): bool
{
    $word = wc_dict_normalize_word($word);
    if (!wc_dict_valid_length($length) || wc_dict_word_length($word) !== $length) {
        return false;
    }
    return in_array($word, wc_dict_active_targets($pdo, $length), true);
}

function wc_dict_status(?PDO $pdo, string $word): array
{
    [$ok, $message, $word, $length] = wc_dict_validate_shape($word);
    if (!$ok) {
        return ['word' => $word, 'length' => $length, 'valid' => false, 'message' => $message];
    }

    $inStaticBlacklist = in_array($word, wc_dict_static_blacklist(), true);
    $inBroadGuess = in_array($word, wc_dict_guess_words($length), true);
    $fallbackActive = in_array($word, wc_dict_base_targets($length), true);

    $row = null;
    if ($pdo instanceof PDO && wc_dict_seed_complete($pdo)) {
        $stmt = $pdo->prepare("
            SELECT word, word_length, state, source, updated_by_user_id, created_at, updated_at
            FROM wordclash_target_words
            WHERE word = ?
            LIMIT 1
        ");
        $stmt->execute([$word]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
    }

    return [
        'word' => $word,
        'length' => $length,
        'valid' => true,
        'state' => $row['state'] ?? ($fallbackActive ? 'active' : 'absent'),
        'source' => $row['source'] ?? ($fallbackActive ? 'json_fallback' : null),
        'in_static_blacklist' => $inStaticBlacklist,
        'in_broad_guess' => $inBroadGuess,
        'db_seed_complete' => $pdo instanceof PDO ? wc_dict_seed_complete($pdo) : false,
        'updated_at' => $row['updated_at'] ?? null,
    ];
}

function wc_dict_require_seed(PDO $pdo): void
{
    if (!wc_dict_seed_complete($pdo)) {
        throw new RuntimeException('Wordclash dictionary DB seed is not complete');
    }
}

function wc_dict_audit(PDO $pdo, ?int $actorUserId, string $action, string $word, int $length, string $context = ''): void
{
    $stmt = $pdo->prepare("
        INSERT INTO wordclash_word_audit (actor_user_id, action, word, word_length, source_context)
        VALUES (?, ?, ?, ?, ?)
    ");
    $stmt->execute([$actorUserId ?: null, $action, $word, $length, mb_substr($context, 0, 255, 'UTF-8')]);
}

function wc_dict_validate_add(PDO $pdo, string $word): array
{
    [$ok, $message, $word, $length] = wc_dict_validate_shape($word);
    if (!$ok) {
        return [false, $message, $word, $length, null];
    }
    if (in_array($word, wc_dict_static_blacklist(), true)) {
        return [false, 'Слово в статическом blacklist', $word, $length, null];
    }
    if (!in_array($word, wc_dict_guess_words($length), true)) {
        return [false, 'Слова нет в широком словаре допустимых попыток', $word, $length, null];
    }

    $stmt = $pdo->prepare("SELECT * FROM wordclash_target_words WHERE word = ? LIMIT 1");
    $stmt->execute([$word]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
    if ($row && $row['state'] === 'active') {
        return [false, 'Слово уже активно', $word, $length, $row];
    }
    if ($row && $row['state'] === 'banned') {
        return [false, 'Слово запрещено. Сначала выберите «Разрешить снова»', $word, $length, $row];
    }
    if (!$row && !in_array($word, wc_dict_base_targets($length), true)) {
        return [false, 'Слова нет в стартовом проверенном target-словаре', $word, $length, null];
    }

    return [true, null, $word, $length, $row];
}

function wc_dict_add_word(PDO $pdo, string $word, ?int $actorUserId = null, string $source = 'admin', string $context = 'admin'): array
{
    wc_dict_require_seed($pdo);
    [$ok, $message, $word, $length, $row] = wc_dict_validate_add($pdo, $word);
    if (!$ok) {
        throw new RuntimeException((string) $message);
    }

    if ($row) {
        $stmt = $pdo->prepare("
            UPDATE wordclash_target_words
            SET state = 'active', source = ?, updated_by_user_id = ?, updated_at = NOW()
            WHERE word = ?
        ");
        $stmt->execute([$source, $actorUserId, $word]);
    } else {
        $stmt = $pdo->prepare("
            INSERT INTO wordclash_target_words (word, word_length, state, updated_by_user_id, source)
            VALUES (?, ?, 'active', ?, ?)
        ");
        $stmt->execute([$word, $length, $actorUserId, $source]);
    }
    wc_dict_audit($pdo, $actorUserId, 'add', $word, $length, $context);
    return wc_dict_status($pdo, $word);
}

function wc_dict_set_state(PDO $pdo, string $word, string $state, ?int $actorUserId, string $action, string $context = 'admin'): array
{
    wc_dict_require_seed($pdo);
    [$ok, $message, $word, $length] = wc_dict_validate_shape($word);
    if (!$ok) {
        throw new RuntimeException((string) $message);
    }
    if (!in_array($state, ['active', 'removed', 'banned'], true)) {
        throw new RuntimeException('Invalid target state');
    }

    $stmt = $pdo->prepare("SELECT * FROM wordclash_target_words WHERE word = ? LIMIT 1");
    $stmt->execute([$word]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
    if (!$row) {
        if ($state !== 'banned') {
            throw new RuntimeException('Слова нет в словаре');
        }
        $stmt = $pdo->prepare("
            INSERT INTO wordclash_target_words (word, word_length, state, updated_by_user_id, source)
            VALUES (?, ?, 'banned', ?, 'admin')
        ");
        $stmt->execute([$word, $length, $actorUserId]);
    } else {
        $stmt = $pdo->prepare("
            UPDATE wordclash_target_words
            SET state = ?, updated_by_user_id = ?, updated_at = NOW()
            WHERE word = ?
        ");
        $stmt->execute([$state, $actorUserId, $word]);
    }

    wc_dict_audit($pdo, $actorUserId, $action, $word, $length, $context);
    return wc_dict_status($pdo, $word);
}

function wc_dict_remove_word(PDO $pdo, string $word, ?int $actorUserId = null): array
{
    return wc_dict_set_state($pdo, $word, 'removed', $actorUserId, 'remove');
}

function wc_dict_ban_word(PDO $pdo, string $word, ?int $actorUserId = null): array
{
    return wc_dict_set_state($pdo, $word, 'banned', $actorUserId, 'ban');
}

function wc_dict_restore_word(PDO $pdo, string $word, ?int $actorUserId = null): array
{
    wc_dict_require_seed($pdo);
    $status = wc_dict_status($pdo, $word);
    if (($status['state'] ?? '') === 'banned') {
        throw new RuntimeException('Сначала выберите «Разрешить снова»');
    }
    return wc_dict_set_state($pdo, $word, 'active', $actorUserId, 'restore');
}

function wc_dict_unban_word(PDO $pdo, string $word, ?int $actorUserId = null): array
{
    return wc_dict_set_state($pdo, $word, 'removed', $actorUserId, 'unban');
}

function wc_dict_create_suggestion(PDO $pdo, string $word, string $comment, int $authorUserId): array
{
    wc_dict_require_seed($pdo);
    [$ok, $message, $word, $length] = wc_dict_validate_shape($word);
    if (!$ok) {
        throw new RuntimeException((string) $message);
    }
    $comment = mb_substr(trim($comment), 0, 180, 'UTF-8');
    $stmt = $pdo->prepare("
        INSERT INTO wordclash_word_suggestions (word, word_length, comment, author_user_id, state)
        VALUES (?, ?, ?, ?, 'pending')
    ");
    $stmt->execute([$word, $length, $comment, $authorUserId]);
    wc_dict_audit($pdo, $authorUserId, 'suggest', $word, $length, 'tester');
    return ['id' => (int) $pdo->lastInsertId(), 'word' => $word, 'length' => $length, 'state' => 'pending'];
}

function wc_dict_review_suggestion(PDO $pdo, int $suggestionId, string $decision, int $reviewerUserId): array
{
    wc_dict_require_seed($pdo);
    if (!in_array($decision, ['approved', 'rejected'], true)) {
        throw new RuntimeException('Invalid review decision');
    }
    $stmt = $pdo->prepare("SELECT * FROM wordclash_word_suggestions WHERE id = ? LIMIT 1");
    $stmt->execute([$suggestionId]);
    $suggestion = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$suggestion) {
        throw new RuntimeException('Предложение не найдено');
    }
    if ($suggestion['state'] !== 'pending') {
        throw new RuntimeException('Предложение уже обработано');
    }

    if ($decision === 'approved') {
        wc_dict_add_word($pdo, $suggestion['word'], $reviewerUserId, 'suggestion', 'suggestion:' . $suggestionId);
    }
    $stmt = $pdo->prepare("
        UPDATE wordclash_word_suggestions
        SET state = ?, reviewed_by_user_id = ?, reviewed_at = NOW()
        WHERE id = ?
    ");
    $stmt->execute([$decision, $reviewerUserId, $suggestionId]);
    wc_dict_audit($pdo, $reviewerUserId, 'suggestion_' . $decision, $suggestion['word'], (int) $suggestion['word_length'], 'suggestion:' . $suggestionId);
    return ['id' => $suggestionId, 'state' => $decision];
}

function wc_dict_recent_audit(PDO $pdo, int $limit = 20): array
{
    wc_dict_require_seed($pdo);
    $limit = max(1, min(50, $limit));
    $stmt = $pdo->prepare("
        SELECT id, timestamp, actor_user_id, action, word, word_length, source_context
        FROM wordclash_word_audit
        ORDER BY id DESC
        LIMIT ?
    ");
    $stmt->bindValue(1, $limit, PDO::PARAM_INT);
    $stmt->execute();
    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}

function wc_dict_pending_suggestions(PDO $pdo, int $limit = 30): array
{
    wc_dict_require_seed($pdo);
    $limit = max(1, min(100, $limit));
    $stmt = $pdo->prepare("
        SELECT id, word, word_length, comment, author_user_id, state, created_at
        FROM wordclash_word_suggestions
        WHERE state = 'pending'
        ORDER BY id ASC
        LIMIT ?
    ");
    $stmt->bindValue(1, $limit, PDO::PARAM_INT);
    $stmt->execute();
    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}

function wc_dict_counts(PDO $pdo): array
{
    wc_dict_require_seed($pdo);
    $stmt = $pdo->query("
        SELECT word_length, state, COUNT(*) AS cnt
        FROM wordclash_target_words
        GROUP BY word_length, state
    ");
    $counts = [];
    foreach (WORDCLASH_LENGTHS as $length) {
        $counts[(string) $length] = ['active' => 0, 'removed' => 0, 'banned' => 0];
    }
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $length = (string) $row['word_length'];
        $state = (string) $row['state'];
        if (isset($counts[$length][$state])) {
            $counts[$length][$state] = (int) $row['cnt'];
        }
    }
    return $counts;
}
