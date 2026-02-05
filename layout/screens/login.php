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

            <!-- Alternative Login -->
            <button class="btn-premium-tg" onclick="loginViaBot()">
                <i class="bi bi-robot"></i>
                <span>Войти через бота</span>
            </button>

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