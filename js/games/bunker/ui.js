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

/* --- Main Render Router --- */

window.renderRoundPhase = function (wrapper, state, res) {
    var myId = String(res.user.id);
    var myCards = state.players_cards ? state.players_cards[myId] : null;

    wrapper.innerHTML = `
        <div class="bunker-main-layout">
            ${window.renderBunkerHeader(state)}
            
            <div class="bunker-tabs">
                <button class="bunker-tab ${window.bunkerState.activeTab === 'me' ? 'active' : ''}" onclick="window.switchBunkerTab('me')"><i class="bi bi-person-vcard-fill me-2"></i>Досье</button>
                <button class="bunker-tab ${window.bunkerState.activeTab === 'others' ? 'active' : ''}" onclick="window.switchBunkerTab('others')"><i class="bi bi-people-fill me-2"></i>Выжившие</button>
            </div>

            <div class="bunker-content">
                ${window.bunkerState.activeTab === 'me' ? window.renderMyCards(myCards, state) : window.renderOtherPlayers(res.players, state, myId)}
            </div>

            ${window.renderFooterActions(res.is_host, state)}
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
            <div class="d-flex justify-content-between align-items-start mb-2">
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
                <div class="bunker-feature-alert mt-3 glass-card">
                    <span class="feature-icon"><i class="bi bi-bricks text-warning"></i></span>
                    <span class="feature-text"><b>Бункер:</b> ${latestFeature.text || latestFeature}</span>
                </div>
            ` : ''}
        </div>
    `;
};

/* --- My Cards Component --- */

window.renderMyCards = function (myCards, state) {
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

        var isLocked = false;
        if (state.current_round === 0) {
            if (!['professions', 'facts', 'luggage', 'condition'].includes(key)) isLocked = true;
        }

        var statusClass = 'bunker-trait-card';
        if (isRevealed) statusClass += ' revealed';
        else if (isLocked) statusClass += ' locked';
        else statusClass += ' active';

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
                ${(!isRevealed && !isLocked) ? '<div class="tap-hint mt-2 text-primary small fw-bold">Нажмите, чтобы раскрыть</div>' : ''}
                ${(!isRevealed && isLocked) ? '<div class="mt-2 text-muted small">Показать всем можно будет позже</div>' : ''}
            </div>
        `;
    });

    html += `</div>`;
    return html;
};

/* --- Other Players Component --- */

window.renderOtherPlayers = function (players, state, myId) {
    var html = `<div class="bunker-grid pb-5">`;

    players.forEach(function (p) {
        if (String(p.id) === String(myId)) return;
        if (state.kicked_players.includes(String(p.id))) return;

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
            <div class="survivor-item mb-3">
                <div class="survivor-head d-flex align-items-center mb-3">
                    <img src="${p.photo_url || ''}" class="survivor-avatar rounded-circle border border-2 border-white shadow-sm me-3" style="width:40px; height:40px;">
                    <div class="survivor-name fw-bold">${p.first_name}</div>
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
        <div class="bunker-voting-screen px-4">
            <div class="text-center mb-4">
                <h2 class="fw-bold">${isRevote ? "<i class='bi bi-swords'></i> ДУЭЛЬ <i class='bi bi-swords'></i>" : "КОГО ИЗГНАТЬ?"}</h2>
                ${isRevote ? `<div class="alert alert-warning py-2 small fw-bold mt-2">При повторной ничьей - случайный вылет!</div>` : ''}
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

    html += `</div>`;
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
            
            <div class="mt-5 px-4">
                ${res.is_host ?
            `<button class="btn btn-primary btn-lg w-100 rounded-pill py-3 fw-bold" onclick="window.sendGameAction('next_phase')">Следующий раунд ➡️</button>` :
            `<div class="text-muted pulse fw-bold">Ждем хоста...</div>`
        }
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

window.renderFooterActions = function (isHost, state) {
    if (!isHost) return `<div class="bunker-footer-wait">Ожидание хоста... <span onclick="window.bunkerFinish(event)" class="text-decoration-underline pointer">Выйти</span></div>`;
    return `
        <div class="bunker-host-controls pb-4">
            <button class="btn btn-primary btn-lg w-100 rounded-pill py-3 fw-bold shadow-lg" onclick="window.sendGameAction('next_phase')">Следующая фаза ➡️</button>
        </div>
    `;
};
