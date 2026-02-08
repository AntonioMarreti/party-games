/**
 * UI Manager Module
 * Handles simplified screen navigation, modals, tabs, and safe DOM manipulation.
 */

// === NAVIGATION ===

function showScreen(screenId) {
    let finalId = screenId;
    let screen = document.getElementById(finalId);

    // Auto-prefix if needed (e.g. 'lobby' -> 'screen-lobby')
    if (!screen && !screenId.startsWith('screen-')) {
        finalId = 'screen-' + screenId;
        screen = document.getElementById(finalId);
    }

    if (!screen) {
        console.error("UIManager: Screen not found ->", screenId);
        return;
    }

    // Hide all screens
    document.querySelectorAll('.screen').forEach(s => {
        s.classList.remove('active-screen');
        s.style.display = 'none';
    });

    // Show target screen
    screen.style.display = 'block';
    // Force reflow for animation
    void screen.offsetWidth;
    screen.classList.add('active-screen');

    // Update Hash (Anti-loop check)
    const currentHash = window.location.hash.substring(1);
    const targetHash = finalId.replace('screen-', '');

    // START: Deep Link Protection
    // If we are on a specific game route (e.g. #/game/bunker) and showing game-detail, 
    // DO NOT overwrite the hash with generic #game-detail
    if (currentHash.startsWith('/game/') && targetHash === 'game-detail') {
        // Keep the specific hash
    } else if (currentHash.startsWith("/game/") && targetHash === "game-detail") { } else if (currentHash !== targetHash && !['splash', 'login'].includes(targetHash)) {
        window.history.pushState(null, null, '#' + targetHash);
    }
    // END: Deep Link Protection

    // Scroll to top
    window.scrollTo(0, 0);

    // Update Tab Bar visibility
    const tabBar = document.querySelector('.bottom-nav');
    if (tabBar) {
        const navScreens = ['screen-lobby', 'screen-leaderboard', 'screen-friends', 'screen-games', 'screen-profile'];
        if (navScreens.includes(finalId)) {
            tabBar.style.display = 'flex';
        } else {
            tabBar.style.display = 'none';
        }
    }

    // SPECIAL: If showing Lobby, ensure at least one tab-content is visible
    if (finalId === 'screen-lobby') {
        const anyActive = screen.querySelector('.tab-content.active-tab');
        if (!anyActive) {
            const homeTab = document.getElementById('tab-home');
            if (homeTab) {
                homeTab.style.display = 'block';
                homeTab.classList.add('active-tab');
            }
        } else {
            // Ensure the active tab is actually displayed
            anyActive.style.display = 'block';
        }
    }

    // Haptic feedback
    if (window.ThemeManager) {
        window.ThemeManager.triggerHaptic('selection');
    }
}

/**
 * Handle initial load and back/forward navigation
 */
function handleRouting() {
    let hash = window.location.hash.substring(1);
    if (!hash) return;

    // 0. Filter out Telegram garbage and query params from hash
    // Example: #game-detail?tgWebAppData=... or #game-detail&tgWebAppData=...
    hash = hash.split('?')[0].split('&')[0];
    if (!hash) return;

    // 1. Check for Special Actions (e.g. initializing profile editor data)
    const action = ROUTE_ACTIONS[hash];
    if (action && typeof window[action] === 'function') {
        window[action]();
        return;
    }

    // 2. Check if it's a tab or a screen
    if (TAB_SCREEN_MAP[hash]) {
        if (window.switchTab) window.switchTab(hash);
    }
    // 3. Deep Link: Game Detail (e.g. #/game/bunker)
    else if (hash.startsWith('/game/')) {
        const gameId = hash.split('/game/')[1];
        // Ensure games are loaded, then open
        if (window.AVAILABLE_GAMES && window.AVAILABLE_GAMES.length > 0) {
            // Wait for DOM to be ready just in case, though this runs usually late enough
            if (window.openGameShowcase) {
                // Determine if we need to show the 'games' tab first? 
                // Actually openGameShowcase handles its own logic, but usually we need 'screen-game-detail' to be active.
                // Checking openGameShowcase logic... it just populates the fields. It doesn't switch the screen!
                // Wait, openGameShowcase in game-manager.js usually ends with showScreen('game-detail').
                // Let's verify game-manager.js logic for screen switching.
                window.openGameShowcase(gameId);
                // We also need to show the screen explicitly if openGameShowcase doesn't do it? 
                // Looking at game-manager.js (not fully visible), it likely handles it.
                // But to be safe, we can call showScreen here too? 
                // Actually, let openGameShowcase do its job. 
                // BUT, openGameShowcase needs to know it's a deep link? No, it just sets the data.
                // Assuming openGameShowcase calls showScreen('game-detail').
            }
            // If it's a deep link, we might need to invoke showScreen manually if openGameShowcase doesn't.
        }
    }
    else {
        const screen = document.getElementById('screen-' + hash) || document.getElementById(hash);
        if (screen) {
            if (window.showScreen) window.showScreen(hash);
        }
    }
}

