window._bgEngine = null;
window._bgLastRes = null;
window._bgIsRolling = false;
window._bgIsApplyingMove = false;
window._bgIsSyncing = false;
window._bgMyColor = 'white';
window._bgRollingFaces = [3, 6];
window._bgRollingTimer = null;
window._bgLastMove = null;

window.render_backgammon = function(res) {
    if (!res || !res.room) return;
    window._bgLastRes = res;

    let state = res.room.game_state ? (typeof res.room.game_state === 'string' ? JSON.parse(res.room.game_state) : res.room.game_state) : null;
    const container = document.getElementById('game-area');

    if (!state && window._bgEngine && window._bgEngine.status !== 'starting') {
        window._bgEngine.reset();
    }

    if (!window._bgEngine) {
        window._bgEngine = new BackgammonEngine();
    }
    // IDENTIFICATION:
    // 1. Try to find myself by ID
    // 2. Failsafe: Host is White, Guest is Black
    const myIdStr = String(res.user?.id || window.Telegram?.WebApp?.initDataUnsafe?.user?.id || '0');
    const players = res.room.players || [];

    let meIdx = players.findIndex(p => {
        if (!p) return false;
        const pid = String(p.id || p.user_id || p);
        return pid === myIdStr;
    });

    let myColor = 'black';
    if (meIdx === 0) {
        myColor = 'white';
    } else if (meIdx === 1) {
        myColor = 'black';
    } else {
        // Fallback for missing/bad IDs (host is white)
        myColor = res.is_host ? 'white' : 'black';
    }

    window._bgMyColor = myColor;
    const engine = window._bgEngine;

    // UI Labeling
    const myColorName = myColor === 'white' ? 'Белые' : 'Черные';
    const opponentColorName = myColor === 'white' ? 'Черные' : 'Белые';

    const me = players.find(p => {
        const pid = String(p.id || p.user_id || p);
        return pid === myIdStr;
    }) || (res.is_host ? players[0] : players[1]) || { first_name: 'Вы' };

    const opponent = players.find(p => {
        const pid = String(p.id || p.user_id || p);
        return pid !== myIdStr;
    }) || (res.is_host ? players[1] : players[0]) || { first_name: 'Оппонент' };

    // Update Engine status from server
    if (res.room.game_state) {
        const serverState = typeof res.room.game_state === 'string' ? JSON.parse(res.room.game_state) : res.room.game_state;
        engine.syncState(serverState);
    }

    const isMyTurn = engine.turn === myColor;
    const isStarting = engine.status === 'starting';

    if (!isMyTurn && window._bgSelectedPoint !== null) {
        window._bgSelectedPoint = null;
    }

    if (!state || (state.status === 'setup' && window._bgEngine.status !== 'playing')) {
        renderBgSetup(container, res.is_host, res.room.players || []);
    } else {
        renderBgBoard(container, engine, res, myColor, isMyTurn, isStarting, me, opponent);
    }
};

window.bgSyncState = async function() {
    return;
}

function renderBgSetup(container, isHost, players) {
    container.innerHTML = `
        <div class="text-center p-4">
            <div class="display-1 mb-3 text-primary"><i class="bi bi-dice-5"></i></div>
            <h2 class="fw-bold mb-1">Длинные Нарды</h2>
            <p class="text-muted small mb-4">Классическая игра для двоих</p>
            ${isHost ?
                `<button class="btn btn-primary btn-lg w-100 mb-3" onclick="bgStartLocal(event)">Начать игру</button>` :
                `<div class="text-muted mb-3">Ожидание хоста...</div>`
            }
        </div>
    `;
}

window.bgStartLocal = async function(event) {
    const btn = event?.currentTarget;
    const oldText = btn ? btn.innerHTML : '';
    if (btn) {
        btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Запуск...';
        btn.disabled = true;
    }

    try {
        const res = await window.apiRequest({ action: 'game_action', type: 'start_game' });
        if (res && res.status !== 'error') {
            if (res.state) {
                window._bgEngine.syncState(res.state);
                if (window._bgLastRes?.room) {
                    window._bgLastRes.room.game_state = res.state;
                    render_backgammon(window._bgLastRes);
                }
            }
        } else {
            console.error("Start error", res);
            if (btn) {
                btn.innerHTML = oldText;
                btn.disabled = false;
            }
        }
    } catch (e) {
        console.error(e);
        if (btn) {
            btn.innerHTML = oldText;
            btn.disabled = false;
        }
    }
}

