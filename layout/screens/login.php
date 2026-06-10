<!-- Screen: Login -->
<div id="screen-login" class="screen">
    <div class="login-screen-wrap">
        <div class="login-bg-animated"></div>

        <div class="login-card">
            <div class="login-logo-circle">
                <i class="bi bi-controller"></i>
            </div>
            <h1 class="login-title">Party Games</h1>
            <p class="login-subtitle">Свет, камера, вечеринка! ✨</p>

            <div id="login-loading" class="spinner-border text-light mb-4" role="status" style="display:none;">
            </div>

            <!-- Standard Login (Browser) -->
            <div id="login-methods-standard">
                <button class="btn-premium-tg" onclick="loginViaTelegram()">
                    <i class="bi bi-telegram"></i>
                    <span>Войти через Telegram</span>
                </button>

                <!-- Fallback: Login via Bot -->
                <button class="btn-link-subtle mt-2" onclick="loginViaBot()"
                    style="background:none; border:none; color:rgba(255,255,255,0.4); font-size:13px; cursor:pointer; text-decoration:underline; width:100%;">
                    Не работает? Войти через бота
                </button>

                <div id="bot-auth-status" class="mt-3 text-white-50" style="display:none; font-size:12px; line-height:1.45;">
                </div>
            </div>

            <!-- TMA Login (Hidden by default, shown via JS if initData present) -->
            <div id="login-methods-tma" style="display:none;">
                <button class="btn-premium-tg" onclick="window.location.reload()">
                    <i class="bi bi-arrow-clockwise"></i>
                    <span>Попробовать снова</span>
                </button>
                <p class="mt-3 text-white-50" style="font-size: 12px;">Похоже, возникла проблема с загрузкой данных Telegram.</p>
            </div>


        </div>
    </div>
</div>
