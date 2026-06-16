// Keyboard mode preference (GLOBAL)
function isMobilePlatform() {
    if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.platform) {
        const p = window.Telegram.WebApp.platform;
        return p === 'ios' || p === 'android' || p === 'weba' || p === 'mobile';
    }
    return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}

function useCustomKeyboard() {
    const pref = localStorage.getItem('wc_keyboard_mode');
    if (pref) return pref === 'custom';

    // Default: custom (built-in) for mobile, system for others
    return isMobilePlatform();
}

window.toggleKeyboardMode = function (e) {
    if (e) e.stopPropagation();
    const current = useCustomKeyboard();
    localStorage.setItem('wc_keyboard_mode', current ? 'system' : 'custom');
    location.reload();
};

window.exitToLobby = async function () {
    const res = window.lastWCRes;
    const state = window.lastWCState;

    // Автоматически сохраняем результаты, если хост выходит во время активной игры (не в фазе настройки)
    if (!window.__wcFinishing && res && res.is_host && state && state.phase !== 'setup' && state.scores) {
        await window.finishWordClash();
        return; // finishWordClash сам перезагрузит страницу
    }
    location.reload();
};

window.finishWordClash = async function () {
    const res = window.lastWCRes;
    const state = window.lastWCState;
    window.__wcFinishing = true;

    if (!res || !state || !state.scores) {
        window.exitToLobby();
        return;
    }

    // Собираем данные всех игроков (даже с 0 очков)
    const playersData = res.players.map(p => {
        const score = parseInt(state.scores[p.id] || 0);
        return {
            user_id: parseInt(p.id),
            score: score
        };
    });

    // Сортируем по убыванию очков для определения ранга
    playersData.sort((a, b) => b.score - a.score);
    playersData.forEach((p, idx) => {
        p.rank = idx + 1;
    });

    // Старые партии могли не иметь server-side записи. Новые финалы сохраняются сервером.
    if (window.submitGameResults && !state.stats_recorded) {
        await window.submitGameResults(playersData);
    }

    // Возвращаемся в лобби
    window.exitToLobby();
};

