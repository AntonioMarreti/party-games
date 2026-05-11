<?php
// server/games/partybattle.php

function getInitialState()
{
    return [
        'phase' => 'lobby',
        'mode' => 'meme',
        'current_round' => 0,
        'total_rounds' => 5,
        'selected_modes' => pb_getDefaultModes(),
        'theme' => 'base',
        'ai_mode' => false,
        'situations_deck' => [],
        'current_situation' => null,
        'scores' => [],
        'history' => [],
        'recent_cards' => [],
        'hands' => [],
        'gif_search_cache' => [],
        'submissions' => [],
        'votes' => [],
        'last_round_data' => null,
        'round' => null,
    ];
}

function pb_extractPersistedRecentCards($rawState)
{
    if (is_string($rawState)) {
        $decoded = json_decode($rawState, true);
        $rawState = is_array($decoded) ? $decoded : [];
    }

    if (!is_array($rawState)) {
        return [];
    }

    $meta = $rawState['partybattle_meta'] ?? null;
    if (is_array($meta) && isset($meta['recent_cards'])) {
        return pb_normalizeRecentCards($meta['recent_cards']);
    }

    if (isset($rawState['recent_cards'])) {
        return pb_normalizeRecentCards($rawState['recent_cards']);
    }

    return [];
}

function pb_buildPersistentLobbyState($state)
{
    return [
        'partybattle_meta' => [
            'recent_cards' => pb_normalizeRecentCards($state['recent_cards'] ?? []),
            'saved_at' => time(),
        ],
    ];
}

function pb_logDebug($tag, $payload = [])
{
    if (!class_exists('TelegramLogger')) {
        return;
    }

    if (!is_array($payload)) {
        $payload = ['value' => $payload];
    }

    array_walk_recursive($payload, function (&$value) {
        if (is_string($value) && mb_strlen($value) > 280) {
            $value = mb_substr($value, 0, 280) . '...';
        }
    });

    TelegramLogger::info($tag, $payload);
}

function handleGameAction($pdo, $room, $user, $postData)
{
    $state = json_decode($room['game_state'], true);
    if (!is_array($state)) {
        $state = getInitialState();
    }
    $type = $postData['type'] ?? '';
    $userId = (string) $user['id'];

    if ($type === 'start_game') {
        if (!$room['is_host']) {
            return ['status' => 'error', 'message' => 'Only host'];
        }

        $rounds = max(1, min(20, (int) ($postData['rounds'] ?? 5)));
        $modes = pb_normalizeModes($postData['mode'] ?? ['meme']);
        $theme = $postData['theme'] ?? 'base';
        $aiMode = !empty($postData['ai_mode']);
        $customTopic = $postData['custom_topic'] ?? '';
        $recentCards = pb_normalizeRecentCards($state['recent_cards'] ?? []);

        $state = getInitialState();
        $state['total_rounds'] = $rounds;
        $state['selected_modes'] = $modes;
        $state['theme'] = $theme;
        $state['ai_mode'] = $aiMode;
        $state['scores'] = [];
        $state['recent_cards'] = $recentCards;

        $allIds = pb_getRoomPlayerIds($pdo, $room['id']);
        foreach ($allIds as $id) {
            $state['scores'][(string) $id] = 0;
        }

        $mixedDeck = [];
        foreach ($modes as $mode) {
            $deck = pb_generateDeck(
                $pdo,
                $mode,
                $theme,
                $aiMode,
                $customTopic,
                $rounds,
                $state['recent_cards'][$mode] ?? []
            );
            if (empty($deck)) {
                error_log("PartyBattle: WARNING: Deck for mode $mode is empty");
                continue;
            }

            shuffle($deck);
            $limit = max(3, $rounds);
            foreach (array_slice($deck, 0, $limit) as $card) {
                $mixedDeck[] = pb_buildDeckCard($mode, $card);
            }
        }
        $mixedDeck = pb_dedupeDeckCards($mixedDeck);
        shuffle($mixedDeck);
        $state['situations_deck'] = array_slice($mixedDeck, 0, $rounds);

        $availableRounds = count($state['situations_deck']);
        if ($availableRounds > 0 && $availableRounds < $rounds) {
            $state['total_rounds'] = $availableRounds;
            pb_logDebug('partybattle_rounds_truncated', [
                'requested_rounds' => $rounds,
                'available_rounds' => $availableRounds,
                'modes' => $modes,
                'theme' => $theme,
            ]);
        }

        if (empty($state['situations_deck'])) {
            return ['status' => 'error', 'message' => 'Не удалось сгенерировать колоду. Попробуйте другой набор или отключите AI.'];
        }

        pb_startNextRound($pdo, $room, $state);
        updateGameState($room['id'], $state);
        return ['status' => 'ok'];
    }

    if ($type === 'refresh_hand') {
        if (($state['round']['mode'] ?? null) !== 'meme') {
            return ['status' => 'error'];
        }
        if (($state['round']['step'] ?? null) !== 'submit') {
            return ['status' => 'error'];
        }

        pb_generatePlayerHand($state, $userId);
        updateGameState($room['id'], $state);
        return ['status' => 'ok', 'hand' => $state['hands'][$userId] ?? []];
    }

    if ($type === 'search_gifs') {
        if (($state['round']['mode'] ?? null) !== 'meme') {
            return ['status' => 'error', 'message' => 'Not in meme mode'];
        }

        $query = trim((string) ($postData['query'] ?? ''));
        if ($query === '') {
            $query = pb_getPromptDisplayText($state['round']['prompt'] ?? []);
        }

        $cacheKey = pb_normalizeGifCacheKey($query);
        if (!empty($state['gif_search_cache'][$cacheKey])) {
            pb_logDebug('partybattle_gif_search_cache', [
                'room_id' => $room['id'] ?? null,
                'user_id' => $userId,
                'query' => $query,
                'cache_key' => $cacheKey,
                'results' => count($state['gif_search_cache'][$cacheKey] ?? []),
            ]);
            return ['status' => 'ok', 'results' => $state['gif_search_cache'][$cacheKey]];
        }

        try {
            $results = pb_searchGifResults($query, 12);
            $state['gif_search_cache'][$cacheKey] = $results;
            updateGameState($room['id'], $state);
            pb_logDebug('partybattle_gif_search_success', [
                'room_id' => $room['id'] ?? null,
                'user_id' => $userId,
                'query' => $query,
                'cache_key' => $cacheKey,
                'results' => count($results),
            ]);
            return ['status' => 'ok', 'results' => $results];
        } catch (Exception $e) {
            pb_logDebug('partybattle_gif_search_fail', [
                'room_id' => $room['id'] ?? null,
                'user_id' => $userId,
                'query' => $query,
                'message' => $e->getMessage(),
            ]);
            return ['status' => 'error', 'message' => $e->getMessage()];
        }
    }

    if ($type === 'submit_answer') {
        $round = $state['round'] ?? null;
        if (!is_array($round) || ($round['step'] ?? null) !== 'submit') {
            return ['status' => 'error', 'message' => 'Wrong phase'];
        }

        $config = pb_getModeConfig($round['mode']);
        if (empty($config['has_submission'])) {
            return ['status' => 'error', 'message' => 'This mode does not accept submissions'];
        }
        if (isset($round['submissions']['entries'][$userId])) {
            return ['status' => 'error', 'message' => 'Already submitted'];
        }

        $answer = trim((string) ($postData['answer'] ?? ''));
        if ($answer === '') {
            return ['status' => 'error', 'message' => 'Empty answer'];
        }

        $round['submissions']['entries'][$userId] = [
            'id' => $userId,
            'author_id' => $userId,
            'kind' => $config['submission_kind'],
            'value' => $answer,
        ];
        $state['round'] = $round;

        $allIds = pb_getRoomPlayerIds($pdo, $room['id']);
        if (count(pb_getHumanSubmissionEntries($round)) >= count($allIds)) {
            pb_closeSubmissionStep($state);
        } else {
            pb_syncLegacyState($state);
        }

        updateGameState($room['id'], $state);
        return ['status' => 'ok'];
    }

    if ($type === 'vote') {
        $round = $state['round'] ?? null;
        if (!is_array($round) || ($round['step'] ?? null) !== 'vote') {
            return ['status' => 'error', 'message' => 'Wrong phase'];
        }
        if (isset($round['voting']['votes'][$userId])) {
            return ['status' => 'error', 'message' => 'Already voted'];
        }

        $targetId = (string) ($postData['target_id'] ?? '');
        if ($targetId === '') {
            return ['status' => 'error', 'message' => 'Missing target'];
        }

        $config = pb_getModeConfig($round['mode']);
        if (empty($round['voting']['options'][$targetId])) {
            return ['status' => 'error', 'message' => 'Invalid target'];
        }
        if (empty($config['allow_self_vote']) && $targetId === $userId) {
            return ['status' => 'error', 'message' => 'Cannot vote for self'];
        }

        $round['voting']['votes'][$userId] = $targetId;
        $state['round'] = $round;

        $playerCount = count(pb_getRoomPlayerIds($pdo, $room['id']));
        if (count($round['voting']['votes']) >= $playerCount) {
            pb_closeVotingStep($state);
        } else {
            pb_syncLegacyState($state);
        }

        updateGameState($room['id'], $state);
        return ['status' => 'ok'];
    }

    if ($type === 'next_round') {
        if (!$room['is_host']) {
            return ['status' => 'error'];
        }

        $round = $state['round'] ?? null;
        if (is_array($round) && ($round['step'] ?? null) === 'intro') {
            pb_advanceRoundFromIntro($pdo, $room, $state);
        } elseif (($state['phase'] ?? null) === 'round_results') {
            pb_startNextRound($pdo, $room, $state);
        }

        updateGameState($room['id'], $state);
        return ['status' => 'ok'];
    }

    if ($type === 'back_to_lobby') {
        if ($room['is_host']) {
            $persistedState = pb_buildPersistentLobbyState($state);
            $pdo->prepare("UPDATE rooms SET game_type = 'lobby', status = 'waiting', game_state = ? WHERE id = ?")
                ->execute([json_encode($persistedState), $room['id']]);
        }
        return ['status' => 'ok', 'redirect' => 'lobby'];
    }

    return ['status' => 'ok'];
}

