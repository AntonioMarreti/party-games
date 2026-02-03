/**
 * Blokus UI & Rendering
 * Handles CSS injection and UI component rendering.
 */

function getPlayerColorHex(color, opacity = 1) {
    const colors = {
        'BLUE': `rgba(52, 152, 219, ${opacity})`,
        'YELLOW': `rgba(241, 196, 15, ${opacity})`,
        'RED': `rgba(231, 76, 60, ${opacity})`,
        'GREEN': `rgba(46, 204, 113, ${opacity})`
    };
    return colors[color] || `rgba(200, 200, 200, ${opacity})`;
}

function injectBlokusStyles() {
    // Styles are now loaded from css/modules/blokus.css
    return;
}

function updateHeader() {
    const header = document.getElementById('blokus-header-node');
    if (!header || !blokusState.serverState) return;

    const s = blokusState.serverState;
    const currentPlayerColor = s.turnOrder[s.currentTurnIndex];
    const playerColors = ['BLUE', 'YELLOW', 'RED', 'GREEN'];
    const myColor = blokusState.myColor;
    const isMyTurn = currentPlayerColor === myColor;

    // Determine Label and Color for the main button
    let mainLabel = isMyTurn ? "Твой ход" : `Ходит: ${getNameForColor(currentPlayerColor, s.currentTurnIndex)} `;
    // Truncate main label if too long
    if (mainLabel.length > 27) mainLabel = mainLabel.substring(0, 25) + "..";

    // Button Styling
    const mainColor = getPlayerColorHex(currentPlayerColor);
    const btnBg = mainColor;
    const btnColor = 'white';

    // Dropdown Visibility
    const dropdownDisplay = blokusState.turnMenuOpen ? 'flex' : 'none';

    // Calculate score/pieces text
    // During game: Show remaining squares count (sum of piece sizes)
    const getStatusText = (pState) => {
        if (!pState || !pState.remainingPieces) return "";

        let totalSquares = 0;
        if (typeof PIECE_DEFINITIONS !== 'undefined') {
            pState.remainingPieces.forEach(pid => {
                if (PIECE_DEFINITIONS[pid]) {
                    totalSquares += PIECE_DEFINITIONS[pid].length;
                }
            });
        } else {
            return `${pState.remainingPieces.length} шт`;
        }

        if (totalSquares === 0 && pState.remainingPieces.length === 0) return "Done";
        return `${totalSquares} `; // Positive number of remaining squares
    };

    const headerHtml = `
        <div class="header-top" style="
    display: flex;
    justify-content: center;
    align-items: center;
    margin-bottom: 8px;
    height: 40px;
    ">
        <!--Center: Title Only-->
            <div style="
                font-weight: 900; 
                color: var(--text-muted); 
                letter-spacing: 2px; 
                font-size: 18px;
                cursor: pointer;
            " onclick="toggleHeaderMenu(event)">
                BLOKUS
            </div>
            
            <!--EXIT MENU DROPDOWN-->
        <div class="header-dropdown ${blokusState.headerMenuOpen ? 'active' : ''}">
            <button class="header-menu-item" onclick="leaveRoom()">
                <i class="bi bi-door-open text-danger"></i>
                <span class="text-danger">Покинуть игру</span>
            </button>
            <button class="header-menu-item" onclick="location.reload()">
                <i class="bi bi-arrow-clockwise"></i>
                <span>Перезагрузить</span>
            </button>
        </div>
        </div>
        
        <!--TURN INDICATOR ROW-->
        <div style="position: relative; display: flex; justify-content: center;">
            <button onclick="toggleTurnMenu()" style="
                background: ${btnBg}; 
                color: ${btnColor}; 
                border: none; 
                border-radius: 25px; 
                padding: 8px 20px; 
                font-weight: 800; 
                font-size: 15px; 
                display: flex; 
                align-items: center; 
                gap: 8px; 
                box-shadow: 0 4px 15px ${btnBg}60;
                transition: 0.2s;
                z-index: 1400;
            ">
                <i class="bi bi-chevron-down" style="font-size: 12px;"></i>
                ${mainLabel}
            </button>

            <!-- DROPDOWN LIST -->
            <div class="turn-dropdown-list" style="
                display: ${dropdownDisplay};
                position: absolute;
                top: 120%;
                left: 50%;
                transform: translateX(-50%);
                background: white;
                border-radius: 24px;
                box-shadow: 0 10px 40px rgba(0,0,0,0.15);
                border: 1px solid rgba(0,0,0,0.05);
                padding: 8px;
                flex-direction: column;
                gap: 6px;
                width: max-content;
                min-width: 180px;
                z-index: 1350;
                animation: popIn 0.2s cubic-bezier(0.2, 0.8, 0.2, 1);
            ">
                ${playerColors.map((color, idx) => {
        const isCurrent = currentPlayerColor === color;
        const pState = s.players[color];
        if (!pState) return ''; // Skip missing players (e.g. in Duo mode)

        const name = getNameForColor(color, idx);
        const bg = getPlayerColorHex(color);
        const statusText = getStatusText(pState);

        return `
                        <div style="
                            padding: 8px 16px; 
                            background: ${isCurrent ? bg : 'transparent'}; 
                            color: ${isCurrent ? 'white' : 'var(--text-main)'}; 
                            border-radius: 16px; 
                            font-weight: 700; 
                            font-size: 14px; 
                            display: flex; 
                            align-items: center; 
                            gap: 10px;
                        ">
                            <i class="bi bi-person-fill" style="opacity: ${isCurrent ? 1 : 0.5}"></i>
                            <span style="flex:1;">${name}</span>
                            <span style="opacity: 0.8; font-size: 12px;">${statusText}</span>
                        </div>
                    `;
    }).join('')}
            </div>
        </div>
    `;

    if (header.innerHTML !== headerHtml) {
        header.innerHTML = headerHtml;
    }
}

