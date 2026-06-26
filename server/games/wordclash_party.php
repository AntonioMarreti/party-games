<?php
// server/games/wordclash_party.php
require_once __DIR__ . '/../lib/wordclash_dictionary.php';

$wcpWordCache = [];
$wcpTargetCache = [];

const WCP_TARGET_POLICY_ACTIVE_V1 = 'active_targets_v1';
const WCP_TARGET_WORD_ERROR = 'Это слово пока не подходит для Wordclash Party. Выбери другое слово из 5–7 букв.';

function wcpNormalizeWord($word)
{
    return mb_strtolower(trim((string) $word), 'UTF-8');
}

function wcpLoadWords($length = 5)
{
    global $wcpWordCache;
    if (isset($wcpWordCache[$length])) {
        return $wcpWordCache[$length];
    }

    $file = __DIR__ . '/../../words/russian_' . (int) $length . '.json';
    if (!file_exists($file)) {
        return [];
    }

    $words = json_decode(file_get_contents($file), true);
    $result = is_array($words) ? array_values(array_filter(array_map('wcpNormalizeWord', $words))) : [];
    $wcpWordCache[$length] = $result;
    return $result;
}

function wcpIsPartyFriendlyTarget($word) {
    // Basic structural checks to drop weird or potentially offensive target words
    $word = mb_strtolower($word);

    // 1. Obvious bad substrings that might have slipped through dictionaries
    $badSubs = ['хуй', 'хуе', 'пизд', 'ебан', 'ебли', 'бляд', 'шлюх', 'сучк', 'суча', 'педик', 'пидор', 'хер', 'говн', 'дерьм', 'залуп', 'дроч', 'минет', 'жоп'];
    foreach ($badSubs as $sub) {
        if (mb_strpos($word, $sub) !== false) return false;
    }

    // 2. Known overly obscure or scientific prefixes/suffixes
    // Sometimes weird words end with -иум, -ырь (except few common ones), -ация in short words etc.
    if (preg_match('/(фимоз|тупец|фатюй|шитик|чуви|чушп|чухан|шваль)/ui', $word)) return false;

    return true;
}

function wcpLoadTargetWords($length = 5)
{
    global $wcpTargetCache;
    if (isset($wcpTargetCache[$length])) {
        return $wcpTargetCache[$length];
    }

    if (!in_array((int) $length, [5, 6, 7], true)) {
        return [];
    }

    global $pdo;
    $result = wc_dict_active_targets($pdo instanceof PDO ? $pdo : null, (int) $length);

    $wcpTargetCache[$length] = $result;
    return $result;
}

function wcpIsActiveTargetWord($word, $length)
{
    $word = wcpNormalizeWord($word);
    $length = (int) $length;
    if (!in_array($length, [5, 6, 7], true) || mb_strlen($word, 'UTF-8') !== $length) {
        return false;
    }
    global $pdo;
    return wc_dict_is_active_target($pdo instanceof PDO ? $pdo : null, $word, $length);
}

function wcpUsesActiveTargetPolicy($state)
{
    return ($state['target_policy'] ?? '') === WCP_TARGET_POLICY_ACTIVE_V1;
}

function wcpGetPlayers($pdo, $roomId)
{
    $stmt = $pdo->prepare("SELECT user_id FROM room_players WHERE room_id = ? ORDER BY id ASC");
    $stmt->execute([$roomId]);
    return array_map('strval', $stmt->fetchAll(PDO::FETCH_COLUMN));
}

function wcpBuildCandidateWords($length, $count = 4)
{
    $words = wcpLoadTargetWords($length);
    if (empty($words)) {
        return [];
    }

    shuffle($words);
    return array_slice(array_values(array_unique($words)), 0, $count);
}

function wcpPattern($secret, $guess)
{
    $secretArr = mb_str_split($secret);
    $guessArr = mb_str_split($guess);
    $length = count($secretArr);

    $pattern = array_fill(0, $length, 0);
    $secretUsed = array_fill(0, $length, false);
    $guessUsed = array_fill(0, $length, false);

    for ($i = 0; $i < $length; $i++) {
        if (($guessArr[$i] ?? '') === ($secretArr[$i] ?? null)) {
            $pattern[$i] = 2;
            $secretUsed[$i] = true;
            $guessUsed[$i] = true;
        }
    }

    for ($i = 0; $i < $length; $i++) {
        if (!empty($guessUsed[$i])) {
            continue;
        }
        for ($j = 0; $j < $length; $j++) {
            if (empty($secretUsed[$j]) && ($guessArr[$i] ?? '') === ($secretArr[$j] ?? null)) {
                $pattern[$i] = 1;
                $secretUsed[$j] = true;
                break;
            }
        }
    }

    return $pattern;
}