function processGameBots($pdo, $room, &$state)
{
    $players = pb_getRoomPlayers($pdo, $room['id']);
    $bots = array_filter($players, function ($player) {
        return !empty($player['is_bot']);
    });

    if (empty($bots)) {
        return false;
    }

    $round = $state['round'] ?? null;
    if (!is_array($round)) {
        return false;
    }

    $changed = false;
    $config = pb_getModeConfig($round['mode']);

    if (($round['step'] ?? null) === 'submit' && !empty($config['has_submission'])) {
        $missingBotIds = [];
        foreach ($bots as $bot) {
            $botId = (string) $bot['user_id'];
            if (!isset($round['submissions']['entries'][$botId])) {
                $missingBotIds[] = $botId;
            }
        }

        $batchAnswers = pb_generateBotSubmissionBatch($state, $missingBotIds);
        foreach ($bots as $bot) {
            $botId = (string) $bot['user_id'];
            if (isset($round['submissions']['entries'][$botId])) {
                continue;
            }

            $answer = pb_resolveBotSubmissionCandidate($state, $round, $botId, $batchAnswers[$botId] ?? null);
            if ($answer === null) {
                continue;
            }

            $round['submissions']['entries'][$botId] = [
                'id' => $botId,
                'author_id' => $botId,
                'kind' => $config['submission_kind'],
                'value' => $answer,
            ];
            $changed = true;
        }

        $state['round'] = $round;
        if (count(pb_getHumanSubmissionEntries($round)) >= count($players)) {
            pb_closeSubmissionStep($state);
        } else {
            pb_syncLegacyState($state);
        }
    }

    $round = $state['round'] ?? null;
    if (is_array($round) && ($round['step'] ?? null) === 'vote') {
        foreach ($bots as $bot) {
            $botId = (string) $bot['user_id'];
            if (isset($round['voting']['votes'][$botId])) {
                continue;
            }

            $candidateIds = array_keys($round['voting']['options'] ?? []);
            if (empty($config['allow_self_vote'])) {
                $candidateIds = array_values(array_filter($candidateIds, function ($candidateId) use ($botId) {
                    return $candidateId !== $botId;
                }));
            }
            if (empty($candidateIds)) {
                continue;
            }

            $round['voting']['votes'][$botId] = $candidateIds[array_rand($candidateIds)];
            $changed = true;
        }

        $state['round'] = $round;
        if (count($round['voting']['votes']) >= count($players)) {
            pb_closeVotingStep($state);
        } else {
            pb_syncLegacyState($state);
        }
    }

    return $changed;
}

function pb_normalizeModes($modes)
{
    if (!is_array($modes)) {
        $modes = [$modes];
    }

    $normalized = [];
    foreach ($modes as $mode) {
        $mode = (string) $mode;
        if (pb_getModeConfig($mode) !== null) {
            $normalized[] = $mode;
        }
    }

    return empty($normalized) ? pb_getDefaultModes() : array_values(array_unique($normalized));
}

function pb_getDefaultModes()
{
    return ['meme', 'joke', 'advice', 'acronym', 'caption', 'bluff'];
}

function pb_getModeConfig($mode)
{
    static $configs = [
        'meme' => [
            'family' => 'creative_vote',
            'prompt_kind' => 'text',
            'submission_kind' => 'gif',
            'ballot_kind' => 'submission',
            'scoring_strategy' => 'popular_vote',
            'has_intro' => true,
            'has_submission' => true,
            'allow_self_vote' => false,
        ],
        'joke' => [
            'family' => 'creative_vote',
            'prompt_kind' => 'text',
            'submission_kind' => 'text',
            'ballot_kind' => 'submission',
            'scoring_strategy' => 'popular_vote',
            'has_intro' => false,
            'has_submission' => true,
            'allow_self_vote' => false,
        ],
        'advice' => [
            'family' => 'creative_vote',
            'prompt_kind' => 'text',
            'submission_kind' => 'text',
            'ballot_kind' => 'submission',
            'scoring_strategy' => 'popular_vote',
            'has_intro' => false,
            'has_submission' => true,
            'allow_self_vote' => false,
        ],
        'acronym' => [
            'family' => 'creative_vote',
            'prompt_kind' => 'text',
            'submission_kind' => 'text',
            'ballot_kind' => 'submission',
            'scoring_strategy' => 'popular_vote',
            'has_intro' => false,
            'has_submission' => true,
            'allow_self_vote' => false,
        ],
        'caption' => [
            'family' => 'creative_vote',
            'prompt_kind' => 'image',
            'submission_kind' => 'text',
            'ballot_kind' => 'submission',
            'scoring_strategy' => 'popular_vote',
            'has_intro' => false,
            'has_submission' => true,
            'allow_self_vote' => false,
        ],
        'whoami' => [
            'family' => 'direct_vote',
            'prompt_kind' => 'player_question',
            'submission_kind' => null,
            'ballot_kind' => 'player',
            'scoring_strategy' => 'popular_vote',
            'has_intro' => true,
            'has_submission' => false,
            'allow_self_vote' => true,
        ],
        'bluff' => [
            'family' => 'bluff',
            'prompt_kind' => 'fact',
            'submission_kind' => 'text',
            'ballot_kind' => 'truth_guess',
            'scoring_strategy' => 'truth_guess',
            'has_intro' => false,
            'has_submission' => true,
            'allow_self_vote' => false,
        ],
    ];

    return $configs[$mode] ?? null;
}

function pb_buildDeckCard($mode, $rawCard)
{
    $config = pb_getModeConfig($mode);
    $prompt = [
        'kind' => $config['prompt_kind'],
        'title' => null,
        'body' => null,
        'media_url' => null,
        'truth' => null,
    ];

    if ($mode === 'caption') {
        $prompt['media_url'] = is_array($rawCard)
            ? (string) ($rawCard['media_url'] ?? '')
            : (string) $rawCard;
    } elseif ($mode === 'bluff' && is_array($rawCard)) {
        $prompt['body'] = $rawCard['text'] ?? '';
        $prompt['truth'] = $rawCard['truth'] ?? null;
    } else {
        $prompt['body'] = is_array($rawCard)
            ? ($rawCard['text'] ?? $rawCard['question'] ?? json_encode($rawCard))
            : (string) $rawCard;
    }

    return [
        'mode' => $mode,
        'card_id' => pb_getRawCardId($mode, $rawCard),
        'family' => $config['family'],
        'prompt' => $prompt,
        'raw' => $rawCard,
    ];
}

