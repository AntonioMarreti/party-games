// js/games/brainbattle.js
{
    let battleStartTime = 0;
    let finalActionsPortalState = null;
    let brainBattleSummaryText = '';
    let brainBattleSummaryPending = null;
    let brainBattleSummaryKey = '';
    let brainBattleDelegatedClicksBound = false;
    let activeRoundSessionId = 0;
    let activeRoundId = '';
    const BRAINBATTLE_SUMMARY_VERSION = 2;
    const brainBattleTimeouts = new Set();
    const brainBattleIntervals = new Set();
    const brainBattleAnimationFrames = new Set();
    const brainBattleViewState = {
        currentView: '',
        currentViewSignature: '',
        currentRoundId: '',
        currentRoundNumber: 0,
        countdownActive: false,
        submittedRoundId: '',
        reviewMode: false,
        reviewDevMode: false
    };
    const brainBattleRoundState = {
        blindClick: null,
        checkSafe: null,
        defuseNumber: null,
        simonClick: null,
        secretClear: null,
        secretDigit: null,
        thimblesCupClick: null
    };
    const brainBattleController = {
        backToResults,
        confirmForceExit,
        finish: finishBrainBattle,
        nextRound,
        openReview,
        resetTimer: resetBattleTimer,
        startBattle,
        submitAnswer,
        toggleReviewDev
    };

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
            if (bbShouldIgnoreServerState(state)) return;
            const myId = String(res.user.id);

            let wrapper = document.getElementById('bb-wrapper');
            if (!wrapper) {
                container.innerHTML = '';
                wrapper = document.createElement('div');
                wrapper.id = 'bb-wrapper';
                wrapper.className = 'game-custom-wrapper px-3';
                wrapper.addEventListener('click', (event) => {
                    const target = event.target.closest('button');
                    if (!target || target.disabled) return;
                    bbHaptic('selection', 'light');
                });
                wrapper.addEventListener('input', (event) => {
                    if (event.target?.id === 'bb-rounds') {
                        bbUpdateSetupSummary();
                    }
                });
                wrapper.addEventListener('change', (event) => {
                    const target = event.target;
                    if (!target?.classList) return;
                    if (target.classList.contains('bb-checkbox') || target.classList.contains('bb-game-checkbox')) {
                        bbUpdateSetupSummary();
                    }
                });
                if (!brainBattleDelegatedClicksBound) {
                    document.addEventListener('click', handleBrainBattleDelegatedClick);
                    brainBattleDelegatedClicksBound = true;
                }
                container.appendChild(wrapper);
            }

            // --- ТОЧКА РАЗМОРОЗКИ 1: Каждый тик рендера (по умолчанию всё доступно) ---
            wrapper.style.pointerEvents = 'auto';
            wrapper.style.opacity = '1';

            if (state.phase === 'setup') {
                brainBattleViewState.reviewMode = false;
                brainBattleViewState.reviewDevMode = false;
                bbResetViewRound();
                const setupSignature = res.is_host ? 'host' : 'guest';
                if (bbShouldRenderView(wrapper, 'setup', setupSignature)) {
                    cleanupBrainBattleRound();
                    renderSetup(wrapper, res.is_host);
                    bbMarkRenderedView(wrapper, 'setup', setupSignature);
                } else {
                    updateSetupView(wrapper, res.is_host);
                }
            }
            else if (state.phase === 'playing') {
                brainBattleViewState.reviewMode = false;
                wrapper.classList.remove('bb-setup-mode');
                wrapper.dataset.rendered = ''; // Сбрасываем флаг сетапа
                bbSyncViewRound(state);

                if (state.round_results && state.round_results[myId]) {
                    const waitingSignature = getBrainBattleWaitingViewSignature(state, res, myId);
                    if (bbShouldRenderView(wrapper, 'waiting', waitingSignature)) {
                        if (wrapper.dataset.bbViewType === 'waiting') {
                            updateWaitingView(wrapper, state, res);
                        } else {
                            cleanupBrainBattleRound();
                            const overlay = document.getElementById('bb-overlay-layer');
                            if (overlay) overlay.remove();
                            renderWaiting(wrapper, state, res);
                        }
                        bbMarkRenderedView(wrapper, 'waiting', waitingSignature);
                    }
                } else {
                    const roundSignature = String(state.round_id || JSON.stringify(state.round_data || {}));
                    if (bbShouldRenderView(wrapper, 'round', roundSignature)) {
                        runGameSequence(wrapper, state.round_data, state, res);
                        bbMarkRenderedView(wrapper, 'round', roundSignature);
                    }
                }
            }
            else if (state.phase === 'game_over') {
                wrapper.classList.remove('bb-setup-mode');
                bbResetViewRound();
                const viewType = brainBattleViewState.reviewMode ? 'review' : 'final';
                const viewSignature = brainBattleViewState.reviewMode
                    ? getBrainBattleReviewViewSignature(state)
                    : getBrainBattleFinalViewSignature(state, res);
                if (bbShouldRenderView(wrapper, viewType, viewSignature)) {
                    if (!brainBattleViewState.reviewMode && wrapper.dataset.bbViewType === 'final') {
                        updateFinalView(wrapper, state, res);
                    } else if (brainBattleViewState.reviewMode && wrapper.dataset.bbViewType === 'review') {
                        updateReviewView(wrapper, state, res);
                    } else {
                        cleanupBrainBattleRound();
                        const overlay = document.getElementById('bb-overlay-layer');
                        if (overlay) overlay.remove();
                        if (brainBattleViewState.reviewMode) renderReview(wrapper, state, res);
                        else renderFinal(wrapper, state, res);
                    }
                    bbMarkRenderedView(wrapper, viewType, viewSignature);
                }
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

    function syncActiveRoundGlobals() {
        window.bbActiveRoundSessionId = activeRoundSessionId;
        window.bbActiveRoundId = activeRoundId;
    }

    function invalidateRoundSession() {
        activeRoundSessionId += 1;
        activeRoundId = '';
        syncActiveRoundGlobals();
    }

    function beginRoundSession(roundId) {
        activeRoundSessionId += 1;
        activeRoundId = String(roundId || '');
        syncActiveRoundGlobals();
        return activeRoundSessionId;
    }

    function bbIsRoundActive(roundId = null, sessionId = null) {
        if (sessionId !== null && sessionId !== activeRoundSessionId) return false;
        if (roundId !== null && String(roundId || '') !== activeRoundId) return false;
        return true;
    }

    function bbSetTimeout(callback, delay) {
        let handle = null;
        handle = window.setTimeout(() => {
            brainBattleTimeouts.delete(handle);
            callback();
        }, delay);
        brainBattleTimeouts.add(handle);
        return handle;
    }

    function bbClearTimeout(handle) {
        if (!handle) return;
        brainBattleTimeouts.delete(handle);
        clearTimeout(handle);
    }

    function bbSetInterval(callback, delay) {
        const handle = window.setInterval(callback, delay);
        brainBattleIntervals.add(handle);
        return handle;
    }

    function bbClearInterval(handle) {
        if (!handle) return;
        brainBattleIntervals.delete(handle);
        clearInterval(handle);
    }

    function bbRequestAnimationFrame(callback) {
        let handle = null;
        handle = window.requestAnimationFrame((timestamp) => {
            brainBattleAnimationFrames.delete(handle);
            callback(timestamp);
        });
        brainBattleAnimationFrames.add(handle);
        return handle;
    }

    function bbCancelAnimationFrame(handle) {
        if (!handle) return;
        brainBattleAnimationFrames.delete(handle);
        cancelAnimationFrame(handle);
    }

    function formatTaskValue(value) {
        if (value === null || typeof value === 'undefined' || value === '') return '—';
        const stringValue = String(value);
        return stringValue.startsWith('bi-')
            ? `<i class="bi ${escapeHtml(stringValue)}"></i>`
            : escapeHtml(stringValue);
    }

    function bbEncodeActionValue(value) {
        return escapeHtml(encodeURIComponent(String(value ?? '')));
    }

    function bbDecodeActionValue(value) {
        if (typeof value !== 'string') return '';
        try {
            return decodeURIComponent(value);
        } catch (_) {
            return value;
        }
    }

    function bbBuildSubmitActionAttrs(answer, correct) {
        return `data-bb-submit="1" data-bb-answer="${bbEncodeActionValue(answer)}" data-bb-correct="${bbEncodeActionValue(correct)}"`;
    }

    function resetBrainBattleRoundState() {
        brainBattleRoundState.blindClick = null;
        brainBattleRoundState.checkSafe = null;
        brainBattleRoundState.defuseNumber = null;
        brainBattleRoundState.simonClick = null;
        brainBattleRoundState.secretClear = null;
        brainBattleRoundState.secretDigit = null;
        brainBattleRoundState.thimblesCupClick = null;
    }

    function getBrainBattleResultsSignature(results) {
        const entries = Object.entries(results || {}).map(([userId, data]) => [
            String(userId),
            Number(data?.score || 0),
            !!data?.correct,
            Math.round(Number(data?.time || 0)),
            !!data?.has_streak
        ]);
        entries.sort((a, b) => a[0].localeCompare(b[0]));
        return JSON.stringify(entries);
    }

    function getBrainBattleScoresSignature(scores) {
        const entries = Object.entries(scores || {}).map(([userId, score]) => [
            String(userId),
            Number(score || 0)
        ]);
        entries.sort((a, b) => a[0].localeCompare(b[0]));
        return JSON.stringify(entries);
    }

    function getBrainBattleWaitingViewSignature(state, res, myId) {
        return [
            String(state.round_id || ''),
            state.current_round || 0,
            state.total_rounds || 0,
            String(res.is_host ? 1 : 0),
            String(res.players?.length || 0),
            getBrainBattleResultsSignature(state.round_results || {}),
            JSON.stringify(state.round_results?.[myId] || {})
        ].join('|');
    }

    function getBrainBattleFinalViewSignature(state, res) {
        return [
            String(res.user?.id || ''),
            String(res.is_host ? 1 : 0),
            state.total_rounds || 0,
            getBrainBattleScoresSignature(state.scores || {}),
            Array.isArray(state.round_history) ? state.round_history.length : 0,
            Number(state.ai_summary_version || 0),
            String(state.ai_summary || '')
        ].join('|');
    }

    function getBrainBattleReviewViewSignature(state) {
        const history = Array.isArray(state.round_history) ? state.round_history : [];
        return [
            String(brainBattleViewState.reviewDevMode ? 1 : 0),
            history.length,
            history.map((round) => `${round.round_number || 0}:${round.round_id || ''}:${getBrainBattleResultsSignature(round.round_results || {})}`).join(';')
        ].join('|');
    }

    function bbShouldRenderView(wrapper, type, signature) {
        return brainBattleViewState.currentView !== type || brainBattleViewState.currentViewSignature !== signature;
    }

    function bbMarkRenderedView(wrapper, type, signature) {
        brainBattleViewState.currentView = type;
        brainBattleViewState.currentViewSignature = signature;
        wrapper.dataset.bbViewType = type;
        wrapper.dataset.bbViewSignature = signature;
    }

    function bbSyncViewRound(state) {
        brainBattleViewState.currentRoundId = String(state?.round_id || '');
        brainBattleViewState.currentRoundNumber = Number(state?.current_round || 0);
    }

    function bbResetViewRound() {
        brainBattleViewState.currentRoundId = '';
        brainBattleViewState.currentRoundNumber = 0;
    }

    function bbShouldIgnoreServerState(state) {
        if (!state || !brainBattleViewState.currentView) return false;
        const incomingRoundNumber = Number(state.current_round || 0);
        const currentRoundNumber = Number(brainBattleViewState.currentRoundNumber || 0);
        const incomingPhase = String(state.phase || '');
        const incomingRoundId = String(state.round_id || '');
        const currentRoundId = String(brainBattleViewState.currentRoundId || '');
        const currentView = brainBattleViewState.currentView;

        if ((currentView === 'final' || currentView === 'review') && incomingPhase === 'playing') {
            return true;
        }

        if ((currentView === 'waiting' || currentView === 'round') && incomingPhase === 'playing') {
            if (currentRoundNumber > 0 && incomingRoundNumber > 0 && incomingRoundNumber < currentRoundNumber) {
                return true;
            }
            if (
                currentRoundNumber > 0 &&
                incomingRoundNumber === currentRoundNumber &&
                currentRoundId &&
                incomingRoundId &&
                incomingRoundId !== currentRoundId
            ) {
                return true;
            }
        }

        return false;
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

    function getBrainBattleSummaryStateKey(state) {
        return [
            state.current_round || 0,
            state.total_rounds || 0,
            JSON.stringify(state.scores || {}),
            Number(state.ai_summary_version || 0)
        ].join('|');
    }

    function hasFreshBrainBattleSummary(state) {
        return Boolean(state?.ai_summary) && Number(state.ai_summary_version || 0) >= BRAINBATTLE_SUMMARY_VERSION;
    }

    function bbBuildFinalLeaderboard(state, players) {
        return players
            .map(player => ({
                player,
                userId: String(player.id),
                score: Number((state.scores || {})[String(player.id)] || 0)
            }))
            .sort((a, b) => b.score - a.score);
    }

    function bbBuildPlayerMatchStats(state, players, myUserId) {
        const history = Array.isArray(state.round_history) ? state.round_history : [];
        const stats = {};

        players.forEach((player) => {
            stats[String(player.id)] = {
                correct: 0,
                answered: 0,
                fastest: null,
                firstPlaces: 0,
                bestRoundScore: 0
            };
        });

        history.forEach((round) => {
            const results = round.round_results || {};
            const entries = Object.entries(results).map(([userId, data]) => ({
                userId: String(userId),
                score: Number(data.score || 0),
                correct: !!data.correct,
                time: Number(data.time || 0)
            }));

            entries.forEach((entry) => {
                const playerStats = stats[entry.userId];
                if (!playerStats) return;
                playerStats.answered += 1;
                playerStats.bestRoundScore = Math.max(playerStats.bestRoundScore, entry.score);
                if (entry.correct) {
                    playerStats.correct += 1;
                    if (playerStats.fastest === null || entry.time < playerStats.fastest) {
                        playerStats.fastest = entry.time;
                    }
                }
            });

            if (!entries.length) return;
            const topScore = Math.max(...entries.map((entry) => entry.score));
            entries.forEach((entry) => {
                if (entry.score === topScore && stats[entry.userId]) {
                    stats[entry.userId].firstPlaces += 1;
                }
            });
        });

        const myStats = stats[String(myUserId)] || { correct: 0, answered: 0, fastest: null, firstPlaces: 0, bestRoundScore: 0 };
        const accuracy = myStats.answered > 0 ? Math.round((myStats.correct / myStats.answered) * 100) : 0;

        let fastestGlobal = null;
        let mostWins = null;
        players.forEach((player) => {
            const userId = String(player.id);
            const playerStats = stats[userId];
            if (!playerStats) return;

            if (playerStats.fastest !== null && (fastestGlobal === null || playerStats.fastest < fastestGlobal.time)) {
                fastestGlobal = { name: player.first_name, time: playerStats.fastest };
            }
            if (mostWins === null || playerStats.firstPlaces > mostWins.count) {
                mostWins = { name: player.first_name, count: playerStats.firstPlaces };
            }
        });

        return {
            my: {
                accuracy,
                firstPlaces: myStats.firstPlaces,
                fastest: myStats.fastest,
                bestRoundScore: myStats.bestRoundScore
            },
            global: {
                fastest: fastestGlobal,
                mostWins
            }
        };
    }

    function bbGetCategoryLabelByGameType(gameType) {
        const categories = {
            logic: ['math_blitz', 'greater_less'],
            attention: ['color_chaos', 'odd_one_out', 'count_objects', 'find_duplicate', 'thimbles'],
            motor: ['reaction_test', 'timing_safe', 'defuse_numbers'],
            memory: ['photo_memory', 'blind_timer', 'simon_says'],
            erudition: ['edible_inedible', 'alchemy', 'ai_quiz', 'fact_check']
        };
        const labels = {
            logic: 'Логика',
            attention: 'Внимание',
            motor: 'Реакция',
            memory: 'Память',
            erudition: 'Эрудиция'
        };

        for (const [category, games] of Object.entries(categories)) {
            if (games.includes(String(gameType))) {
                return labels[category] || category;
            }
        }

        return 'Раунд';
    }

    function bbGetSetupCategoryMeta() {
        return {
            attention: {
                label: 'Внимание',
                icon: 'bi-grid-3x3-gap-fill',
                iconStyle: 'color: var(--status-info) !important;'
            },
            logic: {
                label: 'Логика',
                icon: 'bi-puzzle-fill',
                iconStyle: 'color: var(--status-warning) !important;'
            },
            erudition: {
                label: 'Эрудиция',
                icon: 'bi-globe',
                iconStyle: 'color: var(--status-info) !important;'
            },
            motor: {
                label: 'Реакция',
                icon: 'bi-lightning-fill',
                iconStyle: 'color: var(--status-error) !important;'
            },
            memory: {
                label: 'Память',
                icon: 'bi-stopwatch-fill',
                iconStyle: 'color: var(--status-success) !important;'
            }
        };
    }

    function bbGetSetupGameNames() {
        return {
            math_blitz: 'Математика',
            greater_less: 'Больше-Меньше',
            color_chaos: 'Цветовой хаос',
            odd_one_out: 'Найди лишнее',
            count_objects: 'Счет объектов',
            find_duplicate: 'Найди пару',
            thimbles: 'Наперстки',
            reaction_test: 'Реакция',
            timing_safe: 'Сейф',
            defuse_numbers: 'Разминирование',
            photo_memory: 'Фотопамять',
            blind_timer: 'Секундомер',
            simon_says: 'Саймон говорит',
            edible_inedible: 'Съедобное',
            alchemy: 'Алхимия',
            ai_quiz: 'AI Викторина',
            fact_check: 'Правда/Ложь'
        };
    }

    function bbGetSetupPresets() {
        return {
            quick: {
                label: 'Быстрая',
                rounds: 5,
                categories: ['attention', 'logic', 'motor'],
                selectedGames: []
            },
            balanced: {
                label: 'Сбалансированная',
                rounds: 10,
                categories: ['attention', 'logic', 'erudition', 'motor', 'memory'],
                selectedGames: []
            },
            reaction: {
                label: 'На реакцию',
                rounds: 7,
                categories: ['motor', 'attention'],
                selectedGames: ['reaction_test', 'timing_safe', 'defuse_numbers', 'color_chaos', 'count_objects']
            },
            memory: {
                label: 'Только память',
                rounds: 7,
                categories: ['memory'],
                selectedGames: ['photo_memory', 'blind_timer', 'simon_says']
            }
        };
    }

    function bbCountLibraryGames(library, categories) {
        return categories.reduce((sum, category) => sum + ((library && library[category]) ? library[category].length : 0), 0);
    }

    function bbEnsureLibrarySync() {
        if (!window.BB_LIBRARY) {
            window.BB_LIBRARY = {
                logic: ['math_blitz', 'greater_less'],
                attention: ['color_chaos', 'odd_one_out', 'count_objects', 'find_duplicate', 'thimbles'],
                motor: ['reaction_test', 'timing_safe', 'defuse_numbers'],
                memory: ['photo_memory', 'blind_timer', 'simon_says'],
                erudition: ['edible_inedible', 'alchemy', 'ai_quiz', 'fact_check']
            };
        }
        return window.BB_LIBRARY;
    }

    function renderDeepSettings() {
        const deep = document.getElementById('bb-deep-settings');
        const library = bbEnsureLibrarySync();
        if (!deep || !library) return;

        const gameNames = bbGetSetupGameNames();
        const categoryNames = Object.fromEntries(Object.entries(bbGetSetupCategoryMeta()).map(([key, value]) => [key, value.label]));

        let html = '';
        for (const [cat, games] of Object.entries(library)) {
            html += `<div class="d-flex justify-content-between align-items-center mt-2 mb-1">
                <div class="small fw-bold text-muted text-uppercase" style="font-size:0.65rem; letter-spacing:1px;">${categoryNames[cat] || cat}</div>
                <div class="small text-muted fw-bold">${games.length} игр</div>
            </div>`;
            games.forEach((game) => {
                html += `
                <label class="bb-category-item py-1">
                    <input type="checkbox" class="bb-game-checkbox" value="${game}">
                    <span class="fw-bold text-body small ms-2">${gameNames[game] || game}</span>
                </label>`;
            });
        }
        deep.innerHTML = html;
    }

    function bbUpdateSetupSummary() {
        const roundsInput = document.getElementById('bb-rounds');
        const summaryLine = document.getElementById('bb-setup-summary-line');

        const selectedCategories = Array.from(document.querySelectorAll('.bb-checkbox:checked')).map(cb => cb.value);
        const selectedGames = Array.from(document.querySelectorAll('.bb-game-checkbox:checked')).map(cb => cb.value);
        const deepVisible = !document.getElementById('bb-deep-settings')?.classList.contains('d-none');
        const library = bbEnsureLibrarySync();
        const rounds = Number(roundsInput?.value || 0);
        const gamesCount = deepVisible ? selectedGames.length : bbCountLibraryGames(library, selectedCategories);

        if (summaryLine) {
            summaryLine.textContent = `${rounds} раундов • ${selectedCategories.length} категорий • ${gamesCount} мини-игр`;
        }
    }

    function bbApplySetupPreset(presetKey) {
        const preset = bbGetSetupPresets()[presetKey];
        if (!preset) return;

        const roundsInput = document.getElementById('bb-rounds');
        if (roundsInput) {
            roundsInput.value = preset.rounds;
        }
        document.querySelectorAll('.bb-round-btn').forEach(btn => {
            btn.classList.toggle('active', Number(btn.dataset.rounds || 0) === preset.rounds);
        });

        const categoriesSet = new Set(preset.categories);
        document.querySelectorAll('.bb-checkbox').forEach(cb => {
            cb.checked = categoriesSet.has(cb.value);
        });

        const selectedGamesSet = new Set(preset.selectedGames || []);
        document.querySelectorAll('.bb-game-checkbox').forEach(cb => {
            cb.checked = selectedGamesSet.has(cb.value);
        });

        bbUpdateSetupSummary();
    }

    function bbSelectRounds(val, btn) {
        document.getElementById('bb-rounds').value = val;
        document.querySelectorAll('.bb-round-btn').forEach((button) => {
            const matchesRound = Number(button.dataset.rounds || 0) === Number(val);
            button.classList.toggle('active', matchesRound && button.hasAttribute('data-bb-rounds'));
        });
        if (btn) btn.classList.add('active');
        bbUpdateSetupSummary();
    }

    async function bbToggleDeepSettings(button) {
        const list = document.getElementById('bb-categories-list');
        const deep = document.getElementById('bb-deep-settings');
        const btn = button;
        if (!list || !deep || !btn) return;

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
    }

    async function handleBrainBattleDelegatedClick(event) {
        const target = event.target.closest('[data-bb-submit], [data-bb-action], [data-bb-rounds], [data-bb-preset]');
        if (!target || target.disabled) return;

        if (target.hasAttribute('data-bb-submit')) {
            const answer = bbDecodeActionValue(target.dataset.bbAnswer || '');
            const correct = bbDecodeActionValue(target.dataset.bbCorrect || '');
            brainBattleController.submitAnswer(answer, correct);
            return;
        }

        if (target.hasAttribute('data-bb-rounds')) {
            bbSelectRounds(Number(target.dataset.bbRounds || 0), target);
            return;
        }

        if (target.hasAttribute('data-bb-preset')) {
            bbApplySetupPreset(target.dataset.bbPreset || '');
            return;
        }

        const action = target.dataset.bbAction || '';
        switch (action) {
            case 'toggle-deep-settings':
                await bbToggleDeepSettings(target);
                return;
            case 'back-to-lobby':
                if (typeof window.backToLobby === 'function') window.backToLobby();
                return;
            case 'start-battle':
                brainBattleController.startBattle();
                return;
            case 'next-round':
                brainBattleController.nextRound(target);
                return;
            case 'back-results':
                brainBattleController.backToResults();
                return;
            case 'toggle-review-dev':
                brainBattleController.toggleReviewDev();
                return;
            case 'open-review':
                brainBattleController.openReview();
                return;
            case 'finish':
                brainBattleController.finish();
                return;
            case 'leave-room':
                if (typeof window.leaveRoom === 'function') window.leaveRoom();
                return;
            case 'force-exit':
                brainBattleController.confirmForceExit();
                return;
            case 'streak-info':
                alert('🔥 Режим огня!\n\nЭтот игрок был первым 3 раза подряд, поэтому все его очки сейчас умножаются на 1.5x!');
                return;
            case 'blind-click':
                if (typeof brainBattleRoundState.blindClick === 'function') brainBattleRoundState.blindClick();
                return;
            case 'check-safe':
                if (typeof brainBattleRoundState.checkSafe === 'function') brainBattleRoundState.checkSafe();
                return;
            case 'defuse-number':
                if (typeof brainBattleRoundState.defuseNumber === 'function') {
                    brainBattleRoundState.defuseNumber(Number(target.dataset.bbValue || 0));
                }
                return;
            case 'simon-click':
                if (typeof brainBattleRoundState.simonClick === 'function') {
                    const correct = bbDecodeActionValue(target.dataset.bbCorrect || '');
                    brainBattleRoundState.simonClick(target.dataset.bbColor || '', correct);
                }
                return;
            case 'secret-clear':
                if (typeof brainBattleRoundState.secretClear === 'function') brainBattleRoundState.secretClear();
                return;
            case 'secret-digit':
                if (typeof brainBattleRoundState.secretDigit === 'function') {
                    const correct = bbDecodeActionValue(target.dataset.bbCorrect || '');
                    brainBattleRoundState.secretDigit(target, String(target.dataset.bbValue || ''), correct);
                }
                return;
            default:
                return;
        }
    }

    function renderBrainBattleRoundHeader(wrapper, state, res, task) {
        if (!wrapper || !state || !res || !task) return;

        const existing = document.getElementById('bb-round-context');
        if (existing) existing.remove();

        const leaderboard = bbBuildFinalLeaderboard(state, res.players || []);
        const myId = String(res.user?.id || '');
        const myIndex = leaderboard.findIndex((entry) => entry.userId === myId);
        const myRank = myIndex >= 0 ? myIndex + 1 : null;
        const myScore = myIndex >= 0 ? leaderboard[myIndex].score : 0;

        const header = document.createElement('div');
        header.id = 'bb-round-context';
        header.className = 'bb-round-context animate__animated animate__fadeInDown';
        header.innerHTML = `
            <div class="bb-round-context__row">
                <div class="bb-round-context__badge">Раунд ${state.current_round}/${state.total_rounds}</div>
                <div class="bb-round-context__meta">${escapeHtml(bbGetCategoryLabelByGameType(task.type || state.previous_game_type))}</div>
            </div>
            <div class="bb-round-context__title">${escapeHtml(task.title || 'Раунд')}</div>
            <div class="bb-round-context__row">
                <div class="bb-round-context__meta">${myRank ? `Вы #${myRank}` : 'Матч идет'}</div>
                <div class="bb-round-context__meta">${myScore} очков</div>
            </div>
        `;

        wrapper.classList.add('bb-with-round-context');
        wrapper.appendChild(header);
    }

    async function fetchBrainBattleSummary(state) {
        const container = document.getElementById('bb-ai-summary');
        if (!container) return;

        const summaryKey = getBrainBattleSummaryStateKey(state);
        if (brainBattleSummaryKey !== summaryKey) {
            brainBattleSummaryText = '';
            brainBattleSummaryPending = null;
            brainBattleSummaryKey = summaryKey;
        }

        const cachedSummary = hasFreshBrainBattleSummary(state) ? state.ai_summary : brainBattleSummaryText;
        if (cachedSummary) {
            brainBattleSummaryText = trimBrainBattleSummaryText(cachedSummary);
            container.innerHTML = `<p class="mb-0">${escapeHtml(brainBattleSummaryText)}</p>`;
            container.dataset.state = 'ready';
            return;
        }

        if (brainBattleSummaryPending || !window.AIManager) {
            return;
        }

        container.dataset.state = 'loading';

        try {
            brainBattleSummaryPending = window.AIManager.generate('brainbattle_summary');
            const response = await brainBattleSummaryPending;

            if (!response || response.status === 'pending') {
                setTimeout(() => {
                    const latestState = window.lastBBState;
                    if (latestState && latestState.phase === 'game_over') {
                        fetchBrainBattleSummary(latestState);
                    }
                }, 2000);
                return;
            }

            if (response.status === 'ok' && response.data) {
                const rawSummary = typeof response.data === 'string'
                    ? response.data
                    : (response.data.text || JSON.stringify(response.data));
                brainBattleSummaryText = trimBrainBattleSummaryText(rawSummary);
                container.innerHTML = `<p class="mb-0">${escapeHtml(brainBattleSummaryText)}</p>`;
                container.dataset.state = 'ready';
                return;
            }

            container.innerHTML = `<p class="mb-0 text-muted">Разбор матча пока недоступен.</p>`;
            container.dataset.state = 'error';
        } catch (error) {
            console.error('BrainBattle summary error:', error);
            container.innerHTML = `<p class="mb-0 text-muted">Разбор матча пока недоступен.</p>`;
            container.dataset.state = 'error';
        } finally {
            brainBattleSummaryPending = null;
        }
    }

    function trimBrainBattleSummaryText(value) {
        const text = String(value || '').replace(/\s+/g, ' ').trim();
        if (text.length <= 260) return text;
        return text.slice(0, 257).trimEnd() + '...';
    }

    function getBrainBattleRoundNoun(count) {
        const value = Math.abs(Number(count || 0));
        const lastTwo = value % 100;
        const last = value % 10;
        if (last === 1 && lastTwo !== 11) return 'раунд';
        if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return 'раунда';
        return 'раундов';
    }

    function buildBrainBattleReviewViewModel(state, res) {
        const history = Array.isArray(state.round_history) ? [...state.round_history] : [];
        history.sort((a, b) => (a.round_number || 0) - (b.round_number || 0));
        return {
            history,
            players: Array.isArray(res.players) ? res.players : [],
            reviewDevMode: !!brainBattleViewState.reviewDevMode
        };
    }

    function getBrainBattleReviewContentSignature(viewModel) {
        return [
            String(viewModel.reviewDevMode ? 1 : 0),
            viewModel.history.length,
            viewModel.history.map((round) => [
                round.round_number || 0,
                round.round_id || '',
                round.correct_val ?? '',
                round.score_factor || 0,
                getBrainBattleResultsSignature(round.round_results || {}),
                JSON.stringify(round.scores_after_round || {})
            ].join(':')).join('|')
        ].join('|');
    }

    function buildBrainBattleReviewRoundCardHtml(round, players, reviewDevMode) {
        const results = round.round_results || {};
        const scoreSnapshot = round.scores_after_round || {};
        const scoreFactor = Number(round.score_factor || 0);

        let rowsHtml = '';
        players.forEach((player) => {
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

        return `
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
    }

    function buildBrainBattleReviewBodyHtml(viewModel) {
        if (!viewModel.history.length) {
            return `
                <div class="bb-glass-card text-center py-5">
                    <div class="fw-bold mb-2">История раундов пока не сохранена</div>
                    <div class="text-muted small">Попробуй вернуться на экран результатов и открыть разбор снова.</div>
                </div>
            `;
        }

        return viewModel.history
            .map((round) => buildBrainBattleReviewRoundCardHtml(round, viewModel.players, viewModel.reviewDevMode))
            .join('');
    }

    function renderReview(wrapper, state, res) {
        wrapper.classList.remove('bb-setup-mode');
        wrapper.classList.remove('bb-with-round-context');
        clearBrainBattleFinalActions();
        wrapper.innerHTML = `
        <div class="bb-review-screen px-3 pt-4 pb-5">
            <div class="d-flex align-items-center justify-content-between mb-4">
                <button class="btn btn-light rounded-pill px-3 fw-bold shadow-sm" data-bb-action="back-results">
                    <i class="bi bi-arrow-left me-2"></i>Назад
                </button>
                <div class="d-flex align-items-center gap-2">
                    <button id="bb-review-dev-toggle" class="btn btn-sm rounded-pill px-3 fw-bold" data-bb-action="toggle-review-dev"></button>
                    <div class="small text-uppercase fw-bold text-muted" style="letter-spacing:1px;">Разбор матча</div>
                </div>
            </div>
            <div id="bb-review-body"></div>
        </div>`;
        updateReviewView(wrapper, state, res);
    }

    function updateReviewView(wrapper, viewModelOrState, resMaybe = null) {
        const viewModel = resMaybe
            ? buildBrainBattleReviewViewModel(viewModelOrState, resMaybe)
            : viewModelOrState;
        if (!viewModel) return;

        const devToggle = wrapper.querySelector('#bb-review-dev-toggle');
        const body = wrapper.querySelector('#bb-review-body');

        if (devToggle) {
            devToggle.className = `btn btn-sm rounded-pill px-3 fw-bold ${viewModel.reviewDevMode ? 'btn-dark' : 'btn-outline-dark'}`;
            devToggle.textContent = viewModel.reviewDevMode ? 'Обычный' : 'Dev';
        }

        if (body) {
            const contentSignature = getBrainBattleReviewContentSignature(viewModel);
            if (body.dataset.bbReviewSignature !== contentSignature) {
                body.dataset.bbReviewSignature = contentSignature;
                body.innerHTML = buildBrainBattleReviewBodyHtml(viewModel);
            }
        }
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
        const target = document.querySelector('.screen.active-screen') || wrapper;
        if (!target) return;

        if (finalActionsPortalState?.portal && finalActionsPortalState.target === target && finalActionsPortalState.html === contentHtml) {
            finalActionsPortalState.sync();
            return;
        }

        clearBrainBattleFinalActions();

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

        finalActionsPortalState = { portal, sync, target, html: contentHtml };
        window.addEventListener('resize', sync);
        window.addEventListener('scroll', sync, true);
        sync();
    }

    function cleanupBrainBattleRound() {
        invalidateRoundSession();
        resetBrainBattleRoundState();
        brainBattleViewState.countdownActive = false;
        clearBrainBattleFinalActions();
        if (window.bbCountdownInterval) {
            bbClearInterval(window.bbCountdownInterval);
            window.bbCountdownInterval = null;
        }
        if (window.bbReactionTimeout) {
            bbClearTimeout(window.bbReactionTimeout);
            window.bbReactionTimeout = null;
        }
        if (window.bbBlindInterval) {
            bbClearInterval(window.bbBlindInterval);
            window.bbBlindInterval = null;
        }
        if (window.simonUserClickTimeout) {
            bbClearTimeout(window.simonUserClickTimeout);
            window.simonUserClickTimeout = null;
        }
        brainBattleTimeouts.forEach((handle) => clearTimeout(handle));
        brainBattleIntervals.forEach((handle) => clearInterval(handle));
        brainBattleAnimationFrames.forEach((handle) => cancelAnimationFrame(handle));
        brainBattleTimeouts.clear();
        brainBattleIntervals.clear();
        brainBattleAnimationFrames.clear();
        const overlay = document.getElementById('bb-overlay-layer');
        if (overlay) overlay.remove();
    }

    function bbPlaySound(key) {
        if (window.audioManager) window.audioManager.play(key);
    }

    function bbHaptic(type = 'selection', detail = 'light') {
        if (window.triggerHaptic) window.triggerHaptic(type, detail);
    }

    window.bbSetTimeout = bbSetTimeout;
    window.bbClearTimeout = bbClearTimeout;
    window.bbSetInterval = bbSetInterval;
    window.bbClearInterval = bbClearInterval;
    window.bbRequestAnimationFrame = bbRequestAnimationFrame;
    window.bbCancelAnimationFrame = bbCancelAnimationFrame;
    window.bbIsRoundActive = bbIsRoundActive;
    window.bbEncodeActionValue = bbEncodeActionValue;
    window.bbDecodeActionValue = bbDecodeActionValue;
    window.bbBuildSubmitActionAttrs = bbBuildSubmitActionAttrs;
    window.bbResetTimer = resetBattleTimer;
    window.bbSubmit = submitAnswer;
    window.brainBattleRoundState = brainBattleRoundState;

    // === ОТСЧЕТ И ЗАПУСК ===
    function runGameSequence(wrapper, task, state, res) {
        const roundId = String(state?.round_id || '');
        const taskKey = roundId || JSON.stringify(task);
        if (wrapper.dataset.taskId === taskKey) return;
        if (brainBattleViewState.countdownActive) return;

        cleanupBrainBattleRound();
        const roundSessionId = beginRoundSession(roundId);
        wrapper.dataset.taskId = taskKey;
        wrapper.dataset.roundId = roundId;
        brainBattleViewState.countdownActive = true;
        brainBattleViewState.submittedRoundId = '';

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
        window.bbCountdownInterval = bbSetInterval(() => {
            if (!bbIsRoundActive(roundId, roundSessionId)) {
                bbClearInterval(window.bbCountdownInterval);
                window.bbCountdownInterval = null;
                return;
            }
            count--;
            const numEl = document.getElementById('cnt-number');
            if (count > 0 && numEl) {
                numEl.innerText = count;
                bbPlaySound('tick_soft');
                bbHaptic('selection', 'light');
            } else {
                bbClearInterval(window.bbCountdownInterval);
                window.bbCountdownInterval = null;
                brainBattleViewState.countdownActive = false;

                wrapper.style.pointerEvents = 'auto';
                wrapper.style.opacity = '1';

                if (bbIsRoundActive(roundId, roundSessionId) && window.BB_MECHANICS && window.BB_MECHANICS[task.type]) {
                    window.BB_MECHANICS[task.type](wrapper, task);
                    renderBrainBattleRoundHeader(wrapper, state || window.lastBBState, res, task);
                    battleStartTime = performance.now();
                    bbPlaySound('round_start');
                    bbHaptic('impact', 'medium');
                }
            }
        }, 1000);
        bbPlaySound('tick_soft');
    }

    function renderSetup(wrapper, isHost) {
        if (isHost) {
            wrapper.innerHTML = `
            <div class="d-flex flex-column align-items-center mt-2 mb-3">
                <h1 class="bb-title display-6 mb-0">Настройка</h1>
                <p class="bb-subtitle">Битва мозгов</p>
            </div>

            <div class="bb-glass-card mb-2">
                <label class="fw-bold mb-2 small text-uppercase text-muted d-block">Количество раундов</label>
                <div class="d-flex gap-2 mb-2">
                    <button class="bb-round-btn flex-grow-1 py-1" data-bb-rounds="5" data-rounds="5">5</button>
                    <button class="bb-round-btn flex-grow-1 active py-1" data-bb-rounds="10" data-rounds="10">10</button>
                    <button class="bb-round-btn flex-grow-1 py-1" data-bb-rounds="15" data-rounds="15">15</button>
                </div>
                <input id="bb-rounds" type="number" value="10" min="1" max="50" class="form-control rounded-pill text-center fw-bold py-2" style="color:var(--primary-color) !important; background:var(--bg-secondary) !important; border:1px solid var(--border-main) !important;">
            </div>

            <div class="bb-glass-card mb-2">
                <label class="fw-bold mb-2 small text-uppercase text-muted d-block">Пресеты</label>
                <div class="d-grid gap-2" style="grid-template-columns: repeat(2, minmax(0, 1fr));">
                    <button class="btn bb-round-btn py-2" data-bb-preset="quick">Быстрая</button>
                    <button class="btn bb-round-btn py-2" data-bb-preset="balanced">Сбалансированная</button>
                    <button class="btn bb-round-btn py-2" data-bb-preset="reaction">На реакцию</button>
                    <button class="btn bb-round-btn py-2" data-bb-preset="memory">Только память</button>
                </div>
                <div class="bb-setup-summary mt-3">
                    <div class="bb-setup-summary__label">Сводка матча</div>
                    <div class="bb-setup-summary__line" id="bb-setup-summary-line">10 раундов • 5 категорий • 17 мини-игр</div>
                </div>
            </div>

            <div class="bb-glass-card mb-4" style="flex:1; overflow:hidden; display:flex; flex-direction:column;">
                <label class="fw-bold small text-uppercase text-muted mb-2 d-block">Категории</label>
                
                <div id="bb-categories-list" class="d-flex flex-column gap-1 overflow-auto" style="min-height:0;"></div>
                
                <div id="bb-deep-settings" class="d-none flex-column gap-1 overflow-auto" style="min-height:0;">
                    <!-- Will be filled via JS -->
                </div>

                <div class="mt-3 pt-2 border-top text-center">
                    <button class="btn btn-sm btn-outline-primary rounded-pill px-3 py-1 fw-bold" style="font-size: 0.75rem;" data-bb-action="toggle-deep-settings">
                        <i class="bi bi-sliders me-1"></i> Расширенные настройки
                    </button>
                </div>
            </div>
            
            <div class="fixed-bottom-actions pb-2 d-flex gap-2">
                <button class="bb-start-btn flex-grow-1" style="max-width: 120px; background: var(--bg-secondary); color: var(--text-muted); box-shadow: none;" data-bb-action="back-to-lobby">Выйти</button>
                <button class="bb-start-btn flex-grow-1" data-bb-action="start-battle">Начать битву</button>
            </div>
            <div style="height: 60px;"></div>`;

        } else {
            wrapper.innerHTML = `
            <div class="d-flex flex-column align-items-center justify-content-center flex-grow-1 h-100">
                <div class="spinner-border text-primary mb-3"></div>
                <h3 class="fw-bold text-dark">Ждем хоста...</h3>
            </div>`;
        }
        updateSetupView(wrapper, isHost);
        wrapper.dataset.rendered = 'setup';
    }

    function buildBrainBattleWaitingViewModel(state, res) {
        const myId = String(res.user.id);
        const myRes = state.round_results?.[myId];
        if (!myRes) return null;

        const sorted = Object.entries(state.round_results || {}).sort((a, b) => b[1].score - a[1].score);
        const answeredCount = Object.keys(state.round_results || {}).length;
        const totalPlayers = res.players.length;
        const myRank = Math.max(1, sorted.findIndex(([uid]) => String(uid) === myId) + 1);
        const waitingPlayers = res.players.filter((p) => !state.round_results[String(p.id)]);
        const hasWaitingHumans = waitingPlayers.some((p) => Number(p.is_bot) !== 1);
        const isLastRound = state.current_round >= state.total_rounds;
        const canRevealCorrectAnswer = !hasWaitingHumans && typeof state.round_data?.correct_val !== 'undefined';

        return {
            myRes,
            isCorrect: !!myRes.correct,
            sorted,
            answeredCount,
            totalPlayers,
            myRank,
            waitingPlayers,
            hasWaitingHumans,
            isLastRound,
            currentRound: state.current_round,
            totalRounds: state.total_rounds,
            isHost: !!res.is_host,
            players: res.players,
            canRevealCorrectAnswer,
            correctAnswerHtml: canRevealCorrectAnswer ? formatTaskValue(state.round_data?.correct_val) : '',
            correctAnswerText: canRevealCorrectAnswer ? String(state.round_data?.correct_val ?? '') : ''
        };
    }

    function getBrainBattleWaitingLeadersSignature(viewModel) {
        return JSON.stringify(viewModel.sorted.map(([uid, data]) => [
            String(uid),
            Number(data?.score || 0),
            !!data?.has_streak
        ]));
    }

    function getBrainBattleWaitingPendingSignature(viewModel) {
        return JSON.stringify(viewModel.waitingPlayers.map((player) => [
            String(player.id),
            String(player.first_name || ''),
            Number(player.is_bot || 0)
        ]));
    }

    function getBrainBattleWaitingFooterSignature(viewModel) {
        return [
            String(viewModel.isHost ? 1 : 0),
            String(viewModel.hasWaitingHumans ? 1 : 0),
            String(viewModel.isLastRound ? 1 : 0)
        ].join('|');
    }

    function getBrainBattleWaitingRevealSignature(viewModel) {
        return [
            String(viewModel.canRevealCorrectAnswer ? 1 : 0),
            viewModel.correctAnswerText
        ].join('|');
    }

    function buildBrainBattleWaitingLeadersHtml(viewModel) {
        let html = '';
        viewModel.sorted.forEach(([uid, data], index) => {
            const player = viewModel.players.find((pl) => String(pl.id) === uid);
            if (!player) return;
            const streakBadge = data.has_streak ? `<span class="badge bg-danger ms-2 shadow-sm" style="font-size: 0.7rem; cursor: pointer; border-radius: 12px; padding: 4px 8px;" data-bb-action="streak-info">🔥 1.5x</span>` : '';
            html += `<div class="bb-result-card animate__animated animate__flipInX" style="animation-duration: 0.5s;">
                <div class="d-flex align-items-center">
                    <div class="bb-rank">#${index + 1}</div>
                    ${window.renderAvatar ? window.renderAvatar(player, 'md') : `<img src="${player.photo_url}" class="rounded-circle me-3" style="width:40px;height:40px;">`}
                    <div class="d-flex flex-column justify-content-center ms-3">
                        <span class="fw-bold d-flex align-items-center" style="font-size: 15px; color:var(--text-main); line-height: 1;">${player.first_name}${streakBadge}</span>
                    </div>
                </div>
                <div class="fw-bold" style="color:var(--primary-color);">+${data.score}</div>
            </div>`;
        });
        return html;
    }

    function buildBrainBattleWaitingPendingHtml(viewModel) {
        if (!viewModel.waitingPlayers.length) return '';
        let html = '';
        viewModel.waitingPlayers.forEach((player) => {
            html += `<div class="bb-result-card mt-2" style="background: rgba(255,255,255,0.4); opacity: 0.7; border: 1px dashed var(--border-main);">
                <div class="d-flex align-items-center">
                    <div class="spinner-border text-muted me-3" style="width: 20px; height: 20px; border-width: 2px;"></div>
                    ${window.renderAvatar ? window.renderAvatar(player, 'sm') : `<img src="${player.photo_url}" class="rounded-circle me-3" style="width:30px;height:30px;">`}
                    <span class="fw-bold text-muted ms-2" style="font-size: 14px;">${player.first_name}</span>
                </div>
                <div class="fw-bold text-muted small">Думает...</div>
            </div>`;
        });
        return html;
    }

    function buildBrainBattleWaitingFooterHtml(viewModel) {
        if (viewModel.isHost) {
            return `<button class="bb-start-btn w-100 py-3" ${viewModel.hasWaitingHumans ? 'disabled style="opacity:0.55; box-shadow:none;"' : ''} data-bb-action="next-round">${viewModel.hasWaitingHumans ? "Ждем игроков..." : (viewModel.isLastRound ? "🏁 Результаты" : "Следующий раунд")}</button>`;
        }
        return `<div class="text-center text-muted fw-bold small"><div class="spinner-border spinner-border-sm me-2"></div> Ожидание хоста...</div>`;
    }

    function renderWaiting(wrapper, state, res) {
        wrapper.dataset.taskId = '';
        brainBattleViewState.countdownActive = false;
        wrapper.classList.remove('bb-setup-mode');
        wrapper.classList.remove('bb-with-round-context');
        wrapper.style.pointerEvents = 'auto';
        wrapper.style.opacity = '1';

        const viewModel = buildBrainBattleWaitingViewModel(state, res);
        if (!viewModel) return;

        wrapper.innerHTML = `
        <div class="d-flex flex-column h-100">
            <div class="flex-grow-1 overflow-auto pt-4 px-2" style="-webkit-overflow-scrolling: touch;">
                <div id="bb-waiting-status-icon" class="bb-result-circle mx-auto"></div>
                <h2 id="bb-waiting-status-title" class="fw-bold mb-1 text-center"></h2>
                <p id="bb-waiting-status-time" class="text-muted mb-4 text-center fw-bold"></p>
                <div class="d-flex justify-content-center gap-2 flex-wrap mb-4">
                    <div id="bb-waiting-round-pill" class="bb-stat-pill"></div>
                    <div id="bb-waiting-rank-pill" class="bb-stat-pill"></div>
                    <div id="bb-waiting-answered-pill" class="bb-stat-pill"></div>
                </div>
                
                <div class="bb-glass-card p-4 text-center mb-4 mx-3">
                    <div class="small text-uppercase text-muted fw-bold mb-1">Получено очков</div>
                    <h1 id="bb-waiting-score" class="display-2 fw-bold mb-0" style="background: var(--primary-gradient); -webkit-background-clip: text; -webkit-text-fill-color: transparent;"></h1>
                </div>

                <div id="bb-waiting-correct-answer" class="px-3 mb-4 d-none">
                    <div class="bb-glass-card p-3 text-center">
                        <div class="small text-uppercase text-muted fw-bold mb-1">Правильный ответ</div>
                        <div id="bb-waiting-correct-answer-value" class="fw-bold text-primary"></div>
                    </div>
                </div>

                <h6 class="text-start ms-4 mb-3 small text-uppercase text-muted fw-extrabold" style="letter-spacing: 1px;">Топ раунда</h6>
                <div id="bb-waiting-leaderboard" class="d-flex flex-column gap-2 px-3 pb-3"></div>
                <div id="bb-waiting-pending-block"></div>
            </div>
            <div id="bb-waiting-footer" class="p-3 pb-4 flex-shrink-0" style="z-index: 100;"></div>
        </div>
        `;

        updateWaitingView(wrapper, viewModel);
        bbPlaySound(viewModel.isCorrect ? 'success' : 'error');
    }

    function updateWaitingView(wrapper, viewModelOrState, resMaybe = null) {
        const viewModel = resMaybe
            ? buildBrainBattleWaitingViewModel(viewModelOrState, resMaybe)
            : viewModelOrState;
        if (!viewModel) return;

        const statusIcon = wrapper.querySelector('#bb-waiting-status-icon');
        const statusTitle = wrapper.querySelector('#bb-waiting-status-title');
        const statusTime = wrapper.querySelector('#bb-waiting-status-time');
        const roundPill = wrapper.querySelector('#bb-waiting-round-pill');
        const rankPill = wrapper.querySelector('#bb-waiting-rank-pill');
        const answeredPill = wrapper.querySelector('#bb-waiting-answered-pill');
        const scoreEl = wrapper.querySelector('#bb-waiting-score');
        const correctAnswerBlockEl = wrapper.querySelector('#bb-waiting-correct-answer');
        const correctAnswerValueEl = wrapper.querySelector('#bb-waiting-correct-answer-value');
        const leaderboardEl = wrapper.querySelector('#bb-waiting-leaderboard');
        const pendingBlockEl = wrapper.querySelector('#bb-waiting-pending-block');
        const footerEl = wrapper.querySelector('#bb-waiting-footer');

        if (statusIcon) {
            statusIcon.innerHTML = viewModel.isCorrect
                ? '<i class="bi bi-check-lg text-success"></i>'
                : '<i class="bi bi-x-lg text-danger"></i>';
        }
        if (statusTitle) {
            statusTitle.textContent = viewModel.isCorrect ? 'Верно!' : 'Ошибка';
            statusTitle.style.color = viewModel.isCorrect ? 'var(--status-success)' : 'var(--status-error)';
        }
        if (statusTime) statusTime.textContent = `${(viewModel.myRes.time / 1000).toFixed(2)} сек`;
        if (roundPill) roundPill.textContent = `Раунд ${viewModel.currentRound}/${viewModel.totalRounds}`;
        if (rankPill) rankPill.textContent = `Место сейчас: #${viewModel.myRank}`;
        if (answeredPill) answeredPill.textContent = `Ответили: ${viewModel.answeredCount}/${viewModel.totalPlayers}`;
        if (scoreEl) scoreEl.textContent = `+${viewModel.myRes.score}`;
        if (correctAnswerBlockEl) {
            const revealSignature = getBrainBattleWaitingRevealSignature(viewModel);
            if (correctAnswerBlockEl.dataset.bbRevealSignature !== revealSignature) {
                correctAnswerBlockEl.dataset.bbRevealSignature = revealSignature;
                correctAnswerBlockEl.classList.toggle('d-none', !viewModel.canRevealCorrectAnswer);
                if (correctAnswerValueEl && viewModel.canRevealCorrectAnswer) {
                    correctAnswerValueEl.innerHTML = viewModel.correctAnswerHtml;
                }
            }
        }
        if (leaderboardEl) {
            const leadersSignature = getBrainBattleWaitingLeadersSignature(viewModel);
            if (leaderboardEl.dataset.bbLeadersSignature !== leadersSignature) {
                leaderboardEl.dataset.bbLeadersSignature = leadersSignature;
                leaderboardEl.innerHTML = buildBrainBattleWaitingLeadersHtml(viewModel);
            }
        }
        if (pendingBlockEl) {
            const pendingSignature = getBrainBattleWaitingPendingSignature(viewModel);
            if (pendingBlockEl.dataset.bbPendingSignature !== pendingSignature) {
                pendingBlockEl.dataset.bbPendingSignature = pendingSignature;
                const pendingHtml = buildBrainBattleWaitingPendingHtml(viewModel);
                pendingBlockEl.innerHTML = pendingHtml
                    ? `<h6 class="text-start ms-4 mt-2 mb-3 small text-uppercase fw-extrabold" style="color: var(--text-muted); letter-spacing: 1px;">Ждем ответа от:</h6><div class="d-flex flex-column gap-2 px-3 pb-3">${pendingHtml}</div>`
                    : '';
            }
        }
        if (footerEl) {
            const footerSignature = getBrainBattleWaitingFooterSignature(viewModel);
            if (footerEl.dataset.bbFooterSignature !== footerSignature) {
                footerEl.dataset.bbFooterSignature = footerSignature;
                footerEl.innerHTML = buildBrainBattleWaitingFooterHtml(viewModel);
            }
        }
    }

    function buildBrainBattleFinalViewModel(state, res) {
        const leaderboard = bbBuildFinalLeaderboard(state, res.players);
        const sorted = leaderboard.map((entry) => [entry.userId, entry.score]);
        const winnerId = sorted[0] ? sorted[0][0] : null;
        const myUserId = String(res.user.id);
        const cachedSummary = hasFreshBrainBattleSummary(state) ? state.ai_summary : '';
        const summaryText = cachedSummary || brainBattleSummaryText || '';
        return {
            leaderboard,
            sorted,
            myUserId,
            isWinner: myUserId === String(winnerId),
            myRank: Math.max(1, leaderboard.findIndex((entry) => entry.userId === myUserId) + 1),
            stats: bbBuildPlayerMatchStats(state, res.players, res.user.id),
            summaryState: summaryText ? 'ready' : 'loading',
            totalRounds: state.total_rounds || 0,
            players: res.players,
            isHost: !!res.is_host,
            summaryText
        };
    }

    function getBrainBattleFinalLeaderboardSignature(viewModel) {
        return JSON.stringify(viewModel.sorted.map(([uid, score]) => [String(uid), Number(score || 0)]));
    }

    function getBrainBattleFinalStatsSignature(viewModel) {
        return [
            String(viewModel.isWinner ? 1 : 0),
            String(viewModel.myRank || 0),
            String(viewModel.totalRounds || 0),
            String(viewModel.stats.my.accuracy || 0),
            String(viewModel.stats.my.bestRoundScore || 0),
            String(viewModel.stats.global.fastest?.time || ''),
            String(viewModel.stats.global.fastest?.name || '')
        ].join('|');
    }

    function buildBrainBattleFinalLeaderboardHtml(viewModel) {
        let html = '';
        viewModel.sorted.forEach(([uid, score], index) => {
            const player = viewModel.players.find((pl) => String(pl.id) === uid);
            if (!player) return;
            let rankStyle = '';
            const isMe = String(uid) === viewModel.myUserId;
            if (index === 0) rankStyle = 'background: #FFD700; color: white; box-shadow: 0 4px 10px rgba(255, 215, 0, 0.4);';
            else if (index === 1) rankStyle = 'background: #C0C0C0; color: white;';
            else if (index === 2) rankStyle = 'background: #CD7F32; color: white;';

            html += `
                <div class="bb-result-card" style="${index === 0 ? 'border: 2px solid #FFD700; transform: scale(1.02);' : ''}${isMe ? ' box-shadow: 0 10px 24px rgba(0, 0, 0, 0.12);' : ''}">
                    <div class="d-flex align-items-center">
                        <div class="bb-rank" style="${rankStyle}">#${index + 1}</div>
                        ${window.renderAvatar ? window.renderAvatar(player, 'md') : `<img src="${player.photo_url}" class="rounded-circle me-3" style="width:44px;height:44px;">`}
                        <span class="fw-bold ms-3" style="font-size: 16px;">${player.first_name}${isMe ? ' <span class="small text-muted">(вы)</span>' : ''}</span>
                    </div>
                    <div class="fs-4 fw-bold text-dark">${score}</div>
                </div>
            `;
        });
        return html;
    }

    function buildBrainBattleFinalFooterHtml(viewModel) {
        if (viewModel.isHost) {
            return `<div class="fixed-bottom-actions bb-final-actions">
                <button class="bb-start-btn bb-secondary-btn" data-bb-action="open-review"><i class="bi bi-journal-text me-2"></i>Фактчекинг</button>
                <button class="bb-start-btn" style="background: var(--bg-secondary); color: var(--text-main); box-shadow: none; border: 1px solid var(--border-main);" data-bb-action="finish"><i class="bi bi-arrow-return-left me-2"></i>Вернуться в Лобби</button>
            </div>`;
        }
        return `<div class="fixed-bottom-actions bb-final-actions text-center">
            <button class="bb-start-btn bb-secondary-btn" data-bb-action="open-review"><i class="bi bi-journal-text me-2"></i>Фактчекинг</button>
            <button class="btn btn-link fw-bold text-decoration-none" style="color:var(--text-muted);" data-bb-action="leave-room">Покинуть комнату</button>
        </div>`;
    }

    function buildBrainBattleSetupCategoriesHtml(library, categoryMeta) {
        return `
            <label class="bb-category-item py-2">
                <input type="checkbox" class="bb-checkbox" value="attention" checked>
                <i class="bi ${categoryMeta.attention.icon} me-2 text-primary"></i>
                <span class="fw-bold text-body small">Внимание</span>
                <span class="ms-auto small text-muted fw-bold">${library.attention.length} игр</span>
            </label>
            <label class="bb-category-item py-2">
                <input type="checkbox" class="bb-checkbox" value="logic" checked>
                <i class="bi ${categoryMeta.logic.icon} me-2 text-warning" style="${categoryMeta.logic.iconStyle}"></i>
                <span class="fw-bold text-body small">Логика</span>
                <span class="ms-auto small text-muted fw-bold">${library.logic.length} игр</span>
            </label>
            <label class="bb-category-item py-2">
                <input type="checkbox" class="bb-checkbox" value="erudition" checked>
                <i class="bi ${categoryMeta.erudition.icon} me-2 text-info" style="${categoryMeta.erudition.iconStyle}"></i>
                <span class="fw-bold text-body small">Эрудиция</span>
                <span class="ms-auto small text-muted fw-bold">${library.erudition.length} игр</span>
            </label>
            <label class="bb-category-item py-2">
                <input type="checkbox" class="bb-checkbox" value="motor" checked>
                <i class="bi ${categoryMeta.motor.icon} me-2 text-danger" style="${categoryMeta.motor.iconStyle}"></i>
                <span class="fw-bold text-body small">Реакция</span>
                <span class="ms-auto small text-muted fw-bold">${library.motor.length} игр</span>
            </label>
            <label class="bb-category-item py-2">
                <input type="checkbox" class="bb-checkbox" value="memory" checked>
                <i class="bi ${categoryMeta.memory.icon} me-2 text-success" style="${categoryMeta.memory.iconStyle}"></i>
                <span class="fw-bold text-body small">Память</span>
                <span class="ms-auto small text-muted fw-bold">${library.memory.length} игр</span>
            </label>
        `;
    }

    function updateSetupView(wrapper, isHost) {
        wrapper.classList.add('bb-setup-mode');
        wrapper.classList.remove('bb-with-round-context');
        wrapper.style.pointerEvents = 'auto';
        wrapper.style.opacity = '1';

        if (!isHost) return;

        const library = bbEnsureLibrarySync();
        const categoryMeta = bbGetSetupCategoryMeta();
        const categoriesList = wrapper.querySelector('#bb-categories-list');
        const deep = wrapper.querySelector('#bb-deep-settings');

        if (categoriesList) {
            const selectedCategories = new Set(
                Array.from(categoriesList.querySelectorAll('.bb-checkbox:checked')).map((cb) => cb.value)
            );
            categoriesList.innerHTML = buildBrainBattleSetupCategoriesHtml(library, categoryMeta);
            if (selectedCategories.size > 0) {
                categoriesList.querySelectorAll('.bb-checkbox').forEach((cb) => {
                    cb.checked = selectedCategories.has(cb.value);
                });
            }
        }

        if (deep && !deep.classList.contains('d-none')) {
            renderDeepSettings();
        }

        bbUpdateSetupSummary();
    }

    function renderFinal(wrapper, state, res) {
        wrapper.classList.remove('bb-setup-mode');
        wrapper.classList.remove('bb-with-round-context');
        wrapper.style.pointerEvents = 'auto';
        wrapper.style.opacity = '1';
        const viewModel = buildBrainBattleFinalViewModel(state, res);
        const postGameSummary = window.GameSummaryProvider
            ? window.GameSummaryProvider.remember('brainbattle', state, { players: res.players || [] })
            : null;

        let html = `
        <div class="d-flex flex-column align-items-center pt-5 pb-5 px-3 bb-final-screen">
            <div class="bb-final-icon animate__animated animate__bounceIn" aria-hidden="true">
                <i class="bi bi-trophy-fill"></i>
            </div>
            
            <h2 id="bb-final-title" class="display-6 fw-bold mb-2 text-center" style="color: var(--text-main);">Битва окончена</h2>
            
            <div id="bb-final-winner-banner">
                ${viewModel.isWinner
                ? `<div class="bb-final-winner-note">
                    <i class="bi bi-stars" aria-hidden="true"></i><span>Вы выиграли турнир</span>
                   </div>`
                : ``
            }
            </div>
            
            <div id="bb-final-leaderboard" class="w-100 d-flex flex-column gap-2 mb-3"></div>
            <div class="bb-final-personal w-100 mb-3">
                <div class="bb-final-personal-head">
                    <div>
                        <div class="bb-final-section-kicker">Личный итог</div>
                        <div class="bb-final-personal-title">Ваш матч</div>
                    </div>
                    <div id="bb-final-rounds-pill" class="bb-final-rounds-pill"></div>
                </div>
                <div class="bb-final-stats-grid">
                    <div class="bb-final-stat-card">
                        <div class="bb-final-stat-label">Место</div>
                        <div id="bb-final-rank" class="bb-final-stat-value"></div>
                    </div>
                    <div class="bb-final-stat-card">
                        <div class="bb-final-stat-label">Точность</div>
                        <div id="bb-final-accuracy" class="bb-final-stat-value"></div>
                    </div>
                    <div class="bb-final-stat-card">
                        <div class="bb-final-stat-label">Лучший</div>
                        <div id="bb-final-best-round" class="bb-final-stat-value"></div>
                    </div>
                    <div class="bb-final-stat-card">
                        <div class="bb-final-stat-label">Скорость</div>
                        <div id="bb-final-fastest" class="bb-final-stat-value"></div>
                        <div id="bb-final-fastest-note" class="bb-final-stat-note"></div>
                    </div>
                </div>
            </div>

            ${postGameSummary ? `<div class="w-100 mb-4">${window.GameSummaryProvider.render(postGameSummary, {
                playAgainLabel: viewModel.isHost ? 'Играть ещё раз' : 'В комнату',
                playAgainAction: viewModel.isHost ? 'play-again' : 'return-to-room'
            })}</div>` : ''}
            <div class="bb-ai-summary-card w-100 mb-4">
                <div class="bb-final-section-kicker">Комментарий матча</div>
                <div id="bb-ai-summary" class="bb-ai-summary"></div>
            </div>
            <div class="bb-final-spacer"></div></div>`;

        wrapper.innerHTML = html;
        updateFinalView(wrapper, viewModel);
        fetchBrainBattleSummary(state);
        bbPlaySound('win');
    }

    function updateFinalView(wrapper, viewModelOrState, resMaybe = null) {
        const viewModel = resMaybe
            ? buildBrainBattleFinalViewModel(viewModelOrState, resMaybe)
            : viewModelOrState;
        if (!viewModel) return;

        const winnerBanner = wrapper.querySelector('#bb-final-winner-banner');
        const leaderboardEl = wrapper.querySelector('#bb-final-leaderboard');
        const roundsPill = wrapper.querySelector('#bb-final-rounds-pill');
        const rankEl = wrapper.querySelector('#bb-final-rank');
        const accuracyEl = wrapper.querySelector('#bb-final-accuracy');
        const bestRoundEl = wrapper.querySelector('#bb-final-best-round');
        const fastestEl = wrapper.querySelector('#bb-final-fastest');
        const fastestNoteEl = wrapper.querySelector('#bb-final-fastest-note');
        const summaryEl = wrapper.querySelector('#bb-ai-summary');

        if (winnerBanner) {
            const statsSignature = getBrainBattleFinalStatsSignature(viewModel);
            if (winnerBanner.dataset.bbStatsSignature !== statsSignature) {
                winnerBanner.dataset.bbStatsSignature = statsSignature;
                winnerBanner.innerHTML = viewModel.isWinner
                    ? `<div class="bb-final-winner-note">
                        <i class="bi bi-stars" aria-hidden="true"></i><span>Вы выиграли турнир</span>
                    </div>`
                    : ``;
            }
        }
        if (leaderboardEl) {
            const leaderboardSignature = getBrainBattleFinalLeaderboardSignature(viewModel);
            if (leaderboardEl.dataset.bbLeaderboardSignature !== leaderboardSignature) {
                leaderboardEl.dataset.bbLeaderboardSignature = leaderboardSignature;
                leaderboardEl.innerHTML = buildBrainBattleFinalLeaderboardHtml(viewModel);
            }
        }
        if (roundsPill) roundsPill.textContent = `${viewModel.totalRounds} раундов`;
        if (rankEl) rankEl.textContent = `#${viewModel.myRank}`;
        if (accuracyEl) accuracyEl.textContent = `${viewModel.stats.my.accuracy}%`;
        if (bestRoundEl) bestRoundEl.textContent = `+${viewModel.stats.my.bestRoundScore || 0}`;
        if (fastestEl) fastestEl.textContent = viewModel.stats.global.fastest ? `${Math.round(viewModel.stats.global.fastest.time)} мс` : '—';
        if (fastestNoteEl) fastestNoteEl.textContent = viewModel.stats.global.fastest ? viewModel.stats.global.fastest.name : '';
        mountBrainBattleFinalActions(wrapper, buildBrainBattleFinalFooterHtml(viewModel));
        if (summaryEl) {
            summaryEl.dataset.state = viewModel.summaryState;
            summaryEl.innerHTML = viewModel.summaryState === 'ready'
                ? `<p class="mb-0">${escapeHtml(trimBrainBattleSummaryText(viewModel.summaryText))}</p>`
                : `<div class="bb-ai-summary-skeleton"></div><div class="bb-ai-summary-skeleton short"></div>`;
        }
    }

    async function finishBrainBattle() {
        // 1. Собираем результаты для рейтинга
        if (window.lastBBState && !window.lastBBState.stats_recorded) {
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
    }

    function openReview() {
        brainBattleViewState.reviewMode = true;
        brainBattleViewState.reviewDevMode = false;
        if (window.checkState) window.checkState();
    }

    function backToResults() {
        brainBattleViewState.reviewMode = false;
        brainBattleViewState.reviewDevMode = false;
        if (window.checkState) window.checkState();
    }

    function toggleReviewDev() {
        brainBattleViewState.reviewDevMode = !brainBattleViewState.reviewDevMode;
        if (window.checkState) window.checkState();
    }

    function startBattle() {
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
    }

    function resetBattleTimer() {
        battleStartTime = performance.now();
    }

    function submitAnswer(answer, correct, manualTime = null, manualSuccess = null) {
        const roundId = String(window.lastBBState?.round_id || brainBattleViewState.currentRoundId || '');
        if (!roundId) return;
        if (brainBattleViewState.submittedRoundId === roundId) return;
        brainBattleViewState.submittedRoundId = roundId;

        const time = manualTime !== null ? manualTime : (performance.now() - battleStartTime);
        const isSuccess = manualSuccess !== null ? manualSuccess : (String(answer) === String(correct));

        bbPlaySound(isSuccess ? 'success_bright' : 'error_soft');
        bbHaptic(isSuccess ? 'notification' : 'notification', isSuccess ? 'success' : 'error');

        // ЗАМОРОЗКА: Только при клике на ответ
        const wrapper = document.getElementById('bb-wrapper');
        if (wrapper) {
            wrapper.style.pointerEvents = 'none';
            wrapper.style.opacity = '0.6';
        }

        cleanupBrainBattleRound();
        sendGameAction('submit_result', { round_id: roundId, time_ms: time, success: isSuccess, answer: answer });
    }

    function nextRound(button) {
        // Делаем кнопку "Далее" визуально неактивной, чтобы не спамили
        if (button) button.disabled = true;
        sendGameAction('next_round');
    }

    function confirmForceExit() {
        if(confirm("Принудительно завершить игру и выйти в настройки?")) {
            sendGameAction('force_reset');
        }
    }

    window.finishGameSession = async function () {
        await apiRequest({ action: 'stop_game' });
        checkState();
    };

    if (window.GameSummaryProvider) {
        window.GameSummaryProvider.register('brainbattle', {
            buildSummary: function (gameState, context = {}) {
                const players = context.players || [];
                const scores = gameState?.scores || {};
                const sortedIds = Object.keys(scores).sort((a, b) => Number(scores[b] || 0) - Number(scores[a] || 0));
                const getPlayer = (id) => players.find(player => String(player.id) === String(id));
                const getName = (id) => {
                    const player = getPlayer(id);
                    return player ? (player.display_name || player.custom_name || player.first_name || 'Игрок') : 'Игрок';
                };
                const topId = sortedIds[0] || null;
                const topScore = topId ? Number(scores[topId] || 0) : 0;
                const rounds = Number(gameState?.total_rounds || gameState?.current_round || 0);
                const secondId = sortedIds[1] || null;
                const fastest = bbBuildPlayerMatchStats(gameState, players, topId || '')?.global?.fastest;
                const awards = [];

                if (topId) {
                    awards.push({
                        iconClass: 'bi bi-trophy-fill',
                        title: 'Чемпион турнира',
                        player: `${getName(topId)} · ${topScore} очков`
                    });
                }
                if (fastest?.name) {
                    awards.push({
                        iconClass: 'bi bi-stopwatch-fill',
                        title: 'Самый быстрый ответ',
                        player: `${fastest.name} · ${Math.round(fastest.time)} мс`
                    });
                }
                if (secondId) {
                    awards.push({
                        iconClass: 'bi bi-lightning-charge-fill',
                        title: 'Главный соперник',
                        player: `${getName(secondId)} · ${Number(scores[secondId] || 0)} очков`
                    });
                }

                const winnerName = topId ? getName(topId) : '';
                const roundsText = rounds ? `${rounds} ${getBrainBattleRoundNoun(rounds)}` : '';
                const outcome = topId
                    ? `${winnerName} выиграл турнир${roundsText ? `: ${roundsText}, ${topScore} очков` : ` с результатом ${topScore} очков`}.`
                    : 'Турнир закончился без явного лидера, но реванш уже просится.';

                return {
                    gameId: 'brainbattle',
                    gameTitle: 'Мозговая Битва',
                    participants: players.map(player => ({
                        id: player.id,
                        name: player.display_name || player.custom_name || player.first_name || 'Игрок'
                    })),
                    winner: topId ? { id: topId, name: winnerName, score: topScore } : null,
                    outcome,
                    awards,
                    shareText: [
                        `Мозговая Битва: ${outcome}`,
                        topId ? `Победитель: ${winnerName}. Счёт: ${topScore}` : '',
                        ...awards.map(award => `${award.title}: ${award.player}`),
                        '',
                        'Собираем реванш:'
                    ].filter(Boolean).join('\n')
                };
            },
            playAgain: function () {
                if (typeof window.sendGameAction === 'function') {
                    window.sendGameAction('force_reset');
                }
            },
            'return-to-room': function () {
                if (typeof window.checkState === 'function') {
                    window.checkState();
                }
            }
        });
    }

    window.render_brainbattle = render_brainbattle;
}
