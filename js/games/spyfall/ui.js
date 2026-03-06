// js/games/spyfall/ui.js

let spyfallTimerInterval = null;

function render_spyfall(res) {
    window.lastSpyfallResponse = res;
    const state = JSON.parse(res.room.game_state);
    const container = document.getElementById('game-area');
    const myId = String(res.user.id);

    // Hide lobby elements
    ['default-game-header', 'game-host-controls', 'score-card'].forEach(id => {
        const el = document.getElementById(id); if (el) el.style.display = 'none';
    });

    let wrapper = document.getElementById('spyfall-wrapper');
    if (!wrapper) {
        container.innerHTML = '';
        wrapper = document.createElement('div');
        wrapper.id = 'spyfall-wrapper';
        wrapper.className = 'game-custom-wrapper';
        container.appendChild(wrapper);
    }

    if (wrapper.dataset.phase !== state.phase) {
        wrapper.innerHTML = '';
        wrapper.dataset.phase = state.phase;
        buildSpyfallSkeleton(state, wrapper, res.is_host);
    }

    updateSpyfallData(state, res, wrapper, myId);
}

function buildSpyfallSkeleton(state, wrapper, isHost) {
    const phase = state.phase;

    if (phase === 'setup') {
        wrapper.innerHTML = `
            <div class="px-3 pt-4">
                <div class="game-page-title text-center mb-1">Шпион</div>
                <div class="game-page-subtitle text-center mb-4">Настройка игры</div>
                
                <div class="mb-4 p-3 rounded-4 glass-card" style="border: 1px solid var(--border-glass, rgba(255,255,255,0.1));">
                    <div class="fw-bold mb-2"><i class="bi bi-info-circle me-2"></i>Как играть:</div>
                    <div class="small text-muted mb-2">Все, кроме одного, знают локацию и получают уникальную <b>роль</b> (например, "Врач" в "Больнице").</div>
                    <ul class="small mb-3 text-muted ps-3">
                        <li><b>Местные:</b> Должны вычислить шпиона, задавая вопросы о локации. Роль помогает отвечать более естественно.</li>
                        <li><b>Шпион:</b> Не знает локацию. Должен блефовать, слушать ответы и угадать место, чтобы победить.</li>
                    </ul>
                    <div class="small opacity-75 border-top pt-2" style="font-style: italic;">Подсказка: если ваша пара подсвечена — время задать вопрос!</div>
                </div>
                
                <div class="mb-4">
                    <label class="small fw-bold mb-3 d-block text-muted">ВРЕМЯ НА РАУНД (МИН):</label>
                    <div class="d-flex gap-2">
                        <button class="glass-btn flex-fill ${state.time_limit === 5 ? 'active' : ''}" onclick="window.spyfallOptClick(this, 5)">5</button>
                        <button class="glass-btn flex-fill ${state.time_limit === 8 ? 'active' : ''}" onclick="window.spyfallOptClick(this, 8)">8</button>
                        <button class="glass-btn flex-fill ${state.time_limit === 10 ? 'active' : ''}" onclick="window.spyfallOptClick(this, 10)">10</button>
                    </div>
                </div>

                <div class="mb-4">
                    <label class="small fw-bold mb-2 d-block text-muted">ВЫБРАННЫЕ НАБОРЫ ЛОКАЦИЙ:</label>
                    <div id="spyfall-packs-container"></div>
                </div>
            </div>

            <div class="fixed-bottom-actions p-3">
                ${isHost ? `<button class="glass-btn glass-btn-primary w-100 mb-2" onclick="window.spyfallStartGame()">Начать игру</button>` : `<div class="text-center p-3 text-muted fw-bold">Хост настраивает игру...</div>`}
                <button class="glass-btn w-100" onclick="backToLobby()">Выйти</button>
            </div>
        `;
    }
    else if (phase === 'playing') {
        wrapper.innerHTML = `
            <div class="px-3 pt-4">
                <div class="d-flex justify-content-between align-items-center mb-4">
                    <div class="fw-bold" style="color:var(--text-muted);">Раунд начался</div>
                    <div id="spyfall-timer" class="timer-pill">00:00</div>
                </div>

                <div class="role-card-container" onclick="this.querySelector('.role-card').classList.toggle('revealed')">
                    <div class="role-card">
                        <div class="role-card-front">
                            <i class="bi bi-eye-slash" style="font-size: 40px; margin-bottom: 12px; opacity:0.5;"></i>
                            <div class="fw-bold text-uppercase" style="letter-spacing: 2px;">РАСКРЫТЬ РОЛЬ</div>
                            <div class="small mt-2 opacity-50 text-center">Нажми, чтобы посмотреть<br>(убедись, что никто не смотрит)</div>
                        </div>
                        <div class="role-card-back" id="spyfall-my-rolecard">
                            <!-- Populated dynamically -->
                        </div>
                    </div>
                </div>

                <div class="section-label mb-2">ИГРОКИ (Нажми для голосования):</div>
                <div id="spyfall-players-grid" class="spyfall-player-grid mb-4"></div>

                <div id="spyfall-turn-controls" class="mb-4" style="display:none;">
                    <div class="p-3 rounded-4 mt-2 text-center" style="background: rgba(255, 234, 167, 0.1); border: 1px dashed var(--status-warning);">
                        <div class="fw-bold mb-2">Твоя очередь отвечать!</div>
                        <button class="glass-btn glass-btn-primary w-100" onclick="window.spyfallNextTurn()">Я ответил</button>
                    </div>
                </div>

                <div id="spyfall-spy-controls" style="display:none;">
                    <div class="section-label mb-2">Список локаций (нажми, чтобы вычеркнуть):</div>
                    <div id="spyfall-locations" class="spyfall-locations-list mb-4"></div>
                    <button class="glass-btn glass-btn-danger w-100 mb-4" data-bs-toggle="modal" data-bs-target="#spyGuessModal">
                        🕵️‍♂️ Угадать локацию
                    </button>
                </div>
            </div>

            <!-- suggestion: Custom Modal for Spy Guessing to avoid clutter -->
            <div id="spyGuessModal" style="display:none; position:fixed; inset:0; z-index:9999; background:rgba(0,0,0,0.8); backdrop-filter:blur(5px); display:flex; align-items:center; justify-content:center;">
                <div class="p-4 rounded-4 glass-card" style="width:90%; max-width:400px; border:2px solid var(--status-error) !important;">
                    <h4 class="fw-bold text-center text-danger mb-3">Я знаю, где мы!</h4>
                    <p class="text-center text-muted small mb-4">Если ты ошибешься, жители победят.</p>
                    <div id="spy-guess-locations" class="d-flex flex-wrap gap-2 justify-content-center mb-4"></div>
                    <button class="glass-btn w-100" onclick="document.getElementById('spyGuessModal').style.display='none'">Отмена</button>
                </div>
            </div>
            
             <div class="fixed-bottom-actions p-3">
                ${isHost ? `<button class="glass-btn w-100 mb-2" onclick="backToLobby()">Выйти в лобби</button>` : `<button class="glass-btn w-100" onclick="leaveRoom()">Выйти</button>`}
            </div>
        `;
        // Hide immediately because inline display:flex overrides display:none from html
        document.getElementById('spyGuessModal').style.display = 'none';
    }
    else if (phase === 'results') {
        wrapper.innerHTML = `
            <div class="px-4 py-5 text-center">
                <div id="spyfall-result-icon" class="spyfall-result-icon"></div>
                <h1 class="fw-bold mb-2" id="spyfall-result-title"></h1>
                <p class="text-muted mb-4" id="spyfall-result-desc"></p>

                <div class="p-3 rounded-4 mb-4" style="background:var(--bg-card); border:1px solid var(--border-main);">
                    <div class="small text-muted text-uppercase mb-1">Шпион:</div>
                    <div class="h5 fw-bold text-danger mb-3" id="spyfall-result-spy"></div>

                    <div class="small text-muted text-uppercase mb-1">Локация:</div>
                    <div class="h5 fw-bold text-primary mb-0" id="spyfall-result-loc"></div>
                </div>
            </div>
            <div class="fixed-bottom-actions p-3">
                ${isHost ? `<button class="glass-btn glass-btn-primary w-100 mb-2" onclick="window.spyfallFinish()">Вернуться в лобби</button>` : `<div class="text-center p-3 text-muted fw-bold">Ждем хоста...</div>`}
            </div>
         `;
    }
}

