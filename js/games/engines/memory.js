if (!window.BB_MECHANICS) window.BB_MECHANICS = {};

function bbFormatMemoryItem(item) {
    if (typeof item !== 'string' || item.trim() === '') {
        return '<span class="opacity-50">?</span>';
    }
    return item.startsWith('bi-') ? `<i class="bi ${item}"></i>` : item;
}

function bbPlayMemoryFeedback(soundKey, hapticType = 'selection', hapticDetail = 'light') {
    if (window.audioManager) window.audioManager.play(soundKey);
    if (window.triggerHaptic) window.triggerHaptic(hapticType, hapticDetail);
}

// ФОТОПАМЯТЬ
// 1. ФОТОПАМЯТЬ
window.BB_MECHANICS.photo_memory = function (wrapper, task) {
    const roundId = window.bbActiveRoundId || '';
    wrapper.innerHTML = `
        <div id="mem-phase-shell" class="bb-round-shell">
            <div class="bb-game-badge">${task.title}</div>
            <div class="bb-question-card">
                <div id="bb-memory-kicker" class="bb-question-kicker"></div>
                <h2 id="bb-memory-question" class="bb-question-text bb-question-text--medium"></h2>
            </div>
            <div id="bb-memory-content"></div>
            <div id="bb-memory-status"></div>
        </div>
    `;

    const kicker = wrapper.querySelector('#bb-memory-kicker');
    const question = wrapper.querySelector('#bb-memory-question');
    const content = wrapper.querySelector('#bb-memory-content');
    const status = wrapper.querySelector('#bb-memory-status');

    const renderPhase1 = () => {
        if (kicker) kicker.textContent = 'Фаза запоминания';
        if (question) question.textContent = 'Запомни!';
        if (content) {
            content.innerHTML = `
                <div class="bb-memory-grid mb-4 px-3">
                    ${task.shown_items.map((item) => `
                        <div class="bb-glass-card bb-memory-card shadow-sm">
                            ${bbFormatMemoryItem(item)}
                        </div>
                    `).join('')}
                </div>
            `;
        }
        if (status) {
            status.innerHTML = `
                <div class="bb-status-rail">
                    <div class="bb-status-rail__top">
                        <span>Фаза запоминания</span>
                        <span>3 сек</span>
                    </div>
                    <div class="bb-status-rail__track">
                        <div class="bb-status-rail__bar" id="bb-memory-phase1-bar"></div>
                    </div>
                </div>
            `;
        }
    };

    const renderPhase2 = () => {
        if (kicker) kicker.textContent = 'Фаза ответа';
        if (question) question.textContent = task.phase2_q;
        if (content) {
            content.innerHTML = `
                <div class="bb-memory-grid w-100 px-3">
                    ${task.options.map((opt) => `
                        <button class="btn bb-option-btn bb-memory-option p-4 fw-bold d-flex align-items-center justify-content-center" style="color:var(--text-main);"
                            ${window.bbBuildSubmitActionAttrs(opt, task.correct_val)}>${bbFormatMemoryItem(opt)}</button>
                    `).join('')}
                </div>
            `;
        }
        if (status) {
            status.innerHTML = `
                <div class="bb-status-rail">
                    <div class="bb-status-rail__top">
                        <span>Выбери ответ</span>
                        <span>Идет отсчет ответа</span>
                    </div>
                    <div class="bb-status-rail__track">
                        <div class="bb-status-rail__bar is-indeterminate"></div>
                    </div>
                </div>
            `;
        }
        if (window.bbResetTimer) window.bbResetTimer();
    };

    renderPhase1();
    bbPlayMemoryFeedback('reveal', 'selection', 'light');

    // Анимация таймера
    window.bbSetTimeout(() => {
        if (window.bbIsRoundActive && !window.bbIsRoundActive(roundId)) return;
        const bar = document.getElementById('bb-memory-phase1-bar');
        if (bar) bar.style.width = '0%';
    }, 100);

    // Фаза 2: Вопрос (через 3 сек)
    window.bbSetTimeout(() => {
        if (window.bbIsRoundActive && !window.bbIsRoundActive(roundId)) return;
        bbPlayMemoryFeedback('round_start', 'impact', 'medium');
        renderPhase2();
    }, 3000);
};

