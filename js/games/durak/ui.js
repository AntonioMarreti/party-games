(function () {
    const DURAK_SUITS = {
        S: { symbol: '♠', label: 'пики', tone: 'black' },
        H: { symbol: '♥', label: 'черви', tone: 'red' },
        D: { symbol: '♦', label: 'бубны', tone: 'red' },
        C: { symbol: '♣', label: 'трефы', tone: 'black' }
    };
    const DURAK_RANK_VALUES = {
        2: 2,
        3: 3,
        4: 4,
        5: 5,
        6: 6,
        7: 7,
        8: 8,
        9: 9,
        10: 10,
        J: 11,
        Q: 12,
        K: 13,
        A: 14
    };
    const DURAK_SUIT_ORDER = ['S', 'H', 'D', 'C'];
    const DURAK_HAND_SORT_STORAGE_KEY = 'party_games:durak:hand_sort_v1';
    const DURAK_HAND_SORT_VALUES = ['strength', 'suit', 'dealt'];

    function normalizeHandSort(value) {
        return DURAK_HAND_SORT_VALUES.includes(value) ? value : 'strength';
    }

    function loadHandSortPreference() {
        try {
            return normalizeHandSort(window.localStorage?.getItem(DURAK_HAND_SORT_STORAGE_KEY));
        } catch (error) {
            return 'strength';
        }
    }

    function saveHandSortPreference(value) {
        try {
            window.localStorage?.setItem(DURAK_HAND_SORT_STORAGE_KEY, normalizeHandSort(value));
        } catch (error) {
            // The preference is optional; storage failures must not affect play.
        }
    }

    const uiState = {
        selectedCardId: null,
        selectedAttackCardId: null,
        confirmingTake: false,
        confirmTakeTimer: null,
        defenseTurnKey: null,
        targetPromptActive: false,
        busy: false,
        busyAction: null,
        exitBusy: false,
        storyBusy: false,
        lastError: '',
        lastRes: null,
        currentState: null,
        previousTrickState: null,
        lastTrickResult: null,
        roleKey: null,
        setupDeckProfileId: 'durak_36',
        setupAllowThrowIn: true,
        setupAllowTransfer: false,
        setupInitialized: false,
        handSort: loadHandSortPreference(),
        handSettingsOpen: false,
        handSettingsKeydownBound: false
    };

    const resizeState = {
        observer: null,
        mutationObserver: null,
        telegramWebApp: null,
        observedElement: null,
        rafId: 0,
        listenersBound: false,
        telegramListenersBound: false,
        lastWidth: 0,
        lastHeight: 0
    };

    const dragState = {
        tracking: false,
        active: false,
        pointerId: null,
        startX: 0,
        startY: 0,
        currentX: 0,
        currentY: 0,
        cardId: null,
        cardElement: null,
        avatarElement: null,
        hoverTarget: null,
        validDefenseTargets: [],
        canAttack: false,
        canTransfer: false,
        suppressClickUntil: 0
    };

    function parseState(res) {
        const raw = res?.room?.game_state || res?.game_state;
        if (!raw) return uiState.currentState || {};
        if (typeof raw === 'string') {
            try {
                return JSON.parse(raw) || {};
            } catch (error) {
                return {};
            }
        }
        return raw;
    }

    function esc(value) {
        if (typeof window.safeHTML === 'function') return window.safeHTML(value == null ? '' : String(value));
        const div = document.createElement('div');
        div.textContent = value == null ? '' : String(value);
        return div.innerHTML;
    }

    function playerName(player) {
        return player?.display_name || player?.custom_name || player?.first_name || player?.username || 'Игрок';
    }

    function playerAvatar(player) {
        const url = player?.photo_url || player?.avatar_url || player?.avatar || '';
        if (url) {
            return `<img src="${esc(url)}" alt="">`;
        }
        const initial = playerName(player).trim().charAt(0).toUpperCase() || '?';
        return `<span>${esc(initial)}</span>`;
    }

    function getPlayer(res, id) {
        return (res.players || []).find(player => String(player.id) === String(id));
    }

    function cardRank(cardId) {
        return String(cardId || '').slice(0, -1);
    }

    function cardSuit(cardId) {
        return String(cardId || '').slice(-1);
    }

    function suitMeta(cardId) {
        return DURAK_SUITS[cardSuit(cardId)] || { symbol: '?', label: 'карта', tone: 'black' };
    }

    function getMyId(res) {
        return String(res?.user?.id || window.globalUser?.id || '');
    }

    function isHost(res) {
        return Number(res?.is_host || 0) === 1;
    }

    function isMyTurn(state, res) {
        return String(state.actor_id || '') === getMyId(res);
    }

    function isMyDefenseTurn(state, res) {
        return state.phase === 'defense'
            && isMyTurn(state, res)
            && String(state.roles?.defender_id || '') === getMyId(res);
    }

    function canAttack(state, res) {
        return state.phase === 'attack'
            && isMyTurn(state, res)
            && String(state.roles?.defender_id || '') !== getMyId(res);
    }

    function canPass(state, res) {
        return canAttack(state, res) && Array.isArray(state.table) && state.table.length > 0;
    }

    function canTake(state, res) {
        return isMyDefenseTurn(state, res) && state.defender_mode !== 'taking';
    }

    function playerHasCardsForTrick(state, res, playerId) {
        if (Number(state.draw_count || 0) > 0) return true;
        const targetId = String(playerId || '');
        if (!targetId) return false;
        if (res && targetId === getMyId(res)) {
            return Array.isArray(state.my_hand) && state.my_hand.length > 0;
        }
        const handCount = publicHandCount(state, targetId);
        return handCount === null ? true : handCount > 0;
    }

    function nextActivePlayerId(state, playerId, res = uiState.lastRes) {
        const playerOrder = (state.player_order || []).map(String);
        const activePlayers = new Set((state.in_game_players || []).map(String));
        const startIndex = playerOrder.indexOf(String(playerId));
        if (startIndex < 0 || activePlayers.size < 2) return '';

        for (let offset = 1; offset <= playerOrder.length; offset += 1) {
            const candidate = playerOrder[(startIndex + offset) % playerOrder.length];
            if (
                candidate !== String(playerId)
                && activePlayers.has(candidate)
                && playerHasCardsForTrick(state, res, candidate)
            ) {
                return candidate;
            }
        }
        return '';
    }

    function publicHandCount(state, playerId) {
        const hand = (state.opponent_hands || []).find(item => String(item.player_id) === String(playerId));
        return hand ? Number(hand.count || 0) : null;
    }

    function canTransfer(state, res) {
        if (state.rules?.allow_transfer !== true || !isMyDefenseTurn(state, res)) return false;
        if (state.defender_mode === 'taking' || !Array.isArray(state.table) || state.table.length === 0) return false;
        if (state.table.some(pair => pair?.defend)) return false;

        const nextDefenderId = nextActivePlayerId(state, getMyId(res), res);
        const nextDefenderHandCount = publicHandCount(state, nextDefenderId);
        const attackCount = state.table.length + 1;
        return nextDefenderId !== ''
            && nextDefenderHandCount !== null
            && attackCount <= 6
            && attackCount <= nextDefenderHandCount;
    }

    function isTransferCard(state, cardId) {
        const table = state.table || [];
        if (!cardId || table.length === 0) return false;
        const rank = cardRank(cardId);
        return table.every(pair => pair?.attack && cardRank(pair.attack) === rank && !pair?.defend);
    }

    function canTransferCard(state, res, cardId) {
        return canTransfer(state, res) && isTransferCard(state, cardId);
    }

    function tableHasRank(state, cardId) {
        if (!cardId) return false;
        const rank = cardRank(cardId);
        return (state.table || []).some(pair => (
            (pair?.attack && cardRank(pair.attack) === rank)
            || (pair?.defend && cardRank(pair.defend) === rank)
        ));
    }

    function canPlayAttackCard(state, res, cardId) {
        if (!cardId || !canAttack(state, res)) return false;
        const table = Array.isArray(state.table) ? state.table : [];
        const attackLimit = Number(state.attack_limit ?? 6);
        if (table.length >= attackLimit) return false;
        if (table.length === 0) {
            return String(state.roles?.attacker_id || '') === getMyId(res);
        }
        if (state.rules?.allow_throw_in === false) return false;
        return tableHasRank(state, cardId);
    }

    function isPlayerFinished(state, playerId) {
        const targetId = String(playerId || '');
        if (!targetId) return false;
        const inGame = (state.in_game_players || []).map(String);
        const finished = (state.finish_order || []).map(String);
        return !inGame.includes(targetId) && finished.includes(targetId);
    }

    function cancelTakeConfirmation() {
        uiState.confirmingTake = false;
        if (uiState.confirmTakeTimer) {
            clearTimeout(uiState.confirmTakeTimer);
            uiState.confirmTakeTimer = null;
        }
    }

    function openAttacks(state) {
        return (state.table || []).filter(pair => pair?.attack && !pair?.defend);
    }

    function allAttacksCovered(state) {
        return Array.isArray(state.table) && state.table.length > 0 && openAttacks(state).length === 0;
    }

    function isBeatContext(state) {
        return state.defender_mode !== 'taking' && allAttacksCovered(state);
    }

    function otherEligibleThrowerExists(state, res = uiState.lastRes) {
        if (state.rules?.allow_throw_in === false) return false;
        const tableCount = Array.isArray(state.table) ? state.table.length : 0;
        const attackLimit = Number(state.attack_limit ?? 6);
        if (tableCount === 0 || tableCount >= attackLimit) return false;

        const myId = getMyId(res);
        const defenderId = String(state.roles?.defender_id || '');
        const inGame = new Set((state.in_game_players || []).map(String));
        const passed = new Set((state.passed_throwers || []).map(String));

        for (const candidateId of inGame) {
            if (candidateId === myId || candidateId === defenderId) continue;
            if (passed.has(candidateId)) continue;
            const count = publicHandCount(state, candidateId);
            if (count !== null && count <= 0) continue;
            return true;
        }
        return false;
    }

    function passActionLabel(state, res = uiState.lastRes) {
        if (state.defender_mode === 'taking') return 'Не подкидывать';
        if (isBeatContext(state)) {
            return otherEligibleThrowerExists(state, res) ? 'Пас' : 'Бито';
        }
        return 'Пас';
    }

    function cardCountWord(count) {
        const value = Math.abs(Number(count || 0));
        const lastTwoDigits = value % 100;
        const lastDigit = value % 10;
        if (lastTwoDigits >= 11 && lastTwoDigits <= 14) return 'карт';
        if (lastDigit === 1) return 'карта';
        if (lastDigit >= 2 && lastDigit <= 4) return 'карты';
        return 'карт';
    }

    function tableCardCount(table) {
        return (Array.isArray(table) ? table : []).reduce((count, pair) => {
            return count + (pair?.attack ? 1 : 0) + (pair?.defend ? 1 : 0);
        }, 0);
    }

    function visibleHandCount(state, res, playerId) {
        const targetId = String(playerId || '');
        if (!targetId) return null;
        if (targetId === getMyId(res)) {
            return Array.isArray(state.my_hand) ? state.my_hand.length : null;
        }

        const hand = (state.opponent_hands || []).find(item => String(item.player_id) === targetId);
        if (!hand) return null;
        const count = Number(hand.count);
        return Number.isFinite(count) ? count : null;
    }

    function defenderName(state, res) {
        const defender = getPlayer(res, state.roles?.defender_id);
        return defender ? playerName(defender) : 'Игрок';
    }

    function trickStateSnapshot(state, res) {
        const table = Array.isArray(state.table) ? state.table : [];
        const defenderId = String(state.roles?.defender_id || '');
        const defender = getPlayer(res, defenderId);
        const discardCount = Number(state.discard_count);
        return {
            defenderId,
            defenderName: defender ? playerName(defender) : 'Игрок',
            defenderHandCount: visibleHandCount(state, res, defenderId),
            discardCount: Number.isFinite(discardCount) ? discardCount : null,
            tableCardCount: tableCardCount(table),
        };
    }

    function updateLastTrickResult(previousState, state, res) {
        const isActivePhase = state.phase === 'attack' || state.phase === 'defense';
        if (!isActivePhase) {
            uiState.previousTrickState = null;
            uiState.lastTrickResult = null;
            return;
        }

        const currentState = trickStateSnapshot(state, res);
        if (currentState.tableCardCount > 0) {
            uiState.lastTrickResult = null;
        } else if (previousState?.tableCardCount > 0) {
            const discardDelta = previousState.discardCount !== null && currentState.discardCount !== null
                ? currentState.discardCount - previousState.discardCount
                : 0;
            const currentDefenderHandCount = visibleHandCount(state, res, previousState.defenderId);
            if (discardDelta > 0) {
                const verb = discardDelta % 10 === 1 && discardDelta % 100 !== 11 ? 'ушла' : 'ушли';
                uiState.lastTrickResult = {
                    tone: 'beat',
                    text: `Бито — ${discardDelta} ${cardCountWord(discardDelta)} ${verb} в отбой`
                };
            } else if (
                previousState.defenderHandCount !== null
                && currentDefenderHandCount !== null
                && currentDefenderHandCount > previousState.defenderHandCount
            ) {
                const nextActorId = String(state.actor_id || '');
                const nextActor = !nextActorId
                    ? null
                    : nextActorId === getMyId(res)
                    ? 'Ты'
                    : getPlayer(res, nextActorId);
                uiState.lastTrickResult = {
                    tone: 'taking',
                    text: `${previousState.defenderName} забирает ${previousState.tableCardCount} ${cardCountWord(previousState.tableCardCount)}`,
                    secondaryText: nextActor
                        ? `Следующий ход: ${typeof nextActor === 'string' ? nextActor : playerName(nextActor)}`
                        : ''
                };
            } else {
                uiState.lastTrickResult = null;
            }
        }

        uiState.previousTrickState = currentState;
    }

    function durakModeLabel(state) {
        const allowThrowIn = state.rules?.allow_throw_in !== false;
        const allowTransfer = state.rules?.allow_transfer === true;
        if (allowThrowIn && allowTransfer) return 'Подкидной + переводной';
        if (allowTransfer) return 'Переводной';
        if (allowThrowIn) return 'Подкидной';
        return 'Без подкидывания и перевода';
    }

    function normalizeDeckProfileId(profileId) {
        return profileId === 'durak_52' ? 'durak_52' : 'durak_36';
    }

    function deckProfileLabel(profileId) {
        return normalizeDeckProfileId(profileId) === 'durak_52' ? '52 карты' : '36 карт';
    }

    function durakCompactMetaLabel(state) {
        const ruleLabels = [];
        if (state.rules?.allow_throw_in !== false) ruleLabels.push('подкидной');
        if (state.rules?.allow_transfer === true) ruleLabels.push('переводной');
        const rulesLabel = ruleLabels.length ? ruleLabels.join(' · ') : 'без подкидывания и перевода';
        return `${deckProfileLabel(state.deck_profile_id)} · ${rulesLabel}`;
    }

    function selectedAttackIsValid(state) {
        return openAttacks(state).some(pair => pair.attack === uiState.selectedAttackCardId);
    }

    function compatibleOpenAttacks(state, cardId) {
        if (!cardId) return [];
        const trumpSuit = state.trump?.suit || '';
        return openAttacks(state).filter(pair => canBeatCard(cardId, pair.attack, trumpSuit));
    }

    function canBeatOpenAttack(state, cardId) {
        return compatibleOpenAttacks(state, cardId).length > 0;
    }

    function canSelectAttackTarget(state, res, attackCardId) {
        if (!isMyDefenseTurn(state, res) || openAttacks(state).length <= 1) return false;
        if (!openAttacks(state).some(pair => pair.attack === attackCardId)) return false;
        return !uiState.selectedCardId
            || canBeatCard(uiState.selectedCardId, attackCardId, state.trump?.suit || '');
    }

    function selectAttackTarget(state, res, attackCardId) {
        if (!canSelectAttackTarget(state, res, attackCardId)) return false;
        cancelTakeConfirmation();
        uiState.targetPromptActive = false;
        uiState.selectedAttackCardId = uiState.selectedAttackCardId === attackCardId ? null : attackCardId;
        return true;
    }

    function selectHandCard(state, res, cardId) {
        cancelTakeConfirmation();
        uiState.targetPromptActive = false;
        if (uiState.selectedCardId === cardId) {
            uiState.selectedCardId = null;
            return;
        }

        uiState.selectedCardId = cardId;
        if (
            isMyDefenseTurn(state, res)
            && selectedAttackIsValid(state)
            && !canBeatCard(cardId, uiState.selectedAttackCardId, state.trump?.suit || '')
        ) {
            uiState.selectedAttackCardId = null;
        }
    }

    function cardCopy(cardId) {
        const meta = suitMeta(cardId);
        return `${cardRank(cardId)}${meta.symbol}`;
    }

    function cardRankValue(cardId) {
        return DURAK_RANK_VALUES[cardRank(cardId)] || 0;
    }

    function sortedHandCards(state) {
        const trumpSuit = String(state.trump?.suit || '');
        const sortMode = normalizeHandSort(uiState.handSort);
        const cards = [...(state.my_hand || [])];
        const indexedCards = cards.map((cardId, dealtIndex) => ({ cardId, dealtIndex }));

        if (sortMode === 'strength') {
            indexedCards.sort((left, right) => {
                const leftTrump = cardSuit(left.cardId) === trumpSuit;
                const rightTrump = cardSuit(right.cardId) === trumpSuit;
                if (leftTrump !== rightTrump) return leftTrump ? -1 : 1;

                const rankDifference = cardRankValue(right.cardId) - cardRankValue(left.cardId);
                if (rankDifference !== 0) return rankDifference;

                const suitDifference = DURAK_SUIT_ORDER.indexOf(cardSuit(left.cardId))
                    - DURAK_SUIT_ORDER.indexOf(cardSuit(right.cardId));
                return suitDifference || left.dealtIndex - right.dealtIndex;
            });
        } else if (sortMode === 'suit') {
            const suitOrder = [trumpSuit, ...DURAK_SUIT_ORDER.filter(suit => suit !== trumpSuit)]
                .filter((suit, index, allSuits) => suit && allSuits.indexOf(suit) === index);
            indexedCards.sort((left, right) => {
                const suitDifference = suitOrder.indexOf(cardSuit(left.cardId))
                    - suitOrder.indexOf(cardSuit(right.cardId));
                if (suitDifference !== 0) return suitDifference;

                const rankDifference = cardRankValue(right.cardId) - cardRankValue(left.cardId);
                return rankDifference || left.dealtIndex - right.dealtIndex;
            });
        }

        return indexedCards.map((item, index, sortedCards) => {
            const previousCardId = index > 0 ? sortedCards[index - 1].cardId : '';
            const startsStrengthGroup = sortMode === 'strength'
                && previousCardId
                && cardSuit(previousCardId) === trumpSuit
                && cardSuit(item.cardId) !== trumpSuit;
            const startsSuitGroup = sortMode === 'suit'
                && previousCardId
                && cardSuit(previousCardId) !== cardSuit(item.cardId);
            return {
                cardId: item.cardId,
                isGroupStart: Boolean(startsStrengthGroup || startsSuitGroup)
            };
        });
    }

    function canBeatCard(defenseCardId, attackCardId, trumpSuit) {
        const defenseSuit = cardSuit(defenseCardId);
        const attackSuit = cardSuit(attackCardId);
        if (defenseSuit === attackSuit) {
            return cardRankValue(defenseCardId) > cardRankValue(attackCardId);
        }
        return defenseSuit === trumpSuit && attackSuit !== trumpSuit;
    }

    function defenseTargetCard(state, res, cardId = uiState.selectedCardId) {
        if (!isMyDefenseTurn(state, res)) return '';
        const attacks = openAttacks(state);
        if (attacks.length === 1) return attacks[0].attack || '';
        if (selectedAttackIsValid(state)) {
            if (!cardId || canBeatCard(cardId, uiState.selectedAttackCardId, state.trump?.suit || '')) {
                return uiState.selectedAttackCardId;
            }
        }
        if (cardId) {
            const compatible = compatibleOpenAttacks(state, cardId);
            if (compatible.length === 1) return compatible[0].attack || '';
        }
        return '';
    }

    function canUseDefenseCard(state, res, cardId) {
        if (!cardId) return false;
        const attackCardId = defenseTargetCard(state, res, cardId);
        if (!attackCardId) return false;
        return canBeatCard(cardId, attackCardId, state.trump?.suit || '');
    }

    function hasDefenseOrTransferOption(state, res) {
        if (!isMyDefenseTurn(state, res)) return false;
        const hand = Array.isArray(state.my_hand) ? state.my_hand : [];
        return hand.some(cardId => canBeatOpenAttack(state, cardId) || canTransferCard(state, res, cardId));
    }

    function compactStatusCopy(state, res) {
        if (state.phase === 'setup') return 'Настройка';
        if (state.phase === 'finished') return 'Финал';

        const myId = getMyId(res);
        if (isPlayerFinished(state, myId)) return 'Ты вышел';

        if (isMyDefenseTurn(state, res)) return 'Твой ход · защита';
        if (isMyTurn(state, res)) {
            if (state.defender_mode === 'taking') return 'Твой ход · подкинь';
            if (isBeatContext(state)) return 'Твой ход · решение';
            return (state.table || []).length ? 'Твой ход · подкинь' : 'Твой ход · атака';
        }

        if (state.defender_mode === 'taking') {
            return String(state.roles?.defender_id || '') === myId ? 'Берёшь · ждём' : 'Ждём подкидывание';
        }
        if (isBeatContext(state)) {
            return 'Ждём подкидывание';
        }
        if (state.phase === 'defense') {
            return 'Ждём защиту';
        }
        return (state.table || []).length ? 'Ждём подкидывание' : 'Ход соперника';
    }

    function renderShell(container) {
        let shell = document.getElementById('durak-shell');
        if (!shell) {
            container.innerHTML = '';
            shell = document.createElement('div');
            shell.id = 'durak-shell';
            shell.className = 'durak-shell';
            shell.innerHTML = `
                <div class="durak-top">
                    <div class="durak-top-balance" aria-hidden="true"></div>
                    <h2 class="durak-title">Дурак</h2>
                    <div class="durak-top-actions">
                        <div class="durak-status-pill" id="durak-status-pill"></div>
                    </div>
                    <div class="durak-game-meta" id="durak-mode-label"></div>
                </div>
                <div class="durak-error" id="durak-error" hidden></div>
                <div class="durak-board" id="durak-board"></div>
                <div class="durak-hand-shell" id="durak-hand-shell"></div>
                <div class="durak-hand-settings-layer" id="durak-hand-settings-layer" aria-hidden="true" inert>
                    <button type="button" class="durak-hand-settings-backdrop" data-action="close-hand-settings" aria-label="Закрыть параметры"></button>
                    <section class="durak-hand-settings-sheet" role="dialog" aria-modal="true" aria-labelledby="durak-hand-settings-title">
                        <div class="durak-hand-settings-head">
                            <h3 id="durak-hand-settings-title">Параметры</h3>
                            <button type="button" class="durak-hand-settings-close" data-action="close-hand-settings" aria-label="Закрыть параметры">
                                <i class="bi bi-x-lg" aria-hidden="true"></i>
                            </button>
                        </div>
                        <div class="durak-hand-settings-label">Сортировка руки</div>
                        <div class="durak-hand-settings-options" role="radiogroup" aria-label="Сортировка карт">
                            <button type="button" class="durak-hand-settings-option" data-hand-sort-option="strength" role="radio">
                                <span class="durak-hand-settings-radio" aria-hidden="true"><i class="bi bi-check"></i></span>
                                <span>По силе</span>
                            </button>
                            <button type="button" class="durak-hand-settings-option" data-hand-sort-option="suit" role="radio">
                                <span class="durak-hand-settings-radio" aria-hidden="true"><i class="bi bi-check"></i></span>
                                <span>По мастям</span>
                            </button>
                            <button type="button" class="durak-hand-settings-option" data-hand-sort-option="dealt" role="radio">
                                <span class="durak-hand-settings-radio" aria-hidden="true"><i class="bi bi-check"></i></span>
                                <span>Как пришли</span>
                            </button>
                        </div>
                        <p class="durak-hand-settings-help">Порядок сохраняется на этом устройстве.</p>
                        <div class="durak-hand-settings-danger" id="durak-exit-section" hidden>
                            <div class="durak-hand-settings-label">Партия</div>
                            <p class="durak-hand-settings-warning" id="durak-exit-note"></p>
                            <button type="button" class="durak-exit-btn" id="durak-exit-btn" hidden></button>
                        </div>
                    </section>
                </div>
            `;
            container.appendChild(shell);
        }
        if (!uiState.handSettingsKeydownBound) {
            document.addEventListener('keydown', handleHandSettingsKeydown);
            uiState.handSettingsKeydownBound = true;
        }
        return shell;
    }

    function handleHandSettingsKeydown(event) {
        if (event.key !== 'Escape' || !uiState.handSettingsOpen) return;
        const shell = document.getElementById('durak-shell');
        if (!shell) return;
        closeHandSettings(shell, true);
    }

    function syncHandSettingsLayer(shell) {
        const layer = shell.querySelector('#durak-hand-settings-layer');
        document.body?.classList?.toggle('durak-settings-open', Boolean(uiState.handSettingsOpen));
        if (!layer) return;

        layer.classList.toggle('is-open', uiState.handSettingsOpen);
        layer.setAttribute('aria-hidden', uiState.handSettingsOpen ? 'false' : 'true');
        layer.inert = !uiState.handSettingsOpen;
        layer.querySelectorAll('[data-hand-sort-option]').forEach(button => {
            const selected = normalizeHandSort(button.dataset.handSortOption) === uiState.handSort;
            button.classList.toggle('is-selected', selected);
            button.setAttribute('aria-checked', selected ? 'true' : 'false');
        });
    }

    function closeHandSettings(shell, restoreFocus = false) {
        uiState.handSettingsOpen = false;
        syncHandSettingsLayer(shell);
        if (restoreFocus) {
            const settingsButton = shell.querySelector('[data-action="open-hand-settings"]');
            if (settingsButton) settingsButton.focus({ preventScroll: true });
        }
    }

    function renderCard(cardId, options = {}) {
        const meta = suitMeta(cardId);
        const classes = [
            'durak-card',
            `is-${meta.tone}`,
            options.small ? 'is-small' : '',
            options.selected ? 'is-selected' : '',
            options.ghost ? 'is-ghost' : '',
            options.defend ? 'is-defense-card' : '',
            options.muted ? 'is-muted' : '',
            options.defendable ? 'is-defendable' : '',
            options.waitingTarget ? 'is-waiting-target' : '',
            options.trump ? 'is-trump' : '',
            options.groupStart ? 'is-group-start' : ''
        ].filter(Boolean).join(' ');
        const cardStyle = Number.isInteger(options.stackIndex)
            ? ` style="--durak-card-index: ${options.stackIndex}"`
            : '';
        const attrs = options.button
            ? `button type="button" ${options.disabled ? 'disabled' : ''} data-card-id="${esc(cardId)}" class="${classes}"${cardStyle}`
            : `div class="${classes}"${cardStyle}`;
        const endTag = options.button ? 'button' : 'div';

        return `
            <${attrs} aria-label="${esc(cardRank(cardId) + ' ' + meta.label)}">
                <span class="durak-card-corner">
                    <span class="durak-card-corner-rank">${esc(cardRank(cardId))}</span>
                    <span class="durak-card-corner-suit">${esc(meta.symbol)}</span>
                </span>
                <span class="durak-card-center-suit" aria-hidden="true">${esc(meta.symbol)}</span>
                <span class="durak-card-corner is-bottom" aria-hidden="true">
                    <span class="durak-card-corner-rank">${esc(cardRank(cardId))}</span>
                    <span class="durak-card-corner-suit">${esc(meta.symbol)}</span>
                </span>
            </${endTag}>
        `;
    }

    function renderPlayers(res, state) {
        const myId = getMyId(res);
        const opponents = (res.players || []).filter(player => String(player.id) !== myId);
        const handCounts = new Map((state.opponent_hands || []).map(item => [String(item.player_id), Number(item.count || 0)]));
        const passedSet = new Set((state.passed_throwers || []).map(String));

        if (!opponents.length) {
            return '<div class="durak-empty-line">Ожидаем соперников</div>';
        }

        return opponents.map(player => {
            const id = String(player.id);
            const active = String(state.actor_id || '') === id;
            const defender = String(state.roles?.defender_id || '') === id;
            const attacker = String(state.roles?.attacker_id || '') === id;
            const finished = isPlayerFinished(state, id);
            const handCount = handCounts.get(id) || 0;
            let playerStatus = '';
            if (finished) {
                playerStatus = 'вышел';
            } else if (defender) {
                playerStatus = state.defender_mode === 'taking'
                    ? 'берёт карты'
                    : (active ? 'отбивается' : 'защищается');
            } else if (active) {
                playerStatus = (state.table || []).length ? 'подкидывает' : 'атакует';
            } else if (attacker) {
                playerStatus = 'атакует';
            } else if (passedSet.has(id)) {
                playerStatus = 'пас';
            }
            return `
                <div class="durak-seat ${active ? 'is-active' : ''} ${defender ? 'is-defender' : ''} ${attacker && !defender ? 'is-attacker' : ''} ${finished ? 'is-finished-player' : ''}">
                    <div class="durak-avatar">${playerAvatar(player)}</div>
                    <div class="durak-seat-copy">
                        <div class="durak-seat-name">${esc(playerName(player))}</div>
                        <div class="durak-seat-meta">${handCount} ${cardCountWord(handCount)}${playerStatus ? ` · ${playerStatus}` : ''}</div>
                    </div>
                </div>
            `;
        }).join('');
    }

    function formatBotActionSummary(state, res) {
        const rawSteps = Array.isArray(state.last_bot_actions) ? state.last_bot_actions : [];
        if (!rawSteps.length) return '';

        const steps = rawSteps.slice(-4);
        const parts = [];
        let lastPlayerId = '';
        steps.forEach(step => {
            if (!step || typeof step !== 'object') return;
            const pid = String(step.player_id || '');
            const player = getPlayer(res, pid);
            const name = player ? playerName(player) : 'Бот';
            const prefix = pid && pid === lastPlayerId ? '' : `${name}: `;
            let actionText = '';
            if (step.type === 'open_attack' && step.card_id) {
                actionText = `ход ${cardCopy(step.card_id)}`;
            } else if (step.type === 'attack_card' && step.card_id) {
                actionText = `подкид ${cardCopy(step.card_id)}`;
            } else if (step.type === 'defend_card' && step.card_id && step.attack_card_id) {
                actionText = `отбил ${cardCopy(step.card_id)} → ${cardCopy(step.attack_card_id)}`;
            } else if (step.type === 'transfer_card' && step.card_id) {
                actionText = `перевёл ${cardCopy(step.card_id)} ⇄`;
            } else if (step.type === 'take_cards') {
                actionText = 'берёт карты';
            } else if (step.type === 'pass_throw_in') {
                actionText = 'пас';
            }
            if (actionText) {
                parts.push(`${prefix}${actionText}`);
                lastPlayerId = pid;
            }
        });

        return parts.join(' · ');
    }

    function defenseStatusCopy(state, res) {
        if (!isMyDefenseTurn(state, res)) return '';
        const attacks = openAttacks(state);
        if (attacks.length <= 1) return '';
        if (selectedAttackIsValid(state)) return `Бьёшь ${cardCopy(uiState.selectedAttackCardId)}`;
        if (uiState.selectedCardId) {
            const resolvedTarget = defenseTargetCard(state, res, uiState.selectedCardId);
            if (resolvedTarget) {
                return `Бьёшь ${cardCopy(resolvedTarget)} картой ${cardCopy(uiState.selectedCardId)}`;
            }
            if (canBeatOpenAttack(state, uiState.selectedCardId)) {
                return uiState.targetPromptActive
                    ? 'Нажми на открытую карту на столе, которую хочешь побить'
                    : 'Выбери на столе карту, которую побить';
            }
            if (canTransferCard(state, res, uiState.selectedCardId)) {
                return 'Можно перевести выбранную карту';
            }
        }
        return 'Выбери карту защиты или цель на столе';
    }

    function renderTable(state, res) {
        const table = state.table || [];
        const botSummary = formatBotActionSummary(state, res);
        const botFeedHtml = botSummary ? `<div class="durak-bot-feed" role="status">${esc(botSummary)}</div>` : '';
        if (!table.length) {
            const result = uiState.lastTrickResult;
            if (result) {
                return `
                    <div class="durak-table-empty is-trick-result is-${esc(result.tone)}" role="status">
                        <div class="durak-empty-title">${esc(result.text)}</div>
                        ${result.secondaryText ? `<div class="durak-empty-subtitle">${esc(result.secondaryText)}</div>` : ''}
                        ${botFeedHtml}
                    </div>
                `;
            }
            return `
                <div class="durak-table-empty">
                    <div class="durak-empty-title">Стол пуст</div>
                    ${botFeedHtml}
                </div>
            `;
        }

        const statusText = defenseStatusCopy(state, res);
        return `
            <div class="durak-table-stage">
                ${botFeedHtml}
                ${statusText ? `<div class="durak-defense-status${uiState.targetPromptActive ? ' is-prompting' : ''}">${esc(statusText)}</div>` : ''}
                <div class="durak-table-grid">
                    ${table.map(pair => {
                        const open = pair.attack && !pair.defend;
                        const selected = uiState.selectedAttackCardId === pair.attack;
                        const targetSelectionActive = open && isMyDefenseTurn(state, res) && openAttacks(state).length > 1;
                        const canSelect = targetSelectionActive && canSelectAttackTarget(state, res, pair.attack);
                        const compatibleTarget = targetSelectionActive
                            && Boolean(uiState.selectedCardId)
                            && canBeatCard(uiState.selectedCardId, pair.attack, state.trump?.suit || '');
                        return `
                            <button type="button"
                                class="durak-trick ${open ? 'is-open' : ''} ${selected ? 'is-selected' : ''} ${pair.defend ? 'is-covered' : ''} ${compatibleTarget ? 'is-defendable-target' : ''} ${uiState.targetPromptActive && compatibleTarget ? 'is-prompt-target' : ''} ${targetSelectionActive && !canSelect ? 'is-unavailable-target' : ''}"
                                data-attack-card="${esc(pair.attack || '')}"
                                aria-pressed="${selected ? 'true' : 'false'}"
                                ${canSelect ? '' : 'disabled'}>
                                <span class="durak-trick-cards">
                                    ${pair.attack ? renderCard(pair.attack, { small: true }) : ''}
                                    ${pair.defend ? renderCard(pair.defend, { small: true, defend: true }) : '<span class="durak-card-slot">Защита</span>'}
                                </span>
                                ${canSelect ? `<span class="durak-trick-prompt">${uiState.selectedCardId ? 'Нажми, чтобы побить' : 'Выбрать эту атаку'}</span>` : ''}
                            </button>
                        `;
                    }).join('')}
                </div>
                <div class="durak-transfer-zone" id="durak-transfer-zone" data-drop-zone="transfer">
                    <span class="durak-transfer-zone-icon" aria-hidden="true">⇄</span>
                    <span class="durak-transfer-zone-text">Перевести</span>
                </div>
            </div>
        `;
    }

    function renderDeck(state) {
        const trump = state.trump || {};
        const drawCount = Number(state.draw_count || 0);
        const discardCount = Number(state.discard_count || 0);
        const trumpMeta = DURAK_SUITS[String(trump.suit || '')] || null;
        const deckVisual = drawCount > 0
            ? `
                <div class="durak-card-back" aria-hidden="true"></div>
                <div class="durak-deck-badge" aria-hidden="true">${drawCount}</div>
            `
            : '<div class="durak-deck-empty" aria-hidden="true"><span></span></div>';
        const trumpVisual = drawCount > 0 && trump.card
            ? renderCard(trump.card, { small: true })
            : trumpMeta
                ? `<div class="durak-trump-suit is-${esc(trumpMeta.tone)}" aria-hidden="true">${esc(trumpMeta.symbol)}</div>`
                : '<div class="durak-card-slot" aria-label="Козырь не определён">-</div>';
        return `
            <div class="durak-deck-row" aria-label="Колода, козырь и сброс">
                <div class="durak-deck durak-deck-section" aria-label="${drawCount > 0 ? `${drawCount} ${cardCountWord(drawCount)} в колоде` : 'Колода пуста, последняя козырная карта забрана'}">
                    <div class="durak-deck-visual">
                        ${deckVisual}
                    </div>
                    <div class="durak-deck-label">${drawCount > 0 ? 'в колоде' : 'карт нет'}</div>
                </div>
                <div class="durak-trump durak-deck-section" aria-label="${trumpMeta ? `Козырная масть: ${trumpMeta.label}` : 'Козырь не определён'}">
                    <div class="durak-deck-visual">
                        ${trumpVisual}
                    </div>
                    <div class="durak-deck-label">${trumpMeta && drawCount === 0 ? `козырь · ${esc(trumpMeta.label)}` : 'козырь'}</div>
                </div>
                <div class="durak-discard durak-deck-section" aria-label="${discardCount} ${cardCountWord(discardCount)} в сбросе">
                    <div class="durak-deck-visual durak-discard-visual" aria-hidden="true">
                        <div class="durak-discard-count">${discardCount}</div>
                    </div>
                    <div class="durak-deck-label">сброс</div>
                </div>
            </div>
        `;
    }

    function playerNameById(res, id) {
        const myId = getMyId(res);
        if (String(id) === myId) return 'Ты';
        const player = getPlayer(res, id);
        return player ? playerName(player) : 'Игрок вышел';
    }

    function finalTitle(state, res) {
        const myId = getMyId(res);
        const loserId = state.result?.loser_id == null ? '' : String(state.result.loser_id);

        if (state.result?.reason === 'all_finished' || !loserId) {
            return 'Партия завершилась без проигравшего';
        }
        if (loserId === myId) return 'Ты остался дураком';

        const loserName = playerNameById(res, loserId);
        return `${loserName} остался дураком`;
    }

    function finalSubtitle(state, res) {
        const myId = getMyId(res);
        const playerOrder = (state.player_order || []).map(String);
        const finishOrder = (state.finish_order || []).map(String);
        const loserId = state.result?.loser_id == null ? '' : String(state.result.loser_id);

        if (!playerOrder.includes(myId)) return 'Ты уже вышел из этой партии.';
        if (state.result?.reason === 'all_finished' || !loserId) return 'Все игроки избавились от карт.';
        if (loserId === myId) return 'У остальных игроков карты закончились раньше.';
        if (finishOrder.includes(myId)) return 'Ты победил и вышел из партии раньше проигравшего.';
        return 'Партия закончена.';
    }

    function renderFinishOrder(state, res) {
        const finishOrder = (state.finish_order || []).map(String);
        if ((state.player_order || []).length < 3 || !finishOrder.length) return '';

        return `
            <div class="durak-final-order">
                <div class="durak-final-section-title">Порядок выхода</div>
                <ol>
                    ${finishOrder.map(playerId => `
                        <li>
                            <span class="durak-final-place">${esc(playerNameById(res, playerId))}</span>
                        </li>
                    `).join('')}
                </ol>
            </div>
        `;
    }

    function renderFinalCardsSummary(state, res) {
        const handCounts = new Map((state.opponent_hands || []).map(item => [String(item.player_id), Number(item.count || 0)]));
        const myId = getMyId(res);
        handCounts.set(myId, Array.isArray(state.my_hand) ? state.my_hand.length : 0);
        const ids = (state.player_order || []).map(String);
        if (!ids.length) return '';

        return `
            <div class="durak-final-hands">
                <div class="durak-final-section-title">Карты на руках</div>
                <div class="durak-final-hand-list">
                    ${ids.map(playerId => `
                        <div class="durak-final-hand-row">
                            <span>${esc(playerNameById(res, playerId))}</span>
                            <strong>${Number(handCounts.get(playerId) || 0)}</strong>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    function rematchRequesterIds(state) {
        return [...new Set((state.rematch_requests || []).map(String).filter(Boolean))];
    }

    function renderRematchOffer(state, res) {
        const requesterIds = rematchRequesterIds(state);
        if (!requesterIds.length) return '';

        const copy = requesterIds.length === 1
            ? `${playerNameById(res, requesterIds[0])} предлагает реванш`
            : `${requesterIds.length} игрока хотят реванш`;
        const startBusy = uiState.busy && uiState.busyAction === 'start_rematch';
        const declineBusy = uiState.busy && uiState.busyAction === 'decline_rematch';

        return `
            <div class="durak-rematch-offer">
                <div class="durak-rematch-offer-copy">${esc(copy)}</div>
                <div class="durak-rematch-offer-actions">
                    <button type="button" class="durak-rematch-small-btn is-accept" data-action="start-rematch" ${uiState.busy ? 'disabled' : ''}>
                        ${startBusy ? 'Начинаем…' : 'Принять'}
                    </button>
                    <button type="button" class="durak-rematch-small-btn is-decline" data-action="decline-rematch" ${uiState.busy ? 'disabled' : ''}>
                        ${declineBusy ? 'Отклоняем…' : 'Отклонить'}
                    </button>
                </div>
            </div>
        `;
    }

    function renderFinalActions(state, res) {
        const isHost = Number(res?.is_host || 0) === 1;
        const myRequestSent = rematchRequesterIds(state).includes(getMyId(res));
        const startBusy = uiState.busy && uiState.busyAction === 'start_rematch';
        const requestBusy = uiState.busy && uiState.busyAction === 'request_rematch';
        const canReturn = isHost && typeof window.finishGameSession === 'function';
        const canLeave = !isHost && typeof window.leaveRoom === 'function';

        return `
            <div class="durak-final-actions">
                ${isHost ? renderRematchOffer(state, res) : ''}
                ${isHost ? `
                    <button type="button" class="durak-action-btn durak-rematch-btn" data-action="start-rematch" ${uiState.busy ? 'disabled' : ''}>
                        ${startBusy ? 'Начинаем…' : 'Реванш'}
                    </button>
                ` : `
                    <button type="button" class="durak-action-btn durak-rematch-btn" data-action="request-rematch" ${uiState.busy || myRequestSent ? 'disabled' : ''}>
                        ${requestBusy ? 'Отправляем…' : myRequestSent ? 'Предложение отправлено' : 'Предложить реванш'}
                    </button>
                `}
                <button type="button" class="durak-action-btn durak-story-btn" data-action="share-story" ${uiState.busy || uiState.storyBusy ? 'disabled' : ''}>
                    ${uiState.storyBusy ? 'Готовим…' : 'Поделиться в истории'}
                </button>
                ${canReturn ? `
                    <button type="button" class="durak-action-btn durak-return-btn" data-action="return-room" ${uiState.busy || uiState.exitBusy ? 'disabled' : ''}>
                        Вернуться в комнату
                    </button>
                ` : ''}
                ${canLeave ? `
                    <button type="button" class="durak-action-btn durak-return-btn" data-action="leave-room" ${uiState.busy || uiState.exitBusy ? 'disabled' : ''}>
                        Выйти из комнаты
                    </button>
                ` : ''}
            </div>
        `;
    }

    function renderFinalScreen(state, res) {
        return `
            <div class="durak-final-screen">
                <div class="durak-final-hero">
                    <div class="durak-final-kicker">Финал</div>
                    <div class="durak-final-title">${esc(finalTitle(state, res))}</div>
                    <div class="durak-final-subtitle">${esc(finalSubtitle(state, res))}</div>
                </div>
                <div class="durak-final-grid">
                    ${renderFinishOrder(state, res)}
                    ${renderFinalCardsSummary(state, res)}
                </div>
                ${renderFinalActions(state, res)}
            </div>
        `;
    }

    function initializeSetupState(state) {
        if (state.phase === 'setup') {
            if (!uiState.setupInitialized) {
                uiState.setupDeckProfileId = normalizeDeckProfileId(state.deck_profile_id);
                uiState.setupAllowThrowIn = state.rules?.allow_throw_in !== false;
                uiState.setupAllowTransfer = state.rules?.allow_transfer === true;
                uiState.setupInitialized = true;
            }
            return;
        }

        if (uiState.setupInitialized) {
            uiState.setupDeckProfileId = 'durak_36';
            uiState.setupAllowThrowIn = true;
            uiState.setupAllowTransfer = false;
            uiState.setupInitialized = false;
        }
    }

    function renderSetupSwitch(name, title, description, checked) {
        return `
            <label class="durak-setup-option">
                <span class="durak-setup-option-copy">
                    <span class="durak-setup-option-title">${esc(title)}</span>
                    <span class="durak-setup-option-description">${esc(description)}</span>
                </span>
                <span class="durak-setup-switch">
                    <input type="checkbox" role="switch" data-setup-rule="${esc(name)}" ${checked ? 'checked' : ''}>
                    <span class="durak-setup-switch-track" aria-hidden="true"></span>
                </span>
            </label>
        `;
    }

    function renderSetupDeckProfile(profileId, label) {
        const selected = uiState.setupDeckProfileId === profileId;
        return `
            <label class="durak-setup-deck-option">
                <input type="radio" name="durak-setup-deck-profile"
                    data-setup-deck-profile="${esc(profileId)}"
                    ${selected ? 'checked' : ''}
                    ${uiState.busy ? 'disabled' : ''}>
                <span>${esc(label)}</span>
            </label>
        `;
    }

    function renderSetupScreen(res) {
        const isHost = Number(res?.is_host || 0) === 1;
        if (!isHost) {
            return `
                <div class="durak-setup-screen is-guest">
                    <div class="durak-setup-intro">
                        <div class="durak-setup-game">Дурак</div>
                        <div class="durak-setup-title">Настройка партии</div>
                        <div class="durak-setup-description">Хост выбирает колоду и правила</div>
                    </div>
                    <div class="durak-setup-waiting" role="status">
                        Ожидаем начала партии
                    </div>
                    <button type="button" class="durak-setup-return" data-action="leave-room" ${uiState.exitBusy ? 'disabled aria-busy="true"' : ''}>
                        Выйти из комнаты
                    </button>
                </div>
            `;
        }

        return `
            <div class="durak-setup-screen">
                <div class="durak-setup-intro">
                    <div class="durak-setup-game">Дурак</div>
                    <div class="durak-setup-title">Настройка партии</div>
                    <div class="durak-setup-description">Выбери колоду и правила перед раздачей.</div>
                </div>
                <fieldset class="durak-setup-deck">
                    <legend>Колода</legend>
                    <div class="durak-setup-deck-options">
                        ${renderSetupDeckProfile('durak_36', '36 карт')}
                        ${renderSetupDeckProfile('durak_52', '52 карты')}
                    </div>
                </fieldset>
                <div class="durak-setup-options">
                    ${renderSetupSwitch('allow_throw_in', 'Подкидывание', 'Можно добавлять карты совпадающего ранга.', uiState.setupAllowThrowIn)}
                    ${renderSetupSwitch('allow_transfer', 'Перевод', 'Защищающийся может перевести атаку дальше.', uiState.setupAllowTransfer)}
                </div>
                <div class="durak-setup-actions">
                    <button type="button" class="durak-action-btn durak-setup-start" data-action="start-match" ${uiState.busy ? 'disabled aria-busy="true"' : ''}>
                        ${uiState.busy ? 'Начинаем...' : 'Начать партию'}
                    </button>
                    <button type="button" class="durak-setup-return" data-action="return-room" ${uiState.busy ? 'disabled' : ''}>
                        Вернуться в комнату
                    </button>
                </div>
            </div>
        `;
    }

    function myRoleTitle(state, res) {
        const myId = getMyId(res);
        if (isPlayerFinished(state, myId)) return 'Твоя рука · ты вышел';
        if (String(state.roles?.defender_id || '') === myId) {
            return state.defender_mode === 'taking'
                ? 'Твоя рука · берёшь карты'
                : 'Твоя рука · ты защищаешься';
        }
        if (canAttack(state, res)) {
            return (state.table || []).length
                ? 'Твоя рука · твой подкид'
                : 'Твоя рука · твоя атака';
        }
        if (String(state.roles?.attacker_id || '') === myId) {
            return 'Твоя рука · ты атакуешь';
        }
        return 'Твоя рука';
    }

    function buildActionHint(state, res, cards) {
        const myId = getMyId(res);
        if (isPlayerFinished(state, myId)) {
            return 'Ты уже вышел из партии — остальные доигрывают';
        }

        const defenseTurn = isMyDefenseTurn(state, res);
        const defenseTarget = defenseTargetCard(state, res);
        const needsDefenseTarget = defenseTurn && openAttacks(state).length > 1 && !defenseTarget;
        const transferAvailable = canTransfer(state, res);

        if (defenseTurn) {
            if (uiState.confirmingTake) {
                return 'Подтверди взятие карт или нажми «Отмена»';
            }
            if (!hasDefenseOrTransferOption(state, res)) {
                return 'Нечем отбиться — нажми «Взять»';
            }
            if (uiState.selectedCardId) {
                const selectedCopy = cardCopy(uiState.selectedCardId);
                const resolvedTarget = defenseTargetCard(state, res, uiState.selectedCardId);
                const canTransferSelected = canTransferCard(state, res, uiState.selectedCardId);
                const canBeatSelected = canBeatOpenAttack(state, uiState.selectedCardId);
                if (canBeatSelected && !resolvedTarget) {
                    return 'Нажми на открытую карту на столе, которую хочешь побить';
                }
                if (resolvedTarget && canTransferSelected) {
                    return `Нажми «Отбиться ${selectedCopy}» или «Перевести ${selectedCopy}»`;
                }
                if (resolvedTarget) {
                    return `Нажми «Отбиться ${selectedCopy}»`;
                }
                if (canTransferSelected) {
                    return `Нажми «Перевести ${selectedCopy}»`;
                }
            }
            if (transferAvailable) {
                return 'Выбери подсвеченную карту: отбиться, перевести или взять';
            }
            if (needsDefenseTarget) {
                return 'Выбери подсвеченную карту защиты или цель на столе';
            }
            return 'Выбери подсвеченную карту защиты или нажми «Взять»';
        }

        if (canAttack(state, res)) {
            const hasTable = (state.table || []).length > 0;
            if (!hasTable) {
                return uiState.selectedCardId
                    ? `Нажми «Сходить ${cardCopy(uiState.selectedCardId)}»`
                    : 'Выбери любую карту и нажми «Сходить»';
            }
            const passLabel = passActionLabel(state, res);
            if (uiState.selectedCardId && canPlayAttackCard(state, res, uiState.selectedCardId)) {
                return `Нажми «Подкинуть ${cardCopy(uiState.selectedCardId)}» или «${passLabel}»`;
            }
            const hasPlayableThrowIn = cards.some(cardId => canPlayAttackCard(state, res, cardId));
            if (!hasPlayableThrowIn) {
                return `Нет карт подходящего ранга — нажми «${passLabel}»`;
            }
            if (state.defender_mode === 'taking') {
                return `Соперник берёт: подкинь карту того же ранга или нажми «${passLabel}»`;
            }
            return `Подкинь карту ранга со стола или нажми «${passLabel}»`;
        }

        const currentDefenderName = defenderName(state, res);
        const actorName = state.actor_id ? playerNameById(res, state.actor_id) : 'Соперник';
        if (state.defender_mode === 'taking') {
            return String(state.roles?.defender_id || '') === myId
                ? 'Ты забираешь карты — соперники решают, подкинуть ли ещё'
                : `${currentDefenderName} забирает карты — ждём подкидывание`;
        }
        if (state.phase === 'defense') {
            return `${currentDefenderName} выбирает защиту`;
        }
        if (isBeatContext(state)) {
            return `Карты отбиты — ${actorName} решает, подкинуть ли ещё`;
        }
        return `Ходит ${actorName}`;
    }

    function renderHand(state, res) {
        const cards = [...(state.my_hand || [])];
        const sortedCards = sortedHandCards(state);
        if (state.phase === 'finished') return '';

        const defenseTurn = isMyDefenseTurn(state, res);
        const attackTurn = canAttack(state, res);
        const defenseTarget = defenseTargetCard(state, res);
        const needsDefenseTarget = defenseTurn && openAttacks(state).length > 1 && !defenseTarget;
        const disabled = !isMyTurn(state, res) || uiState.busy || state.phase === 'finished';
        const actionHint = buildActionHint(state, res, cards);

        return `
            <div class="durak-hand-head">
                <div class="durak-hand-copy">
                    <div class="durak-hand-title">${esc(myRoleTitle(state, res))}</div>
                    <div class="durak-hand-hint">${esc(actionHint)}</div>
                </div>
                <div class="durak-hand-tools">
                    <button type="button" class="durak-hand-settings-btn" data-action="open-hand-settings" aria-label="Параметры партии" title="Параметры партии">
                        <i class="bi bi-gear" aria-hidden="true"></i>
                    </button>
                    <div class="durak-hand-count">${cards.length}</div>
                </div>
            </div>
            <div class="durak-hand" role="list">
                <div class="durak-hand-strip">
                ${sortedCards.map(({ cardId, isGroupStart }, stackIndex) => {
                    const defensePlayable = defenseTurn && (
                        canUseDefenseCard(state, res, cardId)
                        || (needsDefenseTarget && canBeatOpenAttack(state, cardId))
                    );
                    const transferPlayable = defenseTurn && canTransferCard(state, res, cardId);
                    const defenseMuted = defenseTurn && !defensePlayable && !transferPlayable;
                    const attackPlayable = attackTurn && canPlayAttackCard(state, res, cardId);
                    const attackMuted = attackTurn && !attackPlayable;
                    const cardMuted = defenseMuted || attackMuted;
                    return renderCard(cardId, {
                        button: true,
                        disabled: disabled || cardMuted,
                        selected: uiState.selectedCardId === cardId && !cardMuted,
                        muted: cardMuted,
                        defendable: defensePlayable,
                        waitingTarget: needsDefenseTarget && uiState.selectedCardId === cardId,
                        trump: cardSuit(cardId) === String(state.trump?.suit || ''),
                        groupStart: isGroupStart,
                        stackIndex
                    });
                }).join('')}
                </div>
            </div>
        `;
    }

    function renderControls(state, res) {
        if (state.phase === 'finished') return '';
        if (isMyDefenseTurn(state, res)) {
            if (uiState.confirmingTake && canTake(state, res)) {
                const totalCards = tableCardCount(state.table);
                return `
                    <div class="durak-actions is-defense is-confirming-take">
                        <button type="button" class="durak-action-btn is-secondary" data-action="cancel-take" ${uiState.busy ? 'disabled' : ''}>Отмена</button>
                        <button type="button" class="durak-action-btn is-danger is-confirming" data-action="take" ${uiState.busy ? 'disabled' : ''}>Точно взять (${totalCards})</button>
                    </div>
                `;
            }

            const selectedCardId = uiState.selectedCardId;
            const transferAvailable = canTransferCard(state, res, selectedCardId);
            const compatibleTargets = compatibleOpenAttacks(state, selectedCardId);
            const canDefendSelected = Boolean(selectedCardId) && compatibleTargets.length > 0;
            const resolvedTarget = defenseTargetCard(state, res, selectedCardId);
            const defendNeedsTargetPick = canDefendSelected && !resolvedTarget;
            const actionCount = 1 + (transferAvailable ? 1 : 0) + (canDefendSelected ? 1 : 0);
            const defendCopy = !canDefendSelected
                ? ''
                : resolvedTarget && openAttacks(state).length > 1
                    ? `Отбиться ${esc(cardCopy(selectedCardId))} → ${esc(cardCopy(resolvedTarget))}`
                    : `Отбиться ${esc(cardCopy(selectedCardId))}`;
            const transferCopy = transferAvailable
                ? `Перевести ${esc(cardCopy(selectedCardId))} ⇄`
                : '';
            const totalTableCards = tableCardCount(state.table);
            const takeCopy = !hasDefenseOrTransferOption(state, res) && totalTableCards > 0
                ? `Взять (${totalTableCards})`
                : 'Взять';
            return `
                <div class="durak-actions ${actionCount === 1 ? 'is-take-only' : ''} ${actionCount === 3 ? 'is-triple' : ''} is-defense">
                    ${canDefendSelected ? `<button type="button" class="durak-action-btn is-defend${defendNeedsTargetPick ? ' is-needs-target' : ''}" data-action="defend" ${uiState.busy ? 'disabled' : ''}>${defendCopy}</button>` : ''}
                    ${transferAvailable ? `<button type="button" class="durak-action-btn is-transfer" data-action="transfer" ${uiState.busy ? 'disabled' : ''}>${transferCopy}</button>` : ''}
                    <button type="button" class="durak-action-btn is-danger" data-action="take" ${canTake(state, res) && !uiState.busy ? '' : 'disabled'}>${takeCopy}</button>
                </div>
            `;
        }
        const attackAvailable = canPlayAttackCard(state, res, uiState.selectedCardId);
        const passAvailable = canPass(state, res);
        if (!attackAvailable && !passAvailable) return '';
        const actionCount = (attackAvailable ? 1 : 0) + (passAvailable ? 1 : 0);
        const attackLabel = (state.table || []).length ? 'Подкинуть' : 'Сходить';
        return `
            <div class="durak-actions ${actionCount === 1 ? 'is-single' : ''}">
                ${attackAvailable ? `<button type="button" class="durak-action-btn" data-action="confirm-attack" ${!uiState.busy ? '' : 'disabled'}>${attackLabel} ${esc(cardCopy(uiState.selectedCardId))}</button>` : ''}
                ${passAvailable ? `<button type="button" class="durak-action-btn" data-action="pass" ${!uiState.busy ? '' : 'disabled'}>${esc(passActionLabel(state, res))}</button>` : ''}
            </div>
        `;
    }

    function getLayoutContainer(gameArea) {
        return gameArea?.closest?.('#screen-game') || gameArea?.parentElement || gameArea;
    }

    function getContainerSize(gameArea, shell) {
        const layoutContainer = getLayoutContainer(gameArea);
        const rect = layoutContainer?.getBoundingClientRect ? layoutContainer.getBoundingClientRect() : null;
        const visualViewportHeight = Number(window.visualViewport?.height);
        const measuredHeight = Number(rect?.height || shell?.clientHeight || window.innerHeight || 0);
        const height = Number.isFinite(visualViewportHeight) && visualViewportHeight > 0
            ? Math.min(measuredHeight, visualViewportHeight)
            : measuredHeight;
        const width = Math.round(rect?.width || shell?.clientWidth || window.innerWidth || 0);
        return { width, height };
    }

    function getTelegramWebApp() {
        return window.Telegram?.WebApp || null;
    }

    function hasInsetValue(inset, side) {
        return inset && Object.prototype.hasOwnProperty.call(inset, side);
    }

    function normalizeInsetValue(inset, side) {
        if (!hasInsetValue(inset, side)) return null;
        const value = Number(inset[side]);
        return Number.isFinite(value) ? Math.max(0, value) : 0;
    }

    function normalizeViewportHeight(webApp) {
        const viewportHeight = Number(webApp?.viewportHeight);
        if (Number.isFinite(viewportHeight) && viewportHeight > 0) return viewportHeight;

        const stableHeight = Number(webApp?.viewportStableHeight);
        if (Number.isFinite(stableHeight) && stableHeight > 0) return stableHeight;

        return null;
    }

    function resolveInsetValue(inset, side) {
        const value = normalizeInsetValue(inset, side);
        return value === null ? 0 : value;
    }

    function resolveEffectiveHeight(webApp, availableHeight) {
        const telegramHeight = normalizeViewportHeight(webApp);
        const isMobileTelegram = webApp?.platform === 'ios' || webApp?.platform === 'android';
        if (!isMobileTelegram || telegramHeight === null) return availableHeight;
        return Math.min(availableHeight, telegramHeight);
    }

    function applyTelegramCssVariables(shell, webApp, effectiveHeight) {
        shell.style.setProperty('--durak-viewport-height', `${Math.round(effectiveHeight)}px`);

        const contentInset = webApp?.contentSafeAreaInset || null;
        const safeInset = webApp?.safeAreaInset || null;
        const topInset = Math.max(resolveInsetValue(contentInset, 'top'), resolveInsetValue(safeInset, 'top'));
        const topControlsClearance = webApp?.platform === 'ios' ? topInset + 74 : topInset;
        const variables = [
            ['--durak-content-top', contentInset, 'top'],
            ['--durak-content-bottom', contentInset, 'bottom'],
            ['--durak-safe-top', safeInset, 'top'],
            ['--durak-safe-bottom', safeInset, 'bottom']
        ];

        variables.forEach(([name, inset, side]) => {
            const value = normalizeInsetValue(inset, side);
            if (value === null) {
                shell.style.removeProperty(name);
            } else {
                shell.style.setProperty(name, `${value}px`);
            }
        });
        if (webApp) {
            shell.style.setProperty('--durak-top-controls-clearance', `${Math.round(topControlsClearance)}px`);
        } else {
            shell.style.removeProperty('--durak-top-controls-clearance');
        }
    }

    function applyContainerLayout(shell, gameArea) {
        if (!shell || !gameArea || !document.body.contains(shell)) {
            cleanupResizeHandling();
            return;
        }

        const { width, height } = getContainerSize(gameArea, shell);
        if (!width || !height) return;
        const webApp = getTelegramWebApp();
        const effectiveHeight = Math.round(resolveEffectiveHeight(webApp, height));
        applyTelegramCssVariables(shell, webApp, effectiveHeight);

        const layout = width >= 720 ? 'wide' : width <= 430 ? 'compact' : 'medium';
        const heightMode = effectiveHeight <= 680 ? 'short' : 'regular';
        const changed = resizeState.lastWidth !== width
            || resizeState.lastHeight !== effectiveHeight
            || shell.dataset.layout !== layout
            || shell.dataset.height !== heightMode;

        if (!changed) return;

        resizeState.lastWidth = width;
        resizeState.lastHeight = effectiveHeight;
        shell.dataset.layout = layout;
        shell.dataset.height = heightMode;
        shell.style.setProperty('--durak-app-height', `${effectiveHeight}px`);
    }

    function scheduleContainerLayout() {
        if (resizeState.rafId) return;

        resizeState.rafId = window.requestAnimationFrame(() => {
            resizeState.rafId = 0;
            const shell = document.getElementById('durak-shell');
            const gameArea = document.getElementById('game-area');
            if (!shell || !gameArea) {
                cleanupResizeHandling();
                return;
            }
            applyContainerLayout(shell, gameArea);
        });
    }

    function bindResizeFallbacks() {
        if (resizeState.listenersBound) return;
        window.addEventListener('resize', scheduleContainerLayout, { passive: true });
        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', scheduleContainerLayout, { passive: true });
        }
        resizeState.listenersBound = true;
    }

    function bindTelegramEvents() {
        if (resizeState.telegramListenersBound) return;

        const webApp = getTelegramWebApp();
        if (!webApp || typeof webApp.onEvent !== 'function') return;

        ['contentSafeAreaChanged', 'safeAreaChanged', 'viewportChanged'].forEach(eventName => {
            webApp.onEvent(eventName, scheduleContainerLayout);
        });
        resizeState.telegramWebApp = webApp;
        resizeState.telegramListenersBound = true;
    }

    function cleanupResizeHandling() {
        if (resizeState.observer) {
            resizeState.observer.disconnect();
            resizeState.observer = null;
        }
        if (resizeState.mutationObserver) {
            resizeState.mutationObserver.disconnect();
            resizeState.mutationObserver = null;
        }
        resizeState.observedElement = null;

        if (resizeState.rafId) {
            window.cancelAnimationFrame(resizeState.rafId);
            resizeState.rafId = 0;
        }

        if (resizeState.listenersBound) {
            window.removeEventListener('resize', scheduleContainerLayout);
            if (window.visualViewport) {
                window.visualViewport.removeEventListener('resize', scheduleContainerLayout);
            }
            resizeState.listenersBound = false;
        }

        if (resizeState.telegramListenersBound && resizeState.telegramWebApp && typeof resizeState.telegramWebApp.offEvent === 'function') {
            ['contentSafeAreaChanged', 'safeAreaChanged', 'viewportChanged'].forEach(eventName => {
                resizeState.telegramWebApp.offEvent(eventName, scheduleContainerLayout);
            });
        }
        resizeState.telegramWebApp = null;
        resizeState.telegramListenersBound = false;
        uiState.handSettingsOpen = false;
        cancelTakeConfirmation();
        uiState.targetPromptActive = false;
        cancelDrag();

        if (uiState.handSettingsKeydownBound) {
            document.removeEventListener('keydown', handleHandSettingsKeydown);
            uiState.handSettingsKeydownBound = false;
        }

        document.body?.classList?.remove('durak-game-active', 'durak-settings-open');
        const gameArea = document.getElementById('game-area');
        if (gameArea) gameArea.classList.remove('durak-active');
    }

    function watchDurakRemoval(gameArea) {
        if (!('MutationObserver' in window) || resizeState.mutationObserver) return;

        resizeState.mutationObserver = new MutationObserver(() => {
            if (!document.getElementById('durak-shell')) {
                cleanupResizeHandling();
            }
        });
        resizeState.mutationObserver.observe(gameArea, { childList: true });
    }

    function setupResizeHandling(shell, gameArea) {
        gameArea.classList.add('durak-active');
        document.body?.classList?.add('durak-game-active');
        bindResizeFallbacks();
        bindTelegramEvents();
        watchDurakRemoval(gameArea);

        if ('ResizeObserver' in window) {
            if (!resizeState.observer) {
                resizeState.observer = new ResizeObserver(scheduleContainerLayout);
            }
            const layoutContainer = getLayoutContainer(gameArea);
            if (resizeState.observedElement !== layoutContainer) {
                resizeState.observer.disconnect();
                resizeState.observer.observe(layoutContainer);
                resizeState.observedElement = layoutContainer;
            }
        }

        applyContainerLayout(shell, gameArea);
    }

    function renderGame(res) {
        const previousTrickState = uiState.previousTrickState;
        const state = parseState(res);
        if (state.phase === 'setup' || state.phase === 'finished') uiState.handSettingsOpen = false;
        if (state.phase === 'finished' && window.GameSummaryProvider) {
            window.GameSummaryProvider.remember('durak', state, { players: res.players || [] });
        }
        updateLastTrickResult(previousTrickState, state, res);
        uiState.currentState = state;
        uiState.lastRes = res;
        initializeSetupState(state);
        const roleKey = [state.phase || '', state.roles?.attacker_id || '', state.roles?.defender_id || ''].join(':');
        if (uiState.roleKey !== null && uiState.roleKey !== roleKey) {
            uiState.selectedCardId = null;
            uiState.selectedAttackCardId = null;
            uiState.targetPromptActive = false;
            cancelTakeConfirmation();
        }
        uiState.roleKey = roleKey;

        const defenseTurnKey = isMyDefenseTurn(state, res)
            ? `${state.phase}:${state.roles?.defender_id || ''}:${openAttacks(state).map(pair => pair.attack).join(',')}`
            : '';
        if (uiState.defenseTurnKey !== null && uiState.defenseTurnKey !== defenseTurnKey) {
            cancelTakeConfirmation();
            uiState.targetPromptActive = false;
        }
        uiState.defenseTurnKey = defenseTurnKey;

        if (!isMyDefenseTurn(state, res) || !selectedAttackIsValid(state)) uiState.selectedAttackCardId = null;
        if (!Array.isArray(state.my_hand) || !state.my_hand.includes(uiState.selectedCardId)) {
            uiState.selectedCardId = null;
            uiState.targetPromptActive = false;
        } else if (canAttack(state, res) && uiState.selectedCardId && !canPlayAttackCard(state, res, uiState.selectedCardId)) {
            uiState.selectedCardId = null;
        }

        if (dragState.active) {
            const isPhaseValid = state.phase === 'attack' || state.phase === 'defense';
            const isTurnValid = isMyTurn(state, res);
            const hasCard = Array.isArray(state.my_hand) && state.my_hand.includes(dragState.cardId);
            let cardActionStillValid = false;
            if (isPhaseValid && isTurnValid && hasCard) {
                if (dragState.canAttack && canPlayAttackCard(state, res, dragState.cardId)) {
                    cardActionStillValid = true;
                } else if (isMyDefenseTurn(state, res)) {
                    const hasBeatable = compatibleOpenAttacks(state, dragState.cardId).length > 0;
                    const canTrf = canTransferCard(state, res, dragState.cardId);
                    if (hasBeatable || canTrf) cardActionStillValid = true;
                }
            }
            if (!cardActionStillValid) {
                cancelDrag();
            }
        }

        const gameArea = document.getElementById('game-area');
        if (!gameArea) return;

        const shell = renderShell(gameArea);
        setupResizeHandling(shell, gameArea);
        const isActivePhase = state.phase === 'attack' || state.phase === 'defense';
        const myTurnActive = isActivePhase && isMyTurn(state, res);
        shell.classList.toggle('is-finished', state.phase === 'finished');
        shell.classList.toggle('is-setup', state.phase === 'setup');
        shell.classList.toggle('is-active', isActivePhase);
        shell.classList.toggle('is-my-turn', myTurnActive);
        const status = shell.querySelector('#durak-status-pill');
        if (status) {
            status.textContent = compactStatusCopy(state, res);
            status.hidden = isActivePhase;
        }
        const modeLabel = shell.querySelector('#durak-mode-label');
        if (modeLabel) modeLabel.textContent = state.phase === 'setup' ? 'Подготовка' : durakCompactMetaLabel(state);

        const error = shell.querySelector('#durak-error');
        if (error) {
            error.textContent = uiState.lastError || '';
            error.hidden = !uiState.lastError;
        }

        let domUpdated = false;
        const board = shell.querySelector('#durak-board');
        if (board) {
            const nextBoardHtml = state.phase === 'setup'
                ? renderSetupScreen(res)
                : state.phase === 'finished'
                ? renderFinalScreen(state, res)
                : `
                    <div class="durak-context-row${(state.player_order || []).length >= 5 ? ' is-five-player' : ''}">
                        <div class="durak-seats${(state.player_order || []).length >= 5 ? ' is-five-player' : ''}">${renderPlayers(res, state)}</div>
                        <div class="durak-context-actions">
                            <div class="durak-context-status ${myTurnActive ? 'is-my-turn' : 'is-waiting'}">${esc(compactStatusCopy(state, res))}</div>
                        </div>
                    </div>
                    <div class="durak-center">
                        ${renderDeck(state)}
                        ${renderTable(state, res)}
                        ${renderControls(state, res)}
                    </div>
                `;
            if (shell._lastBoardHtml !== nextBoardHtml) {
                const prevSeatsScrollLeft = board.querySelector?.('.durak-seats')?.scrollLeft || 0;
                const prevTableScrollTop = board.querySelector?.('.durak-table-grid')?.scrollTop || 0;
                const prevFinalScrollTop = board.querySelector?.('.durak-final-grid')?.scrollTop || 0;
                board.innerHTML = nextBoardHtml;
                shell._lastBoardHtml = nextBoardHtml;
                domUpdated = true;
                const nextSeats = board.querySelector?.('.durak-seats');
                if (nextSeats && prevSeatsScrollLeft > 0) nextSeats.scrollLeft = prevSeatsScrollLeft;
                const nextTableGrid = board.querySelector?.('.durak-table-grid');
                if (nextTableGrid && prevTableScrollTop > 0) nextTableGrid.scrollTop = prevTableScrollTop;
                const nextFinalGrid = board.querySelector?.('.durak-final-grid');
                if (nextFinalGrid && prevFinalScrollTop > 0) nextFinalGrid.scrollTop = prevFinalScrollTop;
            }
        }

        const hostViewer = isHost(res);
        const exitSection = shell.querySelector('#durak-exit-section');
        const exitNote = shell.querySelector('#durak-exit-note');
        const exitButton = shell.querySelector('#durak-exit-btn');
        if (exitSection) exitSection.hidden = !isActivePhase;
        if (exitNote) {
            exitNote.textContent = hostViewer
                ? 'Завершит активную раздачу для всех и вернёт комнату в лобби.'
                : 'Выход во время раздачи досрочно завершит партию для всех игроков.';
        }
        if (exitButton) {
            const label = hostViewer ? 'Завершить партию' : 'Выйти и прервать партию';
            exitButton.hidden = !isActivePhase;
            exitButton.disabled = !isActivePhase || uiState.busy || uiState.exitBusy;
            exitButton.textContent = label;
            exitButton.setAttribute('aria-label', label);
            exitButton.title = label;
        }

        const hand = shell.querySelector('#durak-hand-shell');
        if (hand) {
            const nextHandHtml = state.phase === 'setup' ? '' : renderHand(state, res);
            if (shell._lastHandHtml !== nextHandHtml) {
                const prevHandScrollLeft = hand.querySelector?.('.durak-hand')?.scrollLeft || 0;
                hand.innerHTML = nextHandHtml;
                shell._lastHandHtml = nextHandHtml;
                domUpdated = true;
                const nextHand = hand.querySelector?.('.durak-hand');
                if (nextHand && prevHandScrollLeft > 0) nextHand.scrollLeft = prevHandScrollLeft;
            }
        }

        syncHandSettingsLayer(shell);
        if (domUpdated || !shell._eventsBound) {
            bindEvents(shell, state, res);
            shell._eventsBound = true;
        }
        if (dragState.active) {
            syncDragVisuals(shell);
        }
    }

    function setError(message) {
        uiState.lastError = message || '';
        clearTimeout(setError._timer);
        if (uiState.lastError) {
            setError._timer = setTimeout(() => {
                uiState.lastError = '';
                const error = document.getElementById('durak-error');
                if (error) {
                    error.textContent = '';
                    error.hidden = true;
                }
            }, 2600);
        }
    }

    async function sendDurakAction(type, payload = {}) {
        if (uiState.busy || typeof window.apiRequest !== 'function') return null;
        cancelTakeConfirmation();
        uiState.targetPromptActive = false;
        uiState.busy = true;
        uiState.busyAction = type;
        if (uiState.lastRes) renderGame(uiState.lastRes);
        try {
            const res = await window.apiRequest({ action: 'game_action', type, ...payload });
            if (res?.status === 'error') {
                setError(res.message || 'Ход не принят');
                if (typeof window.showToast === 'function') window.showToast(res.message || 'Ход не принят', 'warning');
            } else {
                setError('');
                if (window.triggerHaptic) window.triggerHaptic('impact', 'light');
            }
            if (typeof window.checkState === 'function') await window.checkState();
            return res;
        } catch (error) {
            setError('Нет связи с сервером');
            if (typeof window.showAlert === 'function') window.showAlert('Ошибка сети', error.message || 'Попробуйте ещё раз', 'error');
            return { status: 'error' };
        } finally {
            uiState.busy = false;
            uiState.busyAction = null;
            if (uiState.lastRes) renderGame(uiState.lastRes);
        }
    }

    async function startDurakMatch(res) {
        if (uiState.busy || typeof window.apiRequest !== 'function') return null;

        uiState.busy = true;
        renderGame(res);
        try {
            const result = await window.apiRequest({
                action: 'game_action',
                type: 'start_match',
                deck_profile_id: uiState.setupDeckProfileId,
                allow_throw_in: uiState.setupAllowThrowIn,
                allow_transfer: uiState.setupAllowTransfer
            });
            if (result?.status === 'error') {
                const message = result.message || 'Не удалось начать партию';
                setError(message);
                if (typeof window.showToast === 'function') window.showToast(message, 'warning');
                return result;
            }

            setError('');
            if (window.triggerHaptic) window.triggerHaptic('impact', 'light');
            if (typeof window.checkState === 'function') await window.checkState();
            return result;
        } catch (error) {
            const message = 'Нет связи с сервером';
            setError(message);
            if (typeof window.showToast === 'function') window.showToast(message, 'warning');
            return { status: 'error' };
        } finally {
            uiState.busy = false;
            if (uiState.lastRes) renderGame(uiState.lastRes);
        }
    }

    function runExitAction(shell, action) {
        if (uiState.exitBusy || typeof action !== 'function') return;
        uiState.exitBusy = true;
        const controls = shell.querySelectorAll('#durak-exit-btn, [data-action="leave-room"], [data-action="return-room"]');
        controls.forEach(control => {
            control.disabled = true;
            control.setAttribute('aria-busy', 'true');
        });

        try {
            action();
        } finally {
            window.setTimeout(() => {
                uiState.exitBusy = false;
                controls.forEach(control => {
                    control.disabled = false;
                    control.removeAttribute('aria-busy');
                });
            }, 900);
        }
    }

    function syncDragVisuals(shell) {
        if (!shell || !dragState.active) return;
        if (dragState.cardId) {
            const newCardBtn = shell.querySelector(`.durak-hand .durak-card[data-card-id="${dragState.cardId}"]`);
            if (newCardBtn) {
                dragState.cardElement = newCardBtn;
                newCardBtn.classList.add('is-dragging-source');
            }
        }
        if (dragState.canAttack) {
            const attackZone = shell.querySelector('.durak-table-stage, .durak-table-empty');
            if (attackZone) attackZone.classList.add('is-drag-valid-zone');
        }
        if (dragState.validDefenseTargets.length > 0) {
            shell.querySelectorAll('.durak-trick[data-attack-card]').forEach(trick => {
                const attackCardId = trick.dataset ? trick.dataset.attackCard : trick.getAttribute?.('data-attack-card');
                if (attackCardId && dragState.validDefenseTargets.includes(attackCardId)) {
                    trick.classList.add('is-defend-valid-target');
                }
            });
        }
        if (dragState.canTransfer) {
            const transferZone = shell.querySelector('#durak-transfer-zone');
            if (transferZone) transferZone.classList.add('is-active');
        }
    }

    function clearDropTargetHighlights() {
        const shell = document.getElementById('durak-shell');
        if (!shell) return;
        shell.querySelectorAll('.is-drag-valid-zone, .is-drag-hover').forEach(el => {
            el.classList.remove('is-drag-valid-zone', 'is-drag-hover');
        });
        shell.querySelectorAll('.is-defend-valid-target, .is-defend-hover-target').forEach(el => {
            el.classList.remove('is-defend-valid-target', 'is-defend-hover-target');
        });
        const transferZone = shell.querySelector('#durak-transfer-zone');
        if (transferZone) {
            transferZone.classList.remove('is-active', 'is-drag-hover');
        }
    }

    function removeWindowDragListeners() {
        window.removeEventListener('pointermove', handleWindowPointerMove);
        window.removeEventListener('pointerup', handleWindowPointerUp);
        window.removeEventListener('pointercancel', handleWindowPointerCancel);
    }

    function cancelDragListenersOnly() {
        dragState.tracking = false;
        dragState.active = false;
        dragState.cardId = null;
        dragState.cardElement = null;
        dragState.hoverTarget = null;
        dragState.validDefenseTargets = [];
        dragState.canAttack = false;
        dragState.canTransfer = false;
        removeWindowDragListeners();
    }

    function cancelDrag() {
        if (dragState.avatarElement) {
            dragState.avatarElement.remove();
            dragState.avatarElement = null;
        }
        if (dragState.cardElement?.classList) {
            dragState.cardElement.classList.remove('is-dragging-source');
            dragState.cardElement = null;
        }
        clearDropTargetHighlights();
        dragState.tracking = false;
        dragState.active = false;
        dragState.pointerId = null;
        dragState.cardId = null;
        dragState.hoverTarget = null;
        dragState.validDefenseTargets = [];
        dragState.canAttack = false;
        dragState.canTransfer = false;
        removeWindowDragListeners();
    }

    function createDragAvatar(cardId, sourceElement) {
        if (!cardId) return null;
        const meta = suitMeta(cardId);
        const rank = cardRank(cardId);
        const avatar = document.createElement('div');
        avatar.id = 'durak-drag-avatar';
        avatar.className = `durak-card is-drag-avatar is-${meta.tone}`;
        if (sourceElement?.classList?.contains?.('is-trump')) {
            avatar.classList.add('is-trump');
        }
        avatar.innerHTML = `
            <span class="durak-card-corner">
                <span class="durak-card-corner-rank">${esc(rank)}</span>
                <span class="durak-card-corner-suit">${esc(meta.symbol)}</span>
            </span>
            <span class="durak-card-center-suit" aria-hidden="true">${esc(meta.symbol)}</span>
            <span class="durak-card-corner is-bottom" aria-hidden="true">
                <span class="durak-card-corner-rank">${esc(rank)}</span>
                <span class="durak-card-corner-suit">${esc(meta.symbol)}</span>
            </span>
        `;
        const shell = document.getElementById('durak-shell') || document.body;
        if (typeof shell?.appendChild === 'function') {
            shell.appendChild(avatar);
        } else if (typeof document.body?.appendChild === 'function') {
            document.body.appendChild(avatar);
        }
        return avatar;
    }

    function updateDragAvatarPosition(x, y) {
        if (!dragState.avatarElement?.style) return;
        const cardWidth = 68;
        const cardHeight = 96;
        const left = Math.round(x - cardWidth / 2);
        const top = Math.round(y - cardHeight * 0.72);
        dragState.avatarElement.style.transform = `translate3d(${left}px, ${top}px, 0)`;
    }

    function resolveDropTarget(x, y) {
        if (!dragState.active) return null;
        const shell = document.getElementById('durak-shell');
        if (!shell) return null;

        let element = null;
        if (typeof document.elementFromPoint === 'function') {
            element = document.elementFromPoint(x, y);
        }

        if (!element) return null;

        const transferZone = element.closest ? element.closest('[data-drop-zone="transfer"]') : null;
        if (transferZone && dragState.canTransfer) {
            return { type: 'transfer', element: transferZone };
        }

        const trickEl = element.closest ? element.closest('.durak-trick[data-attack-card]') : null;
        if (trickEl) {
            const attackCardId = trickEl.dataset ? trickEl.dataset.attackCard : trickEl.getAttribute?.('data-attack-card');
            if (attackCardId && dragState.validDefenseTargets.includes(attackCardId)) {
                return { type: 'defend', attackCardId, element: trickEl };
            }
        }

        const attackZone = element.closest ? element.closest('#durak-board .durak-table-stage, #durak-board .durak-table-empty, .durak-table-stage, .durak-table-empty') : null;
        if (attackZone && dragState.canAttack) {
            return { type: 'attack', element: attackZone };
        }

        return null;
    }

    function updateDropTargetVisuals(hoverTarget) {
        const shell = document.getElementById('durak-shell');
        if (!shell) return;

        const transferZone = shell.querySelector('#durak-transfer-zone');
        if (transferZone) {
            transferZone.classList.toggle('is-drag-hover', hoverTarget?.type === 'transfer');
        }

        const attackZone = shell.querySelector('.durak-table-stage, .durak-table-empty');
        if (attackZone) {
            attackZone.classList.toggle('is-drag-hover', hoverTarget?.type === 'attack');
        }

        shell.querySelectorAll('.durak-trick[data-attack-card]').forEach(trick => {
            const isHover = hoverTarget?.type === 'defend' && hoverTarget.element === trick;
            trick.classList.toggle('is-defend-hover-target', isHover);
        });
    }

    function activateDrag(event) {
        dragState.active = true;
        const shell = document.getElementById('durak-shell');

        if (dragState.cardElement?.classList) {
            dragState.cardElement.classList.add('is-dragging-source');
        }

        dragState.avatarElement = createDragAvatar(dragState.cardId, dragState.cardElement);
        updateDragAvatarPosition(dragState.currentX, dragState.currentY);

        if (shell) {
            if (dragState.canAttack) {
                const attackZone = shell.querySelector('.durak-table-stage, .durak-table-empty');
                if (attackZone) attackZone.classList.add('is-drag-valid-zone');
            }

            if (dragState.validDefenseTargets.length > 0) {
                shell.querySelectorAll('.durak-trick[data-attack-card]').forEach(trick => {
                    const attackCardId = trick.dataset ? trick.dataset.attackCard : trick.getAttribute?.('data-attack-card');
                    if (attackCardId && dragState.validDefenseTargets.includes(attackCardId)) {
                        trick.classList.add('is-defend-valid-target');
                    }
                });
            }

            if (dragState.canTransfer) {
                const transferZone = shell.querySelector('#durak-transfer-zone');
                if (transferZone) transferZone.classList.add('is-active');
            }
        }

        if (window.triggerHaptic) window.triggerHaptic('selection');
    }

    function handleCardPointerDown(event, button, state, res) {
        if (event.button !== undefined && event.button !== 0) return;
        if (uiState.busy || button.disabled) return;
        const cardId = button.dataset?.cardId || button.getAttribute?.('data-card-id') || button.attributes?.['data-card-id'] || '';
        if (!cardId) return;

        cancelDrag();

        dragState.tracking = true;
        dragState.active = false;
        dragState.pointerId = event.pointerId ?? null;
        dragState.startX = event.clientX || 0;
        dragState.startY = event.clientY || 0;
        dragState.currentX = event.clientX || 0;
        dragState.currentY = event.clientY || 0;
        dragState.cardId = cardId;
        dragState.cardElement = button;

        window.addEventListener('pointermove', handleWindowPointerMove, { passive: false });
        window.addEventListener('pointerup', handleWindowPointerUp);
        window.addEventListener('pointercancel', handleWindowPointerCancel);
    }

    function handleWindowPointerMove(event) {
        if (!dragState.tracking) return;
        if (dragState.pointerId !== null && event.pointerId !== undefined && event.pointerId !== dragState.pointerId) return;

        dragState.currentX = event.clientX || 0;
        dragState.currentY = event.clientY || 0;

        const dx = dragState.currentX - dragState.startX;
        const dy = dragState.startY - dragState.currentY;

        if (!dragState.active) {
            if (Math.abs(dx) > 10 && Math.abs(dx) >= dy) {
                cancelDragListenersOnly();
                return;
            }

            if (dy >= 10 && dy > Math.abs(dx)) {
                const currentState = uiState.currentState || {};
                const currentRes = uiState.lastRes || {};
                const canAtk = canPlayAttackCard(currentState, currentRes, dragState.cardId);
                const beatable = isMyDefenseTurn(currentState, currentRes)
                    ? compatibleOpenAttacks(currentState, dragState.cardId).map(p => p.attack)
                    : [];
                const canTrf = canTransferCard(currentState, currentRes, dragState.cardId);

                dragState.canAttack = canAtk;
                dragState.validDefenseTargets = beatable;
                dragState.canTransfer = canTrf;

                if (!canAtk && beatable.length === 0 && !canTrf) {
                    cancelDragListenersOnly();
                    return;
                }

                activateDrag(event);
            } else {
                return;
            }
        }

        if (dragState.active) {
            if (event.cancelable && typeof event.preventDefault === 'function') {
                event.preventDefault();
            }
            updateDragAvatarPosition(dragState.currentX, dragState.currentY);
            const target = resolveDropTarget(dragState.currentX, dragState.currentY);
            dragState.hoverTarget = target;
            updateDropTargetVisuals(target);
        }
    }

    function executeDropAction(target, cardId) {
        if (!target || !cardId || uiState.busy) return null;
        const currentState = uiState.currentState || {};
        const currentRes = uiState.lastRes || {};

        if (target.type === 'attack') {
            if (canPlayAttackCard(currentState, currentRes, cardId)) {
                if (uiState.selectedCardId === cardId) uiState.selectedCardId = null;
                return sendDurakAction('attack_card', { card_id: cardId });
            }
        } else if (target.type === 'defend') {
            const attackCardId = target.attackCardId;
            const trumpSuit = currentState.trump?.suit || '';
            if (attackCardId && canBeatCard(cardId, attackCardId, trumpSuit)) {
                if (uiState.selectedCardId === cardId) uiState.selectedCardId = null;
                if (uiState.selectedAttackCardId === attackCardId) uiState.selectedAttackCardId = null;
                return sendDurakAction('defend_card', { attack_card_id: attackCardId, card_id: cardId });
            }
        } else if (target.type === 'transfer') {
            if (canTransferCard(currentState, currentRes, cardId)) {
                if (uiState.selectedCardId === cardId) uiState.selectedCardId = null;
                if (uiState.selectedAttackCardId) uiState.selectedAttackCardId = null;
                return sendDurakAction('transfer_card', { card_id: cardId });
            }
        }
        return null;
    }

    function handleWindowPointerUp(event) {
        if (!dragState.tracking) return;
        if (dragState.pointerId !== null && event.pointerId !== undefined && event.pointerId !== dragState.pointerId) return;

        if (!dragState.active) {
            cancelDragListenersOnly();
            return;
        }

        dragState.suppressClickUntil = Date.now() + 450;
        const target = dragState.hoverTarget;
        const cardId = dragState.cardId;

        cancelDrag();

        if (target && cardId && !uiState.busy) {
            executeDropAction(target, cardId);
        }
    }

    function handleWindowPointerCancel(event) {
        if (dragState.pointerId !== null && event.pointerId !== undefined && event.pointerId !== dragState.pointerId) return;
        cancelDrag();
    }

    function bindEvents(shell, state, res) {
        uiState.currentState = state;
        uiState.lastRes = res;

        const exitButton = shell.querySelector('#durak-exit-btn');
        if (exitButton) {
            exitButton.onclick = () => {
                const currentState = uiState.currentState || state;
                const currentRes = uiState.lastRes || res;
                if (exitButton.disabled || uiState.busy || uiState.exitBusy) return;
                if (currentState.phase !== 'attack' && currentState.phase !== 'defense') return;
                closeHandSettings(shell, false);
                runExitAction(shell, isHost(currentRes) ? window.finishGameSession : window.leaveRoom);
            };
        }

        shell.querySelectorAll('[data-setup-rule]').forEach(input => {
            input.onchange = () => {
                if (input.dataset.setupRule === 'allow_throw_in') {
                    uiState.setupAllowThrowIn = input.checked;
                } else if (input.dataset.setupRule === 'allow_transfer') {
                    uiState.setupAllowTransfer = input.checked;
                }
            };
        });

        shell.querySelectorAll('[data-setup-deck-profile]').forEach(input => {
            input.onchange = () => {
                if (!input.checked || input.disabled) return;
                uiState.setupDeckProfileId = normalizeDeckProfileId(input.dataset.setupDeckProfile);
            };
        });

        const startMatchBtn = shell.querySelector('[data-action="start-match"]');
        if (startMatchBtn) {
            startMatchBtn.onclick = () => {
                const currentRes = uiState.lastRes || res;
                if (!startMatchBtn.disabled) startDurakMatch(currentRes);
            };
        }

        const openHandSettingsButton = shell.querySelector('[data-action="open-hand-settings"]');
        if (openHandSettingsButton) {
            openHandSettingsButton.onclick = () => {
                if (uiState.busy) return;
                uiState.handSettingsOpen = true;
                syncHandSettingsLayer(shell);
                const closeButton = shell.querySelector('.durak-hand-settings-close');
                if (closeButton) closeButton.focus({ preventScroll: true });
            };
        }

        shell.querySelectorAll('[data-action="close-hand-settings"]').forEach(button => {
            button.onclick = () => closeHandSettings(shell, true);
        });

        shell.querySelectorAll('[data-hand-sort-option]').forEach(button => {
            button.onclick = () => {
                const currentRes = uiState.lastRes || res;
                uiState.handSort = normalizeHandSort(button.dataset.handSortOption);
                saveHandSortPreference(uiState.handSort);
                syncHandSettingsLayer(shell);
                renderGame(currentRes);
            };
        });

        shell.querySelectorAll('[data-attack-card]').forEach(button => {
            button.onclick = () => {
                const currentState = uiState.currentState || state;
                const currentRes = uiState.lastRes || res;
                if (!isMyDefenseTurn(currentState, currentRes) || button.disabled) return;
                const attackCardId = button.dataset.attackCard || '';
                if (!selectAttackTarget(currentState, currentRes, attackCardId)) return;
                setError('');
                renderGame(currentRes);
            };
        });

        shell.querySelectorAll('.durak-hand .durak-card').forEach(button => {
            button.onpointerdown = (event) => handleCardPointerDown(event, button, state, res);
            button.onclick = () => {
                if (button.disabled) return;
                if (Date.now() < dragState.suppressClickUntil) return;
                const currentState = uiState.currentState || state;
                const currentRes = uiState.lastRes || res;
                const cardId = button.dataset?.cardId || button.getAttribute?.('data-card-id') || button.attributes?.['data-card-id'] || '';
                selectHandCard(currentState, currentRes, cardId);
                setError('');
                renderGame(currentRes);
            };
        });

        const confirmAttackBtn = shell.querySelector('[data-action="confirm-attack"]');
        if (confirmAttackBtn) {
            confirmAttackBtn.onclick = async () => {
                const currentState = uiState.currentState || state;
                const currentRes = uiState.lastRes || res;
                const cardId = uiState.selectedCardId;
                if (confirmAttackBtn.disabled || !cardId || !canPlayAttackCard(currentState, currentRes, cardId)) return;
                const result = await sendDurakAction('attack_card', { card_id: cardId });
                if (result && result.status !== 'error') {
                    uiState.selectedCardId = null;
                    if (uiState.lastRes) renderGame(uiState.lastRes);
                }
            };
        }

        const passBtn = shell.querySelector('[data-action="pass"]');
        if (passBtn) {
            passBtn.onclick = () => {
                if (!passBtn.disabled) sendDurakAction('pass_throw_in');
            };
        }

        const cancelTakeBtn = shell.querySelector('[data-action="cancel-take"]');
        if (cancelTakeBtn) {
            cancelTakeBtn.onclick = () => {
                if (cancelTakeBtn.disabled) return;
                const currentRes = uiState.lastRes || res;
                cancelTakeConfirmation();
                renderGame(currentRes);
            };
        }

        const takeBtn = shell.querySelector('[data-action="take"]');
        if (takeBtn) {
            takeBtn.onclick = () => {
                if (takeBtn.disabled) return;
                const currentState = uiState.currentState || state;
                const currentRes = uiState.lastRes || res;
                if (!uiState.confirmingTake && hasDefenseOrTransferOption(currentState, currentRes)) {
                    uiState.confirmingTake = true;
                    clearTimeout(uiState.confirmTakeTimer);
                    uiState.confirmTakeTimer = window.setTimeout(() => {
                        uiState.confirmingTake = false;
                        uiState.confirmTakeTimer = null;
                        if (uiState.lastRes) renderGame(uiState.lastRes);
                    }, 4500);
                    renderGame(currentRes);
                    return;
                }
                cancelTakeConfirmation();
                sendDurakAction('take_cards');
            };
        }

        const defendBtn = shell.querySelector('[data-action="defend"]');
        if (defendBtn) {
            defendBtn.onclick = async () => {
                if (defendBtn.disabled) return;
                const currentState = uiState.currentState || state;
                const currentRes = uiState.lastRes || res;
                const cardId = uiState.selectedCardId;
                const attackCardId = defenseTargetCard(currentState, currentRes, cardId);
                if (!cardId) return;
                if (!attackCardId) {
                    if (canBeatOpenAttack(currentState, cardId)) {
                        uiState.targetPromptActive = true;
                        if (window.triggerHaptic) window.triggerHaptic('selection');
                        renderGame(currentRes);
                    }
                    return;
                }
                const result = await sendDurakAction('defend_card', { attack_card_id: attackCardId, card_id: cardId });
                if (result && result.status !== 'error') {
                    uiState.selectedCardId = null;
                    uiState.selectedAttackCardId = null;
                    if (uiState.lastRes) renderGame(uiState.lastRes);
                }
            };
        }

        const transferBtn = shell.querySelector('[data-action="transfer"]');
        if (transferBtn) {
            transferBtn.onclick = async () => {
                const cardId = uiState.selectedCardId;
                if (transferBtn.disabled || !cardId) return;
                const result = await sendDurakAction('transfer_card', { card_id: cardId });
                if (result && result.status !== 'error') {
                    uiState.selectedCardId = null;
                    uiState.selectedAttackCardId = null;
                    if (uiState.lastRes) renderGame(uiState.lastRes);
                }
            };
        }

        shell.querySelectorAll('[data-action="start-rematch"]').forEach(button => {
            button.onclick = () => {
                if (!button.disabled) sendDurakAction('start_rematch');
            };
        });

        const requestRematchBtn = shell.querySelector('[data-action="request-rematch"]');
        if (requestRematchBtn) {
            requestRematchBtn.onclick = () => {
                if (!requestRematchBtn.disabled) sendDurakAction('request_rematch');
            };
        }

        const declineRematchBtn = shell.querySelector('[data-action="decline-rematch"]');
        if (declineRematchBtn) {
            declineRematchBtn.onclick = () => {
                if (!declineRematchBtn.disabled) sendDurakAction('decline_rematch');
            };
        }

        const shareStoryBtn = shell.querySelector('[data-action="share-story"]');
        if (shareStoryBtn) {
            shareStoryBtn.onclick = async () => {
                if (shareStoryBtn.disabled || uiState.storyBusy || !window.GameSummaryProvider) return;
                const currentRes = uiState.lastRes || res;
                uiState.storyBusy = true;
                renderGame(currentRes);
                try {
                    await window.GameSummaryProvider.shareStory('durak');
                } finally {
                    uiState.storyBusy = false;
                    if (uiState.lastRes) renderGame(uiState.lastRes);
                }
            };
        }

        const returnBtn = shell.querySelector('[data-action="return-room"]');
        if (returnBtn) {
            returnBtn.onclick = () => {
                const currentRes = uiState.lastRes || res;
                if (returnBtn.disabled || uiState.exitBusy || !isHost(currentRes)) return;
                uiState.handSettingsOpen = false;
                runExitAction(shell, window.finishGameSession);
            };
        }

        const leaveRoomBtn = shell.querySelector('[data-action="leave-room"]');
        if (leaveRoomBtn) {
            leaveRoomBtn.onclick = () => {
                const currentRes = uiState.lastRes || res;
                if (leaveRoomBtn.disabled || uiState.exitBusy || isHost(currentRes)) return;
                uiState.handSettingsOpen = false;
                runExitAction(shell, window.leaveRoom);
            };
        }
    }

    if (window.GameSummaryProvider) {
        window.GameSummaryProvider.register('durak', {
            buildSummary: function (gameState, context = {}) {
                const playerIds = (gameState?.player_order || []).map(String);
                const players = (context.players || []).filter(player => playerIds.includes(String(player.id)));
                const loserId = gameState?.result?.loser_id == null ? '' : String(gameState.result.loser_id);
                const loser = players.find(player => String(player.id) === loserId) || null;
                const winner = players.length === 2 && loserId
                    ? players.find(player => String(player.id) !== loserId) || null
                    : null;
                const loserName = loser ? playerName(loser) : 'Игрок';
                const outcome = gameState?.result?.reason === 'all_finished' || !loserId
                    ? 'Партия завершилась без проигравшего'
                    : `${loserName} остался дураком`;
                const mode = durakModeLabel(gameState || {});
                const deck = deckProfileLabel(gameState?.deck_profile_id);

                return {
                    gameId: 'durak',
                    gameTitle: 'Дурак',
                    participants: players,
                    winner,
                    outcome,
                    awards: [
                        { iconClass: 'bi bi-controller', title: 'Режим', player: mode },
                        { iconClass: 'bi bi-suit-spade-fill', title: 'Колода', player: deck }
                    ],
                    shareText: `${outcome}\n${mode} · ${deck}`
                };
            }
        });
    }

    window.renderDurakGame = renderGame;
    window.cleanupDurakGame = cleanupResizeHandling;
})();
