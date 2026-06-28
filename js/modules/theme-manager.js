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

const TELEGRAM_DARK_CHROME_SCREEN_IDS = new Set([
    'screen-lobby',
    'screen-login',
    'screen-splash',
    'screen-game-detail'
]);

const TELEGRAM_DARK_CHROME_COLOR = '#0B1120';

const PALETTE_LIGHT_TOP_COLORS = {
    'amber-sapphire': '#EAF1F7',
    'olive-sand': '#F7F6F2',
    'lavender-graphite': '#EFEDF6',
    'burgundy-cream': '#F5ECE7',
    'jade-biscuit': '#F3E5CC',
    'azure-quartz': '#EAF3FA',
    'graphite-lemon': '#F2F1E8',
    'beige-olive': '#E5D9C6',
    'tiffany-graphite': '#E7F8F2',
    'pink-impulse': '#FFF0F3',
    'cyber-violet': '#F0F5DE',
    'turmeric-malt': '#F6E9C4',
    'volcanic-night': '#EAF0F1'
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

function getRealTelegramWebApp() {
    try {
        const tg = window.Telegram?.WebApp;
        if (!tg || tg.__PGB_MOCK === true || window.Telegram?.__PGB_MOCK === true) return null;
        return tg;
    } catch (e) {
        return null;
    }
}

function telegramVersionAtLeast(tg, version) {
    try {
        return typeof tg.isVersionAtLeast !== 'function' || tg.isVersionAtLeast(version);
    } catch (e) {
        return true;
    }
}

function normalizeOpaqueHexColor(color) {
    const value = String(color || '').trim();
    let match = value.match(/^#([0-9a-f]{3})$/i);
    if (match) {
        return '#' + match[1].split('').map(char => char + char).join('').toUpperCase();
    }

    match = value.match(/^#([0-9a-f]{4})$/i);
    if (match && match[1][3].toLowerCase() === 'f') {
        return '#' + match[1].slice(0, 3).split('').map(char => char + char).join('').toUpperCase();
    }

    match = value.match(/^#([0-9a-f]{6})$/i);
    if (match) return '#' + match[1].toUpperCase();

    match = value.match(/^#([0-9a-f]{8})$/i);
    if (match && match[1].slice(6).toLowerCase() === 'ff') {
        return '#' + match[1].slice(0, 6).toUpperCase();
    }

    return null;
}

function parseRgbColorToHex(color) {
    const value = String(color || '').trim();
    const match = value.match(/^rgba?\((.+)\)$/i);
    if (!match) return null;

    const normalized = match[1].replace(/\s*\/\s*/g, ' / ');
    const parts = normalized.includes(',')
        ? normalized.split(',').map(part => part.trim())
        : normalized.split(/\s+/).filter(Boolean);

    const slashIndex = parts.indexOf('/');
    const rgbParts = (slashIndex === -1 ? parts : parts.slice(0, slashIndex)).slice(0, 3);
    const alphaValue = slashIndex === -1 ? parts[3] : parts[slashIndex + 1];

    if (rgbParts.length !== 3) return null;
    if (alphaValue && alphaValue !== '1' && alphaValue !== '100%') return null;

    const hex = rgbParts.map(part => {
        if (part.endsWith('%')) {
            const percentage = Number.parseFloat(part);
            if (!Number.isFinite(percentage)) return null;
            return Math.round(Math.max(0, Math.min(100, percentage)) * 2.55);
        }

        const channel = Number.parseFloat(part);
        if (!Number.isFinite(channel)) return null;
        return Math.round(Math.max(0, Math.min(255, channel)));
    });

    if (hex.some(channel => channel === null)) return null;
    return '#' + hex.map(channel => channel.toString(16).padStart(2, '0')).join('').toUpperCase();
}

function resolveCssColorToHex(color) {
    const directHex = normalizeOpaqueHexColor(color);
    if (directHex) return directHex;

    const rgbHex = parseRgbColorToHex(color);
    if (rgbHex) return rgbHex;

    try {
        const root = document.documentElement;
        if (!root || !color) return null;

        const probe = document.createElement('span');
        probe.style.position = 'absolute';
        probe.style.visibility = 'hidden';
        probe.style.pointerEvents = 'none';
        probe.style.color = color;
        root.appendChild(probe);

        const resolved = parseRgbColorToHex(getComputedStyle(probe).color);
        probe.remove();
        return resolved;
    } catch (e) {
        return null;
    }
}

function getComputedThemeColorHex(tokenName) {
    try {
        const tokenValue = getComputedStyle(document.documentElement).getPropertyValue(tokenName).trim();
        return resolveCssColorToHex(tokenValue);
    } catch (e) {
        return null;
    }
}

function getActiveScreenId() {
    try {
        return document.querySelector('.screen.active-screen')?.id || '';
    } catch (e) {
        return '';
    }
}

function getPaletteLightTopColorHex() {
    const paletteId = getEffectivePalette();
    return PALETTE_LIGHT_TOP_COLORS[paletteId]
        || PALETTE_LIGHT_TOP_COLORS[themePreferences.palette]
        || PALETTE_LIGHT_TOP_COLORS[DEFAULT_THEME_PREFERENCES.palette];
}

function getAppliedTelegramChromeColors() {
    const resolvedTheme = document.documentElement.getAttribute('data-theme') || getResolvedTheme();
    const fallbackColor = resolvedTheme === 'dark' ? '#0B1120' : '#F4F6F9';
    const appBackgroundHex = getComputedThemeColorHex('--app-bg') || fallbackColor;
    const activeScreenId = getActiveScreenId();
    const headerHex = TELEGRAM_DARK_CHROME_SCREEN_IDS.has(activeScreenId)
        ? TELEGRAM_DARK_CHROME_COLOR
        : getPaletteLightTopColorHex();

    return {
        headerHex,
        backgroundHex: appBackgroundHex
    };
}

function syncTelegramChromeForActiveScreen() {
    const tg = getRealTelegramWebApp();
    if (!tg) return;

    const { headerHex, backgroundHex } = getAppliedTelegramChromeColors();

    if (headerHex && typeof tg.setHeaderColor === 'function' && telegramVersionAtLeast(tg, '6.9')) {
        try {
            tg.setHeaderColor(headerHex);
        } catch (e) {
            // Older clients can reject custom HEX header colors; the app should keep running.
        }
    }

    if (backgroundHex && typeof tg.setBackgroundColor === 'function' && telegramVersionAtLeast(tg, '6.1')) {
        try {
            tg.setBackgroundColor(backgroundHex);
        } catch (e) {
            // Background color support is best-effort in old or non-standard clients.
        }
    }
}

function syncTelegramChrome() {
    syncTelegramChromeForActiveScreen();
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
    }

    syncTelegramChromeForActiveScreen();
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
            } else {
                syncTelegramChromeForActiveScreen();
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
    syncTelegramChromeForActiveScreen,
    syncTelegramChrome,
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
    } else if (palettePreviewActive) {
        cancelPalettePreview(false);
    }

    syncTelegramChromeForActiveScreen();
});
