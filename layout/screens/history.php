<!-- ГЛАВНЫЙ ЭКРАН ИСТОРИИ ИГР -->
<div id="screen-history" class="screen" style="display: none; height: 100vh; overflow-y: auto;">
    <!-- Modern Header -->
    <div class="menu-header glass-header px-3"
        style="padding-top: calc(20px + env(safe-area-inset-top)); padding-bottom: 15px; position: sticky; top: 0; z-index: 100;">
        <div class="d-flex align-items-center">
            <button class="btn btn-icon text-dark me-2" onclick="showScreen('lobby')" aria-label="Назад">
                <i class="bi bi-chevron-left fs-4" aria-hidden="true"></i>
            </button>
            <h4 class="mb-0 fw-bold header-title">История игр</h4>
        </div>
    </div>

    <div class="container py-3 content-wrapper px-3" id="history-list-container">
        <!-- Loader -->
        <div id="history-loader" class="text-center py-5">
            <div class="spinner-border text-primary text-opacity-50" role="status">
                <span class="visually-hidden">Загрузка...</span>
            </div>
        </div>

        <!-- List will be populated here -->
        <div id="history-content-list" class="d-flex flex-column gap-3"></div>

        <!-- Empty State -->
        <div id="history-empty" class="text-center mt-5" style="display: none;">
            <div class="empty-state-icon text-muted mb-3 opacity-50" aria-hidden="true">
                <i class="bi bi-controller" style="font-size: 4rem;"></i>
            </div>
            <h5 class="fw-bold mb-2">Здесь пока пусто</h5>
            <p class="text-muted small">Вы еще не сыграли ни одной игры. Сыграйте с друзьями, чтобы здесь появилась
                статистика!</p>
            <button class="btn btn-primary rounded-pill mt-3 px-4 shadow-sm" onclick="showScreen('lobby')">В
                лобби</button>
        </div>
    </div>
</div>