function pb_startNextRound($pdo, $room, &$state)
{
    if (empty($state['situations_deck'])) {
        $state['round'] = null;
        $state['phase'] = 'results';
        $state['current_situation'] = null;
        $state['submissions'] = [];
        $state['votes'] = [];
        return;
    }

    $state['current_round'] = (int) ($state['current_round'] ?? 0) + 1;
    $card = pb_popNextUnusedDeckCard($state);
    if ($card === null) {
        $state['current_round'] = max(0, (int) $state['current_round'] - 1);
        $state['round'] = null;
        $state['phase'] = 'results';
        $state['current_situation'] = null;
        $state['submissions'] = [];
        $state['votes'] = [];
        return;
    }
    $config = pb_getModeConfig($card['mode']);
    $step = !empty($config['has_intro']) ? 'intro' : (!empty($config['has_submission']) ? 'submit' : 'vote');

    $state['round'] = [
        'id' => 'pb-round-' . $state['current_round'] . '-' . substr(sha1(uniqid('', true)), 0, 8),
        'number' => $state['current_round'],
        'mode' => $card['mode'],
        'card_id' => $card['card_id'] ?? null,
        'family' => $card['family'],
        'step' => $step,
        'prompt' => $card['prompt'],
        'submissions' => [
            'status' => !empty($config['has_submission']) ? 'open' : 'skipped',
            'entries' => [],
        ],
        'voting' => [
            'status' => $step === 'vote' ? 'open' : ($config['ballot_kind'] === 'player' ? 'pending' : 'closed'),
            'ballot_kind' => $config['ballot_kind'],
            'options' => [],
            'votes' => [],
        ],
        'scoring' => [
            'strategy' => $config['scoring_strategy'],
            'awards' => [],
        ],
        'result' => null,
        'started_at' => time(),
    ];

    pb_markRecentCardUsed($state, $card['mode'], $card['card_id'] ?? null);

    $state['hands'] = [];
    $state['last_round_data'] = null;

    if ($step === 'submit' && $card['mode'] === 'meme') {
        pb_generateHands($pdo, $room, $state);
    } elseif ($step === 'vote') {
        pb_prepareVotingOptions($pdo, $room, $state);
    }

    pb_syncLegacyState($state);
}

function pb_advanceRoundFromIntro($pdo, $room, &$state)
{
    $round = $state['round'] ?? null;
    if (!is_array($round) || ($round['step'] ?? null) !== 'intro') {
        return;
    }

    $config = pb_getModeConfig($round['mode']);
    if (!empty($config['has_submission'])) {
        $round['step'] = 'submit';
        $round['submissions']['status'] = 'open';
        $round['voting']['status'] = 'closed';
        $round['voting']['votes'] = [];
        $state['round'] = $round;

        if ($round['mode'] === 'meme') {
            pb_generateHands($pdo, $room, $state);
        }
    } else {
        $round['step'] = 'vote';
        $round['submissions']['status'] = 'skipped';
        $state['round'] = $round;
        pb_prepareVotingOptions($pdo, $room, $state);
    }

    pb_syncLegacyState($state);
}

function pb_prepareVotingOptions($pdo, $room, &$state)
{
    $round = $state['round'] ?? null;
    if (!is_array($round)) {
        return;
    }

    $options = [];
    if (($round['family'] ?? null) === 'direct_vote') {
        foreach (pb_getRoomPlayerIds($pdo, $room['id']) as $playerId) {
            $options[(string) $playerId] = [
                'id' => (string) $playerId,
                'type' => 'player',
                'author_id' => (string) $playerId,
                'value' => (string) $playerId,
            ];
        }
    } else {
        foreach ($round['submissions']['entries'] ?? [] as $entryId => $entry) {
            $options[(string) $entryId] = [
                'id' => (string) $entryId,
                'type' => $entry['kind'] ?? 'submission',
                'author_id' => $entry['author_id'] ?? null,
                'value' => $entry['value'] ?? null,
            ];
        }
    }

    $round['step'] = 'vote';
    $round['voting']['status'] = 'open';
    $round['voting']['options'] = $options;
    $round['voting']['votes'] = [];
    $state['round'] = $round;
}

function pb_closeSubmissionStep(&$state)
{
    $round = $state['round'] ?? null;
    if (!is_array($round)) {
        return;
    }

    $config = pb_getModeConfig($round['mode']);
    if (($round['mode'] ?? null) === 'bluff' && !isset($round['submissions']['entries']['truth'])) {
        $round['submissions']['entries']['truth'] = [
            'id' => 'truth',
            'author_id' => null,
            'kind' => 'truth',
            'value' => $round['prompt']['truth'] ?? 'Верный ответ недоступен',
        ];
    }

    $round['submissions']['status'] = 'closed';
    $round['voting']['status'] = 'pending';
    $round['voting']['votes'] = [];
    $state['round'] = $round;

    if (($config['family'] ?? null) === 'direct_vote') {
        pb_syncLegacyState($state);
        return;
    }

    $options = [];
    foreach ($round['submissions']['entries'] as $entryId => $entry) {
        $options[(string) $entryId] = [
            'id' => (string) $entryId,
            'type' => $entry['kind'] ?? 'submission',
            'author_id' => $entry['author_id'] ?? null,
            'value' => $entry['value'] ?? null,
        ];
    }

    $round['step'] = 'vote';
    $round['voting']['status'] = 'open';
    $round['voting']['options'] = $options;
    $round['voting']['votes'] = [];
    $state['round'] = $round;
    pb_syncLegacyState($state);
}

function pb_closeVotingStep(&$state)
{
    $round = $state['round'] ?? null;
    if (!is_array($round)) {
        return;
    }

    $strategy = $round['scoring']['strategy'] ?? 'popular_vote';
    $voteCounts = [];
    $roundScores = [];
    $awards = [];

    foreach ($round['voting']['votes'] ?? [] as $voterId => $targetId) {
        $voteCounts[$targetId] = ($voteCounts[$targetId] ?? 0) + 1;

        if ($strategy === 'truth_guess') {
            if ($targetId === 'truth') {
                $state['scores'][$voterId] = ($state['scores'][$voterId] ?? 0) + 100;
                $roundScores[$voterId] = ($roundScores[$voterId] ?? 0) + 1;
                $awards[] = [
                    'player_id' => $voterId,
                    'points' => 100,
                    'reason' => 'guessed_truth',
                    'source_vote' => $voterId,
                ];
            } else {
                $state['scores'][$targetId] = ($state['scores'][$targetId] ?? 0) + 100;
                $roundScores[$targetId] = ($roundScores[$targetId] ?? 0) + 1;
                $awards[] = [
                    'player_id' => $targetId,
                    'points' => 100,
                    'reason' => 'fooled_player',
                    'source_vote' => $voterId,
                ];
            }
        } else {
            $state['scores'][$targetId] = ($state['scores'][$targetId] ?? 0) + 100;
            $roundScores[$targetId] = ($roundScores[$targetId] ?? 0) + 1;
            $awards[] = [
                'player_id' => $targetId,
                'points' => 100,
                'reason' => 'received_vote',
                'source_vote' => $voterId,
            ];
        }
    }

    $winnerId = null;
    $winnerVotes = 0;
    if (!empty($voteCounts)) {
        arsort($voteCounts);
        $winnerId = (string) array_key_first($voteCounts);
        $winnerVotes = (int) reset($voteCounts);
    }

    $winnerPlayerId = $winnerId === 'truth' ? null : $winnerId;
    $winnerContent = null;
    if ($winnerId !== null) {
        if (($round['family'] ?? null) === 'direct_vote') {
            $winnerContent = $winnerId;
        } else {
            $winnerContent = $round['submissions']['entries'][$winnerId]['value'] ?? null;
        }
    }

    $round['step'] = 'results';
    $round['voting']['status'] = 'closed';
    $round['scoring']['awards'] = $awards;
    $round['result'] = [
        'vote_counts' => $voteCounts,
        'round_scores' => $roundScores,
        'winner_id' => $winnerId,
        'winner_player_id' => $winnerPlayerId,
        'winner_content' => $winnerContent,
        'winner_votes' => $winnerVotes,
        'winner_type' => $winnerId === 'truth' ? 'truth' : (($round['family'] ?? null) === 'direct_vote' ? 'player' : 'submission'),
    ];

    $state['round'] = $round;
    $state['phase'] = 'round_results';
    $state['last_round_data'] = [
        'votes' => $round['voting']['votes'],
        'scores' => $roundScores,
        'vote_counts' => $voteCounts,
        'winner_id' => $winnerId,
        'winner_player_id' => $winnerPlayerId,
        'winner_content' => $winnerContent,
        'winner_votes' => $winnerVotes,
        'winner_type' => $round['result']['winner_type'],
        'awards' => $awards,
    ];
    $state['history'][] = [
        'round_id' => $round['id'],
        'number' => $round['number'],
        'mode' => $round['mode'],
        'card_id' => $round['card_id'] ?? null,
        'family' => $round['family'],
        'result' => $round['result'],
    ];

    pb_syncLegacyState($state);
}

