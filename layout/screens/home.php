<!-- Tab: Home -->
<div id="tab-home" class="tab-content active-tab">
    <div class="header-bg home-hero">
        <div class="d-flex align-items-start justify-content-between gap-3 mb-3">
            <div>
                <div class="header-title">Во что поиграем?</div>
            </div>
            <div id="lobby-user-avatar" onclick="switchTab('profile')" style="cursor: pointer;">
            </div>
        </div>
        <p class="home-hero-text mb-0">
            Создайте комнату, позовите друзей и начните за минуту.
        </p>
    </div>

    <div class="content-wrapper home-flow pt-4">
        <button type="button" class="btn-unstyled home-primary-cta" data-bs-toggle="modal" data-bs-target="#createModal">
            <span class="home-primary-cta-icon"><i class="bi bi-people-fill" aria-hidden="true"></i></span>
            <span>
                <span class="home-primary-cta-title">Собрать компанию</span>
                <span class="home-primary-cta-desc">Создать комнату и отправить приглашение</span>
            </span>
            <i class="bi bi-chevron-right ms-auto" aria-hidden="true"></i>
        </button>

        <div class="home-secondary-actions">
            <button type="button" class="btn-unstyled home-secondary-action" data-bs-toggle="modal" data-bs-target="#joinModal">
                <i class="bi bi-box-arrow-in-right" aria-hidden="true"></i>
                <span>Войти по коду</span>
            </button>
            <button type="button" class="btn-unstyled home-secondary-action"
                onclick="document.getElementById('home-public-rooms-section')?.scrollIntoView({behavior:'smooth', block:'start'});">
                <i class="bi bi-people" aria-hidden="true"></i>
                <span>Открытые комнаты</span>
            </button>
        </div>

        <section class="home-section">
            <div class="section-title">Хочу играть</div>
            <div class="play-mode-grid" id="home-play-modes" role="list">
                <button type="button" class="btn-unstyled play-mode-card active" data-home-game-filter="company">
                    <i class="bi bi-people-fill" aria-hidden="true"></i>
                    <span class="play-mode-copy">
                        <span>Компания</span>
                    </span>
                </button>
                <button type="button" class="btn-unstyled play-mode-card" data-home-game-filter="duo">
                    <i class="bi bi-person-hearts" aria-hidden="true"></i>
                    <span class="play-mode-copy">
                        <span>Вдвоём</span>
                    </span>
                </button>
                <button type="button" class="btn-unstyled play-mode-card" data-home-game-filter="solo">
                    <i class="bi bi-person-fill" aria-hidden="true"></i>
                    <span class="play-mode-copy">
                        <span>Соло</span>
                    </span>
                </button>
            </div>
        </section>

        <section class="home-section">
            <div class="home-section-header">
                <div class="section-title mb-0">Рекомендуемые игры</div>
                <button type="button" class="btn-unstyled home-section-link" onclick="openGameCatalog()">Все игры →</button>
            </div>
            <div class="recommended-games-list" id="popular-games-list">
                <div class="text-center w-100 opacity-50 py-3">
                    <div class="spinner-border spinner-border-sm"></div>
                </div>
            </div>
        </section>

        <section class="home-section" id="home-public-rooms-section">
            <div id="home-public-rooms-list" data-public-rooms-list="home" class="position-relative">
                <div class="text-center w-100 opacity-50 py-3">
                    <div class="spinner-border spinner-border-sm"></div>
                </div>
            </div>
        </section>
    </div>
</div>
