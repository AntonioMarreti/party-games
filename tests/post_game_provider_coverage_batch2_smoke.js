const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const players = [
    { id: 1, display_name: 'Анна', first_name: 'Wrong' },
    { id: 2, custom_name: 'Борис' }
];
const gameIds = ['blokus', 'backgammon_game'];
const plain = value => JSON.parse(JSON.stringify(value));

function setup(withProvider = true) {
    const list = { innerHTML: '' };
    const footer = { innerHTML: '' };
    const controls = { innerHTML: '' };
    const nodes = new Map([
        ['.bg-nav-header', { innerHTML: '' }], ['.bg-board-container', { innerHTML: '' }],
        ['.bg-player-section', { innerHTML: '' }], ['.bg-menu-overlay', { innerHTML: '' }],
        ['.bg-controls', controls]
    ]);
    const wrapper = {
        classList: { add() {} },
        querySelector: selector => nodes.get(selector),
        innerHTML: ''
    };
    const container = { querySelector: () => wrapper, appendChild() {}, innerHTML: '' };
    const calls = { registered: [], confirm: [], restart: [], lobby: [], leave: [], share: [], story: [] };
    const window = {
        AVAILABLE_GAMES: [], isHost: true, location: { href: 'https://example.test/' }, currentRoomCode: 'ROOM42',
        Telegram: { WebApp: {
            initDataUnsafe: { user: { is_premium: true } },
            shareToStory: (...args) => calls.story.push(args),
            openTelegramLink: url => calls.share.push(url)
        } },
        apiRequest: () => ({ status: 'ok', media_url: 'https://example.test/result.png' }),
        backToLobby: () => calls.lobby.push(true),
        leaveRoom: () => calls.leave.push(true),
        returnToRoomLobby: () => calls.lobby.push('host'),
        bgConfirmRestartGame: () => calls.confirm.push(true),
        bgRestartGame: () => calls.restart.push(true),
        showConfirmation: (...args) => calls.confirm.push(args),
        audioManager: { play() {} }, addEventListener() {}
    };
    const Engine = class {
        constructor() {
            this.status = 'starting'; this.board = Array(24).fill(null); this.dice = [];
            this.movesLeft = []; this.startingRolls = {}; this.readyToStart = {};
            this.turn = 'white'; this.whiteOff = 0; this.blackOff = 0;
        }
        syncState(state) { Object.assign(this, state); }
        getMovablePoints() { return []; }
        getLegalMoveDetails() { return new Map(); }
    };
    const document = {
        head: { appendChild() {} }, documentElement: { classList: { add() {}, remove() {} } },
        body: { classList: { add() {}, remove() {} } },
        addEventListener(type, fn) { if (type === 'click') clickHandler = fn; },
        getElementById(id) {
            if (id === 'blokus-results-list') return list;
            if (id === 'game-area') return container;
            if (id === 'blokus-scroll-lock-style') return null;
            if (id === 'bg-game-menu') return null;
            return null;
        },
        querySelector(selector) { return selector === '#blokus-results-screen .results-footer' ? footer : null; },
        createElement() { return { classList: { add() {}, remove() {} }, style: {}, innerHTML: '' }; }
    };
    let clickHandler;
    const context = vm.createContext({ window, document, console, localStorage: { getItem: () => null },
        BackgammonEngine: Engine, globalUser: { id: 1 }, setTimeout, clearTimeout, setInterval, clearInterval });
    // Browser classic scripts resolve window properties as globals.
    context.window = context;
    Object.assign(context, window);
    const load = file => vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context, { filename: file });
    load('js/config/games-config.js');
    if (withProvider) {
        load('js/modules/game-summary-provider.js');
        const register = context.GameSummaryProvider.register;
        context.GameSummaryProvider.register = (id, provider) => {
            calls.registered.push(id);
            return register(id, provider);
        };
    }
    load('js/games/blokus.js');
    load('js/games/backgammon/ui.js');
    context.blokusState = { players };
    context.isHost = true;
    return { context, calls, list, footer, controls, click: (...args) => clickHandler(...args) };
}

