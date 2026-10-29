const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

function createMockEnvironment(initialStorage = {}) {
    const storage = { ...initialStorage };
    const toasts = [];
    const eventsSent = [];

    function createElement(tag) {
        const el = {
            tagName: tag.toUpperCase(),
            id: '',
            classList: {
                classes: new Set(),
                add(c) { this.classes.add(c); },
                remove(c) { this.classes.delete(c); },
                contains(c) { return this.classes.has(c); },
                toggle(c, force) {
                    if (force === undefined) {
                        if (this.classes.has(c)) this.classes.delete(c);
                        else this.classes.add(c);
                    } else if (force) {
                        this.classes.add(c);
                    } else {
                        this.classes.delete(c);
                    }
                }
            },
            get className() { return Array.from(this.classList.classes).join(' '); },
            set className(val) {
                this.classList.classes.clear();
                if (val) val.split(/\s+/).filter(Boolean).forEach(c => this.classList.classes.add(c));
            },
            style: {
                display: '',
                bottom: '',
                setProperty() {},
                transform: ''
            },
            attributes: {},
            setAttribute(k, v) { this.attributes[k] = String(v); },
            getAttribute(k) { return this.attributes[k] || null; },
            children: [],
            innerHTML: '',
            innerText: '',
            listeners: {},
            addEventListener(type, fn) {
                if (!this.listeners[type]) this.listeners[type] = [];
                this.listeners[type].push(fn);
            },
            dispatchEvent(event) {
                const list = this.listeners[event.type] || [];
                for (const fn of list) fn(event);
            },
            appendChild(child) {
                this.children.push(child);
                return child;
            },
            querySelector(selector) {
                function walk(node) {
                    if (!node) return null;
                    if (selector.startsWith('.') && node.classList && node.classList.contains(selector.slice(1))) {
                        return node;
                    }
                    if (selector.startsWith('#') && node.id === selector.slice(1)) {
                        return node;
                    }
                    if (node.children) {
                        for (const child of node.children) {
                            const found = walk(child);
                            if (found) return found;
                        }
                    }
                    return null;
                }
                return walk(this);
            },
            querySelectorAll(selector) {
                const res = [];
                function walk(node) {
                    if (!node) return;
                    if (selector.startsWith('.') && node.classList && node.classList.contains(selector.slice(1))) {
                        res.push(node);
                    }
                    if (node.children) {
                        for (const child of node.children) walk(child);
                    }
                }
                walk(this);
                return res;
            },
            click() {
                const list = this.listeners['click'] || [];
                const ev = {
                    preventDefault() {},
                    stopPropagation() {},
                    type: 'click'
                };
                for (const fn of list) fn(ev);
                if (typeof this.onclick === 'function') this.onclick(ev);
            },
            remove() {}
        };
        return el;
    }

    const docElements = new Map();
    const body = createElement('body');
    const screenGame = createElement('div');
    screenGame.id = 'screen-game';
    screenGame.classList.add('active');
    body.appendChild(screenGame);
    docElements.set('screen-game', screenGame);

    const sandbox = {
        window: null,
        document: {
            documentElement: createElement('html'),
            body: body,
            createElement: createElement,
            getElementById(id) {
                if (docElements.has(id)) return docElements.get(id);
                // Also search inside body
                function search(node) {
                    if (!node) return null;
                    if (node.id === id) return node;
                    if (node.children) {
                        for (const child of node.children) {
                            const found = search(child);
                            if (found) return found;
                        }
                    }
                    return null;
                }
                const found = search(body);
                if (found) docElements.set(id, found);
                return found;
            },
            querySelector(sel) {
                return body.querySelector(sel);
            },
            querySelectorAll(sel) {
                return body.querySelectorAll(sel);
            },
            addEventListener() {},
            removeEventListener() {}
        },
        localStorage: {
            getItem(key) { return storage[key] || null; },
            setItem(key, val) { storage[key] = String(val); },
            removeItem(key) { delete storage[key]; }
        },
        navigator: { userAgent: 'NodeTest' },
        matchMedia: () => ({ matches: false, addEventListener() {} }),
        getComputedStyle: () => ({ bottom: '180px' }),
        safeHTML: str => String(str || ''),
        showToast: (msg, type) => toasts.push({ msg, type }),
        apiRequest: async (params) => {
            eventsSent.push(params);
            return { status: 'ok' };
        },
        setTimeout: setTimeout,
        clearTimeout: clearTimeout,
        setInterval: setInterval,
        clearInterval: clearInterval,
        addEventListener() {},
        removeEventListener() {},
        console: { ...console, log: () => {}, warn: () => {} },
        toasts,
        eventsSent,
        storage
    };
    sandbox.window = sandbox;
    sandbox.global = sandbox;

    // Load theme-manager.js then game-manager.js
    const themeManagerCode = fs.readFileSync(path.join(__dirname, '..', 'js', 'modules', 'theme-manager.js'), 'utf8');
    const gameManagerCode = fs.readFileSync(path.join(__dirname, '..', 'js', 'modules', 'game-manager.js'), 'utf8');

    vm.createContext(sandbox);
    vm.runInContext(themeManagerCode, sandbox);
    vm.runInContext(gameManagerCode, sandbox);

    if (sandbox.window.ThemeManager && sandbox.window.ThemeManager.loadSettings) {
        sandbox.window.ThemeManager.loadSettings();
    }

    return sandbox;
}

