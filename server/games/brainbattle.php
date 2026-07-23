<?php
// server/games/brainbattle.php

if (!defined('BRAINBATTLE_ROUND_TIMEOUT_SECONDS')) {
    define('BRAINBATTLE_ROUND_TIMEOUT_SECONDS', 30);
}
if (!defined('BRAINBATTLE_TASK_GENERATION_ATTEMPTS')) {
    define('BRAINBATTLE_TASK_GENERATION_ATTEMPTS', 8);
}
if (!defined('BRAINBATTLE_TASK_SIGNATURE_HISTORY_LIMIT')) {
    define('BRAINBATTLE_TASK_SIGNATURE_HISTORY_LIMIT', 100);
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
        'task_signature_history' => [],
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
    if (!is_array($state['task_signature_history'])) {
        $state['task_signature_history'] = [];
    }

    $allowedGameTypes = [];
    foreach (getGameLibrary() as $games) {
        foreach ($games as $gameType) {
            $allowedGameTypes[$gameType] = true;
        }
    }

    $normalizedTaskHistory = [];
    foreach ($state['task_signature_history'] as $gameType => $signatures) {
        $gameType = (string) $gameType;
        if (empty($allowedGameTypes[$gameType]) || !is_array($signatures)) {
            continue;
        }

        $cleanSignatures = [];
        foreach ($signatures as $signature) {
            $signature = strtolower(trim((string) $signature));
            if (preg_match('/^[a-f0-9]{64}$/', $signature)) {
                $cleanSignatures[] = $signature;
            }
        }

        $cleanSignatures = array_values(array_unique($cleanSignatures));
        $normalizedTaskHistory[$gameType] = array_slice(
            $cleanSignatures,
            -BRAINBATTLE_TASK_SIGNATURE_HISTORY_LIMIT
        );
    }
    $state['task_signature_history'] = $normalizedTaskHistory;

    return $state;
}

function bbNormalizeTaskSignatureValue($value)
{
    if (is_array($value)) {
        $normalized = [];
        foreach ($value as $key => $item) {
            $normalized[$key] = bbNormalizeTaskSignatureValue($item);
        }

        $isList = empty($normalized) || array_keys($normalized) === range(0, count($normalized) - 1);
        if (!$isList) {
            ksort($normalized);
        }
        return $normalized;
    }

    if (is_string($value)) {
        $value = preg_replace('/\s+/u', ' ', trim($value));
        return mb_strtolower($value, 'UTF-8');
    }

    return $value;
}

