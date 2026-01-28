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
            alert('✅ Вошли как ' + (data.user.custom_name || data.user.first_name));
        } else {
            alert('❌ Ошибка: ' + data.message);
        }
    } catch (e) {
        alert('❌ Ошибка сети: ' + e.message);
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
        bgColor: '#F4ECF7'
    },
    {
        id: 'whoami',
        name: 'Кто из нас?',
        icon: 'bi-question-circle-fill',
        color: '#1ABC9C',
        bgColor: '#E8F8F5'
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

    // Show logout button if NOT in Telegram
    if (!tg || !tg.initData) {
        safeStyle('logout-menu-item', 'display', 'flex');
    }
});

async function initApp(tg) {
    try {
        const startParam = tg?.initDataUnsafe?.start_param;
        console.log("Start Param:", startParam);

        const res = await checkState();

        // Если чекстейт вернул ошибку или пустой результат (проблема с токеном или API)
        if (!res || res.status === 'error' || res.status === 'auth_error') {
            showScreen('login');
            safeStyle('browser-login-btn', 'display', 'block');
            return;
        }

        if (startParam) {
            // Support both "room_ABCD" and "ABCD"
            const code = startParam.startsWith('room_') ? startParam.replace('room_', '') : startParam;

            if (res && res.status === 'in_room' && res.room.room_code !== code) {
                if (confirm(`Перейти в комнату ${code}?`)) {
                    await leaveRoom();
                    await joinRoom(code);
                }
            }
            else if (res.status !== 'in_room') {
                await joinRoom(code);
            }
        } else if (res && res.status === 'no_room') {
            // Если мы авторизованы, но не в комнате — идем в лобби
            showScreen('lobby');
        }
    } catch (e) {
        console.error("Init App failed:", e);
        showScreen('login');
        safeStyle('browser-login-btn', 'display', 'block');
    }
}

function logout() {
    if (!confirm('Вы уверены, что хотите выйти?')) return;
    localStorage.removeItem('pg_token');
    window.location.reload();
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
            alert("Network/Server Error: " + msg);
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
        alert('Auth Error: ' + res.message);
    }
}

