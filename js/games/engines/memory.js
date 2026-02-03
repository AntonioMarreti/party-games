if (!window.BB_MECHANICS) window.BB_MECHANICS = {};

// ФОТОПАМЯТЬ
// 1. ФОТОПАМЯТЬ
window.BB_MECHANICS.photo_memory = function (wrapper, task) {
    // Фаза 1: Показ
    let html = `
        <div id="mem-phase-1" class="d-flex flex-column align-items-center justify-content-center flex-grow-1">
            <div class="bb-game-badge">${task.title}</div>
            <h2 class="mb-5 fw-bold" style="color:var(--text-main);">Запомни!</h2>
            <div class="d-flex gap-4 mb-5">
                ${task.shown_items.map(i => `
                    <div class="bb-glass-card d-flex align-items-center justify-content-center" style="width: 80px; height: 80px; font-size: 2rem; font-weight: bold; color: var(--primary-color);">
                        ${i}
                    </div>
                `).join('')}
            </div>
            <div class="progress w-75 rounded-pill" style="height: 12px; background: var(--bg-secondary);">
                <div class="progress-bar" style="width: 100%; transition: width 3s linear; background: linear-gradient(90deg, var(--primary-color), color-mix(in srgb, var(--primary-color), white 30%)); border-radius: 10px;"></div>
            </div>
        </div>
    `;

    wrapper.innerHTML = html;

    // Анимация таймера
    setTimeout(() => {
        const bar = wrapper.querySelector('.progress-bar');
        if (bar) bar.style.width = '0%';
    }, 100);

    // Фаза 2: Вопрос (через 3 сек)
    setTimeout(() => {
        if (wrapper.dataset.taskId !== JSON.stringify(task)) return; // Если ушли с экрана

        let html2 = `
            <div class="d-flex flex-column align-items-center justify-content-center flex-grow-1 h-100">
                <div class="bb-game-badge">${task.title}</div>
                <h2 class="mb-5 animate__animated animate__fadeIn fw-bold text-center" style="color:var(--text-main);">${task.phase2_q}</h2>
                <div class="d-grid gap-3 w-100 px-3" style="grid-template-columns: 1fr 1fr;">
        `;
        task.options.forEach(opt => {
            html2 += `<button class="btn bb-glass-card p-4 fs-3 fw-bold border-0" style="color:var(--primary-color);" 
                onclick="window.bbSubmit('${opt}', '${task.correct_val}')">${opt}</button>`;
        });
        html2 += `</div></div>`;
        wrapper.innerHTML = html2;

    }, 3000);
};

// СЛЕПОЙ СЕКУНДОМЕР
window.BB_MECHANICS.blind_timer = function (wrapper, task) {
    window.bbBattleStartTime = 0;
    window.bbBlindTarget = task.target || 5000;

    let html = `
        <div class="d-flex flex-column align-items-center justify-content-center flex-grow-1 text-center">
            <div class="bb-game-badge">${task.title}</div>
            <h1 class="display-4 fw-bold mb-3" style="color:var(--text-main);">${task.question}</h1>
            
            <div id="blind-timer-display" class="display-1 fw-bold font-monospace my-5 text-primary" style="font-variant-numeric: tabular-nums;">0.00</div>
            
            <div class="d-grid w-100 px-4">
                <button id="blind-btn" class="bb-start-btn" onclick="window.bbBlindClick()">СТАРТ</button>
            </div>
        </div>
    `;
    wrapper.innerHTML = html;

    window.bbBlindState = 'ready'; // ready -> running -> stopped
};

window.bbBlindClick = function () {
    const display = document.getElementById('blind-timer-display');
    const btn = document.getElementById('blind-btn');

    if (window.bbBlindState === 'ready') {
        // СТАРТ
        window.bbBlindState = 'running';
        window.bbBattleStartTime = performance.now();
        btn.innerText = "СТОП";
        btn.style.background = "linear-gradient(135deg, #FF7675 0%, #D63031 100%)";
        btn.style.boxShadow = "0 10px 30px rgba(214, 48, 49, 0.3)";

        // Тикаем немного, потом скрываем
        window.bbBlindInterval = setInterval(() => {
            const diff = (performance.now() - window.bbBattleStartTime) / 1000;

            if (diff > 1.5) {
                display.innerText = "???";
                display.style.color = "var(--text-muted)";
            } else {
                display.innerText = diff.toFixed(2);
            }
        }, 50);

    } else if (window.bbBlindState === 'running') {
        // СТОП
        clearInterval(window.bbBlindInterval);
        const timeMs = performance.now() - window.bbBattleStartTime;
        const timeSec = timeMs / 1000;

        display.style.color = "var(--primary-color)";
        display.innerHTML = timeSec.toFixed(3); // Показываем точный результат

        // Считаем точность
        const target = window.bbBlindTarget || 5000;
        const diff = Math.abs(target - timeMs);

        // Визуальный фидбек по кнопке
        btn.disabled = true;
        btn.style.opacity = '0.5';

        // Отправляем
        setTimeout(() => {
            window.bbSubmit(null, null, diff, true);
        }, 1200);
    }
};

