<?php
// server/games/brainbattle.php

if (!defined('BRAINBATTLE_ROUND_TIMEOUT_SECONDS')) {
    define('BRAINBATTLE_ROUND_TIMEOUT_SECONDS', 30);
}

function getGameLibrary()
{
    return [
        'logic' => ['math_blitz', 'greater_less'],
        'attention' => ['color_chaos', 'odd_one_out', 'count_objects', 'find_duplicate', 'thimbles'],
        'motor' => ['reaction_test', 'timing_safe', 'defuse_numbers'],
        'memory' => ['photo_memory', 'blind_timer', 'simon_says'],
        'erudition' => ['edible_inedible', 'alchemy', 'ai_quiz', 'fact_check']
    ];
}

function getInitialState()
{
    return [
        'phase' => 'setup',
        'current_round' => 0,
        'total_rounds' => 5,
        'round_id' => null,
        'remaining_games' => [], // Очередь для честной ротации
        'scores' => [],
        'round_data' => null,
        'round_results' => [],
        'round_history' => [],
        'selected_categories' => ['logic', 'attention', 'motor', 'memory', 'erudition'],
        'previous_game_type' => null,
        'round_chat_sent' => false,
        'started_at' => null,
        'round_started_at' => null,
        'round_timeout_seconds' => BRAINBATTLE_ROUND_TIMEOUT_SECONDS,
        'stats_recorded' => false
    ];
}

function bbNormalizeState($state)
{
    if (!is_array($state)) {
        $state = getInitialState();
    }

    $defaults = getInitialState();
    foreach ($defaults as $key => $value) {
        if (!array_key_exists($key, $state)) {
            $state[$key] = $value;
        }
    }

    if (!is_array($state['scores'])) {
        $state['scores'] = [];
    }
    if (!is_array($state['round_results'])) {
        $state['round_results'] = [];
    }
    if (!is_array($state['round_history'])) {
        $state['round_history'] = [];
    }

    return $state;
}

function bbGetPlayerIds($pdo, $roomId)
{
    $stmt = $pdo->prepare("SELECT user_id FROM room_players WHERE room_id = ? ORDER BY id ASC");
    $stmt->execute([$roomId]);
    return array_map('strval', $stmt->fetchAll(PDO::FETCH_COLUMN));
}

function bbGetHumanIds($pdo, $roomId)
{
    $stmt = $pdo->prepare("SELECT rp.user_id FROM room_players rp JOIN users u ON u.id = rp.user_id WHERE rp.room_id = ? AND u.is_bot = 0 ORDER BY rp.id ASC");
    $stmt->execute([$roomId]);
    return array_map('strval', $stmt->fetchAll(PDO::FETCH_COLUMN));
}

function bbEnsureScoreRows(&$state, $playerIds)
{
    foreach ($playerIds as $pid) {
        $pid = (string) $pid;
        if (!isset($state['scores'][$pid])) {
            $state['scores'][$pid] = 0;
        }
    }
}

function bbScoreFactor($gameType)
{
    $factors = [
        // Быстрые игры (реакция) - штраф жесткий
        'reaction_test' => 5,
        'timing_safe' => 6,
        'color_chaos' => 7,

        // Игры средней сложности
        'math_blitz' => 8,
        'greater_less' => 8,
        'odd_one_out' => 10,
        'find_duplicate' => 10,
        'defuse_numbers' => 8,
        'alchemy' => 10,
        'simon_says' => 10,

        // Медленные/сложные игры (где нужно время на подумать/посмотреть) - штраф мягкий
        'thimbles' => 15,
        'count_objects' => 12,
        'photo_memory' => 15,
        'blind_timer' => 8,
        'ai_quiz' => 20,
        'fact_check' => 18,
        'edible_inedible' => 12
    ];

    return $factors[$gameType] ?? 8;
}

function bbCalculateScore($gameType, $timeMs, $isCorrect)
{
    return (int) bbBuildScoreBreakdown($gameType, $timeMs, $isCorrect)['final_score'];
}

function bbGetRoundTimeoutSeconds($state)
{
    $timeout = (int) ($state['round_timeout_seconds'] ?? BRAINBATTLE_ROUND_TIMEOUT_SECONDS);
    return max(1, min(300, $timeout));
}

function bbEnsureRoundTimer(&$state)
{
    if (($state['phase'] ?? '') !== 'playing') {
        return;
    }
    if (empty($state['round_started_at'])) {
        $state['round_started_at'] = time();
    }
    $state['round_timeout_seconds'] = bbGetRoundTimeoutSeconds($state);
}

function bbIsRoundTimedOut($state, $now = null)
{
    $startedAt = (int) ($state['round_started_at'] ?? 0);
    if ($startedAt <= 0) {
        return false;
    }

    $now = $now ?? time();
    return ($now - $startedAt) >= bbGetRoundTimeoutSeconds($state);
}

function bbBuildTimeoutResult($state)
{
    $timeoutMs = bbGetRoundTimeoutSeconds($state) * 1000;
    $gameType = (string) ($state['previous_game_type'] ?? '');

    return [
        'time' => $timeoutMs,
        'response_time_ms' => null,
        'correct' => false,
        'success' => false,
        'score' => 0,
        'score_delta' => 0,
        'answer' => null,
        'timed_out' => true,
        'score_breakdown' => bbBuildScoreBreakdown($gameType, $timeoutMs, false, [
            'timed_out' => true
        ])
    ];
}

function bbTimeoutMissingHumanAnswers($pdo, $room, &$state)
{
    if (($state['phase'] ?? '') !== 'playing' || !bbIsRoundTimedOut($state)) {
        return false;
    }

    $timedOutUserIds = [];
    foreach (bbGetHumanIds($pdo, $room['id']) as $pid) {
        $pid = (string) $pid;
        if (isset($state['round_results'][$pid])) {
            continue;
        }

        $state['round_results'][$pid] = bbBuildTimeoutResult($state);
        $timedOutUserIds[] = $pid;
    }

    if (empty($timedOutUserIds)) {
        return false;
    }

    if (class_exists('TelegramLogger')) {
        TelegramLogger::logEvent('game', 'brainbattle_round_timeout', [
            'room_id' => (int) ($room['id'] ?? 0),
            'room_code' => $room['room_code'] ?? null,
            'round' => (int) ($state['current_round'] ?? 0),
            'round_id' => (string) ($state['round_id'] ?? ''),
            'timed_out_user_ids' => $timedOutUserIds,
            'timeout_seconds' => bbGetRoundTimeoutSeconds($state)
        ]);
    }

    return true;
}

function bbNormalizeAnswerValue($value)
{
    if (is_bool($value)) {
        return $value ? '1' : '0';
    }
    if (is_int($value) || is_float($value)) {
        return (string) (0 + $value);
    }
    if (is_string($value)) {
        return trim($value);
    }
    return null;
}

function bbAnswersMatch($answer, $correctValue)
{
    $answerValue = bbNormalizeAnswerValue($answer);
    $correctAnswerValue = bbNormalizeAnswerValue($correctValue);

    if ($answerValue === null || $correctAnswerValue === null || $answerValue === '') {
        return false;
    }

    if (is_numeric($answerValue) && is_numeric($correctAnswerValue)) {
        return abs((float) $answerValue - (float) $correctAnswerValue) < 0.000001;
    }

    return hash_equals($correctAnswerValue, $answerValue);
}

function bbEvaluateSubmittedAnswer($gameType, $roundData, $answer, $timeMs)
{
    $gameType = (string) $gameType;

    if ($gameType === 'reaction_test') {
        return is_numeric($timeMs) && (float) $timeMs > 0 && (float) $timeMs < 9999;
    }

    if ($gameType === 'blind_timer') {
        return is_numeric($timeMs) && (float) $timeMs >= 0 && (float) $timeMs <= 60000;
    }

    if ($gameType === 'timing_safe') {
        if (!is_numeric($answer)) {
            return false;
        }
        $position = (float) $answer;
        return $position >= 40 && $position <= 60;
    }

    if ($gameType === 'defuse_numbers') {
        return bbAnswersMatch($answer, 9);
    }

    if (!is_array($roundData) || !array_key_exists('correct_val', $roundData)) {
        return false;
    }

    return bbAnswersMatch($answer, $roundData['correct_val']);
}