function renderWordClash(res) {
    window.lastWCRes = res;
    let container = document.getElementById('game-area');
    if (!container) return;
    if (!res || !res.room) return;

    // Handle both old and new state formats
    let state = res.game_state || (typeof res.room.game_state === 'string'
        ? JSON.parse(res.room.game_state)
        : res.room.game_state);
    window.lastWCState = state;
    if (!state) return;

    // Backwards compatibility: if no phase, assume 'playing'
    if (!state.phase) {
        state.phase = 'playing';
        state.word_length = 5; // Default to 5 for old games
    }

    // --- SETUP PHASE ---
    if (state.phase === 'setup') {
        renderSetupScreen(res, container);
        return;
    }

    // Скрываем общие элементы интерфейса лобби
    ['default-game-header', 'game-host-controls', 'score-card'].forEach(id => {
        const el = document.getElementById(id); if (el) el.style.display = 'none';
    });
    document.body.classList.add('wordclash-active');

    // Ensure Global Game ID is set for Error Handling (app.js interceptor)
    window.selectedGameId = 'wordclash';

    // --- WRAPPER SETUP ---
    // --- WRAPPER SETUP ---
    let wrapper = document.getElementById('wc-wrapper');
    if (!wrapper) {
        container.innerHTML = '';
        wrapper = document.createElement('div');
        wrapper.id = 'wc-wrapper';
        wrapper.className = 'game-custom-wrapper';

        // Fix for Safe Area & Status Bar Overlap
        // We use a large top padding to ensure we clear any notch
        // wrapper.style.paddingTop = 'max(35px, env(safe-area-inset-top) + 10px)'; // Moved to header

        // Force background to cover full screen
        wrapper.style.background = 'let(--bg-app)'; // Use app bg or specific WC gradient if needed
        wrapper.style.zIndex = '100'; // Ensure it sits on top
        wrapper.style.position = 'relative';

        // DYNAMIC VIEWPORT HEIGHT FIX
        // Instead of 100dvh, we track visualViewport to ensure layout shrinks when keyboard opens
        const setHeight = () => {
            if (window.visualViewport) {
                wrapper.style.height = window.visualViewport.height + 'px';
                // Also fix top/scroll if needed? No, just height usually enough for flex
            } else {
                wrapper.style.height = window.innerHeight + 'px';
            }
        };

        window.visualViewport ? window.visualViewport.addEventListener('resize', setHeight) : window.addEventListener('resize', setHeight);
        setHeight(); // Initial set

        wrapper.style.display = 'flex';
        wrapper.style.flexDirection = 'column';
        wrapper.style.overflow = 'hidden'; // Prevent body scroll
        container.appendChild(wrapper);
    }

    // --- HEADER ---
    let header = document.getElementById('wc-header');
    if (!header) {
        header = document.createElement('div');
        header.id = 'wc-header';
        // Padding top handles the status bar area - Increased base padding to clear Telegram WebApp buttons
        // Padding top handles the status bar area - Increased base padding to clear Telegram WebApp buttons
        header.className = 'text-center text-white fw-bold d-flex justify-content-between align-items-center';

        // Floating Header Style
        header.style.position = 'fixed'; /* Fixed to viewport to prevent "flying away" on keyboard open */
        header.style.top = 'calc(50px + env(safe-area-inset-top))'; /* Lowered significantly to clear island */
        header.style.left = '16px';
        header.style.right = '16px';
        header.style.padding = '16px'; // Uniform padding
        header.style.borderRadius = '32px';
        header.style.background = 'let(--bg-glass-strong)'; // Match input area
        header.style.backdropFilter = 'blur(20px)';
        header.style.zIndex = '1000';
        header.style.boxShadow = 'let(--shadow-main)';
        header.style.border = 'let(--border-glass)';
        wrapper.appendChild(header);
    }

    // Update Header Content (Score)
    // Update Header Content (Score)
    let myScore = (state.scores && state.scores[res.user.id]) || 0;
    // Only update header if score changed to prevent flickering
    // Only update header if score changed (though now it's static, keeping logic for safety or future)
    if (header.dataset.score !== String(myScore)) {
        header.dataset.score = String(myScore);
        header.innerHTML = `
            <div class="position-relative w-100 d-flex align-items-center justify-content-between">
                <!-- Left side empty (Score removed) -->
                <div class="text-start position-relative" style="z-index: 2; min-width: 80px;"></div>
                
                <div class="position-absolute top-50 start-50 translate-middle text-center" style="width: 100%; pointer-events: auto; z-index: 1;">
                    <!-- Title centered perfectly -->
                    <h3 class="m-0 fw-bold interactable" onclick="window.toggleWcMenu(event)" style="text-shadow: 0 2px 10px rgba(0,0,0,0.5); letter-spacing: 1px; font-size: 1.5rem; cursor: pointer;">WORDCLASH <i class="bi bi-caret-down-fill small opacity-50" style="font-size: 0.8rem;"></i></h3>
                    
                    <!-- Dropdown -->
                    <div class="header-dropdown ${window.wcMenuOpen ? 'active' : ''}">
                        <button class="header-menu-item" onclick="window.toggleKeyboardMode(event)">
                            <i class="bi ${useCustomKeyboard() ? 'bi-keyboard' : 'bi-keyboard-fill'}"></i>
                            <span>${useCustomKeyboard() ? 'Системная клавиатура' : 'Встроенная клавиатура'}</span>
                        </button>
                        <button class="header-menu-item" onclick="window.exitToLobby()">
                            <i class="bi bi-door-open text-danger"></i>
                            <span class="text-danger">Выйти в лобби</span>
                        </button>
                        <button class="header-menu-item" onclick="location.reload()">
                            <i class="bi bi-arrow-clockwise"></i>
                            <span>Перезагрузить</span>
                        </button>
                    </div>
                </div>

                <div class="text-end" style="z-index: 2; min-width: 80px;">
                    <!-- Right side placeholder -->
                </div>
            </div>
        `;
    }

    // --- GAME OVER / INTERMISSION MODAL ---
    let isIntermission = state.phase === 'intermission';
    let isGameOver = state.phase === 'game_over';
    let modal = document.getElementById('wc-victory-modal');

    if ((isIntermission || isGameOver) && state.winner_id) {
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'wc-victory-modal';
            modal.className = 'wc-victory-modal';
            // Anchor inside the game wrapper to respect device frames!
            wrapper.appendChild(modal);
        }

        let winner = res.players.find(p => String(p.id) === String(state.winner_id));
        let wName = winner ? (winner.first_name || winner.username) : 'Гений слов';
        let isMe = String(state.winner_id) === String(res.user.id);

        // Only update if content/winner changed
        let modalHash = `v2-${state.phase}-${state.winner_id}-${state.secret_word}-${JSON.stringify(state.scores)}`;
        if (modal.dataset.hash !== modalHash) {
            modal.dataset.hash = modalHash;

            // Build Leaderboard
            let sortedPlayers = [...res.players].sort((a, b) => (state.scores[b.id] || 0) - (state.scores[a.id] || 0));
            let lbHtml = sortedPlayers.slice(0, 4).map(p => `
                <div class="wc-lb-row">
                    <span class="wc-lb-name">${p.first_name || p.username}</span>
                    <span class="wc-lb-score">${state.scores[p.id] || 0}</span>
                </div>
            `).join('');

            let title = isGameOver ? (isMe ? 'ТЫ ЧЕМПИОН! 🏆' : 'ИГРА ОКОНЧЕНА 💀') : 'РАУНД ЗАВЕРШЕН! 🎉';
            let roundSubtitle = state.round_count ? `Раунд ${state.current_round} из ${state.round_count}` : `Завершено раундов: ${state.current_round}`;
            const postGameSummary = isGameOver && window.GameSummaryProvider
                ? window.GameSummaryProvider.remember('wordclash', state, { players: res.players || [] })
                : null;

            modal.innerHTML = `
                <div class="wc-victory-card">
                    <div class="wc-victory-emoji mb-2">${isMe ? (isGameOver ? '🏆' : '🔥') : (isGameOver ? '💀' : '👏')}</div>
                    <div class="wc-victory-title">${title}</div>
                    <div class="text-white-50 small mb-3">${roundSubtitle}</div>
                    
                    <div class="wc-victory-subtitle">
                        ${isMe ? 'Вы угадали слово и заработали 10 баллов!' : `Угадал <b>${wName}</b>`}
                    </div>

                    <div class="wc-leaderboard">
                        <div class="text-white-50 x-small text-uppercase mb-2" style="font-size: 10px; letter-spacing: 1px;">ТОП ИГРОКОВ</div>
                        ${lbHtml}
                    </div>
                    
                    <div class="wc-secret-section">
                        <div class="wc-secret-word-label">Загаданное слово</div>
                        <div class="wc-secret-word">${state.secret_word}</div>
                    </div>

                    ${postGameSummary ? `<div class="mt-3 text-start">${window.GameSummaryProvider.render(postGameSummary, {
                        playAgainLabel: res.is_host ? 'Играть ещё раз' : 'В комнату'
                    })}</div>` : ''}

                    <div class="d-flex flex-column gap-2 mt-2">
                        ${res.is_host ? `
                            ${isIntermission ? `
                                <button class="wc-btn-primary" onclick="window.sendGameAction('next_round', {})">
                                    СЛЕДУЮЩЕЕ СЛОВО <i class="bi bi-chevron-right"></i>
                                </button>
                            ` : `
                                <button class="wc-btn-primary" onclick="window.finishWordClash()">
                                    ЗАВЕРШИТЬ ИГРУ <i class="bi bi-check-circle"></i>
                                </button>
                                <button class="wc-btn-secondary" onclick="window.sendGameAction('restart', {})" style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: white; padding: 12px; border-radius: 16px; font-weight: 700; font-size: 14px; margin-top: 5px;">
                                    ИГРАТЬ ЕЩЕ РАЗ
                                </button>
                            `}
                        ` : `
                            <div class="wc-waiting-msg" style="padding: 12px; font-size: 14px;">
                                <i class="bi bi-hourglass-split"></i> 
                                ${isGameOver ? 'Ожидание новой игры...' : 'Ожидание следующего раунда...'}
                            </div>
                        `}

                        ${!isGameOver ? `
                            <button class="wc-btn-secondary" onclick="window.exitToLobby()" style="background: rgba(255,255,255,0.1); border: 2px solid rgba(255,255,255,0.05); color: white; padding: 12px; border-radius: 16px; font-weight: 700; font-size: 14px;">
                                Выйти в лобби
                            </button>
                        ` : ''}
                    </div>
                </div>
            `;

            // Show Modal with animation
            setTimeout(() => {
                if (modal) modal.classList.add('active');
            }, 100);

            // Trigger confetti if I won
            if (isMe && window.confetti) {
                window.confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
            }
        }
    } else if (modal) {
        // Remove modal if not in victory/intermission state
        modal.remove();
    }

    // --- STREAM (GUESSES) ---
    let stream = document.getElementById('wc-stream');
    if (!stream) {
        stream = document.createElement('div');
        stream.id = 'wc-stream';
        stream.className = 'wc-stream-container';
        wrapper.appendChild(stream);
    }

    // Render History (INCREMENTAL)
    let currentHistoryLen = state.history ? state.history.length : 0;
    let lastHistoryLen = parseInt(stream.dataset.historyLen || '0');

    // Handle Reset (New Game)
    if (currentHistoryLen < lastHistoryLen) {
        stream.innerHTML = '';
        lastHistoryLen = 0;
    }

    // Initial Empty State
    if (currentHistoryLen === 0 && stream.children.length === 0) {
        stream.innerHTML = '<div class="text-white-50 text-center mt-5 animate__animated animate__fadeIn">Начинаем! 👇</div>';
    }
    // Append New Items
    else if (currentHistoryLen > lastHistoryLen) {
        // Clear "Start" message if it exists
        if (lastHistoryLen === 0) stream.innerHTML = '';

        let newItems = state.history.slice(lastHistoryLen);
        newItems.forEach(function (entry) {
            let p = res.players.find(pl => String(pl.id) === String(entry.user_id));
            let avatar = (p && p.photo_url) ? p.photo_url : `https://api.dicebear.com/7.x/bottts/svg?seed=${entry.user_id}`;
            let score = (parseInt(entry.score_delta) || 0);

            let row = document.createElement('div');
            row.className = 'wc-guess-row';

            // Avatar + Score Bubble
            row.innerHTML = `
                <div class="position-relative">
                    <img src="${avatar}" class="wc-avatar" onerror="this.onerror=null;this.src='https://api.dicebear.com/7.x/bottts/svg?seed=${entry.user_id}'">
                    ${score > 0 ? `<span class="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-warning text-dark" style="font-size:10px;">+${score}</span>` : ''}
                </div>
            `;

            // Tiles
            let grid = document.createElement('div');
            grid.className = 'wc-word-grid';

            let letters = entry.word.split('');
            letters.forEach(function (char, idx) {
                let tile = document.createElement('div');
                tile.className = `wc-tile res-${entry.pattern[idx]}`;
                tile.innerText = char;
                grid.appendChild(tile);
            });

            row.appendChild(grid);
            stream.appendChild(row);
        });

        // Update Tracker
        stream.dataset.historyLen = currentHistoryLen;

        // Auto Scroll: Ensure the LATEST item is visible at the BOTTOM of the viewport
        setTimeout(() => {
            // Force strict bottom scroll using direct scrollTop assignment
            // This is more reliable on mobile IOs than scrollIntoView for inner containers
            stream.scrollTop = stream.scrollHeight;
        }, 100);
    }

    // --- INPUT AREA (DUAL KEYBOARD SYSTEM) ---
    let inputArea = document.getElementById('wc-input-area');
    let customMode = useCustomKeyboard();

    if (!inputArea) {
        inputArea = document.createElement('div');
        inputArea.id = 'wc-input-area';

        if (customMode) {
            // CUSTOM KEYBOARD MODE
            let wordLength = state.word_length || 5;
            window.currentWordLength = wordLength; // Store for keyboard handler
            inputArea.innerHTML = `
                <div class="wc-virtual-display-row" style="position: relative;">
                    <button class="wc-exit-btn-mini shadow-sm" onclick="window.confirmExitGame()">
                        <i class="bi bi-door-open-fill"></i>
                    </button>
                    <div id="wc-error-label" class="wc-error-label"></div>
                    <div class="wc-virtual-input">${'_'.repeat(wordLength)}</div>
                </div>
                <div class="wc-keyboard">
                    <div class="wc-kb-row">
                        ${['Й', 'Ц', 'У', 'К', 'Е', 'Н', 'Г', 'Ш', 'Щ', 'З', 'Х', 'Ъ'].map(l => `<button class="wc-key" data-key="${l}">${l}</button>`).join('')}
                    </div>
                    <div class="wc-kb-row">
                        ${['Ф', 'Ы', 'В', 'А', 'П', 'Р', 'О', 'Л', 'Д', 'Ж', 'Э'].map(l => `<button class="wc-key" data-key="${l}">${l}</button>`).join('')}
                    </div>
                    <div class="wc-kb-row">
                        ${['Я', 'Ч', 'С', 'М', 'И', 'Т', 'Ь', 'Б', 'Ю'].map(l => `<button class="wc-key" data-key="${l}">${l}</button>`).join('')}
                        <button class="wc-key wc-key-wide" data-key="BACK">
                            <i class="bi bi-backspace"></i>
                        </button>
                    </div>
                </div>
                <button class="wc-check-btn" onclick="window.submitWordClash(null)">
                    ПРОВЕРИТЬ
                </button>
            `;
            wrapper.appendChild(inputArea);

            // Setup keyboard handlers
            document.querySelectorAll('.wc-key').forEach(btn => {
                btn.addEventListener('click', handleKeyPress);
            });
            updateKeyboardLetterStates(state);
        } else {
            // SYSTEM KEYBOARD MODE (Original)
            inputArea.innerHTML = `
                <form id="wc-form" class="wc-input-group" autocomplete="off" onsubmit="window.submitWordClashSystem(event)">
                    <button type="button" class="wc-exit-btn-mini shadow-sm" onclick="window.confirmExitGame()">
                        <i class="bi bi-door-open-fill"></i>
                    </button>
                    <div id="wc-error-label" class="wc-error-label"></div>
                    <input type="text" id="wc-input" class="wc-input" maxlength="5" placeholder="СЛОВО" ${state.game_over ? 'disabled' : ''}>
                    <button type="submit" class="wc-send-btn shadow" tabindex="-1" ${state.game_over ? 'disabled' : ''}><i class="bi bi-arrow-up-circle-fill"></i></button>
                </form>
            `;
            wrapper.appendChild(inputArea);

            // Auto-focus
            setTimeout(() => {
                const inp = document.getElementById('wc-input');
                if (inp && !state.game_over) inp.focus();
            }, 500);
        }
    } else {
        // Update disabled state
        let shouldDisable = !!state.game_over || state.phase === 'intermission';
        if (customMode) {
            document.querySelectorAll('.wc-key').forEach(btn => {
                btn.disabled = shouldDisable;
            });
            const checkBtn = document.querySelector('.wc-check-btn');
            if (checkBtn) checkBtn.disabled = shouldDisable;
            updateKeyboardLetterStates(state);
        } else {
            const inp = document.getElementById('wc-input');
            const btn = document.querySelector('.wc-send-btn');
            if (inp && inp.disabled !== shouldDisable) inp.disabled = shouldDisable;
            if (btn && btn.disabled !== shouldDisable) btn.disabled = shouldDisable;
        }
    }
};