// Global listener for routing
window.addEventListener('popstate', handleRouting);
window.addEventListener('load', handleRouting);


const TAB_SCREEN_MAP = {
    'home': 'screen-lobby',
    'games': 'screen-lobby',
    'profile': 'screen-lobby',
    'leaderboard': 'screen-leaderboard'
};

const ROUTE_ACTIONS = {
    'profile-edit': 'openProfileEditor',
    'settings': 'openSettingsScreen',
    'friends': 'openFriendsScreen',
    'leaderboard': 'openLeaderboardScreen'
};

function switchTab(tabId) {
    // 1. Update visual state of tab buttons
    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.classList.remove('active');
        btn.style.opacity = '0.4'; // Muted for inactive
        const icon = btn.querySelector('i');
        if (icon) {
            // In the new design, we ALWAYS use filled icons.
            // But we ensure they are filled here just in case.
            icon.classList.forEach(cls => {
                if (cls.startsWith('bi-') && cls !== 'bi' && !cls.endsWith('-fill')) {
                    icon.classList.remove(cls);
                    icon.classList.add(cls + '-fill');
                }
            });
        }
    });

    const activeBtn = document.getElementById('nav-tab-' + tabId);
    if (activeBtn) {
        activeBtn.classList.add('active');
        activeBtn.style.opacity = '1';
        const icon = activeBtn.querySelector('i');
        if (icon) {
            // Ensure filled icon + full opacity
            icon.classList.forEach(cls => {
                if (cls.startsWith('bi-') && cls !== 'bi' && !cls.endsWith('-fill')) {
                    icon.classList.remove(cls);
                    icon.classList.add(cls + '-fill');
                }
            });
        }
    }

    // 2. Determine target screen
    const screenId = TAB_SCREEN_MAP[tabId] || ('screen-' + tabId);
    showScreen(screenId);

    // 3. Toggle internal tab content if inside screen-lobby
    if (screenId === 'screen-lobby') {
        document.querySelectorAll('#screen-lobby .tab-content').forEach(tc => {
            if (tc.id === 'tab-' + tabId) {
                tc.style.display = 'block';
                tc.classList.add('active-tab');
            } else {
                tc.style.display = 'none';
                tc.classList.remove('active-tab');
            }
        });
    }
}

// === MODALS ===


function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('active');
        modal.classList.add('show'); // Bootstrap compatibility
        modal.style.display = 'flex'; // Ensure visibility
        if (window.ThemeManager) {
            window.ThemeManager.triggerHaptic('impact', 'medium');
        }
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('active');
        modal.classList.remove('show');
        modal.style.display = 'none';
        if (window.ThemeManager) {
            window.ThemeManager.triggerHaptic('impact', 'light');
        }
    }
}

function setupModalClosing() {
    // 1. Click on overlay to close
    document.querySelectorAll('.custom-modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                closeModal(overlay.id);
            }
        });
    });

    // 2. Global listener for dismiss buttons (Bootstrap compatibility)
    document.addEventListener('click', (e) => {
        const dismissBtn = e.target.closest('[data-bs-dismiss="modal"]');
        if (dismissBtn) {
            const modal = dismissBtn.closest('.modal, .custom-modal-overlay');
            if (modal && modal.id) {
                closeModal(modal.id);
            }
        }
    });
}

// === ALERTS & NOTIFICATIONS ===

