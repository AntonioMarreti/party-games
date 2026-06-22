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

const DEFAULT_THEME_PREFERENCES = {
    preference: 'system', // system | light | dark
    palette: 'amber-sapphire'
};

const LEGACY_PALETTE_MIGRATIONS = {
    'olive-sand': 'beige-olive'
};

// Internal state
let appSettings = Object.assign({}, DEFAULT_SETTINGS);
let themePreferences = Object.assign({}, DEFAULT_THEME_PREFERENCES);
let palettePreviewActive = false;
let originalPalette = null;
let draftPalette = null;

function getTelegramColorScheme() {
    try {
        return window.Telegram?.WebApp?.colorScheme || '';
    } catch (e) {
        return '';
    }
}

function syncTelegramThemeClass() {
    document.body.classList.toggle('tg-dark-theme', getTelegramColorScheme() === 'dark');
}

function getResolvedTheme() {
    if (themePreferences.preference === 'light') return 'light';
    if (themePreferences.preference === 'dark') return 'dark';

    // System preference
    const tgScheme = getTelegramColorScheme();
    if (tgScheme) return tgScheme;

    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        return 'dark';
    }
    return 'light';
}

function getEffectivePalette() {
    return palettePreviewActive && draftPalette ? draftPalette : themePreferences.palette;
}

function applyThemeDOM(paletteId = getEffectivePalette()) {
    const root = document.documentElement;
    const body = document.body;
    const resolvedTheme = getResolvedTheme();
    const effectivePalette = paletteId || themePreferences.palette;

    root.setAttribute('data-theme-preference', themePreferences.preference);
    root.setAttribute('data-theme', resolvedTheme);
    root.setAttribute('data-palette', effectivePalette);

    if (body) {
        body.setAttribute('data-theme-preference', themePreferences.preference);
        body.setAttribute('data-theme', resolvedTheme);
        body.setAttribute('data-palette', effectivePalette);

        // Compatibility aliases
        body.classList.toggle('dark-mode', resolvedTheme === 'dark');

        // Update Telegram Header to use the new calm background token instead of bright accent
        if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.setHeaderColor) {
            try {
                // Get the computed background color from the token
                const computedStyle = getComputedStyle(root);
                let headerBg = computedStyle.getPropertyValue('--app-header-bg').trim();
                let appBg = computedStyle.getPropertyValue('--app-bg').trim();
                let colorToSet = headerBg || appBg || (resolvedTheme === 'dark' ? '#0B1120' : '#F4F6F9');

                // Telegram setHeaderColor requires hex. We might need to handle this if var resolves to non-hex,
                // but Telegram WebApp often accepts some standard colors or we fallback to basic hex if error.
                if (colorToSet.startsWith('#')) {
                    window.Telegram.WebApp.setHeaderColor(colorToSet);
                    window.Telegram.WebApp.setBackgroundColor?.(colorToSet);
                } else {
                    // Default fallback if CSS variable is not a direct hex
                    const fallbackColor = resolvedTheme === 'dark' ? '#0B1120' : '#F4F6F9';
                    window.Telegram.WebApp.setHeaderColor(fallbackColor);
                    window.Telegram.WebApp.setBackgroundColor?.(fallbackColor);
                }
            } catch (e) {
                console.error("Failed to set TG header color", e);
            }
        }
    }
}

// Public API for Theme
function applyPalette(paletteId) {
    if (!paletteId) return;
    themePreferences.palette = paletteId;
    saveThemePreferences();
    applyThemeDOM(paletteId);
    updateCurrentPaletteUI(paletteId);
    triggerHaptic('selection');
}

function getPaletteTile(paletteId) {
    if (!paletteId) return null;
    return Array.from(document.querySelectorAll('.palette-row')).find(tile => tile.dataset.palette === paletteId) || null;
}

