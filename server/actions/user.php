<?php

function action_update_profile($pdo, $user, $data) {
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

    if (mb_strlen($name) > 64) $name = mb_substr($name, 0, 64);
    
    $pdo->prepare("UPDATE users SET custom_name = ?, custom_avatar = ? WHERE id = ?")
        ->execute([$name ?: null, $avatar_config ?: null, $user['id']]);
        
    echo json_encode(['status' => 'ok']);
}

function action_update_settings($pdo, $user, $data) {
    // 1. Leaderboard Privacy
    if (isset($data['is_hidden_in_leaderboard'])) {
        $isHidden = $data['is_hidden_in_leaderboard'] ? 1 : 0;
        $pdo->prepare("UPDATE users SET is_hidden_in_leaderboard = ? WHERE id = ?")
            ->execute([$isHidden, $user['id']]);
    }
    
    // Future: Handle other server-side settings here
    
    echo json_encode(['status' => 'ok']);
}
