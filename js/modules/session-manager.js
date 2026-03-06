/**
 * Session Manager
 * Handles multi-session listing and revocation UI.
 */

const PLATFORM_ICONS = {
    tma: { icon: 'bi-telegram', label: 'Telegram' },
    web: { icon: 'bi-globe', label: 'Веб-браузер' },
    dev: { icon: 'bi-bug', label: 'Dev Session' },
};

// ─── Public API ───────────────────────────────────────────────────────────────

async function loadSessions() {
    const list = document.getElementById('sessions-list');
    const counter = document.getElementById('sessions-screen-counter');
    if (!list) return;

    list.innerHTML = `
        <div class="d-flex align-items-center justify-content-center py-5">
            <div class="spinner-border text-primary" role="status"></div>
        </div>`;

    const res = await window.apiRequest({ action: 'get_sessions' });
    if (!res || res.status !== 'ok') {
        list.innerHTML = `<div class="text-muted text-center py-4">Не удалось загрузить сеансы</div>`;
        return;
    }

    const sessions = res.sessions || [];
    if (counter) counter.textContent = `${sessions.length} из ${res.max}`;

    if (sessions.length === 0) {
        list.innerHTML = `<div class="text-muted text-center py-4">Нет активных сеансов</div>`;
        return;
    }

    list.innerHTML = sessions.map(s => renderSessionCard(s)).join('');

    // Sync TTL selector
    const ttlSelect = document.getElementById('session-ttl-select');
    if (ttlSelect) ttlSelect.value = String(res.ttl_days);
}

function renderSessionCard(session) {
    const p = PLATFORM_ICONS[session.platform] || PLATFORM_ICONS.web;
    const createdDate = formatRelativeDate(session.created_at);
    const lastDate = formatRelativeDate(session.last_used);
    const isCurrent = session.is_current == 1;

    const currentBadge = isCurrent
        ? `<span class="badge ms-2" style="background:var(--primary-color); font-size:10px; font-weight:600; letter-spacing:.3px;">ТЕКУЩИЙ</span>`
        : '';

    const revokeBtn = isCurrent
        ? '' // can't close current session
        : `<button class="btn btn-sm btn-outline-danger session-revoke-btn" 
               onclick="window.SessionManager.revokeSession(${session.id})"
               style="font-size: 12px; padding: 4px 12px; border-radius: 8px;">
               Закрыть
           </button>`;

    return `
    <div class="session-card ${isCurrent ? 'current' : ''}" data-session-id="${session.id}">
        <div class="session-icon-wrap">
            <i class="bi ${p.icon}"></i>
        </div>
        <div class="session-info flex-grow-1">
            <div class="session-platform-row">
                <span class="fw-bold">${p.label}</span>
                ${currentBadge}
            </div>
            <div class="session-device text-muted small">${escapeHtml(session.device || 'Неизвестное устройство')}</div>
            <div class="session-dates text-muted" style="font-size:11px; margin-top:2px;">
                <span>Вход: ${createdDate}</span>
                <span class="mx-1">·</span>
                <span>Активен: ${lastDate}</span>
            </div>
        </div>
        <div class="session-action">${revokeBtn}</div>
    </div>`;
}

async function revokeSession(sessionId) {
    if (!window.showConfirmation) return;
    window.showConfirmation(
        'Закрыть сеанс',
        'Это устройство будет разлогинено. Продолжить?',
        async () => {
            const res = await window.apiRequest({ action: 'revoke_session', session_id: sessionId });
            if (res && res.status === 'ok') {
                const card = document.querySelector(`[data-session-id="${sessionId}"]`);
                if (card) {
                    card.style.transition = 'opacity .25s, max-height .3s';
                    card.style.opacity = '0';
                    card.style.maxHeight = '0';
                    card.style.overflow = 'hidden';
                    setTimeout(() => card.remove(), 300);
                }
                updateSessionCounter(-1);
            } else {
                if (window.showAlert) window.showAlert('Ошибка', res?.message || 'Не удалось закрыть сеанс', 'error');
            }
        },
        { isDanger: true, confirmText: 'Закрыть сеанс' }
    );
}

async function revokeAll() {
    if (!window.showConfirmation) return;
    window.showConfirmation(
        'Закрыть все остальные',
        'Все сеансы кроме текущего будут завершены.',
        async () => {
            const res = await window.apiRequest({ action: 'revoke_all_sessions' });
            if (res && res.status === 'ok') {
                await loadSessions();
                if (window.showAlert) window.showAlert('Готово', `Закрыто ${res.revoked} сеанс(ов)`, 'success');
            }
        },
        { isDanger: true, confirmText: 'Закрыть все' }
    );
}

async function updateTtl(days) {
    const res = await window.apiRequest({ action: 'update_session_ttl', ttl_days: days });
    if (res && res.status === 'ok') {
        if (window.showAlert) window.showAlert('Сохранено', 'Настройка автоудаления обновлена', 'success');
    }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function updateSessionCounter(delta) {
    const counter = document.getElementById('sessions-screen-counter');
    if (!counter) return;
    const parts = counter.textContent.match(/(\d+) из (\d+)/);
    if (parts) counter.textContent = `${Math.max(0, parseInt(parts[1]) + delta)} из ${parts[2]}`;
}

function formatRelativeDate(dateStr) {
    if (!dateStr) return '—';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMin = Math.floor(diffMs / 60000);
    const diffH = Math.floor(diffMs / 3600000);
    const diffD = Math.floor(diffMs / 86400000);

    if (diffMin < 2) return 'только что';
    if (diffMin < 60) return `${diffMin} мин. назад`;
    if (diffH < 24) return `${diffH} ч. назад`;
    if (diffD === 1) return 'вчера';
    if (diffD < 7) return `${diffD} дней назад`;

    return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ─── Export ───────────────────────────────────────────────────────────────────

window.SessionManager = { loadSessions, revokeSession, revokeAll, updateTtl };
