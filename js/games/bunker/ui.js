/**
 * Bunker UI Rendering Overhaul
 * Using 'var' and explicit 'window' scope to allow multiple re-loads via dynamic script tags.
 */

window.BUNKER_ICONS = {
    professions: '<i class="bi bi-briefcase-fill"></i>',
    biology: '<i class="bi bi-gender-ambiguous"></i>',
    health: '<i class="bi bi-heart-pulse-fill"></i>',
    hobby: '<i class="bi bi-palette-fill"></i>',
    advantages: '<i class="bi bi-star-fill"></i>',
    disadvantages: '<i class="bi bi-x-octagon-fill"></i>',
    luggage: '<i class="bi bi-backpack-fill"></i>',
    facts: '<i class="bi bi-patch-question-fill"></i>',
    condition: '<i class="bi bi-exclamation-triangle-fill"></i>',
    feature: '<i class="bi bi-bricks"></i>',
    threat: '<i class="bi bi-radioactive"></i>'
};

window.BUNKER_ROUND_NAMES = {
    professions: 'Профессия', biology: 'Биология', health: 'Здоровье',
    hobby: 'Хобби', advantages: 'Сильная черта', disadvantages: 'Слабость',
    luggage: 'Багаж', facts: 'Факт', condition: 'Особое условие'
};

window.sendGameAction = async function (type, data = {}) {
    console.log('[Debug] sendGameAction called:', type, data);
    try {
        await window.apiRequest({
            action: 'game_action',
            type: type,
            ...data
        });
    } catch (e) {
        console.error("Game Action Error:", e);
        window.showAlert("Ошибка", e.message, 'error');
    }
};

/* --- Popups --- */

