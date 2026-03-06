window.PartyBattleModes = {
    // Mode specific UI generators

    renderSubmission: function (gameState, myHand) {
        if (gameState.mode === 'meme') return this.renderMemeSubmission(gameState, myHand);
        if (gameState.mode === 'joke') return this.renderJokeSubmission(gameState);
        if (gameState.mode === 'whoami') return `<div class="p-5 text-center text-muted">Ожидание...</div>`; // Handled directly by next-round click
        return '';
    },

    renderVoting: function (gameState, entries, hasVoted, myId) {
        if (gameState.mode === 'meme') return this.renderMemeVoting(entries, hasVoted, myId);
        if (gameState.mode === 'joke') return this.renderJokeVoting(entries, hasVoted, myId);
        if (gameState.mode === 'whoami') return this.renderWhoAmIVoting(gameState, hasVoted, myId);
        return '';
    },

    /* --- JOKE MODE --- */
    renderJokeSubmission: function (gameState) {
        return `
            <div class="p-3 pb-5 animate__animated animate__fadeIn">
                <div class="mb-4 text-center pb-5">
                    <label class="form-label fw-bold small text-muted text-uppercase mb-2">Придумай смешную добивку:</label>
                    <textarea id="pb-joke-input" class="form-control rounded-4 p-3 shadow-sm mb-3" rows="3" placeholder="Твоя огненная шутка..." maxlength="150" 
                        style="background: var(--bg-card); border: 2px solid var(--border-main); color: var(--text-main); font-size: 1.1rem; resize: none;"></textarea>
                    
                    <button class="btn btn-primary w-100 py-3 rounded-pill fw-bold fs-5 shadow-sm" onclick="window.PartyBattleUI.submitAnswer()">
                        <i class="bi bi-send-fill me-2"></i> Отправить шутку
                    </button>
                    
                    <div class="text-end small text-muted mt-2"><span id="pb-joke-count">0</span>/150</div>
                </div>
            </div>
            <script>
                document.getElementById('pb-joke-input')?.addEventListener('input', function(e) {
                    const count = document.getElementById('pb-joke-count');
                    if(count) count.innerText = e.target.value.length;
                });
            </script>
        `;
    },

    renderJokeVoting: function (entries, hasVoted, myId) {
        // Sort by UID for stability
        const sorted = [...entries].sort((a, b) => String(a.uid).localeCompare(String(b.uid)));

        return `
            <div class="row g-3 px-2">
                ${sorted.map(entry => {
            const isMe = String(entry.uid) === myId;
            return `
                        <div class="col-12">
                            <div class="p-4 rounded-4 shadow-sm position-relative ${isMe ? 'border-primary' : ''}" 
                                 style="background: var(--bg-card); border: 2px solid ${isMe ? 'var(--primary-color)' : 'var(--border-glass)'}; transition: all 0.2s;">
                                
                                <h4 class="fw-bold m-0 mb-3" style="color:var(--text-main); line-height: 1.4;">"${entry.url}"</h4>
                                
                                ${!hasVoted && !isMe ? `
                                    <button class="btn btn-primary w-100 py-3 fw-bold shadow-sm" style="position: relative; z-index: 9999 !important;" onclick="event.stopPropagation(); window.sendGameAction('vote', { target_id: '${entry.uid}' })">
                                        ВЫБРАТЬ
                                    </button>
                                ` : ''}
                                ${isMe ? `<div class="badge bg-primary position-absolute top-0 end-0 m-2">Твоя шутка</div>` : ''}
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
        const sorted = [...entries].sort((a, b) => String(a.uid).localeCompare(String(b.uid)));
        return `
            <div class="row g-3 px-2 pb-4">
                ${sorted.map(entry => {
            const isMe = String(entry.uid) === myId;
            return `
                        <div class="col-6">
                            <div class="rounded-4 overflow-hidden shadow-sm mb-2 position-relative" style="aspect-ratio: 1; border: ${isMe ? '3px solid var(--primary-color)' : '2px solid transparent'};">
                                <img src="${entry.url}" class="w-100 h-100 object-fit-cover">
                                ${isMe ? `<div class="position-absolute top-0 end-0 m-1"><span class="badge bg-primary" style="font-size:10px;">Твой</span></div>` : ''}
                                ${hasVoted && !isMe ? `<div class="position-absolute inset-0 d-flex align-items-center justify-content-center" style="background:rgba(0,0,0,0.3);"><i class="bi bi-check-circle-fill text-white fs-1"></i></div>` : ''}
                            </div>
                            ${!hasVoted && !isMe ? `
                                <button class="btn btn-primary w-100 py-2 rounded-3 fw-bold"
                                        onclick="window.sendGameAction('vote', { target_id: '${entry.uid}' }); this.disabled=true; this.innerHTML='<span class=\'spinner-border spinner-border-sm me-1\'></span>Отправляю...'">
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
                                 style="background: var(--bg-card); border: 2px solid ${isMe ? 'var(--primary-color)' : 'var(--border-glass)'};">
                                <div style="display:flex; justify-content:center; margin-bottom:10px;">
                                    ${pb_renderAvatar(p, 'lg')}
                                </div>
                                <div class="fw-bold text-truncate mb-2" style="color:var(--text-main); font-size: 0.9rem;">${p.display_name}</div>
                                ${isMe ? `<div class="badge bg-primary mb-3" style="font-size:10px;">Это я</div>` : ''}
                                
                                ${!hasVoted && !isMe ? `
                                        <button class="btn btn-primary w-100 py-3 rounded-4 fw-bold shadow-sm"
                                            style="position:relative; z-index:999 !important;"
                                            onclick="event.stopPropagation(); window.sendGameAction('vote', { target_id: '${pid}' })">
                                            ЭТО ОН!
                                        </button>
                                ` : ''}
                                ${hasVoted && !isMe ? `<div class="position-absolute inset-0 bg-black bg-opacity-10 rounded-4" style="pointer-events:none;"></div>` : ''}
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
        // Entries here contains {uid: '...', url/text: '...'} 
        // We shuffle them to hide the truth
        const shuffled = [...entries];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }

        return `
            <div class="row g-3 px-2 pb-4">
                ${shuffled.map(entry => {
            const isMe = String(entry.uid) === myId;
            if (isMe) return ''; // Hide user's own lie from themselves so they can't vote for it

            return `
                        <div class="col-12 animate__animated animate__fadeInUp">
                            <div class="card shadow-sm border-0 rounded-4" style="background: var(--bg-card); border: 2px solid ${hasVoted ? 'var(--border-glass)' : 'var(--primary-color)'} !important;">
                                <div class="card-body p-4 text-center">
                                    <h5 class="fw-bold mb-3" style="color:var(--text-main); line-height: 1.4;">"${entry.url}"</h5>
                                    
                                    ${!hasVoted ? `
                                        <button class="btn btn-outline-primary w-100 py-2 rounded-pill fw-bold"
                                                onclick="window.sendGameAction('vote', { target_id: '${entry.uid}' }); this.disabled=true; this.innerHTML='<span class=\'spinner-border spinner-border-sm me-1\'></span>Отправляю...'">
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
