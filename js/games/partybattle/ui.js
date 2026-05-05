// js/games/partybattle/ui.js

window.PartyBattleUI = {
    normalizeGameState: function (rawState) {
        const state = rawState || {};
        const round = state.round || null;
        const step = round?.step || null;
        const view = state.phase === 'results'
            ? 'results'
            : state.phase === 'lobby'
                ? 'lobby'
                : step === 'intro'
                    ? 'round_intro'
                    : step === 'submit'
                        ? 'round_submission'
                        : step === 'vote'
                            ? 'round_voting'
                            : step === 'results'
                                ? 'round_results'
                                : (state.phase || 'lobby');
        const prompt = round?.prompt || null;
        const displayPrompt = pb_getPromptDisplay(prompt, state.current_situation);
        const submissionEntries = pb_getSubmissionEntries(round, state.submissions);
        const votingOptions = pb_getVotingOptions(round, state.submissions);
        const votes = round?.voting?.votes || state.votes || {};
        const result = round?.result || state.last_round_data || {};

        return {
            ...state,
            view,
            round,
            activeMode: round?.mode || state.mode || 'meme',
            roundFamily: round?.family || null,
            roundStep: step || null,
            displayPrompt,
            submissionEntries,
            votingOptions,
            voteMap: votes,
            roundResult: result,
        };
    },

    renderLobby: function (gameState) {
        const isHost = window.APP_STATE.room.is_host;
        const selectedModes = Array.isArray(gameState.selected_modes) && gameState.selected_modes.length > 0
            ? gameState.selected_modes
            : ['meme', 'joke', 'advice', 'acronym', 'caption', 'bluff'];
        const selectedTheme = gameState.theme || 'base';
        const selectedRounds = parseInt(gameState.total_rounds, 10) || 5;
        const isAiMode = !!gameState.ai_mode;
        let html = `
        <div class="d-flex flex-column h-100 pb-3" style="padding-top: calc(env(safe-area-inset-top) + 10px); background:
            radial-gradient(circle at top, rgba(var(--primary-rgb), 0.12), transparent 35%),
            linear-gradient(180deg, rgba(255,255,255,0.02), transparent 30%);">
            <div class="px-3 pt-2">
                <div class="text-center mb-3">
                    <div class="game-page-title fw-black mb-1" style="font-size:2.35rem; letter-spacing:-0.04em; line-height:1; background: var(--primary-gradient); -webkit-background-clip:text; -webkit-text-fill-color:transparent;">Party Battle</div>
                    <div class="game-page-subtitle text-uppercase fw-bold small" style="color:var(--text-muted); letter-spacing:0.22em;">Mix, Vote, Laugh</div>
                </div>
                <div class="rounded-4 p-3 mb-3 shadow-sm" style="background: linear-gradient(135deg, rgba(var(--primary-rgb), 0.14), rgba(255,255,255,0.04)); border: 1px solid var(--border-glass);">
                    <div class="small text-uppercase fw-bold mb-1" style="letter-spacing:0.18em; color:var(--text-muted);">Лобби</div>
                    <div class="fw-semibold" style="color:var(--text-main); line-height:1.35;">Собери свою смесь режимов и запускай быстрые раунды без скучных пауз.</div>
                </div>
            </div>
        `;

        // HOST CONTROLS
        if (isHost) {
            html += `
            <div class="px-3 flex-grow-1">
                <div class="mb-3 rounded-4 p-3 shadow-sm" style="background: var(--bg-card); border: 1px solid var(--border-glass);">
                    <label class="small fw-bold mb-2 d-block text-muted text-uppercase">Выбранные режимы:</label>
                    <div id="pb-selected-modes-preview" class="d-flex flex-wrap gap-2 mb-3">
                        ${this.renderSelectedModeBadges(selectedModes)}
                    </div>
                    <button class="btn btn-outline-primary w-100 rounded-4 fw-bold" style="background: rgba(var(--primary-rgb), 0.06); border: 1px solid rgba(var(--primary-rgb), 0.25);"
                            onclick="document.getElementById('pbModesModal').style.display='flex'">
                        <i class="bi bi-list-check me-2"></i> Изменить режимы
                    </button>
                </div>

                <div class="mb-3 rounded-4 p-3 shadow-sm" style="background: var(--bg-card); border: 1px solid var(--border-glass);">
                    <label class="small fw-bold mb-2 d-block text-muted text-uppercase">КОЛИЧЕСТВО РАУНДОВ:</label>
                    <div class="d-flex gap-2 mb-3">
                        <button class="btn btn-outline-secondary flex-fill pb-round-btn ${selectedRounds === 3 ? 'active' : ''}" data-rounds="3" ${selectedRounds === 3 ? 'style="border-color: var(--primary-color); background: rgba(var(--primary-rgb), 0.1);"' : ''} onclick="PartyBattleUI.selectRounds(3)">3</button>
                        <button class="btn btn-outline-secondary flex-fill pb-round-btn ${selectedRounds === 5 ? 'active' : ''}" data-rounds="5" ${selectedRounds === 5 ? 'style="border-color: var(--primary-color); background: rgba(var(--primary-rgb), 0.1);"' : ''} onclick="PartyBattleUI.selectRounds(5)">5</button>
                        <button class="btn btn-outline-secondary flex-fill pb-round-btn ${selectedRounds === 7 ? 'active' : ''}" data-rounds="7" ${selectedRounds === 7 ? 'style="border-color: var(--primary-color); background: rgba(var(--primary-rgb), 0.1);"' : ''} onclick="PartyBattleUI.selectRounds(7)">7</button>
                        <button class="btn btn-outline-secondary flex-fill pb-round-btn ${selectedRounds === 10 ? 'active' : ''}" data-rounds="10" ${selectedRounds === 10 ? 'style="border-color: var(--primary-color); background: rgba(var(--primary-rgb), 0.1);"' : ''} onclick="PartyBattleUI.selectRounds(10)">10</button>
                    </div>
                    <input type="number" id="pb-rounds-custom" class="form-control rounded-3 py-2 text-center" 
                           style="background: var(--bg-main); border: 1px solid var(--border-glass); color: var(--text-main);" 
                           placeholder="Или введите количество..." min="1" max="20" value="${[3, 5, 7, 10].includes(selectedRounds) ? '' : selectedRounds}" oninput="PartyBattleUI.customRoundsInput()">
                    <input type="hidden" id="pb-rounds" value="${selectedRounds}">
                </div>
                
                <div class="mb-3 rounded-4 p-3 shadow-sm" style="background: var(--bg-card); border: 1px solid var(--border-glass);">
                    <label class="form-label fw-bold small text-muted text-uppercase mb-2">Настройки колоды:</label>
                    <div id="pb-selected-theme-preview" class="d-flex mb-3">
                        <span class="badge bg-primary rounded-pill px-3 py-2">
                            ${selectedTheme === 'adult' ? '18+ Полный треш' : 'Базовая колода'}
                        </span>
                    </div>

                    <div class="d-flex flex-column gap-3 mb-4">
                        <button class="btn btn-outline-primary w-100 fw-bold rounded-4" style="background: rgba(var(--primary-rgb), 0.06); border: 1px solid rgba(var(--primary-rgb), 0.25);"
                                onclick="document.getElementById('pbThemeModal').style.display='flex'">
                            <i class="bi bi-collection me-2"></i> Изменить колоду
                        </button>
                        <input type="hidden" id="pb-theme" value="${selectedTheme}">

                        <div class="form-check form-switch p-3 rounded-4 d-flex align-items-center m-0" style="background: var(--bg-main); border: 1px solid var(--border-glass);">
                            <input class="form-check-input m-0 me-3" type="checkbox" id="pb-ai-mode" style="transform: scale(1.3);" ${isAiMode ? 'checked' : ''}>
                            <label class="form-check-label text-muted small fw-bold m-0" for="pb-ai-mode">Генерация карточек через AI</label>
                        </div>
                    </div>
                </div>
            </div>
            `;
        } else {
            // PLAYER VIEW
            html += `
            <div class="px-3 flex-grow-1 d-flex flex-column justify-content-center align-items-center">
                <div class="rounded-4 p-4 text-center shadow-sm" style="background: var(--bg-card); border: 1px solid var(--border-glass); max-width: 340px;">
                    <div class="spinner-border text-primary opacity-50 mb-4" style="width: 3rem; height: 3rem;"></div>
                    <h4 class="fw-bold mb-2" style="color:var(--text-main);">Ожидание</h4>
                    <p class="text-muted text-center mb-0">Хост сейчас настраивает режимы и количество раундов...</p>
                </div>
            </div>
            `;
        }

        html += `
            <div class="fixed-bottom p-3" style="background: linear-gradient(180deg, rgba(255,255,255,0.02), var(--bg-glass)); backdrop-filter: blur(15px); -webkit-backdrop-filter: blur(15px); border-top: 1px solid var(--border-glass); z-index: 1000; padding-bottom: calc(env(safe-area-inset-bottom) + 10px) !important;">
                ${isHost ? `<button class="btn btn-primary w-100 mb-2 py-3 rounded-4 fw-bold shadow-sm" style="font-size:1.08rem; box-shadow: 0 12px 30px rgba(var(--primary-rgb), 0.28) !important;" onclick="PartyBattleUI.startGame()"><i class="bi bi-play-fill me-1"></i> Начать игру</button>` : ''}
                <button class="btn btn-outline-secondary w-100 fw-bold border-0" style="background: rgba(255,255,255,0.05); color: var(--text-main); font-size: 0.9rem;" onclick="window.sendGameAction('back_to_lobby')">
                    <i class="bi bi-box-arrow-right me-1"></i> ПОКИНУТЬ ИГРУ
                </button>
            </div>
            <div style="height: 120px;"></div>
        </div>
        `;

        if (isHost) {
            // Custom Modal Overlay for Modes
            html += `
            <div id="pbModesModal" style="display:none; position:fixed; inset:0; z-index:9999; background:rgba(0,0,0,0.8); backdrop-filter:blur(10px); align-items:flex-end; justify-content:center; opacity:0; transition: opacity 0.3s; padding: 20px;"
                onclick="if(event.target===this) PartyBattleUI.closeModesModal()">
            <div class="p-4 rounded-4 w-100 shadow-lg animate__animated animate__fadeInUp" style="background: var(--tg-theme-bg-color, #ffffff); max-width: 500px; border: 1px solid var(--border-glass); box-shadow: 0 10px 30px rgba(0,0,0,0.5) !important;">
                <div class="d-flex justify-content-between align-items-center mb-4">
                    <h4 class="fw-bold m-0" style="color:var(--text-main);">Режимы игры</h4>
                    <button class="btn-close" style="filter: var(--invert-filter);" onclick="PartyBattleUI.closeModesModal()"></button>
                </div>

                <div class="d-flex flex-column gap-2 mb-4">
                    <label class="form-check d-flex align-items-center py-2 px-3 rounded-3 m-0" style="background: var(--bg-main); border: 1px solid var(--border-glass); cursor: pointer;">
                        <input class="form-check-input pb-mode-cb m-0" type="checkbox" value="meme" ${selectedModes.includes('meme') ? 'checked' : ''} style="transform: scale(1.1);">
                        <div class="ms-3">
                            <div class="fw-bold lh-sm" style="color:var(--text-main); font-size: 1rem;">МемоБатл (Гифки)</div>
                            <div class="text-muted lh-sm mt-1" style="font-size: 0.75rem;">Подбирай смешные реакции к ситуациям</div>
                        </div>
                    </label>
                    <label class="form-check d-flex align-items-center py-2 px-3 rounded-3 m-0" style="background: var(--bg-main); border: 1px solid var(--border-glass); cursor: pointer;">
                        <input class="form-check-input pb-mode-cb m-0" type="checkbox" value="joke" ${selectedModes.includes('joke') ? 'checked' : ''} style="transform: scale(1.1);">
                        <div class="ms-3">
                            <div class="fw-bold lh-sm" style="color:var(--text-main); font-size: 1rem;">Добивка (Шутки)</div>
                            <div class="text-muted lh-sm mt-1" style="font-size: 0.75rem;">Придумай самую смешную концовку</div>
                        </div>
                    </label>
                    <label class="form-check d-flex align-items-center py-2 px-3 rounded-3 m-0" style="background: var(--bg-main); border: 1px solid var(--border-glass); cursor: pointer;">
                        <input class="form-check-input pb-mode-cb m-0" type="checkbox" value="whoami" ${selectedModes.includes('whoami') ? 'checked' : ''} style="transform: scale(1.1);">
                        <div class="ms-3">
                            <div class="fw-bold lh-sm" style="color:var(--text-main); font-size: 1rem;">Кто из нас?</div>
                            <div class="text-muted lh-sm mt-1" style="font-size: 0.75rem;">Анонимное голосование друг за друга</div>
                        </div>
                    </label>
                    <label class="form-check d-flex align-items-center py-2 px-3 rounded-3 m-0" style="background: var(--bg-main); border: 1px solid var(--border-glass); cursor: pointer;">
                        <input class="form-check-input pb-mode-cb m-0" type="checkbox" value="advice" ${selectedModes.includes('advice') ? 'checked' : ''} style="transform: scale(1.1);">
                        <div class="ms-3">
                            <div class="fw-bold lh-sm" style="color:var(--text-main); font-size: 1rem;">Вредные советы</div>
                            <div class="text-muted lh-sm mt-1" style="font-size: 0.75rem;">Выходим из неловких ситуаций</div>
                        </div>
                    </label>
                    <label class="form-check d-flex align-items-center py-2 px-3 rounded-3 m-0" style="background: var(--bg-main); border: 1px solid var(--border-glass); cursor: pointer;">
                        <input class="form-check-input pb-mode-cb m-0" type="checkbox" value="acronym" ${selectedModes.includes('acronym') ? 'checked' : ''} style="transform: scale(1.1);">
                        <div class="ms-3">
                            <div class="fw-bold lh-sm" style="color:var(--text-main); font-size: 1rem;">Дешифратор</div>
                            <div class="text-muted lh-sm mt-1" style="font-size: 0.75rem;">Смешно расшифровываем аббревиатуры</div>
                        </div>
                    </label>
                    <label class="form-check d-flex align-items-center py-2 px-3 rounded-3 m-0" style="background: var(--bg-main); border: 1px solid var(--border-glass); cursor: pointer;">
                        <input class="form-check-input pb-mode-cb m-0" type="checkbox" value="caption" ${selectedModes.includes('caption') ? 'checked' : ''} style="transform: scale(1.1);">
                        <div class="ms-3">
                            <div class="fw-bold lh-sm" style="color:var(--text-main); font-size: 1rem;">Подпиши картинку</div>
                            <div class="text-muted lh-sm mt-1" style="font-size: 0.75rem;">Придумываем подпись к рандомному мему</div>
                        </div>
                    </label>
                    <label class="form-check d-flex align-items-center py-2 px-3 rounded-3 m-0" style="background: var(--bg-main); border: 1px solid var(--border-glass); cursor: pointer;">
                        <input class="form-check-input pb-mode-cb m-0" type="checkbox" value="bluff" ${selectedModes.includes('bluff') ? 'checked' : ''} style="transform: scale(1.1);">
                        <div class="ms-3">
                            <div class="fw-bold lh-sm" style="color:var(--text-main); font-size: 1rem;">Блеф</div>
                            <div class="text-muted lh-sm mt-1" style="font-size: 0.75rem;">Пишем ложь и пытаемся угадать правду</div>
                        </div>
                    </label>
                </div>

                <button class="btn btn-primary w-100 py-3 rounded-4 fw-bold shadow-sm" onclick="PartyBattleUI.closeModesModal()">Применить</button>
            </div>
            </div>
            
            <div id="pbThemeModal" style="display:none; position:fixed; inset:0; z-index:9999; background:rgba(0,0,0,0.8); backdrop-filter:blur(10px); align-items:flex-end; justify-content:center; opacity:0; transition: opacity 0.3s; padding: 20px;"
                onclick="if(event.target===this) PartyBattleUI.closeThemeModal()">
                <div class="p-4 rounded-4 w-100 shadow-lg animate__animated animate__fadeInUp" style="background: var(--tg-theme-bg-color, #ffffff); max-width: 500px; border: 1px solid var(--border-glass); box-shadow: 0 10px 30px rgba(0,0,0,0.5) !important;">
                    <div class="d-flex justify-content-between align-items-center mb-4">
                        <h4 class="fw-bold m-0" style="color:var(--text-main);">Набор карточек</h4>
                        <button class="btn-close" style="filter: var(--invert-filter);" onclick="PartyBattleUI.closeThemeModal()"></button>
                    </div>

                    <div class="d-flex flex-column gap-3 mb-4">
                        <label class="form-check d-flex align-items-center p-3 rounded-4 m-0" style="background: var(--bg-main); border: 2px solid var(--border-glass); cursor: pointer;" onclick="PartyBattleUI.selectTheme('base')">
                            <input class="form-check-input pb-theme-radio m-0" type="radio" name="pb-theme-radio" value="base" ${selectedTheme === 'base' ? 'checked' : ''} style="transform: scale(1.3);">
                                <div class="ms-3">
                                    <div class="fw-bold" style="color:var(--text-main); font-size: 1.1rem;">Базовая колода</div>
                                    <div class="small text-muted">Стандартный набор ситуаций (12+)</div>
                                </div>
                        </label>
                        <label class="form-check d-flex align-items-center p-3 rounded-4 m-0" style="background: var(--bg-main); border: 2px solid var(--border-glass); cursor: pointer;" onclick="PartyBattleUI.selectTheme('adult')">
                            <input class="form-check-input pb-theme-radio m-0" type="radio" name="pb-theme-radio" value="adult" ${selectedTheme === 'adult' ? 'checked' : ''} style="transform: scale(1.3);">
                                <div class="ms-3">
                                    <div class="fw-bold text-danger" style="font-size: 1.1rem;">18+ Полный треш</div>
                                    <div class="small text-muted">Жесткий юмор для взрослых компаний</div>
                                </div>
                        </label>
                    </div>

                    <button class="btn btn-primary w-100 py-3 rounded-4 fw-bold shadow-sm" onclick="PartyBattleUI.closeThemeModal()">Применить</button>
                </div>
            </div>
            `;
        }

        document.getElementById('game-area').innerHTML = html;

        // Immediately hide the modal properly so display flex doesn't override it initially
        const modalModes = document.getElementById('pbModesModal');
        if (modalModes) {
            modalModes.style.display = 'none';
            modalModes.style.opacity = '1';
        }
        const modalTheme = document.getElementById('pbThemeModal');
        if (modalTheme) {
            modalTheme.style.display = 'none';
            modalTheme.style.opacity = '1';
        }
    },

    renderSelectedModeBadges: function (selectedModes) {
        const labels = {
            'meme': 'МемоБатл',
            'joke': 'Добивка',
            'whoami': 'Кто из нас?',
            'advice': 'Вредные советы',
            'acronym': 'Дешифратор',
            'caption': 'Подпиши картинку',
            'bluff': 'Блеф'
        };

        return selectedModes.map(mode => {
            return `<span class="badge bg-primary rounded-pill px-3 py-2 me-1 mb-1">${labels[mode] || mode}</span>`;
        }).join('');
    },

    closeModesModal: function () {
        const modal = document.getElementById('pbModesModal');
        if (modal) {
            modal.style.display = 'none';
            this.updateModesPreview();
        }
    },

    closeThemeModal: function () {
        const modal = document.getElementById('pbThemeModal');
        if (modal) {
            modal.style.display = 'none';
            this.updateThemePreview();
        }
    },

    selectTheme: function (val) {
        document.getElementById('pb-theme').value = val;
    },

    updateThemePreview: function () {
        const preview = document.getElementById('pb-selected-theme-preview');
        const themeInput = document.getElementById('pb-theme');
        if (!preview || !themeInput) return;

        const val = themeInput.value;
        const labels = {
            'base': 'Базовая колода',
            'adult': '18+ Полный треш'
        };

        if (val === 'adult') {
            preview.innerHTML = `<span class="badge bg-danger rounded-pill px-3 py-2">18+ Полный треш</span>`;
        } else {
            preview.innerHTML = `<span class="badge bg-primary rounded-pill px-3 py-2">Базовая колода</span>`;
        }
    },

    updateModesPreview: function () {
        const preview = document.getElementById('pb-selected-modes-preview');
        if (!preview) return;

        const labels = {
            'meme': 'МемоБатл',
            'joke': 'Добивка',
            'whoami': 'Кто из нас?',
            'advice': 'Вредные советы',
            'acronym': 'Дешифратор',
            'caption': 'Подпиши картинку',
            'bluff': 'Блеф'
        };

        const checked = Array.from(document.querySelectorAll('.pb-mode-cb:checked'));
        if (checked.length === 0) {
            preview.innerHTML = '<span class="text-danger small fw-bold">Выберите хотя бы один режим!</span>';
            return;
        }

        preview.innerHTML = checked.map(cb => {
            return `<span class="badge bg-primary rounded-pill px-3 py-2 me-1 mb-1">${labels[cb.value]}</span>`;
        }).join('');
    },

    selectRounds: function (val) {
        document.getElementById('pb-rounds').value = val;
        document.getElementById('pb-rounds-custom').value = '';
        document.querySelectorAll('.pb-round-btn').forEach(btn => {
            btn.style.borderColor = '';
            btn.style.background = '';
            btn.classList.remove('active');
            if (parseInt(btn.dataset.rounds) === val) {
                btn.classList.add('active');
                btn.style.borderColor = 'var(--primary-color)';
                btn.style.background = 'rgba(var(--primary-rgb), 0.1)';
            }
        });
    },

    customRoundsInput: function () {
        const customInput = document.getElementById('pb-rounds-custom');
        const hiddenInput = document.getElementById('pb-rounds');

        document.querySelectorAll('.pb-round-btn').forEach(btn => {
            btn.style.borderColor = '';
            btn.style.background = '';
            btn.classList.remove('active');
        });

        let val = parseInt(customInput.value);
        if (!isNaN(val) && val > 0) {
            hiddenInput.value = val;
        } else {
            // fallback
            hiddenInput.value = 5;
        }
    },

    startGame: async function () {
        const btn = document.querySelector('button[onclick="PartyBattleUI.startGame()"]');
        const originalHtml = btn ? btn.innerHTML : null;
        if (btn) btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span> Запускаем...';

        const checkedModes = Array.from(document.querySelectorAll('.pb-mode-cb:checked')).map(cb => cb.value);
        if (checkedModes.length === 0) {
            window.showAlert('Ошибка', 'Выберите хотя бы один режим игры!');
            if (btn) btn.innerHTML = originalHtml || '<i class="bi bi-play-fill me-1"></i> Начать игру';
            return;
        }

        const mode = checkedModes;
        const rounds = document.getElementById('pb-rounds').value;
        const theme = document.getElementById('pb-theme').value;
        const aiMode = document.getElementById('pb-ai-mode').checked;

        try {
            const res = await window.sendGameAction('start_game', {
                mode: mode,
                rounds: rounds,
                theme: theme,
                ai_mode: aiMode
            });

            if (res && res.status === 'error') {
                if (btn) btn.innerHTML = originalHtml || '<i class="bi bi-play-fill me-1"></i> Начать игру';
            }
        } catch (e) {
            console.error("PartyBattle: Error starting game", e);
            if (btn) btn.innerHTML = originalHtml || '<i class="bi bi-play-fill me-1"></i> Начать игру';
        }
    },

    /* --- COMMON COMPONENTS --- */

    renderHeader: function (gameState) {
        const modeMeta = pb_getModeMeta(gameState.activeMode);
        const stageMeta = pb_getStageMeta(gameState.view);
        const roundText = gameState.view !== 'lobby' && gameState.view !== 'results'
            ? `Раунд ${gameState.current_round} из ${gameState.total_rounds}`
            : '';
        return `
            <div class="header-container px-3 pt-2 pb-3 text-center" style="background: transparent;">
                <div class="d-flex justify-content-center gap-2 flex-wrap mb-2">
                    ${roundText ? `<span class="badge rounded-pill px-3 py-2" style="background: rgba(var(--primary-rgb), 0.12); color: var(--primary-color); border: 1px solid rgba(var(--primary-rgb), 0.16); font-size: 11px; letter-spacing: 0.08em;">${roundText}</span>` : ''}
                    ${modeMeta.label ? `<span class="badge rounded-pill px-3 py-2" style="background: rgba(255,255,255,0.7); color: var(--text-main); border: 1px solid var(--border-glass); font-size: 11px; letter-spacing: 0.08em;">${modeMeta.label}</span>` : ''}
                </div>
                <h3 class="fw-black m-0 mb-1" style="color:var(--text-main); line-height: 1; letter-spacing: -0.04em;">Party Battle</h3>
                <div class="small fw-bold text-uppercase" style="color:var(--text-muted); letter-spacing: 0.18em;">${stageMeta.label}</div>
            </div>
            `;
    },

    renderBottomActions: function () {
        return `
            <div class="fixed-bottom p-3" style="background: linear-gradient(180deg, rgba(255,255,255,0.02), var(--bg-glass)); backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px); border-top: 1px solid var(--border-glass); z-index: 1000; padding-bottom: calc(env(safe-area-inset-bottom) + 10px) !important;">
                <button class="btn btn-outline-secondary w-100 fw-bold border-0 rounded-4" style="background: rgba(255,255,255,0.55); color: var(--text-main); font-size: 0.92rem; min-height: 56px;" onclick="window.sendGameAction('back_to_lobby')">
                    <i class="bi bi-box-arrow-right me-1"></i> ПОКИНУТЬ ИГРУ
                </button>
            </div>
            <div style="height: 100px;"></div>
        `;
    },

    renderSubmissionFooter: function () {
        return `
            <div class="p-3 mt-auto" style="z-index: 10;">
                <button class="btn btn-outline-secondary w-100 fw-bold border-0 rounded-4" style="background: rgba(255,255,255,0.55); color: var(--text-main); font-size: 0.92rem; opacity: 0.82; min-height: 56px;" onclick="window.sendGameAction('back_to_lobby')">
                    <i class="bi bi-box-arrow-right me-1"></i> ПОКИНУТЬ ИГРУ
                </button>
            </div>
        `;
    },

    renderSituation: function (gameState) {
        if (!gameState.displayPrompt) return;

        const isHost = window.APP_STATE.room.is_host;
        let html = `
            <div class="d-flex flex-column h-100" style="padding-top: calc(env(safe-area-inset-top) + 10px);">
                ${this.renderHeader(gameState)}
                <div class="d-flex flex-column align-items-center justify-content-center flex-grow-1 pb-5 pt-1 animate__animated animate__fadeIn px-3" style="margin-top: -6px;">
        `;

        const sitText = gameState.displayPrompt.body || '';
        const imageUrl = gameState.displayPrompt.mediaUrl || '';

        html += `
            <div class="text-center mb-3">
                <div class="small fw-bold text-uppercase mb-2" style="color:var(--text-muted); letter-spacing:0.18em;">Раунд открыт</div>
                <div class="fw-semibold" style="color:var(--text-main); opacity:0.82; max-width:420px;">Сейчас игроки увидят общий prompt и перейдут к действию.</div>
            </div>
            <div class="badge rounded-pill mb-3 border shadow-sm px-3 py-2" style="font-size: 12px; background: rgba(var(--primary-rgb), 0.12); color: var(--primary-color); border-color: rgba(var(--primary-rgb), 0.16) !important; letter-spacing:0.12em;">СИТУАЦИЯ</div>
            <div class="p-4 mb-4 shadow-lg rounded-4 d-flex align-items-center justify-content-center text-center position-relative overflow-hidden" 
                 style="min-height: 220px; width: 100%; max-width: 600px; background: linear-gradient(180deg, rgba(255,255,255,0.92), rgba(var(--primary-rgb), 0.05)); border: 1px solid var(--border-glass) !important; box-shadow: 0 24px 60px rgba(31, 38, 135, 0.08) !important; padding: ${gameState.displayPrompt.kind === 'image' ? '0 !important' : 'var(--bs-p-4)'}">
                ${gameState.displayPrompt.kind === 'image' ? `
                    ${pb_renderPromptImage(imageUrl, 'w-100 h-100 object-fit-cover position-absolute top-0 start-0')}
                ` : `
                    <i class="bi bi-masks-theater position-absolute" style="top: -10px; left: -10px; font-size: 80px; opacity: 0.05; transform: rotate(-15deg);"></i>
                    <i class="bi bi-emoji-laughing position-absolute" style="bottom: -10px; right: -10px; font-size: 80px; opacity: 0.05; transform: rotate(15deg);"></i>
                    <h3 class="fw-bold m-0 position-relative z-1" style="color:var(--text-main); line-height: 1.4;">${sitText}</h3>
                `}
            </div>
        `;

        if (isHost) {
            let btnText = 'Раздать варианты';
            if (gameState.roundFamily === 'direct_vote') btnText = 'Перейти к голосованию';
            else if (gameState.displayPrompt.kind === 'image') btnText = 'Начать сбор ответов';
            else if (gameState.roundFamily === 'creative_vote' || gameState.roundFamily === 'bluff') btnText = 'Начать сбор ответов';

            html += `
            <button class="btn btn-primary w-100 py-3 rounded-4 fw-bold fs-5 shadow-sm mb-3 animate__animated animate__pulse animate__infinite"
                style="max-width: 600px; box-shadow: 0 18px 42px rgba(var(--primary-rgb), 0.24) !important;"
                onclick="window.sendGameAction('next_round')">
                ${btnText} <i class="bi bi-arrow-right"></i>
            </button>
            `;
        } else {
            html += `
            <div class="spinner-border text-primary opacity-50 mb-3" role="status"></div>
            <h5 class="text-muted fw-bold mb-3">Приготовьтесь...</h5>
            `;
        }

        html += `
                </div>
                ${this.renderBottomActions()}
            </div>
        `;
        document.getElementById('game-area').innerHTML = html;

        // Auto progress bar animation
        setTimeout(() => {
            const container = document.querySelector('.animate__fadeIn');
            if (!container) return;
            const barContainer = document.createElement('div');
            barContainer.className = 'progress w-100 rounded-pill mt-4 mx-auto';
            barContainer.style.height = '6px';
            barContainer.style.maxWidth = '280px';
            barContainer.style.background = 'rgba(0,0,0,0.05)';
            barContainer.innerHTML = `<div class="progress-bar" style="width: 0%; transition: width ${isHost ? '3s' : '0.5s'} linear; background: var(--primary-gradient);"></div>`;
            container.appendChild(barContainer);

            setTimeout(() => { barContainer.querySelector('.progress-bar').style.width = '100%'; }, 100);
        }, 100);
    },

    /* --- SUBMISSION SCREEN --- */
    renderSubmissionScreen: function (gameState) {
        if (!window.PartyBattleModes) return;

        const gameArea = document.getElementById('game-area');
        const situation = gameState.displayPrompt?.body || gameState.displayPrompt?.mediaUrl || '...';
        const myId = String(pb_getMyId());
        const myHand = (gameState.hands && gameState.hands[myId]) || [];

        const modeMeta = pb_getModeMeta(gameState.activeMode);
        const totalPlayers = gameState.scores ? Object.keys(gameState.scores).length : 0;
        const submittedCount = gameState.submissionEntries.filter(entry => entry.id !== 'truth').length;
        const hasSubmitted = gameState.submissionEntries.some(entry => String(entry.authorId) === myId);

        let html = `
            <div class="d-flex flex-column min-vh-100 pb-4" style="padding-top: calc(env(safe-area-inset-top) + 10px);">
                ${this.renderHeader(gameState)}
                
                <div class="px-3 py-2 animate__animated animate__fadeInDown">
                    <div class="p-3 shadow-lg rounded-4" style="background: linear-gradient(180deg, rgba(255,255,255,0.94), rgba(var(--primary-rgb), 0.04)); border: 1px solid var(--border-glass); box-shadow: 0 24px 60px rgba(31, 38, 135, 0.08) !important;">
                        <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
                            <div class="small text-muted fw-bold opacity-75 text-uppercase" style="font-size: 10px; letter-spacing: 0.14em;">${modeMeta.label}</div>
                            <span class="badge rounded-pill px-3 py-2" style="background: rgba(var(--primary-rgb), 0.1); color: var(--primary-color); border: 1px solid rgba(var(--primary-rgb), 0.14);">Сбор ответов</span>
                        </div>
                        ${gameState.displayPrompt?.kind === 'image'
                ? pb_renderPromptImage(situation, 'w-100 rounded-3 object-fit-cover shadow-sm', 'max-height: 250px;')
                : `<div class="fw-bold text-main" style="font-size: 1.15rem; line-height: 1.3;">${situation}</div>`
            }
                    </div>
                </div>
        `;

        if (hasSubmitted) {
            html += `
                <div class="flex-grow-1 d-flex flex-column align-items-center justify-content-center text-center p-4">
                    <div class="p-4 rounded-4 shadow-lg animate__animated animate__bounceIn mb-4" style="background: linear-gradient(180deg, rgba(255,255,255,0.94), rgba(var(--primary-rgb), 0.05)); border: 1px solid var(--border-glass); box-shadow: 0 24px 60px rgba(31, 38, 135, 0.08) !important;">
                        <i class="bi bi-check-circle-fill text-success display-1 mb-4 d-block"></i>
                        <h3 class="fw-bold" style="color:var(--text-main);">Принято!</h3>
                        <p class="text-muted small mb-4">Ждем остальных игроков...</p>
                        <div class="d-flex align-items-center justify-content-center gap-2 bg-secondary bg-opacity-10 rounded-pill px-3 py-2 mx-auto" style="max-width: fit-content;">
                            <div class="spinner-border spinner-border-sm text-primary"></div>
                            <span class="small fw-bold opacity-75">Сдали: ${submittedCount} / ${totalPlayers}</span>
                        </div>
                    </div>
                </div>
            `;
        } else {
            html += `
                <div class="flex-grow-1 px-3">
                    ${window.PartyBattleModes.renderSubmission(gameState, myHand)}
                </div>
            `;
        }

        html += `
                ${this.renderSubmissionFooter()}
            </div>
        `;
        gameArea.innerHTML = html;

        // Focus input after render
        setTimeout(() => {
            document.getElementById('pb-joke-input')?.focus();
        }, 300);
    },

    submitAnswer: function (memoUrl = null) {
        let answer = memoUrl;

        // If it's joke mode, grab text
        if (!answer) {
            const input = document.getElementById('pb-joke-input');
            if (input) {
                answer = input.value.trim();
                if (!answer) {
                    const label = this.getSubmissionEmptyMessage(window.APP_STATE?.room?.game_state_normalized || null);
                    window.showAlert('Ошибка', label, 'error');
                    return;
                }
            }
        }

        if (!answer) return;
        window.sendGameAction('submit_answer', { answer: answer });
    },

    submitVote: async function (targetId, button = null) {
        if (!targetId) return;

        const originalHtml = button ? button.innerHTML : null;
        if (button) {
            button.disabled = true;
            button.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Отправляю...';
        }

        try {
            const res = await window.sendGameAction('vote', { target_id: targetId });
            if (!res || res.status !== 'ok') {
                if (button) {
                    button.disabled = false;
                    button.innerHTML = originalHtml || 'ВЫБРАТЬ';
                }
            }
        } catch (e) {
            if (button) {
                button.disabled = false;
                button.innerHTML = originalHtml || 'ВЫБРАТЬ';
            }
        }
    },

    getSubmissionEmptyMessage: function (gameState = null) {
        const activeMode = gameState?.activeMode || null;
        if (activeMode === 'advice') return 'Напиши совет!';
        if (activeMode === 'acronym') return 'Напиши расшифровку!';
        if (activeMode === 'caption') return 'Напиши подпись!';
        if (activeMode === 'bluff') return 'Напиши ложь!';
        return 'Напиши шутку!';
    },

    /* --- VOTING SCREEN --- */
    renderVotingScreen: function (gameState) {
        if (!window.PartyBattleModes) return;

        const gameArea = document.getElementById('game-area');
        const myId = String(pb_getMyId());
        const hasVoted = gameState.voteMap && gameState.voteMap[myId];
        const situation = gameState.displayPrompt?.body || gameState.displayPrompt?.mediaUrl || '';
        const modeMeta = pb_getModeMeta(gameState.activeMode);

        // DIAGNOSTIC LOG
        console.log('[PartyBattle] renderVotingScreen', {
            myId,
            hasVoted,
            votes: gameState.voteMap,
            mode: gameState.activeMode,
            submissions: gameState.submissionEntries.map(entry => entry.id),
            renderAvatarExists: typeof window.renderAvatar,
            players: (window.APP_STATE?.room?.players || []).map(p => ({ id: p.id, photo_url: !!p.photo_url, custom_avatar: !!p.custom_avatar }))
        });
        const entries = gameState.votingOptions;

        const totalPlayers = gameState.scores ? Object.keys(gameState.scores).length : 0;
        const votedCount = gameState.voteMap ? Object.keys(gameState.voteMap).length : 0;

        let html = `
            <div class="d-flex flex-column h-100" style="padding-top: calc(env(safe-area-inset-top) + 10px);">
                ${this.renderHeader(gameState)}
                
                <div class="flex-grow-1 px-3 animate__animated animate__fadeIn">
                    <div class="text-center mb-3">
                        <div class="small text-muted fw-bold opacity-75 text-uppercase mb-2" style="letter-spacing:0.18em;">ГОЛОСОВАНИЕ</div>
                        <div class="d-flex justify-content-center flex-wrap gap-2 mb-3">
                            <span class="badge rounded-pill px-3 py-2" style="background: rgba(var(--primary-rgb), 0.1); color: var(--primary-color); border: 1px solid rgba(var(--primary-rgb), 0.14);">${modeMeta.label}</span>
                            <span class="badge rounded-pill px-3 py-2" style="background: rgba(255,255,255,0.7); color: var(--text-main); border: 1px solid var(--border-glass);">Выбери лучший вариант</span>
                        </div>
                        ${gameState.displayPrompt?.kind === 'image'
                ? `<div class="mb-3">${pb_renderPromptImage(situation, 'w-100 rounded-4 object-fit-cover shadow-sm mx-auto', 'max-width: 600px; max-height: 260px;')}</div>`
                : `<div class="fw-bold fs-5 mx-auto" style="color:var(--text-main); max-width: 680px; line-height:1.32;">${situation}</div>`}
                    </div>
                    
                    ${hasVoted ? `
                        <div class="p-3 mb-4 mx-auto rounded-4 shadow-sm animate__animated animate__pulse text-center" 
                             style="background: linear-gradient(135deg, rgba(74, 222, 128, 0.9), rgba(34, 197, 94, 0.9)); color: white; border: none; max-width: 240px;">
                            <div class="fw-bold mb-1"><i class="bi bi-check-circle-fill me-1"></i> Голос принят!</div>
                            <div class="small opacity-75">Ждем остальных...</div>
                        </div>
                    ` : ''}
                    
                    ${(gameState.roundFamily === 'creative_vote' && gameState.activeMode !== 'meme')
                ? window.PartyBattleModes.renderJokeVoting(entries, hasVoted, myId)
                : (gameState.roundFamily === 'bluff')
                    ? window.PartyBattleModes.renderBluffVoting(entries, hasVoted, myId)
                    : window.PartyBattleModes.renderVoting(gameState, entries, hasVoted, myId)}
                </div>

                <div class="fixed-bottom p-3" style="background: linear-gradient(180deg, rgba(255,255,255,0.02), var(--bg-glass)); backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px); border-top: 1px solid var(--border-glass); z-index: 1000; padding-bottom: calc(env(safe-area-inset-bottom) + 10px) !important;">
                    <div class="d-flex align-items-center justify-content-center gap-2 mb-2 rounded-4 py-2" style="background: rgba(255,255,255,0.5);">
                        <div class="spinner-grow spinner-grow-sm text-primary" role="status"></div>
                        <span class="small fw-bold text-muted">Голоса: <span style="color:var(--text-main);">${votedCount} / ${totalPlayers}</span></span>
                    </div>
                    <button class="btn btn-outline-secondary w-100 fw-bold border-0 rounded-4" style="background: rgba(255,255,255,0.55); color: var(--text-main); font-size: 0.92rem; min-height: 56px;" onclick="window.sendGameAction('back_to_lobby')">
                        <i class="bi bi-box-arrow-right me-1"></i> ПОКИНУТЬ ИГРУ
                    </button>
                </div>
                <div style="height: 120px;"></div>
            </div>
        `;

        gameArea.innerHTML = html;
    },

    /* --- RESULTS SCREENS --- */
    renderRoundResults: function (gameState) {
        const gameArea = document.getElementById('game-area');
        const isHost = (window.APP_STATE?.room?.is_host) || false;
        const roundResult = gameState.roundResult || {};
        const mode = gameState.activeMode;

        const voteCounts = { ...(roundResult.vote_counts || {}) };
        if (Object.keys(voteCounts).length === 0) {
            Object.values(gameState.voteMap || {}).forEach(target => {
                voteCounts[target] = (voteCounts[target] || 0) + 1;
            });
        }

        const winnerId = roundResult.winner_id || null;
        const winnerType = roundResult.winner_type || (mode === 'whoami' ? 'player' : 'submission');
        const winnerPlayerId = roundResult.winner_player_id || winnerId;
        const winnerContent = roundResult.winner_content || '';
        const winnerVotes = roundResult.winner_votes || (winnerId ? (voteCounts[winnerId] || 0) : 0);
        const winnerPlayer = (window.APP_STATE?.room?.players || []).find(p => String(p.id) === String(winnerPlayerId));
        const title = winnerType === 'truth' ? 'Правда раскрыта!' : 'Победитель раунда!';
        const subtitle = winnerType === 'truth'
            ? 'Игроки чаще всего выбрали правильный вариант.'
            : (winnerPlayer?.display_name || winnerPlayer?.first_name || 'Игрок');
        const modeMeta = pb_getModeMeta(mode);

        let html = `
            <div class="d-flex flex-column h-100" style="padding-top: calc(env(safe-area-inset-top) + 10px);">
                ${this.renderHeader(gameState)}
                <div class="flex-grow-1 d-flex flex-column align-items-center p-3 text-center position-relative animate__animated animate__fadeIn">
                    <div class="small text-uppercase fw-bold mb-2" style="color:var(--text-muted); letter-spacing:0.18em;">${modeMeta.label}</div>
                    <h2 class="fw-bold mb-2" style="color:var(--text-main);">${title}</h2>
                    <div class="text-muted fw-semibold mb-4" style="max-width:420px;">${winnerType === 'truth' ? subtitle : 'Лучший ответ раунда по мнению игроков.'}</div>
                    <div class="p-4 rounded-4 shadow-lg animate__animated animate__tada"
                        style="background: linear-gradient(180deg, rgba(255,255,255,0.96), rgba(var(--primary-rgb), 0.06)); border: 1px solid rgba(var(--primary-rgb), 0.22); max-width: 420px; width: 100%; box-shadow: 0 28px 70px rgba(var(--primary-rgb), 0.12) !important;">
                        ${winnerType === 'truth' ? `
                            <div class="d-flex align-items-center justify-content-center mb-3">
                                <span class="badge bg-success rounded-pill px-3 py-2">Это была правда</span>
                            </div>
                        ` : `
                            <div class="d-flex align-items-center justify-content-center mb-3">
                                <div style="width:40px; height:40px; margin-right:8px;">${pb_renderAvatar(winnerPlayer, 'md')}</div>
                                <span class="fw-bold" style="color:var(--text-main);">${subtitle}</span>
                            </div>
                        `}
                        ${mode === 'meme' && winnerType !== 'truth' ? `
                            <div class="rounded-4 overflow-hidden mb-3" style="aspect-ratio: 1;">
                                <img src="${winnerContent}" class="w-100 h-100 object-fit-cover shadow-sm">
                            </div>
                        ` : (mode === 'caption' ? `
                            <div class="mb-3">
                                ${pb_renderPromptImage(gameState.displayPrompt?.mediaUrl || '', 'w-100 rounded-4 object-fit-cover shadow-sm', 'max-height: 220px;')}
                            </div>
                            <h3 class="fw-bold mb-4" style="color:var(--text-main); line-height: 1.4;">${winnerContent}</h3>
                        ` : (mode === 'whoami' ? '' : `
                            <h3 class="fw-bold mb-4" style="color:var(--text-main); line-height: 1.4;">${winnerContent}</h3>
                        `))}
                        <div class="text-center rounded-4 p-3" style="background: rgba(var(--primary-rgb), 0.06);">
                            ${winnerType === 'truth'
                ? `<div class="small text-muted fw-bold">Голосов за правду: ${winnerVotes}</div>`
                : `<h2 class="fw-bold text-primary mb-1">+${winnerVotes * 100}</h2>
                                   <div class="small text-muted fw-bold">Голосов: ${winnerVotes}</div>`}
                        </div>
                    </div>
                </div>
                
                <div class="fixed-bottom p-3" style="background: linear-gradient(180deg, rgba(255,255,255,0.02), var(--bg-glass)); backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px); border-top: 1px solid var(--border-glass); z-index: 1000; padding-bottom: calc(env(safe-area-inset-bottom) + 10px) !important;">
                    ${isHost ? `
                        <button class="btn btn-primary py-3 w-100 rounded-4 fw-bold shadow-lg mb-2" style="min-height:56px;" onclick="window.sendGameAction('next_round')">
                            СЛЕДУЮЩИЙ РАУНД <i class="bi bi-chevron-right ms-2"></i>
                        </button>
                    ` : `
                        <div class="p-3 w-100 text-center rounded-4 opacity-75 mb-2" style="background: rgba(255,255,255,0.55); border: 1px solid var(--border-glass);">
                            <span class="small fw-bold text-muted">Хост скоро запустит новый раунд...</span>
                        </div>
                    `}
                    <button class="btn btn-outline-secondary w-100 fw-bold border-0 rounded-4" style="background: rgba(255,255,255,0.55); color: var(--text-main); font-size: 0.92rem; min-height:56px;" onclick="window.sendGameAction('back_to_lobby')">
                        <i class="bi bi-box-arrow-right me-1"></i> ПОКИНУТЬ ИГРУ
                    </button>
                </div>
                <div style="height: 160px;"></div>
            </div>
        `;
        gameArea.innerHTML = html;
    },

    renderGameResults: function (gameState) {
        const gameArea = document.getElementById('game-area');
        if (!gameArea) return;
        const scores = gameState.scores || {};
        const sortedIds = Object.keys(scores).sort((a, b) => (scores[b] || 0) - (scores[a] || 0));
        const myId = String(pb_getMyId());

        let html = `
            <div class="d-flex flex-column h-100" style="padding-top: calc(env(safe-area-inset-top) + 10px);">
                <div class="header-container text-center mb-4 mt-2 px-3">
                    <div class="small text-uppercase fw-bold mb-2" style="color:var(--text-muted); letter-spacing:0.18em;">ФИНАЛ</div>
                    <i class="bi bi-trophy-fill display-4 mb-2 animate__animated animate__bounceIn" style="color: var(--primary-color);"></i>
                    <h2 class="fw-bold mb-2" style="color:var(--text-main);">Итоги игры</h2>
                    <div class="text-muted fw-semibold">Финальный рейтинг после всех раундов.</div>
                </div>
                
                <div class="flex-grow-1 overflow-auto px-3 mb-4">
                    ${sortedIds.map((uid, index) => {
            const score = scores[uid];
            const player = (window.APP_STATE?.room?.players || []).find(p => String(p.id) === String(uid));
            const isWinner = index === 0;
            const isMe = String(uid) === myId;
            return `
                            <div class="d-flex justify-content-between align-items-center p-3 mb-2 rounded-4 shadow-sm animate__animated animate__fadeInUp" 
                                    style="background: ${isWinner ? 'linear-gradient(135deg, rgba(var(--primary-rgb), 0.92), rgba(104, 92, 255, 0.82))' : 'linear-gradient(180deg, rgba(255,255,255,0.96), rgba(var(--primary-rgb), 0.04))'}; border: 1px solid ${isMe ? 'rgba(var(--primary-rgb), 0.34)' : 'var(--border-glass)'}; color: ${isWinner ? 'white' : 'var(--text-main)'}; transition-delay: ${index * 0.1}s; box-shadow:${isWinner ? '0 20px 45px rgba(var(--primary-rgb), 0.18)' : '0 10px 28px rgba(31, 38, 135, 0.05)'};">
                                <div class="d-flex align-items-center gap-3">
                                    <div class="fw-bold" style="color:${isWinner ? 'white' : 'var(--text-main)'}; width: 24px;">#${index + 1}</div>
                                    <div style="width:36px; height:36px; margin-right:6px;">${pb_renderAvatar(player, 'sm')}</div>
                                    <div class="fw-bold text-truncate" style="color:${isWinner ? 'white' : 'var(--text-main)'}; max-width: 150px;">${player ? (player.display_name || player.first_name) : 'Игрок'} ${isMe ? `<span class="badge ${isWinner ? 'bg-white text-primary' : 'bg-primary text-white'} ms-2" style="font-size:10px;">ВЫ</span>` : ''}</div>
                                </div>
                                <span class="badge ${isWinner ? 'bg-white text-primary' : 'bg-primary text-white'} rounded-pill px-3 py-2">${score} XP</span>
                            </div>`;
        }).join('')}
                </div>

                <div class="fixed-bottom p-3" style="background: linear-gradient(180deg, rgba(255,255,255,0.02), var(--bg-glass)); backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px); border-top: 1px solid var(--border-glass); z-index: 1000; padding-bottom: calc(env(safe-area-inset-bottom) + 10px) !important;">
                    ${isHost ? `
                        <button class="btn btn-primary w-100 py-3 rounded-4 fw-bold shadow-sm mb-2" style="min-height:56px;" onclick="window.sendGameAction('back_to_lobby')">
                            <i class="bi bi-arrow-repeat me-2"></i> СЫГРАТЬ ЕЩЁ
                        </button>
                    ` : `
                        <button class="btn btn-outline-secondary w-100 py-3 rounded-4 fw-bold border-0" style="background: rgba(255,255,255,0.55); color: var(--text-main); min-height:56px;" onclick="window.sendGameAction('back_to_lobby')">
                            <i class="bi bi-box-arrow-right me-1"></i> ВЫЙТИ В КОМНАТУ
                        </button>
                    `}
                </div>
                <div style="height: 160px;"></div>
            </div>
        `;
        gameArea.innerHTML = html;
    },

    /* --- MEME HELPERS --- */
    refreshHand: async function (event) {
        const btn = event?.currentTarget;
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
        }
        try {
            await window.sendGameAction('refresh_hand');
        } catch (e) {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="bi bi-arrow-clockwise me-1"></i> Обновить';
            }
        }
    },

    searchGifsDebounced: function (query) {
        clearTimeout(this._searchTimer);
        this._searchTimer = setTimeout(() => this.searchGifs(query), 500);
    },

    searchGifs: async function (query) {
        const container = document.getElementById('meme-results');
        if (!container) return;
        if (!query || query.length < 2) return;

        container.innerHTML = `<div class="text-center mt-3"><div class="spinner-border spinner-border-sm text-primary"></div></div>`;
        try {
            const res = await window.apiRequest({ action: 'game_action', type: 'search_gifs', query: query });
            if (res.status === 'ok' && res.results && res.results.length > 0) {
                container.innerHTML = `
                <div class="row g-2 p-1">
                    ${res.results.map(gif => {
                    const url = gif.media_formats?.tinygif?.url || gif.media_formats?.gif?.url || gif.url;
                    return `
                        <div class="col-6">
                            <div class="rounded-3 overflow-hidden shadow-sm" style="aspect-ratio: 1; cursor: pointer;" onclick="window.PartyBattleUI.submitAnswer('${url}')">
                                <img src="${url}" class="w-100 h-100 object-fit-cover" loading="lazy">
                            </div>
                        </div>`;
                }).join('')}
                </div>`;
            } else {
                container.innerHTML = `<div class="text-center text-muted small mt-3 py-2"><i class="bi bi-emoji-frown me-1"></i>Ничего не найдено</div>`;
            }
        } catch (e) {
            container.innerHTML = `<div class="text-center text-muted small mt-3">Ошибка поиска</div>`;
        }
    }
};

