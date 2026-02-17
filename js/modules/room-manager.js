/**
 * Room Manager Module
 * Handles room creation, joining, leaving, and public room listings.
 */

// === STATE ===
let isLeavingProcess = false;
let pollInterval = null;
let lastPlayersJson = '';

// === ROOM ACTIONS ===

async function createRoom() {
    const passInput = document.getElementById('create-room-pass');
    const titleInput = document.getElementById('create-room-title');

    // Check if element exists before accessing checked. If not (old modal?), default false.
    const publicCheckbox = document.getElementById('create-room-public');
    const isPublic = publicCheckbox ? publicCheckbox.checked : false;

    const roomTitle = (titleInput && titleInput.value.trim()) ? titleInput.value.trim() : 'Party Game';

    if (typeof window.apiRequest !== 'function') return;

    const res = await window.apiRequest({ action: 'create_room', password: passInput ? passInput.value : '' });
    if (res.status === 'ok') {
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
            }, 300);
        }

        if (isPublic) {
            await window.apiRequest({
                action: 'make_room_public',
                title: roomTitle,
                description: 'Все сюда!',
                visibility: 'public'
            });
        }
        if (typeof window.checkState === 'function') window.checkState();
    }
}

async function joinRoom(code = null) {
    if (!code) {
        const input = document.getElementById('join-room-code');
        code = input ? input.value : '';
    }
    if (!code) {
        if (window.showAlert) window.showAlert("Внимание", "Введите код", 'warning');
        return;
    }
    const passInput = document.getElementById('join-room-pass');
    const res = await window.apiRequest({ action: 'join_room', room_code: code, password: passInput ? passInput.value : '' });
    if (res.status === 'ok') {
        if (typeof window.checkState === 'function') window.checkState();
    } else {
        if (window.showAlert) window.showAlert("Ошибка", res.message, 'error');
    }
}

