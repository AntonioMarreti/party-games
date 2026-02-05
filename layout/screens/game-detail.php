<!-- Screen: Game Detail -->
<div id="screen-game-detail" class="screen"
    style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; height: 100% !important; overflow: hidden !important; background: #fff; width: 100%; z-index: 1000;">

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
            style="background: rgba(255, 255, 255, 0.98); backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px); pointer-events: auto; padding-bottom: calc(20px + env(safe-area-inset-bottom)) !important;">
            <button class="btn btn-primary w-100 py-3 rounded-4 fw-bold shadow-lg" id="btn-try-game-now"
                style="border: none; font-size: 16px; background: linear-gradient(135deg, #007AFF 0%, #00C6FF 100%); letter-spacing: 0.5px;">
                ПОПРОБОВАТЬ СЕЙЧАС
            </button>
        </div>
    </div>

    <div class="h-100"
        style="overflow-y: auto; overflow-x: hidden; width: 100%; -webkit-overflow-scrolling: touch; z-index: 1;">
        <div class="game-detail-wrapper"
            style="background: #fff; padding-bottom: 200px; width: 100%; overflow-x: hidden;">
            <!-- Cinematic Hero -->
            <div class="game-detail-hero position-relative"
                style="height: auto; aspect-ratio: 16/11; min-height: 300px; overflow:hidden; background: #000;">
                <div id="game-detail-image-container" class="hero-image-wrap h-100 w-100 position-absolute"
                    style="top:0; left:0; right:0; z-index:1; margin:0 auto;">
                    <!-- Content injected via JS -->
                </div>
            </div>

            <!-- Content -->
            <div class="p-4 bg-white">
                <div class="d-flex overflow-auto pb-4 mb-4 border-bottom no-scrollbar" style="gap: 24px;">
                    <div class="flex-shrink-0 text-center"
                        style="min-width: 80px; border-right: 1px solid #f2f2f7; padding-right: 24px;">
                        <div class="text-muted small mb-1"
                            style="font-size: 10px; font-weight: 700; text-transform: uppercase;">
                            Игроков
                        </div>
                        <div class="fw-bold" id="stat-players" style="font-size: 17px; color: var(--text-main);">-
                        </div>
                    </div>
                    <div class="flex-shrink-0 text-center"
                        style="min-width: 80px; border-right: 1px solid #f2f2f7; padding-right: 24px;">
                        <div class="text-muted small mb-1"
                            style="font-size: 10px; font-weight: 700; text-transform: uppercase;">Время
                        </div>
                        <div class="fw-bold" id="stat-time" style="font-size: 17px; color: var(--text-main);">-</div>
                    </div>
                    <div class="flex-shrink-0 text-center" style="min-width: 80px;">
                        <div class="text-muted small mb-1"
                            style="font-size: 10px; font-weight: 700; text-transform: uppercase;">
                            Сложность
                        </div>
                        <div class="fw-bold" id="stat-difficulty" style="font-size: 17px; color: var(--text-main);">-
                        </div>
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
            </div>
        </div>
    </div> <!-- /h-100 scroller layer -->
</div> <!-- /screen-game-detail -->