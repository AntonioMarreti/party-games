window.renderWordClash = function (res) {
    var container = document.getElementById('game-area');
    if (!container) return;
    if (!res || !res.room) return;

    var state = typeof res.room.game_state === 'string'
        ? JSON.parse(res.room.game_state)
        : res.room.game_state;
    if (!state) return;

    // Скрываем общие элементы интерфейса лобби
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
        wrapper.style.background = 'linear-gradient(135deg, #1e2a3a 0%, #2c3e50 100%)'; // A bit darker/cleaner
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
    var header = document.getElementById('wc-header');
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
        header.style.background = 'rgba(30, 42, 58, 0.90)'; // Match input area
        header.style.backdropFilter = 'blur(20px)';
        header.style.zIndex = '1000';
        header.style.boxShadow = '0 10px 40px rgba(0, 0, 0, 0.4)';
        header.style.border = '1px solid rgba(255, 255, 255, 0.15)';
        wrapper.appendChild(header);
    }

    // Update Header Content (Score)
    // Update Header Content (Score)
    var myScore = (state.scores && state.scores[res.user.id]) || 0;
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
                        <button class="header-menu-item" onclick="window.confirmExitGame()">
                            <i class="bi bi-door-open text-danger"></i>
                            <span class="text-danger">Покинуть игру</span>
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

    // --- GAME OVER / WINNER MODAL ---
    var modal = document.getElementById('wc-victory-modal');
    if (state.game_over && state.winner_id) {
        var winner = res.players.find(p => String(p.id) === String(state.winner_id));
        var wName = winner ? winner.first_name : 'Unknown';
        var isMe = String(state.winner_id) === String(res.user.id);
        var wScore = (state.scores && state.scores[state.winner_id]) || 0;

        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'wc-victory-modal';
            modal.className = 'wc-victory-modal';
            // Append to body to ensure it overlays absolutely everything
            document.body.appendChild(modal);
        }

        // Only update if content/winner changed to avoid re-renders
        var modalHash = `${state.winner_id}-${state.secret_word}`;
        if (modal.dataset.hash !== modalHash) {
            modal.dataset.hash = modalHash;
            modal.innerHTML = `
                <div class="wc-victory-card">
                    <div class="wc-victory-emoji">${isMe ? '🏆' : '💀'}</div>
                    <div class="wc-victory-title">${isMe ? 'ПОБЕДА!' : 'ИГРА ОКОНЧЕНА'}</div>
                    <div class="wc-victory-subtitle">
                        ${isMe ? 'Вы угадали слово и заработали очки!' : `Победил <b>${wName}</b>`}
                    </div>
                    
                    <div class="wc-secret-word-label">Загаданное слово</div>
                    <div class="wc-secret-word">${state.secret_word}</div>

                    ${res.is_host ? `
                        <button class="wc-btn-primary" onclick="window.sendGameAction('restart', {})">
                            ИГРАТЬ СНОВА
                        </button>
                    ` : '<div class="text-white-50 small mb-3">Ожидайте решения хоста...</div>'}
                    
                    <button class="wc-btn-secondary" onclick="window.confirmExitGame()">
                        Выйти в меню
                    </button>
                </div>
            `;
        }

        // Show Modal
        if (!modal.classList.contains('active')) {
            // Small delay for drama
            setTimeout(() => modal.classList.add('active'), 500);
            // Trigger confetti if I won
            if (isMe && window.confetti) {
                window.confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
            }
        }

    } else if (modal && !state.game_over) {
        // Hide and remove modal if game restarted
        modal.classList.remove('active');
        setTimeout(() => modal.remove(), 300);
    }

    // --- STREAM (GUESSES) ---
    var stream = document.getElementById('wc-stream');
    if (!stream) {
        stream = document.createElement('div');
        stream.id = 'wc-stream';
        stream.className = 'wc-stream-container';
        wrapper.appendChild(stream);
    }

    // Render History (INCREMENTAL)
    var currentHistoryLen = state.history ? state.history.length : 0;
    var lastHistoryLen = parseInt(stream.dataset.historyLen || '0');

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

        var newItems = state.history.slice(lastHistoryLen);
        newItems.forEach(function (entry) {
            var p = res.players.find(pl => String(pl.id) === String(entry.user_id));
            var avatar = p ? (p.photo_url || 'assets/default_avatar.png') : 'assets/default_avatar.png';
            var score = (parseInt(entry.score_delta) || 0);

            var row = document.createElement('div');
            row.className = 'wc-guess-row';

            // Avatar + Score Bubble
            row.innerHTML = `
                <div class="position-relative">
                    <img src="${avatar}" class="wc-avatar" onerror="this.onerror=null;this.src='https://api.dicebear.com/7.x/bottts/svg?seed=${entry.user_id}'">
                    ${score > 0 ? `<span class="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-warning text-dark" style="font-size:10px;">+${score}</span>` : ''}
                </div>
            `;

            // Tiles
            var grid = document.createElement('div');
            grid.className = 'wc-word-grid';

            var letters = entry.word.split('');
            letters.forEach(function (char, idx) {
                var tile = document.createElement('div');
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
            if (stream.lastElementChild) {
                stream.lastElementChild.scrollIntoView({ behavior: 'smooth', block: 'end' });
            } else {
                stream.scrollTop = stream.scrollHeight;
            }
        }, 100);
    }

    // --- INPUT AREA ---
    var inputArea = document.getElementById('wc-input-area');
    if (!inputArea) {
        inputArea = document.createElement('div');
        inputArea.id = 'wc-input-area';
        inputArea.className = 'wc-input-area';
        inputArea.innerHTML = `
            <form id="wc-form" class="wc-input-group" autocomplete="off" onsubmit="window.submitWordClash(event)">
                <input type="text" id="wc-input" class="wc-input" maxlength="5" placeholder="СЛОВО" ${state.game_over ? 'disabled' : ''}>
                <button type="submit" class="wc-send-btn shadow" ${state.game_over ? 'disabled' : ''}><i class="bi bi-arrow-up-circle-fill"></i></button>
            </form>
        `;
        wrapper.appendChild(inputArea);

        // Focus handler
        var inp = document.getElementById('wc-input');

        // Toggle body class for keyboard state
        inp.addEventListener('focus', () => {
            document.body.classList.add('wc-keyboard-active');
        });
        inp.addEventListener('blur', () => {
            document.body.classList.remove('wc-keyboard-active');
        });

        setTimeout(() => inp.focus(), 500);
    } else {
        // Update disabled state if game over
        var inp = document.getElementById('wc-input');
        var btn = document.querySelector('.wc-send-btn');
        if (state.game_over) {
            inp.disabled = true;
            btn.disabled = true;
        } else {
            inp.disabled = false;
            btn.disabled = false;
        }
    }
};

// Helper for visual feedback
window.showInvalidWord = function (msg) {
    var area = document.getElementById('wc-input-area');
    if (area) {
        area.classList.remove('input-error');
        void area.offsetWidth; // Trigger reflow
        area.classList.add('input-error');
        setTimeout(() => area.classList.remove('input-error'), 500);
    }

    // Toast Notification
    var toast = document.createElement('div');
    toast.className = 'position-fixed start-50 translate-middle-x badge bg-danger text-white fs-6 shadow';
    toast.style.bottom = '100px'; // Above input
    toast.style.zIndex = '2000';
    toast.style.transition = 'opacity 0.3s';
    toast.innerText = msg || 'Такого слова нет!';
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 1500);
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

window.confirmExitGame = function () {
    if (window.leaveRoom) {
        window.leaveRoom();
    } else {
        location.reload();
    }
};

window.submitWordClash = function (e) {
    e.preventDefault();
    var input = document.getElementById('wc-input');
    var word = input.value.trim().toLowerCase();

    if (word.length !== 5) {
        window.showInvalidWord('Нужно 5 букв!');
        return;
    }

    // Optimistic Clear
    input.value = '';

    window.sendGameAction('submit_guess', { word: word });
};

