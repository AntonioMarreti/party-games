// Debug-only Android scroll/touch QA panel. Disabled unless explicitly enabled.
(function () {
    const STORAGE_KEY = 'DEBUG_SCROLL_QA';
    const ROOT_ID = 'scroll-qa-root';
    const BUTTON_ID = 'scroll-qa-button';
    const STYLE_ID = 'scroll-qa-styles';
    const TESTER_CHAT_URL = 'https://t.me/+w6d97lbezTlmYzky';
    const BUG_REPORT_RATE_LIMIT_MS = 10000;
    let lastBugReportSentAt = 0;
    let selectedBugElement = null;
    let bugDraft = {
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
        } catch (e) {
            // noop
        }
    }

    function isEnabled() {
        return safeLocalStorageGet(STORAGE_KEY) === '1';
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

    function hasToolsAccess(user = getCurrentUser()) {
        return isTesterUser(user) || isEnabled();
    }

    function getActiveScreen() {
        const activeScreen = document.querySelector('.screen.active-screen, .screen.active, .app-screen.active, [data-screen].active');
        return activeScreen?.id || activeScreen?.dataset?.screen || null;
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
                touch-action: manipulation;
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
        `;
        document.head.appendChild(style);
    }

    function init() {
        syncFlagFromUrl();
        refreshAccess();
        window.addEventListener('screenChanged', (event) => {
            if (event.detail?.screenId === 'screen-settings') {
                refreshAccess();
            }
        });
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
            currentUser: user ? {
                id: user.id ?? null,
                telegram_id: user.telegram_id ?? null
            } : null,
            is_tester: {
                value: rawTesterValue,
                type: typeof rawTesterValue
            },
            hasAccess: access,
            settingsBlockFound: Boolean(group),
            settingsBlockDisplay: group ? window.getComputedStyle(group).display : null,
            activeScreen: getActiveScreen(),
            appBuild: getAppBuildVersion()
        };
    }

    function ensureButton() {
        if (document.getElementById(BUTTON_ID)) return;
        const button = document.createElement('button');
        button.id = BUTTON_ID;
        button.type = 'button';
        button.textContent = 'QA';
        button.title = 'Scroll QA';
        button.setAttribute('aria-label', 'Scroll QA');
        button.addEventListener('click', openPanel);
        document.body.appendChild(button);
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
                        <h2 class="scroll-qa-title">QA tools</h2>
                        <div class="scroll-qa-subtitle">Видно только тестерам или при DEBUG_SCROLL_QA.</div>
                    </div>
                    <button class="scroll-qa-close" type="button" data-scroll-qa-close>×</button>
                </div>
                <div class="scroll-qa-body">
                    <div class="scroll-qa-card">
                        <strong>Тестирование</strong>
                        <div class="scroll-qa-muted" style="margin-top:4px;">Чат, баг-репорт и быстрый доступ к Scroll QA.</div>
                        <div style="display:grid;gap:8px;margin-top:12px;">
                            <button class="scroll-qa-action" type="button" data-scroll-qa-chat>Чат тестировщиков</button>
                            <button class="scroll-qa-action" type="button" data-scroll-qa-open-bug-report>Сообщить о баге</button>
                            <button class="scroll-qa-action secondary" type="button" data-scroll-qa-bug-report>Скопировать баг-репорт</button>
                        </div>
                    </div>
                    <div class="scroll-qa-card">
                        <strong>Android Scroll QA</strong>
                        <div class="scroll-qa-muted" style="margin-top:4px;">Текущее состояние: ${isEnabled() ? 'включено' : 'выключено'}</div>
                        <div style="display:flex;gap:8px;margin-top:12px;">
                            <button class="scroll-qa-action" type="button" data-scroll-qa-enable style="flex:1;">Открыть Scroll QA</button>
                            <button class="scroll-qa-back" type="button" data-scroll-qa-disable style="min-width:96px;">Выключить</button>
                        </div>
                    </div>
                    <div class="scroll-qa-card">
                        <strong>Debug info</strong>
                        <pre style="white-space:pre-wrap;word-break:break-word;margin:10px 0 0;font:11px/1.4 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:#334155;">${escapeHtml(JSON.stringify(info, null, 2))}</pre>
                        <button class="scroll-qa-action" type="button" data-scroll-qa-copy style="margin-top:12px;">Скопировать debug info</button>
                    </div>
                </div>
            </div>
        `;
        root.querySelector('[data-scroll-qa-close]')?.addEventListener('click', closePanel);
        root.querySelector('[data-scroll-qa-chat]')?.addEventListener('click', openTesterChat);
        root.querySelector('[data-scroll-qa-open-bug-report]')?.addEventListener('click', openBugReporter);
        root.querySelector('[data-scroll-qa-bug-report]')?.addEventListener('click', () => copyBugReport(info));
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

    function openBugReporter() {
        if (!hasToolsAccess()) return;
        ensureStyles();
        closeScenario();
        let root = document.getElementById(ROOT_ID);
        if (!root) {
            root = document.createElement('div');
            root.id = ROOT_ID;
            document.body.appendChild(root);
        }
        root.className = 'is-open';
        root.innerHTML = `
            <div class="scroll-qa-shell" role="dialog" aria-modal="true" aria-label="Bug Report">
                <div class="scroll-qa-header">
                    <div>
                        <h2 class="scroll-qa-title">Сообщить о баге</h2>
                        <div class="scroll-qa-subtitle">Опишите проблему. Техническая информация добавится автоматически.</div>
                    </div>
                    <button class="scroll-qa-close" type="button" data-scroll-qa-close>×</button>
                </div>
                <div class="scroll-qa-body">
                    <div class="scroll-qa-list">
                        <div class="scroll-qa-field">
                            <label for="qa-bug-actual">Что произошло? *</label>
                            <textarea id="qa-bug-actual" required placeholder="Например: кнопка не нажимается, экран уехал, ошибка после хода">${escapeHtml(bugDraft.actual)}</textarea>
                        </div>
                        <div class="scroll-qa-field">
                            <label for="qa-bug-expected">Что ожидали?</label>
                            <textarea id="qa-bug-expected" placeholder="Как должно было работать">${escapeHtml(bugDraft.expected)}</textarea>
                        </div>
                        <div class="scroll-qa-field">
                            <label for="qa-bug-steps">Шаги / комментарий</label>
                            <textarea id="qa-bug-steps" placeholder="Что нажали перед багом, как повторить, ссылка на скрин/видео">${escapeHtml(bugDraft.steps)}</textarea>
                        </div>
                        <div>
                            <div class="scroll-qa-muted" style="font-weight:800;margin-bottom:6px;">Проблемный элемент</div>
                            <div class="scroll-qa-element-summary" data-scroll-qa-element-summary>${escapeHtml(formatElementSummary(selectedBugElement) || 'Не выбран')}</div>
                        </div>
                        <button class="scroll-qa-action secondary" type="button" data-scroll-qa-pick-element>Выбрать элемент на экране</button>
                        <button class="scroll-qa-action" type="button" data-scroll-qa-submit-bug>Отправить баг-репорт</button>
                        <button class="scroll-qa-action secondary" type="button" data-scroll-qa-copy-bug>Скопировать баг-репорт</button>
                    </div>
                </div>
            </div>
        `;
        root.querySelector('[data-scroll-qa-close]')?.addEventListener('click', closePanel);
        root.querySelector('[data-scroll-qa-pick-element]')?.addEventListener('click', startElementPicker);
        root.querySelector('[data-scroll-qa-submit-bug]')?.addEventListener('click', submitBugReport);
        root.querySelector('[data-scroll-qa-copy-bug]')?.addEventListener('click', () => copyBugReport(buildCurrentBugReport()));
        root.querySelectorAll('#qa-bug-actual, #qa-bug-expected, #qa-bug-steps').forEach(input => {
            input.addEventListener('input', updateBugDraftFromForm);
        });
    }

    function updateBugDraftFromForm() {
        bugDraft = {
            actual: document.getElementById('qa-bug-actual')?.value || '',
            expected: document.getElementById('qa-bug-expected')?.value || '',
            steps: document.getElementById('qa-bug-steps')?.value || ''
        };
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
            cleanupPicker();
            setTimeout(cleanupClickSuppressor, 450);
            setTimeout(openBugReporter, 80);
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
        return buildBugReport(getDebugInfo(selectedBugElement), bugDraft);
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

        const report = buildBugReport(getDebugInfo(selectedBugElement), bugDraft);
        lastBugReportSentAt = now;
        try {
            const res = typeof window.apiRequest === 'function'
                ? await window.apiRequest({ action: 'submit_qa_bug_report', report })
                : null;
            if (res?.status === 'ok') {
                if (window.showToast) window.showToast('Баг-репорт отправлен', 'success');
                else if (window.showAlert) window.showAlert('QA tools', 'Баг-репорт отправлен', 'success');
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
        const text = JSON.stringify(info, null, 2);
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

    function buildBugReport(info = getDebugInfo(), fields = null) {
        const reportFields = fields || {
            actual: '',
            expected: '',
            steps: ''
        };
        const device = info.telegram?.platform || info.platform || 'unknown';
        const viewport = `${info.viewport?.width || '?'}x${info.viewport?.height || '?'}`;
        const visualViewport = info.viewport?.visual_width
            ? `${info.viewport.visual_width}x${info.viewport.visual_height}+${info.viewport.visual_offset_left || 0},${info.viewport.visual_offset_top || 0}`
            : 'unknown';
        const elementSummary = formatElementSummary(info.selected_element);
        return [
            '#qa_bug #party_games',
            '',
            'Что произошло:',
            reportFields.actual || '',
            '',
            'Что ожидали:',
            reportFields.expected || '',
            '',
            'Шаги:',
            reportFields.steps || '',
            '',
            `Экран: ${info.active_screen || 'unknown'}${info.active_tab ? ` / ${info.active_tab.text || info.active_tab.data_tab || info.active_tab.selector}` : ''}`,
            '',
            'Элемент:',
            elementSummary || 'Не выбран',
            '',
            'Техника:',
            `timestamp=${info.timestamp || ''}`,
            `user_id=${info.user_id || 'unknown'}`,
            `telegram_id=${info.telegram_id || 'unknown'}`,
            `is_tester=${info.is_tester ? 1 : 0}`,
            `platform=${device}`,
            `app_build=${info.app_build || info.app_version || 'unknown'}`,
            `viewport=${viewport}`,
            `visual_viewport=${visualViewport}`,
            `telegram_platform=${info.telegram?.platform || 'unknown'}`,
            `telegram_version=${info.telegram?.version || 'unknown'}`,
            `telegram_color_scheme=${info.telegram?.color_scheme || 'unknown'}`,
            `DEBUG_SCROLL_QA=${info.debug_scroll_qa ? 1 : 0}`,
            `DEBUG_BB_TOUCH=${info.debug_bb_touch ? 1 : 0}`,
            `url=${info.url || window.location.href}`,
            `ua=${info.user_agent || 'unknown'}`,
            '',
            'Debug info:',
            JSON.stringify(info, null, 2)
        ].join('\n');
    }

    function copyBugReport(infoOrText = getDebugInfo(), successMessage = 'Шаблон баг-репорта скопирован') {
        const text = typeof infoOrText === 'string' ? infoOrText : buildBugReport(infoOrText);
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
