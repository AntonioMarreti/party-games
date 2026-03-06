<?php
// server/actions/sessions.php

// ─── Get all sessions for the current user ────────────────────────────────────
function action_get_sessions($pdo, $currentUser, $post)
{
    $userId = $currentUser['id'];
    $currentToken = $post['token'] ?? '';

    cleanupExpiredSessions($userId);

    $stmt = $pdo->prepare("
        SELECT id, platform, device, created_at, last_used,
               (auth_token = ?) AS is_current
        FROM user_sessions
        WHERE user_id = ?
        ORDER BY last_used DESC
    ");
    $stmt->execute([$currentToken, $userId]);
    $sessions = $stmt->fetchAll();

    echo json_encode([
        'status' => 'ok',
        'sessions' => $sessions,
        'max' => MAX_SESSIONS_PER_USER,
        'ttl_days' => (int) ($currentUser['session_ttl_days'] ?? 30),
    ]);
}

// ─── Revoke a specific session (cannot revoke current) ────────────────────────
function action_revoke_session($pdo, $currentUser, $post)
{
    $userId = $currentUser['id'];
    $sessionId = (int) ($post['session_id'] ?? 0);
    $currentToken = $post['token'] ?? '';

    if (!$sessionId) {
        echo json_encode(['status' => 'error', 'message' => 'Missing session_id']);
        return;
    }

    // Make sure this session belongs to the user and is not the current one
    $stmt = $pdo->prepare("SELECT auth_token FROM user_sessions WHERE id = ? AND user_id = ?");
    $stmt->execute([$sessionId, $userId]);
    $session = $stmt->fetch();

    if (!$session) {
        echo json_encode(['status' => 'error', 'message' => 'Session not found']);
        return;
    }

    if ($session['auth_token'] === $currentToken) {
        echo json_encode(['status' => 'error', 'message' => 'Cannot revoke current session. Use logout instead.']);
        return;
    }

    $pdo->prepare("DELETE FROM user_sessions WHERE id = ? AND user_id = ?")
        ->execute([$sessionId, $userId]);

    echo json_encode(['status' => 'ok']);
}

// ─── Revoke all sessions except current ──────────────────────────────────────
function action_revoke_all_sessions($pdo, $currentUser, $post)
{
    $userId = $currentUser['id'];
    $currentToken = $post['token'] ?? '';

    $stmt = $pdo->prepare("
        DELETE FROM user_sessions
        WHERE user_id = ? AND auth_token != ?
    ");
    $stmt->execute([$userId, $currentToken]);

    echo json_encode(['status' => 'ok', 'revoked' => $stmt->rowCount()]);
}

// ─── Update session TTL preference ────────────────────────────────────────────
function action_update_session_ttl($pdo, $currentUser, $post)
{
    $userId = $currentUser['id'];
    $ttl = (int) ($post['ttl_days'] ?? 30);

    // Allowed values: 7, 30, 90, 0 (never)
    if (!in_array($ttl, [7, 30, 90, 0])) {
        echo json_encode(['status' => 'error', 'message' => 'Invalid TTL value']);
        return;
    }

    $pdo->prepare("UPDATE users SET session_ttl_days = ? WHERE id = ?")
        ->execute([$ttl, $userId]);

    echo json_encode(['status' => 'ok', 'ttl_days' => $ttl]);
}

// ─── Update current session platform/device (called after TMA or web login detect migrated session) ─
function action_update_session_info($pdo, $currentUser, $post)
{
    $currentToken = $post['token'] ?? '';
    $platform = $post['platform'] ?? null;
    $device = $post['device'] ?? null;

    if (!$platform && !$device) {
        echo json_encode(['status' => 'error', 'message' => 'Nothing to update']);
        return;
    }

    $allowed = ['tma', 'web', 'dev'];
    if ($platform && !in_array($platform, $allowed)) {
        echo json_encode(['status' => 'error', 'message' => 'Invalid platform']);
        return;
    }

    $parts = [];
    $params = [];
    if ($platform) {
        $parts[] = 'platform = ?';
        $params[] = $platform;
    }
    if ($device) {
        $parts[] = 'device = ?';
        $params[] = mb_substr($device, 0, 150);
    }
    $params[] = $currentToken;

    $pdo->prepare('UPDATE user_sessions SET ' . implode(', ', $parts) . ' WHERE auth_token = ?')
        ->execute($params);

    echo json_encode(['status' => 'ok']);
}
?>