function showAlert(title, message, type = 'info') { // type: info, success, error, warning
    const alertId = 'custom-alert-' + Date.now();
    const iconMap = {
        'info': 'bi-info-circle',
        'success': 'bi-check-circle',
        'error': 'bi-exclamation-octagon',
        'warning': 'bi-exclamation-triangle'
    };
    const colorMap = {
        'info': 'primary',
        'success': 'success',
        'error': 'danger',
        'warning': 'warning'
    };

    const alertHtml = `
    <div id="${alertId}" class="custom-modal-overlay active show" style="z-index: 100000; display: flex;">
        <div class="custom-modal-content p-4 text-center animate__animated animate__bounceIn">
            <div class="text-${colorMap[type]} mb-3" style="font-size: 3rem;">
                <i class="bi ${iconMap[type]}"></i>
            </div>
            <h4 class="fw-bold mb-2">${title}</h4>
            <div class="text-muted mb-4">${message}</div>
            <button class="glass-btn glass-btn-${colorMap[type]} w-100 py-3" onclick="closeAlert('${alertId}')">
                OK
            </button>
        </div>
    </div>
    `;

    document.body.insertAdjacentHTML('beforeend', alertHtml);

    if (window.ThemeManager) {
        window.ThemeManager.triggerHaptic('notification', type === 'info' ? 'success' : type);
    }
}

function closeAlert(id) {
    const el = document.getElementById(id);
    if (el) {
        el.classList.remove('show');
        setTimeout(() => el.remove(), 200);
    }
}

