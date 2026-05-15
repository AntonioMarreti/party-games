<!-- ТАБ 2: БИБЛИОТЕКА И ПОИСК -->
<div id="tab-games" class="tab-content" style="display: none;">
    <div class="header-bg">
        <div class="header-title">Комнаты</div>
        <div class="header-subtitle">Открытые игры</div>
        <div class="position-relative">
            <i class="bi bi-search position-absolute text-white" style="top: 27px; right: 15px; opacity: 0.7;"></i>
            <input type="text" class="search-bar ps-3" placeholder="Поиск комнат...">
        </div>
    </div>
    <div class="content-wrapper pt-4" style="padding-bottom: calc(110px + env(safe-area-inset-bottom));">

        <div id="public-rooms-list" data-public-rooms-list="games" class="mb-4 position-relative">
            <!-- Empty State HTML injected by JS -->
        </div>

        <div style="height: 100px;"></div>
    </div>
</div>
