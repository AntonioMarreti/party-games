// js/games/brainbattle.js
{
    let battleStartTime = 0;
    let countdownActive = false;
    let submittedRoundId = null;
    let reviewMode = false;
    let reviewDevMode = false;
    let finalActionsPortalState = null;

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
            clearBrainBattleFinalActions();

            if (state.phase === 'setup') {
                reviewMode = false;
                cleanupBrainBattleRound();
                renderSetup(wrapper, res.is_host);
            }
            else if (state.phase === 'playing') {
                reviewMode = false;
                wrapper.dataset.rendered = ''; // Сбрасываем флаг сетапа

                if (state.round_results && state.round_results[myId]) {
                    cleanupBrainBattleRound();
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
                cleanupBrainBattleRound();
                const overlay = document.getElementById('bb-overlay-layer');
                if (overlay) overlay.remove();
                if (reviewMode) renderReview(wrapper, state, res);
                else renderFinal(wrapper, state, res);
            }

        } catch (e) {
            console.error("BB Render Error:", e);
        }
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function formatTaskValue(value) {
        if (value === null || typeof value === 'undefined' || value === '') return '—';
        const stringValue = String(value);
        return stringValue.startsWith('bi-')
            ? `<i class="bi ${escapeHtml(stringValue)}"></i>`
            : escapeHtml(stringValue);
    }

    function formatRoundQuestion(round) {
        if (round.question) return escapeHtml(round.question);
        return escapeHtml(round.title || round.game_type || 'Раунд');
    }

    function formatScoreExplanation(round, entry) {
        if (!entry) {
            return `
                <span class="text-muted">Не ответил до конца раунда</span>
                <span class="fw-bold text-muted">= +0</span>
            `;
        }

        const breakdown = entry.score_breakdown || null;
        const reason = String(breakdown?.reason || '');

        if (!entry.correct) {
            if (reason === 'too_fast_rejected') {
                return `
                    <span class="text-danger">Ответ отклонен: слишком быстро для честного результата</span>
                    <span class="fw-bold text-danger">= +0</span>
                `;
            }

            return `
                <span class="text-danger">Ответ неверный, очки не начисляются</span>
                <span class="fw-bold text-danger">= +0</span>
            `;
        }

        const gameType = String(breakdown?.game_type || round.game_type || '');
        const scoreFactor = Math.max(1, Number(breakdown?.score_factor || round.score_factor || 0));
        const timeMs = Math.max(0, Math.min(60000, Number(breakdown?.time_ms ?? entry.time ?? 0)));
        const rawScore = Number.isFinite(Number(breakdown?.raw_score))
            ? Number(breakdown.raw_score)
            : (1000 - Math.floor(timeMs / scoreFactor));
        const finalScore = Number.isFinite(Number(breakdown?.final_score))
            ? Number(breakdown.final_score)
            : Math.max(100, rawScore);
        const roundedTime = Math.round(timeMs);
        const isBlindTimer = !!breakdown?.is_blind_timer || gameType === 'blind_timer';
        const timeLabel = isBlindTimer
            ? `погрешность ${roundedTime} мс`
            : `${roundedTime} мс`;
        const baseLine = isBlindTimer
            ? `Для секундомера считается точность, а не скорость`
            : `Чем быстрее верный ответ, тем меньше штраф по времени`;
        const minimumApplied = typeof breakdown?.minimum_applied === 'boolean'
            ? breakdown.minimum_applied
            : rawScore < 100;

        return `
            <span class="text-muted">${baseLine}</span>
            <span class="text-muted">
                1000 - floor(${timeLabel} / ${scoreFactor}) = ${rawScore}
            </span>
            ${minimumApplied ? '<span class="fw-bold text-warning">Сработал нижний лимит: минимум 100</span>' : ''}
            <span class="fw-bold text-success">= +${finalScore}</span>
        `;
    }

    function formatDevAuditDetails(round, entry) {
        if (!entry) {
            return '<span class="text-muted">status: no_answer</span>';
        }

        const breakdown = entry.score_breakdown || {};
        const gameType = String(breakdown.game_type || round.game_type || '');
        const factor = Number(breakdown.score_factor || round.score_factor || 0);
        const timeMs = Math.round(Number(breakdown.time_ms ?? entry.time ?? 0));
        const rawScore = Number(breakdown.raw_score ?? entry.score ?? 0);
        const finalScore = Number(breakdown.final_score ?? entry.score ?? 0);
        const reason = String(breakdown.reason || (entry.correct ? 'correct' : 'incorrect'));
        const minimumApplied = !!breakdown.minimum_applied;

        return `
            <span><b>status:</b> accepted</span>
            <span><b>reason:</b> ${escapeHtml(reason)}</span>
            <span><b>game:</b> ${escapeHtml(gameType)}</span>
            <span><b>time_ms:</b> ${timeMs}</span>
            <span><b>factor:</b> ${factor}</span>
            <span><b>raw_score:</b> ${rawScore}</span>
            <span><b>final_score:</b> ${finalScore}</span>
            <span><b>minimum_applied:</b> ${minimumApplied ? 'yes' : 'no'}</span>
        `;
    }

    function renderReview(wrapper, state, res) {
        clearBrainBattleFinalActions();
        const history = Array.isArray(state.round_history) ? [...state.round_history] : [];
        history.sort((a, b) => (a.round_number || 0) - (b.round_number || 0));

        let html = `
        <div class="bb-review-screen px-3 pt-4 pb-5">
            <div class="d-flex align-items-center justify-content-between mb-4">
                <button class="btn btn-light rounded-pill px-3 fw-bold shadow-sm" onclick="window.bbBackToResults()">
                    <i class="bi bi-arrow-left me-2"></i>Назад
                </button>
                <div class="d-flex align-items-center gap-2">
                    <button class="btn btn-sm rounded-pill px-3 fw-bold ${reviewDevMode ? 'btn-dark' : 'btn-outline-dark'}" onclick="window.bbToggleReviewDev()">
                        ${reviewDevMode ? 'Обычный' : 'Dev'}
                    </button>
                    <div class="small text-uppercase fw-bold text-muted" style="letter-spacing:1px;">Разбор матча</div>
                </div>
            </div>
        `;

        if (!history.length) {
            wrapper.innerHTML = `${html}
                <div class="bb-glass-card text-center py-5">
                    <div class="fw-bold mb-2">История раундов пока не сохранена</div>
                    <div class="text-muted small">Попробуй вернуться на экран результатов и открыть разбор снова.</div>
                </div>
            </div>`;
            return;
        }

        history.forEach(round => {
            const results = round.round_results || {};
            const scoreSnapshot = round.scores_after_round || {};
            const scoreFactor = Number(round.score_factor || 0);

            let rowsHtml = '';
            res.players.forEach(player => {
                const playerId = String(player.id);
                const entry = results[playerId];
                const scoreAfter = Number(scoreSnapshot[playerId] || 0);
                const roundScore = Number(entry?.score || 0);
                const answerHtml = entry ? formatTaskValue(entry.answer) : '<span class="text-muted">Не ответил</span>';
                const correctClass = entry ? (entry.correct ? 'text-success' : 'text-danger') : 'text-muted';
                const correctness = entry ? (entry.correct ? 'Верно' : 'Ошибка') : 'Нет ответа';
                const timeText = entry ? `${(Number(entry.time || 0) / 1000).toFixed(2)} с` : '—';
                const scoreExplanation = formatScoreExplanation(round, entry);
                const devAuditDetails = formatDevAuditDetails(round, entry);

                rowsHtml += `
                <div class="bb-audit-row">
                    <div class="d-flex align-items-center gap-2 mb-2">
                        ${window.renderAvatar ? window.renderAvatar(player, 'sm') : ''}
                        <div class="fw-bold">${escapeHtml(player.first_name)}</div>
                    </div>
                    <div class="small text-muted mb-1">Ответ</div>
                    <div class="fw-bold mb-2">${answerHtml}</div>
                    <div class="d-flex justify-content-between small mb-1">
                        <span class="${correctClass} fw-bold">${correctness}</span>
                        <span>${timeText}</span>
                    </div>
                    ${reviewDevMode ? `<div class="small mb-2 bb-audit-formula">${scoreExplanation}</div>` : ''}
                    <div class="d-flex justify-content-between small">
                        <span>За раунд: <b>+${roundScore}</b></span>
                        <span>Итого: <b>${scoreAfter}</b></span>
                    </div>
                    ${reviewDevMode ? `<div class="small mt-2 bb-audit-dev">${devAuditDetails}</div>` : ''}
                </div>`;
            });

            html += `
            <section class="bb-glass-card mb-4">
                <div class="d-flex justify-content-between align-items-start mb-3 gap-3">
                    <div>
                        <div class="small text-uppercase fw-bold text-muted mb-1">Раунд ${round.round_number}</div>
                        <h3 class="h5 fw-bold mb-1">${escapeHtml(round.title || round.game_type || 'Раунд')}</h3>
                        <div class="small text-muted">${formatRoundQuestion(round)}</div>
                    </div>
                    <div class="text-end">
                        <div class="small text-uppercase fw-bold text-muted">Правильный ответ</div>
                        <div class="fw-bold text-primary">${formatTaskValue(round.correct_val)}</div>
                    </div>
                </div>
                <div class="bb-audit-meta mb-3">
                    <span>Фактор очков: ${scoreFactor || '—'}</span>
                    ${reviewDevMode ? `<span>Формула: 1000 - time / ${scoreFactor || 'n'}</span>` : ''}
                </div>
                <div class="bb-audit-grid">
                    ${rowsHtml}
                </div>
            </section>`;
        });

        html += `</div>`;
        wrapper.innerHTML = html;
    }

    function clearBrainBattleFinalActions() {
        if (finalActionsPortalState?.sync) {
            window.removeEventListener('resize', finalActionsPortalState.sync);
            window.removeEventListener('scroll', finalActionsPortalState.sync, true);
        }

        const portal = document.getElementById('bb-final-actions-portal');
        if (portal) portal.remove();
        finalActionsPortalState = null;
    }

    function mountBrainBattleFinalActions(wrapper, contentHtml) {
        clearBrainBattleFinalActions();

        const target = document.querySelector('.screen.active-screen') || wrapper;
        if (!target) return;

        const portal = document.createElement('div');
        portal.id = 'bb-final-actions-portal';
        portal.className = 'bb-final-actions-portal';
        portal.innerHTML = contentHtml;
        document.body.appendChild(portal);

        const sync = () => {
            if (!document.body.contains(portal)) return;
            const rect = target.getBoundingClientRect();
            portal.style.left = `${Math.round(rect.left)}px`;
            portal.style.width = `${Math.round(rect.width)}px`;
            portal.style.bottom = `${Math.max(Math.round(window.innerHeight - rect.bottom), 0)}px`;
        };

        finalActionsPortalState = { portal, sync };
        window.addEventListener('resize', sync);
        window.addEventListener('scroll', sync, true);
        sync();
    }

    function cleanupBrainBattleRound() {
        countdownActive = false;
        clearBrainBattleFinalActions();
        if (window.bbCountdownInterval) {
            clearInterval(window.bbCountdownInterval);
            window.bbCountdownInterval = null;
        }
        if (window.bbReactionTimeout) {
            clearTimeout(window.bbReactionTimeout);
            window.bbReactionTimeout = null;
        }
        if (window.bbBlindInterval) {
            clearInterval(window.bbBlindInterval);
            window.bbBlindInterval = null;
        }
        if (window.simonUserClickTimeout) {
            clearTimeout(window.simonUserClickTimeout);
            window.simonUserClickTimeout = null;
        }
        const overlay = document.getElementById('bb-overlay-layer');
        if (overlay) overlay.remove();
    }

    // === ОТСЧЕТ И ЗАПУСК ===
    function runGameSequence(wrapper, task) {
        const taskStr = JSON.stringify(task);
        if (wrapper.dataset.taskId === taskStr) return;
        if (countdownActive) return;

        cleanupBrainBattleRound();
        wrapper.dataset.taskId = taskStr;
        countdownActive = true;
        submittedRoundId = null;

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
        window.bbCountdownInterval = setInterval(() => {
            count--;
            const numEl = document.getElementById('cnt-number');
            if (count > 0 && numEl) {
                numEl.innerText = count;
                window.audioManager.play('click'); // Tick sound
            } else {
                clearInterval(window.bbCountdownInterval);
                window.bbCountdownInterval = null;
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
        const waitingPlayers = [];
        res.players.forEach(p => {
            if (!state.round_results[String(p.id)]) {
                waitingPlayers.push(p);
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
            const hasWaitingHumans = waitingPlayers.some(p => Number(p.is_bot) !== 1);
            btnHtml = `<button class="bb-start-btn w-100 py-3" ${hasWaitingHumans ? 'disabled style="opacity:0.55; box-shadow:none;"' : ''} onclick="bbNext()">${hasWaitingHumans ? "Ждем игроков..." : (isLastRound ? "🏁 Результаты" : "Следующий раунд")}</button>`;
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

        const finalEntries = res.players.map(p => [String(p.id), Number((state.scores || {})[String(p.id)] || 0)]);
        finalEntries.sort((a, b) => b[1] - a[1]);
        const sorted = finalEntries;
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

        html += `</div><div class="bb-final-spacer"></div></div>`;

        let footerHtml = '';
        if (res.is_host) {
            footerHtml = `<div class="fixed-bottom-actions bb-final-actions">
                <button class="bb-start-btn bb-secondary-btn" onclick="window.bbOpenReview()"><i class="bi bi-journal-text me-2"></i>Фактчекинг</button>
                <button class="bb-start-btn" style="background: var(--bg-secondary); color: var(--text-main); box-shadow: none; border: 1px solid var(--border-main);" onclick="bbFinish()"><i class="bi bi-arrow-return-left me-2"></i>Вернуться в Лобби</button>
            </div>`;
        } else {
            footerHtml = `<div class="fixed-bottom-actions bb-final-actions text-center">
                <button class="bb-start-btn bb-secondary-btn" onclick="window.bbOpenReview()"><i class="bi bi-journal-text me-2"></i>Фактчекинг</button>
                <button class="btn btn-link fw-bold text-decoration-none" style="color:var(--text-muted);" onclick="leaveRoom()">Покинуть комнату</button>
            </div>`;
        }

        wrapper.innerHTML = html;
        mountBrainBattleFinalActions(wrapper, footerHtml);
    }

    window.bbFinish = async function () {
        // 1. Собираем результаты для рейтинга
        if (window.lastBBState) {
            const scores = window.lastBBState.scores || {};
            const playersData = (window.currentGamePlayers || []).map(player => ({
                user_id: parseInt(player.id),
                score: Number(scores[String(player.id)] || 0)
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

    window.bbOpenReview = function () {
        reviewMode = true;
        reviewDevMode = false;
        if (window.checkState) window.checkState();
    };

    window.bbBackToResults = function () {
        reviewMode = false;
        reviewDevMode = false;
        if (window.checkState) window.checkState();
    };

    window.bbToggleReviewDev = function () {
        reviewDevMode = !reviewDevMode;
        if (window.checkState) window.checkState();
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
        const roundId = window.lastBBState?.round_id || '';
        if (submittedRoundId === roundId) return;
        submittedRoundId = roundId;

        const time = manualTime !== null ? manualTime : (performance.now() - battleStartTime);
        const isSuccess = manualSuccess !== null ? manualSuccess : (String(answer) === String(correct));

        // ЗАМОРОЗКА: Только при клике на ответ
        const wrapper = document.getElementById('bb-wrapper');
        if (wrapper) {
            wrapper.style.pointerEvents = 'none';
            wrapper.style.opacity = '0.6';
        }

        cleanupBrainBattleRound();
        sendGameAction('submit_result', { round_id: roundId, time_ms: time, success: isSuccess, answer: answer });
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
