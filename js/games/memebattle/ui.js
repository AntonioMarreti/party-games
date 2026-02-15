// js/games/memebattle/ui.js

window.MemeBattleUI = {
    renderLobby: function (gameState) {
        const gameArea = document.getElementById('game-area');
        const isHost = window.isHost;

        let content = '';
        if (!isHost) {
            content = `
                <div class="h-100 d-flex flex-column align-items-center justify-content-center p-4">
                    <h1 class="display-1 mb-4">🐸</h1>
                    <h2 class="mb-3 fw-bold text-center">Битва Мемов</h2>
                    <div class="d-flex align-items-center gap-2 text-muted mb-4">
                        <div class="spinner-border spinner-border-sm text-primary"></div>
                        <div>Хост настраивает игру...</div>
                    </div>
                    
                    <button class="btn btn-link text-muted text-decoration-none small mb-3" onclick="window.MemeBattleUI.toggleRules()">
                        <i class="bi bi-question-circle me-1"></i> Как играть?
                    </button>

                    <button class="btn btn-link text-muted text-decoration-none small" onclick="window.leaveRoom()">
                        <i class="bi bi-box-arrow-left me-1"></i> Покинуть комнату
                    </button>
                </div>
            `;
        } else {
            content = `
                <div class="h-100 d-flex flex-column align-items-center justify-content-center animate__animated animate__fadeIn">
                    <h1 class="fs-1 mb-2">🐸</h1>
                    <h2 class="mb-4 fw-bold text-center">Настройки</h2>
                    
                    <div class="mb-glass-card shadow-lg">
                        <!-- Rounds -->
                        <div class="mb-4">
                            <label class="form-label fw-bold small text-uppercase opacity-75">Количество раундов</label>
                            <div class="mb-number-input-group">
                                <button onclick="document.getElementById('mb-rounds').stepDown()">-</button>
                                <input type="number" id="mb-rounds" value="5" min="1" max="20" readonly>
                                <button onclick="document.getElementById('mb-rounds').stepUp()">+</button>
                            </div>
                        </div>

                        <!-- Theme -->
                        <div class="mb-4">
                            <label class="form-label fw-bold small text-uppercase opacity-75">Тематика</label>
                            <select id="mb-theme" class="form-select mb-select w-100" onchange="window.updateMemeBattleConfig()">
                                <option value="base">Базовый набор</option>
                                <option value="school">Школа / Универ</option>
                                <option value="office">Офис / Работа</option>
                                <option value="relationships">Отношения</option>
                                <option value="it">IT / Разработка</option>
                                <option value="custom">Своя тема (AI)</option>
                            </select>
                        </div>
                        
                        <!-- Custom Topic -->
                        <div class="mb-4" id="mb-custom-topic-div" style="display:none;">
                            <label class="form-label fw-bold small text-uppercase opacity-75">Ваша тема</label>
                            <input type="text" id="mb-custom-topic" class="form-control rounded-4 py-2" placeholder="Например: Гарри Поттер">
                        </div>

                        <!-- AI Mode Toggle -->
                        <div class="mb-4">
                            <label class="mb-switch-label" for="mb-ai-mode">
                                <div class="text-start">
                                    <span class="fw-bold d-block">AI Генератор <span class="badge bg-warning text-dark x-small ms-1">BETA</span></span>
                                    <span class="small text-muted" style="font-size: 0.75em;">Уникальные ситуации</span>
                                </div>
                                <div class="form-check form-switch p-0 m-0">
                                    <input class="form-check-input" type="checkbox" id="mb-ai-mode" style="width: 2.8em; height: 1.4em;" onchange="window.updateMemeBattleConfig()">
                                </div>
                            </label>
                        </div>

                        <button class="mb-main-btn w-100 fw-bold animate__animated animate__pulse animate__infinite" onclick="window.startMemeBattleGame()">
                             ЗАПУСТИТЬ ИГРУ
                        </button>
                        
                        <div class="d-flex justify-content-between mt-4 px-2">
                             <button class="btn btn-link text-muted text-decoration-none small opacity-50" onclick="window.MemeBattleUI.toggleRules()">
                                <i class="bi bi-question-circle me-1"></i> Правила
                            </button>
                            <button class="btn btn-link text-muted text-decoration-none small opacity-50" onclick="window.leaveRoom()">
                                <i class="bi bi-box-arrow-left me-1"></i> Выйти
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }

        // Include Modal for Rules
        const rulesModal = `
            <div id="mb-rules-modal" class="mb-modal-overlay" onclick="window.MemeBattleUI.toggleRules(false)">
                <div class="mb-modal-content p-4" onclick="event.stopPropagation()">
                    <div class="d-flex justify-content-between align-items-center mb-3">
                        <h3 class="fw-bold m-0">Как играть? 🤓</h3>
                        <button class="btn btn-close" onclick="window.MemeBattleUI.toggleRules(false)"></button>
                    </div>
                    <div class="text-start text-muted small">
                        <p class="mb-2">1. <b>Ситуация:</b> В каждом раунде появляется описание забавной ситуации.</p>
                        <p class="mb-2">2. <b>Мем:</b> Твоя задача — подобрать из своей "руки" (набора гифок) самую смешную реакцию.</p>
                        <p class="mb-2">3. <b>Поиск:</b> Если ничего не подходит, можно найти свой вариант через поиск (лупа).</p>
                        <p class="mb-2">4. <b>Голосование:</b> Когда все скинут мемы, голосуй за самый смешной вариант (за себя голосовать нельзя!).</p>
                        <p class="mb-0">🏆 Побеждает тот, кто наберет больше всего очков по итогам всех раундов!</p>
                    </div>
                    <button class="mb-main-btn w-100 mt-4 fw-bold" onclick="window.MemeBattleUI.toggleRules(false)">ПОНЯТНО</button>
                </div>
            </div>
        `;

        gameArea.innerHTML = `<div class="mb-container">${content}${typeof rulesModal !== 'undefined' ? rulesModal : ''}</div>`;

        // Helper functions
        window.updateMemeBattleConfig = function () {
            const theme = document.getElementById('mb-theme').value;
            const aiCheck = document.getElementById('mb-ai-mode');
            const customDiv = document.getElementById('mb-custom-topic-div');

            if (theme === 'custom') {
                aiCheck.checked = true;
                aiCheck.disabled = true;
                customDiv.style.display = 'block';
            } else {
                aiCheck.disabled = false;
                customDiv.style.display = 'none';
            }
        };

        window.startMemeBattleGame = function () {
            const rounds = parseInt(document.getElementById('mb-rounds').value) || 5;
            const theme = document.getElementById('mb-theme').value;
            const aiMode = document.getElementById('mb-ai-mode').checked;
            const customTopic = document.getElementById('mb-custom-topic').value;

            if (theme === 'custom' && !customTopic.trim()) {
                window.showAlert('Ошибка', 'Введите тему!', 'error');
                return;
            }

            const btn = document.querySelector('button[onclick="window.startMemeBattleGame()"]');
            if (btn) {
                btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
                btn.disabled = true;
            }

            sendGameAction('start_game', {
                rounds: rounds,
                theme: theme,
                ai_mode: aiMode,
                custom_topic: customTopic
            });
        };
    },

    // Helper: Render Standard Header
    renderHeader: function (gameState) {
        return `
            <div class="header-top mb-3 d-flex justify-content-center align-items-center position-relative" style="height: 40px;">
                <!-- Title -->
                 <div style="font-weight: 900; color: var(--text-muted); letter-spacing: 2px; font-size: 18px; cursor: pointer;" onclick="window.MemeBattleUI.toggleHeaderMenu(event)">
                    MEME BATTLE
                </div>

                 <!-- Dropdown (Standard Style) -->
                <div id="mb-header-dropdown" class="header-dropdown">
                    <button class="header-menu-item" onclick="window.MemeBattleUI.toggleRules()">
                        <i class="bi bi-question-circle"></i>
                        <span>Правила</span>
                    </button>
                    <button class="header-menu-item" onclick="location.reload()">
                        <i class="bi bi-arrow-clockwise"></i>
                        <span>Перезагрузить</span>
                    </button>
                    <button class="header-menu-item" onclick="window.leaveRoom()">
                        <i class="bi bi-door-open text-danger"></i>
                        <span class="text-danger">Покинуть игру</span>
                    </button>
                </div>
            </div>
        `;
    },

    toggleHeaderMenu: function (e) {
        if (e) e.stopPropagation();
        const dd = document.getElementById('mb-header-dropdown');
        if (dd) {
            dd.classList.toggle('active');

            // Auto-close handler
            if (dd.classList.contains('active')) {
                const closeHandler = () => {
                    dd.classList.remove('active');
                    document.removeEventListener('click', closeHandler);
                };
                setTimeout(() => document.addEventListener('click', closeHandler), 0);
            }
        }
    },

    toggleRules: function (show = true) {
        const modal = document.getElementById('mb-rules-modal');
        if (modal) {
            if (show === false || modal.classList.contains('active')) {
                modal.classList.remove('active');
                modal.style.display = 'none';
            } else {
                modal.style.display = 'flex'; // Ensure flex for centering
                // Small delay to allow display:flex to apply before adding active class for opacity transition if any
                setTimeout(() => modal.classList.add('active'), 10);
            }
        } else {
            // If called from non-lobby where modal isn't embedded, inject it? 
            // Ideally it should be embedded in mb-container or injected globally.
            // For now, let's inject it if missing.
            if (show) {
                const rulesModal = `
                    <div id="mb-rules-modal" class="mb-modal-overlay active" style="display:flex;" onclick="window.MemeBattleUI.toggleRules(false)">
                        <div class="mb-modal-content p-4" onclick="event.stopPropagation()">
                            <div class="d-flex justify-content-between align-items-center mb-3">
                                <h3 class="fw-bold m-0">Как играть? 🤓</h3>
                                <button class="btn btn-close" onclick="window.MemeBattleUI.toggleRules(false)"></button>
                            </div>
                            <div class="text-start text-muted small">
                                <p class="mb-2">1. <b>Ситуация:</b> В каждом раунде появляется описание забавной ситуации.</p>
                                <p class="mb-2">2. <b>Мем:</b> Твоя задача — подобрать из своей "руки" (набора гифок) самую смешную реакцию.</p>
                                <p class="mb-2">3. <b>Поиск:</b> Если ничего не подходит, можно найти свой вариант через поиск (лупа).</p>
                                <p class="mb-2">4. <b>Голосование:</b> Когда все скинут мемы, голосуй за самый смешной вариант (за себя голосовать нельзя!).</p>
                                <p class="mb-0">🏆 Побеждает тот, кто наберет больше всего очков по итогам всех раундов!</p>
                            </div>
                            <button class="mb-main-btn w-100 mt-4 fw-bold" onclick="window.MemeBattleUI.toggleRules(false)">ПОНЯТНО</button>
                        </div>
                    </div>
                `;
                document.body.insertAdjacentHTML('beforeend', rulesModal);
            }
        }
    },

    renderSituation: function (gameState) {
        const gameArea = document.getElementById('game-area');
        const roundData = gameState.current_situation || {};

        gameArea.innerHTML = `
            <div class="mb-container">
                ${this.renderHeader(gameState)}
                <div class="flex-grow-1 d-flex flex-column align-items-center justify-content-center p-4 animate__animated animate__zoomIn">
                    <div class="badge bg-primary bg-opacity-10 rounded-pill px-3 py-2 text-primary fw-bold mb-4">
                         РАУНД ${gameState.current_round}
                    </div>
                    
                    <h2 class="mb-situation-title text-main px-2">${roundData.text || 'Приготовьтесь...'}</h2>
                    
                    <div class="progress w-100 rounded-pill mb-5" style="height: 6px; max-width: 250px; background: rgba(0,0,0,0.05); border: 1px solid rgba(0,0,0,0.05);">
                        <div class="progress-bar" style="width: 100%; transition: width 3s linear; background: var(--primary-gradient);"></div>
                    </div>

                    <div class="text-center w-100 mt-2" style="min-height: 80px;">
                        ${window.isHost ? `
                            <button class="mb-main-btn px-5 fw-bold shadow-lg" onclick="sendGameAction('next_round')">
                                НАЧАТЬ ПОИСК <i class="bi bi-play-fill ms-1"></i>
                            </button>
                        ` : `
                            <div class="text-muted small fw-bold opacity-75">Хост подготавливает раунд...</div>
                        `}
                    </div>
                </div>
            </div>
        `;

        setTimeout(() => {
            const bar = gameArea.querySelector('.progress-bar');
            if (bar) bar.style.width = '0%';
        }, 100);
    },

    renderSubmissionScreen: function (gameState) {
        const gameArea = document.getElementById('game-area');
        const situation = gameState.current_situation?.text || '...';
        // Robust ID check
        const myId = window.user_id || window.userId || window.globalUser?.id || (window.Telegram?.WebApp?.initDataUnsafe?.user?.id) || 0;
        const myHand = (gameState.hands && (gameState.hands[myId] || gameState.hands[String(myId)])) || [];

        console.log('Rendering Submission. ID:', myId, 'Hand:', myHand, 'All Hands:', gameState.hands);

        // Calculate ready count
        const totalPlayers = gameState.scores ? Object.keys(gameState.scores).length : 0;
        const submittedCount = gameState.submissions ? Object.keys(gameState.submissions).length : 0;

        gameArea.innerHTML = `
            <div class="mb-container">
                ${this.renderHeader(gameState)}
                
                <!-- Situation Header (Sticky) -->
                <div class="p-3 shadow-sm border-bottom animate__animated animate__fadeInDown d-flex align-items-center justify-content-between" style="background: var(--bg-glass); backdrop-filter: blur(15px); -webkit-backdrop-filter: blur(15px); border-bottom: 1px solid var(--border-glass) !important;">
                    <div>
                        <div class="small text-muted fw-bold mb-1 opacity-50 text-uppercase">Ситуация:</div>
                        <div class="fw-bold text-main" style="font-size: 1rem; line-height: 1.2;">${situation}</div>
                    </div>
                </div>
                
                <div class="p-3 pb-5">
                    <div class="d-flex justify-content-between align-items-center mb-3">
                        <span class="small fw-bold text-muted opacity-75">ТВОЯ РУКА:</span>
                        <button class="btn btn-sm btn-link text-primary text-decoration-none fw-bold p-0 d-flex align-items-center" onclick="window.MemeBattleUI.refreshHand(event)">
                            <i class="bi bi-arrow-clockwise me-1"></i> Обновить
                        </button>
                    </div>

                    ${myHand.length === 0 ? `
                        <div class="text-center py-5">
                            <div class="spinner-border text-primary opacity-50 mb-3"></div>
                            <div class="text-muted small fw-bold">Раздаем карты...</div>
                        </div>
                    ` : `
                        <div class="row g-2" id="meme-hand-grid">
                            ${myHand.map(gif => {
            const url = gif.media_formats?.tinygif?.url || gif.media_formats?.gif?.url || gif.url;
            return `
                                    <div class="col-6">
                                        <div class="mb-gif-card clickable" onclick="window.MemeBattleUI.submitMeme('${url}')">
                                            <img src="${url}" loading="lazy">
                                        </div>
                                    </div>
                                `;
        }).join('')}
                        </div>
                    `}

                    <!-- Search Button (Prominent) -->
                    <div class="mt-4 text-center" id="search-toggle-div">
                        <button class="mb-glass-card w-100 py-3 d-flex align-items-center justify-content-center gap-2 text-primary fw-bold shadow-sm click-scale" style="border: 1px solid var(--primary-color); background: rgba(var(--primary-rgb), 0.05);" onclick="document.getElementById('manual-search-div').style.display='block'; document.getElementById('search-toggle-div').style.display='none'">
                             <i class="bi bi-search"></i> Найти свой мем
                        </button>
                        <div class="text-muted small mt-2 opacity-75">Если в руке нет ничего смешного</div>
                    </div>

                    <div id="manual-search-div" class="mt-3" style="display:none;">
                         <div class="input-group bg-white bg-opacity-50 rounded-4 overflow-hidden border">
                            <span class="input-group-text bg-transparent border-0 pe-0"><i class="bi bi-search text-muted opacity-50"></i></span>
                            <input type="text" id="meme-search-input" class="form-control border-0 bg-transparent py-2 ps-2" placeholder="Поиск по теме...">
                        </div>
                        <div id="meme-results" class="row g-2 mt-1"></div>
                    </div>
                </div>

                <!-- Footer Status -->
                <div class="fixed-bottom p-2 text-center bg-white bg-opacity-90 border-top shadow-lg" style="backdrop-filter: blur(10px); z-index: 1000; padding-bottom: calc(env(safe-area-inset-bottom) + 10px) !important;">
                    <div class="d-flex align-items-center justify-content-center gap-2">
                        <div class="spinner-grow spinner-grow-sm text-success" role="status"></div>
                        <span class="small fw-bold text-muted">Сдали работы: <span class="text-dark">${submittedCount} / ${totalPlayers}</span></span>
                    </div>
                </div>
            </div>
        `;

        const input = document.getElementById('meme-search-input');
        if (input) {
            let timer = null;
            input.addEventListener('input', (e) => {
                clearTimeout(timer);
                timer = setTimeout(() => this.searchGifs(e.target.value), 400);
            });
        }
    },

    refreshHand: async function (event) {
        const btn = event?.currentTarget;
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
        }

        try {
            const res = await apiRequest({
                action: 'game_action',
                type: 'refresh_hand'
            });
            if (res.status === 'ok') {
                // Poll will handle update, but let's clear guard to make it feel instant
                window.shouldMemeBattleForceUpdate = true;
            }
        } catch (e) {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="bi bi-arrow-clockwise me-1"></i> Обновить';
            }
        }
    },

    searchGifs: async function (query) {
        const container = document.getElementById('meme-results');
        if (!query) return;

        container.innerHTML = `<div class="text-center mt-5"><div class="spinner-border text-primary opacity-50"></div></div>`;

        try {
            const res = await apiRequest({
                action: 'game_action',
                type: 'search_gifs',
                query: query
            });

            if (res.status !== 'ok') throw new Error(res.message);
            const gifs = res.results || [];

            if (gifs.length === 0) {
                container.innerHTML = `<div class="text-center text-muted mt-5 font-bold small">Ничего не нашли 🥺</div>`;
                return;
            }

            container.innerHTML = `
                <div class="row g-2 p-1">
                    ${gifs.map(gif => {
                const url = gif.media_formats?.tinygif?.url || gif.media_formats?.gif?.url || gif.url;
                return `
                        <div class="col-6">
                            <div class="mb-gif-card clickable" onclick="window.MemeBattleUI.submitMeme('${url}')">
                                <img src="${url}" loading="lazy">
                            </div>
                        </div>
                    `}).join('')}
                </div>
            `;

        } catch (e) {
            container.innerHTML = `<div class="text-danger text-center mt-4 small">${e.message}</div>`;
        }
    },

    submitMeme: function (url) {
        if (!confirm('Отправить этот мем?')) return;
        window.shouldMemeBattleForceUpdate = true;
        sendGameAction('submit_meme', { url: url });

        // Show immediate feedback with status
        const gameArea = document.getElementById('game-area');
        gameArea.innerHTML = `
            <div class="mb-container">
                 <div class="h-100 d-flex flex-column align-items-center justify-content-center text-center p-4">
                    <div class="mb-glass-card shadow-lg animate__animated animate__bounceIn">
                        <i class="bi bi-check-circle-fill text-success display-1 mb-4 d-block"></i>
                        <h3 class="fw-bold">Принято!</h3>
                        <p class="text-muted small mb-4">Твой мем отправлен.</p>
                        
                        <div class="d-flex align-items-center justify-content-center gap-2 bg-secondary bg-opacity-10 rounded-pill px-3 py-2">
                            <div class="spinner-border spinner-border-sm text-primary"></div>
                            <span class="small fw-bold opacity-75">Ждем остальных игроков...</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    renderVotingScreen: function (gameState) {
        const gameArea = document.getElementById('game-area');
        const myId = String(window.user_id || window.userId || window.globalUser?.id || (window.Telegram?.WebApp?.initDataUnsafe?.user?.id) || 0);
        const hasVoted = gameState.votes && gameState.votes[myId];
        const situation = gameState.current_situation?.text || '';

        const submissions = gameState.submissions || {};
        const entries = Object.keys(submissions).map(uid => ({
            uid: uid,
            url: submissions[uid]
        }));

        // Count votes
        const totalPlayers = gameState.scores ? Object.keys(gameState.scores).length : 0;
        const votedCount = gameState.votes ? Object.keys(gameState.votes).length : 0;

        gameArea.innerHTML = `
            <div class="mb-container">
                ${this.renderHeader(gameState)}
                
                <div class="p-3 text-center position-relative pb-5">
                    <div class="small text-muted fw-bold opacity-50 text-uppercase mb-1">Голосуем за лучший мем!</div>
                    <div class="fw-bold mb-4" style="font-size: 1.1rem;">${situation}</div>
                    
                    ${hasVoted ? `
                        <div class="mb-glass-card shadow-sm p-3 mb-4 mx-auto animate__animated animate__pulse" style="border-color: var(--status-success);">
                            <div class="text-success fw-bold mb-1"><i class="bi bi-check-circle-fill me-1"></i> Голос принят!</div>
                            <div class="small text-muted">Ждем остальных...</div>
                        </div>` : ''
            }
                    
                    <div class="row g-3">
                        ${entries.map(entry => {
                const isMe = String(entry.uid) === myId;
                return `
                                <div class="col-6">
                                    <div class="mb-glass-card p-2 shadow-sm ${hasVoted ? 'opacity-50 grayscale' : ''} ${isMe ? 'border-primary border-opacity-50' : ''}" style="transition: all 0.2s;">
                                        <div class="ratio ratio-1x1 rounded-3 overflow-hidden mb-2">
                                            <img src="${entry.url}" class="object-fit-cover w-100 h-100">
                                        </div>
                                        ${!hasVoted && !isMe ? `
                                            <button class="glass-btn glass-btn-primary py-2 small fw-bold w-100" onclick="sendGameAction('vote_meme', {target_id: '${entry.uid}'})">
                                                ВЫБРАТЬ
                                            </button>
                                        ` : ''}
                                        ${isMe ? `<div class="small fw-bold text-muted py-1">Твой мем</div>` : ''}
                                    </div>
                                </div>
                            `;
            }).join('')}
                    </div>
                </div>

                 <!-- Footer Status -->
                <div class="fixed-bottom p-2 text-center bg-white bg-opacity-90 border-top shadow-lg" style="backdrop-filter: blur(10px); z-index: 1000; padding-bottom: calc(env(safe-area-inset-bottom) + 10px) !important;">
                    <div class="d-flex align-items-center justify-content-center gap-2">
                        <div class="spinner-grow spinner-grow-sm text-primary" role="status"></div>
                        <span class="small fw-bold text-muted">Проголосовали: <span class="text-dark">${votedCount} / ${totalPlayers}</span></span>
                    </div>
                </div>
            </div>
        `;
    },

    renderRoundResults: function (gameState) {
        const gameArea = document.getElementById('game-area');
        const isHost = window.isHost;
        const lastData = gameState.last_round_data || { votes: {}, scores: {} };

        const votes = lastData.votes || {};
        const voteCounts = {};
        Object.values(votes).forEach(target => {
            voteCounts[target] = (voteCounts[target] || 0) + 1;
        });

        const submissions = gameState.submissions || {};
        const sorted = Object.keys(submissions).sort((a, b) => (voteCounts[b] || 0) - (voteCounts[a] || 0));

        const winnerId = sorted[0];
        const winnerUrl = submissions[winnerId];
        const winnerVotes = voteCounts[winnerId] || 0;

        gameArea.innerHTML = `
            <div class="mb-container">
                ${this.renderHeader(gameState)}
                
                <div class="h-100 d-flex flex-column align-items-center p-3 text-center position-relative">
                    <h2 class="fw-bold mb-4">Победитель раунда!</h2>
                    
                    <div class="mb-glass-card p-2 border-primary border-opacity-50 shadow-lg animate__animated animate__tada" style="max-width: 300px;">
                        <div class="ratio ratio-1x1 rounded-4 overflow-hidden mb-3">
                            <img src="${winnerUrl}" class="object-fit-cover w-100 h-100">
                        </div>
                        <div class="text-center">
                            <h2 class="fw-bold text-primary mb-1">+${winnerVotes * 100}</h2>
                            <div class="small text-muted fw-bold">Очков за этот раунд</div>
                        </div>
                    </div>
                    
                    <div class="mt-auto w-100 px-4 pt-4">
                        ${isHost ? `
                            <button class="glass-btn glass-btn-primary py-3 w-100 fw-bold shadow-lg" onclick="sendGameAction('next_round')">
                                СЛЕДУЮЩИЙ РАУНД <i class="bi bi-chevron-right ms-2"></i>
                            </button>
                        ` : `
                            <div class="mb-glass-card py-3 w-100 text-center small fw-bold opacity-75">
                                Хост скоро запустит новый раунд...
                            </div>
                        `}
                    </div>
                </div>
            </div>
        `;
    },

    renderGameResults: function (gameState) {
        const gameArea = document.getElementById('game-area');
        const scores = gameState.scores || {};
        const sortedIds = Object.keys(scores).sort((a, b) => scores[b] - scores[a]);

        let html = `
            <div class="mb-container">
                <div class="h-100 d-flex flex-column p-4 text-center">
                    <h1 class="display-3 mb-1">🏆</h1>
                    <h1 class="fw-bold mb-4">ФИНАЛ</h1>
                    
                    <div class="flex-grow-1 overflow-auto px-1">
                        ${sortedIds.map((uid, index) => {
            const score = scores[uid];
            const isWinner = index === 0;
            const medal = index === 0 ? '🥇' : (index === 1 ? '🥈' : (index === 2 ? '🥉' : `#${index + 1}`));

            return `
                                <div class="mb-glass-card p-3 mb-2 d-flex justify-content-between align-items-center ${isWinner ? 'border-warning' : ''}">
                                    <div class="d-flex align-items-center">
                                        <span class="fs-4 me-3">${medal}</span>
                                        <span class="fw-bold">Игрок ${uid}</span>
                                    </div>
                                    <span class="badge bg-primary bg-opacity-10 text-primary rounded-pill px-3">${score}</span>
                                </div>
                            `;
        }).join('')}
                    </div>
                    
                    <button class="glass-btn mt-4 py-3 fw-bold" onclick="location.reload()">
                        ВЫЙТИ В КАТАЛОГ
                    </button>
                </div>
            </div>
        `;

        gameArea.innerHTML = html;
    }
};
