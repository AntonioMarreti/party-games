// js/games/minesweeper/ui.js

// Flag mode state (persists across re-renders)
window._msFlagMode = window._msFlagMode || false;

function render_minesweeper_br(res) {
    let state = res.room.game_state ? JSON.parse(res.room.game_state) : null;
    const container = document.getElementById('game-area');
    const myId = String(res.user.id);

    if (!state) {
        state = { status: 'setup', difficulty: 'medium' };
    }

    // Hide lobby elements
    ['default-game-header', 'game-host-controls', 'score-card'].forEach(id => {
        const el = document.getElementById(id); if (el) el.style.display = 'none';
    });

    let wrapper = document.getElementById('ms-wrapper');
    if (!wrapper) {
        container.innerHTML = '';
        wrapper = document.createElement('div');
        wrapper.id = 'ms-wrapper';
        wrapper.className = 'game-custom-wrapper';
        container.appendChild(wrapper);
    }

    const players = res.room.players || res.players || [];

    if (state.status === 'setup') {
        renderMsSetup(wrapper, res.is_host, state);
    } else if (state.status === 'playing') {
        window._msResultsSubmitted = false;
        renderMsBoard(wrapper, state, players, myId);
    } else if (state.status === 'finished') {
        renderMsResults(wrapper, state, players);
    }
}

// ───────────────────── SETUP SCREEN ─────────────────────

function renderMsSetup(container, isHost, state) {
    const diffs = [
        { id: 'easy', name: 'Легко', desc: '8×8, 10 мин', icon: '<i class="bi bi-shield-check" style="color:#2ecc71"></i>' },
        { id: 'medium', name: 'Норма', desc: '9×9, 14 мин', icon: '<i class="bi bi-shield-exclamation" style="color:#e8a838"></i>' },
        { id: 'hard', name: 'Сложно', desc: '10×12, 22 мин', icon: '<i class="bi bi-shield-fill-x" style="color:#e74c3c"></i>' }
    ];

    container.innerHTML = `
        <div class="text-center p-4">
            <div class="display-1 mb-3"><i class="bi bi-bomb"></i></div>
            <h2 class="fw-bold mb-1">Настройка игры</h2>
            <p class="text-muted small mb-4">Выберите сложность и начните разминирование</p>
            
            <div class="mb-4">
                <div class="small text-muted text-uppercase fw-bold mb-3">Сложность</div>
                <div class="d-flex flex-column gap-2 mb-4">
                    ${diffs.map(d => `
                        <button id="ms-diff-${d.id}" class="glass-btn w-100 p-3 rounded-4 d-flex justify-content-between align-items-center ${state.difficulty === d.id ? 'active' : ''}" 
                                onclick="${isHost ? `minesweeperSetDifficulty('${d.id}')` : ''}" ${!isHost ? 'disabled' : ''}>
                            <div class="d-flex align-items-center gap-2">
                                <span>${d.icon}</span>
                                <div class="text-start">
                                    <div class="fw-bold">${d.name}</div>
                                    <div class="small opacity-60">${d.desc}</div>
                                </div>
                            </div>
                            <span class="ms-diff-check">${state.difficulty === d.id ? '<i class="bi bi-check-circle-fill text-primary"></i>' : ''}</span>
                        </button>
                    `).join('')}
                </div>
            </div>

            <p class="text-muted mb-4 small">Каждое поле решается чистой логикой — без угадывания.</p>
            
            <div class="d-flex flex-column gap-2">
                ${isHost ?
            `<button class="glass-btn primary w-100 py-3 rounded-4 fw-bold" onclick="minesweeperStartGame()">НАЧАТЬ</button>` :
            `<div class="p-3 rounded-4 glass-card text-muted">Ожидание хоста...</div>`
        }
                <button class="glass-btn w-100 py-3 rounded-4 text-muted" onclick="minesweeperFinish()">В ЛОББИ</button>
            </div>
        </div>
    `;
}

// ───────────────────── GAME BOARD ─────────────────────

