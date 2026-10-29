const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

function runTest() {
    const toasts = [];
    const actions = [];
    const haptics = [];

    function createElement(tag) {
        return {
            tagName: tag.toUpperCase(),
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
            get className() {
                return Array.from(this.classList.classes).join(' ');
            },
            set className(val) {
                this.classList.classes.clear();
                if (val) val.split(/\s+/).filter(Boolean).forEach(c => this.classList.classes.add(c));
            },
            dataset: {},
            style: {},
            attributes: {},
            children: [],
            innerHTML: '',
            textContent: '',
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
            querySelector(selector) {
                return this.querySelectorAll(selector)[0] || null;
            },
            appendChild(child) {
                this.children.push(child);
                return child;
            },
            remove() {}
        };
    }

    const gameArea = createElement('div');
    gameArea.id = 'game-area';

    const sandbox = {
        window: null,
        document: {
            body: createElement('body'),
            getElementById(id) {
                if (id === 'game-area') return gameArea;
                function findId(node) {
                    if (!node) return null;
                    if (node.id === id) return node;
                    for (const c of (node.children || [])) {
                        const found = findId(c);
                        if (found) return found;
                    }
                    return null;
                }
                return findId(gameArea);
            },
            querySelectorAll(selector) {
                return gameArea.querySelectorAll(selector);
            },
            createElement(tag) {
                return createElement(tag);
            }
        },
        setTimeout: (fn, ms) => setTimeout(fn, ms),
        clearTimeout: (id) => clearTimeout(id),
        setInterval: () => 1,
        clearInterval: () => {},
        safeHTML: str => String(str || ''),
        console: console
    };
    sandbox.window = sandbox;
    sandbox.global = sandbox;

    sandbox.showToast = (msg, type) => toasts.push({ msg, type });
    sandbox.sendGameAction = (type, data) => actions.push({ type, data });
    sandbox.ThemeManager = { triggerHaptic: (type, level) => haptics.push({ type, level }) };
    sandbox.currentUser = { id: 101, first_name: 'Alice' };

    const uiCode = fs.readFileSync(path.join(__dirname, '..', 'js', 'games', 'minesweeper', 'ui.js'), 'utf8');
    const indexCode = fs.readFileSync(path.join(__dirname, '..', 'js', 'games', 'minesweeper', 'index.js'), 'utf8');

    vm.createContext(sandbox);
    vm.runInContext(uiCode, sandbox);
    vm.runInContext(indexCode, sandbox);

    // Test 1: Fresh game before first move
    const freshState = {
        status: 'playing',
        boardSize: [8, 8],
        mineCount: 10,
        safeCellsRemaining: 54,
        grid: null,
        revealed: {},
        flags: {},
        turnOrder: ['101'],
        currentTurnIndex: 0,
        scores: { '101': 0 },
        stunned: { '101': 0 }
    };

    sandbox.render_minesweeper_br({
        room: { game_state: JSON.stringify(freshState) },
        user: { id: 101 },
        players: [{ id: 101, first_name: 'Alice' }]
    });

    assert.strictEqual(sandbox._msCanFlag, false, 'window._msCanFlag must be false before first move');
    assert.strictEqual(sandbox._msFlagMode, false, 'window._msFlagMode must be false before first move');

    const wrapper = gameArea.children[0];
    assert.strictEqual(wrapper.id, 'ms-wrapper', '#ms-wrapper must be the root game container');
    assert.strictEqual(wrapper.className, 'game-custom-wrapper px-3', '#ms-wrapper must include px-3 for safe margins (QA #50)');
    assert.ok(wrapper.innerHTML.includes('disabled'), 'Flag button markup must include disabled indicator');
    assert.ok(wrapper.innerHTML.includes('title="Сначала откройте клетку"'), 'Flag button must have title hint');

    toasts.length = 0;
    actions.length = 0;
    sandbox.minesweeperSetMode(true);
    assert.strictEqual(sandbox._msFlagMode, false, 'minesweeperSetMode(true) must be ignored when _msCanFlag is false');
    assert.strictEqual(toasts.length, 1, 'Warning toast must be displayed on forbidden flag mode attempt');
    assert.strictEqual(toasts[0].msg, 'Сначала откройте клетку');
    assert.strictEqual(actions.length, 0, 'No server action must be sent');

    toasts.length = 0;
    sandbox.minesweeperToggleFlag(7);
    assert.strictEqual(toasts.length, 1, 'Warning toast must be displayed on direct flag toggle attempt');
    assert.strictEqual(actions.length, 0, 'No server action must be sent on direct flag toggle attempt');

    // Test 2: Started game after first move
    const startedState = {
        status: 'playing',
        boardSize: [8, 8],
        mineCount: 10,
        safeCellsRemaining: 50,
        grid: [0, 1, 1, -1, 1, 0, 0, 0],
        revealed: { 0: '101' },
        flags: {},
        turnOrder: ['101'],
        currentTurnIndex: 0,
        scores: { '101': 0 },
        stunned: { '101': 0 }
    };

    sandbox.render_minesweeper_br({
        room: { game_state: JSON.stringify(startedState) },
        user: { id: 101 },
        players: [{ id: 101, first_name: 'Alice' }]
    });

    assert.strictEqual(sandbox._msCanFlag, true, 'window._msCanFlag must be true after first move');

    toasts.length = 0;
    actions.length = 0;
    sandbox.minesweeperSetMode(true);
    assert.strictEqual(sandbox._msFlagMode, true, 'Flag mode should now be enabled');
    assert.strictEqual(toasts.length, 0, 'No toast warning on valid mode change');

    sandbox.minesweeperToggleFlag(3);
    assert.strictEqual(actions.length, 1, 'sendGameAction must be dispatched');
    // Test 3: Finished game and results overlay (QA #51 & #52)
    const finishedState = {
        status: 'finished',
        boardSize: [8, 8],
        mineCount: 10,
        safeCellsRemaining: 0,
        grid: [0, 1, 1, -1, 1, 0, 0, 0],
        revealed: { 0: '101' },
        flags: {},
        turnOrder: ['101'],
        currentTurnIndex: 0,
        scores: { '101': 100 },
        stunned: { '101': 0 },
        gameResults: [{ user_id: '101', score: 100, rank: 1 }]
    };

    sandbox.GameSummaryProvider = {
        remember: (id, state, ctx) => ({ gameId: id, state }),
        render: (summary, options) => `
            <section class="game-summary-card" data-game-summary="${summary.gameId}">
                <div class="game-summary-head">
                    <div class="game-summary-title">Сапёр</div>
                </div>
                <div class="game-summary-actions">
                    <button class="btn btn-outline-secondary game-summary-btn">${options.playAgainLabel}</button>
                </div>
            </section>
        `
    };

    sandbox.render_minesweeper_br({
        room: { game_state: JSON.stringify(finishedState) },
        user: { id: 101 },
        players: [{ id: 101, first_name: 'Alice' }]
    });

    const overlay = wrapper.querySelector('.ms-results-overlay');
    assert.ok(overlay, 'Results overlay must be rendered when status is finished');
    assert.ok(overlay.innerHTML.includes('ms-results-summary-wrap w-100 text-start'), 'Summary card must be wrapped in text-start container (QA #51)');
    assert.ok(overlay.innerHTML.includes('btn-outline-secondary'), 'Secondary action button must be present in summary card (QA #52)');
    assert.ok(overlay.innerHTML.includes('Играть снова'), 'Play again label must be rendered');

    // Test 4: Responsive geometry & layout padding (QA #50)
    // Setup screen padding check
    const setupState = { status: 'setup', difficulty: 'medium' };
    sandbox.render_minesweeper_br({
        room: { game_state: JSON.stringify(setupState) },
        user: { id: 101 },
        players: [{ id: 101, first_name: 'Alice' }]
    });
    assert.ok(wrapper.innerHTML.includes('py-4 px-1'), 'Setup screen should use py-4 px-1 to avoid double padding (QA #50)');
    assert.ok(!wrapper.innerHTML.includes('text-center p-4'), 'Setup screen must not contain p-4');

    // Board cell sizes across 320, 375, 390, 411 viewports
    const viewports = [320, 375, 390, 411];
    const difficulties = [
        { name: 'easy', cols: 8, rows: 8 },
        { name: 'medium', cols: 9, rows: 9 },
        { name: 'hard', cols: 12, rows: 10 }
    ];

    for (const vp of viewports) {
        sandbox.window.innerWidth = vp;
        const containerW = Math.min(vp - 32, 408);

        for (const diff of difficulties) {
            const gridState = {
                status: 'playing',
                boardSize: [diff.rows, diff.cols],
                mineCount: 10,
                safeCellsRemaining: 50,
                grid: new Array(diff.rows * diff.cols).fill(0),
                revealed: { 0: '101' },
                flags: {},
                turnOrder: ['101'],
                currentTurnIndex: 0,
                scores: { '101': 0 },
                stunned: { '101': 0 }
            };

            sandbox.render_minesweeper_br({
                room: { game_state: JSON.stringify(gridState) },
                user: { id: 101 },
                players: [{ id: 101, first_name: 'Alice' }]
            });

            const gridMatch = wrapper.innerHTML.match(/<div class="ms-grid"\s+style="grid-template-columns:\s*repeat\((\d+),\s*(\d+)px\);"/);
            assert.ok(gridMatch, 'ms-grid with inline repeat columns must be in wrapper.innerHTML');
            const colsCount = parseInt(gridMatch[1], 10);
            const cellSize = parseInt(gridMatch[2], 10);
            assert.strictEqual(colsCount, diff.cols, 'Column count must match difficulty');

            // Assert cell touch target size
            assert.ok(cellSize >= 20, `Cell size (${cellSize}px) must be >= 20px on ${vp}px (${diff.name})`);
            assert.ok(cellSize <= 38, `Cell size (${cellSize}px) must be <= 38px on ${vp}px (${diff.name})`);

            // Total grid width = cols * cellSize + (cols - 1) * 2 + 18 (padding 16px + border 2px)
            const totalGridW = diff.cols * cellSize + (diff.cols - 1) * 2 + 18;
            assert.ok(
                totalGridW <= containerW,
                `Total grid width (${totalGridW}px) must not exceed container inner width (${containerW}px) on ${vp}px (${diff.name})`
            );
        }
    }

    console.log('tests/minesweeper_first_move_test.js: ALL ASSERTIONS PASSED');
}

runTest();

