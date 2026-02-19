<!-- Screen: Game Detail -->
<div id="screen-game-detail" class="screen"
    style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; height: 100% !important; overflow: hidden !important; background: var(--bg-app); width: 100%; z-index: 1000;">

    <!-- FIXED UI LAYER -->
    <div class="fixed-ui-layer position-absolute w-100 h-100"
        style="top:0; left:0; z-index: 100; pointer-events: none;">
        <!-- Close Button -->
        <div class="position-absolute"
            style="top: calc(44px + env(safe-area-inset-top)); right: 20px; pointer-events: auto;">
            <button class="btn d-flex align-items-center justify-content-center shadow-lg"
                onclick="window.showScreen('lobby')"
                style="width:40px; height:40px; border-radius:50%; background:rgba(0,0,0,0.5); backdrop-filter:blur(24px); -webkit-backdrop-filter:blur(24px); border:1px solid rgba(255,255,255,0.4); color:white; padding: 0; flex-shrink: 0; min-width: 40px;">
                <i class="bi bi-x-lg" style="font-size: 18px; line-height: 1;"></i>
            </button>
        </div>

        <!-- Bottom Action Button (Navbar style) -->
        <div class="position-absolute bottom-0 start-0 end-0 p-4 border-top"
            style="background: var(--bg-glass-strong); backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px); pointer-events: auto; padding-bottom: calc(20px + env(safe-area-inset-bottom)) !important; border-bottom-left-radius: 44px; border-bottom-right-radius: 44px; overflow: hidden; border-color: var(--border-glass) !important;">
            <button class="btn btn-primary w-100 py-3 rounded-4 fw-bold shadow-lg" id="btn-try-game-now"
                style="border: none; font-size: 16px; background: linear-gradient(135deg, #007AFF 0%, #00C6FF 100%); letter-spacing: 0.5px;">
                ПОПРОБОВАТЬ СЕЙЧАС
            </button>
        </div>
    </div>

    <!-- 1. FIXED HERO IN BACKGROUND (Stays put) -->
    <div id="game-detail-hero-fixed" class="position-absolute"
        style="top: 0; left: 0; width: 100%; height: 50vh; z-index: 0; overflow: hidden;">
        <div id="game-detail-image-container" class="w-100 h-100">
            <!-- Content injected via JS -->
        </div>
        <!-- Gradient Overlay for readability if needed, usually image has it -->
    </div>

    <!-- 2. SCROLLABLE LAYER (Scrolls over the hero) -->
    <div class="h-100 position-relative"
        style="overflow-y: auto; overflow-x: hidden; width: 100%; -webkit-overflow-scrolling: touch; z-index: 10;">

        <!-- Transparent Spacer to reveal Hero -->
        <div style="height: 42vh; width: 100%; pointer-events: none;"></div>

        <!-- Content Card -->
        <div class="game-detail-wrapper position-relative px-4 pt-4 pb-5 shadow-lg"
            style="background: var(--bg-secondary); min-height: 100vh; border-top-left-radius: 32px; border-top-right-radius: 32px;">

            <!-- HEADER ROW: Icon + Title + SVG Like -->
            <div class="d-flex align-items-center mb-4">
                <!-- Icon -->
                <div id="game-detail-icon-wrap"
                    class="rounded-4 d-flex align-items-center justify-content-center me-3 shadow-sm"
                    style="width: 64px; height: 64px; background: #666; color: white; font-size: 28px; flex-shrink: 0;">
                    <i id="game-detail-icon" class="bi bi-controller"></i>
                </div>

                <!-- Title & Subtitle -->
                <div class="flex-grow-1" style="min-width: 0;">
                    <h1 id="game-detail-header-title" class="fw-bold mb-1"
                        style="font-size: 22px; line-height: 1.2; letter-spacing: -0.5px; color: var(--text-main);">
                        Название
                    </h1>
                    <div id="game-detail-subtitle" class="text-muted small fw-medium text-truncate">
                        Вечеринки • Для компании
                    </div>
                </div>

                <!-- SVG Like Button -->
                <div id="game-detail-like-btn" class="like-btn-svg-wrapper"
                    style="width: 50px; height: 50px; cursor: pointer; margin-right: -10px;">
                    <!-- SVG Injected via JS or Static -->
                    <svg width="100%" height="100%" viewBox="0 0 500 500" style="overflow: visible;">
                        <g transform="scale(0.9) translate(30 30)">
                            <!-- Main Hearts -->
                            <path class="main-heart"
                                d="M211 226c9-9 21-14 34-14 29 0 50 26 50 54 0 34-53 77-78 95-5 3-7 3-12 0-25-18-78-61-78-95 0-28 21-54 50-54 13 0 25 5 34 14z"
                                style="fill: none; stroke: #ff3b30; stroke-width: 30; transition: all 0.3s; transform-origin: center;" />
                            <path class="fill-heart"
                                d="M211 226c9-9 21-14 34-14 29 0 50 26 50 54 0 34-53 77-78 95-5 3-7 3-12 0-25-18-78-61-78-95 0-28 21-54 50-54 13 0 25 5 34 14z"
                                style="fill: #ff3b30; transform: scale(0); transform-origin: center; transition: transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);" />

                        </g>
                    </svg>
                </div>
            </div>

            <!-- STATS ROW (Fixed grid, no scroll) -->
            <div class="d-flex justify-content-between align-items-center py-3 mb-4 border-top border-bottom"
                style="border-color: var(--divider) !important;">
                <div class="text-center flex-grow-1">
                    <div class="text-uppercase text-muted fw-bold mb-1" style="font-size: 10px; letter-spacing: 0.5px;">
                        Игроков</div>
                    <div class="fw-bold" id="stat-players" style="font-size: 16px; color: var(--text-main);">-</div>
                </div>
                <div class="vr bg-secondary opacity-25"></div>
                <div class="text-center flex-grow-1">
                    <div class="text-uppercase text-muted fw-bold mb-1" style="font-size: 10px; letter-spacing: 0.5px;">
                        Время</div>
                    <div class="fw-bold" id="stat-time" style="font-size: 16px; color: var(--text-main);">-</div>
                </div>
                <div class="vr bg-secondary opacity-25"></div>
                <div class="text-center flex-grow-1">
                    <div class="text-uppercase text-muted fw-bold mb-1" style="font-size: 10px; letter-spacing: 0.5px;">
                        Сложность</div>
                    <div class="fw-bold" id="stat-difficulty" style="font-size: 16px; color: var(--text-main);">-</div>
                </div>
            </div>

            <div id="game-detail-lore" class="mb-5"
                style="line-height: 1.6; font-size: 17px; font-weight: 400; color: var(--text-main) !important;">
            </div>

            <div class="mb-5">
                <h2 class="fw-bold mb-4" style="font-size: 22px; letter-spacing: -0.5px; color: var(--text-main);">
                    Как
                    играть?
                </h2>
                <div id="game-detail-rules" class="rules-list"></div>
            </div>

            <div id="game-detail-demo-area" class="mb-5"></div>

            <!-- Spacer for Fixed Bottom Bar -->
            <div style="height: 120px;"></div>
        </div>
    </div> <!-- /h-100 scroller layer -->
</div> <!-- /screen-game-detail -->