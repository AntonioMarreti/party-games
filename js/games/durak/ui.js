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
        busy: false,
        busyAction: null,
        storyBusy: false,
        lastError: '',
        lastRes: null,
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

    function parseState(res) {
        const raw = res?.room?.game_state || res?.game_state;
        if (!raw) return {};
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

    function nextActivePlayerId(state, playerId) {
        const playerOrder = (state.player_order || []).map(String);
        const activePlayers = new Set((state.in_game_players || []).map(String));
        const startIndex = playerOrder.indexOf(String(playerId));
        if (startIndex < 0 || activePlayers.size < 2) return '';

        for (let offset = 1; offset <= playerOrder.length; offset += 1) {
            const candidate = playerOrder[(startIndex + offset) % playerOrder.length];
            if (candidate !== String(playerId) && activePlayers.has(candidate)) return candidate;
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

        const nextDefenderId = nextActivePlayerId(state, getMyId(res));
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

    function openAttacks(state) {
        return (state.table || []).filter(pair => pair?.attack && !pair?.defend);
    }

    function allAttacksCovered(state) {
        return Array.isArray(state.table) && state.table.length > 0 && openAttacks(state).length === 0;
    }

    function isBeatContext(state) {
        return state.defender_mode !== 'taking' && allAttacksCovered(state);
    }

    function passActionLabel(state) {
        if (state.defender_mode === 'taking') return 'Больше не подкидывать';
        return isBeatContext(state) ? 'Бито' : 'Пас';
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
                uiState.lastTrickResult = {
                    tone: 'taking',
                    text: `${previousState.defenderName} забирает ${previousState.tableCardCount} ${cardCountWord(previousState.tableCardCount)}`
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

    function durakActiveModeLabel(state) {
        return `${durakModeLabel(state)} · ${deckProfileLabel(state.deck_profile_id)}`;
    }

    function selectedAttackIsValid(state) {
        return openAttacks(state).some(pair => pair.attack === uiState.selectedAttackCardId);
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

    function defenseTargetCard(state, res) {
        if (!isMyDefenseTurn(state, res)) return '';
        const attacks = openAttacks(state);
        if (attacks.length === 1) return attacks[0].attack || '';
        if (selectedAttackIsValid(state)) return uiState.selectedAttackCardId;
        return '';
    }

    function canUseDefenseCard(state, res, cardId) {
        const attackCardId = defenseTargetCard(state, res);
        if (!attackCardId) return false;
        return canBeatCard(cardId, attackCardId, state.trump?.suit || '');
    }

    function statusCopy(state, res) {
        if (state.phase === 'setup') {
            return Number(res?.is_host || 0) === 1
                ? 'Выбери колоду и правила'
                : 'Хост выбирает колоду и правила';
        }
        if (state.phase === 'finished') {
            return 'Итог партии';
        }

        const actor = getPlayer(res, state.actor_id);
        const actorName = actor ? playerName(actor) : 'Игрок';
        const currentDefenderName = defenderName(state, res);
        if (state.defender_mode === 'taking') {
            return isMyTurn(state, res)
                ? `${currentDefenderName} берёт — можно подкинуть`
                : `${currentDefenderName} забирает карты`;
        }
        if (isBeatContext(state)) {
            return isMyTurn(state, res) ? 'Можно подкинуть или завершить' : 'Все карты отбиты';
        }
        if (isMyTurn(state, res)) {
            if (state.phase === 'defense') return 'Твоя защита';
            return (state.table || []).length ? 'Можно подкинуть' : 'Твоя атака';
        }
        if (state.phase === 'defense') return 'Соперник решает: бить или взять';
        return (state.table || []).length ? 'Ждём подкидывание' : `Ходит ${actorName}`;
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
                    <div>
                        <div class="durak-kicker" id="durak-mode-label">Подкидной</div>
                        <h2>Дурак</h2>
                    </div>
                    <div class="durak-top-actions">
                        <div class="durak-status-pill" id="durak-status-pill"></div>
                        <button type="button" class="durak-exit-btn" id="durak-exit-btn" hidden>
                            <i class="bi bi-box-arrow-right" aria-hidden="true"></i>
                        </button>
                    </div>
                </div>
                <div class="durak-error" id="durak-error" hidden></div>
                <div class="durak-board" id="durak-board"></div>
                <div class="durak-hand-shell" id="durak-hand-shell"></div>
                <div class="durak-hand-settings-layer" id="durak-hand-settings-layer" aria-hidden="true" inert>
                    <button type="button" class="durak-hand-settings-backdrop" data-action="close-hand-settings" aria-label="Закрыть настройки руки"></button>
                    <section class="durak-hand-settings-sheet" role="dialog" aria-modal="true" aria-labelledby="durak-hand-settings-title">
                        <div class="durak-hand-settings-head">
                            <h3 id="durak-hand-settings-title">Настройки руки</h3>
                            <button type="button" class="durak-hand-settings-close" data-action="close-hand-settings" aria-label="Закрыть настройки руки">
                                <i class="bi bi-x-lg" aria-hidden="true"></i>
                            </button>
                        </div>
                        <div class="durak-hand-settings-label">Сортировка</div>
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

        if (!opponents.length) {
            return '<div class="durak-empty-line">Ожидаем соперников</div>';
        }

        return opponents.map(player => {
            const id = String(player.id);
            const active = String(state.actor_id || '') === id;
            const defender = String(state.roles?.defender_id || '') === id;
            const defenderStatus = defender
                ? (state.defender_mode === 'taking' ? 'берёт' : 'защита')
                : '';
            return `
                <div class="durak-seat ${active ? 'is-active' : ''}">
                    <div class="durak-avatar">${playerAvatar(player)}</div>
                    <div class="durak-seat-copy">
                        <div class="durak-seat-name">${esc(playerName(player))}</div>
                        <div class="durak-seat-meta">${handCounts.get(id) || 0} карт${defenderStatus ? ` · ${defenderStatus}` : ''}</div>
                    </div>
                </div>
            `;
        }).join('');
    }

    function defenseStatusCopy(state, res) {
        if (!isMyDefenseTurn(state, res)) return '';
        const attacks = openAttacks(state);
        if (attacks.length <= 1) return '';
        if (selectedAttackIsValid(state)) return `Бьёшь ${cardCopy(uiState.selectedAttackCardId)}`;
        return 'Выбери карту атаки на столе';
    }

    function renderTable(state, res) {
        const table = state.table || [];
        if (!table.length) {
            const result = uiState.lastTrickResult;
            if (result) {
                return `
                    <div class="durak-table-empty is-trick-result is-${esc(result.tone)}" role="status">
                        <div class="durak-empty-title">${esc(result.text)}</div>
                    </div>
                `;
            }
            return `
                <div class="durak-table-empty">
                    <div class="durak-empty-title">Стол чист</div>
                    <div class="durak-empty-text">Первая карта начнёт взятку.</div>
                </div>
            `;
        }

        return `
            ${defenseStatusCopy(state, res) ? `<div class="durak-defense-status">${esc(defenseStatusCopy(state, res))}</div>` : ''}
            <div class="durak-table-grid">
                ${table.map(pair => {
                    const open = pair.attack && !pair.defend;
                    const selected = uiState.selectedAttackCardId === pair.attack;
                    const canSelect = open && isMyDefenseTurn(state, res) && openAttacks(state).length > 1;
                    return `
                        <button type="button"
                            class="durak-trick ${open ? 'is-open' : ''} ${selected ? 'is-selected' : ''} ${pair.defend ? 'is-covered' : ''}"
                            data-attack-card="${esc(pair.attack || '')}"
                            ${canSelect ? '' : 'disabled'}>
                            <span class="durak-trick-cards">
                                ${pair.attack ? renderCard(pair.attack, { small: true }) : ''}
                                ${pair.defend ? renderCard(pair.defend, { small: true, defend: true }) : '<span class="durak-card-slot">Защита</span>'}
                            </span>
                            ${canSelect ? '<span class="durak-trick-prompt">Выбрать эту атаку</span>' : ''}
                        </button>
                    `;
                }).join('')}
            </div>
        `;
    }

    function renderDeck(state) {
        const trump = state.trump || {};
        return `
            <div class="durak-deck-row">
                <div class="durak-deck" aria-label="Колода">
                    <div class="durak-card-back"></div>
                    <div>
                        <div class="durak-deck-count">${Number(state.draw_count || 0)}</div>
                        <div class="durak-deck-label">в колоде</div>
                    </div>
                </div>
                <div class="durak-trump">
                    ${trump.card ? renderCard(trump.card, { small: true }) : '<div class="durak-card-slot">Козырь</div>'}
                    <div>
                        <div class="durak-deck-label">козырь</div>
                        <div class="durak-trump-suit">${esc((DURAK_SUITS[trump.suit] || {}).symbol || trump.suit || '-')}</div>
                    </div>
                </div>
                <div class="durak-discard">
                    <div class="durak-deck-count">${Number(state.discard_count || 0)}</div>
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
                    <button type="button" class="durak-action-btn durak-return-btn" data-action="return-room" ${uiState.busy ? 'disabled' : ''}>
                        Вернуться в комнату
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

    function renderHand(state, res) {
        const cards = [...(state.my_hand || [])];
        const sortedCards = sortedHandCards(state);
        if (state.phase === 'finished') return '';

        const defenseTurn = isMyDefenseTurn(state, res);
        const defenseTarget = defenseTargetCard(state, res);
        const needsDefenseTarget = defenseTurn && openAttacks(state).length > 1 && !defenseTarget;
        const disabled = !isMyTurn(state, res) || uiState.busy || state.phase === 'finished';
        const currentDefenderName = defenderName(state, res);
        const waitingHint = state.phase === 'defense'
            ? 'Ждём защиту'
            : state.defender_mode === 'taking'
                ? `${currentDefenderName} забирает карты — ждём подкидывание`
                : isBeatContext(state)
                    ? 'Все карты отбиты — ждём решения подкидывающего'
                    : 'Ждём атаку';
        const transferAvailable = canTransfer(state, res);
        const actionHint = defenseTurn
            ? (transferAvailable
                ? 'Выбери карту: можно отбиться, перевести или взять'
                : (needsDefenseTarget ? 'Выбери карту атаки на столе' : 'Выбери карту защиты'))
            : canAttack(state, res)
                ? ((state.table || []).length
                    ? (state.defender_mode === 'taking'
                        ? 'Подкинь подходящую карту или закончи подкидывание'
                        : isBeatContext(state)
                            ? 'Подкинь подходящую карту или скажи «Бито»'
                            : 'Подкинь карту совпадающего ранга')
                    : 'Выбери карту для атаки')
                : waitingHint;

        return `
            <div class="durak-hand-head">
                <div class="durak-hand-copy">
                    <div class="durak-hand-title">Твоя рука</div>
                    <div class="durak-hand-hint">${esc(actionHint)}</div>
                </div>
                <div class="durak-hand-tools">
                    <button type="button" class="durak-hand-settings-btn" data-action="open-hand-settings" aria-label="Настройки руки" title="Настройки руки">
                        <i class="bi bi-gear" aria-hidden="true"></i>
                    </button>
                    <div class="durak-hand-count">${cards.length}</div>
                </div>
            </div>
            <div class="durak-hand" role="list">
                <div class="durak-hand-strip">
                ${sortedCards.map(({ cardId, isGroupStart }, stackIndex) => {
                    const defensePlayable = defenseTurn && canUseDefenseCard(state, res, cardId);
                    const transferPlayable = defenseTurn && canTransferCard(state, res, cardId);
                    const defenseMuted = defenseTurn && !needsDefenseTarget && !defensePlayable && !transferPlayable;
                    return renderCard(cardId, {
                        button: true,
                        disabled: disabled || defenseMuted,
                        selected: uiState.selectedCardId === cardId && !defenseMuted,
                        muted: defenseMuted,
                        defendable: defensePlayable && !needsDefenseTarget,
                        waitingTarget: needsDefenseTarget,
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
            const selectedCardId = uiState.selectedCardId;
            const transferAvailable = canTransferCard(state, res, selectedCardId);
            const defendAvailable = canUseDefenseCard(state, res, selectedCardId);
            const actionCount = 1 + (transferAvailable ? 1 : 0) + (defendAvailable ? 1 : 0);
            return `
                <div class="durak-actions ${actionCount === 1 ? 'is-single' : ''} ${actionCount === 3 ? 'is-triple' : ''} is-defense">
                    ${defendAvailable ? '<button type="button" class="durak-action-btn" data-action="defend" ' + (uiState.busy ? 'disabled' : '') + '>Отбиться ' + esc(cardCopy(selectedCardId)) + '</button>' : ''}
                    ${transferAvailable ? '<button type="button" class="durak-action-btn" data-action="transfer" ' + (uiState.busy ? 'disabled' : '') + '>Перевести ' + esc(cardCopy(selectedCardId)) + '</button>' : ''}
                    <button type="button" class="durak-action-btn is-danger" data-action="take" ${canTake(state, res) && !uiState.busy ? '' : 'disabled'}>Взять</button>
                </div>
            `;
        }
        const attackAvailable = canAttack(state, res) && Boolean(uiState.selectedCardId);
        const passAvailable = canPass(state, res);
        if (!attackAvailable && !passAvailable) return '';
        const actionCount = (attackAvailable ? 1 : 0) + (passAvailable ? 1 : 0);
        const attackLabel = (state.table || []).length ? 'Подкинуть' : 'Сходить';
        return `
            <div class="durak-actions ${actionCount === 1 ? 'is-single' : ''}">
                ${attackAvailable ? `<button type="button" class="durak-action-btn" data-action="confirm-attack" ${!uiState.busy ? '' : 'disabled'}>${attackLabel} ${esc(cardCopy(uiState.selectedCardId))}</button>` : ''}
                ${passAvailable ? `<button type="button" class="durak-action-btn" data-action="pass" ${!uiState.busy ? '' : 'disabled'}>${esc(passActionLabel(state))}</button>` : ''}
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

        if (uiState.handSettingsKeydownBound) {
            document.removeEventListener('keydown', handleHandSettingsKeydown);
            uiState.handSettingsKeydownBound = false;
        }

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
        uiState.lastRes = res;
        initializeSetupState(state);
        const roleKey = [state.phase || '', state.roles?.attacker_id || '', state.roles?.defender_id || ''].join(':');
        if (uiState.roleKey !== null && uiState.roleKey !== roleKey) {
            uiState.selectedCardId = null;
            uiState.selectedAttackCardId = null;
        }
        uiState.roleKey = roleKey;
        if (!isMyDefenseTurn(state, res) || !selectedAttackIsValid(state)) uiState.selectedAttackCardId = null;
        if (!Array.isArray(state.my_hand) || !state.my_hand.includes(uiState.selectedCardId)) uiState.selectedCardId = null;

        const gameArea = document.getElementById('game-area');
        if (!gameArea) return;

        const shell = renderShell(gameArea);
        setupResizeHandling(shell, gameArea);
        shell.classList.toggle('is-finished', state.phase === 'finished');
        shell.classList.toggle('is-setup', state.phase === 'setup');
        const status = shell.querySelector('#durak-status-pill');
        if (status) status.textContent = statusCopy(state, res);
        const exitButton = shell.querySelector('#durak-exit-btn');
        if (exitButton) {
            const isActivePhase = state.phase === 'attack' || state.phase === 'defense';
            const canFinishGame = Number(res?.is_host || 0) === 1 && isActivePhase;
            exitButton.hidden = !canFinishGame;
            exitButton.disabled = !canFinishGame || uiState.busy;
            exitButton.setAttribute('aria-label', 'Завершить игру');
            exitButton.title = 'Завершить игру';
        }
        const modeLabel = shell.querySelector('#durak-mode-label');
        if (modeLabel) modeLabel.textContent = state.phase === 'setup' ? 'Подготовка' : durakActiveModeLabel(state);

        const error = shell.querySelector('#durak-error');
        if (error) {
            error.textContent = uiState.lastError || '';
            error.hidden = !uiState.lastError;
        }

        const board = shell.querySelector('#durak-board');
        if (board) {
            board.innerHTML = state.phase === 'setup'
                ? renderSetupScreen(res)
                : state.phase === 'finished'
                ? renderFinalScreen(state, res)
                : `
                    <div class="durak-seats">${renderPlayers(res, state)}</div>
                    <div class="durak-center">
                        ${renderDeck(state)}
                        ${renderTable(state, res)}
                        ${renderControls(state, res)}
                    </div>
                `;
        }

        const hand = shell.querySelector('#durak-hand-shell');
        if (hand) hand.innerHTML = state.phase === 'setup' ? '' : renderHand(state, res);

        syncHandSettingsLayer(shell);
        bindEvents(shell, state, res);
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

    function bindEvents(shell, state, res) {
        const exitButton = shell.querySelector('#durak-exit-btn');
        if (exitButton) {
            exitButton.onclick = () => {
                if (exitButton.disabled || uiState.busy || Number(res?.is_host || 0) !== 1) return;
                if (state.phase !== 'attack' && state.phase !== 'defense') return;
                uiState.handSettingsOpen = false;
                if (typeof window.finishGameSession === 'function') window.finishGameSession();
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
                if (!startMatchBtn.disabled) startDurakMatch(res);
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
                uiState.handSort = normalizeHandSort(button.dataset.handSortOption);
                saveHandSortPreference(uiState.handSort);
                syncHandSettingsLayer(shell);
                renderGame(res);
            };
        });

        shell.querySelectorAll('[data-attack-card]').forEach(button => {
            button.onclick = () => {
                if (!isMyDefenseTurn(state, res) || button.disabled) return;
                const attackCardId = button.dataset.attackCard || '';
                uiState.selectedAttackCardId = uiState.selectedAttackCardId === attackCardId ? null : attackCardId;
                if (uiState.selectedAttackCardId && uiState.selectedCardId
                    && !canUseDefenseCard(state, res, uiState.selectedCardId)
                    && !canTransferCard(state, res, uiState.selectedCardId)) {
                    uiState.selectedCardId = null;
                }
                renderGame(res);
            };
        });

        shell.querySelectorAll('.durak-hand .durak-card').forEach(button => {
            button.onclick = () => {
                if (button.disabled) return;
                const cardId = button.dataset.cardId || '';
                if (uiState.selectedCardId === cardId) {
                    uiState.selectedCardId = null;
                    setError('');
                    renderGame(res);
                    return;
                }
                uiState.selectedCardId = cardId;

                if (isMyDefenseTurn(state, res)) {
                    const attackCardId = defenseTargetCard(state, res);
                    if (!attackCardId && !canTransferCard(state, res, cardId)) {
                        setError('Сначала выбери карту атаки на столе');
                    } else {
                        setError('');
                    }
                }

                renderGame(res);
            };
        });

        const confirmAttackBtn = shell.querySelector('[data-action="confirm-attack"]');
        if (confirmAttackBtn) {
            confirmAttackBtn.onclick = async () => {
                const cardId = uiState.selectedCardId;
                if (confirmAttackBtn.disabled || !cardId || !canAttack(state, res)) return;
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

        const takeBtn = shell.querySelector('[data-action="take"]');
        if (takeBtn) {
            takeBtn.onclick = () => {
                if (!takeBtn.disabled) sendDurakAction('take_cards');
            };
        }

        const defendBtn = shell.querySelector('[data-action="defend"]');
        if (defendBtn) {
            defendBtn.onclick = async () => {
                const attackCardId = defenseTargetCard(state, res);
                const cardId = uiState.selectedCardId;
                if (defendBtn.disabled || !attackCardId || !cardId) return;
                const result = await sendDurakAction('defend_card', { attack_card_id: attackCardId, card_id: cardId });
                if (result && result.status !== 'error') {
                    uiState.selectedCardId = null;
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
                uiState.storyBusy = true;
                renderGame(res);
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
                uiState.handSettingsOpen = false;
                if (typeof window.finishGameSession === 'function') window.finishGameSession();
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
