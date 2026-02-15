<!-- Screen: Settings -->
<div id="screen-settings" class="screen">
    <div class="room-content-wrapper">
        <div class="d-flex align-items-center mb-4">
            <button class="btn-back me-3" onclick="closeSettingsScreen()"
                style="color: var(--primary-color) !important; background: var(--bg-card); border: 1px solid var(--primary-color);">
                <i class="bi bi-chevron-left"></i>
            </button>
            <h4 class="fw-bold m-0">Настройки</h4>
        </div>

        <!-- 1. PERSONALIZATION CARD -->
        <div class="settings-group mb-4 p-3">
            <div class="d-flex align-items-center justify-content-between mb-3">
                <h6 class="fw-bold m-0 text-uppercase small" style="color: var(--text-main); opacity: 0.7;"><i
                        class="bi bi-palette me-2"></i>Внешний вид</h6>
            </div>

            <!-- Accent Color (Prominent) -->
            <div class="mb-4">
                <div class="fw-bold mb-2" style="font-size: 15px;">Цветовой акцент</div>
                <div class="d-flex gap-3 justify-content-between px-1">
                    <div class="color-option-btn selected" style="background: #6C5CE7;"
                        onclick="applyAccentColor('#6C5CE7'); highlightColorBtn(this);"></div>
                    <div class="color-option-btn" style="background: #0984e3;"
                        onclick="applyAccentColor('#0984e3'); highlightColorBtn(this);"></div>
                    <div class="color-option-btn" style="background: #fdcb6e;"
                        onclick="applyAccentColor('#fdcb6e'); highlightColorBtn(this);"></div>
                    <div class="color-option-btn" style="background: #00b894;"
                        onclick="applyAccentColor('#00b894'); highlightColorBtn(this);"></div>
                    <div class="color-option-btn" style="background: #e17055;"
                        onclick="applyAccentColor('#e17055'); highlightColorBtn(this);"></div>
                </div>
            </div>

            <!-- Visual Toggles -->
            <div class="settings-item">
                <div class="settings-label-wrap">
                    <div class="fw-bold">Темная тема (Beta)</div>
                    <div class="text-muted small">Всегда темный фон</div>
                </div>
                <div class="form-check form-switch p-0 m-0 d-flex align-items-center">
                    <input class="form-check-input settings-switch ms-auto" type="checkbox" id="setting-darkMode"
                        onchange="toggleSetting('darkMode', this.checked)">
                </div>
            </div>

            <div class="settings-item">
                <div class="settings-label-wrap">
                    <div class="fw-bold">Экономный фон</div>
                    <div class="text-muted small">Без анимации градиента</div>
                </div>
                <div class="form-check form-switch p-0 m-0 d-flex align-items-center">
                    <input class="form-check-input settings-switch ms-auto" type="checkbox" id="setting-simpleBg"
                        onchange="toggleSetting('simpleBg', this.checked)">
                </div>
            </div>

            <div class="settings-item border-0 pb-0">
                <div class="settings-label-wrap">
                    <div class="fw-bold">Крупный шрифт</div>
                    <div class="text-muted small">Для удобства чтения</div>
                </div>
                <div class="form-check form-switch p-0 m-0 d-flex align-items-center">
                    <input class="form-check-input settings-switch ms-auto" type="checkbox" id="setting-largeFont"
                        onchange="toggleSetting('largeFont', this.checked)">
                </div>
            </div>
        </div>

        <!-- 2. PERFORMANCE CARD -->
        <div class="settings-group mb-4 p-3">
            <div class="d-flex align-items-center justify-content-between mb-2">
                <h6 class="fw-bold m-0 text-uppercase small" style="color: var(--text-main); opacity: 0.7;"><i
                        class="bi bi-lightning-charge me-2"></i>Производительность</h6>
            </div>

            <div class="settings-item">
                <div class="settings-label-wrap">
                    <div class="fw-bold">Без анимаций</div>
                    <div class="text-muted small">Ускоряет работу</div>
                </div>
                <div class="form-check form-switch p-0 m-0 d-flex align-items-center">
                    <input class="form-check-input settings-switch ms-auto" type="checkbox" id="setting-noAnimations"
                        onchange="toggleSetting('noAnimations', this.checked)">
                </div>
            </div>

            <div class="settings-item border-0 pb-0">
                <div class="settings-label-wrap">
                    <div class="fw-bold text-danger">Режим охлаждения</div>
                    <div class="text-muted small">Максимальная экономия</div>
                </div>
                <div class="form-check form-switch p-0 m-0 d-flex align-items-center">
                    <input class="form-check-input settings-switch ms-auto" type="checkbox" id="setting-thermalSafe"
                        onchange="toggleSetting('thermalSafe', this.checked)">
                </div>
            </div>
        </div>

        <!-- 3. SYSTEM CARD -->
        <div class="settings-group mb-4 p-3">
            <div class="d-flex align-items-center justify-content-between mb-2">
                <h6 class="fw-bold m-0 text-uppercase small" style="color: var(--text-main); opacity: 0.7;"><i
                        class="bi bi-sliders me-2"></i>Система</h6>
            </div>

            <div class="settings-item">
                <div class="settings-label-wrap">
                    <div class="fw-bold">Вибрация (Haptics)</div>
                </div>
                <div class="form-check form-switch p-0 m-0 d-flex align-items-center">
                    <input class="form-check-input settings-switch ms-auto" type="checkbox" id="setting-haptics"
                        onchange="toggleSetting('haptics', this.checked)">
                </div>
            </div>

            <div class="settings-item">
                <div class="settings-label-wrap">
                    <div class="fw-bold">Звуковые эффекты</div>
                </div>
                <div class="form-check form-switch p-0 m-0 d-flex align-items-center">
                    <input class="form-check-input settings-switch ms-auto" type="checkbox" id="setting-soundEnabled"
                        onchange="window.audioManager.toggle(this.checked); toggleSetting('soundEnabled', this.checked)">
                </div>
            </div>

            <div class="settings-item border-0 pb-0">
                <div class="settings-label-wrap">
                    <div class="fw-bold">Лидерборд</div>
                    <div class="text-muted small">Показывать меня всем</div>
                </div>
                <div class="form-check form-switch p-0 m-0 d-flex align-items-center">
                    <input class="form-check-input settings-switch ms-auto" type="checkbox"
                        id="setting-privacyLeaderboard" onchange="toggleSetting('privacyLeaderboard', this.checked)">
                </div>
            </div>
        </div>

        <!-- 4. ABOUT CARD -->
        <div class="settings-group mb-4 p-3">
            <div class="d-flex align-items-center justify-content-between mb-2">
                <h6 class="fw-bold m-0 text-uppercase small" style="color: var(--text-main); opacity: 0.7;"><i
                        class="bi bi-info-circle me-2"></i>О приложении</h6>
            </div>

            <div class="settings-item">
                <div class="settings-label-wrap">
                    <div class="fw-bold">Уведомления</div>
                    <div class="text-muted small">Приглашения в игру</div>
                </div>
                <div class="form-check form-switch p-0 m-0 d-flex align-items-center">
                    <input class="form-check-input settings-switch ms-auto" type="checkbox"
                        id="setting-notificationsEnabled"
                        onchange="toggleSetting('notificationsEnabled', this.checked)">
                </div>
            </div>

            <div class="settings-item">
                <div class="settings-label-wrap">
                    <div class="fw-bold">Версия</div>
                    <div class="text-muted small fw-bold" id="app-version-display">Build Loading...
                    </div>
                </div>
            </div>

            <div class="settings-item clickable border-0 pb-0"
                onclick="window.open('https://github.com/antoniomarreti/party-games', '_blank')">
                <div class="settings-label-wrap">
                    <div class="fw-bold">Open Source</div>
                    <div class="text-muted small">Исходный код на GitHub</div>
                </div>
                <div class="menu-icon-wrap" style="background: #f0f0f0; color: #333;">
                    <i class="bi bi-github"></i>
                </div>
            </div>
        </div>
    </div>
</div>