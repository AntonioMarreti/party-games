<?php
/** @var string $v Asset version */
if (!defined('TG_CLIENT_ID')) {
    require_once __DIR__ . '/../server/config.php';
}
?>
<!-- JS Libraries -->
<script src="libs/bootstrap.bundle.min.js"></script>
<script src="libs/qrcode.min.js"></script>

<!-- Telegram Login Library (OIDC) is loaded lazily on demand -->

<!-- Core Data & Config -->
<script src="js/audio.js?v=<?php echo $v; ?>"></script>
<script src="js/config/games-config.js?v=<?php echo $v; ?>"></script>

<!-- API & Framework -->
<script src="js/modules/state-store.js?v=<?php echo $v; ?>"></script>
<script src="js/modules/mock-tma.js?v=<?php echo $v; ?>"></script>
<script src="js/modules/storage-manager.js?v=<?php echo $v; ?>"></script>
<script src="js/modules/api-manager.js?v=<?php echo $v; ?>"></script>
<script src="js/modules/theme-manager.js?v=<?php echo $v; ?>"></script>
<script src="js/modules/ui-manager.js?v=<?php echo $v; ?>"></script>

<!-- Feature Modules -->
<script type="module" src="js/modules/display-avatars.js?v=<?php echo $v; ?>"></script>
<script src="js/modules/auth-manager.js?v=<?php echo $v; ?>"></script>
<script src="js/modules/session-manager.js?v=<?php echo $v; ?>"></script>
<script src="js/modules/social-manager.js?v=<?php echo $v; ?>"></script>
<script src="js/modules/wordclash-dictionary-manager.js?v=<?php echo $v; ?>"></script>
<script src="js/modules/history-manager.js?v=<?php echo $v; ?>"></script>
<script src="js/modules/game-summary-provider.js?v=<?php echo $v; ?>"></script>
<script src="js/modules/game-manager.js?v=<?php echo $v; ?>"></script>
<script src="js/modules/room-manager.js?v=<?php echo $v; ?>"></script>
<script src="js/modules/ai-manager.js?v=<?php echo $v; ?>"></script>
<script src="js/modules/avatar-editor.js?v=<?php echo $v; ?>"></script>
<script src="js/modules/debug-scroll-qa.js?v=<?php echo $v; ?>"></script>

<!-- Main App Logic -->
<script src="js/app.js?v=<?php echo $v; ?>"></script>

