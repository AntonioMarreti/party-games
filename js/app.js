// === ГЛОБАЛЬНЫЙ ПЕРЕХВАТЧИК ОШИБОК ===
window.onerror = function (msg, url, line, col, error) {

    return false;
};

// === КОНФИГУРАЦИЯ ===
const API_URL = 'server/api.php';
let authToken = localStorage.getItem('pg_token') ? localStorage.getItem('pg_token').trim() : null;
let pollInterval = null;
let loadedGames = {};
let globalUser = null;

function calculateLevel(xp) {
    if (!xp || xp < 0) return 1;
    return Math.floor(Math.sqrt(xp / 100)) + 1;
}

let seenReactionIds = new Set();
let reactionTimeout = null;

// ВАЖНО: Флаг для блокировки "гонки запросов"
let isLeavingProcess = false;
let isCheckingState = false; // Блокировка повторных вызовов во время загрузки или запроса

// === НАСТРОЙКИ (SETTINGS) ===
const DEFAULT_SETTINGS = {
    noAnimations: false,
    haptics: true,
    notificationsEnabled: true
};
// Merge defaults with stored settings to ensure new keys exist
let storedSettings = JSON.parse(localStorage.getItem('pgb_settings')) || {};
let appSettings = { ...DEFAULT_SETTINGS, ...storedSettings };

function loadSettings() {
    applySettings();

    // Sync UI state
    const switches = ['noAnimations', 'haptics', 'simpleBg', 'largeFont', 'privacyLeaderboard', 'notificationsEnabled'];
    switches.forEach(key => {
        const el = document.getElementById('setting-' + key);
        if (el) el.checked = !!appSettings[key];
    });
}

function triggerHaptic(type = 'impact', detail = 'light') {
    if (!appSettings.haptics) return;
    try {
        const tg = window.Telegram.WebApp;
        if (!tg || !tg.HapticFeedback) return;

        if (type === 'impact') {
            tg.HapticFeedback.impactOccurred(detail);
        } else if (type === 'notification') {
            tg.HapticFeedback.notificationOccurred(detail);
        } else if (type === 'selection') {
            tg.HapticFeedback.selectionChanged();
        }
    } catch (e) {
        console.warn("Haptics error:", e);
    }
}

function toggleSetting(key, value) {
    appSettings[key] = value;
    localStorage.setItem('pgb_settings', JSON.stringify(appSettings));
    applySettings();
    triggerHaptic('impact', 'medium');

    // Server-side sync for privacy
    if (key === 'privacyLeaderboard') {
        // Invert value: "Show in Leaderboard" (true) -> is_hidden (0)
        apiRequest({
            action: 'update_settings',
            is_hidden_in_leaderboard: value ? 0 : 1
        }).catch(err => console.error("Privacy sync failed", err));
    }
}

function applySettings() {
    // Animations
    if (appSettings.noAnimations) {
        document.body.classList.add('no-animations');
    } else {
        document.body.classList.remove('no-animations');
    }

    // Simplified Background
    if (appSettings.simpleBg) {
        document.body.classList.add('simple-bg');
    } else {
        document.body.classList.remove('simple-bg');
    }

    // Large Font
    if (appSettings.largeFont) {
        document.body.classList.add('large-font');
    } else {
        document.body.classList.remove('large-font');
    }
}

function openSettingsScreen() {
    loadSettings();
    showScreen('settings');
    triggerHaptic('impact', 'medium');
}

function closeSettingsScreen() {
    showScreen('lobby');
    switchTab('profile');
    triggerHaptic('impact', 'light');
}

// === DEV LOGIN (TEMPORARY - REMOVE IN PRODUCTION) ===
async function devLogin(index = 1) {
    try {
        const formData = new FormData();
        formData.append('action', 'dev_login');
        formData.append('index', index);

        const response = await fetch(API_URL, { method: 'POST', body: formData });
        const data = await response.json();

        if (data.status === 'ok') {
            localStorage.setItem('pg_token', data.token);
            authToken = data.token;
            globalUser = data.user;
            showScreen('lobby');
            updateUserInfo(data.user);
            startPolling();
            showAlert('Успех', 'Вы вошли как ' + (data.user.custom_name || data.user.first_name), 'success');
        } else {
            showAlert('Ошибка', data.message, 'error');
        }
    } catch (e) {
        showAlert('Ошибка сети', e.message, 'error');
    }
}

const AVAILABLE_GAMES = [
    {
        id: 'bunker',
        name: 'Бункер',
        icon: 'bi-shield-shaded',
        color: '#E67E22',
        bgColor: '#FDF2E9',
        files: [
            'js/games/bunker/bunker.css',
            'js/games/bunker/ui.js',
            'js/games/bunker/handlers.js',
            'js/games/bunker/index.js'
        ]
    },
    {
        id: 'brainbattle',
        name: 'Мозговая Битва',
        icon: 'bi-lightbulb-fill',
        color: '#9B59B6',
        bgColor: '#F4ECF7',
        files: ['js/games/brainbattle.js']
    },
    {
        id: 'whoami',
        name: 'Кто из нас?',
        icon: 'bi-question-circle-fill',
        color: '#1ABC9C',
        bgColor: '#E8F8F5',
        files: ['js/games/whoami.js']
    },
    {
        id: 'blokus',
        name: 'Blokus',
        icon: 'bi-grid-3x3',
        color: '#3498db',
        bgColor: '#ebf5fb',
        files: ['js/games/blokus/engine.js', 'js/games/blokus/ui.js', 'js/games/blokus/handlers.js', 'js/games/blokus/bot.js', 'js/games/blokus.js']
    }
];

let selectedGameId = AVAILABLE_GAMES[0].id;

// === ИНИЦИАЛИЗАЦИЯ ===
document.addEventListener('DOMContentLoaded', () => {
    let tg;
    try {
        tg = window.Telegram.WebApp;
        tg.expand();
        if (tg.requestFullscreen) tg.requestFullscreen();
        if (tg.isVerticalSwipesEnabled !== undefined) tg.isVerticalSwipesEnabled = false;
        if (tg.setHeaderColor) tg.setHeaderColor('#2E1A5B');
        if (tg.setBackgroundColor) tg.setBackgroundColor('#F4F5F9');
        if (tg.enableClosingConfirmation) tg.enableClosingConfirmation();
        if (tg.ready) tg.ready(); // CRITICAL: Notify Telegram that app is initialized
    } catch (e) {
        console.warn("Telegram WebApp not found");
    }

    const hash = window.location.hash;
    if (hash.includes('auth_token=')) {
        authToken = hash.split('auth_token=')[1].trim();
        console.log("✅ Token captured from URL hash:", authToken);
        localStorage.setItem('pg_token', authToken);
        window.history.replaceState(null, null, window.location.pathname);
    }

    safeStyle('login-loading', 'display', 'none');

    // Загружаем настройки
    loadSettings();

    if (authToken) {
        initApp(tg);
    } else if (tg && tg.initData) {
        loginTMA(tg);
    } else {
        showScreen('login');
        safeStyle('browser-login-btn', 'display', 'block');
    }

    // Show logout button logic - STRICT CHECK
    const logoutGroup = document.getElementById('logout-menu-item-group');
    if (logoutGroup) {
        // If we have initData (Telegram), HIDE IT.
        if (tg && tg.initData && tg.initData.length > 0) {
            logoutGroup.style.display = 'none';
        } else {
            logoutGroup.style.display = 'block';
        }
    }

    // REMOVED TIMEOUT: Logic is now robust enough to guaranteed show a screen
});

async function initApp(tg) {
    let screenShown = false;
    try {
        const currentStartParam = tg?.initDataUnsafe?.start_param;
        console.log("Start Param:", currentStartParam);

        const res = await checkState();

        // 1. Auth/Network Error -> Login
        if (!res || res.status === 'error' || res.status === 'auth_error') {
            showScreen('login');
            safeStyle('browser-login-btn', 'display', 'block');
            screenShown = true;
            return;
        }

        // 2. Handle Start Params (Deep Links)
        let startParam = tg?.initDataUnsafe?.start_param;
        if (!startParam) {
            const urlParams = new URLSearchParams(window.location.search);
            startParam = urlParams.get('startapp');
        }

        if (startParam) {
            const code = startParam.startsWith('room_') ? startParam.replace('room_', '') : startParam;

            if (res && res.status === 'in_room' && res.room.room_code !== code) {
                // User is in Room A, but clicked link for Room B
                showConfirmation('Переход', `Перейти в комнату ${code}?`, async () => {
                    await leaveRoom();
                    await joinRoom(code);
                }, { confirmText: 'Перейти' });
            } else if (res.status !== 'in_room') {
                await joinRoom(code);
            }
        }

        // 3. Fallback: If we are not in a room (or deep link failed logic?), show lobby
        if (res && res.status === 'no_room') {
            showScreen('lobby');
            screenShown = true;
        }

    } catch (e) {
        console.error("Init App failed:", e);
        showScreen('login');
        safeStyle('browser-login-btn', 'display', 'block');
        screenShown = true;
    } finally {
        // ULTIMATE FAILSAFE: If after all logic, splash is still there (e.g. joinRoom failed silently), show Lobby
        const splash = document.getElementById('screen-splash');
        if (splash && splash.classList.contains('active-screen')) {
            console.warn("Init finished but Splash still active. Fallback to Lobby/Login.");
            if (localStorage.getItem('pg_token')) showScreen('lobby');
            else showScreen('login');
        }
    }
}

function logout() {
    showConfirmation('Выход', 'Вы уверены, что хотите выйти?', () => {
        localStorage.removeItem('pg_token');
        window.location.reload();
    }, { isDanger: true, confirmText: 'Выйти' });
}

window.apiRequest = async function (data) {
    let body;
    if (data instanceof FormData) {
        body = data;
        if (!body.has('token') && authToken) body.append('token', authToken);
    } else {
        body = new FormData();
        if (authToken) body.append('token', authToken);
        for (const key in data) {
            if (Array.isArray(data[key])) {
                data[key].forEach(val => body.append(`${key}[]`, val));
            } else {
                body.append(key, data[key]);
            }
        }
    }

    try {
        const response = await fetch(API_URL, { method: 'POST', body: body });
        if (!response.ok) throw new Error(`Server Error: ${response.status}`);
        return await response.json();
    } catch (e) {
        console.error("API Error:", e);
        if (data && data.action !== 'get_state') {
            // Only alert for non-polling actions, and avoid common cryptic pattern errors
            const msg = (e.message && e.message.includes("pattern")) ? "Communication Error (Invalid Format)" : e.message;
            showAlert("Ошибка сети/сервера", msg, 'error');
        }
        return { status: 'error' };
    }
}

