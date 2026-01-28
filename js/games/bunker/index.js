window.render_bunker = async function (res) {
    var container = document.getElementById('game-area');
    if (!container) return;

    if (!res || !res.room) return;

    var state = typeof res.room.game_state === 'string'
        ? JSON.parse(res.room.game_state)
        : res.room.game_state;
    if (!state) return;

    // Initialize global state
    window.bunkerState = window.bunkerState || { activeTab: 'me', lastStateHash: '' };

    // Create a simple hash of the state to detect changes
    var currentStateHash = JSON.stringify({
        phase: state.phase,
        round: state.current_round,
        voted_count: state.votes ? Object.keys(state.votes).length : 0,
        revealed_count: state.players_cards ?
            Object.values(state.players_cards).reduce(function (acc, p) {
                return acc + Object.values(p).filter(function (c) { return c.revealed; }).length;
            }, 0) : 0,
        user_voted: state.votes ? !!state.votes[res.user.id] : false
    });

    // Save global state for modules
    window.bunkerState.lastRes = res;
    window.bunkerState.lastServerState = state;

    // Find or create wrapper
    var wrapper = document.getElementById('bunker-wrapper');
    var isFirstLoad = !wrapper;

    if (isFirstLoad) {
        container.innerHTML = '';
        wrapper = document.createElement('div');
        wrapper.id = 'bunker-wrapper';
        wrapper.className = 'bunker-theme-wrapper animate__animated animate__fadeIn';
        container.appendChild(wrapper);
    }

    // Only re-render if content changed or it's the first time
    if (isFirstLoad || currentStateHash !== window.bunkerState.lastStateHash) {
        window.bunkerState.lastStateHash = currentStateHash;

        // Basic Global Cleanup (Hiding default UI)
        ['default-game-header', 'game-host-controls', 'score-card'].forEach(function (id) {
            var el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });

        // Handle Setup/Lobby phases
        if (!state.players_cards || Object.keys(state.players_cards).length === 0) {
            window.renderSetupScreen(wrapper, state, res);
            return;
        }

        // Router
        switch (state.phase) {
            case 'round': window.renderRoundPhase(wrapper, state, res); break;
            case 'vote_query': window.renderVoteQuery(wrapper, state, res); break;
            case 'voting': window.renderVoting(wrapper, state, res, false); break;
            case 'tie_reveal': window.renderTieReveal(wrapper, state, res); break;
            case 'tie_voting': window.renderVoting(wrapper, state, res, true); break;
            case 'vote_results': window.renderVoteResults(wrapper, state, res); break;
            case 'outro': window.renderOutro(wrapper, state, res); break;
            default:
                wrapper.innerHTML = `<div class="alert alert-danger">Unknown phase: ${state.phase}</div>`;
        }
    }
};

window.renderSetupScreen = function (wrapper, state, res) {
    if (res.is_host) {
        wrapper.innerHTML = `
            <div class="bunker-main-layout d-flex flex-column align-items-center justify-content-center px-4" style="padding-top: calc(50px + env(safe-area-inset-top));">
                <h1 class="display-1 mb-3">☢️</h1>
                <h2 class="fw-bold mb-4">Настройка Бункера</h2>
                
                <div class="card bg-white border-light p-4 shadow-sm w-100" style="max-width:350px; border-radius: 24px;">
                    <div class="form-check form-switch mb-4">
                        <input class="form-check-input" type="checkbox" id="modeHardcore">
                        <label class="form-check-label fw-bold" for="modeHardcore">☠️ Хардкор (Beta)</label>
                    </div>
                    
                    <button class="btn btn-primary btn-lg w-100 rounded-pill mb-3" style="font-weight: 800; padding: 15px;" onclick="window.startBunkerGame()">🚀 Начать игру</button>
                </div>

                <button class="btn btn-link text-muted mt-5 text-decoration-none" onclick="window.bunkerFinish(event)">Выйти в лобби</button>
            </div>
        `;
    } else {
        wrapper.innerHTML = `
            <div class="bunker-main-layout d-flex flex-column align-items-center justify-content-center text-center px-4" style="padding-top: calc(50px + env(safe-area-inset-top));">
                <div class="spinner-border text-primary mb-4" style="width: 3.5rem; height: 3.5rem;"></div>
                <h2 class="fw-bold text-dark">Ожидание хоста...</h2>
                <p class="text-muted mb-5">Бункер строится, карты раздаются</p>
                <button class="btn btn-outline-secondary btn-sm rounded-pill px-4" onclick="window.bunkerFinish(event)">Выйти</button>
            </div>`;
    }
};