function pb_renderAvatar(player, size = 'md') {
    if (typeof window.renderAvatar === 'function' && player) {
        return window.renderAvatar(player, size);
    }
    // Fallback if renderAvatar is unavailable
    const seed = player ? (player.id || 'default') : 'default';
    console.warn('[PartyBattle] renderAvatar unavailable, using fallback for', seed);
    return `<img src="https://api.dicebear.com/9.x/adventurer/svg?seed=${seed}" style="width:40px;height:40px;border-radius:50%;">`;
}

function pb_getMyId() {
    return String(window.user_id || window.userId || window.globalUser?.id || (window.Telegram?.WebApp?.initDataUnsafe?.user?.id) || '0');
}

function pb_getPromptDisplay(prompt, legacySituation = null) {
    if (prompt) {
        return {
            kind: prompt.kind || 'text',
            body: prompt.body || '',
            mediaUrl: prompt.media_url || '',
            truth: prompt.truth || null,
        };
    }

    if (typeof legacySituation === 'object' && legacySituation) {
        return {
            kind: 'fact',
            body: legacySituation.text || legacySituation.question || '',
            mediaUrl: '',
            truth: legacySituation.truth || null,
        };
    }

    return {
        kind: typeof legacySituation === 'string' && /^https?:\/\//.test(legacySituation) ? 'image' : 'text',
        body: typeof legacySituation === 'string' && /^https?:\/\//.test(legacySituation) ? '' : String(legacySituation || ''),
        mediaUrl: typeof legacySituation === 'string' && /^https?:\/\//.test(legacySituation) ? legacySituation : '',
        truth: null,
    };
}

