/**
 * Blokus Game Entry Point
 * Manages global state and orchestrates rendering.
 */

// Global Scroll Lock (Modified)
(function () {
    const style = document.createElement('style');
    // Removed 'touch-action: none !important' to allow scrolling in menus
    // Kept fixed positioning to prevent body bounce effects
    // Added padding: 0 !important to remove global body padding which causes bottom strip
    style.innerHTML = 'body, html { position: fixed; width: 100%; height: 100%; overflow: hidden; padding: 0 !important; margin: 0 !important; } .blokus-board { touch-action: none; }';
    document.head.appendChild(style);
})();

// Global state for UI
if (typeof window.blokusState === 'undefined') {
    window.blokusState = {
        serverState: null, // NEW: State from server
        myColor: null,     // NEW: My assigned color
        selectedPieceId: null,
        rotation: 0,
        flipped: false,
        hoverX: -1,
        hoverY: -1,
        scale: 1,
        swipeActive: false,
        swipeTouchX: 0,
        swipeTouchY: 0,
        swipeStartX: 0,
        swipeStartY: 0,
        pieceSelectorOpen: false,
        pieceSizeFilter: 5,
        headerMenuOpen: false,
        turnMenuOpen: false, // New state for turn dropdown
        lastBotTurnIndex: -1 // To prevent multi-firing
    };
}

