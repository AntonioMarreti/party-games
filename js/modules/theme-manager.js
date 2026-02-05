/**
 * Theme Manager Module
 * Handles application theme, visual settings, and haptics.
 */

const DEFAULT_SETTINGS = {
    noAnimations: false,
    haptics: true,
    notificationsEnabled: true,
    thermalSafe: false
};

// Internal state
let appSettings = Object.assign({}, DEFAULT_SETTINGS); // Initialize with defaults immediately
// will be merged with storage in loadSettings()

// === THEME MANAGEMENT ===
// Internal function: Dynamic style injection to fix Safari/WebKit repaint bug
function _updateThemeStyles(explicitColor = null) {
    const root = document.documentElement;
    const primary = explicitColor || root.style.getPropertyValue('--custom-primary') || '#6C5CE7';

    // We determine dark mode from body class, which is managed by applySettings()
    const isDark = document.body.classList.contains('dark-mode');
    const mixColor = isDark ? 'black' : 'white';

    const headerBgGradient = `linear-gradient(135deg, ${primary} 0%, color-mix(in srgb, ${primary}, ${mixColor} 20%) 100%)`;

    document.querySelectorAll('.header-bg').forEach(el => {
        el.style.setProperty('background', headerBgGradient, 'important');
    });

    let styleTag = document.getElementById('dynamic-theme-overrides');
    if (!styleTag) {
        styleTag = document.createElement('style');
        styleTag.id = 'dynamic-theme-overrides';
        document.head.appendChild(styleTag);
    }

    styleTag.innerHTML = `
        .text-primary, .spinner-border.text-primary, .game-card h4, .action-icon {
            color: ${primary} !important;
        }
        .btn-primary, .btn-action {
            background-color: ${primary} !important;
            border-color: ${primary} !important;
        }
        .progress-bar {
            background-color: ${primary} !important;
        }
    `;
}

// Public API
function applyAccentColor(color) {
    if (!color) return;

    const root = document.documentElement;
    root.style.setProperty('--custom-primary', color);
    root.style.setProperty('--primary-color', color);

    const isDark = document.body.classList.contains('dark-mode');
    const mixColor = isDark ? 'black' : 'white';

    root.style.setProperty('--header-gradient',
        `linear-gradient(135deg, ${color} 0%, color-mix(in srgb, ${color}, ${mixColor} 20%) 100%)`);
    root.style.setProperty('--primary-gradient',
        `linear-gradient(135deg, ${color} 0%, color-mix(in srgb, ${color}, ${mixColor} 20%) 100%)`);

    // Shadow updates
    root.style.setProperty('--shadow-sm', `0 4px 15px color-mix(in srgb, ${color}, transparent 90%)`);
    root.style.setProperty('--shadow-md', `0 10px 30px color-mix(in srgb, ${color}, transparent 85%)`);
    root.style.setProperty('--shadow-lg', `0 20px 40px color-mix(in srgb, ${color}, transparent 80%)`);
    root.style.setProperty('--shadow-primary', `0 10px 25px color-mix(in srgb, ${color}, transparent 60%)`);

    localStorage.setItem('pgb_accent_color', color);
    _updateThemeStyles(color);
    triggerHaptic('selection');

    if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.setHeaderColor) {
        window.Telegram.WebApp.setHeaderColor(color);
    }
}

// === SETTINGS MANAGEMENT ===
function loadSettings() {
    let stored = {};
    try {
        stored = JSON.parse(localStorage.getItem('pgb_settings')) || {};
    } catch (e) { console.error('Settings parse error', e); }

    appSettings = { ...DEFAULT_SETTINGS, ...stored };

    // Auto-detect thermal safe logic
    if (typeof stored.thermalSafe === 'undefined') {
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
        if (isIOS) appSettings.thermalSafe = true;
    }

    applySettings();
    syncUI();
}

function applySettings() {
    const body = document.body;

    // Toggle Classes
    body.classList.toggle('dark-mode', !!appSettings.darkMode);
    body.classList.toggle('no-animations', !!appSettings.noAnimations);
    body.classList.toggle('simple-bg', !!appSettings.simpleBg);
    body.classList.toggle('large-font', !!appSettings.largeFont);
    body.classList.toggle('thermal-safe', !!appSettings.thermalSafe);

    // Refresh theme if dark mode changed (to update mix colors)
    const savedColor = localStorage.getItem('pgb_accent_color');
    if (savedColor) {
        _updateThemeStyles(savedColor);
    }
}

function syncUI() {
    const switches = ['noAnimations', 'haptics', 'simpleBg', 'largeFont', 'privacyLeaderboard', 'notificationsEnabled', 'soundEnabled', 'thermalSafe', 'darkMode'];
    switches.forEach(key => {
        const el = document.getElementById('setting-' + key);
        if (el) {
            if (key === 'soundEnabled' && window.audioManager) {
                el.checked = window.audioManager.enabled;
            } else {
                el.checked = !!appSettings[key];
            }
        }
    });

    // Sync Color Buttons
    const savedColor = localStorage.getItem('pgb_accent_color');
    if (savedColor) {
        setTimeout(() => {
            document.querySelectorAll('.color-option-btn').forEach(btn => {
                btn.classList.remove('selected');
                const btnColor = btn.style.background || btn.style.backgroundColor;
                if (btnColor && btnColor.toLowerCase().replace(/\s/g, '') === savedColor.toLowerCase().replace(/\s/g, '')) {
                    btn.classList.add('selected');
                }
            });
        }, 100);
    }
}

function toggleSetting(key, value) {
    appSettings[key] = value;
    localStorage.setItem('pgb_settings', JSON.stringify(appSettings));
    applySettings();
    triggerHaptic('impact', 'medium');

    // Special server sync for leaderboard privacy
    if (key === 'privacyLeaderboard' && window.apiRequest) {
        window.apiRequest({
            action: 'update_settings',
            is_hidden_in_leaderboard: value ? 0 : 1
        }).catch(err => console.error("Privacy sync failed", err));
    }
}

// === HAPTICS ===
function triggerHaptic(type = 'impact', detail = 'light') {
    if (!appSettings.haptics) return;
    try {
        const tg = window.Telegram?.WebApp;
        if (!tg) return;

        if (tg.HapticFeedback && tg.isVersionAtLeast && tg.isVersionAtLeast('6.1')) {
            if (type === 'impact') tg.HapticFeedback.impactOccurred(detail);
            else if (type === 'notification') tg.HapticFeedback.notificationOccurred(detail);
            else if (type === 'selection') tg.HapticFeedback.selectionChanged();
        } else {
            // Basic Vibrate API fallback
            const hasInteracted = (navigator.userActivation && typeof navigator.userActivation.hasBeenActive !== 'undefined')
                ? navigator.userActivation.hasBeenActive : true;

            if (type === 'impact' && hasInteracted && 'vibrate' in navigator) {
                navigator.vibrate(10);
            }
        }
    } catch (e) {
        console.warn("Haptics error:", e);
    }
}

// Attach to window for global access
window.ThemeManager = {
    loadSettings,
    applyAccentColor,
    toggleSetting,
    triggerHaptic,
    get settings() { return appSettings; }
};

// Aliases for backward compatibility with existing inline HTML calls
window.applyAccentColor = applyAccentColor;
window.toggleSetting = toggleSetting;
window.triggerHaptic = triggerHaptic;
window.highlightColorBtn = function (el) {
    document.querySelectorAll('.color-option-btn').forEach(btn => btn.classList.remove('selected'));
    if (el) el.classList.add('selected');
};

// Export nothing, this is a side-effect module that populates window
