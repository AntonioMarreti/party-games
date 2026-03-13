// js/games/brainbattle.js
{
    let battleStartTime = 0;
    let countdownActive = false;
    let reactionTimeout = null;

    // СПИСОК МОДУЛЕЙ
    const ENGINE_FILES = [
        'js/games/engines/logic.js',
        'js/games/engines/attention.js',
        'js/games/engines/motor.js',
        'js/games/engines/memory.js',
        'js/games/engines/erudition.js',
        'js/games/engines/quiz.js'
    ];

    async function render_brainbattle(res) {

        const container = document.getElementById('game-area');

        // 1. ЗАГРУЗЧИК
        if (!window.BB_ENGINES_LOADED) {
            container.innerHTML = '<div class="text-center mt-5"><div class="spinner-border text-primary"></div><p class="mt-2 text-muted">Загрузка модулей...</p></div>';

            // INJECT STYLES
            if (!document.getElementById('bb-styles')) {
                const link = document.createElement('link');
                link.id = 'bb-styles';
                link.rel = 'stylesheet';
                link.href = 'css/modules/brainbattle.css?v=' + new Date().getTime();
                document.head.appendChild(link);
            }

            const loadScript = (src) => {
                return new Promise((resolve, reject) => {
                    const s = document.createElement('script');
                    s.src = src + '?v=' + new Date().getTime();
                    s.onload = resolve;
                    s.onerror = reject;
                    document.head.appendChild(s);
                });
            };

            try {
                await Promise.all(ENGINE_FILES.map(loadScript));
                window.BB_ENGINES_LOADED = true;
                render_brainbattle(res);
            } catch (err) {
                container.innerHTML = `<div class="alert alert-danger">Ошибка загрузки модулей: ${err.message}</div>`;
            }
            return;
        }

        // Скрываем лишние элементы
        ['default-game-header', 'game-host-controls', 'score-card'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });

        // CLEANUP OVERLAYS
        const overlay = document.getElementById('bb-overlay-layer');
        if (overlay && (!res.room.game_state || JSON.parse(res.room.game_state).phase !== 'playing')) {
            overlay.remove();
        }

        try {
            if (!res.room.game_state) return;
            const state = JSON.parse(res.room.game_state);
            window.lastBBState = state; // Сохраняем стейт для финиша
            const myId = String(res.user.id);

            let wrapper = document.getElementById('bb-wrapper');
            if (!wrapper) {
                container.innerHTML = '';
                wrapper = document.createElement('div');
                wrapper.id = 'bb-wrapper';
                wrapper.className = 'game-custom-wrapper px-3';
                container.appendChild(wrapper);
            }

            // --- ТОЧКА РАЗМОРОЗКИ 1: Каждый тик рендера (по умолчанию всё доступно) ---
            wrapper.style.pointerEvents = 'auto';
            wrapper.style.opacity = '1';

            if (state.phase === 'setup') {
                renderSetup(wrapper, res.is_host);
            }
            else if (state.phase === 'playing') {
                wrapper.dataset.rendered = ''; // Сбрасываем флаг сетапа

                if (state.round_results && state.round_results[myId]) {
                    const overlay = document.getElementById('bb-overlay-layer');
                    if (overlay) overlay.remove(); // Remove overlay if match finished
                    // Если я уже ответил - показываю экран ожидания
                    renderWaiting(wrapper, state, res);
                } else {
                    // Если еще нет - запускаю последовательность игры
                    runGameSequence(wrapper, state.round_data);
                }
            }
            else if (state.phase === 'game_over') {
                const overlay = document.getElementById('bb-overlay-layer');
                if (overlay) overlay.remove();
                renderFinal(wrapper, state, res);
            }

        } catch (e) {
            console.error("BB Render Error:", e);
        }
    }

    // === ОТСЧЕТ И ЗАПУСК ===
    function runGameSequence(wrapper, task) {
        const taskStr = JSON.stringify(task);
        if (wrapper.dataset.taskId === taskStr) return;
        if (countdownActive) return;

        wrapper.dataset.taskId = taskStr;
        countdownActive = true;

        wrapper.innerHTML = `
        <div class="d-flex flex-column align-items-center justify-content-center flex-grow-1 h-100">
            <h5 class="bb-subtitle mb-4">Готовьтесь...</h5>
            <div id="cnt-number" class="display-1 fw-bold animate__animated animate__pulse animate__infinite" style="font-size: 100px; color: var(--primary-color); text-shadow: var(--shadow-sm);">3</div>
            <div class="bb-glass-card px-4 py-2 mt-4">
                <p class="mb-0 text-primary fw-bold fs-4 text-center" style="color:var(--primary-color) !important;">${task.title || 'Задание'}</p>
            </div>
        </div>
    `;

        let count = 3;
        const interval = setInterval(() => {
            count--;
            const numEl = document.getElementById('cnt-number');
            if (count > 0 && numEl) {
                numEl.innerText = count;
                window.audioManager.play('click'); // Tick sound
            } else {
                clearInterval(interval);
                countdownActive = false;

                wrapper.style.pointerEvents = 'auto';
                wrapper.style.opacity = '1';

                if (window.BB_MECHANICS && window.BB_MECHANICS[task.type]) {
                    window.BB_MECHANICS[task.type](wrapper, task);
                    battleStartTime = performance.now();
                    window.audioManager.play('pop'); // Game Start!
                }
            }
        }, 1000);
        window.audioManager.play('click'); // Pre-countdown tick
    }

    function renderSetup(wrapper, isHost) {
        if (wrapper.dataset.rendered === 'setup') return;

        wrapper.style.pointerEvents = 'auto';
        wrapper.style.opacity = '1';

        if (isHost) {
            wrapper.innerHTML = `
            <div class="d-flex flex-column align-items-center mt-2 mb-3">
                <h1 class="bb-title display-6 mb-0">Настройка</h1>
                <p class="bb-subtitle">Битва мозгов</p>
            </div>

            <div class="bb-glass-card mb-2">
                <label class="fw-bold mb-2 small text-uppercase text-muted d-block">Количество раундов</label>
                <div class="d-flex gap-2 mb-2">
                    <button class="bb-round-btn flex-grow-1 py-1" onclick="selectRounds(5, this)">5</button>
                    <button class="bb-round-btn flex-grow-1 active py-1" onclick="selectRounds(10, this)">10</button>
                    <button class="bb-round-btn flex-grow-1 py-1" onclick="selectRounds(15, this)">15</button>
                </div>
                <input id="bb-rounds" type="number" value="10" min="1" max="50" class="form-control rounded-pill text-center fw-bold py-2" style="color:var(--primary-color) !important; background:var(--bg-secondary) !important; border:1px solid var(--border-main) !important;">
            </div>

            <div class="bb-glass-card mb-4" style="flex:1; overflow:hidden; display:flex; flex-direction:column;">
                <label class="fw-bold small text-uppercase text-muted mb-2 d-block">Категории</label>
                
                <div id="bb-categories-list" class="d-flex flex-column gap-1 overflow-auto" style="min-height:0;">
                    <label class="bb-category-item py-2">
                        <input type="checkbox" class="bb-checkbox" value="attention" checked>
                        <i class="bi bi-grid-3x3-gap-fill me-2 text-primary"></i>
                        <span class="fw-bold text-body small">Внимание</span>
                    </label>
                    <label class="bb-category-item py-2">
                        <input type="checkbox" class="bb-checkbox" value="logic" checked>
                        <i class="bi bi-puzzle-fill me-2 text-warning" style="color: var(--status-warning) !important;"></i>
                        <span class="fw-bold text-body small">Логика</span>
                    </label>
                    <label class="bb-category-item py-2">
                        <input type="checkbox" class="bb-checkbox" value="erudition" checked>
                        <i class="bi bi-globe me-2 text-info" style="color: var(--status-info) !important;"></i>
                        <span class="fw-bold text-body small">Эрудиция</span>
                    </label>
                    <label class="bb-category-item py-2">
                        <input type="checkbox" class="bb-checkbox" value="motor" checked>
                        <i class="bi bi-lightning-fill me-2 text-danger" style="color: var(--status-error) !important;"></i>
                        <span class="fw-bold text-body small">Реакция</span>
                    </label>
                    <label class="bb-category-item py-2">
                        <input type="checkbox" class="bb-checkbox" value="memory" checked>
                        <i class="bi bi-stopwatch-fill me-2 text-success" style="color: var(--status-success) !important;"></i>
                        <span class="fw-bold text-body small">Память</span>
                    </label>
                </div>
                
                <div id="bb-deep-settings" class="d-none flex-column gap-1 overflow-auto" style="min-height:0;">
                    <!-- Will be filled via JS -->
                </div>

                <div class="mt-3 pt-2 border-top text-center">
                    <button class="btn btn-sm btn-outline-primary rounded-pill px-3 py-1 fw-bold" style="font-size: 0.75rem;" onclick="showDeepSettings()">
                        <i class="bi bi-sliders me-1"></i> Расширенные настройки
                    </button>
                </div>
            </div>
            
            <div class="fixed-bottom-actions pb-2 d-flex gap-2">
                <button class="bb-start-btn flex-grow-1" style="max-width: 120px; background: var(--bg-secondary); color: var(--text-muted); box-shadow: none;" onclick="backToLobby()">Выйти</button>
                <button class="bb-start-btn flex-grow-1" onclick="bbStart()">Начать битву</button>
            </div>
            <div style="height: 60px;"></div>`;

            window.showDeepSettings = async function() {
                const list = document.getElementById('bb-categories-list');
                const deep = document.getElementById('bb-deep-settings');
                const btn = event.currentTarget || event.target;

                if (deep.classList.contains('d-none')) {
                    list.classList.add('d-none');
                    deep.classList.remove('d-none');
                    btn.innerHTML = '<i class="bi bi-arrow-left me-1"></i> К категориям';
                    
                    if (!window.BB_LIBRARY) {
                        deep.innerHTML = '<div class="text-center py-3"><div class="spinner-border spinner-border-sm text-primary"></div></div>';
                        const res = await sendGameAction('get_library');
                        if (res && res.library) {
                            window.BB_LIBRARY = res.library;
                        }
                    }
                    renderDeepSettings();
                } else {
                    deep.classList.add('d-none');
                    list.classList.remove('d-none');
                    btn.innerHTML = '<i class="bi bi-sliders me-1"></i> Расширенные настройки';
                }
            };

            window.renderDeepSettings = function() {
                const deep = document.getElementById('bb-deep-settings');
                if (!window.BB_LIBRARY) return;

                const gameNames = {
                    'math_blitz': 'Математика',
                    'greater_less': 'Больше-Меньше',
                    'color_chaos': 'Цветовой хаос',
                    'odd_one_out': 'Найди лишнее',
                    'count_objects': 'Счет объектов',
                    'find_duplicate': 'Найди пару',
                    'thimbles': 'Наперстки',
                    'reaction_test': 'Реакция',
                    'timing_safe': 'Сейф',
                    'defuse_numbers': 'Разминирование',
                    'photo_memory': 'Фотопамять',
                    'blind_timer': 'Секундомер',
                    'simon_says': 'Саймон говорит',
                    'edible_inedible': 'Съедобное',
                    'alchemy': 'Алхимия',
                    'ai_quiz': 'AI Викторина',
                    'fact_check': 'Правда/Ложь'
                };

                const categoryNames = {
                    'logic': 'Логика',
                    'attention': 'Внимание',
                    'motor': 'Реакция',
                    'memory': 'Память',
                    'erudition': 'Эрудиция'
                };

                let html = '';
                for (const [cat, games] of Object.entries(window.BB_LIBRARY)) {
                    html += `<div class="mt-2 mb-1 small fw-bold text-muted text-uppercase" style="font-size:0.65rem; letter-spacing:1px;">${categoryNames[cat] || cat}</div>`;
                    games.forEach(game => {
                        html += `
                        <label class="bb-category-item py-1">
                            <input type="checkbox" class="bb-game-checkbox" value="${game}">
                            <span class="fw-bold text-body small ms-2">${gameNames[game] || game}</span>
                        </label>`;
                    });
                }
                deep.innerHTML = html;
            };


            window.selectRounds = (val, btn) => {
                document.getElementById('bb-rounds').value = val;
                document.querySelectorAll('.bb-round-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            };

        } else {
            wrapper.innerHTML = `
            <div class="d-flex flex-column align-items-center justify-content-center flex-grow-1 h-100">
                <div class="spinner-border text-primary mb-3"></div>
                <h3 class="fw-bold text-dark">Ждем хоста...</h3>
            </div>`;
        }
        wrapper.dataset.rendered = 'setup';
    }

    function renderWaiting(wrapper, state, res) {
        wrapper.dataset.taskId = ''; countdownActive = false;
        const myId = String(res.user.id);
        const myRes = state.round_results[myId];
        if (!myRes) return;

        wrapper.style.pointerEvents = 'auto';
        wrapper.style.opacity = '1';

        const isCorrect = myRes.correct;
        const sorted = Object.entries(state.round_results).sort((a, b) => b[1].score - a[1].score);

        let listHtml = '';
        sorted.forEach(([uid, data], index) => {
            const p = res.players.find(pl => String(pl.id) === uid);
            if (p) {
                const streakBadge = data.has_streak ? `<span class="badge bg-danger ms-2 shadow-sm" style="font-size: 0.7rem; cursor: pointer; border-radius: 12px; padding: 4px 8px;" onclick="alert('🔥 Режим огня!\\n\\nЭтот игрок был первым 3 раза подряд, поэтому все его очки сейчас умножаются на 1.5x!')">🔥 1.5x</span>` : '';
                listHtml += `<div class="bb-result-card animate__animated animate__flipInX" style="animation-duration: 0.5s;">
                <div class="d-flex align-items-center">
                    <div class="bb-rank">#${index + 1}</div>
                    ${window.renderAvatar ? window.renderAvatar(p, 'md') : `<img src="${p.photo_url}" class="rounded-circle me-3" style="width:40px;height:40px;">`}
                    <div class="d-flex flex-column justify-content-center ms-3">
                        <span class="fw-bold d-flex align-items-center" style="font-size: 15px; color:var(--text-main); line-height: 1;">${p.first_name}${streakBadge}</span>
                    </div>
                </div>
                <div class="fw-bold" style="color:var(--primary-color);">+${data.score}</div>
            </div>`;
            }
        });

        let waitingListHtml = '';
        res.players.forEach(p => {
            if (!state.round_results[String(p.id)]) {
                waitingListHtml += `<div class="bb-result-card mt-2" style="background: rgba(255,255,255,0.4); opacity: 0.7; border: 1px dashed var(--border-main);">
                <div class="d-flex align-items-center">
                    <div class="spinner-border text-muted me-3" style="width: 20px; height: 20px; border-width: 2px;"></div>
                    ${window.renderAvatar ? window.renderAvatar(p, 'sm') : `<img src="${p.photo_url}" class="rounded-circle me-3" style="width:30px;height:30px;">`}
                    <span class="fw-bold text-muted ms-2" style="font-size: 14px;">${p.first_name}</span>
                </div>
                <div class="fw-bold text-muted small">Думает...</div>
            </div>`;
            }
        });

        const isLastRound = state.current_round >= state.total_rounds;
        let btnHtml = '';
        if (res.is_host) {
            btnHtml = `<button class="bb-start-btn w-100 py-3" onclick="bbNext()">${isLastRound ? "🏁 Результаты" : "Следующий раунд"}</button>`;
        } else {
            btnHtml = `<div class="text-center text-muted fw-bold small"><div class="spinner-border spinner-border-sm me-2"></div> Ожидание хоста...</div>`;
        }

        wrapper.innerHTML = `
        <div class="d-flex flex-column h-100">
            <!-- SCROLLABLE CONTENT -->
            <div class="flex-grow-1 overflow-auto pt-4 px-2" style="-webkit-overflow-scrolling: touch;">
                <div class="bb-result-circle mx-auto">
                    ${isCorrect ? '<i class="bi bi-check-lg text-success"></i>' : '<i class="bi bi-x-lg text-danger"></i>'}
                </div>
                <h2 class="fw-bold mb-1 text-center" style="color: ${isCorrect ? 'var(--status-success)' : 'var(--status-error)'}">${isCorrect ? 'Верно!' : 'Ошибка'}</h2>
                <p class="text-muted mb-4 text-center fw-bold">${(myRes.time / 1000).toFixed(2)} сек</p>
                
                <div class="bb-glass-card p-4 text-center mb-4 mx-3">
                    <div class="small text-uppercase text-muted fw-bold mb-1">Получено очков</div>
                    <h1 class="display-2 fw-bold mb-0" style="background: var(--primary-gradient); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">+${myRes.score}</h1>
                </div>

                <h6 class="text-start ms-4 mb-3 small text-uppercase text-muted fw-extrabold" style="letter-spacing: 1px;">Топ раунда</h6>
                <div class="d-flex flex-column gap-2 px-3 pb-3">
                    ${listHtml}
                </div>
                ${waitingListHtml ? `
                <h6 class="text-start ms-4 mt-2 mb-3 small text-uppercase fw-extrabold" style="color: var(--text-muted); letter-spacing: 1px;">Ждем ответа от:</h6>
                <div class="d-flex flex-column gap-2 px-3 pb-3">
                    ${waitingListHtml}
                </div>` : ''}
            </div>

            <!-- FIXED FOOTER -->
            <div class="p-3 pb-4 flex-shrink-0" style="z-index: 100;">
                ${btnHtml}
            </div>
        </div>
        <script>
            if (${isCorrect}) window.audioManager.play('success');
            else window.audioManager.play('error');
        </script>
        `;
    }

    function renderFinal(wrapper, state, res) {
        wrapper.style.pointerEvents = 'auto';
        wrapper.style.opacity = '1';

        const sorted = Object.entries(state.scores || {}).sort((a, b) => b[1] - a[1]);
        const winnerId = sorted[0] ? sorted[0][0] : null;
        const isWinner = String(res.user.id) === String(winnerId);

        let html = `
        <div class="d-flex flex-column align-items-center pt-5 pb-5 px-3">
            <div class="mb-4 animate__animated animate__bounceIn">
                <div style="font-size: 80px; filter: drop-shadow(0 10px 20px rgba(255, 215, 0, 0.4));">🏆</div>
            </div>
            <script>window.audioManager.play('win');</script>
            
            <h2 class="display-6 fw-bold mb-2 text-center" style="color: var(--text-main);">Битва окончена!</h2>
            
            ${isWinner
                ? `<div class="bb-glass-card p-4 mb-5 w-100 text-center" style="background: linear-gradient(135deg, rgba(255, 215, 0, 0.2) 0%, rgba(255, 255, 255, 0.6) 100%); border: 1px solid rgba(255, 215, 0, 0.3);">
                    <h3 class="fw-bold mb-0 text-warning" style="text-shadow: 0 2px 5px rgba(0,0,0,0.1);">ТЫ ЧЕМПИОН! 🎉</h3>
                   </div>`
                : `<div class="mb-4"></div>`
            }

            <div class="w-100 d-flex flex-column gap-2 mb-5">
    `;

        sorted.forEach(([uid, score], index) => {
            const p = res.players.find(pl => String(pl.id) === uid);
            if (p) {
                let rankStyle = '';
                if (index === 0) rankStyle = 'background: #FFD700; color: white; box-shadow: 0 4px 10px rgba(255, 215, 0, 0.4);';
                else if (index === 1) rankStyle = 'background: #C0C0C0; color: white;';
                else if (index === 2) rankStyle = 'background: #CD7F32; color: white;';

                html += `
                <div class="bb-result-card" style="${index === 0 ? 'border: 2px solid #FFD700; transform: scale(1.02);' : ''}">
                    <div class="d-flex align-items-center">
                        <div class="bb-rank" style="${rankStyle}">#${index + 1}</div>
                        ${window.renderAvatar ? window.renderAvatar(p, 'md') : `<img src="${p.photo_url}" class="rounded-circle me-3" style="width:44px;height:44px;">`}
                        <span class="fw-bold ms-3" style="font-size: 16px;">${p.first_name}</span>
                    </div>
                    <div class="fs-4 fw-bold text-dark">${score}</div>
                </div>
            `;
            }
        });

        html += `</div><div style="height: 100px;"></div></div>`;

        if (res.is_host) {
            html += `<div class="fixed-bottom-actions"><button class="bb-start-btn" style="background: var(--bg-secondary); color: var(--text-main); box-shadow: none; border: 1px solid var(--border-main);" onclick="bbFinish()">↩️ Вернуться в Лобби</button></div>`;
        } else {
            html += `<div class="fixed-bottom-actions text-center"><button class="btn btn-link fw-bold text-decoration-none" style="color:var(--text-muted);" onclick="leaveRoom()">Покинуть комнату</button></div>`;
        }

        wrapper.innerHTML = html;
    }

    window.bbFinish = async function () {
        // 1. Собираем результаты для рейтинга
        if (window.lastBBState && window.lastBBState.scores) {
            const scores = window.lastBBState.scores;
            const playersData = Object.entries(scores).map(([uid, score]) => ({
                user_id: parseInt(uid),
                score: score
            }));

            // Сортировка для рангов
            playersData.sort((a, b) => b.score - a.score);
            playersData.forEach((p, idx) => {
                p.rank = idx + 1;
            });

            await submitGameResults(playersData);
        }

        await apiRequest({ action: 'stop_game' });
        checkState();
    };

    window.bbStart = function () {
        const rounds = document.getElementById('bb-rounds').value;
        const categories = Array.from(document.querySelectorAll('.bb-checkbox:checked')).map(cb => cb.value);
        const selectedGames = Array.from(document.querySelectorAll('.bb-game-checkbox:checked')).map(cb => cb.value);
        
        // Если открыты расширенные настройки и выбраны игры - приоритет им
        const isDeepActive = !document.getElementById('bb-deep-settings').classList.contains('d-none');
        
        if (isDeepActive && selectedGames.length === 0) {
            return showAlert("Внимание", "Выберите хотя бы одну игру из списка!", 'warning');
        }
        if (!isDeepActive && categories.length === 0) {
            return showAlert("Внимание", "Выберите категорию!", 'warning');
        }

        sendGameAction('setup_game', { 
            rounds: rounds, 
            categories: JSON.stringify(categories),
            selected_games: JSON.stringify(isDeepActive ? selectedGames : [])
        });
    };

    window.bbResetTimer = function () {
        battleStartTime = performance.now();
    };

    window.bbSubmit = function (answer, correct, manualTime = null, manualSuccess = null) {
        const time = manualTime !== null ? manualTime : (performance.now() - battleStartTime);
        const isSuccess = manualSuccess !== null ? manualSuccess : (String(answer) === String(correct));

        // ЗАМОРОЗКА: Только при клике на ответ
        const wrapper = document.getElementById('bb-wrapper');
        if (wrapper) {
            wrapper.style.pointerEvents = 'none';
            wrapper.style.opacity = '0.6';
        }

        sendGameAction('submit_result', { time_ms: time, success: isSuccess });
    };

    window.bbNext = function () {
        // Делаем кнопку "Далее" визуально неактивной, чтобы не спамили
        const btn = event.target;
        if (btn) btn.disabled = true;
        sendGameAction('next_round');
    };

    window.confirmForceExit = function() {
        if(confirm("Принудительно завершить игру и выйти в настройки?")) {
            sendGameAction('force_reset');
        }
    };

    window.finishGameSession = async function () {
        await apiRequest({ action: 'stop_game' });
        checkState();
    };

    window.render_brainbattle = render_brainbattle;
}