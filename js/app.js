// === ГЛОБАЛЬНЫЙ ПЕРЕХВАТЧИК ОШИБОК ===
document.addEventListener('click', (e) => {
    if (window.audioManager && !window.audioManager.unlocked) {
        window.audioManager.unlock();
    }
    if (window.audioManager && (e.target.closest('button') || e.target.closest('a') || e.target.closest('.btn') || e.target.closest('.clickable'))) {
        window.audioManager.play('click');
    }
}, { once: false });

window.onerror = function (msg, url, line, col, error) {
    return false;
};

// === CONFIGURATION ===
var loadedGames = {};
const APP_REPO = 'AntonioMarreti/party-games';

function getAppVersionFromDOM() {
    try {
        const scripts = document.getElementsByTagName('script');
        for (let i = 0; i < scripts.length; i++) {
            const src = scripts[i].getAttribute('src');
            if (src && src.includes('js/app.js?v=')) {
                return src.split('v=')[1];
            }
        }
    } catch (e) {
        console.warn("Could not extract version from DOM:", e);
    }
    return 'Unknown';
}
const APP_VERSION_LOCAL = getAppVersionFromDOM();

function calculateLevel(xp) {
    if (!xp || xp < 0) return 1;
    return Math.floor(Math.sqrt(xp / 100)) + 1;
}

let isCheckingState = false;

function openSettingsScreen() {
    if (window.ThemeManager) window.ThemeManager.loadSettings();
    showScreen('settings');
    triggerHaptic('impact', 'medium');
}

function closeSettingsScreen() {
    showScreen('lobby');
    switchTab('profile');
    triggerHaptic('impact', 'light');
}

// === INITIALIZATION ===
document.addEventListener('DOMContentLoaded', () => {
    const AVAILABLE_GAMES = window.AVAILABLE_GAMES;
    if (AVAILABLE_GAMES && AVAILABLE_GAMES.length > 0) {
        window.selectedGameId = AVAILABLE_GAMES[0].id;
    }

    if (window.ThemeManager && window.ThemeManager.loadSettings) window.ThemeManager.loadSettings();
    if (window.UIManager && window.UIManager.setupModalClosing) window.UIManager.setupModalClosing();

    let tg;
    try {
        tg = window.Telegram.WebApp;
        tg.expand();
        if (tg.requestFullscreen && tg.isVersionAtLeast && tg.isVersionAtLeast('8.0')) {
            tg.requestFullscreen();
        }
        if (tg.isVerticalSwipesEnabled !== undefined) tg.isVerticalSwipesEnabled = false;
        if (tg.setBackgroundColor) tg.setBackgroundColor('#F4F5F9');
        if (tg.enableClosingConfirmation) tg.enableClosingConfirmation();
        if (tg.ready) tg.ready();
    } catch (e) {
        console.warn("Telegram WebApp not found");
    }

    fetchAppVersion();

    const hash = window.location.hash;
    if (hash.includes('auth_token=')) {
        const token = hash.split('auth_token=')[1].trim();
        if (window.AuthManager) window.AuthManager.setAuthToken(token);
        else localStorage.setItem('pg_token', token);
        window.history.replaceState(null, null, window.location.pathname);
    }

    safeStyle('login-loading', 'display', 'none');

    const savedColor = localStorage.getItem('pgb_accent_color');
    if (savedColor && window.ThemeManager) {
        window.ThemeManager.applyAccentColor(savedColor);
    }

    const currentToken = window.AuthManager ? window.AuthManager.getAuthToken() : localStorage.getItem('pg_token');
    if (currentToken) {
        if (window.AuthManager) window.AuthManager.initApp(tg);
    } else if (tg && tg.initData) {
        if (window.AuthManager) window.AuthManager.loginTMA(tg);
    } else {
        showScreen('login');
        safeStyle('browser-login-btn', 'display', 'block');
    }

    const logoutGroup = document.getElementById('logout-menu-item-group');
    if (logoutGroup) {
        const isTMA = window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData && window.Telegram.WebApp.initData.length > 0;
        logoutGroup.style.display = isTMA ? 'none' : 'block';
    }
});

