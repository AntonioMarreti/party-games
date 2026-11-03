const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const uiPath = path.join(__dirname, '..', 'js', 'games', 'durak', 'ui.js');
const source = fs.readFileSync(uiPath, 'utf8');
const marker = '\n})();\n';
const hookExport = `
    window.__durakUiTestHooks = {
        activateDrag,
        bindEvents,
        canPlayAttackCard,
        canSelectAttackTarget,
        canTransfer,
        cancelDrag,
        cleanupResizeHandling,
        compactStatusCopy,
        defenseTargetCard,
        dragState,
        executeDropAction,
        formatBotActionSummary,
        handleCardPointerDown,
        handleWindowPointerCancel,
        handleWindowPointerMove,
        handleWindowPointerUp,
        hasDefenseOrTransferOption,
        nextActivePlayerId,
        otherEligibleThrowerExists,
        passActionLabel,
        renderControls,
        renderDeck,
        renderFinalScreen,
        renderGame,
        renderHand,
        renderPlayers,
        renderSetupScreen,
        renderShell,
        renderTable,
        resolveDropTarget,
        selectAttackTarget,
        selectHandCard,
        syncDragVisuals,
        syncHandSettingsLayer,
        uiState,
        updateDropTargetVisuals,
        updateLastTrickResult
    };
`;

assert.ok(source.includes(marker), 'Durak UI test hook insertion point must exist');

const timers = [];
const bodyClassSet = new Set();
const windowListeners = new Map();
const windowObject = {
    innerWidth: 390,
    innerHeight: 844,
    addEventListener: (type, handler) => {
        if (!windowListeners.has(type)) windowListeners.set(type, new Set());
        windowListeners.get(type).add(handler);
    },
    removeEventListener: (type, handler) => {
        windowListeners.get(type)?.delete(handler);
    },
    dispatchEvent: (event) => {
        const handlers = windowListeners.get(event.type);
        if (handlers) handlers.forEach(h => h(event));
    },
    requestAnimationFrame: callback => {
        timers.push(callback);
        return timers.length;
    },
    cancelAnimationFrame: () => {},
    localStorage: {
        getItem: () => null,
        setItem: () => {}
    },
    safeHTML: value => String(value ?? ''),
    setTimeout: callback => {
        timers.push(callback);
        return timers.length;
    },
    clearTimeout: () => {},
    globalUser: null,
    GameSummaryProvider: null
};
const elementsById = new Map();
const documentObject = {
    body: {
        classList: {
            add: (...names) => names.forEach(name => bodyClassSet.add(name)),
            remove: (...names) => names.forEach(name => bodyClassSet.delete(name)),
            toggle: (name, force) => {
                const next = force === undefined ? !bodyClassSet.has(name) : Boolean(force);
                if (next) bodyClassSet.add(name);
                else bodyClassSet.delete(name);
                return next;
            },
            contains: name => bodyClassSet.has(name)
        },
        contains: () => true
    },
    getElementById: id => elementsById.get(id) || null,
    elementFromPoint: (x, y) => null,
    addEventListener: () => {},
    removeEventListener: () => {},
    createElement: () => {
        const classSet = new Set();
        return {
            id: '',
            className: '',
            innerHTML: '',
            classList: {
                add: (...names) => names.forEach(n => classSet.add(n)),
                remove: (...names) => names.forEach(n => classSet.delete(n)),
                toggle: (n, force) => {
                    const next = force === undefined ? !classSet.has(n) : Boolean(force);
                    if (next) classSet.add(n); else classSet.delete(n);
                    return next;
                },
                contains: n => classSet.has(n)
            },
            style: {
                setProperty: () => {},
                removeProperty: () => {}
            },
            remove: () => {},
            set textContent(value) {
                this.innerHTML = String(value ?? '');
            }
        };
    }
};
const sandbox = {
    window: windowObject,
    document: documentObject,
    console,
    setTimeout: windowObject.setTimeout,
    clearTimeout: windowObject.clearTimeout
};

vm.runInNewContext(source.replace(marker, `${hookExport}${marker}`), sandbox, { filename: uiPath });
const hooks = windowObject.__durakUiTestHooks;

function flushTimers() {
    while (timers.length) timers.shift()();
}

function fakeButton(dataset = {}) {
    const classSet = new Set();
    return {
        dataset,
        disabled: false,
        attributes: {},
        onclick: null,
        onpointerdown: null,
        classList: {
            add: (...names) => names.forEach(n => classSet.add(n)),
            remove: (...names) => names.forEach(n => classSet.delete(n)),
            toggle: (n, force) => {
                const next = force === undefined ? !classSet.has(n) : Boolean(force);
                if (next) classSet.add(n); else classSet.delete(n);
                return next;
            },
            contains: n => classSet.has(n)
        },
        closest(sel) {
            if (sel.includes('.durak-trick') && this.dataset.attackCard) return this;
            if (sel.includes('.durak-card') && this.dataset.cardId) return this;
            if (sel.includes('[data-drop-zone="transfer"]') && this.dataset.dropZone === 'transfer') return this;
            if ((sel.includes('.durak-table-stage') || sel.includes('.durak-table-empty')) && this.dataset.dropZone === 'attack') return this;
            return null;
        },
        setAttribute(name, value) {
            this.attributes[name] = String(value);
        },
        removeAttribute(name) {
            delete this.attributes[name];
        },
        getAttribute(name) {
            return this.attributes[name] ?? null;
        }
    };
}

function fakeShell(single = {}, lists = {}) {
    return {
        appendChild() {},
        querySelector(selector) {
            return single[selector] || null;
        },
        querySelectorAll(selector) {
            if (selector === '#durak-exit-btn, [data-action="leave-room"], [data-action="return-room"]') {
                return [single['#durak-exit-btn'], single['[data-action="leave-room"]'], single['[data-action="return-room"]']]
                    .filter(Boolean);
            }
            return lists[selector] || [];
        }
    };
}

