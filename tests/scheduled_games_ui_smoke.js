const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../js/modules/room-manager.js'), 'utf8');
// Execute the real module against a minimal DOM, without a browser or network.
const cards = [];
const messages = [];
const container = {
    _html: '',
    set innerHTML(value) { this._html = value; cards.length = 0; },
    get innerHTML() { return this._html; },
    appendChild(card) { cards.push(card); },
    querySelector(selector) {
        const id = selector.match(/data-scheduled-game-id="(\d+)"/)?.[1];
        return cards.find(card => card.dataset.scheduledGameId === id) || null;
    }
};
const windowObject = {
    globalUser: { id: 1 },
    AVAILABLE_GAMES: [],
    safeHTML: value => String(value ?? ''),
    showToast: (...args) => messages.push(args),
    checkState: async () => {},
};
const documentObject = {
    readyState: 'loading',
    addEventListener() {},
    getElementById: id => id === 'scheduled-games-list' ? container : null,
    querySelectorAll: () => [],
    createElement: () => ({
        dataset: {}, classList: { add() {}, remove() {} },
        scrollIntoView() { this.highlighted = true; }
    })
};
const context = vm.createContext({window: windowObject, document: documentObject, console, setTimeout: () => 1, clearTimeout() {}});
vm.runInContext(source, context);
const makeGame = (id, status = 'scheduled', offsetMinutes = 10) => ({id, status, host_id: 1, title: 'Test', starts_at: new Date(Date.now()+offsetMinutes*60000).toISOString(), min_players: 2, max_players: 4, subscribers_count: 1, room_code: 'TEST'});
(async () => {
    for (const general of [[], Array.from({length: 30}, (_,i) => makeGame(i+1))]) {
        const calls = [];
        windowObject.pendingScheduledGameDeepLinkId = 99;
        windowObject.apiRequest = async request => {
            calls.push(request);
            return {status: 'ok', games: request.scheduled_game_id ? [makeGame(99)] : general};
        };
        await windowObject.loadScheduledGames();
        assert.equal(calls[1].scheduled_game_id, 99);
        const target = cards.find(card => card.dataset.scheduledGameId === '99');
        assert.ok(target.highlighted, 'Target outside the normal list must render and highlight');
        assert.doesNotMatch(target.innerHTML, /openScheduledGame\(99\)/, 'T−10 must not offer an active open action');
        assert.match(target.innerHTML, /<span[^>]*aria-disabled="true"[^>]*>Можно открыть за 5 минут до старта<\/span>/);
    }
    for (const offsetMinutes of [10, 4, -10]) {
        windowObject.apiRequest = async () => ({status: 'ok', games: [makeGame(99, 'scheduled', offsetMinutes)]});
        await windowObject.loadScheduledGames();
        const target = cards.find(card => card.dataset.scheduledGameId === '99');
        assert.ok(target, `Scheduled card must remain visible at offset ${offsetMinutes}`);
        if (offsetMinutes === 10) {
            assert.doesNotMatch(target.innerHTML, /openScheduledGame\(99\)/);
            assert.match(target.innerHTML, /<span[^>]*aria-disabled="true"[^>]*>Можно открыть за 5 минут до старта<\/span>/);
        } else {
            assert.match(target.innerHTML, /<button[^>]*onclick="openScheduledGame\(99\)"[^>]*>Открыть<\/button>/);
        }
    }
    for (const kind of ['cancelled', 'expired', 'nonexistent', 'inaccessible']) {
        windowObject.pendingScheduledGameDeepLinkId = 99;
        windowObject.apiRequest = async () => ({status: 'ok', games: []});
        messages.length = 0;
        await windowObject.loadScheduledGames();
        assert.equal(messages[0][0], 'Эта игра уже закрыта или недоступна.', kind);
        assert.equal(windowObject.pendingScheduledGameDeepLinkId, null);
    }
    windowObject.pendingScheduledGameDeepLinkId = 99;
    windowObject.apiRequest = async request => ({status: 'ok', games: request.scheduled_game_id ? [makeGame(99, 'live')] : []});
    await windowObject.loadScheduledGames();
    assert.match(cards[0].innerHTML, /joinScheduledGameRoom\('TEST'\)/);
    let joined;
    windowObject.apiRequest = async request => { joined = request; return {status:'ok'}; };
    await windowObject.joinScheduledGameRoom('TEST');
    assert.equal(joined.action, 'join_room');
    assert.equal(joined.room_code, 'TEST');
    for (const [sent, status] of [[0,'error'],[1,'ok'],[2,'ok']]) {
        messages.length = 0;
        windowObject.apiRequest = async () => ({status, sent_count:sent, recipient_count:2, message:'Delivery failed'});
        await windowObject.sendScheduledGameManualReminder(99);
        assert.equal(messages[0][1], sent === 2 ? 'success' : 'warning');
        if (sent === 1) assert.match(messages[0][0], /Отправлено 1 из 2/);
        if (!sent) assert.doesNotMatch(messages[0][0], /отправлено/i);
    }
    assert.ok(source.includes('Можно открыть за 5 минут до старта'));
    console.log('PASS scheduled UI: empty/limited list, unavailable links, live join, delivery feedback');
})().catch(error => { console.error(error); process.exitCode = 1; });