function leaveRoom() {
    const amIHost = window.isHost;
    const title = 'Выход из комнаты';
    const text = amIHost ? 'Вы Хост. Если вы выйдете, комната будет закрыта для всех. Продолжить?' : 'Вы уверены, что хотите покинуть комнату?';

    if (typeof window.showConfirmation !== 'function') return;

    window.showConfirmation(title, text, async () => {
        isLeavingProcess = true;
        stopPolling();

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

async function loadPublicRooms() {
    const container = document.getElementById('public-rooms-list');
    if (!container) return; // Not in view
    container.innerHTML = '<p class="text-center text-muted small">Обновление...</p>';

    const res = await window.apiRequest({ action: 'get_public_rooms' });
    if (res.status === 'ok') {
        const refreshBtn = `
            <button onclick="loadPublicRooms()" class="btn btn-light text-primary rounded-circle shadow-sm position-absolute d-flex align-items-center justify-content-center" 
                    style="top: -10px; right: 0px; width: 36px; height: 36px; z-index: 10;">
                <i class="bi bi-arrow-clockwise" style="font-size: 18px;"></i>
            </button>
        `;

        if (res.rooms.length === 0) {
            container.innerHTML = `
                <div class="text-center py-4 rounded-4 shadow-sm position-relative" style="background: var(--bg-glass); backdrop-filter: blur(10px); border: 1px solid var(--border-glass);">
                    ${refreshBtn}
                     <div class="mb-2 text-primary opacity-50"><i class="bi bi-telescope" style="font-size: 40px;"></i></div>
                     <div class="fw-bold" style="color: var(--text-main)">Пусто</div>
                     <div class="text-muted small mb-3">Никто не играет в открытую</div>
                     <button class="btn btn-sm btn-primary rounded-pill px-3" onclick="document.querySelector('[data-bs-target=\\'#createModal\\']').click()">Создать</button>
                </div>
            `;
            return;
        }

        container.innerHTML = refreshBtn;

        res.rooms.forEach(r => {
            const div = document.createElement('div');
            div.className = 'd-flex justify-content-between align-items-center mb-2 p-3 shadow-sm';
            div.style.borderRadius = '16px';
            div.style.border = '1px solid var(--border-glass)';
            div.style.background = 'var(--bg-glass)';
            div.style.backdropFilter = 'blur(10px)';
            div.onclick = () => joinRoom(r.room_code);
            div.style.cursor = 'pointer';

            div.innerHTML = `
                <div class="d-flex justify-content-between align-items-center">
                    <div class="d-flex align-items-center gap-3">
                        <div class="avatar-sm" style="background-image: url('${r.host_avatar || ''}')"></div>
                        <div>
                            <div class="fw-bold" style="color:var(--text-main);">${r.title || ('Комната ' + r.host_name)}</div>
                            <div class="small text-muted">${r.description || 'Присоединяйтесь!'}</div>
                        </div>
                    </div>
                    <div class="text-end">
                         <div class="badge bg-primary rounded-pill mb-1">${r.players_count} чел.</div>
                         <div class="small fw-bold text-primary">#${r.room_code}</div>
                    </div>
                </div>
            `;
            container.appendChild(div);
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
            <button onclick="loadPublicRooms()" class="btn btn-light text-primary rounded-circle shadow-sm position-absolute d-flex align-items-center justify-content-center" 
                    style="top: -10px; right: 0px; width: 36px; height: 36px; z-index: 10;">
                <i class="bi bi-globe" style="font-size: 18px;"></i>
            </button>
        `;

        const title = `<h6 class="text-start ms-2 mb-3 text-primary"><i class="bi bi-wifi me-2"></i>Комнаты рядом</h6>`;

        if (!res.rooms || res.rooms.length === 0) {
            container.innerHTML = `
                ${backBtn}
                ${title}
                <div class="text-center py-4 rounded-4 shadow-sm position-relative" style="background: var(--bg-glass); backdrop-filter: blur(10px); border: 1px solid var(--border-glass);">
                     <div class="mb-2 text-primary opacity-50"><i class="bi bi-router" style="font-size: 40px;"></i></div>
                     <div class="fw-bold" style="color: var(--text-main)">Никого рядом</div>
                     <div class="text-muted small mb-3">В вашей сети нет активных комнат</div>
                     <button class="btn btn-sm btn-outline-primary rounded-pill px-3" onclick="loadPublicRooms()">Показать всё</button>
                </div>
            `;
            return;
        }

        let html = backBtn + title;

        res.rooms.forEach(r => {
            html += `
            <div class="d-flex justify-content-between align-items-center mb-2 p-3 shadow-sm clickable" onclick="joinRoom('${r.room_code}')"
                 style="border-radius: 16px; border: 1px solid var(--border-glass); background: var(--bg-glass); backdrop-filter: blur(10px); cursor: pointer;">
                <div class="d-flex justify-content-between align-items-center w-100">
                    <div class="d-flex align-items-center gap-3">
                        <div class="avatar-sm" style="background-image: url('${r.host_avatar || ''}')"></div>
                        <div>
                            <div class="fw-bold" style="color:var(--text-main);">${r.host_name}</div>
                            <div class="small text-success"><i class="bi bi-wifi"></i> В вашей сети</div>
                        </div>
                    </div>
                    <div class="text-end">
                         <div class="badge bg-success rounded-pill mb-1">Рядом</div>
                         <div class="small fw-bold text-primary">#${r.room_code}</div>
                    </div>
                </div>
            </div>`;
        });
        container.innerHTML = html;
    }
}

// === POLLING ===

function startPolling() {
    if (pollInterval) return;
    pollInterval = setInterval(() => {
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

        const avatarHtml = typeof window.renderAvatar === 'function' ? window.renderAvatar(p, 'md') : '';

        // Professional Icon (Star) as requested by user
        const crown = p.is_host == 1 ?
            '<div class="host-crown"><i class="bi bi-star-fill"></i></div>' : '';

        let botBadge = '';
        if (p.is_bot == 1) {
            const diffColor = p.bot_difficulty === 'hard' ? 'danger' : (p.bot_difficulty === 'easy' ? 'success' : 'warning');
            botBadge = `<span class="badge bg-${diffColor} position-absolute bottom-0 start-50 translate-middle-x" style="font-size: 10px; margin-bottom: -5px;">${p.bot_difficulty || 'AI'}</span>`;
        }

        div.innerHTML = `
            <div class="position-relative">
                ${avatarHtml}
                ${crown}
                ${botBadge}
            </div>
            <div class="player-name">${p.custom_name || p.first_name}</div>
        `;

        if (amIHost && p.is_host != 1) {
            div.style.cursor = 'pointer';
            if (p.is_bot == 1) {
                if (typeof window.removeBot === 'function') div.onclick = () => window.removeBot(p.id);
            } else {
                if (typeof window.kickPlayer === 'function') div.onclick = () => window.kickPlayer(p.id, p.first_name);
            }
        }

        list.appendChild(div);
    });

    // Render Empty Slots / Add Bot Button
    const sgId = window.selectedGameId;
    let botLimit = 0;
    if (sgId === 'blokus') botLimit = 4;
    else if (sgId === 'bunker') botLimit = 12;
    else if (sgId === 'tictactoe') botLimit = 2;

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

function copyInviteLink() {
    const inviteLink = "https://t.me/mpartygamebot/app?startapp=" + window.currentRoomCode;
    navigator.clipboard.writeText(inviteLink).then(() => {
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
    });
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
    const url = `https://t.me/${botUsername}?startgroup=room_${window.currentRoomId}`;

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
                    <div class="fw-bold small text-dark">${f.custom_name || f.first_name}</div>
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
window.joinRoom = joinRoom;
window.leaveRoom = leaveRoom;
window.loadPublicRooms = loadPublicRooms;
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


// === GAME SELECTOR UI ===

let _gameSelectorInitialized = false;
let _gameSelectorState = {
    search: '',
    category: 'all'
};

function renderGameSelectorUI(lobbyState) {
    const list = document.getElementById('game-selector-list');
    if (!list) return;

    // Initialize once structure
    if (!_gameSelectorInitialized) {
        _gameSelectorInitialized = true;

        // Structure:
        // - Sticky Header (Search + Filters)
        // - Grid Container (Scrollable content)
        list.innerHTML = `
            <div class="bg-white sticky-top border-bottom" style="z-index: 10;">
                <div class="px-3 py-3">
                    <div class="position-relative">
                         <i class="bi bi-search position-absolute top-50 start-0 translate-middle-y ms-3 text-muted"></i>
                         <input type="text" id="game-search-input" class="form-control form-control-lg rounded-4 border-1 bg-light text-dark shadow-sm" 
                                placeholder="Поиск игр..." 
                                style="padding-left: 45px; font-size: 16px; border-color: #f0f0f0;">
                    </div>
                </div>

                <!-- Scrollable Filters with proper padding -->
                <div class="d-flex gap-2 overflow-auto px-3 pb-3 no-scrollbar" id="game-cat-filters" style="white-space: nowrap;">
                    <button class="btn btn-sm rounded-pill px-3 fw-bold filter-tab active" data-cat="all">Все</button>
                    <button class="btn btn-sm rounded-pill px-3 fw-bold filter-tab" data-cat="party">Вечеринка</button>
                    <button class="btn btn-sm rounded-pill px-3 fw-bold filter-tab" data-cat="logic">Логика</button>
                    <button class="btn btn-sm rounded-pill px-3 fw-bold filter-tab" data-cat="strategy">Стратегия</button>
                </div>
            </div>
            
            <div id="game-grid-container" class="p-3" style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; padding-bottom: 80px !important; background: #f8f9fa;">
                <!-- Games rendered here -->
            </div>
            <style>
                .filter-tab {
                    background: white;
                    color: #6c757d;
                    border: 1px solid #dee2e6;
                    transition: all 0.2s;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                }
                .filter-tab:hover {
                    background: #f8f9fa;
                    color: #495057;
                }
                .filter-tab.active {
                    background: var(--primary-color);
                    border-color: var(--primary-color);
                    color: white;
                    box-shadow: 0 4px 10px rgba(var(--primary-rgb), 0.3);
                }
                
                .game-card-select {
                    background: white;
                    border: none;
                    border-radius: 24px;
                    transition: all 0.2s;
                    cursor: pointer;
                    overflow: hidden;
                    position: relative;
                    box-shadow: 0 4px 20px rgba(0,0,0,0.04);
                    height: 100%;
                }
                .game-card-select:active {
                   transform: scale(0.97);
                }
                .game-card-select.selected {
                    box-shadow: 0 0 0 3px var(--primary-color);
                }
                .game-card-select .checked-badge {
                    display: none;
                    z-index: 5;
                }
                .game-card-select.selected .checked-badge {
                    display: block;
                }

                /* Ensure modal override is clean */
                 #gameSelectorModal .modal-content {
                    background: #f8f9fa !important; /* Light gray bg for modal to contrast with white cards */
                    backdrop-filter: none !important;
                    border: none !important;
                }
                #gameSelectorModal .modal-header {
                    background: white;
                    border-bottom: 1px solid #eee !important;
                }
            </style>
        `;

        // Bind Events
        document.getElementById('game-search-input').oninput = (e) => {
            _gameSelectorState.search = e.target.value.toLowerCase();
            _refreshGameGrid(lobbyState);
        };

        const cats = document.querySelectorAll('#game-cat-filters button');
        cats.forEach(btn => {
            btn.onclick = () => {
                _gameSelectorState.category = btn.getAttribute('data-cat');
                // Update active class
                cats.forEach(b => {
                    b.classList.remove('active');
                });
                btn.classList.add('active');

                _refreshGameGrid(lobbyState);
            };
        });
    }

    _refreshGameGrid(lobbyState);
}

function _refreshGameGrid(lobbyState) {
    const container = document.getElementById('game-grid-container');
    if (!container) return;

    container.innerHTML = '';

    // Filter
    const games = window.AVAILABLE_GAMES.filter(g => {
        const matchesSearch = g.name.toLowerCase().includes(_gameSelectorState.search) ||
            (g.description && g.description.toLowerCase().includes(_gameSelectorState.search));
        const matchesCat = _gameSelectorState.category === 'all' || g.category === _gameSelectorState.category;
        return matchesSearch && matchesCat;
    });

    if (games.length === 0) {
        container.innerHTML = '<div class="text-center text-muted small w-100 py-5" style="grid-column: span 2;">Ничего не найдено</div>';
        return;
    }

    games.forEach(game => {
        const isSelected = game.id === window.selectedGameId;

        const card = document.createElement('div');
        card.className = `game-card-select p-3 ${isSelected ? 'selected' : ''}`;

        const iconColor = game.color || '#333';
        // Use very light bg for icon container
        const iconBg = game.bgColor || '#f8f9fa';

        const playerCount = game.stats ? game.stats.players : '';

        card.innerHTML = `
            <div class="position-absolute top-0 end-0 p-3 checked-badge">
                <div class="bg-primary rounded-circle d-flex align-items-center justify-content-center shadow" style="width: 24px; height: 24px;">
                     <i class="bi bi-check text-white" style="font-size: 16px;"></i>
                </div>
            </div>
            <div class="d-flex flex-column align-items-center text-center pt-3 pb-2 h-100 justify-content-between">
                <div>
                    <div class="rounded-circle d-flex align-items-center justify-content-center mb-3 mx-auto" 
                        style="width: 64px; height: 64px; background: ${iconBg}; color: ${iconColor}; font-size: 32px; box-shadow: inset 0 0 10px rgba(0,0,0,0.03);">
                        <i class="bi ${game.icon}"></i>
                    </div>
                    <div class="fw-bold text-dark lh-sm mb-2" style="font-size: 16px;">${game.name}</div>
                </div>
                <div class="d-flex align-items-center gap-1 text-muted" style="font-size: 13px;">
                    <i class="bi bi-people-fill"></i><span>${playerCount}</span>
                </div>
            </div>
        `;

        card.onclick = () => {
            window.selectedGameId = game.id;
            _refreshGameGrid(lobbyState);

            const modalEl = document.getElementById('gameSelectorModal');
            if (window.bootstrap) {
                const modal = window.bootstrap.Modal.getInstance(modalEl) || new window.bootstrap.Modal(modalEl);
                modal.hide();
            }
            renderLobby(lobbyState);
        };

        container.appendChild(card);
    });
}
