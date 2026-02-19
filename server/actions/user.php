<?php

function action_update_profile($pdo, $user, $data)
{
    $name = trim($data['name'] ?? '');
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

    if (mb_strlen($name) > 64)
        $name = mb_substr($name, 0, 64);

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

    // Future: Handle other server-side settings here

    echo json_encode(['status' => 'ok']);
}

function action_toggle_like($pdo, $user, $data)
{
    // 0. Ensure Table Exists (Lazy Migration)
    $pdo->exec("CREATE TABLE IF NOT EXISTS user_favorites (
        user_id INT NOT NULL,
        game_id VARCHAR(32) NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, game_id),
        INDEX idx_user (user_id)
    )");

    $gameId = $data['game_id'] ?? '';
    if (!$gameId)
        sendError('No game_id');

    // Check if already liked
    $stmt = $pdo->prepare("SELECT 1 FROM user_favorites WHERE user_id = ? AND game_id = ?");
    $stmt->execute([$user['id'], $gameId]);
    $exists = $stmt->fetchColumn();

    if ($exists) {
        $pdo->prepare("DELETE FROM user_favorites WHERE user_id = ? AND game_id = ?")->execute([$user['id'], $gameId]);
        echo json_encode(['status' => 'ok', 'is_liked' => false]);
    } else {
        $pdo->prepare("INSERT INTO user_favorites (user_id, game_id) VALUES (?, ?)")->execute([$user['id'], $gameId]);
        echo json_encode(['status' => 'ok', 'is_liked' => true]);
    }
}

function action_get_me($pdo, $user, $data)
{
    // Return fresh user data
    // calculated columns or specific fields can be added here
    echo json_encode(['status' => 'ok', 'user' => $user]);
}

function action_get_favorites($pdo, $user, $data)
{
    // 0. Ensure Table Exists (Lazy Migration)
    $pdo->exec("CREATE TABLE IF NOT EXISTS user_favorites (
        user_id INT NOT NULL,
        game_id VARCHAR(32) NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, game_id),
        INDEX idx_user (user_id)
    )");

    $stmt = $pdo->prepare("SELECT game_id FROM user_favorites WHERE user_id = ?");
    $stmt->execute([$user['id']]);
    $favorites = $stmt->fetchAll(PDO::FETCH_COLUMN);

    echo json_encode(['status' => 'ok', 'favorites' => $favorites]);
}
