// js/games/engines/quiz.js
(function () {
    window.BB_MECHANICS = window.BB_MECHANICS || {};

    function renderQuizShell(wrapper, titleHtml, kickerHtml, questionHtml, optionsHtml) {
        wrapper.innerHTML = `
        <div class="bb-round-shell bb-round-shell--compact">
            <div class="bb-game-badge">${titleHtml}</div>
            <div class="bb-question-card">
                ${kickerHtml}
                <div class="bb-question-text animate__animated animate__fadeIn">${questionHtml}</div>
            </div>
            <div class="bb-options-grid bb-options-grid--2">
                ${optionsHtml}
            </div>
        </div>
        `;
    }

    window.BB_MECHANICS.ai_quiz = function (wrapper, task) {
        // reuse math blitz layout but with adapted text
        renderQuizLayout(wrapper, task);
    };

    function renderQuizLayout(wrapper, task) {
        // Adjust font size based on length
        const qLen = task.question.length;
        const qSize = qLen > 40 ? '20px' : (qLen > 20 ? '24px' : '32px');
        const titleHtml = `<i class="bi bi-robot me-1"></i> ${task.title || 'AI Quiz'}`;
        const kickerHtml = task.is_ai
            ? '<div class="bb-question-kicker">Создано AI</div>'
            : '<div class="bb-question-kicker">Быстрый вопрос</div>';
        const questionHtml = `
            <div style="font-size: ${qSize}; line-height: 1.3;">
                ${task.question}
            </div>
        `;
        const optionsHtml = task.options.map((opt, idx) => `
            <button class="btn btn-lg bb-option-btn animate__animated animate__zoomIn" 
                    style="font-size: ${opt.length > 15 ? '14px' : '18px'}; animation-delay: ${idx * 0.1}s;"
                    ${window.bbBuildSubmitActionAttrs(opt, task.correct_val)}>
                <span class="bb-option-btn__label">${opt}</span>
            </button>
        `).join('');

        renderQuizShell(wrapper, titleHtml, kickerHtml, questionHtml, optionsHtml);
    }

})();
