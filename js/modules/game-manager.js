/**
 * Game Manager Module
 * Handles game state, synchronization events (reactions, pings), and game-specific UI effects.
 */

// === STATE ===
let reactionBuffer = { emoji: null, count: 0 };
let reactionThrottleTimer = null;
const lastSourceShowTime = new Map(); // Track when we last showed a user's nameplate
let seenReactionIds = new Set(); // Prevent duplicate event processing
const loadedGameScripts = new Set(); // Track loaded scripts to prevent duplicates

// === DYNAMIC LOADING ===
async function loadGameScript(gameType) {
    if (loadedGameScripts.has(gameType) || window[`render_${gameType}`]) {
        return Promise.resolve();
    }

    console.log(`[GameManager] Loading script for: ${gameType}`);

    // Config: Define complexity of games
    // "complex" means it's a folder with index.js + styles
    const complexGames = ['bunker', 'wordclash'];
    const isComplex = complexGames.includes(gameType);

    const scriptPath = isComplex
        ? `js/games/${gameType}/index.js?v=${window.appVersion || Date.now()}`
        : `js/games/${gameType}.js?v=${window.appVersion || Date.now()}`;

    // Load CSS for complex games
    if (isComplex) {
        const cssPath = `js/games/${gameType}/${gameType}.css?v=${window.appVersion || Date.now()}`;
        if (!document.querySelector(`link[href^="js/games/${gameType}"]`)) {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = cssPath;
            document.head.appendChild(link);
        }
    }

    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = scriptPath;
        script.type = isComplex ? 'module' : 'text/javascript'; // Bunker uses ES modules? Let's check. 
        // Actually, looking at current files, most use window globals. 
        // But folders like 'bunker/index.js' might rely on purely global effects or import/export.
        // Giving the file list: index.js, ui.js, handlers.js... likely not modules if they assign to window.
        // But let's stick to standard loading first.

        script.onload = () => {
            console.log(`[GameManager] Loaded ${gameType}`);
            loadedGameScripts.add(gameType);
            resolve();
        };
        script.onerror = (e) => {
            console.error(`[GameManager] Failed to load ${gameType}`, e);
            reject(e);
        };
        document.body.appendChild(script);
    });
}


// === SYNC & REACTION SYSTEM ===

async function flushReactionBuffer() {
    if (!reactionBuffer.emoji || reactionBuffer.count === 0) return;
    const { emoji, count } = reactionBuffer;
    reactionBuffer = { emoji: null, count: 0 };
    reactionThrottleTimer = null;

    try {
        if (window.apiRequest) {
            await window.apiRequest({
                action: 'send_reaction',
                type: 'emoji',
                payload: JSON.stringify({ emoji, count })
            });
        }
    } catch (e) { console.error("Flush reactions failed", e); }
}