function updateSpyfallData(state, res, wrapper, myId) {
    if (state.phase === 'setup') {
        const packsContainer = document.getElementById('spyfall-packs-container');
        if (packsContainer && state.available_packs) {
            packsContainer.innerHTML = state.available_packs.map(p => `
                <div class="spyfall-pack-card ${state.selected_packs.includes(p.id) ? 'selected' : ''}">
                    <div class="spyfall-pack-icon"><i class="bi bi-box-seam"></i></div>
                    <div>
                        <div class="fw-bold">${p.name}</div>
                        <div class="small opacity-75">${p.desc}</div>
                    </div>
                    <div class="spyfall-pack-check"><i class="bi bi-check-lg text-white"></i></div>
                </div>
            `).join('');
        }
    }
    else if (state.phase === 'playing') {
        // Timer Logic
        if (state.end_time) {
            if (spyfallTimerInterval) clearInterval(spyfallTimerInterval);
            const updateTimer = () => {
                const timerEl = document.getElementById('spyfall-timer');
                if (!timerEl) { clearInterval(spyfallTimerInterval); return; }
                const now = Math.floor(Date.now() / 1000);
                const left = state.end_time - now;

                if (left <= 0) {
                    timerEl.innerText = "00:00";
                    timerEl.classList.add('danger');
                    clearInterval(spyfallTimerInterval);
                    if (res.is_host) sendGameAction('end_time');
                } else {
                    const m = Math.floor(left / 60).toString().padStart(2, '0');
                    const s = (left % 60).toString().padStart(2, '0');
                    timerEl.innerText = `${m}:${s}`;
                    if (left < 60) timerEl.classList.add('danger');
                    else timerEl.classList.remove('danger');
                }
            };
            updateTimer();
            spyfallTimerInterval = setInterval(updateTimer, 1000);
        }

        const isSpy = state.spy_id === myId;
        const myRole = state.roles[myId];

        // My Role Card
        const cardBack = document.getElementById('spyfall-my-rolecard');
        if (cardBack) {
            if (isSpy) {
                cardBack.className = 'role-card-back spy-card d-flex flex-column align-items-center justify-content-center';
                cardBack.innerHTML = `
                    <div style="font-size:32px; margin-bottom:4px;"><i class="bi bi-incognito text-white"></i></div>
                    <div class="h3 fw-bold mb-1 w-100 text-center text-truncate px-2">ТЫ ШПИОН!</div>
                    <div class="small opacity-75 text-center px-4" style="line-height:1.2;">Ваша задача — выяснить локацию, не раскрыв себя.</div>
                `;
                document.getElementById('spyfall-spy-controls').style.display = 'block';

                // Fetch and render locations for spy guessing
                fetch('server/games/packs/spyfall/base.json')
                    .then(r => r.json())
                    .then(data => {
                        const locsEl = document.getElementById('spyfall-locations');
                        const modalLocsEl = document.getElementById('spy-guess-locations');
                        if (data.locations) {
                            const allLocs = Object.keys(data.locations).sort();

                            if (locsEl && locsEl.innerHTML === '') {
                                locsEl.innerHTML = allLocs.map(l => `<div class="spyfall-location-pill" onclick="this.classList.toggle('crossed')">${l}</div>`).join('');
                            }

                            if (modalLocsEl && modalLocsEl.innerHTML === '') {
                                modalLocsEl.innerHTML = allLocs.map(l => `<button class="glass-btn glass-btn-primary py-2 px-3" style="font-size:12px;" onclick="window.spyfallGuessLocation('${l}')">${l}</button>`).join('');
                            }
                        }
                    }).catch(e => console.error(e));

            } else {
                cardBack.className = 'role-card-back';
                cardBack.innerHTML = `
                    <div style="color:var(--primary-color); font-size:32px; margin-bottom:4px;"><i class="bi bi-geo-alt-fill"></i></div>
                    <div class="small text-muted text-uppercase" style="font-size: 10px; letter-spacing: 1px;">ЛОКАЦИЯ</div>
                    <div class="h4 fw-bold mb-2 text-center w-100 px-2">${state.location}</div>
                    
                    <div class="small text-muted text-uppercase" style="font-size: 10px; letter-spacing: 1px;">ТВОЯ РОЛЬ</div>
                    <div class="h5 fw-bold text-center w-100 px-2 text-primary">${myRole}</div>
                `;
                document.getElementById('spyfall-spy-controls').style.display = 'none';
            }
        }

        // Active Turn Display
        const grid = document.getElementById('spyfall-players-grid');
        if (grid) {
            grid.innerHTML = res.players.map(p => {
                const pId = String(p.id);
                let classes = 'spyfall-player-card position-relative';
                let badge = '';

                if (state.active_pair && state.active_pair.asker === pId) {
                    classes += ' active-asker';
                    badge = `<div class="spyfall-role-badge asker">Спрашивает</div>`;
                } else if (state.active_pair && state.active_pair.answerer === pId) {
                    classes += ' active-answerer';
                    badge = `<div class="spyfall-role-badge answerer">Отвечает</div>`;
                }

                // If I voted for them
                if (state.votes && state.votes[myId] === pId) {
                    classes += ' opacity-50';
                }

                const avatarHtml = typeof window.renderAvatar === 'function' ? window.renderAvatar(p, 'md') : `<img src="${p.photo_url || ''}" class="avatar-md">`;

                return `
                    <div class="${classes}" onclick="confirmSpyVote('${p.id}', '${window.safeHTML(p.first_name)}')">
                        ${badge}
                        ${avatarHtml}
                        <div class="fw-bold text-truncate mt-2" style="font-size: 11px;">${window.safeHTML(p.first_name)}</div>
                        ${state.votes && state.votes[pId] ? `<div class="badge bg-danger mt-1">Голос!</div>` : ''}
                    </div>
                `;
            }).join('');
        }

        // Turn controls
        const controls = document.getElementById('spyfall-turn-controls');
        if (controls) {
            if (state.active_pair && state.active_pair.answerer === myId) {
                controls.style.display = 'block';
            } else {
                controls.style.display = 'none';
            }
        }
    }
    else if (state.phase === 'results') {
        const titleEl = document.getElementById('spyfall-result-title');
        const descEl = document.getElementById('spyfall-result-desc');
        const iconEl = document.getElementById('spyfall-result-icon');

        const spyPlayer = res.players.find(p => String(p.id) === String(state.spy_id));
        const spyName = spyPlayer ? spyPlayer.first_name : 'Шпион';

        document.getElementById('spyfall-result-spy').innerText = spyName;
        document.getElementById('spyfall-result-loc').innerText = state.location;

        if (state.winner === 'spy') {
            iconEl.innerHTML = '🕵️‍♂️';
            titleEl.innerText = "ШПИОН ПОБЕДИЛ!";
            titleEl.className = "fw-bold mb-2 text-danger";
            descEl.innerText = "Мирным жителям не удалось вычислить шпиона, либо он рассекретил вашу локацию.";
        } else {
            iconEl.innerHTML = '🎉';
            titleEl.innerText = "ЖИТЕЛИ ПОБЕДИЛИ!";
            titleEl.className = "fw-bold mb-2 text-success";
            descEl.innerText = "Шпион вычислен и обезврежен. Отличная работа!";
        }
    }
}

window.confirmSpyVote = function (targetId, targetName) {
    if (confirm(`Вы уверены, что ${targetName} — шпион? Ваш голос будет засчитан!`)) {
        window.spyfallVoteSpy(targetId);
    }
};

window.render_spyfall = render_spyfall;
