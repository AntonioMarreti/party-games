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