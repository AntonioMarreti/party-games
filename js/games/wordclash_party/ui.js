(function () {
    const LETTER_ROWS = [
        ['Й', 'Ц', 'У', 'К', 'Е', 'Н', 'Г', 'Ш', 'Щ', 'З', 'Х', 'Ъ'],
        ['Ф', 'Ы', 'В', 'А', 'П', 'Р', 'О', 'Л', 'Д', 'Ж', 'Э'],
        ['Я', 'Ч', 'С', 'М', 'И', 'Т', 'Ь', 'Б', 'Ю']
    ];

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
                        <div class="wcp-eyebrow">Wordclash Party</div>
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

    function renderSetup(res, state, content) {
        const host = isHost(res);
        const wordLength = Number(state.word_length || 5);
        const roundCount = Number(state.round_count || 3);
        content.innerHTML = `
            <section class="wcp-panel">
                <div class="wcp-panel-head">
                    <h3>Настройки MVP</h3>
                    <p>Лучше от 3 игроков: один ведущий загадывает слово, остальные угадывают.</p>
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

        content.innerHTML = `
            <section class="wcp-panel">
                <div class="wcp-panel-head">
                    <h3>${amLeader ? 'Выберите слово' : 'Ведущий выбирает слово'}</h3>
                    <p>${amLeader ? 'Эти варианты видны только вам.' : `Ведущий: ${esc(playerName(leader))}`}</p>
                </div>
                ${amLeader ? `
                    <div class="wcp-candidates">
                        ${candidates.map(word => `
                            <button type="button" class="wcp-word-choice" onclick="window.wcpChooseWord('${esc(word)}')">${esc(String(word).toUpperCase())}</button>
                        `).join('')}
                    </div>
                ` : `
                    <div class="wcp-waiting"><i class="bi bi-hourglass-split"></i> Скоро начнём раунд.</div>
                `}
                ${renderScoreboard(res, state)}
            </section>
        `;
    }

    function renderGuessList(res, state, userId = null) {
        const length = Number(state.word_length || 5);
        const guesses = state.guesses || {};
        const ids = userId ? [String(userId)] : Object.keys(guesses);
        if (ids.length === 0) {
            return '<div class="wcp-empty">Пока нет попыток.</div>';
        }

        return ids.map(id => {
            const player = getPlayer(res, id);
            const entries = guesses[id] || [];
            return `
                <div class="wcp-guess-card">
                    <div class="wcp-guess-name">${esc(playerName(player))}</div>
                    ${entries.length ? entries.map(entry => renderTiles(entry.word, entry.pattern, length)).join('') : '<div class="wcp-empty small">Нет попыток</div>'}
                </div>
            `;
        }).join('');
    }

    function renderKeyboard() {
        return `
            <div class="wcp-keyboard" aria-hidden="true">
                ${LETTER_ROWS.map(row => `
                    <div class="wcp-key-row">
                        ${row.map(letter => `<button type="button" class="wcp-key" onclick="window.wcpAddLetter('${letter}')">${letter}</button>`).join('')}
                    </div>
                `).join('')}
                <div class="wcp-action-row">
                    <button type="button" class="wcp-key wcp-key-wide" onclick="window.wcpBackspace()"><i class="bi bi-backspace"></i></button>
                    <button type="button" class="wcp-submit-btn" onclick="window.wcpSubmitGuess()">Проверить</button>
                </div>
            </div>
        `;
    }

    function renderPlaying(res, state, content) {
        const myId = String(res.user.id);
        const leaderId = String(state.leader_id || '');
        const leader = getPlayer(res, leaderId);
        const amLeader = myId === leaderId;
        const myGuesses = state.guesses?.[myId] || [];
        const guessed = !!state.guessed?.[myId];
        const attemptsLeft = Math.max(0, Number(state.attempt_limit || 6) - myGuesses.length);

        content.innerHTML = `
            <section class="wcp-panel">
                <div class="wcp-status-strip">
                    <span>Ведущий: <b>${esc(playerName(leader))}</b></span>
                    <span>${Number(state.word_length || 5)} букв</span>
                </div>
                ${amLeader ? `
                    <div class="wcp-leader-board">
                        <h3>Раунд идёт</h3>
                        <p>Вы ведущий. Следите за попытками игроков, но не отгадывайте.</p>
                        ${renderGuessList(res, state)}
                    </div>
                ` : `
                    <div class="wcp-player-board">
                        <div class="wcp-attempts">${guessed ? 'Слово угадано' : `Осталось попыток: ${attemptsLeft}`}</div>
                        ${renderGuessList(res, state, myId)}
                        <div class="wcp-input-row">
                            <input id="wcp-guess-input" class="wcp-input" maxlength="${Number(state.word_length || 5)}" placeholder="${'_'.repeat(Number(state.word_length || 5))}" onkeydown="if(event.key === 'Enter'){event.preventDefault();window.wcpSubmitGuess();}" ${guessed || attemptsLeft <= 0 ? 'disabled' : ''}>
                        </div>
                        ${renderKeyboard()}
                    </div>
                `}
                ${renderScoreboard(res, state)}
            </section>
        `;
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

        window.lastWcpRes = res;
        const state = parseState(res);
        window.lastWcpState = state;
        window.selectedGameId = 'wordclash_party';

        const content = renderShell(container);
        updateRoundPill(state);

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
        const input = document.getElementById('wcp-guess-input');
        if (!input || input.disabled) return;
        const maxLength = Number(input.getAttribute('maxlength') || 5);
        if (input.value.length < maxLength) {
            input.value += String(letter || '').toLowerCase();
        }
        input.focus();
    };

    window.wcpBackspace = function () {
        const input = document.getElementById('wcp-guess-input');
        if (!input || input.disabled) return;
        input.value = input.value.slice(0, -1);
        input.focus();
    };

    window.wcpSubmitGuess = async function () {
        const input = document.getElementById('wcp-guess-input');
        const word = String(input?.value || '').trim().toLowerCase();
        const state = window.lastWcpState || {};
        const length = Number(state.word_length || 5);
        if (word.length !== length) {
            showHint(`Нужно ${length} букв`);
            return;
        }
        const result = await sendPartyAction('submit_guess', { word });
        if (result && result.status === 'ok' && input) input.value = '';
    };
})();
