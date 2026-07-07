(function () {
    const DURAK_SUITS = {
        S: { symbol: '♠', label: 'пики', tone: 'black' },
        H: { symbol: '♥', label: 'черви', tone: 'red' },
        D: { symbol: '♦', label: 'бубны', tone: 'red' },
        C: { symbol: '♣', label: 'трефы', tone: 'black' }
    };

    const uiState = {
        selectedCardId: null,
        selectedAttackCardId: null,
        busy: false,
        lastError: ''
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

    function openAttacks(state) {
        return (state.table || []).filter(pair => pair?.attack && !pair?.defend);
    }

    function selectedAttackIsValid(state) {
        return openAttacks(state).some(pair => pair.attack === uiState.selectedAttackCardId);
    }

    function statusCopy(state, res) {
        if (state.phase === 'finished') {
            if (state.result?.reason === 'all_finished') return 'Партия завершена без проигравшего';
            const loser = getPlayer(res, state.result?.loser_id);
            return loser ? `${playerName(loser)} остался с картами` : 'Партия завершена';
        }

        const actor = getPlayer(res, state.actor_id);
        const actorName = actor ? playerName(actor) : 'Игрок';
        if (isMyTurn(state, res)) {
            if (state.phase === 'defense') return 'Твоя защита';
            if (state.defender_mode === 'taking') return 'Можно подкинуть или пасовать';
            return (state.table || []).length ? 'Твой ход: подкинь или пасуй' : 'Твоя атака';
        }
        if (state.phase === 'defense') return `${actorName} защищается`;
        if (state.defender_mode === 'taking') return `${actorName} решает подкинуть`;
        return `Ходит ${actorName}`;
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
                        <div class="durak-kicker">Подкидной</div>
                        <h2>Дурак</h2>
                    </div>
                    <div class="durak-status-pill" id="durak-status-pill"></div>
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
            options.ghost ? 'is-ghost' : ''
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

    function renderTable(state) {
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
            <div class="durak-table-grid">
                ${table.map(pair => {
                    const open = pair.attack && !pair.defend;
                    const selected = uiState.selectedAttackCardId === pair.attack;
                    return `
                        <button type="button"
                            class="durak-trick ${open ? 'is-open' : ''} ${selected ? 'is-selected' : ''}"
                            data-attack-card="${esc(pair.attack || '')}"
                            ${open ? '' : 'disabled'}>
                            ${pair.attack ? renderCard(pair.attack, { small: true }) : ''}
                            <div class="durak-trick-arrow"></div>
                            ${pair.defend ? renderCard(pair.defend, { small: true }) : '<div class="durak-card-slot">Защита</div>'}
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

    function renderHand(state, res) {
        const cards = state.my_hand || [];
        const disabled = !isMyTurn(state, res) || uiState.busy || state.phase === 'finished';
        const actionHint = isMyDefenseTurn(state, res)
            ? 'Выбери открытую атаку на столе, затем карту защиты'
            : canAttack(state, res)
                ? ((state.table || []).length ? 'Подкинь карту совпадающего ранга или пасуй' : 'Выбери карту для атаки')
                : 'Ждём ход соперника';

        return `
            <div class="durak-hand-head">
                <div>
                    <div class="durak-hand-title">Твоя рука</div>
                    <div class="durak-hand-hint">${esc(actionHint)}</div>
                </div>
                <div class="durak-hand-count">${cards.length}</div>
            </div>
            <div class="durak-hand" role="list">
                ${cards.map(cardId => renderCard(cardId, {
                    button: true,
                    disabled,
                    selected: uiState.selectedCardId === cardId
                })).join('')}
            </div>
        `;
    }

    function renderControls(state, res) {
        if (state.phase === 'finished') {
            return '<div class="durak-final">Партия завершена</div>';
        }
        return `
            <div class="durak-actions">
                <button type="button" class="durak-action-btn" data-action="pass" ${canPass(state, res) && !uiState.busy ? '' : 'disabled'}>Пас</button>
                <button type="button" class="durak-action-btn is-danger" data-action="take" ${canTake(state, res) && !uiState.busy ? '' : 'disabled'}>Взять</button>
            </div>
        `;
    }

    function renderGame(res) {
        const state = parseState(res);
        if (!selectedAttackIsValid(state)) uiState.selectedAttackCardId = null;
        if (!Array.isArray(state.my_hand) || !state.my_hand.includes(uiState.selectedCardId)) uiState.selectedCardId = null;

        const gameArea = document.getElementById('game-area');
        if (!gameArea) return;

        const shell = renderShell(gameArea);
        const status = shell.querySelector('#durak-status-pill');
        if (status) status.textContent = statusCopy(state, res);

        const error = shell.querySelector('#durak-error');
        if (error) {
            error.textContent = uiState.lastError || '';
            error.hidden = !uiState.lastError;
        }

        const board = shell.querySelector('#durak-board');
        if (board) {
            board.innerHTML = `
                <div class="durak-seats">${renderPlayers(res, state)}</div>
                <div class="durak-center">
                    ${renderDeck(state)}
                    ${renderTable(state)}
                    ${renderControls(state, res)}
                </div>
            `;
        }

        const hand = shell.querySelector('#durak-hand-shell');
        if (hand) hand.innerHTML = renderHand(state, res);

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
        }
    }

    function bindEvents(shell, state, res) {
        shell.querySelectorAll('[data-attack-card]').forEach(button => {
            button.onclick = () => {
                if (!isMyDefenseTurn(state, res) || button.disabled) return;
                uiState.selectedAttackCardId = button.dataset.attackCard || '';
                renderGame(res);
            };
        });

        shell.querySelectorAll('.durak-hand .durak-card').forEach(button => {
            button.onclick = async () => {
                if (button.disabled) return;
                const cardId = button.dataset.cardId || '';
                uiState.selectedCardId = cardId;

                if (isMyDefenseTurn(state, res)) {
                    const attackCardId = uiState.selectedAttackCardId || '';
                    if (!attackCardId) {
                        setError('Выбери карту атаки на столе');
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
    }

    window.renderDurakGame = renderGame;
})();