function renderPalettePreviewUI() {
    const selectedPalette = draftPalette || themePreferences.palette;
    const activeTile = getPaletteTile(selectedPalette);
    const hero = document.getElementById('palette-hero');
    const heroName = document.getElementById('palette-hero-name');
    const cancelButton = document.getElementById('palette-cancel-button');
    const applyButton = document.getElementById('palette-apply-button');
    const isDirty = palettePreviewActive && selectedPalette !== originalPalette;

    if (hero) hero.dataset.previewPalette = selectedPalette;
    if (heroName && activeTile) {
        heroName.textContent = activeTile.querySelector('.palette-name')?.textContent || selectedPalette;
    }

    document.querySelectorAll('.palette-row').forEach(tile => {
        const isSelected = tile.dataset.palette === selectedPalette;
        tile.classList.toggle('active', isSelected);
        tile.setAttribute('aria-selected', String(isSelected));
    });

    if (cancelButton) cancelButton.textContent = isDirty ? 'Отменить' : 'Назад';
    if (applyButton) applyButton.disabled = !isDirty;
}

function beginPalettePreview() {
    originalPalette = themePreferences.palette;
    draftPalette = originalPalette;
    palettePreviewActive = true;
    applyThemeDOM(draftPalette);
    renderPalettePreviewUI();
}

function previewPalette(paletteId) {
    if (!getPaletteTile(paletteId)) return;
    if (!palettePreviewActive) beginPalettePreview();
    draftPalette = paletteId;
    applyThemeDOM(draftPalette);
    renderPalettePreviewUI();
    triggerHaptic('selection');
}

function cancelPalettePreview(navigate = true) {
    if (palettePreviewActive) {
        const paletteToRestore = originalPalette || themePreferences.palette;
        palettePreviewActive = false;
        originalPalette = null;
        draftPalette = null;
        applyThemeDOM(paletteToRestore);
        renderPalettePreviewUI();
    }
    if (navigate && window.showScreen) window.showScreen('settings');
}

function commitPalettePreview() {
    if (!palettePreviewActive || !draftPalette || draftPalette === originalPalette) return;
    const paletteToCommit = draftPalette;
    themePreferences.palette = paletteToCommit;
    saveThemePreferences();
    palettePreviewActive = false;
    originalPalette = null;
    draftPalette = null;
    applyThemeDOM(paletteToCommit);
    updateCurrentPaletteUI(paletteToCommit);
    renderPalettePreviewUI();
    triggerHaptic('selection');
    if (window.showScreen) window.showScreen('settings');
}

function applyAccentColor(color) {
    console.warn("ThemeManager.applyAccentColor is deprecated. Legacy HEX ignored. Re-applying current preferences.");
    applyThemeDOM();
}

function setThemePreference(preference) {
    if (!['system', 'light', 'dark'].includes(preference)) return;
    themePreferences.preference = preference;
    saveThemePreferences();
    applyThemeDOM();
    triggerHaptic('selection');
}

function saveThemePreferences() {
    localStorage.setItem('pgb_theme_preferences', JSON.stringify(themePreferences));
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

    // Load Theme Preferences
    let storedTheme = null;
    try {
        storedTheme = JSON.parse(localStorage.getItem('pgb_theme_preferences'));
    } catch (e) {}

    if (storedTheme && storedTheme.preference && storedTheme.palette) {
        themePreferences = { ...DEFAULT_THEME_PREFERENCES, ...storedTheme };
        const migratedPalette = LEGACY_PALETTE_MIGRATIONS[themePreferences.palette];
        if (migratedPalette) {
            themePreferences.palette = migratedPalette;
            saveThemePreferences();
        }
    } else {
        // Migrate legacy
        let migratedPreference = 'system';
        if (typeof stored.darkMode !== 'undefined') {
            migratedPreference = stored.darkMode ? 'dark' : 'light';
        }

        // Legacy accent color was saved as hex, we map to default palette
        const legacyAccent = localStorage.getItem('pgb_accent_color');
        let migratedPalette = 'amber-sapphire'; // default fallback

        themePreferences = {
            preference: migratedPreference,
            palette: migratedPalette
        };
        saveThemePreferences();
    }

    applySettings();
    syncUI();

    try {
        window.Telegram?.WebApp?.onEvent?.('themeChanged', () => {
            syncTelegramThemeClass();
            if (themePreferences.preference === 'system') {
                applyThemeDOM(getEffectivePalette());
            }
        });
    } catch (e) {
        // Theme event is optional outside Telegram.
    }

    // Listen for system theme changes if using system preference
    if (window.matchMedia) {
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
            if (themePreferences.preference === 'system') {
                applyThemeDOM(getEffectivePalette());
            }
        });
    }
}