function bbSortedTaskSignatureList($values)
{
    $normalized = array_map('bbNormalizeTaskSignatureValue', is_array($values) ? $values : []);
    usort($normalized, function ($left, $right) {
        return strcmp(
            json_encode($left, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            json_encode($right, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)
        );
    });
    return $normalized;
}

function bbBuildTaskSignature($gameType, $task)
{
    $gameType = (string) $gameType;
    $task = is_array($task) ? $task : [];

    switch ($gameType) {
        case 'math_blitz':
            $payload = ['question' => $task['question'] ?? '', 'correct' => $task['correct_val'] ?? null];
            break;
        case 'greater_less':
            $payload = [
                'items' => bbSortedTaskSignatureList([
                    [$task['n1_text'] ?? '', $task['n1_val'] ?? null],
                    [$task['n2_text'] ?? '', $task['n2_val'] ?? null]
                ]),
                'correct' => $task['correct_val'] ?? null
            ];
            break;
        case 'simon_says':
            $payload = ['sequence' => $task['sequence'] ?? []];
            break;
        case 'color_chaos':
            $payload = [
                'text' => $task['text'] ?? '',
                'color' => $task['color'] ?? '',
                'correct' => $task['correct_val'] ?? null
            ];
            break;
        case 'odd_one_out':
            $payload = [
                'items' => bbSortedTaskSignatureList($task['options'] ?? []),
                'correct' => $task['correct_val'] ?? null
            ];
            break;
        case 'reaction_test':
            $payload = ['type' => $gameType];
            break;
        case 'photo_memory':
            $payload = [
                'shown' => bbSortedTaskSignatureList($task['shown_items'] ?? []),
                'correct' => $task['correct_val'] ?? null
            ];
            break;
        case 'dice_sum':
            $payload = [
                'dice' => bbSortedTaskSignatureList($task['icons'] ?? []),
                'correct' => $task['correct_val'] ?? null
            ];
            break;
        case 'alchemy':
            $payload = ['question' => $task['question'] ?? '', 'correct' => $task['correct_val'] ?? null];
            break;
        case 'find_duplicate':
            $payload = [
                'grid' => bbSortedTaskSignatureList($task['grid'] ?? []),
                'correct' => $task['correct_val'] ?? null
            ];
            break;
        case 'defuse_numbers':
            $payload = ['grid' => $task['grid'] ?? []];
            break;
        case 'timing_safe':
            $payload = ['speed' => $task['speed'] ?? null];
            break;
        case 'blind_timer':
            $payload = ['target' => $task['target'] ?? null];
            break;
        case 'edible_inedible':
            $payload = [
                'item' => $task['item_name'] ?? '',
                'correct' => $task['correct_val'] ?? null
            ];
            break;
        case 'fact_check':
            $payload = ['fact' => $task['fact'] ?? '', 'correct' => $task['correct_val'] ?? null];
            break;
        case 'count_objects':
            $payload = [
                'target' => $task['target'] ?? '',
                'correct' => $task['correct_val'] ?? null
            ];
            break;
        case 'thimbles':
            $payload = [
                'initial_ball' => $task['initial_ball'] ?? null,
                'swaps' => $task['swaps'] ?? [],
                'correct' => $task['correct_val'] ?? null
            ];
            break;
        case 'ai_quiz':
            $payload = ['question' => $task['question'] ?? '', 'correct' => $task['correct_val'] ?? null];
            break;
        default:
            $payload = $task;
            unset(
                $payload['round_id'],
                $payload['created_at'],
                $payload['generated_at'],
                $payload['timestamp'],
                $payload['delay_ms']
            );
            if (isset($payload['options'])) {
                $payload['options'] = bbSortedTaskSignatureList($payload['options']);
            }
            break;
    }

    return hash('sha256', json_encode(
        bbNormalizeTaskSignatureValue(['type' => $gameType, 'content' => $payload]),
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
    ));
}

function bbRememberTaskSignature(&$state, $gameType, $signature)
{
    if (!is_array($state['task_signature_history'] ?? null)) {
        $state['task_signature_history'] = [];
    }

    $gameType = (string) $gameType;
    $history = is_array($state['task_signature_history'][$gameType] ?? null)
        ? $state['task_signature_history'][$gameType]
        : [];
    $history = array_values(array_filter($history, function ($storedSignature) use ($signature) {
        return $storedSignature !== $signature;
    }));
    $history[] = $signature;
    $state['task_signature_history'][$gameType] = array_slice(
        $history,
        -BRAINBATTLE_TASK_SIGNATURE_HISTORY_LIMIT
    );
}

function bbPickTaskSource($gameType, $sources, $taskBuilder, $excludedSignatures = [])
{
    $sources = is_array($sources) ? array_values($sources) : [];
    if (empty($sources)) {
        return null;
    }

    if (!empty($excludedSignatures)) {
        $sourcesBySignature = [];
        foreach ($sources as $source) {
            $task = $taskBuilder($source);
            $sourcesBySignature[bbBuildTaskSignature($gameType, $task)] = $source;
        }
        ksort($sourcesBySignature, SORT_STRING);

        $lastSignature = end($excludedSignatures);
        if ($lastSignature !== false && isset($sourcesBySignature[$lastSignature])) {
            $orderedSignatures = array_keys($sourcesBySignature);
            $lastIndex = array_search($lastSignature, $orderedSignatures, true);
            $nextIndex = ($lastIndex + 1) % count($orderedSignatures);
            return $sourcesBySignature[$orderedSignatures[$nextIndex]];
        }

        $unseenSources = array_diff_key($sourcesBySignature, array_flip($excludedSignatures));
        if (!empty($unseenSources)) {
            $sources = array_values($unseenSources);
        }
    }

    return $sources[array_rand($sources)];
}

function bbGenerateTaskDataWithHistory(&$state, $gameType)
{
    $gameType = (string) $gameType;
    $history = is_array($state['task_signature_history'][$gameType] ?? null)
        ? $state['task_signature_history'][$gameType]
        : [];
    $selectedTask = null;
    $selectedSignature = null;

    for ($attempt = 0; $attempt < BRAINBATTLE_TASK_GENERATION_ATTEMPTS; $attempt++) {
        $skipExternalGeneration = $gameType === 'ai_quiz' && $attempt > 0;
        $candidate = generateTaskData($gameType, $skipExternalGeneration, $history);
        if (!is_array($candidate) || empty($candidate['type'])) {
            continue;
        }

        $selectedTask = $candidate;
        $selectedSignature = bbBuildTaskSignature($gameType, $candidate);
        if (!in_array($selectedSignature, $history, true)) {
            break;
        }
    }

    if (!is_array($selectedTask)) {
        $selectedTask = generateTaskData($gameType, true, $history);
        $selectedSignature = bbBuildTaskSignature($gameType, $selectedTask);
    }

    bbRememberTaskSignature($state, $gameType, $selectedSignature);
    return $selectedTask;
}

function bbGetPlayerIds($pdo, $roomId)
{
    $stmt = $pdo->prepare("SELECT user_id FROM room_players WHERE room_id = ? ORDER BY id ASC");
    $stmt->execute([$roomId]);
    return array_map('strval', $stmt->fetchAll(PDO::FETCH_COLUMN));
}

function bbGetHumanIds($pdo, $roomId)
{
    $stmt = $pdo->prepare("
        SELECT rp.user_id
        FROM room_players rp
        JOIN users u ON u.id = rp.user_id
        WHERE rp.room_id = ?
          AND COALESCE(rp.is_bot, 0) = 0
          AND COALESCE(u.is_bot, 0) = 0
        ORDER BY rp.id ASC
    ");
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
    $state['round_data'] = bbGenerateTaskDataWithHistory($state, $gameType);
}

function generateTaskData($type, $skipExternalGeneration = false, $excludedSignatures = [])
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
            ['bi-bookmark-fill', 'bi-bookmark'],
            ['bi-camera', 'bi-camera-fill'],
            ['bi-cloud', 'bi-cloud-fill'],
            ['bi-folder', 'bi-folder-fill'],
            ['bi-flag', 'bi-flag-fill'],
            ['bi-house', 'bi-house-fill'],
            ['bi-lightbulb', 'bi-lightbulb-fill'],
            ['bi-pin', 'bi-pin-fill'],
            ['bi-shield', 'bi-shield-fill'],
            ['bi-telephone', 'bi-telephone-fill'],
            ['bi-trash', 'bi-trash-fill'],
            ['bi-trophy', 'bi-trophy-fill'],
            ['bi-emoji-smile', 'bi-emoji-frown'],
            ['bi-hand-index', 'bi-hand-index-fill'],
            ['bi-eye', 'bi-eye-slash'],
            ['bi-calendar', 'bi-calendar-fill'],
            ['bi-cart', 'bi-cart-fill'],
            ['bi-briefcase', 'bi-briefcase-fill'],
            ['bi-gift', 'bi-gift-fill'],
            ['bi-gear', 'bi-gear-fill'],
            ['bi-key', 'bi-key-fill'],
            ['bi-lamp', 'bi-lamp-fill'],
            ['bi-mouse', 'bi-mouse-fill'],
            ['bi-palette', 'bi-palette-fill'],
            ['bi-pencil', 'bi-pencil-fill'],
            ['bi-phone', 'bi-phone-fill'],
            ['bi-printer', 'bi-printer-fill'],
            ['bi-send', 'bi-send-fill'],
            ['bi-speaker', 'bi-speaker-fill'],
            ['bi-suit-club', 'bi-suit-club-fill'],
            ['bi-suit-diamond', 'bi-suit-diamond-fill'],
            ['bi-suit-heart', 'bi-suit-heart-fill'],
            ['bi-suit-spade', 'bi-suit-spade-fill'],
            ['bi-cup-hot', 'bi-cup-hot-fill'],
            ['bi-droplet', 'bi-droplet-fill'],
            ['bi-lightning', 'bi-lightning-fill'],
            ['bi-bag', 'bi-bag-fill'],
            ['bi-basket', 'bi-basket-fill'],
            ['bi-box', 'bi-box-fill'],
            ['bi-clipboard', 'bi-clipboard-fill'],
            ['bi-clock', 'bi-clock-fill']
        ];
        $variants = [];
        foreach ($pairs as $pair) {
            $variants[] = ['majority' => $pair[0], 'minority' => $pair[1]];
            $variants[] = ['majority' => $pair[1], 'minority' => $pair[0]];
        }
        $variant = bbPickTaskSource($type, $variants, function ($source) use ($type) {
            return [
                'type' => $type,
                'options' => array_merge(array_fill(0, 15, $source['majority']), [$source['minority']]),
                'correct_val' => $source['minority']
            ];
        }, $excludedSignatures);
        $maj = $variant['majority'];
        $min = $variant['minority'];

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
            'bi-moon-stars-fill', 'bi-star-fill', 'bi-heart-fill', 'bi-bicycle', 'bi-life-preserver',
            'bi-umbrella-fill', 'bi-cloud-rain-fill', 'bi-music-note-beamed', 'bi-puzzle-fill', 'bi-palette-fill',
            'bi-trophy-fill', 'bi-bug-fill', 'bi-tree-fill', 'bi-alarm-fill', 'bi-camera-fill',
            'bi-emoji-smile-fill', 'bi-brightness-high-fill', 'bi-lightning-charge-fill', 'bi-apple', 'bi-egg-fill',
            'bi-balloon-fill', 'bi-basket-fill', 'bi-bell-fill', 'bi-binoculars-fill', 'bi-boombox-fill',
            'bi-book-fill', 'bi-box-seam-fill', 'bi-briefcase-fill', 'bi-cake2-fill', 'bi-calculator-fill',
            'bi-calendar-heart-fill', 'bi-car-front-fill', 'bi-cassette-fill', 'bi-clock-fill', 'bi-cloud-snow-fill',
            'bi-compass-fill', 'bi-cup-hot-fill', 'bi-dice-5-fill', 'bi-disc-fill', 'bi-door-open-fill',
            'bi-droplet-fill', 'bi-ear-fill', 'bi-envelope-paper-fill', 'bi-feather', 'bi-film',
            'bi-fire', 'bi-flower1', 'bi-flower2', 'bi-flower3', 'bi-gem',
            'bi-globe-americas', 'bi-handbag-fill', 'bi-headphones', 'bi-house-heart-fill', 'bi-hourglass-split',
            'bi-key-fill', 'bi-lamp-fill', 'bi-lightbulb-fill', 'bi-magnet-fill', 'bi-map-fill',
            'bi-megaphone-fill', 'bi-mortarboard-fill', 'bi-mouse-fill', 'bi-piggy-bank-fill', 'bi-pin-map-fill',
            'bi-postcard-fill', 'bi-printer-fill', 'bi-radioactive', 'bi-rocket-takeoff-fill', 'bi-safe-fill',
            'bi-scissors', 'bi-snow2', 'bi-speaker-fill', 'bi-stopwatch-fill', 'bi-suitcase-lg-fill'
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
            ['items' => ['🐝', '🌸'], 'res' => '🍯', 'name' => 'Мед'],
            ['items' => ['🥛', '❄️'], 'res' => '🍦', 'name' => 'Мороженое'],
            ['items' => ['🧶', '🪡'], 'res' => '🧣', 'name' => 'Шарф'],
            ['items' => ['🌾', '💧'], 'res' => '🥖', 'name' => 'Хлеб'],
            ['items' => ['🔑', '🚪'], 'res' => '🔓', 'name' => 'Открыто'],
            ['items' => ['📚', '🧠'], 'res' => '🎓', 'name' => 'Знания'],
            ['items' => ['🎁', '🎂'], 'res' => '🎉', 'name' => 'Праздник'],
            ['items' => ['🎸', '🎤'], 'res' => '🎵', 'name' => 'Песня'],
            ['items' => ['🔨', '🪨'], 'res' => '🗿', 'name' => 'Скульптура'],
            ['items' => ['🍎', '🔥'], 'res' => '🥧', 'name' => 'Пирог'],
            ['items' => ['🪵', '🔥'], 'res' => '🔥', 'name' => 'Костер'],
            ['items' => ['🪨', '⛏️'], 'res' => '💎', 'name' => 'Самоцвет'],
            ['items' => ['🌱', '☀️'], 'res' => '🌿', 'name' => 'Росток'],
            ['items' => ['🍋', '💧'], 'res' => '🧃', 'name' => 'Лимонад'],
            ['items' => ['🍫', '🥛'], 'res' => '☕', 'name' => 'Какао'],
            ['items' => ['🥔', '🔥'], 'res' => '🍟', 'name' => 'Картофель фри'],
            ['items' => ['🍗', '🔥'], 'res' => '🍖', 'name' => 'Жаркое'],
            ['items' => ['🍅', '🥒'], 'res' => '🥗', 'name' => 'Салат'],
            ['items' => ['🍓', '🫐'], 'res' => '🫙', 'name' => 'Варенье'],
            ['items' => ['🥚', '🥛'], 'res' => '🥞', 'name' => 'Блины'],
            ['items' => ['🥞', '🍯'], 'res' => '😋', 'name' => 'Сладкий завтрак'],
            ['items' => ['🍚', '🥕'], 'res' => '🍛', 'name' => 'Плов'],
            ['items' => ['🍉', '🧊'], 'res' => '🍧', 'name' => 'Фруктовый лед'],
            ['items' => ['🥐', '☕'], 'res' => '🍽️', 'name' => 'Завтрак'],
            ['items' => ['🍒', '🥧'], 'res' => '🍰', 'name' => 'Десерт'],
            ['items' => ['🫘', '🥣'], 'res' => '🍲', 'name' => 'Суп'],
            ['items' => ['🥛', '🦠'], 'res' => '🥣', 'name' => 'Йогурт'],
            ['items' => ['🍊', '🫙'], 'res' => '🍬', 'name' => 'Мармелад'],
            ['items' => ['🍌', '🥛'], 'res' => '🧋', 'name' => 'Смузи'],
            ['items' => ['🍅', '🔥'], 'res' => '🥫', 'name' => 'Томатный соус'],
            ['items' => ['📄', '🖊️'], 'res' => '📝', 'name' => 'Заметка'],
            ['items' => ['📖', '🔍'], 'res' => '🔎', 'name' => 'Исследование'],
            ['items' => ['📷', '🌄'], 'res' => '📸', 'name' => 'Фотография'],
            ['items' => ['🎬', '🍿'], 'res' => '🎟️', 'name' => 'Киносеанс'],
            ['items' => ['🎵', '🕺'], 'res' => '💃', 'name' => 'Танец'],
            ['items' => ['⚽', '🥅'], 'res' => '🏆', 'name' => 'Победа'],
            ['items' => ['🏀', '👐'], 'res' => '⛹️', 'name' => 'Баскетбол'],
            ['items' => ['🛞', '🚗'], 'res' => '🚙', 'name' => 'Автомобиль'],
            ['items' => ['🔧', '🚗'], 'res' => '🛠️', 'name' => 'Ремонт'],
            ['items' => ['🧶', '🪝'], 'res' => '🧤', 'name' => 'Варежка'],
            ['items' => ['🪵', '🪚'], 'res' => '🛏️', 'name' => 'Кровать'],
            ['items' => ['🧱', '🔨'], 'res' => '🏗️', 'name' => 'Стройка'],
            ['items' => ['🧭', '🚢'], 'res' => '🗺️', 'name' => 'Морской маршрут'],
            ['items' => ['💨', '⛵'], 'res' => '🚤', 'name' => 'Плавание'],
            ['items' => ['🗺️', '🧭'], 'res' => '📍', 'name' => 'Маршрут'],
            ['items' => ['🏕️', '🔥'], 'res' => '⛺', 'name' => 'Лагерь'],
            ['items' => ['🌙', '⭐'], 'res' => '🌌', 'name' => 'Ночное небо'],
            ['items' => ['☀️', '🌊'], 'res' => '🏖️', 'name' => 'Пляж'],
            ['items' => ['🌊', '🏄'], 'res' => '🏄‍♂️', 'name' => 'Серфинг'],
            ['items' => ['❄️', '⛄'], 'res' => '☃️', 'name' => 'Снеговик'],
            ['items' => ['☁️', '⚡'], 'res' => '⛈️', 'name' => 'Гроза'],
            ['items' => ['🌸', '🌿'], 'res' => '💐', 'name' => 'Букет'],
            ['items' => ['🌹', '🎀'], 'res' => '🎁', 'name' => 'Подарок'],
            ['items' => ['👶', '⏳'], 'res' => '🧑', 'name' => 'Взросление'],
            ['items' => ['🧑', '⏳'], 'res' => '👴', 'name' => 'Старость'],
            ['items' => ['🖨️', '📄'], 'res' => '📑', 'name' => 'Копии'],
            ['items' => ['📦', '📮'], 'res' => '📤', 'name' => 'Отправка'],
            ['items' => ['📨', '💻'], 'res' => '📧', 'name' => 'Электронная почта'],
            ['items' => ['☎️', '💬'], 'res' => '📞', 'name' => 'Звонок'],
            ['items' => ['🎈', '🎁'], 'res' => '🥳', 'name' => 'Вечеринка'],
            ['items' => ['🎭', '🎫'], 'res' => '👏', 'name' => 'Аплодисменты'],
            ['items' => ['🎨', '🧑'], 'res' => '🧑‍🎨', 'name' => 'Художник'],
            ['items' => ['🔬', '🧪'], 'res' => '🧬', 'name' => 'Наука'],
            ['items' => ['🩺', '🏥'], 'res' => '👩‍⚕️', 'name' => 'Врач'],
            ['items' => ['🚒', '🔥'], 'res' => '🧯', 'name' => 'Тушение'],
            ['items' => ['🚑', '🏥'], 'res' => '🩹', 'name' => 'Помощь'],
            ['items' => ['🚓', '🚨'], 'res' => '👮', 'name' => 'Полиция'],
            ['items' => ['✈️', '🗺️'], 'res' => '🧳', 'name' => 'Путешествие'],
            ['items' => ['🚂', '🛤️'], 'res' => '🚉', 'name' => 'Станция'],
            ['items' => ['🚲', '⛰️'], 'res' => '🚵', 'name' => 'Велопоход'],
            ['items' => ['🏃', '🏁'], 'res' => '🥇', 'name' => 'Финиш'],
            ['items' => ['🐣', '⏳'], 'res' => '🐔', 'name' => 'Курица'],
            ['items' => ['🐑', '✂️'], 'res' => '🧶', 'name' => 'Шерсть'],
            ['items' => ['🐄', '🌾'], 'res' => '🥛', 'name' => 'Молоко'],
            ['items' => ['🌰', '🌱'], 'res' => '🌳', 'name' => 'Дерево'],
            ['items' => ['🪶', '🖋️'], 'res' => '✍️', 'name' => 'Письмо'],
        ];
        $r = bbPickTaskSource($type, $recipes, function ($recipe) use ($type) {
            return [
                'type' => $type,
                'question' => "{$recipe['items'][0]} + {$recipe['items'][1]} = ?",
                'correct_val' => $recipe['res']
            ];
        }, $excludedSignatures);
        $all_res = array_column($recipes, 'res');
        $wrong = ['💀', '👽', '🤖', '🎃', '💩', '🤡', '👻', '🌵', '🍄', '🕸️'];
        $wrong = array_values(array_unique(array_merge($wrong, array_diff($all_res, [$r['res']]))));
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
            'bi-search', 'bi-send-fill', 'bi-shield-fill', 'bi-speaker-fill', 'bi-suit-spade-fill',
            'bi-airplane-fill', 'bi-alarm-fill', 'bi-life-preserver', 'bi-award-fill', 'bi-bag-fill',
            'bi-balloon-heart-fill', 'bi-bank2', 'bi-basket-fill', 'bi-bell-fill', 'bi-bicycle',
            'bi-binoculars-fill', 'bi-book-fill', 'bi-bookmark-star-fill', 'bi-boombox-fill', 'bi-box-seam-fill',
            'bi-briefcase-fill', 'bi-brightness-high-fill', 'bi-cake2-fill', 'bi-calculator-fill', 'bi-calendar-heart-fill',
            'bi-car-front-fill', 'bi-cassette-fill', 'bi-clock-fill', 'bi-cloud-rain-fill', 'bi-cloud-snow-fill',
            'bi-compass-fill', 'bi-controller', 'bi-cup-straw', 'bi-dice-6-fill', 'bi-disc-fill',
            'bi-door-open-fill', 'bi-droplet-fill', 'bi-egg-fill', 'bi-emoji-sunglasses-fill', 'bi-feather',
            'bi-film', 'bi-fire', 'bi-flower1', 'bi-gem', 'bi-gift-fill',
            'bi-globe-asia-australia', 'bi-hammer', 'bi-handbag-fill', 'bi-headphones', 'bi-heart-fill',
            'bi-house-heart-fill', 'bi-hourglass-split', 'bi-lightning-charge-fill', 'bi-map-fill', 'bi-megaphone-fill',
            'bi-moon-stars-fill', 'bi-mortarboard-fill', 'bi-palette-fill', 'bi-piggy-bank-fill', 'bi-puzzle-fill'
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
            ['name' => 'Шуруп', 'type' => 'no'],
            ['name' => 'Персик', 'type' => 'yes'],
            ['name' => 'Нектарин', 'type' => 'yes'],
            ['name' => 'Слива', 'type' => 'yes'],
            ['name' => 'Вишня', 'type' => 'yes'],
            ['name' => 'Черешня', 'type' => 'yes'],
            ['name' => 'Лимон', 'type' => 'yes'],
            ['name' => 'Мандарин', 'type' => 'yes'],
            ['name' => 'Грейпфрут', 'type' => 'yes'],
            ['name' => 'Гранат', 'type' => 'yes'],
            ['name' => 'Дыня', 'type' => 'yes'],
            ['name' => 'Хурма', 'type' => 'yes'],
            ['name' => 'Инжир', 'type' => 'yes'],
            ['name' => 'Финик', 'type' => 'yes'],
            ['name' => 'Кокос', 'type' => 'yes'],
            ['name' => 'Папайя', 'type' => 'yes'],
            ['name' => 'Гуава', 'type' => 'yes'],
            ['name' => 'Маракуйя', 'type' => 'yes'],
            ['name' => 'Крыжовник', 'type' => 'yes'],
            ['name' => 'Смородина', 'type' => 'yes'],
            ['name' => 'Брусника', 'type' => 'yes'],
            ['name' => 'Клюква', 'type' => 'yes'],
            ['name' => 'Голубика', 'type' => 'yes'],
            ['name' => 'Ежевика', 'type' => 'yes'],
            ['name' => 'Кабачок', 'type' => 'yes'],
            ['name' => 'Тыква', 'type' => 'yes'],
            ['name' => 'Картофель', 'type' => 'yes'],
            ['name' => 'Свекла', 'type' => 'yes'],
            ['name' => 'Репа', 'type' => 'yes'],
            ['name' => 'Капуста', 'type' => 'yes'],
            ['name' => 'Цветная капуста', 'type' => 'yes'],
            ['name' => 'Перец', 'type' => 'yes'],
            ['name' => 'Горох', 'type' => 'yes'],
            ['name' => 'Фасоль', 'type' => 'yes'],
            ['name' => 'Чечевица', 'type' => 'yes'],
            ['name' => 'Кукуруза', 'type' => 'yes'],
            ['name' => 'Рис', 'type' => 'yes'],
            ['name' => 'Гречка', 'type' => 'yes'],
            ['name' => 'Овсянка', 'type' => 'yes'],
            ['name' => 'Хлеб', 'type' => 'yes'],
            ['name' => 'Батон', 'type' => 'yes'],
            ['name' => 'Бублик', 'type' => 'yes'],
            ['name' => 'Вафля', 'type' => 'yes'],
            ['name' => 'Печенье', 'type' => 'yes'],
            ['name' => 'Кекс', 'type' => 'yes'],
            ['name' => 'Пастила', 'type' => 'yes'],
            ['name' => 'Мармелад', 'type' => 'yes'],
            ['name' => 'Мороженое', 'type' => 'yes'],
            ['name' => 'Омлет', 'type' => 'yes'],
            ['name' => 'Яичница', 'type' => 'yes'],
            ['name' => 'Сосиска', 'type' => 'yes'],
            ['name' => 'Ветчина', 'type' => 'yes'],
            ['name' => 'Лосось', 'type' => 'yes'],
            ['name' => 'Тунец', 'type' => 'yes'],
            ['name' => 'Сельдь', 'type' => 'yes'],
            ['name' => 'Кальмар', 'type' => 'yes'],
            ['name' => 'Мидии', 'type' => 'yes'],
            ['name' => 'Устрица', 'type' => 'yes'],
            ['name' => 'Лаваш', 'type' => 'yes'],
            ['name' => 'Хумус', 'type' => 'yes'],
            ['name' => 'Гайка', 'type' => 'no'],
            ['name' => 'Болт', 'type' => 'no'],
            ['name' => 'Доска', 'type' => 'no'],
            ['name' => 'Бетон', 'type' => 'no'],
            ['name' => 'Цемент', 'type' => 'no'],
            ['name' => 'Пластилин', 'type' => 'no'],
            ['name' => 'Ручка', 'type' => 'no'],
            ['name' => 'Маркер', 'type' => 'no'],
            ['name' => 'Тетрадь', 'type' => 'no'],
            ['name' => 'Альбом', 'type' => 'no'],
            ['name' => 'Папка', 'type' => 'no'],
            ['name' => 'Конверт', 'type' => 'no'],
            ['name' => 'Степлер', 'type' => 'no'],
            ['name' => 'Кнопка', 'type' => 'no'],
            ['name' => 'Игла', 'type' => 'no'],
            ['name' => 'Нитка', 'type' => 'no'],
            ['name' => 'Веревка', 'type' => 'no'],
            ['name' => 'Цепь', 'type' => 'no'],
            ['name' => 'Замок', 'type' => 'no'],
            ['name' => 'Расческа', 'type' => 'no'],
            ['name' => 'Зубная щетка', 'type' => 'no'],
            ['name' => 'Полотенце', 'type' => 'no'],
            ['name' => 'Простыня', 'type' => 'no'],
            ['name' => 'Одеяло', 'type' => 'no'],
            ['name' => 'Матрас', 'type' => 'no'],
            ['name' => 'Табурет', 'type' => 'no'],
            ['name' => 'Стол', 'type' => 'no'],
            ['name' => 'Стул', 'type' => 'no'],
            ['name' => 'Кресло', 'type' => 'no'],
            ['name' => 'Полка', 'type' => 'no'],
            ['name' => 'Зеркало', 'type' => 'no'],
            ['name' => 'Ваза', 'type' => 'no'],
            ['name' => 'Тарелка', 'type' => 'no'],
            ['name' => 'Кружка', 'type' => 'no'],
            ['name' => 'Стакан', 'type' => 'no'],
            ['name' => 'Кастрюля', 'type' => 'no'],
            ['name' => 'Сковорода', 'type' => 'no'],
            ['name' => 'Дуршлаг', 'type' => 'no'],
            ['name' => 'Терка', 'type' => 'no'],
            ['name' => 'Венчик', 'type' => 'no'],
            ['name' => 'Пылесос', 'type' => 'no'],
            ['name' => 'Фен', 'type' => 'no'],
            ['name' => 'Вентилятор', 'type' => 'no'],
            ['name' => 'Обогреватель', 'type' => 'no'],
            ['name' => 'Будильник', 'type' => 'no'],
            ['name' => 'Калькулятор', 'type' => 'no'],
            ['name' => 'Ноутбук', 'type' => 'no'],
            ['name' => 'Планшет', 'type' => 'no'],
            ['name' => 'Клавиатура', 'type' => 'no'],
            ['name' => 'Мышь', 'type' => 'no'],
            ['name' => 'Наушники', 'type' => 'no'],
            ['name' => 'Колонка', 'type' => 'no'],
            ['name' => 'Кабель', 'type' => 'no'],
            ['name' => 'Розетка', 'type' => 'no'],
            ['name' => 'Выключатель', 'type' => 'no'],
            ['name' => 'Рюкзак', 'type' => 'no'],
            ['name' => 'Чемодан', 'type' => 'no'],
            ['name' => 'Перчатка', 'type' => 'no']
        ];
        $item = bbPickTaskSource($type, $items, function ($source) {
            return [
                'type' => 'edible_inedible',
                'item_name' => $source['name'],
                'correct_val' => ($source['type'] === 'yes' ? 'Съедобное' : 'Несъедобное')
            ];
        }, $excludedSignatures);
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
            ['text' => 'Мы глотаем 8 пауков в год во сне.', 'is_true' => false],
            ['text' => 'Звук распространяется быстрее света.', 'is_true' => false],
            ['text' => 'Меркурий — самая горячая планета Солнечной системы.', 'is_true' => false],
            ['text' => 'Все пустыни на Земле жаркие.', 'is_true' => false],
            ['text' => 'Киты относятся к рыбам.', 'is_true' => false],
            ['text' => 'Смена времен года происходит из-за расстояния от Земли до Солнца.', 'is_true' => false],
            ['text' => 'Пауки относятся к насекомым.', 'is_true' => false],
            ['text' => 'Луна излучает собственный свет.', 'is_true' => false],
            ['text' => 'Кровь человека внутри вен имеет синий цвет.', 'is_true' => false],
            ['text' => 'Страус — самая крупная летающая птица.', 'is_true' => false],
            ['text' => 'Белые медведи и пингвины живут рядом в дикой природе.', 'is_true' => false],
            ['text' => 'Солнце вращается вокруг Земли.', 'is_true' => false],
            ['text' => 'Все млекопитающие рождают живых детенышей.', 'is_true' => false]
        ];

        // Дополняем правдивыми утверждениями для баланса
        $trueFacts = [
            ['text' => 'W — единственная буква в английском алфавите, в которой больше одного слога.', 'is_true' => true],
            ['text' => 'У кошек нет ключиц.', 'is_true' => true],
            ['text' => 'Венера — самая горячая планета в Солнечной системе.', 'is_true' => true],
            ['text' => 'Косатки — это на самом деле дельфины.', 'is_true' => true],
            ['text' => 'Кровь омара бесцветная, но синеет при контакте с кислородом.', 'is_true' => true],
            ['text' => 'Ковбойские шляпы были изобретены не ковбоями, а Джоном Стетсоном.', 'is_true' => true],
            ['text' => 'Австралия одновременно является страной и континентом.', 'is_true' => true],
            ['text' => 'На флаге Японии изображен круг.', 'is_true' => true],
            ['text' => 'Дельфины относятся к млекопитающим.', 'is_true' => true],
            ['text' => 'Свет от Солнца достигает Земли примерно за восемь минут.', 'is_true' => true],
            ['text' => 'У пауков восемь ног.', 'is_true' => true],
            ['text' => 'Средняя плотность Сатурна меньше плотности воды.', 'is_true' => true],
            ['text' => 'Синий кит — крупнейшее известное животное.', 'is_true' => true],
            ['text' => 'В скелете взрослого человека обычно 206 костей.', 'is_true' => true],
            ['text' => 'Пингвины относятся к птицам.', 'is_true' => true],
            ['text' => 'На Луне практически нет атмосферы.', 'is_true' => true],
            ['text' => 'Вода кипит при 100 °C при нормальном атмосферном давлении.', 'is_true' => true],
            ['text' => 'Земля обращается вокруг Солнца.', 'is_true' => true],
            ['text' => 'Кровь осьминога имеет голубой цвет.', 'is_true' => true],
            ['text' => 'Бамбук относится к травам.', 'is_true' => true],
            ['text' => 'Морские коньки относятся к рыбам.', 'is_true' => true],
            ['text' => 'У взрослой бабочки шесть ног.', 'is_true' => true],
        ];
        $facts = array_merge($facts, $trueFacts);
        $moreTrueFacts = [
            ['text' => 'Меркурий — ближайшая к Солнцу планета.', 'is_true' => true],
            ['text' => 'У Земли один естественный спутник.', 'is_true' => true],
            ['text' => 'Юпитер относится к газовым гигантам.', 'is_true' => true],
            ['text' => 'Кольца Сатурна состоят в основном из льда и камней.', 'is_true' => true],
            ['text' => 'Ось вращения Урана сильно наклонена.', 'is_true' => true],
            ['text' => 'Нептун — самая дальняя от Солнца планета.', 'is_true' => true],
            ['text' => 'У Марса два естественных спутника.', 'is_true' => true],
            ['text' => 'Солнце является звездой.', 'is_true' => true],

            ['text' => 'Свет распространяется быстрее звука.', 'is_true' => true],
            ['text' => 'В вакууме звук не распространяется.', 'is_true' => true],
            ['text' => 'При нормальном давлении вода замерзает при 0 °C.', 'is_true' => true],
            ['text' => 'Алмаз состоит из углерода.', 'is_true' => true],
            ['text' => 'Химический символ кислорода — O.', 'is_true' => true],
            ['text' => 'Химический символ золота — Au.', 'is_true' => true],
            ['text' => 'Поваренная соль — это хлорид натрия.', 'is_true' => true],
            ['text' => 'В атмосфере Земли больше азота, чем кислорода.', 'is_true' => true],

            ['text' => 'При фотосинтезе растения выделяют кислород.', 'is_true' => true],
            ['text' => 'Лед менее плотный, чем жидкая вода.', 'is_true' => true],
            ['text' => 'Сердце человека состоит из четырех камер.', 'is_true' => true],
            ['text' => 'В легких происходит обмен кислорода и углекислого газа.', 'is_true' => true],
            ['text' => 'Кожа является органом человека.', 'is_true' => true],
            ['text' => 'Киты дышат атмосферным воздухом.', 'is_true' => true],
            ['text' => 'Акулы относятся к рыбам.', 'is_true' => true],
            ['text' => 'Осьминоги относятся к моллюскам.', 'is_true' => true],

            ['text' => 'У насекомых шесть ног.', 'is_true' => true],
            ['text' => 'Перья есть только у птиц.', 'is_true' => true],
            ['text' => 'Лягушки относятся к земноводным.', 'is_true' => true],
            ['text' => 'Летучие мыши способны к длительному активному полету.', 'is_true' => true],
            ['text' => 'Утконос откладывает яйца.', 'is_true' => true],
            ['text' => 'Пингвины не умеют летать.', 'is_true' => true],
            ['text' => 'Колибри умеют зависать в воздухе.', 'is_true' => true],
            ['text' => 'Пчелы участвуют в опылении растений.', 'is_true' => true],

            ['text' => 'Коралловые полипы относятся к животным.', 'is_true' => true],
            ['text' => 'Морские звезды относятся к иглокожим.', 'is_true' => true],
            ['text' => 'В горбах верблюда накапливается жир.', 'is_true' => true],
            ['text' => 'В хоботе слона нет костей.', 'is_true' => true],
            ['text' => 'Сова может повернуть голову примерно на 270 градусов.', 'is_true' => true],
            ['text' => 'У змей нет наружных ушей.', 'is_true' => true],
            ['text' => 'Крокодилы относятся к пресмыкающимся.', 'is_true' => true],
            ['text' => 'Черепахи относятся к пресмыкающимся.', 'is_true' => true],

            ['text' => 'Антарктида является континентом.', 'is_true' => true],
            ['text' => 'Пустыня Сахара находится в Африке.', 'is_true' => true],
            ['text' => 'Река Нил протекает по Африке.', 'is_true' => true],
            ['text' => 'Река Амазонка находится в Южной Америке.', 'is_true' => true],
            ['text' => 'Альпы находятся в Европе.', 'is_true' => true],
            ['text' => 'Япония является островным государством.', 'is_true' => true],
            ['text' => 'Исландия находится в северной части Атлантики.', 'is_true' => true],
            ['text' => 'Экватор делит Землю на Северное и Южное полушария.', 'is_true' => true],

            ['text' => 'Тихий океан больше Атлантического.', 'is_true' => true],
            ['text' => 'Мертвое море является озером.', 'is_true' => true],
            ['text' => 'Каспийское море является замкнутым водоемом.', 'is_true' => true],
            ['text' => 'Столица Австралии — Канберра.', 'is_true' => true],
            ['text' => 'Столица Канады — Оттава.', 'is_true' => true],
            ['text' => 'Официальный язык Бразилии — португальский.', 'is_true' => true],
            ['text' => 'Большая часть Египта находится в Африке.', 'is_true' => true],
            ['text' => 'Гренландия — крупнейший остров мира.', 'is_true' => true],

            ['text' => 'Бумагу изобрели в Древнем Китае.', 'is_true' => true],
            ['text' => 'В римской системе счисления нет отдельного знака нуля.', 'is_true' => true],
            ['text' => 'Книгопечатание Гутенберга появилось в Европе в XV веке.', 'is_true' => true],
            ['text' => 'Античные Олимпийские игры зародились в Греции.', 'is_true' => true],
            ['text' => 'Внутри фортепиано есть струны.', 'is_true' => true],
            ['text' => 'У классической скрипки четыре струны.', 'is_true' => true],
            ['text' => '«Мону Лизу» написал Леонардо да Винчи.', 'is_true' => true],
            ['text' => 'Трагедию «Гамлет» написал Уильям Шекспир.', 'is_true' => true],
        ];
        $moreFalseFacts = [
            ['text' => 'Земля имеет форму плоского диска.', 'is_true' => false],
            ['text' => 'Солнце относится к планетам.', 'is_true' => false],
            ['text' => 'Луна относится к планетам.', 'is_true' => false],
            ['text' => 'Юпитер имеет твердую каменную поверхность.', 'is_true' => false],
            ['text' => 'Сатурн — единственная планета с кольцами.', 'is_true' => false],
            ['text' => 'У Меркурия плотная кислородная атмосфера.', 'is_true' => false],
            ['text' => 'Марс больше Земли.', 'is_true' => false],
            ['text' => 'Нептун находится ближе к Солнцу, чем Земля.', 'is_true' => false],

            ['text' => 'У Венеры есть два естественных спутника.', 'is_true' => false],
            ['text' => 'У Земли два Солнца.', 'is_true' => false],
            ['text' => 'Свет распространяется медленнее звука.', 'is_true' => false],
            ['text' => 'Звук свободно распространяется в полном вакууме.', 'is_true' => false],
            ['text' => 'При нормальном давлении вода замерзает при 10 °C.', 'is_true' => false],
            ['text' => 'Обычный лед тонет в пресной воде.', 'is_true' => false],
            ['text' => 'Химический символ золота — Go.', 'is_true' => false],
            ['text' => 'Поваренная соль имеет формулу CO2.', 'is_true' => false],

            ['text' => 'В атмосфере Земли больше кислорода, чем азота.', 'is_true' => false],
            ['text' => 'Растения получают всю пищу только из почвы.', 'is_true' => false],
            ['text' => 'Сердце человека состоит из двух камер.', 'is_true' => false],
            ['text' => 'Легкие перекачивают кровь по всему телу.', 'is_true' => false],
            ['text' => 'Кожа человека не является органом.', 'is_true' => false],
            ['text' => 'Киты дышат жабрами.', 'is_true' => false],
            ['text' => 'Дельфины относятся к рыбам.', 'is_true' => false],
            ['text' => 'Акулы относятся к млекопитающим.', 'is_true' => false],

            ['text' => 'Осьминоги относятся к позвоночным.', 'is_true' => false],
            ['text' => 'У насекомых восемь ног.', 'is_true' => false],
            ['text' => 'У пауков шесть ног.', 'is_true' => false],
            ['text' => 'Все птицы умеют летать.', 'is_true' => false],
            ['text' => 'Пингвины относятся к млекопитающим.', 'is_true' => false],
            ['text' => 'Летучие мыши относятся к птицам.', 'is_true' => false],
            ['text' => 'Утконос всегда рождает живых детенышей.', 'is_true' => false],
            ['text' => 'Лягушки относятся к пресмыкающимся.', 'is_true' => false],

            ['text' => 'Кораллы относятся к растениям.', 'is_true' => false],
            ['text' => 'Морские звезды относятся к рыбам.', 'is_true' => false],
            ['text' => 'В горбах верблюда хранится вода.', 'is_true' => false],
            ['text' => 'Внутри хобота слона находится длинная кость.', 'is_true' => false],
            ['text' => 'Змеи моргают подвижными веками.', 'is_true' => false],
            ['text' => 'Крокодилы относятся к земноводным.', 'is_true' => false],
            ['text' => 'Черепахи относятся к насекомым.', 'is_true' => false],
            ['text' => 'Антарктида находится в Северном полушарии.', 'is_true' => false],

            ['text' => 'Пустыня Сахара находится в Южной Америке.', 'is_true' => false],
            ['text' => 'Река Амазонка протекает по Африке.', 'is_true' => false],
            ['text' => 'Альпы находятся в Азии.', 'is_true' => false],
            ['text' => 'Япония является отдельным континентом.', 'is_true' => false],
            ['text' => 'Исландия находится в Тихом океане.', 'is_true' => false],
            ['text' => 'Экватор проходит через Северный и Южный полюса.', 'is_true' => false],
            ['text' => 'Атлантический океан больше Тихого.', 'is_true' => false],
            ['text' => 'Мертвое море является океаном.', 'is_true' => false],

            ['text' => 'Каспийское море соединено с океаном естественным проливом.', 'is_true' => false],
            ['text' => 'Столица Австралии — Сидней.', 'is_true' => false],
            ['text' => 'Столица Канады — Торонто.', 'is_true' => false],
            ['text' => 'Официальный язык Бразилии — испанский.', 'is_true' => false],
            ['text' => 'Египет целиком находится в Южной Америке.', 'is_true' => false],
            ['text' => 'Гренландия является отдельным континентом.', 'is_true' => false],
            ['text' => 'Бумагу изобрели в Древнем Риме.', 'is_true' => false],
            ['text' => 'В римской системе счисления есть знак нуля.', 'is_true' => false],

            ['text' => 'Печатный станок Гутенберга появился в XX веке.', 'is_true' => false],
            ['text' => 'Античные Олимпийские игры зародились в Канаде.', 'is_true' => false],
            ['text' => 'Внутри фортепиано нет струн.', 'is_true' => false],
            ['text' => 'У классической скрипки шесть струн.', 'is_true' => false],
            ['text' => '«Мону Лизу» написал Винсент ван Гог.', 'is_true' => false],
            ['text' => 'Трагедию «Гамлет» написал Лев Толстой.', 'is_true' => false],
            ['text' => 'Флейта относится к ударным инструментам.', 'is_true' => false],
            ['text' => 'Шахматная доска состоит из 100 клеток.', 'is_true' => false],
        ];
        $facts = array_merge($facts, $moreTrueFacts, $moreFalseFacts);

        // Общий генератор раунда проверит сигнатуру выбранного утверждения.
        $fact = bbPickTaskSource($type, $facts, function ($source) {
            return [
                'type' => 'fact_check',
                'fact' => $source['text'],
                'correct_val' => ($source['is_true'] ? 'Правда' : 'Ложь')
            ];
        }, $excludedSignatures);
        return [
            'type' => 'fact_check',
            'title' => 'Правда или Ложь?',
            'fact' => $fact['text'],
            'correct_val' => ($fact['is_true'] ? 'Правда' : 'Ложь')
        ];
    }

    // 9. СЧЕТ ОБЪЕКТОВ (Attention)
    if ($type === 'count_objects') {
        $icons = [
            'bi-apple', 'bi-car-front-fill', 'bi-bug-fill', 'bi-egg-fill', 'bi-gem',
            'bi-star-fill', 'bi-rocket-takeoff-fill', 'bi-heart-fill', 'bi-airplane-fill', 'bi-balloon-fill',
            'bi-basket-fill', 'bi-bell-fill', 'bi-bicycle', 'bi-book-fill', 'bi-boombox-fill',
            'bi-camera-fill', 'bi-cake2-fill', 'bi-cloud-fill', 'bi-controller', 'bi-cup-hot-fill',
            'bi-dice-5-fill', 'bi-droplet-fill', 'bi-fire', 'bi-flower1', 'bi-gift-fill',
            'bi-lightbulb-fill', 'bi-moon-stars-fill', 'bi-palette-fill', 'bi-tree-fill', 'bi-trophy-fill'
        ];
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
        $topics = ['История', 'Наука', 'Космос', 'Кино', 'Животные', 'Интернет', 'Игры'];
        $topic = $topics[array_rand($topics)];

        $backups = [
            ['question' => 'Столица Франции?', 'options' => ['Париж', 'Лондон', 'Берлин', 'Рим'], 'correct_val' => 'Париж'],
            ['question' => 'Сколько планет в Солнечной системе?', 'options' => ['8', '9', '7', '10'], 'correct_val' => '8'],
            ['question' => 'Самое глубокое озеро?', 'options' => ['Байкал', 'Виктория', 'Танганьика', 'Гурон'], 'correct_val' => 'Байкал'],
            ['question' => 'Химическая формула воды?', 'options' => ['H2O', 'CO2', 'O2', 'NaCl'], 'correct_val' => 'H2O'],
            ['question' => 'Кто написал "Войну и мир"?', 'options' => ['Толстой', 'Достоевский', 'Пушкин', 'Лермонтов'], 'correct_val' => 'Толстой'],
            ['question' => 'Какой океан самый большой?', 'options' => ['Тихий', 'Атлантический', 'Индийский', 'Северный Ледовитый'], 'correct_val' => 'Тихий'],
            ['question' => 'Кто написал "Маленького принца"?', 'options' => ['Сент-Экзюпери', 'Жюль Верн', 'Виктор Гюго', 'Александр Дюма'], 'correct_val' => 'Сент-Экзюпери'],
            ['question' => 'Единица измерения силы тока?', 'options' => ['Ампер', 'Вольт', 'Ватт', 'Ом'], 'correct_val' => 'Ампер'],
            ['question' => 'Какую планету называют Красной?', 'options' => ['Марс', 'Венера', 'Юпитер', 'Нептун'], 'correct_val' => 'Марс'],
            ['question' => 'Какое животное откладывает яйца?', 'options' => ['Утконос', 'Дельфин', 'Кит', 'Летучая мышь'], 'correct_val' => 'Утконос'],
            ['question' => 'Самое высокое наземное животное?', 'options' => ['Жираф', 'Слон', 'Верблюд', 'Лось'], 'correct_val' => 'Жираф'],
            ['question' => 'Какой металл жидкий при комнатной температуре?', 'options' => ['Ртуть', 'Железо', 'Алюминий', 'Медь'], 'correct_val' => 'Ртуть'],
            ['question' => 'Какой океан лежит между Африкой и Австралией?', 'options' => ['Индийский', 'Тихий', 'Атлантический', 'Северный Ледовитый'], 'correct_val' => 'Индийский'],
            ['question' => 'Чем измеряют температуру?', 'options' => ['Термометром', 'Барометром', 'Компасом', 'Секундомером'], 'correct_val' => 'Термометром'],
            ['question' => 'Какой месяц открывает календарный год?', 'options' => ['Январь', 'Март', 'Июнь', 'Декабрь'], 'correct_val' => 'Январь'],
            ['question' => 'Сколько будет 12 × 12?', 'options' => ['144', '124', '132', '154'], 'correct_val' => '144'],
            ['question' => 'Какой газ поглощают растения при фотосинтезе?', 'options' => ['Углекислый газ', 'Кислород', 'Азот', 'Водород'], 'correct_val' => 'Углекислый газ'],
            ['question' => 'Самая большая планета Солнечной системы?', 'options' => ['Юпитер', 'Сатурн', 'Земля', 'Нептун'], 'correct_val' => 'Юпитер'],
            ['question' => 'На флаге какой страны изображен кленовый лист?', 'options' => ['Канада', 'США', 'Австралия', 'Норвегия'], 'correct_val' => 'Канада'],
            ['question' => 'На каком языке говорят в Бразилии?', 'options' => ['Португальский', 'Испанский', 'Французский', 'Итальянский'], 'correct_val' => 'Португальский'],
            ['question' => 'Сколько фигур у игрока в начале шахматной партии?', 'options' => ['16', '12', '18', '20'], 'correct_val' => '16'],
            ['question' => 'На каком материке находится Сахара?', 'options' => ['Африка', 'Азия', 'Австралия', 'Южная Америка'], 'correct_val' => 'Африка'],
            ['question' => 'Какая звезда ближе всего к Земле?', 'options' => ['Солнце', 'Сириус', 'Полярная', 'Вега'], 'correct_val' => 'Солнце'],
            ['question' => 'Кто написал "Капитанскую дочку"?', 'options' => ['Пушкин', 'Гоголь', 'Чехов', 'Тургенев'], 'correct_val' => 'Пушкин'],
            ['question' => 'Самый большой орган человека?', 'options' => ['Кожа', 'Печень', 'Легкие', 'Сердце'], 'correct_val' => 'Кожа']
        ];
        $backups = array_merge($backups, [
            // История
            ['question' => 'Кто был первым императором Рима?', 'options' => ['Август', 'Нерон', 'Траян', 'Цезарь'], 'correct_val' => 'Август'],
            ['question' => 'В какой стране подписали Великую хартию вольностей?', 'options' => ['Англия', 'Франция', 'Испания', 'Греция'], 'correct_val' => 'Англия'],
            ['question' => 'Какая цивилизация построила пирамиды в Гизе?', 'options' => ['Древний Египет', 'Древний Рим', 'Майя', 'Финикия'], 'correct_val' => 'Древний Египет'],
            ['question' => 'В каком городе находится Колизей?', 'options' => ['Рим', 'Афины', 'Париж', 'Каир'], 'correct_val' => 'Рим'],
            ['question' => 'Кто связан с изобретением европейского печатного станка?', 'options' => ['Гутенберг', 'Ньютон', 'Эдисон', 'Галилей'], 'correct_val' => 'Гутенберг'],
            ['question' => 'Какой народ построил Мачу-Пикчу?', 'options' => ['Инки', 'Ацтеки', 'Римляне', 'Викинги'], 'correct_val' => 'Инки'],
            ['question' => 'Где зародились античные Олимпийские игры?', 'options' => ['В Греции', 'В Египте', 'В Китае', 'В Персии'], 'correct_val' => 'В Греции'],
            ['question' => 'В каком году пала Берлинская стена?', 'options' => ['1989', '1975', '1999', '1961'], 'correct_val' => '1989'],
            ['question' => 'Какой регион считают родиной викингов?', 'options' => ['Скандинавия', 'Балканы', 'Сибирь', 'Сахара'], 'correct_val' => 'Скандинавия'],
            ['question' => 'В какой стране началось Возрождение?', 'options' => ['Италия', 'Швеция', 'Индия', 'Канада'], 'correct_val' => 'Италия'],

            // География
            ['question' => 'Столица Японии?', 'options' => ['Токио', 'Киото', 'Осака', 'Сеул'], 'correct_val' => 'Токио'],
            ['question' => 'Самая длинная река Европы?', 'options' => ['Волга', 'Дунай', 'Рейн', 'Темза'], 'correct_val' => 'Волга'],
            ['question' => 'В какой стране находится гора Фудзи?', 'options' => ['Япония', 'Китай', 'Непал', 'Индия'], 'correct_val' => 'Япония'],
            ['question' => 'На каком материке находятся Анды?', 'options' => ['Южная Америка', 'Африка', 'Европа', 'Австралия'], 'correct_val' => 'Южная Америка'],
            ['question' => 'По какой части света течет Дунай?', 'options' => ['Европа', 'Азия', 'Африка', 'Австралия'], 'correct_val' => 'Европа'],
            ['question' => 'Какая жаркая пустыня самая большая?', 'options' => ['Сахара', 'Гоби', 'Калахари', 'Атакама'], 'correct_val' => 'Сахара'],
            ['question' => 'Какую страну сравнивают с сапогом?', 'options' => ['Италия', 'Португалия', 'Чили', 'Норвегия'], 'correct_val' => 'Италия'],
            ['question' => 'Какой город стоит на берегах Босфора?', 'options' => ['Стамбул', 'Мадрид', 'Прага', 'Вена'], 'correct_val' => 'Стамбул'],
            ['question' => 'Столица Аргентины?', 'options' => ['Буэнос-Айрес', 'Лима', 'Сантьяго', 'Кито'], 'correct_val' => 'Буэнос-Айрес'],
            ['question' => 'У берегов какой страны расположен Большой Барьерный риф?', 'options' => ['Австралия', 'Канада', 'Исландия', 'Япония'], 'correct_val' => 'Австралия'],

            // Наука
            ['question' => 'Химический символ железа?', 'options' => ['Fe', 'Ir', 'Ag', 'Zn'], 'correct_val' => 'Fe'],
            ['question' => 'Самый твердый природный материал?', 'options' => ['Алмаз', 'Кварц', 'Гранит', 'Стекло'], 'correct_val' => 'Алмаз'],
            ['question' => 'Какой газ нужен человеку для дыхания?', 'options' => ['Кислород', 'Гелий', 'Метан', 'Неон'], 'correct_val' => 'Кислород'],
            ['question' => 'Единица электрического сопротивления?', 'options' => ['Ом', 'Ватт', 'Ампер', 'Джоуль'], 'correct_val' => 'Ом'],
            ['question' => 'Что находится в центре атома?', 'options' => ['Ядро', 'Молекула', 'Клетка', 'Кристалл'], 'correct_val' => 'Ядро'],
            ['question' => 'Какой pH считается нейтральным?', 'options' => ['7', '1', '5', '12'], 'correct_val' => '7'],
            ['question' => 'При какой температуре вода кипит при нормальном давлении?', 'options' => ['100 °C', '50 °C', '80 °C', '120 °C'], 'correct_val' => '100 °C'],
            ['question' => 'Что хранит наследственную информацию?', 'options' => ['ДНК', 'Крахмал', 'Кислород', 'Кальций'], 'correct_val' => 'ДНК'],
            ['question' => 'В чем измеряют уровень громкости?', 'options' => ['Децибелы', 'Метры', 'Литры', 'Вольты'], 'correct_val' => 'Децибелы'],
            ['question' => 'Какой орган перекачивает кровь?', 'options' => ['Сердце', 'Желудок', 'Печень', 'Почка'], 'correct_val' => 'Сердце'],

            // Космос
            ['question' => 'Кто первым полетел в космос?', 'options' => ['Юрий Гагарин', 'Нил Армстронг', 'Алексей Леонов', 'Джон Гленн'], 'correct_val' => 'Юрий Гагарин'],
            ['question' => 'Естественный спутник Земли?', 'options' => ['Луна', 'Фобос', 'Титан', 'Европа'], 'correct_val' => 'Луна'],
            ['question' => 'Крупнейший спутник Сатурна?', 'options' => ['Титан', 'Ио', 'Луна', 'Фобос'], 'correct_val' => 'Титан'],
            ['question' => 'В какой галактике находится Солнечная система?', 'options' => ['Млечный Путь', 'Андромеда', 'Треугольник', 'Водоворот'], 'correct_val' => 'Млечный Путь'],
            ['question' => 'Чем наблюдают далекие небесные объекты?', 'options' => ['Телескопом', 'Микроскопом', 'Барометром', 'Компасом'], 'correct_val' => 'Телескопом'],
            ['question' => 'Куда направлен хвост кометы?', 'options' => ['От Солнца', 'К Солнцу', 'К Земле', 'К Полярной звезде'], 'correct_val' => 'От Солнца'],
            ['question' => 'Какая планета известна заметными кольцами?', 'options' => ['Сатурн', 'Марс', 'Венера', 'Меркурий'], 'correct_val' => 'Сатурн'],
            ['question' => 'Вокруг чего обращается МКС?', 'options' => ['Вокруг Земли', 'Вокруг Луны', 'Вокруг Марса', 'Вокруг Солнца'], 'correct_val' => 'Вокруг Земли'],
            ['question' => 'В каком созвездии находится Полярная звезда?', 'options' => ['Малая Медведица', 'Орион', 'Лира', 'Кассиопея'], 'correct_val' => 'Малая Медведица'],
            ['question' => 'Что вызывает смену дня и ночи?', 'options' => ['Вращение Земли', 'Фазы Луны', 'Ветер', 'Приливы'], 'correct_val' => 'Вращение Земли'],

            // Природа
            ['question' => 'Как называется превращение воды в пар?', 'options' => ['Испарение', 'Замерзание', 'Плавление', 'Конденсация'], 'correct_val' => 'Испарение'],
            ['question' => 'На каком дереве растут желуди?', 'options' => ['Дуб', 'Береза', 'Клен', 'Сосна'], 'correct_val' => 'Дуб'],
            ['question' => 'Какое дерево имеет длинные иголки?', 'options' => ['Сосна', 'Липа', 'Осина', 'Яблоня'], 'correct_val' => 'Сосна'],
            ['question' => 'Какой влажный тропический лес крупнейший?', 'options' => ['Амазонские леса', 'Шервудский лес', 'Черный лес', 'Беловежская пуща'], 'correct_val' => 'Амазонские леса'],
            ['question' => 'Какое время года идет после весны?', 'options' => ['Лето', 'Осень', 'Зима', 'Весна'], 'correct_val' => 'Лето'],
            ['question' => 'Сколько цветов традиционно выделяют в радуге?', 'options' => ['7', '5', '6', '8'], 'correct_val' => '7'],
            ['question' => 'Как называются замерзшие осадки в хлопьях?', 'options' => ['Снег', 'Роса', 'Туман', 'Иней'], 'correct_val' => 'Снег'],
            ['question' => 'Как называется магма после выхода на поверхность?', 'options' => ['Лава', 'Гейзер', 'Глина', 'Гранит'], 'correct_val' => 'Лава'],
            ['question' => 'Что сильнее всего влияет на земные приливы?', 'options' => ['Луна', 'Марс', 'Ветер', 'Облака'], 'correct_val' => 'Луна'],
            ['question' => 'Как называется плодородная часть почвы?', 'options' => ['Гумус', 'Гранит', 'Лава', 'Лед'], 'correct_val' => 'Гумус'],

            // Животные
            ['question' => 'Самое быстрое наземное животное?', 'options' => ['Гепард', 'Лев', 'Лошадь', 'Антилопа'], 'correct_val' => 'Гепард'],
            ['question' => 'Какой вид диких кошек самый крупный?', 'options' => ['Тигр', 'Лев', 'Леопард', 'Рысь'], 'correct_val' => 'Тигр'],
            ['question' => 'С какой страной чаще связывают кенгуру?', 'options' => ['Австралия', 'Индия', 'Канада', 'Норвегия'], 'correct_val' => 'Австралия'],
            ['question' => 'Чем в основном питается большая панда?', 'options' => ['Бамбуком', 'Рыбой', 'Орехами', 'Травой саванны'], 'correct_val' => 'Бамбуком'],
            ['question' => 'Что хранится в горбах верблюда?', 'options' => ['Жир', 'Вода', 'Воздух', 'Кровь'], 'correct_val' => 'Жир'],
            ['question' => 'Какая птица чаще активна ночью?', 'options' => ['Сова', 'Ласточка', 'Чайка', 'Журавль'], 'correct_val' => 'Сова'],
            ['question' => 'Как называют личинку лягушки?', 'options' => ['Головастик', 'Гусеница', 'Малек', 'Нимфа'], 'correct_val' => 'Головастик'],
            ['question' => 'Как называется дом пчел?', 'options' => ['Улей', 'Нора', 'Берлога', 'Гнездо'], 'correct_val' => 'Улей'],
            ['question' => 'Как называют группу львов?', 'options' => ['Прайд', 'Стая', 'Табун', 'Косяк'], 'correct_val' => 'Прайд'],
            ['question' => 'К какой группе относится тюлень?', 'options' => ['Млекопитающие', 'Рыбы', 'Птицы', 'Земноводные'], 'correct_val' => 'Млекопитающие'],

            // Технологии
            ['question' => 'Какие цифры использует двоичная система?', 'options' => ['0 и 1', '1 и 2', '0 и 9', '2 и 8'], 'correct_val' => '0 и 1'],
            ['question' => 'Что означает CPU в компьютере?', 'options' => ['Процессор', 'Монитор', 'Клавиатура', 'Накопитель'], 'correct_val' => 'Процессор'],
            ['question' => 'Какое устройство вводит текст?', 'options' => ['Клавиатура', 'Монитор', 'Колонка', 'Проектор'], 'correct_val' => 'Клавиатура'],
            ['question' => 'Какая система помогает определить координаты?', 'options' => ['GPS', 'PDF', 'HTML', 'JPEG'], 'correct_val' => 'GPS'],
            ['question' => 'Что соединяют через USB?', 'options' => ['Устройства', 'Улицы', 'Континенты', 'Созвездия'], 'correct_val' => 'Устройства'],
            ['question' => 'Минимальный элемент растрового изображения?', 'options' => ['Пиксель', 'Кадр', 'Символ', 'Байт'], 'correct_val' => 'Пиксель'],
            ['question' => 'Что из этого является браузером?', 'options' => ['Firefox', 'Excel', 'Photoshop', 'Telegram'], 'correct_val' => 'Firefox'],
            ['question' => 'Какая технология создает беспроводную локальную сеть?', 'options' => ['Wi-Fi', 'HDMI', 'VGA', 'SATA'], 'correct_val' => 'Wi-Fi'],
            ['question' => 'Какую форму обычно имеет QR-код?', 'options' => ['Квадрат', 'Круг', 'Треугольник', 'Овал'], 'correct_val' => 'Квадрат'],
            ['question' => 'Что из этого является операционной системой?', 'options' => ['Linux', 'Bluetooth', 'JPEG', 'YouTube'], 'correct_val' => 'Linux'],

            // Культура и литература
            ['question' => 'Кто написал «Евгения Онегина»?', 'options' => ['Пушкин', 'Чехов', 'Гоголь', 'Некрасов'], 'correct_val' => 'Пушкин'],
            ['question' => 'Автор романа «Преступление и наказание»?', 'options' => ['Достоевский', 'Толстой', 'Тургенев', 'Бунин'], 'correct_val' => 'Достоевский'],
            ['question' => 'Кто написал «Мастера и Маргариту»?', 'options' => ['Булгаков', 'Пастернак', 'Набоков', 'Куприн'], 'correct_val' => 'Булгаков'],
            ['question' => 'Автор пьесы «Ромео и Джульетта»?', 'options' => ['Шекспир', 'Мольер', 'Гете', 'Байрон'], 'correct_val' => 'Шекспир'],
            ['question' => 'Кому приписывают поэму «Одиссея»?', 'options' => ['Гомер', 'Сократ', 'Платон', 'Вергилий'], 'correct_val' => 'Гомер'],
            ['question' => 'Кто создал Дон Кихота?', 'options' => ['Сервантес', 'Данте', 'Бальзак', 'Кафка'], 'correct_val' => 'Сервантес'],
            ['question' => 'Кто придумал Шерлока Холмса?', 'options' => ['Конан Дойл', 'Агата Кристи', 'Жюль Верн', 'Эдгар По'], 'correct_val' => 'Конан Дойл'],
            ['question' => 'Автор романа «Моби Дик»?', 'options' => ['Мелвилл', 'Хемингуэй', 'Твен', 'Лондон'], 'correct_val' => 'Мелвилл'],
            ['question' => 'Кто написал сказку «Русалочка»?', 'options' => ['Андерсен', 'Перро', 'Гримм', 'Линдгрен'], 'correct_val' => 'Андерсен'],
            ['question' => 'Кто написал «Алису в Стране чудес»?', 'options' => ['Льюис Кэрролл', 'Редьярд Киплинг', 'Оскар Уайльд', 'Даниэль Дефо'], 'correct_val' => 'Льюис Кэрролл'],
            ['question' => 'Автор «Робинзона Крузо»?', 'options' => ['Даниэль Дефо', 'Джонатан Свифт', 'Вальтер Скотт', 'Чарльз Диккенс'], 'correct_val' => 'Даниэль Дефо'],
            ['question' => 'Кто написал «Трех мушкетеров»?', 'options' => ['Александр Дюма', 'Виктор Гюго', 'Оноре де Бальзак', 'Эмиль Золя'], 'correct_val' => 'Александр Дюма'],
            ['question' => 'Автор романа «1984»?', 'options' => ['Джордж Оруэлл', 'Олдос Хаксли', 'Рэй Брэдбери', 'Курт Воннегут'], 'correct_val' => 'Джордж Оруэлл'],
            ['question' => 'Кто создал книги о Гарри Поттере?', 'options' => ['Джоан Роулинг', 'Сьюзен Коллинз', 'Урсула Ле Гуин', 'Диана Уинн Джонс'], 'correct_val' => 'Джоан Роулинг'],
            ['question' => 'Кто написал «Приключения Тома Сойера»?', 'options' => ['Марк Твен', 'Джек Лондон', 'О. Генри', 'Эдгар По'], 'correct_val' => 'Марк Твен'],

            // Кино
            ['question' => 'Кто снял фильм «Титаник»?', 'options' => ['Джеймс Кэмерон', 'Стивен Спилберг', 'Ридли Скотт', 'Питер Джексон'], 'correct_val' => 'Джеймс Кэмерон'],
            ['question' => 'Какого комика связывают с образом Бродяги?', 'options' => ['Чарли Чаплин', 'Бастер Китон', 'Луи де Фюнес', 'Роуэн Аткинсон'], 'correct_val' => 'Чарли Чаплин'],
            ['question' => 'Какая студия создала «Историю игрушек»?', 'options' => ['Pixar', 'DreamWorks', 'Ghibli', 'Aardman'], 'correct_val' => 'Pixar'],
            ['question' => 'Где происходят события «Властелина колец»?', 'options' => ['Средиземье', 'Нарния', 'Вестерос', 'Атлантида'], 'correct_val' => 'Средиземье'],
            ['question' => 'В какой школе учился Гарри Поттер?', 'options' => ['Хогвартс', 'Кэмп-Хафблад', 'Шармбатон', 'Невермор'], 'correct_val' => 'Хогвартс'],
            ['question' => 'Кто играл Терминатора в первых фильмах серии?', 'options' => ['Арнольд Шварценеггер', 'Сильвестр Сталлоне', 'Брюс Уиллис', 'Жан-Клод Ван Дамм'], 'correct_val' => 'Арнольд Шварценеггер'],
            ['question' => 'Какая машина служила машиной времени в «Назад в будущее»?', 'options' => ['DeLorean', 'Mustang', 'Mini', 'Volvo'], 'correct_val' => 'DeLorean'],
            ['question' => 'Какие животные главные в «Парке юрского периода»?', 'options' => ['Динозавры', 'Драконы', 'Акулы', 'Роботы'], 'correct_val' => 'Динозавры'],
            ['question' => 'Как зовут главного героя «Матрицы»?', 'options' => ['Нео', 'Рокки', 'Индиана', 'Рэмбо'], 'correct_val' => 'Нео'],
            ['question' => 'Кто главный злодей оригинальной трилогии «Звездных войн»?', 'options' => ['Дарт Вейдер', 'Танос', 'Саурон', 'Волан-де-Морт'], 'correct_val' => 'Дарт Вейдер'],

            // Музыка
            ['question' => 'Кто написал цикл «Времена года»?', 'options' => ['Вивальди', 'Бах', 'Шопен', 'Верди'], 'correct_val' => 'Вивальди'],
            ['question' => 'Кто написал «Лунную сонату»?', 'options' => ['Бетховен', 'Моцарт', 'Шуберт', 'Лист'], 'correct_val' => 'Бетховен'],
            ['question' => 'Кто написал оперу «Волшебная флейта»?', 'options' => ['Моцарт', 'Вагнер', 'Пуччини', 'Бизе'], 'correct_val' => 'Моцарт'],
            ['question' => 'Кто написал балет «Лебединое озеро»?', 'options' => ['Чайковский', 'Римский-Корсаков', 'Рахманинов', 'Мусоргский'], 'correct_val' => 'Чайковский'],
            ['question' => 'У какого инструмента обычно 88 клавиш?', 'options' => ['Фортепиано', 'Аккордеон', 'Орган', 'Ксилофон'], 'correct_val' => 'Фортепиано'],
            ['question' => 'Какой инструмент относится к медным духовым?', 'options' => ['Труба', 'Скрипка', 'Арфа', 'Флейта'], 'correct_val' => 'Труба'],
            ['question' => 'Какой смычковый инструмент имеет четыре струны?', 'options' => ['Скрипка', 'Флейта', 'Тромбон', 'Фагот'], 'correct_val' => 'Скрипка'],
            ['question' => 'К какой группе относятся барабаны?', 'options' => ['Ударные', 'Струнные', 'Духовые', 'Клавишные'], 'correct_val' => 'Ударные'],
            ['question' => 'Кто руководит оркестром?', 'options' => ['Дирижер', 'Редактор', 'Хореограф', 'Суфлер'], 'correct_val' => 'Дирижер'],
            ['question' => 'Что объединяет музыку и театральное действие?', 'options' => ['Опера', 'Натюрморт', 'Роман', 'Скульптура'], 'correct_val' => 'Опера'],

            // Спорт
            ['question' => 'Сколько игроков одной команды на поле в футболе?', 'options' => ['11', '9', '10', '12'], 'correct_val' => '11'],
            ['question' => 'Сколько очков дает штрафной бросок в баскетболе?', 'options' => ['1', '2', '3', '4'], 'correct_val' => '1'],
            ['question' => 'Как в теннисе называют счет ноль?', 'options' => ['Love', 'Ace', 'Set', 'Break'], 'correct_val' => 'Love'],
            ['question' => 'Как называется шах, от которого нельзя защититься?', 'options' => ['Мат', 'Фол', 'Аут', 'Офсайд'], 'correct_val' => 'Мат'],
            ['question' => 'Сколько касаний обычно есть у команды в волейболе?', 'options' => ['3', '2', '4', '5'], 'correct_val' => '3'],
            ['question' => 'Сколько колец на олимпийском символе?', 'options' => ['5', '4', '6', '7'], 'correct_val' => '5'],
            ['question' => 'Чем играют в хоккей с шайбой?', 'options' => ['Шайбой', 'Воланом', 'Мячом для регби', 'Фрисби'], 'correct_val' => 'Шайбой'],
            ['question' => 'Какова официальная длина марафона?', 'options' => ['42,195 км', '40 км', '45 км', '50 км'], 'correct_val' => '42,195 км'],
            ['question' => 'Чем играют в бадминтон?', 'options' => ['Воланом', 'Шайбой', 'Битой', 'Клюшкой'], 'correct_val' => 'Воланом'],
            ['question' => 'Как называется площадка для бокса?', 'options' => ['Ринг', 'Корт', 'Трек', 'Татами'], 'correct_val' => 'Ринг'],

            // Бытовые знания
            ['question' => 'Чем измеряют атмосферное давление?', 'options' => ['Барометром', 'Термометром', 'Весами', 'Линейкой'], 'correct_val' => 'Барометром'],
            ['question' => 'Какое направление обозначают буквой N на компасе?', 'options' => ['Север', 'Юг', 'Запад', 'Восток'], 'correct_val' => 'Север'],
            ['question' => 'Сколько дней в високосном году?', 'options' => ['366', '365', '364', '367'], 'correct_val' => '366'],
            ['question' => 'Сколько предметов в дюжине?', 'options' => ['12', '10', '20', '24'], 'correct_val' => '12'],
            ['question' => 'Сколько лет в одном веке?', 'options' => ['100', '10', '50', '1000'], 'correct_val' => '100'],
            ['question' => 'Сколько граммов в килограмме?', 'options' => ['1000', '100', '500', '10'], 'correct_val' => '1000'],
            ['question' => 'Сколько секунд в минуте?', 'options' => ['60', '100', '30', '90'], 'correct_val' => '60'],
            ['question' => 'Чему равна сумма углов треугольника?', 'options' => ['180°', '90°', '270°', '360°'], 'correct_val' => '180°'],
            ['question' => 'Какой прибор сохраняет продукты холодными?', 'options' => ['Холодильник', 'Тостер', 'Чайник', 'Пылесос'], 'correct_val' => 'Холодильник'],
            ['question' => 'Что означает красный сигнал светофора?', 'options' => ['Стой', 'Иди', 'Ускорься', 'Поверни'], 'correct_val' => 'Стой'],
        ]);
        $bk = bbPickTaskSource($type, $backups, function ($source) {
            return [
                'type' => 'ai_quiz',
                'question' => $source['question'],
                'correct_val' => $source['correct_val']
            ];
        }, $skipExternalGeneration ? $excludedSignatures : []);

        if (!$skipExternalGeneration) {
            // require_once __DIR__ . '/../lib/GigaChat.php'; // Deprecated
            require_once __DIR__ . '/../lib/AI/AIService.php';

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
    $stmt = $pdo->prepare("
        SELECT u.*
        FROM room_players rp
        JOIN users u ON rp.user_id = u.id
        WHERE rp.room_id = ?
          AND (COALESCE(rp.is_bot, 0) = 1 OR COALESCE(u.is_bot, 0) = 1)
    ");
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
