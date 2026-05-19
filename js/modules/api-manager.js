/**
 * API Manager Module
 * Handles core network communication with the backend.
 */

const API_URL = 'server/api.php';
let authToken = localStorage.getItem('pg_token') ? localStorage.getItem('pg_token').trim() : null;
let serverTimeOffset = 0;
let consecutiveGetStateTimeouts = 0;

function getApiTimeoutMs(action) {
    switch (String(action || '')) {
        case 'start_game':
        case 'create_room':
        case 'join_room':
        case 'generate_share_card':
            return 20000;
        case 'get_state':
            return 15000;
        case 'get_public_rooms':
        case 'get_local_rooms':
        case 'get_scheduled_games':
        case 'get_stats':
        case 'get_leaderboard':
        case 'get_history':
            return 30000;
        case 'create_scheduled_game':
        case 'update_scheduled_game':
        case 'subscribe_scheduled_game':
        case 'unsubscribe_scheduled_game':
        case 'open_scheduled_game':
        case 'cancel_scheduled_game':
            return 15000;
        default:
            return 10000;
    }
}

async function apiRequest(data) {
    if (data && typeof data.action === 'string') {
        window.__lastApiAction = data.action;
    }

    let body;
    if (data instanceof FormData) {
        body = data;
        if (!body.has('token') && authToken) body.append('token', authToken);
    } else {
        body = new FormData();
        if (authToken) body.append('token', authToken);
        for (const key in data) {
            if (Array.isArray(data[key])) {
                data[key].forEach(val => body.append(`${key}[]`, val));
            } else {
                body.append(key, data[key]);
            }
        }
    }

    const controller = new AbortController();
    const timeoutMs = getApiTimeoutMs(data?.action);
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const localBefore = Date.now();
        const response = await fetch(API_URL, {
            method: 'POST',
            body: body,
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!response.ok) throw new Error(`Server Error: ${response.status}`);

        // Time Sync Logic
        const localAfter = Date.now();
        const serverDateStr = response.headers.get('Date');
        if (serverDateStr) {
            const serverMs = new Date(serverDateStr).getTime();
            serverTimeOffset = serverMs - (localBefore + (localAfter - localBefore) / 2);
        }

        const res = await response.json();
        if (data?.action === 'get_state') {
            consecutiveGetStateTimeouts = 0;
        }

        // Handle token updates if server returns one
        if (res.token) {
            authToken = res.token;
            localStorage.setItem('pg_token', authToken);
        }

        return res;
    } catch (e) {
        clearTimeout(timeoutId);
        console.error("API Error:", e);

        let errorMsg = e.message;
        if (e.name === 'AbortError') {
            errorMsg = `Превышено время ожидания сервера (операция: ${data?.action || 'неизвестно'})`;
            console.error("🔥 TIMEOUT ACTION:", data?.action);
            if (window.logClientError) {
                if (data?.action === 'get_state') {
                    consecutiveGetStateTimeouts++;
                    if (consecutiveGetStateTimeouts >= 3) {
                        window.logClientError("API Timeout", `Action: get_state, Timeout: ${timeoutMs}ms, Consecutive: ${consecutiveGetStateTimeouts}`);
                    }
                } else {
                    window.logClientError("API Timeout", `Action: ${data?.action || 'unknown'}, Timeout: ${timeoutMs}ms`);
                }
            }
        }

        let isSilent = false;
        if (data && typeof data.action === 'string') {
            if (data.action.includes('get_state')) isSilent = true;
            if (data.action === 'game_action') isSilent = true;
            if (data.action === 'update_session_info') isSilent = true;
            if (data.action === 'get_public_rooms') isSilent = true;
            if (data.action === 'get_local_rooms') isSilent = true;
            if (data.action === 'get_stats') isSilent = true;
        }

        if (!isSilent) {
            if (window.showAlert) window.showAlert("Ошибка сети/сервера", errorMsg, 'error');
        }
        return { status: 'error', message: errorMsg, is_timeout: e.name === 'AbortError' };
    }
}

async function logClientError(message, stack = '', context = {}) {
    const body = new FormData();
    body.append('action', 'log_client_error');
    body.append('message', message);
    body.append('stack', stack || new Error().stack);
    body.append('context', JSON.stringify({
        ua: navigator.userAgent,
        href: window.location.href,
        platform: window.Telegram?.WebApp?.platform || 'web',
        online: navigator.onLine,
        connection: navigator.connection ? { type: navigator.connection.effectiveType, rtt: navigator.connection.rtt } : 'unknown',
        perf: window.performance ? { 
            load: window.performance.timing.loadEventEnd - window.performance.timing.navigationStart,
            dom: window.performance.timing.domContentLoadedEventEnd - window.performance.timing.navigationStart
        } : null,
        ...context
    }));

    try {
        // Use direct fetch without timeout logic to avoid loops/hangs during logging
        await fetch(API_URL, { method: 'POST', body: body });
    } catch (e) {
        console.warn("Remote logging failed:", e);
    }
}

// Expose globally
window.APIManager = {
    apiRequest,
    logClientError,
    getAuthToken: () => authToken,
    setAuthToken: (t) => { authToken = t; localStorage.setItem('pg_token', t); },
    getServerTimeOffset: () => serverTimeOffset,
    API_URL
};

window.apiRequest = apiRequest;
window.API_URL = API_URL;
