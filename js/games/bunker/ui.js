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
    threat: '<i class="bi bi-radioactive"></i>',
    backstory: '<i class="bi bi-journal-richtext"></i>'
};

// Simple grey silhouette for default avatar
window.DEFAULT_AVATAR = "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64' fill='%23e0e0e0'%3E%3Crect width='64' height='64' rx='32' fill='%23cccccc'/%3E%3Ccircle cx='32' cy='25' r='12' fill='%239e9e9e'/%3E%3Cpath d='M12 56c0-11 9-20 20-20s20 9 20 20' fill='%239e9e9e'/%3E%3C/svg%3E";

window.getAvatarSrc = function (url) {
    if (!url || url.length < 5 || url === 'undefined') return window.DEFAULT_AVATAR;
    return url;
};

window.BUNKER_ROUND_NAMES = {
    professions: 'Профессия', biology: 'Биология', health: 'Здоровье',
    hobby: 'Хобби', advantages: 'Сильная черта', disadvantages: 'Слабость',
    luggage: 'Багаж', facts: 'Факт', condition: 'Особое условие',
    backstory: 'Судьба'
};

window.sendGameAction = async function (type, data = {}) {

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
    overlay.className = 'bunker-reveal-overlay bunker-reveal-popup';
    overlay.innerHTML = `
        <div class="reveal-content text-center">
            <div class="reveal-header bunker-reveal-header mb-3">
                <img src="${window.getAvatarSrc(photoUrl)}" class="reveal-avatar rounded-circle border border-4 border-white shadow-lg mb-3">
                <h2 class="fw-bold mb-0" style="color:var(--text-light);">${playerName}</h2>
                <div class="small text-uppercase letter-spacing-2" style="color:var(--text-light); opacity:0.6;">РАСКРЫВАЕТ КАРТУ</div>
            </div>
            
            <div class="reveal-card p-4 mx-auto">
                <div class="reveal-icon mb-2 display-1" style="color:var(--primary-color);">${window.BUNKER_ICONS[cardType]}</div>
                <div class="reveal-type text-uppercase fw-bold small mb-2" style="color:var(--text-muted);">${window.BUNKER_ROUND_NAMES[cardType]}</div>
                <div class="reveal-text h2 fw-bold mb-0" style="color:var(--text-main);">${cardText}</div>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);
    requestAnimationFrame(function () {
        overlay.classList.add('is-visible');
    });

    // Play sound? window.playSound('reveal');

    function closeRevealPopup() {
        overlay.classList.remove('is-visible');
        overlay.classList.add('is-closing');
        setTimeout(function () { overlay.remove(); }, document.body.classList.contains('thermal-safe') ? 0 : 260);
    }

    setTimeout(closeRevealPopup, 4000);
};

window.getBunkerStatusText = function (state, isMyTurn) {
    if (state.turn_phase === 'reveal') {
        if (window.bunkerState.activeTab === 'others') {
            return 'Здесь видно, кто остался в игре и что уже известно';
        }
        return isMyTurn ? 'Выберите характеристику для раскрытия' : 'Ожидаем хода игрока...';
    }
    return window.bunkerState.activeTab === 'others'
        ? 'Следите, кто уже раскрыл данные и кто ещё в игре'
        : 'Время обсуждения и споров...';
};

window.animateBunkerRevealedCard = function (cardType) {
    if (!cardType) return;
    var card = document.querySelector('.bunker-trait-card.just-revealed');
    if (!card) return;

    if (document.body.classList.contains('thermal-safe')) {
        card.classList.add('is-revealed');
        setTimeout(function () {
            card.classList.remove('just-revealed', 'is-revealed');
        }, 80);
        return;
    }

    card.classList.add('reveal-ready');
    requestAnimationFrame(function () {
        requestAnimationFrame(function () {
            card.classList.add('is-revealed');
        });
    });
    setTimeout(function () {
        card.classList.remove('just-revealed', 'reveal-ready', 'is-revealed');
    }, 720);
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
    var activePlayer = activePlayerId && activePlayerId !== 'null' ? res.players.find(function (p) { return String(p.id) === activePlayerId; }) : null;
    var activeName = activePlayer ? activePlayer.first_name : (state.phase === 'voting' ? 'Голосование' : 'Ожидание...');

    wrapper.innerHTML = `
        <div class="bunker-main-layout bunker-round-screen px-3">
            ${window.renderBunkerHeader(state)}
            
            <!-- Floating Turn Indicator -->
            ${(activePlayerId && activePlayerId !== 'null' && state.phase === 'round') ? `
            <div class="turn-indicator-floating ${isMyTurn ? 'my-turn' : ''}">
                <div class="turn-avatar-ring">
                    <img src="${window.getAvatarSrc(activePlayer?.photo_url)}" class="turn-avatar">
                </div>
                <div class="turn-info">
                   ${isMyTurn
                ? `<div class="turn-label text-uppercase fw-bold letter-spacing-1" style="color:var(--status-warning);">ВАШ ХОД!</div>`
                : `<div class="turn-label text-uppercase small letter-spacing-1" style="opacity:0.75; color:var(--text-main);">Ходит сейчас</div><div class="turn-name fw-bold" style="color:var(--text-main);">${activeName}</div>`
            }
                </div>
                 ${isMyTurn ? '<div class="turn-badge pulsing"><i class="bi bi-lightning-fill"></i></div>' : ''}
            </div>
            ` : ''}

            <!-- Segmented Control Tabs -->
            <div class="bunker-segmented-control mb-3">
                <button class="segment-btn ${window.bunkerState.activeTab === 'others' ? 'active' : ''}" onclick="window.switchBunkerTab('others')">
                    <i class="bi bi-people-fill me-2"></i>Выжившие
                </button>
                <button class="segment-btn ${window.bunkerState.activeTab === 'me' ? 'active' : ''}" onclick="window.switchBunkerTab('me')">
                    <i class="bi bi-file-earmark-person-fill me-2"></i>Досье
                </button>
            </div>

            <div class="bunker-status-text text-center mb-2 small" style="color:var(--text-muted);">
                 ${window.getBunkerStatusText(state, isMyTurn)}
            </div>

            <div class="bunker-content bunker-round-content">
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

    return `
        <div class="bunker-header-stack">
            <div class="bunker-status-card">
                <div class="d-flex justify-content-between align-items-center">
                    <div class="bunker-round-badge">Раунд ${state.current_round}</div>
                    <div class="bunker-places-badge">Мест: ${state.bunker_places}</div>
                </div>
            </div>
            
            <div class="catastrophe-section">
                <div class="cata-icon"><i class="bi bi-radioactive" style="color:var(--status-error);"></i></div>
                <div class="cata-info">
                    <div class="cata-title">${catastrophe.title}</div>
                    ${catastrophe.duration ? `<div class="cata-duration small opacity-75 mt-1">Пробыть в бункере: <b>${catastrophe.duration}</b></div>` : ''}
                    <div class="cata-desc" onclick="window.showAlert('${catastrophe.title.replace(/'/g, "\\'")}', '${catastrophe.desc ? catastrophe.desc.replace(/'/g, "\\'") : ''}')">
                        ${catastrophe.intro_text || 'Нажмите для полного описания...'}
                    </div>
                </div>
            </div>

            ${state.revealed_features && state.revealed_features.length > 0 ? `
                <div class="bunker-features-list">
                    ${state.revealed_features.slice().reverse().map((f, i) => {
        const isIncident = f.type === 'incident';
        const isFixed = f.fixed;
        const icon = isIncident ? 'bi-exclamation-triangle-fill' : 'bi-bricks';
        const iconColor = isIncident ? (isFixed ? 'var(--status-success)' : 'var(--status-error)') : 'var(--status-warning)';
        const realIdx = state.revealed_features.length - 1 - i;

        return `
                        <div class="bunker-feature-alert clickable mb-2" 
                             style="border-left: 4px solid ${isIncident ? (isFixed ? 'var(--status-success)' : 'var(--status-error)') : 'var(--primary-color)'};"
                             onclick="window.showBunkerFeatureDetails(${realIdx})">
                            <span class="feature-icon"><i class="bi ${icon}" style="color:${iconColor};"></i></span>
                            <span class="feature-text">
                                <span class="badge bg-secondary opacity-75 me-2" style="font-size: 10px; font-weight: normal;">Раунд ${realIdx + 1}</span>
                                <span class="${isIncident && !isFixed ? 'text-danger fw-bold' : ''}">${f.text}</span>
                            </span>
                        </div>
                    `}).join('')}
                </div>
            ` : ''}
        </div>
    `;
};

