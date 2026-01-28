/**
 * Blokus Core Engine
 * Implements standard Blokus rules and game logic.
 */

const BLOKUS_COLORS = {
    BLUE: 'BLUE',
    YELLOW: 'YELLOW',
    RED: 'RED',
    GREEN: 'GREEN'
};

const BOARD_SIZE = 20;

const PIECE_DEFINITIONS = {
    // Size 1 (Monomino)
    'I1': [[0, 0]],

    // Size 2 (Domino)
    'I2': [[0, 0], [1, 0]],

    // Size 3 (Tromino)
    'I3': [[0, 0], [1, 0], [2, 0]],
    'V3': [[0, 0], [1, 0], [0, 1]],

    // Size 4 (Tetromino)
    'I4': [[0, 0], [1, 0], [2, 0], [3, 0]],
    'L4': [[0, 0], [1, 0], [2, 0], [2, 1]],
    'O4': [[0, 0], [1, 0], [0, 1], [1, 1]],
    'Z4': [[0, 0], [1, 0], [1, 1], [2, 1]],
    'T4': [[0, 0], [1, 0], [2, 0], [1, 1]],

    // Size 5 (Pentomino)
    'I5': [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]],
    'L5': [[0, 0], [1, 0], [2, 0], [3, 0], [3, 1]],
    'P5': [[0, 0], [1, 0], [0, 1], [1, 1], [0, 2]],
    'F5': [[1, 0], [2, 0], [0, 1], [1, 1], [1, 2]],
    'T5': [[0, 0], [1, 0], [2, 0], [1, 1], [1, 2]],
    'U5': [[0, 0], [2, 0], [0, 1], [1, 1], [2, 1]],
    'V5': [[0, 0], [0, 1], [0, 2], [1, 0], [2, 0]],
    'W5': [[0, 0], [0, 1], [1, 1], [1, 2], [2, 2]],
    'X5': [[1, 0], [0, 1], [1, 1], [2, 1], [1, 2]],
    'Y5': [[0, 0], [0, 1], [1, 1], [2, 1], [3, 1]],
    'Z5': [[0, 0], [1, 0], [1, 1], [1, 2], [2, 2]],
    'N5': [[0, 0], [1, 0], [2, 0], [2, 1], [3, 1]],
};

class BlokusPiece {
    constructor(id, coordinates) {
        this.id = id;
        this.originalCoords = coordinates;
        this.size = coordinates.length;
    }

    getOrientations() {
        const orientations = new Set();
        const results = [];

        let current = this.originalCoords;
        for (let i = 0; i < 4; i++) {
            this._addOrientation(current, orientations, results);
            current = this._rotate90(current);
        }

        current = this._reflect(this.originalCoords);
        for (let i = 0; i < 4; i++) {
            this._addOrientation(current, orientations, results);
            current = this._rotate90(current);
        }

        return results;
    }

    _rotate90(coords) {
        return coords.map(p => [-p[1], p[0]]);
    }

    _reflect(coords) {
        return coords.map(p => [-p[0], p[1]]);
    }

    _addOrientation(coords, seenSet, results) {
        const normalized = this._normalize(coords);
        const key = JSON.stringify(normalized);
        if (!seenSet.has(key)) {
            seenSet.add(key);
            results.push(normalized);
        }
    }

    _normalize(coords) {
        if (coords.length === 0) return [];
        const minX = Math.min(...coords.map(p => p[0]));
        const minY = Math.min(...coords.map(p => p[1]));
        return coords.map(p => [p[0] - minX, p[1] - minY]).sort((a, b) => {
            if (a[0] !== b[0]) return a[0] - b[0];
            return a[1] - b[1];
        });
    }

    static getAll() {
        const pieces = [];
        for (const [id, coords] of Object.entries(PIECE_DEFINITIONS)) {
            pieces.push(new BlokusPiece(id, coords));
        }
        return pieces;
    }
}

class BlokusBoard {
    constructor() {
        this.grid = Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null));
    }

    inBounds(x, y) {
        return x >= 0 && x < BOARD_SIZE && y >= 0 && y < BOARD_SIZE;
    }

    isEmpty(x, y) {
        return this.inBounds(x, y) && this.grid[y][x] === null;
    }

    getColor(x, y) {
        if (!this.inBounds(x, y)) return null;
        return this.grid[y][x];
    }

    setColor(x, y, color) {
        if (this.inBounds(x, y)) {
            this.grid[y][x] = color;
        }
    }
}

class BlokusGame {
    constructor() {
        this.board = new BlokusBoard();
        this.players = {
            [BLOKUS_COLORS.BLUE]: this._createPlayer(BLOKUS_COLORS.BLUE),
            [BLOKUS_COLORS.YELLOW]: this._createPlayer(BLOKUS_COLORS.YELLOW),
            [BLOKUS_COLORS.RED]: this._createPlayer(BLOKUS_COLORS.RED),
            [BLOKUS_COLORS.GREEN]: this._createPlayer(BLOKUS_COLORS.GREEN)
        };
        this.turnOrder = [BLOKUS_COLORS.BLUE, BLOKUS_COLORS.YELLOW, BLOKUS_COLORS.RED, BLOKUS_COLORS.GREEN];
        this.currentTurnIndex = 0;
        this.consecutivePasses = 0;
        this.gameOver = false;
    }

