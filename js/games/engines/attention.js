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
            <div class="bb-game-badge">${task.title}</div>
            
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
            <div class="bb-game-badge">${task.title}</div>
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
            <div class="bb-game-badge">${task.title}</div>
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
    wrapper.innerHTML = `
        <div class="d-flex flex-column align-items-center justify-content-center flex-grow-1 h-100">
            <div class="bb-game-badge">${task.title}</div>
            <h4 class="mb-4 text-center text-muted fw-bold">${task.question}</h4>
            
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
    let html = `
        <div class="d-flex flex-column align-items-center justify-content-center flex-grow-1 h-100">
            <div class="bb-game-badge">${task.title}</div>
            <h3 class="mb-5 fw-bold text-center px-3" id="thimbles-status" style="color:var(--text-main);">${task.question}</h3>
            
            <div id="thimbles-container" style="position: relative; width: 300px; height: 180px; margin: 0 auto;">
                <!-- Шарик -->
                <div id="thimble-ball" style="position: absolute; bottom: 10px; left: 0px; width: 80px; text-align: center; font-size: 2.5rem; transition: left 0.4s ease; z-index: 1;">
                    <i class="bi bi-circle-fill text-danger shadow-sm rounded-circle"></i>
                </div>
    `;

    // 3 наперстка
    for (let i = 0; i < task.cups; i++) {
        html += `
            <div id="cup-${i}" class="cup-element" style="position: absolute; bottom: 0; left: ${i * 110}px; width: 80px; height: 100px; background: color-mix(in srgb, var(--primary-color) 80%, black); border: 3px solid var(--primary-color); border-radius: 15px 15px 5px 5px; z-index: 2; transition: transform 0.4s ease, bottom 0.4s ease; display: flex; align-items: center; justify-content: center; cursor: pointer;" onclick="if(window.thimblesReady) window.handleCupClick(${i})">
                <i class="bi bi-cup-hot-fill" style="font-size: 3rem; color: rgba(255,255,255,0.3);"></i>
            </div>
        `;
    }

    html += `</div></div>`;
    wrapper.innerHTML = html;

    window.thimblesReady = false;
    let logicToDOM = [0, 1, 2]; // В какой логической позиции X (0, 1, 2) какой DOM элемент (0, 1, 2)
    let posMap = [0, 110, 220]; // Координаты для каждой логической позиции

    // 1. Показываем шарик
    const ballPos = task.initial_ball;
    const b = document.getElementById('thimble-ball');
    b.style.left = posMap[ballPos] + 'px';

    setTimeout(() => {
        if (wrapper.dataset.taskId !== JSON.stringify(task)) return;
        // Поднимаем стаканчик
        document.getElementById(`cup-${logicToDOM[ballPos]}`).style.bottom = '80px';

        // Опускаем стаканчик
        setTimeout(() => {
            if (wrapper.dataset.taskId !== JSON.stringify(task)) return;
            document.getElementById(`cup-${logicToDOM[ballPos]}`).style.bottom = '0px';
            b.style.opacity = '0'; // Прячем настоящий шарик для иллюзии

            // Начинаем перемешивания
            setTimeout(() => {
                startSwaps(0);
            }, 600);
        }, 1500);
    }, 500);

    function startSwaps(swapIndex) {
        if (wrapper.dataset.taskId !== JSON.stringify(task)) return;

        if (swapIndex >= task.swaps.length) {
            // Закончили
            window.thimblesReady = true;
            const st = document.getElementById('thimbles-status');
            if (st) {
                st.innerText = "ГДЕ ШАРИК?";
                st.classList.add('text-primary', 'animate__animated', 'animate__flash');
            }
            return;
        }

        let swap = task.swaps[swapIndex];
        let posA = swap[0];
        let posB = swap[1];

        let domA = logicToDOM[posA];
        let domB = logicToDOM[posB];

        let cupA = document.getElementById(`cup-${domA}`);
        let cupB = document.getElementById(`cup-${domB}`);

        // Вычисляем, куда им нужно сдвинуться относительно их изначального положения
        // cupA изначально был на left: domA * 110. Сейчас он на logicToDOM[posA]... стоп!
        // transform: translateX не меняет left. 
        // Поэтому нам нужно вычислять translateX относительно оригинального position: left (${domA * 110}).
        // Позиция, в которую он должен встать - posMap[posB].
        // Значит translateX = posMap[posB] - (domA * 110).

        let dxA = posMap[posB] - (domA * 110);
        let dxB = posMap[posA] - (domB * 110);

        // Для красивой дуги добавляем translateY посреди пути
        cupA.style.transform = `translateX(${(dxA + (posMap[posA] - (domA * 110))) / 2}px) translateY(-30px)`;
        cupB.style.transform = `translateX(${(dxB + (posMap[posB] - (domB * 110))) / 2}px) translateY(30px)`;

        setTimeout(() => {
            cupA.style.transform = `translateX(${dxA}px) translateY(0px)`;
            cupB.style.transform = `translateX(${dxB}px) translateY(0px)`;
        }, 200);

        // Обновляем логическую карту
        logicToDOM[posA] = domB;
        logicToDOM[posB] = domA;

        // Следующий сдвиг
        setTimeout(() => {
            startSwaps(swapIndex + 1);
        }, 450); // немного быстрее для динамики
    }

    window.handleCupClick = function (domIndex) {
        if (!window.thimblesReady) return;
        window.thimblesReady = false; // блочим повторные клики

        let currentLogicPos = logicToDOM.indexOf(domIndex);

        const cup = document.getElementById(`cup-${domIndex}`);
        cup.style.bottom = '80px';

        // Показываем шарик под тем стаканчиком, где он реально есть
        let correctLogicPos = parseInt(task.correct_val);
        b.style.left = posMap[correctLogicPos] + 'px';
        b.style.opacity = '1';
        b.style.transition = 'none'; // чтобы шарик не улетел

        // Если юзер кликнул не туда, то его стаканчик пустой, а мы поднимем правильный через полсекунды
        if (currentLogicPos !== correctLogicPos) {
            setTimeout(() => {
                let correctDomIndex = logicToDOM[correctLogicPos];
                document.getElementById(`cup-${correctDomIndex}`).style.bottom = '80px';
            }, 600);
        }

        setTimeout(() => {
            window.bbSubmit(currentLogicPos.toString(), task.correct_val.toString());
        }, 1500); // Даем посмотреть результат и отправляем на сервер
    };
};