function bbBuildScoreBreakdown($gameType, $timeMs, $isCorrect, $meta = [])
{
    $gameType = (string) $gameType;
    $timeMs = max(0, min(60000, (float) $timeMs));
    $factor = bbScoreFactor($gameType);
    $tooFastRejected = !empty($meta['too_fast_rejected']);
    $isBlindTimer = $gameType === 'blind_timer';

    if (!$isCorrect) {
        return [
            'game_type' => $gameType,
            'time_ms' => $timeMs,
            'score_factor' => $factor,
            'raw_score' => 0,
            'final_score' => 0,
            'minimum_applied' => false,
            'is_blind_timer' => $isBlindTimer,
            'reason' => !empty($meta['timed_out']) ? 'timed_out' : ($tooFastRejected ? 'too_fast_rejected' : 'incorrect')
        ];
    }

    $rawScore = (int) (1000 - floor($timeMs / $factor));
    $finalScore = (int) max(100, $rawScore);

    return [
        'game_type' => $gameType,
        'time_ms' => $timeMs,
        'score_factor' => $factor,
        'raw_score' => $rawScore,
        'final_score' => $finalScore,
        'minimum_applied' => $rawScore < 100,
        'is_blind_timer' => $isBlindTimer,
        'reason' => ($rawScore < 100) ? 'correct_minimum_applied' : 'correct'
    ];
}

function bbStoreRoundHistoryEntry(&$state)
{
    $roundData = is_array($state['round_data'] ?? null) ? $state['round_data'] : [];
    $results = is_array($state['round_results'] ?? null) ? $state['round_results'] : [];
    $scores = is_array($state['scores'] ?? null) ? $state['scores'] : [];

    $entry = [
        'round_number' => (int) ($state['current_round'] ?? 0),
        'round_id' => (string) ($state['round_id'] ?? ''),
        'game_type' => (string) ($state['previous_game_type'] ?? ($roundData['type'] ?? '')),
        'title' => (string) ($roundData['title'] ?? 'Раунд'),
        'question' => (string) ($roundData['question'] ?? ''),
        'correct_val' => $roundData['correct_val'] ?? null,
        'score_factor' => bbScoreFactor((string) ($state['previous_game_type'] ?? ($roundData['type'] ?? ''))),
        'round_results' => $results,
        'scores_after_round' => $scores
    ];

    $history = $state['round_history'] ?? [];
    $replaced = false;
    foreach ($history as $index => $existing) {
        if (($existing['round_id'] ?? '') === $entry['round_id']) {
            $history[$index] = $entry;
            $replaced = true;
            break;
        }
    }
    if (!$replaced) {
        $history[] = $entry;
    }
    $state['round_history'] = array_values($history);
}

function bbBuildLeaderboardSnapshot($state, $players)
{
    $scores = is_array($state['scores'] ?? null) ? $state['scores'] : [];
    $entries = [];

    foreach ($players as $player) {
        $playerId = (string) ($player['id'] ?? '');
        if ($playerId === '') {
            continue;
        }

        $entries[] = [
            'id' => $playerId,
            'name' => (string) ($player['first_name'] ?? ('Player ' . $playerId)),
            'score' => (int) ($scores[$playerId] ?? 0)
        ];
    }

    usort($entries, function ($a, $b) {
        if ($a['score'] === $b['score']) {
            return strcmp($a['name'], $b['name']);
        }
        return $b['score'] <=> $a['score'];
    });

    foreach ($entries as $index => &$entry) {
        $entry['rank'] = $index + 1;
    }
    unset($entry);

    return $entries;
}

function bbBuildMatchSummaryPayload($state, $players)
{
    $history = is_array($state['round_history'] ?? null) ? $state['round_history'] : [];
    $leaderboard = bbBuildLeaderboardSnapshot($state, $players);
    $statsByPlayer = [];

    foreach ($leaderboard as $entry) {
        $statsByPlayer[$entry['id']] = [
            'name' => $entry['name'],
            'score' => (int) $entry['score'],
            'rank' => (int) $entry['rank'],
            'correct_answers' => 0,
            'wrong_answers' => 0,
            'answered_rounds' => 0,
            'first_places' => 0,
            'best_round_score' => 0,
            'fastest_correct_ms' => null
        ];
    }

    $roundNotes = [];
    $fastestAnswer = null;

    foreach ($history as $round) {
        $roundResults = is_array($round['round_results'] ?? null) ? $round['round_results'] : [];
        $topScore = null;
        $topNames = [];

        foreach ($roundResults as $playerId => $result) {
            $playerId = (string) $playerId;
            if (!isset($statsByPlayer[$playerId])) {
                continue;
            }

            $score = (int) ($result['score'] ?? 0);
            $correct = !empty($result['correct']);
            $timeMs = (int) round((float) ($result['time'] ?? 0));

            $statsByPlayer[$playerId]['answered_rounds']++;
            $statsByPlayer[$playerId]['best_round_score'] = max($statsByPlayer[$playerId]['best_round_score'], $score);

            if ($correct) {
                $statsByPlayer[$playerId]['correct_answers']++;
                if ($statsByPlayer[$playerId]['fastest_correct_ms'] === null || $timeMs < $statsByPlayer[$playerId]['fastest_correct_ms']) {
                    $statsByPlayer[$playerId]['fastest_correct_ms'] = $timeMs;
                }

                if ($fastestAnswer === null || $timeMs < $fastestAnswer['time_ms']) {
                    $fastestAnswer = [
                        'name' => $statsByPlayer[$playerId]['name'],
                        'time_ms' => $timeMs,
                        'round_number' => (int) ($round['round_number'] ?? 0),
                        'game_type' => (string) ($round['game_type'] ?? '')
                    ];
                }
            } else {
                $statsByPlayer[$playerId]['wrong_answers']++;
            }

            if ($topScore === null || $score > $topScore) {
                $topScore = $score;
                $topNames = [$statsByPlayer[$playerId]['name']];
            } elseif ($score === $topScore) {
                $topNames[] = $statsByPlayer[$playerId]['name'];
            }
        }

        foreach ($roundResults as $playerId => $result) {
            if ((int) ($result['score'] ?? 0) === (int) $topScore && isset($statsByPlayer[(string) $playerId])) {
                $statsByPlayer[(string) $playerId]['first_places']++;
            }
        }

        if ($topScore !== null) {
            $roundNotes[] = [
                'round' => (int) ($round['round_number'] ?? 0),
                'title' => (string) ($round['title'] ?? ($round['game_type'] ?? 'Раунд')),
                'winner_names' => array_values(array_unique($topNames)),
                'top_score' => (int) $topScore
            ];
        }
    }

    $bestAccuracy = null;
    $mostWins = null;
    foreach ($statsByPlayer as $playerId => $playerStats) {
        $accuracy = $playerStats['answered_rounds'] > 0
            ? round(($playerStats['correct_answers'] / $playerStats['answered_rounds']) * 100)
            : 0;
        $statsByPlayer[$playerId]['accuracy_percent'] = (int) $accuracy;

        if ($bestAccuracy === null || $accuracy > $bestAccuracy['accuracy_percent']) {
            $bestAccuracy = [
                'name' => $playerStats['name'],
                'accuracy_percent' => (int) $accuracy
            ];
        }

        if ($mostWins === null || $playerStats['first_places'] > $mostWins['first_places']) {
            $mostWins = [
                'name' => $playerStats['name'],
                'first_places' => (int) $playerStats['first_places']
            ];
        }
    }

    $winner = $leaderboard[0] ?? null;
    $runnerUp = $leaderboard[1] ?? null;

    return [
        'mode' => 'brainbattle',
        'total_rounds' => (int) ($state['total_rounds'] ?? count($history)),
        'played_rounds' => count($history),
        'winner' => $winner ? [
            'name' => $winner['name'],
            'score' => (int) $winner['score']
        ] : null,
        'runner_up' => $runnerUp ? [
            'name' => $runnerUp['name'],
            'score' => (int) $runnerUp['score']
        ] : null,
        'leaderboard' => array_map(function ($entry) use ($statsByPlayer) {
            $stats = $statsByPlayer[$entry['id']] ?? [];
            return [
                'rank' => (int) $entry['rank'],
                'name' => $entry['name'],
                'score' => (int) $entry['score'],
                'correct_answers' => (int) ($stats['correct_answers'] ?? 0),
                'accuracy_percent' => (int) ($stats['accuracy_percent'] ?? 0),
                'first_places' => (int) ($stats['first_places'] ?? 0),
                'best_round_score' => (int) ($stats['best_round_score'] ?? 0)
            ];
        }, array_slice($leaderboard, 0, 6)),
        'highlights' => array_values(array_filter([
            $fastestAnswer ? [
                'type' => 'fastest_answer',
                'text' => $fastestAnswer['name'] . ' дал самый быстрый верный ответ за ' . $fastestAnswer['time_ms'] . ' мс'
            ] : null,
            $bestAccuracy ? [
                'type' => 'best_accuracy',
                'text' => $bestAccuracy['name'] . ' показал лучшую точность: ' . $bestAccuracy['accuracy_percent'] . '%'
            ] : null,
            $mostWins ? [
                'type' => 'most_round_wins',
                'text' => $mostWins['name'] . ' чаще всех забирал раунды: ' . $mostWins['first_places']
            ] : null
        ])),
        'round_notes' => array_slice(array_map(function ($note) {
            return 'Раунд ' . $note['round'] . ': ' . implode(', ', $note['winner_names']) . ' взял "' . $note['title'] . '" на +' . $note['top_score'];
        }, $roundNotes), 0, 6)
    ];
}

