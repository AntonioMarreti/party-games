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
            </div>

            <!-- TMA Login (Hidden by default, shown via JS if initData present) -->
            <div id="login-methods-tma" style="display:none;">
                <button class="btn-premium-tg" onclick="window.location.reload()">
                    <i class="bi bi-arrow-clockwise"></i>
                    <span>Попробовать снова</span>
                </button>
                <p class="mt-3 text-white-50" style="font-size: 12px;">Похоже, возникла проблема с загрузкой данных Telegram.</p>
            </div>

            <!-- DEV LOGIN (REMOVE IN PRODUCTION) -->
            <div class="mt-4">
                <div class="d-flex justify-content-center gap-2 mb-2">
                    <button class="btn btn-sm btn-outline-light text-white-50 p-1" onclick="devLogin(1)">Dev 1</button>
                    <button class="btn btn-sm btn-outline-light text-white-50 p-1" onclick="devLogin(2)">Dev 2</button>
                    <button class="btn btn-sm btn-outline-light text-white-50 p-1" onclick="devLogin(3)">Dev 3</button>
                    <button class="btn btn-sm btn-outline-light text-white-50 p-1" onclick="devLogin(4)">Dev 4</button>
                </div>
            </div>
        </div>
    </div>
</div>