-- Migration 004: Multi-session auth
-- Creates user_sessions table and migrates existing auth_token values

CREATE TABLE IF NOT EXISTS user_sessions (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    user_id    INT NOT NULL,
    auth_token VARCHAR(64) UNIQUE NOT NULL,
    platform   ENUM('tma', 'web', 'dev') DEFAULT 'web',
    device     VARCHAR(150) DEFAULT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_used  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_token  (auth_token),
    INDEX idx_user   (user_id),
    INDEX idx_last   (last_used)
);

-- Migrate existing tokens from users table (each becomes a 'web' session)
INSERT IGNORE INTO user_sessions (user_id, auth_token, platform, device, created_at, last_used)
SELECT id, auth_token, 'web', 'Перенесено из старой системы', NOW(), NOW()
FROM users
WHERE auth_token IS NOT NULL AND auth_token != '';

-- Add session_ttl_days column to users (default 30 days)
ALTER TABLE users ADD COLUMN IF NOT EXISTS session_ttl_days INT DEFAULT 30;
