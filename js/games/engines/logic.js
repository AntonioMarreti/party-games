// js/games/engines/logic.js

// JS/GAMES/ENGINES/LOGIC.JS

if (!window.BB_MECHANICS) window.BB_MECHANICS = {};

// 1. МАТЕМАТИКА
window.BB_MECHANICS.math_blitz = function (wrapper, task) {
    let html = `
        <div class="d-flex flex-column align-items-center justify-content-center flex-grow-1 pb-5 pt-5">
            <div class="bb-game-badge">${task.title}</div>
            <h1 class="display-1 fw-bold mb-5 animate__animated animate__zoomIn" style="color: #6C5CE7; text-shadow: 0 5px 15px rgba(108, 92, 231, 0.2);">${task.question}</h1>
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
                    style="border-radius: 32px; font-size: 38px; font-weight: 800; color: #6C5CE7; line-height: 1.2;"
                    onclick="window.bbSubmit('${task.n1_val}', '${task.correct_val}')">
                    ${task.n1_text}
                </button>
                
                <button class="btn bb-glass-card border-0 flex-grow-1 d-flex align-items-center justify-content-center animate__animated animate__fadeInRight" 
                    style="border-radius: 32px; font-size: 38px; font-weight: 800; color: #6C5CE7; line-height: 1.2;"
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
            <div class="d-flex gap-3 mb-5" style="font-size: 5rem; color: #6C5CE7; filter: drop-shadow(0 5px 5px rgba(0,0,0,0.1));">
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
        <div class="d-flex flex-column align-items-center justify-content-center flex-grow-1">
            <div class="bb-game-badge">${task.title}</div>
            <h1 class="display-1 mb-5">${task.question}</h1>
            <div class="d-grid gap-3 w-100" style="grid-template-columns: 1fr 1fr;">
                ${task.options.map(opt => `
                    <button class="btn bb-glass-card p-4 fs-1 border-0" 
                        onclick="window.bbSubmit('${opt}', '${task.correct_val}')">${opt}</button>
                `).join('')}
            </div>
        </div>`;
};