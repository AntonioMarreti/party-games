window.PartyBattleModes = {
    // Mode specific UI generators

    renderSubmission: function (gameState, myHand) {
        if (gameState.activeMode === 'meme') return this.renderMemeSubmission(gameState, myHand);
        if (gameState.roundFamily === 'creative_vote' || gameState.roundFamily === 'bluff') return this.renderJokeSubmission(gameState);
        if (gameState.roundFamily === 'direct_vote') {
            return `
                <div class="px-2 pb-3 animate__animated animate__fadeIn">
                    <div class="rounded-4 p-4 text-center pb-surface">
                        <i class="bi bi-hourglass-split text-primary opacity-50 d-block mb-3" style="font-size: 1.8rem;"></i>
                        <div class="fw-bold mb-2" style="color:var(--text-main);">Сейчас начнётся голосование</div>
                        <div class="small text-muted">Хост раздаёт карточки и подготавливает варианты для выбора.</div>
                    </div>
                </div>
            `;
        }
        return '';
    },

    renderVoting: function (gameState, entries, hasVoted, myId) {
        if (gameState.activeMode === 'meme') return this.renderMemeVoting(entries, hasVoted, myId);
        if (gameState.roundFamily === 'creative_vote') return this.renderJokeVoting(entries, hasVoted, myId);
        if (gameState.roundFamily === 'bluff') return this.renderBluffVoting(entries, hasVoted, myId);
        if (gameState.roundFamily === 'direct_vote') return this.renderWhoAmIVoting(gameState, hasVoted, myId);
        return '';
    },

    /* --- TEXT MODES (Joke, Advice, Acronym, Caption, Bluff) --- */
    renderJokeSubmission: function (gameState) {
        let promptText = "ПРИДУМАЙ СМЕШНУЮ ДОБИВКУ:";
        let placeholderText = "Твоя огненная шутка...";
        if (gameState.activeMode === 'caption') {
            promptText = "ПРИДУМАЙ ПОДПИСЬ К МЕМУ:";
            placeholderText = "Что происходит на картинке?";
        } else if (gameState.activeMode === 'advice') {
            promptText = "ДАЙ ВРЕДНЫЙ СОВЕТ:";
            placeholderText = "Твой худший совет...";
        } else if (gameState.activeMode === 'acronym') {
            promptText = "РАСШИФРУЙ АББРЕВИАТУРУ:";
            placeholderText = "Твоя расшифровка...";
        } else if (gameState.activeMode === 'bluff') {
            promptText = "ПРИДУМАЙ ПРАВДОПОДОБНУЮ ЛОЖЬ:";
            placeholderText = "Твое вранье...";
        }

        return `
            <div class="pb-composer-card px-2 pb-2 animate__animated animate__fadeIn">
                <div class="rounded-4 p-2 pb-surface">
                    <div class="d-flex align-items-center justify-content-between gap-2 mb-1">
                        <label class="form-label fw-bold small text-muted text-uppercase m-0" style="letter-spacing: 0.14em; opacity: 0.78; font-size: 0.73rem;">${promptText}</label>
                        <div class="small text-muted opacity-50" style="font-size: 0.78rem;"><span id="pb-joke-count">0</span>/150</div>
                    </div>
                    <textarea id="pb-joke-input" class="form-control rounded-4 p-2 pb-input-shell" rows="3" placeholder="${placeholderText}" maxlength="150"
                        style="font-size: 0.92rem; line-height:1.24; resize: none; min-height: 88px; box-shadow: none;"></textarea>
                </div>
            </div>
            <script>
                (function() {
                    const input = document.getElementById('pb-joke-input');
                    const count = document.getElementById('pb-joke-count');
                    if (!input) return;

                    input.addEventListener('input', function(e) {
                        if (count) count.innerText = e.target.value.length;
                    });
                })();
            </script>
        `;
    },

    renderJokeVoting: function (entries, hasVoted, myId) {
        const sorted = [...entries].sort((a, b) => {
            const aIsMe = String(a.authorId) === myId ? 1 : 0;
            const bIsMe = String(b.authorId) === myId ? 1 : 0;
            if (aIsMe !== bIsMe) {
                return bIsMe - aIsMe;
            }
            return String(a.id).localeCompare(String(b.id));
        });

        return `
            <div class="row g-2 px-2">
                ${sorted.map((entry, index) => {
            const isMe = String(entry.authorId) === myId;
            return `
                        <div class="col-12">
                            <div class="p-3 rounded-4 position-relative pb-vote-card ${isMe ? 'is-mine' : ''}"
                                 style="transition: all 0.2s; ${!hasVoted && !isMe ? 'cursor:pointer;' : ''}"
                                 ${!hasVoted && !isMe ? `onclick="window.PartyBattleUI.submitVote('${entry.id}', this.querySelector('button'))"` : ''}>
                                <div class="d-flex justify-content-between align-items-start gap-3 mb-2">
                                    <div class="small fw-bold text-uppercase" style="letter-spacing:0.12em; color:${isMe ? 'var(--primary-color)' : 'var(--text-muted)'}; font-size:0.7rem;">${isMe ? 'Твой ответ' : `Вариант ${index + 1}`}</div>
                                    ${isMe ? `<span class="badge rounded-pill px-3 py-2 pb-accent-pill" style="font-size: 0.68rem; font-weight:700;">Твой ответ</span>` : ''}
                                </div>
                                <div class="fw-bold mb-3" style="color:var(--text-main); line-height: 1.22; font-size: 0.95rem;">${entry.value}</div>

                                ${!hasVoted && !isMe ? `
                                    <div class="d-flex justify-content-end">
                                        <button class="btn btn-primary px-4 py-2 rounded-pill fw-bold shadow-sm" style="position: relative; min-height: 34px; min-width: 116px; font-size: 0.76rem; box-shadow: 0 8px 18px rgba(var(--primary-rgb), 0.18) !important;" onclick="event.stopPropagation(); window.PartyBattleUI.submitVote('${entry.id}', this)">
                                        ВЫБРАТЬ
                                        </button>
                                    </div>
                                ` : isMe ? `
                                    <div class="rounded-pill py-2 px-3 text-center fw-bold pb-muted-pill" style="font-size:0.7rem; letter-spacing:0.04em;">
                                        ТВОЙ ВАРИАНТ
                                    </div>
                                ` : ''}
                                ${hasVoted && !isMe ? `<div class="position-absolute inset-0 bg-black bg-opacity-10 rounded-4" style="pointer-events:none;"></div>` : ''}
                            </div>
                        </div>
                    `;
        }).join('')}
            </div>
        `;
    },

    /* --- MEME MODE (Migrated from memebattle) --- */
    renderMemeSubmission: function (gameState, myHand) {
        const selectedUrl = window.PartyBattleUI?.getSelectedMemeUrl?.() || '';
        return `
             <div class="pb-meme-hand">
                <div class="d-flex justify-content-between align-items-center mb-3 pb-meme-hand-toolbar">
                    <span class="small fw-bold text-muted opacity-75" style="letter-spacing:0.12em; font-size:0.74rem;">ТВОЯ РУКА</span>
                    <div class="d-flex align-items-center gap-3">
                        <button class="btn btn-sm btn-link text-primary text-decoration-none fw-bold p-0 d-flex align-items-center pb-meme-action" onclick="window.PartyBattleUI.refreshHand(event)">
                            <i class="bi bi-arrow-clockwise me-1"></i> Обновить
                        </button>
                        <div id="search-toggle-div">
                            <button class="btn btn-sm btn-link text-primary text-decoration-none fw-bold p-0 d-flex align-items-center pb-meme-action" onclick="document.getElementById('manual-search-div').style.display='block'; document.getElementById('search-toggle-div').style.display='none'">
                                <i class="bi bi-search me-1"></i> Найти свой мем
                            </button>
                        </div>
                    </div>
                </div>

                <div id="manual-search-div" class="mb-3" style="display:none;">
                     <div class="input-group rounded-4 overflow-hidden pb-input-shell">
                        <span class="input-group-text bg-transparent border-0 pe-0"><i class="bi bi-search text-muted opacity-50"></i></span>
                        <input type="text" id="meme-search-input" class="form-control border-0 bg-transparent py-2 ps-2" placeholder="Поиск по теме..." oninput="window.PartyBattleUI.searchGifsDebounced(this.value)">
                    </div>
                    <div id="meme-results" class="row g-2 mt-2"></div>
                </div>

                ${myHand.length === 0 ? `
                    <div class="rounded-4 p-4 text-center pb-surface">
                        <div class="spinner-border text-primary opacity-50 mb-3"></div>
                        <div class="fw-bold mb-2" style="color:var(--text-main);">Собираем руку</div>
                        <div class="text-muted small">Подбираем набор реакций для этого раунда.</div>
                    </div>
                ` : `
                    <div class="row g-2" id="meme-hand-grid">
                        ${myHand.map(gif => {
            const url = gif.media_formats?.tinygif?.url || gif.media_formats?.gif?.url || gif.url;
            const isSelected = selectedUrl === url;
            return `
                                <div class="col-6">
                                    <div class="rounded-4 overflow-hidden position-relative shadow-sm pb-meme-card ${isSelected ? 'is-selected' : ''}" data-meme-url="${url}" onclick="window.PartyBattleUI.selectMemeAnswer('${url}', this)">
                                        <img src="${url}" loading="lazy" class="w-100 h-100 object-fit-cover" referrerpolicy="no-referrer" style="transition: transform 0.2s;" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
                                        <div class="position-absolute top-0 end-0 m-2 rounded-pill px-2 py-1 small fw-bold pb-meme-selected-badge ${isSelected ? '' : 'd-none'}" style="font-size:0.68rem;">
                                            <i class="bi bi-check2 me-1"></i>Выбрано
                                        </div>
                                    </div>
                                </div>
                            `;
        }).join('')}
                    </div>
                `}
            </div>
        `;
    },

    renderMemeVoting: function (entries, hasVoted, myId) {
        const sorted = [...entries].sort((a, b) => {
            const aIsMe = String(a.authorId) === myId ? 1 : 0;
            const bIsMe = String(b.authorId) === myId ? 1 : 0;
            if (aIsMe !== bIsMe) {
                return bIsMe - aIsMe;
            }
            return String(a.id).localeCompare(String(b.id));
        });
        return `
            <div class="row g-3 px-2">
                ${sorted.map(entry => {
            const isMe = String(entry.authorId) === myId;
            return `
                        <div class="col-6">
                            <div class="rounded-4 overflow-hidden mb-2 position-relative" style="aspect-ratio: 1; border: ${isMe ? '2px solid var(--primary-color)' : '1px solid var(--border-glass)'}; ${!hasVoted && !isMe ? 'cursor:pointer;' : ''}"
                                 ${!hasVoted && !isMe ? `onclick="window.PartyBattleUI.submitVote('${entry.id}', this.parentNode.querySelector('button'))"` : ''}>
                                <img src="${entry.value}" class="w-100 h-100 object-fit-cover" referrerpolicy="no-referrer">
                                ${isMe ? `<div class="position-absolute top-0 start-0 m-2"><span class="badge rounded-pill px-3 py-2 pb-mode-pill" style="font-size:0.68rem;">Твой ответ</span></div>` : ''}
                                ${hasVoted && !isMe ? `<div class="position-absolute inset-0 d-flex align-items-center justify-content-center" style="background:rgba(0,0,0,0.3);"><i class="bi bi-check-circle-fill text-white fs-1"></i></div>` : ''}
                            </div>
                            ${!hasVoted && !isMe ? `
                                <button class="btn btn-primary w-100 py-2 rounded-pill fw-bold" style="min-height:34px; font-size:0.76rem; box-shadow: 0 8px 18px rgba(var(--primary-rgb), 0.18) !important;"
                                        onclick="window.PartyBattleUI.submitVote('${entry.id}', this)">
                                    ВЫБРАТЬ
                                </button>
                            ` : isMe ? `
                                <div class="rounded-pill py-2 px-3 text-center fw-bold pb-muted-pill" style="font-size:0.68rem; letter-spacing:0.04em;">ТВОЙ ВАРИАНТ</div>
                            ` : ''}
                        </div>`;
        }).join('')}
            </div>
        `;
    },

    /* --- WHOAMI MODE --- */
    renderWhoAmIVoting: function (gameState, hasVoted, myId) {
        const players = window.APP_STATE?.room?.players || [];
        return `
            <div class="row g-3 px-2">
                ${players.map(p => {
            const pid = String(p.id);
            const isMe = pid === myId;
            return `
                        <div class="col-6">
                            <div class="p-3 rounded-4 text-center position-relative pb-vote-card ${isMe ? 'is-mine' : ''}">
                                <div style="display:flex; justify-content:center; margin-bottom:10px;">
                                    ${pb_renderAvatar(p, 'lg')}
                                </div>
                                <div class="fw-bold text-truncate mb-2" style="color:var(--text-main); font-size: 0.9rem;">${p.display_name}</div>
                                ${isMe ? `<div class="badge rounded-pill mb-3 px-3 py-2 pb-accent-pill" style="font-size:0.68rem;">Это я</div>` : ''}
                                
                                ${!hasVoted ? `
                                        <button class="btn btn-primary w-100 py-2 rounded-pill fw-bold shadow-sm"
                                            style="position:relative; min-height:34px; font-size:0.76rem; box-shadow: 0 8px 18px rgba(var(--primary-rgb), 0.18) !important;"
                                            onclick="event.stopPropagation(); window.PartyBattleUI.submitVote('${pid}', this)">
                                            ${isMe ? 'ЭТО Я!' : 'ЭТО ОН!'}
                                        </button>
                                ` : ''}
                                ${hasVoted ? `<div class="position-absolute inset-0 bg-black bg-opacity-10 rounded-4" style="pointer-events:none;"></div>` : ''}
                            </div>
                        </div>
                    `;
        }).join('')}
            </div>
        `;
    },

    // Assuming there's an object within PartyBattleModes that holds mode definitions

    /* --- BLUFF MODE --- */
    renderBluffVoting: function (entries, hasVoted, myId) {
        const mine = [];
        const others = [];
        [...entries].forEach(entry => {
            if (String(entry.authorId) === myId) {
                mine.push(entry);
            } else {
                others.push(entry);
            }
        });

        for (let i = others.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [others[i], others[j]] = [others[j], others[i]];
        }
        const shuffled = [...mine, ...others];

        return `
            <div class="row g-2 px-2">
                ${shuffled.map((entry, index) => {
            const isMe = String(entry.authorId) === myId;

            return `
                        <div class="col-12 animate__animated animate__fadeInUp">
                            <div class="card rounded-4 pb-vote-card ${isMe ? 'is-mine' : ''}"
                                 style="${!hasVoted && !isMe ? 'cursor:pointer;' : ''}"
                                 ${!hasVoted && !isMe ? `onclick="window.PartyBattleUI.submitVote('${entry.id}', this.querySelector('button'))"` : ''}>
                                <div class="card-body p-3 text-center">
                                    <div class="d-flex justify-content-between align-items-start gap-3 mb-2">
                                        <div class="small fw-bold text-uppercase" style="letter-spacing:0.12em; color:${isMe ? 'var(--primary-color)' : 'var(--text-muted)'}; font-size:0.7rem;">${isMe ? 'Твой ответ' : `Вариант ${index + 1}`}</div>
                                        ${isMe ? `<span class="badge rounded-pill px-3 py-2 pb-accent-pill" style="font-size:0.68rem; font-weight:700;">Твой ответ</span>` : ''}
                                    </div>
                                    <div class="fw-bold mb-3" style="color:var(--text-main); line-height: 1.22; font-size: 0.95rem;">${entry.value}</div>
                                    
                                    ${!hasVoted && !isMe ? `
                                        <div class="d-flex justify-content-end">
                                            <button class="btn btn-outline-primary px-4 py-2 rounded-pill fw-bold" style="min-height:34px; min-width:116px; font-size:0.76rem;"
                                                    onclick="event.stopPropagation(); window.PartyBattleUI.submitVote('${entry.id}', this)">
                                                ЭТО ПРАВДА
                                            </button>
                                    </div>
                                    ` : isMe ? `
                                        <button class="btn w-100 py-2 rounded-pill fw-bold pb-disabled-control" style="min-height:34px; font-size:0.7rem; letter-spacing:0.02em;" disabled>
                                            НЕЛЬЗЯ ГОЛОСОВАТЬ ЗА СВОЙ ВАРИАНТ
                                        </button>
                                    ` : `
                                        <button class="btn w-100 py-2 rounded-pill fw-bold pb-disabled-control" style="min-height:34px; font-size:0.72rem; opacity:0.82;" disabled>
                                            <i class="bi bi-check2-circle me-1"></i>ОЖИДАНИЕ...
                                        </button>
                                    `}
                                </div>
                            </div>
                        </div>
                    `;
        }).join('')}
            </div>
        `;
    },
    // Adding bluff alongside a hypothetical 'caption' mode definition.
    modes: {
        joke: {
            id: 'joke',
            title: 'ДОБИВКИ',
            icon: 'bi-chat-quote-fill',
            color: 'warning',
            desc: 'Придумайте самое смешное продолжение к началу шутки.',
            type: 'creative'
        },
        advice: {
            id: 'advice',
            title: 'ВРЕДНЫЕ СОВЕТЫ',
            icon: 'bi-bandaid-fill',
            color: 'danger',
            desc: 'Дайте самый абсурдный и бесполезный совет на жизненную ситуацию.',
            type: 'creative'
        },
        acronym: {
            id: 'acronym',
            title: 'ДЕШИФРАТОР',
            icon: 'bi-input-cursor-text',
            color: 'info',
            desc: 'Расшифруйте аббревиатуру так смешно, как только сможете.',
            type: 'creative'
        },
        caption: {
            id: 'caption',
            title: 'ПОДПИШИ КАРТИНКУ',
            icon: 'bi-image',
            color: 'success',
            desc: 'Придумайте самую смешную подпись к этой странной ГИФке.',
            type: 'creative'
        },
        bluff: {
            id: 'bluff',
            title: 'БЛЕФ',
            icon: 'bi-incognito',
            color: 'dark',
            desc: 'Придумайте правдоподобную ложь к факту, чтобы обмануть друзей. И угадайте правду сами!',
            type: 'creative'
        }
    }
};
