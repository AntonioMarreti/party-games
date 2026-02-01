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
        s.src = 'js/games/bunker/bot.js'; // Removed ?v= to prevent redundant re-parsing
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

// --- HELPERS ---

window.getCatastropheImage = function (title) {
    if (!title) return null;
    // Нормализация: убираем лишние пробелы, приводим к нижнему регистру и заменяем любые тире на пробелы
    const normalize = (s) => s.trim().toLowerCase().replace(/[\-\–\—\−]/g, ' ').replace(/\s+/g, ' ');
    const t = normalize(title);
    const images = {
        'ядерная война': 'bunker_nuclear_war_v2_top_focus_1769855915699.png',
        'мутанты': 'bunker_mutant_apocalypse_v2_top_focusfixed_1769856196734.png',
        'динозавры': 'bunker_dinosaur_invasion_v2_top_focus_1769856066210.png',
        'зомби апокалипсис': 'bunker_zombie_horde_v2_top_focus_1769855946821.png',
        'всемирный потоп': 'bunker_world_flood_v3_top_focus_1769855964132.png',
        'искусственный интеллект': 'bunker_ai_rebellion_v2_top_focus_1769855980574.png',
        'метеорит': 'bunker_meteorite_impact_v2_top_focus_1769856080376.png',
        'извержение вулкана': 'bunker_volcano_eruption_v2_top_focus_1769855930446.png'
    };
    const filename = images[t];
    if (filename) return `img/games/bunker/${filename}?v=5`;
    return null;
};

window.playCatastropheIntroSound = function (title) {
    if (!title) return;
    const normalize = (s) => s.trim().toLowerCase().replace(/[\-\–\—\−]/g, ' ').replace(/\s+/g, ' ');
    const t = normalize(title);

    // Map catastrophe to sound type
    const map = {
        'ядерная война': 'alert',
        'мутанты': 'glitch',
        'зомби апокалипсис': 'scratch',
        'искусственный интеллект': 'glitch',
        'метеорит': 'alert',
        'извержение вулкана': 'alert',
        'всемирный потоп': 'ambient_glass'
    };

    const soundKey = map[t] || 'notification';

    // NEW: Sync with others if we are the initiator (passed as 2nd arg)
    if (arguments[1] === true && window.sendSyncEvent) {
        const delay = 4000; // Increased to 4 seconds for better polling reliability
        // playAt = absolute server time
        const playAt = Date.now() + (window.serverTimeOffset || 0) + delay;

        window.sendSyncEvent('audio_ping', { sound: soundKey, playAt: playAt });

        // Local scheduling for the initiator too
        setTimeout(() => {
            if (window.audioManager) window.audioManager.play(soundKey);
        }, delay);
    } else if (!arguments[1]) {
        // If not initiator (just local test or old call), play immediately
        if (window.audioManager) window.audioManager.play(soundKey);
    }

    // Visual feedback on the button? (Pulse)
    const icon = document.querySelector('.bunker-intro-audio-icon');
    if (icon) {
        icon.classList.remove('animate__pulse');
        void icon.offsetWidth; // trigger reflow
        icon.classList.add('animate__pulse');
    }
};

window.preloadCatastropheSound = function (title) {
    if (!title || !window.audioManager) return;
    const normalize = (s) => s.trim().toLowerCase().replace(/[\-\–\—\−]/g, ' ').replace(/\s+/g, ' ');
    const t = normalize(title);
    const map = {
        'ядерная война': 'alert', 'мутанты': 'glitch', 'зомби апокалипсис': 'scratch',
        'искусственный интеллект': 'glitch', 'метеорит': 'alert',
        'извержение вулкана': 'alert', 'всемирный потоп': 'ambient_glass'
    };
    const key = map[t] || 'notification';
    const sound = window.audioManager.sounds[key];
    if (sound && sound.readyState < 2) { // 2 = HAVE_CURRENT_DATA
        console.log(`[Audio] Pre-warming ${key} for catastrophe: ${title}`);
        sound.load();
    }
};