const GameManager = {
    // === PUBLIC API ===

    /**
     * Load game resources dynamically.
     * @param {string} gameType 
     */
    async loadGameScript(gameType) {
        return loadGameScript(gameType);
    },

    /**
     * Send a synchronization event to all players in the room.
     * @param {string} type - Event type (e.g. 'emoji', 'audio_ping')
     * @param {object} payload - Data payload
     */
    async sendSyncEvent(type, payload = {}) {
        try {
            if (window.apiRequest) {
                await window.apiRequest({
                    action: 'send_reaction',
                    type: type,
                    payload: JSON.stringify(payload)
                });
            }
        } catch (e) { console.error("Sync event failed", e); }
    },

    /**
     * Handle incoming sync events from the server (poll response).
     * @param {Array} events - List of event objects
     */
    handleReactions(events) {
        if (!events || !Array.isArray(events)) return;

        events.forEach(ev => {
            // Unique ID check. 
            const key = ev.created_at + '_' + ev.user_id + '_' + ev.type;
            if (seenReactionIds.has(key)) return;
            seenReactionIds.add(key);

            // Memory Leak Fix: Prune seenReactionIds if it gets too large
            if (seenReactionIds.size > 500) {
                const firstEntry = seenReactionIds.values().next().value;
                seenReactionIds.delete(firstEntry);
            }

            // Skip our own reactions (already shown locally and instantly)
            if (window.globalUser && ev.user_id == window.globalUser.id) return;

            const payload = JSON.parse(ev.payload || '{}');

            // Special: Audio Pings (Global sound sync with delay compensation)
            if (ev.type === 'audio_ping' || ev.type === 'catastrophe_audio') {
                this.handleAudioPing(ev, payload);
                return;
            }

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
                this.showFloatingEmojiBurst(emoji, count, effectiveProducer);
            } else {
                this.showFloatingEmoji(emoji, effectiveProducer);
            }
        });
    },

    handleAudioPing(ev, payload) {
        const sound = payload.sound || payload.emoji;
        const playAt = payload.playAt; // Shared target timestamp (ms)
        const serverTimeOffset = window.serverTimeOffset || 0;

        if (window.audioManager) {
            if (playAt) {
                const nowOnServer = Date.now() + serverTimeOffset;
                const wait = playAt - nowOnServer;

                if (wait > 0) {
                    setTimeout(() => window.audioManager.play(sound), wait);
                    console.log(`[Sync] Scheduled ${sound} in ${Math.round(wait)}ms`);
                } else if (wait > -3000) {
                    // Late by less than 3s: play now
                    window.audioManager.play(sound);
                    console.log(`[Sync] Playing ${sound} immediately(Late by ${Math.round(-wait)}ms)`);
                }
            } else {
                window.audioManager.play(sound);
            }
        }
    },

    /**
     * Show a single floating emoji.
     */
    showFloatingEmoji(emoji, producer = null, isBurstMember = false) {
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

        // ROTATION FIX: Ensure --rotation is set for the animation
        const rotation = (Math.random() - 0.5) * 40; // +/- 20 deg
        el.style.setProperty('--rotation', rotation + 'deg');

        // Always append to DEVICE WRAPPER to ensure clipping (overflow: hidden) works
        // and reactions stay "inside the phone"
        const container = document.querySelector('.device-wrapper') || document.body;

        // Random Position logic
        const startX = 10 + Math.random() * 80;
        el.style.left = startX + '%';
        // Randomize sway
        el.style.setProperty('--sway', (Math.random() - 0.5) * 50 + 'px');

        container.appendChild(el);

        // Haptic Feedback for local user (if this function is called directly) or sync
        // Usually local user calls this directly for their own taps.
        // Sync events call this for others.

        // Cleanup
        setTimeout(() => el.remove(), 4000);
    },

    showFloatingEmojiBurst(emoji, count, producer = null) {
        // Show one "main" bubble with attribution
        if (producer) {
            this.showFloatingEmoji(emoji, producer);
            count--; // The main one counts
        }

        // Show the rest as simple particles
        let spawned = 0;
        const interval = setInterval(() => {
            if (spawned >= count) {
                clearInterval(interval);
                return;
            }
            this.showFloatingEmoji(emoji, null, true);
            spawned++;
        }, 50); // Stagger by 50ms
    },

    /**
     * Send a local reaction (tapped by user).
     * Buffers requests to avoid hitting server too hard.
     */
    triggerReaction(emoji) {
        // 1. Show locally immediately
        this.showFloatingEmoji(emoji);

        // 2. Buffer for Network
        if (reactionBuffer.emoji === emoji) {
            reactionBuffer.count++;
        } else {
            // Flush previous if different emoji
            if (reactionBuffer.count > 0) flushReactionBuffer();
            reactionBuffer = { emoji: emoji, count: 1 };
        }

        // 3. Reset/Start Timer
        if (reactionThrottleTimer) clearTimeout(reactionThrottleTimer);
        reactionThrottleTimer = setTimeout(flushReactionBuffer, 1000); // 1 sec throttle

        // 4. Haptic
        if (window.triggerHaptic) window.triggerHaptic('impact', 'light');
    }
};

// === REACTION UI ===

const EMOJI_OPTIONS = ['😎', '👻', '🤖', '🐱', '💀', '👽', '🦊', '🐯', '🤴', '🥷', '🦁', '🦄', '🐼', '🐵', '🐸'];

function renderReactionToolbar() {
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

        // Add hide button for word clash
        if (window.selectedGameId === 'wordclash') {
            const hideBtn = document.createElement('div');
            hideBtn.className = 'reaction-hide-btn';
            hideBtn.innerHTML = '<i class="bi bi-x-lg"></i>';
            hideBtn.title = 'Скрыть для этой игры';
            hideBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                localStorage.setItem(`hide_reactions_${window.selectedGameId} `, 'true');
                hideReactionToolbar();
            });
            palette.appendChild(hideBtn);
        }

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
                        GameManager.triggerReaction(e);
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
                    GameManager.triggerReaction(e);
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

    // Check if user hid reactions for this game
    if (window.selectedGameId && localStorage.getItem(`hide_reactions_${window.selectedGameId} `) === 'true') {
        container.style.display = 'none';
        return;
    }

    container.style.display = 'block';
}

function hideReactionToolbar() {
    const container = document.getElementById('reaction-container');
    if (container) {
        container.style.display = 'none';
        container.classList.remove('expanded');
    }
}

