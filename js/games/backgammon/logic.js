/* Backgammon Logic - Long Backgammon (Длинные Нарды)
 *
 * Board: 24 points, indexed 0-23.
 * Movement direction: DECREASING (counter-clockwise):
 *   from -> (from - die + 24) % 24
 *
 * WHITE: head at 23 (Top-Right in portrait layout)
 *   Path: 23 -> 22 -> ... -> 0 -> bear-off
 *   Home (last 6): indices 0-5
 *   Progress: (23 - index + 24) % 24
 *
 * BLACK: head at 11 (Bottom-Left in portrait layout)
 *   Path: 11 -> 10 -> ... -> 0 -> 23 -> 22 -> ... -> 12 -> bear-off
 *   Home (last 6): indices 12-17
 *   Progress: (11 - index + 24) % 24
 */
class BackgammonEngine {
    constructor() {
        this.reset();
    }

    reset() {
        this.board = Array(24).fill(null);
        this.board[23] = { player: 'white', count: 15 };  // White head: Top-Right
        this.board[11] = { player: 'black', count: 15 };  // Black head: Bottom-Left
        this.turn = 'white';
        this.dice = [];
        this.movesLeft = [];
        this.status = 'starting'; // 'starting' or 'playing' or 'finished'
        this.whiteOff = 0;
        this.blackOff = 0;
        this.headMoved = 0;
        this.isFirstTurn = { white: true, black: true };
        this.winner = null;
        this.version = 0;
        this.startingRolls = { white: null, black: null };
        this.readyToStart = { white: false, black: false };
    }

    /* Progress: how far a piece has traveled (0 = at head, 23 = last step before bear-off) */
    _progress(index) {
        if (this.turn === 'white') return (23 - index + 24) % 24;
        else                       return (11 - index + 24) % 24;
    }

    /* Progress for a specific player (to check home board) */
    _progressFor(player, index) {
        if (player === 'white') return (23 - index + 24) % 24;
        else                    return (11 - index + 24) % 24;
    }

    /* Can we land on targetIndex? (No blots in Long Nardi - can always stack on own; opponent's occupied = blocked) */
    _canLandOn(targetIndex) {
        const cell = this.board[targetIndex];
        if (!cell) return true;
        return cell.player === this.turn; // own pieces always ok; opponent's = blocked
    }

    /* All pieces of current player are in the home zone (progress >= 18) */
    canBearOff() {
        const offCount = this.turn === 'white' ? this.whiteOff : this.blackOff;
        let inHome = offCount;
        for (let i = 0; i < 24; i++) {
            const cell = this.board[i];
            if (cell && cell.player === this.turn) {
                const p = this._progressFor(this.turn, i);
                if (p < 18) return false;  // piece outside home
                inHome += cell.count;
            }
        }
        return inHome === 15;
    }

    /* Get all legal destination indices for a piece at fromIndex */
    getLegalMoves(fromIndex) {
        if (this.status !== 'playing' || this.movesLeft.length === 0) return [];
        const cell = this.board[fromIndex];
        if (!cell || cell.player !== this.turn) return [];

        // Head rule: can only move one piece per turn from the head
        const headIndex = this.turn === 'white' ? 23 : 11;
        let headLimit = 1;
        if (this.isFirstTurn[this.turn] &&
            this.dice.length === 4 && // means doubles were rolled
            [3, 4, 6].includes(this.dice[0])) {
            headLimit = 2;
        }
        if (fromIndex === headIndex && this.headMoved >= headLimit) return [];

        const found = new Map();
        this._findMoves(fromIndex, this.movesLeft.slice(), [], found, fromIndex === headIndex);
        return Array.from(found.keys());
    }

    /* Recursive move finder — supports multi-die combined moves */
    _findMoves(curIndex, availDice, usedIdx, found, isFromHead) {
        const bearOffKey = 'off';
        const canBO = this.canBearOff();

        for (let i = 0; i < availDice.length; i++) {
            if (usedIdx.includes(i)) continue;
            const die = availDice[i];

            // --- Normal move ---
            const target = (curIndex - die + 24) % 24;
            const tProgress = this._progress(target);
            // Must be moving FORWARD (progress increases) and not looping past the home boundary
            if (tProgress > this._progress(curIndex) && this._canLandOn(target)) {
                const newUsed = [...usedIdx, i];
                found.set(target, newUsed);
                // Try to combine with remaining dice
                this._findMoves(target, availDice, newUsed, found, false);
            }

            // --- Bearing off ---
            if (canBO) {
                const p = this._progress(curIndex);
                if (p >= 18) { // in home zone
                    // Exact: progress + die = 24. Or higher die if no piece further from goal.
                    if (p + die >= 24) {
                        found.set(bearOffKey, [...usedIdx, i]);
                    }
                }
            }
        }
    }