function pb_syncLegacyState(&$state)
{
    $round = $state['round'] ?? null;
    if (!is_array($round)) {
        return;
    }

    $state['mode'] = $round['mode'];
    $state['current_round'] = $round['number'];
    $state['current_situation'] = pb_legacySituationFromPrompt($round['mode'], $round['prompt']);

    $step = $round['step'] ?? 'intro';
    if ($step === 'intro') {
        $state['phase'] = 'round_situation';
    } elseif ($step === 'submit') {
        $state['phase'] = 'round_submission';
    } elseif ($step === 'vote') {
        $state['phase'] = 'round_voting';
    } elseif ($step === 'results') {
        $state['phase'] = 'round_results';
    }

    $legacySubmissions = [];
    foreach ($round['submissions']['entries'] ?? [] as $entryId => $entry) {
        if ($entryId === 'truth') {
            $legacySubmissions['truth'] = $entry['value'] ?? '';
        } elseif (isset($entry['author_id'])) {
            $legacySubmissions[(string) $entry['author_id']] = $entry['value'] ?? '';
        }
    }

    $state['submissions'] = !empty($legacySubmissions)
        ? $legacySubmissions
        : (($round['family'] ?? null) === 'direct_vote' ? (object) [] : []);
    $state['votes'] = $round['voting']['votes'] ?? [];
}

function pb_legacySituationFromPrompt($mode, $prompt)
{
    $kind = $prompt['kind'] ?? 'text';
    if ($kind === 'image') {
        return (string) ($prompt['media_url'] ?? '');
    }
    if ($mode === 'bluff') {
        return [
            'text' => $prompt['body'] ?? '',
            'truth' => $prompt['truth'] ?? null,
        ];
    }
    return (string) ($prompt['body'] ?? '');
}

function pb_getRoomPlayers($pdo, $roomId)
{
    $stmt = $pdo->prepare("SELECT user_id, is_bot FROM room_players WHERE room_id = ?");
    $stmt->execute([$roomId]);
    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}

function pb_getRoomPlayerIds($pdo, $roomId)
{
    $players = pb_getRoomPlayers($pdo, $roomId);
    return array_map(function ($player) {
        return (string) $player['user_id'];
    }, $players);
}

function pb_getHumanSubmissionEntries($round)
{
    $entries = [];
    foreach ($round['submissions']['entries'] ?? [] as $entryId => $entry) {
        if ($entryId === 'truth') {
            continue;
        }
        $entries[$entryId] = $entry;
    }
    return $entries;
}

function pb_generateBotSubmission($state, $botId)
{
    $mode = $state['round']['mode'] ?? null;
    if ($mode === 'meme') {
        $hand = $state['hands'][$botId] ?? [];
        if (empty($hand)) {
            return null;
        }
        $card = $hand[array_rand($hand)];
        return $card['media_formats']['tinygif']['url'] ?? $card['media_formats']['gif']['url'] ?? $card['url'] ?? null;
    }

    $fallbacks = pb_getBotFallbackLibrary($mode);
    return $fallbacks[array_rand($fallbacks)];
}

function pb_resolveBotSubmissionCandidate($state, $round, $botId, $candidate = null)
{
    $mode = $round['mode'] ?? null;
    if (!$mode) {
        return null;
    }

    if ($mode === 'meme') {
        return pb_generateBotSubmission($state, $botId);
    }

    $prompt = $round['prompt'] ?? [];
    $existingLookup = [];
    foreach (($round['submissions']['entries'] ?? []) as $entry) {
        $value = trim((string) ($entry['value'] ?? ''));
        if ($value !== '') {
            $existingLookup[mb_strtolower($value)] = true;
        }
    }

    $tryAnswer = function ($value) use ($mode, $prompt, $existingLookup) {
        $sanitized = pb_sanitizeBotAnswer($value, $mode, $prompt);
        if ($sanitized === null) {
            return null;
        }

        return isset($existingLookup[mb_strtolower($sanitized)]) ? null : $sanitized;
    };

    $resolved = $tryAnswer($candidate);
    if ($resolved !== null) {
        return $resolved;
    }

    $fallbacks = pb_getBotFallbackLibrary($mode);
    shuffle($fallbacks);
    foreach ($fallbacks as $fallback) {
        $resolved = $tryAnswer($fallback);
        if ($resolved !== null) {
            return $resolved;
        }
    }

    return $tryAnswer(pb_generateBotSubmission($state, $botId));
}

function pb_generateBotSubmissionBatch($state, $botIds)
{
    $botIds = array_values(array_filter(array_map('strval', $botIds)));
    if (empty($botIds)) {
        return [];
    }

    $mode = $state['round']['mode'] ?? null;
    if ($mode === 'meme' || $mode === 'whoami' || !$mode) {
        return [];
    }

    $prompt = $state['round']['prompt'] ?? [];
    $question = trim((string) ($prompt['body'] ?? ''));
    if ($question === '') {
        return [];
    }

    $task = pb_getBotAnswerTask($mode, $prompt);
    $count = count($botIds);
    $truthLine = '';
    if ($mode === 'bluff' && !empty($prompt['truth'])) {
        $truthLine = "Настоящий ответ: " . $prompt['truth'] . "\n";
    }

    $system = "Ты генерируешь короткие ответы ботов для party-game. Верни только JSON без Markdown.";
    $userPrompt = "Нужно {$count} разных ответов на русском языке для режима {$mode}.\n"
        . "Задача: {$task}\n"
        . "Ситуация: {$question}\n"
        . $truthLine
        . "Правила: каждый ответ 2-10 слов, без повторов, без пояснений, без нумерации, без кавычек вокруг всего массива.\n"
        . "Формат строго: {\"answers\":[\"...\",\"...\"]}";

    try {
        require_once __DIR__ . '/../lib/AI/AIService.php';
        $response = AIService::getProvider('text')->text([
            ['role' => 'system', 'content' => $system],
            ['role' => 'user', 'content' => $userPrompt],
        ], ['temperature' => 0.9]);

        $content = trim((string) ($response['content'] ?? ''));
        if (preg_match('/```json(.*?)```/s', $content, $matches)) {
            $content = trim($matches[1]);
        } elseif (preg_match('/```(.*?)```/s', $content, $matches)) {
            $content = trim($matches[1]);
        }

        $json = pb_decodeBotAnswersPayload($content);
        $answers = $json['answers'] ?? null;
        if (!is_array($answers)) {
            pb_logDebug('partybattle_ai_bot_answers_invalid', [
                'mode' => $mode,
                'bots' => count($botIds),
                'prompt' => $question,
                'raw_preview' => $content,
            ]);
            return [];
        }

        $answers = array_values(array_filter(array_map(function ($answer) {
            return trim((string) $answer);
        }, $answers)));

        if (empty($answers)) {
            pb_logDebug('partybattle_ai_bot_answers_empty', [
                'mode' => $mode,
                'bots' => count($botIds),
                'prompt' => $question,
            ]);
            return [];
        }

        $mapped = [];
        foreach ($botIds as $index => $botId) {
            $candidate = $answers[$index] ?? $answers[$index % count($answers)] ?? null;
            $candidate = pb_sanitizeBotAnswer($candidate, $mode, $prompt);
            if ($candidate !== null) {
                $mapped[$botId] = $candidate;
            }
        }

        pb_logDebug('partybattle_ai_bot_answers_success', [
            'mode' => $mode,
            'bots_requested' => count($botIds),
            'bots_mapped' => count($mapped),
            'prompt' => $question,
            'truth_present' => !empty($prompt['truth']),
        ]);
        return $mapped;
    } catch (Exception $e) {
        pb_logDebug('partybattle_ai_bot_answers_fail', [
            'mode' => $mode,
            'bots' => count($botIds),
            'prompt' => $question,
            'message' => $e->getMessage(),
        ]);
        return [];
    }
}