window.showBunkerFeatureDetails = function (index) {
    const state = window.bunkerState.lastServerState;
    const f = state.revealed_features[index];
    if (!f) return;

    const isIncident = f.type === 'incident';
    const bonusColor = f.bonus > 0 ? 'var(--status-success)' : 'var(--status-error)';
    const effectHtml = f.bonus ? `<br><br><b>Эффект:</b> <span style="color:${bonusColor}">${f.bonus > 0 ? '+' : ''}${f.bonus}% к выживанию</span>` : '';

    window.showAlert(
        isIncident ? 'Происшествие' : 'Объект бункера',
        `<b>${f.text}</b><br><br>${f.desc || 'Нет дополнительного описания.'}${effectHtml}`
    );
};

/* --- My Cards Component --- */

window.renderMyCards = function (myCards, state, isMyTurn) {
    if (!myCards) return '<div class="bunker-empty">Данные загружаются...</div>';

    var html = `<div class="bunker-grid pb-5">`;
    var MY_CARDS_ORDER = ['professions', 'biology', 'health', 'hobby', 'advantages', 'disadvantages', 'luggage', 'facts', 'backstory', 'condition'];

    MY_CARDS_ORDER.forEach(function (key) {
        var cardData = myCards[key];
        if (!cardData) return;

        var isCondition = key === 'condition';
        var cardText = isCondition ? cardData.data.title : cardData.text;
        var cardSub = isCondition ? cardData.data.desc : (cardData.desc || (cardData.data && cardData.data.desc) || '');
        var isRevealed = cardData.revealed;
        var tags = cardData.tags || [];
        var action = cardData.action || (cardData.data && cardData.data.action);
        var isUsed = cardData.used;
        var isJustRevealed = window.bunkerState.pendingRevealCard === key;

        // Logic for Locking
        var isLocked = false;
        var isProfessionRevealed = myCards['professions'].revealed;

        if (!isRevealed) {
            if (!isMyTurn) {
                isLocked = true;
            } else if (state.turn_phase !== 'reveal') {
                isLocked = true;
            } else {
                if (!isProfessionRevealed && key !== 'professions') {
                    isLocked = true;
                }
            }
        }

        var statusClass = 'bunker-trait-card';
        if (isRevealed) statusClass += ' revealed';
        else if (isLocked) statusClass += ' locked';
        else statusClass += ' active pulse-border';
        if (isJustRevealed) statusClass += ' just-revealed';

        var tagsHtml = '';
        if (isRevealed && tags.length > 0) {
            tagsHtml = `<div class="trait-tags mt-2">` +
                tags.map(function (t) { return `<span class="badge border me-1" style="background:var(--bg-secondary); color:var(--primary-color); font-size:10px; font-weight:normal;">${t}</span>`; }).join('') +
                `</div>`;
        }

        // Active Button Logic
        var actionBtn = '';
        if (isRevealed && isMyTurn && action && !isUsed) {
            actionBtn = `
                <button class="btn btn-sm btn-outline-primary w-100 rounded-pill mt-2" onclick="event.stopPropagation(); window.triggerAbility('${key}', '${action}')">
                    ${window.getAbilityLabel(action)}
                </button>`;
        } else if (isRevealed && isUsed) {
            actionBtn = `<div class="mt-2 text-center small text-muted fst-italic">Использовано</div>`;
        }

        html += `
            <div class="${statusClass}" data-card-key="${key}" onclick="${(!isRevealed && !isLocked) ? `window.triggerBunkerReveal('${key}')` : ''}">
                <div class="trait-header d-flex align-items-center mb-2">
                    <span class="trait-icon me-2">${window.BUNKER_ICONS[key]}</span>
                    <span class="trait-name">${window.BUNKER_ROUND_NAMES[key]}</span>
                    ${isRevealed ? '<i class="bi bi-check-circle-fill ms-2" style="color:var(--status-success);"></i>' : ''}
                    ${isLocked ? '<i class="bi bi-lock-fill ms-2" style="color:var(--text-muted);"></i>' : ''}
                </div>
                <div class="trait-body">
                    <div class="trait-value">${cardText}</div>
                    ${cardSub ? `<div class="trait-sub">${cardSub}</div>` : ''}
                    ${tagsHtml}
                </div>
                ${(!isRevealed && !isLocked) ? '<div class="tap-hint mt-2 small fw-bold" style="color:var(--primary-color);">НАЖМИ ЧТОБЫ РАСКРЫТЬ</div>' : ''}
                ${(!isRevealed && isLocked) ? '<div class="mt-2 small" style="color:var(--text-muted);">Ждите своего хода</div>' : ''}
                ${actionBtn}
            </div>
        `;
    });

    html += `</div>`;
    return html;
};

