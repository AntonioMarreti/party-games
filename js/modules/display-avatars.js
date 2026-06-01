/**
 * Avatar Display Module
 * Handles rendering of user avatars and the full-screen viewer.
 * attached to window for backward compatibility with app.js
 */

// Global Map for Avatar Data (used by viewer)
if (!window.avatarDataMap) {
    window.avatarDataMap = {};
}

const AVATAR_PALETTES = [
    'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', // Violet/Indigo
    'linear-gradient(135deg, #89f7fe 0%, #66a6ff 100%)', // Blue/Cyan
    'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)', // Rose/Pink (soft)
    'linear-gradient(135deg, #f6d365 0%, #fda085 100%)', // Amber/Orange
    'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)', // Emerald/Teal
    'linear-gradient(135deg, #29323c 0%, #485563 100%)', // Slate/Night
    'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)', // Lavender
    'linear-gradient(135deg, #a1c4fd 0%, #c2e9fb 100%)', // Ocean (soft blue)
    'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)', // Peach
    'linear-gradient(135deg, #cfd9df 0%, #e2ebf0 100%)', // Silver/Grey
];

function getAvatarSeed(user) {
    let str = String(user?.id || user?.username || user?.first_name || '0');
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = (hash << 5) - hash + str.charCodeAt(i) | 0;
    return Math.abs(hash);
}

function getUserInitials(user, isSmall = false) {
    const name = getFallbackName(user);
    if (!name || name === 'Игрок') return '?';
    const parts = name.trim().split(/[\s_-]+/);
    if (isSmall) {
        return parts[0].charAt(0).toUpperCase();
    }
    if (parts.length >= 2) {
        return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
}

function escapeAvatarHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    }[char]));
}

