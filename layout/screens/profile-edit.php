<div id="screen-profile-edit" class="screen">
    <div class="room-content-wrapper">
        <div class="d-flex align-items-center justify-content-between mb-3 pt-2">
            <button class="btn-back" onclick="closeProfileEditor()"
                style="width: 40px; height: 40px; border-radius: 12px; display: flex; align-items: center; justify-content: center; color: var(--text-main); background: var(--bg-secondary); border: none;">
                <i class="bi bi-chevron-left fs-5"></i>
            </button>
            <h5 class="fw-bold m-0 flex-grow-1 text-center pe-5">Профиль</h5>
        </div>

        <!-- Compact Avatar & Name Section -->
        <div class="d-flex align-items-center gap-3 mb-4 p-3 rounded-4"
            style="background: var(--bg-card); border: 1px solid var(--border-glass);">
            <div id="avatar-preview-area" class="flex-shrink-0"
                style="width: 70px; height: 70px; border-radius: 50%; overflow: hidden; box-shadow: 0 4px 10px rgba(0,0,0,0.1); border: 2px solid var(--bg-app);">
                <!-- Preview injected here -->
            </div>
            <div class="flex-grow-1">
                <label class="small text-muted fw-bold text-uppercase mb-1" style="font-size: 10px;">Ваше имя</label>
                <input type="text"
                    class="form-control form-control-sm border-0 bg-transparent p-0 fw-bold fs-5 text-truncate"
                    style="color: var(--text-main); box-shadow: none;" id="profile-name-input" placeholder="Имя">
            </div>
        </div>

        <div class="mb-2">
            <!-- Tabs -->
            <div class="d-flex p-1 rounded-3 mb-3" style="background: var(--bg-secondary);">
                <button class="btn flex-grow-1 rounded-3 py-2 fw-bold text-muted small" style="font-size: 13px;"
                    id="tab-btn-emoji" onclick="switchAvatarTab('emoji')">Эмодзи</button>
                <button class="btn flex-grow-1 rounded-3 py-2 fw-bold text-muted small" style="font-size: 13px;"
                    id="tab-btn-photo" onclick="switchAvatarTab('photo')">Фото</button>
                <button class="btn flex-grow-1 rounded-3 py-2 fw-bold text-muted small" style="font-size: 13px;"
                    id="tab-btn-draw" onclick="switchAvatarTab('draw')">Рисовать</button>
                <button class="btn flex-grow-1 rounded-3 py-2 fw-bold text-muted small" style="font-size: 13px;"
                    id="tab-btn-ai" onclick="switchAvatarTab('ai')">AI</button>
            </div>

            <!-- TAB: EMOJI -->
            <div id="tab-pane-emoji" class="avatar-tab-pane">
                <div class="p-3 rounded-4" style="background: var(--bg-card); border: 1px solid var(--border-glass);">
                    <div class="d-flex justify-content-between align-items-center mb-2">
                        <span class="small text-muted fw-bold text-uppercase" style="font-size: 11px;">Фон</span>
                    </div>
                    <!-- Compact Color Grid -->
                    <div class="color-grid rounded-3 mb-3" id="color-grid"
                        style="gap: 6px; grid-template-columns: repeat(auto-fill, minmax(32px, 1fr));"></div>

                    <div class="d-flex justify-content-between align-items-center mb-2">
                        <span class="small text-muted fw-bold text-uppercase" style="font-size: 11px;">Смайл</span>
                    </div>
                    <!-- Emoji Picker Container -->
                    <div id="emoji-picker-container" class="emoji-grid-scrollable no-scrollbar"
                        style="max-height: 180px; overflow-y: auto; display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px;">
                        <!-- Populated by JS -->
                    </div>
                </div>
            </div>

            <!-- TAB: PHOTO -->
            <div id="tab-pane-photo" class="avatar-tab-pane" style="display: none;">
                <div class="p-4 rounded-4 text-center d-flex flex-column align-items-center justify-content-center"
                    style="background: var(--bg-card); border: 2px dashed var(--border-glass); min-height: 200px; cursor: pointer;"
                    onclick="document.getElementById('avatar-file-input').click()">
                    <div class="bg-primary bg-opacity-10 rounded-circle mb-3 text-primary d-flex align-items-center justify-content-center"
                        style="width: 70px; height: 70px;">
                        <i class="bi bi-cloud-arrow-up-fill fs-1"></i>
                    </div>
                    <h6 class="fw-bold">Загрузить фото</h6>
                    <p class="small text-muted mb-0">JPG, PNG до 5MB</p>
                </div>
                <input type="file" id="avatar-file-input" accept="image/*" style="display: none;"
                    onchange="handleAvatarUpload(event)">
            </div>

            <!-- TAB: DRAW -->
            <div id="tab-pane-draw" class="avatar-tab-pane" style="display: none;">
                <div class="p-4 rounded-4 text-center d-flex flex-column align-items-center justify-content-center"
                    style="background: var(--bg-card); border: 1px solid var(--border-glass); min-height: 200px; cursor: pointer;"
                    onclick="openAvatarEditor()">
                    <div class="bg-warning bg-opacity-10 rounded-circle mb-3 text-warning d-flex align-items-center justify-content-center"
                        style="width: 70px; height: 70px;">
                        <i class="bi bi-palette-fill fs-1"></i>
                    </div>
                    <h6 class="fw-bold">Нарисовать аватар</h6>
                    <p class="small text-muted mb-0">Открыть редактор</p>
                </div>
            </div>

            <!-- TAB: AI -->
            <div id="tab-pane-ai" class="avatar-tab-pane" style="display: none;">
                <div class="p-4 rounded-4 text-center"
                    style="background: var(--bg-card); border: 1px dashed var(--border-active); min-height: 200px; display: flex; flex-direction: column; justify-content: center; align-items: center;">
                    <div class="mb-3 text-primary display-4 shimmer"><i class="bi bi-stars"></i></div>
                    <h6 class="fw-bold">AI Генератор</h6>
                    <p class="small text-muted mb-3">Опиши персонажа, и ИИ нарисует его.</p>

                    <button class="btn btn-primary rounded-pill px-4 gap-2 d-flex align-items-center"
                        onclick="promptAIImage(this)">
                        <span class="btn-text">Создать Аватар</span>
                        <i class="bi bi-magic"></i>
                    </button>
                    <p class="small text-muted mt-2 opacity-50 fst-italic">Powered by HuggingFace</p>
                </div>
            </div>

            <!-- Avatar Editor Modal (With ID Fix) -->
            <div id="avatar-editor-overlay"
                style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: var(--bg-app); z-index: 2000; flex-direction: column; overscroll-behavior: none; touch-action: none;">
                <!-- Header -->
                <div class="p-3 d-flex align-items-center justify-content-center border-bottom pt-4"
                    style="background: white;">
                    <h6 class="m-0 fw-bold">Рисование</h6>
                </div>
                <!-- Canvas Area -->
                <div class="flex-grow-1 d-flex align-items-center justify-content-center p-3"
                    style="background:#f8f9fa;">
                    <div id="avatar-canvas-container"
                        class="editor-container shadow-lg bg-white rounded-4 overflow-hidden"
                        style="max-width: 100%; max-height: 45vh; aspect-ratio: 1/1; width: auto; position: relative;">
                        <canvas id="avatar-canvas" style="width: 100%; height: 100%; display: block;"></canvas>
                    </div>
                </div>
                <!-- Toolbar -->
                <div class="p-3 bg-white border-top pb-4">
                    <!-- Brush size slider -->
                    <div class="mb-4">
                        <div class="d-flex justify-content-between mb-2">
                            <span class="small fw-bold">Размер кисти</span>
                            <span id="brush-size-val" class="badge bg-primary rounded-pill">5</span>
                        </div>
                        <input type="range" class="form-range" id="brush-size" min="1" max="50" value="5"
                            oninput="document.getElementById('brush-size-val').innerText = this.value; avatarEditor.setBrushSize(this.value)">
                    </div>

                    <!-- Tools Row -->
                    <div class="d-flex justify-content-between align-items-center mb-4">
                        <div class="d-flex gap-2">
                            <!-- Magic Button -->
                            <button
                                class="btn btn-outline-primary rounded-circle p-2 d-flex align-items-center justify-content-center"
                                style="width: 44px; height: 44px; background: linear-gradient(135deg, #a8c0ff 0%, #3f2b96 100%); border: none; color: white;"
                                onclick="promptAIImage(this)">
                                <i class="bi bi-stars"></i>
                            </button>
                            <div class="vr mx-1"></div>

                            <button
                                class="btn btn-outline-secondary rounded-circle p-2 d-flex align-items-center justify-content-center btn-eraser"
                                style="width: 44px; height: 44px;" onclick="avatarEditor.setMode('erase', this)">
                                <i class="bi bi-eraser-fill"></i>
                            </button>
                            <button
                                class="btn btn-outline-danger rounded-circle p-2 d-flex align-items-center justify-content-center"
                                style="width: 44px; height: 44px;" onclick="avatarEditor.clear()">
                                <i class="bi bi-trash"></i>
                            </button>
                        </div>
                        <div class="d-flex gap-2">
                            <button
                                class="btn btn-outline-secondary rounded-circle p-2 d-flex align-items-center justify-content-center"
                                style="width: 44px; height: 44px;" onclick="avatarEditor.undo()">
                                <i class="bi bi-arrow-counterclockwise"></i>
                            </button>
                        </div>
                    </div>
                    <!-- Colors -->
                    <div class="d-flex gap-2 overflow-auto no-scrollbar mb-4 py-3 px-2">
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
                        <div class="avatar-color-option" style="background:#ecf0f1; border: 1px solid #ddd;"
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

