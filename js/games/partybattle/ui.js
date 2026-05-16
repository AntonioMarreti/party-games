// js/games/partybattle/ui.js

window.PartyBattleUI = {
    _viewportSyncBound: false,
    _lastRenderedView: null,

    ensureViewportSync: function () {
        if (this._viewportSyncBound) {
            this.syncViewportMetrics();
            return;
        }

        const sync = this.syncViewportMetrics.bind(this);
        this._viewportSyncBound = true;
        sync();

        window.addEventListener('resize', sync, { passive: true });
        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', sync, { passive: true });
            window.visualViewport.addEventListener('scroll', sync, { passive: true });
        }
    },

    syncViewportMetrics: function () {
        const vv = window.visualViewport;
        const viewportHeight = vv ? Math.round(vv.height) : window.innerHeight;
        const keyboardOffset = vv
            ? Math.max(0, Math.round(window.innerHeight - vv.height - (vv.offsetTop || 0)))
            : 0;

        document.documentElement.style.setProperty('--pb-viewport-height', `${Math.max(320, viewportHeight)}px`);
        document.documentElement.style.setProperty('--pb-keyboard-offset', `${keyboardOffset}px`);
        document.body.classList.toggle('pb-keyboard-open', keyboardOffset > 120);
    },

    afterRender: function (view, options = {}) {
        this.ensureViewportSync();
        const shouldResetScroll = options.resetScroll ?? (this._lastRenderedView !== view);
        this._lastRenderedView = view;

        if (shouldResetScroll) {
            requestAnimationFrame(() => {
                const gameArea = document.getElementById('game-area');
                if (typeof window.resetAppScroll === 'function') {
                    window.resetAppScroll(gameArea);
                } else {
                    window.scrollTo(0, 0);
                    if (gameArea) gameArea.scrollTop = 0;
                }
            });
        }
    },

    keepComposerVisible: function (target) {
        const node = typeof target === 'string' ? document.querySelector(target) : target;
        if (!node) return;

        const scrollIntoView = () => {
            setTimeout(() => {
                node.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }, 140);
        };

        scrollIntoView();
        if (window.visualViewport) {
            setTimeout(scrollIntoView, 260);
            setTimeout(scrollIntoView, 420);
        }
    },

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
                    <div class="game-page-title fw-black mb-1" style="font-size:2.1rem; letter-spacing:-0.045em; line-height:0.98; background: var(--primary-gradient); -webkit-background-clip:text; -webkit-text-fill-color:transparent;">Party Battle</div>
                    <div class="game-page-subtitle text-uppercase fw-bold small" style="color:var(--text-muted); letter-spacing:0.18em; font-size:0.72rem;">Mix, Vote, Laugh</div>
                </div>
                <div class="rounded-4 p-3 mb-3 shadow-sm" style="background: linear-gradient(135deg, rgba(var(--primary-rgb), 0.12), rgba(255,255,255,0.04)); border: 1px solid rgba(90, 103, 255, 0.08); box-shadow: 0 10px 24px rgba(31, 38, 135, 0.04);">
                    <div class="small text-uppercase fw-bold mb-1" style="letter-spacing:0.18em; color:var(--text-muted);">Лобби</div>
                    <div class="fw-semibold" style="color:var(--text-main); line-height:1.35;">Собери свою смесь режимов и запускай быстрые раунды без скучных пауз.</div>
                </div>
            </div>
        `;

        // HOST CONTROLS
        if (isHost) {
            html += `
            <div class="px-3 flex-grow-1">
                <div class="mb-3 rounded-4 p-3 shadow-sm" style="background: rgba(255,255,255,0.96); border: 1px solid rgba(90, 103, 255, 0.08); box-shadow: 0 10px 24px rgba(31, 38, 135, 0.04);">
                    <label class="small fw-bold mb-2 d-block text-muted text-uppercase" style="letter-spacing:0.14em; font-size:0.72rem;">Выбранные режимы</label>
                    <div id="pb-selected-modes-preview" class="d-flex flex-wrap gap-2 mb-3">
                        ${this.renderSelectedModeBadges(selectedModes)}
                    </div>
                    <button class="btn btn-outline-primary w-100 rounded-4 fw-bold" style="background: rgba(var(--primary-rgb), 0.06); border: 1px solid rgba(var(--primary-rgb), 0.18); min-height: 42px; font-size: 0.9rem;"
                            onclick="document.getElementById('pbModesModal').style.display='flex'">
                        <i class="bi bi-list-check me-2"></i> Изменить режимы
                    </button>
                </div>

                <div class="mb-3 rounded-4 p-3 shadow-sm" style="background: linear-gradient(135deg, rgba(var(--primary-rgb), 0.08), rgba(255,255,255,0.92)); border: 1px solid rgba(var(--primary-rgb), 0.12); box-shadow: 0 10px 24px rgba(31, 38, 135, 0.04);">
                    <div class="small fw-bold mb-1 text-muted text-uppercase" style="letter-spacing:0.16em; font-size:0.72rem;">Быстрый прогон</div>
                    <div class="small text-muted mb-3" style="line-height:1.35;">Короткий маршрут для ручного smoke-теста: советы, мемы, подписи и блеф без лишней настройки.</div>
                    <button class="btn btn-outline-primary w-100 rounded-4 fw-bold" style="background: rgba(var(--primary-rgb), 0.08); border: 1px solid rgba(var(--primary-rgb), 0.18); min-height: 42px; font-size: 0.9rem;" onclick="PartyBattleUI.startQuickSmoke()">
                        <i class="bi bi-lightning-charge me-2"></i> Быстрый прогон
                    </button>
                </div>

                <div class="mb-3 rounded-4 p-3 shadow-sm" style="background: rgba(255,255,255,0.96); border: 1px solid rgba(90, 103, 255, 0.08); box-shadow: 0 10px 24px rgba(31, 38, 135, 0.04);">
                    <label class="small fw-bold mb-2 d-block text-muted text-uppercase" style="letter-spacing:0.14em; font-size:0.72rem;">Количество раундов</label>
                    <div class="d-flex gap-2 mb-3">
                        <button class="btn btn-outline-secondary flex-fill pb-round-btn rounded-4 ${selectedRounds === 3 ? 'active' : ''}" data-rounds="3" style="min-height:40px; font-weight:700; ${selectedRounds === 3 ? 'border-color: var(--primary-color); background: rgba(var(--primary-rgb), 0.1);' : ''}" onclick="PartyBattleUI.selectRounds(3)">3</button>
                        <button class="btn btn-outline-secondary flex-fill pb-round-btn rounded-4 ${selectedRounds === 5 ? 'active' : ''}" data-rounds="5" style="min-height:40px; font-weight:700; ${selectedRounds === 5 ? 'border-color: var(--primary-color); background: rgba(var(--primary-rgb), 0.1);' : ''}" onclick="PartyBattleUI.selectRounds(5)">5</button>
                        <button class="btn btn-outline-secondary flex-fill pb-round-btn rounded-4 ${selectedRounds === 7 ? 'active' : ''}" data-rounds="7" style="min-height:40px; font-weight:700; ${selectedRounds === 7 ? 'border-color: var(--primary-color); background: rgba(var(--primary-rgb), 0.1);' : ''}" onclick="PartyBattleUI.selectRounds(7)">7</button>
                        <button class="btn btn-outline-secondary flex-fill pb-round-btn rounded-4 ${selectedRounds === 10 ? 'active' : ''}" data-rounds="10" style="min-height:40px; font-weight:700; ${selectedRounds === 10 ? 'border-color: var(--primary-color); background: rgba(var(--primary-rgb), 0.1);' : ''}" onclick="PartyBattleUI.selectRounds(10)">10</button>
                    </div>
                    <input type="number" id="pb-rounds-custom" class="form-control rounded-3 py-2 text-center" 
                           style="background: var(--bg-main); border: 1px solid var(--border-glass); color: var(--text-main);" 
                           placeholder="Или введите количество..." min="1" max="20" value="${[3, 5, 7, 10].includes(selectedRounds) ? '' : selectedRounds}" oninput="PartyBattleUI.customRoundsInput()">
                    <input type="hidden" id="pb-rounds" value="${selectedRounds}">
                </div>
                
                <div class="mb-3 rounded-4 p-3 shadow-sm" style="background: rgba(255,255,255,0.96); border: 1px solid rgba(90, 103, 255, 0.08); box-shadow: 0 10px 24px rgba(31, 38, 135, 0.04);">
                    <label class="form-label fw-bold small text-muted text-uppercase mb-2" style="letter-spacing:0.14em; font-size:0.72rem;">Настройки колоды</label>
                    <div id="pb-selected-theme-preview" class="d-flex mb-3">
                        <span class="badge rounded-pill px-3 py-2" style="background: rgba(90, 103, 255, 0.12); color:#4e5bf4; border: 1px solid rgba(90, 103, 255, 0.12);">
                            ${selectedTheme === 'adult' ? '18+ Полный треш' : 'Базовая колода'}
                        </span>
                    </div>
                    ${this.renderThemeScopeSummary(selectedTheme, selectedModes)}

                    <div class="d-flex flex-column gap-3 mb-4">
                        <button class="btn btn-outline-primary w-100 fw-bold rounded-4" style="background: rgba(var(--primary-rgb), 0.06); border: 1px solid rgba(var(--primary-rgb), 0.18); min-height: 42px; font-size: 0.9rem;"
                                onclick="document.getElementById('pbThemeModal').style.display='flex'">
                            <i class="bi bi-collection me-2"></i> Изменить колоду
                        </button>
                        <input type="hidden" id="pb-theme" value="${selectedTheme}">

                        <div class="form-check form-switch p-3 rounded-4 d-flex align-items-center m-0" style="background: #f8f9fc; border: 1px solid rgba(90, 103, 255, 0.08);">
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
            <div class="px-3 pb-3 mt-auto" style="padding-bottom: calc(env(safe-area-inset-bottom) + 12px) !important;">
                <div class="rounded-4 p-2 shadow-sm" style="background: #ffffff; border: 1px solid rgba(90, 103, 255, 0.08); box-shadow: 0 6px 16px rgba(31, 38, 135, 0.03);">
                    ${isHost ? `<button class="btn btn-primary w-100 mb-2 py-2 rounded-4 fw-bold shadow-sm" style="font-size:0.94rem; min-height:42px;" onclick="PartyBattleUI.startGame()"><i class="bi bi-play-fill me-1"></i> Начать игру</button>` : ''}
                    <button class="btn btn-outline-secondary w-100 fw-bold border-0 rounded-4" style="background: #f3f4f8; color: var(--text-main); font-size: 0.84rem; min-height: 42px;" onclick="window.sendGameAction('back_to_lobby')">
                        <i class="bi bi-box-arrow-right me-1"></i> ПОКИНУТЬ ИГРУ
                    </button>
                </div>
            </div>
        </div>
        `;

        if (isHost) {
            // Custom Modal Overlay for Modes
            html += `
            <div id="pbModesModal" style="display:none; position:fixed; inset:0; z-index:9999; background:rgba(17,20,36,0.46); backdrop-filter:blur(12px); align-items:flex-end; justify-content:center; opacity:0; transition: opacity 0.3s; padding: 16px;"
                onclick="if(event.target===this) PartyBattleUI.closeModesModal()">
            <div class="p-3 rounded-4 w-100 shadow-lg animate__animated animate__fadeInUp" style="background: rgba(255,255,255,0.98); max-width: 500px; border: 1px solid rgba(90, 103, 255, 0.08); box-shadow: 0 18px 48px rgba(17,20,36,0.16) !important;">
                <div class="d-flex justify-content-between align-items-center mb-4">
                    <div>
                        <div class="small text-uppercase fw-bold text-muted mb-1" style="letter-spacing:0.16em; font-size:0.7rem;">Настройка</div>
                        <h4 class="fw-bold m-0" style="color:var(--text-main); font-size:1.16rem;">Режимы игры</h4>
                    </div>
                    <button class="btn-close" style="filter: var(--invert-filter);" onclick="PartyBattleUI.closeModesModal()"></button>
                </div>

                <div class="d-flex flex-column gap-2 mb-4">
                    <label class="form-check d-flex align-items-center py-2 px-3 rounded-4 m-0" style="background: #f8f9fc; border: 1px solid rgba(90, 103, 255, 0.08); cursor: pointer;">
                        <input class="form-check-input pb-mode-cb m-0" type="checkbox" value="meme" ${selectedModes.includes('meme') ? 'checked' : ''} style="transform: scale(1.1);">
                        <div class="ms-3">
                            <div class="fw-bold lh-sm" style="color:var(--text-main); font-size: 1rem;">МемоБатл (Гифки)</div>
                            <div class="text-muted lh-sm mt-1" style="font-size: 0.75rem;">Подбирай смешные реакции к ситуациям</div>
                        </div>
                    </label>
                    <label class="form-check d-flex align-items-center py-2 px-3 rounded-4 m-0" style="background: #f8f9fc; border: 1px solid rgba(90, 103, 255, 0.08); cursor: pointer;">
                        <input class="form-check-input pb-mode-cb m-0" type="checkbox" value="joke" ${selectedModes.includes('joke') ? 'checked' : ''} style="transform: scale(1.1);">
                        <div class="ms-3">
                            <div class="fw-bold lh-sm" style="color:var(--text-main); font-size: 1rem;">Добивка (Шутки)</div>
                            <div class="text-muted lh-sm mt-1" style="font-size: 0.75rem;">Придумай самую смешную концовку</div>
                        </div>
                    </label>
                    <label class="form-check d-flex align-items-center py-2 px-3 rounded-4 m-0" style="background: #f8f9fc; border: 1px solid rgba(90, 103, 255, 0.08); cursor: pointer;">
                        <input class="form-check-input pb-mode-cb m-0" type="checkbox" value="whoami" ${selectedModes.includes('whoami') ? 'checked' : ''} style="transform: scale(1.1);">
                        <div class="ms-3">
                            <div class="fw-bold lh-sm" style="color:var(--text-main); font-size: 1rem;">Кто из нас?</div>
                            <div class="text-muted lh-sm mt-1" style="font-size: 0.75rem;">Анонимное голосование друг за друга</div>
                        </div>
                    </label>
                    <label class="form-check d-flex align-items-center py-2 px-3 rounded-4 m-0" style="background: #f8f9fc; border: 1px solid rgba(90, 103, 255, 0.08); cursor: pointer;">
                        <input class="form-check-input pb-mode-cb m-0" type="checkbox" value="advice" ${selectedModes.includes('advice') ? 'checked' : ''} style="transform: scale(1.1);">
                        <div class="ms-3">
                            <div class="fw-bold lh-sm" style="color:var(--text-main); font-size: 1rem;">Вредные советы</div>
                            <div class="text-muted lh-sm mt-1" style="font-size: 0.75rem;">Выходим из неловких ситуаций</div>
                        </div>
                    </label>
                    <label class="form-check d-flex align-items-center py-2 px-3 rounded-4 m-0" style="background: #f8f9fc; border: 1px solid rgba(90, 103, 255, 0.08); cursor: pointer;">
                        <input class="form-check-input pb-mode-cb m-0" type="checkbox" value="acronym" ${selectedModes.includes('acronym') ? 'checked' : ''} style="transform: scale(1.1);">
                        <div class="ms-3">
                            <div class="fw-bold lh-sm" style="color:var(--text-main); font-size: 1rem;">Дешифратор</div>
                            <div class="text-muted lh-sm mt-1" style="font-size: 0.75rem;">Смешно расшифровываем аббревиатуры</div>
                        </div>
                    </label>
                    <label class="form-check d-flex align-items-center py-2 px-3 rounded-4 m-0" style="background: #f8f9fc; border: 1px solid rgba(90, 103, 255, 0.08); cursor: pointer;">
                        <input class="form-check-input pb-mode-cb m-0" type="checkbox" value="caption" ${selectedModes.includes('caption') ? 'checked' : ''} style="transform: scale(1.1);">
                        <div class="ms-3">
                            <div class="fw-bold lh-sm" style="color:var(--text-main); font-size: 1rem;">Подпиши картинку</div>
                            <div class="text-muted lh-sm mt-1" style="font-size: 0.75rem;">Придумываем подпись к рандомному мему</div>
                        </div>
                    </label>
                    <label class="form-check d-flex align-items-center py-2 px-3 rounded-4 m-0" style="background: #f8f9fc; border: 1px solid rgba(90, 103, 255, 0.08); cursor: pointer;">
                        <input class="form-check-input pb-mode-cb m-0" type="checkbox" value="bluff" ${selectedModes.includes('bluff') ? 'checked' : ''} style="transform: scale(1.1);">
                        <div class="ms-3">
                            <div class="fw-bold lh-sm" style="color:var(--text-main); font-size: 1rem;">Блеф</div>
                            <div class="text-muted lh-sm mt-1" style="font-size: 0.75rem;">Пишем ложь и пытаемся угадать правду</div>
                        </div>
                    </label>
                </div>

                <button class="btn btn-primary w-100 py-2 rounded-4 fw-bold shadow-sm" style="min-height:42px; font-size:0.92rem;" onclick="PartyBattleUI.closeModesModal()">Применить</button>
            </div>
            </div>
            
            <div id="pbThemeModal" style="display:none; position:fixed; inset:0; z-index:9999; background:rgba(17,20,36,0.46); backdrop-filter:blur(12px); align-items:flex-end; justify-content:center; opacity:0; transition: opacity 0.3s; padding: 16px;"
                onclick="if(event.target===this) PartyBattleUI.closeThemeModal()">
                <div class="p-3 rounded-4 w-100 shadow-lg animate__animated animate__fadeInUp" style="background: rgba(255,255,255,0.98); max-width: 500px; border: 1px solid rgba(90, 103, 255, 0.08); box-shadow: 0 18px 48px rgba(17,20,36,0.16) !important;">
                    <div class="d-flex justify-content-between align-items-center mb-4">
                        <div>
                            <div class="small text-uppercase fw-bold text-muted mb-1" style="letter-spacing:0.16em; font-size:0.7rem;">Настройка</div>
                            <h4 class="fw-bold m-0" style="color:var(--text-main); font-size:1.16rem;">Набор карточек</h4>
                        </div>
                        <button class="btn-close" style="filter: var(--invert-filter);" onclick="PartyBattleUI.closeThemeModal()"></button>
                    </div>

                    <div class="d-flex flex-column gap-3 mb-4">
                        <label class="form-check d-flex align-items-center p-3 rounded-4 m-0" style="background: #f8f9fc; border: 1px solid rgba(90, 103, 255, 0.1); cursor: pointer;" onclick="PartyBattleUI.selectTheme('base')">
                            <input class="form-check-input pb-theme-radio m-0" type="radio" name="pb-theme-radio" value="base" ${selectedTheme === 'base' ? 'checked' : ''} style="transform: scale(1.3);">
                                <div class="ms-3">
                                    <div class="fw-bold" style="color:var(--text-main); font-size: 1rem;">Базовая колода</div>
                                    <div class="small text-muted">Стандартный набор ситуаций для всех режимов</div>
                                </div>
                        </label>
                        <label class="form-check d-flex align-items-center p-3 rounded-4 m-0" style="background: #fff7f8; border: 1px solid rgba(220, 53, 69, 0.14); cursor: pointer;" onclick="PartyBattleUI.selectTheme('adult')">
                            <input class="form-check-input pb-theme-radio m-0" type="radio" name="pb-theme-radio" value="adult" ${selectedTheme === 'adult' ? 'checked' : ''} style="transform: scale(1.3);">
                                <div class="ms-3">
                                    <div class="fw-bold text-danger" style="font-size: 1rem;">18+ Полный треш</div>
                                    <div class="small text-muted">Жесткий юмор для режимов с adult-паками, остальные останутся на базе</div>
                                </div>
                        </label>
                    </div>

                    <button class="btn btn-primary w-100 py-2 rounded-4 fw-bold shadow-sm" style="min-height:42px; font-size:0.92rem;" onclick="PartyBattleUI.closeThemeModal()">Применить</button>
                </div>
            </div>
            `;
        }

        document.getElementById('game-area').innerHTML = html;
        this.afterRender('lobby');

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
            return `<span class="badge rounded-pill px-3 py-2 me-1 mb-1" style="background: rgba(90, 103, 255, 0.12); color:#4e5bf4; border: 1px solid rgba(90, 103, 255, 0.12); font-weight:700;">${labels[mode] || mode}</span>`;
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
            preview.innerHTML = `<span class="badge rounded-pill px-3 py-2" style="background: rgba(220, 53, 69, 0.12); color:#dc3545; border: 1px solid rgba(220, 53, 69, 0.14);">18+ Полный треш</span>`;
        } else {
            preview.innerHTML = `<span class="badge rounded-pill px-3 py-2" style="background: rgba(90, 103, 255, 0.12); color:#4e5bf4; border: 1px solid rgba(90, 103, 255, 0.12);">Базовая колода</span>`;
        }

        const summary = document.getElementById('pb-theme-scope-summary');
        if (summary) {
            const checkedModes = Array.from(document.querySelectorAll('.pb-mode-cb:checked')).map(cb => cb.value);
            summary.innerHTML = this.renderThemeScopeSummary(val, checkedModes, true);
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
            return `<span class="badge rounded-pill px-3 py-2 me-1 mb-1" style="background: rgba(90, 103, 255, 0.12); color:#4e5bf4; border: 1px solid rgba(90, 103, 255, 0.12); font-weight:700;">${labels[cb.value]}</span>`;
        }).join('');

        const summary = document.getElementById('pb-theme-scope-summary');
        const themeInput = document.getElementById('pb-theme');
        if (summary && themeInput) {
            summary.innerHTML = this.renderThemeScopeSummary(themeInput.value, checked.map(cb => cb.value), true);
        }
    },

    renderThemeScopeSummary: function (selectedTheme, selectedModes, innerOnly = false) {
        const labels = {
            meme: 'МемоБатл',
            joke: 'Добивка',
            whoami: 'Кто из нас?',
            advice: 'Вредные советы',
            acronym: 'Дешифратор',
            caption: 'Подпиши картинку',
            bluff: 'Блеф'
        };
        const adultSupported = new Set(['meme', 'joke', 'advice', 'acronym', 'bluff', 'whoami']);
        const modes = Array.isArray(selectedModes) ? selectedModes : [];

        let body = '';
        if (selectedTheme === 'adult') {
            const adultModes = modes.filter(mode => adultSupported.has(mode));
            const baseModes = modes.filter(mode => !adultSupported.has(mode));
            body += `<div class="small text-muted mb-2" style="line-height:1.35;">18+ применяется только к режимам со взрослыми паками. Остальные выбранные режимы пойдут на базовой теме.</div>`;
            if (adultModes.length > 0) {
                body += `<div class="small fw-bold mb-1" style="color:var(--text-main);">Получат 18+:</div>`;
                body += `<div class="d-flex flex-wrap gap-2 mb-2">${adultModes.map(mode => `<span class="badge rounded-pill px-3 py-2" style="background: rgba(220, 53, 69, 0.12); color: #dc3545; border: 1px solid rgba(220, 53, 69, 0.16);">${labels[mode] || mode}</span>`).join('')}</div>`;
            }
            if (baseModes.length > 0) {
                body += `<div class="small fw-bold mb-1" style="color:var(--text-main);">Останутся на базе:</div>`;
                body += `<div class="d-flex flex-wrap gap-2">${baseModes.map(mode => `<span class="badge rounded-pill px-3 py-2" style="background: rgba(108, 117, 125, 0.12); color: #6c757d; border: 1px solid rgba(108, 117, 125, 0.16);">${labels[mode] || mode}</span>`).join('')}</div>`;
            }
        } else {
            body += `<div class="small text-muted" style="line-height:1.35;">Базовая тема работает для всех режимов без исключений.</div>`;
        }

        if (innerOnly) {
            return body;
        }

        return `<div id="pb-theme-scope-summary" class="mb-3">${body}</div>`;
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

    applyQuickSmokePreset: function () {
        const presetModes = ['advice', 'meme', 'caption', 'bluff'];
        const modeCheckboxes = Array.from(document.querySelectorAll('.pb-mode-cb'));
        modeCheckboxes.forEach(cb => {
            cb.checked = presetModes.includes(cb.value);
        });

        const themeInput = document.getElementById('pb-theme');
        if (themeInput) {
            themeInput.value = 'base';
        }

        const aiToggle = document.getElementById('pb-ai-mode');
        if (aiToggle) {
            aiToggle.checked = false;
        }

        this.selectRounds(4);
        this.updateModesPreview();
        this.updateThemePreview();
    },

    startQuickSmoke: async function () {
        this.applyQuickSmokePreset();
        await this.startGame({
            modes: ['advice', 'meme', 'caption', 'bluff'],
            rounds: 4,
            theme: 'base',
            aiMode: false,
        });
    },

    startGame: async function (preset = null) {
        const btn = document.querySelector('button[onclick="PartyBattleUI.startGame()"]');
        const originalHtml = btn ? btn.innerHTML : null;
        if (btn) btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span> Запускаем...';

        const checkedModes = Array.from(document.querySelectorAll('.pb-mode-cb:checked')).map(cb => cb.value);
        const mode = Array.isArray(preset?.modes) ? preset.modes : checkedModes;
        if (!Array.isArray(mode) || mode.length === 0) {
            window.showAlert('Ошибка', 'Выберите хотя бы один режим игры!');
            if (btn) btn.innerHTML = originalHtml || '<i class="bi bi-play-fill me-1"></i> Начать игру';
            return;
        }

        const rounds = preset?.rounds ?? document.getElementById('pb-rounds').value;
        const theme = preset?.theme ?? document.getElementById('pb-theme').value;
        const aiMode = preset?.aiMode ?? document.getElementById('pb-ai-mode').checked;

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

    renderHeader: function (gameState, options = {}) {
        const modeMeta = pb_getModeMeta(gameState.activeMode);
        const stageMeta = pb_getStageMeta(gameState.view);
        const compact = !!options.compact;
        const roundText = gameState.view !== 'lobby' && gameState.view !== 'results'
            ? `Раунд ${gameState.current_round} из ${gameState.total_rounds}`
            : '';
        return `
            <div class="header-container px-3 ${compact ? 'pt-2 pb-1' : 'pt-2 pb-2'} text-center" style="background: transparent;">
                ${roundText || modeMeta.label ? `
                    <div class="mx-auto ${compact ? 'mb-1' : 'mb-2'}" style="max-width: min(100%, ${compact ? '240px' : '260px'});">
                        ${roundText ? `<div class="fw-bold ${compact ? 'mb-0' : 'mb-1'}" style="color:#5a67ff; font-size: ${compact ? '0.84rem' : '0.92rem'}; line-height:1.1;">${roundText}</div>` : ''}
                        ${modeMeta.label ? `<div class="mx-auto rounded-pill px-3 ${compact ? 'py-1' : 'py-2'} text-truncate shadow-sm" style="background: rgba(255,255,255,0.92); color: var(--text-main); border: 1px solid rgba(90, 103, 255, 0.08); font-size: ${compact ? '0.8rem' : '0.88rem'}; font-weight: 700; box-shadow: 0 8px 18px rgba(31,38,135,0.04);">${modeMeta.label}</div>` : ''}
                    </div>
                ` : ''}
                <h2 class="fw-black m-0 ${compact ? 'mb-0' : 'mb-1'}" style="color:var(--text-main); line-height: 0.98; letter-spacing: -0.045em; font-size:${compact ? '1.42rem' : '1.86rem'};">Party Battle</h2>
                <div class="small fw-bold text-uppercase" style="color:var(--text-muted); letter-spacing: 0.18em; font-size:${compact ? '0.66rem' : '0.74rem'};">${stageMeta.label}</div>
            </div>
            `;
    },

    renderBottomActions: function (options = {}) {
        const primaryButton = options.primaryButton || '';
        const statusMarkup = options.statusMarkup || '';
        return `
            <div class="fixed-bottom px-3 pt-1 pb-2" style="z-index: 1000; padding-bottom: calc(env(safe-area-inset-bottom) + 8px) !important; background: #ffffff; border-top: 1px solid rgba(0,0,0,0.06); box-shadow: 0 -8px 24px rgba(31, 38, 135, 0.06);">
                <div class="rounded-4 p-2 shadow-sm" style="background: #ffffff; border: 1px solid rgba(90, 103, 255, 0.08); box-shadow: 0 6px 16px rgba(31, 38, 135, 0.03);">
                    ${statusMarkup}
                    ${primaryButton}
                    ${primaryButton ? '<div class="mb-2"></div>' : ''}
                    <button class="btn btn-outline-secondary w-100 fw-bold border-0 rounded-4" style="background: #f3f4f8; color: var(--text-main); font-size: 0.84rem; min-height: 42px;" onclick="window.sendGameAction('back_to_lobby')">
                        <i class="bi bi-box-arrow-right me-1"></i> ПОКИНУТЬ ИГРУ
                    </button>
                </div>
            </div>
            <div style="height:${primaryButton ? '138px' : '104px'};"></div>
        `;
    },

    renderSubmissionFooter: function (options = {}) {
        const primaryButton = options.primaryButton || '';
        return `
            <div class="fixed-bottom px-3 pt-1 pb-2" style="z-index: 1100; bottom: var(--pb-keyboard-offset, 0px); padding-bottom: calc(env(safe-area-inset-bottom) + 8px) !important; background: #ffffff; border-top: 1px solid rgba(0,0,0,0.06); box-shadow: 0 -8px 24px rgba(31, 38, 135, 0.06);">
                <div class="rounded-4 p-2 shadow-sm" style="background: #ffffff; border: 1px solid rgba(90, 103, 255, 0.08); box-shadow: 0 6px 16px rgba(31, 38, 135, 0.03);">
                    <div class="d-flex align-items-stretch gap-2">
                        ${primaryButton ? primaryButton.replace('w-100 py-3 rounded-4', 'flex-fill py-2 rounded-4').replace('min-height: 56px;', 'min-height: 42px; font-size: 0.88rem; padding-left: 10px; padding-right: 10px;') : ''}
                        <button class="btn btn-outline-secondary flex-fill fw-bold border-0 rounded-4" style="background: #f3f4f8; color: var(--text-main); font-size: 0.82rem; min-height: 42px; white-space: nowrap; padding-left: 10px; padding-right: 10px;" onclick="window.sendGameAction('back_to_lobby')">
                            <i class="bi bi-box-arrow-right me-1"></i> ВЫЙТИ
                        </button>
                    </div>
                </div>
            </div>
            <div style="height: calc(var(--pb-keyboard-offset, 0px) + 86px);"></div>
        `;
    },

    renderSituation: function (gameState) {
        if (!gameState.displayPrompt) return;

        const isHost = window.APP_STATE.room.is_host;
        let html = `
            <div class="d-flex flex-column" style="min-height: var(--pb-viewport-height, 100dvh); padding-top: calc(env(safe-area-inset-top) + 10px);">
                ${this.renderHeader(gameState, { compact: true })}
                <div class="d-flex flex-column align-items-center justify-content-start flex-grow-1 pb-4 pt-1 animate__animated animate__fadeIn px-3">
        `;

        const sitText = gameState.displayPrompt.body || '';
        const imageUrl = gameState.displayPrompt.mediaUrl || '';

        html += `
            <div class="badge rounded-pill mb-3 border shadow-sm px-3 py-1" style="font-size: 11px; background: rgba(90, 103, 255, 0.1); color: #5a67ff; border-color: rgba(90, 103, 255, 0.14) !important; letter-spacing:0.12em;">СИТУАЦИЯ</div>
            <div class="p-3 mb-4 shadow-sm rounded-4 d-flex align-items-center justify-content-center text-center position-relative overflow-hidden" 
                 style="min-height: 132px; width: 100%; max-width: 600px; background: linear-gradient(180deg, rgba(255,255,255,0.96), rgba(90, 103, 255, 0.03)); border: 1px solid rgba(90, 103, 255, 0.08) !important; box-shadow: 0 12px 28px rgba(31, 38, 135, 0.04) !important; padding: ${gameState.displayPrompt.kind === 'image' ? '0 !important' : '1rem'}">
                ${gameState.displayPrompt.kind === 'image' ? `
                    ${pb_renderPromptImage(imageUrl, 'w-100 h-100 object-fit-cover position-absolute top-0 start-0')}
                ` : `
                    <i class="bi bi-masks-theater position-absolute" style="top: -10px; left: -10px; font-size: 80px; opacity: 0.05; transform: rotate(-15deg);"></i>
                    <i class="bi bi-emoji-laughing position-absolute" style="bottom: -10px; right: -10px; font-size: 80px; opacity: 0.05; transform: rotate(15deg);"></i>
                    <h3 class="fw-bold m-0 position-relative z-1" style="color:var(--text-main); line-height: 1.18; font-size: clamp(1.32rem, 4.8vw, 2.2rem);">${sitText}</h3>
                `}
            </div>
        `;

        if (isHost) {
            let btnText = 'Раздать варианты';
            if (gameState.roundFamily === 'direct_vote') btnText = 'Перейти к голосованию';
            else if (gameState.displayPrompt.kind === 'image') btnText = 'Начать сбор ответов';
            else if (gameState.roundFamily === 'creative_vote' || gameState.roundFamily === 'bluff') btnText = 'Начать сбор ответов';

            html += `
            <button class="btn btn-primary w-100 py-2 rounded-4 fw-bold shadow-sm mb-3 animate__animated animate__pulse animate__infinite"
                style="max-width: 600px; min-height:42px; font-size:0.94rem; box-shadow: 0 12px 28px rgba(var(--primary-rgb), 0.2) !important;"
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
        this.afterRender('round_intro');

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
        const usesTextComposer = gameState.activeMode !== 'meme'
            && (gameState.roundFamily === 'creative_vote' || gameState.roundFamily === 'bluff');
        const footerHeight = !hasSubmitted && usesTextComposer ? 86 : 126;

        let html = `
            <div class="d-flex flex-column pb-3" style="min-height: var(--pb-viewport-height, 100dvh); padding-top: calc(env(safe-area-inset-top) + 10px); padding-bottom: calc(var(--pb-keyboard-offset, 0px) + env(safe-area-inset-bottom) + ${footerHeight}px);">
                ${this.renderHeader(gameState, { compact: true })}
                
                <div class="px-3 pt-2 pb-1 animate__animated animate__fadeInDown">
                    <div class="p-2 shadow-sm rounded-4" style="background: linear-gradient(180deg, rgba(255,255,255,0.96), rgba(90, 103, 255, 0.04)); border: 1px solid var(--border-glass); box-shadow: 0 12px 28px rgba(31, 38, 135, 0.04) !important;">
                        <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-1">
                            <div class="small text-muted fw-bold opacity-75 text-uppercase" style="font-size: 10px; letter-spacing: 0.14em;">${modeMeta.label}</div>
                            <span class="badge rounded-pill px-3 py-1" style="background: rgba(90, 103, 255, 0.1); color: #5a67ff; border: 1px solid rgba(90, 103, 255, 0.14);">Сбор ответов</span>
                        </div>
                        ${gameState.displayPrompt?.kind === 'image'
                ? pb_renderPromptImage(situation, 'w-100 rounded-3 object-fit-cover shadow-sm', 'max-height: 148px;')
                : `<div class="fw-bold text-main" style="font-size: 0.92rem; line-height: 1.18;">${situation}</div>`
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
                        <p class="text-muted small mb-4">${gameState.activeMode === 'bluff' ? 'Ложь записана. Ждем остальные ответы...' : 'Ответ отправлен. Ждем остальных игроков...'}</p>
                        <div class="d-flex align-items-center justify-content-center gap-2 bg-secondary bg-opacity-10 rounded-pill px-3 py-2 mx-auto" style="max-width: fit-content;">
                            <div class="spinner-border spinner-border-sm text-primary"></div>
                            <span class="small fw-bold opacity-75">Сдали: ${submittedCount} / ${totalPlayers}</span>
                        </div>
                    </div>
                </div>
            `;
        } else {
            html += `
                <div class="flex-grow-1 px-3 d-flex flex-column">
                    ${window.PartyBattleModes.renderSubmission(gameState, myHand)}
                </div>
            `;
        }

        html += `
                ${this.renderSubmissionFooter({
                    primaryButton: !hasSubmitted && usesTextComposer
                        ? `<button id="pb-submit-answer-btn" class="btn btn-primary w-100 py-3 rounded-4 fw-bold shadow-sm" style="box-shadow: 0 16px 36px rgba(var(--primary-rgb), 0.2) !important; min-height: 56px;" onclick="window.PartyBattleUI.submitAnswer()">
                            <i class="bi bi-send-fill me-2"></i> ${this.getSubmissionButtonLabel(gameState)}
                        </button>`
                        : ''
                })}
            </div>
        `;
        gameArea.innerHTML = html;
        this.afterRender('round_submission');
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

    getSubmissionButtonLabel: function (gameState = null) {
        const activeMode = gameState?.activeMode || null;
        if (activeMode === 'advice') return 'ОТПРАВИТЬ СОВЕТ';
        if (activeMode === 'caption') return 'ОТПРАВИТЬ ОТВЕТ';
        if (activeMode === 'bluff') return 'ОТПРАВИТЬ ЛОЖЬ';
        if (activeMode === 'acronym') return 'ОТПРАВИТЬ';
        return 'ОТПРАВИТЬ ШУТКУ';
    },

    /* --- VOTING SCREEN --- */
    renderVotingScreen: function (gameState) {
        if (!window.PartyBattleModes) return;

        const gameArea = document.getElementById('game-area');
        const myId = String(pb_getMyId());
        const hasVoted = gameState.voteMap && gameState.voteMap[myId];
        const situation = gameState.displayPrompt?.body || gameState.displayPrompt?.mediaUrl || '';
        const modeMeta = pb_getModeMeta(gameState.activeMode);
        const entries = gameState.votingOptions;

        const totalPlayers = gameState.scores ? Object.keys(gameState.scores).length : 0;
        const votedCount = gameState.voteMap ? Object.keys(gameState.voteMap).length : 0;

        let html = `
            <div class="d-flex flex-column" style="min-height: var(--pb-viewport-height, 100dvh); padding-top: calc(env(safe-area-inset-top) + 10px); padding-bottom: calc(env(safe-area-inset-bottom) + 12px);">
                ${this.renderHeader(gameState, { compact: true })}
                
                <div class="flex-grow-1 px-3 animate__animated animate__fadeIn">
                    <div class="p-3 mb-3 rounded-4 shadow-sm" style="background: linear-gradient(180deg, rgba(255,255,255,0.98), rgba(90, 103, 255, 0.03)); border: 1px solid rgba(90, 103, 255, 0.08); box-shadow: 0 10px 24px rgba(31, 38, 135, 0.04);">
                        <div class="d-flex justify-content-between align-items-center gap-2 flex-wrap mb-2">
                            <div class="small text-muted fw-bold text-uppercase" style="letter-spacing:0.14em;">${modeMeta.label}</div>
                            <span class="badge rounded-pill px-3 py-1" style="background: rgba(90, 103, 255, 0.1); color: #5a67ff; border: 1px solid rgba(90, 103, 255, 0.14); font-size:0.78rem;">${hasVoted ? 'Голос принят' : 'Выбери лучший вариант'}</span>
                        </div>
                        ${gameState.displayPrompt?.kind === 'image'
                ? `<div>${pb_renderPromptImage(situation, 'w-100 rounded-4 object-fit-cover shadow-sm mx-auto', 'max-width: 600px; max-height: 164px;')}</div>`
                : `<div class="fw-bold mx-auto" style="color:var(--text-main); max-width: 680px; line-height:1.16; font-size: clamp(1rem, 4vw, 1.34rem);">${situation}</div>`}
                    </div>
                    
                    ${hasVoted ? `
                        <div class="p-3 mb-3 mx-auto rounded-4 shadow-sm animate__animated animate__pulse text-center" 
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

                ${this.renderBottomActions({
                    statusMarkup: `
                        <div class="d-flex align-items-center justify-content-center gap-2 mb-2 rounded-pill py-1" style="background: #f3f4f8;">
                            <div class="spinner-grow spinner-grow-sm text-primary" role="status"></div>
                            <span class="small fw-bold text-muted" style="font-size:0.78rem;">Голоса: <span style="color:var(--text-main);">${votedCount} / ${totalPlayers}</span></span>
                        </div>
                    `
                })}
            </div>
        `;

        gameArea.innerHTML = html;
        this.afterRender('round_voting');
    },

    /* --- RESULTS SCREENS --- */
    renderRoundResults: function (gameState) {
        const gameArea = document.getElementById('game-area');
        const isHost = (window.APP_STATE?.room?.is_host) || false;
        const roundResult = gameState.roundResult || {};
        const mode = gameState.activeMode;
        const players = window.APP_STATE?.room?.players || [];
        const bluffAwards = mode === 'bluff'
            ? (gameState.round?.scoring?.awards || gameState.last_round_data?.awards || [])
            : [];

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
        const winnerPlayer = players.find(p => String(p.id) === String(winnerPlayerId));
        const title = winnerType === 'truth' ? 'Правда раскрыта!' : 'Победитель раунда!';
        const subtitle = winnerType === 'truth'
            ? 'Игроки чаще всего выбрали правильный вариант.'
            : (winnerPlayer?.display_name || winnerPlayer?.first_name || 'Игрок');
        const modeMeta = pb_getModeMeta(mode);
        const bluffTruth = mode === 'bluff'
            ? String(gameState.displayPrompt?.truth || gameState.round?.prompt?.truth || '').trim()
            : '';
        const bluffAwardSummary = mode === 'bluff'
            ? bluffAwards.reduce((acc, award) => {
                const playerId = String(award?.player_id || '');
                if (!playerId) return acc;
                const reason = award?.reason === 'guessed_truth' ? 'truth' : 'bluff';
                const player = players.find(p => String(p.id) === playerId);
                if (!acc[playerId]) {
                    acc[playerId] = {
                        playerId,
                        playerName: player ? (player.display_name || player.first_name || 'Игрок') : 'Игрок',
                        truth: 0,
                        bluff: 0,
                        total: 0,
                    };
                }
                acc[playerId][reason] += 100;
                acc[playerId].total += 100;
                return acc;
            }, {})
            : {};
        const bluffAwardRows = Object.values(bluffAwardSummary).sort((a, b) => b.total - a.total);

        let html = `
            <div class="d-flex flex-column" style="min-height: var(--pb-viewport-height, 100dvh); padding-top: calc(env(safe-area-inset-top) + 10px); padding-bottom: calc(env(safe-area-inset-bottom) + 12px);">
                ${this.renderHeader(gameState, { compact: true })}
                <div class="flex-grow-1 d-flex flex-column align-items-center p-3 text-center position-relative animate__animated animate__fadeIn">
                    <div class="small fw-bold text-uppercase mb-2" style="color:#5a67ff; letter-spacing:0.16em;">Результат</div>
                    <h2 class="fw-bold mb-2" style="color:var(--text-main); line-height:1.02;">${title}</h2>
                    <div class="text-muted fw-semibold mb-3" style="max-width:420px; font-size:0.98rem;">${winnerType === 'truth' ? subtitle : `${subtitle} победил в режиме «${modeMeta.label}»`}</div>
                    <div class="p-3 rounded-4 shadow-sm animate__animated animate__fadeInUp"
                        style="background: linear-gradient(180deg, rgba(255,255,255,0.98), rgba(90, 103, 255, 0.03)); border: 1px solid rgba(90, 103, 255, 0.12); max-width: 420px; width: 100%; box-shadow: 0 12px 28px rgba(31, 38, 135, 0.04) !important;">
                        ${winnerType === 'truth' ? `
                            <div class="d-flex align-items-center justify-content-center mb-3">
                                <span class="badge rounded-pill px-3 py-2" style="background:#e9f8ef; color:#179b4d;">Это была правда</span>
                            </div>
                        ` : `
                            <div class="d-flex align-items-center justify-content-center mb-3 gap-2">
                                <div style="width:40px; height:40px;">${pb_renderAvatar(winnerPlayer, 'md')}</div>
                                <span class="fw-bold" style="color:var(--text-main); font-size:1rem;">${subtitle}</span>
                            </div>
                        `}
                        ${mode === 'meme' && winnerType !== 'truth' ? `
                            <div class="rounded-4 overflow-hidden mb-3" style="aspect-ratio: 1;">
                                <img src="${winnerContent}" class="w-100 h-100 object-fit-cover shadow-sm">
                            </div>
                        ` : (mode === 'caption' ? `
                            <div class="mb-3">
                                ${pb_renderPromptImage(gameState.displayPrompt?.mediaUrl || '', 'w-100 rounded-4 object-fit-cover shadow-sm', 'max-height: 210px;')}
                            </div>
                            <h3 class="fw-bold mb-3" style="color:var(--text-main); line-height: 1.18; font-size: clamp(1.28rem, 4.5vw, 1.9rem);">${winnerContent}</h3>
                        ` : (mode === 'whoami' ? '' : `
                            <h3 class="fw-bold mb-3" style="color:var(--text-main); line-height: 1.18; font-size: clamp(1.22rem, 4.4vw, 1.8rem);">${winnerContent}</h3>
                        `))}
                        <div class="text-center rounded-4 p-3" style="background: #f6f8ff;">
                            ${winnerType === 'truth'
                ? `<div class="small text-muted fw-bold">Голосов за правду: ${winnerVotes}</div>`
                : `<div class="small text-muted fw-bold text-uppercase mb-1" style="letter-spacing:0.12em;">Награда</div>
                                   <h2 class="fw-bold text-primary mb-1">+${winnerVotes * 100}</h2>
                                   <div class="small text-muted fw-bold">Голосов: ${winnerVotes}</div>`}
                        </div>
                    </div>
                    ${mode === 'bluff' ? `
                        <div class="mt-3 p-3 rounded-4 shadow-sm" style="background: rgba(255,255,255,0.98); border: 1px solid rgba(90, 103, 255, 0.08); max-width: 420px; width: 100%; box-shadow: 0 10px 24px rgba(31, 38, 135, 0.04) !important;">
                            <div class="small fw-bold text-uppercase text-muted mb-2" style="letter-spacing:0.14em;">Как начислены очки</div>
                            ${bluffTruth ? `
                                <div class="rounded-4 px-3 py-2 mb-3 text-start" style="background:#f6f8ff;">
                                    <div class="small fw-bold text-uppercase text-muted mb-1" style="letter-spacing:0.12em;">Правильный ответ</div>
                                    <div class="fw-bold" style="color:var(--text-main); font-size:0.96rem;">${bluffTruth}</div>
                                </div>
                            ` : ''}
                            <div class="small text-muted mb-3" style="line-height:1.35;">
                                За выбор <span class="fw-bold" style="color:var(--text-main);">правды</span> игрок получает +100 себе.
                                За выбор <span class="fw-bold" style="color:var(--text-main);">чужой лжи</span> +100 получает автор этой лжи.
                            </div>
                            ${bluffAwardRows.length > 0 ? `
                                <div class="d-flex flex-column gap-2">
                                    ${bluffAwardRows.map(row => `
                                        <div class="d-flex justify-content-between align-items-center gap-3 rounded-4 px-3 py-2" style="background:#f7f8fc;">
                                            <div class="text-start">
                                                <div class="fw-bold" style="color:var(--text-main); font-size:0.92rem;">${row.playerName}</div>
                                                <div class="small text-muted" style="font-size:0.74rem;">
                                                    ${row.truth > 0 ? `за правду: +${row.truth}` : ''}
                                                    ${row.truth > 0 && row.bluff > 0 ? ' • ' : ''}
                                                    ${row.bluff > 0 ? `за обман: +${row.bluff}` : ''}
                                                </div>
                                            </div>
                                            <span class="badge rounded-pill px-3 py-2" style="background: rgba(90, 103, 255, 0.12); color:#4e5bf4; border: 1px solid rgba(90, 103, 255, 0.12); font-size:0.76rem;">+${row.total}</span>
                                        </div>
                                    `).join('')}
                                </div>
                            ` : `
                                <div class="small text-muted">В этом раунде очки никому не начислены.</div>
                            `}
                        </div>
                    ` : ''}
                </div>

                ${this.renderBottomActions({
                    primaryButton: isHost
                        ? `<button class="btn btn-primary py-2 w-100 rounded-4 fw-bold shadow-sm" style="min-height:42px; font-size:0.92rem;" onclick="window.sendGameAction('next_round')">
                            СЛЕДУЮЩИЙ РАУНД <i class="bi bi-chevron-right ms-2"></i>
                        </button>`
                        : '',
                    statusMarkup: !isHost
                        ? `<div class="p-2 w-100 text-center rounded-4 opacity-75 mb-2" style="background: #f3f4f8; border: 1px solid rgba(90, 103, 255, 0.08);">
                            <span class="small fw-bold text-muted" style="font-size:0.78rem;">Хост скоро продолжит игру...</span>
                        </div>`
                        : ''
                })}
            </div>
        `;
        gameArea.innerHTML = html;
        this.afterRender('round_results');
    },

    renderGameResults: function (gameState) {
        const gameArea = document.getElementById('game-area');
        if (!gameArea) return;
        const isHost = (window.APP_STATE?.room?.is_host) || false;
        const scores = gameState.scores || {};
        const sortedIds = Object.keys(scores).sort((a, b) => (scores[b] || 0) - (scores[a] || 0));
        const myId = String(pb_getMyId());
        const myRank = sortedIds.findIndex(uid => String(uid) === myId);
        const myScore = myRank >= 0 ? (scores[sortedIds[myRank]] || 0) : 0;
        const hasScores = sortedIds.length > 0;
        const safeName = (player) => window.safeHTML ? window.safeHTML(player?.display_name || player?.custom_name || player?.first_name || 'Игрок') : (player?.display_name || player?.custom_name || player?.first_name || 'Игрок');
        const postGameSummary = window.GameSummaryProvider
            ? window.GameSummaryProvider.remember('partybattle', gameState, { players: window.APP_STATE?.room?.players || [] })
            : null;

        let html = `
            <div class="d-flex flex-column" style="min-height: var(--pb-viewport-height, 100dvh); padding-top: calc(env(safe-area-inset-top) + 10px);">
                <div class="header-container text-center mb-3 mt-2 px-3">
                    <div class="small text-uppercase fw-bold mb-2" style="color:var(--text-muted); letter-spacing:0.18em;">ФИНАЛ</div>
                    <i class="bi bi-trophy-fill display-4 mb-2 animate__animated animate__bounceIn" style="color: var(--primary-color);"></i>
                    <h2 class="fw-bold mb-2" style="color:var(--text-main);">Итоги игры</h2>
                    <div class="text-muted fw-semibold">Финальный рейтинг после всех раундов.</div>
                    ${myRank >= 0 ? `
                        <div class="d-inline-flex align-items-center gap-2 rounded-pill px-3 py-2 mt-3" style="background: rgba(90, 103, 255, 0.08); border: 1px solid rgba(90, 103, 255, 0.1);">
                            <span class="small fw-bold text-muted text-uppercase" style="letter-spacing:0.12em; font-size:0.66rem;">Ваш результат</span>
                            <span class="fw-bold" style="color:var(--text-main); font-size:0.88rem;">#${myRank + 1}</span>
                            <span class="small fw-bold" style="color:#4e5bf4;">${myScore} XP</span>
                        </div>
                    ` : ''}
                </div>
                
                <div class="flex-grow-1 overflow-auto px-3 mb-4">
                    ${hasScores ? sortedIds.map((uid, index) => {
            const score = scores[uid];
            const player = (window.APP_STATE?.room?.players || []).find(p => String(p.id) === String(uid));
            const isWinner = index === 0;
            const isMe = String(uid) === myId;
            return `
                            <div class="d-flex justify-content-between align-items-center p-3 mb-2 rounded-4 shadow-sm animate__animated animate__fadeInUp" 
                                    style="background: ${isWinner ? 'linear-gradient(135deg, #4a58f5, #6f63ff)' : 'linear-gradient(180deg, rgba(255,255,255,0.98), rgba(90, 103, 255, 0.03))'}; border: 1px solid ${isWinner ? 'rgba(90, 103, 255, 0.18)' : (isMe ? 'rgba(90, 103, 255, 0.3)' : 'rgba(90, 103, 255, 0.08)')}; color: ${isWinner ? 'white' : 'var(--text-main)'}; transition-delay: ${index * 0.08}s; box-shadow:${isWinner ? '0 16px 34px rgba(90, 103, 255, 0.18)' : '0 10px 24px rgba(31, 38, 135, 0.04)'};">
                                <div class="d-flex align-items-center gap-3 flex-grow-1" style="min-width:0;">
                                    <div class="fw-bold flex-shrink-0" style="color:${isWinner ? 'white' : 'var(--text-main)'}; width: 28px;">#${index + 1}</div>
                                    <div class="flex-shrink-0" style="width:38px; height:38px;">${pb_renderAvatar(player, 'sm')}</div>
                                    <div class="d-flex flex-column min-w-0">
                                        <div class="fw-bold text-truncate" style="color:${isWinner ? 'white' : 'var(--text-main)'}; max-width: 170px;">${safeName(player)}</div>
                                        ${isWinner ? `<div class="small opacity-75">Победитель матча</div>` : ''}
                                    </div>
                                </div>
                                <div class="d-flex flex-column align-items-end gap-2 flex-shrink-0 ms-2">
                                    ${isMe ? `<span class="badge ${isWinner ? 'bg-white text-primary' : 'bg-primary text-white'}" style="font-size:10px;">ВЫ</span>` : ''}
                                    <span class="badge ${isWinner ? 'bg-white text-primary' : 'bg-primary text-white'} rounded-pill px-3 py-2" style="font-size:0.78rem;">${score} XP</span>
                                </div>
                            </div>`;
        }).join('') : `
                        <div class="rounded-4 p-4 text-center shadow-sm" style="background: linear-gradient(180deg, rgba(255,255,255,0.98), rgba(90, 103, 255, 0.03)); border: 1px solid rgba(90, 103, 255, 0.08); box-shadow: 0 10px 24px rgba(31, 38, 135, 0.04);">
                            <i class="bi bi-bar-chart-line text-primary opacity-50 d-block mb-3" style="font-size: 2rem;"></i>
                            <div class="fw-bold mb-2" style="color:var(--text-main);">Рейтинг пока пуст</div>
                            <div class="small text-muted">Очки появятся после завершения хотя бы одного раунда.</div>
                        </div>
                    `}

                    ${postGameSummary ? window.GameSummaryProvider.render(postGameSummary, {
            playAgainLabel: isHost ? 'Играть еще раз' : 'В комнату'
        }) : ''}
                </div>

                ${!postGameSummary ? `<div class="px-3 pb-3" style="padding-bottom: calc(env(safe-area-inset-bottom) + 12px) !important;">
                    <div class="rounded-4 p-2 shadow-sm" style="background: #ffffff; border: 1px solid rgba(90, 103, 255, 0.08); box-shadow: 0 6px 16px rgba(31, 38, 135, 0.03);">
                        ${isHost ? `
                            <button class="btn btn-primary w-100 py-2 rounded-4 fw-bold shadow-sm" style="min-height:42px; font-size:0.92rem;" onclick="window.sendGameAction('back_to_lobby')">
                                <i class="bi bi-arrow-repeat me-2"></i> СЫГРАТЬ ЕЩЁ
                            </button>
                        ` : `
                            <button class="btn btn-outline-secondary w-100 py-2 rounded-4 fw-bold border-0" style="background: #f3f4f8; color: var(--text-main); min-height:42px; font-size:0.84rem;" onclick="window.sendGameAction('back_to_lobby')">
                                <i class="bi bi-box-arrow-right me-1"></i> ВЫЙТИ В КОМНАТУ
                            </button>
                        `}
                    </div>
                </div>` : ''}
            </div>
        `;
        gameArea.innerHTML = html;
        this.afterRender('results');
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

        container.innerHTML = `<div class="rounded-4 px-3 py-4 text-center mt-3" style="background:#f6f7fb; border:1px solid rgba(90, 103, 255, 0.08);"><div class="spinner-border spinner-border-sm text-primary mb-2"></div><div class="small fw-semibold text-muted">Ищем подходящие GIF...</div></div>`;
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
                container.innerHTML = `<div class="rounded-4 px-3 py-4 text-center mt-3" style="background:#f6f7fb; border:1px solid rgba(90, 103, 255, 0.08);"><i class="bi bi-search text-primary opacity-50 d-block mb-2" style="font-size:1.2rem;"></i><div class="small fw-semibold text-muted">Ничего не найдено</div><div class="small text-muted mt-1">Попробуй другой запрос или обнови формулировку.</div></div>`;
            }
        } catch (e) {
            container.innerHTML = `<div class="rounded-4 px-3 py-4 text-center mt-3" style="background:#fff7f8; border:1px solid rgba(220, 53, 69, 0.12);"><i class="bi bi-wifi-off text-danger opacity-75 d-block mb-2" style="font-size:1.2rem;"></i><div class="small fw-semibold text-muted">Поиск временно недоступен</div><div class="small text-muted mt-1">Повтори попытку через несколько секунд.</div></div>`;
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
        return `<div class="d-flex flex-column align-items-center justify-content-center rounded-4 text-muted small text-center px-3" style="min-height:200px; background:#f6f7fb; border:1px solid rgba(90, 103, 255, 0.08);"><i class="bi bi-image-alt mb-2" style="font-size:1.4rem;"></i><span>Изображение недоступно</span></div>`;
    }

    const fallbackUrl = pb_getPromptImageFallbackUrl(safeUrl);
    const fallbackAttr = fallbackUrl ? ` data-fallback-src="${fallbackUrl}"` : '';
    return `<img src="${safeUrl}" class="${className}" style="${style}" loading="lazy"${fallbackAttr} onerror="if(!this.dataset.fallbackApplied && this.dataset.fallbackSrc){this.dataset.fallbackApplied='1';this.src=this.dataset.fallbackSrc;return;}this.outerHTML='<div class=&quot;d-flex flex-column align-items-center justify-content-center rounded-4 text-muted small text-center px-3&quot; style=&quot;min-height:200px;background:#f6f7fb;border:1px solid rgba(90, 103, 255, 0.08);${style || ''}&quot;><i class=&quot;bi bi-image-alt mb-2&quot; style=&quot;font-size:1.4rem;&quot;></i><span>Изображение недоступно</span></div>';">`;
}

function pb_getPromptImageFallbackUrl(url) {
    const match = String(url || '').match(/https?:\/\/media\.giphy\.com\/media\/([^/]+)\/giphy\.gif/i);
    if (match) {
        return `https://i.giphy.com/media/${match[1]}/giphy.gif`;
    }
    return '';
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

