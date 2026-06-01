/**
 * Auth Manager Module
 * Handles application initialization, authentication, and session state.
 */

// globalUser is initialized here to ensure availability for other modules
window.globalUser = null;

// Module-level user state (authToken is declared in api-manager.js)
let globalUser = null;

// === PUBLIC API ===

function isRealTelegramWebApp(tg) {
    return !!(tg && tg.__PGB_MOCK !== true);
}

function getHashParam(name) {
    const rawHash = String(window.location.hash || '').replace(/^#/, '');
    if (!rawHash) return '';

    const prefix = `${name}=`;
    if (name === 'tgWebAppData') {
        const start = rawHash.indexOf(prefix);
        if (start === -1) return '';

        const valueStart = start + prefix.length;
        const knownNextParams = [
            '&tgWebAppVersion=',
            '&tgWebAppPlatform=',
            '&tgWebAppThemeParams=',
            '&tgWebAppStartParam=',
            '&tgWebAppBotInline=',
            '&tgWebAppFullscreen=',
            '&tgWebAppShowSettings='
        ];
        const end = knownNextParams
            .map(param => rawHash.indexOf(param, valueStart))
            .filter(index => index >= 0)
            .sort((a, b) => a - b)[0] || rawHash.length;
        try {
            return decodeURIComponent(rawHash.slice(valueStart, end));
        } catch (e) {
            return '';
        }
    }

    const parts = rawHash.split('&');
    for (const part of parts) {
        if (part.startsWith(prefix)) {
            const rawValue = part.slice(prefix.length);
            try {
                return decodeURIComponent(rawValue);
            } catch (e) {
                return '';
            }
        }
    }

    return '';
}

function getStartParamFromInitData(initData) {
    try {
        return new URLSearchParams(initData || '').get('start_param') || '';
    } catch (e) {
        return '';
    }
}

function getTelegramInitDataFallback() {
    const tg = window.Telegram?.WebApp;
    if (isRealTelegramWebApp(tg) && typeof tg.initData === 'string' && tg.initData.trim().length > 0) {
        return tg.initData;
    }

    const initData = getHashParam('tgWebAppData');
    if (!initData) return '';



    return initData;
}

function getTelegramUrlStartParam(initData = '') {
    return getHashParam('tgWebAppStartParam') || getStartParamFromInitData(initData);
}

function getTelegramUrlPlatform() {
    return getHashParam('tgWebAppPlatform') || 'unknown';
}

function getTelegramDeviceName() {
    const ua = navigator.userAgent || '';
    let device = 'Telegram';
    if (/iPhone/.test(ua)) device = 'iPhone · Telegram';
    else if (/iPad/.test(ua)) device = 'iPad · Telegram';
    else if (/Android/.test(ua)) device = 'Android · Telegram';
    else if (/Mac/.test(ua)) device = 'Mac · Telegram Desktop';
    else if (/Windows/.test(ua)) device = 'Windows · Telegram Desktop';
    else if (/Linux/.test(ua)) device = 'Linux · Telegram Desktop';
    return device;
}

function updateSessionInfoBestEffort(device) {
    if (!window.apiRequest) return;

    window.apiRequest({
        action: 'update_session_info',
        platform: 'tma',
        device
    }, { timeoutMs: 4000 }).catch((e) => { console.warn('update_session_info failed', e); });
}

async function initApp(tg) {
    let screenShown = false;
    try {
        const currentStartParam = tg?.initDataUnsafe?.start_param;
        console.log("Start Param:", currentStartParam);

        const isMockWebApp = tg?.__PGB_MOCK === true;
        const hasTmaData = tg && !isMockWebApp && typeof tg.initData === 'string' && tg.initData.trim().length > 0;
        if (isMockWebApp && typeof window.logAuthClientEvent === 'function') {
            window.logAuthClientEvent('mock_webapp_detected_ignore_initdata');
        }

        const res = await window.checkState({ timeoutMs: 8000, startup: true }); // checkState works via global/window for now

        // 1. Auth/Network Error -> Login (or auto re-login via TMA)
        if (!res || res.status === 'error' || res.status === 'auth_error') {
            const hasSavedToken = !!(getAuthToken() || localStorage.getItem('pg_token'));
            if (res && res.status === 'error' && res.is_timeout && hasSavedToken) {

                if (window.showScreen) window.showScreen('lobby');
                screenShown = true;
                return;
            }
            if (res && res.status === 'auth_error' && hasTmaData) {
                // Token expired/invalidated (e.g. logged in from another device).
                // Silently re-authenticate via Telegram instead of showing login screen.
                console.log('[Auth] Token invalid, attempting silent TMA re-login...');
                await loginTMA(tg);
                return;
            }

            if (window.showScreen) window.showScreen('login');
            screenShown = true;
            return;
        }

        // 1b. If running in TMA, silently update session platform/device
        //     (fixes migrated sessions that were labeled 'web'/'Перенесено из старой системы')
        const hasTmaCtx = tg && typeof tg.initData === 'string' && tg.initData.trim().length > 0;
        if (hasTmaCtx && window.apiRequest) {
            updateSessionInfoBestEffort(getTelegramDeviceName());
        }

        // 2. Handle Start Params (Deep Links)
        let startParam = tg?.initDataUnsafe?.start_param;
        if (!startParam) {
            const urlParams = new URLSearchParams(window.location.search);
            startParam = urlParams.get('startapp');
        }

        if (startParam) {
            const isScheduledDeepLink = /^scheduled_\d+$/.test(String(startParam));
            if (isScheduledDeepLink) {
                startParam = null;
            }
        }

        if (startParam) {
            const code = startParam.startsWith('room_') ? startParam.replace('room_', '') : startParam;

            if (res && res.status === 'in_room' && res.room.room_code !== code) {
                // User is in Room A, but clicked link for Room B
                if (window.showConfirmation) {
                    window.showConfirmation('Переход', `Перейти в комнату ${code} ? `, async () => {
                        if (window.leaveRoom) await window.leaveRoom();
                        if (window.joinRoom) await window.joinRoom(code);
                    }, { confirmText: 'Перейти' });
                }
            } else if (res.status !== 'in_room') {
                if (window.joinRoom) await window.joinRoom(code);
            }
        }

        // 3. Fallback: If we are not in a room, show lobby or the screen from hash
        if (res && res.status === 'no_room') {
            const hash = window.location.hash.substring(1);
            const isGarbage = hash.includes('tgWebAppData=') || hash.includes('tgWebAppVersion=');

            if (hash && !isGarbage && hash !== 'splash' && hash !== 'login' && !hash.startsWith('auth_token')) {
                if (window.UIManager && window.UIManager.handleRouting) {
                    window.UIManager.handleRouting();
                } else if (window.showScreen) {
                    window.showScreen(hash);
                }
            } else {
                if (window.showScreen) window.showScreen('lobby');
            }
            screenShown = true;
        }

    } catch (e) {
        console.error("Init App failed:", e);
        if (window.showScreen) window.showScreen('login');
        screenShown = true;
    } finally {
        // ULTIMATE FAILSAFE
        const splash = document.getElementById('screen-splash');
        if (splash && splash.classList.contains('active-screen')) {
            const hash = window.location.hash.substring(1);
            const target = (hash && hash !== 'splash' && hash !== 'login') ? hash : (localStorage.getItem('pg_token') ? 'lobby' : 'login');
            if (window.showScreen) window.showScreen(target);
        }
    }
}

async function loginTMA(tg, context = {}) {
    if (window.apiRequest) {
        const initData = typeof tg?.initData === 'string' ? tg.initData : '';
        const source = context.source || (tg?.__PGB_URL_HASH_FALLBACK === true ? 'url_hash' : 'webapp');
        if (!initData.trim()) {
            if (typeof window.logAuthClientEvent === 'function') {
                window.logAuthClientEvent('tma_login_failed', { status: 'missing_initdata', source });
            }
            return;
        }

        const device = getTelegramDeviceName();



        const res = await window.apiRequest({
            action: 'login_tma',
            initData,
            platform: 'tma',
            device,
        });
        if (res.status === 'ok') {
            setAuthToken(res.token);

            await initApp(tg);
        } else {
            if (typeof window.logAuthClientEvent === 'function') {
                window.logAuthClientEvent('tma_login_failed', { status: res.status || 'error' });
                if (source === 'url_hash') {
                    window.logAuthClientEvent('url_initdata_login_failed', {
                        status: res.status || 'error',
                        platform: context.platform || 'unknown'
                    });
                }
            }
            if (source === 'url_hash') {
                if (window.showScreen) window.showScreen('login');
                if (typeof window.showBotFallbackAvailable === 'function') {
                    window.showBotFallbackAvailable('auth_url_initdata_login_failed');
                }
            }
            if (window.showAlert) window.showAlert('Ошибка авторизации', res.message, 'error');
        }
    }
}

function closeTMA() {
    if (window.Telegram && window.Telegram.WebApp && typeof window.Telegram.WebApp.close === 'function') {
        window.Telegram.WebApp.close();
    }
}

function logout() {
    const isRealTMA = !!(window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData && window.Telegram.WebApp.initData.length > 0);
    const hashStr = window.location.hash || '';
    const hasHashTma = hashStr.includes('tgWebAppData=') || hashStr.includes('tgWebAppPlatform=');
    const bodyCls = document.body.className || '';
    const htmlCls = document.documentElement.className || '';
    const hasTmaClass = bodyCls.includes('tg-platform-tdesktop') || bodyCls.includes('tg-platform-ios') || bodyCls.includes('tg-platform-android') ||
                        htmlCls.includes('tg-platform-tdesktop') || htmlCls.includes('tg-platform-ios') || htmlCls.includes('tg-platform-android');
    const isTMA = isRealTMA || hasHashTma || hasTmaClass || (typeof hasAuthInitData !== 'undefined' && hasAuthInitData);

    if (isTMA) {
        if (window.showAlert) {
            window.showAlert('Выход недоступен', 'Внутри Telegram нельзя выйти из аккаунта. Закройте Mini App.', 'info');
        }
        return;
    }

    if (window.showConfirmation) {
        window.showConfirmation('Выход', 'Вы уверены, что хотите выйти?', async () => {
            // 1. Clear Token
            if (window.StorageManager) await window.StorageManager.remove('pg_token');
            else localStorage.removeItem('pg_token');

            // 2. Clear Global State
            window.authToken = null;
            window.globalUser = null;

            // 3. Force navigate to login
            // Using replace to ensure history doesn't keep the protected page
            window.location.hash = 'login';
            window.location.reload();
        }, { isDanger: true, confirmText: 'Выйти' });
    } else {
        // 1. Clear Token
        if (window.StorageManager) window.StorageManager.remove('pg_token');
        else localStorage.removeItem('pg_token');

        // 2. Clear Global State
        window.authToken = null;
        window.globalUser = null;

        // 3. Force navigate to login
        window.location.hash = 'login';
        window.location.reload();
    }
}

async function devLogin(index = 1) {
    try {
        const formData = new FormData();
        formData.append('action', 'dev_login');
        formData.append('index', index);
        // We need API_URL. Assuming it's global or we need to import it?
        // Ideally api-manager handles the fetch, but devLogin bypasses std apiRequest sometimes?
        // Re-using apiRequest is better if possible, but dev_login might be separate.
        // Let's assume apiRequest handles it or use fetch if global API_URL exists.
        // js/modules/api-manager.js handles API_URL.

        // Wait, app.js had direct fetch using API_URL.
        // We should try to use apiRequest if possible, or access window.API_URL

        let response;
        if (window.API_URL) {
            response = await fetch(window.API_URL, { method: 'POST', body: formData });
        } else {
            // Fallback or error
            console.error("API_URL not found for devLogin");
            return;
        }

        const data = await response.json();

        if (data.status === 'ok') {
            setAuthToken(data.token);
            setGlobalUser(data.user);

            if (window.showScreen) window.showScreen('lobby');

            // Call SocialManager to update UI
            if (window.SocialManager && window.SocialManager.renderCurrentUser) {
                window.SocialManager.renderCurrentUser(data.user);
            } else if (window.updateUserInfo) {
                window.updateUserInfo(data.user); // Backward compat
            }

            if (window.startPolling) window.startPolling();
            if (window.showAlert) window.showAlert('Успех', 'Вы вошли как ' + (data.user.custom_name || data.user.first_name), 'success');
        } else {
            if (window.showAlert) window.showAlert('Ошибка', data.message, 'error');
        }
    } catch (e) {
        if (window.showAlert) window.showAlert('Ошибка сети', e.message, 'error');
    }
}

// === HELPERS ===

function setAuthToken(token) {
    authToken = token;
    if (window.StorageManager) window.StorageManager.set('pg_token', token);
    else localStorage.setItem('pg_token', token);
    window.authToken = token; // Sync global
}

function getAuthToken() {
    return authToken;
}

function setGlobalUser(user) {
    globalUser = user;
    window.globalUser = user; // Sync global
}

function getGlobalUser() {
    return globalUser;
}

// === EXPORT ===

window.AuthManager = {
    initApp,
    loginTMA,
    logout,
    devLogin,
    getTelegramInitDataFallback,
    getTelegramUrlStartParam,
    getTelegramUrlPlatform,
    setAuthToken,
    getAuthToken,
    setGlobalUser,
    getGlobalUser
};

// Global Aliases (for backward compatibility during migration)
window.initApp = initApp;
window.loginTMA = loginTMA;
window.getTelegramInitDataFallback = getTelegramInitDataFallback;
window.getTelegramUrlStartParam = getTelegramUrlStartParam;
window.getTelegramUrlPlatform = getTelegramUrlPlatform;
window.logout = logout;
window.devLogin = devLogin;
window.authToken = authToken; // Initial sync
window.globalUser = globalUser;
window.closeTMA = closeTMA;