function renderMsBoard(container, state, players, myId) {
    const [rows, cols] = state.boardSize;
    const currentTurnUid = String(state.turnOrder[state.currentTurnIndex]);
    const isMyTurn = currentTurnUid === myId;
    const currentPlayer = (players || []).find(p => String(p.id) === currentTurnUid);
    const currentPlayerName = currentPlayer ? (currentPlayer.custom_name || currentPlayer.first_name) : 'Игрок';

    // Responsive cell size: fit grid within viewport
    const viewportW = window.innerWidth - 40; // 20px padding each side
    const maxCellW = Math.floor(viewportW / cols) - 2; // subtract gap
    const cellSize = Math.min(Math.max(maxCellW, 20), 38); // clamp between 20-38
    const fontSize = Math.max(Math.round(cellSize * 0.45), 10);

    // Count flags placed
    const flagCount = Object.keys(state.flags || {}).length;

    container.innerHTML = `
        <!-- Game title with exit menu -->
        <div class="ms-header" style="text-align:center; position:relative; margin-bottom:8px;">
            <div class="fw-bold" onclick="window.toggleMsMenu(event)" style="cursor:pointer; font-size:16px; letter-spacing:1px; display:inline-flex; align-items:center; gap:4px;">
                <i class="bi bi-bomb"></i> САПЁР <i class="bi bi-caret-down-fill" style="font-size:10px; opacity:0.5;"></i>
            </div>
            <div id="ms-header-menu" class="header-dropdown">
                <button class="header-menu-item" onclick="minesweeperFinish()">
                    <i class="bi bi-door-open text-danger"></i>
                    <span class="text-danger">Выйти в лобби</span>
                </button>
                <button class="header-menu-item" onclick="location.reload()">
                    <i class="bi bi-arrow-clockwise"></i>
                    <span>Перезагрузить</span>
                </button>
            </div>
        </div>

        <!-- Stats bar -->
        <div class="ms-stats">
            <div class="ms-stat-item">
                <div class="ms-stat-value">${state.safeCellsRemaining}</div>
                <div class="ms-stat-label">Безопасно</div>
            </div>
            <div class="ms-stat-item">
                <div class="ms-stat-value" style="color: #e74c3c;">${state.mineCount}</div>
                <div class="ms-stat-label">Мины</div>
            </div>
            <div class="ms-stat-item">
                <div class="ms-stat-value" style="color: #e67e22;"><i class="bi bi-flag-fill"></i> ${flagCount}</div>
                <div class="ms-stat-label">Флаги</div>
            </div>
        </div>

        <!-- Turn indicator -->
        <div class="ms-turn-indicator ${isMyTurn ? 'ms-turn-active' : ''} mb-3">
            ${isMyTurn ? '<i class="bi bi-crosshair"></i> ВАШ ХОД' : `<i class="bi bi-hourglass-split"></i> Ходит: ${currentPlayerName}`}
        </div>

        <!-- Board -->
        <div class="ms-board-container">
            <div class="ms-grid" style="grid-template-columns: repeat(${cols}, ${cellSize}px);">
                ${Array.from({ length: rows * cols }).map((_, i) => renderMsCell(i, state, myId, cellSize, fontSize)).join('')}
            </div>
        </div>

        <!-- Toolbar: mode switch (below board for mobile thumb reach) -->
        <div class="ms-toolbar">
            <div class="ms-mode-control">
                <button class="ms-mode-btn ${!window._msFlagMode ? 'active' : ''}" onclick="minesweeperSetMode(false)">
                    <i class="bi bi-hand-index"></i> Открыть
                </button>
                <button class="ms-mode-btn ${window._msFlagMode ? 'active flag-mode' : ''}" onclick="minesweeperSetMode(true)">
                    <i class="bi bi-flag-fill"></i> Флажок
                </button>
            </div>
        </div>

        <!-- Scoreboard (hidden until scores change) -->
        ${Object.values(state.scores || {}).some(s => s !== 0) ? `
        <div class="ms-scoreboard">
            ${(players || []).map(p => {
        const score = state.scores[p.id] || 0;
        const isStunned = (state.stunned[p.id] || 0) > 0;
        const isMe = String(p.id) === myId;
        const isTurn = String(p.id) === currentTurnUid;
        return `
                    <div class="ms-player-chip ${isMe ? 'is-me' : ''} ${isTurn ? 'is-current-turn' : ''}">
                        <span class="ms-player-name">${isStunned ? '<i class="bi bi-dizzy"></i> ' : ''}${p.custom_name || p.first_name}</span>
                        <span class="ms-player-score ${score < 0 ? 'negative' : ''}">${score}</span>
                    </div>
                `;
    }).join('')}
        </div>
        ` : ''}
    `;

    // Bind cell events
    container.querySelectorAll('.ms-cell').forEach(el => {
        const idx = parseInt(el.dataset.idx);

        el.onclick = () => {
            if (!isMyTurn) return;

            if (state.revealed[idx] !== undefined) {
                // Chord on revealed number
                minesweeperChord(idx);
            } else if (window._msFlagMode) {
                // Flag mode: toggle flag
                minesweeperToggleFlag(idx);
            } else if (!state.flags[idx]) {
                // Normal mode: reveal
                minesweeperReveal(idx);
            }
        };

        // Long press still works as flag shortcut
        let pressTimer;
        el.ontouchstart = (e) => {
            if (!isMyTurn || state.revealed[idx] !== undefined) return;
            pressTimer = setTimeout(() => {
                minesweeperToggleFlag(idx);
                pressTimer = null;
                e.preventDefault();
            }, 500);
        };
        el.ontouchend = el.ontouchcancel = () => clearTimeout(pressTimer);

        // Right click = flag
        el.oncontextmenu = (e) => {
            e.preventDefault();
            if (isMyTurn && state.revealed[idx] === undefined) {
                minesweeperToggleFlag(idx);
            }
        };
    });
}

