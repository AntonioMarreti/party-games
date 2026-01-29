<?php
// server/lib/shared_helpers.php

function calculateLevel($xp) {
    if ($xp < 0) return 1;
    // Level = floor(sqrt(XP / 400)) + 1
    // Scale: 400->Lvl2, 1600->Lvl3, 10000->Lvl6, 100k->Lvl16
    return floor(sqrt($xp / 400)) + 1;
}

/**
 * Balanced XP Formula:
 * - Base per game: 20 XP
 * - Rank bonus: 1st: 100, 2nd: 50, 3rd: 20
 * - Score bonus: 10% of score, capped at 150 XP
 */
function calculateXP($rank, $score) {
    $base = 20;
    $rankBonus = 0;
    if ($rank === 1) $rankBonus = 100;
    elseif ($rank === 2) $rankBonus = 50;
    elseif ($rank === 3) $rankBonus = 20;
    
    $scoreBonus = min(150, floor(max(0, $score) / 10));
    
    return $base + $rankBonus + $scoreBonus;
}

function createNotification($pdo, $userId, $type, $actorId = null, $relatedId = null) {
    try {
        $pdo->prepare("INSERT INTO notifications (user_id, type, actor_user_id, related_id) VALUES (?, ?, ?, ?)")
            ->execute([$userId, $type, $actorId, $relatedId]);
    } catch (Exception $e) {
        TelegramLogger::logError('database', [
            'message' => $e->getMessage(),
            'code' => $e->getCode()
        ], [
            'user_id' => $userId,
            'action' => 'create_notification',
            'type' => $type
        ]);
    }
}

function check_achievements($pdo, $userId, $context = []) {
    // 1. Get Stats (ensure they are up to date)
    $stmt = $pdo->prepare("SELECT * FROM user_statistics WHERE user_id = ?");
    $stmt->execute([$userId]);
    $stats = $stmt->fetch();
    if (!$stats) {
        $pdo->prepare("INSERT IGNORE INTO user_statistics (user_id) VALUES (?)")->execute([$userId]);
        $stats = ['total_wins' => 0, 'total_games_played' => 0, 'longest_win_streak' => 0, 'total_points_earned' => 0];
    }

    // 2. Get All Achievements
    $achievements = $pdo->query("SELECT * FROM achievements")->fetchAll();
    
    // 3. Get User Unlocked
    $stmt = $pdo->prepare("SELECT achievement_id FROM user_achievements WHERE user_id = ?");
    $stmt->execute([$userId]);
    $unlockedIds = $stmt->fetchAll(PDO::FETCH_COLUMN);
    
    $newlyUnlocked = [];

    foreach ($achievements as $ach) {
        if (in_array($ach['id'], $unlockedIds)) continue;

        $unlocked = false;
        $val = $ach['condition_value'];

        switch ($ach['condition_type']) {
            case 'wins':
                if (($stats['total_wins'] ?? 0) >= $val) $unlocked = true;
                break;
            case 'games_played':
                if (($stats['total_games_played'] ?? 0) >= $val) $unlocked = true;
                break;
            case 'friends_added':
                $c = $pdo->prepare("SELECT COUNT(*) FROM friendships WHERE (user_id = ? OR friend_id = ?) AND status = 'accepted'");
                $c->execute([$userId, $userId]);
                if ($c->fetchColumn() >= $val) $unlocked = true;
                break;
            case 'game_event':
                if (!empty($context) && !empty($context['game_type'])) {
                    $gameType = $context['game_type'];
                    if ($ach['code'] === 'pacifist' && $gameType === 'blokus') {
                        if (isset($context['blocks_count']) && $context['blocks_count'] == 0) $unlocked = true;
                    }
                    else if ($ach['code'] === 'flash' && ($gameType === 'brainbattle' || $gameType === 'quiz')) {
                         if (isset($context['fastest_answer_ms']) && $context['fastest_answer_ms'] < $val) $unlocked = true;
                    }
                     else if ($ach['code'] === 'brute' && $gameType === 'bunker') {
                         if (isset($context['kicked_count']) && $context['kicked_count'] >= 3) $unlocked = true;
                    }
                }
                break;
        }

        if ($unlocked) {
            try {
                $pdo->prepare("INSERT INTO user_achievements (user_id, achievement_id) VALUES (?, ?)")->execute([$userId, $ach['id']]);
                createNotification($pdo, $userId, 'achievement_unlocked', null, $ach['id']);
                TelegramLogger::logEvent('achievement', "Achievement Unlocked!", ['user' => $userId, 'achievement' => $ach['code']]);
                $newlyUnlocked[] = $ach;
            } catch (Exception $e) {}
        }
    }
    return $newlyUnlocked;
}