    _createPlayer(color) {
        return {
            color,
            remainingPieces: new Set(Object.keys(PIECE_DEFINITIONS)),
            hasPlayedFirstMove: false,
            lastPlayedPieceId: null,
            score: 0
        };
    }

    getCurrentPlayer() {
        return this.players[this.turnOrder[this.currentTurnIndex]];
    }

    validateMove(playerColor, pieceId, pieceShape, startX, startY) {
        const player = this.players[playerColor];
        if (!player) return { valid: false, reason: 'INVALID_PLAYER' };
        if (!player.remainingPieces.has(pieceId)) return { valid: false, reason: 'PIECE_ALREADY_USED' };

        let connectsToCorner = false;
        const occupiedCoords = [];

        for (const [px, py] of pieceShape) {
            const absX = startX + px;
            const absY = startY + py;

            if (!this.board.inBounds(absX, absY)) return { valid: false, reason: 'OUT_OF_BOUNDS' };
            if (!this.board.isEmpty(absX, absY)) return { valid: false, reason: 'CELL_OCCUPIED' };
            occupiedCoords.push([absX, absY]);
        }

        for (const [cx, cy] of occupiedCoords) {
            const neighbors = [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]];
            for (const [nx, ny] of neighbors) {
                if (this.board.getColor(nx, ny) === playerColor) return { valid: false, reason: 'EDGE_TOUCH_SAME_COLOR' };
            }

            const corners = [[cx + 1, cy + 1], [cx - 1, cy - 1], [cx + 1, cy - 1], [cx - 1, cy + 1]];
            for (const [nx, ny] of corners) {
                if (this.board.getColor(nx, ny) === playerColor) connectsToCorner = true;
            }
        }

        if (!player.hasPlayedFirstMove) {
            const boardCorners = ['0,0', '0,19', '19,0', '19,19'];
            let coversBoardCorner = false;
            for (const [cx, cy] of occupiedCoords) {
                if (boardCorners.includes(`${cx},${cy}`)) {
                    coversBoardCorner = true;
                    break;
                }
            }
            if (!coversBoardCorner) return { valid: false, reason: 'FIRST_MOVE_NOT_IN_CORNER' };
            return { valid: true };
        }

        if (!connectsToCorner) return { valid: false, reason: 'NO_CORNER_CONTACT' };
        return { valid: true };
    }

    applyMove(playerColor, pieceId, pieceShape, startX, startY) {
        const validation = this.validateMove(playerColor, pieceId, pieceShape, startX, startY);
        if (!validation.valid) throw new Error(`Invalid move: ${validation.reason}`);

        const player = this.players[playerColor];
        for (const [px, py] of pieceShape) {
            this.board.setColor(startX + px, startY + py, playerColor);
        }
        player.remainingPieces.delete(pieceId);
        player.hasPlayedFirstMove = true;
        player.lastPlayedPieceId = pieceId;
        this.consecutivePasses = 0;
        this.currentTurnIndex = (this.currentTurnIndex + 1) % 4;
        return true;
    }

    passTurn() {
        if (this.gameOver) return false;
        this.consecutivePasses++;
        if (this.consecutivePasses >= 4) this.gameOver = true;
        this.currentTurnIndex = (this.currentTurnIndex + 1) % 4;
        return true;
    }

    isGameOver() {
        if (this.gameOver) return true;
        if (Object.values(this.players).every(p => p.remainingPieces.size === 0)) this.gameOver = true;
        return this.gameOver;
    }

    calculateScore() {
        const scores = {};
        for (const color of Object.values(BLOKUS_COLORS)) {
            const player = this.players[color];
            let score = 0;
            let unplacedSquares = 0;
            player.remainingPieces.forEach(pid => {
                const def = PIECE_DEFINITIONS[pid];
                if (def) unplacedSquares += def.length;
            });
            score -= unplacedSquares;
            if (player.remainingPieces.size === 0) {
                score += 15;
                if (player.lastPlayedPieceId === 'I1') score += 5;
            }
            scores[color] = score;
        }
        return scores;
    }

    getState() {
        // Serialize players
        const serializedPlayers = {};
        for (const [color, p] of Object.entries(this.players)) {
            serializedPlayers[color] = {
                color: p.color,
                remainingPieces: Array.from(p.remainingPieces),
                hasPlayedFirstMove: p.hasPlayedFirstMove,
                score: p.score // Note: score is dynamic in local engine usually calculated at end, but we can preserve if needed
            };
            // Calculate score purely for UI update if needed
            // But calculateScore() does it on demand.
        }

        return {
            status: this.gameOver ? 'finished' : 'playing',
            grid: this.board.grid,
            players: serializedPlayers,
            turnOrder: this.turnOrder,
            currentTurnIndex: this.currentTurnIndex,
            consecutivePasses: this.consecutivePasses,
            lastMoveTime: Date.now(),
            finalScores: this.gameOver ? this.calculateScore() : null
        };
    }
}

// Global exposure
window.BLOKUS_COLORS = BLOKUS_COLORS;
window.PIECE_DEFINITIONS = PIECE_DEFINITIONS;
window.BlokusPiece = BlokusPiece;
window.BlokusBoard = BlokusBoard;
window.BlokusGame = BlokusGame;