if (window.GameSummaryProvider) {
    window.GameSummaryProvider.register('partybattle', {
        buildSummary: function (gameState, context = {}) {
            const players = context.players || window.APP_STATE?.room?.players || [];
            const scores = gameState?.scores || {};
            const sortedIds = Object.keys(scores).sort((a, b) => (scores[b] || 0) - (scores[a] || 0));
            const getPlayer = (id) => players.find(p => String(p.id) === String(id));
            const getName = (id) => {
                const player = getPlayer(id);
                return player ? (player.display_name || player.custom_name || player.first_name || 'Игрок') : 'Игрок';
            };
            const participants = players.map(player => ({
                id: player.id,
                name: player.display_name || player.custom_name || player.first_name || 'Игрок'
            }));

            const topId = sortedIds[0] || null;
            const topScore = topId ? (scores[topId] || 0) : 0;
            const rounds = parseInt(gameState?.total_rounds, 10) || parseInt(gameState?.round_number, 10) || sortedIds.length || 0;
            const awards = [];

            if (topId) {
                awards.push({
                    iconClass: 'bi bi-trophy-fill',
                    title: 'Вечерний победитель',
                    player: `${getName(topId)} · ${topScore} XP`
                });
            }
            if (sortedIds[1]) {
                awards.push({
                    iconClass: 'bi bi-lightning-charge-fill',
                    title: 'Главный соперник',
                    player: `${getName(sortedIds[1])} · ${scores[sortedIds[1]] || 0} XP`
                });
            }
            if (sortedIds[2]) {
                awards.push({
                    iconClass: 'bi bi-incognito',
                    title: 'Темная лошадка',
                    player: `${getName(sortedIds[2])} · ${scores[sortedIds[2]] || 0} XP`
                });
            }

            if (awards.length === 1 && participants.length > 1) {
                const rival = participants.find(p => String(p.id) !== String(topId));
                if (rival) {
                    awards.push({
                        iconClass: 'bi bi-arrow-repeat',
                        title: 'Следующий вызов',
                        player: rival.name
                    });
                }
            }

            const gameTitle = 'Party Battle';
            const winnerName = topId ? getName(topId) : '';
            const outcome = topId
                ? `${winnerName} забрал матч после ${rounds || 'нескольких'} раундов.`
                : 'Матч закончился без явного победителя, но с поводом для реванша.';

            return {
                gameId: 'partybattle',
                gameTitle,
                participants,
                winner: topId ? { id: topId, name: winnerName, score: topScore } : null,
                outcome,
                awards,
                inviteLink: context.inviteLink,
                shareText: [
                    `${gameTitle}: ${outcome}`,
                    topId ? `Победитель: ${winnerName} (${topScore} XP)` : '',
                    ...awards.map(award => `${award.title}: ${award.player}`),
                    '',
                    'Залетай в следующий раунд:'
                ].filter(Boolean).join('\n')
            };
        },
        playAgain: function () {
            if (typeof window.sendGameAction === 'function') {
                window.sendGameAction('back_to_lobby');
            }
        }
    });
}