function applySettings() {
    const body = document.body;

    // Toggle Classes
    body.classList.toggle('no-animations', !!appSettings.noAnimations);
    body.classList.toggle('simple-bg', !!appSettings.simpleBg);
    body.classList.toggle('large-font', !!appSettings.largeFont);
    body.classList.toggle('thermal-safe', !!appSettings.thermalSafe);
    syncTelegramThemeClass();

    applyThemeDOM();
}

function syncUI() {
    const switches = ['noAnimations', 'haptics', 'simpleBg', 'largeFont', 'privacyLeaderboard', 'notificationsEnabled', 'soundEnabled', 'thermalSafe'];
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

    if (typeof updateDesktopFullscreenVisibility === 'function') {
        updateDesktopFullscreenVisibility();
    }

    // Sync Theme Preferences UI
    document.querySelectorAll('input[name="themePreference"]').forEach(radio => {
        radio.checked = (radio.value === themePreferences.preference);
    });

    updateCurrentPaletteUI(themePreferences.palette);
    renderPalettePreviewUI();
}

function updateCurrentPaletteUI(paletteId) {
    const activeTile = getPaletteTile(paletteId);
    if (!activeTile) return;
    const nameEl = document.getElementById('current-palette-name');
    const previewEl = document.getElementById('current-palette-preview');
    if (nameEl) {
        const tileName = activeTile.querySelector('.palette-name');
        if (tileName) nameEl.textContent = tileName.textContent;
    }
    if (previewEl) {
        previewEl.dataset.previewPalette = paletteId;
    }
}


function toggleSetting(key, value) {
    appSettings[key] = value;

    // Clean up old darkMode legacy state if toggled from anywhere
    if (key === 'darkMode') {
        setThemePreference(value ? 'dark' : 'light');
    }

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

function updateDesktopFullscreenVisibility() {
    const tdesktopSettingEl = document.getElementById('tdesktop-fullscreen-setting');
    const tdesktopToggleEl = document.getElementById('setting-tdesktopFullscreen');
    if (tdesktopSettingEl && tdesktopToggleEl) {
        const platform = String(window.getTelegramPlatformFallback ? window.getTelegramPlatformFallback() : '').toLowerCase();
        const isDesktop = window.isTelegramDesktopLikePlatform ? window.isTelegramDesktopLikePlatform(platform) : (platform === 'tdesktop' || platform === 'macos' || platform === 'mac');

        if (isDesktop) {
            tdesktopSettingEl.style.display = '';
            tdesktopToggleEl.checked = localStorage.getItem('pgb_telegram_desktop_fullscreen_enabled') === '1';
        } else {
            tdesktopSettingEl.style.display = 'none';
        }
    }
}

// Attach to window for global access
window.ThemeManager = {
    loadSettings,
    applyPalette,
    beginPalettePreview,
    previewPalette,
    cancelPalettePreview,
    commitPalettePreview,
    applyAccentColor,
    setThemePreference,
    toggleSetting,
    triggerHaptic,
    updateDesktopFullscreenVisibility,
    get settings() { return appSettings; },
    get theme() { return themePreferences; },
    get palettePreview() {
        return {
            active: palettePreviewActive,
            originalPalette,
            draftPalette
        };
    }
};

// Aliases for backward compatibility
window.applyAccentColor = function(color) {
    // If something legacy calls this, just log it. We don't support custom hex anymore.
    console.warn("applyAccentColor is deprecated. Use applyPalette.");
};
window.applyPalette = applyPalette;
window.setThemePreference = setThemePreference;
window.toggleSetting = toggleSetting;
window.triggerHaptic = triggerHaptic;
window.updateDesktopFullscreenVisibility = updateDesktopFullscreenVisibility;

window.addEventListener('screenChanged', event => {
    if (event.detail?.screenId === 'screen-palettes') {
        if (!palettePreviewActive) beginPalettePreview();
        return;
    }
    if (palettePreviewActive) cancelPalettePreview(false);
});