function render_blokus(res) {
    console.log("[Blokus] Starting Render...", res);
    // 0. Check Local Game Mode
    if (blokusState.isLocalGame) {
        if (!blokusState.game) {
            blokusState.game = new BlokusGame(); // Local Instance
        }
        // Mock a server state from local engine
        blokusState.serverState = blokusState.game.getState();

        // In local mode, I am effectively "Current Player" always (Hotseat)
        const s = blokusState.serverState;
        blokusState.myColor = s.turnOrder[s.currentTurnIndex];
    } else {
        // 1. Parse Server State
        // Ensure res object and room exist (robustness)
        if (!res || !res.room) return;

        let gameState = null;
        try {
            gameState = (typeof res.room.game_state === 'string')
                ? JSON.parse(res.room.game_state)
                : res.room.game_state;
        } catch (e) { console.error("Parse error", e); }

        if (!gameState) return; // Wait for valid state

        if (!gameState) return; // Wait for valid state

        blokusState.serverState = gameState;
        blokusState.players = res.players; // Store player metadata (names, avatars)

        // 2. Determine My Color (Dynamic for 2/3 Player Modes)
        if (!res.players || !res.user) {
            console.warn("[Blokus] Missing players or user in res", res);
            return;
        }
        const myIndex = res.players.findIndex(p => p.id == res.user.id);
        const colors = ['BLUE', 'YELLOW', 'RED', 'GREEN'];
        const myPrimaryColor = (myIndex >= 0 && myIndex < 4) ? colors[myIndex] : null; // "Seat" color

        // Logic: Which color should I see as "Mine" right now?
        // If it is my turn (even if secondary color), show that color.
        // Otherwise show my primary seat color.

        let activeColor = myPrimaryColor;

        const mode = gameState.mode || 'standard';
        const currentColor = gameState.turnOrder[gameState.currentTurnIndex];

        let isMyTurnCurrent = false;

        if (mode === '2player' && myIndex !== -1) {
            // P1 (0): BLUE & RED
            // P2 (1): YELLOW & GREEN
            if (myIndex === 0) {
                if (currentColor === 'BLUE' || currentColor === 'RED') isMyTurnCurrent = true;
            } else if (myIndex === 1) {
                if (currentColor === 'YELLOW' || currentColor === 'GREEN') isMyTurnCurrent = true;
            }
        } else if (mode === '3player' && myIndex !== -1) {
            // GREEN check
            if (currentColor === 'GREEN' && gameState.greenOwnerIndex === myIndex) {
                isMyTurnCurrent = true;
            } else if (currentColor === colors[myIndex]) {
                isMyTurnCurrent = true;
            }
        } else {
            // Standard
            if (myPrimaryColor === currentColor) isMyTurnCurrent = true;
        }

        if (isMyTurnCurrent) {
            activeColor = currentColor;
        }

        blokusState.myColor = activeColor;
    }

    const container = document.getElementById('game-area');
    if (!container) return;

    // 3. Build Static Wrapper if not present
    if (!document.querySelector('.blokus-wrapper')) {
        // Hide Lobby Elements
        ['default-game-header', 'game-host-controls', 'score-card', 'tab-bar'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.setProperty('display', 'none', 'important');
        });

        // Inject Styles
        injectBlokusStyles();

        container.innerHTML = `
            <div class="blokus-wrapper">
                <div class="blokus-header" id="blokus-header-node"></div>
                
                <!-- SETUP / RULES OVERLAY -->
                <div id="blokus-setup-screen" style="display:none; position:absolute; inset:0; background:rgba(255,255,255,0.1); backdrop-filter:blur(20px); -webkit-backdrop-filter:blur(20px); z-index:1500; padding:20px; text-align:center;">
                    <div class="d-flex flex-column align-items-center justify-content-center h-100">
                        <i class="bi bi-grid-3x3 mb-3" style="font-size: 48px; color: var(--primary-color); text-shadow: 0 4px 10px color-mix(in srgb, var(--primary-color), transparent 60%);"></i>
                        <h1 class="fw-bold mb-2">Blokus</h1>
                        <p class="text-muted mb-4 subtitle-text">Захвати территорию и заблокируй других!</p>
                        
                        <div class="card p-4 mb-4 w-100 shadow-sm border-0 text-start glass-modern-card" style="border-radius: 24px;">
                            <h6 class="fw-bold mb-2 title-text">Как играть:</h6>
                            <ul class="small text-muted ps-3 mb-0" style="gap:5px; display:flex; flex-direction:column;">
                                <li>Фигуры должны касаться <b>только углом</b> фигур вашего цвета.</li>
                                <li>Фигуры <b>не могут</b> касаться сторонами фигур вашего цвета.</li>
                                <li>Разные цвета могут касаться как угодно.</li>
                                <li>Первый ход должен занять угол доски.</li>
                            </ul>
                        </div>

                        <div class="alert alert-info w-100 small mb-4">
                            Порядок ходов:<br>
                            <span class="text-primary fw-bold">Синий</span> → 
                            <span class="text-warning fw-bold">Жёлтый</span> → 
                            <span class="text-danger fw-bold">Красный</span> → 
                            <span class="text-success fw-bold">Зелёный</span>
                        </div>
                        
                        <div id="setup-host-controls">
                            <!-- MODE SELECTION -->
                            <div class="mb-3">
                                <select id="blokus-mode-select" class="form-select text-center fw-bold custom-select-modern" style="border-radius: 12px;">
                                    <option value="standard">Стандарт (4 игрока)</option>
                                    <option value="3player">3 игрока (Зелёный общий)</option>
                                    <option value="2player">2 игрока (по 2 цвета)</option>
                                    <option value="duo">Blokus Duo (2 игрока, 14x14)</option>
                                </select>
                            </div>

                            <button class="btn btn-lg w-100 fw-bold text-white shadow-sm mb-3" 
                                style="background: var(--primary-color); border-radius: 16px;" 
                                onclick="blokusStartMatch()">
                                Начать игру
                            </button>
                            
                            <button class="btn btn-outline-secondary w-100 fw-bold mb-2" 
                                style="border-radius: 16px;" 
                                onclick="returnToRoomLobby()">
                                <i class="bi bi-arrow-left me-2"></i>Назад в лобби
                            </button>
                            <button class="btn btn-link text-muted small" onclick="startLocalGame()">
                                Играть локально (на одном устройстве)
                            </button>
                        </div>
                        <div id="setup-guest-msg" class="text-muted small">
                            Ожидание хоста...
                        </div>
                    </div>
                </div>

                <!-- GAME OVER OVERLAY -->
                <div id="blokus-results-screen" style="display:none; position:absolute; inset:0; background:rgba(0,0,0,0.7); z-index:1600; padding:120px 20px 40px 20px; align-items: flex-end; justify-content: center;">
                   <div class="results-card-container w-100 rounded-4 p-4 shadow-lg anime-slide-up" style="max-height: 100%; display: flex; flex-direction: column; position: relative;">
                        <h2 class="fw-bold text-center mb-4 title-text">Результаты</h2>
                        <div id="blokus-results-list" class="flex-grow-1 overflow-auto mb-3" style="min-height: 150px;"></div>
                        <div class="results-footer pb-2">
                             <!-- Dynamic Buttons -->
                        </div>
                   </div>
                </div>

                <div class="blokus-board-container" id="board-container">
                    <div class="blokus-board" id="blokus-grid"></div>
                </div>
                
                <div class="blokus-hand-area">
                    <div class="hand-panel-content-inner">
                        <div class="hand-interaction-grid-area" id="hand-interaction-area"></div>
                        <div class="hand-controls-row">
                            <button class="btn" onclick="blokusRotate()">
                                <i class="bi bi-arrow-clockwise"></i>
                                <span>Повернуть</span>
                            </button>
                            <button class="btn" onclick="blokusFlip()">
                                <i class="bi bi-arrow-left-right"></i>
                                <span>Отразить</span>
                            </button>
                            <button class="btn btn-pass" onclick="blokusPassTurn()">
                                <i class="bi bi-skip-forward-fill"></i>
                                <span>Пропустить</span>
                            </button>
                            <button class="btn btn-apply" id="btn-apply-move" disabled onclick="blokusApplyMove()">
                                <i class="bi bi-check-lg"></i>
                                <span>Поставить</span>
                            </button>
                        </div>
                    </div>
                </div>

                <!-- MODAL OVERLAY (PIECE SELECTOR) -->
                <div class="blokus-modal-overlay" id="blokus-modal-overlay" onclick="togglePieceSelector(false)">
                    <div class="blokus-modal-content" onclick="event.stopPropagation()">
                        <div class="modal-handle-close" onclick="togglePieceSelector(false)"></div>
                        <div id="modal-pieces-grid" class="pieces-grid-container"></div>
                        <div id="modal-filter-area" class="capsule-filter-container"></div>
                        <div id="modal-controls-area" class="hand-controls-row" style="margin-top: 10px;"></div>
                    </div>
                </div>
            </div>
        `;

        // Bind Events once
        const grid = document.getElementById('blokus-grid');
        grid.addEventListener('mousemove', handleBoardHover);
        grid.addEventListener('click', handleBoardClick);
        grid.addEventListener('touchstart', handleBoardTouchStart, { passive: false });
        grid.addEventListener('touchmove', handleBoardTouchMove, { passive: false });
        grid.addEventListener('touchend', handleBoardTouchEnd);
        grid.addEventListener('mouseleave', () => {
            blokusState.hoverX = -1; blokusState.hoverY = -1; renderBoard();
        });
    }

    // 4. Handle Game Phase UI
    const setupScreen = document.getElementById('blokus-setup-screen');
    const resultsScreen = document.getElementById('blokus-results-screen');
    const hostControls = document.getElementById('setup-host-controls');
    const guestMsg = document.getElementById('setup-guest-msg');

    if (blokusState.serverState.status === 'setup') {
        setupScreen.style.display = 'block';
        resultsScreen.style.display = 'none';

        if (window.isHost) {
            hostControls.style.display = 'block';
            guestMsg.style.display = 'none';
        } else {
            hostControls.style.display = 'none';
            guestMsg.style.display = 'block';
        }
    } else if (blokusState.serverState.status === 'finished') {
        setupScreen.style.display = 'none';
        resultsScreen.style.display = 'flex'; // Important for centering
        renderResults(blokusState.serverState);
    } else {
        setupScreen.style.display = 'none';
        resultsScreen.style.display = 'none';
    }

    // 5. Update Dynamic Parts
    updateHeader();
    renderBoard();
    updateHandInteractionArea();

    // Enable Global Reactions
    if (window.renderReactionToolbar) window.renderReactionToolbar();

    // 6. Check for Bot Turn
    checkBotTurn();

    // SOUNDS: Check for turn change
    if (blokusState.serverState.status === 'playing') {
        const s = blokusState.serverState;
        const myColor = blokusState.myColor;
        const currentColor = s.turnOrder[s.currentTurnIndex];

        // If it JUST became my turn (naive check: simple polling might re-trigger, 
        // ideally we check previous state, but for now we rely on idempotency or "notification" type sounds)
        if (myColor === currentColor && window.lastTurnIndex !== s.currentTurnIndex) {
            window.audioManager.play('notification');
            window.lastTurnIndex = s.currentTurnIndex;
        }
    }
}