    /* Apply a move: fromIndex -> targetIndex (or 'off') */
    async applyMove(fromIndex, targetIndex) {
        if (this.status !== 'playing' || this.movesLeft.length === 0) return false;

        // Find which dice were used (re-run legal move calc)
        const found = new Map();
        this._findMoves(fromIndex, this.movesLeft.slice(), [], found, fromIndex === (this.turn === 'white' ? 23 : 11));
        const diceUsed = found.get(targetIndex);
        if (!diceUsed) return false;

        // Remove used dice (descending index to not shift)
        const sorted = [...diceUsed].sort((a,b) => b - a);
        for (const idx of sorted) this.movesLeft.splice(idx, 1);

        // Move piece off the source
        const cell = this.board[fromIndex];
        cell.count--;
        if (cell.count === 0) this.board[fromIndex] = null;

        const headIndex = this.turn === 'white' ? 23 : 11;
        if (fromIndex === headIndex) this.headMoved++;

        // Place piece on target
        if (targetIndex === 'off') {
            if (this.turn === 'white') this.whiteOff++;
            else this.blackOff++;
            if (this.whiteOff === 15) { this.status = 'finished'; this.winner = 'white'; }
            if (this.blackOff === 15) { this.status = 'finished'; this.winner = 'black'; }
        } else {
            const dest = this.board[targetIndex];
            if (!dest) this.board[targetIndex] = { player: this.turn, count: 1 };
            else dest.count++;
        }

        this.version++;
        if (window.bgSyncState) await window.bgSyncState();

        if (this.movesLeft.length === 0 || !this.hasLegalMoves()) {
            setTimeout(() => this.nextTurn(), 1000);
        }
        return true;
    }

    async rollDice(playerColor) {
        if (this.status === 'starting') {
            if (this.startingRolls[playerColor]) return false;
            const roll = Math.floor(Math.random() * 6) + 1;
            this.startingRolls[playerColor] = roll;
            
            // Check if both rolled
            if (this.startingRolls.white && this.startingRolls.black) {
                if (this.startingRolls.white === this.startingRolls.black) {
                    // Tie, reset to roll again
                    this.startingRolls = { white: null, black: null };
                } else {
                    // Decide winner
                    const whiteStarted = this.startingRolls.white > this.startingRolls.black;
                    
                    // 1. Sync immediately so both players see the dice
                    this.version++;
                    if (window.bgSyncState) window.bgSyncState();
                    return true;
                }
            } else {
                this.version++;
            }
            if (window.bgSyncState) window.bgSyncState();
            return true;
        }

        if (this.status !== 'playing' || this.turn !== playerColor || this.movesLeft.length > 0) return false;
        const d1 = Math.floor(Math.random() * 6) + 1;
        const d2 = Math.floor(Math.random() * 6) + 1;
        this.dice = d1 === d2 ? [d1, d1, d1, d1] : [d1, d2];
        this.movesLeft = [...this.dice];
        this.headMoved = 0;
        this.version++;
        if (window.bgSyncState) await window.bgSyncState();
        if (!this.hasLegalMoves()) setTimeout(() => this.nextTurn(), 1500);
    }

    hasLegalMoves() {
        for (let i = 0; i < 24; i++) {
            if (this.getLegalMoves(i).length > 0) return true;
        }
        return false;
    }

    async nextTurn() {
        this.isFirstTurn[this.turn] = false;
        this.turn = this.turn === 'white' ? 'black' : 'white';
        this.movesLeft = [];
        this.dice = [];
        this.headMoved = 0;
        this.version++;
        if (window.bgSyncState) await window.bgSyncState();
    }

    syncState(serverState) {
        if (!serverState) return;
        
        // Reset engine if the server indicates a fresh new game (version 0, starting status) and we are not fresh
        if (serverState.version === 0 && serverState.status === 'starting' && this.version > 0) {
            this.reset();
        }

        if (serverState.version <= this.version && this.status !== 'starting') return;

        this.board = serverState.board;
        this.turn = serverState.turn;
        this.dice = serverState.dice;
        this.movesLeft = serverState.movesLeft;
        this.status = serverState.status;
        this.whiteOff = serverState.whiteOff;
        this.blackOff = serverState.blackOff;
        this.headMoved = serverState.headMoved;
        this.isFirstTurn = serverState.isFirstTurn;
        this.winner = serverState.winner;
        this.startingRolls = serverState.startingRolls;
        this.version = serverState.version;
        this.readyToStart = serverState.readyToStart || { white: false, black: false };
    }

    async acknowledgeStart(playerColor) {
        if (this.status !== 'starting') return;
        if (!this.startingRolls.white || !this.startingRolls.black) return;
        
        this.readyToStart[playerColor] = true;
        this.version++;
        
        // If both ready, transition to playing
        if (this.readyToStart.white && this.readyToStart.black) {
            const whiteStarted = this.startingRolls.white > this.startingRolls.black;
            this.turn = whiteStarted ? 'white' : 'black';
            this.dice = [this.startingRolls.white, this.startingRolls.black];
            this.movesLeft = [...this.dice];
            this.status = 'playing';
        }
        
        if (window.bgSyncState) await window.bgSyncState();
    }
}
window.BackgammonEngine = BackgammonEngine;
