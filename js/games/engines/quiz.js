// js/games/engines/quiz.js
(function () {
    window.BB_MECHANICS = window.BB_MECHANICS || {};

    window.BB_MECHANICS.ai_quiz = function (wrapper, task) {
        // reuse math blitz layout but with adapted text
        renderQuizLayout(wrapper, task);
    };

    function renderQuizLayout(wrapper, task) {
        // Adjust font size based on length
        const qLen = task.question.length;
        const qSize = qLen > 40 ? '20px' : (qLen > 20 ? '24px' : '32px');

        wrapper.innerHTML = `
        <div class="d-flex flex-column h-100 pb-4">
            <!-- Header -->
            <div class="d-flex justify-content-between align-items-center pt-3 px-2">
                <div class="badge bg-primary bg-opacity-10 text-primary px-3 py-2 rounded-pill fw-bold">
                    <i class="bi bi-robot me-1"></i> ${task.title || 'AI Quiz'}
                </div>
            </div>

            <!-- Question -->
            <div class="flex-grow-1 d-flex flex-column align-items-center justify-content-center text-center px-3">
                ${task.is_ai ? '<div class="text-muted small text-uppercase fw-bold mb-2" style="font-size: 10px; letter-spacing: 1px;">Создано AI</div>' : ''}
                <div class="fw-bold text-dark mb-4 animate__animated animate__fadeIn" style="font-size: ${qSize}; line-height: 1.3;">
                    ${task.question}
                </div>
            </div>

            <!-- Options Grid -->
            <div class="d-grid gap-3 px-2" style="grid-template-columns: 1fr 1fr;">
                ${task.options.map((opt, idx) => `
                    <button class="btn btn-lg fw-bold shadow-sm option-btn animate__animated animate__zoomIn" 
                            style="border-radius: 16px; min-height: 80px; font-size: ${opt.length > 15 ? '14px' : '18px'}; animation-delay: ${idx * 0.1}s; background: var(--bg-secondary); border: 1px solid var(--border-main); color: var(--text-main);"
                            onclick="bbSubmit('${opt.replace(/'/g, "\\'")}', '${task.correct_val.replace(/'/g, "\\'")}')">
                        ${opt}
                    </button>
                `).join('')}
            </div>
            
            <style>
                .option-btn:active { transform: scale(0.95); transition: 0.1s; }
            </style>
        </div>
        `;
    }

})();