async function checkBotTurn() {
    if (!window.isHost) return;
    const s = blokusState.serverState;
    if (!s || s.status !== 'playing') return;

    // Avoid reacting to same turn data twice
    if (blokusState.lastBotTurnIndex === s.currentTurnIndex) return;

    const currentColor = s.turnOrder[s.currentTurnIndex];
    const roomPlayers = blokusState.players; // From res.players (DB info with is_bot)
    if (!roomPlayers) return;

    let activePlayer = null;
    const colors = ['BLUE', 'YELLOW', 'RED', 'GREEN'];

    // Map Color -> Player
    const mode = s.mode || 'standard';

    if (mode === 'standard') {
        const idx = colors.indexOf(currentColor);
        if (idx !== -1) activePlayer = roomPlayers[idx];
    } else if (mode === '2player') {
        // P1(0): Blue/Red, P2(1): Yellow/Green
        if (currentColor === 'BLUE' || currentColor === 'RED') activePlayer = roomPlayers[0];
        else activePlayer = roomPlayers[1];
    } else if (mode === '3player') {
        const idx = colors.indexOf(currentColor);
        if (idx !== -1 && idx < 3) activePlayer = roomPlayers[idx]; // Blue, Yellow, Red
        else if (currentColor === 'GREEN') {
            activePlayer = roomPlayers[s.greenOwnerIndex];
        }
    } else if (mode === 'duo') {
        // Duo: Blue(0), Yellow(1)
        if (currentColor === 'BLUE') activePlayer = roomPlayers[0];
        else if (currentColor === 'YELLOW') activePlayer = roomPlayers[1];
    }

    if (activePlayer && activePlayer.is_bot == 1) {
        console.log(`[Bot] It is ${activePlayer.bot_difficulty} bot's turn (${currentColor}). Thinking...`);

        // Set lock immediately to prevent double-scheduling in next poll
        // But we MUST clear it if we fail to start the action
        blokusState.lastBotTurnIndex = s.currentTurnIndex;

        // Slight delay to simulate thinking and allow UI to render "Bot Turn"
        setTimeout(async () => {
            // Re-check state availability
            if (!blokusState.serverState) return;

            // Double check we are still on the same turn (game didn't advance while waiting)
            if (blokusState.serverState.currentTurnIndex !== blokusState.lastBotTurnIndex) return;

            try {
                if (typeof BlokusBot === 'undefined') {
                    throw new Error("BlokusBot class not found");
                }

                // Instantiate Bot
                const bot = new BlokusBot(blokusState.serverState, currentColor, activePlayer.bot_difficulty || 'medium');
                const bestMove = bot.findBestMove();

                if (bestMove) {
                    console.log("[Bot] Found move:", bestMove);
                    // Send to Server
                    await apiRequest({
                        action: 'game_action',
                        game_action: 'place_piece',
                        piece_id: bestMove.pieceId,
                        shape: JSON.stringify(bestMove.shape),
                        x: bestMove.x,
                        y: bestMove.y
                    });
                } else {
                    console.log("[Bot] No move found. Passing.");
                    await apiRequest({
                        action: 'game_action',
                        game_action: 'pass_turn'
                    });
                }

                // We do NOT clear the lock here on success, because we want to wait for the
                // server to process and change the currentTurnIndex, which will naturally release the lock.
                window.audioManager.play('move'); // Bot made a move

            } catch (e) {
                console.error("[Bot] Error:", e);
                // CRITICAL: If we failed, we might want to release the lock to try agin?
                // Or maybe just log it. Retrying immediately might spam if it's a logic bug.
                // Let's reset it so we retry on next poll (approx 1s later)
                blokusState.lastBotTurnIndex = -1;
            }
        }, 1000 + Math.random() * 1000); // 1-2s thinking time
    }
}

