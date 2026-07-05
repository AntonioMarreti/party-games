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

                <!-- New: Login via QR -->
                <button class="btn-link-subtle mt-2" onclick="startQrLogin()"
                    style="background:none; border:none; color:rgba(255,255,255,0.4); font-size:13px; cursor:pointer; text-decoration:underline; width:100%;">
                    Войти по QR
                </button>

                <div id="bot-auth-status" class="mt-3 text-white-50" style="display:none; font-size:12px; line-height:1.45;">
                </div>

                <div id="qr-auth-container" class="mt-3 text-center" style="display:none; background: rgba(0,0,0,0.2); border-radius: 12px; padding: 15px;">
                    <div id="qr-code-wrapper" class="mb-3 d-inline-block bg-white p-2 rounded" style="display:none;"></div>
                    <div class="d-flex justify-content-center align-items-center gap-2">
                        <div id="qr-loading" class="spinner-border spinner-border-sm text-white-50" role="status" style="display:none;"></div>
                        <p id="qr-auth-status" class="text-white-50 mb-0" style="font-size:12px; line-height:1.45;"></p>
                    </div>
                    <button id="qr-refresh-btn" class="btn btn-sm btn-outline-light mt-2" style="display:none; margin: 0 auto;" onclick="startQrLogin()">Обновить QR</button>
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