<script>
    // === AI Image Gen ===
    function promptAIImage(btn) {
        if (window.ThemeManager) window.ThemeManager.triggerHaptic('impact', 'medium');

        showPrompt(
            "AI Генератор",
            "Опишите внешность персонажа (лучше на английском):",
            (val) => {
                startAIGeneration(btn, val);
            },
            {
                confirmText: 'Нарисовать',
                cancelText: 'Отмена',
                placeholder: 'Например: Cyberpunk cat in neon city',
                defaultValue: '',
                presets: [
                    { label: 'Cyber', value: 'Cyberpunk cat in neon city, high detail', icon: 'bi-cpu-fill' },
                    { label: 'Pixel', value: 'Pixel art character, retro style, 8-bit', icon: 'bi-grid-3x3-gap-fill' },
                    { label: 'Fantasy', value: 'Epic fantasy wizard, magic spells, digital art', icon: 'bi-magic' },
                    { label: 'Robot', value: 'Futuristic robot, sci-fi, metallic, shiny', icon: 'bi-robot' },
                    { label: 'Anime', value: 'Anime style character, studio ghibli style, vibrant', icon: 'bi-stars' },
                    { label: '3D Render', value: 'Cute 3D character, pixar style, clay render, soft lighting', icon: 'bi-box-seam-fill' }
                ]
            }
        );
    }

    async function startAIGeneration(btn, userPrompt) {
        // Use passed button or find it
        if (!btn) btn = document.querySelector('.bi-stars').closest('button');

        // Progress Modal
        const loader = showLoading('AI Творит', 'Подготовка...');

        // Simulate progress
        let p = 5;
        const interval = setInterval(() => {
            if (p < 90) {
                p += Math.random() * 5;
                if (p > 90) p = 90;

                let text = 'Рисуем...';
                if (p > 20) text = 'Смешиваем краски...';
                if (p > 50) text = 'Добавляем детали...';
                if (p > 80) text = 'Почти готово...';

                loader.update(p, text);
            }
        }, 300);

        const originalContent = btn.innerHTML;
        const w = btn.offsetWidth;
        btn.style.width = w + 'px';
        btn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>';
        btn.disabled = true;

        try {
            // Call AI
            const res = await AIManager.generateImage(userPrompt);

            clearInterval(interval);
            loader.update(100, 'Загружаем...');

            if (res && res.status === 'ok' && res.data.url) {
                // If we are calling this from the Tab (not editor), we need to OPEN the editor first.
                if (document.getElementById('avatar-editor-overlay').style.display === 'none') {
                    openAvatarEditor();
                    await new Promise(r => setTimeout(r, 500));
                }

                await avatarEditor.loadImageFromUrl(res.data.url);
                if (window.ThemeManager) window.ThemeManager.triggerHaptic('notification', 'success');
                setTimeout(() => loader.close(), 500); // Close after brief success show
            } else {
                loader.close();
                setTimeout(() => {
                    showAlert('Ошибка генерации', res.message || 'Не удалось создать изображение', 'error');
                }, 300);
            }
        } catch (e) {
            console.error(e);
            clearInterval(interval);
            loader.close();
            setTimeout(() => {
                showAlert('Ошибка', 'Проблема с сетью или сервером', 'error');
            }, 300);
        } finally {
            btn.innerHTML = originalContent;
            // btn.style.width = ''; // Fix: Don't clear width
            btn.disabled = false;
        }
    }
</script>