// Virtual Input State
let virtualWord = '';
const WC_KEY_STATE_RANK = {
    absent: 0,
    present: 1,
    correct: 2
};

function getKeyboardLetterStates(history) {
    const states = {};
    (history || []).forEach(entry => {
        const word = String(entry.word || '').toUpperCase();
        const pattern = Array.isArray(entry.pattern) ? entry.pattern : [];

        word.split('').forEach((letter, index) => {
            const value = Number(pattern[index]);
            const nextState = value === 2 ? 'correct' : value === 1 ? 'present' : value === 0 ? 'absent' : '';
            if (!nextState) return;

            const currentState = states[letter];
            if (!currentState || WC_KEY_STATE_RANK[nextState] > WC_KEY_STATE_RANK[currentState]) {
                states[letter] = nextState;
            }
        });
    });
    return states;
}

function updateKeyboardLetterStates(state) {
    const letterStates = getKeyboardLetterStates(state?.history);
    document.querySelectorAll('.wc-key[data-key]').forEach(keyEl => {
        const key = keyEl.dataset.key;
        keyEl.classList.remove('is-absent', 'is-present', 'is-correct');
        if (!key || key === 'BACK') return;

        const letterState = letterStates[key.toUpperCase()];
        if (letterState) keyEl.classList.add(`is-${letterState}`);
    });
}

