// js/games/minesweeper/ui.js

// Flag mode state (persists across re-renders)
window._msFlagMode = window._msFlagMode || false;

function render_minesweeper_br(res) {
    let state = res.room.game_state ? JSON.parse(res.room.game_state) : null;
    const container = document.getElementById('game-area');
    const myId = String(res.user.id);

    // If we are in tutorial, only allow renders that are explicitly marked as tutorial
    if (window._msInTutorial && !res._isTutorial) {
        return;
    }

    // Prevents "jittering" by only re-rendering if the game state has actually changed
    const stateHash = JSON.stringify(res.room.game_state);
    if (window._msLastStateHash === stateHash && !res._isTutorial) {
        return;
    }
    window._msLastStateHash = stateHash;

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

    // Cleanup results-only elements if not in finished state
    if (state.status !== 'finished') {
        const overlay = wrapper.querySelector('.ms-results-overlay');
        if (overlay) overlay.remove();
        const toggleBtn = document.getElementById('ms-toggle-board-btn');
        if (toggleBtn) toggleBtn.remove();
    }

    if (state.status === 'setup') {
        renderMsSetup(wrapper, res.is_host, state);
    } else if (state.status === 'playing') {
        window._msResultsSubmitted = false;
        renderMsBoard(wrapper, state, players, myId);
        
        // Tutorial Layer
        if (window._msInTutorial) {
            renderMsTutorialStep(wrapper);
        } else {
            // Trigger feedback if a mine was JUST hit (check history)
            const lastAction = state.history ? state.history[state.history.length - 1] : null;
            if (lastAction && (lastAction.type === 'mine_hit_solo' || (lastAction.type === 'reveal' && lastAction.is_mine))) {
                window.triggerMineFeedback?.();
            }
        }
    } else if (state.status === 'finished') {
        renderMsBoard(wrapper, state, players, myId);
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
            `<button class="glass-btn primary w-100 py-3 rounded-4 fw-bold shadow-sm" onclick="minesweeperStartGame()">НАЧАТЬ</button>` :
            `<div class="p-3 rounded-4 glass-card text-muted">Ожидание хоста...</div>`
        }
                <button class="glass-btn w-100 py-3 rounded-4 text-primary fw-bold" onclick="startMsTutorial()"><i class="bi bi-mortarboard-fill"></i> Интерактивное обучение</button>
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

    const isSolo = players.length === 1;

    // Board
    container.innerHTML = `
        <!-- Game title with exit menu -->
        <div class="ms-header" style="text-align:center; position:relative; margin-bottom:8px;">
            <div class="fw-bold" onclick="window.toggleMsMenu(event)" style="cursor:pointer; font-size:16px; letter-spacing:1px; display:inline-flex; align-items:center; gap:4px;">
                <i class="bi bi-bomb"></i> <span style="letter-spacing: 2px;">САПЁР</span> <i class="bi bi-caret-down-fill" style="font-size:10px; opacity:0.5;"></i>
            </div>
            <div id="ms-header-menu" class="header-dropdown">
                <button class="header-menu-item" onclick="minesweeperFinish()">
                    <i class="bi bi-door-open text-danger"></i>
                    <span class="text-danger">Выйти в лобби</span>
                </button>
                <button class="header-menu-item" onclick="location.reload()">
                    <i class="bi bi-arrow-clockwise"></i>
                    <span>Заново</span>
                </button>
            </div>
        </div>

        <!-- Stats bar -->
        <div class="ms-stats ${isSolo ? 'is-solo' : ''}">
            <div class="ms-stat-item">
                <div class="ms-stat-value">${state.safeCellsRemaining}</div>
                <div class="ms-stat-label">Осталось</div>
            </div>
            ${isSolo ? `
            <div class="ms-stat-item timer-item">
                <div class="ms-stat-value timer-value" id="ms-timer">00:00</div>
                <div class="ms-stat-label">Время</div>
            </div>
            ` : `
            <div class="ms-stat-item">
                <div class="ms-stat-value" style="color: #e74c3c;">${state.mineCount}</div>
                <div class="ms-stat-label">Мины</div>
            </div>
            `}
            <div class="ms-stat-item">
                <div class="ms-stat-value" style="color: #e67e22;"><i class="bi bi-flag-fill"></i> ${flagCount}</div>
                <div class="ms-stat-label">Флаги</div>
            </div>
        </div>

        <!-- Turn indicator -->
        ${!isSolo ? `
        <div class="ms-turn-indicator ${isMyTurn ? 'ms-turn-active' : ''} mb-3">
            ${isMyTurn ? '<i class="bi bi-crosshair"></i> ВАШ ХОД' : `<i class="bi bi-hourglass-split"></i> Ходит: ${currentPlayerName}`}
        </div>
        ` : ''}

        <!-- Board -->
        <div class="ms-board-container" id="ms-board-root">
            <div class="ms-grid" style="grid-template-columns: repeat(${cols}, ${cellSize}px);">
                ${Array.from({ length: rows * cols }).map((_, i) => renderMsCell(i, state, myId, cellSize, fontSize)).join('')}
            </div>
        </div>

        <!-- Toolbar: mode switch -->
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

        <!-- Scoreboard -->
        ${!isSolo && Object.values(state.scores || {}).some(s => s !== 0) ? `
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

    if (isSolo) {
        startMsTimer(state);
    }

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
    const isFinished = state.status === 'finished';

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
    } else if (isFinished && val === -1) {
        // Show unrevealed mines on finish
        content = '<i class="bi bi-asterisk"></i>';
        classes.push('mine-dimmed');
    }

    return `<div class="${classes.join(' ')}" data-idx="${idx}" style="width:${cellSize}px;height:${cellSize}px;font-size:${fontSize}px;">${content}</div>`;
}