async function loginTMA(tg) {
    const res = await apiRequest({ action: 'login_tma', initData: tg.initData });
    if (res.status === 'ok') {
        authToken = res.token;
        localStorage.setItem('pg_token', authToken);
        initApp(tg);
    } else {
        showAlert('Ошибка авторизации', res.message, 'error');
    }
}

// === ЛОГИКА ===

// Batching for reactions to prevent server spam
let reactionBuffer = { emoji: null, count: 0 };
let reactionThrottleTimer = null;
const lastSourceShowTime = new Map(); // Track when we last showed a user's nameplate

async function flushReactionBuffer() {
    if (!reactionBuffer.emoji || reactionBuffer.count === 0) return;
    const { emoji, count } = reactionBuffer;
    reactionBuffer = { emoji: null, count: 0 };
    reactionThrottleTimer = null;

    try {
        await apiRequest({
            action: 'send_reaction',
            type: 'emoji',
            payload: JSON.stringify({ emoji, count })
        });
    } catch (e) { console.error("Flush reactions failed", e); }
}

// === GLOBAL REACTION SYSTEM ===
window.handleReactions = function (events) {
    if (!events || !Array.isArray(events)) return;

    // NOTE: This usually runs in the context of the game.
    // If we are in the lobby, we might still want to show them? 
    // Yes, why not. But primarily for game screens.

    events.forEach(ev => {
        // Unique ID check. 
        const key = ev.created_at + '_' + ev.user_id + '_' + ev.type;
        if (seenReactionIds.has(key)) return;
        seenReactionIds.add(key);

        // Skip our own reactions (already shown locally and instantly)
        if (window.globalUser && ev.user_id == window.globalUser.id) return;

        const payload = JSON.parse(ev.payload || '{}');
        const emoji = payload.emoji || '👍';
        const count = payload.count || 1;

        // Find player info for attribution
        const players = window.currentGamePlayers || [];
        const player = players.find(p => p.id == ev.user_id);
        const name = player ? (player.custom_name || player.first_name) : 'Игрок';
        const avatar = player ? (player.photo_url || player.avatar_emoji) : '👤';

        // Rate limit the "Source Bubble" (nameplate) to avoid stacking during continuous bursts
        const sourceKey = ev.user_id + '_' + emoji;
        const lastTime = lastSourceShowTime.get(sourceKey) || 0;
        const now = Date.now();
        let showSource = false;

        if (now - lastTime > 3000) {
            showSource = true;
            lastSourceShowTime.set(sourceKey, now);
        }

        const effectiveProducer = showSource ? { name, avatar } : null;

        if (count > 1) {
            showFloatingEmojiBurst(emoji, count, effectiveProducer);
        } else {
            showFloatingEmoji(emoji, effectiveProducer);
        }
    });
}


window.showFloatingEmoji = function (emoji, producer = null, isBurstMember = false) {
    const el = document.createElement('div');
    el.className = 'floating-emoji' + (isBurstMember ? ' burst-member' : '');

    if (producer) {
        let avatarHtml = '';
        const isUrl = producer.avatar && (producer.avatar.startsWith('http') || producer.avatar.includes('/'));
        if (isUrl) {
            avatarHtml = `<img src="${producer.avatar}" class="reaction-avatar-img">`;
        } else {
            avatarHtml = producer.avatar || '👤';
        }

        el.innerHTML = `
            <div class="reaction-bubble">
                <span class="reaction-avatar">${avatarHtml}</span>
                <span class="reaction-name">${producer.name}</span>
                <span class="reaction-symbol">${emoji}</span>
            </div>
        `;
    } else {
        el.innerText = emoji;
    }

    const gameArea = document.getElementById('game-area');
    let centerX = window.innerWidth / 2;
    if (gameArea) {
        const rect = gameArea.getBoundingClientRect();
        if (rect.width > 0) centerX = rect.left + rect.width / 2;
    }

    const spread = isBurstMember ? Math.min(window.innerWidth * 0.45, 200) : Math.min(window.innerWidth * 0.35, 140);
    let posX = centerX + (Math.random() * spread * 2 - spread);

    const padding = 80;
    posX = Math.max(padding, Math.min(window.innerWidth - padding, posX));

    el.style.left = posX + 'px';
    el.style.bottom = '140px';
    el.style.bottom = '140px';
    if (!producer) {
        // Smaller size for burst particles
        const sizeBase = isBurstMember ? 24 : 34; // 24px vs 34px base
        el.style.fontSize = (Math.random() * (isBurstMember ? 8 : 10) + sizeBase) + 'px';
    }

    // Increased rotation for bursts
    const rotBase = isBurstMember ? 70 : 40;
    el.style.setProperty('--rotation', (Math.random() * rotBase - rotBase / 2) + 'deg');

    document.body.appendChild(el);

    // Standard duration 4s, bursts are faster (2.5s) to reduce clutter
    const duration = isBurstMember ? 2500 : 4000;
    setTimeout(() => el.remove(), duration);
}

window.showFloatingEmojiBurst = function (emoji, count, producer = null) {
    // 1. Show the main "Source" bubble with text and avatar
    showFloatingEmoji(emoji, producer);

    // 2. Show the "Particles" (naked emojis without text/avatar)
    const visualItems = Math.min(count, 12); // Slightly more particles since they are small
    for (let i = 0; i < visualItems; i++) {
        setTimeout(() => {
            // Pass null as producer so it renders just the emoji char
            showFloatingEmoji(emoji, null, true);
        }, i * 80); // Tighter timing for explosion effect
    }
}

window.sendReaction = async function (emoji, isLocalBurst = false) {
    if (window.triggerHaptic) triggerHaptic(isLocalBurst ? 'impactLight' : 'selection');

    // Show locally immediately (with attribution for consistency)
    const u = window.globalUser;
    const producer = u ? {
        name: u.custom_name || u.first_name || 'Вы',
        avatar: u.photo_url || u.avatar_emoji || '👤'
    } : null;

    if (isLocalBurst) {
        showFloatingEmoji(emoji, producer, true);
    } else {
        showFloatingEmoji(emoji, producer);
    }

    // Batching logic
    if (reactionBuffer.emoji !== emoji) {
        flushReactionBuffer();
        reactionBuffer.emoji = emoji;
        reactionBuffer.count = 0;
    }

    reactionBuffer.count++;

    if (!reactionThrottleTimer) {
        reactionThrottleTimer = setTimeout(flushReactionBuffer, 500);
    }
}

window.renderReactionToolbar = function () {
    const screen = document.getElementById('screen-game');
    if (!screen) return;

    let container = document.getElementById('reaction-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'reaction-container';
        container.className = 'reaction-floating-wrapper';

        // 1. Trigger Button
        const trigger = document.createElement('button');
        trigger.className = 'reaction-trigger';
        trigger.innerHTML = '😊';
        trigger.onclick = (e) => {
            e.stopPropagation();
            container.classList.toggle('expanded');
        };

        // 2. Emoji Palette
        const palette = document.createElement('div');
        palette.className = 'reaction-palette';

        // Palette: Approval, Fun, Wow, Shock, Thinking, Waiting/Hurry
        const emojis = ['👍', '😂', '🔥', '😱', '🤔', '⏳'];
        emojis.forEach(e => {
            const btn = document.createElement('button');
            btn.className = 'reaction-palette-btn';

            let pressTimer = null;
            let pressInterval = null;
            let isHolding = false;

            const startPress = (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                isHolding = false;

                pressTimer = setTimeout(() => {
                    isHolding = true;
                    pressInterval = setInterval(() => {
                        sendReaction(e, true);
                        btn.style.transform = `scale(${1.2 + Math.random() * 0.1})`;
                    }, 150);
                }, 350);
            };

            const endPress = (ev) => {
                ev.preventDefault();
                ev.stopPropagation();

                if (pressTimer) {
                    clearTimeout(pressTimer);
                    pressTimer = null;
                }
                if (pressInterval) {
                    clearInterval(pressInterval);
                    pressInterval = null;
                    btn.style.transform = '';
                    container.classList.remove('expanded');
                } else if (!isHolding) {
                    // Just a regular tap
                    sendReaction(e);
                    container.classList.remove('expanded');
                }
            };

            btn.addEventListener('mousedown', startPress);
            btn.addEventListener('touchstart', startPress, { passive: false });

            btn.addEventListener('mouseup', endPress);
            btn.addEventListener('touchend', endPress, { passive: false });
            btn.addEventListener('mouseleave', endPress);

            btn.innerText = e;
            palette.appendChild(btn);
        });

        // 3. Drag Logic (Vertical Only for edge reachability)
        let isDragging = false;
        let startY, startBottom;

        const onStart = (e) => {
            isDragging = true;
            startY = e.touches ? e.touches[0].clientY : e.clientY;
            startBottom = parseInt(getComputedStyle(container).bottom);
            container.classList.add('dragging');
        };

        const onMove = (e) => {
            if (!isDragging) return;
            const currentY = e.touches ? e.touches[0].clientY : e.clientY;
            const deltaY = startY - currentY; // Moving up reduces Y, so deltaY is positive
            let newBottom = startBottom + deltaY;

            // Constrain
            const threshold = 80;
            const max = window.innerHeight - 150;
            newBottom = Math.max(threshold, Math.min(max, newBottom));

            container.style.bottom = newBottom + 'px';
        };

        const onEnd = () => {
            if (isDragging) {
                isDragging = false;
                container.classList.remove('dragging');
                // Save position
                localStorage.setItem('reaction_pos_bottom', container.style.bottom);
            }
        };

        trigger.addEventListener('touchstart', onStart, { passive: true });
        window.addEventListener('touchmove', onMove, { passive: false });
        window.addEventListener('touchend', onEnd);

        trigger.addEventListener('mousedown', onStart);
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onEnd);

        container.appendChild(palette);
        container.appendChild(trigger);
        screen.appendChild(container);

        // Restore position
        const savedPos = localStorage.getItem('reaction_pos_bottom');
        if (savedPos) container.style.bottom = savedPos;

        // Close on outside click
        document.addEventListener('click', () => {
            container.classList.remove('expanded');
        });
    }

    container.style.display = 'block';
}

window.hideReactionToolbar = function () {
    const container = document.getElementById('reaction-container');
    if (container) {
        container.style.display = 'none';
        container.classList.remove('expanded');
    }
}


