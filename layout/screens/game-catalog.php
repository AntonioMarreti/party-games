<!-- Screen: Game Catalog -->
<div id="screen-game-catalog" class="screen"
    style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; height: 100% !important; overflow-y: auto; -webkit-overflow-scrolling: touch; background: var(--bg-app); width: 100%; z-index: 999;">

    <div class="game-catalog-header">
        <div class="game-catalog-toprow">
            <button class="btn-catalog-back" onclick="showScreen('lobby')" aria-label="Назад">
                <i class="bi bi-chevron-left" aria-hidden="true"></i>
            </button>
            <div class="min-w-0">
                <div class="game-catalog-header-title">Каталог игр</div>
                <div class="game-catalog-header-subtitle">Подберите игру под компанию</div>
            </div>
            <div id="game-catalog-count" class="game-catalog-count">0</div>
        </div>

        <div class="game-catalog-filters no-scrollbar" id="game-cat-filters-catalog">
            <button class="catalog-filter-pill active" data-cat="all">
                <i class="bi bi-grid-fill" aria-hidden="true"></i><span>Все</span>
            </button>
            <button class="catalog-filter-pill" data-cat="company">
                <i class="bi bi-people-fill" aria-hidden="true"></i><span>Компания</span>
            </button>
            <button class="catalog-filter-pill" data-cat="duo">
                <i class="bi bi-person-hearts" aria-hidden="true"></i><span>Вдвоём</span>
            </button>
            <button class="catalog-filter-pill" data-cat="solo">
                <i class="bi bi-person-fill" aria-hidden="true"></i><span>Соло</span>
            </button>
        </div>
    </div>

    <div class="game-catalog-content" id="all-games-list">
    </div>
</div>
