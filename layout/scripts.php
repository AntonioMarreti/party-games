<?php
/** @var string $v Asset version */
if (!defined('TG_CLIENT_ID')) {
    require_once __DIR__ . '/../server/config.php';
}
?>
<!-- JS Libraries -->
<script src="libs/bootstrap.bundle.min.js"></script>
<script src="libs/qrcode.min.js"></script>

<!-- Telegram Login Library (OIDC) -->
<script src="https://telegram.org/js/telegram-login.js" defer></script>

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

    function logAuthClientEvent(event, extra = {}) {
        try {
            const body = getAuthFormData({
                action: 'log_client_error',
                message: 'auth_' + event,
                context: JSON.stringify({
                    event,
                    platform: window.Telegram?.WebApp?.platform || 'browser',
                    has_tma_init_data: !!(window.Telegram?.WebApp?.initData),
                    ua: navigator.userAgent || '',
                    ...extra
                })
            });
            fetch('server/api.php', { method: 'POST', body }).catch(() => { });
        } catch (e) {
            console.warn('[Auth] log failed', e);
        }
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
        const check = await fetch('server/api.php', {
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
        const explicitDebug = params.get('debug_dev_login') === '1' || localStorage.getItem('DEBUG_DEV_LOGIN') === '1';
        const localHost = ['localhost', '127.0.0.1', '::1'].includes(host);
        panel.style.display = (explicitDebug || localHost) ? 'block' : 'none';
    }

    // === NEW: Telegram Login (OIDC) ===
    async function loginViaTelegram() {
        const loginLoading = document.getElementById('login-loading');
        // Check if Telegram.Login is available
        if (!window.Telegram || !window.Telegram.Login) {
            console.warn('Telegram.Login not available, falling back to bot login');
            logAuthClientEvent('telegram_login_unavailable');
            loginViaBot();
            return;
        }

        try {
            Telegram.Login.auth(
                { client_id: '<?php echo TG_CLIENT_ID; ?>', request_access: 'write' },
                async (data) => {
                    if (!data) {
                        // User cancelled or error
                        console.log('Telegram Login: cancelled or failed');
                        logAuthClientEvent('telegram_login_cancelled');
                        setBotAuthStatus('Вход через Telegram не завершился. Можно попробовать ещё раз или нажать «Войти через бота».');
                        return;
                    }

                    if (loginLoading) loginLoading.style.display = 'block';

                    try {
                        const formData = new FormData();
                        formData.append('action', 'login_telegram');
                        formData.append('id_token', data.id_token || '');
                        formData.append('platform', 'web');
                        formData.append('device', getAuthDeviceName());

                        const res = await fetch('server/api.php', { method: 'POST', body: formData }).then(r => r.json());
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
            const res = await fetch('server/api.php', {
                method: 'POST',
                body: new URLSearchParams({ action: 'create_auth_session' })
            }).then(r => r.json());

            if (res.status === 'ok') {
                const pending = savePendingBotAuth(res.temp_code, res.bot_url);
                logAuthClientEvent('bot_auth_started');
                if (window.Telegram?.WebApp?.openTelegramLink) {
                    window.Telegram.WebApp.openTelegramLink(res.bot_url);
                } else {
                    window.open(res.bot_url, '_blank');
                }
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