// === ЛОГИКА ===
// UPDATE CREATE ROOM
// UPDATE CREATE ROOM
async function createRoom() {
    const passInput = document.getElementById('create-room-pass');
    const titleInput = document.getElementById('create-room-title');

    // Check if element exists before accessing checked. If not (old modal?), default false.
    const publicCheckbox = document.getElementById('create-room-public');
    const isPublic = publicCheckbox ? publicCheckbox.checked : false;

    const roomTitle = (titleInput && titleInput.value.trim()) ? titleInput.value.trim() : 'Party Game';

    const res = await apiRequest({ action: 'create_room', password: passInput ? passInput.value : '' });
    if (res.status === 'ok') {
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
    if (!code) return alert("Введите код");
    const passInput = document.getElementById('join-room-pass');
    const res = await apiRequest({ action: 'join_room', room_code: code, password: passInput ? passInput.value : '' });
    if (res.status === 'ok') checkState();
    else alert(res.message);
}

// === ИСПРАВЛЕННАЯ ФУНКЦИЯ ВЫХОДА ===
// js/app.js

window.leaveRoom = async function () {
    // 1. Используем надежную переменную window.isHost (которую мы сохраняем в checkState)
    const amIHost = window.isHost;

    if (!confirm(amIHost ? 'Вы Хост. Закрыть комнату для всех?' : 'Выйти из комнаты?')) return;

    // 2. ВКЛЮЧАЕМ БЛОКИРОВКУ (чтобы checkState не мешал нам выходить)
    isLeavingProcess = true;
    stopPolling(); // На всякий случай останавливаем таймер

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
            alert(res.message || "Ошибка выхода");
        }
    } catch (e) {
        isLeavingProcess = false;
        startPolling();
        console.error("Критическая ошибка при выходе:", e);
    }
}

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

        if (res.user) updateUserInfo(res.user);

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
                const renderFunc = window[`render_${gameType}`];
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
    // We sort by ID to ensure order doesn't affect cache key if array is shuffled (though usually SQL returns order)
    const currentJson = JSON.stringify(players);
    if (currentJson === lastPlayersJson) return;
    lastPlayersJson = currentJson;

    const list = document.getElementById(containerId);
    if (!list) return;
    list.innerHTML = '';

    const countEl = document.getElementById('players-count');
    if (countEl) countEl.innerText = players.length;

    // Берем флаг хоста из глобального состояния приложения
    const amIHost = window.isHost;

    players.forEach(p => {
        const div = document.createElement('div');
        div.className = 'player-grid-item';

        const avatarHtml = renderAvatar(p, 'md');

        // Fix Host Icon: Use a wrapper div for the styling, put the icon inside
        const crown = p.is_host == 1 ?
            `<div class="host-crown"><i class="bi bi-crown-fill"></i></div>` : '';

        div.innerHTML = `
            <div class="position-relative">
                ${avatarHtml}
                ${crown}
            </div>
            <div class="player-name">${p.custom_name || p.first_name}</div>
        `;

        // Клик для кика (только если я хост и кликаю не по себе)
        if (amIHost && p.is_host != 1) {
            div.style.cursor = 'pointer';
            div.onclick = () => kickPlayer(p.id, p.first_name);
        }

        list.appendChild(div);
    });
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

    // Fallback to Photo URL or UI Avatars
    const src = user.photo_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.first_name || 'U')}&background=random`;
    return `<div class="avatar-${size}" style="background-image: url('${src}')"></div>`;
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

function updateUserInfo(user) {
    globalUser = user; // <<< Save to global

    const nameDisplay = document.getElementById('user-name-display');
    if (nameDisplay) nameDisplay.innerText = user.custom_name || user.first_name;

    const lobbyAvatar = document.getElementById('lobby-user-avatar');
    if (lobbyAvatar) lobbyAvatar.innerHTML = renderAvatar(user, 'md');

    const bigAvatar = document.getElementById('profile-avatar-big');
    const bigName = document.getElementById('profile-name-big');
    if (bigAvatar) bigAvatar.innerHTML = renderAvatar(user, 'xl');
    if (bigName) bigName.innerText = user.custom_name || user.first_name;

    // Update inputs in modal
    const nameInput = document.getElementById('profile-name-input');
    if (nameInput) nameInput.value = user.custom_name || user.first_name;

    // Fetch Stats if we are on profile tab or just once
    // Optimization: Only fetch if we haven't lately or just do it.
    fetchUserStats();
}

async function fetchUserStats() {
    const res = await apiRequest({ action: 'get_stats' });
    if (res.status === 'ok') {
        safeText('profile-stat-wins', res.stats.total_wins);
        safeText('profile-stat-games', res.stats.total_games_played);
        safeText('profile-stat-rating', res.stats.rating);
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

    // Включаем нужный
    const target = document.getElementById('screen-' + id);
    if (target) target.classList.add('active-screen');

    // Показываем нижнюю навигацию ТОЛЬКО в лобби и лидерборде
    const nav = document.querySelector('.bottom-nav');
    if (nav) {
        const shouldShow = (id === 'lobby' || id === 'leaderboard');
        nav.style.setProperty('display', shouldShow ? 'flex' : 'none', 'important');
    }
}

// Новая функция для Хоста, чтобы просто выйти в лобби
async function finishGameSession() {
    if (!confirm('Завершить игру и вернуться в лобби?')) return;
    const res = await apiRequest({ action: 'finish_game_session' });
    if (res.status === 'ok') {
        checkState(); // Оно само переключит экран на 'room' (лобби)
    }
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
        if (!confirm('Завершить игру для всех?')) return;
        const res = await apiRequest({ action: 'stop_game' });
        if (res.status === 'ok') checkState();
    } else {
        leaveRoom();
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

async function kickPlayer(id, name) { if (!confirm(`Выгнать ${name}?`)) return; await apiRequest({ action: 'kick_player', target_id: id }); checkState(); }
window.sendGameAction = async function (type, additionalData = {}) {
    // 1. Ждем ответ от сервера
    const res = await apiRequest({ action: 'game_action', type: type, ...additionalData });

    // 2. Если сервер вернул ошибку - показываем её!
    if (res.status === 'error') {
        alert("Ошибка: " + res.message);
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
        alert('Заявка отправлена!');
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
        alert(res.message);
    }
}

async function acceptFriend(id, event) {
    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }
    // Remove confirm to make it smoother or keep it? User said "doesn't work", maybe confirm blocks?
    // Let's keep confirm but make sure it works.
    if (!confirm('Принять заявку?')) return;

    const res = await apiRequest({ action: 'accept_friend', friend_id: id });
    if (res.status === 'ok') {
        loadFriends();
        // Update button if invalidating modal
        const profileBtn = document.getElementById(`friend-action-btn-${id}`); // The ID might not be set for accept/remove buttons yet?
        // Wait, openUserProfile didn't set ID for accept/remove buttons!
        // openUserProfile ONLY sets ID for the "Add" button in my previous edit.
        // I need to update openUserProfile to set IDs for ALL buttons first.

        // Actually, let's just reload the profile modal content or update the button using a more generic approach if ID is missing.
        // But for now, let's just Alert success to be sure.
        alert('Теперь вы друзья! 🎉');
        openUserProfile(id); // Reload the profile modal to show updated state (Remove Friend button)
    } else {
        alert(res.message);
    }
}

async function removeFriend(id, event) {
    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }
    if (!confirm('Удалить из друзей?')) return;
    const res = await apiRequest({ action: 'remove_friend', friend_id: id });
    if (res.status === 'ok') {
        loadFriends();
        alert('Пользователь удален из друзей');
        openUserProfile(id); // Reload profile to show "Add" button
    } else {
        alert(res.message);
    }
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

        // Action Button Logic
        let actionBtn = '';
        if (fs === 'none') {
            actionBtn = `<button id="friend-action-btn-${p.id}" class="btn btn-primary rounded-pill px-4 fw-bold" onclick="addFriend(${p.id}, event)"><i class="bi bi-person-plus me-2"></i>Добавить</button>`;
        } else if (fs === 'pending_out') {
            actionBtn = `<button class="btn btn-outline-secondary rounded-pill px-4" disabled>Заявка отправлена</button>`;
        } else if (fs === 'pending_in') {
            actionBtn = `<button class="btn btn-success rounded-pill px-4 fw-bold" onclick="acceptFriend(${p.id}, event)">Принять заявку</button>`;
        } else if (fs === 'accepted') {
            actionBtn = `<button class="btn btn-outline-danger rounded-pill px-4" onclick="removeFriend(${p.id}, event)">Удалить</button>`;
        } else {
            // self
            actionBtn = '';
        }

        container.innerHTML = `
            <div class="d-flex justify-content-center mb-3">
                 ${renderAvatar(p, 'xl')}
            </div>
            <h4 class="fw-bold mb-1">${p.custom_name || p.first_name}</h4>
            <div class="text-muted small mb-3">ID: ${p.id}</div> 
            
            <div class="d-flex justify-content-center gap-4 mb-4">
                <div class="text-center">
                    <div class="h5 fw-bold mb-0 text-warning">${p.total_wins}</div>
                    <div class="small text-muted">Побед</div>
                </div>
                <div class="text-center">
                    <div class="h5 fw-bold mb-0 text-primary">${p.total_games_played}</div>
                    <div class="small text-muted">Игр</div>
                </div>
                 <div class="text-center">
                    <div class="h5 fw-bold mb-0 text-danger">${p.rating}</div>
                    <div class="small text-muted">Рейтинг</div>
                </div>
            </div>
            ${actionBtn}
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

