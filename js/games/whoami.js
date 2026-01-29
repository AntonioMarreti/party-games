// js/games/whoami.js

// Глобальные переменные для хранения выбора хоста (чтобы не сбрасывались при поллинге)
if (typeof window.waiSelectedTheme === 'undefined') window.waiSelectedTheme = null;
if (typeof window.waiSelectedLimit === 'undefined') window.waiSelectedLimit = 10;

function render_whoami(res) {
    const state = JSON.parse(res.room.game_state);
    const container = document.getElementById('game-area');
    const myId = String(res.user.id);

    // Скрываем общие элементы интерфейса лобби
    ['default-game-header', 'game-host-controls', 'score-card'].forEach(id => {
        const el = document.getElementById(id); if (el) el.style.display = 'none';
    });

    // 0. INJECT STYLES
    if (!document.getElementById('wai-styles')) {
        const link = document.createElement('link');
        link.id = 'wai-styles';
        link.rel = 'stylesheet';
        link.href = 'css/modules/whoami.css?v=' + new Date().getTime();
        document.head.appendChild(link);
    }

    // 1. Создаем или находим основной враппер
    let wrapper = document.getElementById('wai-wrapper');
    if (!wrapper) {
        container.innerHTML = '';
        wrapper = document.createElement('div');
        wrapper.id = 'wai-wrapper';
        wrapper.className = 'game-custom-wrapper'; // Использует стили из styles.css
        container.appendChild(wrapper);
    }

    // Если фаза сменилась на сервере - перестраиваем структуру экрана
    if (wrapper.dataset.phase !== state.phase) {
        wrapper.innerHTML = '';
        wrapper.dataset.phase = state.phase;
        buildWaiSkeleton(state, wrapper, res.is_host);
    }

    // Обновляем данные (без удаления элементов, чтобы не моргало)
    updateWaiData(state, res, wrapper);
}

function buildWaiSkeleton(state, wrapper, isHost) {
    const phase = state.phase;

    if (phase === 'theme_select') {
        wrapper.innerHTML = `
            <div class="game-page-title mt-4">Кто из нас?</div>
            <div class="game-page-subtitle">Настройка игрового процесса</div>
            <div class="px-3 mb-4">
                <label class="small fw-bold text-muted mb-2 d-block">СКОЛЬКО ВОПРОСОВ?</label>
                <div class="d-flex gap-2 mb-2" id="round-selector-btns">
                    <button class="btn-round-opt ${window.waiSelectedLimit == 5 ? 'active' : ''}" onclick="setWaiLimit(5, this)">5</button>
                    <button class="btn-round-opt ${window.waiSelectedLimit == 10 ? 'active' : ''}" onclick="setWaiLimit(10, this)">10</button>
                    <button class="btn-round-opt ${window.waiSelectedLimit == 15 ? 'active' : ''}" onclick="setWaiLimit(15, this)">15</button>
                </div>
                <input type="number" id="custom-rounds-input" class="form-control text-center custom-round-input" 
                       placeholder="Свой вариант" min="1" max="50" 
                       value="${[5, 10, 15].includes(window.waiSelectedLimit) ? '' : window.waiSelectedLimit}"
                       oninput="setWaiLimit(this.value, null)">
            </div>
            <label class="small fw-bold text-muted mb-2 d-block px-3">ВЫБЕРИТЕ ТЕМУ:</label>
            <div id="wai-theme-list" class="theme-select-list px-3"></div>
            <div class="fixed-bottom-actions">
                ${isHost ? `<button id="wai-start-btn" class="btn-bottom-action">Начать игру</button>` : `<div class="text-center text-muted p-3">Хост выбирает тему...</div>`}
                <button class="btn-bottom-secondary" onclick="backToLobby()">Выйти в лобби</button>
            </div>
        `;
        if (isHost) {
            document.getElementById('wai-start-btn').onclick = () => {
                if (!window.waiSelectedTheme) return showAlert("Внимание", "Выберите тему!", 'warning');
                sendGameAction('select_theme', { theme: window.waiSelectedTheme, limit: window.waiSelectedLimit });
            };
        }
    }
    else if (phase === 'voting') {
        wrapper.innerHTML = `
            <div class="px-3 pt-2">
                <div class="d-flex justify-content-between align-items-center mb-3">
                    <span class="badge bg-light text-dark" id="wai-round-info">...</span>
                    ${isHost ?
                `<button class="btn btn-sm text-primary fw-bold" onclick="backToLobby()">В Лобби</button>` :
                `<button class="btn btn-sm text-danger fw-bold" onclick="leaveRoom()">Выйти</button>`
            }
                </div>
                <!-- ВОТ ЭТОТ БЛОК БЫЛ ПРОПУЩЕН -->
                <h2 id="wai-q-text" class="fw-bold text-center mb-4 animate__animated animate__fadeIn" style="font-size: 24px; min-height: 80px;"></h2>
            </div>
            <div id="wai-voting-grid" class="voting-grid px-3"></div>
            <div id="wai-wait-msg" class="text-center text-muted mt-3" style="display:none">Ждем остальных игроков...</div>
        `;
    }
    else if (phase === 'results' || phase === 'final_leaderboard') {
        const isLastRound = state.round_settings.current >= state.round_settings.total;
        const buttonText = isLastRound ? "Посмотреть итоги 🏆" : "Следующий вопрос";

        wrapper.innerHTML = `
            <div class="px-4 pt-3 pb-5">
                <h1 class="fw-bold text-center mb-1" style="font-size: 32px;">
                    ${phase === 'final_leaderboard' ? '🏆 Финал' : 'Итоги'}
                </h1>
                <p id="wai-res-q" class="text-center text-muted mb-4 px-2" style="font-size: 15px;"></p>
                <div class="section-label mb-2">ПОБЕДИТЕЛЬ В РАУНДЕ:</div>
                <div id="wai-current-results" class="mb-5"></div>
                <div class="section-label mb-2">ОБЩИЙ СЧЕТ:</div>
                <div id="wai-total-scores"></div>
            </div>
            <div class="fixed-bottom-actions">
                ${isHost ?
                (phase === 'final_leaderboard' ?
                    `<button class="btn-bottom-action" onclick="whoamiFinish()">Вернуться в Лобби</button>` :
                    `<button class="btn-bottom-action" onclick="sendGameAction('next_round')">${buttonText}</button>`)
                : `<div class="text-center text-muted p-3">Ждем хоста...</div>`}
            </div>
        `;
    }
}