function resetUiState() {
    if (hooks.cancelDrag) hooks.cancelDrag();
    hooks.uiState.selectedCardId = null;
    hooks.uiState.selectedAttackCardId = null;
    hooks.uiState.confirmingTake = false;
    hooks.uiState.confirmTakeTimer = null;
    hooks.uiState.defenseTurnKey = null;
    hooks.uiState.roleKey = null;
    hooks.uiState.targetPromptActive = false;
    hooks.uiState.busy = false;
    hooks.uiState.busyAction = null;
    hooks.uiState.exitBusy = false;
    hooks.uiState.lastError = '';
    hooks.uiState.lastRes = null;
    hooks.uiState.currentState = null;
    hooks.uiState.lastTrickResult = null;
    hooks.uiState.previousTrickState = null;
    hooks.uiState.handSettingsOpen = false;
}

async function run() {
    let finishCalls = 0;
    let leaveCalls = 0;
    windowObject.finishGameSession = () => { finishCalls += 1; };
    windowObject.leaveRoom = () => { leaveCalls += 1; };

    const activeState = { phase: 'attack', actor_id: '1', roles: { attacker_id: '1', defender_id: '2' } };
    const hostRes = { is_host: 1, user: { id: '1' }, players: [] };
    const guestRes = { is_host: 0, user: { id: '1' }, players: [] };

    resetUiState();
    const hostExit = fakeButton();
    hooks.bindEvents(fakeShell({ '#durak-exit-btn': hostExit }), activeState, hostRes);
    hostExit.onclick();
    hostExit.onclick();
    assert.equal(finishCalls, 1, 'Active host exit must call finishGameSession once');
    assert.equal(leaveCalls, 0, 'Active host exit must not call leaveRoom');
    flushTimers();

    resetUiState();
    const guestExit = fakeButton();
    hooks.bindEvents(fakeShell({ '#durak-exit-btn': guestExit }), activeState, guestRes);
    guestExit.onclick();
    guestExit.onclick();
    assert.equal(finishCalls, 1, 'Active guest exit must not call finishGameSession');
    assert.equal(leaveCalls, 1, 'Active guest exit must call leaveRoom once');
    flushTimers();

    resetUiState();
    const guestSetupHtml = hooks.renderSetupScreen(guestRes);
    assert.match(guestSetupHtml, /data-action="leave-room"/, 'Guest setup must render a leave-room control');
    const guestSetupExit = fakeButton();
    hooks.bindEvents(fakeShell({ '[data-action="leave-room"]': guestSetupExit }), { phase: 'setup' }, guestRes);
    guestSetupExit.onclick();
    guestSetupExit.onclick();
    assert.equal(leaveCalls, 2, 'Guest setup exit must call leaveRoom once');
    flushTimers();

    resetUiState();
    const hostSetupHtml = hooks.renderSetupScreen(hostRes);
    assert.match(hostSetupHtml, /data-action="return-room"/, 'Host setup must keep the return-room control');
    const hostReturn = fakeButton();
    hooks.bindEvents(fakeShell({ '[data-action="return-room"]': hostReturn }), { phase: 'setup' }, hostRes);
    hostReturn.onclick();
    assert.equal(finishCalls, 2, 'Host setup return must keep the finishGameSession path');
    assert.equal(leaveCalls, 2, 'Host setup return must not call leaveRoom');
    flushTimers();

    resetUiState();
    const players = [
        { id: '1', display_name: 'Иван' },
        { id: '2', display_name: 'Маша' },
        { id: '3', display_name: 'Антон' }
    ];
    const previousTrick = {
        defenderId: '2',
        defenderName: 'Маша',
        defenderHandCount: 2,
        discardCount: 0,
        tableCardCount: 4
    };
    const takenState = {
        phase: 'attack',
        actor_id: '1',
        roles: { attacker_id: '1', defender_id: '3' },
        table: [],
        my_hand: ['7S'],
        opponent_hands: [
            { player_id: '2', count: 6 },
            { player_id: '3', count: 2 }
        ],
        discard_count: 0
    };
    const viewerRes = { user: { id: '1' }, players };
    hooks.updateLastTrickResult(previousTrick, takenState, viewerRes);
    assert.match(hooks.uiState.lastTrickResult.text, /Маша забирает 4 карты/, 'Take result must name the player and card count');
    assert.equal(hooks.uiState.lastTrickResult.secondaryText, 'Следующий ход: Ты', 'Viewer actor must be shown as Ты');
    assert.match(hooks.renderTable(takenState, viewerRes), /Следующий ход: Ты/, 'Take result must render the next actor line');

    hooks.updateLastTrickResult(previousTrick, { ...takenState, actor_id: '3' }, viewerRes);
    assert.equal(hooks.uiState.lastTrickResult.secondaryText, 'Следующий ход: Антон', 'Another actor must be shown by name');

    hooks.updateLastTrickResult(previousTrick, { ...takenState, actor_id: null }, viewerRes);
    assert.equal(hooks.uiState.lastTrickResult.secondaryText, '', 'Missing authoritative actor must not produce a guessed next turn');

    const defenseState = {
        phase: 'defense',
        actor_id: '1',
        roles: { attacker_id: '2', defender_id: '1' },
        defender_mode: 'defending',
        rules: { allow_transfer: false },
        player_order: ['1', '2', '3'],
        in_game_players: ['1', '2', '3'],
        table: [
            { attack: '6S', defend: null },
            { attack: '9H', defend: null }
        ],
        trump: { suit: 'D', card: '6D' },
        my_hand: ['7S', '10D', '8C'],
        opponent_hands: [
            { player_id: '2', count: 4 },
            { player_id: '3', count: 4 }
        ]
    };

    // 2.1: renderTable must wrap .durak-defense-status and .durak-table-grid in .durak-table-stage
    resetUiState();
    const multiAttackTableHtml = hooks.renderTable(defenseState, viewerRes).trim();
    assert.match(multiAttackTableHtml, /^<div class="durak-table-stage">[\s\S]*<\/div>$/, '2.1: Multi-attack table must be wrapped in a single .durak-table-stage grid item');
    assert.match(multiAttackTableHtml, /durak-defense-status/, '2.1: Multi-attack table must keep .durak-defense-status inside .durak-table-stage');

    resetUiState();
    assert.equal(hooks.selectAttackTarget(defenseState, viewerRes, '6S'), true, 'Attack-first flow must accept an open target');
    hooks.selectHandCard(defenseState, viewerRes, '7S');
    assert.equal(hooks.defenseTargetCard(defenseState, viewerRes), '6S', 'Attack-first flow must preserve the pair');
    assert.match(hooks.renderControls(defenseState, viewerRes), /data-action="defend"/, 'Attack-first flow must enable defend');

    // 2.2: Unique compatible open attack auto-resolves immediately on hand card selection
    resetUiState();
    hooks.selectHandCard(defenseState, viewerRes, '7S');
    assert.equal(hooks.defenseTargetCard(defenseState, viewerRes), '6S', '2.2: Unique compatible open attack must auto-resolve on 1st hand tap');
    assert.match(hooks.renderControls(defenseState, viewerRes), /data-action="defend"/, '2.2: Unique compatible open attack must immediately show Defend button');
    const targetHtml = hooks.renderTable(defenseState, viewerRes);
    assert.match(targetHtml, /is-defendable-target[^>]*data-attack-card="6S"/, 'Hand-first flow must highlight a compatible target');
    assert.match(targetHtml, /is-unavailable-target[^>]*data-attack-card="9H"[^>]*disabled/, 'Hand-first flow must disable an incompatible target');
    assert.equal(hooks.selectAttackTarget(defenseState, viewerRes, '9H'), false, 'An incompatible target must not be accepted');
    assert.equal(hooks.selectAttackTarget(defenseState, viewerRes, '6S'), true, 'A compatible target must be accepted');
    assert.equal(hooks.defenseTargetCard(defenseState, viewerRes), '6S', 'Hand-first flow must form the expected pair');

    hooks.selectHandCard(defenseState, viewerRes, '8C');
    assert.equal(hooks.uiState.selectedAttackCardId, null, 'Changing the hand card must clear an incompatible target');

    resetUiState();
    const transferState = {
        ...defenseState,
        rules: { allow_transfer: true },
        table: [
            { attack: '6S', defend: null },
            { attack: '6H', defend: null }
        ],
        my_hand: ['6C'],
        opponent_hands: [
            { player_id: '2', count: 4 },
            { player_id: '3', count: 4 }
        ]
    };
    hooks.selectHandCard(transferState, viewerRes, '6C');
    const transferControls = hooks.renderControls(transferState, viewerRes);
    assert.match(transferControls, /data-action="transfer"/, 'A transfer-only hand card must keep the transfer action available');
    assert.doesNotMatch(transferControls, /data-action="defend"/, 'A transfer-only hand card must not create an invalid defense action');

    // 2.2: Trump card matching open attacks (6D vs 6S + 6H) must keep BOTH Defend and Transfer visible!
    resetUiState();
    const dualTrumpTransferState = {
        ...transferState,
        my_hand: ['6D']
    };
    hooks.selectHandCard(dualTrumpTransferState, viewerRes, '6D');
    const dualControls = hooks.renderControls(dualTrumpTransferState, viewerRes);
    assert.match(dualControls, /is-defend is-needs-target" data-action="defend"/, '2.2: Trump transfer card must NEVER hide Defend when 2 open attacks are compatible');
    assert.match(dualControls, /is-transfer" data-action="transfer"/, '2.2: Trump transfer card must also show visually distinct Transfer button');

    let apiCalls = [];
    windowObject.apiRequest = async payload => {
        apiCalls.push(payload);
        return { status: 'ok' };
    };
    windowObject.checkState = async () => {};
    const dualDefendBtn = fakeButton({ action: 'defend' });
    hooks.bindEvents(fakeShell({ '[data-action="defend"]': dualDefendBtn }), dualTrumpTransferState, viewerRes);
    await dualDefendBtn.onclick();
    assert.equal(apiCalls.length, 0, '2.2: Clicking Defend before picking between 2 compatible targets must prompt target selection, not send error or transfer');
    assert.equal(hooks.uiState.targetPromptActive, true, '2.2: Clicking Defend before target pick must activate targetPromptActive');
    assert.equal(hooks.selectAttackTarget(dualTrumpTransferState, viewerRes, '6H'), true);
    await dualDefendBtn.onclick();
    assert.equal(apiCalls.length, 1);
    assert.deepEqual(JSON.parse(JSON.stringify(apiCalls[0])), {
        action: 'game_action',
        type: 'defend_card',
        attack_card_id: '6H',
        card_id: '6D'
    }, '2.2: After picking 6H on table, Defend must beat 6H with 6D');

    // 2.2: Empty-deck canTransfer must skip 0-card finished neighbor
    resetUiState();
    const emptyDeckSkipTransferState = {
        ...transferState,
        draw_count: 0,
        table: [{ attack: '6S', defend: null }],
        opponent_hands: [
            { player_id: '2', count: 0 },
            { player_id: '3', count: 3 }
        ]
    };
    assert.equal(hooks.nextActivePlayerId(emptyDeckSkipTransferState, '1', viewerRes), '3', '2.2: Empty-deck transfer target must skip 0-card player 2 to player 3');
    assert.equal(hooks.canTransfer(emptyDeckSkipTransferState, viewerRes), true, '2.2: Empty-deck transfer must remain available when next player with cards can hold the transferred attack');

    // 2.3: Accidental take prevention (compact take-only + 2-step inline confirmation when defense exists + card select cancel)
    resetUiState();
    apiCalls = [];
    const idleDefenseControls = hooks.renderControls(defenseState, viewerRes);
    assert.match(idleDefenseControls, /is-take-only/, '2.3: Idle defense controls must use compact is-take-only layout instead of full-width is-single');
    assert.doesNotMatch(idleDefenseControls, /is-single/, '2.3: Idle defense controls must not stretch Take across full width');

    const takeBtn = fakeButton({ action: 'take' });
    hooks.bindEvents(fakeShell({ '[data-action="take"]': takeBtn }), defenseState, viewerRes);
    takeBtn.onclick();
    assert.equal(apiCalls.length, 0, '2.3: First tap on Take when player can beat must NOT immediately take cards');
    assert.equal(hooks.uiState.confirmingTake, true, '2.3: First tap on Take when player can beat must enter confirmingTake state');
    const confirmTakeHtml = hooks.renderControls(defenseState, viewerRes);
    assert.match(confirmTakeHtml, /data-action="cancel-take"/, '2.3: Confirming Take must render Cancel button');
    assert.match(confirmTakeHtml, /Точно взять \(2\)/, '2.3: Confirming Take must show explicit card count');

    hooks.selectHandCard(defenseState, viewerRes, '7S');
    assert.equal(hooks.uiState.confirmingTake, false, '2.3: Selecting any hand card must immediately cancel pending Take confirmation');

    takeBtn.onclick();
    assert.equal(hooks.uiState.confirmingTake, true);
    takeBtn.onclick();
    assert.equal(apiCalls.length, 1, '2.3: Deliberate 2nd tap on Take must still allow taking cards even when player can beat');
    assert.equal(apiCalls[0].type, 'take_cards');
    flushTimers();

    resetUiState();
    apiCalls = [];
    const helplessState = {
        ...defenseState,
        my_hand: ['8C']
    };
    assert.equal(hooks.hasDefenseOrTransferOption(helplessState, viewerRes), false);
    const helplessTakeBtn = fakeButton({ action: 'take' });
    hooks.bindEvents(fakeShell({ '[data-action="take"]': helplessTakeBtn }), helplessState, viewerRes);
    helplessTakeBtn.onclick();
    assert.equal(apiCalls.length, 1, '2.3: When player has zero legal defense/transfer cards, 1st tap on Take must work immediately');

    resetUiState();
    hooks.selectHandCard(defenseState, viewerRes, '7S');
    hooks.selectAttackTarget(defenseState, viewerRes, '6S');
    let defendPayload = null;
    windowObject.apiRequest = async payload => {
        defendPayload = payload;
        return { status: 'ok' };
    };
    windowObject.checkState = async () => {};
    const defendButton = fakeButton({ action: 'defend' });
    hooks.bindEvents(fakeShell({ '[data-action="defend"]': defendButton }), defenseState, viewerRes);
    await defendButton.onclick();
    assert.deepEqual(JSON.parse(JSON.stringify(defendPayload)), {
        action: 'game_action',
        type: 'defend_card',
        attack_card_id: '6S',
        card_id: '7S'
    }, 'Defend action must send the selected attack and hand card ids');

    // 2.4 & 2.5: renderGame DOM/scroll preservation across identical polls + reaction body class scoping
    resetUiState();
    let boardWrites = 0;
    let handWrites = 0;
    let handScrollObj = { scrollLeft: 145 };
    const boardElem = {
        _html: '',
        get innerHTML() { return this._html; },
        set innerHTML(val) { this._html = val; boardWrites += 1; },
        querySelector: () => null
    };
    const handElem = {
        _html: '',
        get innerHTML() { return this._html; },
        set innerHTML(val) { this._html = val; handWrites += 1; },
        querySelector: selector => (selector === '.durak-hand' ? handScrollObj : null)
    };
    const settingsLayerElem = {
        classList: { toggle: () => {} },
        setAttribute: () => {},
        querySelectorAll: () => [],
        inert: true
    };
    const statusPillElem = { textContent: '', hidden: false };
    const modeLabelElem = { textContent: '' };
    const errorElem = { textContent: '', hidden: true };
    const liveShell = {
        id: 'durak-shell',
        dataset: {},
        style: { setProperty: () => {}, removeProperty: () => {} },
        classList: { toggle: () => {} },
        querySelector: selector => {
            if (selector === '#durak-board') return boardElem;
            if (selector === '#durak-hand-shell') return handElem;
            if (selector === '#durak-hand-settings-layer') return settingsLayerElem;
            if (selector === '#durak-status-pill') return statusPillElem;
            if (selector === '#durak-mode-label') return modeLabelElem;
            if (selector === '#durak-error') return errorElem;
            return null;
        },
        querySelectorAll: () => []
    };
    const liveGameArea = {
        clientWidth: 390,
        clientHeight: 844,
        classList: { add: () => {}, remove: () => {} },
        closest: () => null,
        parentElement: null
    };
    elementsById.set('game-area', liveGameArea);
    elementsById.set('durak-shell', liveShell);

    const pollPayload = {
        is_host: 1,
        user: { id: '1' },
        players,
        room: { game_state: JSON.stringify(defenseState) }
    };
    hooks.renderGame(pollPayload);
    assert.equal(boardWrites, 1, '2.4: Initial renderGame must write board HTML once');
    assert.equal(handWrites, 1, '2.4: Initial renderGame must write hand HTML once');
    assert.equal(bodyClassSet.has('durak-game-active'), true, '2.5: Active Durak game must set body.durak-game-active');

    hooks.renderGame(pollPayload);
    assert.equal(boardWrites, 1, '2.4: Identical checkState poll must NOT destroy/rewrite board DOM');
    assert.equal(handWrites, 1, '2.4: Identical checkState poll must NOT destroy/rewrite hand DOM');

    handScrollObj = { scrollLeft: 145 };
    const nextHandScrollObj = { scrollLeft: 0 };
    let returnedFirst = false;
    handElem.querySelector = selector => {
        if (selector !== '.durak-hand') return null;
        if (!returnedFirst) {
            returnedFirst = true;
            return handScrollObj;
        }
        return nextHandScrollObj;
    };
    const updatedPollPayload = {
        ...pollPayload,
        room: { game_state: JSON.stringify({ ...defenseState, my_hand: ['7S', '10D', '8C', 'AS'] }) }
    };
    hooks.renderGame(updatedPollPayload);
    assert.equal(handWrites, 2, '2.4: Changed hand state must update hand DOM');
    assert.equal(nextHandScrollObj.scrollLeft, 145, '2.4: Hand scrollLeft must be preserved across real DOM updates');

    hooks.uiState.handSettingsOpen = true;
    hooks.syncHandSettingsLayer(liveShell);
    assert.equal(bodyClassSet.has('durak-settings-open'), true, '2.5: Opening settings sheet must set body.durak-settings-open');
    hooks.cleanupResizeHandling();
    assert.equal(bodyClassSet.has('durak-game-active'), false, '2.5: Cleanup must remove body.durak-game-active');
    assert.equal(bodyClassSet.has('durak-settings-open'), false, '2.5: Cleanup must remove body.durak-settings-open');
    elementsById.clear();

    const deckHtml = hooks.renderDeck({
        draw_count: 5,
        discard_count: 2,
        trump: { suit: 'H', card: '6H' }
    });
    assert.match(deckHtml, /durak-card-back/, 'Non-empty deck must retain the normal deck visualization');
    assert.match(deckHtml, /durak-card-corner-rank">6</, 'Non-empty deck must show the face-up trump card');

    const emptyDeckHtml = hooks.renderDeck({
        draw_count: 0,
        discard_count: 30,
        trump: { suit: 'H', card: '6H' }
    });
    assert.doesNotMatch(emptyDeckHtml, /durak-card-back/, 'Empty deck must not show a deck back');
    assert.doesNotMatch(emptyDeckHtml, /durak-card-corner-rank">6</, 'Empty deck must not show the taken trump card');
    assert.match(emptyDeckHtml, /durak-deck-empty/, 'Empty deck must show an empty marker');
    assert.match(emptyDeckHtml, /Козырная масть: черви/, 'Empty deck must retain the trump suit in accessible context');
    assert.match(emptyDeckHtml, /durak-trump-suit is-red[^>]*>♥</, 'Empty deck must retain a compact trump suit symbol');

    assert.doesNotMatch(source, /Сначала выбери карту атаки на столе/, 'Hand-first defense must not show the old blocking error');

    // Stage 3.1: No premature "Бито" in compactStatusCopy + clear own-turn vs waiting + attacker/defender seat roles
    resetUiState();
    const coveredWaitingState = {
        phase: 'attack',
        actor_id: '2',
        roles: { attacker_id: '2', defender_id: '1' },
        defender_mode: 'defending',
        rules: { allow_throw_in: true, allow_transfer: false },
        player_order: ['1', '2', '3'],
        in_game_players: ['1', '2', '3'],
        finish_order: [],
        passed_throwers: [],
        attack_limit: 6,
        table: [{ attack: '6S', defend: '8S' }],
        my_hand: ['9D'],
        opponent_hands: [
            { player_id: '2', count: 5 },
            { player_id: '3', count: 5 }
        ]
    };
    assert.notEqual(hooks.compactStatusCopy(coveredWaitingState, viewerRes), 'Бито', '3.1: compactStatusCopy must NEVER show premature Бито while waiting for throw-in');
    assert.equal(hooks.compactStatusCopy(coveredWaitingState, viewerRes), 'Ждём подкидывание', '3.1: Covered table waiting state must show Ждём подкидывание');
    assert.equal(hooks.compactStatusCopy(defenseState, viewerRes), 'Твой ход · защита', '3.1: Own defense turn must explicitly say Твой ход · защита');
    assert.equal(
        hooks.compactStatusCopy({ ...coveredWaitingState, table: [], actor_id: '1', roles: { attacker_id: '1', defender_id: '2' } }, viewerRes),
        'Твой ход · атака',
        '3.1: Own opening attack turn must explicitly say Твой ход · атака'
    );

    const seatsDuringOpponentDefense = hooks.renderPlayers(
        { user: { id: '3' }, players },
        {
            ...coveredWaitingState,
            phase: 'defense',
            actor_id: '2',
            roles: { attacker_id: '1', defender_id: '2' },
            in_game_players: ['1', '2'],
            finish_order: ['3'],
            table: [{ attack: '6S', defend: null }],
            opponent_hands: [
                { player_id: '1', count: 4 },
                { player_id: '2', count: 5 }
            ]
        }
    );
    assert.match(seatsDuringOpponentDefense, /is-attacker[\s\S]*Иван[\s\S]*атакует/, '3.1: Attacker seat must stay labeled атакует even while defender is acting');
    assert.match(seatsDuringOpponentDefense, /is-defender[\s\S]*Маша[\s\S]*отбивается/, '3.1: Active defender seat must be labeled отбивается');

    // Stage 3.2: Пас vs Бито when another eligible thrower remains + client throw-in rank filtering + dynamic hints
    resetUiState();
    const firstThrowerBeatState = {
        ...coveredWaitingState,
        actor_id: '1',
        roles: { attacker_id: '1', defender_id: '2' },
        passed_throwers: [],
        my_hand: ['6H', '10C'],
        opponent_hands: [
            { player_id: '2', count: 5 },
            { player_id: '3', count: 4 }
        ]
    };
    assert.equal(hooks.otherEligibleThrowerExists(firstThrowerBeatState, viewerRes), true, '3.2: Player 3 is still an eligible thrower');
    assert.equal(hooks.passActionLabel(firstThrowerBeatState, viewerRes), 'Пас', '3.2: Pass button must say Пас (not Бито) while another thrower still has a turn');

    const lastThrowerBeatState = {
        ...firstThrowerBeatState,
        passed_throwers: ['3']
    };
    assert.equal(hooks.otherEligibleThrowerExists(lastThrowerBeatState, viewerRes), false, '3.2: No other eligible thrower remains once player 3 passed');
    assert.equal(hooks.passActionLabel(lastThrowerBeatState, viewerRes), 'Бито', '3.2: Pass button must say Бито when viewer is the final eligible thrower');
    assert.equal(
        hooks.passActionLabel({ ...lastThrowerBeatState, defender_mode: 'taking' }, viewerRes),
        'Не подкидывать',
        '3.2: Taking mode pass button must say Не подкидывать'
    );

    assert.equal(hooks.canPlayAttackCard(firstThrowerBeatState, viewerRes, '6H'), true, '3.2: Rank 6 matches 6S on table');
    assert.equal(hooks.canPlayAttackCard(firstThrowerBeatState, viewerRes, '10C'), false, '3.2: Rank 10 does not match 6S/8S on table');
    const throwInHandHtml = hooks.renderHand(firstThrowerBeatState, viewerRes);
    assert.match(throwInHandHtml, /button type="button" disabled data-card-id="10C" class="durak-card[^"]*is-muted/, '3.2: Non-matching throw-in card 10C must be muted and disabled in hand');
    assert.match(throwInHandHtml, /button type="button"\s+data-card-id="6H"/, '3.2: Matching throw-in card 6H must remain enabled in hand');

    hooks.selectHandCard(firstThrowerBeatState, viewerRes, '6H');
    assert.match(hooks.renderHand(firstThrowerBeatState, viewerRes), /Нажми «Подкинуть 6♥» или «Пас»/, '3.2: Selecting a valid throw-in card must update contextual hint');

    // Stage 3.3: Guest leave-room on finished screen
    resetUiState();
    const finishedState = {
        phase: 'finished',
        player_order: ['1', '2'],
        in_game_players: ['2'],
        finish_order: ['1'],
        rematch_requests: [],
        my_hand: [],
        opponent_hands: [{ player_id: '2', count: 2 }],
        result: { loser_id: '2', reason: 'last_player_with_cards' }
    };
    const guestFinalHtml = hooks.renderFinalScreen(finishedState, { is_host: 0, user: { id: '1' }, players });
    assert.match(guestFinalHtml, /data-action="leave-room"[\s\S]*Выйти из комнаты/, '3.3: Guest final screen must render Выйти из комнаты button');
    const hostFinalHtml = hooks.renderFinalScreen(finishedState, { is_host: 1, user: { id: '1' }, players });
    assert.match(hostFinalHtml, /data-action="return-room"[\s\S]*Вернуться в комнату/, '3.3: Host final screen must keep Вернуться в комнату button');

    // Stage 3.4 & 3.5: Active exit button moved out of .durak-context-actions into #durak-hand-settings-layer + concise bot feed
    resetUiState();
    let createdShell = null;
    const defaultCreateElement = documentObject.createElement;
    documentObject.createElement = () => {
        const el = {
            id: '',
            className: '',
            innerHTML: '',
            set textContent(val) { this.innerHTML = String(val ?? ''); }
        };
        createdShell = el;
        return el;
    };
    const shellContainer = { appendChild: () => {}, innerHTML: '' };
    hooks.renderShell(shellContainer);
    assert.ok(createdShell && /id="durak-hand-settings-layer"[\s\S]*id="durak-exit-section"[\s\S]*id="durak-exit-btn"/.test(createdShell.innerHTML), '3.4: #durak-exit-btn must live inside #durak-hand-settings-layer away from Telegram top-right controls');
    assert.doesNotMatch(boardElem.innerHTML, /id="durak-exit-btn"/, '3.4: Active #durak-board top row must NOT contain #durak-exit-btn');
    documentObject.createElement = defaultCreateElement;

    const botStateWithFeed = {
        ...defenseState,
        last_bot_actions: [
            { player_id: '2', type: 'open_attack', card_id: '6S', attack_card_id: null },
            { player_id: '2', type: 'attack_card', card_id: '9H', attack_card_id: null }
        ]
    };
    assert.equal(hooks.formatBotActionSummary(botStateWithFeed, viewerRes), 'Маша: ход 6♠ · подкид 9♥', '3.5: Bot action summary formats open_attack and throw-in concisely');
    const botFeedTableHtml = hooks.renderTable(botStateWithFeed, viewerRes).trim();
    assert.match(botFeedTableHtml, /^<div class="durak-table-stage">[\s\S]*durak-bot-feed[\s\S]*<\/div>$/, '3.5: Bot feed renders inside .durak-table-stage without breaking 3-row .durak-center grid');

    // Stage 4: Mobile Card Drag-and-Drop in Durak
    let apiRequests = [];
    windowObject.apiRequest = async req => {
        apiRequests.push(req);
        return { status: 'success' };
    };

    // 4.1: Regular tap on hand card selects/unselects without activating drag
    resetUiState();
    hooks.uiState.currentState = firstThrowerBeatState;
    hooks.uiState.lastRes = viewerRes;
    const tapCardBtn = fakeButton({ cardId: '6H' });
    hooks.bindEvents(fakeShell({}, { '.durak-hand .durak-card': [tapCardBtn] }), firstThrowerBeatState, viewerRes);
    tapCardBtn.onclick();
    assert.equal(hooks.uiState.selectedCardId, '6H', '4.1: Regular tap must select card');
    tapCardBtn.onclick();
    assert.equal(hooks.uiState.selectedCardId, null, '4.1: Second tap must unselect card');
    assert.equal(hooks.dragState.active, false, '4.1: Regular tap must not activate drag');

    // 4.2: Horizontal swipe on hand card scrolls hand, cancels drag tracking, and sends no action
    apiRequests = [];
    resetUiState();
    hooks.uiState.currentState = firstThrowerBeatState;
    hooks.uiState.lastRes = viewerRes;
    tapCardBtn.onpointerdown({ pointerId: 1, clientX: 100, clientY: 500, button: 0 });
    assert.equal(hooks.dragState.tracking, true, '4.2: pointerdown starts tracking');
    hooks.handleWindowPointerMove({ pointerId: 1, clientX: 130, clientY: 502, cancelable: true, preventDefault: () => {} });
    assert.equal(hooks.dragState.tracking, false, '4.2: Horizontal swipe cancels tracking for native scroll');
    assert.equal(hooks.dragState.active, false, '4.2: Horizontal swipe does not activate drag');
    hooks.handleWindowPointerUp({ pointerId: 1, clientX: 130, clientY: 502 });
    assert.equal(apiRequests.length, 0, '4.2: Horizontal swipe must not send any action');

    // 4.3: Upward drag on attack card activates drag, highlights table drop zone, and drops to send attack_card
    apiRequests = [];
    resetUiState();
    hooks.uiState.currentState = firstThrowerBeatState;
    hooks.uiState.lastRes = viewerRes;
    const atkTableStage = fakeButton({ dropZone: 'attack' });
    const atkShell = fakeShell({ '.durak-table-stage, .durak-table-empty': atkTableStage }, { '.durak-hand .durak-card': [tapCardBtn] });
    elementsById.set('durak-shell', atkShell);
    documentObject.elementFromPoint = (x, y) => atkTableStage;
    hooks.bindEvents(atkShell, firstThrowerBeatState, viewerRes);
    tapCardBtn.onpointerdown({ pointerId: 2, clientX: 100, clientY: 500, button: 0 });
    hooks.handleWindowPointerMove({ pointerId: 2, clientX: 100, clientY: 380, cancelable: true, preventDefault: () => {} });
    assert.equal(hooks.dragState.active, true, '4.3: Upward motion activates drag');
    assert.equal(hooks.dragState.canAttack, true, '4.3: Valid throw-in card sets canAttack');
    assert.equal(hooks.dragState.hoverTarget?.type, 'attack', '4.3: Table resolves as attack target');
    hooks.handleWindowPointerUp({ pointerId: 2, clientX: 100, clientY: 380 });
    assert.equal(apiRequests.length, 1, '4.3: Dropping over table sends 1 action');
    assert.equal(apiRequests[0].type, 'attack_card', '4.3: Action type must be attack_card');
    assert.equal(apiRequests[0].card_id, '6H', '4.3: Card ID must be 6H');
    assert.equal(hooks.dragState.active, false, '4.3: Drop ends active drag');

    // 4.4: Upward drag on defense card highlights beatable open tricks, and drops on specific trick to send defend_card
    apiRequests = [];
    resetUiState();
    hooks.uiState.currentState = defenseState;
    hooks.uiState.lastRes = viewerRes;
    const defCardBtn = fakeButton({ cardId: '7S' });
    const trick6S = fakeButton({ attackCard: '6S' });
    const trick9H = fakeButton({ attackCard: '9H' });
    const defShell = fakeShell({}, {
        '.durak-hand .durak-card': [defCardBtn],
        '.durak-trick[data-attack-card]': [trick6S, trick9H]
    });
    elementsById.set('durak-shell', defShell);
    hooks.bindEvents(defShell, defenseState, viewerRes);
    documentObject.elementFromPoint = (x, y) => trick9H;
    defCardBtn.onpointerdown({ pointerId: 3, clientX: 100, clientY: 500, button: 0 });
    hooks.handleWindowPointerMove({ pointerId: 3, clientX: 100, clientY: 350, cancelable: true, preventDefault: () => {} });
    assert.equal(hooks.dragState.active, true, '4.4: Upward motion activates defense drag');
    assert.deepEqual(hooks.dragState.validDefenseTargets, ['6S'], '4.4: Only 6S is a valid defense target for 7S');
    assert.equal(hooks.dragState.hoverTarget, null, '4.4: Incompatible trick 9H must not resolve as hover target');
    documentObject.elementFromPoint = (x, y) => trick6S;
    hooks.handleWindowPointerMove({ pointerId: 3, clientX: 100, clientY: 300, cancelable: true, preventDefault: () => {} });
    assert.equal(hooks.dragState.hoverTarget?.type, 'defend', '4.4: Compatible trick 6S resolves as defend target');
    assert.equal(hooks.dragState.hoverTarget?.attackCardId, '6S', '4.4: Attack card ID is 6S');
    hooks.handleWindowPointerUp({ pointerId: 3, clientX: 100, clientY: 300 });
    assert.equal(apiRequests.length, 1, '4.4: Dropping over compatible trick sends defend_card');
    assert.equal(apiRequests[0].type, 'defend_card');
    assert.equal(apiRequests[0].card_id, '7S');
    assert.equal(apiRequests[0].attack_card_id, '6S');

    // 4.5: Upward drag on transferable card shows separate transfer zone, and dropping on it sends transfer_card
    apiRequests = [];
    resetUiState();
    const transferAllowedState = { ...transferState, trump: { suit: 'D', card: '6D' } };
    hooks.uiState.currentState = transferAllowedState;
    hooks.uiState.lastRes = viewerRes;
    const trfCardBtn = fakeButton({ cardId: '6C' });
    const trfZone = fakeButton({ dropZone: 'transfer' });
    const trfShell = fakeShell({ '#durak-transfer-zone': trfZone }, {
        '.durak-hand .durak-card': [trfCardBtn],
        '.durak-trick[data-attack-card]': [trick6S]
    });
    elementsById.set('durak-shell', trfShell);
    hooks.bindEvents(trfShell, transferAllowedState, viewerRes);
    documentObject.elementFromPoint = (x, y) => trfZone;
    trfCardBtn.onpointerdown({ pointerId: 4, clientX: 100, clientY: 500, button: 0 });
    hooks.handleWindowPointerMove({ pointerId: 4, clientX: 100, clientY: 350, cancelable: true, preventDefault: () => {} });
    assert.equal(hooks.dragState.canTransfer, true, '4.5: Transferable card sets canTransfer');
    assert.equal(hooks.dragState.hoverTarget?.type, 'transfer', '4.5: Transfer zone resolves as transfer target');
    hooks.handleWindowPointerUp({ pointerId: 4, clientX: 100, clientY: 350 });
    assert.equal(apiRequests.length, 1, '4.5: Dropping in transfer zone sends transfer_card');
    assert.equal(apiRequests[0].type, 'transfer_card');
    assert.equal(apiRequests[0].card_id, '6C');

    // 4.6: Dropping transferable card on an attacking trick never sends transfer_card
    apiRequests = [];
    resetUiState();
    const multiOptionCardBtn = fakeButton({ cardId: '6D' });
    const multiOptionState = { ...transferAllowedState, my_hand: ['6D'] };
    const multiOptionShell = fakeShell({ '#durak-transfer-zone': trfZone }, {
        '.durak-hand .durak-card': [multiOptionCardBtn],
        '.durak-trick[data-attack-card]': [trick6S]
    });
    elementsById.set('durak-shell', multiOptionShell);
    hooks.uiState.currentState = multiOptionState;
    hooks.uiState.lastRes = viewerRes;
    hooks.bindEvents(multiOptionShell, multiOptionState, viewerRes);
    documentObject.elementFromPoint = (x, y) => trick6S;
    multiOptionCardBtn.onpointerdown({ pointerId: 5, clientX: 100, clientY: 500, button: 0 });
    hooks.handleWindowPointerMove({ pointerId: 5, clientX: 100, clientY: 300, cancelable: true, preventDefault: () => {} });
    assert.equal(hooks.dragState.canTransfer, true, '4.6: Card can transfer');
    assert.ok(hooks.dragState.validDefenseTargets.includes('6S'), '4.6: Card can also defend 6S');
    assert.equal(hooks.dragState.hoverTarget?.type, 'defend', '4.6: Dropping on trick must resolve to defend, NEVER transfer');
    hooks.handleWindowPointerUp({ pointerId: 5, clientX: 100, clientY: 300 });
    assert.equal(apiRequests.length, 1);
    assert.equal(apiRequests[0].type, 'defend_card', '4.6: Drop on trick sends defend_card');
    assert.equal(apiRequests[0].attack_card_id, '6S');

    // 4.7: Unplayable card does not activate drag and never triggers an action
    apiRequests = [];
    resetUiState();
    hooks.uiState.currentState = firstThrowerBeatState;
    hooks.uiState.lastRes = viewerRes;
    const unplayableBtn = fakeButton({ cardId: '10C' });
    hooks.bindEvents(fakeShell({}, { '.durak-hand .durak-card': [unplayableBtn] }), firstThrowerBeatState, viewerRes);
    unplayableBtn.onpointerdown({ pointerId: 6, clientX: 100, clientY: 500, button: 0 });
    hooks.handleWindowPointerMove({ pointerId: 6, clientX: 100, clientY: 400, cancelable: true, preventDefault: () => {} });
    assert.equal(hooks.dragState.active, false, '4.7: Unplayable card must not activate drag');
    hooks.handleWindowPointerUp({ pointerId: 6, clientX: 100, clientY: 400 });
    assert.equal(apiRequests.length, 0, '4.7: Unplayable card gesture must not send any request');

    // 4.8: Releasing outside any valid target cancels drag, restores source card, and sends no action
    apiRequests = [];
    resetUiState();
    hooks.uiState.currentState = firstThrowerBeatState;
    hooks.uiState.lastRes = viewerRes;
    documentObject.elementFromPoint = (x, y) => null;
    tapCardBtn.onpointerdown({ pointerId: 7, clientX: 100, clientY: 500, button: 0 });
    hooks.handleWindowPointerMove({ pointerId: 7, clientX: 100, clientY: 400, cancelable: true, preventDefault: () => {} });
    assert.equal(hooks.dragState.active, true);
    assert.equal(hooks.dragState.hoverTarget, null, '4.8: Moving outside results in null hoverTarget');
    hooks.handleWindowPointerUp({ pointerId: 7, clientX: 100, clientY: 400 });
    assert.equal(apiRequests.length, 0, '4.8: Release outside target must send no request');
    assert.equal(hooks.dragState.active, false, '4.8: Drag is cancelled');

    // 4.9: pointercancel cleanly cancels drag and clears temporary state
    apiRequests = [];
    resetUiState();
    hooks.uiState.currentState = firstThrowerBeatState;
    hooks.uiState.lastRes = viewerRes;
    tapCardBtn.onpointerdown({ pointerId: 8, clientX: 100, clientY: 500, button: 0 });
    hooks.handleWindowPointerMove({ pointerId: 8, clientX: 100, clientY: 400, cancelable: true, preventDefault: () => {} });
    assert.equal(hooks.dragState.active, true);
    hooks.handleWindowPointerCancel({ pointerId: 8 });
    assert.equal(hooks.dragState.active, false, '4.9: pointercancel must cancel active drag');
    assert.equal(hooks.dragState.tracking, false, '4.9: pointercancel clears tracking');
    assert.equal(apiRequests.length, 0, '4.9: pointercancel must send no requests');

    // 4.10: Releasing a dropped card sets busy / clears state, preventing duplicate requests and suppressing clicks
    apiRequests = [];
    resetUiState();
    hooks.uiState.currentState = firstThrowerBeatState;
    hooks.uiState.lastRes = viewerRes;
    documentObject.elementFromPoint = (x, y) => atkTableStage;
    tapCardBtn.onpointerdown({ pointerId: 9, clientX: 100, clientY: 500, button: 0 });
    hooks.handleWindowPointerMove({ pointerId: 9, clientX: 100, clientY: 400, cancelable: true, preventDefault: () => {} });
    hooks.handleWindowPointerUp({ pointerId: 9, clientX: 100, clientY: 400 });
    assert.equal(apiRequests.length, 1, '4.10: 1st release sends action');
    hooks.handleWindowPointerUp({ pointerId: 9, clientX: 100, clientY: 400 });
    assert.equal(apiRequests.length, 1, '4.10: Repeated release does not send duplicate request');
    tapCardBtn.onclick();
    assert.equal(hooks.uiState.selectedCardId, null, '4.10: Click immediately after drag drop is suppressed');

    // 4.11: Server state update during active drag: cancels if move invalidated, or preserves if still valid
    resetUiState();
    hooks.uiState.currentState = defenseState;
    hooks.uiState.lastRes = viewerRes;
    defCardBtn.onpointerdown({ pointerId: 10, clientX: 100, clientY: 500, button: 0 });
    hooks.handleWindowPointerMove({ pointerId: 10, clientX: 100, clientY: 400, cancelable: true, preventDefault: () => {} });
    assert.equal(hooks.dragState.active, true, '4.11: Drag started');
    hooks.renderGame({ ...viewerRes, room: { game_state: JSON.stringify({ ...defenseState, phase: 'finished' }) } });
    assert.equal(hooks.dragState.active, false, '4.11: Invalidation during active drag safely cancels drag');

    console.log('Durak UI smoke: PASS');
}

run().catch(error => {
    console.error(error);
    process.exit(1);
});
