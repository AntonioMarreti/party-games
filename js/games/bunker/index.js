window.render_bunker = async function (res) {
    var container = document.getElementById('game-area');
    if (!container) return;

    if (!res || !res.room) return;

    var state = typeof res.room.game_state === 'string'
        ? JSON.parse(res.room.game_state)
        : res.room.game_state;
    if (!state) return;

    // Ensure Host Status is updated for Ticker
    if (typeof res.is_host !== 'undefined') window.isHost = res.is_host;

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
        user_voted: state.votes ? !!state.votes[res.user.id] : false,
        active_player: state.current_player_id,     // Track active player changes
        history_len: state.history ? state.history.length : 0 // Track history
    });

    // Save global state for modules
    var lastState = window.bunkerState.lastServerState;
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

    // Check for new history items (Reveal Animations)
    if (lastState && state.history && state.history.length > (lastState.history ? lastState.history.length : 0)) {
        var newItems = state.history.slice(lastState.history ? lastState.history.length : 0);
        newItems.forEach(function (item) {
            if (item.type === 'reveal') {
                // Find player name
                var p = res.players.find(function (pl) { return String(pl.id) === String(item.user_id); });
                var pName = p ? p.first_name : 'Unknown';

                // Show Popup
                window.showRevealPopup(pName, item.card_type, item.text, p.photo_url);
            }
        });
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
            case 'intro': window.renderIntro(wrapper, state, res); break;
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

        /* --- Bot Check moved to Server Tick ---
        if (window.BunkerBot && res.is_host) {
            window.BunkerBot.check(state, res.players, true);
        }
        */
    }
};

// Auto-Load Bot Script
(function () {
    if (!document.getElementById('bunker-bot-script')) {
        var s = document.createElement('script');
        s.id = 'bunker-bot-script';
        s.src = '/js/games/bunker/bot.js'; // Removed ?v= to prevent redundant re-parsing
        document.body.appendChild(s);
    }
})();

// --- TICK LOOP ---
// Hosts send tick to server to drive bot AI
if (window.bunkerTickInterval) {
    clearInterval(window.bunkerTickInterval);
}

window.bunkerTickInterval = setInterval(function () {
    if (window.isHost) {
        var fd = new FormData();
        fd.append('action', 'game_action');
        fd.append('type', 'tick');
        fd.append('token', localStorage.getItem('pg_token'));

        fetch('server/api.php', {
            method: 'POST',
            body: fd
        });
    }
}, 2000);

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

window.renderIntro = function (wrapper, state, res) {
    var catastrophe = state.catastrophe;
    wrapper.innerHTML = `
        <div class="bunker-main-layout d-flex flex-column align-items-center justify-content-center px-4 text-center animate__animated animate__fadeIn" style="height: 100vh; overflow-y: auto;">
             <div style="flex: 1; display: flex; flex-direction: column; justify-content: center; align-items: center; width: 100%; max-width: 500px;">
                <h1 class="display-1 mb-4">🌋</h1>
                <h2 class="fw-bold mb-3 text-white text-shadow">Внимание! Катастрофа!</h2>
                
                <div class="card border-0 shadow-lg p-4 mb-4 rounded-4 w-100" style="background: rgba(255,255,255,0.7); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);">
                    <h4 class="fw-bold mb-3 text-dark">${catastrophe.title}</h4>
                    <p class="lead text-dark" style="font-size: 16px; line-height: 1.6;">
                        ${catastrophe.intro_text}
                    </p>
                    <hr class="border-secondary">
                     <p class="small text-muted mb-0">
                        Выживут только <b>${state.bunker_places}</b> из <b>${res.players.length}</b>.
                        <br>В бункере есть еда на 2 года.
                     </p>
                </div>

                ${res.is_host ? `
                    <button class="btn btn-light text-primary fw-bold btn-lg w-100 rounded-pill shadow-lg pulse-btn" 
                        style="padding: 18px; font-size: 20px;" 
                        onclick="window.finishIntro()">
                        НАЧАТЬ ВЫЖИВАНИЕ <i class="bi bi-arrow-right-circle-fill ms-2"></i>
                    </button>
                ` : `
                    <div class="alert alert-warning w-100 rounded-pill shadow-sm" style="background: rgba(255,255,255,0.9); border:none;">
                        <i class="bi bi-hourglass-split me-2"></i> Ожидание решения лидера...
                    </div>
                `}

                <button class="btn btn-link text-white opacity-75 mt-4 text-decoration-none" onclick="window.bunkerFinish(event)">
                    <i class="bi bi-door-open me-1"></i> Выйти в лобби
                </button>
             </div>
        </div>
    `;
};

window.finishIntro = function () {
    window.sendGameAction('finish_intro', {});
};

window.startBunkerGame = function () {
    // Collect settings...
    window.sendGameAction('init_bunker', { mode: 'normal' }); // Actually this is called via startGame? No, init_bunker handled in handleGameAction
    // Wait, action_start_game just sets state? No, action_start_game in game.php calls getInitialState
    // which calls init_bunker logic? No.
    // Bunker structure:
    // 1. Lobby -> Call 'start_game' API -> game.php calls startGame -> sets state.
    // 2. Bunker.php getInitialState just returns basic structure.
    // 3. Client sees basic structure and renders Setup Screen (renderSetupScreen).
    // 4. Host clicks "Start" -> calls init_bunker (handleGameAction) -> Generates cards -> sets phase='intro'.
    // 5. Client sees Intro (renderIntro).
    // 6. Host clicks "Begin" -> calls finish_intro -> sets phase='round'.

    // So window.startBunkerGame should call 'init_bunker'.
    window.sendGameAction('init_bunker', {});
};

// Safe finish/leave function
window.bunkerFinish = function (e) {
    if (e) e.preventDefault();
    // Use App's global backToLobby handler which works for both Host (Stop Game) and Player (Leave)
    if (window.backToLobby) {
        window.backToLobby();
    } else {
        // Fallback if app.js not fully loaded
        if (confirm('Выйти?')) location.reload();
    }
};
