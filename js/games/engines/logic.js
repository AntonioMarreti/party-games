// js/games/engines/logic.js

// JS/GAMES/ENGINES/LOGIC.JS

if (!window.BB_MECHANICS) window.BB_MECHANICS = {};

// 1. МАТЕМАТИКА
window.BB_MECHANICS.math_blitz = function (wrapper, task) {
    let html = `
        <div class="d-flex flex-column align-items-center justify-content-center flex-grow-1 pb-5 pt-5 px-3 text-center">
            <div class="bb-game-badge">${task.title}</div>
            <h1 class="display-3 fw-bold mb-5 animate__animated animate__zoomIn text-break" style="color: var(--primary-color); text-shadow: 0 5px 15px color-mix(in srgb, var(--primary-color), transparent 80%);">${task.question}</h1>
            <div class="d-grid gap-3 w-100" style="grid-template-columns: 1fr 1fr;">
    `;
    task.options.forEach(opt => {
        html += `<button class="btn bb-glass-card p-4 fs-2 fw-bold border-0 text-primary" 
            onclick="window.bbSubmit('${opt}', '${task.correct_val}')">${opt}</button>`;
    });
    html += `</div></div>`;
    wrapper.innerHTML = html;
};

// 2. БОЛЬШЕ / МЕНЬШЕ
window.BB_MECHANICS.greater_less = function (wrapper, task) {
    let html = `
        <div class="d-flex flex-column align-items-center justify-content-center flex-grow-1 pb-5 pt-5">
            <div class="bb-game-badge">${task.title}</div>
            <h4 class="mb-5 text-muted text-center fw-bold">${task.question}</h4>
            
            <div class="d-flex gap-3 w-100 px-2 h-50">
                <button class="btn bb-glass-card border-0 flex-grow-1 d-flex align-items-center justify-content-center animate__animated animate__fadeInLeft" 
                    style="border-radius: 32px; font-size: 38px; font-weight: 800; color: var(--primary-color); line-height: 1.2;"
                    onclick="window.bbSubmit('${task.n1_val}', '${task.correct_val}')">
                    ${task.n1_text}
                </button>
                
                <button class="btn bb-glass-card border-0 flex-grow-1 d-flex align-items-center justify-content-center animate__animated animate__fadeInRight" 
                    style="border-radius: 32px; font-size: 38px; font-weight: 800; color: var(--primary-color); line-height: 1.2;"
                    onclick="window.bbSubmit('${task.n2_val}', '${task.correct_val}')">
                    ${task.n2_text}
                </button>
            </div>
        </div>`;
    wrapper.innerHTML = html;
};

// Кости
window.BB_MECHANICS.dice_sum = function (wrapper, task) {
    wrapper.innerHTML = `
        <div class="d-flex flex-column align-items-center justify-content-center flex-grow-1">
            <div class="bb-game-badge">${task.title}</div>
            <div class="d-flex gap-3 mb-5" style="font-size: 5rem; color: var(--primary-color); filter: drop-shadow(0 5px 5px rgba(0,0,0,0.1));">
                ${task.icons.join('')}
            </div>
            <div class="d-grid gap-3 w-100" style="grid-template-columns: 1fr 1fr;">
                ${task.options.map(opt => `
                    <button class="btn bb-glass-card p-4 fs-2 fw-bold border-0 text-primary" 
                        onclick="window.bbSubmit('${opt}', '${task.correct_val}')">${opt}</button>
                `).join('')}
            </div>
        </div>`;
};

// Алхимия
window.BB_MECHANICS.alchemy = function (wrapper, task) {
    wrapper.innerHTML = `
        <div class="d-flex flex-column align-items-center justify-content-center flex-grow-1 px-3 text-center">
            <div class="bb-game-badge">${task.title}</div>
            <h1 class="display-3 mb-5 fw-bold text-break" style="white-space: pre-wrap;">${task.question}</h1>
            <div class="d-grid gap-3 w-100" style="grid-template-columns: 1fr 1fr;">
                ${task.options.map(opt => `
                    <button class="btn bb-glass-card p-4 fs-1 border-0" 
                        onclick="window.bbSubmit('${opt}', '${task.correct_val}')">${opt}</button>
                `).join('')}
            </div>
        </div>`;
};

// ПРОДОЛЖИ РЯД
window.BB_MECHANICS.number_sequence = function (wrapper, task) {
    // Если игра с иконками, мы передаем массив task.seq_array + добавляем '?' в конец
    // Иначе это обычная строка "1, 2, 3, ?" которую мы сплитим
    const parts = task.is_icons ? [...task.seq_array, '?'] : task.question.split(', ');

    let html = `
        <div class="d-flex flex-column align-items-center justify-content-center flex-grow-1 px-3 text-center w-100">
            <div class="bb-game-badge">${task.title}</div>
            
            <div class="d-flex flex-wrap justify-content-center gap-2 mb-5 w-100 px-2" style="max-width: 400px;">
    `;

    parts.forEach((p, idx) => {
        let isQuestion = p === '?';
        let bgStyle = isQuestion ? 'background: linear-gradient(135deg, var(--primary-color), #8a2be2); border: none;' : 'background: var(--bg-card); border: 2px solid var(--border-glass);';
        let textColor = isQuestion ? 'color: white;' : 'color: var(--text-main);';
        let animate = isQuestion ? 'animate__animated animate__pulse animate__infinite' : 'animate__animated animate__zoomIn';
        let delay = isQuestion ? '' : `animation-delay: ${idx * 0.1}s;`;

        let content = isQuestion ? '?' : (task.is_icons ? `<i class="bi ${p}"></i>` : p);

        html += `
            <div class="d-flex align-items-center justify-content-center shadow-sm rounded-4 ${animate}" 
                 style="width: 70px; height: 70px; font-size: 1.8rem; font-weight: 800; ${bgStyle} ${textColor} ${delay}">
                ${content}
            </div>
        `;
    });

    html += `
            </div>
            
            <div class="d-grid gap-3 w-100" style="grid-template-columns: 1fr 1fr; max-width: 400px;">
                ${task.options.map(opt => `
                    <button class="btn bb-glass-card shadow-sm p-3 fs-3 fw-bold border-0 text-primary d-flex align-items-center justify-content-center" 
                        style="border-radius: 16px; transition: transform 0.1s; height: 80px;"
                        onmousedown="this.style.transform='scale(0.95)'"
                        onmouseup="this.style.transform='none'"
                        onclick="window.bbSubmit('${opt}', '${task.correct_val}')">
                        ${task.is_icons ? `<i class="bi ${opt}" style="font-size: 2.5rem;"></i>` : opt}
                    </button>
                `).join('')}
            </div>
        </div>`;

    wrapper.innerHTML = html;
};