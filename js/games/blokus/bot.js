/**
 * Blokus Bot Logic
 * Finds the best move for the current player.
 */

class BlokusBot {
    constructor(game, playerColor) {
        this.game = game; // Can be local instance or server state wrapper
        this.boardGrid = game.grid || game.board.grid;
        this.boardSize = game.boardSize || 20;
        this.playerColor = playerColor;
        this.playerState = game.players ? game.players[playerColor] : null;
    }

    // Helper to check validity using our new robust local check
    isValid(shape, startX, startY) {
        // We reuse the global validator we exposed in handlers.js
        if (typeof window.validatePlacementLocal === 'function') {
            return window.validatePlacementLocal(shape, startX, startY);
        }
        return { valid: false };
    }

    getPieceDifficulty(id) {
        // Harder pieces should be played earlier.
        // X, W, F, Z, N are notoriously hard to place late game.
        // I, L, O are easier.
        const difficulty = {
            'X5': 5, 'F5': 4, 'W5': 4, 'Z5': 4, 'N5': 3, 'Y5': 3, 'T5': 3, 'P5': 3, 'U5': 3, 'V5': 3,
            'L5': 2, 'I5': 1,
            'Z4': 2, 'T4': 2, 'L4': 1, 'I4': 1, 'O4': 1,
            // Smaller pieces are low priority (0)
        };
        return difficulty[id] || 0;
    }

    findBestMove() {
        if (!this.playerState) return null;

        // Try largest pieces first, but now we will compare them
        const remainingPieces = Array.from(this.playerState.remainingPieces);
        remainingPieces.sort((a, b) => {
            const lenA = PIECE_DEFINITIONS[a].length;
            const lenB = PIECE_DEFINITIONS[b].length;
            return lenB - lenA;
        });

        // Heuristics:
        // 1. Piece Size (Points) - High Priority
        // 2. New Corners (Expansion) - High Priority
        // 3. Blocking Opponents - Medium Priority
        // 4. Center Proximity - Low Priority (Early game)

        const corners = this.findExpansionCorners();
        if (corners.length === 0) {
            if (!this.playerState.hasPlayedFirstMove) {
                const startPt = getStartPointForColor(this.playerColor, this.game.mode || 'standard', this.boardSize);
                if (startPt) corners.push(startPt);
            }
        }

        let bestMove = null;
        let bestScore = -Infinity;
        let movesChecked = 0;
        const MAX_CHECKS = 3000;

        // We only check top X largest pieces to save time, unless we have very few pieces left.
        // If we have many pieces, small ones are unlikely to be "Strategic God Moves" usually.
        const piecesToCheck = remainingPieces.slice(0, 12);

        for (const pieceId of piecesToCheck) {
            const def = PIECE_DEFINITIONS[pieceId];
            const orientations = this.getUniqueOrientations(def);

            for (const shape of orientations) {
                // Check all corners
                for (const corner of corners) {
                    for (const [px, py] of shape) {
                        // Align
                        const startX = corner.x - px;
                        const startY = corner.y - py;

                        // Quick Bounds Check before heavy validation
                        if (startX < -5 || startX > this.boardSize || startY < -5 || startY > this.boardSize) continue;

                        const validation = this.isValid(shape, startX, startY);
                        if (validation.valid) {
                            const move = {
                                pieceId: pieceId,
                                shape: shape,
                                ...shape.meta,
                                x: startX,
                                y: startY
                            };

                            const score = this.evaluateMove(move);
                            if (score > bestScore) {
                                bestScore = score;
                                bestMove = move;
                            }
                        }

                        movesChecked++;
                        if (movesChecked > MAX_CHECKS) break; // Inner
                    }
                    if (movesChecked > MAX_CHECKS) break; // Mid
                }
                if (movesChecked > MAX_CHECKS) break; // Piece
            }
            if (movesChecked > MAX_CHECKS) break; // All
        }

        return bestMove;
    }