// UPDATE CREATE ROOM
// UPDATE CREATE ROOM
// Generic Confirmation Modal Helper
window.showConfirmation = function (title, text, onConfirm, options = {}) {
    const modalEl = document.getElementById('confirmationModal');
    if (!modalEl) return;

    document.getElementById('confirm-modal-title').innerText = title;
    document.getElementById('confirm-modal-text').innerText = text;
    const yesBtn = document.getElementById('confirm-modal-yes-btn');

    // Dynamic Button Text & Style
    yesBtn.innerText = options.confirmText || 'Подтвердить';
    yesBtn.className = `btn rounded-pill py-3 fw-bold shadow-sm ${options.isDanger ? 'btn-danger' : 'btn-primary'}`;

    // Remove old listeners to prevent stacking
    const newBtn = yesBtn.cloneNode(true);
    yesBtn.parentNode.replaceChild(newBtn, yesBtn);

    newBtn.onclick = () => {
        const modal = bootstrap.Modal.getInstance(modalEl);
        if (modal) modal.hide();
        if (typeof onConfirm === 'function') onConfirm();
    };

    const modal = new bootstrap.Modal(modalEl);
    modal.show();
}

/**
 * Generic Alert Modal Helper
 * @param {string} title 
 * @param {string} text 
 * @param {string} type - 'success', 'error', 'info', 'warning'
 */
window.showAlert = function (title, text, type = 'info') {
    const modalEl = document.getElementById('alertModal');
    if (!modalEl) return;

    // Use Custom Alert Modal if present (for HTML support)
    const customModalEl = document.getElementById('customAlertModal');
    if (customModalEl) {
        document.getElementById('customAPITitle').innerHTML = title; // Allow HTML in title? Why not.
        document.getElementById('customAPIBody').innerHTML = text;
        const modal = new bootstrap.Modal(customModalEl);
        modal.show();
        return;
    }

    document.getElementById('alert-modal-title').innerText = title;
    document.getElementById('alert-modal-text').innerHTML = text; // Allow HTML

    // Define icons and colors by type
    const icons = {
        success: { icon: 'bi-check-circle-fill', color: 'text-success' },
        error: { icon: 'bi-x-circle-fill', color: 'text-danger' },
        warning: { icon: 'bi-exclamation-triangle-fill', color: 'text-warning' },
        info: { icon: 'bi-info-circle-fill', color: 'text-primary' }
    };

    const theme = icons[type] || icons.info;
    const iconContainer = document.getElementById('alert-modal-icon-container');
    if (iconContainer) {
        iconContainer.innerHTML = `<i class="bi ${theme.icon} ${theme.color}" style="font-size: 3rem;"></i>`;
    }

    const modal = new bootstrap.Modal(modalEl);
    modal.show();
}

async function createRoom() {
    const passInput = document.getElementById('create-room-pass');
    const titleInput = document.getElementById('create-room-title');

    // Check if element exists before accessing checked. If not (old modal?), default false.
    const publicCheckbox = document.getElementById('create-room-public');
    const isPublic = publicCheckbox ? publicCheckbox.checked : false;

    const roomTitle = (titleInput && titleInput.value.trim()) ? titleInput.value.trim() : 'Party Game';

    const res = await apiRequest({ action: 'create_room', password: passInput ? passInput.value : '' });
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
            await apiRequest({
                action: 'make_room_public',
                title: roomTitle,
                description: 'Все сюда!',
                visibility: 'public'
            });
        }
        checkState();
    }
}

async function joinRoom(code = null) {
    if (!code) {
        const input = document.getElementById('join-room-code');
        code = input ? input.value : '';
    }
    if (!code) return showAlert("Внимание", "Введите код", 'warning');
    const passInput = document.getElementById('join-room-pass');
    const res = await apiRequest({ action: 'join_room', room_code: code, password: passInput ? passInput.value : '' });
    if (res.status === 'ok') checkState();
    else showAlert("Ошибка", res.message, 'error');
}

// === ИСПРАВЛЕННАЯ ФУНКЦИЯ ВЫХОДА ===
// js/app.js

window.leaveRoom = function () {
    const amIHost = window.isHost;
    const title = 'Выход из комнаты';
    const text = amIHost ? 'Вы Хост. Если вы выйдете, комната будет закрыта для всех. Продолжить?' : 'Вы уверены, что хотите покинуть комнату?';

    showConfirmation(title, text, async () => {
        // 2. ВКЛЮЧАЕМ БЛОКИРОВКУ
        isLeavingProcess = true;
        stopPolling();

        try {
            // 3. Если я Хост — сначала «гасим» игру для всех (game_type = lobby)
            if (amIHost) {
                await apiRequest({ action: 'stop_game' });
            }

            // 4. И Хост, и Гость ОБЯЗАТЕЛЬНО должны вызвать leave_room, 
            // чтобы сервер удалил их из таблицы room_players
            const res = await apiRequest({ action: 'leave_room' });

            if (res.status === 'ok') {
                // 5. Чистим локальные данные
                window.currentRoomCode = null;
                window.isHost = false;

                const gameArea = document.getElementById('game-area');
                if (gameArea) gameArea.innerHTML = '';

                // 6. ВЫКЛЮЧАЕМ БЛОКИРОВКУ
                isLeavingProcess = false;

                // 7. Обновляем состояние — теперь сервер скажет 'no_room' 
                // и checkState сам покажет главный экран (lobby)
                await checkState();
            } else {
                isLeavingProcess = false;
                startPolling(); // Возвращаем поллинг, если сервер выдал ошибку
                showAlert('Ошибка', res.message || "Ошибка выхода", 'error');
            }
        } catch (e) {
            isLeavingProcess = false;
            startPolling();
            console.error("Критическая ошибка при выходе:", e);
        }
    });
};

// === STATE ===
window.checkState = async function () {
    if (isLeavingProcess || isCheckingState) return;
    isCheckingState = true;

    try {
        const res = await apiRequest({ action: 'get_state' });

        if (isLeavingProcess) return;

        if (res.status === 'auth_error') {
            localStorage.removeItem('pg_token');
            showScreen('login');
            safeStyle('browser-login-btn', 'display', 'block');
            return res;
        }

        // Notifications processed elsewhere or pass to custom handler
        if (res.notifications && res.notifications.length > 0) {
            // Handle notifications if needed
        }

        if (res.players) {
            window.currentGamePlayers = res.players;
        }

        // Handle Reactions
        if (res.events && res.events.length > 0) {
            handleReactions(res.events);
        }

        if (res.user) {
            updateUserInfo(res.user);
        }

        if (res.status === 'in_room') {
            startPolling();

            // КРИТИЧЕСКИ ВАЖНО: сохраняем роль и код комнаты
            window.currentRoomCode = res.room.room_code;
            window.currentRoomId = res.room.id; // Fix: Save ID for invites
            window.isHost = (res.is_host == 1);

            const gameType = res.room.game_type;

            if (gameType === 'lobby') {
                // Показываем экран ожидания (комнату)
                if (!isScreenActive('room')) showScreen('room');
                renderLobby(res);
            } else {
                // Показываем экран самой игры
                if (!loadedGames[gameType]) {
                    const gameConfig = AVAILABLE_GAMES.find(g => g.id === gameType);
                    const filesToLoad = (gameConfig && gameConfig.files) ? gameConfig.files : [`js/games/${gameType}.js`];
                    await loadGameScripts(filesToLoad);
                    loadedGames[gameType] = true;
                }

                // Wait for renderer to be available (failsafe)
                let attempts = 0;
                while (!window[`render_${gameType}`] && attempts < 10) {
                    await new Promise(r => setTimeout(r, 50));
                    attempts++;
                }

                const renderFunc = window[`render_${gameType}`];
                console.log(`[App] Trying to render ${gameType}, func exists?`, !!renderFunc);
                if (typeof renderFunc === 'function') {
                    if (!isScreenActive('game')) showScreen('game');
                    try {
                        renderFunc(res);
                    } catch (e) {
                        console.error('Game Render Error:', e);
                        const gameArea = document.getElementById('game-area');
                        if (gameArea) gameArea.innerHTML = `<div class="p-5 text-center"><h3 class="mb-3 text-danger">Ошибка отображения</h3><p class="text-muted mb-4">${e.message}</p><button class="btn btn-outline-danger" onclick="leaveRoom()">Выйти</button></div>`;
                    }
                } else {
                    console.warn(`Renderer render_${gameType} not found`);
                    const gameArea = document.getElementById('game-area');
                    if (gameArea) gameArea.innerHTML = `<div class="p-5 text-center"><div class="spinner-border text-primary mb-3"></div><p>Загрузка игры...</p><button class="btn btn-sm btn-link text-muted mt-3" onclick="leaveRoom()">Отмена (Выйти)</button></div>`;
                }
            }

            // Update Notification Badge
            const notifsCount = res.notifications ? res.notifications.length : 0;
            updateNotificationBadge(notifsCount);


        } else {
            // Если мы не в комнате — останавливаем опрос и идем на Главный экран
            stopPolling();
            window.currentRoomCode = null;
            window.isHost = false;
            showScreen('lobby');
        }
        return res;
    } finally {
        isCheckingState = false;
    }
}

function updateNotificationBadge(count) {
    const badgeIds = ['profile-notification-badge', 'nav-profile-badge'];
    badgeIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            if (count > 0) {
                el.style.display = 'flex';
                el.innerText = count > 9 ? '9+' : count;
            } else {
                el.style.display = 'none';
            }
        }
    });
}

// === RENDER LOBBY ===
function renderLobby(res) {
    safeStyle('score-card', 'display', 'block');

    const codeDisplay = document.getElementById('room-code-display');
    if (codeDisplay) codeDisplay.innerText = res.room.room_code;

    renderPlayerList(res.players, 'players-list');

    const hostControls = document.getElementById('host-controls');
    const guestMsg = document.getElementById('guest-waiting-msg');

    if (res.is_host == 1) {
        if (hostControls) hostControls.style.display = 'block';
        if (guestMsg) guestMsg.style.display = 'none';

        const gameNameDisplay = document.getElementById('selected-game-name');
        const currentGame = AVAILABLE_GAMES.find(g => g.id === selectedGameId);
        if (gameNameDisplay) gameNameDisplay.innerText = currentGame ? currentGame.name : 'Выбрать игру';

        const list = document.getElementById('game-selector-list');
        if (list) {
            list.innerHTML = '';
            AVAILABLE_GAMES.forEach(game => {
                const btn = document.createElement('button');
                btn.className = 'game-option-btn';

                const bgColor = game.bgColor || '#F8F9FA';
                const iconColor = game.color || '#6c757d';
                const iconClass = game.icon || 'bi-controller';

                const checkMark = game.id === selectedGameId
                    ? '<i class="bi bi-check-circle-fill text-success fs-4"></i>'
                    : '<i class="bi bi-chevron-right text-muted"></i>';

                btn.innerHTML = `
                    <div class="d-flex align-items-center">
                        <div class="game-option-icon" style="background: ${bgColor}; color: ${iconColor}">
                            <i class="bi ${iconClass}"></i>
                        </div>
                        <div class="text-start">
                            <div class="fw-bold text-dark" style="font-size: 16px;">${game.name}</div>
                        </div>
                    </div>
                    ${checkMark}
                `;

                btn.onclick = () => {
                    selectedGameId = game.id;
                    const modalEl = document.getElementById('gameSelectorModal');
                    const modal = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
                    modal.hide();
                    renderLobby(res);
                };
                list.appendChild(btn);
            });
        }

        const startBtn = document.getElementById('btn-start-game');
        if (startBtn) startBtn.onclick = () => startGame(selectedGameId);

    } else {
        if (hostControls) hostControls.style.display = 'none';
        if (guestMsg) guestMsg.style.display = 'block';
    }
}

