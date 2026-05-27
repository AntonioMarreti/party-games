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
    if (!window.logClientError) return false;

    const activeScreen = document.querySelector('.screen.active-screen')?.id || null;
    const hash = window.location.hash || '';
    const message = error?.message || msg || 'Unknown JS Error';
    const stack = error?.stack || `${url || 'unknown'}:${line || 0}:${col || 0}`;

    window.logClientError('Global JS Error', stack, {
        message: String(message),
        href: window.location.href,
        hash,
        current_screen: activeScreen,
        user_agent: navigator.userAgent,
        room_code: window.currentRoomCode || null,
        room_id: window.currentRoomId || null,
        action: window.__lastApiAction || window.__lastUiAction || null,
        source_url: url || null,
        line: line || null,
        column: col || null
    });
    return false;
};

window.addEventListener('unhandledrejection', (event) => {
    if (!window.logClientError) return;

    const reason = event?.reason;
    const activeScreen = document.querySelector('.screen.active-screen')?.id || null;
    const hash = window.location.hash || '';
    const message = reason?.message || String(reason || 'Unknown promise rejection');
    const stack = reason?.stack || message;

    window.logClientError('Unhandled Promise Rejection', stack, {
        message,
        href: window.location.href,
        hash,
        current_screen: activeScreen,
        user_agent: navigator.userAgent,
        room_code: window.currentRoomCode || null,
        room_id: window.currentRoomId || null,
        action: window.__lastApiAction || window.__lastUiAction || null
    });
});

// === CONFIGURATION ===
let loadedGames = {};
const APP_REPO = 'AntonioMarreti/party-games';
window.pendingScheduledGameDeepLinkId = window.pendingScheduledGameDeepLinkId || null;
window.pendingScheduledGameDeepLinkHandled = window.pendingScheduledGameDeepLinkHandled || false;

function extractStartAppParam(tg) {
    const telegramParam = tg?.initDataUnsafe?.start_param;
    if (telegramParam) return String(telegramParam);

    if (window.AuthManager?.getTelegramUrlStartParam) {
        const urlStartParam = window.AuthManager.getTelegramUrlStartParam(window.AuthManager.getTelegramInitDataFallback?.() || '');
        if (urlStartParam) return String(urlStartParam);
    }

    try {
        const url = new URL(window.location.href);
        const queryParam = url.searchParams.get('startapp') || url.searchParams.get('start_param');
        if (queryParam) return queryParam;
    } catch (e) {
        // noop
    }

    return '';
}

function parseScheduledDeepLinkId(rawParam) {
    const match = String(rawParam || '').match(/^scheduled_(\d+)$/);
    return match ? Number(match[1]) : 0;
}

function applyTelegramPlatformClass(tg) {
    const platform = String(tg?.platform || 'browser').toLowerCase().replace(/[^a-z0-9_-]/g, '') || 'browser';
    document.body.classList.forEach(className => {
        if (className.startsWith('tg-platform-')) {
            document.body.classList.remove(className);
        }
    });
    document.body.classList.add(`tg-platform-${platform}`);
    document.documentElement.dataset.telegramPlatform = platform;
}

function waitForTelegramWebApp(timeoutMs = 1500) {
    if (window.Telegram?.WebApp) {
        return Promise.resolve(window.Telegram.WebApp);
    }

    return new Promise(resolve => {
        const started = Date.now();
        const timer = setInterval(() => {
            if (window.Telegram?.WebApp) {
                clearInterval(timer);
                resolve(window.Telegram.WebApp);
                return;
            }
            if (Date.now() - started >= timeoutMs) {
                clearInterval(timer);
                if (typeof window.logAuthClientEvent === 'function') {
                    window.logAuthClientEvent('telegram_webapp_timeout_continue');
                }
                resolve(null);
            }
        }, 100);
    });
}

