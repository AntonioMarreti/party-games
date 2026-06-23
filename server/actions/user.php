<?php

function action_update_profile($pdo, $user, $data)
{
    $name = sanitize_public_text($data['name'] ?? '', 64);
    $avatar_config = $data['avatar_config'] ?? null; // JSON string or null

    // Handle File Upload (Blob) - Note: Global $_FILES access
    if (isset($_FILES['avatar_image']) && $_FILES['avatar_image']['error'] === UPLOAD_ERR_OK) {
        $tmpName = $_FILES['avatar_image']['tmp_name'];
        $fileData = file_get_contents($tmpName);
        if ($fileData) {
            $base64 = 'data:image/jpeg;base64,' . base64_encode($fileData);
            // Create proper config
            $avatar_config = json_encode(['type' => 'image', 'src' => $base64]);
        }
    }

    $pdo->prepare("UPDATE users SET custom_name = ?, custom_avatar = ? WHERE id = ?")
        ->execute([$name ?: null, $avatar_config ?: null, $user['id']]);

    echo json_encode(['status' => 'ok']);
}

function action_update_settings($pdo, $user, $data)
{
    // 1. Leaderboard Privacy
    if (isset($data['is_hidden_in_leaderboard'])) {
        $isHidden = $data['is_hidden_in_leaderboard'] ? 1 : 0;
        $pdo->prepare("UPDATE users SET is_hidden_in_leaderboard = ? WHERE id = ?")
            ->execute([$isHidden, $user['id']]);
    }

    if (array_key_exists('show_profile_badge', $data)) {
        if (empty($user['is_tester'])) {
            sendError('Setting is not available');
        }

        $showBadge = filter_var($data['show_profile_badge'], FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
        if ($showBadge === null) {
            sendError('Invalid badge setting');
        }

        $pdo->prepare("UPDATE users SET hide_profile_badge = ? WHERE id = ?")
            ->execute([$showBadge ? 0 : 1, $user['id']]);
    }

    $stmt = $pdo->prepare("SELECT * FROM users WHERE id = ?");
    $stmt->execute([$user['id']]);
    $freshUser = $stmt->fetch();
    if ($freshUser) {
        $freshUser = array_merge($user, $freshUser);
    }

    echo json_encode([
        'status' => 'ok',
        'user' => normalize_current_user_fields($freshUser ?: $user)
    ]);
}

// Lazy migration safety net for user_favorites.
// The table is normally created by migration 004_add_user_favorites. We only
// run this DDL when a query reports the table is missing (SQLSTATE 42S02),
// instead of on every request: on MySQL CREATE TABLE takes a metadata lock
// even when the table already exists, which serializes concurrent requests
// (e.g. the burst Telegram Desktop fires on startup) and can blow past the
// client timeout.
function ensure_user_favorites_table($pdo)
{
    $pdo->exec("CREATE TABLE IF NOT EXISTS user_favorites (
        user_id INT NOT NULL,
        game_id VARCHAR(32) NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, game_id),
        INDEX idx_user (user_id)
    )");
}

function get_pdo_sqlstate(PDOException $e)
{
    if (!empty($e->errorInfo[0])) {
        return $e->errorInfo[0];
    }

    $code = $e->getCode();
    return is_string($code) ? $code : null;
}

function is_missing_table_error(PDOException $e)
{
    return get_pdo_sqlstate($e) === '42S02'
        || (($e->errorInfo[1] ?? null) === 1146);
}

function is_duplicate_key_error(PDOException $e)
{
    return get_pdo_sqlstate($e) === '23000';
}

function action_toggle_like($pdo, $user, $data)
{
    $gameId = $data['game_id'] ?? '';
    if (!$gameId)
        sendError('No game_id');

    try {
        $stmt = $pdo->prepare("SELECT 1 FROM user_favorites WHERE user_id = ? AND game_id = ?");
        $stmt->execute([$user['id'], $gameId]);
    } catch (PDOException $e) {
        if (!is_missing_table_error($e)) throw $e;
        ensure_user_favorites_table($pdo);
        $stmt = $pdo->prepare("SELECT 1 FROM user_favorites WHERE user_id = ? AND game_id = ?");
        $stmt->execute([$user['id'], $gameId]);
    }
    $exists = $stmt->fetchColumn();

    if ($exists) {
        $pdo->prepare("DELETE FROM user_favorites WHERE user_id = ? AND game_id = ?")->execute([$user['id'], $gameId]);
        echo json_encode(['status' => 'ok', 'is_liked' => false]);
    } else {
        try {
            $pdo->prepare("INSERT INTO user_favorites (user_id, game_id) VALUES (?, ?)")->execute([$user['id'], $gameId]);
        } catch (PDOException $e) {
            if (!is_duplicate_key_error($e)) throw $e;
        }
        echo json_encode(['status' => 'ok', 'is_liked' => true]);
    }
}

function action_get_me($pdo, $user, $data)
{
    // Return fresh user data
    // calculated columns or specific fields can be added here
    echo json_encode(['status' => 'ok', 'user' => normalize_current_user_fields($user)]);
}

function action_get_favorites($pdo, $user, $data)
{
    try {
        $stmt = $pdo->prepare("SELECT game_id FROM user_favorites WHERE user_id = ?");
        $stmt->execute([$user['id']]);
    } catch (PDOException $e) {
        // Table missing (migration 004 not applied) -> create once, then retry.
        if (!is_missing_table_error($e)) throw $e;
        ensure_user_favorites_table($pdo);
        $stmt = $pdo->prepare("SELECT game_id FROM user_favorites WHERE user_id = ?");
        $stmt->execute([$user['id']]);
    }
    $favorites = $stmt->fetchAll(PDO::FETCH_COLUMN);

    echo json_encode(['status' => 'ok', 'favorites' => $favorites]);
}