function handleGameAction($pdo, $room, $user, $postData)
{
    $state = bbNormalizeState(json_decode($room['game_state'] ?? '', true));
    $type = $postData['type'] ?? '';
    $userId = (string) $user['id'];
    bbEnsureRoundTimer($state);

    if ($type === 'setup_game') {
        if (!$room['is_host'])
            return;
        $state['total_rounds'] = max(1, min(50, (int) ($postData['rounds'] ?? 10)));
        $state['selected_categories'] = json_decode($postData['categories'] ?? '[]', true) ?: [];
        $state['selected_games'] = json_decode($postData['selected_games'] ?? '[]', true) ?: [];
        $state['scores'] = [];
        $state['round_history'] = [];
        $state['started_at'] = time();
        $state['stats_recorded'] = false;
        unset($state['ai_summary'], $state['ai_summary_version']);
        bbEnsureScoreRows($state, bbGetPlayerIds($pdo, $room['id']));
        $state['current_round'] = 0;
        $state['remaining_games'] = []; // СБРАСЫВАЕМ ОЧЕРЕДЬ ПРИ НОВОЙ НАСТРОЙКЕ
        startNextRound($state);
        updateGameState($room['id'], $state);
        return ['status' => 'ok'];
    }

    if ($type === 'get_library') {
        return ['status' => 'ok', 'library' => getGameLibrary()];
    }

    if ($type === 'force_reset') {
        if (!$room['is_host']) return;
        $state = getInitialState();
        updateGameState($room['id'], $state);
        return ['status' => 'ok'];
    }

    if ($type === 'tick') {
        // action_game_action only reaches this handler for active room_players.
        // Tick materializes bots/timeouts under the existing room row lock, but
        // never advances rounds or records final stats/history by itself.
        if (($state['phase'] ?? '') !== 'playing') {
            return ['status' => 'ok', 'changed' => false, 'noop' => 'not_playing'];
        }

        $beforeResults = json_encode($state['round_results'] ?? []);
        $beforeScores = json_encode($state['scores'] ?? []);
        $beforeRoundChatSent = !empty($state['round_chat_sent']);

        processBots($pdo, $room['id'], $state);
        bbTimeoutMissingHumanAnswers($pdo, $room, $state);

        $afterResults = json_encode($state['round_results'] ?? []);
        $afterScores = json_encode($state['scores'] ?? []);
        $afterRoundChatSent = !empty($state['round_chat_sent']);
        $changed = $beforeResults !== $afterResults
            || $beforeScores !== $afterScores
            || $beforeRoundChatSent !== $afterRoundChatSent;

        if (!$changed) {
            return ['status' => 'ok', 'changed' => false];
        }

        bbStoreRoundHistoryEntry($state);
        updateGameState($room['id'], $state);

        if (class_exists('TelegramLogger')) {
            TelegramLogger::logEvent('game', 'brainbattle_tick_changed', [
                'room_id' => (int) ($room['id'] ?? 0),
                'room_code' => $room['room_code'] ?? null,
                'actor_user_id' => (int) ($user['id'] ?? 0),
                'round' => (int) ($state['current_round'] ?? 0),
                'round_id' => (string) ($state['round_id'] ?? ''),
            ]);
        }

        return ['status' => 'ok', 'changed' => true];
    }

    if ($type === 'submit_result') {
        if (($state['phase'] ?? '') !== 'playing') {
            return ['status' => 'error', 'message' => 'Раунд уже не активен'];
        }
        if (!empty($state['round_id']) && isset($postData['round_id']) && $postData['round_id'] !== $state['round_id']) {
            return ['status' => 'ok', 'ignored' => 'stale_round'];
        }
        $timedOutBeforeAnswer = bbTimeoutMissingHumanAnswers($pdo, $room, $state);
        // Если игрок уже отвечал в этом раунде - игнорируем (защита от дабл-клика)
        if (isset($state['round_results'][$userId])) {
            if (!empty($state['round_results'][$userId]['timed_out'])) {
                if (class_exists('TelegramLogger')) {
                    $elapsedSeconds = time() - (int) ($state['round_started_at'] ?? time());
                    TelegramLogger::logEvent('security', 'brainbattle_late_answer_rejected', [
                        'room_id' => (int) ($room['id'] ?? 0),
                        'room_code' => $room['room_code'] ?? null,
                        'user_id' => (int) $user['id'],
                        'round' => (int) ($state['current_round'] ?? 0),
                        'round_id' => (string) ($state['round_id'] ?? ''),
                        'answer' => is_scalar($postData['answer'] ?? null) || !isset($postData['answer']) ? ($postData['answer'] ?? null) : '[non-scalar]',
                        'elapsed_seconds' => max(0, $elapsedSeconds)
                    ]);
                }
                if ($timedOutBeforeAnswer) {
                    bbStoreRoundHistoryEntry($state);
                    updateGameState($room['id'], $state);
                }
                return ['status' => 'ok', 'ignored' => 'timed_out', 'message' => 'Время ответа истекло'];
            }
            return ['status' => 'ok'];
        }

        $gameType = $state['previous_game_type'] ?? '';
        $roundData = is_array($state['round_data'] ?? null) ? $state['round_data'] : [];
        $answer = $postData['answer'] ?? null;
        $time = max(0, min(60000, (float) ($postData['time_ms'] ?? 0)));
        $clientMarkedCorrect = filter_var($postData['success'] ?? false, FILTER_VALIDATE_BOOLEAN);
        $isCorrect = bbEvaluateSubmittedAnswer($gameType, $roundData, $answer, $time);
        $tooFastRejected = false;

        // Анти-чит: если ответ пришел быстрее 100мс - скорее всего это бот или баг
        // Исключаем blind_timer, так как там "время" - это модуль ошибки (0ms = идеально)
        if ($time < 100 && $gameType !== 'blind_timer') {
            $isCorrect = false;
            $tooFastRejected = true;
        }

        if ($clientMarkedCorrect && !$isCorrect && class_exists('TelegramLogger')) {
            TelegramLogger::logEvent('security', 'BrainBattle suspicious submit_result', [
                'room_id' => (int) $room['id'],
                'user_id' => (int) $user['id'],
                'round_id' => (string) ($state['round_id'] ?? ''),
                'game_type' => (string) $gameType,
                'answer' => is_scalar($answer) || $answer === null ? $answer : '[non-scalar]',
                'reason' => $tooFastRejected ? 'too_fast_rejected' : 'answer_mismatch',
            ]);
        }

        $scoreBreakdown = bbBuildScoreBreakdown($gameType, $time, $isCorrect, [
            'too_fast_rejected' => $tooFastRejected
        ]);
        $score = (int) $scoreBreakdown['final_score'];

        $state['round_results'][$userId] = [
            'time' => $time,
            'correct' => $isCorrect,
            'score' => (int) $score,
            'answer' => $answer,
            'score_breakdown' => $scoreBreakdown
        ];

        if (!isset($state['scores'][$userId]))
            $state['scores'][$userId] = 0;
        $state['scores'][$userId] += (int) $score;

        // Process Bots!
        processBots($pdo, $room['id'], $state);
        bbTimeoutMissingHumanAnswers($pdo, $room, $state);
        bbStoreRoundHistoryEntry($state);

        updateGameState($room['id'], $state);
        return ['status' => 'ok'];
    }

    if ($type === 'next_round') {
        if (!$room['is_host'])
            return;
        if (($state['phase'] ?? '') === 'playing') {
            processBots($pdo, $room['id'], $state);
            bbTimeoutMissingHumanAnswers($pdo, $room, $state);
        }
        if (($state['phase'] ?? '') === 'playing') {
            foreach (bbGetHumanIds($pdo, $room['id']) as $pid) {
                if (!isset($state['round_results'][$pid])) {
                    return ['status' => 'error', 'message' => 'Не все игроки ответили'];
                }
            }
            bbStoreRoundHistoryEntry($state);
        }
        if ($state['current_round'] < $state['total_rounds']) {
            startNextRound($state);
        } else {
            $state['phase'] = 'game_over';
            bbStoreRoundHistoryEntry($state);
            bbRecordFinalStatsIfNeeded($pdo, $room, $state);
        }
        updateGameState($room['id'], $state);
        return ['status' => 'ok'];
    }
}