function handleKeyPress(e) {
    let key = e.currentTarget.dataset.key;
    if (!key) return;

    // Remove focus immediately
    e.currentTarget.blur();

    // Haptic feedback
    if (window.triggerHaptic) {
        window.triggerHaptic('impact', 'light');
    }

    // Get current word length from last render
    let maxLength = window.currentWordLength || 5;

    if (key === 'BACK') {
        virtualWord = virtualWord.slice(0, -1);
    } else if (key === 'ENTER') {
        window.submitWordClash(null);
        return;
    } else if (virtualWord.length < maxLength) {
        virtualWord += key.toLowerCase();
    }

    // Update display
    updateVirtualDisplay();
}

function updateVirtualDisplay() {
    let display = document.querySelector('.wc-virtual-input');
    if (!display) return;

    let maxLength = window.currentWordLength || 5;
    let chars = [];
    for (let i = 0; i < maxLength; i++) {
        chars.push(virtualWord[i] ? virtualWord[i].toUpperCase() : '_');
    }

    display.textContent = chars.join('');
}

// Helper for visual feedback
window.showInvalidWord = function (message) {
    let area = document.getElementById('wc-input-area');
    let errLabel = document.getElementById('wc-error-label');

    if (area) {
        area.classList.remove('input-error');
        setTimeout(() => area.classList.add('input-error'), 10);
        setTimeout(() => area.classList.remove('input-error'), 500);
    }

    if (errLabel) {
        errLabel.textContent = message || 'Ошибка!';
        errLabel.classList.add('visible');

        // Clear virtual word if using custom keyboard
        if (useCustomKeyboard()) {
            virtualWord = '';
            updateVirtualDisplay();
        }

        setTimeout(() => {
            errLabel.classList.remove('visible');
        }, 2000);
    }
};

