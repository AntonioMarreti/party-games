/**
 * Auth Manager Module
 * Handles application initialization, authentication, and session state.
 */

// globalUser is initialized here to ensure availability for other modules
window.globalUser = null;

// === PUBLIC API ===

async function initApp(tg) {
    let screenShown = false;
    try {
        const currentStartParam = tg?.initDataUnsafe?.start_param;
        console.log("Start Param:", currentStartParam);

        const res = await window.checkState(); // checkState works via global/window for now

        // 1. Auth/Network Error -> Login
        if (!res || res.status === 'error' || res.status === 'auth_error') {
            if (window.showScreen) window.showScreen('login');
            if (window.safeStyle) window.safeStyle('browser-login-btn', 'display', 'block');
            screenShown = true;
            return;
        }

        // 2. Handle Start Params (Deep Links)
        let startParam = tg?.initDataUnsafe?.start_param;
        if (!startParam) {
            const urlParams = new URLSearchParams(window.location.search);
            startParam = urlParams.get('startapp');
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
        if (window.safeStyle) window.safeStyle('browser-login-btn', 'display', 'block');
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

async function loginTMA(tg) {
    if (window.apiRequest) {
        const res = await window.apiRequest({ action: 'login_tma', initData: tg.initData });
        if (res.status === 'ok') {
            setAuthToken(res.token);
            initApp(tg);
        } else {
            if (window.showAlert) window.showAlert('Ошибка авторизации', res.message, 'error');
        }
    }
}

function logout() {
    if (window.showConfirmation) {
        window.showConfirmation('Выход', 'Вы уверены, что хотите выйти?', () => {
            localStorage.removeItem('pg_token');
            authToken = null;
            window.location.reload();
        }, { isDanger: true, confirmText: 'Выйти' });
    } else {
        localStorage.removeItem('pg_token');
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
    localStorage.setItem('pg_token', token);
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
    setAuthToken,
    getAuthToken,
    setGlobalUser,
    getGlobalUser
};

// Global Aliases (for backward compatibility during migration)
window.initApp = initApp;
window.loginTMA = loginTMA;
window.logout = logout;
window.devLogin = devLogin;
window.authToken = authToken; // Initial sync
window.globalUser = globalUser;