// === QR CODE MODAL ===
function openQrModal() {
    const titleEl = document.getElementById('modal-room-code-title');
    const textEl = document.getElementById('modal-room-code-text');
    const qrContainer = document.getElementById('modal-qr-code');

    if (!titleEl || !textEl || !qrContainer) return;

    titleEl.innerText = window.currentRoomCode;
    textEl.innerText = window.currentRoomCode;
    qrContainer.innerHTML = '';

    const inviteLink = "https://t.me/mpartygamebot/app?startapp=" + window.currentRoomCode;

    new QRCode(qrContainer, {
        text: inviteLink,
        width: 180,
        height: 180,
        colorDark: "#2E1A5B",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.H
    });



    const modal = new bootstrap.Modal(document.getElementById('qrInviteModal'));
    modal.show();
}

function copyInviteLink() {
    const inviteLink = "https://t.me/mpartygamebot/app?startapp=" + window.currentRoomCode;
    navigator.clipboard.writeText(inviteLink).then(() => {
        const btn = document.querySelector('#qrInviteModal .btn-primary');
        if (btn) {
            const originalText = btn.innerText;
            btn.innerText = "Copied! ✅";
            btn.style.backgroundColor = "#28a745";
            setTimeout(() => {
                btn.innerText = originalText;
                btn.style.backgroundColor = "";
            }, 2000);
        }
    });
}

// === UI HELPERS ===
// Global cache to prevent flickering
let lastPlayersJson = '';

function renderPlayerList(players, containerId) {
    // 1. Simple caching to stop re-rendering if data hasn't changed
    // We include selectedGameId because rendering logic depends on it (Bot button)
    const currentJson = JSON.stringify(players) + selectedGameId;
    if (currentJson === lastPlayersJson) return;
    lastPlayersJson = currentJson;

    const list = document.getElementById(containerId);
    if (!list) return;
    list.innerHTML = '';

    const countEl = document.getElementById('players-count');
    if (countEl) countEl.innerText = players.length;

    // Берем флаг хоста из глобального состояния приложения
    const amIHost = window.isHost;
    const isBlokus = selectedGameId === 'blokus';
    const MAX_SLOTS = isBlokus ? 4 : players.length;
    // For other games, we just show list. For Blokus, we want fixed 4 slots visual if host?
    // Actually, let's just append "Add Bot" button if slots < 4 and is Blokus.

    // Render Actual Players
    players.forEach(p => {
        const div = document.createElement('div');
        div.className = 'player-grid-item';

        const avatarHtml = renderAvatar(p, 'md');

        // Fix Host Icon: Use a wrapper div for the styling, put the icon inside
        const crown = p.is_host == 1 ?
            `<div class="host-crown"><i class="bi bi-crown-fill"></i></div>` : '';

        // Bot Difficulty Badge
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

        // Клик для кика (только если я хост и кликаю не по себе)
        if (amIHost && p.is_host != 1) {
            div.style.cursor = 'pointer';
            if (p.is_bot == 1) {
                div.onclick = () => removeBot(p.id);
            } else {
                div.onclick = () => kickPlayer(p.id, p.first_name);
            }
        }

        list.appendChild(div);
    });

    // Render Empty Slots / Add Bot Button (Only for Blokus & Host & < 4 players)
    if (isBlokus && amIHost && players.length < 4) {
        const div = document.createElement('div');
        div.className = 'player-grid-item'; // Base layout class

        div.innerHTML = `
            <div class="add-bot-avatar">
                <i class="bi bi-plus-lg"></i>
            </div>
            <div class="player-name text-muted mt-2" style="font-size: 11px;">Добавить<br>бота</div>
        `;
        div.onclick = () => showAddBotModal();
        list.appendChild(div);
    }
}

const EMOJI_OPTIONS = ['😎', '👻', '🤖', '🐱', '💀', '👽', '🦊', '🐯', '🤴', '🥷', '🦁', '🦄', '🐼', '🐵', '🐸'];
const COLOR_OPTIONS = [
    'linear-gradient(135deg, #FF9A9E 0%, #FECFEF 100%)',
    'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)',
    'linear-gradient(135deg, #84fab0 0%, #8fd3f4 100%)',
    'linear-gradient(135deg, #fccb90 0%, #d57eeb 100%)',
    'linear-gradient(135deg, #e0c3fc 0%, #8ec5fc 100%)',
    'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
    'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
    'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
];

let pendingAvatar = null; // {type: 'emoji', value: '😎', bg: '...'} or null

