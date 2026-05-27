/**
 * Room Manager Module
 * Handles room creation, joining, leaving, and public room listings.
 */

// === STATE ===
let isLeavingProcess = false;
let pollInterval = null;
let lastPlayersJson = '';
let isCreateRoomPending = false;
let isJoinRoomPending = false;
let isScheduledGameSubmitPending = false;

function setPollingSuspended(value) {
    window.__pgSuspendPolling = !!value;
}

function resetCreateRoomModalTitle() {
    const titleEl = document.getElementById('create-modal-title');
    if (titleEl) titleEl.innerText = 'Новая комната';
}

function resetCreateRoomReplayHint() {
    const hintEl = document.getElementById('create-room-replay-hint');
    if (!hintEl) return;
    hintEl.hidden = true;
    hintEl.innerHTML = '';
}

function getDefaultScheduledStartValue() {
    const date = new Date(Date.now() + 60 * 60 * 1000);
    date.setMinutes(Math.ceil(date.getMinutes() / 5) * 5, 0, 0);
    const pad = (value) => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function markReplayFlowCompleted() {
    if (window.pendingReplayFlow) {
        window.pendingReplayFlow.completed = true;
    }
}

// === ROOM ACTIONS ===

async function createRoom() {
    if (isCreateRoomPending) return;

    const passInput = document.getElementById('create-room-pass');
    const titleInput = document.getElementById('create-room-title');

    // Check if element exists before accessing checked. If not (old modal?), default false.
    const publicCheckbox = document.getElementById('create-room-public');
    const isPublic = publicCheckbox ? publicCheckbox.checked : false;

    const roomTitle = (titleInput && titleInput.value.trim()) ? titleInput.value.trim() : 'Party Game';

    if (typeof window.apiRequest !== 'function') return;

    isCreateRoomPending = true;
    setPollingSuspended(true);
    try {
        const res = await window.apiRequest({ action: 'create_room', password: passInput ? passInput.value : '' });
        if (res.status === 'ok') {
            markReplayFlowCompleted();

            // Safe Modal Closing
            const modalEl = document.getElementById('createModal');
            if (modalEl && window.bootstrap) {
                const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
                modal.hide();

                // Force cleanup of stuck backdrops
                setTimeout(() => {
                    document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
                    document.body.classList.remove('modal-open');
                    document.body.style.overflow = '';
                    document.documentElement.classList.remove('modal-open');
                    if (typeof window.syncModalOpenState === 'function') window.syncModalOpenState();
                }, 300);
                setTimeout(() => {
                    if (window.pendingReplayFlow?.completed) {
                        handleCreateRoomModalClosed();
                    }
                }, 500);
            } else if (window.closeModal) {
                window.closeModal('createModal');
                handleCreateRoomModalClosed();
            }

            if (isPublic) {
                const publicRes = await window.apiRequest({
                    action: 'make_room_public',
                    title: roomTitle,
                    description: 'Все сюда!',
                    visibility: 'public'
                });
                if (!publicRes || publicRes.status !== 'ok') {
                    const details = publicRes?.message || 'Вы можете пригласить друзей по коду или попробовать открыть комнату позже.';
                    if (window.showAlert) {
                        window.showAlert(
                            'Комната создана, но не стала открытой',
                            details,
                            'warning'
                        );
                    }
                }
            }
            if (typeof window.checkState === 'function') await window.checkState();
        }
    } finally {
        setPollingSuspended(false);
        isCreateRoomPending = false;
    }
}

function handleCreateRoomModalClosed() {
    const replayFlow = window.pendingReplayFlow;
    window.pendingReplayFlow = null;

    resetCreateRoomModalTitle();
    resetCreateRoomReplayHint();

    if (!replayFlow || replayFlow.completed) return;
    if ('previousSelectedGameId' in replayFlow) {
        window.selectedGameId = replayFlow.previousSelectedGameId;
    }
    if (replayFlow.sourceTab && typeof window.switchTab === 'function') {
        window.switchTab(replayFlow.sourceTab);
    }
}

function closeCreateRoomModal(event) {
    if (event) event.stopPropagation();

    const modalEl = document.getElementById('createModal');
    if (modalEl && window.bootstrap) {
        const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
        modal.hide();
        return;
    }

    if (window.closeModal) {
        window.closeModal('createModal');
    }
    handleCreateRoomModalClosed();
}

function setupCreateRoomModalFlow() {
    const modalEl = document.getElementById('createModal');
    if (!modalEl || modalEl.dataset.replayFlowBound === 'true') return;

    modalEl.dataset.replayFlowBound = 'true';
    modalEl.addEventListener('hidden.bs.modal', handleCreateRoomModalClosed);
}

function getPublicRoomGameName(gameType) {
    if (Array.isArray(window.AVAILABLE_GAMES)) {
        const match = window.AVAILABLE_GAMES.find(g => g.id === gameType);
        if (match && match.name) return match.name;
    }
    return gameType || 'Игра';
}

function getPublicRoomGameMeta(gameType) {
    if (gameType === 'lobby') {
        return {
            name: 'Выбор игры',
            icon: 'bi-grid-3x3-gap-fill',
            bgColor: 'var(--bg-secondary)',
            color: 'var(--primary-color)'
        };
    }

    if (Array.isArray(window.AVAILABLE_GAMES)) {
        const match = window.AVAILABLE_GAMES.find(g => g.id === gameType);
        if (match) {
            return {
                name: match.name || getPublicRoomGameName(gameType),
                icon: match.icon || 'bi-controller',
                bgColor: match.bgColor || 'var(--bg-secondary)',
                color: match.color || 'var(--primary-color)'
            };
        }
    }

    return {
        name: getPublicRoomGameName(gameType),
        icon: 'bi-controller',
        bgColor: 'var(--bg-secondary)',
        color: 'var(--primary-color)'
    };
}

async function joinRoom(code = null, passwordOverride = null) {
    if (isJoinRoomPending) return;

    if (!code) {
        const input = document.getElementById('join-room-code');
        code = input ? input.value : '';
    }
    if (!code) {
        if (window.showAlert) window.showAlert("Внимание", "Введите код", 'warning');
        return;
    }
    const passInput = document.getElementById('join-room-pass');
    const password = passwordOverride !== null ? passwordOverride : (passInput ? passInput.value : '');
    isJoinRoomPending = true;
    setPollingSuspended(true);
    try {
        const res = await window.apiRequest({ action: 'join_room', room_code: code, password });
        if (res.status === 'ok') {
            // Safe Modal Closing
            const modalEl = document.getElementById('joinModal');
            if (modalEl && window.bootstrap) {
                const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
                modal.hide();
            }

            // Force cleanup of stuck backdrops
            setTimeout(() => {
                document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
                document.body.classList.remove('modal-open');
                document.body.style.overflow = '';
                document.documentElement.classList.remove('modal-open');
                if (typeof window.syncModalOpenState === 'function') window.syncModalOpenState();
            }, 300);

            if (typeof window.checkState === 'function') await window.checkState();
        } else {
            if (window.showAlert) window.showAlert("Ошибка", res.message, 'error');
        }
    } finally {
        setPollingSuspended(false);
        isJoinRoomPending = false;
    }
}

function handlePublicRoomJoin(room) {
    if (!room) return;

    if (Number(room.has_password) === 1) {
        if (typeof window.showPrompt === 'function') {
            window.showPrompt(
                'Пароль комнаты',
                `Введите пароль для комнаты ${window.safeHTML ? window.safeHTML(room.title || room.room_code) : (room.title || room.room_code)}`,
                (value) => joinRoom(room.room_code, value),
                {
                    confirmText: 'Войти',
                    cancelText: 'Отмена',
                    placeholder: 'Пароль комнаты'
                }
            );
            return;
        }
    }

    joinRoom(room.room_code);
}

function handleRoomJoinByData(roomCode, hasPassword = 0, title = '') {
    handlePublicRoomJoin({
        room_code: roomCode,
        has_password: hasPassword,
        title: title || roomCode
    });
}

async function leaveRoom() {
    if (isLeavingProcess) return;

    const amIHost = window.isHost;
    const title = 'Выход из комнаты';
    const text = amIHost ? 'Вы Хост. Если вы выйдете, комната будет закрыта для всех. Продолжить?' : 'Вы уверены, что хотите покинуть комнату?';

    if (typeof window.showConfirmation !== 'function') return;

    window.showConfirmation(title, text, async () => {
        isLeavingProcess = true;
        stopPolling();
        if (typeof window.cleanupBlokusLifecycle === 'function') {
            window.cleanupBlokusLifecycle();
        }

        try {
            if (amIHost && typeof window.apiRequest === 'function') {
                await window.apiRequest({ action: 'stop_game' });
            }

            const res = await window.apiRequest({ action: 'leave_room' });

            if (res.status === 'ok') {
                window.currentRoomCode = null;
                window.isHost = false;

                const gameArea = document.getElementById('game-area');
                if (gameArea) gameArea.innerHTML = '';

                isLeavingProcess = false;
                if (window.showScreen) window.showScreen('lobby');
                if (typeof window.checkState === 'function') await window.checkState();
            } else {
                isLeavingProcess = false;
                startPolling();
                if (window.showAlert) window.showAlert('Ошибка', res.message || "Ошибка выхода", 'error');
            }
        } catch (e) {
            isLeavingProcess = false;
            startPolling();
            console.error("Критическая ошибка при выходе:", e);
        }
    });
}

// === PUBLIC ROOMS ===
// Live waiting rooms and scheduled open games stay as separate client flows.
// loadPublicRooms() renders only rooms that already exist in the current room lifecycle.

async function loadPublicRooms() {
    const containers = Array.from(document.querySelectorAll('[data-public-rooms-list]'));
    const legacyContainer = document.getElementById('public-rooms-list');
    if (legacyContainer && !containers.includes(legacyContainer)) containers.push(legacyContainer);
    if (containers.length === 0) return; // Not in view
    const homeContainers = containers.filter(container => container.dataset.publicRoomsList === 'home');
    const roomListContainers = containers.filter(container => container.dataset.publicRoomsList !== 'home');

    const renderAllPublicRoomContainers = (html) => {
        containers.forEach(container => {
            container.innerHTML = html;
        });
    };

    const renderRoomListContainers = (html) => {
        roomListContainers.forEach(container => {
            container.innerHTML = html;
        });
    };

    containers.forEach(container => {
        container.innerHTML = '<p class="text-center text-muted small py-4">Обновление...</p>';
    });

    const res = await window.apiRequest({ action: 'get_public_rooms' });
    if (!res || res.status !== 'ok') {
        homeContainers.forEach(container => {
            container.innerHTML = '';
        });
        renderRoomListContainers(`
            <div class="public-rooms-header rooms-list-header d-flex align-items-center justify-content-between mb-2">
                <div class="rooms-list-title">Сейчас ждут игроков</div>
                <button onclick="loadPublicRooms()" class="btn-unstyled rooms-list-action-icon" aria-label="Обновить игры">
                    <i class="bi bi-arrow-clockwise" aria-hidden="true"></i>
                </button>
            </div>
            <div class="public-room-card public-room-empty rooms-empty-card text-center">
                 <div class="rooms-empty-icon text-primary"><i class="bi bi-wifi-off"></i></div>
                 <div class="rooms-empty-title">Не удалось обновить</div>
                 <div class="rooms-empty-text">Комнату всё равно можно создать или открыть по ссылке.</div>
                 <div class="rooms-empty-actions">
                    <button class="btn btn-sm btn-primary rounded-pill px-3" onclick="document.querySelector('[data-bs-target=\\'#createModal\\']').click()">Создать игру</button>
                 </div>
            </div>
        `);
        return;
    }
    if (res.status === 'ok') {
        const headerHtml = `<div class="public-rooms-header rooms-list-header d-flex align-items-center justify-content-between mb-2">
            <div class="rooms-list-title">Сейчас ждут игроков</div>
            <button onclick="loadPublicRooms()" class="btn-unstyled rooms-list-action-icon" aria-label="Обновить игры">
                <i class="bi bi-arrow-clockwise" aria-hidden="true"></i>
            </button>
        </div>`;

        if (res.rooms.length === 0) {
            homeContainers.forEach(container => {
                container.innerHTML = '';
            });
            renderRoomListContainers(`
                <div class="public-room-card public-room-empty rooms-empty-card text-center">
                     <div class="rooms-empty-icon text-primary"><i class="bi bi-people"></i></div>
                     <div class="rooms-empty-title">Сейчас никто не ждёт игроков</div>
                     <div class="rooms-empty-text">Создайте открытую игру или посмотрите расписание.</div>
                     <div class="rooms-empty-actions d-flex justify-content-center flex-wrap gap-2">
                        <button class="btn btn-sm btn-primary rounded-pill px-3" onclick="document.querySelector('[data-bs-target=\\'#createModal\\']').click()">Создать игру</button>
                        <button class="btn btn-sm btn-outline-primary rounded-pill px-3" onclick="switchRoomsMode('scheduled')">Расписание</button>
                     </div>
                </div>
            `);
            return;
        }

        renderAllPublicRoomContainers(headerHtml);
        homeContainers.forEach(container => {
            container.innerHTML = `
                <div class="home-public-rooms-card">
                    <div class="d-flex align-items-center justify-content-between gap-3 mb-2">
                        <div>
                            <div class="home-public-title">Сейчас ждут игроков</div>
                            <div class="home-public-subtitle">Открытые игры</div>
                        </div>
                        <button onclick="switchTab('games')" class="btn btn-light text-primary rounded-circle d-flex align-items-center justify-content-center"
                                style="width: 34px; height: 34px;">
                            <i class="bi bi-arrow-right"></i>
                        </button>
                    </div>
                    <div class="home-public-list"></div>
                </div>
            `;
        });

        res.rooms.forEach((r, index) => {
            const gameMeta = getPublicRoomGameMeta(r.game_type);
            const isLobbyRoom = r.game_type === 'lobby';
            const safeTitle = isLobbyRoom
                ? 'Открытая комната'
                : (window.safeHTML(r.title) || gameMeta.name || ('Комната ' + window.safeHTML(r.host_name)));
            const safeDescription = isLobbyRoom
                ? 'Игра ещё не выбрана'
                : 'Можно присоединиться';
            const hostName = window.safeHTML(r.host_name || 'Хост');
            const gameName = window.safeHTML(gameMeta.name);
            const playersWaitingText = roomSafeHtml(getWaitingPlayersText(r.players_count || 1));
            const lockBadge = Number(r.has_password) === 1
                ? `<span class="public-room-badge"><i class="bi bi-lock-fill me-1"></i>Пароль</span>`
                : `<span class="public-room-badge"><i class="bi bi-unlock me-1"></i>Открытая</span>`;
            const gameBadge = isLobbyRoom
                ? `<span class="public-room-badge"><i class="bi bi-grid-3x3-gap me-1"></i>Выбор игры</span>`
                : `<span class="public-room-badge"><i class="bi bi-controller me-1"></i>${gameName}</span>`;

            const roomHtml = `
                <div class="public-room-main">
                    <div class="public-room-top">
                        <div class="public-room-identity">
                            <div class="public-room-game-icon" style="background:${gameMeta.bgColor}; color:${gameMeta.color};">
                                <i class="bi ${gameMeta.icon}"></i>
                            </div>
                            <div class="min-w-0">
                                <div class="fw-bold public-room-title">${safeTitle}</div>
                                <div class="small text-muted public-room-description">${safeDescription}</div>
                            </div>
                        </div>
                        <div class="public-room-side">
                            <div class="public-room-count">${playersWaitingText}</div>
                            <button type="button" class="room-card-primary-btn">Войти</button>
                        </div>
                    </div>
                    <div class="public-room-meta-row">
                        ${gameBadge}
                        ${lockBadge}
                        <span class="public-room-host">Хост: ${hostName}</span>
                    </div>
                </div>
            `;
            containers.forEach(container => {
                const isHomeContainer = container.dataset.publicRoomsList === 'home';
                if (isHomeContainer && index > 1) return;
                const div = document.createElement('div');
                div.className = isHomeContainer ? 'home-public-room-row' : 'public-room-card shadow-sm';
                div.onclick = () => handlePublicRoomJoin(r);
                div.style.cursor = 'pointer';
                if (isHomeContainer) {
                    div.innerHTML = `
                        <div class="min-w-0">
                            <div class="fw-bold text-truncate">${safeTitle}</div>
                            <div class="home-public-meta">${isLobbyRoom ? 'Выбор игры' : gameName} · ${playersWaitingText}</div>
                        </div>
                        <button type="button" class="btn btn-sm btn-primary rounded-pill px-3" onclick="event.stopPropagation(); handleRoomJoinByData('${r.room_code}', ${Number(r.has_password) === 1 ? 1 : 0}, '${String(safeTitle).replace(/'/g, "\\'")}')">Войти</button>
                    `;
                    const list = container.querySelector('.home-public-list') || container;
                    list.appendChild(div);
                } else {
                    div.innerHTML = roomHtml;
                    container.appendChild(div);
                }
            });
        });
    }
}

async function loadLocalRooms() {
    const container = document.getElementById('public-rooms-list');
    if (!container) return;
    container.innerHTML = '<p class="text-center text-muted small">Поиск в сети...</p>';

    const res = await window.apiRequest({ action: 'get_local_rooms' });
    if (res.status === 'ok') {
        const backBtn = `
            <button onclick="loadPublicRooms()" class="btn btn-light text-primary rounded-circle shadow-sm d-flex align-items-center justify-content-center"
                    style="width: 36px; height: 36px;">
                <i class="bi bi-globe" style="font-size: 18px;"></i>
            </button>
        `;

        const title = `<div class="d-flex align-items-center justify-content-between mb-3">
            <h6 class="text-start ms-2 mb-0 text-primary"><i class="bi bi-wifi me-2"></i>Игры рядом</h6>
            ${backBtn}
        </div>`;

        if (!res.rooms || res.rooms.length === 0) {
            container.innerHTML = `
                ${title}
                <div class="text-center py-4 rounded-4 shadow-sm position-relative" style="background: var(--bg-glass); backdrop-filter: blur(10px); border: 1px solid var(--border-glass);">
                     <div class="mb-2 text-primary opacity-50"><i class="bi bi-router" style="font-size: 40px;"></i></div>
                     <div class="fw-bold" style="color: var(--text-main)">Никого рядом</div>
                     <div class="text-muted small mb-3">В вашей сети нет активных игр</div>
                     <button class="btn btn-sm btn-outline-primary rounded-pill px-3" onclick="loadPublicRooms()">Показать всё</button>
                </div>
            `;
            return;
        }

        let html = title;

        res.rooms.forEach(r => {
            const gameMeta = getPublicRoomGameMeta(r.game_type);
            const lockBadge = Number(r.has_password) === 1
                ? `<span class="public-room-badge"><i class="bi bi-lock-fill me-1"></i>Пароль</span>`
                : '';
            html += `
            <div class="public-room-card clickable" onclick="handleRoomJoinByData('${r.room_code}', ${Number(r.has_password) === 1 ? 1 : 0}, '${window.safeHTML(r.host_name || '').replace(/'/g, "\\'")}')">
                <div class="d-flex justify-content-between align-items-center w-100 gap-3">
                    <div class="d-flex align-items-center gap-3 min-w-0">
                        <div class="public-room-game-icon" style="background:${gameMeta.bgColor}; color:${gameMeta.color};">
                            <i class="bi ${gameMeta.icon}"></i>
                        </div>
                        <div class="min-w-0">
                            <div class="fw-bold public-room-title">${window.safeHTML(r.host_name)}</div>
                            <div class="d-flex flex-wrap gap-2 mt-1">
                                <span class="public-room-badge"><i class="bi bi-controller me-1"></i>${window.safeHTML(gameMeta.name)}</span>
                                <span class="public-room-badge text-success"><i class="bi bi-wifi me-1"></i>В вашей сети</span>
                                ${lockBadge}
                            </div>
                        </div>
                    </div>
                    <div class="text-end">
                         <div class="public-room-count">${r.players_count} чел.</div>
                         <div class="small fw-bold text-primary">#${r.room_code}</div>
                    </div>
                </div>
            </div>`;
        });
        container.innerHTML = html;
    }
}

// === SCHEDULED OPEN GAMES ===
let currentRoomsMode = 'live';
let isScheduledGamesLoading = false;
let currentScheduledGamesById = new Map();
let scheduledDeepLinkHighlightTimer = null;

function roomSafeHtml(value) {
    return typeof window.safeHTML === 'function'
        ? window.safeHTML(value)
        : String(value ?? '').replace(/[&<>"']/g, (ch) => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        }[ch]));
}

function switchRoomsMode(mode = 'live') {
    currentRoomsMode = mode === 'scheduled' ? 'scheduled' : 'live';

    document.querySelectorAll('[data-rooms-mode]').forEach(button => {
        button.classList.toggle('active', button.dataset.roomsMode === currentRoomsMode);
    });

    document.querySelectorAll('[data-rooms-panel]').forEach(panel => {
        panel.style.display = panel.dataset.roomsPanel === currentRoomsMode ? '' : 'none';
    });

    if (currentRoomsMode === 'scheduled') {
        loadScheduledGames();
    } else {
        loadPublicRooms();
    }
}

function consumePendingScheduledDeepLink(renderedGames = [], container = null) {
    const scheduledGameId = Number(window.pendingScheduledGameDeepLinkId || 0);
    if (!scheduledGameId) return;

    const targetGame = renderedGames.find(game => Number(game.id) === scheduledGameId);
    if (!targetGame) {
        window.pendingScheduledGameDeepLinkId = null;
        window.pendingScheduledGameDeepLinkHandled = false;
        if (window.showToast) {
            window.showToast('Эта игра уже закрыта или недоступна.', 'warning');
        } else if (window.showAlert) {
            window.showAlert('Игра недоступна', 'Эта игра уже закрыта или недоступна.', 'warning');
        }
        return;
    }

    const card = (container || document).querySelector(`[data-scheduled-game-id="${scheduledGameId}"]`);
    window.pendingScheduledGameDeepLinkId = null;
    window.pendingScheduledGameDeepLinkHandled = false;

    if (!card) return;

    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card.classList.add('scheduled-game-card-highlight');
    if (scheduledDeepLinkHighlightTimer) {
        clearTimeout(scheduledDeepLinkHighlightTimer);
    }
    scheduledDeepLinkHighlightTimer = setTimeout(() => {
        card.classList.remove('scheduled-game-card-highlight');
    }, 2600);
}

function getScheduledGameDateText(value) {
    if (!value) return 'Время уточняется';
    const date = new Date(String(value).replace(' ', 'T'));
    if (Number.isNaN(date.getTime())) return String(value);

    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    const isTomorrow = date.toDateString() === tomorrow.toDateString();
    const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (isToday) return `Сегодня · ${time}`;
    if (isTomorrow) return `Завтра · ${time}`;
    return `${date.toLocaleDateString()} · ${time}`;
}

function getScheduledGameStatusText(status, startsAt = null) {
    if (status === 'live') return 'Открыта';
    if (status === 'scheduled' && startsAt) {
        const start = new Date(String(startsAt).replace(' ', 'T')).getTime();
        if (!Number.isNaN(start) && start - Date.now() <= 30 * 60 * 1000) {
            return 'Скоро старт';
        }
    }
    return 'Запланирована';
}

function getScheduledGamesCountText(count) {
    const value = Math.max(0, Number(count || 0));
    if (value === 0) return 'Сегодня и позже';
    const lastTwo = value % 100;
    const last = value % 10;
    const noun = last === 1 && lastTwo !== 11
        ? 'игра'
        : (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14) ? 'игры' : 'игр');
    return `${value} ${noun} по расписанию`;
}

function getWaitingPlayersText(count) {
    const value = Math.max(0, Number(count || 0));
    const lastTwo = value % 100;
    const last = value % 10;
    const noun = last === 1 && lastTwo !== 11
        ? 'игрок'
        : (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14) ? 'игрока' : 'игроков');
    const verb = last === 1 && lastTwo !== 11 ? 'ждёт' : 'ждут';
    return `${value} ${noun} ${verb}`;
}

function getScheduledSubscribersText(count) {
    const value = Math.max(0, Number(count || 0));
    const lastTwo = value % 100;
    const last = value % 10;
    const verb = last === 1 && lastTwo !== 11 ? 'записался' : 'записались';
    return `${value} ${verb}`;
}

function getScheduledSignupText(count, maxPlayers) {
    const value = Math.max(0, Number(count || 0));
    const max = Number(maxPlayers || 0);
    return max > 0 ? `${value}/${max} записались` : getScheduledSubscribersText(value);
}

function getScheduledReadinessText(count, minPlayers) {
    const value = Math.max(0, Number(count || 0));
    const min = Math.max(1, Number(minPlayers || 1));
    if (value >= min) return 'Игра состоится';
    const left = min - value;
    if (left === 1) return 'Нужен ещё 1 игрок';
    return `Нужно ещё игроков: ${left}`;
}

function getScheduledDescriptionText(game, isHost = false) {
    const rawDescription = String(game?.description || '').trim();
    if (rawDescription) return rawDescription;
    if (game?.status === 'live') {
        return isHost ? 'Комната уже собирает записавшихся игроков' : 'Игра открыта для записавшихся игроков';
    }
    return isHost ? 'Запись на игру' : 'Игра по приглашению или коду';
}

function canOpenScheduledGame(startsAt) {
    const start = new Date(String(startsAt || '').replace(' ', 'T')).getTime();
    if (Number.isNaN(start)) return false;
    return start - Date.now() <= 5 * 60 * 1000;
}

function showScheduledFeedback(title, message, type = 'info') {
    if (window.showToast) {
        window.showToast(message, type);
        return;
    }
    if (window.showAlert) {
        window.showAlert(title, message, type);
    }
}

function getScheduledInputDateValue(value) {
    if (!value) return '';
    const date = new Date(String(value).replace(' ', 'T'));
    if (Number.isNaN(date.getTime())) return '';
    const pad = (part) => String(part).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function resetScheduledGameModalMode() {
    const editIdInput = document.getElementById('scheduled-game-edit-id');
    const titleEl = document.getElementById('scheduled-game-modal-title');
    const submitBtn = document.getElementById('scheduled-game-submit');
    const select = document.getElementById('scheduled-game-type');
    if (editIdInput) editIdInput.value = '';
    if (titleEl) titleEl.innerText = 'Запланировать игру';
    if (submitBtn) submitBtn.innerText = 'Запланировать';
    if (select) select.disabled = false;
}

function populateScheduledGameForm(defaultGameType = null) {
    resetScheduledGameModalMode();

    const select = document.getElementById('scheduled-game-type');
    if (select && Array.isArray(window.AVAILABLE_GAMES)) {
        select.innerHTML = window.AVAILABLE_GAMES
            .map(game => `<option value="${roomSafeHtml(game.id)}">${roomSafeHtml(game.name || game.id)}</option>`)
            .join('');
        select.value = defaultGameType || window.selectedGameId || window.AVAILABLE_GAMES[0]?.id || '';
    }

    const titleInput = document.getElementById('scheduled-game-title');
    if (titleInput) titleInput.value = 'Открытая игра';

    const startsInput = document.getElementById('scheduled-game-starts');
    if (startsInput) startsInput.value = getDefaultScheduledStartValue();

    const minInput = document.getElementById('scheduled-game-min-players');
    const maxInput = document.getElementById('scheduled-game-max-players');
    const descriptionInput = document.getElementById('scheduled-game-description');
    if (minInput) minInput.value = 2;
    if (maxInput) maxInput.value = 8;
    if (descriptionInput) descriptionInput.value = '';
}

function openScheduledGameModal(gameType = null) {
    populateScheduledGameForm(gameType);
    const modalEl = document.getElementById('scheduledGameModal');
    if (modalEl && window.bootstrap) {
        bootstrap.Modal.getOrCreateInstance(modalEl).show();
    } else if (window.showModal) {
        window.showModal('scheduledGameModal');
    }
}

function editScheduledGame(id) {
    const game = currentScheduledGamesById.get(Number(id));
    if (!game) {
        if (window.showToast) window.showToast('Не удалось открыть редактирование', 'error');
        return;
    }
    if (game.status !== 'scheduled') {
        if (window.showToast) window.showToast('Эту игру уже нельзя изменить', 'warning');
        return;
    }

    populateScheduledGameForm(game.game_type);

    const editIdInput = document.getElementById('scheduled-game-edit-id');
    const titleEl = document.getElementById('scheduled-game-modal-title');
    const submitBtn = document.getElementById('scheduled-game-submit');
    const select = document.getElementById('scheduled-game-type');
    const titleInput = document.getElementById('scheduled-game-title');
    const startsInput = document.getElementById('scheduled-game-starts');
    const minInput = document.getElementById('scheduled-game-min-players');
    const maxInput = document.getElementById('scheduled-game-max-players');
    const descriptionInput = document.getElementById('scheduled-game-description');

    if (editIdInput) editIdInput.value = String(game.id || id);
    if (titleEl) titleEl.innerText = 'Редактировать игру';
    if (submitBtn) submitBtn.innerText = 'Сохранить';
    if (select) {
        select.value = game.game_type || select.value;
        select.disabled = true;
    }
    if (titleInput) titleInput.value = game.title || '';
    if (startsInput) startsInput.value = getScheduledInputDateValue(game.starts_at) || getDefaultScheduledStartValue();
    if (minInput) minInput.value = game.min_players || 2;
    if (maxInput) maxInput.value = game.max_players || 8;
    if (descriptionInput) descriptionInput.value = game.description || '';

    const modalEl = document.getElementById('scheduledGameModal');
    if (modalEl && window.bootstrap) {
        bootstrap.Modal.getOrCreateInstance(modalEl).show();
    } else if (window.showModal) {
        window.showModal('scheduledGameModal');
    }
}

async function createScheduledGame() {
    if (isScheduledGameSubmitPending) return;

    const editId = document.getElementById('scheduled-game-edit-id')?.value || '';
    const gameType = document.getElementById('scheduled-game-type')?.value || window.selectedGameId || '';
    const title = document.getElementById('scheduled-game-title')?.value || '';
    const startsAt = document.getElementById('scheduled-game-starts')?.value || '';
    const minPlayers = document.getElementById('scheduled-game-min-players')?.value || 2;
    const maxPlayers = document.getElementById('scheduled-game-max-players')?.value || 8;
    const description = document.getElementById('scheduled-game-description')?.value || '';

    const payload = {
        action: editId ? 'update_scheduled_game' : 'create_scheduled_game',
        game_type: gameType,
        title,
        starts_at: startsAt,
        min_players: minPlayers,
        max_players: maxPlayers,
        description
    };
    if (editId) payload.scheduled_game_id = editId;

    const submitBtn = document.getElementById('scheduled-game-submit');
    const originalSubmitText = submitBtn?.innerText || (editId ? 'Сохранить' : 'Запланировать');
    isScheduledGameSubmitPending = true;
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerText = editId ? 'Сохраняем...' : 'Планируем...';
    }

    try {
        const res = await window.apiRequest(payload);

        if (res?.status !== 'ok') {
            const message = res?.message || 'Не удалось сохранить игру';
            if (window.showAlert) {
                window.showAlert('Не получилось', message, 'warning');
            } else if (window.showToast) {
                window.showToast(message, 'warning');
            }
            return;
        }

        const modalEl = document.getElementById('scheduledGameModal');
        if (modalEl && window.bootstrap) {
            bootstrap.Modal.getOrCreateInstance(modalEl).hide();
        } else if (window.closeModal) {
            window.closeModal('scheduledGameModal');
        }

        resetScheduledGameModalMode();
        if (window.showToast) window.showToast(editId ? 'Игра обновлена' : 'Игра запланирована', 'success');
        switchRoomsMode('scheduled');
    } finally {
        isScheduledGameSubmitPending = false;
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerText = originalSubmitText;
        }
    }
}