function updateTelegramViewportVars(tg) {
    const platform = String(tg?.platform || '').toLowerCase();
    if (platform !== 'android' || !window.visualViewport?.height) {
        return;
    }

    const applyHeight = () => {
        const height = Math.round(window.visualViewport.height);
        if (height > 0) {
            document.documentElement.style.setProperty('--app-viewport-height', `${height}px`);
        }
    };

    applyHeight();
    window.visualViewport.addEventListener('resize', applyHeight);
    window.visualViewport.addEventListener('scroll', applyHeight);
}

function routePendingScheduledDeepLink() {
    const scheduledGameId = Number(window.pendingScheduledGameDeepLinkId || 0);
    if (!scheduledGameId) return;

    window.pendingScheduledGameDeepLinkHandled = true;

    if (typeof window.switchTab === 'function') {
        window.switchTab('games');
    }
    if (typeof window.switchRoomsMode === 'function') {
        window.switchRoomsMode('scheduled');
    } else if (typeof window.loadScheduledGames === 'function') {
        window.loadScheduledGames();
    }
}

window.routePendingScheduledDeepLink = routePendingScheduledDeepLink;

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

function renderGameModuleLoadError(res, gameType, reason, details = '') {
    const gameArea = document.getElementById('game-area');
    if (!gameArea) return;

    window.__lastGameModuleLoadFailure = {
        res,
        gameType,
        reason,
        details
    };

    if (window.logClientError) {
        window.logClientError(
            'Game Module Load Failure',
            details || reason,
            {
                game_type: gameType,
                reason,
                room_status: res?.room?.status || null,
                room_id: res?.room?.id || null,
                room_code: res?.room?.room_code || null
            }
        );
    }

    gameArea.innerHTML = `
        <div class="p-4 d-flex flex-column align-items-center justify-content-center text-center h-100" style="padding-top: 24vh;">
            <div class="mb-3 text-danger opacity-75"><i class="bi bi-exclamation-octagon" style="font-size: 46px;"></i></div>
            <h3 class="mb-2" style="color: var(--text-main);">Не удалось загрузить игру</h3>
            <p class="text-muted mb-4" style="max-width: 320px;">Попробуйте обновить приложение или вернуться в комнату.</p>
            <div class="d-flex flex-wrap justify-content-center gap-2">
                <button type="button" class="btn btn-primary rounded-pill px-4" onclick="retryGameModuleLoad()">Повторить</button>
                <button type="button" class="btn btn-outline-secondary rounded-pill px-4" onclick="returnToRoomFromGameError()">Вернуться в комнату</button>
            </div>
        </div>
    `;
}

window.retryGameModuleLoad = async function () {
    if (typeof window.checkState === 'function') {
        await window.checkState();
    }
};

window.returnToRoomFromGameError = async function () {
    const failure = window.__lastGameModuleLoadFailure || {};
    const res = failure.res;

    if (window.showScreen) {
        window.showScreen('room');
    }

    if (res?.room && typeof window.renderLobby === 'function') {
        window.renderLobby(res);
        return;
    }

    if (typeof window.leaveRoom === 'function') {
        await window.leaveRoom();
    }
};

function openSettingsScreen() {
    if (window.ThemeManager) window.ThemeManager.loadSettings();
    showScreen('settings');
    if (window.ScrollQA && typeof window.ScrollQA.refreshAccess === 'function') {
        window.ScrollQA.refreshAccess();
    }
    triggerHaptic('impact', 'medium');
}

function closeSettingsScreen() {
    showScreen('lobby');
    switchTab('profile');
    triggerHaptic('impact', 'light');
}