function wcpStartLeaderChoice($pdo, $room, &$state, $resetScores = false)
{
    $players = wcpGetPlayers($pdo, $room['id']);
    if (count($players) < 2) {
        return ['status' => 'error', 'message' => 'Нужно минимум 2 игрока'];
    }

    $wordLength = (int) ($state['word_length'] ?? 5);
    $candidates = wcpBuildCandidateWords($wordLength, 4);
    if (empty($candidates)) {
        return ['status' => 'error', 'message' => 'Словарь недоступен'];
    }

    $round = max(1, (int) ($state['current_round'] ?? 0) + 1);
    $leaderIndex = ($round - 1) % count($players);

    $state['phase'] = 'leader_choose';
    $state['current_round'] = $round;
    $state['leader_id'] = $players[$leaderIndex];
    $state['candidate_words'] = $candidates;
    $state['target_policy'] = WCP_TARGET_POLICY_ACTIVE_V1;
    $state['secret_word'] = '';
    $state['guesses'] = [];
    $state['guessed'] = [];
    $state['round_results'] = [];
    $state['round_started_at'] = null;
    $state['players'] = $players;
    $state['game_over'] = false;
    $state['rerolls'] = 0;

    if ($resetScores || !isset($state['scores']) || !is_array($state['scores'])) {
        $state['scores'] = array_fill_keys($players, 0);
        $state['started_at'] = time();
        $state['stats_recorded'] = false;
    } else {
        foreach ($players as $playerId) {
            if (!isset($state['scores'][$playerId])) {
                $state['scores'][$playerId] = 0;
            }
        }
    }

    updateGameState($room['id'], $state);
    return ['status' => 'ok'];
}

function wcpMaybeFinishRound($pdo, $room, &$state)
{
    $leaderId = (string) ($state['leader_id'] ?? '');
    $players = array_map('strval', $state['players'] ?? wcpGetPlayers($pdo, $room['id']));
    $guessers = array_values(array_filter($players, function ($playerId) use ($leaderId) {
        return (string) $playerId !== $leaderId;
    }));

    $complete = true;
    foreach ($guessers as $playerId) {
        $attempts = $state['guesses'][$playerId] ?? [];
        if (empty($state['guessed'][$playerId]) && count($attempts) < (int) ($state['attempt_limit'] ?? 6)) {
            $complete = false;
            break;
        }
    }

    if (!$complete) {
        return;
    }

    $state['phase'] = 'intermission';
    $state['candidate_words'] = [];
    $state['round_results'] = [];
    foreach ($guessers as $playerId) {
        $attempts = $state['guesses'][$playerId] ?? [];
        $state['round_results'][] = [
            'user_id' => $playerId,
            'guessed' => !empty($state['guessed'][$playerId]),
            'attempts' => count($attempts),
            'score' => (int) ($state['scores'][$playerId] ?? 0),
        ];
    }

    $roundCount = $state['round_count'];
    if ($roundCount !== null && (int) $state['current_round'] >= (int) $roundCount) {
        $state['phase'] = 'game_over';
        $state['game_over'] = true;
    }
}

function getInitialState()
{
    return [
        'phase' => 'setup',
        'word_length' => 5,
        'round_count' => 3,
        'current_round' => 0,
        'leader_id' => null,
        'candidate_words' => [],
        'secret_word' => '',
        'guesses' => [],
        'guessed' => [],
        'round_results' => [],
        'scores' => [],
        'players' => [],
        'attempt_limit' => 6,
        'game_over' => false,
        'started_at' => null,
        'stats_recorded' => false
    ];
}

