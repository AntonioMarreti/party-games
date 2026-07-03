// Debug-only Android scroll/touch QA panel. Disabled unless explicitly enabled.
(function () {
    const STORAGE_KEY = 'DEBUG_SCROLL_QA';
    const THEME_QA_STORAGE_KEY = 'DEBUG_THEME_QA';
    const ROOT_ID = 'scroll-qa-root';
    const BUTTON_ID = 'scroll-qa-button';
    const STYLE_ID = 'scroll-qa-styles';
    const THEME_QA_SCREEN_ID = 'theme-qa-screen';
    const BUTTON_POS_KEY = 'QA_FLOATING_BUTTON_POS';
    const LAST_BUG_REPORT_KEY = 'QA_LAST_BUG_REPORT';
    const TESTER_CHAT_URL = 'https://t.me/+w6d97lbezTlmYzky';
    const BUG_REPORT_RATE_LIMIT_MS = 10000;
    const BUTTON_DRAG_THRESHOLD = 6;
    const BUTTON_LONG_PRESS_MS = 550;
    const QA_EVENT_LIMIT = 15;
    const MAX_COMPACT_QA_EVENTS = 6;
    let lastBugReportSentAt = 0;
    let selectedBugElement = null;
    let bugContextSnapshot = null;
    let qaEventTrail = [];
    let bugDraft = {
        type: 'bug',
        severity: 'medium',
        actual: '',
        expected: '',
        steps: ''
    };

    const longParagraph = 'Проверьте свайп с этого текста, с карточек, с пустого фона и рядом с кнопками. Контент должен прокручиваться до самого низа без второго внутреннего скролла.';

    function safeLocalStorageGet(key) {
        try {
            return window.localStorage ? window.localStorage.getItem(key) : null;
        } catch (e) {
            return null;
        }
    }

    function safeLocalStorageSet(key, value) {
        try {
            if (window.localStorage) window.localStorage.setItem(key, value);
        } catch (e) {
            // noop
        }
    }

    function syncFlagFromUrl() {
        try {
            const params = new URLSearchParams(window.location.search || '');
            if (params.get('debug_scroll_qa') === '1') {
                safeLocalStorageSet(STORAGE_KEY, '1');
            }
            if (params.get('debug_theme_qa') === '1') {
                safeLocalStorageSet(THEME_QA_STORAGE_KEY, '1');
            }
        } catch (e) {
            // noop
        }
    }

    function hasThemeQaUrlParam() {
        try {
            return new URLSearchParams(window.location.search || '').get('debug_theme_qa') === '1';
        } catch (e) {
            return false;
        }
    }

    function isEnabled() {
        return safeLocalStorageGet(STORAGE_KEY) === '1';
    }

    function isThemeQaEnabled() {
        return safeLocalStorageGet(THEME_QA_STORAGE_KEY) === '1';
    }

    function getCurrentUser() {
        return window.globalUser
            || window.AuthManager?.getGlobalUser?.()
            || window.currentUser
            || window.user
            || null;
    }

    function getRawTesterValue(user = getCurrentUser()) {
        return user?.is_tester;
    }

    function isTesterUser(user = getCurrentUser()) {
        return user?.is_tester === true
            || user?.is_tester === 1
            || user?.is_tester === '1'
            || user?.isTester === true
            || user?.tester === true
            || user?.role === 'tester'
            || (Array.isArray(user?.roles) && user.roles.includes('tester'))
            || window.isTesterUser === true;
    }

    function isAdminUser(user = getCurrentUser()) {
        return user?.is_admin === true
            || user?.is_admin === 1
            || user?.is_admin === '1'
            || user?.isAdmin === true
            || user?.role === 'admin'
            || (Array.isArray(user?.roles) && user.roles.includes('admin'));
    }

    function hasToolsAccess(user = getCurrentUser()) {
        return isTesterUser(user) || isAdminUser(user) || isEnabled() || isThemeQaEnabled();
    }

    function getActiveScreen() {
        const activeScreen = document.querySelector('.screen.active-screen, .screen.active, .app-screen.active, [data-screen].active');
        return activeScreen?.id || activeScreen?.dataset?.screen || null;
    }

    function initQaEventTrail() {
        if (initQaEventTrail.initialized) return;
        initQaEventTrail.initialized = true;
        logQaEvent('qa_loaded', document.body);
        window.addEventListener('screenChanged', (event) => {
            logQaEvent('screenChanged', null, event.detail?.screenId || '');
        });
        document.addEventListener('click', (event) => {
            const target = event.target instanceof Element
                ? event.target.closest('button,a,input,textarea,select,label,[role="button"],[onclick]') || event.target
                : null;
            if (!target || target.closest(`#${ROOT_ID}, #${THEME_QA_SCREEN_ID}`)) return;
            logQaEvent('click', target);
        }, true);
    }

    function logQaEvent(type, target = null, detail = '') {
        const element = target instanceof Element ? target : null;
        const inputLike = element instanceof HTMLInputElement
            || element instanceof HTMLTextAreaElement
            || element instanceof HTMLSelectElement;
        const event = {
            t: new Date().toISOString().slice(11, 19),
            type,
            screen: getActiveScreen() || '',
            target: element ? formatElementLine({
                tagName: element.tagName,
                id: element.id || '',
                className: safeClassName(element),
                selector: buildElementPath(element)
            }) : truncateText(detail, 80),
            text: element && !inputLike ? trimText(element.textContent, 60) : ''
        };
        if (event.text) event.target = `${event.target} "${event.text}"`;
        qaEventTrail.push(event);
        if (qaEventTrail.length > QA_EVENT_LIMIT) {
            qaEventTrail = qaEventTrail.slice(-QA_EVENT_LIMIT);
        }
    }

    function ensureStyles() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            #${BUTTON_ID} {
                position: fixed;
                left: 14px;
                top: calc(118px + env(safe-area-inset-top));
                z-index: 2147483000;
                border: 0;
                border-radius: 999px;
                min-width: 42px;
                height: 34px;
                padding: 0 11px;
                background: #111827;
                color: #fff;
                font: 700 12px/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
                box-shadow: 0 10px 28px rgba(0,0,0,0.22);
                touch-action: none;
                user-select: none;
                -webkit-user-select: none;
                cursor: grab;
            }
            #${BUTTON_ID}.is-dragging {
                cursor: grabbing;
                box-shadow: 0 14px 34px rgba(0,0,0,0.28);
            }
            #${ROOT_ID} {
                position: fixed;
                inset: 0;
                z-index: 2147482999;
                display: none;
                background: rgba(15, 23, 42, 0.38);
                pointer-events: auto;
            }
            #${ROOT_ID}.is-open { display: block; }
            .scroll-qa-shell {
                position: absolute;
                left: 0;
                right: 0;
                bottom: 0;
                max-height: min(88dvh, 760px);
                display: flex;
                flex-direction: column;
                min-height: 0;
                border-radius: 26px 26px 0 0;
                background: #f8fafc;
                color: #111827;
                box-shadow: 0 -18px 52px rgba(15, 23, 42, 0.24);
                overflow: hidden;
            }
            .scroll-qa-header {
                flex: 0 0 auto;
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 12px;
                padding: 14px 16px 10px;
                border-bottom: 1px solid rgba(15,23,42,0.08);
                background: #fff;
            }
            .scroll-qa-title {
                margin: 0;
                font-size: 16px;
                font-weight: 800;
                line-height: 1.15;
            }
            .scroll-qa-subtitle {
                margin-top: 2px;
                color: #64748b;
                font-size: 12px;
                line-height: 1.25;
            }
            .scroll-qa-close,
            .scroll-qa-back,
            .scroll-qa-scenario-btn,
            .scroll-qa-action {
                touch-action: manipulation;
            }
            .scroll-qa-close,
            .scroll-qa-back {
                border: 0;
                border-radius: 999px;
                min-width: 38px;
                height: 38px;
                padding: 0 12px;
                background: #eef2ff;
                color: #4f46e5;
                font-weight: 800;
            }
            .scroll-qa-body {
                flex: 1 1 auto;
                min-height: 0;
                overflow-y: auto;
                overflow-x: hidden;
                -webkit-overflow-scrolling: touch;
                overscroll-behavior: contain;
                touch-action: pan-y;
                padding: 14px 16px calc(22px + env(safe-area-inset-bottom));
            }
            .scroll-qa-list {
                display: grid;
                gap: 10px;
            }
            .scroll-qa-scenario-btn {
                width: 100%;
                border: 1px solid rgba(79,70,229,0.12);
                border-radius: 16px;
                padding: 14px;
                text-align: left;
                background: #fff;
                color: #111827;
                box-shadow: 0 8px 18px rgba(15,23,42,0.04);
            }
            .scroll-qa-scenario-btn strong {
                display: block;
                font-size: 14px;
                margin-bottom: 3px;
            }
            .scroll-qa-scenario-btn span {
                display: block;
                color: #64748b;
                font-size: 12px;
                line-height: 1.3;
            }
            .scroll-qa-screen {
                position: fixed;
                inset: 0;
                z-index: 2147482998;
                background: #f8fafc;
                display: flex;
                flex-direction: column;
                min-height: 0;
                color: #111827;
            }
            .scroll-qa-screen-header {
                flex: 0 0 auto;
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 10px;
                padding: calc(12px + env(safe-area-inset-top)) 14px 10px;
                background: #fff;
                border-bottom: 1px solid rgba(15,23,42,0.08);
                z-index: 3;
            }
            .scroll-qa-screen-title {
                font-size: 14px;
                font-weight: 800;
                line-height: 1.2;
            }
            .scroll-qa-scroll {
                flex: 1 1 auto;
                min-height: 0;
                overflow-y: auto;
                overflow-x: hidden;
                -webkit-overflow-scrolling: touch;
                overscroll-behavior: contain;
                touch-action: pan-y;
                padding: 16px 16px calc(124px + env(safe-area-inset-bottom));
            }
            .scroll-qa-card {
                background: #fff;
                border: 1px solid rgba(15,23,42,0.08);
                border-radius: 18px;
                padding: 15px;
                margin-bottom: 12px;
                box-shadow: 0 10px 24px rgba(15,23,42,0.05);
            }
            .scroll-qa-note {
                background: #eef2ff;
                color: #3730a3;
                border: 1px solid rgba(79,70,229,0.14);
                border-radius: 16px;
                padding: 12px;
                font-size: 12px;
                line-height: 1.4;
                margin-bottom: 14px;
            }
            .scroll-qa-fixed-actions {
                position: fixed;
                left: 0;
                right: 0;
                bottom: 0;
                padding: 12px 16px calc(14px + env(safe-area-inset-bottom));
                background: linear-gradient(0deg, #ffffff 82%, rgba(255,255,255,0));
                border-top: 1px solid rgba(15,23,42,0.06);
                z-index: 4;
            }
            .scroll-qa-action {
                width: 100%;
                min-height: 46px;
                border: 0;
                border-radius: 16px;
                background: #4f46e5;
                color: #fff;
                font-weight: 800;
            }
            .scroll-qa-action.secondary {
                background: #eef2ff;
                color: #4338ca;
                border: 1px solid rgba(79,70,229,0.14);
            }
            .scroll-qa-inline-actions {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 8px;
            }
            .scroll-qa-link-action {
                width: 100%;
                border: 0;
                background: #f8fafc;
                color: #4f46e5;
                min-height: 34px;
                padding: 8px 10px;
                border: 1px solid rgba(79,70,229,0.10);
                border-radius: 12px;
                font-size: 12px;
                font-weight: 850;
                text-align: center;
            }
            .scroll-qa-advanced {
                padding-top: 0;
            }
            .scroll-qa-advanced summary {
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 5px;
                min-height: 34px;
                cursor: pointer;
                color: #4f46e5;
                font-size: 12px;
                font-weight: 850;
                list-style: none;
                padding: 8px 10px;
                border: 1px solid rgba(79,70,229,0.10);
                border-radius: 12px;
                background: #f8fafc;
                text-align: center;
            }
            .scroll-qa-advanced-label {
                line-height: 1;
            }
            .scroll-qa-advanced-chevron {
                font-size: 14px;
                line-height: 1;
                transition: transform 0.18s ease;
            }
            .scroll-qa-advanced[open] .scroll-qa-advanced-chevron {
                transform: rotate(180deg);
            }
            .scroll-qa-advanced summary::-webkit-details-marker {
                display: none;
            }
            .scroll-qa-advanced-body {
                margin-top: 10px;
                padding: 10px;
                border: 1px solid rgba(148,163,184,0.18);
                border-radius: 16px;
                background: #fff;
                box-shadow: 0 8px 22px rgba(15,23,42,0.05);
                animation: scrollQaAdvancedIn 0.16s ease;
            }
            @keyframes scrollQaAdvancedIn {
                from { opacity: 0; transform: translateY(-4px); }
                to { opacity: 1; transform: translateY(0); }
            }
            .scroll-qa-segment {
                display: grid;
                grid-template-columns: repeat(3, minmax(0, 1fr));
                gap: 6px;
            }
            .scroll-qa-segment input {
                position: absolute;
                opacity: 0;
                pointer-events: none;
            }
            .scroll-qa-segment span {
                display: flex;
                align-items: center;
                justify-content: center;
                min-height: 34px;
                border-radius: 12px;
                border: 1px solid rgba(148,163,184,0.28);
                background: #fff;
                color: #334155;
                font-size: 11px;
                font-weight: 850;
                text-align: center;
            }
            .scroll-qa-segment input:checked + span {
                border-color: rgba(79,70,229,0.34);
                background: #eef2ff;
                color: #4338ca;
            }
            .scroll-qa-muted {
                color: #64748b;
                font-size: 12px;
                line-height: 1.35;
            }
            .scroll-qa-field {
                display: grid;
                gap: 6px;
            }
            .scroll-qa-field label {
                color: #111827;
                font-size: 13px;
                font-weight: 800;
            }
            .scroll-qa-field textarea {
                width: 100%;
                min-height: 82px;
                resize: vertical;
                border: 1px solid rgba(148,163,184,0.44);
                border-radius: 14px;
                padding: 11px 12px;
                background: #fff;
                color: #111827;
                font: 600 14px/1.35 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
                outline: 0;
            }
            .scroll-qa-field textarea:focus {
                border-color: rgba(79,70,229,0.48);
                box-shadow: 0 0 0 4px rgba(79,70,229,0.1);
            }
            .scroll-qa-element-summary {
                border: 1px solid rgba(148,163,184,0.28);
                border-radius: 14px;
                padding: 10px 12px;
                background: #fff;
                color: #334155;
                font: 12px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
                white-space: pre-wrap;
                word-break: break-word;
            }
            .scroll-qa-picker-hint {
                position: fixed;
                left: 50%;
                top: calc(18px + env(safe-area-inset-top));
                transform: translateX(-50%);
                z-index: 2147483001;
                max-width: min(340px, calc(100vw - 28px));
                padding: 10px 14px;
                border-radius: 999px;
                background: #111827;
                color: #fff;
                font: 800 13px/1.2 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
                box-shadow: 0 12px 32px rgba(15,23,42,0.28);
                pointer-events: none;
            }
            .scroll-qa-rank-row,
            .scroll-qa-player-row {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 12px;
            }
            .scroll-qa-avatar {
                width: 42px;
                height: 42px;
                border-radius: 50%;
                background: linear-gradient(135deg, #c7d2fe, #f0abfc);
                flex: 0 0 auto;
            }
            .scroll-qa-reveal-card {
                min-height: 100%;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 22px 16px calc(112px + env(safe-area-inset-bottom));
                background: rgba(15,23,42,0.88);
            }
            .scroll-qa-reveal-card .scroll-qa-card {
                max-height: min(78dvh, 680px);
                overflow-y: auto;
                -webkit-overflow-scrolling: touch;
                touch-action: pan-y;
            }
            .theme-qa-summary {
                display: grid;
                gap: 8px;
                margin-bottom: 14px;
            }
            .theme-qa-summary pre {
                margin: 0;
                white-space: pre-wrap;
                word-break: break-word;
                font: 11px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
                color: #334155;
            }
            .theme-qa-rules {
                margin: 0;
                padding-left: 18px;
                color: #475569;
                font-size: 12px;
                line-height: 1.45;
            }
            .theme-qa-grid {
                display: grid;
                gap: 14px;
            }
            .theme-qa-scenario {
                border-radius: 22px;
                border: 1px solid rgba(15, 23, 42, 0.1);
                background: var(--qa-bg);
                color: var(--qa-text);
                overflow: hidden;
                box-shadow: 0 12px 30px rgba(15, 23, 42, 0.08);
            }
            .theme-qa-scenario-head {
                display: flex;
                align-items: flex-start;
                justify-content: space-between;
                gap: 10px;
                padding: 12px 14px;
                border-bottom: 1px solid var(--qa-border);
                background: var(--qa-surface);
                color: var(--qa-text);
            }
            .theme-qa-scenario-title {
                font-size: 13px;
                font-weight: 900;
                line-height: 1.2;
            }
            .theme-qa-scenario-note {
                margin-top: 2px;
                color: var(--qa-muted);
                font-size: 11px;
                line-height: 1.3;
                font-weight: 600;
            }
            .theme-qa-score-list {
                display: flex;
                flex-wrap: wrap;
                justify-content: flex-end;
                gap: 4px;
            }
            .theme-qa-score {
                border-radius: 999px;
                padding: 4px 7px;
                font-size: 9px;
                line-height: 1;
                font-weight: 900;
                background: #e2e8f0;
                color: #334155;
            }
            .theme-qa-score.ok {
                background: #dcfce7;
                color: #166534;
            }
            .theme-qa-score.check {
                background: #fef3c7;
                color: #92400e;
            }
            .theme-qa-score.risk {
                background: #fee2e2;
                color: #991b1b;
            }
            .theme-qa-preview {
                display: grid;
                gap: 12px;
                padding: 12px;
            }
            .theme-qa-hero {
                border-radius: 18px;
                padding: 16px;
                background: var(--qa-hero-bg);
                color: var(--qa-hero-text);
            }
            .theme-qa-hero-title {
                font-size: 23px;
                font-weight: 900;
                line-height: 1.05;
            }
            .theme-qa-hero-subtitle {
                margin-top: 5px;
                color: var(--qa-hero-muted);
                font-size: 12px;
                line-height: 1.35;
                font-weight: 650;
            }
            .theme-qa-section-row {
                display: flex;
                justify-content: space-between;
                align-items: center;
                gap: 10px;
            }
            .theme-qa-section-title {
                color: var(--qa-text);
                font-size: 16px;
                font-weight: 900;
                line-height: 1.2;
            }
            .theme-qa-link {
                border: 0;
                background: transparent;
                color: var(--qa-link);
                padding: 0;
                font-size: 12px;
                font-weight: 900;
            }
            .theme-qa-card,
            .theme-qa-modal {
                border: 1px solid var(--qa-border);
                border-radius: 16px;
                background: var(--qa-surface);
                color: var(--qa-text);
                padding: 13px;
            }
            .theme-qa-card-title,
            .theme-qa-modal-title {
                color: var(--qa-text);
                font-size: 14px;
                font-weight: 900;
                line-height: 1.2;
            }
            .theme-qa-card-subtitle,
            .theme-qa-muted-text {
                margin-top: 4px;
                color: var(--qa-muted);
                font-size: 12px;
                line-height: 1.35;
                font-weight: 600;
            }
            .theme-qa-chip-row,
            .theme-qa-button-row {
                display: flex;
                flex-wrap: wrap;
                gap: 6px;
                margin-top: 10px;
            }
            .theme-qa-chip,
            .theme-qa-badge {
                display: inline-flex;
                align-items: center;
                min-height: 24px;
                border-radius: 999px;
                padding: 4px 8px;
                border: 1px solid var(--qa-border);
                background: var(--qa-chip-bg);
                color: var(--qa-muted);
                font-size: 10px;
                font-weight: 850;
            }
            .theme-qa-input {
                width: 100%;
                min-height: 42px;
                border-radius: 13px;
                border: 1px solid var(--qa-border);
                background: var(--qa-input-bg);
                color: var(--qa-text);
                padding: 0 12px;
                font: 750 13px/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
                outline: 0;
            }
            .theme-qa-input::placeholder {
                color: var(--qa-placeholder);
                opacity: 1;
            }
            .theme-qa-btn {
                min-height: 38px;
                border-radius: 13px;
                border: 1px solid transparent;
                padding: 0 11px;
                font-size: 12px;
                font-weight: 900;
            }
            .theme-qa-btn.primary {
                background: var(--qa-primary);
                color: var(--qa-primary-text);
            }
            .theme-qa-btn.secondary {
                border-color: var(--qa-border);
                background: var(--qa-secondary);
                color: var(--qa-text);
            }
            .theme-qa-btn.danger {
                background: var(--qa-danger);
                color: #fff;
            }
            .theme-qa-btn.warning {
                background: var(--qa-warning);
                color: var(--qa-warning-text);
            }
            .theme-qa-modal {
                background: var(--qa-modal-bg);
                color: var(--qa-modal-text);
            }
            .theme-qa-modal .theme-qa-modal-title {
                color: var(--qa-modal-text);
            }
            .theme-qa-modal .theme-qa-muted-text {
                color: var(--qa-modal-muted);
            }
            .theme-qa-nav {
                display: grid;
                grid-template-columns: repeat(3, 1fr);
                gap: 4px;
                border: 1px solid var(--qa-border);
                border-radius: 15px;
                padding: 6px;
                background: var(--qa-surface);
            }
            .theme-qa-nav-item {
                min-height: 34px;
                border-radius: 11px;
                display: flex;
                align-items: center;
                justify-content: center;
                color: var(--qa-muted);
                font-size: 11px;
                font-weight: 850;
            }
            .theme-qa-nav-item.active {
                background: var(--qa-primary);
                color: var(--qa-primary-text);
            }
            .theme-qa-lobby-smoke {
                border: 1px dashed var(--qa-border);
                border-radius: 16px;
                background: var(--qa-surface);
                padding: 10px;
            }
            .theme-qa-lobby-smoke-label {
                margin-bottom: 8px;
                color: var(--qa-muted);
                font-size: 10px;
                font-weight: 900;
                letter-spacing: 0.04em;
                text-transform: uppercase;
            }
            .theme-qa-lobby-smoke .home-flow {
                --home-surface-text: var(--qa-text);
                --home-surface-muted: var(--qa-muted);
                --home-surface-link: var(--qa-link);
                --home-surface-border: var(--qa-border);
                --home-content-bg: var(--qa-surface);
                display: grid !important;
                gap: 8px;
                padding: 10px !important;
                background: var(--qa-surface);
                border-radius: 12px;
            }
            .theme-qa-lobby-smoke .home-flow::before {
                display: none;
            }
            .theme-qa-lobby-smoke .section-title {
                margin-bottom: 0;
            }
            .theme-qa-lobby-smoke .bottom-nav {
                --bottom-nav-bg: var(--qa-surface);
                --bottom-nav-border: var(--qa-border);
                --bottom-nav-muted: var(--qa-muted);
                --bottom-nav-active: var(--qa-primary);
                position: static;
                left: auto;
                bottom: auto;
                transform: none;
                width: 100%;
                max-width: none;
                min-height: 60px;
                margin: 10px 0 0;
                display: flex !important;
                z-index: auto;
            }
            .theme-qa-lobby-smoke .bottom-nav .nav-item {
                min-width: 0;
                padding-left: 6px;
                padding-right: 6px;
            }
        `;
        document.head.appendChild(style);
    }

    function init() {
        const openThemeQaFromUrl = hasThemeQaUrlParam();
        syncFlagFromUrl();
        refreshAccess();
        window.addEventListener('screenChanged', (event) => {
            if (event.detail?.screenId === 'screen-settings') {
                refreshAccess();
            }
        });
        if (openThemeQaFromUrl && hasToolsAccess()) {
            setTimeout(openTools, 0);
        }
        initQaEventTrail();
        if (!isEnabled()) return;
        ensureStyles();
        ensureButton();
    }

    function refreshAccess(user = getCurrentUser()) {
        const access = hasToolsAccess(user);
        const group = document.getElementById('qa-tools-settings-group');
        if (group) {
            group.classList.toggle('d-none', !access);
            group.hidden = !access;
            group.style.display = access ? '' : 'none';
        }
        if (access) {
            ensureStyles();
            ensureButton();
        } else {
            removeButton();
        }
        return access;
    }

    function debugAccess() {
        const user = getCurrentUser();
        const rawTesterValue = getRawTesterValue(user);
        const group = document.getElementById('qa-tools-settings-group');
        const access = hasToolsAccess(user);
        return {
            debugFlag: isEnabled(),
            themeQaFlag: isThemeQaEnabled(),
            currentUser: user ? {
                id: user.id ?? null,
                telegram_id: user.telegram_id ?? null
            } : null,
            is_tester: {
                value: rawTesterValue,
                type: typeof rawTesterValue
            },
            hasAccess: access,
            isAdmin: isAdminUser(user),
            settingsBlockFound: Boolean(group),
            settingsBlockDisplay: group ? window.getComputedStyle(group).display : null,
            activeScreen: getActiveScreen(),
            appBuild: getAppBuildVersion()
        };
    }

    function ensureButton() {
        if (document.getElementById(BUTTON_ID)) {
            clampButtonToViewport();
            return;
        }
        const button = document.createElement('button');
        button.id = BUTTON_ID;
        button.type = 'button';
        button.textContent = 'QA';
        button.title = 'Сообщить о баге';
        button.setAttribute('aria-label', 'Сообщить о баге');
        bindFloatingButton(button);
        document.body.appendChild(button);
        applySavedButtonPosition(button);
    }

    function removeButton() {
        document.getElementById(BUTTON_ID)?.remove();
    }

    function enableScrollQa() {
        safeLocalStorageSet(STORAGE_KEY, '1');
        ensureStyles();
        ensureButton();
        refreshAccess();
    }

    function disableScrollQa() {
        try {
            if (window.localStorage) window.localStorage.removeItem(STORAGE_KEY);
        } catch (e) {
            // noop
        }
        closePanel();
        closeScenario();
        removeButton();
        refreshAccess();
    }

    function disableThemeQa() {
        try {
            if (window.localStorage) window.localStorage.removeItem(THEME_QA_STORAGE_KEY);
        } catch (e) {
            // noop
        }
        closeThemeContrastQa();
        refreshAccess();
        if (window.showToast) window.showToast('Theme Contrast QA выключен');
    }

    function resetFloatingButtonPosition() {
        try {
            if (window.localStorage) window.localStorage.removeItem(BUTTON_POS_KEY);
        } catch (e) {
            // noop
        }
        const button = document.getElementById(BUTTON_ID);
        if (button) applySavedButtonPosition(button);
        if (window.showToast) window.showToast('Позиция QA сброшена');
    }

    function bindFloatingButton(button) {
        if (!window.PointerEvent) {
            button.addEventListener('click', (event) => {
                event.preventDefault();
                openBugReporter({ resetContext: true });
            });
            return;
        }

        let pointerId = null;
        let startX = 0;
        let startY = 0;
        let startLeft = 0;
        let startTop = 0;
        let dragged = false;
        let longPressed = false;
        let longPressTimer = null;

        const clearLongPress = () => {
            if (longPressTimer) {
                clearTimeout(longPressTimer);
                longPressTimer = null;
            }
        };

        button.addEventListener('pointerdown', (event) => {
            if (!hasToolsAccess()) return;
            pointerId = event.pointerId;
            startX = event.clientX;
            startY = event.clientY;
            const rect = button.getBoundingClientRect();
            startLeft = rect.left;
            startTop = rect.top;
            dragged = false;
            longPressed = false;
            button.classList.add('is-dragging');
            button.setPointerCapture?.(pointerId);
            clearLongPress();
            longPressTimer = setTimeout(() => {
                if (dragged) return;
                longPressed = true;
                button.classList.remove('is-dragging');
                openTools();
            }, BUTTON_LONG_PRESS_MS);
            event.preventDefault();
        });

        button.addEventListener('pointermove', (event) => {
            if (pointerId !== event.pointerId) return;
            const dx = event.clientX - startX;
            const dy = event.clientY - startY;
            if (Math.hypot(dx, dy) >= BUTTON_DRAG_THRESHOLD) {
                dragged = true;
                clearLongPress();
            }
            if (!dragged) return;
            const next = clampButtonPosition(startLeft + dx, startTop + dy, button);
            button.style.left = `${next.left}px`;
            button.style.top = `${next.top}px`;
            button.style.right = 'auto';
            button.style.bottom = 'auto';
            event.preventDefault();
        });

        const finishPointer = (event) => {
            if (pointerId !== event.pointerId) return;
            clearLongPress();
            button.releasePointerCapture?.(pointerId);
            button.classList.remove('is-dragging');
            pointerId = null;
            if (dragged) {
                saveButtonPosition(button);
                event.preventDefault();
                return;
            }
            if (longPressed) {
                event.preventDefault();
                return;
            }
            openBugReporter({ resetContext: true });
            event.preventDefault();
        };

        button.addEventListener('pointerup', finishPointer);
        button.addEventListener('pointercancel', (event) => {
            if (pointerId !== event.pointerId) return;
            clearLongPress();
            button.releasePointerCapture?.(pointerId);
            button.classList.remove('is-dragging');
            pointerId = null;
        });
        button.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
        });
        window.addEventListener('resize', clampButtonToViewport);
        window.visualViewport?.addEventListener('resize', clampButtonToViewport);
        window.visualViewport?.addEventListener('scroll', clampButtonToViewport);
    }

    function getDefaultButtonPosition(button = null) {
        const width = button?.offsetWidth || 42;
        const viewport = getButtonViewport();
        const safeTop = viewport.offsetTop + getTopSafeOffset() + 14;
        return {
            left: viewport.offsetLeft + 14,
            top: Math.max(safeTop, viewport.height - getBottomSafeOffset() - (button?.offsetHeight || 34) - 160),
            width
        };
    }

    function getButtonViewport() {
        const vv = window.visualViewport;
        return {
            width: Math.max(1, Math.round(vv?.width || window.innerWidth || 390)),
            height: Math.max(1, Math.round(vv?.height || window.innerHeight || 700)),
            offsetTop: vv?.offsetTop || 0,
            offsetLeft: vv?.offsetLeft || 0
        };
    }

    function getTopSafeOffset() {
        const dummy = document.createElement('div');
        dummy.style.position = 'fixed';
        dummy.style.top = '0';
        dummy.style.paddingTop = 'env(safe-area-inset-top, 0px)';
        dummy.style.visibility = 'hidden';
        document.body.appendChild(dummy);
        const safeTop = parseFloat(getComputedStyle(dummy).paddingTop) || 0;
        dummy.remove();

        return safeTop + 60;
    }

    function getBottomSafeOffset() {
        const dummy = document.createElement('div');
        dummy.style.position = 'fixed';
        dummy.style.bottom = '0';
        dummy.style.paddingBottom = 'env(safe-area-inset-bottom, 0px)';
        dummy.style.visibility = 'hidden';
        document.body.appendChild(dummy);
        const safeBottom = parseFloat(getComputedStyle(dummy).paddingBottom) || 0;
        dummy.remove();

        const nav = document.querySelector('.bottom-nav, .app-bottom-nav, .tabbar, .bottom-menu');
        const navHeight = nav ? Math.min(96, Math.round(nav.getBoundingClientRect().height || 0)) : 0;
        return Math.max(18, safeBottom + navHeight + 10);
    }

    function getSavedButtonPosition() {
        try {
            const raw = safeLocalStorageGet(BUTTON_POS_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (!Number.isFinite(parsed.left) || !Number.isFinite(parsed.top)) return null;
            return parsed;
        } catch (e) {
            return null;
        }
    }

    function applySavedButtonPosition(button) {
        const saved = getSavedButtonPosition();
        const fallback = getDefaultButtonPosition(button);
        const next = clampButtonPosition(saved?.left ?? fallback.left, saved?.top ?? fallback.top, button);
        button.style.left = `${next.left}px`;
        button.style.top = `${next.top}px`;
        button.style.right = 'auto';
        button.style.bottom = 'auto';
        saveButtonPosition(button);
    }

    function clampButtonPosition(left, top, button = document.getElementById(BUTTON_ID)) {
        const viewport = getButtonViewport();
        const width = button?.offsetWidth || 42;
        const height = button?.offsetHeight || 34;

        const margin = 8;
        const safeTop = getTopSafeOffset() + margin;
        const safeBottom = getBottomSafeOffset() + margin;

        const minLeft = viewport.offsetLeft + margin;
        const maxLeft = Math.max(minLeft, viewport.offsetLeft + viewport.width - width - margin);

        const minTop = viewport.offsetTop + safeTop;
        const maxTop = Math.max(minTop, viewport.offsetTop + viewport.height - height - safeBottom);

        return {
            left: Math.round(Math.min(Math.max(left, minLeft), maxLeft)),
            top: Math.round(Math.min(Math.max(top, minTop), maxTop))
        };
    }

    function saveButtonPosition(button) {
        const rect = button.getBoundingClientRect();
        const pos = clampButtonPosition(rect.left, rect.top, button);
        safeLocalStorageSet(BUTTON_POS_KEY, JSON.stringify(pos));
    }

    function clampButtonToViewport() {
        const button = document.getElementById(BUTTON_ID);
        if (!button) return;
        const rect = button.getBoundingClientRect();
        const next = clampButtonPosition(rect.left, rect.top, button);
        button.style.left = `${next.left}px`;
        button.style.top = `${next.top}px`;
        button.style.right = 'auto';
        button.style.bottom = 'auto';
        safeLocalStorageSet(BUTTON_POS_KEY, JSON.stringify(next));
    }

    function openTools() {
        if (!hasToolsAccess()) return;
        ensureStyles();
        closeScenario();
        let root = document.getElementById(ROOT_ID);
        if (!root) {
            root = document.createElement('div');
            root.id = ROOT_ID;
            document.body.appendChild(root);
        }
        const info = getDebugInfo();
        root.className = 'is-open';
        root.innerHTML = `
            <div class="scroll-qa-shell" role="dialog" aria-modal="true" aria-label="QA tools">
                <div class="scroll-qa-header">
                    <div>
                        <h2 class="scroll-qa-title">Обратная связь</h2>
                        <div class="scroll-qa-subtitle">Для тестеров: быстро отправить проблему с текущего экрана.</div>
                    </div>
                    <button class="scroll-qa-close" type="button" data-scroll-qa-close>×</button>
                </div>
                <div class="scroll-qa-body">
                    <div class="scroll-qa-card">
                        <strong>Что хотите сделать?</strong>
                        <div class="scroll-qa-muted" style="margin-top:4px;">Лучший вариант для теста — описать баг или выбрать проблемный элемент на экране.</div>
                        <div style="display:grid;gap:8px;margin-top:12px;">
                            <button class="scroll-qa-action" type="button" data-scroll-qa-open-bug-report>Сообщить о баге</button>
                            <button class="scroll-qa-action secondary" type="button" data-scroll-qa-chat>Чат тестировщиков</button>
                        </div>
                    </div>
                    <div class="scroll-qa-card" style="background:var(--app-surface-raised, #fff);border:1px solid var(--app-border, #e2e8f0);color:var(--app-text, #202631);border-radius:12px;padding:12px;font-size:13px;line-height:1.4;">
                        <div style="font-weight:600;margin-bottom:12px;display:flex;align-items:center;gap:8px;">
                            Theme QA
                        </div>
                        <div style="display:grid;grid-template-columns:auto 1fr;gap:4px 8px;margin-bottom:12px;">
                            <strong style="color:var(--app-text-muted, #64748b);">Выбор:</strong> <span>${escapeHtml({'dark':'Тёмная','light':'Светлая','auto':'Авто'}[document.documentElement.getAttribute('data-theme-preference') || 'auto'] || 'Авто')}</span>
                            <strong style="color:var(--app-text-muted, #64748b);">Сейчас:</strong> <span>${escapeHtml({'dark':'Тёмная','light':'Светлая'}[document.documentElement.getAttribute('data-theme')] || document.documentElement.getAttribute('data-theme') || 'unknown')}</span>
                            <strong style="color:var(--app-text-muted, #64748b);">Палитра:</strong> <span>${escapeHtml(getCompactThemeQaData().palette_label)} &middot; <span style="word-break:break-all;">${escapeHtml(document.documentElement.getAttribute('data-palette') || 'unknown')}</span></span>
                            <strong style="color:var(--app-text-muted, #64748b);">Telegram:</strong> <span>${escapeHtml({'dark':'Тёмная','light':'Светлая'}[window.Telegram?.WebApp?.colorScheme] || window.Telegram?.WebApp?.colorScheme || 'unknown')} &middot; ${escapeHtml(window.Telegram?.WebApp?.platform || 'web')}</span>
                            <strong style="color:var(--app-text-muted, #64748b);">Экран:</strong> <span>${window.innerWidth} &times; ${window.innerHeight} &middot; build ${escapeHtml(getAppBuildVersion())}</span>
                        </div>
                        <div style="background:var(--app-surface, #f8fafc);border-radius:8px;padding:8px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;margin-bottom:12px;display:grid;gap:4px;">
                            <div style="display:flex;justify-content:space-between;"><span>bg</span> <strong>${escapeHtml(getCompactThemeQaData().tokens.app_bg)}</strong></div>
                            <div style="display:flex;justify-content:space-between;"><span>surface</span> <strong>${escapeHtml(getCompactThemeQaData().tokens.app_surface)}</strong></div>
                            <div style="display:flex;justify-content:space-between;"><span>text</span> <strong>${escapeHtml(getCompactThemeQaData().tokens.app_text)}</strong></div>
                            <div style="display:flex;justify-content:space-between;"><span>accent</span> <strong>${escapeHtml(getCompactThemeQaData().tokens.app_accent)}</strong></div>
                        </div>
                        <div style="display:flex;flex-direction:column;gap:8px;">
                            <button type="button" data-theme-qa-copy style="display:flex;align-items:center;justify-content:center;gap:6px;width:100%;padding:10px;border-radius:8px;border:none;background:var(--app-accent, #6c5ce7);color:var(--app-accent-text, #fff);font-weight:600;font-size:13px;cursor:pointer;">
                                <i class="bi bi-files" aria-hidden="true"></i> Скопировать Theme QA
                            </button>
                            <details style="width:100%;">
                                <summary style="font-weight:500;cursor:pointer;user-select:none;display:flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:10px;border-radius:8px;border:1px solid var(--app-border, #e2e8f0);background:var(--app-surface, #fff);color:var(--app-text, #202631);font-size:13px;">
                                    <i class="bi bi-list-check" aria-hidden="true"></i> Показать чек-лист
                                </summary>
                                <ol style="margin:12px 0 0;padding-left:20px;font-size:12px;color:var(--app-text-muted, #64748b);display:flex;flex-direction:column;gap:6px;">
                                    <li>Авто / Светлое / Тёмное переключаются корректно.</li>
                                    <li>Палитра применяется без reload.</li>
                                    <li>Настройки сохраняются после повторного открытия.</li>
                                    <li>Проверены светлая и тёмная версии палитры.</li>
                                    <li>Проверены Settings, Lobby, Profile, одна модалка и одна игра.</li>
                                    <li>Тумблеры показывают понятный on/off state.</li>
                                    <li>Текст и CTA не теряются на фоне.</li>
                                    <li>Telegram header читаем и соответствует теме.</li>
                                </ol>
                            </details>
                        </div>
                    </div>
                    <div class="scroll-qa-card">
                        <details class="scroll-qa-advanced">
                            <summary>
                                <span class="scroll-qa-advanced-label">Дополнительно</span>
                                <i class="bi bi-chevron-down scroll-qa-advanced-chevron" aria-hidden="true"></i>
                            </summary>
                            <div class="scroll-qa-list scroll-qa-advanced-body" style="gap:10px;">
                                <div>
                                    <strong>Scroll QA</strong>
                                    <div class="scroll-qa-muted" style="margin-top:4px;">Текущее состояние: ${isEnabled() ? 'включено' : 'выключено'}</div>
                                    <div style="display:flex;gap:8px;margin-top:10px;">
                                        <button class="scroll-qa-action secondary" type="button" data-scroll-qa-enable style="flex:1;">Открыть Scroll QA</button>
                                        <button class="scroll-qa-back" type="button" data-scroll-qa-disable style="min-width:96px;">Выключить</button>
                                    </div>
                                </div>
                                <button class="scroll-qa-action secondary" type="button" data-scroll-qa-bug-report>Скопировать баг-репорт</button>
                                <button class="scroll-qa-action secondary" type="button" data-scroll-qa-copy-codex>Скопировать prompt для Codex</button>
                                <button class="scroll-qa-action secondary" type="button" data-scroll-qa-copy-last>Скопировать последний репорт</button>
                                <button class="scroll-qa-action secondary" type="button" data-scroll-qa-reset-pos>Сбросить позицию QA</button>
                                <button class="scroll-qa-action secondary" type="button" data-scroll-qa-clear-flags>Очистить debug flags</button>
                                <div>
                                    <strong>Debug info</strong>
                                    <pre style="white-space:pre-wrap;word-break:break-word;margin:10px 0 0;font:11px/1.4 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:#334155;">${escapeHtml(buildFullDebugInfoText(info))}</pre>
                                    <button class="scroll-qa-action secondary" type="button" data-scroll-qa-copy style="margin-top:12px;">Скопировать debug info</button>
                                </div>
                            </div>
                        </details>
                    </div>
                </div>
            </div>
        `;
        root.querySelector('[data-scroll-qa-close]')?.addEventListener('click', closePanel);
        root.querySelector('[data-scroll-qa-chat]')?.addEventListener('click', openTesterChat);
        root.querySelector('[data-scroll-qa-open-bug-report]')?.addEventListener('click', () => openBugReporter({ resetContext: true }));
        root.querySelector('[data-theme-qa-copy]')?.addEventListener('click', copyCompactThemeQa);
        root.querySelector('[data-scroll-qa-bug-report]')?.addEventListener('click', () => copyBugReport(info));
        root.querySelector('[data-scroll-qa-copy-codex]')?.addEventListener('click', () => copyCodexPrompt(buildCurrentBugReport()));
        root.querySelector('[data-scroll-qa-copy-last]')?.addEventListener('click', copyLastBugReport);
        root.querySelector('[data-scroll-qa-reset-pos]')?.addEventListener('click', resetFloatingButtonPosition);
        root.querySelector('[data-scroll-qa-clear-flags]')?.addEventListener('click', clearDebugFlags);
        root.querySelector('[data-scroll-qa-enable]')?.addEventListener('click', () => {
            enableScrollQa();
            openPanel();
        });
        root.querySelector('[data-scroll-qa-disable]')?.addEventListener('click', () => {
            disableScrollQa();
            openTools();
        });
        root.querySelector('[data-scroll-qa-copy]')?.addEventListener('click', () => copyDebugInfo(info));
    }

    function openTesterChat() {
        try {
            if (window.Telegram?.WebApp?.openTelegramLink) {
                window.Telegram.WebApp.openTelegramLink(TESTER_CHAT_URL);
                return;
            }
        } catch (e) {
            // Fallback below.
        }

        try {
            window.open(TESTER_CHAT_URL, '_blank', 'noopener');
        } catch (e) {
            window.location.href = TESTER_CHAT_URL;
        }
    }

    function releaseGameSelectorModalForQaReporter() {
        try {
            const modalEl = document.querySelector('#gameSelectorModal.modal.show');
            if (!modalEl || !window.bootstrap?.Modal) return null;

            const modal = window.bootstrap.Modal.getInstance(modalEl);
            if (!modal) return null;

            modal.hide();
            return modalEl;
        } catch (e) {
            return null;
        }
    }

    function focusBugReporterTextArea(modalEl = null) {
        const focusInput = () => {
            try {
                document.getElementById('qa-bug-actual')?.focus({ preventScroll: true });
            } catch (e) {
                // noop
            }
        };

        if (modalEl) {
            modalEl.addEventListener('hidden.bs.modal', focusInput, { once: true });
        }
        window.setTimeout(focusInput, modalEl ? 160 : 0);
    }

    function openBugReporter(options = {}) {
        if (!hasToolsAccess()) return;
        ensureStyles();
        closeScenario();
        if (options.resetContext) {
            selectedBugElement = null;
        }
        if (options.resetContext || !bugContextSnapshot) {
            bugContextSnapshot = getDebugInfo(selectedBugElement);
        }
        const releasedModalEl = releaseGameSelectorModalForQaReporter();
        let root = document.getElementById(ROOT_ID);
        if (!root) {
            root = document.createElement('div');
            root.id = ROOT_ID;
            document.body.appendChild(root);
        }
        root.className = 'is-open';
        root.innerHTML = `
            <div class="scroll-qa-shell" role="dialog" aria-modal="true" aria-label="Сообщить об ошибке">
                <div class="scroll-qa-header">
                    <div>
                        <h2 class="scroll-qa-title">Сообщить об ошибке</h2>
                        <div class="scroll-qa-subtitle">Опишите, что пошло не так. Информация об экране добавится автоматически.</div>
                    </div>
                    <button class="scroll-qa-close" type="button" data-scroll-qa-close>×</button>
                </div>
                <div class="scroll-qa-body">
                    <div class="scroll-qa-list">
                        <div class="scroll-qa-field">
                            <label for="qa-bug-actual">Что произошло? *</label>
                            <textarea id="qa-bug-actual" required placeholder="Например: кнопка не нажимается, текст плохо видно, экран съехал">${escapeHtml(bugDraft.actual)}</textarea>
                        </div>
                        <div class="scroll-qa-field">
                            <label for="qa-bug-expected">Что ожидали?</label>
                            <textarea id="qa-bug-expected" placeholder="Как, по-вашему, должно было работать">${escapeHtml(bugDraft.expected)}</textarea>
                        </div>
                        <div class="scroll-qa-field">
                            <label for="qa-bug-steps">Шаги или комментарий</label>
                            <textarea id="qa-bug-steps" placeholder="Что нажали перед проблемой, как повторить, ссылка на скрин или видео">${escapeHtml(bugDraft.steps)}</textarea>
                        </div>
                        <div>
                            <div class="scroll-qa-muted" style="font-weight:800;margin-bottom:6px;">Место на экране</div>
                            <div class="scroll-qa-element-summary" data-scroll-qa-element-summary>${escapeHtml(formatElementSummary(selectedBugElement) || 'Не выбран')}</div>
                        </div>
                        <div class="scroll-qa-inline-actions">
                            <button class="scroll-qa-action secondary" type="button" data-scroll-qa-pick-element>Выбрать элемент</button>
                            <button class="scroll-qa-action" type="button" data-scroll-qa-submit-bug>Отправить</button>
                        </div>
                        <div class="scroll-qa-inline-actions">
                            <button class="scroll-qa-link-action" type="button" data-scroll-qa-copy-bug>Скопировать</button>
                            <details class="scroll-qa-advanced" data-scroll-qa-advanced>
                                <summary aria-expanded="false" aria-controls="scroll-qa-advanced-panel">
                                    <span class="scroll-qa-advanced-label" data-scroll-qa-advanced-label>Дополнительно</span>
                                    <i class="bi bi-chevron-down scroll-qa-advanced-chevron" aria-hidden="true"></i>
                                </summary>
                            </details>
                        </div>
                        <details class="scroll-qa-advanced" id="scroll-qa-advanced-panel" data-scroll-qa-advanced-panel>
                            <summary style="display:none;">Дополнительно</summary>
                            <div class="scroll-qa-list scroll-qa-advanced-body" style="gap:10px;">
                                <div class="scroll-qa-field">
                                    <label>Тип проблемы</label>
                                    <div class="scroll-qa-segment">
                                        ${reportOption('type', 'bug', 'Баг', bugDraft.type)}
                                        ${reportOption('type', 'ux', 'UX', bugDraft.type)}
                                        ${reportOption('type', 'theme', 'Тема', bugDraft.type)}
                                        ${reportOption('type', 'scroll', 'Скролл', bugDraft.type)}
                                        ${reportOption('type', 'copy', 'Текст', bugDraft.type)}
                                        ${reportOption('type', 'idea', 'Идея', bugDraft.type)}
                                    </div>
                                </div>
                                <div class="scroll-qa-field">
                                    <label>Важность</label>
                                    <div class="scroll-qa-segment">
                                        ${reportOption('severity', 'critical', 'Критично', bugDraft.severity)}
                                        ${reportOption('severity', 'medium', 'Средне', bugDraft.severity)}
                                        ${reportOption('severity', 'minor', 'Мелочь', bugDraft.severity)}
                                    </div>
                                </div>
                                <button class="scroll-qa-action secondary" type="button" data-scroll-qa-copy-codex>Скопировать prompt для Codex</button>
                                <button class="scroll-qa-action secondary" type="button" data-scroll-qa-copy-debug>Скопировать полный debug info</button>
                                <button class="scroll-qa-action secondary" type="button" data-scroll-qa-copy-last>Скопировать последний репорт</button>
                            </div>
                        </details>
                    </div>
                </div>
            </div>
        `;
        const advancedToggle = root.querySelector('[data-scroll-qa-advanced]');
        const advancedPanel = root.querySelector('[data-scroll-qa-advanced-panel]');
        const advancedSummary = advancedToggle?.querySelector('summary');
        const advancedLabel = root.querySelector('[data-scroll-qa-advanced-label]');
        advancedToggle?.addEventListener('toggle', () => {
            if (!advancedPanel) return;
            const isOpen = advancedToggle.open;
            advancedPanel.open = isOpen;
            if (advancedSummary) advancedSummary.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
            if (advancedLabel) advancedLabel.textContent = isOpen ? 'Скрыть поля' : 'Дополнительно';
            if (isOpen) {
                setTimeout(() => {
                    advancedPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }, 40);
            }
        });
        root.querySelector('[data-scroll-qa-close]')?.addEventListener('click', closePanel);
        root.querySelector('[data-scroll-qa-pick-element]')?.addEventListener('click', startElementPicker);
        root.querySelector('[data-scroll-qa-submit-bug]')?.addEventListener('click', submitBugReport);
        root.querySelector('[data-scroll-qa-copy-bug]')?.addEventListener('click', () => copyBugReport(buildCurrentBugReport()));
        root.querySelector('[data-scroll-qa-copy-codex]')?.addEventListener('click', () => copyCodexPrompt(buildCurrentBugReport()));
        root.querySelector('[data-scroll-qa-copy-debug]')?.addEventListener('click', () => copyDebugInfo(getBugReportDebugInfo()));
        root.querySelector('[data-scroll-qa-copy-last]')?.addEventListener('click', copyLastBugReport);
        root.querySelectorAll('#qa-bug-actual, #qa-bug-expected, #qa-bug-steps, input[name="qa-bug-type"], input[name="qa-bug-severity"]').forEach(input => {
            input.addEventListener('input', updateBugDraftFromForm);
            input.addEventListener('change', updateBugDraftFromForm);
        });
        focusBugReporterTextArea(releasedModalEl);
    }

    function updateBugDraftFromForm() {
        bugDraft = {
            type: document.querySelector('input[name="qa-bug-type"]:checked')?.value || bugDraft.type || 'bug',
            severity: document.querySelector('input[name="qa-bug-severity"]:checked')?.value || bugDraft.severity || 'medium',
            actual: document.getElementById('qa-bug-actual')?.value || '',
            expected: document.getElementById('qa-bug-expected')?.value || '',
            steps: document.getElementById('qa-bug-steps')?.value || ''
        };
    }

    function reportOption(group, value, label, currentValue) {
        const name = group === 'severity' ? 'qa-bug-severity' : 'qa-bug-type';
        const id = `${name}-${value}`;
        return `
            <label for="${id}">
                <input id="${id}" name="${name}" type="radio" value="${escapeHtml(value)}" ${currentValue === value ? 'checked' : ''}>
                <span>${escapeHtml(label)}</span>
            </label>
        `;
    }

    function startElementPicker() {
        updateBugDraftFromForm();
        closePanel();
        const hint = document.createElement('div');
        hint.className = 'scroll-qa-picker-hint';
        hint.textContent = 'Нажмите на проблемный элемент';
        document.body.appendChild(hint);

        let handled = false;
        const cleanupPicker = () => {
            document.removeEventListener('pointerdown', onPick, true);
            hint.remove();
        };
        const cleanupClickSuppressor = () => {
            document.removeEventListener('click', suppressClick, true);
        };
        const suppressClick = (event) => {
            if (!handled) return;
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
        };
        const onPick = (event) => {
            if (event.target === hint) return;
            handled = true;
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            selectedBugElement = describeElement(event.target, event);
            if (bugContextSnapshot) bugContextSnapshot.selected_element = selectedBugElement;
            cleanupPicker();
            setTimeout(cleanupClickSuppressor, 450);
            setTimeout(() => openBugReporter({ preserveContext: true }), 80);
        };

        document.addEventListener('pointerdown', onPick, true);
        document.addEventListener('click', suppressClick, true);
    }

    function describeElement(target, event) {
        const element = target instanceof Element ? target : null;
        if (!element) return null;
        const closest = element.closest('button,a,input,textarea,select,label,[role="button"],[onclick]');
        const rect = element.getBoundingClientRect();
        const closestRect = closest && closest !== element ? closest.getBoundingClientRect() : null;
        return {
            tagName: element.tagName,
            id: element.id || '',
            className: safeClassName(element),
            textContent: trimText(element.textContent, 120),
            ariaLabel: element.getAttribute('aria-label') || '',
            role: element.getAttribute('role') || '',
            name: element.getAttribute('name') || '',
            type: element.getAttribute('type') || '',
            placeholder: element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement ? element.placeholder || '' : '',
            selector: buildElementPath(element),
            closest: closest ? {
                tagName: closest.tagName,
                id: closest.id || '',
                className: safeClassName(closest),
                textContent: trimText(closest.textContent, 120),
                ariaLabel: closest.getAttribute('aria-label') || '',
                role: closest.getAttribute('role') || '',
                name: closest.getAttribute('name') || '',
                type: closest.getAttribute('type') || '',
                selector: buildElementPath(closest),
                rect: closestRect ? rectToPlain(closestRect) : null
            } : null,
            rect: rectToPlain(rect),
            click: {
                x: Math.round(event.clientX),
                y: Math.round(event.clientY)
            }
        };
    }

    function safeClassName(element) {
        const value = typeof element.className === 'string' ? element.className : '';
        return value.trim().replace(/\s+/g, ' ').slice(0, 180);
    }

    function trimText(value, maxLength) {
        return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
    }

    function rectToPlain(rect) {
        return {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            top: Math.round(rect.top),
            left: Math.round(rect.left)
        };
    }

    function buildElementPath(element) {
        const parts = [];
        let node = element;
        while (node && node.nodeType === 1 && parts.length < 5 && node !== document.body) {
            let part = node.tagName.toLowerCase();
            if (node.id) {
                part += `#${cssEscape(node.id)}`;
                parts.unshift(part);
                break;
            }
            const classes = safeClassName(node).split(' ').filter(Boolean).slice(0, 2);
            if (classes.length) part += `.${classes.map(cssEscape).join('.')}`;
            const parent = node.parentElement;
            if (parent) {
                const siblings = Array.from(parent.children).filter(child => child.tagName === node.tagName);
                if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(node) + 1})`;
            }
            parts.unshift(part);
            node = parent;
        }
        return parts.join(' > ');
    }

    function cssEscape(value) {
        if (window.CSS?.escape) return window.CSS.escape(String(value));
        return String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
    }

    function formatElementSummary(info) {
        if (!info) return '';
        const primary = formatElementLine(info);
        const closest = info.closest && info.closest.selector !== info.selector ? `\nClosest: ${formatElementLine(info.closest)}` : '';
        const text = info.textContent ? `\nТекст: ${info.textContent}` : '';
        const rect = info.rect ? `\nRect: x=${info.rect.x}, y=${info.rect.y}, w=${info.rect.width}, h=${info.rect.height}` : '';
        const click = info.click ? `\nClick: x=${info.click.x}, y=${info.click.y}` : '';
        return `${primary}${closest}${text}${rect}${click}`;
    }

    function formatElementLine(info) {
        if (!info) return 'unknown';
        if (info.selector) return info.selector;
        const id = info.id ? `#${info.id}` : '';
        const classes = info.className ? `.${info.className.split(' ').slice(0, 2).join('.')}` : '';
        return `${String(info.tagName || 'element').toLowerCase()}${id}${classes}`;
    }

    function buildCurrentBugReport() {
        updateBugDraftFromForm();
        return buildCompactBugReport(getBugReportDebugInfo(), bugDraft);
    }

    function getBugReportDebugInfo() {
        const info = bugContextSnapshot || getDebugInfo(selectedBugElement);
        return {
            ...info,
            selected_element: selectedBugElement || info.selected_element || null,
            qa_event_trail: qaEventTrail.slice(-QA_EVENT_LIMIT)
        };
    }

    async function submitBugReport() {
        updateBugDraftFromForm();
        if (!bugDraft.actual.trim()) {
            if (window.showToast) window.showToast('Заполните поле “Что произошло?”', 'warning');
            else if (window.showAlert) window.showAlert('QA tools', 'Заполните поле “Что произошло?”', 'warning');
            return;
        }
        const now = Date.now();
        if (now - lastBugReportSentAt < BUG_REPORT_RATE_LIMIT_MS) {
            const wait = Math.ceil((BUG_REPORT_RATE_LIMIT_MS - (now - lastBugReportSentAt)) / 1000);
            if (window.showToast) window.showToast(`Подождите ${wait} сек. перед повторной отправкой`, 'warning');
            return;
        }

        const report = buildCompactBugReport(getBugReportDebugInfo(), bugDraft);
        saveLastBugReport(report);
        lastBugReportSentAt = now;
        try {
            const res = typeof window.apiRequest === 'function'
                ? await window.apiRequest({ action: 'submit_qa_bug_report', report })
                : null;
            if (res?.status === 'ok') {
                const sentMessage = res.report_id
                    ? `Баг-репорт отправлен #${res.report_id}`
                    : 'Баг-репорт отправлен';
                if (window.showToast) window.showToast(sentMessage, 'success');
                else if (window.showAlert) window.showAlert('QA tools', sentMessage, 'success');
                closePanel();
                return;
            }
            throw new Error(res?.message || 'logger unavailable');
        } catch (e) {
            copyBugReport(report, 'Отправка не удалась. Баг-репорт скопирован');
        }
    }

    function openPanel() {
        if (!hasToolsAccess()) return;
        ensureStyles();
        enableScrollQa();
        closeScenario();
        let root = document.getElementById(ROOT_ID);
        if (!root) {
            root = document.createElement('div');
            root.id = ROOT_ID;
            document.body.appendChild(root);
        }
        root.className = 'is-open';
        root.innerHTML = `
            <div class="scroll-qa-shell" role="dialog" aria-modal="true" aria-label="Scroll QA">
                <div class="scroll-qa-header">
                    <div>
                        <h2 class="scroll-qa-title">Android Scroll QA</h2>
                        <div class="scroll-qa-subtitle">Mock screens only. No API, no game actions, no XP/history.</div>
                    </div>
                    <button class="scroll-qa-close" type="button" data-scroll-qa-close>×</button>
                </div>
                <div class="scroll-qa-body">
                    <div class="scroll-qa-note">
                        Открывайте сценарий и проверяйте свайп с текста, карточек, пустого фона и рядом с нижними кнопками.
                    </div>
                    <div class="scroll-qa-list">
                        ${scenarioButton('brainbattle-final', 'BrainBattle: final/results mock', 'AI summary, results cards, fixed bottom actions')}
                        ${scenarioButton('brainbattle-waiting', 'BrainBattle: waiting/review mock', 'Result hero, review cards, long waiting content')}
                        ${scenarioButton('partybattle-results', 'PartyBattle: results mock', 'Ranking list in one scroll container')}
                        ${scenarioButton('bunker-outro', 'Bunker: outro/final mock', 'AI epilogue, stories, fixed footer')}
                        ${scenarioButton('bunker-reveal', 'Bunker: reveal popup long text', 'Long reveal content inside overlay')}
                        ${scenarioButton('daily-modal', 'Daily modal long content', 'Tasks list and compact claim actions')}
                    </div>
                </div>
            </div>
        `;
        root.querySelector('[data-scroll-qa-close]')?.addEventListener('click', closePanel);
        root.querySelectorAll('[data-scroll-qa-scenario]').forEach(button => {
            button.addEventListener('click', () => openScenario(button.dataset.scrollQaScenario));
        });
    }



    function closeThemeContrastQa() {
        document.getElementById(THEME_QA_SCREEN_ID)?.remove();
    }

    function getCompactThemeQaData() {
        const tg = window.Telegram?.WebApp;
        const html = document.documentElement;
        const body = document.body;
        const getVar = (name) => {
            return window.getComputedStyle(html).getPropertyValue(name).trim() ||
                   window.getComputedStyle(body).getPropertyValue(name).trim() || 'unknown';
        };
        const paletteId = html.getAttribute('data-palette') || 'unknown';
        const labels = {
            'amber-sapphire': 'Янтарный сапфир',
            'olive-sand': 'Оливковый песок',
            'lavender-graphite': 'Лавандовый графит',
            'burgundy-cream': 'Бордовый крем',
            'jade-biscuit': 'Нефритовый бисквит',
            'azure-quartz': 'Лазурный кварц',
            'graphite-lemon': 'Графитовый лимон',
            'beige-olive': 'Бежево-оливковая'
        };
        const label = labels[paletteId] || paletteId;

        return {
            preference: html.getAttribute('data-theme-preference') || 'auto',
            resolved_theme: html.getAttribute('data-theme') || 'unknown',
            palette_id: paletteId,
            palette_label: label,
            telegram_color_scheme: tg?.colorScheme || 'unknown',
            platform: tg?.platform || 'web',
            viewport: `${window.innerWidth} × ${window.innerHeight}`,
            html: {
                classes: html.className,
                data_theme: html.getAttribute('data-theme'),
                data_theme_preference: html.getAttribute('data-theme-preference'),
                data_palette: paletteId
            },
            body_classes: body?.className || '',
            tokens: {
                app_bg: getVar('--app-bg'),
                app_surface: getVar('--app-surface'),
                app_text: getVar('--app-text'),
                app_accent: getVar('--app-accent')
            }
        };
    }

    function copyCompactThemeQa() {
        const data = getCompactThemeQaData();
        const text = JSON.stringify(data, null, 2);
        const done = () => {
            if (window.showToast) window.showToast('Theme QA скопирован');
            else if (window.showAlert) window.showAlert('QA tools', 'Theme QA скопирован', 'success');
            else alert('Theme QA скопирован');
        };
        if (navigator.clipboard?.writeText) {
            navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
        } else {
            fallbackCopy(text, done);
        }
    }

    function scenarioButton(id, title, description) {
        return `
            <button class="scroll-qa-scenario-btn" type="button" data-scroll-qa-scenario="${id}">
                <strong>${title}</strong>
                <span>${description}</span>
            </button>
        `;
    }

    function closePanel() {
        const root = document.getElementById(ROOT_ID);
        if (root) {
            root.className = '';
            root.innerHTML = '';
        }
        cleanupLeakedClasses();
    }

    function getAppBuildVersion() {
        try {
            const scripts = document.getElementsByTagName('script');
            for (let i = 0; i < scripts.length; i++) {
                const src = scripts[i].getAttribute('src') || '';
                if (src.includes('js/app.js?v=')) {
                    return src.split('v=')[1] || 'unknown';
                }
            }
        } catch (e) {
            // noop
        }
        return window.appVersion || 'unknown';
    }

    function getDebugInfo(selectedElement = selectedBugElement) {
        const tg = window.Telegram?.WebApp;
        const user = getCurrentUser();
        const rawTesterValue = getRawTesterValue(user);
        const visualViewport = window.visualViewport;
        return {
            timestamp: new Date().toISOString(),
            user_id: user?.id || null,
            telegram_id: user?.telegram_id || null,
            is_tester: isTesterUser(user),
            user_is_tester: rawTesterValue,
            user_is_tester_type: typeof rawTesterValue,
            scroll_qa_has_tools_access: hasToolsAccess(user),
            platform: tg?.platform || 'web',
            app_version: getAppBuildVersion(),
            app_build: getAppBuildVersion(),
            debug_scroll_qa: isEnabled(),
            debug_theme_qa: isThemeQaEnabled(),
            theme_qa: getCompactThemeQaData(),
            debug_bb_touch: safeLocalStorageGet('DEBUG_BB_TOUCH') === '1',
            active_screen: getActiveScreen(),
            active_tab: getActiveTabSummary(),
            viewport: {
                width: window.innerWidth,
                height: window.innerHeight,
                visual_width: visualViewport ? Math.round(visualViewport.width) : null,
                visual_height: visualViewport ? Math.round(visualViewport.height) : null,
                visual_offset_top: visualViewport ? Math.round(visualViewport.offsetTop) : null,
                visual_offset_left: visualViewport ? Math.round(visualViewport.offsetLeft) : null
            },
            telegram: tg ? {
                platform: tg.platform || null,
                color_scheme: tg.colorScheme || null,
                theme_params: sanitizeThemeParams(tg.themeParams),
                version: tg.version || null,
                is_expanded: typeof tg.isExpanded === 'boolean' ? tg.isExpanded : null,
                viewport_height: tg.viewportHeight || null,
                viewport_stable_height: tg.viewportStableHeight || null
            } : null,
            classes: {
                body: document.body?.className || '',
                html: document.documentElement?.className || ''
            },
            visible_overlays: getVisibleOverlaySummary(),
            scroll: getScrollSummary(),
            url: window.location.href,
            user_agent: navigator.userAgent,
            qa_event_trail: qaEventTrail.slice(-QA_EVENT_LIMIT),
            selected_element: selectedElement || null
        };
    }

    function getActiveTabSummary() {
        const selectors = [
            '.nav-link.active',
            '.tab.active',
            '.bottom-nav .active',
            '[data-tab].active',
            '[aria-selected="true"]'
        ];
        for (const selector of selectors) {
            const el = document.querySelector(selector);
            if (el) {
                return {
                    selector: buildElementPath(el),
                    id: el.id || '',
                    text: trimText(el.textContent, 80),
                    data_tab: el.getAttribute('data-tab') || ''
                };
            }
        }
        return null;
    }

    function sanitizeThemeParams(themeParams) {
        if (!themeParams || typeof themeParams !== 'object') return null;
        const allowed = {};
        Object.keys(themeParams).forEach(key => {
            const value = themeParams[key];
            if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
                allowed[key] = value;
            }
        });
        return allowed;
    }

    function getVisibleOverlaySummary() {
        const selectors = [
            '.modal.show',
            '.custom-modal-overlay.active',
            '.custom-modal-overlay.show',
            '.history-details-overlay.active'
        ];
        return selectors.flatMap(selector => Array.from(document.querySelectorAll(selector)).map(el => ({
            selector,
            id: el.id || '',
            className: safeClassName(el),
            text: trimText(el.textContent, 100)
        })));
    }

    function getScrollSummary() {
        const appContainer = document.querySelector('.device-content, #app, #main-content, main, .screen.active-screen, .screen.active');
        return {
            window_scroll_y: Math.round(window.scrollY || 0),
            window_scroll_x: Math.round(window.scrollX || 0),
            app_container: appContainer ? {
                selector: buildElementPath(appContainer),
                scroll_top: Math.round(appContainer.scrollTop || 0),
                scroll_height: Math.round(appContainer.scrollHeight || 0),
                client_height: Math.round(appContainer.clientHeight || 0)
            } : null
        };
    }

    function copyDebugInfo(info = getDebugInfo()) {
        const text = buildFullDebugInfoText(info);
        const done = () => {
            if (window.showToast) window.showToast('Debug info скопирован');
            else if (window.showAlert) window.showAlert('QA tools', 'Debug info скопирован', 'success');
        };
        if (navigator.clipboard?.writeText) {
            navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
        } else {
            fallbackCopy(text, done);
        }
    }

    function buildFullDebugInfoText(info = getDebugInfo()) {
        return JSON.stringify(info, null, 2);
    }

    function buildCompactBugReport(info = getDebugInfo(), fields = null) {
        const reportFields = fields || {
            type: 'bug',
            severity: 'medium',
            actual: '',
            expected: '',
            steps: ''
        };
        const reportType = reportFields.type || 'bug';
        const severity = reportFields.severity || 'medium';
        const theme = info.telegram?.theme_params || {};
        const activeTab = info.active_tab?.text || info.active_tab?.data_tab || info.active_tab?.selector || '';
        const overlays = Array.isArray(info.visible_overlays) && info.visible_overlays.length
            ? info.visible_overlays.map(overlay => `${overlay.selector}${overlay.id ? `#${overlay.id}` : ''}`).join(', ')
            : 'none';
        const bodyClasses = truncateText(info.classes?.body || '', 220);
        const htmlClasses = truncateText(info.classes?.html || '', 220);
        const eventTrail = formatQaEventTrail(info.qa_event_trail);
        return [
            `#qa_bug #party_games${getReportTypeTag(reportType)}`,
            `severity=${severity}`,
            '',
            'Что не так:',
            truncateText(reportFields.actual || '', 1000),
            '',
            'Как должно быть:',
            truncateText(reportFields.expected || '', 1000),
            '',
            'Шаги:',
            truncateText(reportFields.steps || '', 1000),
            '',
            'Экран:',
            `${info.active_screen || 'unknown'}${activeTab ? ` / ${activeTab}` : ''}`,
            '',
            'Элемент:',
            formatCompactElementSummary(info.selected_element) || 'Не выбран',
            '',
            'Последние QA события:',
            eventTrail || 'none',
            '',
            'Контекст:',
            `timestamp=${info.timestamp || 'unknown'}`,
            `user_id=${info.user_id || 'unknown'}`,
            `telegram_id=${info.telegram_id || 'unknown'}`,
            `is_tester=${info.is_tester ? 1 : 0}`,
            `platform=${info.platform || 'unknown'}`,
            `telegram_platform=${info.telegram?.platform || 'unknown'}`,
            `telegram_version=${info.telegram?.version || 'unknown'}`,
            `app_build=${info.app_build || info.app_version || 'unknown'}`,
            `viewport=${formatViewport(info)}`,
            `visual_viewport=${formatVisualViewport(info)}`,
            `url=${info.url || window.location.href}`,
            `body_classes=${bodyClasses || 'none'}`,
            `html_classes=${htmlClasses || 'none'}`,
            `visible_overlays=${truncateText(overlays, 260)}`,
            `telegram_color_scheme=${info.telegram?.color_scheme || 'unknown'}`,
            `theme_bg_color=${theme.bg_color || 'unknown'}`,
            `theme_secondary_bg_color=${theme.secondary_bg_color || 'unknown'}`,
            `theme_text_color=${theme.text_color || 'unknown'}`,
            `theme_hint_color=${theme.hint_color || 'unknown'}`,
            `theme_button_color=${theme.button_color || 'unknown'}`,
            `theme_button_text_color=${theme.button_text_color || 'unknown'}`,
            `DEBUG_SCROLL_QA=${info.debug_scroll_qa ? 1 : 0}`,
            `DEBUG_THEME_QA=${info.debug_theme_qa ? 1 : 0}`,
            `DEBUG_BB_TOUCH=${info.debug_bb_touch ? 1 : 0}`,
            `ua=${truncateText(info.user_agent || 'unknown', 240)}`
        ].join('\n');
    }

    function getReportTypeTag(type) {
        const tags = {
            ux: ' #ux',
            theme: ' #theme',
            scroll: ' #scroll',
            copy: ' #copy',
            idea: ' #idea'
        };
        return tags[type] || '';
    }

    function formatQaEventTrail(events) {
        if (!Array.isArray(events) || !events.length) return '';
        const compact = [];
        events.forEach(event => {
            if (isNoisyCompactQaEvent(event)) return;
            const item = buildCompactQaEvent(event);
            if (!item) return;
            const previous = compact[compact.length - 1];
            if (previous && previous.key === item.key) {
                previous.count += 1;
                previous.t = item.t;
                return;
            }
            compact.push({ ...item, count: 1 });
        });

        return compact.slice(-MAX_COMPACT_QA_EVENTS).map(item => {
            const count = item.count > 1 ? ` ×${item.count}` : '';
            const parts = [`${item.t || 'time?'} ${item.type}${count}`];
            if (item.screen) parts.push(item.screen);
            if (item.target) parts.push(item.target);
            return truncateText(parts.join(' | '), 140);
        }).join('\n');
    }

    function isNoisyCompactQaEvent(event) {
        if (!event || !event.type) return true;
        if (event.type === 'qa_loaded') return true;
        const target = String(event.target || '').toLowerCase();
        if (!target) return event.type === 'click';
        if (target === 'body' || target === 'html') return true;
        if (target.includes(`#${BUTTON_ID}`) || target.includes(`#${ROOT_ID}`)) return true;
        return false;
    }

    function buildCompactQaEvent(event) {
        const type = event.type || '';
        const screen = truncateText(event.screen || '', 32);
        const target = formatCompactQaEventTarget(event);
        if (type === 'screenChanged') {
            return {
                t: event.t || '',
                type,
                screen: target || screen,
                target: '',
                key: [type, target || screen].join('|')
            };
        }
        return {
            t: event.t || '',
            type,
            screen,
            target,
            key: [type, screen, target].join('|')
        };
    }

    function formatCompactQaEventTarget(event) {
        const raw = String(event?.target || '').trim();
        if (!raw) return '';
        const quoted = raw.match(/"([^"]+)"/);
        const text = quoted ? truncateText(quoted[1], 48) : '';
        const selector = quoted ? raw.slice(0, quoted.index).trim() : raw;
        const lowerSelector = selector.toLowerCase();
        if (lowerSelector.includes('rewards-achievement-filter')) {
            return text ? `filter "${text}"` : 'achievement filter';
        }
        if (lowerSelector.includes('rewards-preview-tile-nav')) {
            return text ? `rewards nav "${text}"` : 'rewards nav';
        }
        if (lowerSelector.includes('profile-daily') || lowerSelector.includes('daily-profile')) {
            return text ? `daily "${text}"` : 'daily tasks';
        }
        const shortSelector = shortenQaSelector(selector);
        if (text) return `${shortSelector} "${text}"`;
        return shortSelector;
    }

    function shortenQaSelector(selector) {
        const value = String(selector || '').trim();
        if (!value) return '';
        const idMatch = value.match(/([a-z0-9_-]+)?#[a-zA-Z0-9_-]+/);
        if (idMatch) return idMatch[0];
        const last = value.split('>').map(part => part.trim()).filter(Boolean).pop() || value;
        return truncateText(last.replace(/:nth-of-type\(\d+\)/g, ''), 64);
    }

    function truncateText(value, maxLength) {
        const text = String(value || '').replace(/\s+/g, ' ').trim();
        if (text.length <= maxLength) return text;
        return `${text.slice(0, Math.max(0, maxLength - 1))}…`;
    }

    function formatViewport(info) {
        return `${info.viewport?.width || '?'}x${info.viewport?.height || '?'}`;
    }

    function formatVisualViewport(info) {
        return info.viewport?.visual_width
            ? `${info.viewport.visual_width}x${info.viewport.visual_height}+${info.viewport.visual_offset_left || 0},${info.viewport.visual_offset_top || 0}`
            : 'unknown';
    }

    function formatCompactElementSummary(info) {
        if (!info) return '';
        const lines = [
            `selector=${truncateText(formatElementLine(info), 300)}`
        ];
        const label = truncateText(info.textContent || info.placeholder || info.ariaLabel || '', 160);
        if (label) lines.push(`text=${label}`);
        if (info.rect) {
            lines.push(`rect=x=${info.rect.x}, y=${info.rect.y}, w=${info.rect.width}, h=${info.rect.height}`);
        }
        if (info.click) {
            lines.push(`click=x=${info.click.x}, y=${info.click.y}`);
        }
        if (info.closest && info.closest.selector !== info.selector) {
            lines.push(`closest=${truncateText(formatElementLine(info.closest), 300)}`);
        }
        return lines.join('\n');
    }

    function copyBugReport(infoOrText = getDebugInfo(), successMessage = 'Шаблон баг-репорта скопирован') {
        const text = typeof infoOrText === 'string' ? infoOrText : buildCompactBugReport(infoOrText);
        saveLastBugReport(text);
        const done = () => {
            if (window.showToast) window.showToast(successMessage);
            else if (window.showAlert) window.showAlert('QA tools', successMessage, 'success');
        };
        if (navigator.clipboard?.writeText) {
            navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
        } else {
            fallbackCopy(text, done);
        }
    }

    function copyCodexPrompt(report = buildCurrentBugReport()) {
        const text = [
            'Ответь на русском.',
            '',
            'Нужно принять QA bug report и предложить/внести focused fix без broad redesign.',
            '',
            report
        ].join('\n');
        copyText(text, 'Prompt для Codex скопирован');
    }

    function copyLastBugReport() {
        const text = safeLocalStorageGet(LAST_BUG_REPORT_KEY);
        if (!text) {
            if (window.showToast) window.showToast('Последнего репорта пока нет', 'warning');
            else if (window.showAlert) window.showAlert('QA tools', 'Последнего репорта пока нет', 'warning');
            return;
        }
        copyText(text, 'Последний репорт скопирован');
    }

    function saveLastBugReport(report) {
        if (!report) return;
        safeLocalStorageSet(LAST_BUG_REPORT_KEY, report);
    }

    function clearDebugFlags() {
        try {
            if (window.localStorage) {
                window.localStorage.removeItem(STORAGE_KEY);
                window.localStorage.removeItem(THEME_QA_STORAGE_KEY);
                window.localStorage.removeItem('DEBUG_BB_TOUCH');
            }
        } catch (e) {
            // noop
        }
        closePanel();
        closeThemeContrastQa();
        removeButton();
        refreshAccess();
        if (window.showToast) window.showToast('Debug flags очищены');
    }

    function copyText(text, successMessage) {
        const done = () => {
            if (window.showToast) window.showToast(successMessage);
            else if (window.showAlert) window.showAlert('QA tools', successMessage, 'success');
        };
        if (navigator.clipboard?.writeText) {
            navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
        } else {
            fallbackCopy(text, done);
        }
    }

    function fallbackCopy(text, done) {
        const area = document.createElement('textarea');
        area.value = text;
        area.setAttribute('readonly', 'readonly');
        area.style.cssText = 'position:fixed;left:-9999px;top:0;';
        document.body.appendChild(area);
        area.select();
        try {
            document.execCommand('copy');
            done();
        } catch (e) {
            if (window.showAlert) window.showAlert('QA tools', 'Не удалось скопировать debug info', 'error');
        } finally {
            area.remove();
        }
    }

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, char => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        }[char]));
    }

    function closeScenario() {
        document.getElementById('scroll-qa-scenario')?.remove();
        cleanupLeakedClasses();
    }

    function cleanupLeakedClasses() {
        document.getElementById('screen-game')?.classList.remove('bb-brainbattle-active');
        document.getElementById('game-area')?.classList.remove('bb-brainbattle-active');
        document.getElementById('bb-wrapper')?.classList.remove('bb-final-mode');
        document.querySelectorAll('.bunker-reveal-overlay, #bb-touch-debug-overlay').forEach(node => node.remove());
    }

    function openScenario(id) {
        closePanel();
        ensureStyles();
        const screen = document.createElement('div');
        screen.id = 'scroll-qa-scenario';
        screen.className = 'scroll-qa-screen';
        screen.innerHTML = renderScenario(id);
        document.body.appendChild(screen);
        screen.querySelectorAll('[data-scroll-qa-back]').forEach(button => {
            button.addEventListener('click', () => {
                closeScenario();
                openPanel();
            });
        });
        screen.querySelectorAll('[data-scroll-qa-close-screen]').forEach(button => {
            button.addEventListener('click', closeScenario);
        });
    }

    function renderScenario(id) {
        const map = {
            'brainbattle-final': renderBrainBattleFinal,
            'brainbattle-waiting': renderBrainBattleWaiting,
            'partybattle-results': renderPartyBattleResults,
            'bunker-outro': renderBunkerOutro,
            'bunker-reveal': renderBunkerReveal,
            'daily-modal': renderDailyModal
        };
        return (map[id] || renderBrainBattleFinal)();
    }

    function screenShell(title, body, actionLabel = 'Закрыть QA screen') {
        return `
            <div class="scroll-qa-screen-header">
                <button class="scroll-qa-back" type="button" data-scroll-qa-back>Назад</button>
                <div class="scroll-qa-screen-title">${title}</div>
                <button class="scroll-qa-close" type="button" data-scroll-qa-close-screen>×</button>
            </div>
            <div class="scroll-qa-scroll">
                <div class="scroll-qa-note">
                    Проверьте: свайп с текста, карточки, кнопки и пустого фона. Низ должен быть достижим, double scroll быть не должен.
                </div>
                ${body}
            </div>
            <div class="scroll-qa-fixed-actions">
                <button class="scroll-qa-action" type="button" data-scroll-qa-close-screen>${actionLabel}</button>
            </div>
        `;
    }

    function repeatCards(count, render) {
        return Array.from({ length: count }, (_, index) => render(index)).join('');
    }

    function renderBrainBattleFinal() {
        const body = `
            <div class="scroll-qa-card" style="text-align:center;background:linear-gradient(180deg,#eef2ff,#fff);">
                <div style="font-size:46px;margin-bottom:8px;">🏆</div>
                <h2 style="margin:0 0 6px;font-weight:900;">Итоги BrainBattle</h2>
                <div class="scroll-qa-muted">AI summary + финальная статистика + нижние actions.</div>
            </div>
            <div class="scroll-qa-card">
                <strong>AI summary</strong>
                ${repeatCards(8, i => `<p class="scroll-qa-muted">${i + 1}. ${longParagraph}</p>`)}
            </div>
            ${repeatCards(10, i => `
                <div class="scroll-qa-card scroll-qa-rank-row">
                    <div><strong>#${i + 1} Игрок ${i + 1}</strong><div class="scroll-qa-muted">Раунды, точность и скорость ответа</div></div>
                    <strong>${120 - i * 7} XP</strong>
                </div>
            `)}
        `;
        return screenShell('BrainBattle Final Mock', body);
    }

    function renderBrainBattleWaiting() {
        const body = `
            <div class="scroll-qa-card" style="text-align:center;">
                <div style="width:96px;height:96px;margin:0 auto 12px;border-radius:50%;background:#dcfce7;color:#16a34a;display:flex;align-items:center;justify-content:center;font-size:42px;">✓</div>
                <h2 style="margin:0 0 4px;">Верно!</h2>
                <div class="scroll-qa-muted">Проверь, не клипается ли верхняя иконка и скроллится ли экран.</div>
            </div>
            ${repeatCards(14, i => `
                <div class="scroll-qa-card">
                    <strong>Review card ${i + 1}</strong>
                    <p class="scroll-qa-muted">${longParagraph}</p>
                </div>
            `)}
        `;
        return screenShell('BrainBattle Waiting/Review Mock', body);
    }

    function renderPartyBattleResults() {
        const body = `
            <div class="scroll-qa-card" style="text-align:center;">
                <div style="font-size:44px;">🎭</div>
                <h2 style="margin:6px 0;">PartyBattle Results</h2>
                <div class="scroll-qa-muted">One root scroll container, no inner ranking overflow.</div>
            </div>
            ${repeatCards(16, i => `
                <div class="scroll-qa-card scroll-qa-player-row">
                    <div style="display:flex;align-items:center;gap:12px;min-width:0;">
                        <div class="scroll-qa-avatar"></div>
                        <div style="min-width:0;"><strong>Игрок ${i + 1}</strong><div class="scroll-qa-muted">Финальный рейтинг и описание результата</div></div>
                    </div>
                    <strong>${180 - i * 6} XP</strong>
                </div>
            `)}
        `;
        return screenShell('PartyBattle Results Mock', body);
    }

    function renderBunkerOutro() {
        const body = `
            <div class="scroll-qa-card" style="text-align:center;background:#f0fdf4;">
                <h2 style="margin:0 0 8px;">История бункера</h2>
                <div class="scroll-qa-muted">AI epilogue, threats, survivor stories, fixed footer.</div>
            </div>
            <div class="scroll-qa-card">
                <strong>Эпилог AI</strong>
                ${repeatCards(9, i => `<p class="scroll-qa-muted">${i + 1}. ${longParagraph}</p>`)}
            </div>
            ${repeatCards(12, i => `
                <div class="scroll-qa-card">
                    <strong>${i % 3 === 0 ? 'Угроза' : 'История игрока'} ${i + 1}</strong>
                    <p class="scroll-qa-muted">${longParagraph}</p>
                </div>
            `)}
        `;
        return screenShell('Bunker Outro/Final Mock', body, 'QA: fixed final action');
    }

    function renderBunkerReveal() {
        const body = `
            <div class="scroll-qa-reveal-card">
                <div class="scroll-qa-card">
                    <div style="text-align:center;">
                        <div style="font-size:48px;">🧬</div>
                        <h2 style="margin:8px 0;">Длинное раскрытие карты</h2>
                        <div class="scroll-qa-muted">Этот сценарий проверяет overlay/card scroll, а не API reveal.</div>
                    </div>
                    ${repeatCards(18, i => `<p class="scroll-qa-muted">${i + 1}. ${longParagraph}</p>`)}
                </div>
            </div>
        `;
        return screenShell('Bunker Reveal Popup Mock', body);
    }

    function renderDailyModal() {
        const body = `
            <div class="scroll-qa-card">
                <strong>Задания дня</strong>
                <div class="scroll-qa-muted">Long modal content with compact claim controls.</div>
            </div>
            ${repeatCards(18, i => `
                <div class="scroll-qa-card scroll-qa-player-row">
                    <div><strong>Задание ${i + 1}</strong><div class="scroll-qa-muted">${i % 2 ? '0/1 · +40 XP' : 'Выполнено · +50 XP'}</div></div>
                    <button class="scroll-qa-back" type="button">${i % 2 ? '○' : '✓'}</button>
                </div>
            `)}
        `;
        return screenShell('Daily Modal Long Mock', body);
    }

    window.ScrollQA = {
        openTools,
        open: openPanel,
        close: closePanel,
        closeScenario,
        enable: enableScrollQa,
        disable: disableScrollQa,
        refreshAccess,
        debugAccess,
        getDebugInfo,
        copyDebugInfo,
        copyBugReport,
        closeThemeContrastQa,
        isThemeQaEnabled,
        openTesterChat,
        isEnabled,
        hasToolsAccess
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
