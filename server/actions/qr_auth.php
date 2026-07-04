<?php
// server/actions/qr_auth.php

// Ensure these are accessed through api.php and not directly
if (!defined('TG_CLIENT_ID') && !isset($pdo)) {
    exit;
}

function action_create_qr_login_intent($pdo, $currentUser, $post) {
    // Expected from browser without token (unauthenticated).
    
    // Rate limit: IP-based simple rate limit could be checked, but for MVP we rely on DB or basic structure.
    
    // device_label
    $ua = $_SERVER['HTTP_USER_AGENT'] ?? '';
    $deviceLabel = parseDeviceFromUA($ua);
    
    $intentId = bin2hex(random_bytes(16));
    $scanSecret = bin2hex(random_bytes(16));
    $browserSecret = bin2hex(random_bytes(16));
    
    $scanSecretHash = password_hash($scanSecret, PASSWORD_DEFAULT);
    $browserSecretHash = password_hash($browserSecret, PASSWORD_DEFAULT);
    
    // TTL: 90 seconds
    $expiresAt = date('Y-m-d H:i:s', time() + 90);
    
    $stmt = $pdo->prepare("
        INSERT INTO qr_auth_sessions 
        (intent_id, scan_secret_hash, browser_secret_hash, device_label, status, expires_at)
        VALUES (?, ?, ?, ?, 'pending', ?)
    ");
    
    $stmt->execute([
        $intentId, 
        $scanSecretHash, 
        $browserSecretHash, 
        $deviceLabel, 
        $expiresAt
    ]);
    
    // Payload for Mini App: pgbqr:v1:<intent_id>:<scan_secret>
    $qrPayload = "pgbqr:v1:{$intentId}:{$scanSecret}";
    
    echo json_encode([
        'status' => 'ok',
        'intent_id' => $intentId,
        'scan_secret' => $scanSecret,
        'browser_secret' => $browserSecret,
        'qr_payload' => $qrPayload,
        'expires_at' => $expiresAt,
        'device_label' => $deviceLabel
    ]);
    exit;
}

function action_poll_qr_login_intent($pdo, $currentUser, $post) {
    // Expected from browser without token
    $intentId = $post['intent_id'] ?? '';
    $browserSecret = $post['browser_secret'] ?? ''; // Optional to pass here, but good for security if we wanted to hide status from others
    
    if (!$intentId) {
        echo json_encode(['status' => 'error', 'message' => 'Missing intent_id']);
        exit;
    }
    
    $stmt = $pdo->prepare("SELECT status, expires_at FROM qr_auth_sessions WHERE intent_id = ?");
    $stmt->execute([$intentId]);
    $session = $stmt->fetch();
    
    if (!$session) {
        echo json_encode(['status' => 'expired']);
        exit;
    }
    
    if (strtotime($session['expires_at']) < time()) {
        echo json_encode(['status' => 'expired']);
        exit;
    }
    
    echo json_encode(['status' => $session['status']]);
    exit;
}

function action_scan_qr_login_intent($pdo, $currentUser, $post) {
    // Mini App -> requires valid $currentUser
    if (!$currentUser || !isset($currentUser['id'])) {
        echo json_encode(['status' => 'error', 'message' => 'Unauthorized']);
        exit;
    }
    
    $intentId = $post['intent_id'] ?? '';
    $scanSecret = $post['scan_secret'] ?? '';
    
    if (!$intentId || !$scanSecret) {
        echo json_encode(['status' => 'error', 'message' => 'Missing parameters']);
        exit;
    }
    
    $stmt = $pdo->prepare("SELECT * FROM qr_auth_sessions WHERE intent_id = ?");
    $stmt->execute([$intentId]);
    $session = $stmt->fetch();
    
    if (!$session) {
        echo json_encode(['status' => 'error', 'message' => 'Invalid intent']);
        exit;
    }
    
    if (strtotime($session['expires_at']) < time()) {
        echo json_encode(['status' => 'error', 'message' => 'QR code expired']);
        exit;
    }
    
    if (!password_verify($scanSecret, $session['scan_secret_hash'])) {
        echo json_encode(['status' => 'error', 'message' => 'Invalid secret']);
        exit;
    }
    
    if ($session['status'] === 'scanned' && (int)$session['user_id'] === (int)$currentUser['id']) {
        // Idempotent retry
        echo json_encode([
            'status' => 'ok',
            'session_status' => 'scanned',
            'device_label' => $session['device_label'],
            'expires_at' => $session['expires_at']
        ]);
        exit;
    }
    
    if ($session['status'] !== 'pending') {
        echo json_encode(['status' => 'error', 'message' => 'Intent already processed']);
        exit;
    }
    
    $updateStmt = $pdo->prepare("
        UPDATE qr_auth_sessions 
        SET status = 'scanned', user_id = ?, scanned_at = NOW() 
        WHERE id = ? AND status = 'pending'
    ");
    $updateStmt->execute([$currentUser['id'], $session['id']]);
    
    if ($updateStmt->rowCount() === 0) {
         echo json_encode(['status' => 'error', 'message' => 'Concurrent modification']);
         exit;
    }
    
    echo json_encode([
        'status' => 'ok',
        'session_status' => 'scanned',
        'device_label' => $session['device_label'],
        'expires_at' => $session['expires_at']
    ]);
    exit;
}

function action_approve_qr_login_intent($pdo, $currentUser, $post) {
    if (!$currentUser || !isset($currentUser['id'])) {
        echo json_encode(['status' => 'error', 'message' => 'Unauthorized']);
        exit;
    }
    
    $intentId = $post['intent_id'] ?? '';
    
    $stmt = $pdo->prepare("SELECT * FROM qr_auth_sessions WHERE intent_id = ?");
    $stmt->execute([$intentId]);
    $session = $stmt->fetch();
    
    if (!$session || (int)$session['user_id'] !== (int)$currentUser['id']) {
        echo json_encode(['status' => 'error', 'message' => 'Invalid intent']);
        exit;
    }
    
    if ($session['status'] === 'approved') {
        echo json_encode(['status' => 'ok']);
        exit;
    }
    
    if ($session['status'] !== 'scanned') {
        echo json_encode(['status' => 'error', 'message' => 'Intent is not in scanned state']);
        exit;
    }
    
    if (strtotime($session['expires_at']) < time()) {
        echo json_encode(['status' => 'error', 'message' => 'QR code expired']);
        exit;
    }
    
    $updateStmt = $pdo->prepare("
        UPDATE qr_auth_sessions 
        SET status = 'approved', approved_at = NOW() 
        WHERE id = ? AND status = 'scanned'
    ");
    $updateStmt->execute([$session['id']]);
    
    echo json_encode(['status' => 'ok']);
    exit;
}

function action_deny_qr_login_intent($pdo, $currentUser, $post) {
    if (!$currentUser || !isset($currentUser['id'])) {
        echo json_encode(['status' => 'error', 'message' => 'Unauthorized']);
        exit;
    }
    
    $intentId = $post['intent_id'] ?? '';
    
    $stmt = $pdo->prepare("SELECT * FROM qr_auth_sessions WHERE intent_id = ?");
    $stmt->execute([$intentId]);
    $session = $stmt->fetch();
    
    if (!$session || (int)$session['user_id'] !== (int)$currentUser['id']) {
        echo json_encode(['status' => 'error', 'message' => 'Invalid intent']);
        exit;
    }
    
    // Cannot deny if consumed
    if ($session['status'] === 'consumed') {
        echo json_encode(['status' => 'error', 'message' => 'Cannot deny a consumed session']);
        exit;
    }
    
    $updateStmt = $pdo->prepare("
        UPDATE qr_auth_sessions 
        SET status = 'denied', denied_at = NOW() 
        WHERE id = ? AND status IN ('pending', 'scanned')
    ");
    $updateStmt->execute([$session['id']]);
    
    echo json_encode(['status' => 'ok']);
    exit;
}

function action_redeem_qr_login_intent($pdo, $currentUser, $post) {
    // Browser without auth
    $intentId = $post['intent_id'] ?? '';
    $browserSecret = $post['browser_secret'] ?? '';
    
    if (!$intentId || !$browserSecret) {
        echo json_encode(['status' => 'error', 'message' => 'Missing parameters']);
        exit;
    }
    
    $stmt = $pdo->prepare("SELECT * FROM qr_auth_sessions WHERE intent_id = ?");
    $stmt->execute([$intentId]);
    $session = $stmt->fetch();
    
    if (!$session) {
        echo json_encode(['status' => 'error', 'message' => 'Invalid intent']);
        exit;
    }
    
    if ($session['status'] === 'consumed') {
        echo json_encode(['status' => 'error', 'message' => 'Intent already consumed']);
        exit;
    }
    
    if ($session['status'] !== 'approved') {
        echo json_encode(['status' => 'error', 'message' => 'Intent not approved']);
        exit;
    }
    
    if (strtotime($session['expires_at']) < time()) {
        echo json_encode(['status' => 'error', 'message' => 'Intent expired']);
        exit;
    }
    
    if (!password_verify($browserSecret, $session['browser_secret_hash'])) {
        echo json_encode(['status' => 'error', 'message' => 'Invalid secret']);
        exit;
    }
    
    // Atomic consume
    $updateStmt = $pdo->prepare("
        UPDATE qr_auth_sessions 
        SET status = 'consumed', consumed_at = NOW() 
        WHERE id = ? AND status = 'approved'
    ");
    $updateStmt->execute([$session['id']]);
    
    if ($updateStmt->rowCount() === 0) {
         echo json_encode(['status' => 'error', 'message' => 'Race condition, consume failed']);
         exit;
    }
    
    // Now create actual auth session
    // We need user's telegram_id to use registerOrLoginUser.
    $userStmt = $pdo->prepare("SELECT telegram_id FROM users WHERE id = ?");
    $userStmt->execute([$session['user_id']]);
    $targetTelegramId = $userStmt->fetchColumn();
    
    if (!$targetTelegramId) {
        echo json_encode(['status' => 'error', 'message' => 'User not found']);
        exit;
    }
    
    $token = registerOrLoginUser(['id' => $targetTelegramId], 'web', $session['device_label']);
    $user = getUserByToken($token);
    
    echo json_encode([
        'status' => 'ok',
        'token' => $token,
        'user' => $user
    ]);
    exit;
}