// Ensure toggle function is globally available
window.toggleTurnMenu = function () {
    blokusState.turnMenuOpen = !blokusState.turnMenuOpen;
    updateHeader();

    // Auto-close on outside click logic could be added here if needed
    if (blokusState.turnMenuOpen) {
        setTimeout(() => {
            const closer = () => {
                blokusState.turnMenuOpen = false;
                updateHeader();
                document.removeEventListener('click', closer);
            };
            document.addEventListener('click', closer);
        }, 0);
    }
};

// Helper to find name from blokusState.players based on index
function getNameForColor(color, index) {
    // Determine effective index based on Mode
    let effectiveIndex = index;
    const mode = (blokusState.serverState && blokusState.serverState.mode) || 'standard';

    if (mode === '2player') {
        // 0->0, 1->1, 2->0 (Red is P1), 3->1 (Green is P2)
        if (index === 2) effectiveIndex = 0;
        if (index === 3) effectiveIndex = 1;
    } else if (mode === '3player') {
        // 0->0, 1->1, 2->2 (Red is P3)
        // 3 (Green) -> Shared. Maybe show "Shared" or current owner?
        // Let's show "Общий" or specific owner if we want.
        // For UI simplicity, if index is 3, checking players[3] is undefined.
        // We can handle Green separately or show "Общий (Зелёный)".
    }

    if (blokusState.players && blokusState.players[effectiveIndex]) {
        const p = blokusState.players[effectiveIndex];
        return p.custom_name || p.first_name || color;
    }

    // Fallback names
    const defaults = {
        'BLUE': 'Синий', 'YELLOW': 'Жёлтый', 'RED': 'Красный', 'GREEN': 'Зелёный'
    };
    return defaults[color];
}

// Helper to get start point
function getStartPointForColor(color, mode, boardSize) {
    const max = boardSize - 1;

    if (mode === 'duo') {
        if (color === 'BLUE') return { x: 4, y: 4 };
        if (color === 'YELLOW') return { x: 9, y: 9 };
        return null;
    }

    // Standard / 3Player (Corners)
    const map = {
        'BLUE': { x: 0, y: 0 },
        'YELLOW': { x: max, y: 0 },
        'RED': { x: max, y: max },
        'GREEN': { x: 0, y: max }
    };
    return map[color] || null;
}