window.showRevealPopup = function (playerName, cardType, cardText, photoUrl) {
    var overlay = document.createElement('div');
    overlay.className = 'bunker-reveal-overlay animate__animated animate__zoomIn';
    overlay.innerHTML = `
        <div class="reveal-content text-center">
            <div class="reveal-header mb-3">
                <img src="${photoUrl || ''}" class="reveal-avatar rounded-circle border border-4 border-white shadow-lg mb-3">
                <h2 class="text-white fw-bold mb-0">${playerName}</h2>
                <div class="text-white-50 small text-uppercase letter-spacing-2">РАСКРЫВАЕТ КАРТУ</div>
            </div>
            
            <div class="reveal-card glass-card p-4 mx-auto animate__animated animate__flipInX animate__delay-1s">
                <div class="reveal-icon mb-2 display-1 text-primary">${window.BUNKER_ICONS[cardType]}</div>
                <div class="reveal-type text-uppercase text-muted fw-bold small mb-2">${window.BUNKER_ROUND_NAMES[cardType]}</div>
                <div class="reveal-text h2 fw-bold text-dark mb-0">${cardText}</div>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    // Play sound? window.playSound('reveal');

    setTimeout(function () {
        overlay.classList.remove('animate__zoomIn');
        overlay.classList.add('animate__fadeOut');
        setTimeout(function () { overlay.remove(); }, 500);
    }, 4000);
};

/* --- Main Render Router --- */

window.renderRoundPhase = function (wrapper, state, res) {
    var myId = String(res.user.id);
    var myCards = state.players_cards ? state.players_cards[myId] : null;
    var activePlayerId = String(state.current_player_id);
    var isMyTurn = activePlayerId === myId;

    // Default to 'others' (Survivors) if not set
    if (!window.bunkerState.activeTab) window.bunkerState.activeTab = 'others';

    // Get active player name
    var activePlayer = res.players.find(function (p) { return String(p.id) === activePlayerId; });
    var activeName = activePlayer ? activePlayer.first_name : 'Unknown';

    wrapper.innerHTML = `
        <div class="bunker-main-layout">
            ${window.renderBunkerHeader(state)}
            
            <!-- Floating Turn Indicator -->
            <div class="turn-indicator-floating ${isMyTurn ? 'my-turn' : ''}">
                <div class="turn-avatar-ring">
                    <img src="${activePlayer?.photo_url || ''}" onerror="this.src='data:image/svg+xml;base64,...'" class="turn-avatar">
                </div>
                <div class="turn-info">
                    <div class="turn-label text-uppercase small letter-spacing-1 opacity-75">Ходит сейчас</div>
                    <div class="turn-name fw-bold">${isMyTurn ? 'ВЫ' : activeName}</div>
                </div>
                 ${isMyTurn ? '<div class="turn-badge pulsing"><i class="bi bi-lightning-fill"></i></div>' : ''}
            </div>

            <!-- Segmented Control Tabs -->
            <div class="bunker-segmented-control mb-3 mx-3">
                <button class="segment-btn ${window.bunkerState.activeTab === 'others' ? 'active' : ''}" onclick="window.switchBunkerTab('others')">
                    <i class="bi bi-people-fill me-2"></i>Выжившие
                </button>
                <button class="segment-btn ${window.bunkerState.activeTab === 'me' ? 'active' : ''}" onclick="window.switchBunkerTab('me')">
                    <i class="bi bi-person-vcard-fill me-2"></i>Досье
                </button>
            </div>

            <div class="bunker-status-text text-center mb-2 small text-muted">
                 ${state.turn_phase === 'reveal'
            ? (isMyTurn ? 'Выберите характеристику для раскрытия' : `Ожидаем хода игрока...`)
            : 'Время обсуждения и споров...'}
            </div>

            <div class="bunker-content">
                ${window.bunkerState.activeTab === 'me'
            ? window.renderMyCards(myCards, state, isMyTurn)
            : window.renderOtherPlayers(res.players, state, myId, activePlayerId)}
            </div>

            ${window.renderFooterActions(res.is_host, state, isMyTurn)}
        </div>
    `;
};

/* --- Header Component --- */

window.renderBunkerHeader = function (state) {
    var catastrophe = state.catastrophe;
    var latestFeature = state.revealed_features && state.revealed_features.length > 0
        ? state.revealed_features[state.revealed_features.length - 1]
        : null;

    return `
        <div class="bunker-header-card">
            <!-- Header -->
            <div class="d-flex justify-content-between align-items-center mb-2">
                <div class="bunker-round-badge">Раунд ${state.current_round}</div>
                <div class="bunker-places-badge">Мест: ${state.bunker_places}</div>
            </div>
            
            <div class="catastrophe-section glass-card">
                <div class="cata-icon"><i class="bi bi-radioactive text-danger"></i></div>
                <div class="cata-info">
                    <div class="cata-title">${catastrophe.title}</div>
                    ${catastrophe.duration ? `<div class="cata-duration small opacity-75 mt-1">Пробыть в бункере: <b>${catastrophe.duration}</b></div>` : ''}
                    <div class="cata-desc" onclick="window.showAlert('${catastrophe.title.replace(/'/g, "\\'")}', '${catastrophe.desc ? catastrophe.desc.replace(/'/g, "\\'") : ''}')">
                        ${catastrophe.intro_text || 'Нажмите для полного описания...'}
                    </div>
                </div>
            </div>

            ${latestFeature ? `
                <div class="bunker-feature-alert mt-3 glass-card clickable" onclick="window.showAlert('Бункер: ${latestFeature.text.replace(/'/g, "\\'")}', 'В этом раунде была открыта новая зона или факт о бункере.')">
                    <span class="feature-icon"><i class="bi bi-bricks text-warning"></i></span>
                    <span class="feature-text"><b>Бункер:</b> ${latestFeature.text || latestFeature}</span>
                </div>
            ` : ''}
        </div>
    `;
};

/* --- My Cards Component --- */

window.renderMyCards = function (myCards, state, isMyTurn) {
    if (!myCards) return '<div class="bunker-empty">Данные загружаются...</div>';

    var html = `<div class="bunker-grid pb-5">`;
    var MY_CARDS_ORDER = ['professions', 'biology', 'health', 'hobby', 'advantages', 'disadvantages', 'luggage', 'facts', 'condition'];

    MY_CARDS_ORDER.forEach(function (key) {
        var cardData = myCards[key];
        if (!cardData) return;

        var isCondition = key === 'condition';
        var cardText = isCondition ? cardData.data.title : cardData.text;
        var cardSub = isCondition ? cardData.data.desc : '';
        var isRevealed = cardData.revealed;
        var tags = cardData.tags || [];

        // Logic for Locking
        var isLocked = false;

        // 1. If revealed, not locked (visible).
        // 2. If not revealed:
        //    - It must be my turn.
        //    - It must be 'reveal' phase.
        //    - (Optional) Round restrictions can apply here too.

        if (!isRevealed) {
            if (!isMyTurn) isLocked = true;
            else if (state.turn_phase !== 'reveal') isLocked = true;
        }

        var statusClass = 'bunker-trait-card';
        if (isRevealed) statusClass += ' revealed';
        else if (isLocked) statusClass += ' locked';
        else statusClass += ' active pulse-border'; // New class for clickable

        var tagsHtml = '';
        if (isRevealed && tags.length > 0) {
            tagsHtml = `<div class="trait-tags mt-2">` +
                tags.map(function (t) { return `<span class="badge bg-light text-primary border me-1" style="font-size:10px; font-weight:normal;">${t}</span>`; }).join('') +
                `</div>`;
        }

        html += `
            <div class="${statusClass}" onclick="${(!isRevealed && !isLocked) ? `window.triggerBunkerReveal('${key}')` : ''}">
                <div class="trait-header d-flex align-items-center mb-2">
                    <span class="trait-icon me-2">${window.BUNKER_ICONS[key]}</span>
                    <span class="trait-name">${window.BUNKER_ROUND_NAMES[key]}</span>
                    ${isRevealed ? '<i class="bi bi-check-circle-fill text-success ms-2"></i>' : ''}
                    ${isLocked ? '<i class="bi bi-lock-fill text-muted ms-2"></i>' : ''}
                </div>
                <div class="trait-body">
                    <div class="trait-value">${cardText}</div>
                    ${cardSub ? `<div class="trait-sub">${cardSub}</div>` : ''}
                    ${tagsHtml}
                </div>
                ${(!isRevealed && !isLocked) ? '<div class="tap-hint mt-2 text-primary small fw-bold">НАЖМИ ЧТОБЫ РАСКРЫТЬ</div>' : ''}
                ${(!isRevealed && isLocked) ? '<div class="mt-2 text-muted small">Ждите своего хода</div>' : ''}
                
                ${(isRevealed && isMyTurn && window.getAbilityForTags(tags)) ?
                `<button class="btn btn-sm btn-outline-primary w-100 rounded-pill mt-2" onclick="event.stopPropagation(); window.triggerAbility('${key}', '${window.getAbilityForTags(tags)}')">
                        ${window.getAbilityLabel(window.getAbilityForTags(tags))}
                     </button>`
                : ''}
            </div>
        `;
    });

    html += `</div>`;
    return html;
};

/* --- Abilities Helpers --- */

window.getAbilityForTags = function (tags) {
    // Only items (medkit) give active abilities, not professions
    if (tags.includes('medkit')) return 'heal';
    if (tags.includes('gun')) return 'threat';
    return null;
};

window.getAbilityLabel = function (type) {
    if (type === 'heal') return '❤️ Вылечить';
    if (type === 'threat') return '🔫 Угрожать';
    return 'Использовать';
};

window.triggerAbility = function (cardKey, actionType) {
    // Show Target Picker
    var players = window.bunkerState.lastRes.players.filter(p => !window.bunkerState.lastServerState.kicked_players.includes(String(p.id)));

    // Choose Target Overlay
    var overlay = document.createElement('div');
    overlay.className = 'bunker-reveal-overlay animate__animated animate__fadeIn'; // Reuse overlay style
    overlay.style.pointerEvents = 'auto'; // Enable clicks
    overlay.innerHTML = `
        <div class="bg-white p-4 rounded-4 shadow-lg" style="width: 90%; max-width: 400px;">
            <h3 class="fw-bold mb-3 text-center">Выберите цель</h3>
            <div class="d-grid gap-2">
                ${players.map(p => `
                    <button class="btn btn-outline-dark text-start py-2" onclick="window.sendAbility('${cardKey}', '${actionType}', '${p.id}', this)">
                        <img src="${p.photo_url}" class="rounded-circle me-2" style="width:30px; height:30px;">
                        ${p.first_name}
                    </button>
                `).join('')}
            </div>
            <button class="btn btn-secondary w-100 mt-3 rounded-pill" onclick="this.closest('.bunker-reveal-overlay').remove()">Отмена</button>
        </div>
    `;
    document.body.appendChild(overlay);
};

window.sendAbility = function (cardKey, actionType, targetId, btn) {
    btn.innerHTML = 'Отправка...';
    // Remove overlay
    document.querySelector('.bunker-reveal-overlay').remove();

    window.sendGameAction('use_ability', {
        action: actionType,
        card_key: cardKey,
        target_id: targetId
    });
};

/* --- Other Players Component --- */

window.renderOtherPlayers = function (players, state, myId, activePlayerId) {
    var html = `<div class="bunker-grid pb-5">`;

    players.forEach(function (p) {
        if (String(p.id) === String(myId)) return;
        if (state.kicked_players.includes(String(p.id))) return;

        var isActive = String(p.id) === String(activePlayerId);

        var pCards = state.players_cards[p.id];
        var knownTraits = '';

        if (pCards) {
            var REVEAL_ORDER = ['professions', 'biology', 'health', 'hobby', 'advantages', 'disadvantages', 'luggage', 'facts', 'condition'];
            REVEAL_ORDER.forEach(function (k) {
                var card = pCards[k];
                if (card?.revealed) {
                    var txt = (k === 'condition') ? card.data.title : card.text;
                    var tags = card.tags || [];
                    var tagsStr = tags.length > 0 ? ` <small class="text-muted" style="font-size:0.8em;">[${tags.join(', ')}]</small>` : '';
                    knownTraits += `
                        <div class="mini-trait mb-1 me-1 d-inline-block">
                            <span class="mt-icon">${window.BUNKER_ICONS[k]}</span>
                            <span class="mt-text">${txt}${tagsStr}</span>
                        </div>
                    `;
                }
            });
        }

        if (!knownTraits) knownTraits = `<div class="text-muted small">Информации пока нет</div>`;

        html += `
            <div class="survivor-item mb-3 ${isActive ? 'border-primary shadow' : ''}" style="${isActive ? 'border-width:2px;' : ''}">
                <div class="survivor-head d-flex align-items-center mb-3">
                    <img src="${p.photo_url || ''}" class="survivor-avatar rounded-circle border border-2 ${isActive ? 'border-primary' : 'border-white'} shadow-sm me-3" style="width:40px; height:40px;">
                    <div class="survivor-name fw-bold">${p.first_name} ${isActive ? '<span class="badge bg-primary ms-2">ХОДИТ</span>' : ''}</div>
                </div>
                <div class="survivor-body">
                    ${knownTraits}
                </div>
            </div>
        `;
    });

    html += `</div>`;
    return html;
};

/* --- Voting Phases --- */

window.renderVoteQuery = function (wrapper, state, res) {
    var myId = String(res.user.id);
    var hasVoted = state.vote_query_result && state.vote_query_result[myId];

    wrapper.innerHTML = `
        <div class="bunker-voting-screen text-center">
             <div class="position-absolute top-0 start-0 p-3" style="z-index:100">
                <button class="btn btn-outline-light btn-sm rounded-pill" onclick="window.bunkerFinish()">
                    <i class="bi bi-chevron-left"></i> Выход
                </button>
             </div>
             
            <div class="voting-header mb-5">
                <h1 class="display-1 text-primary"><i class="bi bi-box-seam-fill"></i></h1>
                <h2 class="fw-bold">Голосование</h2>
                <p class="text-muted">Провести голосование на изгнание?</p>
            </div>
            
            ${hasVoted ?
            `<div class="vote-status-msg pulse">Ваш голос принят</div>` :
            `<div class="vote-actions px-4">
                    <button class="btn btn-success btn-lg w-100 rounded-pill mb-3 py-3 fw-bold" onclick="window.sendVoteQuery('yes')">ДА</button>
                    <button class="btn btn-outline-danger btn-lg w-100 rounded-pill py-3 fw-bold" onclick="window.sendVoteQuery('no')">НЕТ</button>
                 </div>`
        }
        </div>
    `;
};

window.renderVoting = function (wrapper, state, res, isRevote) {
    var myId = String(res.user.id);
    var hasVoted = state.votes && state.votes[myId];
    var amIKicked = state.kicked_players.includes(myId);

    var html = `
        <div class="bunker-voting-screen px-4 pb-5"> 
            <!-- Removed Top Exit Button -->
            <div class="text-center mb-4 pt-4">
                <h2 class="fw-bold">${isRevote ? "<i class='bi bi-swords'></i> ДУЭЛЬ <i class='bi bi-swords'></i>" : "КОГО ИЗГНАТЬ?"}</h2>
                ${isRevote ? `<div class="alert alert-warning py-2 small fw-bold mt-2">При повторной ничьей - случайный вылет!</div>` : ''}
                
                ${res.is_host ? `
                    <button class="btn btn-sm btn-outline-warning mt-2" onclick="window.sendGameAction('force_skip_voting')">
                        <i class="bi bi-fast-forward-fill"></i> Завершить голосование
                    </button>
                ` : ''}
            </div>
    `;

    if (amIKicked) {
        html += `<div class="text-center text-muted">Вы наблюдаете за процессом...</div>`;
    } else if (hasVoted) {
        html += `<div class="vote-status-msg pulse">Ожидаем остальных...</div>`;
    } else {
        html += `<div class="voting-targets-grid">`;
        res.players.forEach(function (p) {
            if (state.kicked_players.includes(String(p.id))) return;
            if (isRevote && state.tie_candidates && !state.tie_candidates.includes(String(p.id))) return;

            var argsHtml = '';
            if (isRevote) {
                var pCards = state.players_cards[String(p.id)];
                ['facts', 'luggage'].forEach(function (k) {
                    if (pCards[k]?.revealed) {
                        argsHtml += `<div class="target-arg small text-primary mt-1"><b>${window.BUNKER_ROUND_NAMES[k]}:</b> ${pCards[k].text}</div>`;
                    }
                });
            }

            html += `
                <button class="voting-target-btn w-100 mb-3" onclick="window.sendVoteKick('${p.id}')">
                    <img src="${p.photo_url || ''}" class="target-avatar rounded-circle me-3" style="width:50px; height:50px;">
                    <div class="text-start">
                        <div class="target-name fw-bold">${p.first_name}</div>
                        ${argsHtml}
                    </div>
                </button>
            `;
        });
        html += `</div>`;
    }

    html += `
        <div class="mt-4 pb-4">
            <button class="btn btn-outline-secondary btn-sm rounded-pill w-100 py-3 fw-bold" onclick="window.bunkerFinish(event)">
                <i class="bi bi-chevron-left"></i> Выйти из игры
            </button>
        </div>
    </div>`;

    wrapper.innerHTML = html;
};

window.renderVoteResults = function (wrapper, state, res) {
    var results = state.vote_results;
    var kickedUser = res.players.find(p => String(p.id) === String(results.kicked_id));

    wrapper.innerHTML = `
        <div class="bunker-voting-screen text-center pt-5">
            <h1 class="display-1 text-danger"><i class="bi bi-person-x-fill"></i></h1>
            <h2 class="fw-bold mt-3">ИЗГНАН</h2>
            
            <div class="kicked-card mt-4 mx-auto shadow-lg" style="max-width:300px;">
                <img src="${kickedUser?.photo_url || ''}" class="rounded-circle border border-4 border-danger mb-3" style="width:120px; height:120px; object-fit:cover;">
                <div class="kicked-name text-danger fw-bold h4">${kickedUser?.first_name || 'Игрок'}</div>
                ${results.is_random ? `<div class="badge bg-warning text-dark mt-2">Случайный жребий</div>` : ''}
            </div>
            
            <div class="mt-5 px-4 mb-5">
                ${res.is_host ?
            `<button class="btn btn-primary btn-lg w-100 rounded-pill py-3 fw-bold" onclick="window.sendGameAction('next_phase')">Следующий раунд ➡️</button>` :
            `<div class="text-muted pulse fw-bold">Ждем хоста...</div>`
        }
                <button class="btn btn-link text-muted mt-4 text-decoration-none w-100" onclick="window.bunkerFinish(event)">
                    Выйти в лобби
                </button>
            </div>
        </div>
    `;
};

window.renderOutro = function (wrapper, state, res) {
    var survivors = res.players.filter(p => !state.kicked_players.includes(String(p.id)));

    var html = `
        <div class="bunker-outro-screen p-4" style="padding-top: calc(60px + env(safe-area-inset-top)) !important;">
            <h1 class="outro-title text-center fw-bold mb-4"><i class="bi bi-house-heart-fill me-2"></i>ИСТОРИЯ БУНКЕРА</h1>
            
            <div class="outro-stats d-flex justify-content-around bg-white border rounded-pill p-3 mb-4 shadow-sm">
                <div class="fw-bold text-success">Выжило: ${survivors.length}</div>
                <div class="fw-bold text-primary">Мест: ${state.bunker_places}</div>
            </div>
            
            ${window.renderThreats(state)}
            
            <div class="survivors-stories mt-4 pb-5">
                ${window.renderStories(res.players, state)}
            </div>
        </div>
    `;

    html += `
        <div class="fixed-bottom-actions px-4 pb-4 bg-transparent">
            ${res.is_host ?
            `<button class="btn btn-primary btn-lg w-100 rounded-pill py-3 fw-bold shadow-lg" onclick="window.bunkerFinish(event)">↩️ В Лобби</button>` :
            `<button class="btn btn-outline-secondary btn-lg w-100 rounded-pill py-3 fw-bold bg-white shadow-sm" onclick="window.bunkerFinish(event)">Выйти</button>`
        }
        </div>`;

    wrapper.innerHTML = html;
};

/* --- Helpers --- */

window.renderThreats = function (state) {
    if (!state.threat_results) return '';
    return state.threat_results.map(function (t) {
        var reqs = t.requirements ? `<div class="small mt-1 opacity-75">Требования: ${t.requirements.join(', ')}</div>` : '';
        return `
        <div class="alert ${t.success ? 'alert-success' : 'alert-danger'} border-0 shadow-sm mb-3">
            <div class="d-flex justify-content-between align-items-center mb-2">
                <span class="fw-bold">${t.title}</span>
                <span>${t.success ? '✅ Success' : '❌ Failure'}</span>
            </div>
            <div class="small opacity-75">${t.desc}</div>
            ${reqs}
            <div class="small fw-bold mt-2">${t.result_text}</div>
        </div>
    `;
    }).join('');
};

window.renderStories = function (players, state) {
    return players.map(function (p) {
        var isKicked = state.kicked_players.includes(String(p.id));
        var pCards = state.players_cards[String(p.id)];
        if (!pCards) return '';
        var cond = pCards.condition.data;

        return `
            <div class="card border-0 shadow-sm mb-3 ${isKicked ? 'bg-light opacity-75' : 'bg-white'}">
                <div class="card-body">
                    <div class="d-flex align-items-center mb-2">
                        <img src="${p.photo_url}" class="rounded-circle me-3" style="width:36px; height:36px;">
                        <div class="flex-grow-1">
                            <div class="fw-bold">${p.first_name}</div>
                        </div>
                        <span class="badge ${isKicked ? 'bg-secondary' : 'bg-success'}">${isKicked ? 'Изгнан' : 'Выжил'}</span>
                    </div>
                    <div class="small fw-bold text-primary mb-1">${cond.title}</div>
                    <div class="small fst-italic text-muted">"${isKicked ? cond.fail_text : cond.win_text}"</div>
                </div>
            </div>
        `;
    }).join('');
};

window.renderFooterActions = function (isHost, state, isMyTurn) {
    // Only show in Reveal/Discussion phases
    if (state.turn_phase !== 'reveal' && state.turn_phase !== 'discussion') return '';

    let buttons = '';

    // -- 1. ADMIN ACTIONS --
    // Only Admin (Host), only if NOT my turn, only in Reveal
    if (isHost && !isMyTurn && state.turn_phase === 'reveal') {
        buttons += `
            <button class="action-btn-circle warning" onclick="window.sendGameAction('end_turn')" title="Пропустить ход игрока">
                <i class="bi bi-skip-forward-fill"></i>
            </button>
            <div class="action-label">Пропуск</div>
        `;
    }

    // Only Admin (Host), in Discussion (start vote)
    if (isHost && state.turn_phase === 'discussion') {
        buttons += `
            <button class="action-btn-circle success pulsing" onclick="window.sendGameAction('end_turn')" title="Начать голосование">
                <i class="bi bi-play-fill" style="font-size: 1.5rem;"></i>
            </button>
            <div class="action-label">Голосовать</div>
        `;
    }

    // -- 2. PLAYER ACTIONS (End Turn) --
    // Only Active Player, in Discussion
    if (isMyTurn && state.turn_phase === 'discussion') {
        buttons += `
            <button class="action-btn-circle success" onclick="window.sendGameAction('end_turn')">
                <i class="bi bi-check-lg" style="font-size: 1.5rem;"></i>
            </button>
            <div class="action-label">Завершить</div>
        `;
    }

    // -- 3. EXIT BUTTON (Always available) --
    let exitButton = `
        <div class="action-group">
            <button class="action-btn-circle secondary" onclick="window.bunkerFinish()">
                <i class="bi bi-door-open-fill"></i>
            </button>
            <div class="action-label">Выход</div>
        </div>
    `;

    return `
        <div class="bunker-footer-bar">
            <div class="footer-actions-container">
                ${exitButton}
                
                ${buttons ? `<div class="action-divider"></div>` : ''}
                
                ${buttons ? `<div class="action-group">${buttons}</div>` : ''}
            </div>
        </div>
    `;
};

window.renderTieReveal = function (wrapper, state, res) {
    var myId = String(res.user.id);
    var isCandidate = state.tie_candidates && state.tie_candidates.includes(myId);
    
    var html = `
        <div class="bunker-voting-screen px-4 pb-5 pt-5 text-center">
            <h1 class="display-3 mb-4">⚖️</h1>
            <h2 class="fw-bold mb-3">НИЧЬЯ!</h2>
            <div class="alert alert-info rounded-4 shadow-sm mb-4">
                Кандидаты должны раскрыть по одной дополнительной карте (Багаж или Факт), чтобы склонить чашу весов в свою пользу!
            </div>
    `;

    if (isCandidate) {
        // Find which cards are NOT revealed yet among Facts/Luggage
        var pCards = state.players_cards[myId];
        var options = ['facts', 'luggage'].filter(k => pCards[k] && !pCards[k].revealed);
        
        if (options.length === 0) {
            html += `<div class="pulse fw-bold">Все карты раскрыты. Ожидаем остальных...</div>`;
        } else {
            html += `<div class="d-grid gap-3">`;
            options.forEach(k => {
                html += `
                    <button class="btn btn-primary btn-lg rounded-pill py-3 fw-bold" onclick="window.sendGameAction('reveal_card', {card_type: '${k}'})">
                        Раскрыть: ${window.BUNKER_ROUND_NAMES[k] || k}
                    </button>
                `;
            });
            html += `</div>`;
        }
    } else {
        html += `
            <div class="vote-status-msg pulse">
                Кандидаты выбирают карты...
            </div>
        `;
    }

    if (res.is_host) {
        html += `
            <div class="mt-4">
                <button class="btn btn-outline-warning btn-sm rounded-pill px-4" onclick="window.sendGameAction('skip_tie_reveal')">
                    Пропустить (Сразу к голосованию)
                </button>
            </div>
        `;
    }

    html += `
        <div class="mt-5">
            <button class="btn btn-link text-muted text-decoration-none" onclick="window.bunkerFinish(event)">
                Выйти в лобби
            </button>
        </div>
    </div>`;

    wrapper.innerHTML = html;
};