function showConfirmation(title, message, onConfirm, options = {}) {
    const confirmId = 'confirm-' + Date.now();
    const confirmText = options.confirmText || 'Подтвердить';
    const cancelText = options.cancelText || 'Отмена';
    const isDanger = options.isDanger || false;

    const html = `
    <div id="${confirmId}" class="custom-modal-overlay active show" style="z-index: 100000; display: flex;">
        <div class="custom-modal-content p-4 text-center animate__animated animate__fadeInUp">
            <h4 class="fw-bold mb-3">${title}</h4>
            <p class="text-muted mb-4">${message}</p>
            <div class="d-grid gap-2">
                <button class="glass-btn ${isDanger ? 'glass-btn-danger' : 'glass-btn-primary'} w-100 py-3" id="${confirmId}-yes">
                    ${confirmText}
                </button>
                <button class="glass-btn w-100 py-3" onclick="closeAlert('${confirmId}')" style="background: var(--divider);">
                    ${cancelText}
                </button>
            </div>
        </div>
    </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);

    const yesBtn = document.getElementById(confirmId + '-yes');
    if (yesBtn) {
        yesBtn.onclick = () => {
            closeAlert(confirmId);
            if (typeof onConfirm === 'function') onConfirm();
        };
    }
}

function showPrompt(title, message, onConfirm, options = {}) {
    const promptId = 'prompt-' + Date.now();
    const confirmText = options.confirmText || 'OK';
    const cancelText = options.cancelText || 'Отмена';
    const placeholder = options.placeholder || '';
    const defaultValue = options.defaultValue || '';
    const presets = options.presets || [];

    let presetsHtml = '';
    if (presets.length > 0) {
        presetsHtml = '<div class="d-flex flex-wrap gap-2 mb-3 justify-content-center">';
        presets.forEach(p => {
            const val = typeof p === 'string' ? p : p.value;
            const label = typeof p === 'string' ? p : p.label;
            const icon = p.icon ? `<i class="bi ${p.icon} me-1"></i>` : '';
            presetsHtml += `<button class="btn btn-sm btn-outline-secondary rounded-pill d-flex align-items-center" onclick="document.getElementById('${promptId}-input').value = '${val}'; document.getElementById('${promptId}-input').focus();">${icon}${label}</button>`;
        });
        presetsHtml += '</div>';
    }

    const html = `
    <div id="${promptId}" class="custom-modal-overlay active show" style="z-index: 100000; display: flex;">
        <div class="custom-modal-content p-4 text-center animate__animated animate__fadeInUp">
            <h4 class="fw-bold mb-3">${title}</h4>
            <p class="text-muted mb-3">${message}</p>
            <input type="text" id="${promptId}-input" class="form-control mb-3" placeholder="${placeholder}" value="${defaultValue}" style="border-radius: 12px; padding: 12px;">
            ${presetsHtml}
            <div class="d-grid gap-2">
                <button class="glass-btn glass-btn-primary w-100 py-3" id="${promptId}-yes">
                    ${confirmText}
                </button>
                <button class="glass-btn w-100 py-3" onclick="closeAlert('${promptId}')" style="background: var(--divider);">
                    ${cancelText}
                </button>
            </div>
        </div>
    </div>
    `;

    document.body.insertAdjacentHTML('beforeend', html);

    const input = document.getElementById(`${promptId}-input`);
    if (input) {
        input.focus();
        input.addEventListener('keyup', (e) => {
            if (e.key === 'Enter') document.getElementById(`${promptId}-yes`).click();
        });
    }

    const yesBtn = document.getElementById(`${promptId}-yes`);
    if (yesBtn) {
        yesBtn.onclick = () => {
            const val = input ? input.value : '';
            if (val.trim()) {
                closeAlert(promptId);
                if (typeof onConfirm === 'function') onConfirm(val);
            } else {
                // animation shake?
                input.style.border = '1px solid red';
            }
        };
    }
}

function showLoading(title, message) {
    const id = 'loader-' + Date.now();
    const html = `
    <div id="${id}" class="custom-modal-overlay active show" style="z-index: 100000; display: flex;">
        <div class="custom-modal-content p-4 text-center animate__animated animate__fadeInUp" style="width: 300px;">
            <h5 class="fw-bold mb-3">${title}</h5>
            <div class="progress mb-2" style="height: 8px; border-radius: 4px; background: rgba(0,0,0,0.05);">
                <div id="${id}-bar" class="progress-bar progress-bar-striped progress-bar-animated bg-primary" style="width: 5%"></div>
            </div>
            <p id="${id}-text" class="text-muted small mb-0 animated flash infinite slow">${message}</p>
        </div>
    </div>`;

    document.body.insertAdjacentHTML('beforeend', html);

    return {
        update: (percent, text) => {
            const bar = document.getElementById(id + '-bar');
            const txt = document.getElementById(id + '-text');
            if (bar) bar.style.width = percent + '%';
            if (txt && text) txt.innerText = text;
        },
        close: () => {
            const el = document.getElementById(id);
            if (el) {
                el.classList.remove('show');
                setTimeout(() => el.remove(), 200);
            }
        }
    };
}

// === SAFE DOM MANIPULATION ===

function safeText(id, text) {
    const el = document.getElementById(id);
    if (el) el.innerText = text;
}

function safeStyle(id, prop, val) {
    const el = document.getElementById(id);
    if (el) el.style[prop] = val;
}

function safeClass(id, action, className) {
    const el = document.getElementById(id);
    if (el) {
        if (action === 'add') el.classList.add(className);
        else if (action === 'remove') el.classList.remove(className);
    }
}

function safeSrc(id, src) {
    const el = document.getElementById(id);
    if (el) el.src = src;
}

// === NOTIFICATIONS ===

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

// === GESTURES ===

function setupSwipeGestures() {
    let touchStartX = 0;
    let touchStartY = 0;
    const SWIPE_THRESHOLD = 80;
    const EDGE_ZONE = 40;

    document.addEventListener('touchstart', (e) => {
        const touch = e.touches[0];
        touchStartX = touch.clientX;
        touchStartY = touch.clientY;
    }, { passive: true });

    document.addEventListener('touchend', (e) => {
        if (touchStartX > EDGE_ZONE) return;

        const touch = e.changedTouches[0];
        const deltaX = touch.clientX - touchStartX;
        const deltaY = Math.abs(touch.clientY - touchStartY);
        if (deltaX > SWIPE_THRESHOLD && deltaX > deltaY * 1.5) {
            handleSwipeBack();
        }

    }, { passive: true });
}

function handleSwipeBack() {
    // Check which screen is active and go back
    const friendsScreen = document.getElementById('screen-friends');
    const leaderboardScreen = document.getElementById('screen-leaderboard');
    const profileEditScreen = document.getElementById('screen-profile-edit');
    const settingsScreen = document.getElementById('screen-settings');

    if (friendsScreen && friendsScreen.classList.contains('active-screen')) {
        if (window.showScreen) window.showScreen('lobby');
    } else if (leaderboardScreen && leaderboardScreen.classList.contains('active-screen')) {
        if (window.showScreen) window.showScreen('lobby');
    } else if (profileEditScreen && profileEditScreen.classList.contains('active-screen')) {
        if (window.closeProfileEditor) window.closeProfileEditor();
    } else if (settingsScreen && settingsScreen.classList.contains('active-screen')) {
        if (window.showScreen) window.showScreen('lobby');
        if (window.switchTab) window.switchTab('profile');
    }
}

// === GAME TOGGLES (UI) ===
function toggleGameLike(gameId, el) {
    // 1. Handle Legacy Icon Toggle (Lobby Cards)
    const icon = el.querySelector('i');
    if (icon) {
        if (icon.classList.contains('bi-heart')) {
            icon.classList.remove('bi-heart');
            icon.classList.add('bi-heart-fill', 'text-danger');
            icon.style.transform = 'scale(1.2)';
            setTimeout(() => icon.style.transform = 'scale(1)', 200);
            if (window.ThemeManager) window.ThemeManager.triggerHaptic('selection');
        } else {
            icon.classList.add('bi-heart');
            icon.classList.remove('bi-heart-fill', 'text-danger');
        }
    }
    // 2. Handle SVG Toggle (Game Detail) is handled by caller (optimistic), 
    // but we function as the data layer here.

    // Send to backend (Fire & Forget style, but with error logging)
    if (window.apiRequest) {
        return window.apiRequest({ action: 'toggle_like', game_id: gameId }).then(res => {
            // Success - Update Global State
            if (window.userFavorites) {
                if (res.is_liked) {
                    if (!window.userFavorites.includes(gameId)) window.userFavorites.push(gameId);
                } else {
                    window.userFavorites = window.userFavorites.filter(id => id !== gameId);
                }
            }

            // === SYNC UI ACROSS APP (Lobby Cards, etc) ===
            const allLikeBtns = document.querySelectorAll(`[data-like-game-id="${gameId}"]`);
            allLikeBtns.forEach(btn => {
                const i = btn.querySelector('i');
                if (i) {
                    if (res.is_liked) {
                        i.classList.remove('bi-heart');
                        i.classList.add('bi-heart-fill', 'text-danger');
                        // Optional: Small pulse for feedback
                        i.style.transform = 'scale(1.2)';
                        setTimeout(() => i.style.transform = 'scale(1)', 200);
                    } else {
                        i.classList.add('bi-heart');
                        i.classList.remove('bi-heart-fill', 'text-danger');
                    }
                }
            });

            return res;
        }).catch(err => {
            console.error("Like Error API:", err);
            // Revert visual state on error (Legacy Only)
            if (icon) {
                if (icon.classList.contains('bi-heart')) {
                    icon.classList.remove('bi-heart');
                    icon.classList.add('bi-heart-fill', 'text-danger');
                } else {
                    icon.classList.add('bi-heart');
                    icon.classList.remove('bi-heart-fill', 'text-danger');
                }
            }
            throw err; // Re-throw so caller (SVG logic) can revert too
        });
    }
    return Promise.resolve(); // Fallback if no apiRequest
}

function toggleGameSelect(gameId, el) {
    // Visual selection logic
    const card = el.closest('.game-card');
    if (card) {
        // Deselect others if needed, or toggle class
    }
    if (window.ThemeManager) window.ThemeManager.triggerHaptic('selection');
}


// Attach to window
window.UIManager = {
    showScreen,
    switchTab,
    openModal,
    closeModal,
    setupModalClosing,
    showAlert,
    showConfirmation,
    closeAlert,
    safeText,
    safeStyle,
    safeClass,
    safeSrc,
    toggleGameLike,
    toggleGameSelect,
    updateNotificationBadge,
    setupSwipeGestures,
    handleRouting,
    TAB_SCREEN_MAP,
    ROUTE_ACTIONS
};

// Global aliases for convenience and HTML inline events
window.showScreen = showScreen;
window.switchTab = switchTab;
window.openModal = openModal;
window.closeModal = closeModal;
window.showAlert = showAlert;
window.showAlert = showAlert;
window.showConfirmation = showConfirmation;
window.showPrompt = showPrompt;
window.showLoading = showLoading;
window.closeAlert = closeAlert;
window.safeText = safeText;
window.safeStyle = safeStyle;
window.safeClass = safeClass;
window.safeSrc = safeSrc;
window.setupModalClosing = setupModalClosing;
window.updateNotificationBadge = updateNotificationBadge;
window.setupSwipeGestures = setupSwipeGestures;
window.handleRouting = handleRouting;
window.showModal = openModal; // Alias for backward compatibility
window.toggleGameLike = toggleGameLike; // Global export for inline events