// === STATE MANAGEMENT ===
window.checkState = async function () {
    const isLeaving = window.RoomManager ? window.RoomManager.getIsLeavingProcess() : false;
    if (isLeaving || isCheckingState) return;
    isCheckingState = true;

    try {
        const res = await apiRequest({ action: 'get_state' });

        if (window.RoomManager && window.RoomManager.getIsLeavingProcess()) return;

        if (res.status === 'auth_error') {
            localStorage.removeItem('pg_token');
            showScreen('login');
            safeStyle('browser-login-btn', 'display', 'block');
            return res;
        }

        if (res.players) window.currentGamePlayers = res.players;
        if (res.events && res.events.length > 0) handleReactions(res.events);

        if (res.user) {
            if (window.SocialManager && window.SocialManager.renderCurrentUser) {
                window.SocialManager.renderCurrentUser(res.user);
            } else if (window.updateUserInfo) {
                window.updateUserInfo(res.user);
            }
        }

        if (res.status === 'in_room') {
            if (window.RoomManager) window.RoomManager.startPolling();

            window.currentRoomCode = res.room.room_code;
            window.currentRoomId = res.room.id;
            window.isHost = (res.is_host == 1);

            const isMenuScreen = ['settings', 'profile-edit', 'game-detail', 'friends', 'leaderboard'].includes(window.location.hash.substring(1));
            const gameType = res.room.game_type; // Fix: Define gameType properly

            if (gameType === 'lobby') {
                if (!isScreenActive('room') && !isMenuScreen) showScreen('room');
                if (window.renderLobby) renderLobby(res);
            } else {
                if (window.GameManager && window.GameManager.loadGameScript) {
                    try {
                        if (!window[`render_${gameType}`]) {
                            const gameArea = document.getElementById('game-area');
                            if (gameArea && !gameArea.querySelector('.spinner-border')) {
                                gameArea.innerHTML = `<div class="d-flex flex-column align-items-center justify-content-center h-100" style="padding-top: 30vh;"><div class="spinner-border text-primary mb-3"></div><div class="text-muted">Загрузка модуля игры...</div></div>`;
                            }
                        }
                        await window.GameManager.loadGameScript(gameType);
                    } catch (err) {
                        console.error("Failed to load game script:", err);
                    }
                }

                let attempts = 0;
                while (!window[`render_${gameType}`] && attempts < 20) {
                    await new Promise(r => setTimeout(r, 100));
                    attempts++;
                }

                const renderFunc = window[`render_${gameType}`];
                if (typeof renderFunc === 'function') {
                    if (!isScreenActive('game') && !isMenuScreen) showScreen('game');
                    try {
                        renderFunc(res);
                    } catch (e) {
                        console.error('Game Render Error:', e);
                        const gameArea = document.getElementById('game-area');
                        if (gameArea) gameArea.innerHTML = `<div class="p-5 text-center"><h3 class="mb-3 text-danger">Ошибка отображения</h3><p class="text-muted mb-4">${e.message}</p><button class="btn btn-outline-danger" onclick="leaveRoom()">Выйти</button></div>`;
                    }
                }
            }

            const notifsCount = res.notifications ? res.notifications.length : 0;
            if (window.updateNotificationBadge) updateNotificationBadge(notifsCount);
        } else {
            if (window.RoomManager) window.RoomManager.stopPolling();
            window.currentRoomCode = null;
            window.isHost = false;

            // Fix: Respect hash if present, otherwise fallback to lobby
            const hash = window.location.hash.substring(1);
            const isGarbage = hash.includes('tgWebAppData=') || hash.includes('tgWebAppVersion=');

            if (hash && !isGarbage && hash !== 'splash' && hash !== 'login') {
                if (window.handleRouting) window.handleRouting();
                else showScreen(hash);
            } else {
                showScreen('lobby');
            }

            if (window.renderPopularGames) {
                window.renderPopularGames();
            } else {
                setTimeout(() => { if (window.renderPopularGames) window.renderPopularGames(); }, 100);
            }
        }
        return res;
    } finally {
        isCheckingState = false;
    }
}

// === UI & NAVIGATION ===
function switchTab(tabId) {
    if (window.UIManager) window.UIManager.switchTab(tabId);

    if (tabId === 'leaderboard') {
        if (typeof loadLeaderboardList === 'function') loadLeaderboardList('global');
    } else if (tabId === 'games') {
        if (window.renderLibrary) window.renderLibrary();
    }

    const savedColor = localStorage.getItem('pgb_accent_color');
    if (savedColor && window.ThemeManager) window.ThemeManager.applyAccentColor(savedColor);
}

window.switchTab = switchTab;

function isScreenActive(id) {
    const el = document.getElementById('screen-' + id);
    return el && el.classList.contains('active-screen');
}