window.bunkerIntroCollapsed = false;
window.toggleBunkerIntro = function () {
    window.bunkerIntroCollapsed = !window.bunkerIntroCollapsed;
    const card = document.querySelector('.bunker-intro-info-block');
    const icon = document.querySelector('.bunker-intro-toggle-icon');
    if (card && icon) {
        if (window.bunkerIntroCollapsed) {
            card.classList.add('collapsed');
            icon.classList.replace('bi-chevron-compact-down', 'bi-chevron-compact-up');
        } else {
            card.classList.remove('collapsed');
            icon.classList.replace('bi-chevron-compact-up', 'bi-chevron-compact-down');
        }
    }
};

window.renderSetupScreen = function (wrapper, state, res) {
    if (res.is_host == 1) {
        wrapper.innerHTML = `
            <div class="bunker-main-layout d-flex flex-column align-items-center justify-content-end px-4 pb-5 animate__animated animate__fadeIn" style="height: 100vh; position: relative;">
                <div class="bunker-intro-gradient"></div>
                
                <div style="z-index: 10; width: 100%; max-width: 400px;" class="animate__animated animate__fadeInUp">
                    <h1 class="display-4 text-white-shadow mb-2">☢️</h1>
                    <h2 class="fw-bold mb-4 text-white-shadow" style="letter-spacing: 1px; text-transform: uppercase; font-size: 1.5rem;">Настройка Бункера</h2>
                    
                    <div class="card border-0 p-4 mb-4" 
                         style="background: rgba(255,255,255,0.08); backdrop-filter: blur(25px); -webkit-backdrop-filter: blur(25px); border: 1px solid rgba(255,255,255,0.1) !important; border-radius: 32px;">
                        
                        <div class="form-check form-switch mb-4 d-flex justify-content-between align-items-center px-0">
                            <label class="form-check-label fw-bold text-white opacity-90" for="modeHardcore" style="font-size: 1.1rem;">☠️ Хардкор (Beta)</label>
                            <input class="form-check-input" type="checkbox" id="modeHardcore" style="width: 3.5em; height: 1.8em; cursor: pointer;">
                        </div>
                        
                        <button class="btn-glass-primary w-100 rounded-pill py-3" onclick="window.startBunkerGame()">
                            <span style="font-size: 1.2rem;">🚀 Начать выживание</span>
                        </button>
                    </div>

                    <button class="btn btn-link text-white opacity-50 text-decoration-none small mb-4" onclick="window.bunkerFinish(event)">
                        <i class="bi bi-arrow-left me-1"></i> Вернуться в лобби
                    </button>
                </div>
            </div>
        `;
    } else {
        wrapper.innerHTML = `
            <div class="bunker-main-layout d-flex flex-column align-items-center justify-content-center text-center px-4" style="height: 100vh;">
                <div class="bunker-intro-gradient"></div>
                <div style="z-index: 10;">
                    <div class="spinner-border text-white mb-4" style="width: 3rem; height: 3rem; opacity: 0.5;"></div>
                    <h2 class="fw-bold text-white text-white-shadow mb-2">Ожидание...</h2>
                    <p class="text-white opacity-70 mb-5">Хост настраивает параметры Бункера</p>
                    <button class="btn btn-glass-secondary rounded-pill px-5 py-2" onclick="window.bunkerFinish(event)">Покинуть</button>
                </div>
            </div>`;
    }
};