// Новая функция завершения игры с сохранением стат
window.whoamiFinish = async function () {
    // 1. Собираем результаты
    const container = document.getElementById('game-area');
    // Мы можем получить последние данные из стейта, который был передан в render_whoami
    // Но так как у нас нет прямого доступа к state здесь, мы вытащим его из текущего контекста или попросим checkState
    // На самом деле, лучше всего передать state в функцию или сохранить его глобально в скрипте игры.

    // В Who Am I стейт обычно доступен через аргументы render_, но мы можем 
    // получить актуальный список игроков и их очки из глобальных переменных или DOM, 
    // но надежнее всего сделать один финальный apiRequest или использовать window.lastGameState

    if (window.lastWhoAmIState && window.lastWhoAmIState.cumulative_scores) {
        const scores = window.lastWhoAmIState.cumulative_scores;
        const playersData = Object.entries(scores).map(([uid, score]) => ({
            user_id: parseInt(uid),
            score: score
        }));

        // Сортируем для определения ранга
        playersData.sort((a, b) => b.score - a.score);
        playersData.forEach((p, idx) => {
            p.rank = idx + 1; // 1-й получает 1-е место
        });

        await submitGameResults(playersData);
    }

    backToLobby();
};

function updateWaiData(state, res, wrapper) {
    window.lastWhoAmIState = state; // Сохраняем для финиша
    const myId = String(res.user.id);

    if (state.phase === 'theme_select') {
        const list = document.getElementById('wai-theme-list');
        if (list && state.available_themes && list.children.length === 0) {
            state.available_themes.forEach(t => {
                const card = document.createElement('div');
                card.id = `theme-card-${t.id}`;
                card.className = `theme-card ${window.waiSelectedTheme === t.id ? 'selected' : ''}`;
                card.innerHTML = `
                    <div class="d-flex align-items-center">
                        <div class="theme-icon">🔥</div>
                        <div class="text-start"><div class="fw-bold">${t.name}</div><div class="small text-muted">${t.desc}</div></div>
                    </div>
                    <div class="theme-check"><i class="bi bi-check"></i></div>
                `;
                card.onclick = () => {
                    window.waiSelectedTheme = t.id;
                    document.querySelectorAll('.theme-card').forEach(c => c.classList.remove('selected'));
                    card.classList.add('selected');
                };
                list.appendChild(card);
            });
        }
    }
    else if (state.phase === 'voting') {
        // Проверка наличия элементов перед записью, чтобы избежать ошибок
        const qTextEl = document.getElementById('wai-q-text');
        const rInfoEl = document.getElementById('wai-round-info');
        if (qTextEl) qTextEl.innerText = state.current_q;
        if (rInfoEl) rInfoEl.innerText = `Вопрос ${state.round_settings.current} из ${state.round_settings.total}`;

        const grid = document.getElementById('wai-voting-grid');
        const hasVoted = state.votes && state.votes[myId];
        const waitMsg = document.getElementById('wai-wait-msg');
        if (waitMsg) waitMsg.style.display = hasVoted ? 'block' : 'none';

        if (grid) {
            if (grid.children.length === 0) {
                res.players.forEach(p => {
                    const card = document.createElement('div');
                    card.id = `v-card-${p.id}`;
                    card.className = 'voting-card';
                    card.innerHTML = `<img src="${p.photo_url || ''}" class="voting-avatar"><div class="voting-name">${p.first_name}</div>`;
                    card.onclick = () => { if (!state.votes[myId]) sendGameAction('vote', { target_id: p.id }); };
                    grid.appendChild(card);
                });
            }
            res.players.forEach(p => {
                const card = document.getElementById(`v-card-${p.id}`);
                if (card) {
                    const isSelected = hasVoted && state.votes[myId] == p.id;
                    card.className = `voting-card ${isSelected ? 'active' : ''} ${hasVoted && !isSelected ? 'opacity-50' : ''}`;
                }
            });
        }
    }
    else if (state.phase === 'results' || state.phase === 'final_leaderboard') {
        const resQEl = document.getElementById('wai-res-q');
        if (resQEl) resQEl.innerText = state.current_q;

        const curDiv = document.getElementById('wai-current-results');
        if (curDiv) {
            if (state.phase === 'final_leaderboard') {
                curDiv.innerHTML = `<div class="bg-white p-3 rounded-4 shadow-sm text-center text-muted">Игра завершена!</div>`;
            } else {
                let counts = {};
                Object.values(state.votes || {}).forEach(vid => counts[vid] = (counts[vid] || 0) + 1);
                const sorted = [...res.players].filter(p => counts[p.id]).sort((a, b) => counts[b.id] - counts[a.id]);
                curDiv.innerHTML = sorted.map(p => `
                    <div class="result-card mb-2">
                        <div class="d-flex align-items-center">
                            <img src="${p.photo_url || ''}" class="result-avatar">
                            <span class="fw-bold">${p.first_name}</span>
                        </div>
                        <div class="result-badge">${counts[p.id]}</div>
                    </div>
                `).join('');
            }
        }
        const totalDiv = document.getElementById('wai-total-scores');
        if (totalDiv && state.cumulative_scores) {
            const sortedTotal = [...res.players].sort((a, b) => (state.cumulative_scores[b.id] || 0) - (state.cumulative_scores[a.id] || 0));
            totalDiv.innerHTML = sortedTotal.map((p, idx) => `
                <div class="result-card mb-2" style="opacity: ${idx === 0 ? '1' : '0.8'}">
                    <div class="d-flex align-items-center">
                        <span class="me-2 text-muted fw-bold" style="width:20px;">${idx + 1}.</span>
                        <img src="${p.photo_url || ''}" class="result-avatar-sm">
                        <span class="${idx === 0 ? 'fw-bold' : 'small'}">${p.first_name}</span>
                    </div>
                    <div class="fw-bold text-primary">${state.cumulative_scores[p.id] || 0}</div>
                </div>
            `).join('');
        }
    }
}

// Глобальные помощники
window.setWaiLimit = (n, btn) => {
    window.waiSelectedLimit = parseInt(n) || 1;
    document.querySelectorAll('.btn-round-opt').forEach(b => b.classList.remove('active'));
    if (btn) {
        btn.classList.add('active');
        const input = document.getElementById('custom-rounds-input');
        if (input) input.value = '';
    }
};

window.render_whoami = render_whoami;