function handleGameAction($pdo, $room, $user, $postData)
{
    $state = json_decode($room['game_state'] ?? '', true);
    if (!is_array($state)) {
        $state = getInitialState();
    }

    $type = $postData['type'] ?? '';
    $userId = (string) $user['id'];

    if ($type === 'configure_game') {
        if (empty($room['is_host'])) {
            return ['status' => 'error', 'message' => 'Только хост меняет настройки'];
        }
        if (($state['phase'] ?? '') !== 'setup') {
            return ['status' => 'error', 'message' => 'Игра уже началась'];
        }

        $wordLength = isset($postData['word_length']) ? (int) $postData['word_length'] : (int) ($state['word_length'] ?? 5);
        if (!in_array($wordLength, [5, 6, 7], true)) {
            $wordLength = 5;
        }

        $roundCount = isset($postData['round_count']) ? (int) $postData['round_count'] : (int) ($state['round_count'] ?? 3);
        if (!in_array($roundCount, [1, 3, 5, 7], true)) {
            $roundCount = 3;
        }

        $state['word_length'] = $wordLength;
        $state['round_count'] = $roundCount;
        updateGameState($room['id'], $state);
        return ['status' => 'ok'];
    }

    if ($type === 'start_game' || $type === 'restart_game') {
        if (empty($room['is_host'])) {
            return ['status' => 'error', 'message' => 'Только хост начинает игру'];
        }
        if ($type === 'start_game' && ($state['phase'] ?? '') !== 'setup') {
            return ['status' => 'error', 'message' => 'Игра уже началась'];
        }
        if ($type === 'restart_game') {
            $state['current_round'] = 0;
        }
        return wcpStartLeaderChoice($pdo, $room, $state, true);
    }

    if ($type === 'reroll_candidates') {
        if (($state['phase'] ?? '') !== 'leader_choose') {
            return ['status' => 'error', 'message' => 'Сейчас нельзя обновить слова'];
        }
        if ((string) ($state['leader_id'] ?? '') !== $userId) {
            return ['status' => 'error', 'message' => 'Слова обновляет только ведущий'];
        }

        $rerolls = (int) ($state['rerolls'] ?? 0);
        $maxRerolls = 3;
        if ($rerolls >= $maxRerolls) {
            return ['status' => 'error', 'message' => 'Лимит обновлений исчерпан'];
        }

        $wordLength = (int) ($state['word_length'] ?? 5);
        $currentCandidates = $state['candidate_words'] ?? [];

        $words = wcpLoadTargetWords($wordLength);
        if (!empty($words)) {
            $filtered = array_values(array_diff($words, $currentCandidates));
            if (count($filtered) >= 4) {
                shuffle($filtered);
                $candidates = array_slice($filtered, 0, 4);
            } else {
                $candidates = wcpBuildCandidateWords($wordLength, 4);
            }
        } else {
            $candidates = wcpBuildCandidateWords($wordLength, 4);
        }

        $state['candidate_words'] = $candidates;
        $state['target_policy'] = WCP_TARGET_POLICY_ACTIVE_V1;
        $state['rerolls'] = $rerolls + 1;
        updateGameState($room['id'], $state);
        return ['status' => 'ok'];
    }

    if ($type === 'choose_word') {
        if (($state['phase'] ?? '') !== 'leader_choose') {
            return ['status' => 'error', 'message' => 'Сейчас нельзя выбрать слово'];
        }
        if ((string) ($state['leader_id'] ?? '') !== $userId) {
            return ['status' => 'error', 'message' => 'Слово выбирает ведущий'];
        }

        $word = wcpNormalizeWord($postData['word'] ?? '');
        $wordLength = (int) ($state['word_length'] ?? 5);
        if (wcpUsesActiveTargetPolicy($state) && !wcpIsActiveTargetWord($word, $wordLength)) {
            return ['status' => 'error', 'message' => WCP_TARGET_WORD_ERROR];
        }

        $candidates = array_map('wcpNormalizeWord', $state['candidate_words'] ?? []);
        if (!in_array($word, $candidates, true)) {
            return ['status' => 'error', 'message' => wcpUsesActiveTargetPolicy($state) ? WCP_TARGET_WORD_ERROR : 'Выберите слово из вариантов'];
        }

        $state['secret_word'] = $word;
        $state['candidate_words'] = [];
        $state['phase'] = 'playing';
        $state['round_started_at'] = time();
        updateGameState($room['id'], $state);
        return ['status' => 'ok'];
    }

    if ($type === 'submit_guess') {
        $guess = $postData['word'] ?? '';
        $res = wcpApplyGuess($pdo, $room, $state, $userId, $guess);
        if ($res['status'] !== 'ok') {
            return $res;
        }
        updateGameState($room['id'], $state);
        return ['status' => 'ok'];
    }

    if ($type === 'leader_react') {
        if ($userId != ($state['leader_id'] ?? '')) {
            return ['status' => 'error', 'message' => 'Вы не ведущий'];
        }

        if (($state['phase'] ?? '') !== 'playing') {
            return ['status' => 'error', 'message' => 'Не та фаза'];
        }

        $reaction = $postData['reaction'] ?? '';
        $allowed = ['🔥', '😈', '👀', 'почти', 'мимо'];

        if (!in_array($reaction, $allowed, true)) {
            return ['status' => 'error', 'message' => 'Недоступная реакция'];
        }

        $state['leader_reaction'] = [
            'text' => $reaction,
            'ts' => time()
        ];

        updateGameState($room['id'], $state);
        return ['status' => 'ok'];
    }

    if ($type === 'tick') {
        $stmt = $pdo->prepare("SELECT user_id FROM room_players WHERE room_id = ? AND is_bot = 1");
        $stmt->execute([$room['id']]);
        $bots = $stmt->fetchAll(PDO::FETCH_COLUMN);

        if (empty($bots)) {
            return ['status' => 'ok'];
        }

        $changed = false;
        $phase = $state['phase'] ?? '';

        if ($phase === 'leader_choose' && in_array((string)($state['leader_id'] ?? ''), $bots)) {
            if (!empty($state['candidate_words'][0])) {
                if (wcpUsesActiveTargetPolicy($state) && !wcpIsActiveTargetWord($state['candidate_words'][0], (int) ($state['word_length'] ?? 5))) {
                    return ['status' => 'error', 'message' => WCP_TARGET_WORD_ERROR];
                }
                $state['secret_word'] = $state['candidate_words'][0];
                $state['phase'] = 'playing';
                $state['round_start_time'] = time();
                $state['guesses'] = [];
                $state['candidate_words'] = [];
                $state['rerolls'] = 0;
                $state['bot_last_guess_at'] = [];
                $changed = true;
            }
        } elseif ($phase === 'playing') {
            foreach ($bots as $botId) {
                if ($botId == ($state['leader_id'] ?? '')) continue;
                if (!empty($state['guessed'][$botId])) continue;

                $attempts = $state['guesses'][$botId] ?? [];
                if (count($attempts) >= (int)($state['attempt_limit'] ?? 6)) continue;

                $lastGuess = $state['bot_last_guess_at'][$botId] ?? 0;
                if (time() - $lastGuess < 5) continue;

                $wordLength = (int)($state['word_length'] ?? 5);
                $words = wcpLoadTargetWords($wordLength);
                if (!empty($words)) {
                    $randomWord = $words[array_rand($words)];
                    $res = wcpApplyGuess($pdo, $room, $state, $botId, $randomWord);
                    if ($res['status'] === 'ok') {
                        $state['bot_last_guess_at'][$botId] = time();
                        $changed = true;
                        break;
                    }
                }
            }
        }

        if ($changed) {
            updateGameState($room['id'], $state);
        }
        return ['status' => 'ok'];
    }

    if ($type === 'next_round') {
        if (empty($room['is_host'])) {
            return ['status' => 'error', 'message' => 'Только хост запускает следующий раунд'];
        }
        if (($state['phase'] ?? '') !== 'intermission') {
            return ['status' => 'error', 'message' => 'Раунд ещё не завершён'];
        }
        return wcpStartLeaderChoice($pdo, $room, $state, false);
    }

    if ($type === 'back_to_lobby') {
        if (!empty($room['is_host'])) {
            $pdo->prepare("UPDATE rooms SET game_type = 'lobby', status = 'waiting', game_state = NULL WHERE id = ?")
                ->execute([$room['id']]);
        }
        return ['status' => 'ok'];
    }

    if ($type === 'report_word' || $type === 'block_word') {
        $word = $postData['word'] ?? '';
        $normalizedWord = wcpNormalizeWord($word);
        $reason = $postData['reason'] ?? 'bad_word';
        $wordLength = mb_strlen($normalizedWord, 'UTF-8');

        if (empty($normalizedWord)) {
            return ['status' => 'error', 'message' => 'Пустое слово'];
        }

        // Validate that the word belongs to the current state
        $isValidWord = false;
        if ($normalizedWord === wcpNormalizeWord((string)($state['secret_word'] ?? ''))) {
            $isValidWord = true;
        } else {
            $candidates = array_map('wcpNormalizeWord', $state['candidate_words'] ?? []);
            if (in_array($normalizedWord, $candidates, true)) {
                $isValidWord = true;
            }
        }

        if (!$isValidWord) {
            return ['status' => 'error', 'message' => 'Некорректное слово'];
        }

        if ($type === 'report_word') {
            try {
                $stmt = $pdo->prepare("
                    INSERT INTO wcp_word_reports (word, normalized_word, game_type, word_length, reporter_user_id, room_id, reason, status)
                    VALUES (?, ?, 'wordclash_party', ?, ?, ?, ?, 'pending')
                    ON DUPLICATE KEY UPDATE reason = VALUES(reason)
                ");
                $stmt->execute([$word, $normalizedWord, $wordLength, $userId, $room['id'], mb_substr($reason, 0, 255)]);
                return ['status' => 'ok', 'reported' => true];
            } catch (Throwable $e) {
                return ['status' => 'error', 'message' => 'Ошибка сохранения'];
            }
        }

        if ($type === 'block_word') {
            if (empty($user['is_admin'])) {
                return ['status' => 'error', 'message' => 'Нет прав'];
            }
            try {
                wc_dict_ban_word($pdo, $normalizedWord, (int) $userId);
                global $wcpTargetCache;
                unset($wcpTargetCache[$wordLength]);

                // Optionally auto-approve reports for this word
                try {
                    $pdo->prepare("UPDATE wcp_word_reports SET status = 'approved' WHERE normalized_word = ? AND game_type = 'wordclash_party'")
                        ->execute([$normalizedWord]);
                } catch (Throwable $e) {}

                // Remove from current candidates if present
                if (!empty($state['candidate_words'])) {
                    $candidatesNorm = array_map('wcpNormalizeWord', $state['candidate_words']);
                    $index = array_search($normalizedWord, $candidatesNorm, true);
                    if ($index !== false) {
                        array_splice($state['candidate_words'], $index, 1);

                        $pool = wcpLoadTargetWords($wordLength);
                        $filtered = [];
                        $existingNorm = array_map('wcpNormalizeWord', $state['candidate_words']);
                        $existingNorm[] = $normalizedWord;
                        foreach ($pool as $w) {
                            if (!in_array(wcpNormalizeWord($w), $existingNorm, true)) {
                                $filtered[] = $w;
                            }
                        }
                        if (!empty($filtered)) {
                            shuffle($filtered);
                            $state['candidate_words'][] = $filtered[0];
                        }
                        updateGameState($room['id'], $state);
                    }
                }

                return ['status' => 'ok', 'blocked' => true];
            } catch (Throwable $e) {
                return ['status' => 'error', 'message' => 'Ошибка блокировки'];
            }
        }
    }

    return ['status' => 'error', 'message' => 'Неизвестное действие'];
}

if (!function_exists('mb_str_split')) {
    function mb_str_split($string)
    {
        return preg_split('/(?<!^)(?!$)/u', $string);
    }
}

function wcpApplyGuess($pdo, $room, &$state, $userId, $guess) {
    if (($state['phase'] ?? '') !== 'playing') {
        return ['status' => 'error', 'message' => 'Раунд ещё не идёт'];
    }
    if ((string) ($state['leader_id'] ?? '') === $userId) {
        return ['status' => 'error', 'message' => 'Ведущий не отгадывает'];
    }
    if (!empty($state['guessed'][$userId])) {
        return ['status' => 'error', 'message' => 'Вы уже угадали слово'];
    }

    $attempts = $state['guesses'][$userId] ?? [];
    if (count($attempts) >= (int) ($state['attempt_limit'] ?? 6)) {
        return ['status' => 'error', 'message' => 'Попытки закончились'];
    }

    $guess = wcpNormalizeWord($guess);
    $wordLength = (int) ($state['word_length'] ?? 5);
    if (mb_strlen($guess, 'UTF-8') !== $wordLength) {
        return ['status' => 'error', 'message' => "Нужно слово из {$wordLength} букв"];
    }
    if (!in_array($guess, wcpLoadWords($wordLength), true)) {
        return ['status' => 'error', 'message' => 'Такого слова нет в словаре'];
    }

    foreach ($attempts as $entry) {
        if (($entry['word'] ?? '') === $guess) {
            return ['status' => 'error', 'message' => 'Это слово уже было'];
        }
    }

    $secret = (string) ($state['secret_word'] ?? '');
    if ($secret === '') {
        return ['status' => 'error', 'message' => 'Слово ещё не выбрано'];
    }

    $pattern = wcpPattern($secret, $guess);
    $attemptNumber = count($attempts) + 1;
    $isCorrect = $guess === $secret;
    $scoreDelta = $isCorrect ? max(1, 7 - $attemptNumber) * 10 : 0;

    $state['guesses'][$userId][] = [
        'word' => $guess,
        'pattern' => $pattern,
        'attempt' => $attemptNumber,
        'score_delta' => $scoreDelta,
        'timestamp' => time()
    ];

    if (!isset($state['scores'][$userId])) {
        $state['scores'][$userId] = 0;
    }
    if ($isCorrect) {
        $state['scores'][$userId] += $scoreDelta;
        $state['guessed'][$userId] = true;
    }

    wcpMaybeFinishRound($pdo, $room, $state);
    return ['status' => 'ok'];
}