function pb_getBotAnswerTask($mode, $prompt)
{
    switch ($mode) {
        case 'advice':
            return 'дай вредный, абсурдный, но тематически подходящий совет';
        case 'acronym':
            return 'смешно расшифруй аббревиатуру, сохраняя ощущение набора букв';
        case 'caption':
            return 'придумай короткую смешную подпись к картинке';
        case 'bluff':
            return 'придумай правдоподобную ложную концовку, которая звучит как реальный факт, но не совпадает с настоящим ответом';
        case 'joke':
        default:
            return 'придумай короткую смешную добивку';
    }
}

function pb_sanitizeBotAnswer($answer, $mode, $prompt)
{
    $answer = trim((string) $answer);
    if ($answer === '') {
        return null;
    }

    $answer = preg_replace('/\s+/u', ' ', $answer);
    $answer = trim($answer, "\"' \t\n\r\0\x0B");
    if ($answer === '') {
        return null;
    }

    $lower = mb_strtolower($answer);
    $bannedPatterns = [
        '/\b(хуй|пизд|еба|бля|нах|сук|мудак)\p{L}*/u',
        '/\b(ахаха|лол|кринж|го некст|а ч[её] всмысле|я бот, мне можно)\b/u',
        '/\b(продам гараж|шутка юмора за 300|всё ид[её]т по плану|где тут кнопка)\b/u',
        '/\b(test|testing|debug|null|undefined|n\/a)\b/i',
    ];
    foreach ($bannedPatterns as $pattern) {
        if (preg_match($pattern, $lower)) {
            return null;
        }
    }

    if (preg_match('/^[\p{L}\p{N}\s!?.,-]+$/u', $answer) !== 1) {
        return null;
    }

    if ($mode !== 'bluff' && mb_strlen($answer) < 6) {
        return null;
    }

    if ($mode === 'bluff') {
        $truth = trim((string) ($prompt['truth'] ?? ''));
        if ($truth !== '' && mb_strtolower($answer) === mb_strtolower($truth)) {
            return null;
        }

        if (mb_strlen($answer) < 3) {
            return null;
        }
    }

    if ($mode === 'advice' && !preg_match('/\b(сделай|скажи|притворись|обвини|просто|сразу|начни|ответь|улыбнись|соври|уйди|переведи)\b/u', $lower)) {
        return null;
    }

    if ($mode === 'caption' && mb_strlen($answer) > 60) {
        return null;
    }

    if (in_array($mode, ['joke', 'caption'], true) && preg_match('/^[\p{L}\p{N}]+$/u', $answer)) {
        return null;
    }

    return mb_substr($answer, 0, 150);
}

function pb_decodeBotAnswersPayload($content)
{
    $content = trim((string) $content);
    if ($content === '') {
        return null;
    }

    $decoded = json_decode($content, true);
    if (is_array($decoded)) {
        return $decoded;
    }

    if (preg_match('/\{[\s\S]*\}/', $content, $matches)) {
        $decoded = json_decode(trim($matches[0]), true);
        if (is_array($decoded)) {
            return $decoded;
        }
    }

    return null;
}

function pb_getBotFallbackLibrary($mode)
{
    $libraries = [
        'advice' => [
            'Скажи, что это был социальный эксперимент.',
            'Сделай уверенный вид и обвиняй обстоятельства.',
            'Притворись экспертом и говори загадками.',
            'Ответь так странно, чтобы никто не спорил.',
            'Переведи тему на что угодно, только не на правду.',
            'Сделай вид, что именно так и было задумано.',
        ],
        'caption' => [
            'Когда работаешь на чистом отчаянии.',
            'Лицо человека, у которого всё по плану. Почти.',
            'Я в момент, когда дедлайн уже в комнате.',
            'Когда надо выглядеть уверенно, а внутри паника.',
            'Ожидание: контроль. Реальность: хаос.',
            'Собрался с мыслями. Мысли не пришли.',
        ],
        'bluff' => [
            'еловой смолы',
            'рыбьих костей',
            'порошка из мела',
            'сушёных ягод',
            'коры деревьев',
            'перетёртых орехов',
        ],
        'acronym' => [
            'Срочно Требуется Очень Ловкий Агент',
            'Система Тайного Общения Лентяев',
            'Самый Тревожный Отдел Легенд',
            'Союз Тех, Кто Опоздал Логично',
            'Секретная Техника Очень Лёгкой Атаки',
            'Сервис Тупо Очень Ломает Атмосферу',
        ],
        'joke' => [
            'Потому что план Б снова испугался.',
            'Именно так рождаются плохие идеи.',
            'Зато теперь есть что вспоминать.',
            'Так обычно и начинается катастрофа.',
            'Ну хоть скучно не было.',
            'Это уже звучит как успех.',
        ],
    ];

    return $libraries[$mode] ?? $libraries['joke'];
}

function pb_generateHands($pdo, $room, &$state)
{
    $playerIds = pb_getRoomPlayerIds($pdo, $room['id']);
    $state['hands'] = [];
    $pool = pb_getRoundGifPool($state);
    foreach ($playerIds as $playerId) {
        pb_generatePlayerHand($state, $playerId, $pool);
    }
}

function pb_generatePlayerHand(&$state, $userId, $sharedPool = null)
{
    $pool = is_array($sharedPool) ? $sharedPool : pb_getRoundGifPool($state);
    if (empty($pool)) {
        $state['hands'][(string) $userId] = [];
        return;
    }

    shuffle($pool);
    $state['hands'][(string) $userId] = array_slice($pool, 0, 6);
}

function pb_getPromptDisplayText($prompt)
{
    if (($prompt['kind'] ?? null) === 'image') {
        return 'funny meme';
    }
    return (string) ($prompt['body'] ?? '');
}

function pb_getSituationText($situation)
{
    if (is_array($situation)) {
        return $situation['text'] ?? $situation['question'] ?? json_encode($situation);
    }
    return (string) $situation;
}

function pb_extractKeywords($text)
{
    $clean = mb_strtolower((string) $text);
    $clean = preg_replace('/[^\p{L}\p{N}\s]+/u', ' ', $clean);
    $words = preg_split('/\s+/u', trim($clean)) ?: [];
    $stopWords = [
        'когда', 'после', 'перед', 'тебя', 'тебе', 'твое', 'твоя', 'твой', 'твои',
        'если', 'потому', 'чтобы', 'который', 'которая', 'которые', 'очень', 'просто',
        'сразу', 'потом', 'всегда', 'никогда', 'почему', 'зачем', 'этот', 'эта', 'эти',
        'будет', 'когда', 'только', 'ночью', 'мешок', 'лопату'
    ];
    $keywords = [];
    foreach ($words as $word) {
        if (mb_strlen($word) < 4 || in_array($word, $stopWords, true)) {
            continue;
        }
        $keywords[] = $word;
    }
    return array_values(array_unique($keywords));
}