function runTests() {
    console.log('--- Running QA #53/55 Reactions & Visibility Tests ---');

    // 1. Solo — плавающая кнопка отсутствует
    {
        const env = createMockEnvironment();
        env.window.currentGamePlayers = [{ id: 101, first_name: 'SoloPlayer' }];
        assert.strictEqual(env.window.isSoloGame(), true, 'isSoloGame() must return true when only 1 player');
        assert.strictEqual(env.window.shouldShowReactionToolbar(), false, 'shouldShowReactionToolbar() must be false in solo');

        env.window.renderReactionToolbar();
        const container = env.document.getElementById('reaction-container');
        assert.ok(container, '#reaction-container must be created');
        assert.strictEqual(container.style.display, 'none', 'Container must be hidden in solo game');
        console.log('✓ Check 1: Solo — floating reaction button is hidden');
    }

    // 2. Multiplayer — реакции работают по умолчанию
    {
        const env = createMockEnvironment();
        env.window.currentGamePlayers = [
            { id: 101, first_name: 'Player 1' },
            { id: 102, first_name: 'Player 2' }
        ];
        assert.strictEqual(env.window.isSoloGame(), false, 'isSoloGame() must return false with 2+ players');
        assert.strictEqual(env.window.isReactionsEnabled(), true, 'Reactions must be enabled by default');
        assert.strictEqual(env.window.shouldShowReactionToolbar(), true, 'shouldShowReactionToolbar() must be true in multiplayer');

        env.window.renderReactionToolbar();
        const container = env.document.getElementById('reaction-container');
        assert.ok(container, '#reaction-container must exist');
        assert.strictEqual(container.style.display, 'block', 'Container must be visible in multiplayer game');
        console.log('✓ Check 2: Multiplayer — reactions work by default');
    }

    // 3. Скрытие из панели — кнопка исчезает, toast выводится, входящие анимации скрываются
    {
        const env = createMockEnvironment();
        env.window.currentGamePlayers = [
            { id: 101, first_name: 'Player 1' },
            { id: 102, first_name: 'Player 2' }
        ];
        env.window.renderReactionToolbar();
        const container = env.document.getElementById('reaction-container');
        assert.strictEqual(container.style.display, 'block');

        // Find the "Скрыть реакции" button
        const hideBtn = container.querySelector('.reaction-hide-action-btn');
        assert.ok(hideBtn, '.reaction-hide-action-btn must be present in reaction palette');

        // Expand palette and click hide
        container.classList.add('expanded');
        hideBtn.click();

        assert.strictEqual(container.classList.contains('expanded'), false, 'Panel must be closed after clicking hide');
        assert.strictEqual(container.style.display, 'none', 'Floating button must disappear');
        assert.strictEqual(env.window.isReactionsEnabled(), false, 'isReactionsEnabled() must be false after hiding');

        // Toast check
        assert.strictEqual(env.toasts.length, 1, 'Toast notification must be shown');
        assert.strictEqual(env.toasts[0].msg, 'Реакции скрыты. Вернуть их можно в настройках');

        // Incoming reactions suppression test
        let emojiRendered = false;
        env.window.GameManager.showFloatingEmoji = () => { emojiRendered = true; };
        env.window.GameManager.showFloatingEmojiBurst = () => { emojiRendered = true; };

        // Incoming reaction from user 102
        env.window.handleReactions([
            { id: 1, user_id: 102, payload: JSON.stringify({ emoji: '🔥', count: 1 }) }
        ]);
        assert.strictEqual(emojiRendered, false, 'Incoming reaction animations must not be rendered when reactions are hidden');
        console.log('✓ Check 3: Hide from panel — button disappears, toast shown, incoming animations suppressed');
    }

    // 4. После перезагрузки выбор сохраняется
    {
        // Simulate previous state in storage
        const savedSettings = JSON.stringify({ showReactions: false, haptics: true });
        const env = createMockEnvironment({ pgb_settings: savedSettings });
        env.window.currentGamePlayers = [
            { id: 101, first_name: 'Player 1' },
            { id: 102, first_name: 'Player 2' }
        ];

        assert.strictEqual(env.window.isReactionsEnabled(), false, 'Reactions setting must persist as false on reload');
        assert.strictEqual(env.window.shouldShowReactionToolbar(), false, 'Toolbar must not show on reload if disabled');

        env.window.renderReactionToolbar();
        const container = env.document.getElementById('reaction-container');
        assert.strictEqual(container.style.display, 'none', 'Toolbar must remain hidden after reload');
        console.log('✓ Check 4: Persistence — choice is saved across application restarts');
    }

    // 5. В настройках реакции можно включить обратно
    {
        const savedSettings = JSON.stringify({ showReactions: false });
        const env = createMockEnvironment({ pgb_settings: savedSettings });
        env.window.currentGamePlayers = [
            { id: 101, first_name: 'Player 1' },
            { id: 102, first_name: 'Player 2' }
        ];
        env.window.renderReactionToolbar();
        const container = env.document.getElementById('reaction-container');
        assert.strictEqual(container.style.display, 'none');

        // Toggle back in settings
        env.window.toggleSetting('showReactions', true);
        assert.strictEqual(env.window.isReactionsEnabled(), true, 'isReactionsEnabled() must be true after toggling on in settings');

        // In multiplayer, button must return
        assert.strictEqual(container.style.display, 'block', 'Reactions button must return in multiplayer after turning setting on');
        console.log('✓ Check 5: Settings restore — reactions can be re-enabled from settings');
    }

    // 6. В solo они не появляются даже при включённой настройке
    {
        const env = createMockEnvironment();
        env.window.currentGamePlayers = [{ id: 101, first_name: 'SoloUser' }];
        assert.strictEqual(env.window.isReactionsEnabled(), true, 'Reactions are enabled in settings');
        assert.strictEqual(env.window.isSoloGame(), true, 'Game is solo');
        assert.strictEqual(env.window.shouldShowReactionToolbar(), false, 'Button must remain hidden in solo despite setting');

        env.window.renderReactionToolbar();
        const container = env.document.getElementById('reaction-container');
        assert.strictEqual(container.style.display, 'none', 'Button must stay hidden in solo');

        // Toggle setting on explicitly
        env.window.toggleSetting('showReactions', true);
        assert.strictEqual(container.style.display, 'none', 'Button still hidden after toggling setting while in solo');
        console.log('✓ Check 6: Solo immunity — reactions button stays hidden in solo even with setting enabled');
    }

    // 7. Переключение между solo и multiplayer работает корректно
    {
        const env = createMockEnvironment();
        // Start solo
        env.window.currentGamePlayers = [{ id: 101, first_name: 'Host' }];
        env.window.renderReactionToolbar();
        const container = env.document.getElementById('reaction-container');
        assert.strictEqual(container.style.display, 'none', 'Initially hidden in solo');

        // Second player joins
        env.window.currentGamePlayers = [
            { id: 101, first_name: 'Host' },
            { id: 102, first_name: 'Guest' }
        ];
        env.window.updateReactionToolbarVisibility();
        assert.strictEqual(container.style.display, 'block', 'Dynamically shows when multiplayer becomes active');

        // Second player leaves
        env.window.currentGamePlayers = [{ id: 101, first_name: 'Host' }];
        env.window.updateReactionToolbarVisibility();
        assert.strictEqual(container.style.display, 'none', 'Dynamically hides when returning to solo');
        console.log('✓ Check 7: Dynamic transition between solo and multiplayer functions smoothly');
    }

    // 8. Настройка одного пользователя не влияет на остальных
    {
        // User A disables reactions
        const envA = createMockEnvironment();
        envA.window.currentGamePlayers = [{ id: 1, name: 'UserA' }, { id: 2, name: 'UserB' }];
        envA.window.toggleSetting('showReactions', false);
        assert.strictEqual(envA.window.isReactionsEnabled(), false);

        // User B has their own independent storage
        const envB = createMockEnvironment();
        envB.window.currentGamePlayers = [{ id: 1, name: 'UserA' }, { id: 2, name: 'UserB' }];
        assert.strictEqual(envB.window.isReactionsEnabled(), true, 'User B retains default enabled reactions');
        assert.strictEqual(envB.window.shouldShowReactionToolbar(), true);
        console.log('✓ Check 8: User isolation — settings are local and do not affect other participants');
    }

    // 9. Нет регрессий в отправке и отображении обычных реакций
    {
        const env = createMockEnvironment();
        env.window.globalUser = { id: 101, first_name: 'Alice' };
        env.window.currentGamePlayers = [
            { id: 101, first_name: 'Alice' },
            { id: 102, first_name: 'Bob' }
        ];

        let localEmojiShown = null;
        env.window.GameManager.showFloatingEmoji = (emoji, producer) => {
            localEmojiShown = { emoji, producer };
        };

        // User triggers reaction
        env.window.triggerReaction('🔥');
        assert.ok(localEmojiShown, 'Local floating emoji must be displayed on trigger');
        assert.strictEqual(localEmojiShown.emoji, '🔥');

        // Incoming reaction from Bob
        let incomingEmoji = null;
        env.window.GameManager.showFloatingEmoji = (emoji, producer) => {
            incomingEmoji = { emoji, producer };
        };

        env.window.handleReactions([
            { id: 50, user_id: 102, payload: JSON.stringify({ emoji: '🎉', count: 1 }) }
        ]);
        assert.ok(incomingEmoji, 'Incoming reaction from other user must be received and displayed');
        assert.strictEqual(incomingEmoji.emoji, '🎉');
        assert.strictEqual(incomingEmoji.producer.name, 'Bob');
        console.log('✓ Check 9: No regressions in sending and rendering standard reactions');
    }

    console.log('ALL 9 CHECKS PASSED SUCCESSFULLY!');
}

runTests();