// СЛЕПОЙ СЕКУНДОМЕР
window.BB_MECHANICS.blind_timer = function (wrapper, task) {
    let blindStartTime = 0;
    const blindTarget = task.target || 5000;
    let blindState = 'ready';

    let html = `
        <div class="bb-round-shell text-center">
            <div class="bb-game-badge">${task.title}</div>
            <div class="bb-question-card">
                <div class="bb-question-kicker">Чувство времени</div>
                <h3 class="bb-question-text bb-question-text--small">${task.question}</h3>
            </div>
            
            <div id="blind-timer-display" class="display-1 fw-bold font-monospace mt-5 mb-2 text-primary" style="font-variant-numeric: tabular-nums; transition: color 0.3s;">0.00</div>
            <div id="blind-timer-hint" class="fw-bold mb-4" style="color: var(--text-muted); opacity: 0; transition: opacity 0.5s; height: 24px;">Считай про себя... 🤫</div>
            
            <div class="d-grid w-100 px-4">
                <button id="blind-btn" class="bb-start-btn" data-bb-action="blind-click">СТАРТ</button>
            </div>
        </div>
    `;
    wrapper.innerHTML = html;

    window.brainBattleRoundState.blindClick = function () {
        const display = document.getElementById('blind-timer-display');
        const btn = document.getElementById('blind-btn');
        if (!display || !btn) return;

        if (blindState === 'ready') {
            bbPlayMemoryFeedback('round_start', 'impact', 'medium');
            blindState = 'running';
            blindStartTime = performance.now();
            btn.innerText = "СТОП";
            btn.style.background = "linear-gradient(135deg, #FF7675 0%, #D63031 100%)";
            btn.style.boxShadow = "0 10px 30px rgba(214, 48, 49, 0.3)";

            const hideTimeSec = (blindTarget / 1000) * 0.4;

            window.bbBlindInterval = window.bbSetInterval(() => {
                const diff = (performance.now() - blindStartTime) / 1000;

                if (diff > hideTimeSec) {
                    display.innerText = "-.--";
                    display.style.color = "var(--border-main)";
                    document.getElementById('blind-timer-hint').style.opacity = '1';
                } else {
                    display.innerText = diff.toFixed(2);
                }
            }, 50);
        } else if (blindState === 'running') {
            bbPlayMemoryFeedback('tick_soft', 'selection', 'light');
            blindState = 'stopped';
            window.bbClearInterval(window.bbBlindInterval);
            window.bbBlindInterval = null;
            const timeMs = performance.now() - blindStartTime;
            const timeSec = timeMs / 1000;

            display.style.color = "var(--primary-color)";
            display.innerHTML = timeSec.toFixed(3);

            const diff = Math.abs(blindTarget - timeMs);

            btn.disabled = true;
            btn.style.opacity = '0.5';

            window.bbSetTimeout(() => {
                window.bbSubmit(null, null, diff, true);
            }, 1200);
        }
    };
};

