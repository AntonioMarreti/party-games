window.PartyBattleModes = {
    // Mode specific UI generators

    renderSubmission: function (gameState, myHand) {
        if (gameState.activeMode === 'meme') return this.renderMemeSubmission(gameState, myHand);
        if (gameState.roundFamily === 'creative_vote' || gameState.roundFamily === 'bluff') return this.renderJokeSubmission(gameState);
        if (gameState.roundFamily === 'direct_vote') return `<div class="p-5 text-center text-muted">Ожидание...</div>`;
        return '';
    },

    renderVoting: function (gameState, entries, hasVoted, myId) {
        if (gameState.activeMode === 'meme') return this.renderMemeVoting(entries, hasVoted, myId);
        if (gameState.roundFamily === 'creative_vote') return this.renderJokeVoting(entries, hasVoted, myId);
        if (gameState.roundFamily === 'direct_vote') return this.renderWhoAmIVoting(gameState, hasVoted, myId);
        return '';
    },

    /* --- TEXT MODES (Joke, Advice, Acronym, Caption, Bluff) --- */
    renderJokeSubmission: function (gameState) {
        let promptText = "ПРИДУМАЙ СМЕШНУЮ ДОБИВКУ:";
        let placeholderText = "Твоя огненная шутка...";
        let btnText = "ОТПРАВИТЬ ШУТКУ";

        if (gameState.activeMode === 'caption') {
            promptText = "ПРИДУМАЙ ПОДПИСЬ К МЕМУ:";
            placeholderText = "Что происходит на картинке?";
            btnText = "ОТПРАВИТЬ ОТВЕТ";
        } else if (gameState.activeMode === 'advice') {
            promptText = "ДАЙ ВРЕДНЫЙ СОВЕТ:";
            placeholderText = "Твой худший совет...";
            btnText = "ОТПРАВИТЬ СОВЕТ";
        } else if (gameState.activeMode === 'acronym') {
            promptText = "РАСШИФРУЙ АББРЕВИАТУРУ:";
            placeholderText = "Твоя расшифровка...";
            btnText = "ОТПРАВИТЬ";
        } else if (gameState.activeMode === 'bluff') {
            promptText = "ПРИДУМАЙ ПРАВДОПОДОБНУЮ ЛОЖЬ:";
            placeholderText = "Твое вранье...";
            btnText = "ОТПРАВИТЬ ЛОЖЬ";
        }

        return `
            <div class="px-2 pb-2 animate__animated animate__fadeIn">
                <div class="mb-2 text-center">
                    <label class="form-label fw-bold small text-muted text-uppercase mb-2" style="letter-spacing: 0.16em; opacity: 0.78;">${promptText}</label>
                    <textarea id="pb-joke-input" class="form-control rounded-4 p-3 shadow-sm mb-3" rows="2" placeholder="${placeholderText}" maxlength="150" 
                        style="background: linear-gradient(180deg, rgba(255,255,255,0.96), rgba(var(--primary-rgb), 0.04)); border: 1px solid var(--border-glass); color: var(--text-main); font-size: 1.1rem; resize: none; box-shadow: 0 18px 42px rgba(31, 38, 135, 0.06);"></textarea>
                    
                    <button id="pb-submit-answer-btn" class="btn btn-primary w-100 py-3 rounded-4 fw-bold fs-5 shadow-sm" style="box-shadow: 0 18px 42px rgba(var(--primary-rgb), 0.22) !important;" onclick="window.PartyBattleUI.submitAnswer()">
                        <i class="bi bi-send-fill me-2"></i> ${btnText}
                    </button>
                    
                    <div class="text-end small text-muted mt-2 opacity-50"><span id="pb-joke-count">0</span>/150</div>
                </div>
            </div>
            <script>
                (function() {
                    const input = document.getElementById('pb-joke-input');
                    const count = document.getElementById('pb-joke-count');
                    const button = document.getElementById('pb-submit-answer-btn');
                    if (!input) return;

                    const keepComposerVisible = function() {
                        setTimeout(function() {
                            button?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                        }, 120);
                    };

                    input.addEventListener('input', function(e) {
                        if (count) count.innerText = e.target.value.length;
                    });
                    input.addEventListener('focus', keepComposerVisible);
                    input.addEventListener('click', keepComposerVisible);
                })();
            </script>
        `;
    },

    renderJokeVoting: function (entries, hasVoted, myId) {
        // Sort by UID for stability
        const sorted = [...entries].sort((a, b) => String(a.id).localeCompare(String(b.id)));

        return `
            <div class="row g-2 px-2">
                ${sorted.map(entry => {
            const isMe = String(entry.authorId) === myId;
            return `
                        <div class="col-12">
                            <div class="p-3 rounded-4 shadow-sm position-relative ${isMe ? 'border-primary' : ''}" 
                                 style="background: linear-gradient(180deg, rgba(255,255,255,0.96), rgba(var(--primary-rgb), 0.04)); border: 1px solid ${isMe ? 'rgba(var(--primary-rgb), 0.34)' : 'var(--border-glass)'}; transition: all 0.2s; box-shadow: 0 14px 34px rgba(31, 38, 135, 0.05); ${!hasVoted && !isMe ? 'cursor:pointer;' : ''}"
                                 ${!hasVoted && !isMe ? `onclick="window.PartyBattleUI.submitVote('${entry.id}', this.querySelector('button'))"` : ''}>
                                
                                <div class="fw-bold mb-2 pe-5" style="color:var(--text-main); line-height: 1.28; font-size: 1.9rem;">${entry.value}</div>
                                
                                ${!hasVoted && !isMe ? `
                                    <button class="btn btn-primary w-100 py-2 rounded-4 fw-bold shadow-sm" style="position: relative; z-index: 9999 !important; min-height: 48px;" onclick="event.stopPropagation(); window.PartyBattleUI.submitVote('${entry.id}', this)">
                                        ВЫБРАТЬ
                                    </button>
                                ` : ''}
                                ${isMe ? `<div class="badge rounded-pill position-absolute top-0 end-0 m-2" style="background: var(--primary-gradient); font-size: 10px;">Твой ответ</div>` : ''}
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
        return `
             <div class="p-3 pb-5">
                <div class="d-flex justify-content-between align-items-center mb-3">
                    <span class="small fw-bold text-muted opacity-75">ТВОЯ РУКА:</span>
                    <button class="btn btn-sm btn-link text-primary text-decoration-none fw-bold p-0 d-flex align-items-center" onclick="window.PartyBattleUI.refreshHand(event)">
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
                                    <div class="rounded-4 overflow-hidden position-relative shadow-sm" onclick="window.PartyBattleUI.submitAnswer('${url}')" style="aspect-ratio: 1; cursor: pointer;">
                                        <img src="${url}" loading="lazy" class="w-100 h-100 object-fit-cover" style="transition: transform 0.2s;" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
                                    </div>
                                </div>
                            `;
        }).join('')}
                    </div>
                `}

                <div class="mt-4 text-center" id="search-toggle-div">
                    <button class="btn btn-outline-primary w-100 py-3 rounded-4 fw-bold shadow-sm" onclick="document.getElementById('manual-search-div').style.display='block'; document.getElementById('search-toggle-div').style.display='none'">
                            <i class="bi bi-search"></i> Найти свой мем
                    </button>
                </div>

                <div id="manual-search-div" class="mt-3" style="display:none;">
                     <div class="input-group bg-white bg-opacity-50 rounded-4 overflow-hidden border shadow-sm">
                        <span class="input-group-text bg-transparent border-0 pe-0"><i class="bi bi-search text-muted opacity-50"></i></span>
                        <input type="text" id="meme-search-input" class="form-control border-0 bg-transparent py-2 ps-2" placeholder="Поиск по теме..." oninput="window.PartyBattleUI.searchGifsDebounced(this.value)">
                    </div>
                    <div id="meme-results" class="row g-2 mt-2"></div>
                </div>
            </div>
        `;
    },

    renderMemeVoting: function (entries, hasVoted, myId) {
        const sorted = [...entries].sort((a, b) => String(a.id).localeCompare(String(b.id)));
        return `
            <div class="row g-3 px-2 pb-4">
                ${sorted.map(entry => {
            const isMe = String(entry.authorId) === myId;
            return `
                        <div class="col-6">
                            <div class="rounded-4 overflow-hidden shadow-sm mb-2 position-relative" style="aspect-ratio: 1; border: ${isMe ? '3px solid var(--primary-color)' : '2px solid transparent'}; ${!hasVoted && !isMe ? 'cursor:pointer;' : ''}"
                                 ${!hasVoted && !isMe ? `onclick="window.PartyBattleUI.submitVote('${entry.id}', this.parentNode.querySelector('button'))"` : ''}>
                                <img src="${entry.value}" class="w-100 h-100 object-fit-cover">
                                ${isMe ? `<div class="position-absolute top-0 end-0 m-1"><span class="badge rounded-pill" style="font-size:10px; background: var(--primary-gradient);">Твой ответ</span></div>` : ''}
                                ${hasVoted && !isMe ? `<div class="position-absolute inset-0 d-flex align-items-center justify-content-center" style="background:rgba(0,0,0,0.3);"><i class="bi bi-check-circle-fill text-white fs-1"></i></div>` : ''}
                            </div>
                            ${!hasVoted && !isMe ? `
                                <button class="btn btn-primary w-100 py-2 rounded-4 fw-bold"
                                        onclick="window.PartyBattleUI.submitVote('${entry.id}', this)">
                                    <i class=\"bi bi-hand-index-thumb me-1\"></i>ВЫБРАТЬ
                                </button>
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
                            <div class="p-3 rounded-4 shadow-sm text-center position-relative" 
                                 style="background: linear-gradient(180deg, rgba(255,255,255,0.96), rgba(var(--primary-rgb), 0.04)); border: 1px solid ${isMe ? 'rgba(var(--primary-rgb), 0.34)' : 'var(--border-glass)'}; box-shadow: 0 14px 34px rgba(31, 38, 135, 0.05);">
                                <div style="display:flex; justify-content:center; margin-bottom:10px;">
                                    ${pb_renderAvatar(p, 'lg')}
                                </div>
                                <div class="fw-bold text-truncate mb-2" style="color:var(--text-main); font-size: 0.9rem;">${p.display_name}</div>
                                ${isMe ? `<div class="badge rounded-pill mb-3" style="font-size:10px; background: var(--primary-gradient);">Это я</div>` : ''}
                                
                                ${!hasVoted ? `
                                        <button class="btn btn-primary w-100 py-3 rounded-4 fw-bold shadow-sm"
                                            style="position:relative; z-index:999 !important;"
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
        // Shuffle options to avoid visually pinning the truth.
        const shuffled = [...entries];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }

        return `
            <div class="row g-2 px-2 pb-4">
                ${shuffled.map(entry => {
            const isMe = String(entry.authorId) === myId;
            if (isMe) return ''; // Hide user's own lie from themselves so they can't vote for it

            return `
                        <div class="col-12 animate__animated animate__fadeInUp">
                            <div class="card shadow-sm border-0 rounded-4"
                                 style="background: linear-gradient(180deg, rgba(255,255,255,0.96), rgba(var(--primary-rgb), 0.04)); border: 1px solid ${hasVoted ? 'var(--border-glass)' : 'rgba(var(--primary-rgb), 0.26)'} !important; box-shadow: 0 14px 34px rgba(31, 38, 135, 0.05); ${!hasVoted ? 'cursor:pointer;' : ''}"
                                 ${!hasVoted ? `onclick="window.PartyBattleUI.submitVote('${entry.id}', this.querySelector('button'))"` : ''}>
                                <div class="card-body p-3 text-center">
                                    <div class="fw-bold mb-2" style="color:var(--text-main); line-height: 1.28; font-size: 1.3rem;">${entry.value}</div>
                                    
                                    ${!hasVoted ? `
                                        <button class="btn btn-outline-primary w-100 py-2 rounded-4 fw-bold"
                                                onclick="event.stopPropagation(); window.PartyBattleUI.submitVote('${entry.id}', this)">
                                            ЭТО ПРАВДА
                                        </button>
                                    ` : `
                                        <button class="btn btn-secondary w-100 py-2 rounded-pill fw-bold" disabled>
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
