<!-- Screen: Settings -->
<div id="screen-settings" class="screen">
    <div class="room-content-wrapper">
        <div class="settings-screen-header">
            <button class="btn-back settings-back-btn" onclick="closeSettingsScreen()" aria-label="Назад">
                <i class="bi bi-chevron-left"></i>
            </button>
            <h4 class="fw-bold m-0">Настройки</h4>
        </div>

        <!-- 1. PERSONALIZATION CARD -->
        <div class="settings-group settings-screen-group mb-4">
            <div class="settings-section-head">
                <h6 class="settings-section-title"><i class="bi bi-palette"></i>Внешний вид</h6>
            </div>

            <!-- Accent Color (Prominent) -->
            <div class="settings-accent-block">
                <div class="settings-accent-title">Цветовой акцент</div>
                <div class="settings-color-row">
                    <div class="color-option-btn selected" style="background: #6C5CE7;" data-color="#6C5CE7"
                        onclick="applyAccentColor('#6C5CE7'); highlightColorBtn(this);" role="button"
                        aria-label="Фиолетовый акцент"></div>
                    <div class="color-option-btn" style="background: #0984e3;" data-color="#0984e3"
                        onclick="applyAccentColor('#0984e3'); highlightColorBtn(this);" role="button"
                        aria-label="Синий акцент"></div>
                    <div class="color-option-btn" style="background: #fdcb6e;" data-color="#fdcb6e"
                        onclick="applyAccentColor('#fdcb6e'); highlightColorBtn(this);" role="button"
                        aria-label="Желтый акцент"></div>
                    <div class="color-option-btn" style="background: #00b894;" data-color="#00b894"
                        onclick="applyAccentColor('#00b894'); highlightColorBtn(this);" role="button"
                        aria-label="Зеленый акцент"></div>
                    <div class="color-option-btn" style="background: #e17055;" data-color="#e17055"
                        onclick="applyAccentColor('#e17055'); highlightColorBtn(this);" role="button"
                        aria-label="Оранжевый акцент"></div>
                </div>
            </div>

            <!-- Visual Toggles -->
            <div class="settings-item">
                <div class="settings-label-wrap">
                    <div class="settings-row-title">Темная тема</div>
                    <div class="settings-row-subtitle">Темный интерфейс приложения</div>
                </div>
                <div class="form-check form-switch p-0 m-0 d-flex align-items-center">
                    <input class="form-check-input settings-switch ms-auto" type="checkbox" id="setting-darkMode"
                        onchange="toggleSetting('darkMode', this.checked)">
                </div>
            </div>

            <div class="settings-item">
                <div class="settings-label-wrap">
                    <div class="settings-row-title">Экономный фон</div>
                    <div class="settings-row-subtitle">Меньше фоновых эффектов</div>
                </div>
                <div class="form-check form-switch p-0 m-0 d-flex align-items-center">
                    <input class="form-check-input settings-switch ms-auto" type="checkbox" id="setting-simpleBg"
                        onchange="toggleSetting('simpleBg', this.checked)">
                </div>
            </div>

            <div class="settings-item border-0 pb-0">
                <div class="settings-label-wrap">
                    <div class="settings-row-title">Крупный шрифт</div>
                    <div class="settings-row-subtitle">Для удобства чтения</div>
                </div>
                <div class="form-check form-switch p-0 m-0 d-flex align-items-center">
                    <input class="form-check-input settings-switch ms-auto" type="checkbox" id="setting-largeFont"
                        onchange="toggleSetting('largeFont', this.checked)">
                </div>
            </div>
        </div>

        <!-- 2. PERFORMANCE CARD -->
        <div class="settings-group settings-screen-group mb-4">
            <div class="settings-section-head">
                <h6 class="settings-section-title"><i class="bi bi-lightning-charge"></i>Производительность</h6>
            </div>

            <div class="settings-item">
                <div class="settings-label-wrap">
                    <div class="settings-row-title">Отключить анимации</div>
                    <div class="settings-row-subtitle">Ускоряет работу на слабых устройствах</div>
                </div>
                <div class="form-check form-switch p-0 m-0 d-flex align-items-center">
                    <input class="form-check-input settings-switch ms-auto" type="checkbox" id="setting-noAnimations"
                        onchange="toggleSetting('noAnimations', this.checked)">
                </div>
            </div>

            <div class="settings-item border-0 pb-0">
                <div class="settings-label-wrap">
                    <div class="settings-row-title settings-row-title-warning">Режим охлаждения</div>
                    <div class="settings-row-subtitle">Максимальная экономия ресурсов</div>
                </div>
                <div class="form-check form-switch p-0 m-0 d-flex align-items-center">
                    <input class="form-check-input settings-switch ms-auto" type="checkbox" id="setting-thermalSafe"
                        onchange="toggleSetting('thermalSafe', this.checked)">
                </div>
            </div>
        </div>

        <!-- 3. SYSTEM CARD -->
        <div class="settings-group settings-screen-group mb-4">
            <div class="settings-section-head">
                <h6 class="settings-section-title"><i class="bi bi-sliders"></i>Система</h6>
            </div>

            <div class="settings-item">
                <div class="settings-label-wrap">
                    <div class="settings-row-title">Вибрация</div>
                    <div class="settings-row-subtitle">Тактильный отклик в Telegram</div>
                </div>
                <div class="form-check form-switch p-0 m-0 d-flex align-items-center">
                    <input class="form-check-input settings-switch ms-auto" type="checkbox" id="setting-haptics"
                        onchange="toggleSetting('haptics', this.checked)">
                </div>
            </div>

            <div class="settings-item">
                <div class="settings-label-wrap">
                    <div class="settings-row-title">Звуковые эффекты</div>
                    <div class="settings-row-subtitle">Звуки действий и игр</div>
                </div>
                <div class="form-check form-switch p-0 m-0 d-flex align-items-center">
                    <input class="form-check-input settings-switch ms-auto" type="checkbox" id="setting-soundEnabled"
                        onchange="window.audioManager.toggle(this.checked); toggleSetting('soundEnabled', this.checked)">
                </div>
            </div>

            <div class="settings-item border-0 pb-0">
                <div class="settings-label-wrap">
                    <div class="settings-row-title">Лидерборд</div>
                    <div class="settings-row-subtitle">Показывать меня в рейтинге</div>
                </div>
                <div class="form-check form-switch p-0 m-0 d-flex align-items-center">
                    <input class="form-check-input settings-switch ms-auto" type="checkbox"
                        id="setting-privacyLeaderboard" onchange="toggleSetting('privacyLeaderboard', this.checked)">
                </div>
            </div>
        </div>

        <!-- 3.5. SECURITY CARD -->
        <div class="settings-group settings-screen-group mb-4">
            <div class="settings-section-head">
                <h6 class="settings-section-title"><i class="bi bi-shield-lock"></i>Безопасность</h6>
            </div>

            <div class="settings-item border-0 pb-0 clickable" id="sessions-settings-link"
                onclick="window.showScreen('sessions'); if(window.SessionManager) window.SessionManager.loadSessions();">
                <div class="settings-label-wrap">
                    <div class="settings-row-title">Активные сеансы</div>
                    <div class="settings-row-subtitle" id="sessions-count-hint">Загрузка...</div>
                </div>
                <div class="menu-icon-wrap settings-row-icon">
                    <i class="bi bi-phone-landscape"></i>
                </div>
            </div>
        </div>

        <!-- QA / TESTER TOOLS -->
        <div class="settings-group settings-screen-group mb-4" id="qa-tools-settings-group" style="display:none;">
            <div class="settings-section-head">
                <h6 class="settings-section-title"><i class="bi bi-tools"></i>QA</h6>
            </div>

            <div class="settings-item border-0 pb-0 clickable" onclick="window.ScrollQA && window.ScrollQA.openTools()">
                <div class="settings-label-wrap">
                    <div class="settings-row-title">Сообщить об ошибке</div>
                    <div class="settings-row-subtitle">Отправить баг, идею или проблему с экраном</div>
                </div>
                <div class="menu-icon-wrap settings-row-icon settings-row-icon-debug">
                    <i class="bi bi-bug"></i>
                </div>
            </div>
        </div>


        <div class="settings-group settings-screen-group mb-4">
            <div class="settings-section-head">
                <h6 class="settings-section-title"><i class="bi bi-info-circle"></i>О приложении</h6>
            </div>

            <div class="settings-item">
                <div class="settings-label-wrap">
                    <div class="settings-row-title">Уведомления</div>
                    <div class="settings-row-subtitle">Приглашения в игру</div>
                </div>
                <div class="form-check form-switch p-0 m-0 d-flex align-items-center">
                    <input class="form-check-input settings-switch ms-auto" type="checkbox"
                        id="setting-notificationsEnabled"
                        onchange="toggleSetting('notificationsEnabled', this.checked)">
                </div>
            </div>

            <div class="settings-item">
                <div class="settings-label-wrap">
                    <div class="settings-row-title">Версия</div>
                    <div class="settings-row-subtitle settings-build-value" id="app-version-display">Build Loading...
                    </div>
                </div>
            </div>

            <div class="settings-item clickable border-0 pb-0"
                onclick="window.open('https://github.com/antoniomarreti/party-games', '_blank')">
                <div class="settings-label-wrap">
                    <div class="settings-row-title">Open Source</div>
                    <div class="settings-row-subtitle">Исходный код на GitHub</div>
                </div>
                <div class="menu-icon-wrap settings-row-icon settings-row-icon-github">
                    <i class="bi bi-github"></i>
                </div>
            </div>
        </div>
    </div>
</div>
