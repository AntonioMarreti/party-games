if (!window.BB_MECHANICS) window.BB_MECHANICS = {};

// 1. РЕАКЦИЯ
window.BB_MECHANICS.reaction_test = function (wrapper, task) {
    window.bbBattleStartTime = 0;

    // Create Global Overlay
    const overlay = document.createElement('div');
    overlay.id = 'bb-overlay-layer';
    overlay.className = 'animate__animated animate__fadeIn';
    overlay.style.background = '#e74c3c'; // Start Red
    overlay.onclick = window.bbReactionClick;
    overlay.innerHTML = `
        <div id="reaction-icon" style="font-size: 6rem;">✋</div>
        <h1 id="reaction-text" class="fw-bold mt-3 text-white">ЖДИ...</h1>
        <p class="opacity-75 text-white">Нажми, когда станет зеленым</p>
    `;

    document.body.appendChild(overlay);

    const randomDelay = task.delay || 3000;

    window.bbReactionTimeout = setTimeout(() => {
        if (overlay) {
            overlay.style.background = '#00b894'; // Green
            document.getElementById('reaction-text').innerText = "ЖМИ!";
            document.getElementById('reaction-icon').innerText = "⚡️";
            window.bbBattleStartTime = performance.now();
            overlay.dataset.ready = "true";
        }
    }, randomDelay);

    // Placeholder in wrapper (optional)
    wrapper.innerHTML = '<div class="text-center text-muted mt-5">Игра на весь экран...</div>';
};

window.bbReactionClick = function () {
    const bg = document.getElementById('bb-overlay-layer');
    if (!bg) return;

    const finish = (time, success) => {
        bg.remove(); // Remove immediately
        window.bbSubmit(null, null, time, success);
    };

    if (bg.dataset.ready === "true") {
        const time = performance.now() - window.bbBattleStartTime;
        finish(time, true);
    } else {
        if (window.bbReactionTimeout) clearTimeout(window.bbReactionTimeout);
        bg.style.background = '#2D3436';
        document.getElementById('reaction-text').innerText = "РАНО!";

        // Remove after short delay to show "Early" message
        setTimeout(() => {
            finish(9999, false);
        }, 500);
    }
};

// Разминирование
window.BB_MECHANICS.defuse_numbers = function (wrapper, task) {
    let current = 1;
    wrapper.innerHTML = `
        <div class="d-flex flex-column align-items-center justify-content-center flex-grow-1 h-100">
            <div class="bb-game-badge">${task.title}</div>
            <h2 id="defuse-target" class="fw-bold text-primary mb-4">Жми: 1</h2>
            <div class="d-grid gap-2" style="grid-template-columns: repeat(3, 1fr); width: 300px;">
                ${task.grid.map(num => `
                    <button id="btn-num-${num}" class="btn btn-white shadow-sm border-0 fw-bold fs-2 rounded-4" 
                        style="height: 80px;" onclick="window.handleDefuse(${num})">${num}</button>
                `).join('')}
            </div>
        </div>`;

    window.handleDefuse = function (val) {
        if (val === current) {
            document.getElementById(`btn-num-${val}`).style.visibility = 'hidden';
            current++;
            if (current > 9) {
                window.bbSubmit(9, 9);
            } else {
                document.getElementById('defuse-target').innerText = `Жми: ${current}`;
            }
        } else {
            // Ошибка - нажал не то
            window.bbSubmit(val, current);
        }
    };
};

// Тайминг-сейф
window.BB_MECHANICS.timing_safe = function (wrapper, task) {
    wrapper.innerHTML = `
        <div class="d-flex flex-column align-items-center justify-content-center flex-grow-1">
            <div class="badge bg-light text-dark mb-5 border">${task.title}</div>
            <div class="position-relative w-100 bg-light rounded-pill mb-5" style="height: 40px; overflow: hidden; border: 2px solid #ddd;">
                <!-- Зеленая зона -->
                <div style="position: absolute; left: 40%; width: 20%; height: 100%; background: #28a745; opacity: 0.5;"></div>
                <!-- Бегунок -->
                <div id="safe-cursor" style="position: absolute; left: 0; width: 10px; height: 100%; background: var(--primary-color); shadow: 0 0 10px rgba(0,0,0,0.5);"></div>
            </div>
            <button class="btn btn-primary btn-lg rounded-pill px-5 py-3 fw-bold" onclick="window.checkSafe()">СТОП!</button>
        </div>`;

    let pos = 0;
    let dir = 1;
    const speed = task.speed || 3;

    const anim = () => {
        const cursor = document.getElementById('safe-cursor');
        if (!cursor) return;
        pos += dir * speed;
        if (pos > 98 || pos < 0) dir *= -1;
        cursor.style.left = pos + '%';
        requestAnimationFrame(anim);
    };
    requestAnimationFrame(anim);

    window.checkSafe = function () {
        const isWin = (pos >= 40 && pos <= 60);
        window.bbSubmit(pos, isWin ? pos : 'green-zone', null, isWin);
    };
};