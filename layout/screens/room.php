<!-- ЭКРАН КОМНАТЫ -->
<div id="screen-room" class="screen">
    <div class="room-content-wrapper">

        <!-- Шапка комнаты с меню -->
        <div class="d-flex justify-content-between align-items-center mb-3 px-1">
            <div class="fw-black" style="font-size: 1.4rem; color: var(--text-main); letter-spacing: -0.02em;">
                Комната
            </div>
            <button class="btn btn-outline-danger btn-sm rounded-pill fw-bold d-flex align-items-center" onclick="leaveRoom()" style="padding: 0.35rem 0.85rem; font-size: 0.85rem; border-color: rgba(220, 53, 69, 0.3); background: rgba(220, 53, 69, 0.05);">
                <i class="bi bi-box-arrow-right me-1"></i> Выйти
            </button>
        </div>

        <!-- Карточка с кодом -->
        <div class="room-code-card">
            <button type="button" class="btn-unstyled room-code-text" id="room-code-display" onclick="openQrModal()"
                title="Нажми, чтобы показать QR">
                ...
            </button>

            <button class="btn-share-code" onclick="openQrModal()" aria-label="Поделиться">
                <i class="bi bi-share-fill" aria-hidden="true"></i>
            </button>
        </div>

        <!-- Игроки -->
        <h6 class="text-start fw-bold mb-3 px-1" style="font-size: 14px;">Игроки (<span id="players-count">0</span>)
        </h6>
        <div class="players-grid" id="players-list"></div>

        <!-- Выбор игры (только Хост) -->
        <div id="host-controls" style="display:none; width: 100%; margin-top: auto;">
            <button type="button" class="btn-unstyled game-setting-card" data-bs-toggle="modal"
                data-bs-target="#gameSelectorModal">
                <div class="d-flex align-items-center">
                    <div class="game-setting-icon" id="selected-game-icon-bg"><i class="bi bi-lightning-fill"
                            id="selected-game-icon" aria-hidden="true"></i></div>
                    <div style="text-align: left;">
                        <div style="font-size: 12px; color: #888;">Выбрать игру</div>
                        <div style="font-weight: 700; font-size: 16px;" id="selected-game-name">...
                        </div>
                    </div>
                </div>
                <i class="bi bi-chevron-right text-muted" aria-hidden="true"></i>
            </button>
            <div id="durak-rule-settings" class="mb-3" hidden>
                <div class="card border-0 shadow-sm rounded-4" style="background: var(--bg-secondary);">
                    <div class="card-body p-3">
                        <div class="d-flex justify-content-between align-items-center mb-2">
                            <label class="form-check-label fw-medium" for="durak-allow-throw-in">Подкидывание</label>
                            <div class="form-check form-switch m-0">
                                <input class="form-check-input" type="checkbox" id="durak-allow-throw-in" checked>
                            </div>
                        </div>
                        <div class="d-flex justify-content-between align-items-center">
                            <label class="form-check-label fw-medium" for="durak-allow-transfer">Перевод</label>
                            <div class="form-check form-switch m-0">
                                <input class="form-check-input" type="checkbox" id="durak-allow-transfer">
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <button class="btn-start-floating" id="btn-start-game">Начать игру</button>
        </div>

        <!-- Ожидание (только Гость) -->
        <div id="guest-waiting-msg" class="text-center text-muted w-100" style="margin-top: auto; display: none;">
            <div class="spinner-border text-primary mb-3" role="status"></div>
            <p>Ожидание хоста, пожалуйста, подождите...</p>
            <button class="btn btn-sm btn-link text-danger text-decoration-none" onclick="leaveRoom()">Покинуть
                комнату</button>
        </div>
    </div>
</div>
