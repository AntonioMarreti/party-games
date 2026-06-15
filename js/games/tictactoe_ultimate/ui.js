/* js/games/tictactoe_ultimate/ui.js */

window.renderTicTacToeUltimateUI = function (wrapper, state, res) {
    const myId = String(res.user.id);
    const players = res.players || [];
    const isHost = res.is_host == 1;
    const currentTurnId = String(state.current_turn);
    const isMyTurn = currentTurnId === myId;
    const isGameFinished = state.phase === 'finished' || !!state.winner;
    const activeMiniBoard = state.active_mini_board;
    const isAnyMiniBoardAllowed = activeMiniBoard === null || activeMiniBoard === -1;

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

    const postGameSummary = state.phase === 'finished' && window.GameSummaryProvider
        ? window.GameSummaryProvider.remember('tictactoe_ultimate', state, { players })
        : null;

    wrapper.innerHTML = `
        <div class="ttt-u-container animate__animated animate__fadeIn">
            <div class="ttt-u-info text-center mb-3">
                 <div class="ttt-u-badge ${badgeClass}">${statusText}</div>
                 <div class="small text-muted mt-2">Твой символ: <b>${mySymbol}</b></div>
                 <div id="ttt-u-local-hint" class="small text-muted mt-1" aria-live="polite" style="min-height: 20px;"></div>
            </div>

            <div class="ttt-u-grid-macro">
                ${state.boards.map((miniBoard, bIdx) => {
        const winner = state.mini_wins[bIdx];
        const isActive = activeMiniBoard === bIdx || isAnyMiniBoardAllowed;
        const isFocus = activeMiniBoard === bIdx;
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
            const canMove = state.phase === 'playing'
                && !isGameFinished
                && isMyTurn
                && !winner
                && !cell
                && (isAnyMiniBoardAllowed || activeMiniBoard === bIdx);
            let blockedHint = '';
            if (isGameFinished) {
                blockedHint = 'Игра уже завершена';
            } else if (state.phase !== 'playing') {
                blockedHint = 'Сначала нажмите «Начать игру»';
            } else if (!isMyTurn) {
                blockedHint = 'Сейчас ход соперника';
            } else if (winner) {
                blockedHint = 'Это поле уже завершено';
            } else if (cell) {
                blockedHint = 'Клетка уже занята';
            } else if (!isAnyMiniBoardAllowed && activeMiniBoard !== bIdx) {
                blockedHint = 'Ходить нужно в подсвеченное поле';
            }
            const clickHandler = canMove
                ? `window.makeUltimateMove(${bIdx}, ${cIdx})`
                : `window.showUltimateHint('${blockedHint}')`;
            return `
                                        <div class="ttt-u-cell ${cellClass}" onclick="${clickHandler}">
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

            ${postGameSummary ? `<div class="mt-4 w-100" style="max-width: 420px; margin-left:auto; margin-right:auto;">${window.GameSummaryProvider.render(postGameSummary, {
                playAgainLabel: isHost ? 'Играть ещё раз' : 'В комнату',
                playAgainAction: isHost ? 'play-again' : 'return-to-room'
            })}</div>` : ''}
        </div>
    `;
};

window.showUltimateHint = function (message) {
    const hint = document.getElementById('ttt-u-local-hint');
    const text = message || 'Ход сейчас недоступен';
    if (hint) {
        hint.textContent = text;
        clearTimeout(window._tttUltimateHintTimer);
        window._tttUltimateHintTimer = setTimeout(() => {
            if (hint.textContent === text) hint.textContent = '';
        }, 2200);
        return;
    }
    if (window.showAlert) window.showAlert('Крестики-нолики Ultimate', text, 'info');
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
        if (!res || res.status !== 'ok') {
            window.showUltimateHint(res?.message || 'Не удалось сделать ход');
            return;
        }
        if (window.checkState) window.checkState();
    } catch (e) {
        console.error(e);
        window.showUltimateHint('Не удалось сделать ход');
    }
};

if (window.GameSummaryProvider) {
    window.GameSummaryProvider.register('tictactoe_ultimate', {
        buildSummary: function (gameState, context = {}) {
            const players = context.players || [];
            const symbols = {};
            if (players[0]) symbols[String(players[0].id)] = 'X';
            if (players[1]) symbols[String(players[1].id)] = 'O';
            const winnerSymbol = gameState?.winner;
            const winner = winnerSymbol && winnerSymbol !== 'draw'
                ? players.find(player => symbols[String(player.id)] === winnerSymbol)
                : null;
            const winnerName = winner ? (winner.display_name || winner.custom_name || winner.first_name || 'Игрок') : '';
            const wonBoards = Array.isArray(gameState?.mini_wins)
                ? gameState.mini_wins.filter(value => value && value !== 'draw').length
                : 0;
            const outcome = winner
                ? `${winnerName} собрал большую линию и забрал Ultimate-дуэль.`
                : 'Большая сетка не сдалась никому.';
            const awards = [];

            if (winner) {
                awards.push({
                    iconClass: 'bi bi-trophy-fill',
                    title: 'Победитель большой сетки',
                    player: `${winnerName} · ${winnerSymbol}`
                });
            }
            awards.push({
                iconClass: 'bi bi-grid-3x3-gap-fill',
                title: 'Захвачено мини-полей',
                player: `${wonBoards} из 9`
            });
            if (!winner) {
                awards.push({
                    iconClass: 'bi bi-slash-circle',
                    title: 'Жёсткая ничья',
                    player: 'Никто не собрал линию'
                });
            }

            return {
                gameId: 'tictactoe_ultimate',
                gameTitle: 'Крестики-нолики Ultimate',
                participants: players.map(player => ({
                    id: player.id,
                    name: player.display_name || player.custom_name || player.first_name || 'Игрок'
                })),
                winner: winner ? { id: winner.id, name: winnerName, score: wonBoards } : null,
                outcome,
                awards
            };
        },
        playAgain: function () {
            if (typeof window.startUltimateGame === 'function') {
                window.startUltimateGame();
            }
        },
        'return-to-room': function () {
            if (typeof window.checkState === 'function') {
                window.checkState();
            }
        }
    });
}