function pb_renderPromptImage(url, className = '', style = '') {
    const safeUrl = String(url || '');
    if (!safeUrl) {
        return `<div class="d-flex align-items-center justify-content-center rounded-4 text-muted small" style="min-height:200px; background: var(--bg-main);">Изображение недоступно</div>`;
    }

    return `<img src="${safeUrl}" class="${className}" style="${style}" loading="lazy" onerror="this.outerHTML='<div class=&quot;d-flex align-items-center justify-content-center rounded-4 text-muted small&quot; style=&quot;min-height:200px;background: var(--bg-main);${style || ''}&quot;>Изображение недоступно</div>';">`;
}

function pb_getModeMeta(mode) {
    const map = {
        meme: { label: 'МемоБатл' },
        joke: { label: 'Добивка' },
        whoami: { label: 'Кто из нас?' },
        advice: { label: 'Вредные советы' },
        acronym: { label: 'Дешифратор' },
        caption: { label: 'Подпиши картинку' },
        bluff: { label: 'Блеф' },
    };

    return map[mode] || { label: mode || '' };
}

function pb_getStageMeta(view) {
    const map = {
        lobby: { label: 'Сборка матча' },
        round_intro: { label: 'Открытие раунда' },
        round_submission: { label: 'Сбор ответов' },
        round_voting: { label: 'Выбор лучшего' },
        round_results: { label: 'Итог раунда' },
        results: { label: 'Финальный рейтинг' },
    };

    return map[view] || { label: 'Раунд' };
}

