/**
 * Avatar Display Module
 * Handles rendering of user avatars and the full-screen viewer.
 * attached to window for backward compatibility with app.js
 */

// Global Map for Avatar Data (used by viewer)
if (!window.avatarDataMap) {
    window.avatarDataMap = {};
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

function getAvatarImg(src, style) {
    const safeSrc = escapeAvatarHtml(src);
    return `<img src="${safeSrc}" style="${style}" onerror="this.onerror=null;this.src='https://ui-avatars.com/api/?name=%D0%98%D0%B3%D1%80%D0%BE%D0%BA&background=random&size=128';">`;
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

    let style = `width:${sizePx}px; height:${sizePx}px; border-radius:50%; object-fit:cover;`;
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
        return `background-color: #bdc3c7;`;
    }

    let innerContent = '';
    let bgColor = '#eee';
    let isEmoji = false;
    let emojiVal = '';

    // 1. Custom Avatar (Prioritize over Telegram/Default photo)
    if (user.custom_avatar) {
        try {
            const cfg = JSON.parse(user.custom_avatar);
            if (cfg.type === 'emoji') {
                isEmoji = true;
                emojiVal = escapeAvatarHtml(cfg.value || '👤');
                bgColor = /^#[0-9a-f]{3,8}$/i.test(cfg.bg || '') ? cfg.bg : '#eee';
            } else {
                const safeCfgSrc = getSafeAvatarImageSrc(cfg.src);
                if (safeCfgSrc) innerContent = getAvatarImg(safeCfgSrc, style);
            }
        } catch (e) {
            // Legacy path string
            let path = user.custom_avatar;
            if (!path.startsWith('http') && !path.startsWith('server/')) {
                if (!path.startsWith('avatars/')) path = 'avatars/' + path;
                path = 'server/' + path;
            }
            if (getSafeAvatarImageSrc(path)) {
                innerContent = getAvatarImg(path, style);
            }
        }
    }
    // 2. Photo URL (Telegram or External)
    else if (getSafeAvatarUrl(user.photo_url)) {
        innerContent = getAvatarImg(getSafeAvatarUrl(user.photo_url), style);
    }
    // 3. Fallback (Initials or default)
    else {
        // Use UI Avatars or Emoji fallback
        const name = getFallbackName(user);
        const src = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random&size=${sizePx * 2}`;
        innerContent = getAvatarImg(src, style);
    }
    if (!innerContent && !isEmoji) {
        const src = `https://ui-avatars.com/api/?name=${encodeURIComponent(getFallbackName(user))}&background=random&size=${sizePx * 2}`;
        innerContent = getAvatarImg(src, style);
    }

    // Render Container
    const clickHandler = disableClick ? '' : `onclick="event.stopPropagation(); openAvatarViewer('${tempUid}')"`;
    const cursorStyle = disableClick ? '' : 'cursor:pointer;';

    if (isEmoji) {
        const fontSize = Math.floor(sizePx * 0.6);
        return `
            <div class="avatar-circle" 
                 ${clickHandler}
                 style="width:${sizePx}px; height:${sizePx}px; background:${bgColor}; display:flex; align-items:center; justify-content:center; border-radius:50%; ${cursorStyle} overflow:hidden;">
                <span style="font-size:${fontSize}px; line-height:1;">${emojiVal}</span>
            </div>
        `;
    } else {
        // Return without extra div wrapper to prevent CSS conflicts in profile-avatar-xl
        // Just add the click handler and cursor to the img tag itself if possible, 
        // or keep the wrapper but make it strictly match the size.
        return `
            <div class="avatar-wrapper" style="display:flex; width:${sizePx}px; height:${sizePx}px; border-radius:50%; overflow:hidden; ${cursorStyle}" ${clickHandler}>
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

    // Check Photo
    const viewerStyle = 'width:100%; height:100%; object-fit:cover;';
    if (getSafeAvatarUrl(user.photo_url) && user.photo_url !== '🤖') {
        content = getAvatarImg(getSafeAvatarUrl(user.photo_url), viewerStyle);
    } else if (user.custom_avatar) {
        try {
            const cfg = JSON.parse(user.custom_avatar);
            if (cfg.type === 'emoji') {
                const bg = /^#[0-9a-f]{3,8}$/i.test(cfg.bg || '') ? cfg.bg : '#eee';
                content = `<div style="width:100%; height:100%; background:${bg}; display:flex; align-items:center; justify-content:center; font-size:120px;">${escapeAvatarHtml(cfg.value || '👤')}</div>`;
            } else {
                const safeCfgSrc = getSafeAvatarImageSrc(cfg.src);
                if (safeCfgSrc) content = getAvatarImg(safeCfgSrc, viewerStyle);
            }
        } catch (e) {
            // Drawn avatar path
            let path = user.custom_avatar;
            if (!path.startsWith('http') && !path.startsWith('server/')) {
                if (!path.startsWith('avatars/')) path = 'avatars/' + path;
                path = 'server/' + path;
            }
            if (getSafeAvatarImageSrc(path)) {
                content = getAvatarImg(path, viewerStyle);
            }
        }
    }
    if (!content) {
        // UI Avatar fallback
        const name = getFallbackName(user);
        const src = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random&size=300`;
        content = getAvatarImg(src, viewerStyle);
    }

    container.innerHTML = content;

    // Dependency: showModal is in app.js (global)
    if (window.showModal) {
        window.showModal('modal-avatar-view');
    } else {
        console.error("showModal is not defined globaly");
    }
}

// === EXPOSE TO WINDOW (Legacy Bridge) ===
window.renderAvatar = renderAvatar;
window.openAvatarViewer = openAvatarViewer;
