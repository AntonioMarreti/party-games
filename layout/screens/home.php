<!-- Tab: Home -->
<div id="tab-home" class="tab-content active-tab">
    <div class="header-bg">
        <div class="d-flex align-items-center justify-content-between mb-2">
            <div>
                <div class="header-subtitle">Готов к вечеринке?</div>
                <div class="header-title" id="user-name-display">Привет!</div>
            </div>
            <div id="lobby-user-avatar" onclick="switchTab('profile')" style="cursor: pointer;">
            </div>
        </div>
    </div>

    <div class="content-wrapper pt-4">
        <div class="actions-grid">
            <button class="action-card" data-bs-toggle="modal" data-bs-target="#joinModal">
                <i class="bi bi-qr-code-scan action-icon"></i>
                <div class="action-title">Войти</div>
                <div class="action-desc">В комнату<br>по коду</div>
            </button>
            <button class="action-card" data-bs-toggle="modal" data-bs-target="#createModal">
                <i class="bi bi-controller action-icon"></i>
                <div class="action-title">Создать</div>
                <div class="action-desc">Новую комнату</div>
            </button>
        </div>

        <div class="section-title mt-4">Популярные игры</div>
        <div class="games-grid" id="popular-games-list">
            <!-- Dynamically loaded via app.js -->
            <div class="text-center w-100 opacity-50 py-3" style="grid-column: 1 / -1;">
                <div class="spinner-border spinner-border-sm"></div>
            </div>
        </div>
    </div>
</div>