function renderResults(state) {
    const list = document.getElementById('blokus-results-list');
    if (!list) return;

    // Use aggregated results if available
    let results = [];
    if (state.gameResults && state.gameResults.length > 0) {
        results = state.gameResults.map(entry => {
            const pObj = blokusState.players ? blokusState.players.find(p => p.id == entry.user_id) : null;
            return {
                name: pObj ? (pObj.custom_name || pObj.first_name) : `Игрок ${entry.user_id}`,
                score: entry.score,
                rank: entry.rank,
                isMyUser: (globalUser && globalUser.id == entry.user_id)
            };
        });
    } else {
        // Fallback
        results = Object.entries(state.finalScores || {})
            .map(([color, score]) => ({ color, score }))
            .sort((a, b) => b.score - a.score)
            .map((entry, i) => ({
                name: getRussianColorName(entry.color),
                score: entry.score,
                rank: i + 1,
                color: entry.color
            }));
    }

    list.innerHTML = results.map(r => {
        let bgStyle = 'background: #f8f9fa;';
        let textClass = 'text-dark';
        let borderStyle = 'border: 1px solid #eee;';

        if (r.rank === 1) {
            bgStyle = 'background: linear-gradient(135deg, #FFD700 0%, #FDB931 100%); color: #5c4000;';
            textClass = ''; // custom color
            borderStyle = 'border: none; box-shadow: 0 4px 12px rgba(255, 215, 0, 0.3);';
        } else if (r.isMyUser) {
            bgStyle = 'background: #e7f1ff;';
            borderStyle = 'border: 1px solid #b6d4fe;';
        }

        return `
            <div class="d-flex align-items-center mb-3 p-3 rounded-4" style="${bgStyle} ${borderStyle}">
                <div class="fw-bold fs-4 me-3" style="min-width: 30px; opacity: 0.7;">#${r.rank}</div>
                <div class="flex-grow-1">
                    <div class="fw-bold fs-5 ${textClass}">${r.name}</div>
                </div>
                <div class="fw-bold fs-3 ${textClass}">${r.score}</div>
            </div>
        `;
    }).join('');

    // Update Buttons area based on role
    const footer = document.querySelector('#blokus-results-screen .results-footer');
    if (footer) {
        if (window.isHost) {
            footer.innerHTML = `
                <button class="btn btn-primary w-100 py-3 rounded-4 fw-bold mb-2 shadow-sm" onclick="returnToRoomLobby()">
                    Вернуться в комнату
                </button>
                <button class="btn btn-link text-muted w-100" onclick="leaveRoom()">
                    Покинуть комнату
                </button>
            `;
        } else {
            footer.innerHTML = `
                <div class="text-center text-muted mb-3 small">Ожидайте хоста...</div>
                <button class="btn btn-outline-danger w-100 py-3 rounded-4" onclick="leaveRoom()">
                    Выйти
                </button>
            `;
        }
    }
}

function getRussianColorName(color) {
    const map = { 'BLUE': 'Синий', 'YELLOW': 'Жёлтый', 'RED': 'Красный', 'GREEN': 'Зелёный' };
    return map[color] || color;
}

window.togglePieceSelector = function (open) {
    blokusState.pieceSelectorOpen = open;
    updateHandInteractionArea();
};

window.setPieceFilter = function (num) {
    blokusState.pieceSizeFilter = num;
    updateHandInteractionArea();
};

// Global Exposure
window.render_blokus = render_blokus;

// Hook into blokus actions for sounds (Monkey Patching or direct edit handlers.js would be better, but this is faster)
const originalApply = window.blokusApplyMove;
window.blokusApplyMove = async function () {
    // We assume if this is called, button was enabled
    window.audioManager.play('move');
    if (originalApply) await originalApply();
};

const originalPieceSelect = window.selectPiece;
// We need to catch where selectPiece is defined. It's likely in ui.js or handlers.js. 
// Since we are editing blokus.js which is the entry point, we can wrap standard UI interactions here if exposed.

