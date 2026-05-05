if (!window.BB_MECHANICS) window.BB_MECHANICS = {};

function bbEruditionShell(wrapper, badgeTitle, contentHtml) {
    wrapper.innerHTML = `
        <div class="bb-round-shell">
            <div class="bb-game-badge" style="color: var(--text-main);">${badgeTitle}</div>
            ${contentHtml}
        </div>
    `;
}

// СЪЕДОБНОЕ - НЕСЪЕДОБНОЕ
window.BB_MECHANICS.edible_inedible = function (wrapper, task) {
    bbEruditionShell(wrapper, task.title, `
            <div class="p-5 mb-5 shadow-lg border-0 rounded-circle d-flex align-items-center justify-content-center mx-auto" 
                 style="width: 200px; height: 200px; background: var(--bg-card); border: 2px solid var(--border-glass) !important;">
                <h2 class="fw-bold m-0 text-center" style="color:var(--text-main);">${task.item_name}</h2>
            </div>
            
            <div class="bb-options-grid bb-options-grid--2">
                <button class="btn bb-option-btn bb-option-btn--success p-4 fs-5" 
                    ${window.bbBuildSubmitActionAttrs('Съедобное', task.correct_val)}><i class="bi bi-check-circle-fill me-2"></i> Съедобное</button>
                <button class="btn bb-option-btn bb-option-btn--danger p-4 fs-5" 
                    ${window.bbBuildSubmitActionAttrs('Несъедобное', task.correct_val)}><i class="bi bi-x-octagon-fill me-2"></i> Несъедобное</button>
            </div>
    `);
};

// ПРАВДА ИЛИ ВЫДУМКА
window.BB_MECHANICS.fact_check = function (wrapper, task) {
    bbEruditionShell(wrapper, task.title, `
            <div class="bb-question-card" style="min-height: 180px; max-width: 450px; display:flex; align-items:center; justify-content:center;">
                <div>
                    <div class="bb-question-kicker">Правда или выдумка</div>
                    <h4 class="bb-question-text bb-question-text--small">${task.fact}</h4>
                </div>
            </div>
            
            <div class="bb-options-grid bb-options-grid--2" style="max-width: 450px;">
                <button class="btn bb-option-btn bb-option-btn--success p-3 fs-6 d-flex align-items-center justify-content-center" style="white-space: nowrap;" 
                    ${window.bbBuildSubmitActionAttrs('Правда', task.correct_val)}><i class="bi bi-check-circle-fill me-2"></i> Правда</button>
                <button class="btn bb-option-btn bb-option-btn--danger p-3 fs-6 d-flex align-items-center justify-content-center" style="white-space: nowrap;" 
                    ${window.bbBuildSubmitActionAttrs('Ложь', task.correct_val)}><i class="bi bi-x-circle-fill me-2"></i> Ложь</button>
            </div>
    `);
};

// ФЛАГИ
window.BB_MECHANICS.flags = function (wrapper, task) {
    let html = `
            <div class="bb-question-card bb-question-card--hero animate__animated animate__zoomIn" 
                 style="min-height: 180px; max-width: 450px; display:flex; align-items:center; justify-content:center;">
                <span style="font-size: 8rem; line-height: 1; filter: drop-shadow(0px 10px 15px rgba(0,0,0,0.15));">${task.flag}</span>
            </div>
            
            <div class="bb-options-grid bb-options-grid--2" style="max-width: 450px;">
    `;

    task.options.forEach(opt => {
        html += `
            <button class="btn bb-option-btn bb-option-btn--primary p-3 fs-5 d-flex align-items-center justify-content-center" 
                style="height: 80px;"
                ${window.bbBuildSubmitActionAttrs(opt, task.correct_val)}>
                <span class="bb-option-btn__label" style="font-size: 1rem;">${opt}</span>
            </button>
        `;
    });

    html += `
            </div>`;
    bbEruditionShell(wrapper, task.title, html);
};