window.renderIntro = function (wrapper, state, res) {
    var catastrophe = state.catastrophe;
    var bgImg = window.getCatastropheImage(catastrophe.title);

    // Warm up the sound immediately
    window.preloadCatastropheSound(catastrophe.title);

    wrapper.innerHTML = `
        <div class="bunker-main-layout d-flex flex-column align-items-center justify-content-end px-4 text-center animate__animated animate__fadeIn" style="height: 100vh; overflow: hidden; position: relative; padding-bottom: calc(40px + env(safe-area-inset-bottom));">
             ${bgImg ? `
                <div class="bunker-intro-overlay" style="background-image: url('${bgImg}')"></div>
                <div class="bunker-intro-gradient"></div>
             ` : `
                <div class="bunker-intro-gradient" style="background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);"></div>
             `}

             <div style="z-index: 10; width: 100%; max-width: 450px;" class="animate__animated animate__fadeInUp">
                <div class="cursor-pointer mb-2 d-flex align-items-center justify-content-center p-2">
                    ${res.is_host == 1 ? `
                    <div class="me-3 p-2" onclick="window.playCatastropheIntroSound('${catastrophe.title.replace(/'/g, "\\'")}', true)">
                        <i class="bi bi-volume-up-fill text-white-shadow animate__animated bunker-intro-audio-icon" style="font-size: 1.5rem; opacity: 0.8;"></i>
                    </div>
                    ` : ''}
                    
                    <div onclick="window.toggleBunkerIntro()" class="d-flex align-items-center">
                        <h2 class="fw-bold mb-0 d-inline-block text-white-shadow" style="font-size: 1.5rem; letter-spacing: 3px; text-transform: uppercase; opacity: 0.9;">КАТАСТРОФА</h2>
                        <i class="bi ${window.bunkerIntroCollapsed ? 'bi-chevron-compact-up' : 'bi-chevron-compact-down'} text-white-shadow ms-1 bunker-intro-toggle-icon" style="font-size: 1.5rem; vertical-align: middle;"></i>
                    </div>
                </div>
                
                <div class="bunker-intro-info-block ${window.bunkerIntroCollapsed ? 'collapsed' : ''}">
                    <div class="card border-0 shadow-lg p-3 mb-3 rounded-4 w-100" 
                         style="background: rgba(255,255,255,0.08); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); border: 1px solid rgba(255,255,255,0.1) !important;">
                        
                        <h3 class="fw-bold mb-2 text-white" style="font-size: 1.3rem;">${catastrophe.title}</h3>
                        
                        <p class="text-white opacity-80 mb-3" style="font-size: 14px; line-height: 1.4; font-weight: 300;">
                            ${catastrophe.intro_text}
                        </p>

                        <div class="d-flex justify-content-around align-items-center rounded-pill py-2 px-3" style="background: rgba(255,255,255,0.05);">
                            <div class="small text-white opacity-70" style="font-size: 12px;"><i class="bi bi-people-fill me-1"></i> <b>${state.bunker_places}</b>/<b>${res.players.length}</b> мест</div>
                            <div class="small text-white opacity-70" style="font-size: 12px;"><i class="bi bi-clock-history me-1"></i> <b>${catastrophe.duration || '2 года'}</b></div>
                        </div>
                    </div>
                </div>

                <div class="bunker-intro-actions">
                    ${res.is_host ? `
                        <button class="btn btn-glass-primary fw-bold btn-lg w-100 rounded-pill shadow-lg pulse-btn py-3 mb-2" 
                            onclick="window.finishIntro()">
                            НАЧАТЬ ВЫЖИВАНИЕ <i class="bi bi-arrow-right-circle-fill ms-2"></i>
                        </button>
                    ` : `
                        <div class="btn-glass-secondary w-100 rounded-pill py-3 mb-2 fw-bold disabled" style="cursor: default; font-size: 14px;">
                            <i class="bi bi-hourglass-split me-2"></i> ОЖИДАЕМ ЛИДЕРА...
                        </div>
                    `}

                    <button class="btn btn-link text-white opacity-40 text-decoration-none x-small" style="font-size: 12px;" onclick="window.bunkerFinish(event)">
                        <i class="bi bi-box-arrow-left me-1"></i> Покинуть игру
                    </button>
                </div>
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
