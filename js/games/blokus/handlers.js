/**
 * Blokus Interaction Handlers
 * Handles touch, mouse, and game actions.
 */

function handleBoardHover(e) {
    if (blokusState.swipeActive) return;

    const boardSize = (blokusState.serverState && blokusState.serverState.boardSize) || 20;

    const rect = e.target.closest('#blokus-grid').getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) / (rect.width / boardSize));
    const y = Math.floor((e.clientY - rect.top) / (rect.height / boardSize));

    if (x >= 0 && x < boardSize && y >= 0 && y < boardSize) {
        if (x !== blokusState.hoverX || y !== blokusState.hoverY) {
            blokusState.hoverX = x;
            blokusState.hoverY = y;
            renderBoard();
        }
    }
}

function handleBoardClick(e) {
    if (!blokusState.selectedPieceId) return;

    const boardSize = (blokusState.serverState && blokusState.serverState.boardSize) || 20;

    // Calculate coords explicitly to be safe
    const rect = e.target.closest('#blokus-grid').getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) / (rect.width / boardSize));
    const y = Math.floor((e.clientY - rect.top) / (rect.height / boardSize));

    // Update state just in case
    blokusState.hoverX = x;
    blokusState.hoverY = y;

    if (x >= 0 && x < boardSize && y >= 0 && y < boardSize) {
        // Haptic feel
        triggerHaptic('impact', 'medium');

        // Call Apply
        blokusApplyMove();
    }
}

function handleBoardTouchStart(e) {
    if (!blokusState.selectedPieceId) return;
    const touch = e.touches[0];
    blokusState.swipeActive = true;
    blokusState.swipeTouchX = touch.clientX;
    blokusState.swipeTouchY = touch.clientY;
    blokusState.swipeStartX = blokusState.hoverX === -1 ? 10 : blokusState.hoverX;
    blokusState.swipeStartY = blokusState.hoverY === -1 ? 10 : blokusState.hoverY;

    if (blokusState.hoverX === -1) {
        blokusState.hoverX = blokusState.swipeStartX;
        blokusState.hoverY = blokusState.swipeStartY;
        renderBoard();
    }
}

function handleBoardTouchMove(e) {
    if (!blokusState.swipeActive) return;
    e.preventDefault();

    const boardSize = (blokusState.serverState && blokusState.serverState.boardSize) || 20;

    const touch = e.touches[0];
    const dx = touch.clientX - blokusState.swipeTouchX;
    const dy = touch.clientY - blokusState.swipeTouchY;

    const cellSize = document.getElementById('blokus-grid').offsetWidth / boardSize;

    const moveX = Math.round(dx / cellSize);
    const moveY = Math.round(dy / cellSize);

    const newX = Math.max(0, Math.min(boardSize - 1, blokusState.swipeStartX + moveX));
    const newY = Math.max(0, Math.min(boardSize - 1, blokusState.swipeStartY + moveY));

    if (newX !== blokusState.hoverX || newY !== blokusState.hoverY) {
        blokusState.hoverX = newX;
        blokusState.hoverY = newY;
        triggerHaptic('selection');
        renderBoard();
    }
}

function handleBoardTouchEnd() {
    blokusState.swipeActive = false;
}

function selectPiece(pieceId) {
    blokusState.selectedPieceId = pieceId;
    togglePieceSelector(false); // Close panel after selection
    updateHandInteractionArea();
    renderBoard();
    triggerHaptic('impact', 'light');
}

function blokusRotate() {
    blokusState.rotation = (blokusState.rotation + 1) % 4;
    triggerHaptic('impact', 'light');
    updateHandInteractionArea();
    renderBoard();
}

function blokusFlip() {
    blokusState.flipped = !blokusState.flipped;
    blokusState.rotation = (4 - blokusState.rotation) % 4;
    triggerHaptic('impact', 'light');
    updateHandInteractionArea();
    renderBoard();
}