function pb_getRoundGifPool(&$state)
{
    $round = $state['round'] ?? null;
    if (!is_array($round) || ($round['mode'] ?? null) !== 'meme') {
        return [];
    }

    if (!empty($round['gif_pool']) && is_array($round['gif_pool'])) {
        return $round['gif_pool'];
    }

    $prompt = $round['prompt'] ?? [];
    $queries = pb_buildGifSearchQueries($prompt);
    $pool = [];
    $executedQueries = [];

    try {
        foreach ($queries as $query) {
            $executedQueries[] = $query;
            $pool = pb_mergeGifPools($pool, pb_searchGifResults($query, 18));
            if (count($pool) >= 30) {
                break;
            }
        }
    } catch (Exception $e) {
        pb_logDebug('partybattle_hands', ['message' => $e->getMessage()]);
        $pool = [];
    }

    if (empty($pool)) {
        $pool = pb_searchFallbackGifs();
        pb_logDebug('partybattle_gif_pool_fallback', [
            'mode' => $round['mode'] ?? null,
            'queries' => $queries,
            'results' => count($pool),
        ]);
    }

    shuffle($pool);
    $state['round']['gif_pool'] = $pool;
    pb_logDebug('partybattle_gif_pool_ready', [
        'mode' => $round['mode'] ?? null,
        'executed_queries' => $executedQueries,
        'results' => count($pool),
    ]);
    return $pool;
}

function pb_buildGifSearchQueries($prompt)
{
    $text = pb_getPromptDisplayText($prompt);
    $keywords = pb_extractKeywords($text);
    $queries = [];

    if (!empty($keywords)) {
        $queries[] = implode(' ', array_slice($keywords, 0, 3));
        $queries[] = implode(' ', array_slice($keywords, 0, 2)) . ' мем';
        $queries[] = implode(' ', array_slice($keywords, 0, 2)) . ' реакция';
    }

    $queries[] = 'мем реакция';
    $queries[] = 'funny reaction meme';
    $queries[] = 'wtf reaction';

    return array_values(array_unique(array_filter(array_map('trim', $queries))));
}

function pb_searchGifResults($query, $count = 12)
{
    require_once __DIR__ . '/../lib/GifProvider.php';
    $gifProvider = GifProviderFactory::create();
    $normalized = pb_normalizeGifQuery($query);
    try {
        $data = $gifProvider->search($normalized, $count);
        return $data['results'] ?? [];
    } catch (Exception $e) {
        pb_logDebug('partybattle_gif_provider_fail', [
            'query' => $query,
            'normalized_query' => $normalized,
            'requested' => $count,
            'message' => $e->getMessage(),
        ]);
        throw $e;
    }
}

function pb_searchFallbackGifs()
{
    $fallback = [
        'мем реакция',
        'funny reaction meme',
        'facepalm reaction',
    ];
    $pool = [];
    foreach ($fallback as $query) {
        try {
            $pool = pb_mergeGifPools($pool, pb_searchGifResults($query, 18));
            if (count($pool) >= 24) {
                break;
            }
        } catch (Exception $e) {
        }
    }
    return $pool;
}

function pb_mergeGifPools($base, $extra)
{
    $merged = [];
    $seen = [];
    foreach (array_merge($base, $extra) as $gif) {
        $key = $gif['id']
            ?? ($gif['media_formats']['tinygif']['url']
            ?? ($gif['media_formats']['gif']['url']
            ?? ($gif['url'] ?? md5(json_encode($gif)))));
        if (isset($seen[$key])) {
            continue;
        }
        $seen[$key] = true;
        $merged[] = $gif;
    }
    return $merged;
}

function pb_normalizeGifQuery($query)
{
    $query = mb_strtolower(trim((string) $query));
    $query = preg_replace('/[^\p{L}\p{N}\s]+/u', ' ', $query);
    $query = preg_replace('/\s+/u', ' ', $query);
    return trim($query) !== '' ? trim($query) : 'мем реакция';
}

function pb_normalizeGifCacheKey($query)
{
    return sha1(pb_normalizeGifQuery($query));
}

function pb_generateDeck($pdo, $mode, $theme, $aiMode = false, $customTopic = '', $rounds = 5, $recentCardIds = [])
{
    if ($theme === 'adult') {
        $theme = '18plus';
    }

    $theme = pb_resolvePartyBattleTheme($mode, $theme);

    $situations = [];
    if ($aiMode && $mode === 'joke') {
        require_once __DIR__ . '/../lib/AI/AIService.php';
        try {
            $topicSuffix = $customTopic !== '' ? " Тема: {$customTopic}." : '';
            $prompt = "Придумай {$rounds} коротких сетапов (начало шутки) для игры 'Добивка'.{$topicSuffix} Люди будут придумывать смешные концовки сами. Формат JSON: {\"situations\": [\"Заходит улитка в бар и говорит...\", \"Самый плохой совет на первом свидании это...\"]}. Не используй Markdown, только чистый JSON.";
            $response = AIService::getProvider('text')->text([['role' => 'user', 'content' => $prompt]], ['temperature' => 0.8]);
            $content = trim(preg_replace('/```json|```/i', '', $response['content'] ?? ''));
            $aiData = json_decode($content, true);
            if (!empty($aiData['situations']) && is_array($aiData['situations'])) {
                $situations = $aiData['situations'];
                pb_logDebug('partybattle_ai_deck_success', [
                    'mode' => $mode,
                    'theme' => $theme,
                    'rounds' => $rounds,
                    'topic' => $customTopic,
                    'generated' => count($situations),
                ]);
            } else {
                pb_logDebug('partybattle_ai_deck_invalid', [
                    'mode' => $mode,
                    'theme' => $theme,
                    'rounds' => $rounds,
                    'topic' => $customTopic,
                    'raw_preview' => $content,
                ]);
            }
        } catch (Exception $e) {
            pb_logDebug('partybattle_ai_deck_fail', [
                'mode' => $mode,
                'theme' => $theme,
                'rounds' => $rounds,
                'topic' => $customTopic,
                'message' => $e->getMessage(),
            ]);
        }
    }

    if (!empty($situations)) {
        shuffle($situations);
        return array_slice($situations, 0, $rounds);
    }

    $situations = pb_loadPartyBattlePackEntries($mode, $theme);

    if (empty($situations)) {
        if (class_exists('TelegramLogger')) {
            TelegramLogger::logError('partybattle_pack_fallback', [
                'mode' => $mode,
                'theme' => $theme,
            ]);
        }
        $situations = pb_getEmergencyPartyBattleEntries($mode);
    }

    $situations = pb_filterRecentDeckEntries($mode, $situations, $recentCardIds, $rounds);
    shuffle($situations);
    return array_slice($situations, 0, $rounds);
}

function pb_getPartyBattlePackRegistry()
{
    $root = __DIR__ . '/packs';
    return [
        'meme' => [
            'base' => [$root . '/partybattle/meme/base.json'],
            '18plus' => [$root . '/partybattle/meme/18plus.json'],
            'office' => [$root . '/partybattle/meme/office.json'],
            'relationships' => [$root . '/partybattle/meme/relationships.json'],
            'school' => [$root . '/partybattle/meme/school.json'],
            'it' => [$root . '/partybattle/meme/it.json'],
            'simple_base' => [$root . '/partybattle/meme/simple_base.json'],
        ],
        'joke' => [
            'base' => [$root . '/partybattle/joke/base.json'],
            '18plus' => [$root . '/partybattle/joke/18plus.json'],
        ],
        'advice' => [
            'base' => [$root . '/partybattle/advice/base.json'],
            '18plus' => [$root . '/partybattle/advice/18plus.json'],
        ],
        'acronym' => [
            'base' => [$root . '/partybattle/acronym/base.json'],
            '18plus' => [$root . '/partybattle/acronym/18plus.json'],
        ],
        'caption' => [
            'base' => [$root . '/partybattle/caption/base.json'],
        ],
        'bluff' => [
            'base' => [$root . '/partybattle/bluff/base.json'],
            '18plus' => [$root . '/partybattle/bluff/18plus.json'],
        ],
        'whoami' => [
            'base' => [$root . '/partybattle/whoami/base.json'],
            '18plus' => [$root . '/partybattle/whoami/18plus.json'],
        ],
    ];
}

function pb_resolvePartyBattleTheme($mode, $theme)
{
    $registry = pb_getPartyBattlePackRegistry();
    $modeRegistry = $registry[$mode] ?? null;
    if (!$modeRegistry) {
        return 'base';
    }

    if (isset($modeRegistry[$theme])) {
        return $theme;
    }

    return 'base';
}

