/* js/games/tictactoe_ultimate/index.js */

window.render_tictactoe_ultimate = function (res) {
    const wrapper = document.getElementById('game-area');
    if (!res || !res.room || !wrapper) return;

    const state = typeof res.room.game_state === 'string'
        ? JSON.parse(res.room.game_state)
        : res.room.game_state;

    if (!state || !state.boards) return;

    // 1. Bot Check
    if (window.TicTacToeUltimateBot && res.is_host) {
        window.TicTacToeUltimateBot.check(state, res.players, true);
    }

    // 2. Prevent redundant re-renders (state is large, hash is better)
    const stateHash = JSON.stringify({
        phase: state.phase,
        turn: state.current_turn,
        boards: state.boards,
        mini_wins: state.mini_wins,
        active: state.active_mini_board,
        players: (res.players || []).length
    });

    if (window._tttUltimateLastHash === stateHash) return;
    window._tttUltimateLastHash = stateHash;

    // 3. Render UI (Defined in ui.js)
    if (window.renderTicTacToeUltimateUI) {
        window.renderTicTacToeUltimateUI(wrapper, state, res);
    }
};