function bbRecordFinalStatsIfNeeded($pdo, $room, &$state)
{
    if (!empty($state['stats_recorded'])) {
        return;
    }

    $scores = is_array($state['scores'] ?? null) ? $state['scores'] : [];
    if (empty($scores)) {
        return;
    }

    // BrainBattle progression uses active room_players; final stats must not
    // reward users who already left the room during the match.
    $activePlayerIds = bbGetPlayerIds($pdo, $room['id']);
    $activePlayerLookup = array_fill_keys(array_map('strval', $activePlayerIds), true);
    if (empty($activePlayerLookup)) {
        if (class_exists('TelegramLogger')) {
            TelegramLogger::logEvent('game', 'brainbattle_final_stats_no_active_players', [
                'room_id' => (int) ($room['id'] ?? 0),
                'room_code' => $room['room_code'] ?? null,
                'score_user_ids' => array_map('strval', array_keys($scores)),
            ]);
        }
        return;
    }

    $scoreUserIds = array_map('strval', array_keys($scores));
    $filteredOutUserIds = array_values(array_diff($scoreUserIds, array_keys($activePlayerLookup)));
    if (!empty($filteredOutUserIds) && class_exists('TelegramLogger')) {
        TelegramLogger::logEvent('game', 'brainbattle_final_stats_filtered_leavers', [
            'room_id' => (int) ($room['id'] ?? 0),
            'room_code' => $room['room_code'] ?? null,
            'score_user_ids' => $scoreUserIds,
            'active_player_ids' => array_keys($activePlayerLookup),
            'filtered_out_user_ids' => $filteredOutUserIds,
        ]);
    }

    arsort($scores);
    $playersData = [];
    $rank = 1;
    foreach ($scores as $playerId => $score) {
        if (empty($activePlayerLookup[(string) $playerId])) {
            continue;
        }

        $playersData[] = [
            'user_id' => (int) $playerId,
            'rank' => $rank,
            'score' => (int) $score,
        ];
        $rank++;
    }

    if (empty($playersData)) {
        return;
    }

    require_once __DIR__ . '/../actions/stats.php';

    $startedAt = (int) ($state['started_at'] ?? 0);
    $duration = $startedAt > 0 ? max(0, time() - $startedAt) : 0;
    recordGameStats($pdo, $room, $playersData, $duration);
    $state['stats_recorded'] = true;
}

function startNextRound(&$state)
{
    $library = getGameLibrary();
    $state['current_round']++;
    $state['round_id'] = uniqid('bb_', true);
    $state['phase'] = 'playing';
    $state['round_results'] = [];
    $state['round_chat_sent'] = false;
    $state['round_started_at'] = time();
    $state['round_timeout_seconds'] = bbGetRoundTimeoutSeconds($state);

    // Определяем доступный пул игр
    $pool = [];
    $selectedGames = $state['selected_games'] ?? [];
    $allGames = [];
    foreach ($library as $games) {
        $allGames = array_merge($allGames, $games);
    }
    
    if (!empty($selectedGames)) {
        // Если выбраны конкретные игры - используем только их
        $pool = array_values(array_intersect($selectedGames, $allGames));
    } else {
        // Иначе - по категориям
        $cats = $state['selected_categories'] ?? ['logic', 'attention', 'motor', 'memory', 'erudition'];
        foreach ($cats as $cat) {
            if (isset($library[$cat])) {
                $pool = array_merge($pool, $library[$cat]);
            }
        }
    }
    
    if (empty($pool))
        $pool = ['math_blitz'];

    // Честная ротация: если очередь пуста, заполняем её заново и перемешиваем
    if (empty($state['remaining_games'])) {
        $state['remaining_games'] = $pool;
        shuffle($state['remaining_games']);

        // Гарантируем, что первая игра новой очереди не совпадает с последней предыдущей
        if (count($state['remaining_games']) > 1 && $state['remaining_games'][0] === $state['previous_game_type']) {
            $first = array_shift($state['remaining_games']);
            $state['remaining_games'][] = $first;
        }
    }

    $gameType = array_shift($state['remaining_games']);
    $state['previous_game_type'] = $gameType;
    $state['round_data'] = generateTaskData($gameType);
}

