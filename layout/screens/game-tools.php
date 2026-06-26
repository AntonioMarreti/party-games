<!-- Screen: Game Tools -->
<div id="screen-game-tools" class="screen">
    <div class="room-content-wrapper">
        <div class="settings-screen-header">
            <button class="btn-back settings-back-btn" onclick="closeGameToolsScreen()" aria-label="Назад">
                <i class="bi bi-chevron-left"></i>
            </button>
            <h4 class="fw-bold m-0">Управление играми</h4>
        </div>

        <div class="settings-group settings-screen-group mb-4" style="margin-top: 36px;">
            <div class="settings-section-head">
                <h6 class="settings-section-title"><i class="bi bi-journal-check"></i>WORDCLASH</h6>
            </div>

            <button type="button" id="wordclash-tool-admin-row" class="btn-unstyled settings-item clickable profile-menu-row"
                onclick="openWordclashDictionaryAdmin()" style="display:none;">
                <div class="profile-menu-main">
                    <div class="profile-menu-icon">
                        <i class="bi bi-journal-check fs-5" aria-hidden="true"></i>
                    </div>
                    <span class="profile-menu-title">
                        Словарь Wordclash
                        <span class="d-block text-muted fw-normal" style="font-size: 0.85rem;">Добавлять, убирать и запрещать слова</span>
                    </span>
                </div>
                <i class="bi bi-chevron-right profile-menu-chevron" aria-hidden="true"></i>
            </button>

            <button type="button" id="wordclash-tool-suggest-row" class="btn-unstyled settings-item clickable profile-menu-row"
                onclick="openWordclashDictionarySuggest()" style="display:none;">
                <div class="profile-menu-main">
                    <div class="profile-menu-icon">
                        <i class="bi bi-plus-circle fs-5" aria-hidden="true"></i>
                    </div>
                    <span class="profile-menu-title">
                        Предложить слово
                        <span class="d-block text-muted fw-normal" style="font-size: 0.85rem;">Отправить слово на рассмотрение</span>
                    </span>
                </div>
                <i class="bi bi-chevron-right profile-menu-chevron" aria-hidden="true"></i>
            </button>
        </div>
    </div>
</div>
