/* js/games/tictactoe_ultimate/bot.js */

window.TicTacToeUltimateBot = {
    isThinking: false,
    check(state, players, isHost) {
        if (!isHost || state.phase !== 'playing' || this.isThinking) return;

        const currentTurnId = String(state.current_turn);
        const activeBot = players.find(p => String(p.id) === currentTurnId && p.is_bot);

        if (activeBot) {
            console.log("[TicTacToeU-Bot] Turn detected.");
            this.isThinking = true;

            const playersSorted = [...players].sort((a, b) => a.id - b.id);
            const botSymbol = (String(playersSorted[0].id) === String(activeBot.id)) ? 'X' : 'O';

            this.makeMove(state, botSymbol);
        }
    },

    makeMove(state, botSymbol) {
        setTimeout(() => {
            let bIdx = -1;
            let cIdx = -1;

            const possibleMoves = [];
            const active = state.active_mini_board;

            state.boards.forEach((miniBoard, mIdx) => {
                const isMiniActive = (active === null || active === -1 || active === mIdx);
                if (isMiniActive && !state.mini_wins[mIdx]) {
                    miniBoard.forEach((cell, i) => {
                        if (cell === null) possibleMoves.push({ bIdx: mIdx, cIdx: i });
                    });
                }
            });

            if (possibleMoves.length > 0) {
                // Better AI: Preference for central blocks or blocks that lead to wins
                // For now, random but functional
                const move = possibleMoves[Math.floor(Math.random() * possibleMoves.length)];
                bIdx = move.bIdx;
                cIdx = move.cIdx;
            }

            if (bIdx !== -1) {
                console.log("[TicTacToeU-Bot] Moving:", bIdx, cIdx);
                (async () => {
                    try {
                        const res = await window.apiRequest({
                            action: 'game_action',
                            type: 'make_move',
                            board_index: bIdx,
                            cell_index: cIdx
                        });
                        if (res.game_over && res.players_data && window.isHost) {
                            window.apiRequest({ action: 'game_finished', players_data: JSON.stringify(res.players_data), duration: 0 });
                        }
                        if (window.checkState) window.checkState();
                    } catch (e) {
                        console.error('Bot ultimate move failed', e);
                    } finally {
                        this.isThinking = false;
                    }
                })();
            } else {
                this.isThinking = false;
            }
        }, 1000);
    }
};
