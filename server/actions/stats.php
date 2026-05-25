<?php

require_once __DIR__ . '/../lib/gamification.php';

// === GAME HISTORY & STATS ===

function action_game_finished($pdo, $user, $data)
{
    $room = null;
    $gameType = null;
    $playersData = $data['players_data'] ?? []; // Array of {user_id, rank, score, ...}

    // If sent as JSON string from client
    if (is_string($playersData)) {
        $playersData = json_decode($playersData, true) ?? [];
    }

    try {
        $pdo->beginTransaction();

        $stmt = $pdo->prepare("
            SELECT r.*, rp.is_host
            FROM room_players rp
            JOIN rooms r ON r.id = rp.room_id
            WHERE rp.user_id = ?
            ORDER BY rp.id DESC
            LIMIT 1
            FOR UPDATE
        ");
        $stmt->execute([$user['id']]);
        $room = $stmt->fetch();

        if (!$room) {
            $pdo->rollBack();
            sendError('No room');
        }

        // Only Host can submit results to prevent cheating/spam
        if (!$room['is_host']) {
            $pdo->rollBack();
            sendError('Only host can submit results');
        }

        $gameType = $room['game_type'];
        $state = json_decode($room['game_state'] ?? '', true);
        if (is_array($state) && !empty($state['stats_recorded'])) {
            $pdo->commit();
            echo json_encode(['status' => 'ok', 'already_recorded' => true]);
            return;
        }

        // Validate playersData is array
        if (!is_array($playersData) || empty($playersData)) {
            $pdo->rollBack();
            sendError('Invalid players data');
        }

        // Use Helper
        recordGameStats($pdo, $room, $playersData, (int) ($data['duration'] ?? 0));

        if (is_array($state)) {
            $state['stats_recorded'] = true;
            $pdo->prepare("UPDATE rooms SET game_state = ? WHERE id = ?")
                ->execute([json_encode($state), $room['id']]);
        }

        // recordGameStats already handles the duration and history.
        // We REMOVE the automatic lobby jump here to allow users to see the results screen.
        // The transition back to the lobby should be explicitly triggered by the user via 'back_to_lobby'.
        // $pdo->prepare("UPDATE rooms SET game_type = 'lobby', status = 'waiting', game_state = NULL WHERE id = ?")->execute([$room['id']]);

        $pdo->commit();
        echo json_encode(['status' => 'ok']);

    } catch (Exception $e) {
        if ($pdo->inTransaction())
            $pdo->rollBack();
        TelegramLogger::log("Game Finish Error", ['error' => $e->getMessage(), 'room' => $room['room_code']]);
        sendError('Stats Error');
    }
}

function recordGameStats($pdo, $room, $playersData, $duration)
{
    $duration = (int) $duration;
    $room['host_user_id'] = (int) $room['host_user_id'];
    $playersData = statsNormalizePlayersData($playersData);

    if (empty($playersData)) {
        return;
    }

    $playerNames = statsLoadPlayerNames($pdo, array_column($playersData, 'user_id'));
    $winnerData = statsFindWinnerData($playersData, $playerNames);
    $historyPayload = statsBuildHistoryPayload($room, $playersData, $winnerData, $duration);
    $replayPayload = [
        'game_type' => $room['game_type'] ?? null,
        'source_room_code' => $room['room_code'] ?? null,
    ];

    // 2. Create Game History
    $stmt = $pdo->prepare("INSERT INTO game_history (room_code, game_type, host_user_id, players_count, duration_seconds) VALUES (?, ?, ?, ?, ?)");
    $stmt->execute([
        $room['room_code'],
        $room['game_type'],
        $room['host_user_id'],
        count($playersData),
        $duration
    ]);
    $gameHistoryId = $pdo->lastInsertId();

    $historyUpdates = [];
    $historyParams = [];
    if (statsColumnExists($pdo, 'game_history', 'winner_user_id')) {
        $historyUpdates[] = 'winner_user_id = ?';
        $historyParams[] = $winnerData['user_id'];
    }
    if (statsColumnExists($pdo, 'game_history', 'winner_name')) {
        $historyUpdates[] = 'winner_name = ?';
        $historyParams[] = $winnerData['name'];
    }
    if (statsColumnExists($pdo, 'game_history', 'summary_text')) {
        $historyUpdates[] = 'summary_text = ?';
        $historyParams[] = $historyPayload['summary_text'];
    }
    if (statsColumnExists($pdo, 'game_history', 'result_payload')) {
        $historyUpdates[] = 'result_payload = ?';
        $historyParams[] = statsJsonEncode($historyPayload);
    }
    if (statsColumnExists($pdo, 'game_history', 'replay_payload')) {
        $historyUpdates[] = 'replay_payload = ?';
        $historyParams[] = statsJsonEncode($replayPayload);
    }
    if ($historyUpdates) {
        $historyParams[] = $gameHistoryId;
        $pdo->prepare("UPDATE game_history SET " . implode(', ', $historyUpdates) . " WHERE id = ?")
            ->execute($historyParams);
    }

    // 3. Process Each Player
    foreach ($playersData as $pData) {
        $pid = (int) $pData['user_id'];
        $rank = (int) $pData['rank']; // 1 = winner
        $dScore = (int) ($pData['score'] ?? 0);
        $xpGained = calculateXP($rank, $dScore);
        $playerPayload = statsBuildPlayerResultPayload($pData, $playerNames, $winnerData, count($playersData), $xpGained);

        // A. Record History Player
        $columns = ['game_history_id', 'user_id', 'final_position', 'final_score'];
        $placeholders = ['?', '?', '?', '?'];
        $params = [$gameHistoryId, $pid, $rank, $dScore];
        if (statsColumnExists($pdo, 'game_history_players', 'xp_gained')) {
            $columns[] = 'xp_gained';
            $placeholders[] = '?';
            $params[] = $xpGained;
        }
        if (statsColumnExists($pdo, 'game_history_players', 'result_label')) {
            $columns[] = 'result_label';
            $placeholders[] = '?';
            $params[] = $playerPayload['result_label'];
        }
        if (statsColumnExists($pdo, 'game_history_players', 'result_payload')) {
            $columns[] = 'result_payload';
            $placeholders[] = '?';
            $params[] = statsJsonEncode($playerPayload);
        }

        $pdo->prepare("INSERT INTO game_history_players (" . implode(', ', $columns) . ") VALUES (" . implode(', ', $placeholders) . ")")
            ->execute($params);

        // B. Update User Stats (Atomic Update)
        updateUserStats($pdo, $pid, $rank, $dScore, $gameHistoryId);

        recordGamificationEvent($pdo, $pid, 'game_finished', 'game_history', $gameHistoryId, [
            'game_type' => $room['game_type'] ?? null,
            'rank' => $rank,
            'score' => $dScore,
        ]);
        if ($rank === 1) {
            recordGamificationEvent($pdo, $pid, 'win', 'game_history', $gameHistoryId, [
                'game_type' => $room['game_type'] ?? null,
                'score' => $dScore,
            ]);
        }
    }

    TelegramLogger::logEvent('game', "Game Finished", [
        'id' => $gameHistoryId,
        'type' => $room['game_type'],
        'players' => count($playersData)
    ]);

    // 5. Trigger Achievements for ALL players
    foreach ($playersData as $pData) {
        if (function_exists('check_achievements')) {
            $context = $pData;
            $context['game_type'] = $room['game_type'];
            check_achievements($pdo, $pData['user_id'], $context);
        }
    }
}

function statsNormalizePlayersData($playersData)
{
    if (!is_array($playersData)) {
        return [];
    }

    $normalized = [];
    foreach ($playersData as $entry) {
        if (!is_array($entry) || empty($entry['user_id'])) {
            continue;
        }

        $rank = max(1, (int) ($entry['rank'] ?? $entry['final_position'] ?? 999));
        $score = (int) ($entry['score'] ?? $entry['final_score'] ?? 0);
        $normalized[] = [
            'user_id' => (int) $entry['user_id'],
            'rank' => $rank,
            'score' => $score,
        ];
    }

    usort($normalized, function ($a, $b) {
        if ($a['rank'] === $b['rank']) {
            return $b['score'] <=> $a['score'];
        }
        return $a['rank'] <=> $b['rank'];
    });

    return $normalized;
}

function statsColumnExists($pdo, $table, $column)
{
    static $cache = [];
    $allowed = ['game_history', 'game_history_players'];
    if (!in_array($table, $allowed, true)) {
        return false;
    }

    $key = $table . '.' . $column;
    if (array_key_exists($key, $cache)) {
        return $cache[$key];
    }

    try {
        $stmt = $pdo->prepare("SHOW COLUMNS FROM `$table` LIKE ?");
        $stmt->execute([$column]);
        $cache[$key] = (bool) $stmt->fetch();
    } catch (Exception $e) {
        $cache[$key] = false;
    }

    return $cache[$key];
}

function statsJsonEncode($value)
{
    return json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}

function statsLoadPlayerNames($pdo, $userIds)
{
    $ids = array_values(array_unique(array_filter(array_map('intval', $userIds))));
    if (empty($ids)) {
        return [];
    }

    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $stmt = $pdo->prepare("
        SELECT id, COALESCE(NULLIF(custom_name, ''), NULLIF(first_name, ''), username, CONCAT('Игрок ', id)) AS display_name
        FROM users
        WHERE id IN ($placeholders)
    ");
    $stmt->execute($ids);

    $names = [];
    foreach ($stmt->fetchAll() as $row) {
        $names[(int) $row['id']] = $row['display_name'];
    }

    return $names;
}

function statsFindWinnerData($playersData, $playerNames)
{
    $winner = $playersData[0] ?? null;
    if (!$winner) {
        return ['user_id' => null, 'name' => null, 'score' => 0];
    }

    $winnerId = (int) $winner['user_id'];
    return [
        'user_id' => $winnerId,
        'name' => $playerNames[$winnerId] ?? null,
        'score' => (int) ($winner['score'] ?? 0),
    ];
}

function statsBuildHistoryPayload($room, $playersData, $winnerData, $duration)
{
    $topScore = (int) ($winnerData['score'] ?? 0);
    $winnerName = $winnerData['name'] ?? null;

    return [
        'game_type' => $room['game_type'] ?? null,
        'winner_user_id' => $winnerData['user_id'] ?? null,
        'winner_name' => $winnerName,
        'top_score' => $topScore,
        'players_count' => count($playersData),
        'duration_seconds' => (int) $duration,
        'summary_text' => $winnerName
            ? "Победитель: {$winnerName} · {$topScore} очков"
            : "Итог партии · {$topScore} очков",
    ];
}

function statsBuildPlayerResultPayload($playerData, $playerNames, $winnerData, $playersCount, $xpGained)
{
    $rank = (int) ($playerData['rank'] ?? 0);
    $score = (int) ($playerData['score'] ?? 0);
    $playerId = (int) ($playerData['user_id'] ?? 0);
    $isWin = $rank === 1;
    $resultLabel = $isWin ? "Победа · {$score} очков" : "{$rank} место · {$score} очков";

    return [
        'player_user_id' => $playerId,
        'player_name' => $playerNames[$playerId] ?? null,
        'place' => $rank,
        'score' => $score,
        'xp_gained' => (int) $xpGained,
        'is_win' => $isWin,
        'winner_user_id' => $winnerData['user_id'] ?? null,
        'winner_name' => $winnerData['name'] ?? null,
        'players_count' => (int) $playersCount,
        'result_label' => $resultLabel,
    ];
}

function updateUserStats($pdo, $userId, $rank, $score, $gameId)
{
    // Get current stats (for Elo and Streak)
    $stmt = $pdo->prepare("SELECT * FROM user_statistics WHERE user_id = ?");
    $stmt->execute([(int) $userId]);
    $stats = $stmt->fetch();

    if (!$stats) {
        $pdo->prepare("INSERT IGNORE INTO user_statistics (user_id) VALUES (?)")->execute([(int) $userId]);
        $stats = ['total_wins' => 0, 'total_losses' => 0, 'win_streak' => 0, 'longest_win_streak' => 0, 'rating' => 1000, 'total_points_earned' => 0];
    }

    // Ensure rank and score are integers
    $rank = (int) $rank;
    $score = (int) $score;
    $isWin = ($rank === 1);

    // Calc New Stats - explicitly cast to int to prevent string issues
    $newWins = (int) $stats['total_wins'] + ($isWin ? 1 : 0);
    $newLosses = (int) $stats['total_losses'] + ($isWin ? 0 : 1);
    $newStreak = $isWin ? ((int) $stats['win_streak'] + 1) : 0;
    $newMaxStreak = max((int) ($stats['longest_win_streak'] ?? 0), $newStreak);

    // Use the balanced helper
    $xpGained = calculateXP($rank, $score);
    $newPoints = (int) $stats['total_points_earned'] + (int) $xpGained;

    // ELO CALCULATION (Simplified)
    // Real Elo needs opponent rating. Here we assume "Environment Rating" = 1200 or Average of room?
    // Let's use simple constant gain/loss for now to keep it robust
    $k = 32;
    $ratingChange = 0;
    if ($isWin)
        $ratingChange = $k;
    else
        $ratingChange = -$k / 2; // Lose less than win

    $newRating = max(0, (int) $stats['rating'] + $ratingChange); // No negative rating

    // UPDATE DB - all parameters explicitly cast to ensure proper types
    $sql = "UPDATE user_statistics SET 
        total_games_played = total_games_played + 1,
        total_wins = ?,
        total_losses = ?,
        win_streak = ?,
        longest_win_streak = ?,
        total_points_earned = ?,
        rating = ?
        WHERE user_id = ?";

    $pdo->prepare($sql)->execute([
        (int) $newWins,
        (int) $newLosses,
        (int) $newStreak,
        (int) $newMaxStreak,
        (int) $newPoints,
        (int) $newRating,
        (int) $userId
    ]);
}

// === LEADERBOARDS ===

function action_get_leaderboard($pdo, $user, $data)
{
    $type = $data['type'] ?? 'global'; // 'global', 'friends'
    $limit = (int) ($data['limit'] ?? 50);
    if ($limit > 100)
        $limit = 100;

    try {
        if ($type === 'global') {
            $sql = "
                SELECT s.rating, s.total_wins, s.total_points_earned, u.id, u.first_name, u.custom_name, u.photo_url, u.custom_avatar
                FROM user_statistics s
                JOIN users u ON u.id = s.user_id
                WHERE u.is_hidden_in_leaderboard = 0
                ORDER BY s.total_points_earned DESC, s.user_id ASC
                LIMIT ?
            ";
            $stmt = $pdo->prepare($sql);
            $stmt->bindValue(1, $limit, PDO::PARAM_INT);
            $stmt->execute();
            $board = $stmt->fetchAll();
            foreach ($board as &$entry) {
                $entry['level'] = calculateLevel($entry['total_points_earned'] ?? 0); // Note: verify if total_points_earned is selected
            }
        } elseif ($type === 'friends') {
            // Get friends IDs first
            // Reuse logic from get_friends query but simplified
            $friendsSql = "
                SELECT CASE WHEN user_id = ? THEN friend_id ELSE user_id END as uid
                FROM friendships 
                WHERE (user_id = ? OR friend_id = ?) AND status = 'accepted'
            ";
            $stmt = $pdo->prepare($friendsSql);
            $stmt->execute([$user['id'], $user['id'], $user['id']]);
            $fids = $stmt->fetchAll(PDO::FETCH_COLUMN);
            $fids[] = $user['id']; // Include self

            $placeholders = implode(',', array_fill(0, count($fids), '?'));

            $sql = "
                SELECT s.rating, s.total_wins, s.total_points_earned, u.id, u.first_name, u.custom_name, u.photo_url, u.custom_avatar
                FROM user_statistics s
                JOIN users u ON u.id = s.user_id
                WHERE s.user_id IN ($placeholders)
                ORDER BY s.total_points_earned DESC, s.user_id ASC
                LIMIT ?
            ";
            $stmt = $pdo->prepare($sql);
            foreach ($fids as $index => $fid) {
                $stmt->bindValue($index + 1, (int) $fid, PDO::PARAM_INT);
            }
            $stmt->bindValue(count($fids) + 1, $limit, PDO::PARAM_INT);
            $stmt->execute();
            $board = $stmt->fetchAll();
            foreach ($board as &$entry) {
                $entry['level'] = calculateLevel($entry['total_points_earned'] ?? 0);
            }
        } else {
            $board = [];
        }

        echo json_encode(['status' => 'ok', 'leaderboard' => $board]);

    } catch (Exception $e) {
        TelegramLogger::log("Leaderboard Error", ['error' => $e->getMessage()]);
        sendError('Database Error');
    }
}

function action_get_stats($pdo, $user, $data)
{
    $targetId = (int) ($data['user_id'] ?? $user['id']);

    $stmt = $pdo->prepare("SELECT * FROM user_statistics WHERE user_id = ?");
    $stmt->execute([$targetId]);
    $stats = $stmt->fetch();

    if (!$stats) {
        // Return empty stats if not played yet, but strictly formatted
        $stats = [
            'user_id' => $targetId,
            'total_games_played' => 0,
            'total_wins' => 0,
            'total_losses' => 0,
            'win_streak' => 0,
            'longest_win_streak' => 0,
            'rating' => 1000,
            'total_points_earned' => 0
        ];
    }

    $stats['level'] = calculateLevel($stats['total_points_earned']);

    // Add Level
    $stats['level'] = calculateLevel($stats['total_points_earned'] ?? 0);

    // Add Achievements
    $stmt = $pdo->prepare("
        SELECT a.*, ua.unlocked_at
        FROM achievements a
        JOIN user_achievements ua ON ua.achievement_id = a.id
        WHERE ua.user_id = ?
        ORDER BY COALESCE(a.sort_order, 100), a.id
    ");
    $stmt->execute([$targetId]);
    $stats['achievements'] = $stmt->fetchAll();

    echo json_encode(['status' => 'ok', 'stats' => $stats]);
}

function action_get_history($pdo, $user, $data)
{
    $targetId = (int) ($data['user_id'] ?? $user['id']);
    $limit = (int) ($data['limit'] ?? 50);
    if ($limit > 100)
        $limit = 100;

    try {
        $historyWinnerName = statsColumnExists($pdo, 'game_history', 'winner_name')
            ? "COALESCE(NULLIF(gh.winner_name, ''), (
                       SELECT GROUP_CONCAT(COALESCE(NULLIF(u.custom_name, ''), u.first_name) SEPARATOR ', ')
                       FROM game_history_players winners
                       JOIN users u ON u.id = winners.user_id
                       WHERE winners.game_history_id = gh.id
                         AND winners.final_position = 1
                   )) AS winner_name"
            : "(
                       SELECT GROUP_CONCAT(COALESCE(NULLIF(u.custom_name, ''), u.first_name) SEPARATOR ', ')
                       FROM game_history_players winners
                       JOIN users u ON u.id = winners.user_id
                       WHERE winners.game_history_id = gh.id
                         AND winners.final_position = 1
                   ) AS winner_name";

        $optionalHistoryFields = [
            statsColumnExists($pdo, 'game_history', 'winner_user_id') ? 'gh.winner_user_id' : 'NULL AS winner_user_id',
            statsColumnExists($pdo, 'game_history', 'summary_text') ? 'gh.summary_text' : 'NULL AS summary_text',
            statsColumnExists($pdo, 'game_history', 'result_payload') ? 'gh.result_payload AS game_result_payload' : 'NULL AS game_result_payload',
            statsColumnExists($pdo, 'game_history', 'replay_payload') ? 'gh.replay_payload' : 'NULL AS replay_payload',
            statsColumnExists($pdo, 'game_history_players', 'xp_gained') ? 'ghp.xp_gained' : 'NULL AS xp_gained',
            statsColumnExists($pdo, 'game_history_players', 'result_label') ? 'ghp.result_label' : 'NULL AS result_label',
            statsColumnExists($pdo, 'game_history_players', 'result_payload') ? 'ghp.result_payload AS player_result_payload' : 'NULL AS player_result_payload',
        ];

        $stmt = $pdo->prepare("
            SELECT gh.id, gh.game_type, gh.duration_seconds, gh.created_at, gh.players_count,
                   ghp.final_position, ghp.final_score,
                   $historyWinnerName,
                   " . implode(",\n                   ", $optionalHistoryFields) . "
            FROM game_history_players ghp
            JOIN game_history gh ON gh.id = ghp.game_history_id
            WHERE ghp.user_id = ?
            ORDER BY gh.created_at DESC
            LIMIT $limit
        ");
        $stmt->execute([$targetId]);
        $history = $stmt->fetchAll();

        foreach ($history as &$item) {
            foreach (['game_result_payload', 'player_result_payload', 'replay_payload'] as $field) {
                if (!empty($item[$field]) && is_string($item[$field])) {
                    $decoded = json_decode($item[$field], true);
                    $item[$field] = is_array($decoded) ? $decoded : null;
                }
            }
        }

        echo json_encode(['status' => 'ok', 'history' => $history]);
    } catch (Exception $e) {
        TelegramLogger::log("History Error", ['error' => $e->getMessage()]);
        sendError('Database Error');
    }
}