window.BB_MECHANICS.simon_says = function (wrapper, task) {
    const roundId = window.bbActiveRoundId || '';
    const sequence = task.sequence; // Массив цветов
    let userSequence = [];

    const colorMap = {
        'red': { bg: '#ff7675', active: '#d63031', icon: 'bi-app' },
        'blue': { bg: '#74b9ff', active: '#0984e3', icon: 'bi-app' },
        'green': { bg: '#55efc4', active: '#00b894', icon: 'bi-app' },
        'yellow': { bg: '#ffeaa7', active: '#fdcb6e', icon: 'bi-app' }
    };

    // 1. Отрисовываем поле
    wrapper.innerHTML = `
        <div class="bb-round-shell">
            <div class="bb-game-badge">${task.title}</div>
            <div class="bb-question-card">
                <div class="bb-question-kicker">Последовательность цветов</div>
                <h4 id="simon-status" class="bb-question-text bb-question-text--small">ЗАПОМНИ ЭТУ ПОСЛЕДОВАТЕЛЬНОСТЬ</h4>
            </div>
            
            <div id="simon-display" class="bb-simon-display mb-5 mx-auto rounded-circle shadow-sm d-flex align-items-center justify-content-center animate__animated"
                 style="background: white; border: 4px solid #f1f2f6;">
                 <i class="bi bi-eye-fill" style="font-size: 3rem; color:var(--text-muted);"></i>
            </div>

            <div class="bb-options-grid bb-options-grid--2" id="simon-buttons" style="max-width: 420px;">
                ${Object.keys(colorMap).map(c => `
                    <button class="btn p-0 rounded-4 border-0 shadow-sm simon-btn disabled" 
                            id="btn-simon-${c}"
                            style="background: ${colorMap[c].bg}; height: 100px; transition: transform 0.1s; border: 1px solid var(--border-glass) !important;" 
                            data-bb-action="simon-click" data-bb-color="${c}" data-bb-correct="${window.bbEncodeActionValue(task.correct_val)}">
                    </button>
                `).join('')}
            </div>
        </div>
    `;

    // 2. Показываем последовательность (МЕДЛЕННЕЕ)
    let i = 0;
    const interval = window.bbSetInterval(() => {
        if (window.bbIsRoundActive && !window.bbIsRoundActive(roundId)) {
            window.bbClearInterval(interval);
            return;
        }
        const display = document.getElementById('simon-display');
        if (!display) { window.bbClearInterval(interval); return; }

        if (i < sequence.length) {
            const color = sequence[i];
            const btn = document.getElementById(`btn-simon-${color}`);

            // Highlight Button directly for better connection
            if (btn) {
                btn.style.opacity = '1';
                btn.style.transform = 'scale(1.05)';
                btn.style.filter = 'brightness(1.2)';
            }

            display.style.background = colorMap[color].bg;
            display.innerHTML = ''; // Clear icon
            display.style.borderColor = colorMap[color].active;
            display.classList.add('animate__pulse');

            window.bbSetTimeout(() => {
                if (btn) {
                    btn.style.transform = 'scale(1)';
                    btn.style.filter = 'none';
                }

                display.classList.remove('animate__pulse');
                display.style.background = 'white';
                display.style.borderColor = '#f1f2f6';
                display.innerHTML = '<i class="bi bi-eye-fill" style="font-size: 3rem; color:var(--text-muted);"></i>';
            }, 800); // Increased view time
            i++;
        } else {
            window.bbClearInterval(interval);
            // 3. Даем игроку нажимать
            const status = document.getElementById('simon-status');
            if (status) {
                status.innerText = "ТЕПЕРЬ ТВОЯ ОЧЕРЕДЬ ЖАТЬ!";
                status.classList.remove('text-muted');
                status.classList.add('text-primary', 'animate__animated', 'animate__flash');
            }
            document.querySelectorAll('.simon-btn').forEach(btn => {
                btn.classList.remove('disabled');
            });
            if (window.bbResetTimer) window.bbResetTimer();
        }
    }, 1300); // 1300ms interval (Slower)

    // 4. Обработка клика
    window.brainBattleRoundState.simonClick = function (color, correctStr) {
        bbPlayMemoryFeedback('tick_soft', 'selection', 'light');
        // Визуальный отклик
        const btn = document.getElementById(`btn-simon-${color}`);
        if (btn) {
            btn.style.transform = 'scale(0.95)';
            btn.style.filter = 'brightness(1.2)';
            window.bbSetTimeout(() => {
                btn.style.transform = 'scale(1)';
                btn.style.filter = 'none';
            }, 150);

            // Также красиво мигнем центральным экраном цветом нажатой кнопки
            const display = document.getElementById('simon-display');
            if (display) {
                display.style.background = colorMap[color].bg;
                display.style.borderColor = colorMap[color].active;
                display.innerHTML = '';
                display.classList.remove('animate__pulse');
                void display.offsetWidth; // Trigger reflow to restart animation
                display.classList.add('animate__pulse');

                if (window.simonUserClickTimeout) window.bbClearTimeout(window.simonUserClickTimeout);

                window.simonUserClickTimeout = window.bbSetTimeout(() => {
                    display.style.background = 'white';
                    display.style.borderColor = '#f1f2f6';
                    display.innerHTML = '<i class="bi bi-eye-fill" style="font-size: 3rem; color:var(--text-muted);"></i>';
                    display.classList.remove('animate__pulse');
                }, 400); // Longer and more noticeable, but allows fast clicking
            }
        }

        userSequence.push(color);
        const correctArray = correctStr.split(',');

        // Проверка
        const currentIndex = userSequence.length - 1;
        if (userSequence[currentIndex] !== correctArray[currentIndex]) {
            // Ошибка!
            window.bbSubmit(userSequence.join(','), correctStr);
        } else if (userSequence.length === correctArray.length) {
            // Всё верно!
            window.bbSubmit(correctStr, correctStr);
        }
    };
};

