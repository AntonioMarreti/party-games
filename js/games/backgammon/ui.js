window._bgEngine = null;
window._bgLastRes = null;
window._bgIsRolling = false;
window._bgIsApplyingMove = false;
window._bgIsSyncing = false;
window._bgMyColor = 'white';

window.render_backgammon = function(res) {
    if (!res || !res.room) return;
    window._bgLastRes = res; 
    
    let state = res.room.game_state ? (typeof res.room.game_state === 'string' ? JSON.parse(res.room.game_state) : res.room.game_state) : null;
    const container = document.getElementById('game-area');

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
    const isMyTurn = engine.turn === myColor;
    const isStarting = engine.status === 'starting';
    
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

    if (!state || (state.status === 'setup' && !window._bgEngine.status === 'playing')) {
        renderBgSetup(container, res.is_host, res.room.players || []);
    } else {
        renderBgBoard(container, engine, res, myColor, isMyTurn, isStarting, me, opponent);
    }
};

window.bgSyncState = async function() {
    const engine = window._bgEngine;
    if (!engine) return;
    
    // Flag that we are actively sending a sync to prevent incoming polls from overwriting us
    window._bgIsSyncing = true;
    try {
        await window.apiRequest({ 
            action: 'game_action', 
            type: 'sync_state', 
            state: JSON.stringify(engine) 
        });
    } catch (e) {
        console.error("Sync failed", e);
    } finally {
        window._bgIsSyncing = false;
    }
}

function renderBgSetup(container, isHost, players) {
    container.innerHTML = `
        <div class="text-center p-4">
            <div class="display-1 mb-3 text-primary"><i class="bi bi-dice-5"></i></div>
            <h2 class="fw-bold mb-1">Длинные Нарды</h2>
            <p class="text-muted small mb-4">Классическая игра для двоих</p>
            ${isHost ? 
                `<button class="btn btn-primary btn-lg w-100 mb-3" onclick="bgStartLocal()">Начать игру</button>` :
                `<div class="text-muted mb-3">Ожидание хоста...</div>`
            }
        </div>
    `;
}