async function loadScheduledGames() {
    const container = document.getElementById('scheduled-games-list');
    if (!container || isScheduledGamesLoading) return;

    isScheduledGamesLoading = true;
    container.innerHTML = '<p class="text-center text-muted small py-4">Загружаем расписание...</p>';

    const res = await window.apiRequest({ action: 'get_scheduled_games' });
    isScheduledGamesLoading = false;

    const getScheduledHeaderHtml = (withAction = true) => `
        <div class="public-rooms-header rooms-list-header d-flex align-items-center justify-content-between mb-2">
            <div class="rooms-list-title">Сегодня и позже</div>
            ${withAction ? `<button onclick="openScheduledGameModal()" class="btn-unstyled rooms-list-action-pill">
                <i class="bi bi-plus-lg" aria-hidden="true"></i><span>Создать</span>
            </button>` : ''}
        </div>
    `;

    if (!res || res.status !== 'ok') {
        container.innerHTML = `
            ${getScheduledHeaderHtml(false)}
            <div class="scheduled-game-card rooms-empty-card text-center">
                <div class="rooms-empty-icon text-primary"><i class="bi bi-calendar-x"></i></div>
                <div class="rooms-empty-title">Расписание временно недоступно</div>
                <div class="rooms-empty-text">Можно создать открытую игру или попробовать позже.</div>
                <div class="rooms-empty-actions">
                    <button class="btn btn-sm btn-outline-primary rounded-pill px-3" onclick="switchRoomsMode('live')">Сейчас</button>
                </div>
            </div>
        `;
        return;
    }

    if (!Array.isArray(res.games) || res.games.length === 0) {
        container.innerHTML = `
            ${getScheduledHeaderHtml(false)}
            <div class="scheduled-game-card rooms-empty-card text-center">
                <div class="rooms-empty-icon text-primary"><i class="bi bi-calendar-plus"></i></div>
                <div class="rooms-empty-title">Пока игр по расписанию нет</div>
                <div class="rooms-empty-text">Создайте игру на вечер — другие смогут увидеть её здесь.</div>
                <div class="rooms-empty-actions">
                    <button class="btn btn-sm btn-primary rounded-pill px-3" onclick="openScheduledGameModal()">Запланировать игру</button>
                </div>
            </div>
        `;
        return;
    }

    currentScheduledGamesById = new Map();
    container.innerHTML = getScheduledHeaderHtml();
    const sortedGames = [...res.games].sort((a, b) => {
        const aLive = a.status === 'live' ? 1 : 0;
        const bLive = b.status === 'live' ? 1 : 0;
        if (aLive !== bLive) return bLive - aLive;

        const aSubscribed = Number(a.is_subscribed || 0) === 1 ? 1 : 0;
        const bSubscribed = Number(b.is_subscribed || 0) === 1 ? 1 : 0;
        if (aSubscribed !== bSubscribed) return bSubscribed - aSubscribed;

        return new Date(String(a.starts_at || '').replace(' ', 'T')).getTime()
            - new Date(String(b.starts_at || '').replace(' ', 'T')).getTime();
    });

    sortedGames.forEach(game => {
        currentScheduledGamesById.set(Number(game.id), game);
        const meta = getPublicRoomGameMeta(game.game_type);
        const title = roomSafeHtml(game.title || meta.name);
        const isHost = Number(game.is_host || 0) === 1
            || (window.globalUser && Number(game.host_id) === Number(window.globalUser.id));
        const description = roomSafeHtml(getScheduledDescriptionText(game, isHost));
        const hostName = roomSafeHtml(game.host_name || 'Хост');
        const startText = roomSafeHtml(getScheduledGameDateText(game.starts_at));
        const statusText = roomSafeHtml(getScheduledGameStatusText(game.status, game.starts_at));
        const subscribersCount = Number(game.subscribers_count || 0);
        const maxPlayers = Number(game.max_players || 0);
        const minPlayers = Number(game.min_players || 1);
        const spotsLeft = Number(game.spots_left || 0);
        const isSubscribed = Number(game.is_subscribed || 0) === 1;
        const signupText = roomSafeHtml(getScheduledSignupText(subscribersCount, maxPlayers));
        const readinessText = roomSafeHtml(getScheduledReadinessText(subscribersCount, minPlayers));
        const isLive = game.status === 'live';
        const canOpen = canOpenScheduledGame(game.starts_at);
        const hasRealSubscribers = Math.max(0, subscribersCount - 1) > 0;
        const subscribedBadge = isSubscribed
            ? '<span class="scheduled-game-badge scheduled-game-subscribed">Вы записаны</span>'
            : '';
        const liveBadge = isLive
            ? `<span class="scheduled-game-badge scheduled-game-status">${statusText}</span>`
            : '';
        let primaryAction = '';
        let secondaryAction = '';
        if (isLive) {
            primaryAction = game.room_code
                ? `<button type="button" class="btn btn-sm btn-primary rounded-pill px-3" onclick="joinScheduledGameRoom('${roomSafeHtml(game.room_code)}')">Войти</button>`
                : `<span class="scheduled-game-disabled-action">Игра открывается</span>`;
            if (isHost && hasRealSubscribers) {
                secondaryAction = `<button type="button" class="btn btn-sm btn-outline-primary rounded-pill px-3" onclick="sendScheduledGameManualReminder(${Number(game.id)})">Напомнить</button>`;
            }
        } else if (isHost) {
            primaryAction = canOpen
                ? `<button type="button" class="btn btn-sm btn-primary rounded-pill px-3" onclick="openScheduledGame(${Number(game.id)})">Открыть</button>`
                : `<span class="scheduled-game-disabled-action" aria-disabled="true">Откроется после набора игроков</span>`;
            secondaryAction = `<button type="button" class="btn btn-sm btn-outline-primary rounded-pill px-3" onclick="editScheduledGame(${Number(game.id)})">Редактировать</button>${hasRealSubscribers ? `<button type="button" class="btn btn-sm btn-outline-primary rounded-pill px-3" onclick="sendScheduledGameManualReminder(${Number(game.id)})">Напомнить</button>` : ''}<button type="button" class="btn btn-sm btn-outline-danger rounded-pill px-3" onclick="cancelScheduledGame(${Number(game.id)})">Отменить игру</button>`;
        } else {
            primaryAction = spotsLeft <= 0 && !isSubscribed
                ? `<span class="scheduled-game-disabled-action">Мест нет</span>`
                : (isSubscribed
                    ? ''
                    : `<button type="button" class="btn btn-sm btn-primary rounded-pill px-3" onclick="subscribeScheduledGame(${Number(game.id)})">Записаться</button>`);
            secondaryAction = isSubscribed
                ? `<button type="button" class="scheduled-game-text-action" onclick="unsubscribeScheduledGame(${Number(game.id)})">Отменить запись</button>`
                : '';
        }

        const div = document.createElement('div');
        div.className = 'scheduled-game-card mb-3';
        div.dataset.scheduledGameId = String(game.id);
        div.innerHTML = `
            <div class="scheduled-game-main">
                <div class="scheduled-game-icon" style="background:${meta.bgColor}; color:${meta.color};">
                    <i class="bi ${meta.icon}"></i>
                </div>
                <div class="min-w-0 flex-grow-1">
                    <div class="scheduled-game-head">
                        <div class="scheduled-game-title">${title}</div>
                        <div class="scheduled-game-head-badges">
                            ${subscribedBadge}
                            ${liveBadge}
                        </div>
                    </div>
                    <div class="scheduled-game-desc">${description}</div>
                    <div class="scheduled-game-meta-stack">
                        <div class="scheduled-game-meta-line">
                            <span><i class="bi bi-calendar-event"></i>${startText}</span>
                            <span><i class="bi bi-controller"></i>${roomSafeHtml(meta.name)}</span>
                        </div>
                        <div class="scheduled-game-meta-line scheduled-game-meta-secondary">
                            <span><i class="bi bi-people"></i>${signupText}</span>
                            <span><i class="bi bi-check-circle"></i>${readinessText}</span>
                        </div>
                        <div class="scheduled-game-meta-line scheduled-game-meta-host">
                            <span><i class="bi bi-person-circle"></i>Хост: ${hostName}</span>
                        </div>
                    </div>
                    <div class="scheduled-game-actions">
                        ${primaryAction}
                        ${secondaryAction}
                    </div>
                </div>
            </div>
        `;
        container.appendChild(div);
    });

    consumePendingScheduledDeepLink(sortedGames, container);
}

