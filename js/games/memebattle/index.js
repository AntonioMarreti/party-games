// js/games/memebattle/index.js

let lastStateString = null;

window.render_memebattle = function (res) {
    const gameArea = document.getElementById('game-area');
    if (!gameArea) return;

    if (!res || !res.room) return;

    const stateStr = res.room.game_state;
    if (lastStateString === stateStr) {
        return; // Skip re-rendering if state hasn't changed
    }
    lastStateString = stateStr;

    const gameState = typeof stateStr === 'string'
        ? JSON.parse(stateStr)
        : stateStr;

    if (!gameState) return;

    console.log("Rendering MemeBattle", gameState);

    // Delegate to UI based on phase
    const phase = gameState.phase || 'lobby';

    if (phase === 'lobby' || phase === 'intro') {
        window.MemeBattleUI.renderLobby(gameState);
    } else if (phase === 'round_situation') {
        window.MemeBattleUI.renderSituation(gameState);
    } else if (phase === 'round_submission') {
        window.MemeBattleUI.renderSubmissionScreen(gameState);
    } else if (phase === 'round_voting') {
        window.MemeBattleUI.renderVotingScreen(gameState);
    } else if (phase === 'round_results') {
        window.MemeBattleUI.renderRoundResults(gameState);
    } else if (phase === 'results') {
        window.MemeBattleUI.renderGameResults(gameState);
    } else {
        gameArea.innerHTML = `<div class="p-5">Unknown Phase: ${phase}</div>`;
    }
}
