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

    // Scroll to top
    window.scrollTo(0, 0);

    // Update Tab Bar visibility
    const tabBar = document.querySelector('.bottom-nav');
    if (tabBar) {
        const navScreens = ['screen-lobby', 'screen-leaderboard', 'screen-friends'];
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

const TAB_SCREEN_MAP = {
    'home': 'screen-lobby',
    'games': 'screen-lobby',
    'profile': 'screen-lobby',
    'leaderboard': 'screen-leaderboard'
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
    document.querySelectorAll('.custom-modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                closeModal(overlay.id);
            }
        });
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

    const yesBtn = document.getElementById(`${confirmId}-yes`);
    if (yesBtn) {
        yesBtn.onclick = () => {
            closeAlert(confirmId);
            if (typeof onConfirm === 'function') onConfirm();
        };
    }
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
    const icon = el.querySelector('i');
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
    // TODO: Send to backend
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
    setupSwipeGestures
};

// Global aliases for convenience and HTML inline events
window.showScreen = showScreen;
window.switchTab = switchTab;
window.openModal = openModal;
window.closeModal = closeModal;
window.showAlert = showAlert;
window.showConfirmation = showConfirmation;
window.closeAlert = closeAlert;
window.safeText = safeText;
window.safeStyle = safeStyle;
window.safeClass = safeClass;
window.safeSrc = safeSrc;
window.setupModalClosing = setupModalClosing;
window.updateNotificationBadge = updateNotificationBadge;
window.setupSwipeGestures = setupSwipeGestures;
window.showModal = openModal; // Alias for backward compatibility
