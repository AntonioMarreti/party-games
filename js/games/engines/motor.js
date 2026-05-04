if (!window.BB_MECHANICS) window.BB_MECHANICS = {};

// 1. РЕАКЦИЯ
window.BB_MECHANICS.reaction_test = function (wrapper, task) {
    const roundId = window.bbActiveRoundId || '';
    let reactionStartTime = 0;

    // Create Global Overlay
    const overlay = document.createElement('div');
    overlay.id = 'bb-overlay-layer';
    overlay.className = 'animate__animated animate__fadeIn';
    overlay.style.background = 'var(--status-error)'; // Start Red
    overlay.innerHTML = `
        <div id="reaction-icon" style="font-size: 6rem;">✋</div>
        <h1 id="reaction-text" class="fw-bold mt-3 text-white">ЖДИ...</h1>
        <p class="opacity-75 text-white">Нажми, когда станет зеленым</p>
    `;

    document.body.appendChild(overlay);

    const randomDelay = task.delay_ms || task.delay || 3000;

    window.bbReactionTimeout = window.bbSetTimeout(() => {
        if (window.bbIsRoundActive && !window.bbIsRoundActive(roundId)) return;
        if (overlay) {
            overlay.style.background = 'var(--status-success)'; // Green
            document.getElementById('reaction-text').innerText = "ЖМИ!";
            document.getElementById('reaction-icon').innerText = "⚡️";
            reactionStartTime = performance.now();
            overlay.dataset.ready = "true";
            if (window.triggerHaptic) window.triggerHaptic('notification', 'success');
            if (window.audioManager) window.audioManager.play('tick_soft');
        }
    }, randomDelay);

    overlay.addEventListener('click', () => {
        if (!overlay || overlay.dataset.finished === "true") return;

        const finish = (time, success) => {
            if (overlay.dataset.finished === "true") return;
            overlay.dataset.finished = "true";
            overlay.remove();
            window.bbSubmit(null, null, time, success);
        };

        if (overlay.dataset.ready === "true") {
            const time = performance.now() - reactionStartTime;
            if (window.triggerHaptic) window.triggerHaptic('impact', 'medium');
            finish(time, true);
        } else {
            if (window.bbReactionTimeout) window.bbClearTimeout(window.bbReactionTimeout);
            overlay.style.background = 'var(--bg-dark)';
            document.getElementById('reaction-text').innerText = "РАНО!";
            if (window.triggerHaptic) window.triggerHaptic('notification', 'error');
            window.bbSetTimeout(() => {
                finish(9999, false);
            }, 500);
        }
    });

    // Placeholder in wrapper (optional)
    wrapper.innerHTML = '<div class="text-center text-muted mt-5">Игра на весь экран...</div>';
};

// Разминирование
window.BB_MECHANICS.defuse_numbers = function (wrapper, task) {
    let current = 1;
    wrapper.innerHTML = `
        <div class="bb-round-shell">
            <div class="bb-game-badge">${task.title}</div>
            <div class="bb-question-card" style="max-width: 320px;">
                <div class="bb-question-kicker">Последовательность чисел</div>
                <h2 id="defuse-target" class="bb-question-text bb-question-text--medium text-primary">Жми: 1</h2>
            </div>
                <div class="d-grid gap-2" style="grid-template-columns: repeat(3, 1fr); width: 300px; margin: 0 auto;">
                ${task.grid.map(num => `
                    <button id="btn-num-${num}" class="btn bb-option-btn fw-bold fs-2" 
                        style="height: 80px; background:var(--bg-card); color:var(--text-main);" data-bb-action="defuse-number" data-bb-value="${num}">${num}</button>
                `).join('')}
            </div>
        </div>`;

    if (window.bbResetTimer) window.bbResetTimer();

    window.brainBattleRoundState.defuseNumber = function (val) {
        if (val === current) {
            if (window.triggerHaptic) window.triggerHaptic('selection', 'light');
            if (window.audioManager) window.audioManager.play('tick_soft');
            document.getElementById(`btn-num-${val}`).style.visibility = 'hidden';
            current++;
            if (current > 9) {
                window.bbSubmit(9, 9);
            } else {
                document.getElementById('defuse-target').innerText = `Жми: ${current}`;
            }
        } else {
            if (window.triggerHaptic) window.triggerHaptic('notification', 'error');
            // Ошибка - нажал не то
            window.bbSubmit(val, current);
        }
    };
};

// Тайминг-сейф
window.BB_MECHANICS.timing_safe = function (wrapper, task) {
    const roundId = window.bbActiveRoundId || '';
    wrapper.innerHTML = `
        <div class="bb-round-shell">
            <div class="bb-game-badge" style="color: var(--text-main);">${task.title}</div>
            <div class="bb-question-card" style="max-width: 420px;">
                <div class="bb-question-kicker">Поймай зеленую зону</div>
                <h3 class="bb-question-text bb-question-text--small">Останови бегунок точно по центру</h3>
            </div>
            <div class="position-relative w-100 rounded-pill mb-5" style="height: 40px; overflow: hidden; border: 2px solid var(--border-main); background:var(--bg-secondary);">
                <!-- Зеленая зона -->
                <div style="position: absolute; left: 40%; width: 20%; height: 100%; background: var(--status-success); opacity: 0.5;"></div>
                <!-- Бегунок -->
                <div id="safe-cursor" style="position: absolute; left: 0; width: 10px; height: 100%; background: var(--primary-color); shadow: 0 0 10px rgba(0,0,0,0.5);"></div>
            </div>
            <button class="btn bb-start-btn" style="max-width: 320px; margin-inline: auto;" data-bb-action="check-safe">СТОП!</button>
        </div>`;

    let pos = 0;
    let dir = 1;
    const speed = task.speed || 3;

    let frameHandle = null;
    const anim = () => {
        if (window.bbIsRoundActive && !window.bbIsRoundActive(roundId)) return;
        const cursor = document.getElementById('safe-cursor');
        if (!cursor) return;
        pos += dir * speed;
        if (pos > 98 || pos < 0) dir *= -1;
        cursor.style.left = pos + '%';
        frameHandle = window.bbRequestAnimationFrame ? window.bbRequestAnimationFrame(anim) : requestAnimationFrame(anim);
    };
    if (window.bbResetTimer) window.bbResetTimer();
    frameHandle = window.bbRequestAnimationFrame ? window.bbRequestAnimationFrame(anim) : requestAnimationFrame(anim);

    window.brainBattleRoundState.checkSafe = function () {
        const isWin = (pos >= 40 && pos <= 60);
        if (window.triggerHaptic) window.triggerHaptic(isWin ? 'impact' : 'notification', isWin ? 'medium' : 'error');
        window.bbSubmit(pos, isWin ? pos : 'green-zone', null, isWin);
    };
};
