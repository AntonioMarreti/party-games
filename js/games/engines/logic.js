// js/games/engines/logic.js

// JS/GAMES/ENGINES/LOGIC.JS

if (!window.BB_MECHANICS) window.BB_MECHANICS = {};

function bbLogicShell(wrapper, badgeTitle, contentHtml, extraClass = '') {
    wrapper.innerHTML = `
        <div class="bb-round-shell${extraClass ? ` ${extraClass}` : ''}">
            <div class="bb-game-badge">${badgeTitle}</div>
            ${contentHtml}
        </div>
    `;
}

// 1. МАТЕМАТИКА
window.BB_MECHANICS.math_blitz = function (wrapper, task) {
    let html = `
        <div class="text-center">
            <div class="bb-question-card bb-question-card--hero animate__animated animate__zoomIn">
                <h1 class="bb-question-text bb-question-text--hero text-break">${task.question}</h1>
            </div>
            <div class="bb-options-grid bb-options-grid--2">
    `;
    task.options.forEach(opt => {
        html += `<button class="btn bb-option-btn bb-option-btn--primary fs-2" 
            ${window.bbBuildSubmitActionAttrs(opt, task.correct_val)}>${opt}</button>`;
    });
    html += `</div></div>`;
    bbLogicShell(wrapper, task.title, html, 'text-center');
};

// 2. БОЛЬШЕ / МЕНЬШЕ
window.BB_MECHANICS.greater_less = function (wrapper, task) {
    let html = `
        <div class="bb-question-card">
            <div class="bb-question-kicker">Выбери большее значение</div>
            <h4 class="bb-question-text bb-question-text--small">${task.question}</h4>
        </div>
        
        <div class="bb-options-grid bb-options-grid--2">
            <button class="btn bb-option-btn bb-option-btn--primary d-flex align-items-center justify-content-center animate__animated animate__fadeInLeft" 
                style="font-size: 38px; line-height: 1.2;"
                ${window.bbBuildSubmitActionAttrs(task.n1_val, task.correct_val)}>
                ${task.n1_text}
            </button>
            
            <button class="btn bb-option-btn bb-option-btn--primary d-flex align-items-center justify-content-center animate__animated animate__fadeInRight" 
                style="font-size: 38px; line-height: 1.2;"
                ${window.bbBuildSubmitActionAttrs(task.n2_val, task.correct_val)}>
                ${task.n2_text}
            </button>
        </div>`;
    bbLogicShell(wrapper, task.title, html);
};

// Кости
window.BB_MECHANICS.dice_sum = function (wrapper, task) {
    bbLogicShell(wrapper, task.title, `
            <div class="bb-question-card bb-question-card--hero">
                <div class="bb-question-kicker">Сложи значения</div>
                <div class="d-flex justify-content-center gap-3 flex-wrap" style="font-size: 5rem; color: var(--primary-color); filter: drop-shadow(0 5px 5px rgba(0,0,0,0.1));">
                    ${task.icons.join('')}
                </div>
            </div>
            <div class="bb-options-grid bb-options-grid--2">
                ${task.options.map(opt => `
                    <button class="btn bb-option-btn bb-option-btn--primary p-4 fs-2" 
                        ${window.bbBuildSubmitActionAttrs(opt, task.correct_val)}>${opt}</button>
                `).join('')}
            </div>
    `);
};

// Алхимия
window.BB_MECHANICS.alchemy = function (wrapper, task) {
    bbLogicShell(wrapper, task.title, `
            <div class="bb-question-card bb-question-card--hero">
                <h1 class="bb-question-text bb-question-text--medium text-break" style="white-space: pre-wrap;">${task.question}</h1>
            </div>
            <div class="bb-options-grid bb-options-grid--2">
                ${task.options.map(opt => `
                    <button class="btn bb-option-btn bb-option-btn--primary fs-1" 
                        ${window.bbBuildSubmitActionAttrs(opt, task.correct_val)}>${opt}</button>
                `).join('')}
            </div>
    `, 'text-center');
};

// ПРОДОЛЖИ РЯД
window.BB_MECHANICS.number_sequence = function (wrapper, task) {
    // Если игра с иконками, мы передаем массив task.seq_array + добавляем '?' в конец
    // Иначе это обычная строка "1, 2, 3, ?" которую мы сплитим
    const parts = task.is_icons ? [...task.seq_array, '?'] : task.question.split(', ');

    let html = `
        <div class="text-center w-100">
            <div class="bb-question-card">
                <div class="bb-question-kicker">Продолжи ряд</div>
                <div class="d-flex flex-wrap justify-content-center gap-2 w-100 px-2" style="max-width: 400px; margin: 0 auto;">
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
            </div>
            
            <div class="bb-options-grid bb-options-grid--2" style="max-width: 400px;">
                ${task.options.map(opt => `
                    <button class="btn bb-option-btn bb-option-btn--primary p-3 fs-3 d-flex align-items-center justify-content-center" 
                        style="height: 80px;"
                        ${window.bbBuildSubmitActionAttrs(opt, task.correct_val)}>
                        ${task.is_icons ? `<i class="bi ${opt}" style="font-size: 2.5rem;"></i>` : opt}
                    </button>
                `).join('')}
            </div>
        </div>`;

    bbLogicShell(wrapper, task.title, html, 'text-center w-100');
};