// --- MENU & EXIT HELPERS ---

window.toggleWcMenu = function (e) {
    if (e) e.stopPropagation();
    window.wcMenuOpen = !window.wcMenuOpen;

    // Toggle class on existing elements (hack for fast feedback)
    const dd = document.querySelector('.header-dropdown');
    if (dd) {
        if (window.wcMenuOpen) dd.classList.add('active');
        else dd.classList.remove('active');
    }

    if (window.wcMenuOpen) {
        setTimeout(() => document.addEventListener('click', closeWcMenu), 0);
    }
};

function closeWcMenu() {
    window.wcMenuOpen = false;
    const dd = document.querySelector('.header-dropdown');
    if (dd) dd.classList.remove('active');
    document.removeEventListener('click', closeWcMenu);
}

window.exitToLobby = async function () {
    // 1. Host stops the game for everyone
    if (window.isHost) {
        try {
            await window.apiRequest({ action: 'stop_game' });
        } catch (e) {
            console.error('Stop game error:', e);
        } finally {
            document.body.classList.remove('wordclash-active');
            location.reload();
        }
    } else {
        // 2. Guests just reload to get room state
        document.body.classList.remove('wordclash-active');
        location.reload();
    }
};

window.confirmExitGame = function () {
    window.exitToLobby();
};