// ───────────────────── RESULTS ─────────────────────

function renderMsResults(container, state, players) {
    const results = state.gameResults || [];
    const myId = String(window.currentUser?.id);
    const isSolo = (players || []).length === 1;

    // Check if died in solo
    const hitMineSolo = isSolo && state.history?.some(h => h.type === 'mine_hit_solo');

    if (!window._msResultsSubmitted) {
        window._msResultsSubmitted = true;
        window.stopMsTimer?.();
        
        let minesHit = 0;
        if (state.grid) {
            Object.keys(state.revealed).forEach(idx => {
               if (state.revealed[idx] === myId && state.grid[idx] === -1) minesHit++;
            });
        }
        
        window.submitGameResults?.(results.map(r => ({
            user_id: r.user_id,
            score: r.score,
            rank: r.rank,
            mines_hit: minesHit
        })));
    }

    // 1. Ensure overlay exists
    let overlay = container.querySelector('.ms-results-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'ms-results-overlay animate__animated animate__fadeIn';
        container.appendChild(overlay);
    }

    // 2. Add Toggle Board Button (fixed position for easy access)
    let toggleBtn = document.getElementById('ms-toggle-board-btn');
    if (!toggleBtn) {
        toggleBtn = document.createElement('button');
        toggleBtn.id = 'ms-toggle-board-btn';
        toggleBtn.className = 'ms-show-board-btn animate__animated animate__fadeInUp';
        toggleBtn.innerHTML = '<i class="bi bi-eye-fill me-2"></i>СМОТРЕТЬ ПОЛЕ';
        toggleBtn.onclick = () => {
            const isMin = overlay.classList.toggle('minimized');
            toggleBtn.innerHTML = isMin ? '<i class="bi bi-info-circle-fill me-2"></i>ИТОГИ' : '<i class="bi bi-eye-fill me-2"></i>СМОТРЕТЬ ПОЛЕ';
            if (window.triggerHaptic) window.triggerHaptic('selection', 'light');
        };
        container.appendChild(toggleBtn);
    }

    overlay.innerHTML = `
        <div class="text-center p-4">
            <div class="display-1 mb-3 animate__animated animate__bounceIn">
                ${hitMineSolo ? '<i class="bi bi-patch-exclamation-fill text-danger"></i>' : '<i class="bi bi-trophy-fill" style="color: #FFD700; filter: drop-shadow(0 0 15px rgba(255,215,0,0.5))"></i>'}
            </div>
            <h1 class="fw-black mb-1 ${hitMineSolo ? 'ms-loss-text' : 'ms-win-text'}" style="font-size: 2.5rem; letter-spacing: -1px;">
                ${hitMineSolo ? 'ПОРАЖЕНИЕ' : 'ПОБЕДА!'}
            </h1>
            <div class="small text-muted mb-4 text-uppercase fw-bold" style="letter-spacing: 1px;">
                ${hitMineSolo ? 'Вы подорвались на мине' : 'Все мины успешно обезврежены'}
            </div>
            
            <div class="results-list mb-4 w-100" style="max-height: 40vh; overflow-y: auto;">
                ${results.map((res, i) => {
                    const p = (players || []).find(player => String(player.id) === String(res.user_id));
                    const medal = i === 0 ? '<i class="bi bi-trophy-fill" style="color:#e8a838"></i>' : i === 1 ? '<i class="bi bi-award-fill" style="color:#aaa"></i>' : i === 2 ? '<i class="bi bi-award" style="color:#cd7f32"></i>' : (i + 1);
                    return `
                        <div class="d-flex align-items-center p-3 mb-2 rounded-4 glass-card" style="background: rgba(var(--glass-bg-rgb), 0.1); ${i === 0 ? 'border: 2px solid var(--primary-color);' : ''}">
                            <div class="fs-4 me-3">${medal}</div>
                            <div class="flex-grow-1 text-start">
                                <div class="fw-bold">${p ? (window.safeHTML(p.custom_name || p.first_name)) : 'Игрок'}</div>
                                <div class="small opacity-60">${res.score} XP</div>
                            </div>
                            <div class="fw-black text-primary fs-3">${res.score}</div>
                        </div>
                    `;
                }).join('')}
            </div>

            ${isSolo && window._msTimerVal ? `
                <div class="mb-4 p-3 rounded-4 bg-light bg-opacity-10 d-flex justify-content-between align-items-center">
                    <span class="small text-muted text-uppercase fw-bold">Ваше время:</span>
                    <span class="h4 fw-bold mb-0">${window._msTimerVal}</span>
                </div>
            ` : ''}

            <div class="d-flex flex-column gap-2 w-100">
                <button class="glass-btn primary w-100 py-3 rounded-4 fw-bold" onclick="minesweeperStartGame()">ИГРАТЬ СНОВА</button>
                <button class="glass-btn secondary w-100 py-3 rounded-4 fw-bold" onclick="minesweeperFinish()">В ЛОББИ</button>
            </div>
        </div>
    `;
}

