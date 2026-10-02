const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const uiPath = path.join(__dirname, '..', 'js', 'games', 'durak', 'ui.js');
const source = fs.readFileSync(uiPath, 'utf8');
const marker = '\n})();\n';
const hookExport = `
    window.__durakUiTestHooks = {
        bindEvents,
        canSelectAttackTarget,
        defenseTargetCard,
        renderControls,
        renderDeck,
        renderSetupScreen,
        renderTable,
        selectAttackTarget,
        selectHandCard,
        uiState,
        updateLastTrickResult
    };
`;

assert.ok(source.includes(marker), 'Durak UI test hook insertion point must exist');

const timers = [];
const windowObject = {
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
const documentObject = {
    addEventListener: () => {},
    removeEventListener: () => {},
    createElement: () => ({
        set textContent(value) {
            this.innerHTML = String(value ?? '');
        },
        innerHTML: ''
    })
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
    return {
        dataset,
        disabled: false,
        attributes: {},
        onclick: null,
        setAttribute(name, value) {
            this.attributes[name] = String(value);
        },
        removeAttribute(name) {
            delete this.attributes[name];
        }
    };
}

function fakeShell(single = {}, lists = {}) {
    return {
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
    hooks.uiState.selectedCardId = null;
    hooks.uiState.selectedAttackCardId = null;
    hooks.uiState.busy = false;
    hooks.uiState.busyAction = null;
    hooks.uiState.exitBusy = false;
    hooks.uiState.lastError = '';
    hooks.uiState.lastRes = null;
    hooks.uiState.lastTrickResult = null;
    hooks.uiState.previousTrickState = null;
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

    resetUiState();
    assert.equal(hooks.selectAttackTarget(defenseState, viewerRes, '6S'), true, 'Attack-first flow must accept an open target');
    hooks.selectHandCard(defenseState, viewerRes, '7S');
    assert.equal(hooks.defenseTargetCard(defenseState, viewerRes), '6S', 'Attack-first flow must preserve the pair');
    assert.match(hooks.renderControls(defenseState, viewerRes), /data-action="defend"/, 'Attack-first flow must enable defend');

    resetUiState();
    hooks.selectHandCard(defenseState, viewerRes, '7S');
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
    console.log('Durak UI smoke: PASS');
}

run().catch(error => {
    console.error(error);
    process.exit(1);
});
