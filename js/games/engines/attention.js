// js/games/engines/attention.js

// JS/GAMES/ENGINES/ATTENTION.JS

if (!window.BB_MECHANICS) window.BB_MECHANICS = {};

// 1. ЦВЕТОВОЙ ХАОС
window.BB_MECHANICS.color_chaos = function (wrapper, task) {
    const mapColor = {
        'red': '#e63946',
        'blue': '#0077b6',
        'green': '#2a9d8f',
        'yellow': '#f9c74f',
        'orange': '#f3722c',
        'purple': '#5a189a',
        'pink': '#ff006e',
        'black': '#212529'
    };

    let html = `
        <div class="d-flex flex-column align-items-center justify-content-center flex-grow-1 pb-5 pt-5">
            <div class="bb-game-badge d-flex align-items-center gap-2">
                <span>${task.title}</span>
                <button class="btn btn-sm p-0 border-0 text-white opacity-50 hover-opacity-100" onclick="confirmForceExit()" title="Выйти в настройки">
                    <i class="bi bi-x-circle"></i>
                </button>
            </div>
            
            <h2 class="mb-4 text-center fw-bold" style="color:var(--text-muted);">${task.question}</h2>
            
            <h1 class="display-3 fw-bold mb-5 animate__animated animate__tada text-break px-3 text-center" 
                style="color: ${mapColor[task.color]}; font-size: 3rem; text-shadow: var(--shadow-sm); line-height: 1.2;">
                ${task.text}
            </h1>
            
            <div class="d-grid gap-3 w-100" style="grid-template-columns: 1fr 1fr;">
    `;

    task.options.forEach(opt => {
        html += `<button class="btn bb-glass-card border-0 shadow-sm p-3 fs-5 fw-bold" style="color:var(--text-main);" 
            onclick="window.bbSubmit('${opt}', '${task.correct_val}')">${opt}</button>`;
    });

    html += `</div></div>`;
    wrapper.innerHTML = html;
};

// 2. НАЙДИ ЛИШНЕЕ
window.BB_MECHANICS.odd_one_out = function (wrapper, task) {
    let html = `
        <div class="d-flex flex-column align-items-center justify-content-center flex-grow-1 pb-5 pt-5">
            <div class="bb-game-badge d-flex align-items-center gap-2">
                <span>${task.title}</span>
                <button class="btn btn-sm p-0 border-0 text-white opacity-50 hover-opacity-100" onclick="confirmForceExit()" title="Выйти в настройки">
                    <i class="bi bi-x-circle"></i>
                </button>
            </div>
            <h2 class="mb-5 fw-bold text-center animate__animated animate__fadeIn" style="color:var(--text-main);">${task.question}</h2>
            <div class="d-grid gap-2 w-100 px-3" style="grid-template-columns: repeat(4, 1fr);">
    `;

    task.options.forEach(opt => {
        // Check if it's an icon class
        const content = opt.startsWith('bi-')
            ? `<i class="bi ${opt}" style="pointer-events:none;"></i>`
            : opt;

        html += `<button class="btn bb-glass-card border-0 shadow-sm rounded-4 d-flex align-items-center justify-content-center p-0" 
            style="font-size: 2.5rem; height: 80px; color: var(--primary-color);" 
            onclick="window.bbSubmit('${opt}', '${task.correct_val}')">${content}</button>`;
    });
    html += `</div></div>`;
    wrapper.innerHTML = html;
};

// 3. НАЙДИ ДУБЛИКАТ
window.BB_MECHANICS.find_duplicate = function (wrapper, task) {
    wrapper.innerHTML = `
        <div class="d-flex flex-column align-items-center justify-content-center flex-grow-1 h-100">
            <div class="bb-game-badge d-flex align-items-center gap-2">
                <span>${task.title}</span>
                <button class="btn btn-sm p-0 border-0 text-white opacity-50 hover-opacity-100" onclick="confirmForceExit()" title="Выйти в настройки">
                    <i class="bi bi-x-circle"></i>
                </button>
            </div>
            <h4 class="mb-4 text-center fw-bold" style="color:var(--text-muted);">${task.question}</h4>
            <div class="d-grid gap-2 px-3" style="grid-template-columns: repeat(4, 1fr);">
                ${task.grid.map(emoji => `
                    <button class="btn bb-glass-card shadow-sm border-0 rounded-4 d-flex align-items-center justify-content-center p-0" 
                        style="font-size: 2.2rem; height: 75px;"
                        onclick="window.bbSubmit('${emoji}', '${task.correct_val}')">
                        ${emoji.startsWith('bi-') ? `<i class="bi ${emoji}" style="pointer-events:none;"></i>` : emoji}
                    </button>
                `).join('')}
            </div>
        </div>`;
};