async function subscribeScheduledGame(id) {
    const res = await window.apiRequest({ action: 'subscribe_scheduled_game', scheduled_game_id: id });
    if (res?.status === 'ok') {
        if (window.showToast) window.showToast('Вы записались на игру', 'success');
        loadScheduledGames();
    }
}

async function unsubscribeScheduledGame(id) {
    const res = await window.apiRequest({ action: 'unsubscribe_scheduled_game', scheduled_game_id: id });
    if (res?.status === 'ok') {
        if (window.showToast) window.showToast('Запись отменена', 'info');
        loadScheduledGames();
    }
}

async function openScheduledGame(id) {
    const game = currentScheduledGamesById.get(Number(id));
    const run = async () => {
        const res = await window.apiRequest({ action: 'open_scheduled_game', scheduled_game_id: id });
        if (res?.status === 'ok') {
            if (res.warning && window.showToast) window.showToast(res.warning, 'warning');
            if (res.room_code && typeof window.checkState === 'function') {
                await window.checkState();
                return;
            }
            loadScheduledGames();
        }
    };

    const subscribersCount = Number(game?.subscribers_count || 0);
    const minPlayers = Number(game?.min_players || 1);
    if (subscribersCount < minPlayers && typeof window.showConfirmation === 'function') {
        window.showConfirmation(
            'Открыть игру?',
            'Минимум игроков ещё не набран. Игру всё равно можно открыть.',
            run,
            { confirmText: 'Открыть' }
        );
        return;
    }

    await run();
}

