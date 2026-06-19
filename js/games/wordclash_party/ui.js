(function () {
    const LETTER_ROWS = [
        ['Й', 'Ц', 'У', 'К', 'Е', 'Н', 'Г', 'Ш', 'Щ', 'З', 'Х', 'Ъ'],
        ['Ф', 'Ы', 'В', 'А', 'П', 'Р', 'О', 'Л', 'Д', 'Ж', 'Э'],
        ['Я', 'Ч', 'С', 'М', 'И', 'Т', 'Ь', 'Б', 'Ю']
    ];
    let currentGuess = '';
    let currentGuessKey = '';

    function parseState(res) {
        const raw = res?.game_state || res?.room?.game_state;
        if (!raw) return {};
        if (typeof raw === 'string') {
            try {
                return JSON.parse(raw) || {};
            } catch (e) {
                return {};
            }
        }
        return raw;
    }

    function playerName(player) {
        return player?.display_name || player?.custom_name || player?.first_name || player?.username || 'Игрок';
    }

    function esc(value) {
        const div = document.createElement('div');
        div.textContent = value == null ? '' : String(value);
        return div.innerHTML;
    }

    function getPlayer(res, id) {
        return (res.players || []).find(player => String(player.id) === String(id));
    }

    function playerInitial(player) {
        const name = playerName(player).trim();
        return (name[0] || '?').toUpperCase();
    }

    function playerAvatarUrl(player) {
        return player?.photo_url || player?.avatar_url || player?.avatar || player?.photo || '';
    }

    function isHost(res) {
        return !!res.is_host || String(res?.room?.host_user_id) === String(res?.user?.id);
    }

    function showHint(message) {
        const hint = document.getElementById('wcp-hint');
        if (!hint) {
            if (window.showToast) window.showToast(message, 'warning');
            return;
        }
        hint.textContent = message || '';
        hint.classList.add('is-visible');
        clearTimeout(showHint._timer);
        showHint._timer = setTimeout(() => hint.classList.remove('is-visible'), 2200);
    }

    async function sendPartyAction(type, data = {}) {
        const result = await window.sendGameAction(type, data);
        if (result && result.status === 'error') {
            showHint(result.message || 'Не удалось выполнить действие');
        }
        return result;
    }

    function renderShell(container) {
        let shell = document.getElementById('wcp-shell');
        if (!shell) {
            container.innerHTML = '';
            shell = document.createElement('div');
            shell.id = 'wcp-shell';
            shell.innerHTML = `
                <div class="wcp-topbar">
                    <button type="button" class="wcp-icon-btn" onclick="window.wcpBackToLobby()" aria-label="В лобби">
                        <i class="bi bi-door-open"></i>
                    </button>
                    <div>
                        <h2 class="wcp-title">Загадай слово</h2>
                    </div>
                    <div class="wcp-round-pill" id="wcp-round-pill"></div>
                </div>
                <div id="wcp-hint" class="wcp-hint"></div>
                <div id="wcp-content" class="wcp-content"></div>
            `;
            container.appendChild(shell);
        }
        return shell.querySelector('#wcp-content');
    }

    function updateRoundPill(state) {
        const pill = document.getElementById('wcp-round-pill');
        if (!pill) return;
        const round = Number(state.current_round || 0);
        const total = state.round_count || 0;
        pill.textContent = round > 0 ? `${round}/${total}` : `${total} раунд.`;
    }

    function renderScoreboard(res, state) {
        const scores = state.scores || {};
        const players = [...(res.players || [])].sort((a, b) => Number(scores[b.id] || 0) - Number(scores[a.id] || 0));
        return `
            <div class="wcp-scoreboard">
                ${players.map(player => `
                    <div class="wcp-score-row">
                        <span>${esc(playerName(player))}</span>
                        <b>${Number(scores[player.id] || 0)}</b>
                    </div>
                `).join('')}
            </div>
        `;
    }

    function renderTiles(word, pattern, length) {
        const letters = String(word || '').toUpperCase().split('');
        const values = Array.isArray(pattern) ? pattern : [];
        let html = '';
        for (let i = 0; i < length; i++) {
            const cls = values[i] === 2 ? 'is-correct' : values[i] === 1 ? 'is-present' : values[i] === 0 ? 'is-absent' : '';
            html += `<span class="wcp-tile ${cls}">${esc(letters[i] || '')}</span>`;
        }
        return `<div class="wcp-tiles">${html}</div>`;
    }

    function renderGuessRow(res, userId, entry, length) {
        const player = getPlayer(res, userId);
        const avatarHtml = window.renderAvatar
            ? window.renderAvatar(player, 'sm', false, true)
            : `
                <div class="wcp-avatar" aria-hidden="true">
                    <span>${esc(playerInitial(player))}</span>
                    ${playerAvatarUrl(player) ? `<img src="${esc(playerAvatarUrl(player))}" alt="" onerror="this.remove()">` : ''}
                </div>
            `;
        return `
            <div class="wcp-guess-row" title="${esc(playerName(player))}">
                ${avatarHtml}
                ${renderTiles(entry.word, entry.pattern, length)}
            </div>
        `;
    }

    function renderLeaderMeta(leader) {
        const avatarHtml = window.renderAvatar
            ? window.renderAvatar(leader, 'sm', false, true)
            : `
                <span class="wcp-meta-avatar" aria-hidden="true">
                    <span>${esc(playerInitial(leader))}</span>
                    ${playerAvatarUrl(leader) ? `<img src="${esc(playerAvatarUrl(leader))}" alt="" onerror="this.remove()">` : ''}
                </span>
            `;
        return `
            <span class="wcp-meta-leader">
                ${avatarHtml}
                <b>${esc(playerName(leader))}</b>
            </span>
        `;
    }

    function renderMeta(items) {
        return `
            <div class="wcp-meta">
                ${items.filter(Boolean).map(item => `<span>${item}</span>`).join('')}
            </div>
        `;
    }

    function syncCurrentGuess(state, myId) {
        const guesses = state.guesses?.[myId] || [];
        const key = `${state.current_round || 0}:${myId}:${guesses.length}:${state.phase}:${state.guessed?.[myId] ? 1 : 0}`;
        if (currentGuessKey !== key) {
            currentGuess = '';
            currentGuessKey = key;
        }
        const length = Number(state.word_length || 5);
        if (currentGuess.length > length) {
            currentGuess = currentGuess.slice(0, length);
        }
    }

    function renderCurrentGuess(length, disabled) {
        let html = '';
        const letters = currentGuess.toUpperCase().split('');
        for (let i = 0; i < length; i++) {
            html += `<span class="wcp-current-cell ${disabled ? 'is-disabled' : ''}">${esc(letters[i] || '')}</span>`;
        }
        return `<div class="wcp-current-word" id="wcp-current-word">${html}</div>`;
    }

    function updateCurrentGuessDisplay() {
        const state = window.lastWcpState || {};
        const length = Number(state.word_length || 5);
        const wordEl = document.getElementById('wcp-current-word');
        if (!wordEl) return;

        const letters = currentGuess.toUpperCase().split('');
        wordEl.querySelectorAll('.wcp-current-cell').forEach((cell, index) => {
            cell.textContent = letters[index] || '';
            cell.classList.toggle('is-filled', !!letters[index]);
        });

        const counter = document.getElementById('wcp-current-counter');
        if (counter) counter.textContent = `${Math.min(currentGuess.length, length)}/${length}`;
    }

    function renderSetup(res, state, content) {
        const host = isHost(res);
        const wordLength = Number(state.word_length || 5);
        const roundCount = Number(state.round_count || 3);
        content.innerHTML = `
            <section class="wcp-panel">
                <div class="wcp-panel-head">
                    <h3>Настройки игры</h3>
                    <p>Ведущий выбирает слово, остальные угадывают. После раунда ведущий меняется.</p>
                </div>
                <div class="wcp-rules-card">
                    <div class="wcp-rules-title">Как играть</div>
                    <div class="wcp-rules-line">Угадайте слово за 6 попыток.</div>
                    <div class="wcp-color-legend">
                        <div><span class="wcp-legend-box correct"></span> На месте</div>
                        <div><span class="wcp-legend-box present"></span> Есть, но не там</div>
                        <div><span class="wcp-legend-box absent"></span> Нет в слове</div>
                    </div>
                </div>
                <div class="wcp-control-group">
                    <div class="wcp-label">Длина слова</div>
                    <div class="wcp-segments">
                        ${[5, 6, 7].map(len => `
                            <button type="button" class="wcp-segment ${wordLength === len ? 'is-active' : ''}" ${host ? '' : 'disabled'} onclick="window.wcpConfigure(${len}, ${roundCount})">${len}</button>
                        `).join('')}
                    </div>
                </div>
                <div class="wcp-control-group">
                    <div class="wcp-label">Раундов</div>
                    <div class="wcp-segments">
                        ${[1, 3, 5, 7].map(count => `
                            <button type="button" class="wcp-segment ${roundCount === count ? 'is-active' : ''}" ${host ? '' : 'disabled'} onclick="window.wcpConfigure(${wordLength}, ${count})">${count}</button>
                        `).join('')}
                    </div>
                </div>
                ${host ? `
                    <button type="button" class="wcp-primary-btn" onclick="window.wcpStartGame()">Начать игру</button>
                ` : `
                    <div class="wcp-waiting">Ждём, пока хост начнёт игру.</div>
                `}
            </section>
        `;
    }

    function renderLeaderChoose(res, state, content) {
        const myId = String(res.user.id);
        const leaderId = String(state.leader_id || '');
        const leader = getPlayer(res, leaderId);
        const amLeader = myId === leaderId;
        const candidates = Array.isArray(state.candidate_words) ? state.candidate_words : [];
        const rerolls = Number(state.rerolls || 0);
        const maxRerolls = 3;
        const rerollsLeft = Math.max(0, maxRerolls - rerolls);

        const isTester = (typeof window.isTesterUser === 'function' && window.isTesterUser(res.user)) ||
                         window.isTesterUser === true ||
                         res.user?.is_tester === true ||
                         res.user?.is_tester === 1 ||
                         res.user?.is_tester === '1';

        content.innerHTML = `
            <section class="wcp-panel">
                <div class="wcp-panel-head">
                    <h3>${amLeader ? 'Выберите слово' : 'Ведущий выбирает слово'}</h3>
                    <p>${amLeader ? 'Эти варианты видны только вам.' : `Ведущий: ${esc(playerName(leader))}`}</p>
                </div>
                ${amLeader ? `
                    <div class="wcp-candidates">
                        ${candidates.map(word => {
                            const isConfirming = window.wcpModerationConfirmWord === word;
                            const isReported = window.wcpReportedWords?.[word];
                            return `
                            <div class="wcp-word-card-wrap">
                                <div class="wcp-word-card">
                                    <button type="button" class="wcp-word-choice" onclick="window.wcpChooseWord('${esc(word)}')">${esc(String(word).toUpperCase())}</button>
                                    <button type="button" class="wcp-mod-btn ${isReported ? 'is-success' : ''}" onclick="event.stopPropagation(); window.wcpPromptModeration('${esc(word)}')">
                                        <i class="bi ${isReported ? 'bi-check2' : 'bi-three-dots'}"></i>
                                    </button>
                                </div>
                                ${isConfirming ? `
                                <div class="wcp-mod-confirm" onclick="event.stopPropagation()">
                                    <div class="wcp-mod-confirm-text">${isTester ? `Добавить «${esc(String(word).toUpperCase())}» в стоп-лист?` : `Пожаловаться на «${esc(String(word).toUpperCase())}»?`}</div>
                                    <div class="wcp-mod-confirm-actions">
                                        <button type="button" class="wcp-mod-confirm-btn cancel" onclick="window.wcpCancelModeration()">Отмена</button>
                                        ${isTester
                                            ? `<button type="button" class="wcp-mod-confirm-btn danger" onclick="window.wcpBlockWord('${esc(word)}', this)">В стоп-лист</button>`
                                            : `<button type="button" class="wcp-mod-confirm-btn danger" onclick="window.wcpReportWord('${esc(word)}', this)">Пожаловаться</button>`
                                        }
                                    </div>
                                </div>
                                ` : ''}
                            </div>
                            `;
                        }).join('')}
                    </div>
                    <div class="wcp-word-actions">
                        <button type="button" class="wcp-secondary-btn" onclick="window.wcpRerollCandidates()" ${rerollsLeft <= 0 ? 'disabled' : ''}>
                            <i class="bi bi-arrow-clockwise"></i> ${rerollsLeft > 0 ? `Обновить варианты · ${rerollsLeft} осталось` : 'Обновления закончились'}
                        </button>
                    </div>
                ` : `
                    <div class="wcp-waiting"><i class="bi bi-hourglass-split"></i> Скоро начнём раунд.</div>
                `}
            </section>
        `;
    }

    function renderGuessList(res, state, userId = null, options = {}) {
        const length = Number(state.word_length || 5);
        const guesses = state.guesses || {};
        const ids = userId ? [String(userId)] : Object.keys(guesses);
        if (ids.length === 0) {
            return options.compactEmpty ? '' : '<div class="wcp-empty">Пока нет попыток.</div>';
        }

        return ids.map(id => {
            const player = getPlayer(res, id);
            const entries = guesses[id] || [];
            return `
                <div class="wcp-guess-card">
                    ${options.showName === false ? '' : `<div class="wcp-guess-name">${esc(playerName(player))}</div>`}
                    ${entries.length ? entries.map(entry => renderGuessRow(res, id, entry, length)).join('') : options.compactEmpty ? '' : '<div class="wcp-empty small">Нет попыток</div>'}
                </div>
            `;
        }).join('');
    }

    function renderLeaderProgress(res, state) {
        const leaderId = String(state.leader_id || '');
        const length = Number(state.word_length || 5);
        const limit = Number(state.attempt_limit || 6);
        const players = Array.isArray(state.players) && state.players.length ? state.players : (res.players || []).map(player => String(player.id));
        const guesserIds = players.map(String).filter(id => id !== leaderId);

        if (!guesserIds.length) {
            return '<div class="wcp-empty">Нет игроков для отгадывания.</div>';
        }

        return `
            <div class="wcp-progress-list">
                ${guesserIds.map(id => {
                    const player = getPlayer(res, id);
                    const entries = state.guesses?.[id] || [];
                    const didGuess = !!state.guessed?.[id];
                    const isOut = !didGuess && entries.length >= limit;
                    const status = didGuess ? 'угадал' : isOut ? 'выбыл' : `${entries.length}/${limit}`;
                    return `
                        <div class="wcp-progress-row">
                            <div class="wcp-progress-head">
                                <span>${esc(playerName(player))}</span>
                                <b class="${didGuess ? 'is-guessed' : isOut ? 'is-out' : ''}">${status}</b>
                            </div>
                            <div class="wcp-player-history">
                                ${entries.length > 0
                                    ? entries.map(entry => renderGuessRow(res, id, entry, length)).join('')
                                    : '<div class="wcp-progress-empty">0 попыток</div>'
                                }
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    }

    function renderKeyboard(disabled = false) {
        const disabledAttr = disabled ? 'disabled' : '';
        return `
            <div class="wcp-keyboard" aria-hidden="true">
                ${LETTER_ROWS.map((row, rowIndex) => `
                    <div class="wcp-key-row">
                        ${row.map(letter => `<button type="button" class="wcp-key" data-key="${letter}" ${disabledAttr} onclick="window.wcpAddLetter('${letter}')">${letter}</button>`).join('')}
                        ${rowIndex === 2 ? `
                            <button type="button" class="wcp-key wcp-key-wide" ${disabledAttr} onclick="window.wcpBackspace()">
                                <i class="bi bi-backspace"></i>
                            </button>
                        ` : ''}
                    </div>
                `).join('')}
                <button type="button" class="wcp-submit-btn" ${disabledAttr} onclick="window.wcpSubmitGuess()">Проверить</button>
            </div>
        `;
    }

    const WCP_KEY_STATE_RANK = {
        absent: 0,
        present: 1,
        correct: 2
    };

    function getKeyboardLetterStates(guesses) {
        const states = {};
        (guesses || []).forEach(entry => {
            const word = String(entry.word || '').toUpperCase();
            const pattern = Array.isArray(entry.pattern) ? entry.pattern : [];

            word.split('').forEach((letter, index) => {
                const value = Number(pattern[index]);
                const nextState = value === 2 ? 'correct' : value === 1 ? 'present' : value === 0 ? 'absent' : '';
                if (!nextState) return;

                const currentState = states[letter];
                if (!currentState || WCP_KEY_STATE_RANK[nextState] > WCP_KEY_STATE_RANK[currentState]) {
                    states[letter] = nextState;
                }
            });
        });
        return states;
    }

    function updateKeyboardLetterStates(state, myId) {
        const guesses = state.guesses?.[myId] || [];
        const letterStates = getKeyboardLetterStates(guesses);
        document.querySelectorAll('.wcp-key[data-key]').forEach(keyEl => {
            const key = keyEl.dataset.key;
            keyEl.classList.remove('is-absent', 'is-present', 'is-correct');
            if (!key) return;

            const letterState = letterStates[key.toUpperCase()];
            if (letterState) keyEl.classList.add(`is-${letterState}`);
        });
    }

    function renderPlaying(res, state, content) {
        const myId = String(res.user.id);
        const leaderId = String(state.leader_id || '');
        const leader = getPlayer(res, leaderId);
        const amLeader = myId === leaderId;
        const myGuesses = state.guesses?.[myId] || [];
        const guessed = !!state.guessed?.[myId];
        const attemptsLeft = Math.max(0, Number(state.attempt_limit || 6) - myGuesses.length);
        const wordLength = Number(state.word_length || 5);
        const inputDisabled = guessed || attemptsLeft <= 0;
        syncCurrentGuess(state, myId);

        if (amLeader) {
            content.innerHTML = `
                <section class="wcp-panel wcp-playing-panel" style="display: flex; flex-direction: column; flex: 1 1 auto; min-height: 0; padding-bottom: 0;">
                    ${renderMeta([
                        `${wordLength} букв`,
                        `Раунд ${Number(state.current_round || 0)}/${Number(state.round_count || 0)}`
                    ])}
                    <div class="wcp-leader-board" style="flex: 1 1 auto; overflow-y: auto; padding-bottom: 16px;">
                        <h3>Вы ведущий</h3>
                        <p>Следите за попытками игроков.</p>
                        ${renderLeaderProgress(res, state)}
                    </div>
                    <div class="wcp-leader-dock">
                        <div class="wcp-leader-reactions" aria-label="Реакции ведущего">
                            <button type="button" onclick="window.sendGameAction('leader_react', {reaction: '🔥'})">🔥</button>
                            <button type="button" onclick="window.sendGameAction('leader_react', {reaction: '😈'})">😈</button>
                            <button type="button" onclick="window.sendGameAction('leader_react', {reaction: '👀'})">👀</button>
                            <button type="button" onclick="window.sendGameAction('leader_react', {reaction: 'почти'})">почти</button>
                            <button type="button" onclick="window.sendGameAction('leader_react', {reaction: 'мимо'})">мимо</button>
                        </div>
                    </div>
                </section>
            `;
            return;
        }

        let reactionHtml = '';
        if (state.leader_reaction && (Date.now() / 1000 - state.leader_reaction.ts < 5)) {
            reactionHtml = `<div class="wcp-leader-reaction-toast">Ведущий: ${esc(state.leader_reaction.text)}</div>`;
        }

        content.innerHTML = `
            <section class="wcp-guesser-screen">
                <div class="wcp-guesser-meta">
                    <div class="wcp-meta-item wcp-meta-host">
                        <span class="wcp-meta-label">Ведущий</span>
                        ${renderLeaderMeta(leader)}
                    </div>
                    <div class="wcp-meta-item wcp-meta-info">
                        <span class="wcp-badge wcp-badge-length">${wordLength} букв</span>
                        <span class="wcp-badge wcp-badge-attempts ${attemptsLeft <= 2 ? 'is-warning' : ''}">
                            ${guessed ? 'Угадано' : attemptsLeft > 0 ? `Попыток: ${attemptsLeft}` : 'Выбыл'}
                        </span>
                    </div>
                </div>
                <div class="wcp-attempts-stream">
                    <div class="wcp-guess-history">
                        ${renderGuessList(res, state, myId, { compactEmpty: true, showName: false })}
                    </div>
                </div>
                <div class="wcp-bottom-input">
                    ${reactionHtml}
                    <div class="wcp-current-wrap">
                        ${renderCurrentGuess(wordLength, inputDisabled)}
                        <div class="wcp-current-counter" id="wcp-current-counter">${currentGuess.length}/${wordLength}</div>
                    </div>
                    ${renderKeyboard(inputDisabled)}
                </div>
            </section>
        `;
        updateKeyboardLetterStates(state, myId);
        setTimeout(() => {
            const stream = content.querySelector('.wcp-attempts-stream');
            if (stream) stream.scrollTop = stream.scrollHeight;
        }, 0);
    }

    function renderIntermission(res, state, content) {
        const secret = String(state.secret_word || '').toUpperCase();
        const results = Array.isArray(state.round_results) ? state.round_results : [];
        const host = isHost(res);

        content.innerHTML = `
            <section class="wcp-panel">
                <div class="wcp-result-hero">
                    <div class="wcp-label">Загаданное слово</div>
                    <div class="wcp-secret">${esc(secret)}</div>
                </div>
                <div class="wcp-results-list">
                    ${results.map(result => {
                        const player = getPlayer(res, result.user_id);
                        return `
                            <div class="wcp-result-row">
                                <span>${esc(playerName(player))}</span>
                                <b>${result.guessed ? `угадал за ${result.attempts}` : 'не угадал'}</b>
                            </div>
                        `;
                    }).join('')}
                </div>
                ${renderScoreboard(res, state)}
                ${host ? `
                    <button type="button" class="wcp-primary-btn" onclick="window.wcpNextRound()">Следующий раунд</button>
                ` : `
                    <div class="wcp-waiting">Ждём следующий раунд.</div>
                `}
            </section>
        `;
    }

    function renderGameOver(res, state, content) {
        const host = isHost(res);
        content.innerHTML = `
            <section class="wcp-panel">
                <div class="wcp-result-hero">
                    <div class="wcp-label">Игра окончена</div>
                    <div class="wcp-secret">${esc(String(state.secret_word || '').toUpperCase())}</div>
                </div>
                ${renderScoreboard(res, state)}
                <div class="wcp-actions">
                    ${host ? `<button type="button" class="wcp-primary-btn" onclick="window.wcpRestartGame()">Сыграть снова</button>` : ''}
                    <button type="button" class="wcp-secondary-btn" onclick="window.wcpBackToLobby()">В лобби</button>
                </div>
            </section>
        `;
    }

    window.renderWordClashParty = function (res) {
        const container = document.getElementById('game-area');
        if (!container) return;

        if (isHost(res)) {
            if (!window.wcpTickInterval) {
                window.wcpTickInterval = setInterval(() => {
                    if (window.selectedGameId === 'wordclash_party' && document.getElementById('wcp-shell')) {
                        // Используем apiRequest напрямую, чтобы избежать глобального showAlert на ошибки (например, десинхрон фаз)
                        if (typeof window.apiRequest === 'function') {
                            window.apiRequest({ action: 'game_action', type: 'tick' }).catch(() => {});
                        }
                    } else {
                        clearInterval(window.wcpTickInterval);
                        window.wcpTickInterval = null;
                    }
                }, 3000);
            }
        } else if (window.wcpTickInterval) {
            clearInterval(window.wcpTickInterval);
            window.wcpTickInterval = null;
        }


        window.lastWcpRes = res;
        const state = parseState(res);
        window.lastWcpState = state;
        window._wcpLastRes = res;
        window._wcpLastState = state;
        window.selectedGameId = 'wordclash_party';

        const content = renderShell(container);
        updateRoundPill(state);
        const shell = document.getElementById('wcp-shell');
        const title = document.querySelector('#wcp-shell .wcp-title');
        const myId = String(res?.user?.id || '');
        const leaderId = String(state.leader_id || '');
        const isPlaying = state.phase === 'playing';
        const isDarkSurface = ['setup', 'leader_choose', 'playing', 'intermission', 'game_over'].includes(state.phase);
        const guesserPlaying = isPlaying && myId !== leaderId;
        const leaderPlaying = isPlaying && myId === leaderId;
        if (shell) {
            shell.classList.toggle('is-dark-surface', isDarkSurface);
            shell.classList.toggle('is-playing', isPlaying);
            shell.classList.toggle('is-guesser-playing', guesserPlaying);
            shell.classList.toggle('is-leader-playing', leaderPlaying);
        }
        if (title) {
            title.textContent = guesserPlaying ? 'Отгадай слово' : 'Загадай слово';
        }

        if (state.phase === 'setup') renderSetup(res, state, content);
        else if (state.phase === 'leader_choose') renderLeaderChoose(res, state, content);
        else if (state.phase === 'playing') renderPlaying(res, state, content);
        else if (state.phase === 'intermission') renderIntermission(res, state, content);
        else if (state.phase === 'game_over') renderGameOver(res, state, content);
        else content.innerHTML = '<div class="wcp-panel">Неизвестное состояние игры.</div>';
    };

    window.wcpConfigure = function (wordLength, roundCount) {
        return sendPartyAction('configure_game', { word_length: wordLength, round_count: roundCount });
    };

    window.wcpStartGame = function () {
        return sendPartyAction('start_game');
    };

    window.wcpChooseWord = function (word) {
        return sendPartyAction('choose_word', { word });
    };

    window.wcpRerollCandidates = function () {
        window.wcpModerationConfirmWord = null;
        return sendPartyAction('reroll_candidates');
    };

    window.wcpPromptModeration = function(word) {
        window.wcpModerationConfirmWord = word;
        if (window.lastWcpRes) window.renderWordClashParty(window.lastWcpRes);
    };

    window.wcpCancelModeration = function() {
        window.wcpModerationConfirmWord = null;
        if (window.lastWcpRes) window.renderWordClashParty(window.lastWcpRes);
    };

    window.wcpReportWord = async function (word, btn) {
        if (btn) btn.disabled = true;
        const result = await sendPartyAction('report_word', { word });
        if (result && result.status === 'ok') {
            window.wcpModerationConfirmWord = null;
            window.wcpReportedWords = window.wcpReportedWords || {};
            window.wcpReportedWords[word] = true;
            if (btn) {
                btn.innerHTML = '<i class="bi bi-check2"></i>';
            }
            showHint('Жалоба отправлена');
            if (window.lastWcpRes) window.renderWordClashParty(window.lastWcpRes);
        } else if (btn) {
            btn.disabled = false;
        }
    };

    window.wcpBlockWord = async function (word, btn) {
        if (btn) btn.disabled = true;
        const wrap = btn.closest('.wcp-word-card-wrap');
        if (wrap) {
            wrap.style.opacity = '0.5';
            wrap.style.pointerEvents = 'none';
        }
        const result = await sendPartyAction('block_word', { word });
        if (result && result.status === 'ok') {
            window.wcpModerationConfirmWord = null;
            if (btn) {
                btn.innerHTML = '<i class="bi bi-check2"></i>';
            }
            showHint('Слово в стоп-листе, кандидат заменён');
            // Card will be replaced completely via state sync
        } else {
            if (btn) btn.disabled = false;
            if (wrap) {
                wrap.style.opacity = '';
                wrap.style.pointerEvents = '';
            }
        }
    };

    window.wcpNextRound = function () {
        return sendPartyAction('next_round');
    };

    window.wcpRestartGame = function () {
        return sendPartyAction('restart_game');
    };

    window.wcpBackToLobby = function () {
        const res = window.lastWcpRes;
        if (res && !isHost(res) && typeof window.leaveRoom === 'function') {
            return window.leaveRoom();
        }
        return sendPartyAction('back_to_lobby');
    };

    window.wcpAddLetter = function (letter) {
        const state = window.lastWcpState || {};
        const length = Number(state.word_length || 5);
        if (currentGuess.length < length) {
            currentGuess += String(letter || '').toLowerCase();
        }
        updateCurrentGuessDisplay();
    };

    window.wcpBackspace = function () {
        currentGuess = currentGuess.slice(0, -1);
        updateCurrentGuessDisplay();
    };

    window.wcpSubmitGuess = async function () {
        const word = String(currentGuess || '').trim().toLowerCase();
        const state = window.lastWcpState || {};
        const length = Number(state.word_length || 5);
        if (word.length !== length) {
            showHint(`Нужно ${length} букв`);
            return;
        }
        const result = await sendPartyAction('submit_guess', { word });
        if (result && result.status === 'ok') {
            currentGuess = '';
            updateCurrentGuessDisplay();
        }
    };

    if (!window._wcpPhysicalKeyboardListenerAdded) {
        document.addEventListener('keydown', function(e) {
            if (e.ctrlKey || e.altKey || e.metaKey) return;
            if (!document.getElementById('wcp-shell')) return;

            const state = window._wcpLastState;
            const res = window._wcpLastRes;
            if (!state || state.phase !== 'playing' || !res || !res.user) return;

            const myId = String(res.user.id);
            const leaderId = String(state.leader_id || '');
            if (myId === leaderId) return;

            const tag = e.target.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target.isContentEditable) return;

            if (e.key === 'Backspace') {
                e.preventDefault();
                if (window.wcpBackspace) window.wcpBackspace();
                return;
            }
            if (e.key === 'Enter') {
                e.preventDefault();
                if (window.wcpSubmitGuess) window.wcpSubmitGuess();
                return;
            }

            if (/^[а-яё]$/i.test(e.key)) {
                e.preventDefault();
                let letter = e.key.toUpperCase();
                if (letter === 'Ё') letter = 'Е';
                if (window.wcpAddLetter) window.wcpAddLetter(letter);
            }
        });
        window._wcpPhysicalKeyboardListenerAdded = true;
    }
})();