/* --- Abilities Helpers --- */

window.getAbilityLabel = function (type) {
    if (type === 'heal') return '❤️ Вылечить';
    if (type === 'heal_self') return '❤️ Вылечить себя';
    if (type === 'threaten') return '🔫 Угрожать';
    if (type === 'steal_luggage' || type === 'swap_luggage') return '🎒 Обменять багаж';
    if (type === 'reveal_feature') return '🖥️ Взломать (Факт)';
    if (type === 'fix_system') return '🔧 Починить';
    if (type === 'spy_card') return '🕵️ Подсмотреть';
    if (type === 'override_event') return '💻 Хакнуть будущее';
    if (type === 'force_reveal') return '🪄 Разоблачить';
    if (type === 'copy_luggage') return '💰 Отдать багаж';
    return '⚡ Использовать';
};

window.triggerAbility = function (cardKey, actionType) {
    // Actions that don't require a target
    if (['heal_self', 'reveal_feature', 'threaten', 'fix_system', 'override_event'].includes(actionType)) {
        if (!confirm('Вы уверены, что хотите использовать эту способность?')) return;
        window.sendAbility(cardKey, actionType, null, { innerHTML: '' }); // Fake btn
        return;
    }

    // Show Target Picker for others
    var myId = String(window.bunkerState.lastRes.user.id);
    var allowSelfTarget = actionType === 'heal';
    var players = window.bunkerState.lastRes.players.filter(p => {
        if (window.bunkerState.lastServerState.kicked_players.includes(String(p.id))) return false;
        return allowSelfTarget || String(p.id) !== myId;
    });

    var overlay = document.createElement('div');
    overlay.className = 'bunker-reveal-overlay animate__animated animate__fadeIn';
    overlay.style.pointerEvents = 'auto';
    overlay.innerHTML = `
        <div class="glass-card p-4 rounded-4 shadow-lg" style="width: 90%; max-width: 400px;">
            <h3 class="fw-bold mb-3 text-center">Выберите цель</h3>
            <div class="d-grid gap-2">
                ${players.map(p => `
                    <button class="btn text-start py-2" style="background:var(--bg-card); color:var(--text-main); border:1px solid var(--border-main);" onclick="window.sendAbility('${cardKey}', '${actionType}', '${p.id}', this)">
                        <img src="${window.getAvatarSrc(p.photo_url)}" class="rounded-circle me-2" style="width:30px; height:30px;">
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
    if (btn && btn.innerHTML) btn.innerHTML = 'Отправка...';
    // Remove overlay if exists
    const overlay = document.querySelector('.bunker-reveal-overlay');
    if (overlay) overlay.remove();

    window.sendGameAction('use_card', {
        card_type: cardKey,
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
            var REVEAL_ORDER = ['professions', 'biology', 'health', 'hobby', 'advantages', 'disadvantages', 'luggage', 'facts', 'backstory', 'condition'];
            REVEAL_ORDER.forEach(function (k) {
                var card = pCards[k];
                if (card?.revealed) {
                    var txt = (k === 'condition') ? card.data.title : card.text;
                    var tags = card.tags || [];
                    var tagsStr = tags.length > 0 ? ` <small class="text-muted" style="font-size:0.8em;">[${tags.join(', ')}]</small>` : '';
                    knownTraits += `
                        <div class="mini-trait mb-1 me-1 d-inline-block">
                            <span class="mt-icon">${window.BUNKER_ICONS[k]}</span>
                            <span class="mt-text" style="color:var(--text-main);">${txt}${tagsStr}</span>
                        </div>
                    `;
                }
            });
        }

        if (!knownTraits) knownTraits = `<div class="text-muted small">Информации пока нет</div>`;

        html += `
                <div class="survivor-item mb-3 ${isActive ? 'active-survivor' : ''}" style="${isActive ? 'border: 2px solid var(--primary-color) !important; box-shadow: var(--shadow-sm);' : 'border: 1px solid var(--border-main);'}">
                    <div class="survivor-head d-flex align-items-center mb-3">
                        <img src="${window.getAvatarSrc(p.photo_url)}" class="survivor-avatar rounded-circle border border-2 ${isActive ? 'border-primary' : 'border-white'} shadow-sm me-3" style="width:40px; height:40px;">
                        <div class="survivor-name fw-bold" style="color:var(--text-main);">${p.first_name} ${isActive ? `<span class="badge ms-2" style="background:var(--primary-color); color:var(--text-on-accent);">ХОДИТ</span>` : ''}</div>
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
                <h1 class="display-1" style="color:var(--primary-color);"><i class="bi bi-box-seam-fill"></i></h1>
                <h2 class="fw-bold" style="color:var(--text-main);">Голосование</h2>
                <p style="color:var(--text-muted);">Провести голосование на изгнание?</p>
            </div>
            
            ${hasVoted ?
            `<div class="vote-status-msg pulse" style="color:var(--status-success);">Ваш голос принят</div>` :
            `<div class="vote-actions px-4">
                    <button class="btn btn-lg w-100 rounded-pill mb-3 py-3 fw-bold" style="background:var(--status-success); color:var(--text-on-accent);" onclick="window.sendVoteQuery('yes')">ДА</button>
                    <button class="btn btn-lg w-100 rounded-pill py-3 fw-bold" style="background:var(--status-error); color:var(--text-on-accent); border:1px solid var(--status-error);" onclick="window.sendVoteQuery('no')">НЕТ</button>
                 </div>`
        }
            <div class="mt-5 px-4">
                 <button class="btn btn-outline-secondary btn-sm rounded-pill w-100 py-3" onclick="window.bunkerFinish()">
                    <i class="bi bi-chevron-left"></i> Выход
                </button>
            </div>
        </div>
    `;
};

window.cleanupBunkerVotingPortal = function () {
    var portal = document.getElementById('bunker-voting-portal');
    if (portal) portal.remove();
    if (window.bunkerVotingPortalResize) {
        window.removeEventListener('resize', window.bunkerVotingPortalResize);
        window.bunkerVotingPortalResize = null;
    }
};

window.mountBunkerVotingPortal = function (wrapper) {
    var deviceContent = document.querySelector('.device-content');
    var usePortal = deviceContent && window.matchMedia('(min-width: 1024px) and (pointer: fine)').matches;
    if (!usePortal) {
        window.cleanupBunkerVotingPortal();
        return wrapper;
    }

    var portal = document.getElementById('bunker-voting-portal');
    if (!portal) {
        portal = document.createElement('div');
        portal.id = 'bunker-voting-portal';
        document.body.appendChild(portal);
    }

    var positionPortal = function () {
        var rect = deviceContent.getBoundingClientRect();
        portal.style.cssText = [
            'position:fixed',
            'left:' + rect.left + 'px',
            'top:' + rect.top + 'px',
            'width:' + rect.width + 'px',
            'height:' + rect.height + 'px',
            'z-index:9000',
            'overflow:hidden',
            'border-radius:50px',
            'background:#f8fafc',
            'pointer-events:auto'
        ].join(';');
    };

    positionPortal();
    if (window.bunkerVotingPortalResize) {
        window.removeEventListener('resize', window.bunkerVotingPortalResize);
    }
    window.bunkerVotingPortalResize = positionPortal;
    window.addEventListener('resize', window.bunkerVotingPortalResize);

    wrapper.innerHTML = '';
    return portal;
};

window.renderVoting = function (wrapper, state, res, isRevote) {
    var myId = String(res.user.id);
    var hasVoted = state.votes && state.votes[myId];
    var amIKicked = state.kicked_players.includes(myId);
    var availableTargets = res.players.filter(function (p) {
        if (state.kicked_players.includes(String(p.id))) return false;
        if (String(p.id) === myId) return false;
        if (isRevote && state.tie_candidates && !state.tie_candidates.includes(String(p.id))) return false;
        return true;
    });

    var html = `
        <div class="bunker-voting-screen px-4 pb-5" style="position:absolute; inset:0; height:100dvh; min-height:100dvh; overflow-y:auto; -webkit-overflow-scrolling:touch; isolation:isolate; background:#f8fafc; color:#1e293b; pointer-events:auto; z-index:5000;">
            <div class="bunker-voting-panel" style="position:relative; z-index:50; min-height:100%; width:100%; display:flex; flex-direction:column; pointer-events:auto;">
            <!-- Removed Top Exit Button -->
            <div class="text-center mb-4 pt-4">
                <h2 class="fw-bold" style="color:#1e293b;">${state.phase_title || (isRevote ? "<i class='bi bi-swords'></i> ДУЭЛЬ <i class='bi bi-swords'></i>" : "КОГО ИЗГНАТЬ?")}</h2>
                ${isRevote ? `<div class="alert py-2 small fw-bold mt-2" style="background:var(--bg-secondary); color:var(--status-warning); border:1px solid var(--border-main);">При повторной ничьей - случайный вылет!</div>` : ''}
                
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
        if (availableTargets.length === 0) {
            html += `<div class="vote-status-msg">Нет доступных целей для голосования</div>`;
        } else {
            html += `<div class="voting-targets-grid" style="display:flex; flex-direction:column; gap:10px; padding-bottom:120px; position:relative; z-index:2; width:100%; pointer-events:auto;">`;
        }
        availableTargets.forEach(function (p) {

            var argsHtml = '';
            if (isRevote) {
                var pCards = state.players_cards[String(p.id)];
                ['facts', 'luggage'].forEach(function (k) {
                    if (pCards[k]?.revealed) {
                        argsHtml += `<div class="target-arg small mt-1" style="color:var(--primary-color);"><b>${window.BUNKER_ROUND_NAMES[k]}:</b> ${pCards[k].text}</div>`;
                    }
                });
            }

            html += `
                <button class="voting-target-btn w-100 mb-3" style="display:flex !important; align-items:center; width:100%; min-height:68px; padding:14px; border-radius:18px; border:1px solid #cbd5e1; background:#ffffff; color:#1e293b; opacity:1; visibility:visible; position:relative; z-index:3; pointer-events:auto;" onclick="window.sendVoteKick('${p.id}')">
                    <img src="${window.getAvatarSrc(p.photo_url)}" class="target-avatar rounded-circle me-3" style="width:50px; height:50px;">
                    <div class="text-start">
                        <div class="target-name fw-bold" style="color:#1e293b; opacity:1; visibility:visible;">${p.first_name}</div>
                        ${argsHtml}
                    </div>
                </button>
            `;
        });
        if (availableTargets.length > 0) {
            html += `</div>`;
        }
    }

    html += `
        <div class="mt-4 pb-4">
            <button class="btn btn-outline-secondary btn-sm rounded-pill w-100 py-3 fw-bold" onclick="window.bunkerFinish(event)">
                <i class="bi bi-chevron-left"></i> Выйти из игры
            </button>
        </div>
        </div>
    </div>`;

    var votingHost = window.mountBunkerVotingPortal(wrapper);
    votingHost.innerHTML = html;
    var reactionToolbar = document.getElementById('reaction-toolbar');
    if (reactionToolbar) reactionToolbar.style.display = 'none';
};

window.renderVoteResults = function (wrapper, state, res) {
    var results = state.vote_results;
    var kickedUser = res.players.find(p => String(p.id) === String(results.kicked_id));

    wrapper.innerHTML = `
        <div class="bunker-voting-screen text-center pt-5">
            <h1 class="display-1" style="color:var(--status-error);"><i class="bi bi-person-x-fill"></i></h1>
            <h2 class="fw-bold mt-3" style="color:var(--text-main);">ИЗГНАН</h2>
            
            <div class="kicked-card mt-4 mx-auto shadow-lg" style="max-width:300px; background:var(--bg-card); border-radius:24px; padding:20px;">
                <img src="${window.getAvatarSrc(kickedUser?.photo_url)}" class="rounded-circle border border-4 mb-3" style="width:120px; height:120px; object-fit:cover; border-color:var(--status-error) !important;">
                <div class="kicked-name fw-bold h4" style="color:var(--status-error);">${kickedUser?.first_name || 'Игрок'}</div>
                ${results.is_random ? `<div class="badge mt-2" style="background:var(--status-warning); color:var(--bg-dark);">Случайный жребий</div>` : ''}
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
        <div class="bunker-outro-screen p-4" style="padding-top: calc(82px + env(safe-area-inset-top)) !important; padding-bottom: calc(150px + env(safe-area-inset-bottom)) !important;">
            <h1 class="outro-title text-center fw-bold mb-4"><i class="bi bi-house-heart-fill me-2"></i>ИСТОРИЯ БУНКЕРА</h1>
            
            <div class="outro-stats d-flex justify-content-around rounded-pill p-3 mb-3 shadow-sm" style="background:var(--bg-secondary); border:1px solid var(--border-main);">
                <div class="fw-bold" style="color:var(--status-success);">Выжило: ${survivors.length}</div>
                <div class="fw-bold" style="color:var(--primary-color);">Мест: ${state.bunker_places}</div>
            </div>

            <div class="text-center mb-4 px-2">
                ${survivors.length === state.bunker_places
            ? `<div class="badge bg-success opacity-75">Бункер заполнен идеально</div>`
            : (survivors.length < state.bunker_places
                ? `<div class="badge bg-primary opacity-75">Остались свободные места (${state.bunker_places - survivors.length})</div>`
                : `<div class="badge bg-danger opacity-75">В бункере перенаселение!</div>`
            )}
            </div>

            <div id="bunker-ai-summary" class="glass-card p-4 mb-4 animate__animated animate__fadeIn" style="display:none; border-left: 4px solid var(--primary-color);">
                <div class="d-flex align-items-center mb-3">
                    <i class="bi bi-stars me-2" style="color:var(--primary-color);"></i>
                    <span class="fw-bold small text-uppercase letter-spacing-1">Эпилог (AI)</span>
                </div>
                <div class="ai-text fst-italic" style="color:var(--text-main); line-height:1.6;"></div>
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
            `<button class="btn btn-outline-secondary btn-lg w-100 rounded-pill py-3 fw-bold shadow-sm" onclick="window.bunkerFinish(event)">Выйти</button>`
        }
        </div>`;

    wrapper.innerHTML = html;

    // Trigger AI Summary
    window.fetchBunkerSummary(state, res);
};

window.fetchBunkerSummary = async function (state, res) {
    if (!state || !state.catastrophe) return;

    var container = document.getElementById('bunker-ai-summary');
    if (!container) return;

    var cachedSummary = state.ai_summary || window.bunkerState.aiSummary;
    if (cachedSummary) {
        var text = cachedSummary;
        var formattedText = text.trim().split('\n\n').map(p => `<p class="mb-2">${p.replace(/\n/g, '<br>')}</p>`).join('');
        window.bunkerState.aiSummary = text;
        container.querySelector('.ai-text').innerHTML = formattedText;
        container.style.display = 'block';
        return;
    }

    if (window.bunkerState.aiSummaryPending) return;

    try {
        var allPlayers = res.players.map(p => {
            var cards = state.players_cards[String(p.id)];
            var isKicked = state.kicked_players.includes(String(p.id));
            var condition = cards?.condition?.data;

            return {
                name: p.first_name,
                profession: cards?.professions?.text || 'Неизвестно',
                health: cards?.health?.text || 'Здоров',
                hobby: cards?.hobby?.text || 'Нет',
                is_kicked: isKicked,
                // Add the "story" from the condition reveal (seen in screenshot)
                story: isKicked ? (condition?.fail_text || condition?.text) : (condition?.win_text || condition?.text)
            };
        });

        window.bunkerState.aiSummaryPending = window.AIManager.generate('bunker_summary', {
            catastrophe: state.catastrophe?.title,
            capacity: state.bunker_places,
            players: allPlayers,
            threats: state.threat_results,
            features: state.revealed_features
        });
        var response = await window.bunkerState.aiSummaryPending;

        console.log("Bunker Summary AI Response:", response);

        if (response && response.status === 'pending') return;

        if (response && response.status === 'ok' && response.data) {
            var text = typeof response.data === 'string' ? response.data : (response.data.text || JSON.stringify(response.data));

            // Convert newlines to paragraphs for better look
            var formattedText = text.trim().split('\n\n').map(p => `<p class="mb-2">${p.replace(/\n/g, '<br>')}</p>`).join('');

            window.bunkerState.aiSummary = text;

            container.querySelector('.ai-text').innerHTML = formattedText;
            container.style.display = 'block';
        }
    } catch (e) {
        console.error("AI Summary Error:", e);
    } finally {
        window.bunkerState.aiSummaryPending = null;
    }
};

/* --- Helpers --- */

window.renderThreats = function (state) {
    if (!state.threat_results) return '';
    return state.threat_results.map(function (t) {
        var reqs = t.requirements ? `<div class="small mt-1 opacity-75">Требования: ${t.requirements.join(', ')}</div>` : '';
        return `
        <div class="alert ${t.success ? 'alert-success' : 'alert-danger'} border-0 shadow-sm mb-3">
            <div class="d-flex justify-content-between align-items-center mb-2">
                <span class="fw-bold">${t.title || t.text || 'Угроза'}</span>
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
        var cond = pCards.condition?.data;
        if (!cond) {
            return `
                <div class="card border-0 shadow-sm mb-3 ${isKicked ? 'opacity-50' : ''}" style="background:var(--bg-card); border-radius:16px;">
                    <div class="card-body">
                        <div class="d-flex align-items-center mb-2">
                            <img src="${window.getAvatarSrc(p.photo_url)}" class="rounded-circle me-3" style="width:36px; height:36px;">
                            <div class="flex-grow-1">
                                <div class="fw-bold" style="color:var(--text-main);">${p.first_name}</div>
                            </div>
                            <span class="badge" style="background:${isKicked ? 'var(--status-error)' : 'var(--status-success)'}; color:var(--text-on-accent);">${isKicked ? 'Изгнан' : 'Выжил'}</span>
                        </div>
                        <div class="small fst-italic" style="color:var(--text-muted);">Личная история скрыта</div>
                    </div>
                </div>
            `;
        }

        return `
            <div class="card border-0 shadow-sm mb-3 ${isKicked ? 'opacity-50' : ''}" style="background:var(--bg-card); border-radius:16px;">
                <div class="card-body">
                    <div class="d-flex align-items-center mb-2">
                        <img src="${window.getAvatarSrc(p.photo_url)}" class="rounded-circle me-3" style="width:36px; height:36px;">
                        <div class="flex-grow-1">
                            <div class="fw-bold" style="color:var(--text-main);">${p.first_name}</div>
                        </div>
                        <span class="badge" style="background:${isKicked ? 'var(--status-error)' : 'var(--status-success)'}; color:var(--text-on-accent);">${isKicked ? 'Изгнан' : 'Выжил'}</span>
                    </div>
                    <div class="small fw-bold mb-1" style="color:var(--primary-color);">${cond.title}</div>
                    <div class="small fst-italic" style="color:var(--text-muted);">"${isKicked ? cond.fail_text : cond.win_text}"</div>
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

    // Only Admin (Host), in Discussion (start vote or next player)
    // HIDE if it's my turn (standard 'Finish' button will show)
    if (isHost && !isMyTurn && state.turn_phase === 'discussion') {
        buttons += `
            <button class="action-btn-circle success pulsing" onclick="window.sendGameAction('end_turn')" title="Перейти к следующему этапу">
                <i class="bi bi-play-fill" style="font-size: 1.5rem;"></i>
            </button>
            <div class="action-label">Далее</div>
        `;
    }

    // -- 2. PLAYER ACTIONS (End Turn) --
    // Only Active Player, in Discussion
    if (isMyTurn && state.turn_phase === 'discussion') {
        buttons += `
            <button class="action-btn-circle success" onclick="window.sendGameAction('end_turn')">
                <i class="bi bi-check-lg" style="font-size: 1.5rem;"></i>
            </button>
            <div class="action-label text-nowrap mt-2" style="font-size: 11px;">Закончить ход</div>
        `;
    }

    // -- 3. EXIT BUTTON (Handled in return) --

    const footerStateClass = buttons ? 'has-secondary-action' : 'single-action';

    return `
        <div class="bunker-footer-bar ${footerStateClass}">
            <div class="footer-actions-container d-flex justify-content-center align-items-start gap-4">
                <!-- Exit Container -->
                <div class="action-group d-flex flex-column align-items-center">
                    <button class="action-btn-circle secondary shadow-lg" onclick="window.bunkerFinish()">
                        <i class="bi bi-door-open-fill"></i>
                    </button>
                    <div class="action-label text-nowrap mt-2">Выход</div>
                </div>
                
                ${buttons ? `<div class="action-divider mx-2"></div>` : ''}
                
                ${buttons ? `<div class="action-group d-flex flex-column align-items-center">${buttons}</div>` : ''}
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
            <h2 class="fw-bold mb-3" style="color:var(--text-main);">НИЧЬЯ!</h2>
            <div class="alert rounded-4 shadow-sm mb-4" style="background:var(--bg-secondary); color:var(--text-main); border:1px solid var(--border-main);">
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