async function joinScheduledGameRoom(roomCode) {
    if (!roomCode) return;
    if (isJoinRoomPending) return;

    isJoinRoomPending = true;
    setPollingSuspended(true);
    try {
        const res = await window.apiRequest({ action: 'join_room', room_code: roomCode, password: '' });
        if (res?.status === 'ok') {
            if (typeof window.checkState === 'function') {
                await window.checkState();
            }
            return;
        }

        const message = String(res?.message || '');
        if (message.includes('Комната не найдена')) {
            if (window.showAlert) {
                window.showAlert('Игра уже закрыта', 'Эта запланированная игра больше недоступна.', 'warning');
            }
            loadScheduledGames();
            return;
        }

        if (window.showAlert) {
            window.showAlert('Ошибка', message || 'Не удалось войти в комнату', 'error');
        }
    } finally {
        setPollingSuspended(false);
        isJoinRoomPending = false;
    }
}

async function cancelScheduledGame(id) {
    const run = async () => {
        const res = await window.apiRequest({ action: 'cancel_scheduled_game', scheduled_game_id: id });
        if (res?.status === 'ok') {
            if (window.showToast) window.showToast('Игра отменена', 'info');
            loadScheduledGames();
        }
    };

    if (typeof window.showConfirmation === 'function') {
        window.showConfirmation('Отменить игру?', 'Игроки больше не увидят её в расписании.', run, {
            confirmText: 'Отменить игру',
            cancelText: 'Не отменять',
            isDanger: true
        });
    } else {
        await run();
    }
}

