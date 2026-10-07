const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function setup(withProvider = true) {
    const content = { innerHTML: '' };
    const overlay = { innerHTML: '' };
    const wrapper = { querySelector: () => overlay };
    const shell = { querySelector: () => content, classList: { toggle() {} } };
    const elements = { 'game-area': {}, 'wcp-shell': shell, 'ms-wrapper': wrapper, 'ms-toggle-board-btn': {} };
    const handlers = {};
    const calls = { actions: [], shares: [], stories: [], submissions: [], registrations: [] };
    const window = {
        currentRoomCode: 'TEST42', location: { href: 'https://example.test/' },
        currentUser: { id: 1 },
        Telegram: { WebApp: {
            initDataUnsafe: { user: { is_premium: true } },
            shareToStory: (...args) => calls.stories.push(args),
            openTelegramLink: url => calls.shares.push(url)
        } },
        apiRequest: () => ({ status: 'ok', media_url: 'https://example.test/card.png' }),
        sendGameAction: async type => { calls.actions.push(type); return { status: 'ok' }; },
        leaveRoom: () => calls.actions.push('leave'),
        minesweeperStartGame: () => calls.actions.push('ms-restart'),
        minesweeperFinish: () => calls.actions.push('ms-lobby'),
        safeHTML: value => value,
        submitGameResults: results => calls.submissions.push(results)
    };
    const context = vm.createContext({ window, console, clearInterval, document: {
        getElementById: id => elements[id] || null,
        querySelector: () => null,
        addEventListener: (event, handler) => { handlers[event] = handler; },
        createElement: () => ({ set textContent(value) { this.innerHTML = value; } })
    } });
    const load = file => vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context, { filename: file });
    load('js/config/games-config.js');
    if (withProvider) {
        load('js/modules/game-summary-provider.js');
        const register = window.GameSummaryProvider.register;
        window.GameSummaryProvider.register = (id, provider) => {
            calls.registrations.push(id);
            return register(id, provider);
        };
    }
    load('js/games/wordclash_party/ui.js');
    load('js/games/minesweeper/ui.js');
    // The finished branch still runs the real results renderer; board gameplay is outside this smoke.
    vm.runInContext('renderMsBoard = function () {};', context);
    return { window, calls, content, overlay, handlers };
}

const players = [
    { id: 1, display_name: 'Анна', custom_name: 'Ignored', first_name: 'Ignored' },
    { id: 2, custom_name: 'Борис', first_name: 'Ignored' },
    { id: 3, first_name: 'Вера' },
    { id: 4, username: 'delta' },
    { id: 5 }
];
const plain = value => JSON.parse(JSON.stringify(value));
const wcpId = 'wordclash_party';
const msId = 'minesweeper_br';

function checkSummary(runtime, id, state, selectedPlayers = players) {
    const snapshot = JSON.stringify(state);
    const summary = runtime.window.GameSummaryProvider.remember(id, state, { players: selectedPlayers, isHost: true });
    assert.equal(JSON.stringify(state), snapshot, 'Providers must not mutate authoritative state');
    assert.equal(summary.gameId, id);
    assert.equal(summary.gameTitle, runtime.window.AVAILABLE_GAMES.find(game => game.id === id).name);
    assert.deepEqual(plain(summary.participants), selectedPlayers.map(player => ({
        id: player.id, name: player.display_name || player.custom_name || player.first_name || player.username || 'Игрок'
    })));
    assert.ok(summary.outcome);
    assert.ok(summary.awards.length <= 3);
    assert.equal(summary.story, null, 'Provider delegates Story payload to the shared implementation');
    assert.equal(summary.inviteLink, 'https://t.me/mpartygamebot/app?startapp=TEST42');
    return summary;
}

