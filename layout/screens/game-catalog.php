<!-- Screen: Game Catalog -->
<div id="screen-game-catalog" class="screen"
    style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; height: 100% !important; overflow-y: auto; -webkit-overflow-scrolling: touch; background: var(--bg-app); width: 100%; z-index: 999;">

    <!-- Header & Filters combined -->
    <div class="game-catalog-header">
        <!-- Top Row: Back & Title -->
        <div class="d-flex align-items-center justify-content-between px-3 w-100 mb-1">
            <button class="btn-catalog-back" onclick="showScreen('lobby')" aria-label="Назад">
                <i class="bi bi-chevron-left" aria-hidden="true"></i>
            </button>
            <div class="game-catalog-header-title">Каталог игр</div>
            <div style="width: 40px;"></div> <!-- Spacer for centering -->
        </div>

        <!-- Bottom Row: Filters -->
        <div class="d-flex gap-2 overflow-auto px-3 pb-2 pt-1 w-100 no-scrollbar" id="game-cat-filters-catalog"
            style="white-space: nowrap;">
            <button class="btn btn-sm rounded-pill px-3 fw-bold filter-tab active" data-cat="all">Все</button>
            <button class="btn btn-sm rounded-pill px-3 fw-bold filter-tab" data-cat="party">Вечеринка</button>
            <button class="btn btn-sm rounded-pill px-3 fw-bold filter-tab" data-cat="logic">Логика</button>
        </div>
    </div>

    <!-- Games List -->
    <div class="game-catalog-content" id="all-games-list">
        <!-- Rendered via JS -->
    </div>

    <!-- Bottom Spacer -->
    <div style="height: 40px;"></div>
</div>