// 4. СЧЕТ ОБЪЕКТОВ
window.BB_MECHANICS.count_objects = function (wrapper, task) {
    let questionHtml = task.question;
    if (task.target && task.target.startsWith('bi-')) {
        questionHtml = questionHtml.replace(task.target, `<i class="bi ${task.target} mx-1" style="font-size: 1.2em; vertical-align: middle; color: var(--primary-color);"></i>`);
    }

    wrapper.innerHTML = `
        <div class="d-flex flex-column align-items-center justify-content-center flex-grow-1 h-100">
            <div class="bb-game-badge d-flex align-items-center gap-2">
                <span>${task.title}</span>
                <button class="btn btn-sm p-0 border-0 text-white opacity-50 hover-opacity-100" onclick="confirmForceExit()" title="Выйти в настройки">
                    <i class="bi bi-x-circle"></i>
                </button>
            </div>
            <h4 class="mb-4 text-center text-muted fw-bold">${questionHtml}</h4>
            
            <div class="bb-glass-card p-4 rounded-4 mb-5 d-flex flex-wrap justify-content-center gap-3" style="max-width:320px; background: var(--bg-glass);">
                ${task.grid.map(emoji => `<span class="animate__animated animate__bounceIn" style="font-size: 2.5rem;">${emoji.startsWith('bi-') ? `<i class="bi ${emoji}"></i>` : emoji}</span>`).join('')}
            </div>
            
            <div class="d-flex justify-content-center gap-3 w-100 px-3">
                ${task.options.map(opt => `
                    <button class="btn bb-glass-card shadow-sm border-0 rounded-4 flex-grow-1 fw-bold fs-2" 
                        style="height: 70px; color: var(--primary-color) !important;" 
                        onclick="window.bbSubmit('${opt}', '${task.correct_val}')">
                        ${opt}
                    </button>
                `).join('')}
            </div>
        </div>`;
};