// ───────────────────── HELPERS ─────────────────────

window.startMsTimer = function(state) {
    if (window._msTimerInterval) return;
    const startTime = state.startTime || Date.now();
    window._msTimerInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        const mins = String(Math.floor(elapsed / 60)).padStart(2, '0');
        const secs = String(elapsed % 60).padStart(2, '0');
        const val = `${mins}:${secs}`;
        window._msTimerVal = val;
        const el = document.getElementById('ms-timer');
        if (el) el.innerText = val;
    }, 1000);
};

window.stopMsTimer = function() {
    clearInterval(window._msTimerInterval);
    window._msTimerInterval = null;
};

window.showMsHowToPlay = function() {
    const rules = `
        <div class="text-start" style="font-size: 14px;">
            <p><b>Цель:</b> Открыть все пустые клетки, не подорвавшись на минах.</p>
            <ul>
                <li><b>Цифры</b> показывают количество мин в соседних 8 клетках.</li>
                <li><b>Первый ход</b> всегда безопасен и открывает свободную зону.</li>
                <li><b>Аккорд:</b> Нажмите на открытую цифру, если вокруг неё уже стоят нужные флаги — это мгновенно откроет остальные соседние клетки.</li>
                <li><b>Одиночный режим:</b> Ошибка фатальна. Один взрыв — игра окончена.</li>
                <li><b>Мультиплеер:</b> Взрыв отнимает очки и оглушает вас на 1 ход.</li>
            </ul>
        </div>
    `;
    if (window.showConfirmation) {
        window.showConfirmation('Как играть', rules, null, { confirmText: 'Понятно', hideCancel: true });
    } else {
        alert("Правила: Откройте все пустые клетки. Цифры показывают мины рядом. Один взрыв в соло - конец игры.");
    }
};