async function sendScheduledGameManualReminder(id) {
    const res = await window.apiRequest({ action: 'send_scheduled_game_manual_reminder', scheduled_game_id: id });
    if (res?.status === 'ok') {
        const sentCount = Number(res.sent_count || 0);
        const skippedCount = Number(res.skipped_count || 0);
        let message = res.message || `Напоминание отправлено: ${sentCount} игрокам`;
        if (skippedCount > 0) {
            message += `, пропущено: ${skippedCount}`;
        }
        showScheduledFeedback('Напоминание отправлено', message, 'success');
        return;
    }

    showScheduledFeedback('Не получилось', res?.message || 'Не удалось отправить напоминание', 'warning');
}

// === POLLING ===

function startPolling() {
    if (pollInterval) return;
    pollInterval = setInterval(() => {
        if (window.__pgSuspendPolling) return;
        if (typeof window.checkState === 'function') window.checkState();
    }, 3000);
}

function stopPolling() {
    if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
    }
}

// === RENDERING ===

function renderLobby(res) {
    if (typeof window.document === 'undefined') return;
    document.body.classList.remove('wordclash-active'); // Cleanup WordClash state
    if (typeof window.cleanupBlokusLifecycle === 'function') {
        window.cleanupBlokusLifecycle();
    }

    const codeDisplay = document.getElementById('room-code-display');
    if (codeDisplay) codeDisplay.innerText = res.room.room_code;

    renderPlayerList(res.players, 'players-list');

    const hostControls = document.getElementById('host-controls');
    const guestMsg = document.getElementById('guest-waiting-msg');

    if (res.is_host == 1) {
        if (hostControls) hostControls.style.display = 'block';
        if (guestMsg) guestMsg.style.display = 'none';

        const gameNameDisplay = document.getElementById('selected-game-name');
        const selectedGameId = window.selectedGameId;
        const currentGame = window.AVAILABLE_GAMES ? window.AVAILABLE_GAMES.find(g => g.id === selectedGameId) : null;

        if (gameNameDisplay) gameNameDisplay.innerText = currentGame ? currentGame.name : 'Выбрать игру';

        // Update Icon
        const gameIconBg = document.getElementById('selected-game-icon-bg');
        const gameIcon = document.getElementById('selected-game-icon');

        if (currentGame) {
            if (gameIconBg) {
                gameIconBg.style.background = currentGame.bgColor || '#eee';
                gameIconBg.style.color = currentGame.color || '#333';
            }
            if (gameIcon) gameIcon.className = `bi ${currentGame.icon || 'bi-controller'}`;
        } else {
            if (gameIconBg) {
                gameIconBg.style.background = '';
                gameIconBg.style.color = '';
            }
            if (gameIcon) gameIcon.className = 'bi bi-lightning-fill';
        }

        if (window.AVAILABLE_GAMES) {
            renderGameSelectorUI(res);
        }

        const startBtn = document.getElementById('btn-start-game');
        if (startBtn && typeof window.startGame === 'function') {
            startBtn.onclick = () => window.startGame(window.selectedGameId);
        }

    } else {
        if (hostControls) hostControls.style.display = 'none';
        if (guestMsg) guestMsg.style.display = 'block';
    }
}

function renderPlayerList(players, containerId) {
    const currentJson = JSON.stringify(players) + (window.selectedGameId || '');
    if (currentJson === lastPlayersJson) return;
    lastPlayersJson = currentJson;

    const list = document.getElementById(containerId);
    if (!list) return;
    list.innerHTML = '';

    const countEl = document.getElementById('players-count');
    if (countEl) countEl.innerText = players.length;

    const amIHost = window.isHost;

    players.forEach(p => {
        const div = document.createElement('div');
        div.className = 'player-grid-item';

        const avatarHtml = typeof window.renderAvatar === 'function' ? window.renderAvatar(p, 'md', false, true) : '';

        // Professional Icon (Star) as requested by user
        const crown = p.is_host == 1 ?
            '<div class="host-crown"><i class="bi bi-star-fill"></i></div>' : '';

        let botBadge = '';
        if (p.is_bot == 1) {
            const difficulty = String(p.bot_difficulty || 'AI').toLowerCase();
            const difficultyLabelMap = {
                easy: 'Лёгкий',
                medium: 'Средний',
                hard: 'Сложный',
                ai: 'AI'
            };
            botBadge = `<span class="player-bot-badge player-bot-badge--${difficulty} position-absolute bottom-0 start-50 translate-middle-x">${difficultyLabelMap[difficulty] || 'AI'}</span>`;
        }

        div.innerHTML = `
            <div class="position-relative">
                ${avatarHtml}
                ${crown}
                ${botBadge}
            </div>
            <div class="player-name">${window.safeHTML(p.custom_name) || window.safeHTML(p.first_name)}</div>
        `;

        if (amIHost && p.is_host != 1) {
            div.style.cursor = 'pointer';
            div.setAttribute('role', 'button');
            div.setAttribute('tabindex', '0');
            if (p.is_bot == 1) {
                if (typeof window.removeBot === 'function') div.onclick = () => window.removeBot(p.id);
            } else {
                if (typeof window.kickPlayer === 'function') div.onclick = () => window.kickPlayer(p.id, p.first_name);
            }
            div.onkeydown = (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    div.click();
                }
            };
        }

        list.appendChild(div);
    });

    // Render Empty Slots / Add Bot Button
    const sgId = window.selectedGameId;
    let botLimit = 0;
    if (sgId === 'blokus') botLimit = 4;
    else if (sgId === 'bunker') botLimit = 12;
    else if (sgId === 'tictactoe') botLimit = 2;
    else if (sgId === 'partybattle') botLimit = 16;
    else if (sgId === 'brainbattle') botLimit = 16;

    if (amIHost && botLimit > 0 && players.length < botLimit) {
        const div = document.createElement('div');
        div.className = 'player-grid-item';

        div.innerHTML = `
            <div class="add-bot-avatar">
                <i class="bi bi-plus-lg"></i>
            </div>
            <div class="player-name text-muted mt-2" style="font-size: 11px;">Добавить<br>бота</div>
        `;
        if (typeof window.showAddBotModal === 'function') div.onclick = () => window.showAddBotModal();
        list.appendChild(div);
    }
}

