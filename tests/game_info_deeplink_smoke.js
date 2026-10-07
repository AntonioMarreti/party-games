const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const sourcePath = path.join(__dirname, '../js/modules/auth-manager.js');
const source = fs.readFileSync(sourcePath, 'utf8');

async function route(startParam, {
    status = 'no_room', query = false, showcase = true,
    games = [{ id: 'brainbattle' }, { id: 'tictactoe_ultimate' }],
    keepSplash = false, hash = '#profile'
} = {}) {
    const calls = { showcase: [], join: [], leave: [], create: [], screens: [], confirm: [], errors: [] };
    const room = { room_code: 'CURRENT', players: [{ id: 1 }], is_host: true };
    let splashActive = true;
    let screen;
    const windowObject = {
        location: { search: query ? `?startapp=${encodeURIComponent(startParam)}` : '', hash },
        AVAILABLE_GAMES: games,
        APP_STATE: { room }, currentRoomCode: 'CURRENT', isHost: true,
        pendingScheduledGameDeepLinkId: 123,
        checkState: async () => {
            screen = status === 'in_room' ? 'room' : 'lobby';
            splashActive = keepSplash;
            return { status, room };
        },
        showScreen: target => { calls.screens.push(target); screen = target; splashActive = false; },
        joinRoom: async code => calls.join.push(code),
        leaveRoom: async () => calls.leave.push(true),
        createRoom: () => calls.create.push(true),
        showConfirmation: (...args) => calls.confirm.push(args)
    };
    if (showcase) windowObject.openGameShowcase = id => { calls.showcase.push(id); screen = 'game-detail'; };
    const before = JSON.stringify({ room, code: windowObject.currentRoomCode, host: windowObject.isHost });
    vm.runInNewContext(source, {
        window: windowObject, authToken: 'token', URLSearchParams,
        localStorage: { getItem: () => 'token' },
        document: { getElementById: id => id === 'screen-splash'
            ? { classList: { contains: () => splashActive } } : null },
        console: { log() {}, warn() {}, error: (...args) => calls.errors.push(args) }
    }, { filename: sourcePath });
    await windowObject.initApp({ initData: '', initDataUnsafe: { start_param: query ? undefined : startParam } });
    assert.deepEqual(calls.errors, [], 'Routing must not throw or show technical errors');
    assert.equal(JSON.stringify({ room: windowObject.APP_STATE.room,
        code: windowObject.currentRoomCode, host: windowObject.isHost }), before, 'Routing must preserve membership/host state');
    assert.equal(windowObject.pendingScheduledGameDeepLinkId, 123, 'Scheduled state remains untouched');
    assert.equal(calls.create.length, 0);
    return { calls, screen };
}

function assertReadOnly(calls) {
    assert.deepEqual(calls.join, []);
    assert.deepEqual(calls.leave, []);
    assert.deepEqual(calls.confirm, []);
}

async function run() {
    for (const query of [false, true]) {
        for (const status of ['no_room', 'in_room']) {
            for (const gameId of ['brainbattle', 'tictactoe_ultimate']) {
                const { calls, screen } = await route(`gameinfo_${gameId}`, { query, status, keepSplash: true });
                assert.deepEqual(calls.showcase, [gameId]);
                assertReadOnly(calls);
                assert.equal(screen, 'game-detail');
                assert.deepEqual(calls.screens, [], 'Neither hash routing nor splash failsafe overwrites game detail');
            }
            for (const startParam of ['gameinfo_unknown_game', 'gameinfo_', 'gameinfo_Brainbattle',
                'gameinfo_brain-battle', 'gameinfo_brainbattle<script>', 'gameinfo_brainbattle\n']) {
                const { calls, screen } = await route(startParam, { query, status });
                assert.deepEqual(calls.showcase, []);
                assertReadOnly(calls);
                assert.equal(screen, status === 'in_room' ? 'room' : 'lobby');
                assert.deepEqual(calls.screens, status === 'in_room' ? [] : ['lobby']);
            }
            for (const unavailable of [{ showcase: false }, { games: null }, { games: [] }]) {
                const { calls, screen } = await route('gameinfo_brainbattle', { query, status, ...unavailable });
                assertReadOnly(calls);
                assert.deepEqual(calls.showcase, []);
                assert.equal(screen, status === 'in_room' ? 'room' : 'lobby');
            }
        }
        for (const startParam of ['TEST42', 'room_TEST42']) {
            const { calls } = await route(startParam, { query });
            assert.deepEqual(calls.join, ['TEST42']);
            assert.deepEqual(calls.leave, []);
            const existing = await route(startParam, { query, status: 'in_room' });
            assert.equal(existing.calls.confirm.length, 1);
            await existing.calls.confirm[0][2]();
            assert.deepEqual(existing.calls.leave, [true]);
            assert.deepEqual(existing.calls.join, ['TEST42']);
        }
        for (const status of ['no_room', 'in_room']) {
            const { calls } = await route('scheduled_123', { query, status });
            assertReadOnly(calls);
            assert.deepEqual(calls.showcase, []);
        }
    }
    const current = await route('room_CURRENT', { status: 'in_room' });
    assertReadOnly(current.calls);
    console.log('Game-info deep-link smoke: PASS (Telegram/query, validation, read-only state, room/scheduled routes, failsafe)');
}

run().catch(error => { console.error(error); process.exitCode = 1; });
