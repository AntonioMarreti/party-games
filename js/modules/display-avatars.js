/**
 * Avatar Display Module
 * Handles rendering of user avatars and the full-screen viewer.
 * attached to window for backward compatibility with app.js
 */

// Global Map for Avatar Data (used by viewer)
if (!window.avatarDataMap) {
    window.avatarDataMap = {};
}

/**
 * Renders an avatar (Circle or Square) based on user data
 * @param {Object} user User object
 * @param {String} sizeStr 'sm', 'md', 'lg', 'xl' (default: md)
 * @param {Boolean} isLink If true, only returns the URL/Style, not the <img> tag (Legacy mode)
 */
export function renderAvatar(user, sizeStr = 'md', isLink = false) {
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
        if (user.photo_url && user.photo_url !== '🤖') {
            return `background-image: url('${user.photo_url}')`;
        } else if (user.custom_avatar) {
            try {
                const cfg = JSON.parse(user.custom_avatar);
                if (cfg.type !== 'emoji') {
                    return `background-image: url('${cfg.src}')`;
                }
            } catch (e) {
                let path = user.custom_avatar;
                if (!path.startsWith('http') && !path.startsWith('server/')) {
                    if (!path.startsWith('avatars/')) path = 'avatars/' + path;
                    path = 'server/' + path;
                }
                return `background-image: url('${path}')`;
            }
        }
        return `background-color: #bdc3c7;`;
    }

    let innerContent = '';
    let bgColor = '#eee';
    let isEmoji = false;
    let emojiVal = '';

    // 1. Photo URL (Prioritize if valid URL)
    if (user.photo_url && user.photo_url.includes('http')) {
        innerContent = `<img src="${user.photo_url}" style="${style}">`;
    }
    // 2. Custom Avatar
    else if (user.custom_avatar) {
        try {
            const cfg = JSON.parse(user.custom_avatar);
            if (cfg.type === 'emoji') {
                isEmoji = true;
                emojiVal = cfg.value;
                bgColor = cfg.bg || '#eee';
            } else {
                innerContent = `<img src="${cfg.src}" style="${style}">`;
            }
        } catch (e) {
            // Legacy path string
            let path = user.custom_avatar;
            if (!path.startsWith('http') && !path.startsWith('server/')) {
                if (!path.startsWith('avatars/')) path = 'avatars/' + path;
                path = 'server/' + path;
            }
            innerContent = `<img src="${path}" style="${style}">`;
        }
    }
    // 3. Fallback (Initials or default)
    else {
        // Use UI Avatars or Emoji fallback
        const name = user.first_name || 'U';
        const src = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random&size=${sizePx * 2}`;
        innerContent = `<img src="${src}" style="${style}">`;
    }

    // Render Container
    if (isEmoji) {
        const fontSize = Math.floor(sizePx * 0.6);
        return `
            <div class="avatar-circle" 
                 onclick="event.stopPropagation(); openAvatarViewer('${tempUid}')"
                 style="width:${sizePx}px; height:${sizePx}px; background:${bgColor}; display:flex; align-items:center; justify-content:center; border-radius:50%; cursor:pointer; overflow:hidden;">
                <span style="font-size:${fontSize}px; line-height:1;">${emojiVal}</span>
            </div>
        `;
    } else {
        // Wrap img in a clickable div or just format the img
        // To ensure clickability we wrap
        return `
            <div class="avatar-wrapper" style="display:inline-block; cursor:pointer;" onclick="event.stopPropagation(); openAvatarViewer('${tempUid}')">
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
    if (user.photo_url && user.photo_url !== '🤖') {
        content = `<img src="${user.photo_url}" style="width:100%; height:100%; object-fit:cover;">`;
    } else if (user.custom_avatar) {
        try {
            const cfg = JSON.parse(user.custom_avatar);
            if (cfg.type === 'emoji') {
                content = `<div style="width:100%; height:100%; background:${cfg.bg}; display:flex; align-items:center; justify-content:center; font-size:120px;">${cfg.value}</div>`;
            } else {
                content = `<img src="${cfg.src}" style="width:100%; height:100%; object-fit:cover;">`;
            }
        } catch (e) {
            // Drawn avatar path
            let path = user.custom_avatar;
            if (!path.startsWith('http') && !path.startsWith('server/')) {
                if (!path.startsWith('avatars/')) path = 'avatars/' + path;
                path = 'server/' + path;
            }
            content = `<img src="${path}" style="width:100%; height:100%; object-fit:cover;">`;
        }
    } else {
        // UI Avatar fallback
        const name = user.first_name || 'U';
        const src = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random&size=300`;
        content = `<img src="${src}" style="width:100%; height:100%; object-fit:cover;">`;
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
