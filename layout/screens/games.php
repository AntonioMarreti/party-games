<!-- ТАБ 2: БИБЛИОТЕКА И ПОИСК -->
<div id="tab-games" class="tab-content" style="display: none;">
    <div class="header-bg rooms-header">
        <div class="header-title">Открытые игры</div>
        <div class="header-subtitle">Найдите компанию или запишитесь на игру</div>
        <div class="rooms-search-wrap">
            <i class="bi bi-search rooms-search-icon" aria-hidden="true"></i>
            <input type="text" class="search-bar" placeholder="Найти игру..." aria-label="Поиск игр">
        </div>
    </div>
    <div class="content-wrapper rooms-content-wrapper" style="padding-bottom: calc(110px + env(safe-area-inset-bottom));">

        <div class="rooms-mode-switch mb-3" role="tablist" aria-label="Режим открытых игр">
            <button type="button" class="rooms-mode-btn active" data-rooms-mode="live"
                onclick="switchRoomsMode('live')">Сейчас</button>
            <button type="button" class="rooms-mode-btn" data-rooms-mode="scheduled"
                onclick="switchRoomsMode('scheduled')">Расписание</button>
        </div>

        <div id="public-rooms-list" data-public-rooms-list="games" data-rooms-panel="live" class="mb-4 position-relative">
            <!-- Empty State HTML injected by JS -->
        </div>
        <div id="scheduled-games-list" data-rooms-panel="scheduled" class="mb-4 position-relative" style="display:none;">
            <!-- Scheduled games injected by JS -->
        </div>

        <div style="height: 100px;"></div>
    </div>
</div>

<script src="js/modules/scheduled-game-invite.js?v=<?php echo $v; ?>"></script>
