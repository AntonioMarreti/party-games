/* js/games/tictactoe/ui.js */

window.renderTicTacToe = function (wrapper, state, res) {
    const myId = String(res.user.id);
    const players = res.players || [];
    const isHost = res.is_host == 1;
    const currentTurnId = state.current_turn;
    const isMyTurn = currentTurnId === myId;
    const isGameFinished = state.phase === 'finished' || !!state.winner;

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

    const postGameSummary = state.phase === 'finished' && window.GameSummaryProvider
        ? window.GameSummaryProvider.remember('tictactoe', state, { players })
        : null;

    wrapper.innerHTML = `
        <div class="tictactoe-container animate__animated animate__fadeIn">
            <div class="tictactoe-info">
                <div class="mb-3">
                    <span class="badge rounded-pill bg-dark bg-opacity-10 text-muted px-3 py-2">Твой символ: ${mySymbol}</span>
                </div>
                <div class="tictactoe-turn-badge ${badgeClass} mb-4">
                    ${statusText}
                </div>
                <div id="tictactoe-local-hint" class="small text-muted" aria-live="polite" style="min-height: 20px;"></div>
            </div>

            <div class="tictactoe-board-wrapper">
                <div class="tictactoe-board">
                    ${(state.board || []).map((cell, index) => {
        const isWinningCell = state.winning_line && state.winning_line.includes(index);
        const occupiedClass = cell ? 'occupied' : '';
        const winnerClass = isWinningCell ? 'winner' : '';
        const symbolClass = cell ? `tictactoe-symbol-${cell.toLowerCase()}` : '';
        const canMove = state.phase === 'playing' && !isGameFinished && isMyTurn && !cell;
        let blockedHint = '';
        if (cell) {
            blockedHint = 'Клетка уже занята';
        } else if (isGameFinished) {
            blockedHint = 'Игра уже завершена';
        } else if (state.phase !== 'playing') {
            blockedHint = 'Сначала нажмите «Начать игру»';
        } else if (!isMyTurn) {
            blockedHint = 'Сейчас ход соперника';
        }
        const clickHandler = canMove
            ? `window.makeTicTacToeMove(${index})`
            : `window.showTicTacToeHint('${blockedHint}')`;

        return `
                            <div class="tictactoe-cell ${occupiedClass} ${winnerClass}" 
                                 onclick="${clickHandler}">
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

            ${postGameSummary ? `<div class="mt-4 w-100" style="max-width: 420px; margin-left:auto; margin-right:auto;">${window.GameSummaryProvider.render(postGameSummary, {
                playAgainLabel: isHost ? 'Играть ещё раз' : 'В комнату',
                playAgainAction: isHost ? 'play-again' : 'return-to-room'
            })}</div>` : ''}

            <div class="mt-5">
                <button class="btn btn-link text-muted text-decoration-none small" onclick="window.leaveRoom()">
                    <i class="bi bi-box-arrow-left me-1"></i> Выйти из игры
                </button>
            </div>
        </div>
    `;
};

window.showTicTacToeHint = function (message) {
    const hint = document.getElementById('tictactoe-local-hint');
    const text = message || 'Ход сейчас недоступен';
    if (hint) {
        hint.textContent = text;
        clearTimeout(window._tttHintTimer);
        window._tttHintTimer = setTimeout(() => {
            if (hint.textContent === text) hint.textContent = '';
        }, 2200);
        return;
    }
    if (window.showAlert) window.showAlert('Крестики-нолики', text, 'info');
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
        if (!res || res.status !== 'ok') {
            window.showTicTacToeHint(res?.message || 'Не удалось сделать ход');
            return;
        }
        if (window.checkState) window.checkState();
    } catch (e) {
        console.error("Move Error:", e);
        window.showTicTacToeHint('Не удалось сделать ход');
    }
};

window.handleTicTacToeGameOver = function () {};

if (window.GameSummaryProvider) {
    window.GameSummaryProvider.register('tictactoe', {
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
            const moves = Array.isArray(gameState?.board)
                ? gameState.board.filter(Boolean).length
                : 0;
            const outcome = winner
                ? `${winnerName} закрыл партию за ${moves} ходов.`
                : 'Ничья: поле закончилось, спор остался.';
            const awards = [];

            if (winner) {
                awards.push({
                    iconClass: 'bi bi-trophy-fill',
                    title: 'Победитель дуэли',
                    player: `${winnerName} · ${winnerSymbol}`
                });
            } else {
                awards.push({
                    iconClass: 'bi bi-slash-circle',
                    title: 'Идеальная ничья',
                    player: `${moves} ходов без победителя`
                });
            }
            awards.push({
                iconClass: 'bi bi-grid-3x3',
                title: 'Финальное поле',
                player: `${moves} ходов`
            });

            return {
                gameId: 'tictactoe',
                gameTitle: 'Крестики-нолики',
                participants: players.map(player => ({
                    id: player.id,
                    name: player.display_name || player.custom_name || player.first_name || 'Игрок'
                })),
                winner: winner ? { id: winner.id, name: winnerName, score: moves } : null,
                outcome,
                awards
            };
        },
        playAgain: function () {
            if (typeof window.restartTicTacToe === 'function') {
                window.restartTicTacToe();
            }
        },
        'return-to-room': function () {
            if (typeof window.checkState === 'function') {
                window.checkState();
            }
        }
    });
}

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