// 5. НАПЕРСТКИ (Thimbles / Shell game)
window.BB_MECHANICS.thimbles = function (wrapper, task) {
    if (!task.cups || !Array.isArray(task.swaps)) {
        wrapper.innerHTML = `
            <div class="d-flex flex-column align-items-center justify-content-center flex-grow-1 h-100 px-4">
                <i class="bi bi-exclamation-triangle-fill text-warning mb-3" style="font-size: 3rem;"></i>
                <h4 class="fw-bold text-center mb-2">Игра устарела</h4>
                <p class="text-muted text-center mb-4">Данные этого раунда сломаны. Нажмите кнопку ниже, чтобы сбросить игру и начать заново.</p>
                <button class="btn btn-primary rounded-pill px-4 py-2 fw-bold" onclick="confirmForceExit()">
                    <i class="bi bi-arrow-counterclockwise me-2"></i>Сбросить игру
                </button>
            </div>`;
        return;
    }

    const N = task.cups;
    const GAP = 110; // расстояние между позициями

    wrapper.innerHTML = `
        <div class="d-flex flex-column align-items-center justify-content-center flex-grow-1 h-100">
            <div class="bb-game-badge d-flex align-items-center gap-2">
                <span>${task.title}</span>
                <button class="btn btn-sm p-0 border-0 text-white opacity-50" onclick="confirmForceExit()" title="Выйти">
                    <i class="bi bi-x-circle"></i>
                </button>
            </div>
            <h3 class="mb-5 fw-bold text-center px-3" id="thimbles-status" style="color:var(--text-main);">${task.question}</h3>
            <div id="thimbles-stage" style="position:relative; height:130px; width:${(N-1)*GAP+80}px; margin:0 auto;"></div>
        </div>`;

    const stage = document.getElementById('thimbles-stage');
    const statusEl = document.getElementById('thimbles-status');

    // Шарик — позиция задаётся через translateX, не через left
    const ball = document.createElement('div');
    ball.style.cssText = `
        position:absolute; left:0; bottom:8px;
        width:36px; height:36px;
        background:radial-gradient(circle at 35% 35%, #ff6b6b, #c0392b);
        border-radius:50%;
        box-shadow:0 4px 14px rgba(192,57,43,0.5);
        z-index:1;
        transform: translateX(${task.initial_ball * GAP + 22}px);
    `;
    stage.appendChild(ball);

    // Стаканчики — все left:0, позиция только через translateX
    const cups = [];
    // cupX[i] = текущий translateX стаканчика i (в пикселях)
    const cupX = [];

    for (let i = 0; i < N; i++) {
        const c = document.createElement('div');
        const tx = i * GAP;
        c.style.cssText = `
            position:absolute; left:0; bottom:0;
            width:80px; height:110px;
            background:linear-gradient(160deg, var(--primary-color) 0%, color-mix(in srgb,var(--primary-color) 50%,black) 100%);
            border:2px solid rgba(255,255,255,0.2);
            box-shadow:0 6px 20px rgba(0,0,0,0.3);
            border-radius:18px 18px 8px 8px;
            z-index:2;
            display:flex; align-items:center; justify-content:center;
            cursor:pointer;
            transform: translateX(${tx}px) translateY(0px);
            will-change: transform;
        `;
        c.innerHTML = `<i class="bi bi-cup-hot-fill" style="font-size:2.8rem;color:rgba(255,255,255,0.15);pointer-events:none;"></i>`;
        c.addEventListener('click', () => { if (window.thimblesReady) window.handleCupClick(i); });
        stage.appendChild(c);
        cups.push(c);
        cupX.push(tx);
    }

    window.thimblesReady = false;

    // Логическая позиция: cupLogicPos[dom-index] = какой позиции сейчас находится стаканчик i
    const cupLogicPos = Array.from({length: N}, (_, i) => i);
    function cupAtLogic(lp) { return cupLogicPos.indexOf(lp); }

    function setCupTransform(domId, tx, ty, duration = 0) {
        if (duration > 0) {
            cups[domId].animate([
                { transform: cups[domId].style.transform || `translateX(${cupX[domId]}px) translateY(0px)` },
                { transform: `translateX(${tx}px) translateY(${ty}px)` }
            ], {
                duration: duration,
                easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
                fill: 'forwards'
            });
        }
        cups[domId].style.transform = `translateX(${tx}px) translateY(${ty}px)`;
        cupX[domId] = tx;
    }

    function setBallTransform(tx, duration = 0) {
        if (duration > 0) {
            ball.animate([
                { transform: ball.style.transform || `translateX(0px)` },
                { transform: `translateX(${tx}px)` }
            ], {
                duration: duration,
                easing: 'ease-out',
                fill: 'forwards'
            });
        }
        ball.style.transform = `translateX(${tx}px)`;
    }

    // Фаза 1: показываем шарик
    const initDom = cupAtLogic(task.initial_ball);
    setTimeout(() => {
        setCupTransform(initDom, cupX[initDom], -80, 500);
        setTimeout(() => {
            setCupTransform(initDom, cupX[initDom], 0, 500);
            setTimeout(() => {
                ball.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: 'forwards' });
                setTimeout(() => runSwaps(0), 600);
            }, 1000);
        }, 900);
    }, 400);

    let ballLogicPos = task.initial_ball;

    function runSwaps(idx) {
        if (idx >= task.swaps.length) {
            window.thimblesReady = true;
            if (window.bbResetTimer) window.bbResetTimer();
            if (statusEl) {
                statusEl.innerText = 'ГДЕ ШАРИК?';
                statusEl.style.color = 'var(--primary-color)';
            }
            return;
        }

        const [posA, posB] = task.swaps[idx];
        const domA = cupAtLogic(posA);
        const domB = cupAtLogic(posB);

        const txA_new = posB * GAP;
        const txB_new = posA * GAP;

        cups[domA].style.zIndex = '10';
        cups[domB].style.zIndex = '5';

        // Анимация через Element.animate
        const duration = 600;
        
        // domA идет дугой вверх
        cups[domA].animate([
            { transform: `translateX(${cupX[domA]}px) translateY(0px)` },
            { transform: `translateX(${(cupX[domA] + txA_new) / 2}px) translateY(-35px)`, offset: 0.5 },
            { transform: `translateX(${txA_new}px) translateY(0px)` }
        ], { duration, easing: 'ease-in-out', fill: 'forwards' });

        // domB идет по низу
        cups[domB].animate([
            { transform: `translateX(${cupX[domB]}px) translateY(0px)` },
            { transform: `translateX(${txB_new}px) translateY(0px)` }
        ], { duration, easing: 'ease-in-out', fill: 'forwards' });

        cupX[domA] = txA_new;
        cupX[domB] = txB_new;
        cups[domA].style.transform = `translateX(${txA_new}px) translateY(0px)`;
        cups[domB].style.transform = `translateX(${txB_new}px) translateY(0px)`;

        cupLogicPos[domA] = posB;
        cupLogicPos[domB] = posA;
        if (ballLogicPos === posA) ballLogicPos = posB;
        else if (ballLogicPos === posB) ballLogicPos = posA;

        setTimeout(() => runSwaps(idx + 1), duration + 150);
    }

    window.handleCupClick = function(domId) {
        if (!window.thimblesReady) return;
        window.thimblesReady = false;

        setCupTransform(domId, cupX[domId], -80, 400);

        const correctLogicPos = parseInt(task.correct_val);
        const clickedLogicPos = cupLogicPos[domId];

        setBallTransform(correctLogicPos * GAP + 22, 0);
        ball.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, fill: 'forwards' });

        if (clickedLogicPos !== correctLogicPos) {
            setTimeout(() => {
                const correctDom = cupAtLogic(correctLogicPos);
                setCupTransform(correctDom, cupX[correctDom], -80, 400);
            }, 400);
        }

        setTimeout(() => {
            window.bbSubmit(clickedLogicPos.toString(), task.correct_val.toString());
        }, 1500);
    };
};