window.bgStartLocal = async function() {
    const btn = event.currentTarget;
    const oldText = btn.innerHTML;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Запуск...';
    btn.disabled = true;

    try {
        const res = await window.apiRequest({ action: 'game_action', type: 'start_game' });
        if (res && res.status !== 'error') {
            // Room manager will receive state in the next poll and re-render
        } else {
            console.error("Start error", res);
            btn.innerHTML = oldText;
            btn.disabled = false;
        }
    } catch (e) {
        console.error(e);
        btn.innerHTML = oldText;
        btn.disabled = false;
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
    const canRoll = !isStarting && isMyTurn && engine.movesLeft.length === 0;
    const bothRolled = isStarting && engine.startingRolls && engine.startingRolls.white && engine.startingRolls.black;
    const iAmReady = isStarting && engine.readyToStart && engine.readyToStart[myColor];

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
                <div class="bg-dice-surface ${window._bgIsRolling ? 'rolling' : ''} ${engine.dice.length > 0 ? 'visible' : ''}">
                    ${engine.dice.map(d => `<div class="bg-die die-${d}">${getDiceDots(d)}</div>`).join('')}
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
            ${canRoll ? `<button class="bg-roll-btn ms-2" onclick="bgRollDice()">Бросить</button>` : ''}
        </div>
    `;

    // Update Menu Items (only if empty)
    if (!menuOverlay.innerHTML) {
        menuOverlay.innerHTML = `
            <div class="bg-menu-content" onclick="event.stopPropagation()">
                <div class="bg-menu-header">Меню игры</div>
                <button class="bg-menu-item" onclick="bgToggleOrientation()">
                    <i class="bi bi-phone-landscape me-2"></i> Сменить ориентацию
                </button>
                    <button class="bg-menu-item text-danger" onclick="window.backToLobby && window.backToLobby()">
                        <i class="bi bi-box-arrow-left me-2"></i> Выйти в лобби
                    </button>
                <button class="bg-menu-item mt-2 pt-3 border-top" onclick="bgToggleMenu()">
                    Закрыть
                </button>
            </div>
        `;
    }

    // Update Controls & Result Info
    controls.innerHTML = `
        ${isStarting ? `
            ${bothRolled ? `
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
        ` : (isMyTurn && engine.movesLeft.length === 0) ? `
            <button class="bg-btn bg-btn-primary" onclick="bgRollDice()" ${window._bgIsRolling ? 'disabled' : ''}>
                Бросить кубики
            </button>
        ` : (isMyTurn && engine.movesLeft.length > 0) ? `
            <div class="bg-turn-info">Ваш ход. На кубиках: <span class="badge bg-primary px-3">${engine.movesLeft.join(' и ')}</span></div>
        ` : engine.movesLeft.length > 0 ? `
            <div class="bg-turn-info">Ход соперника. У него: <span class="badge bg-secondary px-3">${engine.movesLeft.join(' и ')}</span></div>
        ` : `
            <div class="bg-turn-info">${isMyTurn ? 'Сделайте ход' : 'Ожидайте ход соперника...'}</div>
        `}
        <button class="bg-btn bg-btn-secondary" onclick="bgToggleMenu()">Меню</button>
    `;
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

    const myId = String(window._bgLastRes.user.id);
    const players = window._bgLastRes.room.players || window._bgLastRes.players || [];
    const amIWhite = players[0] && String(players[0].id) === myId;
    const myColor = amIWhite ? 'white' : 'black';

    if (engine.turn !== myColor) return;

    if (window._bgSelectedPoint !== null) {
        const moves = engine.getLegalMoves(window._bgSelectedPoint);
        if (moves.includes(idx)) {
            window._bgIsApplyingMove = true;
            await engine.applyMove(window._bgSelectedPoint, idx);
            window._bgSelectedPoint = null;
            window._bgIsApplyingMove = false;
            render_backgammon(window._bgLastRes);
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

window.bgRollForStart = async function() {
    if (window._bgIsRolling) return;
    window._bgIsRolling = true;
    render_backgammon(window._bgLastRes);
    
    setTimeout(async () => {
        const engine = window._bgEngine;
        if (engine && engine.status === 'starting') {
            await engine.rollDice(window._bgMyColor);
        }
        window._bgIsRolling = false;
        if (window._bgLastRes) render_backgammon(window._bgLastRes);
    }, 1200);
}

window.bgRollDice = async function() {
    if (window._bgIsRolling) return;
    
    // Security: only roll if it's my turn
    const engine = window._bgEngine;
    if (engine.turn !== window._bgMyColor) return;

    window._bgIsRolling = true;
    render_backgammon(window._bgLastRes);

    setTimeout(async () => {
        await engine.rollDice(window._bgMyColor);
        window._bgIsRolling = false;
        if (window._bgLastRes) render_backgammon(window._bgLastRes);
    }, 1200);
}

window.bgToggleMenu = function() {
    const menu = document.getElementById('bg-game-menu');
    if (menu) menu.classList.toggle('active');
}

window.bgAcknowledgeStart = async function() {
    const engine = window._bgEngine;
    if (engine && engine.status === 'starting') {
        await engine.acknowledgeStart(window._bgMyColor);
        if (window._bgLastRes) render_backgammon(window._bgLastRes);
    }
}

window.bgToggleOrientation = function() {
    window.showAlert("Ориентация", "Смена ориентации будет доступна в следующем обновлении!", "info");
    window.bgToggleMenu();
}

function renderPoints(engine, indices, isTop) {
    let arr = [];
    const legalMoves = window._bgSelectedPoint !== null ? engine.getLegalMoves(window._bgSelectedPoint) : [];

    for (let i of indices) {
        const cell = engine.board[i];
        const isSelected = window._bgSelectedPoint === i;
        const isLegalTarget = legalMoves.includes(i);

        let piecesHTML = '';
        if (cell) {
            const total = cell.count;
            // Adaptive stacking: tight (7.5%) for small counts, compressed if they'd exceed row height
            const maxStackHeight = 38; // % of board half
            const idealStep = 7.5; 
            const step = total > 1 ? Math.min(idealStep, maxStackHeight / (total - 1)) : 0;

            for (let p=0; p<total; p++) {
                const colorClass = cell.player === 'white' ? 'bg-checker-white' : 'bg-checker-black';
                const offsetPercent = p * step;
                const posStyle = isTop ? `top: ${offsetPercent}%;` : `bottom: ${offsetPercent}%;`;
                const zIndex = p + 10;

                // Only show number if more than 5 checkers (it's obvious for 2-5)
                const countLabel = (p === total - 1 && total > 5) ? `<span class="bg-checker-count">${total}</span>` : '';
                
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
        const legalOverlay = isLegalTarget ? `<div class="bg-legal-target"></div>` : '';

        arr.push(`
        <div class="bg-point-wrapper ${selectionClass}" onclick="bgPointClick(${i})" data-id="${i}">
            <div class="bg-point-scallop"></div>
            <div class="bg-point ${pointTriangleClass} ${pointColorClass}"></div>
            <div class="checkers-container">${piecesHTML}</div>
            ${legalOverlay}
        </div>`);
    }
    return arr;
}
