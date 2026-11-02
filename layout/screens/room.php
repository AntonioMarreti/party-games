<!-- ЭКРАН КОМНАТЫ -->
<div id="screen-room" class="screen">
    <div class="room-content-wrapper">

        <!-- Шапка комнаты -->
        <div class="room-top-bar">
            <h2 class="room-title">Комната</h2>
            <button type="button" class="btn room-leave-btn" onclick="leaveRoom()" aria-label="Выйти из комнаты">
                <i class="bi bi-box-arrow-right"></i>
                <span>Выйти</span>
            </button>
        </div>

        <!-- Карточка с кодом комнаты -->
        <div class="room-code-card">
            <div class="room-code-info" onclick="openQrModal()" role="button" tabindex="0" title="Нажмите, чтобы показать QR и ссылку">
                <span class="room-code-label">Код комнаты</span>
                <span class="room-code-value" id="room-code-display">...</span>
            </div>
            <div class="room-code-actions">
                <button type="button" class="btn room-action-btn" onclick="openQrModal()" aria-label="Поделиться или QR-код" title="QR-код и ссылка">
                    <i class="bi bi-qr-code-scan"></i>
                </button>
                <button type="button" class="btn room-action-btn room-action-btn-primary" onclick="openInviteModal()" aria-label="Пригласить друзей" title="Позвать друга">
                    <i class="bi bi-person-plus-fill"></i>
                </button>
            </div>
        </div>

        <!-- Выбор игры (Центральный блок лобби) -->
        <div class="room-game-section">
            <button type="button" class="btn-unstyled game-setting-card" id="room-game-setting-card"
                data-bs-toggle="modal" data-bs-target="#gameSelectorModal">
                <div class="d-flex align-items-center flex-grow-1 min-w-0">
                    <div class="game-setting-icon" id="selected-game-icon-bg">
                        <i class="bi bi-lightning-fill" id="selected-game-icon" aria-hidden="true"></i>
                    </div>
                    <div class="game-setting-details text-start min-w-0 flex-grow-1">
                        <div class="game-setting-label" id="game-setting-caption">Выбранная игра</div>
                        <div class="game-setting-name text-truncate" id="selected-game-name">...</div>
                        <div class="game-setting-meta text-truncate" id="selected-game-meta"></div>
                    </div>
                </div>
                <div class="game-setting-action" id="game-setting-action">
                    <span class="game-setting-change-chip">Изменить</span>
                    <i class="bi bi-chevron-right text-muted" aria-hidden="true"></i>
                </div>
            </button>
        </div>

        <!-- Игроки -->
        <div class="room-players-section">
            <div class="room-players-header">
                <div class="room-players-title-wrap">
                    <h6 class="room-players-title">Игроки</h6>
                    <span class="room-players-chip"><span id="players-count">0</span><span id="players-max-count"></span></span>
                </div>
                <button type="button" class="btn-unstyled room-invite-link" onclick="openInviteModal()">
                    <i class="bi bi-person-plus me-1"></i>Позвать
                </button>
            </div>
            <div class="players-grid" id="players-list"></div>
        </div>

        <!-- Фиксированная нижняя панель действий -->
        <div class="room-bottom-bar">
            <!-- Старт игры (только Хост) -->
            <div id="host-controls" style="display:none; width: 100%;">
                <button class="btn-start-floating" id="btn-start-game">Начать игру</button>
            </div>

            <!-- Ожидание хоста (только Гость) -->
            <div id="guest-waiting-msg" class="guest-waiting-card" style="display: none; width: 100%;">
                <div class="spinner-border spinner-border-sm text-primary me-2" role="status"></div>
                <span class="guest-waiting-text">Ожидание хоста...</span>
                <button class="btn btn-sm btn-link text-danger text-decoration-none ms-auto p-0" onclick="leaveRoom()">Выйти</button>
            </div>
        </div>

    </div>
</div>