// === INITIALIZATION ===
document.addEventListener('DOMContentLoaded', async () => {
    // Splash Screen Failsafe: starts after DOMContentLoaded, so give slow networks time
    // to finish parsing before forcing a fallback screen.
    const splashTimeout = setTimeout(() => {
        const splash = document.getElementById('screen-splash');
        if (splash && splash.classList.contains('active-screen')) {
            console.warn("[App] Splash timeout reached. Forcing login screen.");
            if (window.logClientError) {
                const diag = {
                    tg_init: !!(window.Telegram && window.Telegram.WebApp),
                    tg_data_len: window.Telegram?.WebApp?.initData?.length || 0,
                    scripts: Array.from(document.scripts).map(s => s.src || 'inline').filter(s => s.includes('telegram') || s.includes('api-manager') || s.includes('auth-manager'))
                };
                window.logClientError("Splash Timeout (20s)", "App failed to load initial state within 20 seconds after DOMContentLoaded.", diag);
            }
            if (window.showScreen) window.showScreen('login');
            if (window.showAlert) window.showAlert("Медленное соединение", "Приложение загружается дольше обычного. Попробуйте войти вручную.", "warning");
        }
    }, 20000);

    const AVAILABLE_GAMES = window.AVAILABLE_GAMES;
    if (AVAILABLE_GAMES && AVAILABLE_GAMES.length > 0) {
        window.selectedGameId = AVAILABLE_GAMES[0].id;
    }

    if (window.ThemeManager && window.ThemeManager.loadSettings) window.ThemeManager.loadSettings();
    if (window.UIManager && window.UIManager.setupModalClosing) window.UIManager.setupModalClosing();

    let tg = await waitForTelegramWebApp(1500);
    if (!tg && typeof window.logAuthClientEvent === 'function') {
        window.logAuthClientEvent('auth_ui_ready_without_webapp');
    }
    try {
        if (!tg) throw new Error('Telegram WebApp unavailable');
        if (tg.expand) tg.expand();
        if (tg.requestFullscreen && tg.isVersionAtLeast && tg.isVersionAtLeast('8.0')) {
            tg.requestFullscreen();
        }

        // Swipe Behavior
        if (tg.swipeBehavior && tg.swipeBehavior.disableVertical) {
            tg.swipeBehavior.disableVertical();
        } else if (tg.isVerticalSwipesEnabled !== undefined) {
            tg.isVerticalSwipesEnabled = false;
        }

        if (tg.setBackgroundColor) tg.setBackgroundColor('#F4F5F9');
        if (tg.enableClosingConfirmation) tg.enableClosingConfirmation();
        if (tg.ready) tg.ready();
    } catch (e) {
        console.warn("Telegram WebApp not found");
        if (typeof window.logAuthClientEvent === 'function') {
            window.logAuthClientEvent('webapp_unavailable');
        }
    }
    applyTelegramPlatformClass(tg);
    updateTelegramViewportVars(tg);

    const startAppParam = extractStartAppParam(tg);
    const scheduledGameId = parseScheduledDeepLinkId(startAppParam);
    if (scheduledGameId > 0) {
        window.pendingScheduledGameDeepLinkId = scheduledGameId;
        window.pendingScheduledGameDeepLinkHandled = false;
    }

    fetchAppVersion();

    /* Main Application Logic
     */
    const hash = window.location.hash;
    if (hash.includes('auth_token=')) {
        const token = hash.split('auth_token=')[1].trim();
        if (window.AuthManager) window.AuthManager.setAuthToken(token);
        else if (window.StorageManager) await window.StorageManager.set('pg_token', token);
        else localStorage.setItem('pg_token', token);
        window.history.replaceState(null, null, window.location.pathname);
    }

    const logoutGroup = document.getElementById('logout-menu-item-group');
    safeStyle('login-loading', 'display', 'none');

    let savedColor;
    if (window.StorageManager) savedColor = await window.StorageManager.get('pgb_accent_color');
    else savedColor = localStorage.getItem('pgb_accent_color');

    if (savedColor && window.ThemeManager) {
        window.ThemeManager.applyAccentColor(savedColor);
    }

    // Load Token
    let currentToken;
    if (window.AuthManager && window.AuthManager.getAuthToken()) {
        currentToken = window.AuthManager.getAuthToken();
    } else {
        // Try StorageManager
        if (window.StorageManager) currentToken = await window.StorageManager.get('pg_token');
        else currentToken = localStorage.getItem('pg_token');
    }

    if (typeof currentToken === 'string') {
        currentToken = currentToken.trim();
    }

    // Sync back to AuthManager execution context if found
    if (currentToken && window.AuthManager && !window.AuthManager.getAuthToken()) {
        window.AuthManager.setAuthToken(currentToken);
    }

    const isMockWebApp = !!(tg?.__PGB_MOCK === true);
    if (isMockWebApp && typeof window.logAuthClientEvent === 'function') {
        window.logAuthClientEvent('mock_webapp_detected_ignore_initdata');
        tg = null;
    }
    const hasTmaInitData = tg && typeof tg.initData === 'string' && tg.initData.trim().length > 0;
    const urlInitData = !hasTmaInitData && window.AuthManager?.getTelegramInitDataFallback
        ? window.AuthManager.getTelegramInitDataFallback()
        : '';
    const urlStartParam = urlInitData && window.AuthManager?.getTelegramUrlStartParam
        ? window.AuthManager.getTelegramUrlStartParam(urlInitData)
        : '';
    const urlPlatform = urlInitData && window.AuthManager?.getTelegramUrlPlatform
        ? window.AuthManager.getTelegramUrlPlatform()
        : 'unknown';
    const urlTg = urlInitData ? {
        initData: urlInitData,
        initDataUnsafe: urlStartParam ? { start_param: urlStartParam } : {},
        platform: urlPlatform,
        __PGB_URL_HASH_FALLBACK: true
    } : null;
    const authTg = hasTmaInitData ? tg : urlTg;
    const hasAuthInitData = !!(authTg && typeof authTg.initData === 'string' && authTg.initData.trim().length > 0);
    console.log('[Auth] token:', currentToken ? 'found' : 'missing', '| auth initData:', hasAuthInitData ? 'present' : 'empty');

    const loginStd = document.getElementById('login-methods-standard');
    const loginTma = document.getElementById('login-methods-tma');
    if (loginStd && loginTma) {
        if (hasAuthInitData) {
            loginStd.style.display = 'none';
            loginTma.style.display = 'block';
        } else {
            loginStd.style.display = 'block';
            loginTma.style.display = 'none';
        }
    }
    if (typeof updateDevLoginVisibility === 'function') updateDevLoginVisibility();
    if (!currentToken && typeof resumePendingBotAuth === 'function') resumePendingBotAuth();

    const hasRealWebApp = !!tg && tg.__PGB_MOCK !== true;
    if (!currentToken && !hasAuthInitData) {
        if (window.showScreen) window.showScreen('login');
        if (typeof showBotFallbackAvailable === 'function' && !hasRealWebApp) {
            showBotFallbackAvailable('auth_no_token_no_initdata_show_bot_fallback');
        }
    }

    if (currentToken) {
        if (typeof window.logAuthClientEvent === 'function' && !tg) {
            window.logAuthClientEvent('auth_restore_without_webapp');
        }
        if (window.AuthManager) await window.AuthManager.initApp(authTg || tg);
    } else if (hasAuthInitData) {
        if (window.AuthManager) await window.AuthManager.loginTMA(authTg, urlTg ? {
            source: 'url_hash',
            platform: urlPlatform
        } : {});
    } else {
        if (window.showScreen) window.showScreen('login');
    }

    if (logoutGroup) {
        const isTMA = window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData && window.Telegram.WebApp.initData.length > 0;
        logoutGroup.style.display = isTMA ? 'none' : 'block';
    }

    if (window.pendingScheduledGameDeepLinkId && !window.pendingScheduledGameDeepLinkHandled) {
        setTimeout(() => {
            routePendingScheduledDeepLink();
        }, 0);
    }

    // Success - Clear Splash Timeout
    clearTimeout(splashTimeout);
});

