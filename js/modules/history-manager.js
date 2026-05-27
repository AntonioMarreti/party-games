/**
 * History Manager Module
 * Owns the bottom-nav History screen: list rendering, result sheet and replay entrypoint.
 */

const HISTORY_GAME_NAMES = {
    bunker: 'Бункер',
    blokus: 'Блокус',
    brainbattle: 'Мозговая Битва',
    alias: 'Алиас',
    tictactoe: 'Крестики-Нолики',
    partybattle: 'Party Battle',
    tictactoe_ultimate: 'Крестики-нолики Ultimate',
    wordclash: 'Битва Слов',
    spyfall: 'Шпион',
    minesweeper_br: 'Сапёр Battle Royale'
};

const HISTORY_GAME_ICONS = {
    bunker: 'bi-shield-shaded text-danger',
    blokus: 'bi-grid-3x3-gap-fill text-primary',
    brainbattle: 'bi-lightning-charge-fill text-warning',
    alias: 'bi-chat-dots-fill text-success',
    tictactoe: 'bi-x-lg text-info',
    partybattle: 'bi-controller text-primary',
    tictactoe_ultimate: 'bi-grid-3x3-gap-fill text-primary',
    wordclash: 'bi-fonts text-success',
    spyfall: 'bi-incognito text-danger',
    minesweeper_br: 'bi-patch-exclamation-fill text-secondary'
};

let historyBackTarget = 'profile';