function getTransformedShape(pieceId) {
    if (!pieceId) return [];

    // 1. Get Base Coords
    const def = PIECE_DEFINITIONS[pieceId];
    if (!def) return [];

    // 2. Apply Flip
    let coords = def.map(p => [...p]); // Copy
    if (blokusState.flipped) {
        coords = coords.map(p => [-p[0], p[1]]);
    }

    // 3. Apply Rotation
    for (let i = 0; i < blokusState.rotation; i++) {
        coords = coords.map(p => [-p[1], p[0]]);
    }

    // 4. Center the shape (New Logic)
    // Find bounding box
    const minX = Math.min(...coords.map(p => p[0]));
    const maxX = Math.max(...coords.map(p => p[0]));
    const minY = Math.min(...coords.map(p => p[1]));
    const maxY = Math.max(...coords.map(p => p[1]));

    const midX = Math.floor((minX + maxX) / 2);
    const midY = Math.floor((minY + maxY) / 2);

    // Shift so center is at (0,0)
    return coords.map(p => [p[0] - midX, p[1] - midY]).sort((a, b) => {
        if (a[0] !== b[0]) return a[0] - b[0];
        return a[1] - b[1];
    });
}

function validatePlacementLocal(shape, startX, startY) {
    if (!blokusState.serverState || !blokusState.serverState.grid) return { valid: false, reason: 'NO_STATE' };
    const boardGrid = blokusState.serverState.grid;
    const boardSize = blokusState.serverState.boardSize || 20;
    const myColor = blokusState.myColor;

    // 1. Basic Bounds & Overlap Check
    for (const [px, py] of shape) {
        const absX = startX + px;
        const absY = startY + py;

        if (absX < 0 || absX >= boardSize || absY < 0 || absY >= boardSize) {
            return { valid: false, reason: 'OUT_OF_BOUNDS' };
        }
        if (boardGrid[absY][absX] !== null) {
            return { valid: false, reason: 'CELL_OCCUPIED' };
        }
    }

    // 2. Rules Check
    let connectsToCorner = false;
    let touchingSide = false;

    // Check neighbors for every cell in the shape
    for (const [px, py] of shape) {
        const absX = startX + px;
        const absY = startY + py;

        // Sides
        const sides = [[absX + 1, absY], [absX - 1, absY], [absX, absY + 1], [absX, absY - 1]];
        for (const [nx, ny] of sides) {
            if (nx >= 0 && nx < boardSize && ny >= 0 && ny < boardSize) {
                if (boardGrid[ny][nx] === myColor) {
                    return { valid: false, reason: 'TOUCH_SIDE' };
                }
            }
        }

        // Corners
        const corners = [[absX + 1, absY + 1], [absX - 1, absY - 1], [absX + 1, absY - 1], [absX - 1, absY + 1]];
        for (const [nx, ny] of corners) {
            if (nx >= 0 && nx < boardSize && ny >= 0 && ny < boardSize) {
                if (boardGrid[ny][nx] === myColor) {
                    connectsToCorner = true;
                }
            }
        }
    }

    // 3. First Move Exception
    const pState = blokusState.serverState.players[myColor];
    if (pState && !pState.hasPlayedFirstMove) {
        // Must cover a starting point
        const startPt = getStartPointForColor(myColor, blokusState.serverState.mode || 'standard', boardSize);
        if (startPt) {
            const coversStart = shape.some(([px, py]) => (startX + px) === startPt.x && (startY + py) === startPt.y);
            if (!coversStart) return { valid: false, reason: 'MUST_START_AT_CORNER' };
            return { valid: true };
        }
    }

    if (!connectsToCorner) return { valid: false, reason: 'NO_CORNER_CONTACT' };

    return { valid: true };
}

async function blokusApplyMove() {
    if (!blokusState.selectedPieceId || blokusState.hoverX === -1) return;

    const currentShape = getTransformedShape(blokusState.selectedPieceId);

    if (blokusState.isLocalGame) {
        try {
            const player = blokusState.game.getCurrentPlayer();
            blokusState.game.applyMove(player.color, blokusState.selectedPieceId, currentShape, blokusState.hoverX, blokusState.hoverY);

            blokusState.selectedPieceId = null;
            blokusState.hoverX = -1;
            blokusState.hoverY = -1;
            triggerHaptic('notification', 'success');
            const mockRes = { room: {}, players: [], user: { id: 0 } };
            render_blokus(mockRes);
        } catch (e) {
            alert(e.message);
        }
    } else {
        try {
            const res = await apiRequest({
                action: 'game_action',
                game_action: 'place_piece',
                piece_id: blokusState.selectedPieceId,
                shape: JSON.stringify(currentShape), // Serialize nested array
                x: blokusState.hoverX,
                y: blokusState.hoverY
            });

            if (res && res.status === 'error') {
                alert(res.message); // Explicitly show server error
                return; // Do not clear selection
            }

            // On success
            blokusState.selectedPieceId = null;
            blokusState.hoverX = -1;
            blokusState.hoverY = -1;
            triggerHaptic('notification', 'success');
            checkState();

        } catch (e) {
            alert(e.message || "Network Error");
        }
    }
}

