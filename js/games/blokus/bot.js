class BlokusBot {
    constructor(game, playerColor, difficulty = 'medium') {
        this.game = game;
        this.boardGrid = game.grid || game.board.grid;
        this.boardSize = game.boardSize || 20;
        this.playerColor = playerColor;
        this.playerState = game.players ? game.players[playerColor] : null;
        this.difficulty = difficulty;
    }

    isValid(shape, startX, startY, grid = this.boardGrid) {
        if (typeof window.validatePlacementLocal === 'function') {
            return window.validatePlacementLocal(shape, startX, startY, grid, this.playerColor);
        }
        return { valid: false };
    }

    getPieceDifficulty(id) {
        const difficulty = {
            'X5': 10, 'F5': 8, 'W5': 8, 'Z5': 8, 'N5': 7,
            'Y5': 6, 'T5': 6, 'P5': 6, 'U5': 5, 'V5': 5,
            'L5': 4, 'I5': 3,
            'Z4': 4, 'T4': 4, 'L4': 3, 'I4': 2, 'O4': 2,
            'I3': 1, 'V3': 1, 'I2': 1, 'I1': 0
        };
        return difficulty[id] || 0;
    }

    findBestMove() {
        if (!this.playerState) return null;

        const remainingPieces = Array.from(this.playerState.remainingPieces);

        // Randomize piece order for variety
        remainingPieces.sort(() => Math.random() - 0.5);

        // For Medium/Hard, we might prefer bigger pieces first to prune search
        if (this.difficulty !== 'easy') {
            remainingPieces.sort((a, b) => {
                const lenA = PIECE_DEFINITIONS[a].length;
                const lenB = PIECE_DEFINITIONS[b].length;
                if (lenA !== lenB) return lenB - lenA;
                return this.getPieceDifficulty(b) - this.getPieceDifficulty(a);
            });
        }

        const corners = this.findExpansionCorners(this.boardGrid, this.playerColor);
        if (corners.length === 0 && !this.playerState.hasPlayedFirstMove) {
            const startPt = getStartPointForColor(this.playerColor, this.game.mode || 'standard', this.boardSize);
            if (startPt) corners.push(startPt);
        }

        let candidates = [];
        let movesChecked = 0;
        // Adjust checks based on difficulty for performance/variety
        const MAX_CHECKS = this.difficulty === 'hard' ? 3000 : (this.difficulty === 'medium' ? 1500 : 500);

        for (const pieceId of remainingPieces) {
            const def = PIECE_DEFINITIONS[pieceId];
            const orientations = this.getUniqueOrientations(def);

            for (const shape of orientations) {
                for (const corner of corners) {
                    for (const [px, py] of shape) {
                        const startX = corner.x - px;
                        const startY = corner.y - py;

                        if (startX < -5 || startX > this.boardSize || startY < -5 || startY > this.boardSize) continue;

                        const validation = this.isValid(shape, startX, startY);
                        if (validation.valid) {
                            const move = {
                                pieceId: pieceId,
                                shape: shape,
                                ...shape.meta,
                                x: startX,
                                y: startY,
                                corners: corners
                            };

                            // EASY: Just return first valid move found (or collect a few and random)
                            if (this.difficulty === 'easy') {
                                candidates.push(move);
                                // If we found a few, stop to save time
                                if (candidates.length > 5) break;
                            } else {
                                move.score = this.evaluateMoveStrategic(move);
                                candidates.push(move);
                            }
                        }
                        if (++movesChecked > MAX_CHECKS) break;
                    }
                    if (candidates.length > 5 && this.difficulty === 'easy') break;
                    if (movesChecked > MAX_CHECKS) break;
                }
                if (candidates.length > 5 && this.difficulty === 'easy') break;
                if (movesChecked > MAX_CHECKS) break;
            }
            if (candidates.length > 5 && this.difficulty === 'easy') break;
            if (movesChecked > MAX_CHECKS) break;
        }

        if (candidates.length === 0) return null;

        // --- SELECTION LOGIC ---

        // EASY: Random from pool
        if (this.difficulty === 'easy') {
            return candidates[Math.floor(Math.random() * candidates.length)];
        }

        // MEDIUM: Sort by strategic score (No Lookahead)
        candidates.sort((a, b) => b.score - a.score);

        if (this.difficulty === 'medium') {
            // Add slight randomness (pick from top 3) to make it less machine-like
            const topK = Math.min(candidates.length, 3);
            return candidates[Math.floor(Math.random() * topK)];
        }

        // HARD: Lookahead (Mobility)
        const topN = candidates.slice(0, 8); // Check top 8 moves

        for (const move of topN) {
            const lookaheadScore = this.evaluateFutureMobility(move);
            move.score += lookaheadScore;
        }

        topN.sort((a, b) => b.score - a.score);
        return topN[0];
    }

    evaluateMoveStrategic(move) {
        let score = 0;
        const pieceSize = PIECE_DEFINITIONS[move.pieceId].length;

        score += pieceSize * 1000;
        score += this.getPieceDifficulty(move.pieceId) * 150;

        let cornersOpened = 0;
        let blockingOpponents = 0;

        const center = (this.boardSize - 1) / 2;
        let avgDistToCenter = 0;

        const myColor = this.playerColor;

        for (const [px, py] of move.shape) {
            const x = move.x + px;
            const y = move.y + py;

            avgDistToCenter += (Math.abs(x - center) + Math.abs(y - center));

            const diags = [[x + 1, y + 1], [x - 1, y - 1], [x + 1, y - 1], [x - 1, y + 1]];
            for (const [dx, dy] of diags) {
                if (this.isInBounds(dx, dy) && this.boardGrid[dy][dx] === null) {
                    const orthos = [[dx + 1, dy], [dx - 1, dy], [dx, dy + 1], [dx, dy - 1]];
                    let blocked = false;
                    for (const [ox, oy] of orthos) {
                        if (this.isInBounds(ox, oy) && this.boardGrid[oy][ox] === myColor) {
                            blocked = true; break;
                        }
                    }
                    for (const [mpx, mpy] of move.shape) {
                        const mx = move.x + mpx;
                        const my = move.y + mpy;
                        if (Math.abs(mx - dx) + Math.abs(my - dy) === 1) {
                            blocked = true; break;
                        }
                    }

                    if (!blocked) cornersOpened++;
                }
            }

            const orthos = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]];
            for (const [ox, oy] of orthos) {
                if (this.isInBounds(ox, oy)) {
                    const color = this.boardGrid[oy][ox];
                    if (color && color !== myColor) blockingOpponents++;
                }
            }
        }

        score += cornersOpened * 60;
        score += blockingOpponents * 100;

        if (this.playerState.remainingPieces.size > 8) {
            const distFactor = avgDistToCenter / pieceSize;
            score -= distFactor * 20;
        }

        return score;
    }

    evaluateFutureMobility(move) {
        const virtualGrid = this.boardGrid.map(row => [...row]);
        for (const [px, py] of move.shape) {
            virtualGrid[move.y + py][move.x + px] = this.playerColor;
        }

        const nextCorners = this.findExpansionCorners(virtualGrid, this.playerColor);
        if (nextCorners.length === 0) return -5000;

        let mobilityScore = nextCorners.length * 100;

        const remaining = Array.from(this.playerState.remainingPieces).filter(id => id !== move.pieceId);
        remaining.sort((a, b) => PIECE_DEFINITIONS[b].length - PIECE_DEFINITIONS[a].length);

        const topFuturePieces = remaining.slice(0, 3);
        let reachablePieces = 0;

        for (const pieceId of topFuturePieces) {
            const def = PIECE_DEFINITIONS[pieceId];
            const orientations = this.getUniqueOrientations(def);
            let canPlace = false;

            const sampleCorners = nextCorners.slice(0, 5);
            for (const shape of orientations.slice(0, 2)) {
                for (const corner of sampleCorners) {
                    for (const [px, py] of shape) {
                        if (this.isValid(shape, corner.x - px, corner.y - py, virtualGrid).valid) {
                            canPlace = true; break;
                        }
                    }
                    if (canPlace) break;
                }
                if (canPlace) break;
            }
            if (canPlace) reachablePieces++;
        }

        mobilityScore += reachablePieces * 500;
        return mobilityScore;
    }

    findExpansionCorners(grid, color) {
        const targets = [];
        for (let y = 0; y < this.boardSize; y++) {
            for (let x = 0; x < this.boardSize; x++) {
                if (grid[y][x] === null) {
                    const diags = [[x + 1, y + 1], [x - 1, y - 1], [x + 1, y - 1], [x - 1, y + 1]];
                    const orthos = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]];

                    let isDiag = false;
                    for (const [dx, dy] of diags) {
                        if (this.isInBounds(dx, dy) && grid[dy][dx] === color) {
                            isDiag = true; break;
                        }
                    }
                    if (!isDiag) continue;

                    let isOrtho = false;
                    for (const [ox, oy] of orthos) {
                        if (this.isInBounds(ox, oy) && grid[oy][ox] === color) {
                            isOrtho = true; break;
                        }
                    }

                    if (isDiag && !isOrtho) {
                        targets.push({ x, y });
                    }
                }
            }
        }
        return targets.sort(() => Math.random() - 0.5);
    }

    isInBounds(x, y) {
        return x >= 0 && x < this.boardSize && y >= 0 && y < this.boardSize;
    }

    getUniqueOrientations(baseCoords) {
        const results = [];
        const seen = new Set();

        for (let flipped of [false, true]) {
            for (let rotation = 0; rotation < 4; rotation++) {
                let coords = baseCoords.map(p => [...p]);
                if (flipped) coords = coords.map(p => [-p[0], p[1]]);
                for (let i = 0; i < rotation; i++) coords = coords.map(p => [-p[1], p[0]]);

                const minX = Math.min(...coords.map(p => p[0]));
                const maxX = Math.max(...coords.map(p => p[0]));
                const minY = Math.min(...coords.map(p => p[1]));
                const maxY = Math.max(...coords.map(p => p[1]));
                const midX = Math.floor((minX + maxX) / 2);
                const midY = Math.floor((minY + maxY) / 2);

                const finalShape = coords.map(p => [p[0] - midX, p[1] - midY]);

                const key = JSON.stringify(finalShape.map(p => [p[0], p[1]]).sort());
                if (!seen.has(key)) {
                    seen.add(key);
                    finalShape.meta = { rotation, flipped };
                    results.push(finalShape);
                }
            }
        }
        return results;
    }
}

window.BlokusBot = BlokusBot;