// Submit for CUSTOM keyboard
window.submitWordClash = async function (e) {
    if (e) e.preventDefault();

    let word = virtualWord.trim().toLowerCase();

    if (word.length !== 5) {
        window.showInvalidWord('Нужно 5 букв!');
        return;
    }

    // Disable keyboard during submit
    document.querySelectorAll('.wc-key').forEach(btn => btn.disabled = true);
    const checkBtn = document.querySelector('.wc-check-btn');
    if (checkBtn) checkBtn.disabled = true;

    try {
        let res = await window.sendGameAction('submit_guess', { word: word });

        if (res && res.status === 'ok') {
            virtualWord = ''; // Success! Clear virtual input.
            updateVirtualDisplay();
        }
        // On error - word stays for correction

    } finally {
        // Re-enable keyboard
        document.querySelectorAll('.wc-key').forEach(btn => btn.disabled = false);
        if (checkBtn) checkBtn.disabled = false;
    }
};

// Submit for SYSTEM keyboard (original behavior, keyboard might close but that's OK)
window.submitWordClashSystem = async function (e) {
    if (e) e.preventDefault();

    let input = document.getElementById('wc-input');
    let word = input.value.trim().toLowerCase();

    if (word.length !== 5) {
        window.showInvalidWord('Нужно 5 букв!');
        return;
    }

    try {
        let res = await window.sendGameAction('submit_guess', { word: word });

        if (res && res.status === 'ok') {
            input.value = ''; // Clear on success
        }
        // On error - keep word for correction
    } finally {
        // Always attempt to refocus (may or may not work depending on browser)
        if (input) input.focus();
    }
};

