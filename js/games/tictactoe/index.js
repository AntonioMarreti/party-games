/* js/games/tictactoe/index.js */

window.render_tictactoe = function (res) {
    const wrapper = document.getElementById('game-area');
    if (!res || !res.room || !wrapper) return;

    const state = typeof res.room.game_state === 'string'
        ? JSON.parse(res.room.game_state)
        : res.room.game_state;

    // 1. Bot Check (Run outside hash to be robust, but protect with flag inside check)
    if (window.TicTacToeBot && res.is_host) {
        window.TicTacToeBot.check(state, res.players, true);
    }

    // 2. Prevent redundant re-renders (flickering fix)
    const stateHash = JSON.stringify({
        phase: state.phase,
        turn: state.current_turn,
        board: state.board,
        winner: state.winner,
        playersCount: (res.players || []).length
    });

    if (window._tttLastHash === stateHash) return;
    window._tttLastHash = stateHash;

    // 3. Render UI
    window.renderTicTacToe(wrapper, state, res);
};