function renderBgBoard(container, engine, res, myColor, isMyTurn, isStarting, me, opponent) {
    let wrapper = container.querySelector('.bg-wrapper');
    if (!wrapper) {
        wrapper = document.createElement('div');
        wrapper.className = 'bg-wrapper';
        wrapper.id = 'bg-wrapper';
        // Basic structure once
        wrapper.innerHTML = `
            <div class="bg-nav-header"></div>
            <div class="bg-board-container"></div>
            <div class="bg-player-section"></div>
            <div id="bg-game-menu" class="bg-menu-overlay" onclick="bgToggleMenu()"></div>
            <div class="bg-controls"></div>
        `;

        const savedOrientation = localStorage.getItem('bg_orientation');
        if (savedOrientation === 'landscape') {
            wrapper.classList.add('bg-landscape-mode');
        }

        container.innerHTML = '';
        container.appendChild(wrapper);
    }

    const navHeader = wrapper.querySelector('.bg-nav-header');
    const boardContainer = wrapper.querySelector('.bg-board-container');
    const playerSection = wrapper.querySelector('.bg-player-section');
    const menuOverlay = wrapper.querySelector('.bg-menu-overlay');
    const controls = wrapper.querySelector('.bg-controls');

    const isFlipped = myColor === 'black';

    let tlIndices = [12, 13, 14, 15, 16, 17];
    let trIndices = [18, 19, 20, 21, 22, 23];
    let blIndices = [11, 10, 9, 8, 7, 6];
    let brIndices = [5, 4, 3, 2, 1, 0];

    if (isFlipped) {
        tlIndices = [0, 1, 2, 3, 4, 5];
        trIndices = [6, 7, 8, 9, 10, 11];
        blIndices = [23, 22, 21, 20, 19, 18];
        brIndices = [17, 16, 15, 14, 13, 12];
    }

    const hasIRolled = isStarting && engine.startingRolls && engine.startingRolls[myColor];
    const bothRolled = isStarting && engine.startingRolls && engine.startingRolls.white && engine.startingRolls.black;
    const iAmReady = isStarting && engine.readyToStart && engine.readyToStart[myColor];
    const movablePoints = isMyTurn ? engine.getMovablePoints() : [];
    const hasMovesAvailable = movablePoints.length > 0;
    const selectedMoveDetails = window._bgSelectedPoint !== null ? engine.getLegalMoveDetails(window._bgSelectedPoint) : new Map();
    const selectedMoves = Array.from(selectedMoveDetails.keys());

    const myColorName = myColor === 'white' ? 'Белые' : 'Черные';
    const opponentColorName = myColor === 'white' ? 'Черные' : 'Белые';

    // Update Nav
    navHeader.innerHTML = `
        <div class="bg-player-card island ${!isMyTurn ? 'bg-turn-active' : ''}" onclick="bgToggleMenu()">
            <div class="bg-avatar-wrap">
                <img src="https://ui-avatars.com/api/?name=${opponent.first_name}&background=random" class="bg-avatar" alt="">
                ${!isMyTurn ? '<div class="bg-turn-dot"></div>' : ''}
            </div>
            <div class="me-1">
                <div class="bg-player-name">${opponent.first_name}</div>
                <div class="bg-player-score">${opponentColorName}</div>
            </div>
            <i class="bi bi-chevron-down opacity-50 ms-2"></i>
        </div>
    `;

    // Update Board
    boardContainer.innerHTML = `
        <div class="bg-board">
            <div class="bg-board-half">
                <div class="bg-row top-row d-flex">
                    ${renderPoints(engine, tlIndices, true).join('')}
                </div>
                <div class="bg-row bottom-row d-flex">
                    ${renderPoints(engine, blIndices, false).join('')}
                </div>
            </div>
            <div class="bg-board-bar"></div>
            <div class="bg-board-half">
                <div class="bg-row top-row d-flex">
                    ${renderPoints(engine, trIndices, true).join('')}
                </div>
                <div class="bg-row bottom-row d-flex">
                    ${renderPoints(engine, brIndices, false).join('')}
                </div>
            </div>

            ${isStarting ? `
                <div class="bg-dice-surface starting visible">
                    <div class="bg-die-setup white ${engine.startingRolls.white ? 'visible' : ''}">
                        <div class="bg-die-label">${window._bgMyColor === 'white' ? 'ВАШ' : 'ОППОНЕНТ'}</div>
                        ${getDiceDots(engine.startingRolls.white)}
                    </div>
                    <div class="bg-die-setup black ${engine.startingRolls.black ? 'visible' : ''}">
                        <div class="bg-die-label">${window._bgMyColor === 'black' ? 'ВАШ' : 'ОППОНЕНТ'}</div>
                        ${getDiceDots(engine.startingRolls.black)}
                    </div>
                </div>
            ` : `
                <div class="bg-dice-surface ${window._bgIsRolling ? 'rolling visible' : ''} ${engine.dice.length > 0 ? 'visible' : ''}">
                    ${window._bgIsRolling ? `
                        <div class="bg-die die-${window._bgRollingFaces[0]}">${getDiceDots(window._bgRollingFaces[0])}</div>
                        <div class="bg-die die-${window._bgRollingFaces[1]}">${getDiceDots(window._bgRollingFaces[1])}</div>
                    ` : engine.dice.map(d => `<div class="bg-die die-${d}">${getDiceDots(d)}</div>`).join('')}
                </div>
            `}
        </div>
    `;

    // Update My Player Info
    playerSection.innerHTML = `
        <div class="bg-player-card footer-island ${isMyTurn ? 'bg-turn-active' : ''}">
            <div class="bg-avatar-wrap">
                <img src="https://ui-avatars.com/api/?name=${me.first_name}&background=6C5CE7&color=fff" class="bg-avatar" alt="">
                ${isMyTurn ? '<div class="bg-turn-dot"></div>' : ''}
            </div>
            <div class="me-2">
                <div class="bg-player-name">${me.first_name === 'Вы' ? 'Вы' : me.first_name + ' (Вы)'}</div>
                <div class="bg-player-score">${myColorName} ${isMyTurn ? '• <b>Ходите</b>' : ''}</div>
            </div>
        </div>
    `;

    // Update Menu Items (only if empty)
    if (!menuOverlay.innerHTML) {
        menuOverlay.innerHTML = `
            <div class="bg-menu-content" onclick="event.stopPropagation()">
                <div class="bg-menu-header"><i class="bi bi-gear-fill me-2 opacity-75"></i>Меню игры</div>
                <div class="d-flex flex-column gap-3">
                    <button class="bg-btn bg-btn-secondary w-100" onclick="bgToggleOrientation()">
                        <i class="bi bi-phone-landscape me-2"></i> Сменить ориентацию
                    </button>
                    ${res.is_host ? `
                    <button class="bg-btn bg-btn-secondary w-100" onclick="bgConfirmRestartGame()">
                        <i class="bi bi-arrow-clockwise me-2"></i> Начать заново
                    </button>
                    ` : ''}
                    ${window.backToLobby ? `
                    <button class="bg-btn w-100" style="background: rgba(255, 71, 87, 0.15); color: #ff4757; border: 1px solid rgba(255, 71, 87, 0.3);" onclick="window.backToLobby()">
                        <i class="bi bi-box-arrow-left me-2"></i> Вернуться в лобби
                    </button>
                    ` : ''}
                    <div class="border-top pt-3 mt-1" style="border-color: rgba(255,255,255,0.05) !important;">
                        <button class="bg-btn bg-btn-primary w-100" onclick="bgToggleMenu()">
                            Продолжить игру
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    const canBearOffActive = window._bgSelectedPoint !== null && isMyTurn && selectedMoves.includes('off');
    const turnMessage = getBackgammonStatusText({
        engine,
        isMyTurn,
        isStarting,
        myColorName,
        opponentColorName,
        hasMovesAvailable
    });

    // Update Controls & Result Info
    controls.innerHTML = `
        ${engine.status === 'finished' ? `
            <div class="bg-finish-panel">
                <div class="bg-finish-title">${engine.winner === myColor ? 'Вы выиграли' : 'Победили ' + (engine.winner === 'white' ? 'белые' : 'черные')}</div>
                <div class="bg-finish-score">Снято: белые ${engine.whiteOff}/15 · черные ${engine.blackOff}/15</div>
                <div class="bg-finish-actions">
                    ${res.is_host ? `<button class="bg-btn bg-btn-primary" onclick="bgConfirmRestartGame()">Начать заново</button>` : ''}
                    <button class="bg-btn bg-btn-secondary" onclick="bgToggleMenu()">Меню</button>
                </div>
            </div>
        ` : isStarting ? `
            ${bothRolled && engine.startingRolls.white === engine.startingRolls.black ? `
                <div class="bg-turn-info text-primary fw-bold mb-2">
                    <i class="bi bi-arrow-repeat me-1"></i>
                    Выпала ничья ${engine.startingRolls.white}:${engine.startingRolls.black}
                </div>
                <button class="bg-btn bg-btn-primary" onclick="bgRollForStart()" ${window._bgIsRolling ? 'disabled' : ''}>
                    Бросить заново
                </button>
            ` : bothRolled ? `
                <div class="bg-turn-info text-primary fw-bold mb-2">
                    <i class="bi bi-info-circle me-1"></i>
                    ${engine.startingRolls.white > engine.startingRolls.black ? 'Белые выиграли!' : 'Черные выиграли!'}
                </div>
                <button class="bg-btn bg-btn-primary" onclick="bgAcknowledgeStart()" ${iAmReady ? 'disabled' : ''}>
                    ${iAmReady ? 'Ожидание соперника...' : 'Начать игру'}
                </button>
            ` : `
                <button class="bg-btn bg-btn-primary" onclick="bgRollForStart()" ${hasIRolled ? 'disabled' : ''}>
                    ${hasIRolled ? 'Ожидание соперника...' : 'Бросить для старта'}
                </button>
            `}
        ` : canBearOffActive ? `
            <button class="bg-btn" style="background: #2ecc71; color: #fff; box-shadow: 0 4px 15px rgba(46, 204, 113, 0.4);" onclick="bgPointClick('off')">
                Выбросить шашку
            </button>
        ` : (isMyTurn && engine.movesLeft.length === 0) ? `
            <button class="bg-btn bg-btn-primary" onclick="bgRollDice()" ${window._bgIsRolling ? 'disabled' : ''}>
                Бросить кубики
            </button>
        ` : (isMyTurn && engine.movesLeft.length > 0 && !hasMovesAvailable) ? `
            <div class="bg-turn-panel bg-no-moves-panel">
                <div class="bg-turn-info">На этих костях ходов нет</div>
                <div class="bg-dice-left">${formatDiceLeft(engine.movesLeft)}</div>
                <button class="bg-btn bg-btn-secondary" onclick="bgPassTurn()">Передать ход</button>
            </div>
        ` : (isMyTurn && engine.movesLeft.length > 0) ? `
            <div class="bg-turn-panel">
                <div class="bg-turn-info">${turnMessage}</div>
                <div class="bg-dice-left">${formatDiceLeft(engine.movesLeft)}</div>
            </div>
        ` : engine.movesLeft.length > 0 ? `
            <div class="bg-turn-panel">
                <div class="bg-turn-info">${turnMessage}</div>
                <div class="bg-dice-left muted">${formatDiceLeft(engine.movesLeft)}</div>
            </div>
        ` : `
            <div class="bg-turn-info">${turnMessage}</div>
        `}
        ${engine.status === 'finished' ? '' : '<button class="bg-btn bg-btn-secondary" onclick="bgToggleMenu()">Меню</button>'}
    `;
}

function formatDiceLeft(movesLeft) {
    if (!movesLeft || movesLeft.length === 0) return '';
    return `Осталось: ${movesLeft.join(' + ')}`;
}

function formatDiceUsed(dice) {
    if (!dice || dice.length === 0) return '';
    return dice.join('+');
}

function getBackgammonStatusText({ engine, isMyTurn, isStarting, myColorName, opponentColorName, hasMovesAvailable }) {
    if (engine.status === 'finished') {
        return engine.winner === window._bgMyColor ? 'Партия выиграна' : 'Партия завершена';
    }

    if (isStarting) {
        if (engine.startingRolls.white && engine.startingRolls.black) {
            if (engine.startingRolls.white === engine.startingRolls.black) {
                return 'Одинаковый стартовый бросок, кидаем заново';
            }
            return engine.turn === window._bgMyColor
                ? `Выиграли стартовый бросок, играете за ${myColorName.toLowerCase()}`
                : `Старт у соперника, вы играете за ${myColorName.toLowerCase()}`;
        }
        return 'Определяем, кто ходит первым';
    }

    if (isMyTurn && engine.movesLeft.length === 0) {
        return 'Ваш ход, бросьте кубики';
    }

    if (isMyTurn && engine.movesLeft.length > 0 && !hasMovesAvailable) {
        return 'Передайте ход сопернику';
    }

    if (isMyTurn && window._bgSelectedPoint !== null) {
        return 'Теперь нажмите зеленую точку назначения';
    }

    if (isMyTurn && engine.movesLeft.length > 0) {
        return 'Подсвечены шашки, которыми можно ходить';
    }

    if (!isMyTurn && engine.movesLeft.length > 0) {
        return `Ход соперника за ${opponentColorName.toLowerCase()}`;
    }

    return isMyTurn ? 'Ваш ход' : 'Ожидайте ход соперника';
}

function getDiceDots(value) {
    if (!value) return '';
    const dotPositions = {
        1: [4],
        2: [0, 8],
        3: [0, 4, 8],
        4: [0, 2, 6, 8],
        5: [0, 2, 4, 6, 8],
        6: [0, 2, 3, 5, 6, 8]
    };
    let dots = '';
    const positions = dotPositions[value] || [4];
    for (let i = 0; i < 9; i++) {
        const hasDot = positions.includes(i);
        dots += `<div class="die-dot ${hasDot ? 'active' : ''}"></div>`;
    }
    return dots;
}

window._bgSelectedPoint = null;

window.bgPointClick = async function(idx) {
    const engine = window._bgEngine;
    if (!engine || !window._bgLastRes || window._bgIsApplyingMove) return;

    const myColor = window._bgMyColor;

    if (engine.turn !== myColor) return;

    if (window._bgSelectedPoint !== null) {
        const moves = engine.getLegalMoves(window._bgSelectedPoint);
        if (moves.includes(idx)) {
            window._bgIsApplyingMove = true;
            try {
                const res = await window.apiRequest({
                    action: 'game_action',
                    type: 'move_checker',
                    from: window._bgSelectedPoint,
                    to: idx
                });
                if (res?.status === 'ok' && res.state) {
                    engine.syncState(res.state);
                    window._bgLastMove = engine.lastMove;
                    window._bgSelectedPoint = null;
                    if (window._bgLastRes?.room) {
                        window._bgLastRes.room.game_state = res.state;
                    }
                    if (window.audioManager) window.audioManager.play('move');
                    render_backgammon(window._bgLastRes);
                }
            } finally {
                window._bgIsApplyingMove = false;
            }
            return;
        }
    }

    const cell = engine.board[idx];
    if (cell && cell.player === myColor && engine.getLegalMoves(idx).length > 0) {
        window._bgSelectedPoint = window._bgSelectedPoint === idx ? null : idx;
    } else {
        window._bgSelectedPoint = null;
    }

    render_backgammon(window._bgLastRes);
}

window.bgPassTurn = async function() {
    const engine = window._bgEngine;
    if (!engine || engine.turn !== window._bgMyColor) return;
    if (engine.movesLeft.length === 0 || engine.getMovablePoints().length > 0) return;

    window._bgSelectedPoint = null;
    const res = await window.apiRequest({ action: 'game_action', type: 'pass_turn' });
    if (res?.status === 'ok' && res.state) {
        engine.syncState(res.state);
        if (window._bgLastRes?.room) {
            window._bgLastRes.room.game_state = res.state;
        }
        if (window._bgLastRes) render_backgammon(window._bgLastRes);
    }
}

window.bgConfirmRestartGame = function() {
    const restart = () => window.bgRestartGame();
    if (window.showConfirmation) {
        window.showConfirmation(
            'Начать заново',
            'Текущая партия будет сброшена для обоих игроков.',
            restart,
            { confirmText: 'Начать заново', isDanger: true }
        );
        return;
    }

    if (window.confirm('Начать партию заново?')) restart();
}

window.bgRestartGame = async function() {
    if (!window._bgLastRes?.is_host) return;

    const menu = document.getElementById('bg-game-menu');
    if (menu) menu.classList.remove('active');

    window._bgSelectedPoint = null;
    window._bgLastMove = null;
    window._bgIsRolling = false;
    stopBackgammonDiceAnimation();

    const res = await window.apiRequest({ action: 'game_action', type: 'restart_game' });
    if (res?.status === 'ok' && res.state) {
        if (!window._bgEngine) {
            window._bgEngine = new BackgammonEngine();
        }
        window._bgEngine.syncState(res.state);
        if (window._bgLastRes?.room) {
            window._bgLastRes.room.game_state = res.state;
        }
        if (window._bgLastRes) render_backgammon(window._bgLastRes);
    } else if (window.showAlert) {
        window.showAlert('Ошибка', res?.message || 'Не удалось начать заново', 'error');
    }
}

window.bgRollForStart = async function() {
    if (window._bgIsRolling) return;
    window._bgIsRolling = true;
    startBackgammonDiceAnimation();
    render_backgammon(window._bgLastRes);

    setTimeout(async () => {
        if (window._bgEngine && window._bgEngine.status === 'starting') {
            const res = await window.apiRequest({ action: 'game_action', type: 'roll_for_start' });
            if (res?.status === 'ok' && res.state) {
                window._bgEngine.syncState(res.state);
                if (window._bgLastRes?.room) {
                    window._bgLastRes.room.game_state = res.state;
                }
            }
        }
        window._bgIsRolling = false;
        stopBackgammonDiceAnimation();
        if (window._bgLastRes) render_backgammon(window._bgLastRes);
    }, 2200);
}

window.bgRollDice = async function() {
    if (window._bgIsRolling) return;

    // Security: only roll if it's my turn
    const engine = window._bgEngine;
    if (engine.turn !== window._bgMyColor) return;

    window._bgIsRolling = true;
    startBackgammonDiceAnimation();
    render_backgammon(window._bgLastRes);

    setTimeout(async () => {
        const res = await window.apiRequest({ action: 'game_action', type: 'roll_dice' });
        if (res?.status === 'ok' && res.state) {
            engine.syncState(res.state);
            if (window._bgLastRes?.room) {
                window._bgLastRes.room.game_state = res.state;
            }
        }
        window._bgIsRolling = false;
        stopBackgammonDiceAnimation();
        if (window._bgLastRes) render_backgammon(window._bgLastRes);
    }, 2200);
}

function startBackgammonDiceAnimation() {
    stopBackgammonDiceAnimation();
    window._bgRollingFaces = [
        1 + Math.floor(Math.random() * 6),
        1 + Math.floor(Math.random() * 6)
    ];
    window._bgRollingTimer = setInterval(() => {
        window._bgRollingFaces = [
            1 + Math.floor(Math.random() * 6),
            1 + Math.floor(Math.random() * 6)
        ];
        if (window._bgLastRes) render_backgammon(window._bgLastRes);
    }, 120);
}

function stopBackgammonDiceAnimation() {
    if (window._bgRollingTimer) {
        clearInterval(window._bgRollingTimer);
        window._bgRollingTimer = null;
    }
}

window.bgToggleMenu = function() {
    const menu = document.getElementById('bg-game-menu');
    if (menu) menu.classList.toggle('active');
}

window.bgAcknowledgeStart = async function() {
    if (window._bgEngine && window._bgEngine.status === 'starting') {
        const res = await window.apiRequest({ action: 'game_action', type: 'acknowledge_start' });
        if (res?.status === 'ok' && res.state) {
            window._bgEngine.syncState(res.state);
            if (window._bgLastRes?.room) {
                window._bgLastRes.room.game_state = res.state;
            }
        }
        if (window._bgLastRes) render_backgammon(window._bgLastRes);
    }
}

window.bgToggleOrientation = function() {
    const wrapper = document.getElementById('bg-wrapper');
    if (!wrapper) return;

    wrapper.classList.toggle('bg-landscape-mode');
    const isLandscape = wrapper.classList.contains('bg-landscape-mode');
    localStorage.setItem('bg_orientation', isLandscape ? 'landscape' : 'portrait');

    window.bgToggleMenu();
}

function renderPoints(engine, indices, isTop) {
    let arr = [];
    const legalMoveDetails = window._bgSelectedPoint !== null ? engine.getLegalMoveDetails(window._bgSelectedPoint) : new Map();
    const legalMoves = Array.from(legalMoveDetails.keys());
    const movablePoints = engine.turn === window._bgMyColor ? engine.getMovablePoints() : [];

    for (let i of indices) {
        const cell = engine.board[i];
        const isSelected = window._bgSelectedPoint === i;
        const isLegalTarget = legalMoves.includes(i);
        const isMovableSource = movablePoints.includes(i);
        const lastMove = engine.lastMove || window._bgLastMove;
        const isRecentMoveSource = lastMove && lastMove.from === i;
        const isRecentMoveTarget = lastMove && lastMove.to === i;

        let piecesHTML = '';
        if (cell) {
            const total = cell.count;
            const maxStackHeight = 44;
            const idealStep = 8.5;
            const step = total > 1 ? Math.min(idealStep, maxStackHeight / (total - 1)) : 0;

            for (let p=0; p<total; p++) {
                const colorClass = cell.player === 'white' ? 'bg-checker-white' : 'bg-checker-black';
                const offsetPercent = p * step;
                const posStyle = isTop ? `top: ${offsetPercent}%;` : `bottom: ${offsetPercent}%;`;
                const zIndex = p + 10;

                const countLabel = (p === total - 1 && total > 4) ? `<span class="bg-checker-count">${total}</span>` : '';

                piecesHTML += `
                    <div class="bg-checker ${colorClass}" style="${posStyle} z-index:${zIndex};">
                        <div class="bg-checker-inner"></div>
                        ${countLabel}
                    </div>`;
            }
        }

        const pointTriangleClass = isTop ? 'bg-point-top' : 'bg-point-bottom';
        const pointColorClass = (i % 2 === 0) ? 'bg-color-dark' : 'bg-color-light';

        const selectionClass = isSelected ? (isTop ? 'bg-selected-point-top' : 'bg-selected-point') : '';
        const legalOverlay = isLegalTarget ? `
            <div class="bg-legal-target">
                <span>${formatDiceUsed(legalMoveDetails.get(i))}</span>
            </div>
        ` : '';

        arr.push(`
        <div class="bg-point-wrapper ${selectionClass} ${isMovableSource ? 'bg-movable-point' : ''} ${isRecentMoveSource ? 'bg-last-move-source' : ''} ${isRecentMoveTarget ? 'bg-recent-move' : ''}" onclick="bgPointClick(${i})" data-id="${i}">
            <div class="bg-point-scallop"></div>
            <div class="bg-point ${pointTriangleClass} ${pointColorClass}"></div>
            <div class="checkers-container">${piecesHTML}</div>
            ${legalOverlay}
        </div>`);
    }
    return arr;
}