// ===== SETUP SCREEN =====

function renderSetupScreen(res, container) {
    let state = res.game_state || (typeof res.room.game_state === 'string'
        ? JSON.parse(res.room.game_state)
        : res.room.game_state);

    if (!state) return;

    // Sync global settings with server state
    window.setupSettings.wordLength = state.word_length || 5;
    window.setupSettings.roundCount = state.round_count;

    // --- PREVENT FLICKER / RE-ANIMATION ---
    let stateHash = `${state.word_length}-${state.round_count}-${state.phase}-${res.is_host}`;
    if (container.dataset.wcHash === stateHash) return;

    let isHost = res.is_host || (res.room && res.room.host_user_id === window.currentUserId);
    let setupCard = document.querySelector('.wc-setup-card');

    // If card exists and we just need logic update (host selection), don't clear everything
    if (setupCard && container.dataset.wcHash) {
        container.dataset.wcHash = stateHash;
        // Update button active states without replacing the whole DOM
        let selectedLength = state.word_length || 5;
        let selectedRounds = state.round_count;

        document.querySelectorAll('[data-length]').forEach(btn => {
            btn.classList.toggle('active', parseInt(btn.dataset.length) == selectedLength);
        });
        document.querySelectorAll('[data-rounds]').forEach(btn => {
            let roundsVal = btn.dataset.rounds === 'null' ? null : parseInt(btn.dataset.rounds);
            btn.classList.toggle('active', roundsVal == selectedRounds);
        });
        return;
    }

    container.dataset.wcHash = stateHash;
    container.innerHTML = '';

    let setupScreen = document.createElement('div');
    setupScreen.id = 'wc-setup-screen';
    setupScreen.className = 'wc-setup-screen';
    container.appendChild(setupScreen);

    let selectedLength = state.word_length || 5;
    let selectedRounds = state.round_count;

    setupScreen.innerHTML = `
        <div class="wc-setup-card">
            <h2 class="wc-setup-title">НАСТРОЙКИ ИГРЫ</h2>
            
            <div class="wc-setup-section">
                <h3 class="wc-setup-label">Длина слова</h3>
                <div class="wc-setup-options">
                    ${[5, 6, 7].map(len => `
                        <button 
                            class="wc-option-btn ${selectedLength == len ? 'active' : ''}" 
                            data-length="${len}"
                            ${!isHost ? 'disabled' : ''}
                            onclick="window.selectWordLength(${len})">
                            ${len} букв
                        </button>
                    `).join('')}
                </div>
            </div>
            
            <div class="wc-setup-section">
                <h3 class="wc-setup-label">Количество раундов</h3>
                <div class="wc-setup-options">
                    ${[5, 10, 15, null].map(rounds => `
                        <button 
                            class="wc-option-btn ${selectedRounds == rounds ? 'active' : ''}" 
                            data-rounds="${rounds === null ? 'null' : rounds}"
                            ${!isHost ? 'disabled' : ''}
                            onclick="window.selectRoundCount(${rounds === null ? 'null' : rounds})">
                            ${rounds === null ? '∞' : rounds}
                        </button>
                    `).join('')}
                </div>
            </div>
            
            ${isHost ? `
                <button class="wc-btn-primary wc-start-btn" onclick="window.startGameWithSettings()">
                    <i class="bi bi-play-fill"></i> НАЧАТЬ ИГРУ
                </button>
            ` : `
                <div class="wc-waiting-msg">
                    <i class="bi bi-hourglass-split"></i>
                    Ожидание настроек от хоста...
                </div>
            `}

            <button class="wc-btn-secondary mt-3" onclick="window.exitToLobby()" style="width: 100%; padding: 12px; border-radius: 12px; font-weight: 700; background: rgba(255,255,255,0.1); border: 2px solid rgba(255,255,255,0.15); color: white;">
                ВЕРНУТЬСЯ В ЛОББИ
            </button>
        </div>
    `;
}