    evaluateMove(move) {
        let score = 0;
        const pieceSize = PIECE_DEFINITIONS[move.pieceId].length;

        // 1. Base Score: Points for size (Massive Priority to dump hand)
        // Previous: 100. New: 300.
        // This ensures a Size 5 (1500) will almost always beat a Size 4 (1200) even with good blocking.
        score += pieceSize * 300;

        // 2. Piece Difficulty Bonus
        // We want to get rid of awkward shapes like 'X' early.
        score += this.getPieceDifficulty(move.pieceId) * 50;

        // 3. Corners: Expansion is key for "future thinking".
        // More corners = more future legal moves.
        const myColor = this.playerColor;
        let cornersOpened = 0;
        let blockedOpponents = 0;

        const center = this.boardSize / 2;
        let distToCenter = 0;

        for (const [px, py] of move.shape) {
            const absX = move.x + px;
            const absY = move.y + py;

            // Center Proximity
            distToCenter += Math.abs(absX - center) + Math.abs(absY - center);

            // Check Diagonals (Potential new corners)
            const diags = [[absX + 1, absY + 1], [absX - 1, absY - 1], [absX + 1, absY - 1], [absX - 1, absY + 1]];
            for (const [dx, dy] of diags) {
                if (this.isInBounds(dx, dy) && this.boardGrid[dy][dx] === null) {
                    cornersOpened++;
                }
            }

            // Check Orthogonals (Blocking)
            const orthos = [[absX + 1, absY], [absX - 1, absY], [absX, absY + 1], [absX, absY - 1]];
            for (const [ox, oy] of orthos) {
                if (this.isInBounds(ox, oy)) {
                    const neighborColor = this.boardGrid[oy][ox];
                    if (neighborColor && neighborColor !== myColor) {
                        blockedOpponents++;
                    }
                }
            }
        }

        score += cornersOpened * 25; // Boosted from 15
        score += blockedOpponents * 40; // Kept high, but size outweighs it now.

        // Center Bonus (Negative distance)
        // Valuable in opening
        if (this.playerState.remainingPieces.size > 12) {
            score -= (distToCenter / pieceSize) * 3;
        }

        return score;
    }

    findExpansionCorners() {
        // scan board for my color's corners that are empty diagonally
        const targets = [];
        const myColor = this.playerColor;

        for (let y = 0; y < this.boardSize; y++) {
            for (let x = 0; x < this.boardSize; x++) {
                if (this.boardGrid[y][x] === null) {
                    // Check if it's a valid "corner" connection spot
                    // It must be diagonal to my color
                    // AND NOT orthogonal to my color (that would be invalid touching side)

                    const diags = [[x + 1, y + 1], [x - 1, y - 1], [x + 1, y - 1], [x - 1, y + 1]];
                    const orthos = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]];

                    let isDiag = false;
                    for (const [dx, dy] of diags) {
                        if (this.isInBounds(dx, dy) && this.boardGrid[dy][dx] === myColor) {
                            isDiag = true;
                            break;
                        }
                    }

                    let isOrtho = false;
                    for (const [ox, oy] of orthos) {
                        if (this.isInBounds(ox, oy) && this.boardGrid[oy][ox] === myColor) {
                            isOrtho = true; // Blocked
                            break;
                        }
                    }

                    if (isDiag && !isOrtho) {
                        targets.push({ x, y });
                    }
                }
            }
        }

        // Shuffle targets to vary bot behavior
        return targets.sort(() => Math.random() - 0.5);
    }

    isInBounds(x, y) {
        return x >= 0 && x < this.boardSize && y >= 0 && y < this.boardSize;
    }

    getUniqueOrientations(baseCoords) {
        // Generate all 8 symmetries, store metadata (rot, flip) so we can tell UI what to set
        const results = [];

        // Helper to normalize for deduplication (only for Unique check)
        const normalize = (coords) => {
            const minX = Math.min(...coords.map(p => p[0]));
            const minY = Math.min(...coords.map(p => p[1]));
            return JSON.stringify(coords.map(p => [p[0] - minX, p[1] - minY]).sort());
        };
        // Wait, our centered logic in UI is different from standard check.
        // But for the bot we just need "a shape that works".
        // HOWEVER, to apply it in UI, we need to set blokusState.rotation/flipped.

        // So let's generate exactly the 8 states:
        // Flipped: false/true
        // Rotation: 0,1,2,3

        for (let flipped of [false, true]) {
            for (let rotation = 0; rotation < 4; rotation++) {

                // Simulate getTransformedShape Logic
                let coords = baseCoords.map(p => [...p]);
                if (flipped) coords = coords.map(p => [-p[0], p[1]]);
                for (let i = 0; i < rotation; i++) coords = coords.map(p => [-p[1], p[0]]);

                // Centering (Same as handlers.js)
                const minX = Math.min(...coords.map(p => p[0]));
                const maxX = Math.max(...coords.map(p => p[0]));
                const minY = Math.min(...coords.map(p => p[1]));
                const maxY = Math.max(...coords.map(p => p[1]));
                const midX = Math.floor((minX + maxX) / 2);
                const midY = Math.floor((minY + maxY) / 2);

                const finalShape = coords.map(p => [p[0] - midX, p[1] - midY]);
                // We don't sort here because we want to preserve index mapping if needed? 
                // Actually sorting is fine for shape comparison, but here we just return the object

                finalShape.meta = { rotation, flipped };
                results.push(finalShape);
            }
        }
        // We don't deduplicate here because different rotations might have different bounding box centers
        // which affects "startX/Y" calculation relative to the pivot.

        return results;
    }
}

window.BlokusBot = BlokusBot;