function showScreen(id) {
    if (window.UIManager) window.UIManager.showScreen(id);

    const splash = document.getElementById('screen-splash');
    if (splash) {
        splash.classList.remove('active-screen');
        splash.style.setProperty('display', 'none', 'important');
    }

    if (id === 'game') {
        if (typeof renderReactionToolbar === 'function') renderReactionToolbar();
    } else {
        if (typeof hideReactionToolbar === 'function') hideReactionToolbar();
    }

    if (id === 'settings' && window.syncColorButtonSelection) syncColorButtonSelection();

    const showcase = document.getElementById('screen-game-detail');
    if (id === 'game-detail' && showcase && !showcase.dataset.swipeBound) {
        let touchStartX = 0;
        showcase.addEventListener('touchstart', e => { touchStartX = e.changedTouches[0].screenX; }, { passive: true });
        showcase.addEventListener('touchend', e => {
            const touchEndX = e.changedTouches[0].screenX;
            if (touchStartX < window.innerWidth * 0.2 && touchEndX - touchStartX > 100) window.showScreen('lobby');
        }, { passive: true });
        showcase.dataset.swipeBound = "true";
    }
}

async function fetchAppVersion() {
    const el = document.getElementById('app-version-display');
    if (!el) return;

    try {
        const response = await fetch(`https://api.github.com/repos/${APP_REPO}/commits/main`);
        if (!response.ok) throw new Error('GitHub API Error');
        const data = await response.json();
        const shortSha = data.sha.substring(0, 7);
        const date = new Date(data.commit.author.date).toLocaleDateString();
        el.innerHTML = `v${APP_VERSION_LOCAL} <span class="opacity-50">•</span> ${shortSha} <span class="opacity-50">(${date})</span>`;
    } catch (e) {
        el.innerText = `v${APP_VERSION_LOCAL}`;
    }
}

async function loadGameScripts(files) {
    for (const file of files) {
        await new Promise((resolve, reject) => {
            const cleanPath = file.split('?')[0];
            if (file.endsWith('.css')) {
                const oldLink = document.querySelector(`link[href^="${cleanPath}"]`);
                if (oldLink && !file.includes('?')) return resolve();
                if (oldLink) oldLink.remove();
                const link = document.createElement('link');
                link.rel = 'stylesheet';
                link.href = `${file}${file.includes('?') ? '' : '?v=' + new Date().getTime()}`;
                link.onload = resolve;
                link.onerror = reject;
                document.head.appendChild(link);
            } else {
                const oldScript = document.querySelector(`script[src^="${cleanPath}"]`);
                if (oldScript && !file.includes('?')) return resolve();
                if (oldScript) oldScript.remove();
                const script = document.createElement('script');
                script.src = `${file}${file.includes('?') ? '' : '?v=' + new Date().getTime()}`;
                script.onload = resolve;
                script.onerror = reject;
                document.head.appendChild(script);
            }
        });
    }
}

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
        if (window.RoomManager) window.RoomManager.stopPolling();
    } else if (window.currentRoomCode && window.RoomManager) {
        window.RoomManager.startPolling();
        checkState();
    }
});

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => { if (window.loadPublicRooms) loadPublicRooms(); }, 1000);
});

// === DEBUG TOOLS ===
window.debugInterval = null;
window.toggleDebugHUD = function () {
    let hud = document.getElementById('debug-hud');
    if (hud) {
        hud.remove();
        if (window.debugInterval) clearInterval(window.debugInterval);
        return;
    }

    hud = document.createElement('div');
    hud.id = 'debug-hud';
    hud.style.cssText = 'position:fixed;top:0;left:0;background:rgba(0,0,0,0.8);color:#0f0;font-family:monospace;font-size:10px;padding:4px;z-index:99999;pointer-events:none;width:100px;';
    document.body.appendChild(hud);

    let frames = 0, lastTime = performance.now();
    function loop() {
        if (!document.getElementById('debug-hud')) return;
        frames++;
        const now = performance.now();
        if (now - lastTime >= 1000) {
            updateHUD(frames);
            frames = 0;
            lastTime = now;
        }
        requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);

    function updateHUD(currentFps) {
        const mem = window.performance && window.performance.memory ? Math.round(window.performance.memory.usedJSHeapSize / 1024 / 1024) : 'N/A';
        hud.innerHTML = `FPS: <span style="color:${currentFps < 30 ? 'red' : '#0f0'}">${currentFps}</span><br>DOM: ${document.getElementsByTagName('*').length}<br>MEM: ${mem} MB<br>Tick: ${window.bunkerTickInterval ? 'ON' : 'OFF'}<br>${window.innerWidth}x${window.innerHeight}`;
    }
};
window.startDebug = window.toggleDebugHUD;

window.tryGameNow = async function (gameId) {
    window.selectedGameId = gameId;
    const passInput = document.getElementById('create-room-pass');
    if (passInput) passInput.value = '';
    if (window.triggerHaptic) triggerHaptic('impact', 'medium');
    if (window.createRoom) await createRoom();
};
