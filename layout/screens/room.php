<!-- ЭКРАН КОМНАТЫ -->
<div id="screen-room" class="screen">
    <div class="room-content-wrapper">

        <!-- Шапка комнаты с меню -->
        <div class="d-flex justify-content-center mb-3 position-relative">
            <div class="dropdown">
                <button class="btn room-header-dropdown-btn" type="button" data-bs-toggle="dropdown"
                    aria-expanded="false">
                    Комната <i class="bi bi-chevron-down ms-1" style="font-size: 10px; opacity: 0.6;"></i>
                </button>
                <ul class="dropdown-menu border-0 shadow-lg rounded-4 p-2 mt-2" style="min-width: 200px;">
                    <li>
                        <button
                            class="dropdown-item text-danger fw-bold rounded-3 py-2 d-flex align-items-center justify-content-center"
                            onclick="leaveRoom()">
                            <i class="bi bi-box-arrow-right me-2"></i> Выйти из комнаты
                        </button>
                    </li>
                </ul>
            </div>

            <!-- Desktop Exit Button (Hidden on Mobile) -->
            <button class="btn btn-danger-soft desktop-room-exit-btn ms-2" onclick="leaveRoom()" style="display: none;">
                <i class="bi bi-box-arrow-right me-2"></i> Выйти
            </button>
        </div>

        <!-- Карточка с кодом -->
        <div class="room-code-card">
            <div class="room-code-text" id="room-code-display" onclick="openQrModal()" style="cursor: pointer;"
                title="Нажми, чтобы показать QR">
                ...
            </div>

            <button class="btn-share-code" onclick="openQrModal()">
                <i class="bi bi-share-fill"></i>
            </button>
        </div>

        <!-- Игроки -->
        <h6 class="text-start fw-bold mb-3 px-1" style="font-size: 14px;">Игроки (<span id="players-count">0</span>)
        </h6>
        <div class="players-grid" id="players-list"></div>

        <!-- Выбор игры (только Хост) -->
        <div id="host-controls" style="display:none; width: 100%; margin-top: auto;">
            <div class="game-setting-card" data-bs-toggle="modal" data-bs-target="#gameSelectorModal">
                <div class="d-flex align-items-center">
                    <div class="game-setting-icon" id="selected-game-icon-bg"><i class="bi bi-lightning-fill"
                            id="selected-game-icon"></i></div>
                    <div>
                        <div style="font-size: 12px; color: #888;">Выбрать игру</div>
                        <div style="font-weight: 700; font-size: 16px;" id="selected-game-name">...
                        </div>
                    </div>
                </div>
                <i class="bi bi-chevron-right text-muted"></i>
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