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

            <!-- Theme Mode Selection -->
            <div class="settings-theme-mode-block mb-3">
                <div class="settings-row-title mb-2">Оформление</div>
                <div class="theme-mode-segment-control">
                    <label class="theme-mode-option">
                        <input type="radio" name="themePreference" value="system" onchange="setThemePreference(this.value)">
                        <div class="theme-mode-btn">Авто</div>
                    </label>
                    <label class="theme-mode-option">
                        <input type="radio" name="themePreference" value="light" onchange="setThemePreference(this.value)">
                        <div class="theme-mode-btn">Светлое</div>
                    </label>
                    <label class="theme-mode-option">
                        <input type="radio" name="themePreference" value="dark" onchange="setThemePreference(this.value)">
                        <div class="theme-mode-btn">Темное</div>
                    </label>
                </div>
            </div>

            <!-- Palette Preset Selection -->
            <div class="settings-palette-block mb-2">
                <div class="settings-row-title mb-2">Цветовая палитра</div>
                <div class="palette-grid">
                    <div class="palette-tile" data-palette="amber-sapphire" onclick="applyPalette('amber-sapphire'); highlightPaletteBtn(this);">
                        <div class="palette-preview" style="background: linear-gradient(90deg, #0F4C81 50%, #F59E0B 50%);"></div>
                        <div class="palette-name">Янтарный сапфир</div>
                    </div>
                    <div class="palette-tile" data-palette="olive-sand" onclick="applyPalette('olive-sand'); highlightPaletteBtn(this);">
                        <div class="palette-preview" style="background: linear-gradient(90deg, #6B705C 50%, #A5A58D 50%);"></div>
                        <div class="palette-name">Оливковый песок</div>
                    </div>
                    <div class="palette-tile" data-palette="lavender-graphite" onclick="applyPalette('lavender-graphite'); highlightPaletteBtn(this);">
                        <div class="palette-preview" style="background: linear-gradient(90deg, #413F54 50%, #B19CD9 50%);"></div>
                        <div class="palette-name">Лавандовый графит</div>
                    </div>
                    <div class="palette-tile" data-palette="burgundy-cream" onclick="applyPalette('burgundy-cream'); highlightPaletteBtn(this);">
                        <div class="palette-preview" style="background: linear-gradient(90deg, #722F37 50%, #EED9C4 50%);"></div>
                        <div class="palette-name">Бордовый крем</div>
                    </div>
                    <div class="palette-tile" data-palette="jade-biscuit" onclick="applyPalette('jade-biscuit'); highlightPaletteBtn(this);">
                        <div class="palette-preview" style="background: linear-gradient(90deg, #3F8E83 50%, #FFDCA8 50%);"></div>
                        <div class="palette-name">Нефритовый бисквит</div>
                    </div>
                    <div class="palette-tile" data-palette="azure-quartz" onclick="applyPalette('azure-quartz'); highlightPaletteBtn(this);">
                        <div class="palette-preview" style="background: linear-gradient(90deg, #296D98 50%, #EAF3FA 50%);"></div>
                        <div class="palette-name">Лазурный кварц</div>
                    </div>
                    <div class="palette-tile" data-palette="graphite-lemon" onclick="applyPalette('graphite-lemon'); highlightPaletteBtn(this);">
                        <div class="palette-preview" style="background: linear-gradient(90deg, #1E1E1E 50%, #FFE788 50%);"></div>
                        <div class="palette-name">Графитовый лимон</div>
                    </div>
                    <div class="palette-tile" data-palette="beige-olive" onclick="applyPalette('beige-olive'); highlightPaletteBtn(this);">
                        <div class="palette-preview" style="background: linear-gradient(90deg, #424E2B 50%, #E5D9C6 50%);"></div>
                        <div class="palette-name">Бежево-оливковая</div>
                    </div>
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

            <div class="settings-item border-0 pb-0 mt-3" id="tdesktop-fullscreen-setting" style="display: none;">
                <div class="settings-label-wrap">
                    <div class="settings-row-title">Открывать на весь экран</div>
                    <div class="settings-row-subtitle">Можно включить, если удобнее играть в полноэкранном режиме на компьютере.</div>
                </div>
                <div class="form-check form-switch p-0 m-0 d-flex align-items-center">
                    <input class="form-check-input settings-switch ms-auto" type="checkbox" id="setting-tdesktopFullscreen"
                        onchange="window.toggleTdesktopFullscreen && window.toggleTdesktopFullscreen(this.checked)">
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