async function loadLeaderboardList(type = 'global') {
    const container = document.getElementById('leaderboard-screen-container');
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
            let medal = '';
            if (index === 0) medal = '🥇';
            if (index === 1) medal = '🥈';
            if (index === 2) medal = '🥉';
            if (index > 2) medal = `<span class="fw-bold text-muted">${index + 1}</span>`;

            const div = document.createElement('div');
            // Changed bg-white to slightly transparent glass style
            div.className = 'd-flex align-items-center mb-3 p-3 rounded-4';
            div.style.background = 'rgba(255, 255, 255, 0.7)';
            div.style.backdropFilter = 'blur(10px)';
            div.style.boxShadow = '0 4px 15px rgba(0,0,0,0.05)';
            div.onclick = () => openUserProfile(u.user_id || u.id);
            div.style.cursor = 'pointer';

            div.innerHTML = `
                <div class="fs-4 me-3 d-flex justify-content-center align-items-center" style="width: 40px; flex-shrink: 0;">${medal}</div>
                <div class="me-3">
                     ${renderAvatar(u, 'md')}
                </div>
                <div class="flex-grow-1">
                    <div class="fw-bold text-dark">${u.custom_name || u.first_name}</div>
                    <div class="small text-muted">${u.total_wins} побед</div>
                </div>
                <div class="text-end">
                    <div class="fw-bold text-primary">${u.rating}</div>
                    <div class="small text-muted" style="font-size:10px;">MMR</div>
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
        alert('Ошибка: Не найдена комната');
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
            alert(msg);
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

        // Check for horizontal swipe (more horizontal than vertical)
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
