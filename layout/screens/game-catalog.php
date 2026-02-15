<!-- Screen: Game Catalog -->
<div id="screen-game-catalog" class="screen"
    style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; height: 100% !important; overflow-y: auto; -webkit-overflow-scrolling: touch; background: var(--bg-app); width: 100%; z-index: 999;">

    <!-- Header -->
    <div class="game-catalog-header">
        <button class="btn-catalog-back" onclick="showScreen('lobby')">
            <i class="bi bi-chevron-left"></i>
        </button>
        <div class="game-catalog-header-title">Каталог игр</div>
        <div style="width: 40px;"></div> <!-- Spacer for centering -->
    </div>

    <!-- Games List -->
    <div class="game-catalog-content" id="all-games-list">
        <!-- Rendered via JS -->
    </div>

    <!-- Bottom Spacer -->
    <div style="height: 40px;"></div>
</div>