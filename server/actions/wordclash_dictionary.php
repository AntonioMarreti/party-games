<?php

require_once __DIR__ . '/../lib/wordclash_dictionary.php';

function wc_dictionary_is_admin(array $user): bool
{
    return !empty($user['is_admin']);
}

function wc_dictionary_is_tester(array $user): bool
{
    return wc_dictionary_is_admin($user)
        || ($user['is_tester'] ?? null) === true
        || ($user['is_tester'] ?? null) === 1
        || ($user['is_tester'] ?? null) === '1';
}

function wc_dictionary_require_admin(array $user): void
{
    if (!wc_dictionary_is_admin($user)) {
        sendError('Access Denied');
    }
}

function wc_dictionary_require_tester(array $user): void
{
    if (!wc_dictionary_is_tester($user)) {
        sendError('Access Denied');
    }
}

function action_wordclash_dictionary_get(PDO $pdo, array $user, array $data): void
{
    wc_dictionary_require_tester($user);

    $word = wc_dict_normalize_word($data['word'] ?? '');
    $payload = [
        'status' => 'ok',
        'can_admin' => wc_dictionary_is_admin($user),
        'can_suggest' => wc_dictionary_is_tester($user),
        'db_seed_complete' => wc_dict_seed_complete($pdo),
    ];

    if ($word !== '') {
        $payload['word_status'] = wc_dict_status($pdo, $word);
    }

    if (wc_dictionary_is_admin($user) && wc_dict_seed_complete($pdo)) {
        $payload['counts'] = wc_dict_counts($pdo);
        $payload['audit'] = wc_dict_recent_audit($pdo, 20);
        $payload['suggestions'] = wc_dict_pending_suggestions($pdo, 30);
    }

    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}

function action_wordclash_dictionary_action(PDO $pdo, array $user, array $data): void
{
    wc_dictionary_require_admin($user);
    $op = (string) ($data['op'] ?? '');
    $word = (string) ($data['word'] ?? '');
    $actor = (int) ($user['id'] ?? 0);
    $message = 'Изменение сохранено.';

    try {
        switch ($op) {
            case 'add':
                $status = wc_dict_add_word($pdo, $word, $actor, 'admin');
                $message = $status['word'] . ' добавлено в словарь загадок.';
                break;
            case 'remove':
                $status = wc_dict_remove_word($pdo, $word, $actor);
                $message = $status['word'] . ' убрано из загадок.';
                break;
            case 'ban':
                $status = wc_dict_ban_word($pdo, $word, $actor);
                $message = $status['word'] . ' запрещено для загадок.';
                break;
            case 'restore':
                $status = wc_dict_restore_word($pdo, $word, $actor);
                $message = $status['word'] . ' возвращено в словарь загадок.';
                break;
            case 'unban':
                $status = wc_dict_unban_word($pdo, $word, $actor);
                $message = $status['word'] . ' разрешено снова и переведено в убранные.';
                break;
            default:
                sendError('Unknown dictionary action');
        }
    } catch (Throwable $e) {
        sendError($e->getMessage());
    }

    echo json_encode([
        'status' => 'ok',
        'message' => $message,
        'word_status' => $status,
        'counts' => wc_dict_counts($pdo),
        'audit' => wc_dict_recent_audit($pdo, 20),
        'suggestions' => wc_dict_pending_suggestions($pdo, 30),
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}

function action_wordclash_dictionary_suggest(PDO $pdo, array $user, array $data): void
{
    wc_dictionary_require_tester($user);
    try {
        $suggestion = wc_dict_create_suggestion(
            $pdo,
            (string) ($data['word'] ?? ''),
            (string) ($data['comment'] ?? ''),
            (int) ($user['id'] ?? 0)
        );
    } catch (Throwable $e) {
        sendError($e->getMessage());
    }

    echo json_encode(['status' => 'ok', 'suggestion' => $suggestion], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}

function action_wordclash_dictionary_review_suggestion(PDO $pdo, array $user, array $data): void
{
    wc_dictionary_require_admin($user);
    $suggestionId = (int) ($data['suggestion_id'] ?? 0);
    if ($suggestionId <= 0) {
        sendError('Invalid suggestion id');
    }
    try {
        $review = wc_dict_review_suggestion(
            $pdo,
            $suggestionId,
            (string) ($data['decision'] ?? ''),
            (int) ($user['id'] ?? 0)
        );
    } catch (Throwable $e) {
        sendError($e->getMessage());
    }

    echo json_encode([
        'status' => 'ok',
        'review' => $review,
        'counts' => wc_dict_counts($pdo),
        'audit' => wc_dict_recent_audit($pdo, 20),
        'suggestions' => wc_dict_pending_suggestions($pdo, 30),
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}