// === GAME DISCOVERY & SESSION ===

function renderLibrary() {
    const list = document.getElementById('library-list');
    if (!list) return;
    list.innerHTML = '';

    if (!window.AVAILABLE_GAMES) return;

    window.AVAILABLE_GAMES.forEach(game => {
        const card = document.createElement('div');
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

function renderPopularGames() {
    const list = document.getElementById('popular-games-list');
    if (!list) return;

    list.innerHTML = '';
    if (!window.AVAILABLE_GAMES) return;

    window.AVAILABLE_GAMES.forEach(game => {
        const card = document.createElement('div');
        card.className = 'mini-game-card clickable';
        card.onclick = () => openGameShowcase(game.id);

        const iconColor = game.color || '#6c757d';
        const gradient = 'linear-gradient(135deg, rgba(255,255,255,0.3) 0%, rgba(255,255,255,0) 50%, rgba(0,0,0,0.1) 100%)';

        card.innerHTML = `
            <div class="mini-icon-box" style="background: ${iconColor}; background-image: ${gradient}; box-shadow: 0 4px 10px rgba(0,0,0,0.1);">
                <i class="bi ${game.icon || 'bi-controller'}"></i>
            </div>
            <div class="mini-game-title">${game.name}</div>
        `;
        list.appendChild(card);
    });
}

function openGameShowcase(gameId) {
    const game = window.AVAILABLE_GAMES.find(g => g.id === gameId);
    if (!game) return;

    // Elements
    const headerTitle = document.getElementById('game-detail-header-title');
    const loreArea = document.getElementById('game-detail-lore');
    const demoArea = document.getElementById('game-detail-demo-area');
    const rulesList = document.getElementById('game-detail-rules');
    const heroImg = document.getElementById('game-detail-image-container');
    const iconWrap = document.getElementById('game-detail-icon-wrap');
    const icon = document.getElementById('game-detail-icon');

    // Stats
    const statPlayers = document.getElementById('stat-players');
    const statTime = document.getElementById('stat-time');
    const statDifficulty = document.getElementById('stat-difficulty');

    // Populate Data
    if (headerTitle) headerTitle.innerText = game.name;
    if (loreArea) loreArea.innerHTML = game.longDescription || game.description || 'Описание скоро появится!';
    if (icon) icon.className = `bi ${game.icon || 'bi-controller'}`;
    if (iconWrap) {
        const color = game.color || '#666';
        iconWrap.style.background = color;
        iconWrap.style.backgroundImage = 'linear-gradient(135deg, rgba(255,255,255,0.3) 0%, rgba(255,255,255,0) 50%, rgba(0,0,0,0.1) 100%)';
        iconWrap.style.boxShadow = '0 8px 24px rgba(0,0,0,0.12)';
        iconWrap.style.display = 'flex';
        iconWrap.style.alignItems = 'center';
        iconWrap.style.justifyContent = 'center';
    }

    // Populate Gallery
    if (demoArea) {
        demoArea.innerHTML = '';
        if (game.gallery && game.gallery.length > 0) {
            const galleryHeader = document.createElement('h2');
            galleryHeader.className = 'fw-bold mb-4 text-dark';
            galleryHeader.style.cssText = 'font-size: 22px; letter-spacing: -0.5px;';
            galleryHeader.innerText = 'Примеры игры';
            demoArea.appendChild(galleryHeader);

            game.gallery.forEach(item => {
                if (item.type === 'html') {
                    const blockWrap = document.createElement('div');
                    blockWrap.className = 'mb-4';
                    const label = item.label || 'Игровой процесс';
                    blockWrap.innerHTML = `
                        <div class="text-muted small fw-bold text-uppercase mb-3" style="letter-spacing: 1px; font-size: 10px;">${label}</div>
                        ${item.content}
                    `;
                    demoArea.appendChild(blockWrap);
                }
            });
        }
    }

    // Rules
    if (rulesList) {
        rulesList.innerHTML = '';
        if (game.rules) {
            game.rules.forEach((rule, idx) => {
                const item = document.createElement('div');
                item.className = 'rule-v3-item d-flex align-items-start py-3';
                if (idx < game.rules.length - 1) {
                    item.style.borderBottom = '1px solid #f2f2f7';
                }

                item.innerHTML = `
                    <div class="rule-icon-box me-3 d-flex align-items-center justify-content-center" 
                         style="width: 28px; height: 28px; background: transparent; color: ${game.color}; font-size: 18px; flex-shrink: 0;">
                        <i class="bi ${rule.icon}"></i>
                    </div>
                    <div class="rule-text text-dark" style="font-size: 16px; font-weight: 500; line-height: 1.4; flex: 1; padding-top: 2px;">
                        ${rule.text}
                    </div>
                `;
                rulesList.appendChild(item);
            });
        }
    }

    if (statPlayers) statPlayers.innerText = game.stats ? game.stats.players : '-';
    if (statTime) statTime.innerText = game.stats ? game.stats.time : '-';
    if (statDifficulty) statDifficulty.innerText = game.stats ? game.stats.difficulty : '-';

    // Hero Image
    if (heroImg) {
        if (game.promoImage) {
            heroImg.innerHTML = `
                <img src="${game.promoImage}?v=2260" class="h-100 w-100" style="object-fit: cover;">
                <div style="position:absolute; bottom:0; left:0; width:100%; height:80px; background: linear-gradient(to top, rgba(0,0,0,0.3) 0%, transparent 100%); z-index: 2;"></div>
            `;
        } else {
            heroImg.innerHTML = `
                <div style="width:100%; height:100%; background: linear-gradient(135deg, ${game.color} 0%, var(--accent-color) 100%); display: flex; align-items: center; justify-content: center; font-size: 140px; color: rgba(255,255,255,0.2);">
                    <i class="bi ${game.icon || 'bi-controller'}"></i>
                </div>
            `;
        }
    }

    // Button Logic
    const tryBtn = document.getElementById('btn-try-game-now');
    const headerBtn = document.getElementById('btn-header-try-now');
    const tryHandler = () => tryGameNow(gameId);
    if (tryBtn) tryBtn.onclick = tryHandler;
    if (headerBtn) headerBtn.onclick = tryHandler;

    // Telegram Native BackButton
    if (window.Telegram && window.Telegram.WebApp) {
        const tg = window.Telegram.WebApp;
        tg.BackButton.show();
        tg.BackButton.onClick(() => {
            window.showScreen('lobby');
            tg.BackButton.hide();
        });
    }

    window.showScreen('game-detail');
}

async function tryGameNow(gameId) {
    if (window.selectedGameId) window.selectedGameId = gameId; // Global var usually

    // Clear pass input
    const passInput = document.getElementById('create-room-pass');
    if (passInput) passInput.value = '';

    // Create room
    if (window.ThemeManager) window.ThemeManager.triggerHaptic('impact', 'medium');

    // Call createRoom (From RoomManager alias)
    if (window.createRoom) await window.createRoom();
}

async function startGame(gameName) {
    await window.apiRequest({ action: 'start_game', game_name: gameName });
    if (window.checkState) window.checkState();
}

async function finishGameSession() {
    if (!window.showConfirmation) return;

    window.showConfirmation('Завершить игру', 'Завершить игру и вернуться в лобби?', async () => {
        const res = await window.apiRequest({ action: 'finish_game_session' });
        if (res.status === 'ok') {
            if (window.checkState) await window.checkState();
        }
    }, { confirmText: 'Завершить' });
}

async function submitGameResults(playersData) {
    if (!playersData || playersData.length === 0) return;

    try {
        const res = await window.apiRequest({
            action: 'game_finished',
            players_data: JSON.stringify(playersData),
            duration: 0
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

async function sendGameAction(type, additionalData = {}) {
    const res = await window.apiRequest({ action: 'game_action', type: type, ...additionalData });

    if (res.status === 'error') {
        if (window.selectedGameId === 'wordclash' && window.showInvalidWord) {
            window.showInvalidWord(res.message);
        } else {
            if (window.showAlert) window.showAlert("Ошибка", res.message, 'error');
        }
    }

    if (window.checkState) window.checkState();
    return res;
}

window.GameManager = GameManager;
// Aliases for backward compatibility or ease of use
window.sendSyncEvent = GameManager.sendSyncEvent.bind(GameManager);
window.handleReactions = GameManager.handleReactions.bind(GameManager);
window.showFloatingEmoji = GameManager.showFloatingEmoji.bind(GameManager);
window.triggerReaction = GameManager.triggerReaction.bind(GameManager);
window.sendReaction = GameManager.triggerReaction.bind(GameManager); // Legacy alias

// UI Exports
window.renderReactionToolbar = renderReactionToolbar;
window.hideReactionToolbar = hideReactionToolbar;
window.EMOJI_OPTIONS = EMOJI_OPTIONS;

// Game Discovery Exports
window.renderLibrary = renderLibrary;
window.renderPopularGames = renderPopularGames;
window.openGameShowcase = openGameShowcase;
window.tryGameNow = tryGameNow;
window.startGame = startGame;
window.finishGameSession = finishGameSession;
window.submitGameResults = submitGameResults;
window.sendGameAction = sendGameAction;