async function run() {
    const runtime = setup();
    assert.deepEqual(runtime.calls.registrations, [wcpId, msId]);
    const wcpState = { phase: 'game_over', scores: { 1: 50, 2: 30, 3: 20, 4: 10, 5: 0 }, secret_word: 'СЕКРЕТ' };
    const wcp = checkSummary(runtime, wcpId, wcpState);
    assert.deepEqual(plain(wcp.winner), { id: 1, name: 'Анна', score: 50 });
    assert.match(wcp.outcome, /50/);
    assert.doesNotMatch(JSON.stringify(wcp), /СЕКРЕТ/);
    assert.deepEqual(plain(wcp.awards.map(award => award.title)), ['Лучший результат', '2 место', '3 место']);
    const tied = checkSummary(runtime, wcpId, { scores: { 1: 50, 2: 50, 3: 20 } });
    assert.equal(tied.winner, null);
    assert.match(tied.outcome, /Равный лучший результат/);
    assert.deepEqual(plain(tied.awards.map(award => award.title)), ['1 место', '1 место', '3 место']);
    for (const scores of [{}, null, [], 'broken', { 1: 'bad', 2: null, 3: Infinity }]) {
        const empty = checkSummary(runtime, wcpId, { scores });
        assert.equal(empty.winner, null);
        assert.equal(empty.awards.length, 0);
    }

    // Final ranks, rather than raw scores or array order, determine the result.
    const msState = { status: 'finished', gameResults: [
        { user_id: '2', score: 12, rank: 2 }, { user_id: 1, score: 7, rank: 1 },
        { user_id: 3, score: 3, rank: 3 }, { user_id: 4, score: 1, rank: 4 }
    ], scores: { 2: 999 }, history: [] };
    const ms = checkSummary(runtime, msId, msState);
    assert.deepEqual(plain(ms.winner), { id: 1, name: 'Анна', score: 7 });
    assert.deepEqual(plain(ms.awards.map(award => award.title)), ['Лучший результат', '2 место', '3 место']);
    const msTie = checkSummary(runtime, msId, { gameResults: [
        { user_id: 1, rank: 1, score: 7 }, { user_id: 2, rank: 1, score: 7 }
    ] });
    assert.equal(msTie.winner, null);
    assert.match(msTie.outcome, /разделили 1 место/);
    assert.ok(msTie.awards.every(award => award.title === '1 место'));
    const soloState = { status: 'finished', gameResults: [{ user_id: 1, rank: 1, score: 9 }], history: [] };
    assert.deepEqual(plain(checkSummary(runtime, msId, soloState, [players[0]]).winner), { id: 1, name: 'Анна', score: 9 });
    const loss = checkSummary(runtime, msId, { ...soloState, history: [{ type: 'mine_hit_solo' }] }, [players[0]]);
    assert.equal(loss.winner, null);
    assert.match(loss.outcome, /Поражение.*мине/);
    assert.equal(loss.awards.length, 0);
    runtime.window._msTimerVal = '123:45';
    assert.doesNotMatch(JSON.stringify(checkSummary(runtime, msId, soloState, [players[0]])), /123:45/);
    for (const gameResults of [undefined, [], {}, [{ user_id: 1, rank: 'broken', score: 9 }]]) {
        assert.equal(checkSummary(runtime, msId, { gameResults }).winner, null);
    }

    for (const host of [true, false]) {
        runtime.window.renderWordClashParty({ game_state: wcpState, players, is_host: host,
            user: { id: host ? 1 : 2 }, room: { host_user_id: 1 } });
        assert.match(runtime.content.innerHTML, /wcp-result-hero/);
        assert.match(runtime.content.innerHTML, /wcp-scoreboard/);
        assert.match(runtime.content.innerHTML, /data-game-summary="wordclash_party"/);
        assert.doesNotMatch(runtime.content.innerHTML, /onclick="window.wcp(RestartGame|BackToLobby)/);
        assert.equal((runtime.content.innerHTML.match(/data-game-summary-action="play-again"/g) || []).length, 1);
        assert.equal((runtime.content.innerHTML.match(/data-game-summary-action="return-to-room"/g) || []).length, host ? 1 : 0);
        runtime.window.GameSummaryProvider.playAgain(wcpId);
        assert.equal(runtime.calls.actions.at(-1), host ? 'restart_game' : 'leave');
        if (host) {
            runtime.handlers.click({ target: { closest: () => ({ dataset: { gameSummaryAction: 'return-to-room', gameId: wcpId } }) }, preventDefault() {} });
            assert.equal(runtime.calls.actions.at(-1), 'back_to_lobby');
        }
    }
    runtime.window.render_minesweeper_br({ user: { id: 1 }, room: { game_state: JSON.stringify(msState), players } });
    assert.match(runtime.overlay.innerHTML, /data-game-summary="minesweeper_br"/);
    assert.doesNotMatch(runtime.overlay.innerHTML, /onclick="minesweeper(StartGame|Finish)/);
    assert.equal((runtime.overlay.innerHTML.match(/data-game-summary-action="play-again"/g) || []).length, 1);
    assert.equal((runtime.overlay.innerHTML.match(/data-game-summary-action="return-to-room"/g) || []).length, 1);
    assert.deepEqual(plain(runtime.calls.submissions[0]).map(({ user_id, score, rank }) => ({ user_id, score, rank })), msState.gameResults);
    runtime.window.GameSummaryProvider.playAgain(msId);
    assert.equal(runtime.calls.actions.at(-1), 'ms-restart');
    runtime.handlers.click({ target: { closest: () => ({ dataset: { gameSummaryAction: 'return-to-room', gameId: msId } }) }, preventDefault() {} });
    assert.equal(runtime.calls.actions.at(-1), 'ms-lobby');

    for (const [id, state] of [[wcpId, wcpState], [msId, msState]]) {
        const summary = checkSummary(runtime, id, state);
        await runtime.window.GameSummaryProvider.shareStory(id, summary);
        const [media, params] = runtime.calls.stories.at(-1);
        assert.equal(media, 'https://example.test/card.png');
        assert.equal(params.widget_link.url, `https://t.me/mpartygamebot/app?startapp=gameinfo_${id}`);
        assert.equal(params.widget_link.name, 'Об игре');
        runtime.window.GameSummaryProvider.share(id, summary);
        assert.equal(new URL(runtime.calls.shares.at(-1)).searchParams.get('url'), summary.inviteLink);
    }
    const fallback = setup(false);
    fallback.window.renderWordClashParty({ game_state: wcpState, players, is_host: true, user: { id: 1 }, room: { host_user_id: 1 } });
    assert.match(fallback.content.innerHTML, /onclick="window.wcpRestartGame\(\)"/);
    assert.match(fallback.content.innerHTML, /onclick="window.wcpBackToLobby\(\)"/);
    fallback.window.render_minesweeper_br({ user: { id: 1 }, room: { game_state: JSON.stringify(msState), players } });
    assert.match(fallback.overlay.innerHTML, /onclick="minesweeperStartGame\(\)"/);
    assert.match(fallback.overlay.innerHTML, /onclick="minesweeperFinish\(\)"/);
    console.log('Post-game provider coverage smoke: PASS (registrations, results/ties/loss, UI/actions/fallback, Story CTA, normal share)');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
