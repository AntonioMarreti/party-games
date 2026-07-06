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
    return ['status' => 'error', 'message' => 'Durak actions are not implemented yet'];
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
        'attack_limit' => (int) ($state['attack_limit'] ?? DURAK_HAND_SIZE),
        'result' => $state['result'] ?? ['loser_id' => null, 'reason' => null],
    ];
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