function renderBoard() {
    const gridEl = document.getElementById('blokus-grid');
    if (!gridEl || !blokusState.serverState) return;

    const s = blokusState.serverState;
    const boardGrid = s.grid;
    // boardGrid is [y][x], mapped by PHP as array of arrays.

    // Dynamic Size
    const boardSize = blokusState.serverState.boardSize || 20;

    // Update grid layout style dynamically
    gridEl.style.gridTemplateColumns = `repeat(${boardSize}, 1fr)`;
    gridEl.style.gridTemplateRows = `repeat(${boardSize}, 1fr)`;

    // Detect if size changed or init
    const totalCells = boardSize * boardSize;

    if (gridEl.children.length !== totalCells) {
        gridEl.innerHTML = '';
        for (let i = 0; i < totalCells; i++) {
            const cell = document.createElement('div');
            cell.className = 'blokus-cell';
            gridEl.appendChild(cell);
        }
    }

    const cells = gridEl.children;
    for (let i = 0; i < totalCells; i++) {
        const x = i % boardSize;
        const y = Math.floor(i / boardSize);

        const cellColor = boardGrid[y] ? boardGrid[y][x] : null;

        const className = 'blokus-cell' + (cellColor ? ` filled ${cellColor} ` : '');
        if (cells[i].className !== className) {
            cells[i].className = className;
        }
        cells[i].style.backgroundColor = '';
        cells[i].classList.remove('preview-invalid');
        cells[i].innerHTML = '';

        // Mark Start Points for Duo (Visual Aid)
        // Duo Starts: (4,4) and (9,9) for 14x14
        if (boardSize === 14) {
            if ((x === 4 && y === 4) || (x === 9 && y === 9)) {
                // Add a small dot or marker?
                // Simple dot via CSS or innerHTML if empty
                if (!cellColor) {
                    cells[i].innerHTML = '<div style="width: 4px; height: 4px; background: rgba(0,0,0,0.2); border-radius: 50%; margin: auto;"></div>';
                    cells[i].style.display = 'flex';
                }
            }
        }
    }

    // Preview Selection
    if (blokusState.selectedPieceId) {
        let drawX = blokusState.hoverX;
        let drawY = blokusState.hoverY;
        const myColor = blokusState.myColor;
        let isGhost = false;

        const currentShape = getTransformedShape(blokusState.selectedPieceId);

        // Visual Hint Logic: First Move Ghost
        const pState = s.players[myColor];
        if (drawX === -1 && pState && !pState.hasPlayedFirstMove) {
            const startPt = getStartPointForColor(myColor, s.mode || 'standard', boardSize);
            if (startPt) {
                // Find a valid snap position covering startPt
                // We try to align every block of the shape to the start point
                for (const [px, py] of currentShape) {
                    const testX = startPt.x - px;
                    const testY = startPt.y - py;

                    const res = validatePlacementLocal(currentShape, testX, testY);
                    if (res.valid) {
                        drawX = testX;
                        drawY = testY;
                        isGhost = true;
                        break;
                    }
                }
            }
        }

        if (drawX !== -1) {
            const validation = validatePlacementLocal(currentShape, drawX, drawY);
            const isInvalid = !validation.valid;

            // Render
            for (const [px, py] of currentShape) {
                const absX = drawX + px;
                const absY = drawY + py;
                if (absX >= 0 && absX < boardSize && absY >= 0 && absY < boardSize) {
                    const cell = cells[absY * boardSize + absX];

                    // Only draw on empty cells or mark overlap
                    if (boardGrid[absY][absX] === null) {
                        if (isGhost) {
                            cell.style.backgroundColor = getPlayerColorHex(myColor || 'BLUE', 0.5);
                        } else if (isInvalid) {
                            cell.classList.add('preview-invalid');
                        } else {
                            cell.style.backgroundColor = getPlayerColorHex(myColor || 'BLUE', 0.8);
                        }
                    } else {
                        // Overlap
                        if (!isGhost) {
                            cell.classList.add('preview-invalid');
                        }
                    }
                }
            }

            const btn = document.getElementById('btn-apply-move');
            if (btn) {
                if (isGhost) {
                    btn.disabled = true; // Ghost is hint only
                } else {
                    btn.disabled = isInvalid;
                }
            }
        } else {
            const btn = document.getElementById('btn-apply-move');
            if (btn) btn.disabled = true;
        }
    } else {
        const btn = document.getElementById('btn-apply-move');
        if (btn) btn.disabled = true;
    }
}

function renderSelectorContent() {
    // Redundant helper, functionality moved to updateHandInteractionArea
}

function renderHand() { /* Deprecated */ }