// 4. СЕКРЕТНЫЙ КОД (Secret Code)
window.BB_MECHANICS.secret_code = function (wrapper, task) {
    const roundId = window.bbActiveRoundId || '';
    wrapper.innerHTML = `
        <div id="sc-phase-shell" class="bb-round-shell">
            <div class="bb-game-badge">${task.title}</div>
            <div class="bb-question-card">
                <div class="bb-question-kicker">Секретный код</div>
                <h2 id="sc-question" class="bb-question-text bb-question-text--small"></h2>
            </div>
            <div id="sc-content"></div>
            <div id="sc-footer"></div>
        </div>
    `;

    const question = wrapper.querySelector('#sc-question');
    const content = wrapper.querySelector('#sc-content');
    const footer = wrapper.querySelector('#sc-footer');

    const renderPhase1 = () => {
        if (question) question.textContent = task.question;
        if (content) {
            content.innerHTML = `
                <div class="bb-glass-card px-5 py-4 d-flex align-items-center justify-content-center mb-5" style="border: 2px dashed var(--primary-color);">
                    <h1 class="display-1 fw-bold mb-0 text-break text-center w-100" style="letter-spacing: 12px; margin-right: -12px; color: var(--primary-color);">${task.pin}</h1>
                </div>
            `;
        }
        if (footer) {
            footer.innerHTML = `
                <div class="progress w-75 rounded-pill mx-auto" style="height: 12px; background: var(--bg-secondary);">
                    <div class="progress-bar sc-timer-bar" style="width: 100%; transition: width 3s linear; background: linear-gradient(90deg, var(--primary-color), color-mix(in srgb, var(--primary-color), white 30%)); border-radius: 10px;"></div>
                </div>
            `;
        }
    };

    const renderPhase2 = () => {
        if (question) question.textContent = 'Введи пароль';

        const paddedKeypad = [];
        for (let i = 0; i < 9; i++) paddedKeypad.push(task.keypad[i]);
        paddedKeypad.push('empty');
        paddedKeypad.push(task.keypad[9]);
        paddedKeypad.push('clear');

        if (content) {
            content.innerHTML = `
                <div class="bb-glass-card w-100 px-4 py-3 mb-4 d-flex align-items-center justify-content-center shadow-sm mx-auto" style="max-width:280px; height: 75px; border-bottom: 4px solid var(--primary-color);">
                    <h1 id="sc-display" class="display-3 fw-bold mb-0 text-center w-100" style="letter-spacing: 10px; margin-right: -10px; color: var(--text-main);"></h1>
                </div>
                <div class="d-grid gap-2 px-3 w-100 mx-auto" style="grid-template-columns: repeat(3, 1fr); max-width: 300px;">
                    ${paddedKeypad.map((key) => {
                        if (key === 'empty') return '<div></div>';
                        if (key === 'clear') {
                            return `<button class="btn btn-light shadow-sm border-0 d-flex align-items-center justify-content-center" style="height: 70px; font-size: 1.5rem; color: var(--status-error);" data-bb-action="secret-clear"><i class="bi bi-backspace-fill"></i></button>`;
                        }
                        return `<button class="btn bb-glass-card shadow-sm border-0 d-flex align-items-center justify-content-center fw-bold text-dark" style="height: 70px; font-size: 2rem; transition: transform 0.1s ease;" data-bb-action="secret-digit" data-bb-value="${key}" data-bb-correct="${window.bbEncodeActionValue(task.correct_val)}">${key}</button>`;
                    }).join('')}
                </div>
            `;
        }
        if (footer) footer.innerHTML = '';
    };

    renderPhase1();

    // Анимация таймера
    window.bbSetTimeout(() => {
        if (window.bbIsRoundActive && !window.bbIsRoundActive(roundId)) return;
        const bar = wrapper.querySelector('.sc-timer-bar');
        if (bar) bar.style.width = '0%';
    }, 100);

    // Переход ко второй фазе через 3 сек
    window.bbSetTimeout(() => {
        if (window.bbIsRoundActive && !window.bbIsRoundActive(roundId)) return;
        renderPhase2();

        let currentInput = '';

        window.brainBattleRoundState.secretClear = function () {
            currentInput = '';
            document.getElementById('sc-display').innerText = '';
        };

        window.brainBattleRoundState.secretDigit = function (btn, num, correctStr) {
            btn.style.transform = 'scale(0.9)';
            btn.style.background = 'var(--bg-secondary)';
            window.bbSetTimeout(() => {
                btn.style.transform = 'none';
                btn.style.background = '';
            }, 100);

            if (currentInput.length < correctStr.length) {
                currentInput += num;
                document.getElementById('sc-display').innerText = currentInput;

                if (currentInput.length === correctStr.length) {
                    window.bbSetTimeout(() => {
                        window.bbSubmit(currentInput, correctStr);
                    }, 200);
                }
            }
        };

    }, 3000);
};