// === INVITE & QR LOGIC ===

function openQrModal() {
    const titleEl = document.getElementById('modal-room-code-title');
    const textEl = document.getElementById('modal-room-code-text');
    const qrContainer = document.getElementById('modal-qr-code');

    if (!titleEl || !textEl || !qrContainer) return;

    if (window.safeText) {
        window.safeText('modal-room-code-title', window.currentRoomCode);
        window.safeText('modal-room-code-text', window.currentRoomCode);
    }

    qrContainer.innerHTML = '';

    const inviteLink = "https://t.me/mpartygamebot/app?startapp=" + window.currentRoomCode;

    // Assuming QRCode lib is globally available
    if (typeof QRCode !== 'undefined') {
        new QRCode(qrContainer, {
            text: inviteLink,
            width: 180,
            height: 180,
            colorDark: "#2E1A5B",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.H
        });
    }

    if (window.showModal) window.showModal('qrInviteModal');
}

async function copyInviteLink() {
    const inviteLink = "https://t.me/mpartygamebot/app?startapp=" + window.currentRoomCode;
    try {
        await navigator.clipboard.writeText(inviteLink);
        const btn = document.getElementById('btn-copy-invite');
        const icon = document.getElementById('btn-copy-icon');

        if (btn && icon) {
            const originalBg = btn.style.background;

            // Stable feedback: Swap icon and background color only
            icon.classList.remove('bi-link-45deg');
            icon.classList.add('bi-check-lg');
            btn.style.background = "#28a745";

            setTimeout(() => {
                icon.classList.remove('bi-check-lg');
                icon.classList.add('bi-link-45deg');
                btn.style.background = originalBg;
            }, 2000);
        }
    } catch (e) {
        console.error('Failed to copy invite link: ', e);
    }
}


// === QR SCANNER ===

function scanQrCode() {
    if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.showScanQrPopup) {
        window.Telegram.WebApp.showScanQrPopup({
            text: 'Наведите камеру на QR-код комнаты'
        }, (data) => {
            if (!data) return;

            // Handle URL format: https://t.me/bot?startapp=ROOMCODE
            // or just ROOMCODE
            let code = data;

            // Basic URL parsing to extract 'startapp' param if present
            try {
                if (data.includes('startapp=')) {
                    const url = new URL(data);
                    const params = new URLSearchParams(url.search);
                    const startapp = params.get('startapp');
                    if (startapp) code = startapp;
                } else if (data.includes('tg://resolve') && data.includes('startapp=')) {
                    // Handle tg:// links if necessary, though usually raw text comes in
                    const parts = data.split('startapp=');
                    if (parts.length > 1) code = parts[1].split('&')[0];
                }
            } catch (e) {
                console.log("QR Parse error", e);
            }

            // Cleanup code (keep only alphanumeric if typical room code)
            // Assuming room codes are alphanumeric. 
            // If it's a direct link to something else, we might want to respect it, 
            // but here we expect a room code.

            // Close popup
            window.Telegram.WebApp.closeScanQrPopup();

            // Fill input
            const input = document.getElementById('join-room-code');
            if (input) {
                input.value = code;
                // Visual feedback
                input.style.borderColor = '#28a745';
                setTimeout(() => input.style.borderColor = '', 1000);
            }

            // Auto-join
            joinRoom(code);

            // Explicitly close the join modal
            if (window.closeModal) window.closeModal('joinModal');

            // Force cleanup of stuck backdrops (Bootstrap issue)
            setTimeout(() => {
                document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
                document.body.classList.remove('modal-open');
                document.body.style.overflow = '';
                document.documentElement.classList.remove('modal-open');
                if (typeof window.syncModalOpenState === 'function') window.syncModalOpenState();
            }, 300);

            return true; // standard callback return
        });
    } else {
        if (window.showAlert) window.showAlert('Ошибка', 'Сканер QR доступен только в Telegram', 'warning');
    }
}

// === INVITE SYSTEM (Moved from app.js) ===

let selectedInviteFriends = new Set();
let inviteModalInstance = null;

async function openInviteModal() {
    const modalEl = document.getElementById('inviteFriendsModal');
    if (!modalEl) return;

    // Reset
    selectedInviteFriends.clear();
    const countEl = document.getElementById('invite-count');
    if (countEl) countEl.textContent = '0';

    const sendBtn = document.getElementById('btn-send-invites');
    if (sendBtn) sendBtn.disabled = true;

    const searchInput = document.getElementById('invite-search-input');
    if (searchInput) searchInput.value = '';

    if (!inviteModalInstance) {
        inviteModalInstance = new bootstrap.Modal(modalEl);
    }
    inviteModalInstance.show();

    const container = document.getElementById('invite-friends-list');
    if (container) container.innerHTML = '<div class="text-center py-4"><div class="spinner-border spinner-border-sm text-primary"></div></div>';

    try {
        const res = await window.apiRequest({ action: 'get_friends' });
        if (res.status === 'ok') {
            const friends = res.friends || [];
            if (friends.length === 0) {
                if (container) container.innerHTML = '<p class="text-center text-muted small mt-3">У вас пока нет друзей.</p>';
                return;
            }

            renderInviteList(friends);
            // Save for filtering
            if (container) container.dataset.friends = JSON.stringify(friends);
        }
    } catch (e) {
        if (container) container.innerHTML = '<p class="text-danger text-center">Ошибка загрузки</p>';
    }
}

async function sendToTelegram() {
    const botUsername = 'mpartygamebot'; // Replace with yours
    const roomCode = String(window.currentRoomCode || '').trim();
    if (!roomCode) {
        if (window.showAlert) window.showAlert('Ошибка', 'Не найден код комнаты', 'error');
        return;
    }

    const url = `https://t.me/${botUsername}?startgroup=${encodeURIComponent(roomCode)}`;

    if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.openTelegramLink) {
        window.Telegram.WebApp.openTelegramLink(url);
    } else {
        window.open(url, '_blank');
    }
}

function renderInviteList(friends) {
    const container = document.getElementById('invite-friends-list');
    if (!container) return;
    container.innerHTML = '';

    friends.forEach(f => {
        const isSelected = selectedInviteFriends.has(f.id);
        const div = document.createElement('div');
        div.className = 'invite-friend-item interactable';
        div.style.backgroundColor = isSelected ? 'var(--bg-accent-soft)' : 'transparent';
        div.onclick = () => toggleFriendInvite(f.id, div);

        const avatarHtml = window.renderAvatar ? window.renderAvatar(f, 'sm') : `<div class="avatar-sm" style="background:${f.avatar_bg || '#ccc'}">${f.avatar_emoji || '👤'}</div>`;

        div.innerHTML = `
                <div class="invite-avatar-box position-relative">
                    ${avatarHtml}
                    ${isSelected ? '<span class="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-primary border border-white" style="z-index:2;"><i class="bi bi-check"></i></span>' : ''}
                </div>
                <div class="flex-grow-1 ms-3">
                    <div class="fw-bold small text-dark">${window.safeHTML(f.custom_name) || window.safeHTML(f.first_name)}</div>
                </div>
                <div class="invite-checkbox-wrapper">
                    <input class="form-check-input shadow-sm" type="checkbox" ${isSelected ? 'checked' : ''} style="pointer-events: none; border-radius: 6px;">
                </div>
            `;
        container.appendChild(div);
    });
}

function toggleFriendInvite(id, el) {
    if (selectedInviteFriends.has(id)) {
        selectedInviteFriends.delete(id);
        el.style.backgroundColor = 'transparent';
        const checkbox = el.querySelector('.form-check-input');
        if (checkbox) checkbox.checked = false;
        const badge = el.querySelector('.badge');
        if (badge) badge.remove();
    } else {
        selectedInviteFriends.add(id);
        el.style.backgroundColor = 'var(--bg-accent-soft)';
        const checkbox = el.querySelector('.form-check-input');
        if (checkbox) checkbox.checked = true;

        const avatarBox = el.querySelector('.invite-avatar-box');
        if (avatarBox && !avatarBox.querySelector('.badge')) {
            const badge = document.createElement('span');
            badge.className = 'position-absolute top-0 start-100 translate-middle badge rounded-pill bg-primary border border-white';
            badge.style.zIndex = '2';
            badge.innerHTML = '<i class="bi bi-check"></i>';
            avatarBox.appendChild(badge);
        }
    }

    // Update button
    const count = selectedInviteFriends.size;
    const countEl = document.getElementById('invite-count');
    if (countEl) countEl.textContent = count;

    const sendBtn = document.getElementById('btn-send-invites');
    if (sendBtn) sendBtn.disabled = count === 0;
}

function filterInviteList() {
    const query = document.getElementById('invite-search-input').value.toLowerCase();
    const container = document.getElementById('invite-friends-list');
    const friends = JSON.parse(container.dataset.friends || '[]');

    const filtered = friends.filter(f =>
        (f.custom_name || f.first_name).toLowerCase().includes(query)
    );
    renderInviteList(filtered);
}