function pb_loadPartyBattlePackEntries($mode, $theme)
{
    $registry = pb_getPartyBattlePackRegistry();
    $modeRegistry = $registry[$mode] ?? null;
    if (!$modeRegistry) {
        return [];
    }

    $paths = $modeRegistry[$theme] ?? $modeRegistry['base'] ?? [];
    if (!is_array($paths)) {
        return [];
    }

    $entries = pb_loadPartyBattlePackEntriesFromPaths($mode, $theme, $paths);
    $entries = pb_maybeBackfillThemePool($mode, $theme, $entries, $modeRegistry);
    return pb_dedupePackEntries($mode, $entries);
}

function pb_loadPartyBattlePackEntriesFromPaths($mode, $theme, $paths)
{
    if (!is_array($paths)) {
        return [];
    }

    $entries = [];
    foreach ($paths as $path) {
        if (!file_exists($path)) {
            continue;
        }

        $pack = pb_readJsonFile($path);
        $validatedPack = pb_validatePartyBattlePack($pack, $mode, $theme, $path);
        if ($validatedPack === null) {
            continue;
        }
        $entries = array_merge($entries, pb_extractModePackEntries($validatedPack, $mode));
    }

    return pb_dedupePackEntries($mode, $entries);
}

function pb_maybeBackfillThemePool($mode, $theme, $entries, $modeRegistry)
{
    if ($theme === 'base') {
        return $entries;
    }

    $targetSize = pb_getRecommendedThemePoolSize($mode);
    if (count($entries) >= $targetSize) {
        return $entries;
    }

    $basePaths = $modeRegistry['base'] ?? [];
    if (!is_array($basePaths) || empty($basePaths)) {
        return $entries;
    }

    $baseEntries = pb_loadPartyBattlePackEntriesFromPaths($mode, 'base', $basePaths);
    if (empty($baseEntries)) {
        return $entries;
    }

    return pb_dedupePackEntries($mode, array_merge($entries, $baseEntries));
}

function pb_getRecommendedThemePoolSize($mode)
{
    switch ($mode) {
        case 'meme':
        case 'caption':
            return 80;
        case 'whoami':
            return 100;
        case 'bluff':
            return 60;
        case 'joke':
        case 'advice':
            return 70;
        case 'acronym':
            return 90;
        default:
            return 60;
    }
}

function pb_readJsonFile($path)
{
    $content = @file_get_contents($path);
    if ($content === false) {
        return [];
    }

    $data = json_decode($content, true);
    return is_array($data) ? $data : [];
}

function pb_extractModePackEntries($pack, $mode)
{
    $entries = $pack['entries'] ?? null;
    if (!is_array($entries)) {
        return [];
    }

    $theme = (string) (($pack['meta'] ?? [])['theme'] ?? 'base');
    $normalized = [];
    foreach ($entries as $entry) {
        $candidate = pb_normalizePackEntry($mode, $theme, $entry);
        if ($candidate !== null) {
            $normalized[] = $candidate;
        }
    }

    return pb_dedupePackEntries($mode, $normalized);
}

function pb_validatePartyBattlePack($pack, $mode, $theme, $path = '')
{
    if (!is_array($pack)) {
        pb_logPartyBattlePackIssue('invalid_payload', $mode, $theme, $path);
        return null;
    }

    $meta = $pack['meta'] ?? null;
    $entries = $pack['entries'] ?? null;
    if (!is_array($meta) || !is_array($entries)) {
        pb_logPartyBattlePackIssue('missing_meta_or_entries', $mode, $theme, $path);
        return null;
    }

    $expectedKind = pb_getExpectedPackKind($mode);
    $packMode = (string) ($meta['mode'] ?? '');
    $packTheme = (string) ($meta['theme'] ?? '');
    $packKind = (string) ($meta['kind'] ?? '');

    if ($packMode !== $mode) {
        pb_logPartyBattlePackIssue('mode_mismatch', $mode, $theme, $path, ['pack_mode' => $packMode]);
        return null;
    }

    if ($packTheme !== $theme && !($theme === 'base' && $packTheme === 'base')) {
        pb_logPartyBattlePackIssue('theme_mismatch', $mode, $theme, $path, ['pack_theme' => $packTheme]);
        return null;
    }

    if ($packKind !== $expectedKind) {
        pb_logPartyBattlePackIssue('kind_mismatch', $mode, $theme, $path, [
            'pack_kind' => $packKind,
            'expected_kind' => $expectedKind,
        ]);
        return null;
    }

    if (empty($entries)) {
        pb_logPartyBattlePackIssue('empty_entries', $mode, $theme, $path);
        return null;
    }

    return $pack;
}

function pb_getExpectedPackKind($mode)
{
    switch ($mode) {
        case 'caption':
            return 'image';
        case 'whoami':
            return 'player_question';
        case 'bluff':
            return 'fact';
        default:
            return 'text';
    }
}

function pb_logPartyBattlePackIssue($reason, $mode, $theme, $path = '', $extra = [])
{
    if (!class_exists('TelegramLogger')) {
        return;
    }

    TelegramLogger::logError('partybattle_pack_validation', array_merge([
        'reason' => $reason,
        'mode' => $mode,
        'theme' => $theme,
        'path' => $path,
    ], $extra));
}

function pb_dedupeStringEntries($entries)
{
    $seen = [];
    $result = [];
    foreach ($entries as $entry) {
        $value = trim((string) $entry);
        if ($value === '') {
            continue;
        }
        $key = mb_strtolower($value);
        if (isset($seen[$key])) {
            continue;
        }
        $seen[$key] = true;
        $result[] = $value;
    }
    return $result;
}

function pb_dedupeBluffEntries($entries)
{
    $seen = [];
    $result = [];
    foreach ($entries as $entry) {
        $text = trim((string) ($entry['text'] ?? ''));
        $truth = trim((string) ($entry['truth'] ?? ''));
        if ($text === '' || $truth === '') {
            continue;
        }
        $key = mb_strtolower($text . '|' . $truth);
        if (isset($seen[$key])) {
            continue;
        }
        $seen[$key] = true;
        $normalized = [
            'text' => $text,
            'truth' => $truth,
        ];
        if (!empty($entry['id'])) {
            $normalized['id'] = (string) $entry['id'];
        }
        if (!empty($entry['tags']) && is_array($entry['tags'])) {
            $normalized['tags'] = array_values(array_filter(array_map('strval', $entry['tags'])));
        }
        $result[] = $normalized;
    }
    return $result;
}

function pb_dedupePackEntries($mode, $entries)
{
    if ($mode === 'bluff') {
        return pb_dedupeBluffEntries($entries);
    }

    $seen = [];
    $result = [];
    foreach ($entries as $entry) {
        $cardId = pb_getRawCardId($mode, $entry);
        if ($cardId === null || isset($seen[$cardId])) {
            continue;
        }
        $seen[$cardId] = true;
        $result[] = $entry;
    }
    return $result;
}

function pb_normalizePackEntry($mode, $theme, $entry)
{
    if (!is_array($entry)) {
        return null;
    }

    if ($mode === 'caption') {
        $mediaUrl = pb_normalizeCaptionMediaUrl($entry['media_url'] ?? '');
        if ($mediaUrl === '') {
            return null;
        }
        return [
            'id' => trim((string) ($entry['id'] ?? pb_buildCanonicalCardId($mode, $theme, $mediaUrl))),
            'media_url' => $mediaUrl,
            'tags' => array_values(array_filter(array_map('strval', $entry['tags'] ?? []))),
        ];
    }

    if ($mode === 'bluff') {
        $text = trim((string) ($entry['text'] ?? ''));
        $truth = trim((string) ($entry['truth'] ?? ''));
        if ($text === '' || $truth === '') {
            return null;
        }
        return [
            'id' => trim((string) ($entry['id'] ?? pb_buildCanonicalCardId($mode, $theme, $text . '|' . $truth))),
            'text' => $text,
            'truth' => $truth,
            'tags' => array_values(array_filter(array_map('strval', $entry['tags'] ?? []))),
        ];
    }

    $text = trim((string) ($entry['text'] ?? ''));
    if ($text === '') {
        return null;
    }

    return [
        'id' => trim((string) ($entry['id'] ?? pb_buildCanonicalCardId($mode, $theme, $text))),
        'text' => $text,
        'tags' => array_values(array_filter(array_map('strval', $entry['tags'] ?? []))),
    ];
}

