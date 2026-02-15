<?php
// server/lib/shared_helpers.php

function calculateLevel($xp)
{
    if ($xp < 0)
        return 1;
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
function calculateXP($rank, $score)
{
    $base = 20;
    $rankBonus = 0;
    if ($rank === 1)
        $rankBonus = 100;
    elseif ($rank === 2)
        $rankBonus = 50;
    elseif ($rank === 3)
        $rankBonus = 20;

    $scoreBonus = min(150, floor(max(0, $score) / 10));

    return $base + $rankBonus + $scoreBonus;
}

function createNotification($pdo, $userId, $type, $actorId = null, $relatedId = null)
{
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

function check_achievements($pdo, $userId, $context = [])
{
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
        if (in_array($ach['id'], $unlockedIds))
            continue;

        $unlocked = false;
        $val = $ach['condition_value'];

        switch ($ach['condition_type']) {
            case 'wins':
                if (($stats['total_wins'] ?? 0) >= $val)
                    $unlocked = true;
                break;
            case 'games_played':
                if (($stats['total_games_played'] ?? 0) >= $val)
                    $unlocked = true;
                break;
            case 'friends_added':
                $c = $pdo->prepare("SELECT COUNT(*) FROM friendships WHERE (user_id = ? OR friend_id = ?) AND status = 'accepted'");
                $c->execute([$userId, $userId]);
                if ($c->fetchColumn() >= $val)
                    $unlocked = true;
                break;
            case 'xp_milestone':
                if (($stats['total_points_earned'] ?? 0) >= $val)
                    $unlocked = true;
                break;
            case 'polyglot':
                // Check if user played all game types (hardcoded list or query distinct)
                // Current types: blokus, bunker, brainbattle, quiz?
                // Let's query distinct game_type from history
                $s = $pdo->prepare("SELECT COUNT(DISTINCT game_type) FROM game_history WHERE host_user_id = ? OR id IN (SELECT game_history_id FROM game_history_players WHERE user_id = ?)");
                $s->execute([$userId, $userId]);
                // Assume 4 main game types for now? Or just check if count >= 3 or 4
                // Let's set value to 4 or dynamic. If distinct >= 3 (Blokus, Bunker, Quiz) - enough for now.
                if ($s->fetchColumn() >= 3)
                    $unlocked = true;
                break;
            case 'bunker_streak':
                // Check last 3 bunker games
                $s = $pdo->prepare("
                    SELECT ghp.final_position 
                    FROM game_history_players ghp
                    JOIN game_history gh ON gh.id = ghp.game_history_id
                    WHERE ghp.user_id = ? AND gh.game_type = 'bunker'
                    ORDER BY gh.created_at DESC LIMIT ?
                ");
                $s->execute([$userId, $val]);
                $rows = $s->fetchAll(PDO::FETCH_COLUMN);
                if (count($rows) >= $val) {
                    $allWins = true;
                    foreach ($rows as $r) {
                        if ($r != 1)
                            $allWins = false;
                    }
                    if ($allWins)
                        $unlocked = true;
                }
                break;
            case 'game_event':
                if (!empty($context) && !empty($context['game_type'])) {
                    $gameType = $context['game_type'];
                    if ($ach['code'] === 'pacifist' && $gameType === 'blokus') {
                        if (isset($context['blocks_count']) && $context['blocks_count'] == 0)
                            $unlocked = true;
                    } else if ($ach['code'] === 'flash' && ($gameType === 'brainbattle' || $gameType === 'quiz')) {
                        if (isset($context['fastest_answer_ms']) && $context['fastest_answer_ms'] < $val)
                            $unlocked = true;
                    } else if ($ach['code'] === 'brute' && $gameType === 'bunker') {
                        if (isset($context['kicked_count']) && $context['kicked_count'] >= 3)
                            $unlocked = true;
                    } else if ($ach['code'] === 'tictactoe_master') {
                        $s = $pdo->prepare("SELECT COUNT(*) FROM game_history_players ghp JOIN game_history gh ON gh.id = ghp.game_history_id WHERE ghp.user_id = ? AND gh.game_type = 'tictactoe' AND ghp.final_position = 1");
                        $s->execute([$userId]);
                        if ($s->fetchColumn() >= $val)
                            $unlocked = true;
                    } else if ($ach['code'] === 'tictactoe_unbeatable') {
                        $s = $pdo->prepare("SELECT COUNT(*) FROM game_history_players ghp JOIN game_history gh ON gh.id = ghp.game_history_id WHERE ghp.user_id = ? AND gh.game_type = 'tictactoe' AND ghp.final_position = 2 AND ghp.final_score = 1");
                        // Marker: score 1 = draw, score 0 = loss
                        $s->execute([$userId]);
                        if ($s->fetchColumn() >= $val)
                            $unlocked = true;
                    } else if ($ach['code'] === 'night_owl') {
                        // Check current time or time of game
                        $hour = (int) date('H');
                        // After 2 AM means 02:00 to 05:00? Or just > 2.
                        // Let's say 2 AM to 6 AM.
                        if ($hour >= 2 && $hour < 6)
                            $unlocked = true;
                    } else if ($ach['code'] === 'strategist' && $gameType === 'blokus') {
                        // Check score diff
                        if (isset($context['score_diff']) && $context['score_diff'] >= 20)
                            $unlocked = true;
                        // OR if not passed directly, calculate from context if available (rank 1 vs rank 2)
                        // This might be hard if context only has current player data.
                        // 'action_game_finished' triggers this.
                        // For now accept if 'score_diff' is passed in context.
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
            } catch (Exception $e) {
            }
        }
    }
    return $newlyUnlocked;
}

function saveGameContent($pdo, $game, $type, $content, $tags = [], $source = 'ai_generated')
{
    try {
        $tagsStr = is_array($tags) ? implode(',', $tags) : $tags;
        $contentStr = is_array($content) ? json_encode($content, JSON_UNESCAPED_UNICODE) : $content;

        // Check for duplicates (simple check by content)
        // For large content this might be slow, but for short text it's fine.
        // Let's use MD5 hash for check if needed, or just exact string match limit.
        // For now, let's just insert. We can add UNIQUE constraint later if needed.
        // Actually, to avoid spamming duplicates, let's check.

        $stmt = $pdo->prepare("SELECT id FROM game_content_library WHERE game = ? AND type = ? AND content LIKE ? LIMIT 1");
        // substring check to be safe with text limits? No, exact match is better for "uniqueness"
        // But content is TEXT. 'LIKE' might be slow.
        // Let's just trust the intent or add a hash column later.
        // Simple optimization: don't check, just insert. It's a library. Cleaner scripts can dedup later.

        $stmt = $pdo->prepare("INSERT INTO game_content_library (game, type, content, tags, source) VALUES (?, ?, ?, ?, ?)");
        $stmt->execute([$game, $type, $contentStr, $tagsStr, $source]);

        return $pdo->lastInsertId();
    } catch (Exception $e) {
        TelegramLogger::logError('database', [
            'message' => $e->getMessage(),
            'code' => $e->getCode()
        ], [
            'action' => 'save_game_content',
            'game' => $game,
            'type' => $type,
            'source' => $source
        ]);
        return false;
    }
}