async function sendInvites() {
    const btn = document.getElementById('btn-send-invites');
    if (btn.disabled) return;

    let roomId = window.currentRoomId;
    if (!roomId) {
        if (window.showAlert) window.showAlert('Ошибка', 'Не найдена комната', 'error');
        return;
    }

    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Отправка...';
    btn.disabled = true;

    try {
        const res = await window.apiRequest({
            action: 'invite_friends',
            room_id: roomId,
            friends: Array.from(selectedInviteFriends)
        });

        if (res.status === 'ok') {
            btn.innerHTML = 'Отправлено!';
            setTimeout(() => {
                if (inviteModalInstance) inviteModalInstance.hide();
            }, 1000);
        } else {
            let msg = 'Ошибка: ' + res.message;
            if (res.debug_log_error) msg += '\nLog Error: ' + res.debug_log_error;
            if (window.showAlert) window.showAlert('Ошибка', msg, 'error');
            btn.innerHTML = 'Попробовать снова';
            btn.disabled = false;
        }
    } catch (e) {
        console.error(e);
        btn.innerHTML = 'Ошибка';
        btn.disabled = false;
    }
}

// === BOT MANAGEMENT ===

function showAddBotModal() {
    const html = `
    <div class="d-grid gap-3 p-2">
        <button class="glass-btn glass-btn-success d-flex align-items-center justify-content-center gap-3 py-3" onclick="addBot('easy')">
             <i class="bi bi-lightning-fill fs-4"></i>
             <span class="fw-bold">Лёгкий</span>
        </button>
        <button class="glass-btn glass-btn-warning d-flex align-items-center justify-content-center gap-3 py-3" onclick="addBot('medium')">
             <i class="bi bi-robot fs-4"></i>
             <span class="fw-bold">Средний</span>
        </button>
        <button class="glass-btn glass-btn-danger d-flex align-items-center justify-content-center gap-3 py-3" onclick="addBot('hard')">
             <i class="bi bi-fire fs-4"></i>
             <span class="fw-bold">Сложный</span>
        </button>
    </div>
    `;
    if (window.UIManager && window.UIManager.showAlert) {
        window.UIManager.showAlert('Выберите сложность', html, 'info');
    } else if (window.showAlert) {
        window.showAlert('Выберите сложность', html, 'info');
    }
}

async function addBot(difficulty) {
    // Manually close the alert modal
    const modalEl = document.getElementById('alertModal'); // Or customAlertModal depending on UIManager implementation
    // Assuming UIManager uses 'customAlertModal-...' but we need to close it.
    // If we used UIManager.showAlert, it creates a unique ID.
    // The legacy code used 'customAlertModal'.

    // Quick fix: Try to close specific modal if accessible, or just let API run
    // Ideally we should have a closeLastAlert() helper.
    // For now, let's just run the API.

    // If using 'customAlertModal' specifically from HTML:
    const legacyModal = document.getElementById('customAlertModal');
    if (legacyModal) {
        const m = bootstrap.Modal.getInstance(legacyModal);
        if (m) m.hide();
    }
    // Also try closing generic custom overlays
    document.querySelectorAll('.custom-modal-overlay').forEach(el => el.remove());
    if (typeof window.syncModalOpenState === 'function') window.syncModalOpenState();

    await window.apiRequest({
        action: 'add_bot',
        difficulty: difficulty
    });
}

async function removeBot(userId) {
    if (!window.showConfirmation) return;

    window.showConfirmation(
        'Удалить бота?',
        'Вы уверены, что хотите кикнуть этого бота?',
        async () => {
            await window.apiRequest({
                action: 'remove_bot',
                target_id: userId
            });
        },
        { confirmText: 'Удалить', isDanger: true }
    );
}

// === PLAYER MANAGEMENT ===

async function kickPlayer(id, name) {
    if (!window.showConfirmation) return;

    window.showConfirmation('Исключение', `Вы действительно хотите выгнать игрока ${name}?`, async () => {
        const res = await window.apiRequest({ action: 'kick_player', target_id: id });
        if (res.status === 'ok') {
            // State update will trigger re-render
        } else {
            if (window.showAlert) window.showAlert("Ошибка", res.message, 'error');
        }
    }, { isDanger: true, confirmText: 'Выгнать' });
}

async function backToLobby() {
    const amIHost = window.isHost;
    if (amIHost) {
        if (!window.showConfirmation) return;
        window.showConfirmation('Завершить для всех', 'Завершить игру для всех участников?', async () => {
            const res = await window.apiRequest({ action: 'stop_game' });
            // Check state handled by app orchestration
        }, { isDanger: true, confirmText: 'Завершить' });
    } else {
        leaveRoom();
    }
}


// === EXPORTS ===
window.RoomManager = {
    createRoom,
    joinRoom,
    leaveRoom,
    loadPublicRooms,
    loadScheduledGames,
    switchRoomsMode,
    openScheduledGameModal,
    editScheduledGame,
    createScheduledGame,
    subscribeScheduledGame,
    unsubscribeScheduledGame,
    openScheduledGame,
    joinScheduledGameRoom,
    cancelScheduledGame,
    sendScheduledGameManualReminder,
    startPolling,
    stopPolling,
    renderLobby,
    renderPlayerList,
    getIsLeavingProcess: () => isLeavingProcess,

    // NEW
    openQrModal,
    copyInviteLink,
    scanQrCode,

    // Moved from app.js
    openInviteModal,
    toggleFriendInvite,
    filterInviteList, // Make sure to export if used in HTML
    sendInvites,

    showAddBotModal,
    addBot,
    removeBot,

    kickPlayer,
    backToLobby,
    sendToTelegram
};

// Global aliases for backward compatibility
window.createRoom = createRoom;
window.closeCreateRoomModal = closeCreateRoomModal;
window.joinRoom = joinRoom;
window.leaveRoom = leaveRoom;
window.loadPublicRooms = loadPublicRooms;
window.loadScheduledGames = loadScheduledGames;
window.switchRoomsMode = switchRoomsMode;
window.openScheduledGameModal = openScheduledGameModal;
window.editScheduledGame = editScheduledGame;
window.createScheduledGame = createScheduledGame;
window.subscribeScheduledGame = subscribeScheduledGame;
window.unsubscribeScheduledGame = unsubscribeScheduledGame;
window.openScheduledGame = openScheduledGame;
window.joinScheduledGameRoom = joinScheduledGameRoom;
window.cancelScheduledGame = cancelScheduledGame;
window.sendScheduledGameManualReminder = sendScheduledGameManualReminder;
window.startPolling = startPolling;
window.stopPolling = stopPolling;
window.renderLobby = renderLobby;
window.renderPlayerList = renderPlayerList;

// New Aliases
window.openQrModal = openQrModal;
window.copyInviteLink = copyInviteLink;
window.scanQrCode = scanQrCode;
window.loadLocalRooms = loadLocalRooms;

// Moved Aliases
window.openInviteModal = openInviteModal;
window.toggleFriendInvite = toggleFriendInvite;
window.filterInviteList = filterInviteList;
window.sendInvites = sendInvites;
window.showAddBotModal = showAddBotModal;
window.addBot = addBot;
window.removeBot = removeBot;
window.kickPlayer = kickPlayer;
window.backToLobby = backToLobby;
window.sendToTelegram = sendToTelegram;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupCreateRoomModalFlow);
} else {
    setupCreateRoomModalFlow();
}


// === GAME SELECTOR UI (Refactored to List View with Favorites) ===

let _gameSelectorInitialized = false;
let _gameSelectorState = {
    search: '',
    category: 'all',
    favorites: []
};
let _lastLobbyState = null;

// Initial Fetch of Favorites
async function _fetchFavorites() {
    try {
        if (typeof window.apiRequest === 'function') {
            const res = await window.apiRequest({ action: 'get_favorites' });
            if (res.status === 'ok') {
                const favs = res.favorites || [];
                _gameSelectorState.favorites = favs;
                window.userFavorites = favs; // Sync global state

                // Update hearts on main screen if they exist
                if (window.UIManager && window.UIManager.toggleGameLike) {
                    // We can't easily trigger the visual update without an event, 
                    // but we can manually update icons if they exist.
                    favs.forEach(id => {
                        const btns = document.querySelectorAll(`[data-like-game-id="${id}"] i`);
                        btns.forEach(i => {
                            i.classList.remove('bi-heart');
                            i.classList.add('bi-heart-fill', 'text-danger');
                        });
                    });
                }

                // Refresh if _lastLobbyState is available
                if (_lastLobbyState) {
                    _refreshGameList(_lastLobbyState);
                }
            }
        }
    } catch (e) {
        console.error("Failed to fetch favorites", e);
    }
}