// === STATE MANAGEMENT ===
window.addEventListener('screenChanged', (e) => {
    const id = e.detail.screenId;
    if (id === 'screen-game') {
        if (typeof renderReactionToolbar === 'function') renderReactionToolbar();
    } else {
        if (typeof hideReactionToolbar === 'function') hideReactionToolbar();
    }

    if (id === 'screen-settings' && window.syncColorButtonSelection) syncColorButtonSelection();

    const showcase = document.getElementById('screen-game-detail');
    if (id === 'screen-game-detail' && showcase && !showcase.dataset.swipeBound) {
        let touchStartX = 0;
        showcase.addEventListener('touchstart', e => { touchStartX = e.changedTouches[0].screenX; }, { passive: true });
        showcase.addEventListener('touchend', e => {
            const touchEndX = e.changedTouches[0].screenX;
            if (touchStartX < window.innerWidth * 0.2 && touchEndX - touchStartX > 100) window.showScreen('lobby');
        }, { passive: true });
        showcase.dataset.swipeBound = "true";
    }

    const catalog = document.getElementById('screen-game-catalog');
    if (id === 'screen-game-catalog' && catalog && !catalog.dataset.swipeBound) {
        let touchStartX = 0;
        catalog.addEventListener('touchstart', e => { touchStartX = e.changedTouches[0].screenX; }, { passive: true });
        catalog.addEventListener('touchend', e => {
            const touchEndX = e.changedTouches[0].screenX;
            if (touchStartX < window.innerWidth * 0.2 && touchEndX - touchStartX > 100) window.showScreen('lobby');
        }, { passive: true });
        catalog.dataset.swipeBound = "true";
    }
});

