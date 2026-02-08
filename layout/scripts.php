<?php
/** @var string $v Asset version */
?>
<!-- JS Libraries -->
<script src="libs/bootstrap.bundle.min.js"></script>
<script src="libs/qrcode.min.js"></script>

<!-- Core Data & Config -->
<script src="js/audio.js?v=<?php echo $v; ?>"></script>
<script src="js/config/games-config.js?v=<?php echo $v; ?>"></script>

<!-- API & Framework -->
<script src="js/modules/api-manager.js?v=<?php echo $v; ?>"></script>
<script src="js/modules/theme-manager.js?v=<?php echo $v; ?>"></script>
<script src="js/modules/ui-manager.js?v=<?php echo $v; ?>"></script>

<!-- Feature Modules -->
<script type="module" src="js/modules/display-avatars.js?v=<?php echo $v; ?>"></script>
<script src="js/modules/auth-manager.js?v=<?php echo $v; ?>"></script>
<script src="js/modules/social-manager.js?v=<?php echo $v; ?>"></script>
<script src="js/modules/game-manager.js?v=<?php echo $v; ?>"></script>
<script src="js/modules/room-manager.js?v=<?php echo $v; ?>"></script>
<script src="js/modules/ai-manager.js?v=<?php echo $v; ?>"></script>
<script src="js/modules/avatar-editor.js?v=<?php echo $v; ?>"></script>

<!-- Main App Logic -->
<script src="js/app.js?v=<?php echo $v; ?>"></script>

<!-- Auth Helpers (Extracted from index.html) -->
<script>
    // Callback for the widget
    async function onTelegramAuth(user) {
        // Find elements safely
        const loginBtn = document.getElementById('browser-login-btn');
        const loginLoading = document.getElementById('login-loading');

        if (loginBtn) loginBtn.style.display = 'none';
        if (loginLoading) loginLoading.style.display = 'block';

        const formData = new FormData();
        formData.append('action', 'login_widget');
        formData.append('user_data', JSON.stringify(user));

        try {
            const res = await fetch('server/api.php', { method: 'POST', body: formData }).then(r => r.json());
            if (res.status === 'ok') {
                localStorage.setItem('pg_token', res.token);
                window.location.reload();
            } else {
                if (window.showAlert) window.showAlert('Ошибка входа', res.message, 'error');
                if (loginBtn) loginBtn.style.display = 'block';
            }
        } catch (e) {
            console.error(e);
            if (window.showAlert) window.showAlert('Ошибка сети', e.message, 'error');
        }
    }

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
</script>