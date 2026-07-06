<?php

const DURAK_SCHEMA_VERSION = 1;
const DURAK_DECK_PROFILE_ID = 'durak_36';
const DURAK_HAND_SIZE = 6;
const DURAK_MIN_PLAYERS = 2;
const DURAK_MAX_PLAYERS = 4;

if (isset($pdo) && $pdo instanceof PDO && isset($room) && is_array($room) && isset($room['id'])) {
    $GLOBALS['durak_start_context'] = [
        'pdo' => $pdo,
        'room_id' => (int) $room['id'],
    ];
}

function durakGetDeckProfile(string $profileId = DURAK_DECK_PROFILE_ID): array
{
    if ($profileId !== DURAK_DECK_PROFILE_ID) {
        throw new InvalidArgumentException('Unsupported Durak deck profile');
    }

    return [
        'id' => DURAK_DECK_PROFILE_ID,
        'suits' => ['S', 'H', 'D', 'C'],
        'ranks' => ['6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'],
    ];
}

function durakBuildDeck(string $profileId = DURAK_DECK_PROFILE_ID): array
{
    $profile = durakGetDeckProfile($profileId);
    $deck = [];

    foreach ($profile['suits'] as $suit) {
        foreach ($profile['ranks'] as $rank) {
            $deck[] = $rank . $suit;
        }
    }

    return $deck;
}

