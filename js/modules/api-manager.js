/**
 * API Manager Module
 * Handles core network communication with the backend.
 */

const API_URL = (window.APP_BASE_PATH || '/') + 'server/api.php';
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
        case 'login_tma':
            return 20000;
        case 'get_state':
            return 15000;
        case 'get_public_rooms':
        case 'get_local_rooms':
        case 'get_scheduled_games':
        case 'get_leaderboard':
        case 'get_history':
            return 30000;
        case 'get_stats':
            return 8000;
        case 'update_session_info':
            return 4000;
        case 'create_scheduled_game':
        case 'update_scheduled_game':
        case 'subscribe_scheduled_game':
        case 'unsubscribe_scheduled_game':
        case 'open_scheduled_game':
        case 'cancel_scheduled_game':
            return 15000;
        case 'get_favorites':
            return 15000;
        default:
            return 10000;
    }
}

function getHashParamFromRawHash(rawHash, name) {
    const prefix = `${name}=`;
    const part = String(rawHash || '').replace(/^#/, '').split('&').find(item => item.startsWith(prefix));
    if (!part) return '';

    try {
        return decodeURIComponent(part.slice(prefix.length));
    } catch (e) {
        return '';
    }
}

function getSafeLocationDiagnostics() {
    const rawHash = String(window.location.hash || '');
    const hasHash = rawHash.length > 0;
    const hasTgWebAppData = rawHash.includes('tgWebAppData=');
    let safeHashRoute = '';

    if (hasHash) {
        const route = rawHash.substring(1).split('?')[0].split('&')[0];
        if (route && !route.includes('=') && !route.includes('tgWebApp')) {
            safeHashRoute = `#${route}`;
        } else if (hasTgWebAppData) {
            safeHashRoute = '#telegram-launch';
        }
    }

    return {
        url_path: `${window.location.pathname}${safeHashRoute}`,
        has_hash: hasHash,
        has_tg_webapp_data: hasTgWebAppData,
        telegram_platform: getHashParamFromRawHash(rawHash, 'tgWebAppPlatform') || window.Telegram?.WebApp?.platform || 'web'
    };
}

function sanitizeLogContext(context = {}) {
    const blocked = new Set(['href', 'hash', 'url', 'full_url', 'location', 'tgWebAppData', 'initData', 'signature', 'user']);
    const safe = {};

    for (const [key, value] of Object.entries(context || {})) {
        if (blocked.has(key)) continue;
        safe[key] = value;
    }

    return safe;
}

function sanitizeLogText(value) {
    return String(value || '')
        .replace(/tgWebAppData=[^\s#]+/g, 'tgWebAppData=[redacted]')
        .replace(/([?&#])(hash|signature|user|initData)=([^&#\s]+)/g, '$1$2=[redacted]');
}

async function apiRequest(data, options = {}) {
    if (data && typeof data.action === 'string') {
        window.__lastApiAction = data.action;
    }

    if (options.startup && typeof window.logAuthClientEvent === 'function') {
        window.logAuthClientEvent('auth_startup_api_call', { action: data?.action || 'unknown' });
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
    let timeoutMs = options.timeoutMs ?? getApiTimeoutMs(data?.action);
    // Make startup or anonymous public rooms load short and non-blocking
    if (data?.action === 'get_public_rooms' && (options.startup === true || !authToken)) {
        timeoutMs = Math.min(timeoutMs, 8000);
    }
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
            if (options.startup && typeof window.logAuthClientEvent === 'function') {
                window.logAuthClientEvent('auth_startup_api_timeout', { action: data?.action || 'unknown' });
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
            if (data.action === 'login_tma') isSilent = true;
            if (data.action === 'get_favorites') isSilent = true;
        }

        if (!isSilent) {
            if (window.showAlert) window.showAlert("Ошибка сети/сервера", errorMsg, 'error');
        }
        return { status: 'error', message: errorMsg, is_timeout: e.name === 'AbortError' };
    }
}

let _pgbErrorLogCache = new Map();

async function logClientError(message, stack = '', context = {}) {
    const msgLower = String(message).toLowerCase().trim();
    if (msgLower === 'script error.' || msgLower === 'script error') {
        const hasNoStack = !stack || stack === 'unknown:0:0';
        const hasNoLine = !context.line && !context.column && !context.source_url;
        if (hasNoStack && hasNoLine) {
            return;
        }
    }

    const dedupKey = `${message}|${stack}|${context.action || ''}|${context.current_screen || ''}`;
    const now = Date.now();
    const lastTime = _pgbErrorLogCache.get(dedupKey) || 0;
    if (now - lastTime < 5000) {
        return;
    }
    _pgbErrorLogCache.set(dedupKey, now);

    const safeContext = sanitizeLogContext(context);
    const body = new FormData();
    body.append('action', 'log_client_error');
    body.append('message', sanitizeLogText(message));
    body.append('stack', sanitizeLogText(stack || new Error().stack));
    body.append('context', JSON.stringify({
        ua: navigator.userAgent,
        ...getSafeLocationDiagnostics(),
        platform: window.Telegram?.WebApp?.platform || 'web',
        online: navigator.onLine,
        connection: navigator.connection ? { type: navigator.connection.effectiveType, rtt: navigator.connection.rtt } : 'unknown',
        perf: (window.performance && window.performance.timing) ? {
            load: window.performance.timing.loadEventEnd > 0 ? window.performance.timing.loadEventEnd - window.performance.timing.navigationStart : null,
            dom: window.performance.timing.domContentLoadedEventEnd > 0 ? window.performance.timing.domContentLoadedEventEnd - window.performance.timing.navigationStart : null
        } : null,
        ...safeContext
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
    getSafeLocationDiagnostics,
    getAuthToken: () => authToken,
    setAuthToken: (t) => { authToken = t; localStorage.setItem('pg_token', t); },
    getServerTimeOffset: () => serverTimeOffset,
    API_URL
};

window.apiRequest = apiRequest;
window.API_URL = API_URL;
window.getSafeLocationDiagnostics = getSafeLocationDiagnostics;