function renderCurrentPiecePreview(container, color, pieceId = null) {
    const id = pieceId || blokusState.selectedPieceId;
    if (!id) return;

    // Use centralized transform
    const shape = getTransformedShape(id);

    // Re-normalize for UI bounding box (top-left aligned for the mini-grid)
    const minX = Math.min(...shape.map(p => p[0]));
    const minY = Math.min(...shape.map(p => p[1]));
    const normShape = shape.map(p => [p[0] - minX, p[1] - minY]).sort((a, b) => {
        if (a[0] !== b[0]) return a[0] - b[0];
        return a[1] - b[1];
    });

    container.innerHTML = '';

    // Calculate Bounding Box
    // Calculate Bounding Box
    const xs = normShape.map(p => p[0]);
    const ys = normShape.map(p => p[1]);
    const cols = Math.max(...xs) + 1;
    const rows = Math.max(...ys) + 1;

    const TARGET_SIZE = 40; // px
    const GAP = 0.5; // Reduced from 2 to 0.5 for tighter look

    // Formula: size * cols + gap * (cols - 1) <= TARGET_SIZE
    // size * cols <= TARGET_SIZE - gap * (cols - 1)
    // size <= (TARGET_SIZE - gap * (cols - 1)) / cols

    const maxW = (TARGET_SIZE - GAP * (cols - 1)) / cols;
    const maxH = (TARGET_SIZE - GAP * (rows - 1)) / rows;

    let cellSize = Math.min(maxW, maxH);
    // Cap strictly to avoid huge single blocks
    cellSize = Math.min(cellSize, 10);
    // Ensure minimum visibility
    cellSize = Math.max(cellSize, 4);

    const pieceWidth = cellSize * cols + GAP * (cols - 1);
    const pieceHeight = cellSize * rows + GAP * (rows - 1);

    const miniGrid = document.createElement('div');
    miniGrid.style.display = 'grid';
    miniGrid.style.gap = `${GAP}px`;
    miniGrid.style.gridTemplateColumns = `repeat(${cols}, ${cellSize}px)`;
    miniGrid.style.gridTemplateRows = `repeat(${rows}, ${cellSize}px)`;
    miniGrid.style.width = `${pieceWidth}px`;
    miniGrid.style.height = `${pieceHeight}px`;
    miniGrid.style.justifyContent = 'center';
    miniGrid.style.alignContent = 'center';

    // Fill Grid
    // Since shape is normalized (0..cols-1, 0..rows-1), just map 1:1 to grid cells?
    // Not necessarily. Grid is cols x rows.
    // We iterate grid slots.

    for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
            const cell = document.createElement('div');
            cell.style.width = `${cellSize}px`;
            cell.style.height = `${cellSize}px`;
            cell.style.borderRadius = '1px'; // Tiny radius for smoothness, but mostly square

            const isFilled = normShape.some(p => p[0] === x && p[1] === y);
            cell.style.background = isFilled ? getPlayerColorHex(color) : 'transparent';

            miniGrid.appendChild(cell);
        }
    }

    container.style.display = 'flex';
    container.style.justifyContent = 'center';
    container.style.alignItems = 'center';
    container.style.height = '100%';
    // Removed width: 100% to allow flex container to size it naturally if needed

    container.appendChild(miniGrid);
}

