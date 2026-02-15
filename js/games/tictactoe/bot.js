/* js/games/tictactoe/bot.js */

window.TicTacToeBot = {
    isThinking: false,
    check(state, players, isHost) {
        if (!isHost || state.phase !== 'playing' || this.isThinking) return;

        const currentTurnId = String(state.current_turn);
        const activeBot = players.find(p => String(p.id) === currentTurnId && p.is_bot);

        if (activeBot) {
            console.log("[TicTacToeBot] Active bot turn detected:", activeBot.first_name);
            this.isThinking = true;

            // Determine bot symbol based on room players order (Join Order)
            // res.players should be in join order from the server
            const botSymbol = (String(players[0].id) === String(activeBot.id)) ? 'X' : 'O';
            const difficulty = activeBot.bot_difficulty || 'easy';

            this.makeMove(state, botSymbol, difficulty);
        }
    },

    makeMove(state, botSymbol, difficulty) {
        console.log(`[TicTacToeBot] Planning move... (${difficulty})`);
        // Delay for realism
        setTimeout(() => {
            let index = -1;
            const board = state.board;
            const opponentSymbol = botSymbol === 'X' ? 'O' : 'X';

            if (difficulty === 'hard') {
                index = this.getBestMove(board, botSymbol);
            } else if (difficulty === 'medium') {
                index = this.getMediumMove(board, botSymbol, opponentSymbol);
            } else {
                index = this.getRandomMove(board);
            }

            console.log("[TicTacToeBot] Selected move index:", index);
            if (index !== -1) {
                window.apiRequest({
                    action: 'game_action',
                    type: 'make_move',
                    index: index
                }).then((res) => {
                    if (res.game_over && res.players_data) {
                        if (window.handleTicTacToeGameOver) {
                            window.handleTicTacToeGameOver(res.players_data);
                        }
                    }
                    if (window.checkState) window.checkState();
                }).finally(() => {
                    this.isThinking = false;
                });
            } else {
                this.isThinking = false;
            }
        }, 800);
    },

    getRandomMove(board) {
        const available = board.map((v, i) => v === null ? i : null).filter(v => v !== null);
        return available.length > 0 ? available[Math.floor(Math.random() * available.length)] : -1;
    },

    getMediumMove(board, botSymbol, opponentSymbol) {
        // 1. Try to win
        let move = this.findWinningMove(board, botSymbol);
        if (move !== -1) return move;

        // 2. Try to block opponent
        move = this.findWinningMove(board, opponentSymbol);
        if (move !== -1) return move;

        // 3. Fallback to random
        return this.getRandomMove(board);
    },

    findWinningMove(board, symbol) {
        const lines = [
            [0, 1, 2], [3, 4, 5], [6, 7, 8],
            [0, 3, 6], [1, 4, 7], [2, 5, 8],
            [0, 4, 8], [2, 4, 6]
        ];

        for (const line of lines) {
            const [a, b, c] = line;
            const vals = [board[a], board[b], board[c]];
            const symbolCount = vals.filter(v => v === symbol).length;
            const nullCount = vals.filter(v => v === null).length;

            if (symbolCount === 2 && nullCount === 1) {
                return line[vals.indexOf(null)];
            }
        }
        return -1;
    },

    getBestMove(board, botSymbol) {
        let bestScore = -Infinity;
        let move = -1;
        const opponentSymbol = botSymbol === 'X' ? 'O' : 'X';

        for (let i = 0; i < 9; i++) {
            if (board[i] === null) {
                board[i] = botSymbol;
                let score = this.minimax(board, 0, false, botSymbol, opponentSymbol);
                board[i] = null;
                if (score > bestScore) {
                    bestScore = score;
                    move = i;
                }
            }
        }
        return move;
    },

    minimax(board, depth, isMaximizing, botSymbol, opponentSymbol) {
        const result = this.checkWinner(board);
        if (result === botSymbol) return 10 - depth;
        if (result === opponentSymbol) return depth - 10;
        if (result === 'draw') return 0;

        if (isMaximizing) {
            let bestScore = -Infinity;
            for (let i = 0; i < 9; i++) {
                if (board[i] === null) {
                    board[i] = botSymbol;
                    let score = this.minimax(board, depth + 1, false, botSymbol, opponentSymbol);
                    board[i] = null;
                    bestScore = Math.max(score, bestScore);
                }
            }
            return bestScore;
        } else {
            let bestScore = Infinity;
            for (let i = 0; i < 9; i++) {
                if (board[i] === null) {
                    board[i] = opponentSymbol;
                    let score = this.minimax(board, depth + 1, true, botSymbol, opponentSymbol);
                    board[i] = null;
                    bestScore = Math.min(score, bestScore);
                }
            }
            return bestScore;
        }
    },

    checkWinner(board) {
        const lines = [
            [0, 1, 2], [3, 4, 5], [6, 7, 8],
            [0, 3, 6], [1, 4, 7], [2, 5, 8],
            [0, 4, 8], [2, 4, 6]
        ];
        for (const line of lines) {
            const [a, b, c] = line;
            if (board[a] && board[a] === board[b] && board[a] === board[c]) {
                return board[a];
            }
        }
        if (!board.includes(null)) return 'draw';
        return null;
    }
};
