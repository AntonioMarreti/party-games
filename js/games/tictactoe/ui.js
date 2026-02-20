/* js/games/tictactoe/ui.js */

window.renderTicTacToe = function (wrapper, state, res) {
    const myId = String(res.user.id);
    const players = res.players || [];
    const isHost = res.is_host == 1;
    const currentTurnId = state.current_turn;
    const isMyTurn = currentTurnId === myId;

    // Assign symbols locally (Join Order matches server)
    const symbols = {};
    if (players[0]) symbols[String(players[0].id)] = 'X';
    if (players[1]) symbols[String(players[1].id)] = 'O';

    const mySymbol = symbols[myId] || '?';

    let statusText = '';
    let badgeClass = '';

    if (state.phase === 'lobby') {
        statusText = 'ГОТОВ К ИГРЕ';
        badgeClass = 'bg-info text-white';
    } else if (state.phase === 'playing') {
        if (isMyTurn) {
            statusText = 'ТВОЙ ХОД';
            badgeClass = 'my-turn';
        } else {
            const turnPlayer = players.find(p => String(p.id) === currentTurnId);
            statusText = turnPlayer ? `ХОДИТ ${turnPlayer.first_name.toUpperCase()}` : 'ОЖИДАНИЕ...';
            badgeClass = 'bg-light text-muted';
        }
    } else {
        if (state.winner === 'draw') {
            statusText = 'НИЧЬЯ!';
            badgeClass = 'bg-warning text-white';
        } else {
            const winnerId = Object.keys(symbols).find(id => symbols[id] === state.winner);
            const winnerPlayer = players.find(p => String(p.id) === winnerId);
            statusText = winnerPlayer ? `ПОБЕДА: ${winnerPlayer.first_name.toUpperCase()}` : 'КОНЕЦ ИГРЫ';
            badgeClass = 'bg-success text-white';
        }
    }

    wrapper.innerHTML = `
        <div class="tictactoe-container animate__animated animate__fadeIn">
            <div class="tictactoe-info">
                <div class="mb-3">
                    <span class="badge rounded-pill bg-dark bg-opacity-10 text-muted px-3 py-2">Твой символ: ${mySymbol}</span>
                </div>
                <div class="tictactoe-turn-badge ${badgeClass} mb-4">
                    ${statusText}
                </div>
            </div>

            <div class="tictactoe-board-wrapper">
                <div class="tictactoe-board">
                    ${(state.board || []).map((cell, index) => {
        const isWinningCell = state.winning_line && state.winning_line.includes(index);
        const occupiedClass = cell ? 'occupied' : '';
        const winnerClass = isWinningCell ? 'winner' : '';
        const symbolClass = cell ? `tictactoe-symbol-${cell.toLowerCase()}` : '';

        return `
                            <div class="tictactoe-cell ${occupiedClass} ${winnerClass}" 
                                 onclick="window.makeTicTacToeMove(${index})">
                                <span class="${symbolClass}">${cell || ''}</span>
                            </div>
                        `;
    }).join('')}
                </div>
            </div>

            <div class="tictactoe-controls mt-4">
                ${state.phase === 'lobby' && isHost ? `
                    <button class="btn btn-primary rounded-pill px-5 py-3 fw-bold shadow-lg" onclick="window.startTicTacToe()">
                        НАЧАТЬ ИГРУ
                    </button>
                ` : ''}

                ${state.phase === 'finished' && isHost ? `
                    <button class="btn btn-primary rounded-pill px-5 py-3 fw-bold shadow-lg" onclick="window.restartTicTacToe()">
                        ИГРАТЬ СНОВА
                    </button>
                ` : ''}
            </div>

            <div class="mt-5">
                <button class="btn btn-link text-muted text-decoration-none small" onclick="window.leaveRoom()">
                    <i class="bi bi-box-arrow-left me-1"></i> Выйти из игры
                </button>
            </div>
        </div>
    `;
};

window.startTicTacToe = async function () {
    if (window.triggerHaptic) window.triggerHaptic('impact', 'medium');
    try {
        await window.apiRequest({
            action: 'game_action',
            type: 'start_game'
        });
        if (window.checkState) window.checkState();
    } catch (e) {
        console.error("Start TTT Error:", e);
    }
};

window.makeTicTacToeMove = async function (index) {
    if (window.triggerHaptic) window.triggerHaptic('impact', 'light');
    try {
        const res = await window.apiRequest({
            action: 'game_action',
            type: 'make_move',
            index: index
        });
        if (res.game_over && res.players_data) {
            window.handleTicTacToeGameOver(res.players_data);
        }
        if (window.checkState) window.checkState();
    } catch (e) {
        console.error("Move Error:", e);
    }
};

window.handleTicTacToeGameOver = function (playersData) {
    // Only host submits results to stats
    if (window.isHost) {
        window.apiRequest({
            action: 'game_finished',
            players_data: JSON.stringify(playersData),
            duration: 0 // Could track duration if needed
        });
    }
};

window.restartTicTacToe = async function () {
    if (window.triggerHaptic) window.triggerHaptic('impact', 'medium');
    try {
        await window.apiRequest({
            action: 'game_action',
            type: 'restart_game'
        });
        if (window.checkState) window.checkState();
    } catch (e) {
        console.error("Restart Error:", e);
    }
};