function generateTaskData($type)
{
    // 1. МАТЕМАТИКА
    if ($type === 'math_blitz') {
        $ops = ['+', '-', '*'];
        $op = $ops[array_rand($ops)];
        if ($op === '*') {
            $a = rand(2, 12);
            $b = rand(2, 12);
        } else {
            $a = rand(5, 100);
            $b = rand(5, 100);
            if ($op === '-' && $a < $b) {
                $tmp = $a;
                $a = $b;
                $b = $tmp;
            }
        }

        $ans = 0;
        if ($op === '+')
            $ans = $a + $b;
        elseif ($op === '-')
            $ans = $a - $b;
        elseif ($op === '*')
            $ans = $a * $b;

        $opts = [$ans, $ans + rand(1, 5), $ans - rand(1, 5), $ans + 10];
        if ($op === '*')
            $opts = [$ans, $ans + $a, $ans - $b, $ans + rand(2, 10)];

        shuffle($opts);
        return ['type' => $type, 'title' => 'Математика', 'question' => "$a $op $b", 'options' => $opts, 'correct_val' => $ans];
    }

    // 2. СРАВНЕНИЕ (С примерами)
    if ($type === 'greater_less') {
        $genExpr = function () {
            if (rand(0, 100) < 40) { // 40% шанс на число
                $val = rand(10, 200);
                return ['text' => (string) $val, 'val' => $val];
            } else { // 60% шанс на пример
                $op = rand(0, 1) ? '+' : '*';
                if ($op === '+') {
                    $a = rand(10, 100);
                    $b = rand(10, 100);
                    return ['text' => "$a + $b", 'val' => $a + $b];
                } else {
                    $a = rand(2, 13);
                    $b = rand(2, 13);
                    return ['text' => "$a × $b", 'val' => $a * $b];
                }
            }
        };

        $item1 = $genExpr();
        $item2 = $genExpr();
        while ($item1['val'] == $item2['val'])
            $item2 = $genExpr();

        return [
            'type' => $type,
            'title' => 'Что больше?',
            'question' => 'Выбери, что больше',
            'n1_text' => $item1['text'],
            'n1_val' => $item1['val'],
            'n2_text' => $item2['text'],
            'n2_val' => $item2['val'],
            'correct_val' => ($item1['val'] > $item2['val'] ? $item1['val'] : $item2['val'])
        ];
    }

    if ($type === 'simon_says') {
        $colors = ['red', 'blue', 'green', 'yellow'];
        $sequence = [];
        // Генерируем цепочку из 4 цветов
        for ($i = 0; $i < 4; $i++) {
            $sequence[] = $colors[array_rand($colors)];
        }

        return [
            'type' => 'simon_says',
            'title' => 'Память',
            'question' => 'Повтори последовательность!',
            'sequence' => $sequence, // Передаем массив цветов
            'correct_val' => implode(',', $sequence) // Правильная строка для проверки
        ];
    }

    // 3. ЦВЕТА
    if ($type === 'color_chaos') {
        $c = [
            'red' => 'Красный',
            'blue' => 'Синий',
            'green' => 'Зеленый',
            'yellow' => 'Желтый',
            'orange' => 'Оранжевый',
            'purple' => 'Фиолетовый',
            'pink' => 'Розовый',
            'black' => 'Черный'
        ];
        $k = array_keys($c);
        $tk = $k[array_rand($k)];
        $ck = $k[array_rand($k)];

        // Pick 4 random options including the correct one
        $all_vals = array_values($c);
        $correct_val = $c[$ck];
        $opts = [$correct_val];
        $others = array_diff($all_vals, [$correct_val]);
        shuffle($others);
        $opts = array_merge($opts, array_slice($others, 0, 3));
        shuffle($opts);

        return ['type' => $type, 'title' => 'Цвета', 'question' => 'Выбери цвет, которым написано слово', 'text' => $c[$tk], 'color' => $ck, 'options' => $opts, 'correct_val' => $correct_val];
    }

    // 4. ЛИШНИЙ
    if ($type === 'odd_one_out') {
        // Pairs of [Majority, Minority] using Bootstrap Icons
        $pairs = [
            ['bi-circle', 'bi-circle-fill'],
            ['bi-square', 'bi-square-fill'],
            ['bi-triangle', 'bi-triangle-fill'],
            ['bi-heart', 'bi-heart-fill'],
            ['bi-star', 'bi-star-fill'],
            ['bi-chat', 'bi-chat-fill'],
            ['bi-envelope', 'bi-envelope-open'],
            ['bi-lock-fill', 'bi-unlock-fill'],
            ['bi-volume-up-fill', 'bi-volume-mute-fill'],
            ['bi-mic-fill', 'bi-mic-mute-fill'],
            ['bi-person-fill', 'bi-person'],
            ['bi-hand-thumbs-up-fill', 'bi-hand-thumbs-down-fill'],
            ['bi-arrow-up-circle-fill', 'bi-arrow-down-circle-fill'],
            ['bi-pause-circle-fill', 'bi-play-circle-fill'],
            ['bi-wifi', 'bi-wifi-off'],
            ['bi-battery-full', 'bi-battery-half'],
            ['bi-brightness-high-fill', 'bi-moon-fill'],
            ['bi-check-circle-fill', 'bi-x-circle-fill'],
            ['bi-bell-fill', 'bi-bell-slash-fill'],
            ['bi-bookmark-fill', 'bi-bookmark']
        ];
        $p = $pairs[array_rand($pairs)];

        // Majority is usually p[0], Minority is p[1] or vice versa? 
        // Logic: array_fill with p[0], one p[1].
        // Ensuring random role assignment
        if (rand(0, 1)) {
            $maj = $p[0];
            $min = $p[1];
        } else {
            $maj = $p[1];
            $min = $p[0];
        }

        // Увеличиваем до 16 элементов (сетка 4x4)
        $opts = array_fill(0, 15, $maj);
        $opts[] = $min;
        shuffle($opts);
        return ['type' => $type, 'title' => 'Найди лишний', 'question' => 'Найди одну отличающуюся иконку', 'options' => $opts, 'correct_val' => $min];
    }

    // 5. РЕАКЦИЯ
    if ($type === 'reaction_test') {
        return ['type' => $type, 'title' => 'Реакция', 'question' => 'Жди зеленый!', 'delay_ms' => rand(2000, 5000)];
    }

    // === НОВЫЕ ИГРЫ ===

    // 6. ФОТОПАМЯТЬ (Memory)
    if ($type === 'photo_memory') {
        $icons = [
            'bi-hammer', 'bi-airplane-fill', 'bi-robot', 'bi-controller', 'bi-gift-fill',
            'bi-moon-stars-fill', 'bi-star-fill', 'bi-heart-fill', 'bi-bicycle', 'bi-anchor',
            'bi-umbrella-fill', 'bi-cloud-rain-fill', 'bi-music-note-beamed', 'bi-puzzle-fill', 'bi-palette-fill',
            'bi-trophy-fill', 'bi-bug-fill', 'bi-tree-fill', 'bi-alarm-fill', 'bi-camera-fill',
            'bi-emoji-smile-fill', 'bi-brightness-high-fill', 'bi-lightning-charge-fill', 'bi-apple', 'bi-egg-fill'
        ];
        shuffle($icons);
        $shown = array_slice($icons, 0, 4); // Показываем 4
        $hidden = $shown[array_rand($shown)]; // Один из них правильный

        // Варианты ответа: правильный + 3 левых
        $opts = [$hidden];
        $others = array_diff($icons, $shown);
        shuffle($others);
        $opts = array_merge($opts, array_slice($others, 0, 3));
        shuffle($opts);

        return [
            'type' => 'photo_memory',
            'title' => 'Фотопамять',
            'question' => 'Запомни предметы!',
            'phase2_q' => 'Что было на картинке?',
            'shown_items' => $shown,
            'options' => $opts,
            'correct_val' => $hidden
        ];
    }

    // 1. Кости (Dice Sum)
    if ($type === 'dice_sum') {
        $dice_map = [1 => '⚀', 2 => '⚁', 3 => '⚂', 4 => '⚃', 5 => '⚄', 6 => '⚅'];
        $count = rand(3, 5);
        $sum = 0;
        $icons = [];
        for ($i = 0; $i < $count; $i++) {
            $v = rand(1, 6);
            $sum += $v;
            $icons[] = $dice_map[$v];
        }
        $opts = [$sum, $sum + rand(1, 3), $sum - rand(1, 2), $sum + 5];
        shuffle($opts);
        return ['type' => $type, 'title' => 'Счет', 'question' => 'Сумма точек?', 'icons' => $icons, 'options' => $opts, 'correct_val' => $sum];
    }

    // 2. Алхимия (Mixing)
    if ($type === 'alchemy') {
        $recipes = [
            ['items' => ['🔥', '💧'], 'res' => '💨', 'name' => 'Пар'],
            ['items' => ['🌍', '🔥'], 'res' => '🌋', 'name' => 'Лава'],
            ['items' => ['❄️', '💧'], 'res' => '🧊', 'name' => 'Лед'],
            ['items' => ['☁️', '💧'], 'res' => '🌧️', 'name' => 'Дождь'],
            ['items' => ['☀️', '🌧️'], 'res' => '🌈', 'name' => 'Радуга'],
            ['items' => ['🌱', '💧'], 'res' => '🌻', 'name' => 'Цветок'],
            ['items' => ['🥚', '🔥'], 'res' => '🍳', 'name' => 'Яичница'],
            ['items' => ['🐛', '⏳'], 'res' => '🦋', 'name' => 'Бабочка'],
            ['items' => ['🐟', '🍚'], 'res' => '🍣', 'name' => 'Суши'],
            ['items' => ['🍇', '⏳'], 'res' => '🍷', 'name' => 'Вино'],
            ['items' => ['📄', '✂️'], 'res' => '🎊', 'name' => 'Конфетти'],
            ['items' => ['🐮', '🥛'], 'res' => '🧀', 'name' => 'Сыр'],
            ['items' => ['🔋', '💡'], 'res' => '🔦', 'name' => 'Свет'],
            ['items' => ['🌧️', '❄️'], 'res' => '🌨️', 'name' => 'Снег'],
            ['items' => ['🌽', '🔥'], 'res' => '🍿', 'name' => 'Попкорн'],
            ['items' => ['🍞', '🧀'], 'res' => '🥪', 'name' => 'Сэндвич'],
            ['items' => ['🧱', '🧱'], 'res' => '🏠', 'name' => 'Дом'],
            ['items' => ['🖌️', '🎨'], 'res' => '🖼️', 'name' => 'Картина'],
            ['items' => ['🔨', '🪵'], 'res' => '🪑', 'name' => 'Стул'],
            ['items' => ['🚿', '🧼'], 'res' => '🫧', 'name' => 'Пузыри'],
            ['items' => ['🍓', '🥛'], 'res' => '🥤', 'name' => 'Коктейль'],
            ['items' => ['👓', '☀️'], 'res' => '😎', 'name' => 'Очки'],
            ['items' => ['🌲', '🪓'], 'res' => '🪵', 'name' => 'Дрова'],
            ['items' => ['✉️', '📫'], 'res' => '📬', 'name' => 'Почта'],
        ];
        $r = $recipes[array_rand($recipes)];
        $all_res = array_column($recipes, 'res');
        $wrong = ['💀', '👽', '🤖', '🎃', '💩', '🤡', '👻', '🌵', '🍄', '🕸️'];
        $wrong = array_merge($wrong, array_diff($all_res, [$r['res']]));
        shuffle($wrong);
        $opts = [$r['res'], $wrong[0], $wrong[1], $wrong[2]];
        shuffle($opts);
        return ['type' => $type, 'title' => 'Алхимия', 'question' => "{$r['items'][0]} + {$r['items'][1]} = ?", 'options' => $opts, 'correct_val' => $r['res']];
    }

    // === ВНИМАНИЕ ===

    // 3. Найди дубли (Find Pairs) - выберем 1 лишний
    if ($type === 'find_duplicate') {
        $set = [
            'bi-apple', 'bi-balloon-fill', 'bi-bug-fill', 'bi-cart-fill', 'bi-camera-fill', 
            'bi-cloud-sun-fill', 'bi-cup-hot-fill', 'bi-envelope-fill', 'bi-gear-fill', 'bi-headset', 
            'bi-house-fill', 'bi-key-fill', 'bi-lamp-fill', 'bi-lightbulb-fill', 'bi-lock-fill', 
            'bi-magic', 'bi-magnet-fill', 'bi-mic-fill', 'bi-mouse-fill', 'bi-music-note', 
            'bi-paint-bucket', 'bi-pencil-fill', 'bi-phone-fill', 'bi-pin-map-fill', 'bi-printer-fill', 
            'bi-search', 'bi-send-fill', 'bi-shield-fill', 'bi-speaker-fill', 'bi-suit-spade-fill'
        ];
        shuffle($set);
        $target = $set[0];
        $grid = [$target, $target]; // Две одинаковых
        // Увеличиваем до 16 элементов (2 целевых + 14 других)
        for ($i = 1; $i < 15; $i++)
            $grid[] = $set[$i];
        shuffle($grid);
        return ['type' => $type, 'title' => 'Внимание', 'question' => 'Найди две одинаковые иконки', 'grid' => $grid, 'correct_val' => $target];
    }

    // === МОТОРИКА ===

    // 4. Разминирование (1-9)
    if ($type === 'defuse_numbers') {
        $nums = range(1, 9);
        shuffle($nums);
        return ['type' => $type, 'title' => 'Разминирование', 'question' => 'Нажми цифры от 1 до 9!', 'grid' => $nums];
    }

    // 5. Тайминг-сейф (Green Zone)
    if ($type === 'timing_safe') {
        // Уменьшаем скорость (было rand(2, 4)), чтобы играть было комфортнее
        $speed = rand(12, 20) / 10;
        return ['type' => $type, 'title' => 'Сейф', 'question' => 'Жми в ЗЕЛЕНОЙ зоне!', 'speed' => $speed];
    }

    // 7. СЛЕПОЙ СЕКУНДОМЕР
    if ($type === 'blind_timer') {
        $targets = [3000, 4000, 5000, 6000, 7000, 8000];
        $targetMs = $targets[array_rand($targets)];
        $targetSec = $targetMs / 1000;

        return [
            'type' => 'blind_timer',
            'title' => 'Чувство времени',
            'question' => "Нажми СТОП ровно через {$targetSec} сек",
            'target' => $targetMs
        ];
    }

    // 8. СЪЕДОБНОЕ - НЕСЪЕДОБНОЕ (Эрудиция)
    if ($type === 'edible_inedible') {
        $items = [
            ['name' => 'Кирпич', 'type' => 'no'],
            ['name' => 'Яблоко', 'type' => 'yes'],
            ['name' => 'Гвоздь', 'type' => 'no'],
            ['name' => 'Бургер', 'type' => 'yes'],
            ['name' => 'Мыло', 'type' => 'no'],
            ['name' => 'Суп', 'type' => 'yes'],
            ['name' => 'Пицца', 'type' => 'yes'],
            ['name' => 'Камень', 'type' => 'no'],
            ['name' => 'Банан', 'type' => 'yes'],
            ['name' => 'Носок', 'type' => 'no'],
            ['name' => 'Стейк', 'type' => 'yes'],
            ['name' => 'Стекло', 'type' => 'no'],
            ['name' => 'Морковь', 'type' => 'yes'],
            ['name' => 'Батарейка', 'type' => 'no'],
            ['name' => 'Клубника', 'type' => 'yes'],
            ['name' => 'Шина', 'type' => 'no'],
            ['name' => 'Сыр', 'type' => 'yes'],
            ['name' => 'Монета', 'type' => 'no'],
            ['name' => 'Пончик', 'type' => 'yes'],
            ['name' => 'Лампочка', 'type' => 'no'],
            ['name' => 'Арбуз', 'type' => 'yes'],
            ['name' => 'Песок', 'type' => 'no'],
            ['name' => 'Брокколи', 'type' => 'yes'],
            ['name' => 'Бумага', 'type' => 'no'],
            ['name' => 'Курица', 'type' => 'yes'],
            ['name' => 'Краб', 'type' => 'yes'],
            ['name' => 'Мел', 'type' => 'no'],
            ['name' => 'Шоколад', 'type' => 'yes'],
            ['name' => 'Ключ', 'type' => 'no'],
            ['name' => 'Пульт', 'type' => 'no'],
            ['name' => 'Малина', 'type' => 'yes'],
            ['name' => 'Флэшка', 'type' => 'no'],
            ['name' => 'Авокадо', 'type' => 'yes'],
            ['name' => 'Кроссовки', 'type' => 'no'],
            ['name' => 'Манго', 'type' => 'yes'],
            ['name' => 'Ложка', 'type' => 'no'],
            ['name' => 'Огурец', 'type' => 'yes'],
            ['name' => 'Вилка', 'type' => 'no'],
            ['name' => 'Помидор', 'type' => 'yes'],
            ['name' => 'Шкаф', 'type' => 'no'],
            ['name' => 'Черника', 'type' => 'yes'],
            ['name' => 'Подушка', 'type' => 'no'],
            ['name' => 'Пельмени', 'type' => 'yes'],
            ['name' => 'Очки', 'type' => 'no'],
            ['name' => 'Шаурма', 'type' => 'yes'],
            ['name' => 'Чайник', 'type' => 'no'],
            ['name' => 'Блины', 'type' => 'yes'],
            ['name' => 'Зонт', 'type' => 'no'],
            ['name' => 'Мед', 'type' => 'yes'],
            ['name' => 'Утюг', 'type' => 'no'],
            ['name' => 'Творог', 'type' => 'yes'],
            ['name' => 'Книга', 'type' => 'no'],
            ['name' => 'Редис', 'type' => 'yes'],
            ['name' => 'Часы', 'type' => 'no'],
            ['name' => 'Зефир', 'type' => 'yes'],
            ['name' => 'Ножницы', 'type' => 'no'],
            ['name' => 'Абрикос', 'type' => 'yes'],
            ['name' => 'Пуговица', 'type' => 'no'],
            ['name' => 'Карандаш', 'type' => 'no'],
            ['name' => 'Ананас', 'type' => 'yes'],
            ['name' => 'Ластик', 'type' => 'no'],
            ['name' => 'Сырники', 'type' => 'yes'],
            ['name' => 'Телефон', 'type' => 'no'],
            ['name' => 'Котлета', 'type' => 'yes'],
            ['name' => 'Кольцо', 'type' => 'no'],
            ['name' => 'Груша', 'type' => 'yes'],
            ['name' => 'Кофемолка', 'type' => 'no'],
            ['name' => 'Баклажан', 'type' => 'yes'],
            ['name' => 'Ботинок', 'type' => 'no'],
            ['name' => 'Облепиха', 'type' => 'yes'],
            ['name' => 'Скрепка', 'type' => 'no'],
            ['name' => 'Креветка', 'type' => 'yes'],
            ['name' => 'Кисточка', 'type' => 'no'],
            ['name' => 'Апельсин', 'type' => 'yes'],
            ['name' => 'Линейка', 'type' => 'no'],
            ['name' => 'Макароны', 'type' => 'yes'],
            ['name' => 'Молоток', 'type' => 'no'],
            ['name' => 'Йогурт', 'type' => 'yes'],
            ['name' => 'Краска', 'type' => 'no'],
            ['name' => 'Киви', 'type' => 'yes'],
            ['name' => 'Диван', 'type' => 'no'],
            ['name' => 'Виноград', 'type' => 'yes'],
            ['name' => 'Шуруп', 'type' => 'no']
        ];
        $item = $items[array_rand($items)];
        return [
            'type' => 'edible_inedible',
            'title' => 'Съедобное?',
            'item_name' => $item['name'],
            'correct_val' => ($item['type'] === 'yes' ? 'Съедобное' : 'Несъедобное')
        ];
    }

    // 9. ПРАВДА ИЛИ ВЫДУМКА (Fact Check)
    if ($type === 'fact_check') {
        $facts = [
            // ПРАВДА
            ['text' => 'Сердце креветки находится в её голове.', 'is_true' => true],
            ['text' => 'Улитка может спать три года подряд.', 'is_true' => true],
            ['text' => 'Натуральный мед никогда не портится.', 'is_true' => true],
            ['text' => 'Отпечатки пальцев коалы неотличимы от человеческих.', 'is_true' => true],
            ['text' => 'У осьминога три сердца.', 'is_true' => true],
            ['text' => 'В Антарктиде нет белых медведей.', 'is_true' => true],
            ['text' => 'Самая длинная война в истории длилась 335 лет и прошла без единого выстрела.', 'is_true' => true],
            ['text' => 'Арахис — это не орех, а бобовая культура.', 'is_true' => true],
            ['text' => 'Оксфордский университет старше империи ацтеков.', 'is_true' => true],
            ['text' => 'Акулы существовали на Земле раньше, чем деревья.', 'is_true' => true],
            ['text' => 'Зажигалку изобрели раньше, чем спички.', 'is_true' => true],
            ['text' => 'Самая короткая война в истории длилась 38 минут.', 'is_true' => true],
            ['text' => 'У жирафов и людей одинаковое количество шейных позвонков.', 'is_true' => true],
            ['text' => 'Венера горячее Меркурия.', 'is_true' => true],

            // ВЫДУМКА
            ['text' => 'Великую Китайскую стену видно из космоса невооруженным глазом.', 'is_true' => false],
            ['text' => 'Быков злит красный цвет.', 'is_true' => false],
            ['text' => 'Волосы и ногти продолжают расти после смерти.', 'is_true' => false],
            ['text' => 'Страусы прячут голову в песок, когда пугаются.', 'is_true' => false],
            ['text' => 'Человек использует только 10% своего мозга.', 'is_true' => false],
            ['text' => 'Хамелеоны меняют цвет, чтобы слиться с окружением.', 'is_true' => false],
            ['text' => 'Молния никогда не ударяет в одно и то же место дважды.', 'is_true' => false],
            ['text' => 'Летучие мыши полностью слепые.', 'is_true' => false],
            ['text' => 'Альберт Эйнштейн был двоечником по математике в школе.', 'is_true' => false],
            ['text' => 'Золотая рыбка имеет память всего на 3 секунды.', 'is_true' => false],
            ['text' => 'Хрустеть пальцами — значит обязательно заработать артрит.', 'is_true' => false],
            ['text' => 'Эверест — самая высокая гора от подножия до вершины.', 'is_true' => false],
            ['text' => 'Собаки видят мир только в черно-белом цвете.', 'is_true' => false],
            ['text' => 'Римляне придумали пиццу.', 'is_true' => false],
            ['text' => 'Глушитель пистолета делает выстрел абсолютно бесшумным.', 'is_true' => false],
            ['text' => 'У человека 5 чувств.', 'is_true' => false],
            ['text' => 'Бананы растут на деревьях.', 'is_true' => false],
            ['text' => 'Сахар вызывает гиперактивность у детей.', 'is_true' => false],
            ['text' => 'Кофе обезвоживает организм.', 'is_true' => false],
            ['text' => 'Пингвины живут в Арктике.', 'is_true' => false],
            ['text' => 'У Наполеона был комплекс маленького роста (он был выше среднего).', 'is_true' => false],
            ['text' => 'Стекло — это сверхвязкая жидкость.', 'is_true' => false],
            ['text' => 'В космосе нет гравитации.', 'is_true' => false],
            ['text' => 'Мы глотаем 8 пауков в год во сне.', 'is_true' => false]
        ];

        // Добавляем еще немного правды для баланса
        $trueFacts = [
            ['text' => 'W — единственная буква в английском алфавите, в которой больше одного слога.', 'is_true' => true],
            ['text' => 'У кошек нет ключиц.', 'is_true' => true],
            ['text' => 'Венера — самая горячая планета в Солнечной системе.', 'is_true' => true],
            ['text' => 'Косатки — это на самом деле дельфины.', 'is_true' => true],
            ['text' => 'Кровь омара бесцветная, но синеет при контакте с кислородом.', 'is_true' => true],
            ['text' => 'Ковбойские шляпы были изобретены не ковбоями, а Джоном Стетсоном.', 'is_true' => true],
            ['text' => 'Австралия одновременно является страной и континентом.', 'is_true' => true],
            ['text' => 'На флаге Японии изображен круг.', 'is_true' => true],
        ];
        $facts = array_merge($facts, $trueFacts);

        // Чтобы вопросы не повторялись постоянно (хотя выборка уже 40+)
        $idx = array_rand($facts);
        // Можно было бы хранить history в $state, но для начала расширим базу
        $fact = $facts[$idx];
        return [
            'type' => 'fact_check',
            'title' => 'Правда или Ложь?',
            'fact' => $fact['text'],
            'correct_val' => ($fact['is_true'] ? 'Правда' : 'Ложь')
        ];
    }

    // 9. СЧЕТ ОБЪЕКТОВ (Attention)
    if ($type === 'count_objects') {
        $icons = ['bi-apple', 'bi-car-front-fill', 'bi-bug-fill', 'bi-egg-fill', 'bi-gem', 'bi-star-fill', 'bi-rocket-takeoff-fill', 'bi-heart-fill'];
        $target = $icons[array_rand($icons)];
        $count = rand(3, 7);
        $grid = array_fill(0, $count, $target);

        // Fill rest with other icons
        $others = array_diff($icons, [$target]);
        shuffle($others);
        for ($i = 0; $i < 5; $i++)
            $grid[] = $others[0];
        for ($i = 0; $i < 4; $i++)
            $grid[] = $others[1];
        shuffle($grid);

        $opts = [$count, $count + 1, $count - 1, rand(8, 12)];
        sort($opts);
        $opts = array_unique($opts);
        shuffle($opts);

        return [
            'type' => $type,
            'title' => 'Внимание',
            'question' => "Сколько здесь $target?",
            'target' => $target,
            'grid' => $grid,
            'options' => $opts,
            'correct_val' => $count
        ];
    }

    // НАПЕРСТКИ
    if ($type === 'thimbles') {
        $cups = 3;
        $initial_ball = rand(0, 2);
        $swaps_count = rand(6, 10);
        $swaps = [];
        $current_pos = $initial_ball;

        for ($i = 0; $i < $swaps_count; $i++) {
            $a = rand(0, 2);
            $b = rand(0, 2);
            while ($a == $b) {
                $b = rand(0, 2);
            }
            $swaps[] = [$a, $b];
            
            // Отслеживаем где шарик
            if ($current_pos == $a) $current_pos = $b;
            else if ($current_pos == $b) $current_pos = $a;
        }

        return [
            'type' => 'thimbles',
            'title' => 'Наперстки',
            'question' => 'Следи за шариком!',
            'cups' => $cups,
            'initial_ball' => $initial_ball,
            'swaps' => $swaps,
            'correct_val' => $current_pos
        ];
    }

    // 10. AI QUIZ
    if ($type === 'ai_quiz') {
        // require_once __DIR__ . '/../lib/GigaChat.php'; // Deprecated
        require_once __DIR__ . '/../lib/AI/AIService.php';

        $topics = ['История', 'Наука', 'Космос', 'Кино', 'Животные', 'Интернет', 'Игры'];
        $topic = $topics[array_rand($topics)];

        $backups = [
            ['question' => 'Столица Франции?', 'options' => ['Париж', 'Лондон', 'Берлин', 'Рим'], 'correct_val' => 'Париж'],
            ['question' => 'Сколько планет в Солнечной системе?', 'options' => ['8', '9', '7', '10'], 'correct_val' => '8'],
            ['question' => 'Самое глубокое озеро?', 'options' => ['Байкал', 'Виктория', 'Танганьика', 'Гурон'], 'correct_val' => 'Байкал'],
            ['question' => 'Химическая формула воды?', 'options' => ['H2O', 'CO2', 'O2', 'NaCl'], 'correct_val' => 'H2O'],
            ['question' => 'Кто написал "Войну и мир"?', 'options' => ['Толстой', 'Достоевский', 'Пушкин', 'Лермонтов'], 'correct_val' => 'Толстой']
        ];
        $bk = $backups[array_rand($backups)];

        try {
            $system = "Ты генератор быстрых и понятных вопросов для мобильной викторины. Тема: $topic. Нужен только короткий, однозначный, проверяемый вопрос без подвохов, без оценочных формулировок и без спорных фактов. Ответь только JSON.";
            $prompt = "Сформируй 1 вопрос для быстрой игры.
Требования:
- вопрос до 90 символов;
- 4 коротких варианта ответа;
- ровно 1 правильный ответ;
- без двусмысленности;
- без формулировок, зависящих от мнения или трактовки;
- без очень узких или сомнительных фактов;
- correct_index только от 0 до 3.
JSON: {\"question\": \"...\", \"options\": [\"...\", \"...\", \"...\", \"...\"], \"correct_index\": 0}";

            // $response = GigaChat::getInstance()->chat([['role' => 'system', 'content' => $system], ['role' => 'user', 'content' => $prompt]], 0.8);
            $response = AIService::getProvider('text')->text([['role' => 'system', 'content' => $system], ['role' => 'user', 'content' => $prompt]], ['temperature' => 0.8]);

            if (isset($response['content'])) {
                $content = $response['content'];
                if (preg_match('/```json(.*?)```/s', $content, $matches)) {
                    $content = trim($matches[1]);
                } elseif (preg_match('/\{.*\}/s', $content, $matches)) {
                    $content = $matches[0];
                }

                $json = json_decode($content, true);

                if (
                    $json
                    && isset($json['question'], $json['options'], $json['correct_index'])
                    && is_array($json['options'])
                    && count($json['options']) === 4
                    && isset($json['options'][(int) $json['correct_index']])
                    && mb_strlen(trim((string) $json['question'])) <= 90
                ) {
                    $options = array_map(fn($opt) => trim((string) $opt), $json['options']);
                    $question = trim((string) $json['question']);
                    $correctIndex = (int) $json['correct_index'];
                    $uniqueOptions = array_unique($options);

                    if (count($uniqueOptions) === 4 && $correctIndex >= 0 && $correctIndex < 4) {
                    return [
                        'type' => 'ai_quiz',
                        'title' => 'AI: ' . $topic,
                        'question' => $question,
                        'options' => $options,
                        'correct_val' => $options[$correctIndex],
                        'is_ai' => true
                    ];
                    }
                }
            }
        } catch (Exception $e) {
            if (class_exists('TelegramLogger'))
                TelegramLogger::logError('ai_fail', ['m' => $e->getMessage()]);
        }
        return ['type' => 'ai_quiz', 'title' => 'AI: ' . $topic . ' (Backup)', 'question' => $bk['question'], 'options' => $bk['options'], 'correct_val' => $bk['correct_val']];
    }

    return ['type' => 'math_blitz', 'title' => 'Ошибка', 'question' => '2+2', 'options' => [4], 'correct_val' => 4];
}

function processBots($pdo, $roomId, &$state)
{
    require_once __DIR__ . '/../lib/AI/Bot/BotManager.php';

    if (($state['phase'] ?? '') !== 'playing' || empty($state['round_data']) || !is_array($state['round_data'])) {
        return;
    }

    // 1. Get Bots in Room
    $stmt = $pdo->prepare("SELECT u.* FROM room_players rp JOIN users u ON rp.user_id = u.id WHERE rp.room_id = ? AND u.is_bot = 1");
    $stmt->execute([$roomId]);
    $bots = $stmt->fetchAll(PDO::FETCH_ASSOC);

    if (empty($bots))
        return;

    $roundData = $state['round_data'];
    $correctVal = $roundData['correct_val'] ?? null;
    $options = $roundData['options'] ?? [];

    // Determine correct index
    $correctIndex = -1;
    foreach ($options as $i => $opt) {
        if ($opt == $correctVal) { // Loose comparison for numbers/strings
            $correctIndex = $i;
            break;
        }
    }

    // Determine game type to handle specific cases (like blind_timer)
    $gameType = $state['previous_game_type'] ?? '';

    foreach ($bots as $bot) {
        $botId = $bot['id'];
        $chosenIndex = null;

        // Skip if already answered
        if (isset($state['round_results'][$botId]))
            continue;

        // 30% chance to "think longer" and not answer on this specific tick (simulate delays)
        // BUT for MVP simplicity, let's make them all answer once triggered, but with varied times.
        // Actually, let's just make them answer.

        $brain = BotManager::getBot($botId, $bot['custom_name'] ?? $bot['first_name']);

        // Logic for specific games
        $isCorrect = false;
        $timeMs = rand(2000, 8000); // Random speed 2s - 8s

        if ($gameType === 'blind_timer') {
            // Special case logic for blind timer
            // Difficulty 1 => huge error, 10 => small error
            $diff = $brain->getPersona()->difficulty;
            $target = $roundData['target'];
            $errorMargin = rand(0, 1000) * (11 - $diff); // 1=>10000ms err max, 10=>1000ms err max
            if (rand(0, 1))
                $errorMargin *= -1;

            $timeMs = abs($target + $errorMargin); // "Time" here is the stop time
            $isCorrect = true; // Always "correct" submission, score depends on accuracy
        } elseif ($correctIndex !== -1) {
            // Standard Quiz/Option games
            $chosenIndex = $brain->answerQuiz($correctIndex, count($options));
            $isCorrect = ($chosenIndex === $correctIndex);
        } else {
            // Games without options (e.g. reaction test, or open input?)
            // For reaction_test:
            if ($gameType === 'reaction_test') {
                // Faster reaction for harder bots
                $diff = $brain->getPersona()->difficulty;
                $timeMs = rand(200, 600) - ($diff * 20);
                if ($timeMs < 150)
                    $timeMs = 150; // Human limit cap
                $isCorrect = true;
            } else {
                // Fallback: Assume correct call for simplicity or 50/50
                $isCorrect = (rand(1, 10) <= $brain->getPersona()->difficulty);
            }
        }

        if ($isCorrect && $gameType === 'blind_timer') {
            $timeMs = abs(($state['round_data']['target'] ?? 0) - $timeMs); // Delta
        }
        $scoreBreakdown = bbBuildScoreBreakdown($gameType, $timeMs, $isCorrect);
        $score = (int) $scoreBreakdown['final_score'];

        // Record Result
        $botAnswer = null;
        if ($gameType === 'blind_timer') {
            $botAnswer = (string) $timeMs;
        } elseif ($correctIndex !== -1 && isset($options[$chosenIndex])) {
            $botAnswer = $options[$chosenIndex];
        } elseif ($gameType === 'reaction_test') {
            $botAnswer = 'tap';
        }

        $state['round_results'][(string) $botId] = [
            'time' => $timeMs,
            'correct' => $isCorrect,
            'score' => (int) $score,
            'answer' => $botAnswer,
            'score_breakdown' => $scoreBreakdown
        ];

        if (!isset($state['scores'][(string) $botId]))
            $state['scores'][(string) $botId] = 0;
        $state['scores'][(string) $botId] += (int) $score;
    }

    // --- Chat Logic ---
    // Try to chat
    if (!empty($state['round_chat_sent'])) {
        return;
    }

    $chatData = BotManager::maybeChat($pdo, $roomId, []); // Empty history for now, or fetch recent events

    if ($chatData) {
        $text = $chatData['message'];
        $botId = $chatData['bot_id'];

        // Add to Room Events so clients see it via polling
        // We use 'chat' type which we just added support for in frontend
        $payload = json_encode(['text' => $text]);

        $pdo->prepare("INSERT INTO room_events (room_id, user_id, type, payload) VALUES (?, ?, 'chat', ?)")
            ->execute([$roomId, $botId, $payload]);
        $state['round_chat_sent'] = true;
    }
}
