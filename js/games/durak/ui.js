(function () {
    const DURAK_SUITS = {
        S: { symbol: '♠', label: 'пики', tone: 'black' },
        H: { symbol: '♥', label: 'черви', tone: 'red' },
        D: { symbol: '♦', label: 'бубны', tone: 'red' },
        C: { symbol: '♣', label: 'трефы', tone: 'black' }
    };
    const DURAK_RANK_VALUES = {
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

    const uiState = {
        selectedCardId: null,
        selectedAttackCardId: null,
        busy: false,
        lastError: '',
        lastRes: null,
        roleKey: null,
        setupAllowThrowIn: true,
        setupAllowTransfer: false,
        setupInitialized: false
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
        return isBeatContext(state) ? 'Бито' : 'Пас';
    }

    function durakModeLabel(state) {
        const allowThrowIn = state.rules?.allow_throw_in !== false;
        const allowTransfer = state.rules?.allow_transfer === true;
        if (allowThrowIn && allowTransfer) return 'Подкидной + переводной';
        if (allowTransfer) return 'Переводной';
        if (allowThrowIn) return 'Подкидной';
        return 'Без подкидывания и перевода';
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
            return Number(res?.is_host || 0) === 1 ? 'Выбери правила' : 'Хост выбирает правила';
        }
        if (state.phase === 'finished') {
            return 'Итог партии';
        }

        const actor = getPlayer(res, state.actor_id);
        const actorName = actor ? playerName(actor) : 'Игрок';
        if (isMyTurn(state, res)) {
            if (state.phase === 'defense') return 'Твоя защита';
            if (state.defender_mode === 'taking') return 'Можно подкинуть или сказать «Пас»';
            if (isBeatContext(state)) return 'Можно подкинуть или сказать «Бито»';
            return (state.table || []).length ? 'Можно подкинуть' : 'Твоя атака';
        }
        if (state.phase === 'defense') return 'Соперник решает: бить или взять';
        if (state.defender_mode === 'taking') return `${actorName} выбирает: подкинуть или пас`;
        if (isBeatContext(state)) return `${actorName} выбирает: подкинуть или бито`;
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
            `;
            container.appendChild(shell);
        }
        return shell;
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
            options.waitingTarget ? 'is-waiting-target' : ''
        ].filter(Boolean).join(' ');
        const attrs = options.button
            ? `button type="button" ${options.disabled ? 'disabled' : ''} data-card-id="${esc(cardId)}" class="${classes}"`
            : `div class="${classes}"`;
        const endTag = options.button ? 'button' : 'div';

        return `
            <${attrs} aria-label="${esc(cardRank(cardId) + ' ' + meta.label)}">
                <span class="durak-card-rank">${esc(cardRank(cardId))}</span>
                <span class="durak-card-suit">${esc(meta.symbol)}</span>
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
            return `
                <div class="durak-seat ${active ? 'is-active' : ''}">
                    <div class="durak-avatar">${playerAvatar(player)}</div>
                    <div class="durak-seat-copy">
                        <div class="durak-seat-name">${esc(playerName(player))}</div>
                        <div class="durak-seat-meta">${handCounts.get(id) || 0} карт${defender ? ' · защита' : ''}</div>
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

    function renderFinalScreen(state, res) {
        const canReturn = Number(res?.is_host || 0) === 1 && typeof window.finishGameSession === 'function';
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
                ${canReturn ? `
                    <button type="button" class="durak-action-btn durak-return-btn" data-action="return-room">
                        Вернуться в комнату
                    </button>
                ` : ''}
            </div>
        `;
    }

    function initializeSetupState(state) {
        if (state.phase === 'setup') {
            if (!uiState.setupInitialized) {
                uiState.setupAllowThrowIn = state.rules?.allow_throw_in !== false;
                uiState.setupAllowTransfer = state.rules?.allow_transfer === true;
                uiState.setupInitialized = true;
            }
            return;
        }

        if (uiState.setupInitialized) {
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

    function renderSetupScreen(res) {
        const isHost = Number(res?.is_host || 0) === 1;
        if (!isHost) {
            return `
                <div class="durak-setup-screen is-guest">
                    <div class="durak-setup-intro">
                        <div class="durak-setup-game">Дурак, колода 36 карт</div>
                        <div class="durak-setup-title">Настройка партии</div>
                        <div class="durak-setup-description">Хост выбирает правила</div>
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
                    <div class="durak-setup-game">Дурак, колода 36 карт</div>
                    <div class="durak-setup-title">Настройка партии</div>
                    <div class="durak-setup-description">Выбери режимы перед раздачей карт.</div>
                </div>
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
        const cards = state.my_hand || [];
        if (state.phase === 'finished') return '';

        const defenseTurn = isMyDefenseTurn(state, res);
        const defenseTarget = defenseTargetCard(state, res);
        const needsDefenseTarget = defenseTurn && openAttacks(state).length > 1 && !defenseTarget;
        const disabled = !isMyTurn(state, res) || uiState.busy || state.phase === 'finished';
        const waitingHint = state.phase === 'defense'
            ? 'Ждём защиту'
            : state.defender_mode === 'taking'
                ? 'Ждём подкидывание'
                : 'Ждём атаку';
        const transferAvailable = canTransfer(state, res);
        const actionHint = defenseTurn
            ? (transferAvailable
                ? 'Выбери карту: можно отбиться, перевести или взять'
                : (needsDefenseTarget ? 'Выбери карту атаки на столе' : 'Выбери карту защиты'))
            : canAttack(state, res)
                ? ((state.table || []).length
                    ? (isBeatContext(state) ? 'Подкинь карту совпадающего ранга или скажи «Бито»' : 'Подкинь карту совпадающего ранга или скажи «Пас»')
                    : 'Выбери карту для атаки')
                : waitingHint;

        return `
            <div class="durak-hand-head">
                <div>
                    <div class="durak-hand-title">Твоя рука</div>
                    <div class="durak-hand-hint">${esc(actionHint)}</div>
                </div>
                <div class="durak-hand-count">${cards.length}</div>
            </div>
            <div class="durak-hand" role="list">
                ${cards.map(cardId => {
                    const defensePlayable = defenseTurn && canUseDefenseCard(state, res, cardId);
                    const transferPlayable = defenseTurn && canTransferCard(state, res, cardId);
                    const defenseMuted = defenseTurn && !defensePlayable && !transferPlayable;
                    return renderCard(cardId, {
                        button: true,
                        disabled: disabled || (defenseTurn && !defensePlayable && !transferPlayable),
                        selected: uiState.selectedCardId === cardId,
                        muted: defenseMuted,
                        defendable: defensePlayable && !needsDefenseTarget,
                        waitingTarget: needsDefenseTarget
                    });
                }).join('')}
            </div>
        `;
    }

    function renderControls(state, res) {
        if (state.phase === 'finished') return '';
        if (isMyDefenseTurn(state, res)) {
            const selectedCardId = uiState.selectedCardId;
            const transferAvailable = canTransferCard(state, res, selectedCardId);
            const defendAvailable = transferAvailable && canUseDefenseCard(state, res, selectedCardId);
            const actionCount = 1 + (transferAvailable ? 1 : 0) + (defendAvailable ? 1 : 0);
            return `
                <div class="durak-actions ${actionCount === 1 ? 'is-single' : ''} ${actionCount === 3 ? 'is-triple' : ''} is-defense">
                    ${defendAvailable ? '<button type="button" class="durak-action-btn" data-action="defend" ' + (uiState.busy ? 'disabled' : '') + '>Отбиться</button>' : ''}
                    ${transferAvailable ? '<button type="button" class="durak-action-btn" data-action="transfer" ' + (uiState.busy ? 'disabled' : '') + '>Перевести</button>' : ''}
                    <button type="button" class="durak-action-btn is-danger" data-action="take" ${canTake(state, res) && !uiState.busy ? '' : 'disabled'}>Взять</button>
                </div>
            `;
        }
        if (!canPass(state, res)) return '';
        return `
            <div class="durak-actions is-single">
                <button type="button" class="durak-action-btn" data-action="pass" ${!uiState.busy ? '' : 'disabled'}>${esc(passActionLabel(state))}</button>
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
        uiState.lastRes = res;
        const state = parseState(res);
        initializeSetupState(state);
        const roleKey = [state.phase || '', state.roles?.attacker_id || '', state.roles?.defender_id || '', state.actor_id || ''].join(':');
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
        if (modeLabel) modeLabel.textContent = state.phase === 'setup' ? 'Подготовка' : durakModeLabel(state);

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

        const startMatchBtn = shell.querySelector('[data-action="start-match"]');
        if (startMatchBtn) {
            startMatchBtn.onclick = () => {
                if (!startMatchBtn.disabled) startDurakMatch(res);
            };
        }

        shell.querySelectorAll('[data-attack-card]').forEach(button => {
            button.onclick = () => {
                if (!isMyDefenseTurn(state, res) || button.disabled) return;
                const attackCardId = button.dataset.attackCard || '';
                uiState.selectedAttackCardId = uiState.selectedAttackCardId === attackCardId ? null : attackCardId;
                renderGame(res);
            };
        });

        shell.querySelectorAll('.durak-hand .durak-card').forEach(button => {
            button.onclick = async () => {
                if (button.disabled) return;
                const cardId = button.dataset.cardId || '';
                uiState.selectedCardId = cardId;

                if (isMyDefenseTurn(state, res)) {
                    if (canTransferCard(state, res, cardId)) {
                        renderGame(res);
                        return;
                    }
                    const attackCardId = defenseTargetCard(state, res);
                    if (!attackCardId) {
                        setError('Выбери карту атаки на столе');
                        renderGame(res);
                        return;
                    }
                    if (!canUseDefenseCard(state, res, cardId)) {
                        setError('Эта карта не бьёт выбранную атаку');
                        renderGame(res);
                        return;
                    }
                    await sendDurakAction('defend_card', { attack_card_id: attackCardId, card_id: cardId });
                    uiState.selectedCardId = null;
                    return;
                }

                if (canAttack(state, res)) {
                    await sendDurakAction('attack_card', { card_id: cardId });
                    uiState.selectedCardId = null;
                    return;
                }

                renderGame(res);
            };
        });

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
                uiState.selectedCardId = null;
                await sendDurakAction('defend_card', { attack_card_id: attackCardId, card_id: cardId });
            };
        }

        const transferBtn = shell.querySelector('[data-action="transfer"]');
        if (transferBtn) {
            transferBtn.onclick = async () => {
                const cardId = uiState.selectedCardId;
                if (transferBtn.disabled || !cardId) return;
                uiState.selectedCardId = null;
                uiState.selectedAttackCardId = null;
                await sendDurakAction('transfer_card', { card_id: cardId });
            };
        }

        const returnBtn = shell.querySelector('[data-action="return-room"]');
        if (returnBtn) {
            returnBtn.onclick = () => {
                if (typeof window.finishGameSession === 'function') window.finishGameSession();
            };
        }
    }

    window.renderDurakGame = renderGame;
    window.cleanupDurakGame = cleanupResizeHandling;
})();