function pb_getSubmissionEntries(round, legacySubmissions = {}) {
    const entries = round?.submissions?.entries;
    if (entries && typeof entries === 'object') {
        return Object.keys(entries).map(id => ({
            id: String(entries[id].id || id),
            authorId: entries[id].author_id != null ? String(entries[id].author_id) : null,
            type: entries[id].kind || 'text',
            value: entries[id].value || '',
        }));
    }

    return Object.keys(legacySubmissions || {}).map(id => ({
        id: String(id),
        authorId: id === 'truth' ? null : String(id),
        type: id === 'truth' ? 'truth' : 'text',
        value: legacySubmissions[id],
    }));
}

function pb_getVotingOptions(round, legacySubmissions = {}) {
    const options = round?.voting?.options;
    if (options && typeof options === 'object' && Object.keys(options).length > 0) {
        return Object.keys(options).map(id => ({
            id: String(options[id].id || id),
            authorId: options[id].author_id != null ? String(options[id].author_id) : null,
            type: options[id].type || 'submission',
            value: options[id].value || '',
        }));
    }

    return Object.keys(legacySubmissions || {}).map(id => ({
        id: String(id),
        authorId: id === 'truth' ? null : String(id),
        type: id === 'truth' ? 'truth' : 'submission',
        value: legacySubmissions[id],
    }));
}

function pb_getSituationText(situation) {
    if (!situation) return '';
    if (typeof situation === 'object') return situation.text || situation.question || JSON.stringify(situation);
    return String(situation);
}