window.setupSettings = {
    wordLength: 5,
    roundCount: null
};

window.selectWordLength = function (length) {
    // Send to server immediately
    window.sendGameAction('configure_game', {
        word_length: length,
        round_count: window.setupSettings.roundCount
    });
    window.setupSettings.wordLength = length;
};

window.selectRoundCount = function (rounds) {
    // Send to server immediately
    window.sendGameAction('configure_game', {
        word_length: window.setupSettings.wordLength,
        round_count: rounds
    });
    window.setupSettings.roundCount = rounds;
};

window.startGameWithSettings = function () {
    let settings = window.setupSettings;
    window.sendGameAction('configure_game', {
        word_length: settings.wordLength,
        round_count: settings.roundCount,
        start: true  // Signal to start the game
    });
};

if (window.GameSummaryProvider) {
    window.GameSummaryProvider.register('wordclash', {
        buildSummary: function (gameState, context = {}) {
            const players = context.players || [];
            const scores = gameState?.scores || {};
            const sorted = [...players].sort((a, b) => Number(scores[b.id] || 0) - Number(scores[a.id] || 0));
            const winner = sorted[0] || null;
            const winnerScore = winner ? Number(scores[winner.id] || 0) : 0;
            const winnerName = winner ? (winner.display_name || winner.custom_name || winner.first_name || winner.username || 'Игрок') : '';
            const secretWord = String(gameState?.secret_word || '').toUpperCase();
            const awards = [];

            if (winner) {
                awards.push({
                    iconClass: 'bi bi-trophy-fill',
                    title: 'Словесный чемпион',
                    player: `${winnerName} · ${winnerScore} очков`
                });
            }
            if (secretWord) {
                awards.push({
                    iconClass: 'bi bi-key-fill',
                    title: 'Финальное слово',
                    player: secretWord
                });
            }
            if (sorted[1]) {
                const rivalName = sorted[1].display_name || sorted[1].custom_name || sorted[1].first_name || sorted[1].username || 'Игрок';
                awards.push({
                    iconClass: 'bi bi-lightning-charge-fill',
                    title: 'Ближайший преследователь',
                    player: `${rivalName} · ${Number(scores[sorted[1].id] || 0)} очков`
                });
            }

            const outcome = winner
                ? `${winnerName} быстрее всех раскусил слова и забрал матч.`
                : 'Слова закончились, но реванш напрашивается.';

            return {
                gameId: 'wordclash',
                gameTitle: 'Битва Слов',
                participants: players.map(player => ({
                    id: player.id,
                    name: player.display_name || player.custom_name || player.first_name || player.username || 'Игрок'
                })),
                winner: winner ? { id: winner.id, name: winnerName, score: winnerScore } : null,
                outcome,
                awards,
                shareText: [
                    `Битва Слов: ${outcome}`,
                    winner ? `Победитель: ${winnerName} (${winnerScore} очков)` : '',
                    secretWord ? `Финальное слово: ${secretWord}` : '',
                    '',
                    'Заходи в следующий раунд:'
                ].filter(Boolean).join('\n')
            };
        },
        playAgain: function () {
            if (typeof window.sendGameAction === 'function') {
                window.sendGameAction('restart', {});
            }
        }
    });
}

window.renderWordClash = renderWordClash;
