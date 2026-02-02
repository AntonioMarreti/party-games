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
            
            <h2 class="mb-4 text-center text-muted fw-bold">${task.question}</h2>
            
            <h1 class="display-1 fw-bold mb-5 animate__animated animate__tada" 
                style="color: ${mapColor[task.color]}; font-size: 4rem; text-shadow: 0 4px 10px rgba(0,0,0,0.1);">
                ${task.text}
            </h1>
            
            <div class="d-grid gap-3 w-100" style="grid-template-columns: 1fr 1fr;">
    `;

    task.options.forEach(opt => {
        html += `<button class="btn bb-glass-card border-0 shadow-sm p-3 fs-5 fw-bold text-dark" 
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
            <h2 class="mb-5 fw-bold text-center animate__animated animate__fadeIn text-dark">${task.question}</h2>
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
            <h4 class="mb-4 text-muted text-center fw-bold">${task.question}</h4>
            <div class="d-grid gap-2 px-3" style="grid-template-columns: repeat(4, 1fr);">
                ${task.grid.map(emoji => `
                    <button class="btn bb-glass-card shadow-sm border-0 rounded-4 d-flex align-items-center justify-content-center p-0" 
                        style="font-size: 2.2rem; height: 75px;"
                        onclick="window.bbSubmit('${emoji}', '${task.correct_val}')">
                        ${emoji}
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
            
            <div class="bb-glass-card p-4 rounded-4 mb-5 d-flex flex-wrap justify-content-center gap-3" style="max-width:320px; background: rgba(255,255,255,0.5);">
                ${task.grid.map(emoji => `<span class="animate__animated animate__bounceIn" style="font-size: 2.5rem;">${emoji}</span>`).join('')}
            </div>
            
            <div class="d-flex justify-content-center gap-3 w-100 px-3">
                ${task.options.map(opt => `
                    <button class="btn bb-glass-card shadow-sm border-0 rounded-4 flex-grow-1 fw-bold text-primary fs-2" 
                        style="height: 70px;"
                        onclick="window.bbSubmit('${opt}', '${task.correct_val}')">
                        ${opt}
                    </button>
                `).join('')}
            </div>
        </div>`;
};