function pb_buildCanonicalCardId($mode, $theme, $value)
{
    return $mode . '_' . $theme . '_' . substr(sha1($mode . '|' . $theme . '|' . trim((string) $value)), 0, 16);
}

function pb_normalizeCaptionMediaUrl($url)
{
    $url = trim((string) $url);
    if ($url === '') {
        return '';
    }

    if (preg_match('#https?://media\.giphy\.com/media/([^/]+)/giphy\.gif#i', $url, $matches)) {
        return 'https://i.giphy.com/media/' . $matches[1] . '/giphy.gif';
    }

    return $url;
}

function pb_getRawCardId($mode, $rawCard)
{
    if (is_array($rawCard) && !empty($rawCard['id'])) {
        return (string) $rawCard['id'];
    }

    if ($mode === 'caption') {
        $value = is_array($rawCard) ? ($rawCard['media_url'] ?? '') : $rawCard;
        $value = trim((string) $value);
        return $value !== '' ? pb_buildCanonicalCardId($mode, 'legacy', $value) : null;
    }

    if ($mode === 'bluff') {
        $text = trim((string) (is_array($rawCard) ? ($rawCard['text'] ?? '') : ''));
        $truth = trim((string) (is_array($rawCard) ? ($rawCard['truth'] ?? '') : ''));
        return ($text !== '' && $truth !== '') ? pb_buildCanonicalCardId($mode, 'legacy', $text . '|' . $truth) : null;
    }

    $value = is_array($rawCard)
        ? ($rawCard['text'] ?? $rawCard['question'] ?? '')
        : $rawCard;
    $value = trim((string) $value);
    return $value !== '' ? pb_buildCanonicalCardId($mode, 'legacy', $value) : null;
}

function pb_filterRecentDeckEntries($mode, $entries, $recentCardIds, $rounds)
{
    if (empty($entries)) {
        return [];
    }

    $recentLookup = [];
    foreach (array_values(array_filter(array_map('strval', (array) $recentCardIds))) as $recentId) {
        $recentLookup[$recentId] = true;
    }

    if (empty($recentLookup)) {
        return $entries;
    }

    $fresh = [];
    $fallback = [];
    foreach ($entries as $entry) {
        $cardId = pb_getRawCardId($mode, $entry);
        if ($cardId !== null && isset($recentLookup[$cardId])) {
            $fallback[] = $entry;
            continue;
        }
        $fresh[] = $entry;
    }

    if (count($fresh) >= $rounds) {
        return $fresh;
    }

    return array_merge($fresh, $fallback);
}

function pb_normalizeRecentCards($recentCards)
{
    if (!is_array($recentCards)) {
        return [];
    }

    $normalized = [];
    foreach ($recentCards as $mode => $ids) {
        if (!is_array($ids)) {
            continue;
        }
        $normalized[(string) $mode] = array_values(
            array_slice(
                array_unique(array_filter(array_map('strval', $ids))),
                -pb_getRecentCardHistoryLimit()
            )
        );
    }
    return $normalized;
}

function pb_markRecentCardUsed(&$state, $mode, $cardId)
{
    $mode = (string) $mode;
    $cardId = trim((string) $cardId);
    if ($mode === '' || $cardId === '') {
        return;
    }

    if (!isset($state['recent_cards']) || !is_array($state['recent_cards'])) {
        $state['recent_cards'] = [];
    }
    if (!isset($state['recent_cards'][$mode]) || !is_array($state['recent_cards'][$mode])) {
        $state['recent_cards'][$mode] = [];
    }

    $existing = array_values(array_filter(array_map('strval', $state['recent_cards'][$mode])));
    $existing = array_values(array_filter($existing, function ($existingId) use ($cardId) {
        return $existingId !== $cardId;
    }));
    $existing[] = $cardId;
    $state['recent_cards'][$mode] = array_slice($existing, -pb_getRecentCardHistoryLimit());
}

function pb_dedupeDeckCards($cards)
{
    $deduped = [];
    $seen = [];
    foreach ((array) $cards as $card) {
        $key = pb_getDeckCardKey($card);
        if ($key === null || isset($seen[$key])) {
            continue;
        }
        $seen[$key] = true;
        $deduped[] = $card;
    }
    return $deduped;
}

function pb_getDeckCardKey($card)
{
    if (!is_array($card)) {
        return null;
    }

    $mode = trim((string) ($card['mode'] ?? ''));
    $cardId = trim((string) ($card['card_id'] ?? ''));
    if ($mode !== '' && $cardId !== '') {
        return $mode . '|' . $cardId;
    }

    $prompt = $card['prompt'] ?? [];
    if (!is_array($prompt)) {
        return null;
    }

    $promptKey = trim((string) (($prompt['body'] ?? '') . '|' . ($prompt['media_url'] ?? '') . '|' . ($prompt['truth'] ?? '')));
    return $mode !== '' && $promptKey !== '' ? $mode . '|prompt|' . sha1($promptKey) : null;
}

function pb_getPlayedDeckCardLookup($state)
{
    $lookup = [];

    foreach (($state['history'] ?? []) as $historyEntry) {
        if (!is_array($historyEntry)) {
            continue;
        }
        $mode = trim((string) ($historyEntry['mode'] ?? ''));
        $cardId = trim((string) ($historyEntry['card_id'] ?? ''));
        if ($mode !== '' && $cardId !== '') {
            $lookup[$mode . '|' . $cardId] = true;
        }
    }

    $round = $state['round'] ?? null;
    if (is_array($round)) {
        $mode = trim((string) ($round['mode'] ?? ''));
        $cardId = trim((string) ($round['card_id'] ?? ''));
        if ($mode !== '' && $cardId !== '') {
            $lookup[$mode . '|' . $cardId] = true;
        }
    }

    return $lookup;
}

function pb_popNextUnusedDeckCard(&$state)
{
    $playedLookup = pb_getPlayedDeckCardLookup($state);

    while (!empty($state['situations_deck'])) {
        $card = array_shift($state['situations_deck']);
        $key = pb_getDeckCardKey($card);
        if ($key !== null && isset($playedLookup[$key])) {
            pb_logDebug('partybattle_duplicate_round_skipped', [
                'mode' => $card['mode'] ?? null,
                'card_id' => $card['card_id'] ?? null,
            ]);
            continue;
        }
        return $card;
    }

    return null;
}

function pb_getRecentCardHistoryLimit()
{
    return 120;
}

function pb_getEmergencyPartyBattleEntries($mode)
{
    switch ($mode) {
        case 'meme':
        case 'caption':
            return [
                "https://media.giphy.com/media/l41lFw057lAJQMwg0/giphy.gif",
                "https://media.giphy.com/media/JIX9t2j0ZTN9S/giphy.gif",
                "https://media.giphy.com/media/3oEjI6SIIHBdRxXI40/giphy.gif",
            ];

        case 'joke':
            return [
                "Заходит улитка в бар и говорит...",
                "Самый неловкий момент на первом свидании это когда...",
                "Настоящий признак взрослой жизни это когда...",
                "Если бы будильники умели говорить, они бы начинали утро с фразы...",
            ];

        case 'advice':
            return [
                "Что делать, если ты случайно отправил сообщение не тому человеку?",
                "Как объяснить опоздание, если ты просто не хотел выходить из дома?",
                "Что делать, если на тебя внезапно направили камеру?",
                "Как выкрутиться, если ты забыл имя человека через пять секунд после знакомства?",
            ];

        case 'acronym':
            return [
                "ЖКХ",
                "МЧС",
                "ГИБДД",
                "ПТУ",
            ];

        case 'whoami':
            return [
                "Кто первым устроит драму из мелочи?",
                "Кто скорее всего заснет в самый неподходящий момент?",
                "Кто сможет заболтать вообще любого человека?",
                "Кто первым предложит заказать еду еще раз?",
            ];

        case 'bluff':
            return [
                [
                    'text' => 'У осьминога целых _______ сердца.',
                    'truth' => 'три',
                ],
                [
                    'text' => 'Бананы технически считаются не деревом, а гигантской _______.',
                    'truth' => 'травой',
                ],
                [
                    'text' => 'На Аляске когда-то мэром был целый _______.',
                    'truth' => 'кот',
                ],
            ];
    }

    return [];
}
