if (!window.BB_MECHANICS) window.BB_MECHANICS = {};

// СЪЕДОБНОЕ - НЕСЪЕДОБНОЕ
window.BB_MECHANICS.edible_inedible = function (wrapper, task) {
    let html = `
        <div class="d-flex flex-column align-items-center justify-content-center flex-grow-1 pb-5 pt-5">
            <div class="badge bg-light mb-5 border" style="color: var(--text-main);">${task.title}</div>
            
            <div class="p-5 mb-5 shadow-lg border-0 rounded-circle d-flex align-items-center justify-content-center" 
                 style="width: 200px; height: 200px; background: var(--bg-card); border: 2px solid var(--border-glass) !important;">
                <h2 class="fw-bold m-0 text-center" style="color:var(--text-main);">${task.item_name}</h2>
            </div>
            
            <div class="d-grid gap-3 w-100" style="grid-template-columns: 1fr 1fr;">
                <button class="btn p-4 fs-5 fw-bold rounded-4" style="background:var(--status-success); color:var(--text-on-accent);" 
                    onclick="window.bbSubmit('Съедобное', '${task.correct_val}')"><i class="bi bi-check-circle-fill me-2"></i> Съедобное</button>
                <button class="btn p-4 fs-5 fw-bold rounded-4" style="background:var(--status-error); color:var(--text-on-accent);" 
                    onclick="window.bbSubmit('Несъедобное', '${task.correct_val}')"><i class="bi bi-x-octagon-fill me-2"></i> Несъедобное</button>
            </div>
        </div>`;
    wrapper.innerHTML = html;
};

// ПРАВДА ИЛИ ВЫДУМКА
window.BB_MECHANICS.fact_check = function (wrapper, task) {
    let html = `
        <div class="d-flex flex-column align-items-center justify-content-center flex-grow-1 pb-5 pt-5 px-3">
            <div class="badge bg-light mb-4 border shadow-sm" style="color: var(--text-main); font-size: 14px;">${task.title}</div>
            
            <div class="p-4 mb-5 shadow rounded-4 d-flex align-items-center justify-content-center text-center" 
                 style="min-height: 180px; width: 100%; max-width: 450px; background: var(--bg-card); border: 2px solid var(--border-glass) !important;">
                <h4 class="fw-bold m-0" style="color:var(--text-main); line-height: 1.4;">${task.fact}</h4>
            </div>
            
            <div class="d-grid gap-3 w-100" style="grid-template-columns: 1fr 1fr; max-width: 450px;">
                <button class="btn p-3 fs-6 fw-bold rounded-4 shadow-sm d-flex align-items-center justify-content-center" style="background:#2ecc71; color:white; border:none; white-space: nowrap;" 
                    onclick="window.bbSubmit('Правда', '${task.correct_val}')"><i class="bi bi-check-circle-fill me-2"></i> Правда</button>
                <button class="btn p-3 fs-6 fw-bold rounded-4 shadow-sm d-flex align-items-center justify-content-center" style="background:#e74c3c; color:white; border:none; white-space: nowrap;" 
                    onclick="window.bbSubmit('Ложь', '${task.correct_val}')"><i class="bi bi-x-circle-fill me-2"></i> Ложь</button>
            </div>`;
    wrapper.innerHTML = html;
};

// ФЛАГИ
window.BB_MECHANICS.flags = function (wrapper, task) {
    let html = `
        <div class="d-flex flex-column align-items-center justify-content-center flex-grow-1 pb-5 pt-5 px-3">
            <div class="bb-game-badge shadow-sm" style="color: var(--text-main);">${task.title}</div>
            
            <div class="p-4 mb-5 shadow-lg rounded-4 d-flex align-items-center justify-content-center text-center animate__animated animate__zoomIn" 
                 style="min-height: 180px; width: 100%; max-width: 450px; background: var(--bg-card); border: 2px solid var(--border-glass) !important;">
                <span style="font-size: 8rem; line-height: 1; filter: drop-shadow(0px 10px 15px rgba(0,0,0,0.15));">${task.flag}</span>
            </div>
            
            <div class="d-flex flex-column gap-3 w-100 mx-auto" style="max-width: 450px;">
    `;

    // В отличие от СЪЕДОБНОЕ/НЕСЪЕДОБНОЕ тут 4 варианта. Расположим их списком друг под другом или сеткой 2х2.
    // Сетка 2х2 для стран со средним и длинным названием будет красивее (если влезает) или две колонки.
    // Сделаем 2 колонки
    html += `<div class="d-grid gap-3 w-100" style="grid-template-columns: 1fr 1fr;">`;

    task.options.forEach(opt => {
        html += `
            <button class="btn bb-glass-card shadow-sm p-3 fs-5 fw-bold border-0 text-primary d-flex align-items-center justify-content-center" 
                style="border-radius: 16px; transition: transform 0.1s; height: 80px;"
                onmousedown="this.style.transform='scale(0.95)'"
                onmouseup="this.style.transform='none'"
                onclick="window.bbSubmit('${opt}', '${task.correct_val}')">
                <span class="text-truncate w-100 text-center" style="white-space: normal; line-height: 1.2; font-size: 1rem;">${opt}</span>
            </button>
        `;
    });

    html += `
            </div>
        </div>`;
    wrapper.innerHTML = html;
};