function renderGameSelectorUI(lobbyState) {
    _lastLobbyState = lobbyState;

    const list = document.getElementById('game-selector-list');
    if (!list) return;

    // Refresh data every time modal opens to be safe
    _fetchFavorites();

    // Initialize once structure
    if (!_gameSelectorInitialized) {
        _gameSelectorInitialized = true;

        // Structure: Fixed Header + Scrollable Content
        list.innerHTML = `
            <div class="sticky-top" style="z-index: 10; background: var(--bg-secondary); border-bottom: 1px solid var(--border-main);">
                <div class="px-3 pt-2 pb-2"> <!-- Reduced top padding for search -->
                    <div class="position-relative">
                         <i class="bi bi-search position-absolute top-50 start-0 translate-middle-y ms-3 text-muted"></i>
                         <input type="text" id="game-search-input" class="form-control rounded-4 border-1 shadow-sm" 
                                placeholder="Поиск..." 
                                style="padding-left: 45px; height: 42px; font-size: 16px; border-color: var(--border-main); background: var(--bg-app);">
                    </div>
                </div>

                <!-- Tabs -->
                <div class="d-flex gap-2 overflow-auto px-3 pb-3 no-scrollbar" id="game-cat-filters" style="white-space: nowrap;">
                    <button class="btn btn-sm rounded-pill px-3 fw-bold filter-tab active" data-cat="all">Все</button>
                    <button class="btn btn-sm rounded-pill px-3 fw-bold filter-tab" data-cat="party">Вечеринка</button>
                    <button class="btn btn-sm rounded-pill px-3 fw-bold filter-tab" data-cat="logic">Логика</button>
                </div>
            </div>
            
            <div id="game-list-container" class="p-0" style="padding-bottom: 80px !important;">
                <!-- Games rendered here as list -->
            </div>
            
            <style>
                .game-list-item {
                    display: flex;
                    align-items: center;
                    padding: 8px 16px; /* Reduced vertical padding item */
                    cursor: pointer;
                    transition: background 0.2s;
                    position: relative;
                }
                .game-list-item:active {
                    background: var(--bg-app);
                }
                
                /* Inset border via pseudoelement to look like iOS */
                .game-list-item::after {
                    content: '';
                    position: absolute;
                    bottom: 0;
                    right: 0;
                    left: 70px; /* Inset from icon width */
                    height: 1px;
                    background: var(--border-main);
                }
                .game-list-item:last-child::after {
                    display: none;
                }
                
                .game-list-icon {
                    width: 42px; 
                    height: 42px;
                    flex-shrink: 0; /* Prevent squishing */
                    border-radius: 10px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 22px;
                    margin-right: 14px;
                }
                
                .game-list-content {
                    flex-grow: 1;
                    min-width: 0; /* Fix flex text overflow */
                }
                
                .game-list-check {
                    color: #28a745; 
                    font-size: 18px;
                    display: none;
                    margin-left: 10px;
                }
                 .game-list-arrow {
                    color: #ccc; 
                    font-size: 16px;
                    margin-left: 10px;
                }

                .game-list-item.selected .game-list-check {
                    display: block;
                }
                .game-list-item.selected .game-list-arrow {
                    display: none;
                }
                
                /* Star Button */
                .game-fav-btn {
                    padding: 8px;
                    margin-right: 2px;
                    color: color-mix(in srgb, var(--status-warning), var(--text-main) 46%);
                    transition: transform 0.2s, color 0.2s;
                    z-index: 5;
                }
                .game-fav-btn:active {
                    transform: scale(0.8);
                }
                .game-fav-btn.active {
                    color: color-mix(in srgb, var(--status-warning), #9a6700 14%);
                }

                /* Filter Tabs Solid Design */
                .filter-tab {
                    background: var(--bg-app);
                    color: var(--text-main);
                    border: 1px solid var(--border-main);
                }
                .filter-tab.active {
                    background: var(--text-main);
                    color: var(--bg-secondary);
                    border: 1px solid var(--text-main);
                }

                #gameSelectorModal .section-title {
                    padding: 24px 16px 0px; /* Strong top separation, zero bottom */
                    font-size: 11px;
                    text-transform: uppercase;
                    color: var(--text-muted);
                    font-weight: 700;
                    background: transparent;
                    letter-spacing: 0.5px;
                }
                
                #gameSelectorModal .modal-content {
                    background: var(--bg-secondary) !important;
                    border-radius: 20px 20px 0 0; 
                    height: 70vh; /* Reduced height as requested */
                    display: flex;
                    flex-direction: column;
                }
                 #gameSelectorModal .modal-body {
                    padding: 0 !important;
                    overflow: hidden;
                    display: flex;
                    flex-direction: column;
                    flex: 1; 
                }
                 #gameSelectorModal .modal-header {
                   border-bottom: none !important;
                   padding-bottom: 0px !important;
                   padding-top: 18px !important; /* Slightly increased top padding */
                 }
                 #gameSelectorModal .modal-title {
                   font-size: 1.25rem;
                   font-weight: 700;
                 }
                 #game-selector-list {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    overflow: hidden;
                 }
                 #game-list-container {
                     overflow-y: auto;
                     flex: 1;
                 }
            </style>
        `;

        // Bind Events
        document.getElementById('game-search-input').oninput = (e) => {
            _gameSelectorState.search = e.target.value.toLowerCase();
            _refreshGameList(lobbyState);
        };

        const cats = document.querySelectorAll('#game-cat-filters button');
        cats.forEach(btn => {
            btn.onclick = () => {
                _gameSelectorState.category = btn.getAttribute('data-cat');
                cats.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                _refreshGameList(lobbyState);
            };
        });
    }

    _refreshGameList(lobbyState);
}

function _refreshGameList(lobbyState) {
    const container = document.getElementById('game-list-container');
    if (!container) return;

    container.innerHTML = '';

    // Filter logic
    const allGames = window.AVAILABLE_GAMES.filter(g => {
        const matchesSearch = g.name.toLowerCase().includes(_gameSelectorState.search) ||
            (g.description && g.description.toLowerCase().includes(_gameSelectorState.search));
        const matchesCat = _gameSelectorState.category === 'all' || g.category === _gameSelectorState.category;
        return matchesSearch && matchesCat;
    });

    if (allGames.length === 0) {
        container.innerHTML = '<div class="text-center text-muted small w-100 py-5">Ничего не найдено</div>';
        return;
    }

    // -- Favorites Logic --
    // Show Favorites section first if manual favorites exist.

    // 1. Identify Favorite Games objects
    let favGames = [];
    if (_gameSelectorState.category === 'all' && !_gameSelectorState.search) {
        favGames = _gameSelectorState.favorites
            .map(id => window.AVAILABLE_GAMES.find(g => g.id === id))
            .filter(g => g);
    }

    const renderItem = (game) => {
        const isSelected = game.id === window.selectedGameId;
        const isFav = _gameSelectorState.favorites.includes(game.id);
        const iconBg = game.bgColor || '#f8f9fa';
        const iconColor = game.color || '#333';

        const div = document.createElement('div');
        div.className = `game-list-item ${isSelected ? 'selected' : ''}`;

        // Items: Star | Icon | Text | Check/Arrow
        // Note: Star should capture click separately to avoid selecting game
        div.innerHTML = `
            <div class="game-fav-btn ${isFav ? 'active' : ''}" onclick="event.stopPropagation(); toggleGameFavorite('${game.id}', this)">
                <i class="bi ${isFav ? 'bi-star-fill' : 'bi-star'}"></i>
            </div>
            <div class="game-list-icon" style="background: ${iconBg}; color: ${iconColor};">
                <i class="bi ${game.icon}"></i>
            </div>
            <div class="game-list-content">
                <div class="fw-bold text-dark" style="font-size: 15px;">${game.name}</div>
                ${game.description ? `<div class="text-muted small text-truncate" style="font-size:12px; max-width: 200px;">${game.description}</div>` : ''}
            </div>
            <i class="bi bi-check-lg game-list-check"></i>
            <i class="bi bi-chevron-right game-list-arrow"></i>
        `;

        div.onclick = () => {
            window.selectedGameId = game.id;
            _refreshGameList(lobbyState);

            const modalEl = document.getElementById('gameSelectorModal');
            if (window.bootstrap) {
                const modal = window.bootstrap.Modal.getInstance(modalEl) || new window.bootstrap.Modal(modalEl);
                modal.hide();
            }
            renderLobby(lobbyState);
        };
        return div;
    };

    // Render Favorites Section
    if (favGames.length > 0) {
        const title = document.createElement('div');
        title.className = 'section-title';
        title.innerText = 'ИЗБРАННОЕ';
        container.appendChild(title);

        favGames.forEach(g => {
            container.appendChild(renderItem(g));
        });
    }

    // Render All Section
    if (_gameSelectorState.category === 'all' && !_gameSelectorState.search && favGames.length > 0) {
        const title = document.createElement('div');
        title.className = 'section-title';
        title.innerText = 'ВСЕ ИГРЫ';
        container.appendChild(title);
    }

    // Sort all games so favorites in 'All' list might appear top? No, just alpha or default order.
    // Filter out favorites from Main list to avoid duplicates? Users usually prefer no duplicates.
    const nonFavGames = allGames.filter(g => !favGames.includes(g));

    const listToRender = (favGames.length > 0 && _gameSelectorState.category === 'all' && !_gameSelectorState.search) ? nonFavGames : allGames;

    listToRender.forEach(g => {
        container.appendChild(renderItem(g));
    });
}

// Make globally accessible for onClick
window.toggleGameFavorite = async function (id, btn) {
    let list = _gameSelectorState.favorites;

    // Optimistic Update
    if (list.includes(id)) {
        list = list.filter(x => x !== id);
    } else {
        list.push(id);
    }
    _gameSelectorState.favorites = list;

    // Sync to window.userFavorites
    window.userFavorites = list;

    // Visual Feedback on Button Immediate
    if (btn) {
        const icon = btn.querySelector('i');
        if (list.includes(id)) {
            btn.classList.add('active');
            icon.classList.remove('bi-star');
            icon.classList.add('bi-star-fill');
        } else {
            btn.classList.remove('active');
            icon.classList.remove('bi-star-fill');
            icon.classList.add('bi-star');
        }
    }

    // Update Hearts in Background (Lobby)
    const hearts = document.querySelectorAll(`[data-like-game-id="${id}"] i`);
    hearts.forEach(i => {
        if (list.includes(id)) {
            i.classList.remove('bi-heart');
            i.classList.add('bi-heart-fill', 'text-danger');
        } else {
            i.classList.add('bi-heart');
            i.classList.remove('bi-heart-fill', 'text-danger');
        }
    });

    // Refresh UI to update sections
    if (_lastLobbyState) {
        _refreshGameList(_lastLobbyState);
    } else {
        const activeBtn = document.querySelector('#game-cat-filters button.active');
        if (activeBtn) activeBtn.click();
    }

    // API Call
    try {
        if (typeof window.apiRequest === 'function') {
            await window.apiRequest({ action: 'toggle_like', game_id: id });
        }
    } catch (e) {
        console.error("Like Error", e);
        // Revert on error? For now, simpler not to.
    }
};
