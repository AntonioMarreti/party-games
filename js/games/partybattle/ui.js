// js/games/partybattle/ui.js

window.PartyBattleUI = {

    renderLobby: function (gameState) {
        const isHost = window.APP_STATE.room.is_host;
        let html = `
        <div class="d-flex flex-column h-100 pb-3" style="padding-top: calc(env(safe-area-inset-top) + 10px);">
            <div class="px-3">
                <div class="game-page-title text-center mb-1 fw-bold fs-2" style="color:var(--text-main);">Party Battle</div>
                <div class="game-page-subtitle text-center mb-3 text-muted small text-uppercase">Настройка игры</div>
            </div>
        `;

        // HOST CONTROLS
        if (isHost) {
            html += `
            <div class="px-3 flex-grow-1">
                <div class="mb-3">
                    <label class="small fw-bold mb-2 d-block text-muted text-uppercase">Выбранные режимы:</label>
                    <div id="pb-selected-modes-preview" class="d-flex flex-wrap gap-2 mb-3">
                        <span class="badge bg-primary rounded-pill px-3 py-2">МемоБатл</span>
                    </div>
                    <button class="btn btn-outline-primary w-100 rounded-3" style="background: var(--bg-card); border: 1px solid var(--border-glass);"
                            onclick="document.getElementById('pbModesModal').style.display='flex'">
                        <i class="bi bi-list-check me-2"></i> Изменить режимы
                    </button>
                </div>

                <div class="mb-3">
                    <label class="small fw-bold mb-2 d-block text-muted text-uppercase">КОЛИЧЕСТВО РАУНДОВ:</label>
                    <div class="d-flex gap-2 mb-3">
                        <button class="btn btn-outline-secondary flex-fill pb-round-btn" data-rounds="3" onclick="PartyBattleUI.selectRounds(3)">3</button>
                        <button class="btn btn-outline-secondary flex-fill pb-round-btn active" data-rounds="5" style="border-color: var(--primary-color); background: rgba(var(--primary-rgb), 0.1);" onclick="PartyBattleUI.selectRounds(5)">5</button>
                        <button class="btn btn-outline-secondary flex-fill pb-round-btn" data-rounds="7" onclick="PartyBattleUI.selectRounds(7)">7</button>
                        <button class="btn btn-outline-secondary flex-fill pb-round-btn" data-rounds="10" onclick="PartyBattleUI.selectRounds(10)">10</button>
                    </div>
                    <input type="number" id="pb-rounds-custom" class="form-control rounded-3 py-2 text-center" 
                           style="background: var(--bg-main); border: 1px solid var(--border-glass); color: var(--text-main);" 
                           placeholder="Или введите количество..." min="1" max="20" oninput="PartyBattleUI.customRoundsInput()">
                    <input type="hidden" id="pb-rounds" value="5">
                </div>
                
                <div class="mb-3">
                    <label class="form-label fw-bold small text-muted text-uppercase mb-2">Настройки колоды:</label>
                    <div id="pb-selected-theme-preview" class="d-flex mb-3">
                        <span class="badge bg-primary rounded-pill px-3 py-2">
                            Базовая колода
                        </span>
                    </div>

                    <div class="d-flex flex-column gap-3 mb-4">
                        <button class="btn btn-outline-primary w-100 fw-bold rounded-4" style="background: var(--bg-card); border: 1px solid var(--border-glass);"
                                onclick="document.getElementById('pbThemeModal').style.display='flex'">
                            <i class="bi bi-collection me-2"></i> Изменить колоду
                        </button>
                        <input type="hidden" id="pb-theme" value="base">

                        <div class="form-check form-switch p-3 rounded-4 d-flex align-items-center m-0" style="background: var(--bg-main); border: 1px solid var(--border-glass);">
                            <input class="form-check-input m-0 me-3" type="checkbox" id="pb-ai-mode" style="transform: scale(1.3);">
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
                <div class="spinner-border text-primary opacity-50 mb-4" style="width: 3rem; height: 3rem;"></div>
                <h4 class="fw-bold mb-2" style="color:var(--text-main);">Ожидание</h4>
                <p class="text-muted text-center max-w-300">Хост сейчас настраивает режимы и количество раундов...</p>
            </div>
            `;
        }

        html += `
            <div class="fixed-bottom p-3" style="background: var(--bg-glass); backdrop-filter: blur(15px); -webkit-backdrop-filter: blur(15px); border-top: 1px solid var(--border-glass); z-index: 1000; padding-bottom: calc(env(safe-area-inset-bottom) + 10px) !important;">
                ${isHost ? `<button class="btn btn-primary w-100 mb-2 py-3 rounded-4 fw-bold shadow-sm" style="font-size:1.1rem;" onclick="PartyBattleUI.startGame()"><i class="bi bi-play-fill me-1"></i> Начать игру</button>` : ''}
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
                        <input class="form-check-input pb-mode-cb m-0" type="checkbox" value="meme" checked style="transform: scale(1.1);">
                        <div class="ms-3">
                            <div class="fw-bold lh-sm" style="color:var(--text-main); font-size: 1rem;">МемоБатл (Гифки)</div>
                            <div class="text-muted lh-sm mt-1" style="font-size: 0.75rem;">Подбирай смешные реакции к ситуациям</div>
                        </div>
                    </label>
                    <label class="form-check d-flex align-items-center py-2 px-3 rounded-3 m-0" style="background: var(--bg-main); border: 1px solid var(--border-glass); cursor: pointer;">
                        <input class="form-check-input pb-mode-cb m-0" type="checkbox" value="joke" checked style="transform: scale(1.1);">
                        <div class="ms-3">
                            <div class="fw-bold lh-sm" style="color:var(--text-main); font-size: 1rem;">Добивка (Шутки)</div>
                            <div class="text-muted lh-sm mt-1" style="font-size: 0.75rem;">Придумай самую смешную концовку</div>
                        </div>
                    </label>
                    <label class="form-check d-flex align-items-center py-2 px-3 rounded-3 m-0" style="background: var(--bg-main); border: 1px solid var(--border-glass); cursor: pointer;">
                        <input class="form-check-input pb-mode-cb m-0" type="checkbox" value="whoami" style="transform: scale(1.1);">
                        <div class="ms-3">
                            <div class="fw-bold lh-sm" style="color:var(--text-main); font-size: 1rem;">Кто из нас?</div>
                            <div class="text-muted lh-sm mt-1" style="font-size: 0.75rem;">Анонимное голосование друг за друга</div>
                        </div>
                    </label>
                    <label class="form-check d-flex align-items-center py-2 px-3 rounded-3 m-0" style="background: var(--bg-main); border: 1px solid var(--border-glass); cursor: pointer;">
                        <input class="form-check-input pb-mode-cb m-0" type="checkbox" value="advice" checked style="transform: scale(1.1);">
                        <div class="ms-3">
                            <div class="fw-bold lh-sm" style="color:var(--text-main); font-size: 1rem;">Вредные советы</div>
                            <div class="text-muted lh-sm mt-1" style="font-size: 0.75rem;">Выходим из неловких ситуаций</div>
                        </div>
                    </label>
                    <label class="form-check d-flex align-items-center py-2 px-3 rounded-3 m-0" style="background: var(--bg-main); border: 1px solid var(--border-glass); cursor: pointer;">
                        <input class="form-check-input pb-mode-cb m-0" type="checkbox" value="acronym" checked style="transform: scale(1.1);">
                        <div class="ms-3">
                            <div class="fw-bold lh-sm" style="color:var(--text-main); font-size: 1rem;">Дешифратор</div>
                            <div class="text-muted lh-sm mt-1" style="font-size: 0.75rem;">Смешно расшифровываем аббревиатуры</div>
                        </div>
                    </label>
                    <label class="form-check d-flex align-items-center py-2 px-3 rounded-3 m-0" style="background: var(--bg-main); border: 1px solid var(--border-glass); cursor: pointer;">
                        <input class="form-check-input pb-mode-cb m-0" type="checkbox" value="caption" checked style="transform: scale(1.1);">
                        <div class="ms-3">
                            <div class="fw-bold lh-sm" style="color:var(--text-main); font-size: 1rem;">Подпиши картинку</div>
                            <div class="text-muted lh-sm mt-1" style="font-size: 0.75rem;">Придумываем подпись к рандомному мему</div>
                        </div>
                    </label>
                    <label class="form-check d-flex align-items-center py-2 px-3 rounded-3 m-0" style="background: var(--bg-main); border: 1px solid var(--border-glass); cursor: pointer;">
                        <input class="form-check-input pb-mode-cb m-0" type="checkbox" value="bluff" checked style="transform: scale(1.1);">
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
                            <input class="form-check-input pb-theme-radio m-0" type="radio" name="pb-theme-radio" value="base" checked style="transform: scale(1.3);">
                                <div class="ms-3">
                                    <div class="fw-bold" style="color:var(--text-main); font-size: 1.1rem;">Базовая колода</div>
                                    <div class="small text-muted">Стандартный набор ситуаций (12+)</div>
                                </div>
                        </label>
                        <label class="form-check d-flex align-items-center p-3 rounded-4 m-0" style="background: var(--bg-main); border: 2px solid var(--border-glass); cursor: pointer;" onclick="PartyBattleUI.selectTheme('adult')">
                            <input class="form-check-input pb-theme-radio m-0" type="radio" name="pb-theme-radio" value="adult" style="transform: scale(1.3);">
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
            'whoami': 'Кто из нас?'
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
        return `
            <div class="header-container py-3 px-3 text-center mb-2" style="background: transparent;">
                <h5 class="fw-bold m-0" style="color:var(--text-main); line-height: 1;">Party Battle</h5>
                ${gameState.phase !== 'lobby' && gameState.phase !== 'results' ?
                `<small class="text-muted" style="font-size: 11px; font-weight: 600;">Раунд ${gameState.current_round} из ${gameState.total_rounds}</small>` : ''}
            </div>
            `;
    },

    renderBottomActions: function () {
        return `
            <div class="fixed-bottom p-3" style="background: var(--bg-glass); backdrop-filter: blur(15px); -webkit-backdrop-filter: blur(15px); border-top: 1px solid var(--border-glass); z-index: 1000; padding-bottom: calc(env(safe-area-inset-bottom) + 10px) !important;">
                <button class="btn btn-outline-secondary w-100 fw-bold border-0" style="background: rgba(255,255,255,0.05); color: var(--text-main); font-size: 0.9rem;" onclick="window.sendGameAction('back_to_lobby')">
                    <i class="bi bi-box-arrow-right me-1"></i> ПОКИНУТЬ ИГРУ
                </button>
            </div>
            <div style="height: 100px;"></div>
        `;
    },

    renderSubmissionFooter: function () {
        return `
            <div class="p-3 mt-auto" style="z-index: 10;">
                <button class="btn btn-outline-secondary w-100 fw-bold border-0" style="background: rgba(255,255,255,0.05); color: var(--text-main); font-size: 0.9rem; opacity: 0.5;" onclick="window.sendGameAction('back_to_lobby')">
                    <i class="bi bi-box-arrow-right me-1"></i> ПОКИНУТЬ ИГРУ
                </button>
            </div>
        `;
    },

    renderSituation: function (gameState) {
        if (!gameState.current_situation) return;

        const isHost = window.APP_STATE.room.is_host;
        let html = `
            <div class="d-flex flex-column h-100" style="padding-top: calc(env(safe-area-inset-top) + 10px);">
                ${this.renderHeader(gameState)}
                <div class="d-flex flex-column align-items-center justify-content-center flex-grow-1 pb-5 pt-3 animate__animated animate__fadeIn px-3" style="margin-top: -10px;">
        `;

        let sitText = gameState.current_situation;
        if (typeof sitText === 'object') sitText = sitText.text || JSON.stringify(sitText);

        html += `
            <div class="badge bg-primary mb-3 border shadow-sm px-3 py-2 rounded-pill" style="font-size: 14px;">Ситуация:</div>
            <div class="p-4 mb-4 shadow-lg rounded-4 d-flex align-items-center justify-content-center text-center position-relative overflow-hidden" 
                 style="min-height: 200px; width: 100%; max-width: 600px; background: var(--bg-card); border: 2px solid var(--border-main) !important; padding: ${gameState.mode === 'caption' ? '0 !important' : 'var(--bs-p-4)'}">
                ${gameState.mode === 'caption' ? `
                    <img src="${gameState.current_situation}" class="w-100 h-100 object-fit-cover position-absolute top-0 start-0">
                ` : `
                    <i class="bi bi-masks-theater position-absolute" style="top: -10px; left: -10px; font-size: 80px; opacity: 0.05; transform: rotate(-15deg);"></i>
                    <i class="bi bi-emoji-laughing position-absolute" style="bottom: -10px; right: -10px; font-size: 80px; opacity: 0.05; transform: rotate(15deg);"></i>
                    <h3 class="fw-bold m-0 position-relative z-1" style="color:var(--text-main); line-height: 1.4;">${sitText}</h3>
                `}
            </div>
        `;

        if (isHost) {
            let btnText = 'Раздать варианты';
            if (gameState.mode === 'whoami') btnText = 'Перейти к голосованию';
            else if (gameState.mode === 'caption') btnText = 'Показать изображение';
            else if (['joke', 'advice', 'acronym', 'bluff'].includes(gameState.mode)) btnText = 'Начать сбор ответов';

            html += `
            <button class="btn btn-primary w-100 py-3 rounded-pill fw-bold fs-5 shadow-sm mb-3 animate__animated animate__pulse animate__infinite"
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
            barContainer.style.maxWidth = '250px';
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
        const situation = pb_getSituationText(gameState.current_situation) || '...';
        const myId = String(pb_getMyId());
        const myHand = (gameState.hands && gameState.hands[myId]) || [];

        const totalPlayers = gameState.scores ? Object.keys(gameState.scores).length : 0;
        const submittedCount = gameState.submissions ? Object.keys(gameState.submissions).length : 0;
        const hasSubmitted = gameState.submissions && gameState.submissions[myId];

        let html = `
            <div class="d-flex flex-column min-vh-100 pb-4" style="padding-top: calc(env(safe-area-inset-top) + 10px);">
                ${this.renderHeader(gameState)}
                
                <div class="px-3 py-2 animate__animated animate__fadeInDown">
                    <div class="p-3 shadow-lg rounded-4" style="background: var(--bg-card); border: 2px solid var(--border-main);">
                        <div class="small text-muted fw-bold mb-1 opacity-50 text-uppercase" style="font-size: 10px; letter-spacing: 0.5px;">Ситуация / Вопрос:</div>
                        ${gameState.mode === 'caption'
                ? `<img src="${situation}" class="w-100 rounded-3 object-fit-cover shadow-sm" style="max-height: 250px;">`
                : `<div class="fw-bold text-main" style="font-size: 1.15rem; line-height: 1.3;">${situation}</div>`
            }
                    </div>
                </div>
        `;

        if (hasSubmitted) {
            html += `
                <div class="flex-grow-1 d-flex flex-column align-items-center justify-content-center text-center p-4">
                    <div class="p-4 rounded-4 shadow-lg animate__animated animate__bounceIn mb-4" style="background: var(--bg-card); border: 1px solid var(--border-glass);">
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
                    ${(gameState.mode === 'joke' || gameState.mode === 'advice' || gameState.mode === 'acronym' || gameState.mode === 'caption' || gameState.mode === 'bluff')
                    ? window.PartyBattleModes.renderJokeSubmission(gameState, hasSubmitted)
                    : window.PartyBattleModes.renderSubmission(gameState, myHand)}
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
                    window.showAlert('Ошибка', 'Напиши шутку!', 'error');
                    return;
                }
            }
        }

        if (!answer) return;
        window.sendGameAction('submit_answer', { answer: answer });
    },

    /* --- VOTING SCREEN --- */
    renderVotingScreen: function (gameState) {
        if (!window.PartyBattleModes) return;

        const gameArea = document.getElementById('game-area');
        const myId = String(pb_getMyId());
        const hasVoted = gameState.votes && gameState.votes[myId];
        const situation = pb_getSituationText(gameState.current_situation) || '';

        // DIAGNOSTIC LOG
        console.log('[PartyBattle] renderVotingScreen', {
            myId,
            hasVoted,
            votes: gameState.votes,
            mode: gameState.mode,
            submissions: Object.keys(gameState.submissions || {}),
            renderAvatarExists: typeof window.renderAvatar,
            players: (window.APP_STATE?.room?.players || []).map(p => ({ id: p.id, photo_url: !!p.photo_url, custom_avatar: !!p.custom_avatar }))
        });
        const submissions = gameState.submissions || {};
        const entries = Object.keys(submissions).map(uid => ({
            uid: uid,
            url: submissions[uid]
        }));

        const totalPlayers = gameState.scores ? Object.keys(gameState.scores).length : 0;
        const votedCount = gameState.votes ? Object.keys(gameState.votes).length : 0;

        let html = `
            <div class="d-flex flex-column h-100" style="padding-top: calc(env(safe-area-inset-top) + 10px);">
                ${this.renderHeader(gameState)}
                
                <div class="flex-grow-1 px-3 animate__animated animate__fadeIn">
                    <div class="text-center mb-3">
                        <div class="small text-muted fw-bold opacity-50 text-uppercase mb-1">Время голосовать!</div>
                        <div class="fw-bold fs-5" style="color:var(--text-main);">${situation}</div>
                    </div>
                    
                    ${hasVoted ? `
                        <div class="p-3 mb-4 mx-auto rounded-pill shadow-sm animate__animated animate__pulse text-center" 
                             style="background: var(--status-success); color: white; border: none; max-width: 200px;">
                            <div class="fw-bold mb-1"><i class="bi bi-check-circle-fill me-1"></i> Голос принят!</div>
                            <div class="small opacity-75">Ждем остальных...</div>
                        </div>
                    ` : ''}
                    
                    ${(gameState.mode === 'joke' || gameState.mode === 'advice' || gameState.mode === 'acronym' || gameState.mode === 'caption')
                ? window.PartyBattleModes.renderJokeVoting(entries, hasVoted, myId)
                : (gameState.mode === 'bluff')
                    ? window.PartyBattleModes.renderBluffVoting(entries, hasVoted, myId)
                    : window.PartyBattleModes.renderVoting(gameState, entries, hasVoted, myId)}
                </div>

                <div class="fixed-bottom p-3" style="background: var(--bg-glass); backdrop-filter: blur(15px); -webkit-backdrop-filter: blur(15px); border-top: 1px solid var(--border-glass); z-index: 1000; padding-bottom: calc(env(safe-area-inset-bottom) + 10px) !important;">
                    <div class="d-flex align-items-center justify-content-center gap-2 mb-2">
                        <div class="spinner-grow spinner-grow-sm text-primary" role="status"></div>
                        <span class="small fw-bold text-muted">Голоса: <span style="color:var(--text-main);">${votedCount} / ${totalPlayers}</span></span>
                    </div>
                    <button class="btn btn-outline-secondary w-100 fw-bold border-0" style="background: rgba(255,255,255,0.05); color: var(--text-main); font-size: 0.9rem;" onclick="window.sendGameAction('back_to_lobby')">
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
        const lastData = gameState.last_round_data || { votes: {}, scores: {} };
        const mode = gameState.mode;

        const submissions = gameState.submissions || {};
        const voteCounts = {};
        Object.values(lastData.votes || {}).forEach(target => {
            voteCounts[target] = (voteCounts[target] || 0) + 1;
        });

        // In WhoAmI, there are no submissions, so we sort the vote targets (player IDs)
        const candidates = mode === 'whoami'
            ? Object.keys(voteCounts)
            : Object.keys(submissions);

        const sorted = candidates.sort((a, b) => (voteCounts[b] || 0) - (voteCounts[a] || 0));
        const winnerId = sorted[0];
        const winnerContent = mode === 'whoami' ? '' : submissions[winnerId];
        const winnerVotes = voteCounts[winnerId] || 0;

        const winnerPlayer = (window.APP_STATE?.room?.players || []).find(p => String(p.id) === String(winnerId));

        let html = `
            <div class="d-flex flex-column h-100" style="padding-top: calc(env(safe-area-inset-top) + 10px);">
                ${this.renderHeader(gameState)}
                <div class="flex-grow-1 d-flex flex-column align-items-center p-3 text-center position-relative animate__animated animate__fadeIn">
                    <h2 class="fw-bold mb-4" style="color:var(--text-main);">Победитель раунда!</h2>
                    <div class="p-4 rounded-4 shadow-lg animate__animated animate__tada"
                        style="background: var(--bg-card); border: 2px solid var(--primary-color); max-width: 400px; width: 100%;">
                        <div class="d-flex align-items-center justify-content-center mb-3">
                            <div style="width:40px; height:40px; margin-right:8px;">${pb_renderAvatar(winnerPlayer, 'md')}</div>
                            <span class="fw-bold" style="color:var(--text-main);">${winnerPlayer?.display_name || winnerPlayer?.first_name || 'Игрок'}</span>
                        </div>
                        ${mode === 'meme' ? `
                            <div class="rounded-4 overflow-hidden mb-3" style="aspect-ratio: 1;">
                                <img src="${winnerContent}" class="w-100 h-100 object-fit-cover shadow-sm">
                            </div>
                        ` : (mode === 'whoami' ? '' : `
                            <h3 class="fw-bold mb-4" style="color:var(--text-main); line-height: 1.4;">"${winnerContent}"</h3>
                        `)}
                        <div class="text-center">
                            <h2 class="fw-bold text-primary mb-1">+${winnerVotes * 100}</h2>
                            <div class="small text-muted fw-bold">Голосов: ${winnerVotes}</div>
                        </div>
                    </div>
                </div>
                
                <div class="fixed-bottom p-3" style="background: var(--bg-glass); backdrop-filter: blur(15px); -webkit-backdrop-filter: blur(15px); border-top: 1px solid var(--border-glass); z-index: 1000; padding-bottom: calc(env(safe-area-inset-bottom) + 10px) !important;">
                    ${isHost ? `
                        <button class="btn btn-primary py-3 w-100 rounded-pill fw-bold shadow-lg mb-2" onclick="window.sendGameAction('next_round')">
                            СЛЕДУЮЩИЙ РАУНД <i class="bi bi-chevron-right ms-2"></i>
                        </button>
                    ` : `
                        <div class="p-3 w-100 text-center rounded-pill opacity-75 mb-2" style="background: rgba(255,255,255,0.05); border: 1px solid var(--border-glass);">
                            <span class="small fw-bold text-muted">Хост скоро запустит новый раунд...</span>
                        </div>
                    `}
                    <button class="btn btn-outline-secondary w-100 fw-bold border-0" style="background: rgba(255,255,255,0.05); color: var(--text-main); font-size: 0.9rem;" onclick="window.sendGameAction('back_to_lobby')">
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
                <div class="header-container text-center mb-4 mt-2">
                    <i class="bi bi-trophy-fill display-4 mb-0 animate__animated animate__bounceIn" style="color: var(--primary-color);"></i>
                    <h2 class="fw-bold" style="color:var(--text-main);">ИТОГИ ИГРЫ</h2>
                </div>
                
                <div class="flex-grow-1 overflow-auto px-3 mb-4">
                    ${sortedIds.map((uid, index) => {
            const score = scores[uid];
            const player = (window.APP_STATE?.room?.players || []).find(p => String(p.id) === String(uid));
            const isWinner = index === 0;
            const isMe = String(uid) === myId;
            return `
                            <div class="d-flex justify-content-between align-items-center p-3 mb-2 rounded-4 shadow-sm animate__animated animate__fadeInUp" 
                                    style="background: ${isWinner ? 'var(--primary-gradient)' : 'var(--bg-card)'}; border: 2px solid ${isMe ? 'var(--primary-color)' : 'var(--border-glass)'}; color: ${isWinner ? 'white' : 'var(--text-main)'}; transition-delay: ${index * 0.1}s;">
                                <div class="d-flex align-items-center gap-3">
                                    <div class="fw-bold" style="color:var(--text-main); width: 24px;">#${index + 1}</div>
                                    <div style="width:36px; height:36px; margin-right:6px;">${pb_renderAvatar(player, 'sm')}</div>
                                    <div class="fw-bold text-truncate" style="color:var(--text-main); max-width: 150px;">${player ? (player.display_name || player.first_name) : 'Игрок'} ${isMe ? '<span class="badge bg-primary ms-2" style="font-size:10px;">ВЫ</span>' : ''}</div>
                                </div>
                                <span class="badge ${isWinner ? 'bg-white text-primary' : 'bg-primary text-white'} rounded-pill px-3 py-2">${score} XP</span>
                            </div>`;
        }).join('')}
                </div>

                <div class="fixed-bottom p-3" style="background: var(--bg-glass); backdrop-filter: blur(15px); -webkit-backdrop-filter: blur(15px); border-top: 1px solid var(--border-glass); z-index: 1000; padding-bottom: calc(env(safe-area-inset-bottom) + 10px) !important;">
                    ${isHost ? `
                        <button class="btn btn-primary w-100 py-3 rounded-4 fw-bold shadow-sm mb-2" onclick="window.sendGameAction('back_to_lobby')">
                            <i class="bi bi-arrow-repeat me-2"></i> СЫГРАТЬ ЕЩЁ
                        </button>
                    ` : `
                        <button class="btn btn-outline-secondary w-100 py-3 rounded-4 fw-bold" style="background: rgba(255,255,255,0.05); color: var(--text-main);" onclick="window.sendGameAction('back_to_lobby')">
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

function pb_getSituationText(situation) {
    if (!situation) return '';
    if (typeof situation === 'object') return situation.text || situation.question || JSON.stringify(situation);
    return String(situation);
}