window.addEventListener('tabChanged', (e) => {
    const tabId = e.detail.tabId;
    if (tabId === 'leaderboard') {
        if (typeof loadLeaderboardList === 'function') loadLeaderboardList('global');
    } else if (tabId === 'games') {
        if (window.renderLibrary) window.renderLibrary();
        const scheduledModeActive = document.querySelector('[data-rooms-mode="scheduled"]')?.classList.contains('active');
        if (scheduledModeActive && window.loadScheduledGames) {
            window.loadScheduledGames();
        } else if (window.loadPublicRooms) {
            window.loadPublicRooms();
        }
    }

    // Per user request, keep applying color to ensure header updates correctly.
    const savedColor = localStorage.getItem('pgb_accent_color');
    if (savedColor && window.ThemeManager) window.ThemeManager.applyAccentColor(savedColor);
});

window.checkState = async function (options = {}) {
    const isLeaving = window.RoomManager ? window.RoomManager.getIsLeavingProcess() : false;
    if (isLeaving || isCheckingState) return;
    isCheckingState = true;

    try {
        const res = await apiRequest({ action: 'get_state' }, { timeoutMs: options.timeoutMs, startup: options.startup });

        if (window.RoomManager && window.RoomManager.getIsLeavingProcess()) return;

        // Ignore API timeouts during polling to prevent kicking the user out of the game
        if (res.status === 'error' && (res.message === 'timeout' || res.is_timeout)) {
            return res;
        }

        if (res.status === 'auth_error') {
            localStorage.removeItem('pg_token');
            showScreen('login');
            return res;
        }

        if (res.players) window.currentGamePlayers = res.players;
        if (res.events && res.events.length > 0) handleReactions(res.events);

        // Handle Favorites
        if (res.favorites) window.userFavorites = res.favorites;
        else if (!window.userFavorites) window.userFavorites = []; // Default empty

        if (res.user) {
            if (window.SocialManager && window.SocialManager.renderCurrentUser) {
                window.SocialManager.renderCurrentUser(res.user);
            } else if (window.updateUserInfo) {
                window.updateUserInfo(res.user);
            }
        }

        if (res.new_achievements && res.new_achievements.length > 0) {
            if (typeof window.loadMyProfileStats === 'function') {
                window.loadMyProfileStats();
            }
        }

        if (res.status === 'in_room') {
            if (window.RoomManager) window.RoomManager.startPolling();

            window.currentRoomCode = res.room.room_code;
            window.currentRoomId = res.room.id;
            window.isHost = (res.is_host == 1);

            const isMenuScreen = ['settings', 'profile-edit', 'game-detail', 'friends', 'history'].includes(window.location.hash.substring(1));
            const gameType = res.room.game_type; // Fix: Define gameType properly
            const roomStatus = res.room.status;
            const hasGameState = res.room.game_state !== null
                && res.room.game_state !== undefined
                && String(res.room.game_state).trim() !== '';
            const shouldRenderGame = gameType
                && gameType !== 'lobby'
                && roomStatus !== 'waiting'
                && (roomStatus === 'playing' || hasGameState);
            if (gameType && gameType !== 'lobby') {
                window.selectedGameId = gameType;
            }
            if (gameType !== 'blokus' && typeof window.cleanupBlokusLifecycle === 'function') {
                window.cleanupBlokusLifecycle();
            }
            const gameConfig = Array.isArray(window.AVAILABLE_GAMES)
                ? window.AVAILABLE_GAMES.find(g => g.id === gameType)
                : null;
            const renderFnName = gameConfig?.renderFunction || `render_${gameType}`;

            if (!shouldRenderGame) {
                if (!isScreenActive('room') && !isMenuScreen) showScreen('room');
                if (window.renderLobby) renderLobby(res);
            } else {
                if (window.GameManager && window.GameManager.loadGameScript) {
                    try {
                        if (!window[renderFnName]) {
                            const gameArea = document.getElementById('game-area');
                            if (gameArea && !gameArea.querySelector('.spinner-border')) {
                                gameArea.innerHTML = `<div class="d-flex flex-column align-items-center justify-content-center h-100" style="padding-top: 30vh;"><div class="spinner-border text-primary mb-3"></div><div class="text-muted">Загрузка модуля игры...</div></div>`;
                            }
                        }
                        await window.GameManager.loadGameScript(gameType);
                    } catch (err) {
                        console.error("Failed to load game script:", err);
                        renderGameModuleLoadError(res, gameType, 'load_script_failed', err?.stack || err?.message || String(err));
                        return res;
                    }
                }

                let attempts = 0;
                while (!window[renderFnName] && attempts < 20) {
                    await new Promise(r => setTimeout(r, 100));
                    attempts++;
                }

                const renderFunc = window[renderFnName];
                if (typeof renderFunc === 'function') {
                    if (!isScreenActive('game') && !isMenuScreen) showScreen('game');
                    try {
                        renderFunc(res);
                    } catch (e) {
                        if (gameType === 'blokus' && typeof window.cleanupBlokusLifecycle === 'function') {
                            window.cleanupBlokusLifecycle();
                        }
                        console.error('Game Render Error:', e);
                        const gameArea = document.getElementById('game-area');
                        if (gameArea) gameArea.innerHTML = `<div class="p-5 text-center"><h3 class="mb-3 text-danger">Ошибка отображения</h3><p class="text-muted mb-4">${e.message}</p><button class="btn btn-outline-danger" onclick="leaveRoom()">Выйти</button></div>`;
                    }
                } else {
                    console.error(`Render function not found for ${gameType}: ${renderFnName}`);
                    renderGameModuleLoadError(
                        res,
                        gameType,
                        'render_function_missing',
                        `Render function not found: ${renderFnName}`
                    );
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

            if (hash && !isGarbage && hash !== 'splash' && hash !== 'login' && hash !== 'room') {
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

// === DEBUG TOOLS ===
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
    setTimeout(() => {
        try {
            const storedToken = localStorage.getItem('pg_token');
            const apiToken = (window.APIManager && typeof window.APIManager.getAuthToken === 'function') ? window.APIManager.getAuthToken() : null;
            const hasToken = !!(storedToken || apiToken);
            if (window.loadPublicRooms && hasToken) loadPublicRooms();
        } catch (e) {
            if (window.loadPublicRooms && localStorage.getItem('pg_token')) loadPublicRooms();
        }
    }, 1000);
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
