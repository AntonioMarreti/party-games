// js/games/spyfall/index.js

window.spyfallStartGame = function () {
    sendGameAction('start_game');
};

window.spyfallNextTurn = function () {
    if (window.triggerHaptic) triggerHaptic('impact', 'light');
    sendGameAction('next_turn');
};

window.spyfallVoteSpy = function (targetId) {
    if (window.triggerHaptic) triggerHaptic('impact', 'medium');
    sendGameAction('vote_spy', { target_id: targetId });
};

window.spyfallGuessLocation = function (locationName) {
    if (window.triggerHaptic) triggerHaptic('impact', 'medium');
    sendGameAction('guess_location', { guess: locationName });
};

window.spyfallUpdateSettings = function (timeLimit) {
    sendGameAction('update_settings', { time_limit: timeLimit });
};

window.spyfallOptClick = function (btn, val) {
    // Immediate feedback
    const container = btn.parentElement;
    container.querySelectorAll('.glass-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    if (window.triggerHaptic) triggerHaptic('selection');
    window.spyfallUpdateSettings(val);
};

// Global Helper to return to lobby
window.spyfallFinish = async function () {
    const res = window.lastSpyfallResponse;
    if (res && res.is_host && res.room.game_state) {
        try {
            const state = JSON.parse(res.room.game_state);
            if (state.phase === 'results' && state.winner) {
                const playersData = res.players.map(p => {
                    const isSpy = String(p.id) === String(state.spy_id);
                    const won = (state.winner === 'spy' && isSpy) || (state.winner === 'locals' && !isSpy);
                    return {
                        user_id: p.id,
                        rank: won ? 1 : 2,
                        score: won ? 1 : 0,
                        role: isSpy ? 'spy' : 'local' // Used for achievement context
                    };
                });
                await window.submitGameResults(playersData);
            }
        } catch (e) {
            console.error("Spyfall finish error:", e);
        }
    }
    sendGameAction('back_to_lobby');
};
