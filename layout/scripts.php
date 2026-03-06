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
<script src="https://telegram.org/js/telegram-login.js"></script>

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
<script src="js/modules/game-manager.js?v=<?php echo $v; ?>"></script>
<script src="js/modules/room-manager.js?v=<?php echo $v; ?>"></script>
<script src="js/modules/ai-manager.js?v=<?php echo $v; ?>"></script>
<script src="js/modules/avatar-editor.js?v=<?php echo $v; ?>"></script>

<!-- Main App Logic -->
<script src="js/app.js?v=<?php echo $v; ?>"></script>

<!-- Auth Helpers -->
<script>
    // === NEW: Telegram Login (OIDC) ===
    async function loginViaTelegram() {
        const loginLoading = document.getElementById('login-loading');
        // Check if Telegram.Login is available
        if (!window.Telegram || !window.Telegram.Login) {
            console.warn('Telegram.Login not available, falling back to bot login');
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
                        return;
                    }

                    if (loginLoading) loginLoading.style.display = 'block';

                    try {
                        const formData = new FormData();
                        formData.append('action', 'login_telegram');
                        formData.append('id_token', data.id_token || '');

                        const res = await fetch('server/api.php', { method: 'POST', body: formData }).then(r => r.json());
                        if (res.status === 'ok') {
                            localStorage.setItem('pg_token', res.token);
                            window.location.reload();
                        } else {
                            if (loginLoading) loginLoading.style.display = 'none';
                            if (window.showAlert) window.showAlert('Ошибка входа', res.message || 'Не удалось войти', 'error');
                        }
                    } catch (e) {
                        if (loginLoading) loginLoading.style.display = 'none';
                        console.error('Telegram Login error:', e);
                        if (window.showAlert) window.showAlert('Ошибка сети', e.message, 'error');
                    }
                }
            );
        } catch (e) {
            console.error('Telegram.Login.auth failed:', e);
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
                window.open(res.bot_url, '_blank');

                // Start polling
                const poll = setInterval(async () => {
                    const check = await fetch('server/api.php', {
                        method: 'POST',
                        body: new URLSearchParams({
                            action: 'poll_auth_session',
                            temp_code: res.temp_code
                        })
                    }).then(r => r.json());

                    if (check.status === 'ok') {
                        clearInterval(poll);
                        localStorage.setItem('pg_token', check.token);
                        window.location.reload();
                    }
                }, 2000);

                // Stop polling after 5 mins
                setTimeout(() => clearInterval(poll), 300000);

            } else {
                if (window.showAlert) window.showAlert('Ошибка', 'Не удалось создать сессию авторизации', 'error');
            }
        } catch (e) {
            console.error(e);
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