function escapeHistoryHtml(value) {
    const stringValue = String(value ?? '');
    return typeof window.safeHTML === 'function'
        ? window.safeHTML(stringValue)
        : stringValue.replace(/[&<>"']/g, (match) => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        }[match]));
}

function escapeHistoryJsString(value) {
    return String(value ?? '')
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'");
}

function formatHistoryDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';

    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    const sameDay = (a, b) => a.getFullYear() === b.getFullYear()
        && a.getMonth() === b.getMonth()
        && a.getDate() === b.getDate();

    const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (sameDay(date, today)) return `Сегодня · ${time}`;
    if (sameDay(date, yesterday)) return `Вчера · ${time}`;
    return `${date.toLocaleDateString()} · ${time}`;
}

async function openGameHistory() {
    historyBackTarget = 'profile';
    if (window.switchTab) {
        window.switchTab('history');
        return;
    }
    if (window.showScreen) window.showScreen('history');
    await loadGameHistory();
}

function goBackFromHistory() {
    document.body.classList.remove('history-details-open');
    const target = historyBackTarget || 'profile';

    if (target === 'profile' && window.switchTab) {
        window.switchTab('profile');
        return;
    }

    if (window.switchTab) {
        window.switchTab('profile');
    } else if (window.showScreen) {
        window.showScreen(target === 'lobby' ? 'lobby' : 'profile');
    }
}

async function loadGameHistory() {
    const container = document.getElementById('history-content-list');
    const loader = document.getElementById('history-loader');
    const emptyState = document.getElementById('history-empty');

    if (!container || !loader || !emptyState) return;

    loader.style.display = 'block';
    container.innerHTML = '';
    emptyState.style.display = 'none';

    try {
        const res = await window.apiRequest({ action: 'get_history', limit: 50 });
        loader.style.display = 'none';

        if (res.status === 'ok') {
            const history = (res.history || []).filter(item => item.game_type !== 'lobby');
            if (history.length === 0) {
                emptyState.style.display = 'block';
            } else {
                renderHistoryList(history, container);
            }
        } else {
            container.innerHTML = '<p class="text-danger text-center mt-4">Ошибка загрузки истории</p>';
        }
    } catch (e) {
        loader.style.display = 'none';
        container.innerHTML = '<p class="text-danger text-center mt-4">Сетевая ошибка</p>';
        console.error("Game History parsing error", e);
    }
}

function buildHistoryResultText(item, pos, score) {
    if (item?.result_label) return String(item.result_label);
    if (item?.player_result_payload?.result_label) return String(item.player_result_payload.result_label);

    const isWin = pos === 1;
    const scoreText = `${score} очков`;
    const placeText = pos === '-' ? 'Итог партии' : (isWin ? 'Победа' : `${pos} место`);
    const labels = {
        partybattle: isWin ? 'Победа в Party Battle' : placeText,
        brainbattle: isWin ? 'Победа в турнире' : placeText,
        wordclash: isWin ? 'Победа в словесной дуэли' : placeText,
        bunker: isWin ? 'Выжил в бункере' : placeText,
        spyfall: isWin ? 'Победа в Шпионе' : placeText,
        tictactoe: isWin ? 'Победа в дуэли' : placeText,
        tictactoe_ultimate: isWin ? 'Победа в большой дуэли' : placeText,
        blokus: isWin ? 'Лучший контроль поля' : placeText,
        minesweeper_br: isWin ? 'Победа в забеге' : placeText,
        backgammon_game: isWin ? 'Победа в нардах' : placeText
    };
    const label = labels[item?.game_type] || placeText;
    return `${label} · ${scoreText}`;
}

function calculateHistoryXp(item, pos, score) {
    const storedXp = Number(item?.xp_gained ?? item?.player_result_payload?.xp_gained);
    if (Number.isFinite(storedXp) && storedXp > 0) return storedXp;

    let rankBonus = 0;
    if (pos === 1) { rankBonus = 100; }
    else if (pos === 2) { rankBonus = 50; }
    else if (pos === 3) { rankBonus = 20; }

    const scoreBonus = Math.min(150, Math.floor(Math.max(0, score) / 10));
    return 20 + rankBonus + scoreBonus;
}

function renderHistoryList(history, container) {
    window.currentHistoryItems = history;

    history.forEach((item, index) => {
        const div = document.createElement('div');
        div.className = 'history-game-card clickable';
        div.style.cursor = 'pointer';
        div.onclick = () => showGameDetailsModal(item);

        const dateStr = formatHistoryDate(item.created_at);

        const gname = HISTORY_GAME_NAMES[item.game_type] || item.game_type;
        const gameConfig = Array.isArray(window.AVAILABLE_GAMES)
            ? window.AVAILABLE_GAMES.find(game => game.id === item.game_type)
            : null;
        const iconClass = gameConfig?.icon || (HISTORY_GAME_ICONS[item.game_type] || 'bi-controller').split(' ')[0];
        const iconBg = gameConfig?.color || 'var(--primary-color)';

        const score = Number(item.final_score || 0);
        const posValue = Number(item.final_position);
        const pos = Number.isFinite(posValue) && item.final_position !== null ? posValue : '-';
        const duration = Number(item.duration_seconds || 0);
        const durationText = duration > 0 ? `${Math.max(1, Math.round(duration / 60))} мин` : '';
        const playersText = item.players_count ? `${item.players_count} игроков` : '';
        const canReplay = Boolean(item.game_type)
            && (!Array.isArray(window.AVAILABLE_GAMES) || window.AVAILABLE_GAMES.some(game => game.id === item.game_type));

        const xp = calculateHistoryXp(item, pos, score);
        const resultText = buildHistoryResultText(item, pos, score);
        const dateMeta = [dateStr, playersText, durationText].filter(Boolean).join(' · ');

        div.innerHTML = `
            <div class="history-game-main">
                <div class="history-game-icon" style="background:${iconBg};">
                    <i class="bi ${iconClass}"></i>
                </div>
                <div class="history-game-body">
                    <div class="history-game-topline">
                        <div class="history-game-title">${escapeHistoryHtml(gname)}</div>
                        <div class="history-game-xp">+${xp} XP</div>
                    </div>
                    <div class="history-game-result">${escapeHistoryHtml(resultText)}</div>
                    <div class="history-game-date">${escapeHistoryHtml(dateMeta)}</div>
                </div>
            </div>
            <div class="history-game-actions">
                ${canReplay ? `<button type="button" class="btn-unstyled history-replay-btn" onclick="event.stopPropagation(); replayHistoryGame('${escapeHistoryJsString(item.game_type)}')">Сыграть ещё</button>` : ''}
                <button type="button" class="btn-unstyled history-details-btn" onclick="event.stopPropagation(); showGameDetailsModalById('${index}')">
                    Итоги <i class="bi bi-chevron-right" aria-hidden="true"></i>
                </button>
            </div>
        `;
        div.dataset.historyIndex = String(index);
        container.appendChild(div);
    });
}

function replayHistoryGame(gameType) {
    if (!gameType) return;
    if (Array.isArray(window.AVAILABLE_GAMES) && !window.AVAILABLE_GAMES.some(game => game.id === gameType)) return;

    const gameConfig = Array.isArray(window.AVAILABLE_GAMES)
        ? window.AVAILABLE_GAMES.find(game => game.id === gameType)
        : null;
    const gameName = gameConfig?.name || gameType;

    window.pendingReplayFlow = {
        sourceTab: 'history',
        gameType,
        previousSelectedGameId: window.selectedGameId || null,
        completed: false
    };

    window.selectedGameId = gameType;
    const publicCheckbox = document.getElementById('create-room-public');
    if (publicCheckbox) publicCheckbox.checked = false;

    const titleEl = document.getElementById('create-modal-title');
    if (titleEl) titleEl.innerText = 'Сыграть ещё';

    const hintEl = document.getElementById('create-room-replay-hint');
    if (hintEl) {
        hintEl.hidden = false;
        hintEl.innerHTML = `<i class="bi bi-arrow-repeat" aria-hidden="true"></i><span>${escapeHistoryHtml(gameName)}</span>`;
    }

    if (window.switchTab) window.switchTab('home');

    const createTrigger = document.querySelector('[data-bs-target="#createModal"]');
    if (createTrigger) {
        createTrigger.click();
    } else if (window.showModal) {
        window.showModal('createModal');
    }
}

function showGameDetailsModalById(historyId) {
    const index = Number(historyId);
    if (!Number.isInteger(index) || index < 0 || !window.currentHistoryItems) return;
    showGameDetailsModal(window.currentHistoryItems[index]);
}

function openHistoryDetails(historyId) {
    if (historyId === undefined || historyId === null) return;

    if (typeof historyId === 'object') {
        showGameDetailsModal(historyId);
        return;
    }

    if (typeof historyId === 'number' || (typeof historyId === 'string' && historyId.trim() !== '' && !isNaN(Number(historyId)))) {
        showGameDetailsModalById(historyId);
    }
}

function showGameDetailsModal(item) {
    if (!item) return;

    const score = Number(item.final_score || 0);
    const posValue = Number(item.final_position);
    const pos = Number.isFinite(posValue) && item.final_position !== null ? posValue : '-';

    let rankBonus = 0;
    if (pos === 1) rankBonus = 100;
    else if (pos === 2) rankBonus = 50;
    else if (pos === 3) rankBonus = 20;
    const scoreBonus = Math.min(150, Math.floor(Math.max(0, score) / 10));
    const xp = calculateHistoryXp(item, pos, score);

    const gname = HISTORY_GAME_NAMES[item.game_type] || item.game_type;
    const gameConfig = Array.isArray(window.AVAILABLE_GAMES)
        ? window.AVAILABLE_GAMES.find(game => game.id === item.game_type)
        : null;
    const gicon = gameConfig?.icon || (HISTORY_GAME_ICONS[item.game_type] || 'bi-controller').split(' ')[0];
    const iconBg = gameConfig?.color || 'var(--primary-color)';
    const dateObj = new Date(item.created_at);
    const dateStr = dateObj.toLocaleDateString() + ' ' + dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const playersText = item.players_count ? `${item.players_count} игроков` : '';
    const duration = Number(item.duration_seconds || 0);
    const durationText = duration > 0 ? `${Math.max(1, Math.round(duration / 60))} мин` : '';
    const metaText = [dateStr, playersText, durationText].filter(Boolean).join(' · ');
    const resultText = buildHistoryResultText(item, pos, score);
    const winnerName = item.winner_name ? String(item.winner_name) : '';
    const outcomeText = winnerName
        ? `Победитель: ${winnerName}`
        : (pos === '-' ? 'Итоги партии' : `Ваш результат: ${pos} место`);
    const resultBadge = pos === 1 ? 'Победа' : (pos === '-' ? 'Итог' : `${pos} место`);
    const canReplay = Boolean(item.game_type)
        && (!Array.isArray(window.AVAILABLE_GAMES) || window.AVAILABLE_GAMES.some(game => game.id === item.game_type));

    if (window.safeText) {
        window.safeText('history-details-title', gname);
        window.safeText('history-details-meta', metaText);
        window.safeText('history-details-result', resultText);
        window.safeText('history-details-outcome', outcomeText);
        window.safeText('history-details-badge', resultBadge);
        window.safeText('history-details-xp', '+' + xp + ' XP');
        window.safeText('history-details-rank-label', pos === '-' ? 'За результат' : (pos === 1 ? 'За победу' : `За ${pos} место`));
        window.safeText('history-details-rank-bonus', '+' + rankBonus + ' XP');
        window.safeText('history-details-score-bonus', '+' + scoreBonus + ' XP');
    }

    const iconWrap = document.getElementById('history-details-icon');
    const iconEl = iconWrap?.querySelector('i');
    if (iconWrap) iconWrap.style.background = iconBg;
    if (iconEl) {
        iconEl.className = 'bi ' + gicon;
    }

    const resultIconEl = document.getElementById('history-details-result-icon');
    if (resultIconEl) {
        resultIconEl.className = `bi ${pos === 1 ? 'bi-trophy-fill' : 'bi-flag-fill'} history-details-result-icon`;
    }

    const replayBtn = document.getElementById('history-details-replay');
    const actionsEl = replayBtn?.closest('.history-details-actions');
    if (replayBtn) {
        replayBtn.style.display = canReplay ? '' : 'none';
        replayBtn.dataset.gameType = item.game_type || '';
    }
    if (actionsEl) actionsEl.classList.toggle('single', !canReplay);

    const sheet = document.getElementById('history-details-sheet');
    if (sheet) {
        document.body.classList.add('history-details-open');
        sheet.classList.add('active');
        sheet.setAttribute('aria-hidden', 'false');
    }
}

function closeHistoryDetails() {
    const sheet = document.getElementById('history-details-sheet');
    if (sheet) {
        sheet.classList.remove('active');
        sheet.setAttribute('aria-hidden', 'true');
    }
    document.body.classList.remove('history-details-open');
}

function cleanupHistoryDetailsForScreen(screenId = '') {
    if (screenId && screenId !== 'screen-history') {
        closeHistoryDetails();
    }
}

function replayHistoryGameFromSheet(event) {
    if (event) event.stopPropagation();
    const replayBtn = document.getElementById('history-details-replay');
    const gameType = replayBtn?.dataset.gameType;
    closeHistoryDetails();
    replayHistoryGame(gameType);
}

window.HistoryManager = {
    openGameHistory,
    goBackFromHistory,
    loadGameHistory,
    openHistoryDetails,
    replayHistoryGame,
    closeHistoryDetails,
    renderHistoryList,
    showGameDetailsModal,
    showGameDetailsModalById,
    replayHistoryGameFromSheet
};

window.openGameHistory = openGameHistory;
window.goBackFromHistory = goBackFromHistory;
window.loadGameHistory = loadGameHistory;
window.openHistoryDetails = openHistoryDetails;
window.replayHistoryGame = replayHistoryGame;
window.showGameDetailsModal = showGameDetailsModal;
window.showGameDetailsModalById = showGameDetailsModalById;
window.closeHistoryDetails = closeHistoryDetails;
window.replayHistoryGameFromSheet = replayHistoryGameFromSheet;

window.addEventListener('screenChanged', (event) => {
    cleanupHistoryDetailsForScreen(event?.detail?.screenId || '');
});

window.addEventListener('tabChanged', (event) => {
    const tabId = event?.detail?.tabId || '';
    if (tabId !== 'history') {
        closeHistoryDetails();
    }
});