window.renderMsTutorialStep = function(container) {
    const step = window._msTutorialStep;
    const steps = [
        {
            cell: 12,
            icon: '<i class="bi bi-bullseye"></i>',
            text: "Нажмите на <b>центр</b>. Это откроет безопасную зону и первые цифры."
        },
        {
            cell: 7,
            icon: '<i class="bi bi-info-circle"></i>',
            text: "Цифра <b>1</b> видит 8 клеток вокруг (зеленые). В этой зоне ровно 1 мина. Она здесь! Сначала переключитесь на <b>Флажок</b>",
            radar: [{ idx: 11, color: 'radar-1' }],
            highlightToolbar: 'flag'
        },
        {
            cell: 8,
            icon: '<i class="bi bi-plus-circle"></i>',
            text: "А цифра <b>2</b> видит свои 8 клеток (синие). В её зоне должно быть 2 мины. Поставьте второй флаг!",
            radar: [{ idx: 12, color: 'radar-2' }]
        },
        {
            cell: 12,
            icon: '<i class="bi bi-lightning-charge"></i>',
            text: "Теперь <b>Аккорд</b>! Переключитесь обратно на <b>Открыть</b> и нажмите на двойку, чтобы раскрыть остальное.",
            highlightToolbar: 'reveal'
        },
        {
            cell: null,
            icon: '<i class="bi bi-trophy"></i>',
            text: "Идеально! Теперь вы видите логику: каждая цифра — это «радар» для 8 соседних клеток. Удачи!",
            isLast: true
        }
    ];

    const s = steps[step];
    if (!s) return;

    // Absolute cleanup
    document.querySelectorAll('.ms-tutorial-bar, .ms-tutorial-dimmer, .ms-tutorial-pane, .ms-tutorial-tooltip').forEach(el => el.remove());
    container.querySelectorAll('.ms-cell.tutorial-highlight, .ms-cell.neighbor-highlight, .ms-cell.radar-1, .ms-cell.radar-2').forEach(el => {
        el.classList.remove('tutorial-highlight', 'neighbor-highlight', 'radar-1', 'radar-2');
    });
    container.querySelectorAll('.ms-mode-btn.highlight-switch').forEach(el => el.classList.remove('highlight-switch'));

    // Create and inject bar
    const bar = document.createElement('div');
    bar.className = 'ms-tutorial-bar';
    bar.innerHTML = `
        <div class="ms-tutorial-bar-icon">${s.icon}</div>
        <div class="ms-tutorial-bar-content">${s.text}</div>
        <button class="ms-tutorial-bar-action" onclick="minesweeperFinish()">${s.isLast ? 'Закончить' : 'Выход'}</button>
    `;

    const stats = container.querySelector('.ms-stats');
    if (stats) stats.parentNode.insertBefore(bar, stats.nextSibling);

    // Highlight cell
    if (s.cell !== null) {
        const cellEl = container.querySelector(`.ms-cell[data-idx="${s.cell}"]`);
        if (cellEl) {
            cellEl.classList.add('tutorial-highlight', 'tutorial-target-pulse');
            cellEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    // Explicit Radar visualization
    if (s.radar) {
        const [rows, cols] = [5, 5];
        s.radar.forEach(rObj => {
            const r = Math.floor(rObj.idx / cols);
            const c = rObj.idx % cols;
            for (let dr = -1; dr <= 1; dr++) {
                for (let dc = -1; dc <= 1; dc++) {
                    if (dr === 0 && dc === 0) continue;
                    const ni = (r + dr) * cols + (c + dc);
                    if (r + dr >= 0 && r + dr < rows && c + dc >= 0 && c + dc < cols) {
                        const neighbor = container.querySelector(`.ms-cell[data-idx="${ni}"]`);
                        if (neighbor) neighbor.classList.add(rObj.color);
                    }
                }
            }
        });
    }

    // Highlight Toolbar button
    if (s.highlightToolbar) {
        const btnSelector = s.highlightToolbar === 'flag' ? '.ms-mode-btn.flag-mode' : '.ms-mode-btn:not(.flag-mode)';
        const btn = container.querySelector(btnSelector);
        if (btn) btn.classList.add('highlight-switch');
    }
};

window.render_minesweeper_br = render_minesweeper_br;