// ───────────────────── CELL RENDERING ─────────────────────

function renderMsCell(idx, state, myId, cellSize, fontSize) {
    const isRevealed = state.revealed[idx] !== undefined;
    const isFlagged = state.flags[idx] !== undefined;
    const val = state.grid ? state.grid[idx] : null;

    let content = '';
    let classes = ['ms-cell'];

    if (isRevealed) {
        classes.push('revealed');
        if (val === -1) {
            content = '<i class="bi bi-asterisk"></i>';
            classes.push('mine');
        } else if (val > 0) {
            content = val;
            classes.push(`val-${val}`);
        }
    } else if (isFlagged) {
        content = '<i class="bi bi-flag-fill"></i>';
        classes.push('flagged');
    }

    return `<div class="${classes.join(' ')}" data-idx="${idx}" style="width:${cellSize}px;height:${cellSize}px;font-size:${fontSize}px;">${content}</div>`;
}

// ───────────────────── RESULTS ─────────────────────

function renderMsResults(container, state, players) {
    const results = state.gameResults || [];
    const myId = String(window.currentUser?.id);

    // Achievement tracking
    const myResult = results.find(r => String(r.user_id) === myId);
    let minesHit = 0;
    if (state.grid) {
        Object.keys(state.revealed).forEach(idx => {
            if (state.revealed[idx] === myId && state.grid[idx] === -1) minesHit++;
        });
    }

    if (myResult && !window._msResultsSubmitted) {
        window._msResultsSubmitted = true;
        window.submitGameResults?.(results.map(r => ({
            user_id: r.user_id,
            score: r.score,
            rank: r.rank,
            mines_hit: minesHit
        })));
    }

    container.innerHTML = `
        <div class="text-center p-4">
            <div class="display-1 mb-3"><i class="bi bi-trophy-fill" style="color: var(--primary-color)"></i></div>
            <h2 class="fw-bold mb-1">ИГРА ОКОНЧЕНА</h2>
            <div class="small text-muted mb-4 text-uppercase fw-bold">Результаты разминирования</div>
            <div class="results-list mb-4">
                ${results.map((res, i) => {
        const p = (players || []).find(player => String(player.id) === String(res.user_id));
        const medal = i === 0 ? '<i class="bi bi-trophy-fill" style="color:#e8a838"></i>' : i === 1 ? '<i class="bi bi-award-fill" style="color:#aaa"></i>' : i === 2 ? '<i class="bi bi-award" style="color:#cd7f32"></i>' : (i + 1);
        return `
                        <div class="d-flex align-items-center p-3 mb-2 rounded-4 glass-card" style="${i === 0 ? 'border: 2px solid var(--primary-color);' : ''}">
                            <div class="fs-4 me-3">${medal}</div>
                            <div class="flex-grow-1 text-start">
                                <div class="fw-bold">${p ? (p.custom_name || p.first_name) : 'Игрок'}</div>
                                <div class="small opacity-60">${res.score} очков</div>
                            </div>
                            <div class="fw-black text-primary fs-3">${res.score}</div>
                        </div>
                    `;
    }).join('')}
            </div>
            <button class="glass-btn primary w-100 py-3 rounded-4 fw-bold" onclick="minesweeperFinish()">В ЛОББИ</button>
        </div>
    `;
}

window.render_minesweeper_br = render_minesweeper_br;
