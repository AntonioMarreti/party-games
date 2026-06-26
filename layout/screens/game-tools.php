<!-- Screen: Game Tools -->
<div id="screen-game-tools" class="screen">
    <div class="room-content-wrapper">
        <div class="settings-screen-header">
            <button class="btn-back settings-back-btn" onclick="closeGameToolsScreen()" aria-label="Назад">
                <i class="bi bi-chevron-left"></i>
            </button>
            <h4 class="fw-bold m-0">Управление играми</h4>
        </div>

        <div class="settings-group settings-screen-group mb-4">
            <div class="settings-section-head">
                <h6 class="settings-section-title"><i class="bi bi-journal-check"></i>WORDCLASH</h6>
            </div>

            <button type="button" id="wordclash-tool-admin-row" class="btn-unstyled settings-item clickable"
                onclick="openWordclashDictionaryAdmin()" style="display:none;">
                <div class="menu-icon-wrap settings-row-icon game-tools-row-icon" aria-hidden="true">
                    <i class="bi bi-journal-check"></i>
                </div>
                <div class="settings-label-wrap">
                    <div class="settings-row-title">Словарь Wordclash</div>
                    <div class="settings-row-subtitle">Добавлять, убирать и запрещать слова</div>
                </div>
                <i class="bi bi-chevron-right text-muted" style="font-size: 1.2rem;" aria-hidden="true"></i>
            </button>

            <button type="button" id="wordclash-tool-suggest-row" class="btn-unstyled settings-item clickable border-0 pb-0"
                onclick="openWordclashDictionarySuggest()" style="display:none;">
                <div class="menu-icon-wrap settings-row-icon game-tools-row-icon" aria-hidden="true">
                    <i class="bi bi-plus-circle"></i>
                </div>
                <div class="settings-label-wrap">
                    <div class="settings-row-title">Предложить слово</div>
                    <div class="settings-row-subtitle">Отправить слово на рассмотрение</div>
                </div>
                <i class="bi bi-chevron-right text-muted" style="font-size: 1.2rem;" aria-hidden="true"></i>
            </button>
        </div>
    </div>
</div>

<!-- Screen: Wordclash Dictionary -->
<div id="screen-wordclash-dictionary" class="screen">
    <div class="room-content-wrapper">
        <div class="settings-screen-header">
            <button class="btn-back settings-back-btn" onclick="closeWordclashDictionaryScreen()" aria-label="Назад">
                <i class="bi bi-chevron-left"></i>
            </button>
            <h4 class="fw-bold m-0">Словарь Wordclash</h4>
        </div>

        <div id="wordclash-dictionary-admin-panel" class="wordclash-dictionary-screen-panel">
            <div class="wordclash-dictionary-search-row mb-3">
                <input type="text" id="wordclash-dictionary-search" class="form-control" placeholder="Слово 5–7 букв">
                <button type="button" class="btn btn-dark" onclick="searchWordclashDictionaryWord()">Найти</button>
            </div>

            <div id="wordclash-dictionary-status" class="small text-muted mb-3">Введите слово для проверки.</div>
            <div id="wordclash-dictionary-actions" class="d-flex flex-wrap gap-2 mb-3"></div>
            <div id="wordclash-dictionary-counts" class="mb-4"></div>

            <div class="settings-group settings-screen-group mb-4">
                <div class="settings-section-head">
                    <h6 class="settings-section-title"><i class="bi bi-inbox"></i>Предложения тестеров</h6>
                    <span id="wordclash-dictionary-suggestions-badge" class="wordclash-dictionary-section-badge" hidden>0</span>
                </div>
                <div id="wordclash-dictionary-suggestions" class="wordclash-dictionary-list"></div>
            </div>

            <div class="settings-group settings-screen-group mb-4">
                <div class="settings-section-head">
                    <h6 class="settings-section-title"><i class="bi bi-clock-history"></i>Последние изменения</h6>
                </div>
                <div id="wordclash-dictionary-audit" class="wordclash-dictionary-audit-list small text-muted"></div>
            </div>
        </div>
    </div>
</div>