function durakGetRoomPlayerOrder(PDO $pdo, int $roomId): array
{
    $stmt = $pdo->prepare("
        SELECT user_id
        FROM room_players
        WHERE room_id = ? AND COALESCE(is_bot, 0) = 0
        ORDER BY id ASC
    ");
    $stmt->execute([$roomId]);

    return array_map('strval', $stmt->fetchAll(PDO::FETCH_COLUMN));
}

function durakBuildInitialState(array $playerOrder, string $profileId = DURAK_DECK_PROFILE_ID): array
{
    $playerOrder = array_values(array_map('strval', $playerOrder));
    $playerCount = count($playerOrder);

    if ($playerCount < DURAK_MIN_PLAYERS || $playerCount > DURAK_MAX_PLAYERS) {
        throw new RuntimeException('Durak requires 2-4 live players');
    }

    $deck = durakBuildDeck($profileId);
    shuffle($deck);

    $hands = [];
    foreach ($playerOrder as $playerId) {
        $hands[$playerId] = array_splice($deck, 0, DURAK_HAND_SIZE);
    }

    $trumpCard = array_pop($deck);
    $trumpSuit = durakCardSuit($trumpCard);
    $deck[] = $trumpCard;

    $attackerId = durakFindFirstAttacker($hands, $playerOrder, $trumpSuit);
    $defenderId = durakNextInGamePlayer($playerOrder, $playerOrder, $attackerId);

    return [
        'schema_version' => DURAK_SCHEMA_VERSION,
        'phase' => 'attack',
        'deck_profile_id' => $profileId,
        'player_order' => $playerOrder,
        'in_game_players' => $playerOrder,
        'finish_order' => [],
        'hands' => $hands,
        'draw_pile' => $deck,
        'trump' => [
            'suit' => $trumpSuit,
            'card' => $trumpCard,
        ],
        'table' => [],
        'discard' => [],
        'roles' => [
            'attacker_id' => $attackerId,
            'defender_id' => $defenderId,
        ],
        'actor_id' => $attackerId,
        'passed_throwers' => [],
        'defender_mode' => 'defending',
        'attack_limit' => min(DURAK_HAND_SIZE, count($hands[$defenderId] ?? [])),
        'result' => [
            'loser_id' => null,
            'reason' => null,
        ],
    ];
}

function getInitialState()
{
    $context = $GLOBALS['durak_start_context'] ?? null;
    if (!is_array($context) || !isset($context['pdo'], $context['room_id']) || !($context['pdo'] instanceof PDO)) {
        throw new RuntimeException('Durak start context missing');
    }

    $playerOrder = durakGetRoomPlayerOrder($context['pdo'], (int) $context['room_id']);

    return durakBuildInitialState($playerOrder);
}

function handleGameAction($pdo, $room, $user, $postData)
{
    $state = json_decode($room['game_state'] ?? '', true);
    if (!is_array($state)) {
        $state = getInitialState();
    }

    durakNormalizeState($state);

    $action = $postData['game_action'] ?? $postData['type'] ?? '';
    $userId = (string) ($user['id'] ?? '');

    if (($state['phase'] ?? '') === 'finished') {
        return durakError('Game is already finished');
    }

    if ($action === 'attack_card') {
        return durakHandleAttackCard($state, $userId, (string) ($postData['card_id'] ?? ''));
    }

    if ($action === 'defend_card') {
        return durakHandleDefendCard(
            $state,
            $userId,
            (string) ($postData['attack_card_id'] ?? ''),
            (string) ($postData['card_id'] ?? '')
        );
    }

    if ($action === 'pass_throw_in') {
        return durakHandlePassThrowIn($state, $userId);
    }

    if ($action === 'take_cards') {
        return durakHandleTakeCards($state, $userId);
    }

    return durakError('Unknown Durak action');
}

function durakBuildPlayerProjection(array $state, $viewerId): array
{
    $viewerId = (string) $viewerId;
    $hands = is_array($state['hands'] ?? null) ? $state['hands'] : [];
    $opponentHands = [];

    foreach ($hands as $playerId => $cards) {
        $playerId = (string) $playerId;
        if ($playerId === $viewerId) {
            continue;
        }

        $opponentHands[] = [
            'player_id' => $playerId,
            'count' => is_array($cards) ? count($cards) : 0,
        ];
    }

    return [
        'schema_version' => $state['schema_version'] ?? DURAK_SCHEMA_VERSION,
        'phase' => $state['phase'] ?? 'attack',
        'deck_profile_id' => $state['deck_profile_id'] ?? DURAK_DECK_PROFILE_ID,
        'player_order' => $state['player_order'] ?? [],
        'in_game_players' => $state['in_game_players'] ?? [],
        'finish_order' => $state['finish_order'] ?? [],
        'my_hand' => array_values($hands[$viewerId] ?? []),
        'opponent_hands' => $opponentHands,
        'draw_count' => count($state['draw_pile'] ?? []),
        'trump' => $state['trump'] ?? ['suit' => null, 'card' => null],
        'table' => $state['table'] ?? [],
        'discard_count' => count($state['discard'] ?? []),
        'roles' => $state['roles'] ?? ['attacker_id' => null, 'defender_id' => null],
        'actor_id' => $state['actor_id'] ?? null,
        'passed_throwers' => $state['passed_throwers'] ?? [],
        'defender_mode' => $state['defender_mode'] ?? 'defending',
        'attack_limit' => (int) ($state['attack_limit'] ?? DURAK_HAND_SIZE),
        'result' => $state['result'] ?? ['loser_id' => null, 'reason' => null],
    ];
}

function durakHandleAttackCard(array $state, string $userId, string $cardId): array
{
    if (($state['phase'] ?? '') !== 'attack') {
        return durakError('You cannot attack now');
    }
    if ((string) ($state['actor_id'] ?? '') !== $userId) {
        return durakError('It is not your turn');
    }
    if (!durakHandHasCard($state, $userId, $cardId)) {
        return durakError('Card is not in your hand');
    }

    $defenderId = (string) ($state['roles']['defender_id'] ?? '');
    $attackerId = (string) ($state['roles']['attacker_id'] ?? '');
    $isOpeningAttack = count($state['table'] ?? []) === 0;

    if ($userId === $defenderId) {
        return durakError('Defender cannot throw in cards');
    }
    if ($isOpeningAttack && $userId !== $attackerId) {
        return durakError('Only attacker can open the trick');
    }
    if (!$isOpeningAttack && in_array($userId, $state['passed_throwers'] ?? [], true)) {
        return durakError('You have already passed this trick');
    }
    if (!$isOpeningAttack && !durakCardRankIsOnTable($state, $cardId)) {
        return durakError('Throw-in card rank must match the table');
    }
    if (durakAttackCount($state) >= (int) ($state['attack_limit'] ?? DURAK_HAND_SIZE)) {
        return durakError('Attack limit reached');
    }

    durakRemoveCardFromHand($state, $userId, $cardId);
    $state['table'][] = [
        'attack' => $cardId,
        'defend' => null,
    ];

    if (($state['defender_mode'] ?? 'defending') === 'taking') {
        durakSetNextThrowerOrComplete($state, $userId, true);
    } else {
        $state['phase'] = 'defense';
        $state['actor_id'] = $defenderId;
    }

    return ['status' => 'ok', 'state' => $state];
}

function durakHandleDefendCard(array $state, string $userId, string $attackCardId, string $defenseCardId): array
{
    if (($state['phase'] ?? '') !== 'defense') {
        return durakError('You cannot defend now');
    }
    if ((string) ($state['actor_id'] ?? '') !== $userId) {
        return durakError('It is not your turn');
    }
    if ((string) ($state['roles']['defender_id'] ?? '') !== $userId) {
        return durakError('Only defender can defend');
    }
    if (($state['defender_mode'] ?? 'defending') !== 'defending') {
        return durakError('Defender is already taking cards');
    }
    if (!durakHandHasCard($state, $userId, $defenseCardId)) {
        return durakError('Card is not in your hand');
    }

    $tableIndex = durakFindUncoveredAttackIndex($state, $attackCardId);
    if ($tableIndex === null) {
        return durakError('Attack card is not open for defense');
    }

    $trumpSuit = (string) ($state['trump']['suit'] ?? '');
    if (!durakCanBeat($defenseCardId, $attackCardId, $trumpSuit)) {
        return durakError('Defense card cannot beat the attack card');
    }

    durakRemoveCardFromHand($state, $userId, $defenseCardId);
    $state['table'][$tableIndex]['defend'] = $defenseCardId;

    if (durakAllAttacksCovered($state)) {
        durakSetNextThrowerOrComplete($state, null, false);
    } else {
        $state['phase'] = 'defense';
        $state['actor_id'] = $userId;
    }

    return ['status' => 'ok', 'state' => $state];
}

function durakHandlePassThrowIn(array $state, string $userId): array
{
    if (($state['phase'] ?? '') !== 'attack') {
        return durakError('You cannot pass now');
    }
    if ((string) ($state['actor_id'] ?? '') !== $userId) {
        return durakError('It is not your turn');
    }
    if (count($state['table'] ?? []) === 0) {
        return durakError('Opening attacker cannot pass');
    }
    if ((string) ($state['roles']['defender_id'] ?? '') === $userId) {
        return durakError('Defender cannot pass as thrower');
    }
    if (!durakAllAttacksCovered($state) && ($state['defender_mode'] ?? 'defending') !== 'taking') {
        return durakError('Defender must answer open attacks first');
    }

    if (!in_array($userId, $state['passed_throwers'] ?? [], true)) {
        $state['passed_throwers'][] = $userId;
    }

    durakSetNextThrowerOrComplete($state, $userId, ($state['defender_mode'] ?? 'defending') === 'taking');

    return ['status' => 'ok', 'state' => $state];
}

function durakHandleTakeCards(array $state, string $userId): array
{
    if (($state['phase'] ?? '') !== 'defense') {
        return durakError('You cannot take cards now');
    }
    if ((string) ($state['actor_id'] ?? '') !== $userId) {
        return durakError('It is not your turn');
    }
    if ((string) ($state['roles']['defender_id'] ?? '') !== $userId) {
        return durakError('Only defender can take cards');
    }

    $state['defender_mode'] = 'taking';
    durakSetNextThrowerOrComplete($state, null, true);

    return ['status' => 'ok', 'state' => $state];
}

function durakSetNextThrowerOrComplete(array &$state, ?string $afterPlayerId, bool $defenderTakes): void
{
    if (durakAttackCount($state) >= (int) ($state['attack_limit'] ?? DURAK_HAND_SIZE)) {
        durakCompleteTrick($state, $defenderTakes);
        return;
    }

    $nextThrower = durakFindNextThrower($state, $afterPlayerId);
    if ($nextThrower === null) {
        durakCompleteTrick($state, $defenderTakes);
        return;
    }

    $state['phase'] = 'attack';
    $state['actor_id'] = $nextThrower;
}

function durakCompleteTrick(array &$state, bool $defenderTakes): void
{
    $oldAttackerId = (string) ($state['roles']['attacker_id'] ?? '');
    $oldDefenderId = (string) ($state['roles']['defender_id'] ?? '');
    $tableCards = durakTableCards($state);

    if ($defenderTakes) {
        foreach ($tableCards as $cardId) {
            $state['hands'][$oldDefenderId][] = $cardId;
        }
        $nextAttackerSeed = durakNextInGamePlayer($state['player_order'], $state['in_game_players'], $oldDefenderId);
    } else {
        $state['discard'] = array_values(array_merge($state['discard'] ?? [], $tableCards));
        $nextAttackerSeed = $oldDefenderId;
    }

    $state['table'] = [];
    $state['passed_throwers'] = [];
    $state['defender_mode'] = 'defending';

    durakRefillHands($state, $oldAttackerId);
    durakUpdateFinishedPlayers($state);

    if (durakMaybeFinishGame($state)) {
        return;
    }

    $attackerId = durakFirstInGameAtOrAfter($state['player_order'], $state['in_game_players'], $nextAttackerSeed);
    $defenderId = durakNextInGamePlayer($state['player_order'], $state['in_game_players'], $attackerId);

    $state['phase'] = 'attack';
    $state['roles'] = [
        'attacker_id' => $attackerId,
        'defender_id' => $defenderId,
    ];
    $state['actor_id'] = $attackerId;
    $state['attack_limit'] = min(DURAK_HAND_SIZE, count($state['hands'][$defenderId] ?? []));
}

function durakRefillHands(array &$state, string $startPlayerId): void
{
    $drawOrder = durakPlayerOrderFrom($state['player_order'], $state['in_game_players'], $startPlayerId);

    foreach ($drawOrder as $playerId) {
        while (count($state['hands'][$playerId] ?? []) < DURAK_HAND_SIZE && !empty($state['draw_pile'])) {
            $state['hands'][$playerId][] = array_shift($state['draw_pile']);
        }
    }
}

function durakUpdateFinishedPlayers(array &$state): void
{
    if (!empty($state['draw_pile'])) {
        return;
    }

    foreach ($state['in_game_players'] as $playerId) {
        $playerId = (string) $playerId;
        if (!empty($state['hands'][$playerId])) {
            continue;
        }
        if (!in_array($playerId, $state['finish_order'], true)) {
            $state['finish_order'][] = $playerId;
        }
    }

    $state['in_game_players'] = array_values(array_filter($state['in_game_players'], function ($playerId) use ($state) {
        return !empty($state['hands'][(string) $playerId]);
    }));
}

function durakMaybeFinishGame(array &$state): bool
{
    $playersWithCards = [];
    foreach ($state['in_game_players'] as $playerId) {
        $playerId = (string) $playerId;
        if (!empty($state['hands'][$playerId])) {
            $playersWithCards[] = $playerId;
        }
    }

    if (count($playersWithCards) === 0) {
        $state['phase'] = 'finished';
        $state['actor_id'] = null;
        $state['result'] = [
            'loser_id' => null,
            'reason' => 'all_finished',
        ];
        return true;
    }

    if (count($playersWithCards) === 1 && empty($state['draw_pile'])) {
        $state['phase'] = 'finished';
        $state['actor_id'] = null;
        $state['result'] = [
            'loser_id' => $playersWithCards[0],
            'reason' => 'last_player_with_cards',
        ];
        return true;
    }

    return false;
}

function durakFindNextThrower(array $state, ?string $afterPlayerId): ?string
{
    if (empty($state['table'])) {
        return null;
    }

    $order = array_values(array_map('strval', $state['player_order'] ?? []));
    if (empty($order)) {
        return null;
    }

    $startFrom = $afterPlayerId !== null
        ? (string) $afterPlayerId
        : (string) ($state['roles']['attacker_id'] ?? $order[0]);
    $startIndex = array_search($startFrom, $order, true);
    if ($startIndex === false) {
        $startIndex = 0;
    } elseif ($afterPlayerId !== null) {
        $startIndex++;
    }

    $count = count($order);
    for ($offset = 0; $offset < $count; $offset++) {
        $candidate = $order[($startIndex + $offset) % $count];
        if (durakIsEligibleThrower($state, $candidate)) {
            return $candidate;
        }
    }

    return null;
}

function durakIsEligibleThrower(array $state, string $playerId): bool
{
    $playerId = (string) $playerId;
    if (!in_array($playerId, array_map('strval', $state['in_game_players'] ?? []), true)) {
        return false;
    }
    if ($playerId === (string) ($state['roles']['defender_id'] ?? '')) {
        return false;
    }
    if (in_array($playerId, $state['passed_throwers'] ?? [], true)) {
        return false;
    }
    if (empty($state['hands'][$playerId])) {
        return false;
    }
    if (durakAttackCount($state) >= (int) ($state['attack_limit'] ?? DURAK_HAND_SIZE)) {
        return false;
    }

    return true;
}

function durakPlayerOrderFrom(array $playerOrder, array $inGamePlayers, string $startPlayerId): array
{
    $playerOrder = array_values(array_map('strval', $playerOrder));
    $inGameLookup = array_fill_keys(array_map('strval', $inGamePlayers), true);
    $startIndex = array_search((string) $startPlayerId, $playerOrder, true);
    if ($startIndex === false) {
        $startIndex = 0;
    }

    $ordered = [];
    $count = count($playerOrder);
    for ($offset = 0; $offset < $count; $offset++) {
        $candidate = $playerOrder[($startIndex + $offset) % $count];
        if (isset($inGameLookup[$candidate])) {
            $ordered[] = $candidate;
        }
    }

    return $ordered;
}

function durakFirstInGameAtOrAfter(array $playerOrder, array $inGamePlayers, string $preferredPlayerId): string
{
    $ordered = durakPlayerOrderFrom($playerOrder, $inGamePlayers, $preferredPlayerId);
    return $ordered[0] ?? (string) $preferredPlayerId;
}

function durakNormalizeState(array &$state): void
{
    $state['schema_version'] = (int) ($state['schema_version'] ?? DURAK_SCHEMA_VERSION);
    $state['phase'] = $state['phase'] ?? 'attack';
    $state['deck_profile_id'] = $state['deck_profile_id'] ?? DURAK_DECK_PROFILE_ID;
    $state['player_order'] = array_values(array_map('strval', $state['player_order'] ?? []));
    $state['in_game_players'] = array_values(array_map('strval', $state['in_game_players'] ?? $state['player_order']));
    $state['finish_order'] = array_values(array_map('strval', $state['finish_order'] ?? []));
    $state['hands'] = is_array($state['hands'] ?? null) ? $state['hands'] : [];
    $state['draw_pile'] = is_array($state['draw_pile'] ?? null) ? $state['draw_pile'] : [];
    $state['table'] = is_array($state['table'] ?? null) ? $state['table'] : [];
    $state['discard'] = is_array($state['discard'] ?? null) ? $state['discard'] : [];
    $state['roles'] = is_array($state['roles'] ?? null) ? $state['roles'] : ['attacker_id' => null, 'defender_id' => null];
    $state['actor_id'] = isset($state['actor_id']) ? (string) $state['actor_id'] : null;
    $state['passed_throwers'] = array_values(array_map('strval', $state['passed_throwers'] ?? []));
    $state['defender_mode'] = in_array(($state['defender_mode'] ?? 'defending'), ['defending', 'taking'], true)
        ? $state['defender_mode']
        : 'defending';
    $state['attack_limit'] = (int) ($state['attack_limit'] ?? DURAK_HAND_SIZE);
    $state['result'] = is_array($state['result'] ?? null)
        ? $state['result']
        : ['loser_id' => null, 'reason' => null];
}

function durakError(string $message): array
{
    return ['status' => 'error', 'message' => $message];
}

function durakHandHasCard(array $state, string $playerId, string $cardId): bool
{
    return in_array($cardId, $state['hands'][$playerId] ?? [], true);
}

function durakRemoveCardFromHand(array &$state, string $playerId, string $cardId): void
{
    $cards = $state['hands'][$playerId] ?? [];
    $index = array_search($cardId, $cards, true);
    if ($index !== false) {
        array_splice($cards, $index, 1);
    }
    $state['hands'][$playerId] = array_values($cards);
}

function durakAttackCount(array $state): int
{
    return count($state['table'] ?? []);
}

function durakTableCards(array $state): array
{
    $cards = [];
    foreach ($state['table'] ?? [] as $pair) {
        if (!empty($pair['attack'])) {
            $cards[] = $pair['attack'];
        }
        if (!empty($pair['defend'])) {
            $cards[] = $pair['defend'];
        }
    }

    return $cards;
}

function durakCardRankIsOnTable(array $state, string $cardId): bool
{
    $rank = durakCardRank($cardId);
    foreach (durakTableCards($state) as $tableCardId) {
        if (durakCardRank($tableCardId) === $rank) {
            return true;
        }
    }

    return false;
}

function durakFindUncoveredAttackIndex(array $state, string $attackCardId): ?int
{
    foreach ($state['table'] ?? [] as $index => $pair) {
        if (($pair['attack'] ?? null) === $attackCardId && empty($pair['defend'])) {
            return $index;
        }
    }

    return null;
}

function durakAllAttacksCovered(array $state): bool
{
    if (empty($state['table'])) {
        return false;
    }

    foreach ($state['table'] as $pair) {
        if (empty($pair['defend'])) {
            return false;
        }
    }

    return true;
}

function durakCanBeat(string $defenseCardId, string $attackCardId, string $trumpSuit): bool
{
    $attackSuit = durakCardSuit($attackCardId);
    $defenseSuit = durakCardSuit($defenseCardId);

    if ($defenseSuit === $attackSuit) {
        return durakCardRankValue($defenseCardId) > durakCardRankValue($attackCardId);
    }

    return $defenseSuit === $trumpSuit && $attackSuit !== $trumpSuit;
}

function durakFindFirstAttacker(array $hands, array $playerOrder, string $trumpSuit): string
{
    $bestPlayerId = null;
    $bestRankValue = null;

    foreach ($playerOrder as $playerId) {
        $playerId = (string) $playerId;
        foreach ($hands[$playerId] ?? [] as $cardId) {
            if (durakCardSuit($cardId) !== $trumpSuit) {
                continue;
            }

            $rankValue = durakCardRankValue($cardId);
            if ($bestRankValue === null || $rankValue < $bestRankValue) {
                $bestRankValue = $rankValue;
                $bestPlayerId = $playerId;
            }
        }
    }

    return $bestPlayerId ?? (string) $playerOrder[0];
}

function durakNextInGamePlayer(array $playerOrder, array $inGamePlayers, string $fromPlayerId): string
{
    $playerOrder = array_values(array_map('strval', $playerOrder));
    $inGameLookup = array_fill_keys(array_map('strval', $inGamePlayers), true);
    $startIndex = array_search((string) $fromPlayerId, $playerOrder, true);

    if ($startIndex === false) {
        $startIndex = 0;
    }

    $count = count($playerOrder);
    for ($offset = 1; $offset <= $count; $offset++) {
        $candidate = $playerOrder[($startIndex + $offset) % $count];
        if (isset($inGameLookup[$candidate])) {
            return $candidate;
        }
    }

    return (string) $fromPlayerId;
}

function durakCardSuit(string $cardId): string
{
    return substr($cardId, -1);
}

function durakCardRank(string $cardId): string
{
    return substr($cardId, 0, -1);
}

function durakCardRankValue(string $cardId): int
{
    $values = [
        '6' => 6,
        '7' => 7,
        '8' => 8,
        '9' => 9,
        '10' => 10,
        'J' => 11,
        'Q' => 12,
        'K' => 13,
        'A' => 14,
    ];

    return $values[durakCardRank($cardId)] ?? 0;
}
