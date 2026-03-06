// js/games/partybattle/index.js

let pb_lastStateString = null;

window.render_partybattle = function (res) {
    const gameArea = document.getElementById('game-area');
    if (!gameArea) return;

    if (!res || !res.room) return;

    // Provide generic APP_STATE for UI modules to access players and host status
    window.APP_STATE = res;
    const players = (res.players || []).map(p => ({
        ...p,
        display_name: p.custom_name || p.first_name || 'Игрок',
        photo_url: p.photo_url || (p.custom_avatar ? null : 'https://api.dicebear.com/9.x/adventurer/svg?seed=' + p.id),
        custom_avatar: p.custom_avatar || null,
        is_online: true
    }));
    window.APP_STATE.room.players = players;
    window.APP_STATE.players = players; // Global sync for renderAvatar compatibility
    window.APP_STATE.room.is_host = res.is_host || false;

    const stateStr = res.room.game_state;
    if (pb_lastStateString === stateStr) {
        return; // Skip re-rendering if state hasn't changed
    }
    pb_lastStateString = stateStr;

    const gameState = typeof stateStr === 'string'
        ? JSON.parse(stateStr)
        : stateStr;

    if (!gameState) return;

    console.log("Rendering PartyBattle", gameState);

    // Delegate to UI based on phase
    const phase = gameState.phase || 'lobby';

    if (!window.PartyBattleUI) {
        gameArea.innerHTML = `<div class="p-5">UI Module Loading...</div>`;
        return;
    }

    if (phase === 'lobby' || phase === 'intro') {
        window.PartyBattleUI.renderLobby(gameState);
    } else if (phase === 'round_situation') {
        window.PartyBattleUI.renderSituation(gameState);
    } else if (phase === 'round_submission') {
        window.PartyBattleUI.renderSubmissionScreen(gameState);
    } else if (phase === 'round_voting') {
        window.PartyBattleUI.renderVotingScreen(gameState);
    } else if (phase === 'round_results') {
        window.PartyBattleUI.renderRoundResults(gameState);
    } else if (phase === 'results') {
        window.PartyBattleUI.renderGameResults(gameState);
    } else {
        gameArea.innerHTML = `<div class="p-5">Unknown Phase: ${phase}</div>`;
    }
}
