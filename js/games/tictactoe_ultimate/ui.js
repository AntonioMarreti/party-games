/* js/games/tictactoe_ultimate/ui.js */

window.renderTicTacToeUltimateUI = function (wrapper, state, res) {
    const myId = String(res.user.id);
    const players = res.players || [];
    const isHost = res.is_host == 1;
    const currentTurnId = String(state.current_turn);
    const isMyTurn = currentTurnId === myId;

    // Assign symbols based on join order
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
        statusText = state.winner === 'draw' ? 'НИЧЬЯ!' : `GIVE WINNER...`;
        if (state.winner !== 'draw') {
            const winnerId = Object.keys(symbols).find(id => symbols[id] === state.winner);
            const winnerPlayer = players.find(p => String(p.id) === winnerId);
            statusText = winnerPlayer ? `ПОБЕДА: ${winnerPlayer.first_name.toUpperCase()}` : 'КОНЕЦ ИГРЫ';
        }
        badgeClass = state.winner === 'draw' ? 'bg-warning' : 'bg-success';
    }

    wrapper.innerHTML = `
        <div class="ttt-u-container animate__animated animate__fadeIn">
            <div class="ttt-u-info text-center mb-3">
                 <div class="ttt-u-badge ${badgeClass}">${statusText}</div>
                 <div class="small text-muted mt-2">Твой символ: <b>${mySymbol}</b></div>
            </div>

            <div class="ttt-u-grid-macro">
                ${state.boards.map((miniBoard, bIdx) => {
        const winner = state.mini_wins[bIdx];
        const isActive = state.active_mini_board === bIdx || state.active_mini_board === -1 || state.active_mini_board === null;
        const isFocus = state.active_mini_board === bIdx;
        const canPlayOnBoard = isActive && !winner;

        let boardClasses = ['ttt-u-mini-board'];
        if (winner) boardClasses.push('won-' + winner.toLowerCase());
        if (isFocus) boardClasses.push('focus');
        if (canPlayOnBoard && state.phase === 'playing') boardClasses.push('playable');

        return `
                        <div class="${boardClasses.join(' ')}" data-index="${bIdx}">
                            ${winner && winner !== 'draw' ? `<div class="mini-winner-overlay">${winner}</div>` : ''}
                            ${winner === 'draw' ? `<div class="mini-winner-overlay draw">D</div>` : ''}
                            <div class="ttt-u-mini-grid">
                                ${miniBoard.map((cell, cIdx) => {
            const cellClass = cell ? 'occupied' : 'empty';
            const symbolClass = cell ? 'symbol-' + cell.toLowerCase() : '';
            return `
                                        <div class="ttt-u-cell ${cellClass}" onclick="window.makeUltimateMove(${bIdx}, ${cIdx})">
                                            <span class="${symbolClass}">${cell || ''}</span>
                                        </div>
                                    `;
        }).join('')}
                            </div>
                        </div>
                    `;
    }).join('')}
            </div>

            <div class="ttt-u-controls mt-4 text-center">
                ${state.phase === 'lobby' && isHost ? `<button class="btn btn-primary rounded-pill px-4" onclick="window.startUltimateGame()">НАЧАТЬ</button>` : ''}
                ${state.phase === 'finished' && isHost ? `<button class="btn btn-primary rounded-pill px-4" onclick="window.startUltimateGame()">ИГРАТЬ СНОВА</button>` : ''}
                <div class="mt-3">
                    <button class="btn btn-link text-muted small" onclick="window.leaveRoom()">Выйти</button>
                </div>
            </div>
        </div>
    `;
};

window.startUltimateGame = async function () {
    try {
        await window.apiRequest({ action: 'game_action', type: 'start_game' });
        if (window.checkState) window.checkState();
    } catch (e) {
        console.error(e);
    }
};

window.makeUltimateMove = async function (bIdx, cIdx) {
    if (window.triggerHaptic) window.triggerHaptic('impact', 'light');
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
        console.error(e);
    }
};