function renderAvatar(user, size = 'md') {
    // Check for custom avatar
    if (user.custom_avatar) {
        try {
            const config = JSON.parse(user.custom_avatar);
            if (config.type === 'emoji') {
                return `<div class="avatar-${size}" style="background: ${config.bg || '#eee'}">${config.value}</div>`;
            } else if (config.type === 'image') {
                return `<div class="avatar-${size}" style="background-image: url('${config.src}')"></div>`;
            }
        } catch (e) { }
    }

    // Bot Default Avatar
    if (user.is_bot == 1 && (!user.photo_url || user.photo_url === '🤖')) {
        return `<div class="avatar-${size}" style="background: #e0f7fa; display: flex; align-items: center; justify-content: center; font-size: ${size === 'lg' ? '24px' : '18px'};">🤖</div>`;
    }

    // Fallback to Photo URL or UI Avatars
    const src = user.photo_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.first_name || 'U')}&background=random`;
    return `<div class="avatar-${size}" style="background-image: url('${src}')"></div>`;
}

/**
 * Renders achievement list with premium styling and Bootstrap icons
 * @param {Array} achievements 
 * @returns {string} HTML
 */
function renderAchievements(achievements) {
    if (!achievements || achievements.length === 0) {
        return '<div class="text-muted small w-100 py-4 text-center">Пока нет достижений 🕸️</div>';
    }

    const iconMap = {
        'first_game': 'bi-controller',
        'first_win': 'bi-trophy-fill',
        'social_butterfly': 'bi-people-fill',
        'pacifist': 'bi-peace',
        'flash': 'bi-lightning-charge-fill',
        'brute': 'bi-hammer',
        'veteran': 'bi-award-fill',
        'champion': 'bi-star-fill'
    };

    return `
        <div class="achievement-list">
            ${achievements.map(a => `
                <div class="achievement-card">
                    <div class="achievement-icon-container">
                        <i class="bi ${iconMap[a.code] || 'bi-trophy'}"></i>
                    </div>
                    <div class="achievement-info">
                        <div class="achievement-name">${a.name.replace(/[^\x00-\x7F]/g, "").trim() || a.name}</div>
                        <div class="achievement-desc">${a.description}</div>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

function openProfileEditor() {
    const user = globalUser || { first_name: 'Guest' };

    // Set name
    document.getElementById('profile-name-input').value = user.custom_name || user.first_name;

    // Show Edit Screen (showScreen handles animations and nav visibility)
    showScreen('profile-edit');

    // Set emoji input if exists
    const emojiInput = document.getElementById('emoji-input');
    if (emojiInput) {
        // If user has emoji avatar, prefill
        if (user.custom_avatar) {
            try {
                const cfg = JSON.parse(user.custom_avatar);
                if (cfg.type === 'emoji') emojiInput.value = cfg.value;
            } catch (e) { }
        }
        // Live preview on input
        emojiInput.oninput = () => {
            const val = emojiInput.value.trim();
            if (val) {
                pendingAvatar = { type: 'emoji', value: val, bg: pendingAvatar?.bg || COLOR_OPTIONS[0] };
                updatePreview();
            }
        };
    }

    // Render Color Grid
    const colorGrid = document.getElementById('color-grid');
    colorGrid.innerHTML = '';
    COLOR_OPTIONS.forEach(bg => {
        const el = document.createElement('div');
        el.className = 'color-option';
        el.style.background = bg;
        el.onclick = () => selectColor(bg, el);
        colorGrid.appendChild(el);
    });

    // Reset pending
    pendingAvatar = user.custom_avatar ? JSON.parse(user.custom_avatar) : null;
    updatePreview();
}

function handleAvatarUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Resize image to avoid huge payloads (Max 300x300)
    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const MAX_SIZE = 300;
            let width = img.width;
            let height = img.height;

            if (width > height) {
                if (width > MAX_SIZE) {
                    height *= MAX_SIZE / width;
                    width = MAX_SIZE;
                }
            } else {
                if (height > MAX_SIZE) {
                    width *= MAX_SIZE / height;
                    height = MAX_SIZE;
                }
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            canvas.toBlob((blob) => {
                // Keep base64 for preview, but store blob for upload
                const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
                pendingAvatar = { type: 'image', src: dataUrl, blob: blob };
                updatePreview();
            }, 'image/jpeg', 0.8);
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function closeProfileEditor() {
    showScreen('lobby');
    switchTab('profile');
}

function selectEmoji(emoji, el) {
    document.querySelectorAll('.emoji-option').forEach(e => e.classList.remove('selected'));
    el.classList.add('selected');

    if (!pendingAvatar) pendingAvatar = { type: 'emoji', value: emoji, bg: COLOR_OPTIONS[0] };
    else pendingAvatar.value = emoji;

    updatePreview();
}

function selectColor(bg, el) {
    document.querySelectorAll('.color-option').forEach(e => e.classList.remove('selected'));
    el.classList.add('selected');

    if (!pendingAvatar) pendingAvatar = { type: 'emoji', value: EMOJI_OPTIONS[0], bg: bg };
    else pendingAvatar.bg = bg;

    updatePreview();
}

function updatePreview() {
    const preview = document.getElementById('avatar-preview-area');
    if (!pendingAvatar) {
        // Show current
        const user = globalUser || { first_name: 'Guest' };
        preview.innerHTML = renderAvatar(user, 'xl');
    } else if (pendingAvatar.type === 'emoji') {
        preview.innerHTML = `<div class="avatar-xl" style="background: ${pendingAvatar.bg}">${pendingAvatar.value}</div>`;
    } else if (pendingAvatar.type === 'image') {
        preview.innerHTML = `<div class="avatar-xl" style="background-image: url('${pendingAvatar.src}')"></div>`;
    }
}

async function saveProfile() {
    const nameInput = document.getElementById('profile-name-input');
    const name = nameInput.value;

    const formData = new FormData();
    formData.append('action', 'update_profile');
    formData.append('token', authToken);
    formData.append('name', name);
    if (pendingAvatar) {
        // If it's an image with a blob, send as file
        if (pendingAvatar.type === 'image' && pendingAvatar.blob) {
            formData.append('avatar_image', pendingAvatar.blob, 'avatar.jpg');
            // We send a config placeholder, the server will replace src with base64
            formData.append('avatar_config', JSON.stringify({ type: 'image', src: 'placeholder' }));
        } else {
            formData.append('avatar_config', JSON.stringify(pendingAvatar));
        }
    } else {
        // If we want to support "resetting" to photo, we might send empty or specific flag.
        // For now, if pendingAvatar is null, we assume no change to avatar unless user explicitly clicked "Reset".
    }

    await apiRequest(formData);
    location.reload();
}

// Helper to get background style for avatar
function getAvatarStyle(user) {
    if (user.photo_url && user.photo_url !== '🤖') {
        return `background-image: url('${user.photo_url}')`;
    } else if (user.custom_avatar) {
        // If it's a file path
        if (user.custom_avatar.startsWith('avatars/')) {
            return `background-image: url('server/${user.custom_avatar}')`;
        }
    }
    // Fallback emoji/color
    // Ideally we render emoji, but for background-image style we can't easily.
    // So for "style='...'" usage, we might need to handle emoji differently or use background-color.
    // Let's assume for now we use colored box. 
    return 'background-color: #bdc3c7; display: flex; align-items: center; justify-content: center;';
}

let cachedUserStats = null; // Store for modal

async function loadMyProfileStats() {
    // We need achievements count, so we must fetch full stats
    const res = await apiRequest({ action: 'get_stats', user_id: globalUser.id });
    if (res.status === 'ok') {
        const stats = res.stats || {};
        cachedUserStats = stats;

        // Update Main View Counts
        safeText('profile-stat-wins', stats.total_wins || 0);
        safeText('profile-stat-xp', (stats.total_points_earned || 0));
        safeText('profile-stat-achievements', (stats.achievements || []).length);

        // Ensure Level is sync
        const xp = stats.total_points_earned || 0;
        const lvl = calculateLevel(xp);
        safeText('profile-level-badge', lvl);
        safeText('profile-xp-text', xp + ' XP');
    }
}

function updateUserInfo(user) {
    globalUser = user;
    console.log("Updating User Info:", user);

    // Header Name
    safeText('user-name-display', user.custom_name || user.first_name);

    // Header Avatar
    const headAv = document.getElementById('lobby-user-avatar');
    if (headAv) headAv.innerHTML = renderAvatar(user, 'sm');

    // === PROFILE TAB UPDATES ===
    safeText('profile-name-big', user.custom_name || user.first_name);

    // Avatar Big uses new style
    const bigAv = document.getElementById('profile-avatar-big');
    if (bigAv) {
        // We set background instead of innerHTML for the new design
        // Preserve the badge inside
        const badge = bigAv.querySelector('#profile-level-badge');
        const badgeHTML = badge ? badge.outerHTML : '';

        bigAv.style.cssText = getAvatarStyle(user);

        // If no image, show emoji inside?
        if (!user.photo_url && (!user.custom_avatar || !user.custom_avatar.startsWith('avatars/'))) {
            // It's emoji
            bigAv.innerHTML = `<span style="font-size: 32px;">${user.custom_avatar || '😎'}</span>` + badgeHTML;
            bigAv.style.backgroundColor = user.custom_color || '#eee';
            bigAv.style.display = 'flex';
            bigAv.style.alignItems = 'center';
            bigAv.style.justifyContent = 'center';
        } else {
            bigAv.innerHTML = badgeHTML;
        }
    }

    // Trigger async fetch for accurate stats (Achievements count etc)
    loadMyProfileStats();

    // Update inputs in modal
    const nameInput = document.getElementById('profile-name-input');
    if (nameInput) nameInput.value = user.custom_name || user.first_name;
}

function openDetailedStatsModal() {
    console.log("Opening Detailed Stats Modal...");
    if (!cachedUserStats) {
        console.log("No cached stats, fetching...");
        showToast("Загрузка статистики...", "info");
        loadMyProfileStats().then(() => {
            /* force open after load, assuming success */
            if (cachedUserStats) showModal('modal-detailed-stats');
        });
        return;
    }

    // Safety check just in case
    triggerHaptic('impact', 'light');

    const s = cachedUserStats || {};
    const games = s.total_games_played || 0;
    const wins = s.total_wins || 0;
    const winrate = games > 0 ? Math.round((wins / games) * 100) : 0;
    const xp = s.total_points_earned || 0;

    // XP & Level Math
    const level = calculateLevel(xp);
    const prevThreshold = Math.pow(level - 1, 2) * 100;
    const nextThreshold = Math.pow(level, 2) * 100;
    const progressXP = xp - prevThreshold;
    const neededXP = nextThreshold - prevThreshold;
    const progressPct = Math.min(100, Math.max(0, (progressXP / neededXP) * 100));

    safeText('detail-total-games', games);
    safeText('detail-winrate', winrate + '%');
    safeText('detail-level-val', level);
    safeText('detail-xp-range', `${xp} / ${nextThreshold} XP`);

    const progBar = document.getElementById('detail-xp-progress');
    if (progBar) progBar.style.width = progressPct + '%';

    const achContainer = document.getElementById('detail-achievements-list');
    if (achContainer) {
        achContainer.innerHTML = renderAchievements(s.achievements);
    }

    showModal('modal-detailed-stats');
}

async function fetchUserStats() {
    const res = await apiRequest({ action: 'get_stats' });
    if (res.status === 'ok') {
        safeText('profile-stat-wins', res.stats.total_wins);
        safeText('profile-stat-games', res.stats.total_games_played);
        safeText('profile-stat-rating', res.stats.rating);

        // Render Achievements
        const container = document.getElementById('profile-achievements-container');
        if (container) {
            container.innerHTML = renderAchievements(res.stats.achievements);
        }
    }
}

function safeText(id, text) {
    const el = document.getElementById(id);
    if (el) el.innerText = text;
}


function switchTab(tabId) {
    triggerHaptic('selection');

    // Update Bottom Nav Active State
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    // Try to find by onclick attribute or manually map
    const navBtn = document.querySelector(`.nav-item[onclick="switchTab('${tabId}')"]`);
    if (navBtn) navBtn.classList.add('active');

    // Handle Screens vs Tabs
    if (tabId === 'leaderboard') {
        showScreen('leaderboard');
        loadLeaderboardList('global');
        // Hack: Make sure bottom nav remains visible
        document.querySelector('.bottom-nav').style.display = 'flex';
        return;
    } else if (tabId === 'profile') {
        // Assuming profile is also a screen (User mentioned "Profile Edit", but main profile might be a tab?)
        // Wait, standard profile click usually opens modal or separate logic. 
        // Let's stick to existing logic if profile is special.
        // Checking existing code: <button ... onclick="switchTab('profile')">
        // If profile was a tab in Lobby, proceed. If it's a screen, showScreen.
        // Looking at HTML: Profile is NOT in Lobby tabs list (Home/Games/Leaderboard).
        // It's likely a modal or screen.
        // Let's assume standard behavior for now.
    }

    // Default: It's a Lobby Tab (Home, Games)
    showScreen('lobby');
    document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');

    const targetTab = document.getElementById('tab-' + tabId);
    if (targetTab) {
        targetTab.style.display = 'block';
    } else {
        // Fallback for profile if it was treated as a tab before
        if (tabId === 'profile') {
            // Open Profile Modal or Screen? 
            // Original code: <button ... onclick="switchTab('profile')">
            // Previously it might have been a tab. 
            // Let's check if #tab-profile exists. It does NOT in the snippets I saw.
            // It probably opens #userProfileModal.
            const modal = new bootstrap.Modal(document.getElementById('userProfileModal'));
            modal.show();
            return;
        }
    }

    if (tabId === 'games') renderLibrary();
}

function renderLibrary() {
    const list = document.getElementById('library-list');
    if (!list) return;
    list.innerHTML = '';

    AVAILABLE_GAMES.forEach(game => {
        const card = document.createElement('div');
        // Changed to cleaner list item style
        card.className = 'game-list-card d-flex align-items-center mb-2 p-3 bg-white shadow-sm';
        card.style.borderRadius = '20px';

        card.innerHTML = `
            <div class="rounded-3 d-flex align-items-center justify-content-center text-white me-3" 
                 style="width: 50px; height: 50px; background: ${game.color || '#2E1A5B'}; font-size: 24px;">
                <i class="bi ${game.icon || 'bi-controller'}"></i>
            </div>
            <div class="flex-grow-1">
                <h6 class="mb-0 fw-bold text-dark">${game.name}</h6>
                <div class="text-muted small">Мин. 2 игрока</div>
            </div>
            <button class="btn btn-sm btn-light rounded-pill px-3 fw-bold text-primary" 
                    onclick="switchTab('home'); showScreen('lobby'); document.querySelector('[data-bs-target=\\'#createModal\\']').click();">
                Играть
            </button>
        `;
        list.appendChild(card);
    });
}

function isScreenActive(id) {
    const el = document.getElementById('screen-' + id);
    return el && el.classList.contains('active-screen');
}

function showScreen(id) {
    triggerHaptic('impact', 'light');
    // Прячем все экраны
    document.querySelectorAll('.screen').forEach(el => el.classList.remove('active-screen'));

    // Explicitly hide splash if it exists (fix for persisting splash)
    const splash = document.getElementById('screen-splash');
    if (splash) {
        splash.classList.remove('active-screen');
        splash.style.setProperty('display', 'none', 'important');
    }

    // Включаем нужный
    const target = document.getElementById('screen-' + id);
    if (target) target.classList.add('active-screen');

    // Показываем нижнюю навигацию ТОЛЬКО в лобби и лидерборде
    const nav = document.querySelector('.bottom-nav');
    if (nav) {
        const shouldShow = (id === 'lobby' || id === 'leaderboard');
        nav.style.setProperty('display', shouldShow ? 'flex' : 'none', 'important');
    }

    if (id === 'game') {
        if (typeof renderReactionToolbar === 'function') renderReactionToolbar();
    } else {
        if (typeof hideReactionToolbar === 'function') hideReactionToolbar();
    }
}

// Новая функция для Хоста, чтобы просто выйти в лобби
async function finishGameSession() {
    showConfirmation('Завершить игру', 'Завершить игру и вернуться в лобби?', async () => {
        const res = await apiRequest({ action: 'finish_game_session' });
        if (res.status === 'ok') {
            await checkState();
        }
    }, { confirmText: 'Завершить' });
}

/**
 * Отправляет результаты игры на сервер для начисления рейтинга
 * @param {Array} playersData Массив объектов {user_id, rank, score}
 */
async function submitGameResults(playersData) {
    if (!playersData || playersData.length === 0) return;

    try {
        const res = await apiRequest({
            action: 'game_finished',
            players_data: JSON.stringify(playersData),
            duration: 0 // Опционально можно считать длительность
        });

        if (res.status === 'ok') {
            console.log("✅ Rating and stats updated successfully");
        } else {
            console.error("❌ Failed to update rating:", res.message);
        }
    } catch (e) {
        console.error("❌ Error submitting game results:", e);
    }
}

function safeStyle(id, prop, val) {
    const el = document.getElementById(id);
    if (el) el.style[prop] = val;
}

async function loadGameScripts(files) {
    for (const file of files) {
        await new Promise((resolve, reject) => {
            const cleanPath = file.split('?')[0];
            const isCss = cleanPath.endsWith('.css');

            if (isCss) {
                // Handle CSS loading
                const oldLink = document.querySelector(`link[href^="${cleanPath}"]`);
                if (oldLink) oldLink.remove();

                const link = document.createElement('link');
                link.rel = 'stylesheet';
                link.href = `${file}?v=${new Date().getTime()}`;
                link.onload = resolve;
                link.onerror = reject;
                document.head.appendChild(link);
            } else {
                // Handle JS loading
                const oldScript = document.querySelector(`script[src^="${cleanPath}"]`);
                if (oldScript) oldScript.remove();

                const script = document.createElement('script');
                script.src = `${file}?v=${new Date().getTime()}`;
                script.onload = resolve;
                script.onerror = reject;
                document.head.appendChild(script);
            }
        });
    }
}

function startPolling() { if (!pollInterval) pollInterval = setInterval(checkState, 2000); }
function stopPolling() { if (pollInterval) { clearInterval(pollInterval); pollInterval = null; } }

async function startGame(gameName) {
    await apiRequest({ action: 'start_game', game_name: gameName });
    checkState();
}

// Redundant stopGame removed, using backToLobby or leaveRoom




async function backToLobby() {
    const amIHost = window.isHost;
    if (amIHost) {
        showConfirmation('Завершить для всех', 'Завершить игру для всех участников?', async () => {
            const res = await apiRequest({ action: 'stop_game' });
            if (res.status === 'ok') await checkState();
        }, { isDanger: true, confirmText: 'Завершить' });
    } else {
        leaveRoom();
    }
}

// Modal Helpers
function showModal(id) {
    const modal = document.getElementById(id);
    if (modal) {
        modal.style.display = 'flex';
        // Force reflow
        void modal.offsetWidth;
        modal.classList.add('show');
    } else {
        console.error('Modal not found:', id);
    }
}

function closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('show');
    }
}

function sendToTelegram() {
    // Формируем ссылку
    // ВАЖНО: Замени mpartygamebot на юзернейм своего бота!
    const inviteLink = "https://t.me/mpartygamebot/app?startapp=" + window.currentRoomCode;
    const text = "Присоединяйся к игре! 🎮 Код: " + window.currentRoomCode;

    // Формируем URL для шеринга
    const shareUrl = "https://t.me/share/url?url=" + encodeURIComponent(inviteLink) + "&text=" + encodeURIComponent(text);

    const tg = window.Telegram.WebApp;

    // Пытаемся открыть через нативное API телеграма
    if (tg.openTelegramLink) {
        tg.openTelegramLink(shareUrl);
    } else {
        // Если мы в браузере - открываем новую вкладку
        window.open(shareUrl, '_blank');
    }
}

async function kickPlayer(id, name) {
    showConfirmation('Исключение', `Вы действительно хотите выгнать игрока ${name}?`, async () => {
        const res = await apiRequest({ action: 'kick_player', target_id: id });
        if (res.status === 'ok') {
            checkState();
        } else {
            showAlert("Ошибка", res.message, 'error');
        }
    }, { isDanger: true, confirmText: 'Выгнать' });
}
window.sendGameAction = async function (type, additionalData = {}) {
    // 1. Ждем ответ от сервера
    const res = await apiRequest({ action: 'game_action', type: type, ...additionalData });

    // 2. Если сервер вернул ошибку - показываем её!
    if (res.status === 'error') {
        showAlert("Ошибка", res.message, 'error');
    }

    // 3. Обновляем экран
    checkState();
}

// === FRIENDS LOGIC ===

async function openFriendsModal() {
    const modal = new bootstrap.Modal(document.getElementById('friendsModal'));
    modal.show();
    await loadFriends();
}

async function loadFriends() {
    const res = await apiRequest({ action: 'get_friends' });
    if (res.status === 'ok') {
        renderFriends(res.friends, res.requests);
    }
}

function renderFriends(friends, requests) {
    // 1. Render Requests
    const reqContainer = document.getElementById('friends-req-container');
    const badge = document.getElementById('friends-req-badge');

    if (requests.length > 0) {
        badge.style.display = 'inline-block';
        badge.innerText = requests.length;
        reqContainer.innerHTML = '';
        requests.forEach(req => {
            const div = document.createElement('div');
            div.className = 'd-flex align-items-center justify-content-between p-2 mb-2 bg-light rounded-4';
            div.innerHTML = `
                <div class="d-flex align-items-center gap-2">
                    ${renderAvatar(req, 'sm')}
                    <div class="fw-bold">${req.custom_name || req.first_name}</div>
                </div>
                <div>
                     <button class="btn btn-sm btn-success rounded-circle" onclick="acceptFriend(${req.id})"><i class="bi bi-check-lg"></i></button>
                </div>
            `;
            reqContainer.appendChild(div);
        });
    } else {
        badge.style.display = 'none';
        reqContainer.innerHTML = '<p class="text-center text-muted mt-4">Нет новых заявок</p>';
    }

    // 2. Render Friends List
    const listContainer = document.getElementById('friends-list-container');
    listContainer.innerHTML = '';

    if (friends.length === 0) {
        listContainer.innerHTML = '<p class="text-center text-muted mt-3">У вас пока нет друзей.</p>';
        return;
    }

    friends.forEach(f => {
        const div = document.createElement('div');
        div.className = 'd-flex align-items-center justify-content-between p-2 mb-2 border-bottom';
        div.innerHTML = `
            <div class="d-flex align-items-center gap-2">
                 ${renderAvatar(f, 'md')}
                 <div>
                    <div class="fw-bold">${f.custom_name || f.first_name}</div>
                    <div style="font-size:10px; color: #888;">ID: ${f.id}</div>
                 </div>
            </div>
            <button class="btn btn-sm text-danger" onclick="removeFriend(${f.id})"><i class="bi bi-x-lg"></i></button>
        `;
        listContainer.appendChild(div);
    });
}

async function searchFriendsAction() {
    const input = document.getElementById('friend-search-input');
    const query = input.value.trim();
    const resultsArea = document.getElementById('friends-search-results');
    const list = document.getElementById('friends-search-list');

    if (query.length < 2) {
        resultsArea.style.display = 'none';
        return;
    }

    list.innerHTML = '<div class="spinner-border spinner-border-sm text-primary"></div>';
    resultsArea.style.display = 'block';

    const res = await apiRequest({ action: 'search_users', query: query });
    if (res.status === 'ok') {
        list.innerHTML = '';
        if (res.users.length === 0) {
            list.innerHTML = '<div class="text-muted small">Никого не найдено</div>';
            return;
        }

        res.users.forEach(u => {
            const div = document.createElement('div');
            div.className = 'd-flex align-items-center justify-content-between p-2 mb-1 bg-white rounded-3 shadow-sm';
            div.innerHTML = `
                <div class="d-flex align-items-center gap-2">
                    ${renderAvatar(u, 'sm')}
                    <div class="fw-bold">${u.custom_name || u.first_name}</div>
                </div>
                <button class="btn btn-sm btn-primary rounded-circle" onclick="addFriend(${u.id})"><i class="bi bi-person-plus"></i></button>
             `;
            list.appendChild(div);
        });
    }
}

async function addFriend(id, event) {
    // Prevent event bubbling to avoid modal conflicts
    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }

    const res = await apiRequest({ action: 'add_friend', friend_id: id });
    if (res.status === 'ok') {
        showAlert('Успех', 'Заявка отправлена!', 'success');
        // Update button in profile modal if open
        const profileBtn = document.getElementById(`friend-action-btn-${id}`);
        if (profileBtn) {
            profileBtn.disabled = true;
            profileBtn.className = 'btn btn-outline-secondary rounded-pill px-4 text-muted';
            profileBtn.innerHTML = '✓ Заявка отправлена';
        }
        // Clear search if from search
        const searchInput = document.getElementById('friend-search-input');
        if (searchInput) {
            searchInput.value = '';
        }
        const searchResults = document.getElementById('friends-search-results');
        if (searchResults) {
            searchResults.style.display = 'none';
        }
    } else {
        showAlert('Внимание', res.message, 'warning');
    }
}

async function acceptFriend(id, event) {
    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }
    showConfirmation('Дружба', 'Принять заявку в друзья?', async () => {
        const res = await apiRequest({ action: 'accept_friend', friend_id: id });
        if (res.status === 'ok') {
            loadFriends();
            showAlert('Ура!', 'Теперь вы друзья! 🎉', 'success');
            openUserProfile(id);
        } else {
            showAlert('Ошибка', res.message, 'error');
        }
    }, { confirmText: 'Принять' });
}

async function removeFriend(id, event) {
    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }
    showConfirmation('Удаление', 'Удалить пользователя из друзей?', async () => {
        const res = await apiRequest({ action: 'remove_friend', friend_id: id });
        if (res.status === 'ok') {
            loadFriends();
            showAlert('Готово', 'Пользователь удален из друзей', 'success');
            openUserProfile(id);
        } else {
            showAlert('Ошибка', res.message, 'error');
        }
    }, { isDanger: true, confirmText: 'Удалить' });
}

// === LEADERBOARD LOGIC ===

// === USER PROFILE MODAL ===

async function openUserProfile(userId) {
    const modal = new bootstrap.Modal(document.getElementById('userProfileModal'));
    modal.show();

    const container = document.getElementById('public-profile-content');
    container.innerHTML = '<div class="spinner-border text-primary my-4"></div>';

    const res = await apiRequest({ action: 'get_public_profile', user_id: userId });

    if (res.status === 'ok') {
        const p = res.profile;
        const fs = res.friend_status;
        const xp = p.total_points_earned || 0;
        const level = calculateLevel(xp);

        // XP Math for progress bar
        const prevThreshold = Math.pow(level - 1, 2) * 100;
        const nextThreshold = Math.pow(level, 2) * 100;
        const progressXP = xp - prevThreshold;
        const neededXP = nextThreshold - prevThreshold;
        const progressPct = Math.max(0, Math.min(100, (progressXP / neededXP) * 100));

        // Action Button Logic
        let actionBtn = '';
        if (fs === 'none') {
            actionBtn = `<button id="friend-action-btn-${p.id}" class="btn btn-primary rounded-pill px-4 fw-bold shadow-sm" onclick="addFriend(${p.id}, event)"><i class="bi bi-person-plus me-2"></i>Добавить</button>`;
        } else if (fs === 'pending_out') {
            actionBtn = `<button class="btn btn-light rounded-pill px-4 border" disabled>Ожидание</button>`;
        } else if (fs === 'pending_in') {
            actionBtn = `<button class="btn btn-success rounded-pill px-4 fw-bold shadow-sm" onclick="acceptFriend(${p.id}, event)">Принять</button>`;
        } else if (fs === 'accepted') {
            actionBtn = `<button class="btn btn-link text-danger btn-sm text-decoration-none" onclick="removeFriend(${p.id}, event)">Удалить друга</button>`;
        } else {
            // self
            actionBtn = '';
        }

        container.innerHTML = `
            <div class="d-flex align-items-center gap-3 mb-4 text-start">
                 ${renderAvatar(p, 'xl')}
                 <div>
                    <h4 class="fw-bold mb-0">${p.custom_name || p.first_name}</h4>
                    <div class="text-muted small">ID: ${p.id}</div>
                 </div>
            </div>

            <!-- Level Bar -->
            <div class="p-2 bg-light rounded-4 border mb-3 text-start">
                <div class="d-flex justify-content-between align-items-end mb-1">
                    <div class="fw-bold text-primary" style="font-size: 14px;">${level} LVL</div>
                    <div class="text-muted" style="font-size: 10px;">${xp} / ${nextThreshold} XP</div>
                </div>
                <div class="progress" style="height: 6px; border-radius: 3px; background: rgba(0,0,0,0.05);">
                    <div class="progress-bar bg-primary" role="progressbar" style="width: ${progressPct}%; border-radius: 3px;"></div>
                </div>
            </div>
            
            <div class="row g-2 mb-4">
                <div class="col-6">
                    <div class="p-2 bg-light rounded-4 text-center border">
                        <div class="text-muted" style="font-size: 9px; text-transform: uppercase;">Игр</div>
                        <div class="fw-bold fs-6">${p.total_games_played}</div>
                    </div>
                </div>
                <div class="col-6">
                    <div class="p-2 bg-light rounded-4 text-center border">
                        <div class="text-muted" style="font-size: 9px; text-transform: uppercase;">Побед</div>
                        <div class="fw-bold fs-6 text-success">${p.total_wins}</div>
                    </div>
                </div>
            </div>

            <div class="achievements-section text-center mb-4">
                 <h6 class="fw-bold mb-3" style="font-size: 13px; text-transform: uppercase; color: #666;">Достижения</h6>
                 ${renderAchievements(res.achievements)}
            </div>

            <div class="mt-2">
                ${actionBtn}
            </div>
        `;
    } else {
        container.innerHTML = '<p class="text-danger">Ошибка загрузки</p>';
    }
}

// === LEADERBOARD LOGIC ===

function openLeaderboardScreen() {
    showScreen('leaderboard');
    loadLeaderboardList('global');
}

// function closeLeaderboardScreen() removed

// Expose globally for HTML onclick events
window.loadLeaderboard = loadLeaderboardList;

async function loadLeaderboardList(type = 'global') {
    const container = document.getElementById('leaderboard-screen-container'); // Correct ID from index.html
    if (!container) return;

    container.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-primary spinner-border-sm"></div></div>';

    const res = await apiRequest({ action: 'get_leaderboard', type: type });
    if (res.status === 'ok') {
        container.innerHTML = '';
        if (res.leaderboard.length === 0) {
            container.innerHTML = '<div class="text-center text-muted mt-5">Пока пусто 🏜️</div>';
            return;
        }

        res.leaderboard.forEach((u, index) => {
            let rankClass = '';
            let rankContent = index + 1;

            if (index === 0) { rankClass = 'top-1'; rankContent = '🥇'; }
            else if (index === 1) { rankClass = 'top-2'; rankContent = '🥈'; }
            else if (index === 2) { rankClass = 'top-3'; rankContent = '🥉'; }
            else { rankClass = 'text-muted'; rankContent = index + 1; }

            const div = document.createElement('div');
            div.className = 'lb-card mx-1'; // Minimal margin
            div.onclick = () => openUserProfile(u.user_id || u.id);
            div.style.cursor = 'pointer';

            div.innerHTML = `
                <div class="lb-rank ${rankClass}" style="min-width: 30px; text-align: center; font-size: ${index < 3 ? '24px' : '16px'}">${rankContent}</div>
                <div class="me-3">${renderAvatar(u, 'md')}</div>
                <div class="lb-info">
                    <div class="lb-name">${u.custom_name || u.first_name}</div>
                    <div class="lb-detail">
                        <span class="level-pill">LVL ${u.level || calculateLevel(u.total_points_earned)}</span>
                    </div>
                </div>
                <div class="lb-score">
                    ${u.total_points_earned || 0}
                    <small>XP</small>
                </div>
             `;
            container.appendChild(div);
        });
    } else {
        container.innerHTML = '<p class="text-center text-danger">Ошибка загрузки</p>';
    }
}

// === FRIENDS SCREEN LOGIC ===

function openFriendsScreen() {
    showScreen('friends');
    loadFriendsList();
}

function closeFriendsScreen() {
    showScreen('lobby');
    switchTab('profile');
}

async function loadFriendsList() {

    try {
        const container = document.getElementById('friends-list-container');
        if (!container) return;

        container.style.display = 'block'; // Ensure it's visible
        // DEBUG: Don't clear to see if marker survives
        // container.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-primary spinner-border-sm"></div></div>';

        const res = await apiRequest({ action: 'get_friends' });

        if (res.status === 'ok') {
            container.innerHTML = '';



            const friends = res.friends || [];

            if (friends.length === 0) {
                container.innerHTML = '<div class="text-center text-muted mt-4"><i class="bi bi-people h1 d-block mb-2"></i>Пока нет друзей</div>';
                return;
            }

            friends.forEach(f => {
                const div = document.createElement('div');
                div.className = 'd-flex align-items-center mb-3 p-3 rounded-4';
                div.style.background = 'rgba(255, 255, 255, 0.7)';
                div.style.backdropFilter = 'blur(10px)';
                div.style.boxShadow = '0 4px 15px rgba(0,0,0,0.05)';
                div.onclick = () => openUserProfile(f.id);
                div.style.cursor = 'pointer';

                div.innerHTML = `
                    <div class="me-3">${renderAvatar(f, 'md')}</div>
                    <div class="flex-grow-1">
                        <div class="fw-bold">${f.custom_name || f.first_name}</div>
                        <div class="small text-muted">Друг</div>
                    </div>
                    <button class="btn btn-sm btn-outline-danger rounded-pill" onclick="removeFriend(${f.id}, event)">
                        <i class="bi bi-person-dash"></i>
                    </button>
                `;
                container.appendChild(div);
            });
        } else {

            container.innerHTML = '<p class="text-center text-danger">Ошибка: ' + (res.message || 'Unknown') + '</p>';
        }
    } catch (e) {

        console.error("Error loading friends:", e);
        const container = document.getElementById('friends-list-container');
        if (container) container.innerHTML = `<p class="text-center text-danger">Ошибка клиента: ${e.message}</p>`;
    }
}

async function loadFriendRequests() {
    const container = document.getElementById('friends-req-container');
    if (!container) return;

    container.innerHTML = '<div class="text-center py-4"><div class="spinner-border text-primary spinner-border-sm"></div></div>';

    const res = await apiRequest({ action: 'get_friends' });
    if (res.status === 'ok') {
        container.innerHTML = '';
        const requests = res.requests || [];

        if (requests.length === 0) {
            container.innerHTML = '<p class="text-center text-muted mt-2">Нет новых заявок</p>';
            return;
        }

        requests.forEach(req => {
            const div = document.createElement('div');
            div.className = 'd-flex align-items-center mb-3 p-3 rounded-4';
            div.style.background = 'rgba(255, 255, 255, 0.7)';
            div.style.backdropFilter = 'blur(10px)';
            div.style.boxShadow = '0 4px 15px rgba(0,0,0,0.05)';
            div.onclick = () => openUserProfile(req.id);
            div.style.cursor = 'pointer';

            div.innerHTML = `
                <div class="me-3">${renderAvatar(req, 'md')}</div>
                <div class="flex-grow-1">
                    <div class="fw-bold">${req.custom_name || req.first_name}</div>
                    <div class="small text-muted">Хочет добавить вас</div>
                </div>
                <button class="btn btn-sm btn-primary rounded-pill px-3 fw-bold" onclick="acceptFriend(${req.id}, event)">
                    Принять
                </button>
            `;
            container.appendChild(div);
        });

    } else {
        container.innerHTML = '<p class="text-center text-danger">Ошибка загрузки</p>';
    }
}

// === PUBLIC ROOMS LOGIC ===

async function loadPublicRooms() {
    const container = document.getElementById('public-rooms-list');
    if (!container) return; // Not in view
    container.innerHTML = '<p class="text-center text-muted small">Обновление...</p>';

    const res = await apiRequest({ action: 'get_public_rooms' });
    if (res.status === 'ok') {
        const refreshBtn = `
            <button onclick="loadPublicRooms()" class="btn btn-light text-primary rounded-circle shadow-sm position-absolute d-flex align-items-center justify-content-center" 
                    style="top: -10px; right: 0px; width: 36px; height: 36px; z-index: 10;">
                <i class="bi bi-arrow-clockwise" style="font-size: 18px;"></i>
            </button>
        `;

        if (res.rooms.length === 0) {
            container.innerHTML = `
                <div class="text-center py-4 rounded-4 shadow-sm position-relative" style="background: rgba(255, 255, 255, 0.7); backdrop-filter: blur(10px);">
                    ${refreshBtn}
                     <div class="mb-2 text-primary opacity-50"><i class="bi bi-telescope" style="font-size: 40px;"></i></div>
                     <div class="fw-bold text-dark">Пусто</div>
                     <div class="text-muted small mb-3">Никто не играет в открытую</div>
                     <button class="btn btn-sm btn-primary rounded-pill px-3" onclick="document.querySelector('[data-bs-target=\\'#createModal\\']').click()">Создать</button>
                </div >
                `;
            return;
        }

        container.innerHTML = refreshBtn;

        res.rooms.forEach(r => {
            const div = document.createElement('div');
            // Glass style
            div.className = 'd-flex justify-content-between align-items-center mb-2 p-3 shadow-sm';
            div.style.borderRadius = '16px';
            div.style.background = 'rgba(255, 255, 255, 0.7)';
            div.style.backdropFilter = 'blur(10px)';
            div.onclick = () => joinRoom(r.room_code);
            div.style.cursor = 'pointer';

            div.innerHTML = `
                < div class="d-flex justify-content-between align-items-center" >
                    <div class="d-flex align-items-center gap-3">
                        <div class="avatar-sm" style="background-image: url('${r.host_avatar || ''}')"></div>
                        <div>
                            <div class="fw-bold text-dark">${r.title || ('Комната ' + r.host_name)}</div>
                            <div class="small text-muted">${r.description || 'Присоединяйтесь!'}</div>
                        </div>
                    </div>
                    <div class="text-end">
                         <div class="badge bg-primary rounded-pill mb-1">${r.players_count} чел.</div>
                         <div class="small fw-bold text-primary">#${r.room_code}</div>
                    </div>
                </div >
                `;
            container.appendChild(div);
        });
    }
}

// === INVITE SYSTEM ===

let selectedInviteFriends = new Set();
let inviteModalInstance = null;

async function openInviteModal() {
    const modalEl = document.getElementById('inviteFriendsModal');
    if (!modalEl) return;

    // Reset
    selectedInviteFriends.clear();
    document.getElementById('invite-count').textContent = '0';
    document.getElementById('btn-send-invites').disabled = true;
    document.getElementById('invite-search-input').value = '';

    if (!inviteModalInstance) {
        inviteModalInstance = new bootstrap.Modal(modalEl);
    }
    inviteModalInstance.show();

    const container = document.getElementById('invite-friends-list');
    container.innerHTML = '<div class="text-center py-4"><div class="spinner-border spinner-border-sm text-primary"></div></div>';

    try {
        const res = await apiRequest({ action: 'get_friends' });
        if (res.status === 'ok') {
            const friends = res.friends || [];
            if (friends.length === 0) {
                container.innerHTML = '<p class="text-center text-muted small mt-3">У вас пока нет друзей.</p>';
                return;
            }

            renderInviteList(friends);
            // Save for filtering
            container.dataset.friends = JSON.stringify(friends);
        }
    } catch (e) {
        container.innerHTML = '<p class="text-danger text-center">Ошибка загрузки</p>';
    }
}

function renderInviteList(friends) {
    const container = document.getElementById('invite-friends-list');
    container.innerHTML = '';

    friends.forEach(f => {
        const isSelected = selectedInviteFriends.has(f.id);
        const div = document.createElement('div');
        div.className = 'invite-friend-item interactable'; // Use custom class
        div.style.backgroundColor = isSelected ? '#eef2ff' : 'transparent';
        div.onclick = () => toggleFriendInvite(f.id, div);

        div.innerHTML = `
                <div class="invite-avatar-box">
                    ${renderAvatar(f, 'sm')}
                ${isSelected ? '<span class="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-primary border border-white"><i class="bi bi-check"></i></span>' : ''}
            </div>
            <div class="flex-grow-1">
                <div class="fw-bold small text-dark">${f.custom_name || f.first_name}</div>
            </div>
            <div class="invite-checkbox-wrapper">
                <input class="form-check-input" type="checkbox" ${isSelected ? 'checked' : ''} style="pointer-events: none;">
            </div>
            `;
        container.appendChild(div);
    });
}

function toggleFriendInvite(id, el) {
    if (selectedInviteFriends.has(id)) {
        selectedInviteFriends.delete(id);
    } else {
        selectedInviteFriends.add(id);
    }

    // Re-render to update UI state (simplest way)
    const friends = JSON.parse(document.getElementById('invite-friends-list').dataset.friends || '[]');
    renderInviteList(friends);

    // Update button
    const count = selectedInviteFriends.size;
    document.getElementById('invite-count').textContent = count;
    document.getElementById('btn-send-invites').disabled = count === 0;
}

function filterInviteList() {
    const query = document.getElementById('invite-search-input').value.toLowerCase();
    const friends = JSON.parse(document.getElementById('invite-friends-list').dataset.friends || '[]');

    const filtered = friends.filter(f =>
        (f.custom_name || f.first_name).toLowerCase().includes(query)
    );
    renderInviteList(filtered);
}

async function sendInvites() {
    const btn = document.getElementById('btn-send-invites');
    if (btn.disabled) return;

    // Assuming CURRENT_ROOM_ID is available globally or we fetch it
    // We can get it from the URL or state. For now, let's assume `joinedRoomId` variable exists or we fetch from API.
    // Ideally, we should pass roomId to openInviteModal.

    // Quick fix: Fetch current state to get roomId if not set
    let roomId = window.currentRoomId;
    if (!roomId) {
        // Fallback or error
        showAlert('Ошибка', 'Не найдена комната', 'error');
        return;
    }

    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Отправка...';
    btn.disabled = true;

    try {
        const res = await apiRequest({
            action: 'invite_friends',
            room_id: roomId,
            friends: Array.from(selectedInviteFriends)
        });

        if (res.status === 'ok') {
            const count = res.sent_count;
            btn.innerHTML = 'Отправлено!';
            setTimeout(() => {
                inviteModalInstance.hide();
                // Optional: Show toast
            }, 1000);
        } else {
            let msg = 'Ошибка: ' + res.message;
            if (res.debug_log_error) msg += '\nLog Error: ' + res.debug_log_error;
            showAlert('Ошибка', msg, 'error');
            btn.innerHTML = 'Попробовать снова';
            btn.disabled = false;
        }
    } catch (e) {
        console.error(e);
        btn.innerHTML = 'Ошибка';
        btn.disabled = false;
    }
}

// Call on load
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(loadPublicRooms, 1000); // Slight delay check
});

// === SWIPE-TO-GO-BACK GESTURE ===
(function initSwipeBack() {
    let touchStartX = 0;
    let touchStartY = 0;
    const SWIPE_THRESHOLD = 80; // minimum distance for swipe
    const EDGE_ZONE = 40; // pixels from left edge where swipe starts

    document.addEventListener('touchstart', (e) => {
        const touch = e.touches[0];
        touchStartX = touch.clientX;
        touchStartY = touch.clientY;
    }, { passive: true });

    document.addEventListener('touchend', (e) => {
        if (touchStartX > EDGE_ZONE) return; // Must start from left edge

        const touch = e.changedTouches[0];
        const deltaX = touch.clientX - touchStartX;
        const deltaY = Math.abs(touch.clientY - touchStartY);
        if (deltaX > SWIPE_THRESHOLD && deltaX > deltaY * 1.5) {
            handleSwipeBack();
        }

    }, { passive: true });

    function handleSwipeBack() {
        // Check which screen is active and go back
        const friendsScreen = document.getElementById('screen-friends');
        const leaderboardScreen = document.getElementById('screen-leaderboard');
        const profileEditScreen = document.getElementById('screen-profile-edit');

        if (friendsScreen && friendsScreen.classList.contains('active-screen')) {
            closeFriendsScreen();
        } else if (leaderboardScreen && leaderboardScreen.classList.contains('active-screen')) {
            closeLeaderboardScreen();
        } else if (profileEditScreen && profileEditScreen.classList.contains('active-screen')) {
            closeProfileEditor();
        } else if (document.getElementById('screen-settings')?.classList.contains('active-screen')) {
            closeSettingsScreen();
        }
    }
})();
function switchFriendsTab(tabName) {
    // 1. Remove active class from buttons
    document.querySelectorAll('#screen-friends .nav-link').forEach(el => el.classList.remove('active'));

    // 2. Hide all panes
    document.querySelectorAll('.friends-tab-pane').forEach(el => el.style.display = 'none');

    // 3. Activate selected
    if (tabName === 'my') {
        document.getElementById('btn-friends-my').classList.add('active');
        document.getElementById('tab-friends-my').style.display = 'block';
        loadFriendsList();
    } else {
        document.getElementById('btn-friends-requests').classList.add('active');
        document.getElementById('tab-friends-requests').style.display = 'block';
        loadFriendRequests();
    }
}
function showAddBotModal() {
    // Let's use showConfirmation with 3 buttons if possible?
    // Our showConfirmation supports 2 buttons.

    // Helper to create a custom modal on the fly or just use a simple list
    const html = `
    <div class="d-grid gap-3 p-2">
        <button class="glass-btn glass-btn-success" onclick="addBot('easy')">
             <span style="font-size: 18px;">👶</span>
             <span>Лёгкий</span>
        </button>
        <button class="glass-btn glass-btn-warning" onclick="addBot('medium')">
             <span style="font-size: 18px;">😐</span>
             <span>Средний</span>
        </button>
        <button class="glass-btn glass-btn-danger" onclick="addBot('hard')">
             <span style="font-size: 18px;">🤖</span>
             <span>Сложный</span>
        </button>
    </div>
    `;
    window.showAlert('Выберите сложность', html, 'info');
    // Using showAlert with HTML content
}

async function addBot(difficulty) {
    // Close modal if open (showAlert auto-closes on button click if we didn't override, wait, showAlert just shows content. 
    // We need to manually close the alert modal.
    const modalEl = document.getElementById('customAlertModal');
    const modal = bootstrap.Modal.getInstance(modalEl);
    if (modal) modal.hide();

    await apiRequest({
        action: 'add_bot',
        difficulty: difficulty
    });
    // State update via poll will handle rendering
}

async function removeBot(userId) {
    if (!await showConfirmation('Удалить бота?')) return;
    await apiRequest({
        action: 'remove_bot',
        target_id: userId
    });
}