<!-- Auth Helpers -->
<script>
    const BOT_AUTH_STORAGE_KEY = 'pgb_pending_bot_auth';
    let botAuthPollTimer = null;
    let botAuthTimeoutTimer = null;

    function getAuthFormData(extra = {}) {
        const formData = new FormData();
        for (const [key, value] of Object.entries(extra)) {
            formData.append(key, value);
        }
        return formData;
    }

    function getAuthDeviceName() {
        const ua = navigator.userAgent || '';
        if (/iPhone/.test(ua)) return 'iPhone · Telegram';
        if (/iPad/.test(ua)) return 'iPad · Telegram';
        if (/Android/.test(ua)) return 'Android · Telegram';
        if (/Mac/.test(ua)) return 'Mac · Telegram Desktop';
        if (/Windows/.test(ua)) return 'Windows · Telegram Desktop';
        if (/Linux/.test(ua)) return 'Linux · Telegram Desktop';
        return 'Telegram';
    }

    function getAuthHashParam(name) {
        const rawHash = String(window.location.hash || '').replace(/^#/, '').replace(/\?/g, '&');
        if (!rawHash) return '';

        const prefix = `${name}=`;
        const part = rawHash.split('&').find(item => item.startsWith(prefix));
        if (!part) return '';

        try {
            return decodeURIComponent(part.slice(prefix.length));
        } catch (e) {
            return '';
        }
    }

    function getAuthDiagnosticsPlatform() {
        const webApp = window.Telegram?.WebApp;
        if (webApp && webApp.__PGB_MOCK !== true && webApp.platform) {
            return String(webApp.platform);
        }

        return window.getTelegramPlatformFallback?.()
            || getAuthHashParam('tgWebAppPlatform')
            || 'browser';
    }

    function logAuthClientEvent(event, extra = {}) {
        try {
            // Normalize event name to avoid double "auth_" prefix
            let ev = String(event || '');
            if (!ev.startsWith('auth_')) ev = 'auth_' + ev;

            // Noisy diagnostic events (suppress remote reporting)
            const noisy = new Set([
                'auth_mock_webapp_detected_ignore_initdata',
                'auth_mock_tma_detected',
                'auth_telegram_login_initial_load_removed',
                'auth_bot_fallback_ready_without_webapp',
                'auth_bot_fallback_ready_without_real_telegram',
                'auth_bot_fallback_available',
                'auth_ignored_empty_mock_initdata',
                'auth_telegram_webapp_timeout_continue',
                'auth_ui_ready_without_webapp',
                'auth_restore_without_webapp',
                'auth_startup_api_call',
                'auth_url_initdata_detected',
                'auth_tma_login_success',
                'auth_url_initdata_login_success',
                'auth_tma_platform_from_url',
                'auth_webapp_unavailable'
            ]);

            // Per-page dedupe and rate-limit (keyed by event + serialized extra)
            window._authLoggedEvents = window._authLoggedEvents || new Set();
            window._authEventTimestamps = window._authEventTimestamps || {};
            const key = ev + '|' + (typeof extra === 'string' ? extra : JSON.stringify(extra || {}));
            const now = Date.now();
            const lastTs = window._authEventTimestamps[key] || 0;
            const RATE_MS = 30 * 1000;

            // If noisy, only log to console and skip remote reporting (rate-limited)
            if (noisy.has(ev)) {
                if (now - lastTs < RATE_MS) return;
                window._authEventTimestamps[key] = now;
                console.debug('[Auth][diag] suppressed remote log:', ev, extra);
                return;
            }

            // For non-noisy events, dedupe identical events within page and rate-limit
            if (window._authLoggedEvents.has(key) && (now - lastTs) < RATE_MS) {
                return;
            }
            window._authEventTimestamps[key] = now;
            window._authLoggedEvents.add(key);

            const body = getAuthFormData({
                action: 'log_client_error',
                message: ev,
                context: JSON.stringify({
                    event: ev,
                    ...extra,
                    platform: getAuthDiagnosticsPlatform(),
                    has_tma_init_data: !!(window.Telegram?.WebApp?.initData),
                    ua: navigator.userAgent || ''
                })
            });

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 4000);
            fetch((window.APP_BASE_PATH || '/') + 'server/api.php', { method: 'POST', body, signal: controller.signal })
                .catch(() => { })
                .finally(() => clearTimeout(timeoutId));
        } catch (e) {
            console.warn('[Auth] log failed', e);
        }
    }

    setTimeout(() => {
        if (!window.Telegram?.WebApp) {
            logAuthClientEvent('webapp_unavailable');
        }
    }, 2500);

    if (typeof window.logAuthClientEvent === 'function') {
        window.addEventListener('load', () => {
            if (!document.querySelector('script[src="https://telegram.org/js/telegram-login.js"]')) {
                logAuthClientEvent('telegram_login_initial_load_removed');
            }
            if (window.Telegram?.__PGB_MOCK || window.Telegram?.WebApp?.__PGB_MOCK || window.Telegram?.Login?.__PGB_MOCK) {
                logAuthClientEvent('mock_tma_detected');
            }
        });
    }

    function setBotAuthStatus(message, showCheckButton = false) {
        const statusEl = document.getElementById('bot-auth-status');
        if (!statusEl) return;

        statusEl.style.display = message ? 'block' : 'none';
        statusEl.innerHTML = message ? message : '';
        if (message && showCheckButton) {
            statusEl.innerHTML += '<button type="button" class="btn btn-sm btn-outline-light mt-2 w-100" onclick="checkPendingBotAuthNow()">Я авторизовался, проверить вход</button>';
        }
    }

    function savePendingBotAuth(tempCode, botUrl) {
        const pending = {
            temp_code: tempCode,
            bot_url: botUrl || '',
            created_at: Date.now(),
            expires_at: Date.now() + 10 * 60 * 1000
        };
        localStorage.setItem(BOT_AUTH_STORAGE_KEY, JSON.stringify(pending));
        return pending;
    }

    function getPendingBotAuth() {
        try {
            const pending = JSON.parse(localStorage.getItem(BOT_AUTH_STORAGE_KEY) || 'null');
            if (!pending || !pending.temp_code || Date.now() > Number(pending.expires_at || 0)) {
                localStorage.removeItem(BOT_AUTH_STORAGE_KEY);
                return null;
            }
            return pending;
        } catch (e) {
            localStorage.removeItem(BOT_AUTH_STORAGE_KEY);
            return null;
        }
    }

    function clearPendingBotAuth() {
        localStorage.removeItem(BOT_AUTH_STORAGE_KEY);
        if (botAuthPollTimer) clearInterval(botAuthPollTimer);
        if (botAuthTimeoutTimer) clearTimeout(botAuthTimeoutTimer);
        botAuthPollTimer = null;
        botAuthTimeoutTimer = null;
    }

    async function pollPendingBotAuth(tempCode, manual = false) {
        const check = await fetch((window.APP_BASE_PATH || '/') + 'server/api.php', {
            method: 'POST',
            body: new URLSearchParams({
                action: 'poll_auth_session',
                temp_code: tempCode
            })
        }).then(r => r.json());

        if (check.status === 'ok' && check.token) {
            clearPendingBotAuth();
            localStorage.setItem('pg_token', check.token);
            if (window.AuthManager) window.AuthManager.setAuthToken(check.token);
            logAuthClientEvent('bot_auth_poll_success');
            window.location.reload();
            return true;
        }

        if (check.status === 'expired') {
            clearPendingBotAuth();
            setBotAuthStatus('Ссылка авторизации истекла. Нажми «Войти через бота» ещё раз.');
            return false;
        }

        if (manual) {
            setBotAuthStatus('Пока не вижу подтверждение от бота. Убедись, что нажал Start в боте, и попробуй проверить ещё раз.', true);
        }
        return false;
    }

    async function checkPendingBotAuthNow() {
        const pending = getPendingBotAuth();
        if (!pending) {
            setBotAuthStatus('Нет активной bot-авторизации. Нажми «Войти через бота» ещё раз.');
            return;
        }

        try {
            await pollPendingBotAuth(pending.temp_code, true);
        } catch (e) {
            setBotAuthStatus('Не удалось проверить вход. Проверь соединение и попробуй ещё раз.', true);
        }
    }

    function startBotAuthPolling(pending, resumed = false) {
        if (!pending || !pending.temp_code) return;
        if (botAuthPollTimer) clearInterval(botAuthPollTimer);
        if (botAuthTimeoutTimer) clearTimeout(botAuthTimeoutTimer);

        setBotAuthStatus(
            resumed
                ? 'Жду подтверждение входа через бота. Если уже нажал Start в боте, проверка сработает автоматически.'
                : 'Открыл бота для входа. Вернись в приложение — вход проверится автоматически.',
            true
        );

        pollPendingBotAuth(pending.temp_code).catch(() => { });
        botAuthPollTimer = setInterval(() => {
            pollPendingBotAuth(pending.temp_code).catch(() => { });
        }, 2000);

        const timeLeft = Math.max(1000, Number(pending.expires_at || 0) - Date.now());
        botAuthTimeoutTimer = setTimeout(() => {
            clearPendingBotAuth();
            logAuthClientEvent('bot_auth_poll_timeout');
            setBotAuthStatus('Не дождался подтверждения от бота. Попробуй войти через бота ещё раз.');
        }, Math.min(timeLeft, 10 * 60 * 1000));
    }

    function resumePendingBotAuth() {
        const pending = getPendingBotAuth();
        if (!pending) return;

        logAuthClientEvent('bot_auth_poll_resumed');
        startBotAuthPolling(pending, true);
    }

    function updateDevLoginVisibility() {
        const panel = document.getElementById('dev-login-panel');
        if (!panel) return;

        const host = window.location.hostname;
        const params = new URLSearchParams(window.location.search);
        const explicitDebug = params.get('debug_dev_login') === '1';
        const localHost = ['localhost', '127.0.0.1', '::1'].includes(host);
        panel.style.display = (explicitDebug || localHost) ? 'block' : 'none';
    }

    function setDevLoginStatus(message, isError = false) {
        const statusEl = document.getElementById('dev-login-status');
        if (!statusEl) return;

        statusEl.style.display = message ? 'block' : 'none';
        statusEl.textContent = message || '';
        statusEl.style.color = isError ? 'rgba(255, 184, 184, 0.95)' : 'rgba(255, 255, 255, 0.72)';
    }

    async function handleDevLogin(index) {
        const panel = document.getElementById('dev-login-panel');
        if (!panel || panel.style.display === 'none') return;

        const secretInput = document.getElementById('dev-login-secret');
        const secret = secretInput ? secretInput.value : '';
        const buttons = Array.from(panel.querySelectorAll('[data-dev-login-index]'));

        buttons.forEach(button => { button.disabled = true; });
        setDevLoginStatus(`Вхожу как Dev ${index}...`);

        try {
            if (typeof window.devLogin !== 'function') {
                setDevLoginStatus('Dev login недоступен на этой странице.', true);
                return;
            }

            const result = await window.devLogin(index, secret, { silent: true });
            if (result && result.status === 'ok') {
                setDevLoginStatus(`Готово: Dev ${index}`);
                return;
            }

            setDevLoginStatus((result && result.message) || 'Dev login не выполнен.', true);
        } catch (e) {
            setDevLoginStatus('Ошибка сети. Попробуйте ещё раз.', true);
        } finally {
            buttons.forEach(button => { button.disabled = false; });
        }
    }

    let telegramLoginScriptPromise = null;

    function isMockTelegramApi() {
        return !!(window.Telegram?.__PGB_MOCK || window.Telegram?.WebApp?.__PGB_MOCK || window.Telegram?.Login?.__PGB_MOCK);
    }

    function hasValidTelegramLogin() {
        return !!(window.Telegram?.Login && typeof window.Telegram.Login.auth === 'function' && window.Telegram.Login.__PGB_MOCK !== true);
    }

    function loadTelegramLoginScript(timeoutMs = 2000) {
        if (hasValidTelegramLogin()) {
            return Promise.resolve(window.Telegram.Login);
        }

        if (telegramLoginScriptPromise) {
            return telegramLoginScriptPromise;
        }

        telegramLoginScriptPromise = new Promise(resolve => {
            if (hasValidTelegramLogin()) {
                resolve(window.Telegram.Login);
                return;
            }

            logAuthClientEvent('telegram_login_lazy_load_started');

            const existingScript = document.querySelector('script[src="https://telegram.org/js/telegram-login.js"]');
            const script = existingScript || document.createElement('script');
            let timer = null;
            let resolved = false;

            function cleanup(result) {
                if (timer) clearTimeout(timer);
                if (!resolved) {
                    resolved = true;
                    if (result) {
                        logAuthClientEvent('telegram_login_lazy_load_success');
                        resolve(window.Telegram?.Login && window.Telegram.Login.__PGB_MOCK !== true ? window.Telegram.Login : null);
                    } else {
                        logAuthClientEvent('telegram_login_lazy_load_timeout');
                        telegramLoginScriptPromise = null;
                        resolve(null);
                    }
                }
            }

            script.async = true;
            script.src = 'https://telegram.org/js/telegram-login.js';

            script.addEventListener('load', () => cleanup(true));
            script.addEventListener('error', () => cleanup(false));

            timer = setTimeout(() => cleanup(false), timeoutMs);

            if (!existingScript) {
                document.head.appendChild(script);
            }
        });

        return telegramLoginScriptPromise;
    }

    function waitForTelegramLogin(timeoutMs = 2000) {
        if (hasValidTelegramLogin()) {
            return Promise.resolve(window.Telegram.Login);
        }

        if (window.Telegram?.Login?.__PGB_MOCK === true) {
            logAuthClientEvent('auth_ignored_mock_telegram_login');
        }

        return loadTelegramLoginScript(timeoutMs);
    }

    function showBotFallbackAvailable(reason = '') {
        const noRealWebApp = !window.Telegram?.WebApp || window.Telegram?.WebApp?.__PGB_MOCK || !window.Telegram?.WebApp?.openTelegramLink;
        if (noRealWebApp) {
            logAuthClientEvent('bot_fallback_ready_without_webapp', { reason });
        }
        if (!window.Telegram?.WebApp || window.Telegram?.WebApp?.__PGB_MOCK || window.Telegram?.Login?.__PGB_MOCK || !window.Telegram?.WebApp?.initData) {
            logAuthClientEvent('bot_fallback_ready_without_real_telegram', { reason });
        }

        logAuthClientEvent('bot_fallback_available', { reason });
    }

    function openBotAuthUrl(url) {
        if (window.Telegram?.WebApp?.openTelegramLink && window.Telegram.WebApp.__PGB_MOCK !== true) {
            window.Telegram.WebApp.openTelegramLink(url);
            return;
        }

        const opened = window.open(url, '_blank', 'noopener');
        if (!opened) {
            window.location.href = url;
        }
    }

    // === NEW: Telegram Login (OIDC) ===
    async function loginViaTelegram() {
        const loginLoading = document.getElementById('login-loading');

        const isMockWebApp = window.Telegram?.WebApp?.__PGB_MOCK === true;
        const hasInitData = !!(window.Telegram?.WebApp?.initData);
        if (window.Telegram?.WebApp?.initData) {
            if (window.AuthManager?.loginTMA) {
                if (loginLoading) loginLoading.style.display = 'block';
                await window.AuthManager.loginTMA(window.Telegram.WebApp);
                return;
            }
        }

        const urlInitData = window.AuthManager?.getTelegramInitDataFallback?.() || '';
        if (urlInitData && window.AuthManager?.loginTMA) {
            const urlStartParam = window.AuthManager?.getTelegramUrlStartParam?.(urlInitData) || '';
            const urlPlatform = window.AuthManager?.getTelegramUrlPlatform?.() || 'unknown';
            if (loginLoading) loginLoading.style.display = 'block';
            await window.AuthManager.loginTMA({
                initData: urlInitData,
                initDataUnsafe: urlStartParam ? { start_param: urlStartParam } : {},
                platform: urlPlatform,
                __PGB_URL_HASH_FALLBACK: true
            }, {
                source: 'url_hash',
                platform: urlPlatform
            });
            return;
        }

        if (window.Telegram?.WebApp && (isMockWebApp || !hasInitData)) {
            if (isMockWebApp) {
                logAuthClientEvent('auth_ignored_empty_mock_initdata');
            }
            showBotFallbackAvailable('auth_ignored_empty_mock_initdata');
            return;
        }

        const telegramLogin = await waitForTelegramLogin(2000);
        if (!telegramLogin) {
            console.warn('Telegram.Login not available');
            logAuthClientEvent('telegram_login_unavailable');
            showBotFallbackAvailable('telegram_login_unavailable');
            return;
        }

        try {
            telegramLogin.auth(
                { client_id: '<?php echo TG_CLIENT_ID; ?>', request_access: 'write' },
                async (data) => {
                    if (!data) {
                        // User cancelled or error
                        console.log('Telegram Login: cancelled or failed');
                        logAuthClientEvent('telegram_login_cancelled');
                        showBotFallbackAvailable('telegram_login_cancelled');
                        return;
                    }

                    if (loginLoading) loginLoading.style.display = 'block';

                    try {
                        const formData = new FormData();
                        formData.append('action', 'login_telegram');
                        formData.append('id_token', data.id_token || '');
                        formData.append('platform', 'web');
                        formData.append('device', getAuthDeviceName());

                        const res = await fetch((window.APP_BASE_PATH || '/') + 'server/api.php', { method: 'POST', body: formData }).then(r => r.json());
                        if (res.status === 'ok') {
                            localStorage.setItem('pg_token', res.token);
                            logAuthClientEvent('telegram_login_success');
                            window.location.reload();
                        } else {
                            if (loginLoading) loginLoading.style.display = 'none';
                            logAuthClientEvent('telegram_login_failed', { status: res.status || 'error' });
                            if (window.showAlert) window.showAlert('Ошибка входа', res.message || 'Не удалось войти', 'error');
                        }
                    } catch (e) {
                        if (loginLoading) loginLoading.style.display = 'none';
                        console.error('Telegram Login error:', e);
                        logAuthClientEvent('telegram_login_network_error', { message: e.message });
                        if (window.showAlert) window.showAlert('Ошибка сети', e.message, 'error');
                    }
                }
            );
        } catch (e) {
            console.error('Telegram.Login.auth failed:', e);
            logAuthClientEvent('telegram_login_exception', { message: e.message });
            loginViaBot();
        }
    }

    // === Fallback: Login via Bot (polling) ===
    async function loginViaBot() {
        try {
            const res = await fetch((window.APP_BASE_PATH || '/') + 'server/api.php', {
                method: 'POST',
                body: new URLSearchParams({ action: 'create_auth_session' })
            }).then(r => r.json());

            if (res.status === 'ok') {
                const pending = savePendingBotAuth(res.temp_code, res.bot_url);
                logAuthClientEvent('bot_auth_started');
                openBotAuthUrl(res.bot_url);
                startBotAuthPolling(pending);

            } else {
                logAuthClientEvent('bot_auth_start_failed', { status: res.status || 'error' });
                if (window.showAlert) window.showAlert('Ошибка', 'Не удалось создать сессию авторизации', 'error');
            }
        } catch (e) {
            console.error(e);
            logAuthClientEvent('bot_auth_start_exception', { message: e.message });
            setBotAuthStatus('Не удалось открыть вход через бота. Проверь соединение и попробуй ещё раз.');
        }
    }

    // === QR Login (Browser) ===
    let qrAuthPollTimer = null;
    let qrAuthTimeoutTimer = null;
    let qrAuthData = null; // Stores intent_id and browser_secret in memory only
    let qrAuthCountdownTimer = null;

    function setQrAuthStatus(message, showRefresh = false) {
        const container = document.getElementById('qr-auth-container');
        const statusEl = document.getElementById('qr-auth-status');
        const refreshBtn = document.getElementById('qr-refresh-btn');
        if (!container || !statusEl) return;

        container.style.display = 'block';
        statusEl.textContent = message || '';
        if (refreshBtn) refreshBtn.style.display = showRefresh ? 'block' : 'none';
    }

    function clearQrAuthPolling(clearData = true) {
        if (qrAuthPollTimer) clearInterval(qrAuthPollTimer);
        if (qrAuthTimeoutTimer) clearTimeout(qrAuthTimeoutTimer);
        if (qrAuthCountdownTimer) clearInterval(qrAuthCountdownTimer);

        const countdownEl = document.getElementById('qr-auth-countdown');
        if (countdownEl) countdownEl.style.display = 'none';

        qrAuthPollTimer = null;
        qrAuthTimeoutTimer = null;
        qrAuthCountdownTimer = null;
        if (clearData) {
            qrAuthData = null;
        }
    }

    function handleQrExpired(message = 'QR код больше не действителен.') {
        clearQrAuthPolling();
        setQrAuthStatus(message, true);
        const wrapper = document.getElementById('qr-code-wrapper');
        if (wrapper) wrapper.style.opacity = '0.3';
    }

    function startQrCountdown(expiresAtStr) {
        const countdownEl = document.getElementById('qr-auth-countdown');
        const textEl = document.getElementById('qr-auth-countdown-text');
        if (!countdownEl || !textEl || !expiresAtStr) return;

        const expiresAtMs = new Date(expiresAtStr.replace(' ', 'T')).getTime();
        countdownEl.style.display = 'inline-flex';

        function update() {
            const diffMs = expiresAtMs - Date.now();
            if (diffMs <= 0) {
                if (qrAuthCountdownTimer) clearInterval(qrAuthCountdownTimer);
                countdownEl.style.display = 'none';
                return;
            }
            const diffSec = Math.floor(diffMs / 1000);
            const m = Math.floor(diffSec / 60);
            const s = diffSec % 60;
            const timeStr = m + ':' + (s < 10 ? '0' : '') + s;

            if (diffSec <= 15) {
                textEl.textContent = 'Осталось ' + timeStr;
            } else {
                textEl.textContent = 'Код действует ещё ' + timeStr;
            }
        }

        update();
        qrAuthCountdownTimer = setInterval(update, 1000);
    }

    async function startQrLogin() {
        const wrapper = document.getElementById('qr-code-wrapper');
        const loginLoading = document.getElementById('qr-loading');

        clearQrAuthPolling();
        if (wrapper) wrapper.innerHTML = '';
        if (wrapper) {
            wrapper.style.display = 'none';
            wrapper.style.opacity = '1';
        }

        setQrAuthStatus('Создаю код для входа...', false);
        if (loginLoading) loginLoading.style.display = 'inline-block';

        try {
            const res = await fetch((window.APP_BASE_PATH || '/') + 'server/api.php', {
                method: 'POST',
                body: new URLSearchParams({ action: 'create_qr_login_intent' })
            }).then(r => r.json());

            if (loginLoading) loginLoading.style.display = 'none';

            if (res.status === 'ok' && res.qr_payload) {
                qrAuthData = {
                    intent_id: res.intent_id,
                    browser_secret: res.browser_secret
                };

                if (wrapper) {
                    wrapper.style.display = 'inline-block';
                    new QRCode(wrapper, {
                        text: res.qr_payload,
                        width: 200,
                        height: 200,
                        colorDark: "#000000",
                        colorLight: "#ffffff",
                        correctLevel: QRCode.CorrectLevel.M
                    });
                }

                setQrAuthStatus('Откройте Party Games в Telegram, выберите “Войти на компьютере” и отсканируйте код.', false);

                if (res.expires_at) {
                    startQrCountdown(res.expires_at);
                }

                qrAuthPollTimer = setInterval(pollQrLogin, 2000);

                qrAuthTimeoutTimer = setTimeout(() => {
                    handleQrExpired('Срок действия QR истёк.');
                }, 90000);

            } else {
                setQrAuthStatus('Не удалось создать QR код. Попробуйте еще раз.', true);
            }
        } catch (e) {
            if (loginLoading) loginLoading.style.display = 'none';
            console.error(e);
            setQrAuthStatus('Ошибка соединения при создании QR.', true);
        }
    }

    async function pollQrLogin() {
        if (!qrAuthData) return;

        try {
            const res = await fetch((window.APP_BASE_PATH || '/') + 'server/api.php', {
                method: 'POST',
                body: new URLSearchParams({
                    action: 'poll_qr_login_intent',
                    intent_id: qrAuthData.intent_id,
                    browser_secret: qrAuthData.browser_secret
                })
            }).then(r => r.json());

            if (res.status === 'expired' || res.status === 'denied' || res.status === 'error' || res.status === 'consumed') {
                handleQrExpired(res.status === 'denied' ? 'Вход отклонён на телефоне.' : 'Срок действия QR истёк.');
                return;
            }

            if (res.status === 'scanned') {
                setQrAuthStatus('Код отсканирован. Подтвердите вход на телефоне.', false);
            }

            if (res.status === 'approved') {
                clearQrAuthPolling(false);
                setQrAuthStatus('Вход подтверждён! Авторизация...', false);
                redeemQrLogin();
            }
        } catch (e) {
            console.warn('QR poll error', e);
        }
    }

    async function redeemQrLogin() {
        if (!qrAuthData) return;
        const loginLoading = document.getElementById('qr-loading');
        if (loginLoading) loginLoading.style.display = 'inline-block';

        const intentId = qrAuthData.intent_id;
        const browserSecret = qrAuthData.browser_secret;

        // Clear immediately so we don't accidentally redeem twice
        qrAuthData = null;

        try {
            const res = await fetch((window.APP_BASE_PATH || '/') + 'server/api.php', {
                method: 'POST',
                body: new URLSearchParams({
                    action: 'redeem_qr_login_intent',
                    intent_id: intentId,
                    browser_secret: browserSecret
                })
            }).then(r => r.json());

            if (res.status === 'ok' && res.token) {
                localStorage.setItem('pg_token', res.token);
                if (window.AuthManager) window.AuthManager.setAuthToken(res.token);
                window.location.reload();
            } else {
                if (loginLoading) loginLoading.style.display = 'none';
                handleQrExpired('Не удалось получить сессию. Попробуйте ещё раз.');
            }
        } catch (e) {
            if (loginLoading) loginLoading.style.display = 'none';
            handleQrExpired('Ошибка сети при входе. Попробуйте ещё раз.');
        }
    }

    window.addEventListener('beforeunload', clearQrAuthPolling);
    window.addEventListener('screenChanged', (e) => {
        if (e.detail && e.detail.screenId !== 'screen-login') {
            clearQrAuthPolling();
        }
    });

    // === Sessions: TTL button selector ===
    function selectTtl(btn, days) {
        document.querySelectorAll('.ttl-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        if (window.SessionManager) window.SessionManager.updateTtl(days);
    }

    // === Load sessions count hint when settings screen is opened ===
    window.addEventListener('screenChanged', async (e) => {
        if (e.detail.screenId !== 'screen-settings') return;
        const hint = document.getElementById('sessions-count-hint');
        if (!hint) return;
        const res = await window.apiRequest({ action: 'get_sessions' });
        if (res && res.status === 'ok') {
            hint.textContent = `${res.sessions.length} из ${res.max} активных устройств`;
            // Sync TTL buttons
            document.querySelectorAll('.ttl-btn').forEach(b => {
                b.classList.toggle('active', b.dataset.days === String(res.ttl_days));
            });
        }
    });
</script>