function summary(runtime, id, state, isHost = true) {
    const before = JSON.stringify(state);
    const result = runtime.context.GameSummaryProvider.remember(id, state, { players, isHost });
    assert.equal(JSON.stringify(state), before, 'Provider must not mutate final state');
    assert.equal(result.gameId, id);
    assert.equal(result.gameTitle, runtime.context.AVAILABLE_GAMES.find(game => game.id === id).name);
    assert.deepEqual(plain(result.participants), players.map(player => ({
        id: player.id, name: player.display_name || player.custom_name || player.first_name || player.username || 'Игрок'
    })));
    assert.ok(result.outcome);
    assert.ok(result.awards.length <= 3);
    return result;
}

async function run() {
    const runtime = setup();
    assert.deepEqual(runtime.calls.registered, gameIds);
    const blokusState = { status: 'finished', gameResults: [
        { user_id: 1, score: 12, rank: 1 }, { user_id: 2, score: 7, rank: 2 }
    ], finalScores: { BLUE: 99, YELLOW: 0 } };
    const blokus = summary(runtime, 'blokus', blokusState);
    assert.deepEqual(plain(blokus.winner), { id: 1, name: 'Анна', score: 12 });
    assert.equal(blokus.awards[0].title, 'Лучший результат');
    assert.equal(blokus.awards[1].title, '2 место');
    const tie = summary(runtime, 'blokus', { gameResults: [
        { user_id: 1, score: 12, rank: 1 }, { user_id: 2, score: 12, rank: 1 }
    ] });
    assert.equal(tie.winner, null);
    assert.match(tie.outcome, /разделили первое место/);
    assert.ok(tie.awards.every(award => award.title === '1 место'));
    for (const gameResults of [undefined, [], {}, [{ user_id: 1, rank: 'bad', score: 4 }],
        [{ user_id: 99, rank: 1, score: 100 }], [{ user_id: 1, rank: 1, score: Infinity }]]) {
        const empty = summary(runtime, 'blokus', { gameResults, finalScores: { BLUE: 999 } });
        assert.equal(empty.winner, null);
        assert.doesNotMatch(empty.outcome, /Анна|Борис/);
        assert.equal(empty.awards.length, 0);
    }

    for (const [winnerColor, expected] of [['white', players[0]], ['black', players[1]]]) {
        runtime.context._bgMyColor = winnerColor;
        const bgSummary = summary(runtime, 'backgammon_game', {
            status: 'finished', winner: winnerColor, whiteOff: winnerColor === 'white' ? 15 : 8,
            blackOff: winnerColor === 'black' ? 15 : 8
        });
        assert.equal(bgSummary.winner.id, expected.id);
        assert.equal(bgSummary.winner.score, 15);
        assert.match(bgSummary.outcome, new RegExp(expected.display_name || expected.custom_name));
    }
    for (const clientColor of ['white', 'black']) {
        runtime.context._bgMyColor = clientColor;
        assert.equal(summary(runtime, 'backgammon_game', {
            status: 'finished', winner: 'white', whiteOff: 15, blackOff: 8
        }).winner.id, players[0].id);
    }
    for (const winner of [undefined, 'red', '']) {
        assert.equal(summary(runtime, 'backgammon_game', {
            status: 'finished', winner, whiteOff: 15, blackOff: 8
        }).winner, null);
    }

    runtime.context.isHost = true;
    runtime.context.blokusState.players = players;
    runtime.context.renderResults(blokusState);
    assert.match(runtime.list.innerHTML, /#1/);
    assert.match(runtime.list.innerHTML, />12</);
    assert.match(runtime.footer.innerHTML, /data-game-summary="blokus"/);
    assert.equal((runtime.footer.innerHTML.match(/data-game-summary-action="return-room-lobby"/g) || []).length, 1);
    assert.equal((runtime.footer.innerHTML.match(/data-game-summary-action="leave-room"/g) || []).length, 1);
    assert.doesNotMatch(runtime.footer.innerHTML, /onclick="returnToRoomLobby\(\)|onclick="leaveRoom\(\)/);
    runtime.click({ target: { closest: () => ({ dataset: { gameSummaryAction: 'return-room-lobby', gameId: 'blokus' } }) }, preventDefault() {} });
    assert.deepEqual(runtime.calls.lobby, ['host']);
    runtime.click({ target: { closest: () => ({ dataset: { gameSummaryAction: 'leave-room', gameId: 'blokus' } }) }, preventDefault() {} });
    assert.equal(runtime.calls.leave.length, 1);
    runtime.context.isHost = false;
    runtime.context.blokusState.players = players;
    runtime.context.renderResults(blokusState);
    assert.match(runtime.footer.innerHTML, /Ожидайте хоста/);
    assert.match(runtime.footer.innerHTML, /data-game-summary-action="leave-room"/);
    assert.equal((runtime.footer.innerHTML.match(/data-game-summary-action="restart/gi) || []).length, 0);

    for (const isHost of [true, false]) {
        const state = { status: 'finished', winner: 'white', whiteOff: 15, blackOff: 8,
            board: Array(24).fill(null), dice: [], movesLeft: [], turn: 'white' };
        runtime.context._bgMyColor = 'black';
        runtime.context.render_backgammon({ user: { id: 2 }, is_host: isHost,
            room: { players, game_state: state } });
        assert.match(runtime.controls.innerHTML, /bg-finish-title/);
        assert.match(runtime.controls.innerHTML, /Снято: белые 15\/15/);
        assert.match(runtime.controls.innerHTML, /data-game-summary="backgammon_game"/);
        assert.equal((runtime.controls.innerHTML.match(/data-game-summary-action="restart-game"/g) || []).length, isHost ? 1 : 0);
        assert.equal((runtime.controls.innerHTML.match(/data-game-summary-action="return-to-room"/g) || []).length, 1);
        assert.doesNotMatch(runtime.controls.innerHTML, /onclick="bgConfirmRestartGame\(\)"/);
        assert.equal(runtime.context.GameSummaryProvider.build('backgammon_game', state, { players }).winner.id, players[0].id);
        if (isHost) {
            runtime.click({ target: { closest: () => ({ dataset: { gameSummaryAction: 'restart-game', gameId: 'backgammon_game' } }) }, preventDefault() {} });
            assert.equal(runtime.calls.confirm.length, 1);
        }
        runtime.click({ target: { closest: () => ({ dataset: { gameSummaryAction: 'return-to-room', gameId: 'backgammon_game' } }) }, preventDefault() {} });
        assert.equal(runtime.calls.lobby.length, isHost ? 2 : 3);
    }

    for (const [id, state] of [['blokus', blokusState], ['backgammon_game', {
        status: 'finished', winner: 'black', whiteOff: 8, blackOff: 15
    }]]) {
        const result = summary(runtime, id, state);
        await runtime.context.GameSummaryProvider.shareStory(id, result);
        const [media, params] = runtime.calls.story.at(-1);
        assert.equal(media, 'https://example.test/result.png');
        assert.equal(params.widget_link.name, 'Об игре');
        assert.equal(params.widget_link.url, `https://t.me/mpartygamebot/app?startapp=gameinfo_${id}`);
        runtime.context.GameSummaryProvider.share(id, result);
        assert.equal(new URL(runtime.calls.share.at(-1)).searchParams.get('url'), result.inviteLink);
    }

    const fallback = setup(false);
    fallback.context.isHost = true;
    fallback.context.blokusState.players = players;
    fallback.context.renderResults(blokusState);
    assert.match(fallback.footer.innerHTML, /returnToRoomLobby\(\)/);
    assert.match(fallback.footer.innerHTML, /leaveRoom\(\)/);
    fallback.context.render_backgammon({ user: { id: 1 }, is_host: true,
        room: { players, game_state: { status: 'finished', winner: 'white', whiteOff: 15, blackOff: 8,
            board: Array(24).fill(null), dice: [], movesLeft: [], turn: 'white' } } });
    assert.match(fallback.controls.innerHTML, /onclick="bgConfirmRestartGame\(\)"/);
    assert.match(fallback.controls.innerHTML, /onclick="bgToggleMenu\(\)"/);
    console.log('Post-game provider coverage batch 2 smoke: PASS (Blokus ranks/ties, Backgammon server winner, UI actions/fallback, Story CTA, normal share)');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
