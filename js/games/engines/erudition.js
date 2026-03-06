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
                    onclick="window.bbSubmit('Съедобное', '${task.correct_val}')">😋 Съедобное</button>
                <button class="btn p-4 fs-5 fw-bold rounded-4" style="background:var(--status-error); color:var(--text-on-accent);" 
                    onclick="window.bbSubmit('Несъедобное', '${task.correct_val}')">🤢 Несъедобное</button>
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
                <button class="btn p-3 fs-5 fw-bold rounded-4 shadow-sm" style="background:#2ecc71; color:white; border:none;" 
                    onclick="window.bbSubmit('Правда', '${task.correct_val}')">✅ Правда</button>
                <button class="btn p-3 fs-5 fw-bold rounded-4 shadow-sm" style="background:#e74c3c; color:white; border:none;" 
                    onclick="window.bbSubmit('Выдумка', '${task.correct_val}')">❌ Выдумка</button>
            </div>
        </div>`;
    wrapper.innerHTML = html;
};