function isSafeAvatarUrl(value) {
    if (typeof value !== 'string' || !value.trim()) return false;
    try {
        const url = new URL(value, window.location.href);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch (e) {
        return false;
    }
}

function getSafeAvatarUrl(value) {
    if (!isSafeAvatarUrl(value)) return '';
    return String(value).trim();
}

function isSafeAvatarImageSrc(value) {
    const src = String(value || '').trim();
    if (!src) return false;
    if (getSafeAvatarUrl(src)) return true;
    if (/^data:image\/(?:png|jpe?g|webp|gif);base64,[a-z0-9+/=\s]+$/i.test(src)) return true;
    if (/^(?:server\/)?avatars\/[a-zA-Z0-9._/-]+$/.test(src)) return true;
    return false;
}

function getSafeAvatarImageSrc(value) {
    const src = String(value || '').trim();
    return isSafeAvatarImageSrc(src) ? src : '';
}

function getFallbackName(user) {
    const name = String(user?.custom_name || user?.first_name || user?.username || 'Игрок')
        .replace(/[\u0000-\u001F\u007F]/g, '')
        .trim();
    return name || 'Игрок';
}

function getAvatarImg(src, style, altText = 'Avatar', onerrorCode = "this.style.display='none';", extraAttrs = '') {
    const safeSrc = escapeAvatarHtml(src);
    const safeAlt = escapeAvatarHtml(altText);
    return `<img src="${safeSrc}" alt="${safeAlt}" style="${style}" onerror="${onerrorCode}" ${extraAttrs}>`;
}

/**
 * Renders an avatar (Circle or Square) based on user data
 * @param {Object} user User object
 * @param {String} sizeStr 'sm', 'md', 'lg', 'xl' (default: md)
 * @param {Boolean} isLink If true, only returns the URL/Style, not the <img> tag (Legacy mode)
 * @param {Boolean} disableClick If true, won't add onclick for fullscreen viewer
 */
export function renderAvatar(user, sizeStr = 'md', isLink = false, disableClick = false) {
    if (!user) return '';

    // Generate unique ID for this instance to attach data
    // (Optimization: We only need to store data if we are going to click it)
    // But since this is a pure render function, we might just use the user.id or generate a temp one
    const tempUid = 'av_' + Math.random().toString(36).substr(2, 9);
    window.avatarDataMap[tempUid] = user;

    let sizePx = 40;
    if (sizeStr === 'sm') sizePx = 32;
    if (sizeStr === 'lg') sizePx = 64;
    if (sizeStr === 'xl') sizePx = 100; // Profile

    const seed = getAvatarSeed(user);
    const palette = AVATAR_PALETTES[seed % AVATAR_PALETTES.length];

    if (isLink) {
        // Return just the style string for background-image (Legacy support)
        const safePhotoUrl = getSafeAvatarUrl(user.photo_url);
        if (safePhotoUrl && user.photo_url !== '🤖') {
            return `background-image: url('${safePhotoUrl.replace(/'/g, "%27")}')`;
        } else if (user.custom_avatar) {
            try {
                const cfg = JSON.parse(user.custom_avatar);
                const safeCfgSrc = getSafeAvatarImageSrc(cfg.src);
                if (cfg.type !== 'emoji' && safeCfgSrc) {
                    return `background-image: url('${safeCfgSrc.replace(/'/g, "%27")}')`;
                }
            } catch (e) {
                let path = user.custom_avatar;
                if (!path.startsWith('http') && !path.startsWith('server/')) {
                    if (!path.startsWith('avatars/')) path = 'avatars/' + path;
                    path = 'server/' + path;
                }
                if (getSafeAvatarImageSrc(path)) {
                    return `background-image: url('${String(path).replace(/'/g, "%27")}')`;
                }
            }
        }
        return `background: ${palette};`;
    }

    let innerContent = '';
    let bgColor = palette; // Default to gradient
    let isEmoji = false;
    let emojiVal = '';

    const imgStyle = `position:absolute; top:0; left:0; width:100%; height:100%; object-fit:cover; border-radius:50%;`;
    const altName = getFallbackName(user);

    // 1. Custom Avatar (Prioritize over Telegram/Default photo)
    if (user.custom_avatar) {
        try {
            const cfg = JSON.parse(user.custom_avatar);
            if (cfg.type === 'emoji') {
                isEmoji = true;
                emojiVal = escapeAvatarHtml(cfg.value || '👤');
                bgColor = /^#[0-9a-f]{3,8}$/i.test(cfg.bg || '') ? cfg.bg : palette;
            } else {
                const safeCfgSrc = getSafeAvatarImageSrc(cfg.src);
                if (safeCfgSrc) innerContent = getAvatarImg(safeCfgSrc, imgStyle, altName);
            }
        } catch (e) {
            // Legacy path string
            let path = user.custom_avatar;
            if (!path.startsWith('http') && !path.startsWith('server/')) {
                if (!path.startsWith('avatars/')) path = 'avatars/' + path;
                path = 'server/' + path;
            }
            if (getSafeAvatarImageSrc(path)) {
                innerContent = getAvatarImg(path, imgStyle, altName);
            }
        }
    }
    // 2. Photo URL (Telegram or External)
    else if (getSafeAvatarUrl(user.photo_url)) {
        innerContent = getAvatarImg(getSafeAvatarUrl(user.photo_url), imgStyle, altName);
    }

    // Render Container
    const clickHandler = disableClick ? '' : `onclick="event.stopPropagation(); if(window.openAvatarViewer) window.openAvatarViewer('${tempUid}')"`;
    const cursorStyle = disableClick ? '' : 'cursor:pointer;';

    if (isEmoji) {
        const fontSize = Math.floor(sizePx * 0.6);
        return `
            <div class="avatar-circle" 
                 ${clickHandler}
                 style="display:flex; align-items:center; justify-content:center; width:${sizePx}px; height:${sizePx}px; background:${bgColor}; border-radius:50%; ${cursorStyle} overflow:hidden;">
                <span style="font-size:${fontSize}px; line-height:1;">${emojiVal}</span>
            </div>
        `;
    } else {
        const initials = escapeAvatarHtml(getUserInitials(user, sizeStr === 'sm'));
        const fontSize = sizeStr === 'sm' ? Math.floor(sizePx * 0.5) : Math.floor(sizePx * 0.45);
        return `
            <div class="avatar-wrapper" style="position:relative; display:flex; align-items:center; justify-content:center; width:${sizePx}px; height:${sizePx}px; border-radius:50%; overflow:hidden; background:${palette}; box-shadow:inset 0 1px 0 rgba(255,255,255,0.2); ${cursorStyle}" ${clickHandler}>
                <span style="position:absolute; top:0; left:0; width:100%; height:100%; display:flex; align-items:center; justify-content:center; color:#fff; font-size:${fontSize}px; font-weight:700; user-select:none; text-shadow:0 1px 2px rgba(0,0,0,0.15); pointer-events:none;">${initials}</span>
                ${innerContent}
            </div>
        `;
    }
}

/**
 * Opens the full-screen avatar viewer
 * Uses window.showModal which is expected to be available from app.js
 */
export function openAvatarViewer(uidOrStr) {
    let user;

    // Check if it's a map key
    if (window.avatarDataMap && window.avatarDataMap[uidOrStr]) {
        user = window.avatarDataMap[uidOrStr];
    } else {
        // Fallback for legacy calls or direct object passing
        if (typeof uidOrStr === 'string') {
            try { user = JSON.parse(uidOrStr); } catch (e) { console.error("Avatar Viewer JSON Error", e); return; }
        } else {
            user = uidOrStr;
        }
    }

    const container = document.getElementById('avatar-view-container');
    if (!container) return;

    // Reuse getAvatarStyle logic but refined for full img
    let content = '';

    const seed = getAvatarSeed(user);
    const palette = AVATAR_PALETTES[seed % AVATAR_PALETTES.length];
    const initials = escapeAvatarHtml(getUserInitials(user));

    // Check Photo
    const viewerStyle = 'position:absolute; top:0; left:0; width:100%; height:100%; object-fit:cover; border-radius:50%;';
    const altName = getFallbackName(user);

    // Fallback error handler for viewer
    const fallbackOnerror = `if(window.handleViewerAvatarError) window.handleViewerAvatarError(this)`;
    const safeKey = escapeAvatarHtml(typeof uidOrStr === 'string' ? uidOrStr : JSON.stringify(uidOrStr));
    const extraAttrs = `data-avatar-viewer-key="${safeKey}"`;

    if (getSafeAvatarUrl(user.photo_url) && user.photo_url !== '🤖') {
        content = getAvatarImg(getSafeAvatarUrl(user.photo_url), viewerStyle, altName, fallbackOnerror, extraAttrs);
    } else if (user.custom_avatar) {
        try {
            const cfg = JSON.parse(user.custom_avatar);
            if (cfg.type === 'emoji') {
                const bg = /^#[0-9a-f]{3,8}$/i.test(cfg.bg || '') ? cfg.bg : palette;
                content = `<div style="width:100%; height:100%; background:${bg}; display:flex; align-items:center; justify-content:center; font-size:120px;">${escapeAvatarHtml(cfg.value || '👤')}</div>`;
            } else {
                const safeCfgSrc = getSafeAvatarImageSrc(cfg.src);
                if (safeCfgSrc) content = getAvatarImg(safeCfgSrc, viewerStyle, altName, fallbackOnerror, extraAttrs);
            }
        } catch (e) {
            // Drawn avatar path
            let path = user.custom_avatar;
            if (!path.startsWith('http') && !path.startsWith('server/')) {
                if (!path.startsWith('avatars/')) path = 'avatars/' + path;
                path = 'server/' + path;
            }
            if (getSafeAvatarImageSrc(path)) {
                content = getAvatarImg(path, viewerStyle, altName, fallbackOnerror, extraAttrs);
            }
        }
    }

    if (!content) {
        // No image, render fallback directly
        content = `<div style="width:100%; height:100%; background:${palette}; display:flex; align-items:center; justify-content:center;">
            <span style="font-size:120px; color:#fff; font-weight:700; user-select:none; text-shadow:0 2px 10px rgba(0,0,0,0.2);">${initials}</span>
        </div>`;
    }

    container.innerHTML = content;

    // Dependency: showModal is in app.js (global)
    if (window.showModal) {
        window.showModal('modal-avatar-view');
    } else {
        console.error("showModal is not defined globaly");
    }
}

export function handleViewerAvatarError(imgEl) {
    if (!imgEl) return;
    const container = imgEl.parentElement;
    if (!container) return;

    const key = imgEl.dataset.avatarViewerKey;
    if (!key) return;

    let user;
    if (window.avatarDataMap && window.avatarDataMap[key]) {
        user = window.avatarDataMap[key];
    } else {
        try { user = JSON.parse(key); } catch (e) { return; }
    }

    const seed = getAvatarSeed(user);
    const palette = AVATAR_PALETTES[seed % AVATAR_PALETTES.length];
    const initials = escapeAvatarHtml(getUserInitials(user));

    container.innerHTML = `<div style="width:100%; height:100%; background:${palette}; display:flex; align-items:center; justify-content:center;">
        <span style="font-size:120px; color:#fff; font-weight:700; user-select:none; text-shadow:0 2px 10px rgba(0,0,0,0.2);">${initials}</span>
    </div>`;
}

// === EXPOSE TO WINDOW (Legacy Bridge) ===
window.renderAvatar = renderAvatar;
window.openAvatarViewer = openAvatarViewer;
window.handleViewerAvatarError = handleViewerAvatarError;