function updateHandInteractionArea() {
    const area = document.getElementById('hand-interaction-area');
    const modalOverlay = document.getElementById('blokus-modal-overlay');
    const modalContentGrid = document.getElementById('modal-pieces-grid');
    const modalFilterContainer = document.getElementById('modal-filter-area');
    if (!area || !modalOverlay) return;

    // Use My Color from state, or default to Blue if spectator? No, just no pieces.
    const myColor = blokusState.myColor;
    if (!myColor || !blokusState.serverState) {
        area.innerHTML = `<div class="p-3 text-center text-muted">Вы наблюдатель</div>`;
        return;
    }

    // Check if it's my turn
    const s = blokusState.serverState;
    const isMyTurn = s.turnOrder[s.currentTurnIndex] === myColor;

    // Disable main controls if not my turn
    // (We enable them visually to allow pre-planning?) 
    // Let's enable pre-planning (selecting piece) but disable "Apply" button elsewhere.

    const playerState = s.players[myColor];
    const remainingPieces = playerState.remainingPieces || []; // List of IDs

    // 1. Update In-Panel Preview (STATIC)
    const collapsedHtml = blokusState.selectedPieceId
        ? `
        <div class="selected-piece-mini-pill" onclick="togglePieceSelector(true)">
                <div id="collapsed-mini-preview"></div>
                <div class="mini-pill-label">выбрано</div>
            </div>
        `
        : `<button class="btn-select-piece-expand" onclick="togglePieceSelector(true)">выбрать фигуру (${remainingPieces.length})</button>`;

    area.innerHTML = collapsedHtml;
    if (blokusState.selectedPieceId) {
        renderCurrentPiecePreview(document.getElementById('collapsed-mini-preview'), myColor, blokusState.selectedPieceId);
    }

    // 2. Update Modal State
    if (blokusState.pieceSelectorOpen) {
        modalOverlay.classList.add('active');

        const pieces = remainingPieces
            .map(id => ({ id, size: PIECE_DEFINITIONS[id].length }))
            .filter(p => p.size === blokusState.pieceSizeFilter)
            .sort((a, b) => a.id.localeCompare(b.id));

        const filterIdx = blokusState.pieceSizeFilter - 1;
        const pillWidth = 100 / 5;
        const pillOffset = filterIdx * pillWidth;

        // Render Pieces in Modal
        modalContentGrid.innerHTML = pieces.map(piece => `
        <div class="blokus-piece-card ${blokusState.selectedPieceId === piece.id ? 'selected' : ''}" onclick="selectPiece('${piece.id}')">
            <div class="piece-preview-mini" id="modal-preview-${piece.id}"></div>
            </div>
        `).join('');

        // Render Filter in Modal
        modalFilterContainer.innerHTML = `
        <div class="capsule-filter">
            <div class="filter-pill" style="width: calc(${pillWidth}% - 8px); left: calc(${pillOffset}% + 4px);"></div>
                ${[1, 2, 3, 4, 5].map((n, i) => `
                    <button class="filter-tab ${blokusState.pieceSizeFilter === n ? 'active' : ''}" onclick="setPieceFilter(${n})">${n}</button>
                    ${i < 4 ? '<div class="filter-divider"></div>' : ''}
                `).join('')
            }
            </div>
        `;

        // Render Controls in Modal
        const modalControls = document.getElementById('modal-controls-area');
        if (modalControls) {
            modalControls.innerHTML = `
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
                ${(globalUser && globalUser.is_admin) ? `
                <button class="btn" id="btn-suggest-move" style="background: #e8daef; color: #8e44ad;" onclick="blokusSuggestMove()">
                    <i class="bi bi-magic"></i>
                    <span>God</span>
                </button>
                ` : ''
                }

    <button class="btn modal-btn-close" onclick="togglePieceSelector(false)">
        <i class="bi bi-x-lg"></i>
        <span>Закрыть</span>
    </button>
    `;
        }

        pieces.forEach(p => {
            const container = document.getElementById(`modal-preview-${p.id}`);
            if (container) renderCurrentPiecePreview(container, myColor, p.id);
        });
    } else {
        modalOverlay.classList.remove('active');
    }
}

function toggleHeaderMenu(event) {
    if (event) event.stopPropagation();

    blokusState.headerMenuOpen = !blokusState.headerMenuOpen;
    updateHeader();

    if (blokusState.headerMenuOpen) {
        // Auto-close handler
        const closeHandler = () => {
            blokusState.headerMenuOpen = false;
            updateHeader();
            document.removeEventListener('click', closeHandler);
        };
        // Defer adding listener to avoid current click triggering it
        setTimeout(() => document.addEventListener('click', closeHandler), 0);
    }
}

// Global exposure
if (typeof window !== 'undefined') {
    window.getPlayerColorHex = getPlayerColorHex;
    window.injectBlokusStyles = injectBlokusStyles;
    window.updateHeader = updateHeader;
    window.renderBoard = renderBoard;
    window.renderHand = renderHand;
    window.renderCurrentPiecePreview = renderCurrentPiecePreview;
    window.updateHandInteractionArea = updateHandInteractionArea;
    window.renderSelectorContent = renderSelectorContent;
    window.toggleHeaderMenu = toggleHeaderMenu;
    window.getStartPointForColor = getStartPointForColor;
}
