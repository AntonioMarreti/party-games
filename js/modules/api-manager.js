/**
 * API Manager Module
 * Handles core network communication with the backend.
 */

const API_URL = 'server/api.php';
let authToken = localStorage.getItem('pg_token') ? localStorage.getItem('pg_token').trim() : null;
let serverTimeOffset = 0;

async function apiRequest(data) {
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

    try {
        const localBefore = Date.now();
        const response = await fetch(API_URL, { method: 'POST', body: body });
        if (!response.ok) throw new Error(`Server Error: ${response.status}`);

        // Time Sync Logic
        const localAfter = Date.now();
        const serverDateStr = response.headers.get('Date');
        if (serverDateStr) {
            const serverMs = new Date(serverDateStr).getTime();
            serverTimeOffset = serverMs - (localBefore + (localAfter - localBefore) / 2);
        }

        const res = await response.json();

        // Handle token updates if server returns one
        if (res.token) {
            authToken = res.token;
            localStorage.setItem('pg_token', authToken);
        }

        return res;
    } catch (e) {
        console.error("API Error:", e);
        if (data && data.action !== 'get_state') {
            const msg = (e.message && e.message.includes("pattern")) ? "Communication Error (Invalid Format)" : e.message;
            if (window.showAlert) window.showAlert("Ошибка сети/сервера", msg, 'error');
        }
        return { status: 'error', message: e.message };
    }
}

// Expose globally
window.APIManager = {
    apiRequest,
    getAuthToken: () => authToken,
    setAuthToken: (t) => { authToken = t; localStorage.setItem('pg_token', t); },
    getServerTimeOffset: () => serverTimeOffset,
    API_URL
};

window.apiRequest = apiRequest;
window.API_URL = API_URL;
