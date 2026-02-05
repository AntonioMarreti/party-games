<div id="screen-profile-edit" class="screen">
    <div class="room-content-wrapper">
        <div class="d-flex align-items-center mb-4">
            <button class="btn-back me-3" onclick="closeProfileEditor()"
                style="color: var(--primary-color) !important; background: var(--bg-card); border: 1px solid var(--primary-color);">
                <i class="bi bi-chevron-left"></i>
            </button>
            <h4 class="fw-bold m-0">Редактор профиля</h4>
        </div>

        <div class="d-flex justify-content-center mb-4" id="avatar-preview-area"
            style="width: 150px; height: 150px; border-radius: 50%; overflow: hidden; margin: 0 auto; box-shadow: 0 4px 15px rgba(0,0,0,0.1); border: 4px solid white;">
            <!-- Preview injected here -->
        </div>

        <div class="mb-3">
            <label class="form-label fw-bold">Имя</label>
            <input type="text" class="form-control rounded-4 py-3"
                style="background: var(--bg-card); color: var(--text-main); border: 1px solid var(--border-glass);"
                id="profile-name-input" placeholder="Ваше имя">
        </div>

        <div class="mb-3">
            <label class="form-label fw-bold">Выберите аватар</label>
            <div class="d-flex gap-3 mb-3">
                <input type="text" class="form-control rounded-4 py-3 text-center" id="emoji-input" placeholder="😎"
                    maxlength="2"
                    style="font-size: 32px; width: 80px; flex-shrink: 0; background: var(--bg-card); color: var(--text-main); border: 1px solid var(--border-glass);">

                <div class="d-flex flex-column flex-grow-1 gap-2">
                    <button class="btn rounded-4 py-2 fw-bold"
                        style="background: var(--bg-card); color: var(--text-main); border: 1px solid var(--border-glass);"
                        onclick="document.getElementById('avatar-file-input').click()">
                        <i class="bi bi-image me-2 text-primary"></i> Загрузить фото
                    </button>
                    <button class="btn rounded-4 py-2 fw-bold"
                        style="background: var(--bg-card); color: var(--text-main); border: 1px solid var(--border-glass);"
                        onclick="openAvatarEditor()">
                        <i class="bi bi-pencil-fill me-2 text-warning"></i> Нарисовать
                    </button>
                </div>

                <input type="file" id="avatar-file-input" accept="image/*" style="display: none;"
                    onchange="handleAvatarUpload(event)">
            </div>

            <!-- Avatar Editor Modal (Overlay) -->
            <div id="avatar-editor-overlay"
                style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: var(--bg-app); z-index: 2000; flex-direction: column;">
                <!-- Header -->
                <div class="p-3 d-flex align-items-center justify-content-center border-bottom pt-5 mt-4"
                    style="background: white;">
                    <h6 class="m-0 fw-bold">Рисование</h6>
                </div>
                <!-- Canvas Area -->
                <div class="flex-grow-1 d-flex align-items-center justify-content-center p-3"
                    style="background:#f8f9fa;">
                    <div class="editor-container shadow-lg bg-white rounded-4 overflow-hidden"
                        style="width: 100%; aspect-ratio: 1/1; max-width: 400px; position: relative;">
                        <canvas id="avatar-canvas"></canvas>
                    </div>
                </div>
                <!-- Toolbar -->
                <div class="p-4 bg-white border-top pb-5">
                    <!-- Brush size slider -->
                    <div class="mb-4">
                        <div class="d-flex justify-content-between mb-2">
                            <span class="small fw-bold">Размер кисти</span>
                            <span id="brush-size-val" class="badge bg-primary rounded-pill">5</span>
                        </div>
                        <input type="range" class="form-range" id="brush-size" min="1" max="50" value="5"
                            oninput="document.getElementById('brush-size-val').innerText = this.value">
                    </div>

                    <!-- Tools Row -->
                    <div class="d-flex gap-2 mb-4 overflow-auto no-scrollbar pb-2">
                        <button
                            class="btn btn-outline-secondary rounded-4 px-3 py-2 flex-grow-1 d-flex align-items-center justify-content-center gap-2"
                            onclick="avatarEditor.clear()">
                            <i class="bi bi-trash3"></i> <span>Очистить</span>
                        </button>
                        <button
                            class="btn btn-outline-secondary rounded-4 px-3 py-2 flex-grow-1 d-flex align-items-center justify-content-center gap-2"
                            onclick="avatarEditor.undo()">
                            <i class="bi bi-arrow-counterclockwise"></i> <span>Шаг назад</span>
                        </button>
                    </div>

                    <!-- Colors -->
                    <div class="d-flex gap-2 overflow-auto no-scrollbar mb-4 pb-2">
                        <div class="avatar-color-option selected" style="background:black;"
                            onclick="avatarEditor.setColor('black', this)"></div>
                        <div class="avatar-color-option" style="background:#e74c3c;"
                            onclick="avatarEditor.setColor('#e74c3c', this)"></div>
                        <div class="avatar-color-option" style="background:#e67e22;"
                            onclick="avatarEditor.setColor('#e67e22', this)"></div>
                        <div class="avatar-color-option" style="background:#f1c40f;"
                            onclick="avatarEditor.setColor('#f1c40f', this)"></div>
                        <div class="avatar-color-option" style="background:#2ecc71;"
                            onclick="avatarEditor.setColor('#2ecc71', this)"></div>
                        <div class="avatar-color-option" style="background:#1abc9c;"
                            onclick="avatarEditor.setColor('#1abc9c', this)"></div>
                        <div class="avatar-color-option" style="background:#3498db;"
                            onclick="avatarEditor.setColor('#3498db', this)"></div>
                        <div class="avatar-color-option" style="background:#9b59b6;"
                            onclick="avatarEditor.setColor('#9b59b6', this)"></div>
                        <div class="avatar-color-option" style="background:#34495e;"
                            onclick="avatarEditor.setColor('#34495e', this)"></div>
                        <div class="avatar-color-option" style="background:#95a5a6;"
                            onclick="avatarEditor.setColor('#95a5a6', this)"></div>
                        <div class="avatar-color-option" style="background:#ecf0f1;"
                            onclick="avatarEditor.setColor('#ecf0f1', this)"></div>
                    </div>

                    <!-- Action Buttons -->
                    <div class="d-flex gap-3">
                        <button class="btn btn-light rounded-4 py-3 flex-grow-1 fw-bold"
                            onclick="closeAvatarEditor()">Отмена</button>
                        <button class="btn btn-primary rounded-4 py-3 flex-grow-1 fw-bold"
                            style="background: linear-gradient(135deg, var(--primary-color) 0%, var(--accent-color) 100%); border: none;"
                            onclick="saveDrawnAvatar()">
                            Готово
                        </button>
                    </div>
                </div>
            </div>
            <label class="form-label fw-bold">Цвет фона</label>
            <div class="color-grid rounded-4" id="color-grid"
                style="background: var(--bg-card); border: 1px solid var(--border-glass);"></div>
        </div>

        <button class="btn btn-primary w-100 py-3 rounded-4 fw-bold mt-2"
            style="background: linear-gradient(135deg, var(--primary-color) 0%, var(--accent-color) 100%); border: none;"
            onclick="saveProfile()">
            Сохранить
        </button>
        <button class="btn btn-link w-100 mt-2 text-muted text-decoration-none"
            onclick="pendingAvatar=null; updatePreview();">
            Сбросить аватар
        </button>
    </div>
</div>