async function blokusPassTurn() {
    if (confirm('Пропустить ход?')) {
        await apiRequest({
            action: 'game_action',
            game_action: 'pass_turn'
        });

        blokusState.selectedPieceId = null;
        blokusState.hoverX = -1;
        blokusState.hoverY = -1;
        triggerHaptic('impact', 'medium');
        checkState();
    }
}

async function blokusStartMatch() {
    const modeSelect = document.getElementById('blokus-mode-select');
    const mode = modeSelect ? modeSelect.value : 'standard';

    await apiRequest({
        action: 'game_action',
        game_action: 'start_match',
        mode: mode
    });
    checkState();
}

// Helper to determine if it is my turn
function isMyTurn() {
    if (!blokusState.serverState || !blokusState.myColor) return false;
    const { turnOrder, currentTurnIndex } = blokusState.serverState;
    return turnOrder[currentTurnIndex] === blokusState.myColor;
}

function backToLobby() {
    if (confirm('Выйти из игры?')) {
        leaveRoom();
    }
}

// Global exposure
window.handleBoardHover = handleBoardHover;
window.handleBoardClick = handleBoardClick;
window.handleBoardTouchStart = handleBoardTouchStart;
window.handleBoardTouchMove = handleBoardTouchMove;
window.handleBoardTouchEnd = handleBoardTouchEnd;
window.selectPiece = selectPiece;
window.blokusRotate = blokusRotate;
window.blokusFlip = blokusFlip;
window.blokusApplyMove = blokusApplyMove;
window.blokusPassTurn = blokusPassTurn;
window.backToLobby = backToLobby;
window.blokusSuggestMove = function () {
    if (!blokusState.serverState || !blokusState.myColor) return;

    // Show loading?
    const btn = document.getElementById('btn-suggest-move');
    if (btn) btn.innerHTML = '<i class="bi bi-hourglass-split"></i>';

    // Use timeout to allow UI to render spinner
    setTimeout(() => {
        try {
            if (typeof BlokusBot === 'undefined') {
                throw new Error("Бот не загружен. Перезагрузите страницу.");
            }
            if (typeof getStartPointForColor === 'undefined') {
                // Fallback if ui.js hasn't updated in cache yet?
                throw new Error("Ошибка зависимостей (UI). Перезагрузите.");
            }

            const bot = new BlokusBot(blokusState.serverState, blokusState.myColor);
            const bestMove = bot.findBestMove();

            if (bestMove) {
                // Apply to UI State
                blokusState.selectedPieceId = bestMove.pieceId;
                blokusState.rotation = bestMove.rotation;
                blokusState.flipped = bestMove.flipped;
                blokusState.hoverX = bestMove.x;
                blokusState.hoverY = bestMove.y;

                // Trigger visual updates
                updateHandInteractionArea();
                renderBoard();
                triggerHaptic('notification', 'success');
            } else {
                alert("Бог не видит подходящих ходов :(");
            }
        } catch (e) {
            console.error(e);
            alert("Ошибка бота: " + e.message);
        }

        if (btn) btn.innerHTML = '<i class="bi bi-magic"></i>';
    }, 50);
};

window.returnToRoomLobby = async function () {
    if (!window.isHost) return;
    triggerHaptic('impact', 'medium');

    try {
        await apiRequest({ action: 'stop_game' }); // Resets room to lobby mode
        checkState(); // Refresh UI to show lobby
    } catch (e) {
        alert("Ошибка: " + e.message);
    }
};

window.blokusStartMatch = blokusStartMatch;
window.startLocalGame = startLocalGame;
window.getTransformedShape = getTransformedShape;
window.validatePlacementLocal = validatePlacementLocal;