window.BB_MECHANICS.simon_says = function (wrapper, task) {
    const sequence = task.sequence; // Массив цветов
    let userSequence = [];

    const colorMap = {
        'red': { bg: '#ff7675', active: '#d63031', icon: 'bi-app' },
        'blue': { bg: '#74b9ff', active: '#0984e3', icon: 'bi-app' },
        'green': { bg: '#55efc4', active: '#00b894', icon: 'bi-app' },
        'yellow': { bg: '#ffeaa7', active: '#fdcb6e', icon: 'bi-app' }
    };

    // 1. Отрисовываем поле
    wrapper.innerHTML = `
        <div class="d-flex flex-column align-items-center justify-content-center flex-grow-1">
            <div class="bb-game-badge">${task.title}</div>
            <h2 id="simon-status" class="mb-5 fw-bold text-center" style="color:var(--text-muted);">ЗАПОМИНАЙ</h2>
            
            <div id="simon-display" class="mb-5 rounded-circle shadow-sm d-flex align-items-center justify-content-center animate__animated" 
                 style="width: 140px; height: 140px; background: white; border: 4px solid #f1f2f6;">
                 <i class="bi bi-eye-fill" style="font-size: 3rem; color:var(--text-muted);"></i>
            </div>

            <div class="d-grid gap-3 w-100 px-3" style="grid-template-columns: 1fr 1fr;" id="simon-buttons">
                ${Object.keys(colorMap).map(c => `
                    <button class="btn p-0 rounded-4 border-0 shadow-sm simon-btn disabled" 
                            id="btn-simon-${c}"
                            style="background: ${colorMap[c].bg}; height: 100px; transition: transform 0.1s; border: 1px solid var(--border-glass) !important;" 
                            onclick="window.handleSimonClick('${c}', '${task.correct_val}')">
                    </button>
                `).join('')}
            </div>
        </div>
    `;

    // 2. Показываем последовательность (МЕДЛЕННЕЕ)
    let i = 0;
    const interval = setInterval(() => {
        const display = document.getElementById('simon-display');
        if (!display) { clearInterval(interval); return; }

        if (i < sequence.length) {
            const color = sequence[i];
            const btn = document.getElementById(`btn-simon-${color}`);

            // Highlight Button directly for better connection
            if (btn) {
                btn.style.opacity = '1';
                btn.style.transform = 'scale(1.05)';
                btn.style.filter = 'brightness(1.2)';
            }

            display.style.background = colorMap[color].bg;
            display.innerHTML = ''; // Clear icon
            display.style.borderColor = colorMap[color].active;
            display.classList.add('animate__pulse');

            setTimeout(() => {
                if (btn) {
                    btn.style.transform = 'scale(1)';
                    btn.style.filter = 'none';
                }

                display.classList.remove('animate__pulse');
                display.style.background = 'white';
                display.style.borderColor = '#f1f2f6';
                display.innerHTML = '<i class="bi bi-eye-fill" style="font-size: 3rem; color:var(--text-muted);"></i>';
            }, 800); // Increased view time
            i++;
        } else {
            clearInterval(interval);
            // 3. Даем игроку нажимать
            const status = document.getElementById('simon-status');
            if (status) {
                status.innerText = "ПОВТОРЯЙ!";
                status.classList.remove('text-muted');
                status.classList.add('text-primary', 'animate__animated', 'animate__flash');
            }
            document.querySelectorAll('.simon-btn').forEach(btn => {
                btn.classList.remove('disabled');
            });
        }
    }, 1300); // 1300ms interval (Slower)

    // 4. Обработка клика
    window.handleSimonClick = function (color, correctStr) {
        userSequence.push(color);
        const correctArray = correctStr.split(',');

        // Проверка
        const currentIndex = userSequence.length - 1;
        if (userSequence[currentIndex] !== correctArray[currentIndex]) {
            // Ошибка!
            window.bbSubmit(userSequence.join(','), correctStr);
        } else if (userSequence.length === correctArray.length) {
            // Всё верно!
            window.bbSubmit(correctStr, correctStr);
        }
    };
};