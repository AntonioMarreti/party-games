const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const players = [
    { id: 1, first_name: 'Анна' },
    { id: 2, custom_name: 'Борис' },
    { id: 3, username: 'vera' }
];
const baseState = { phase: 'results', winner: 'spy', spy_id: 2, location: 'Больница' };
const plain = value => JSON.parse(JSON.stringify(value));

function setup(withProvider = true, isHost = true) {
    const nodes = new Map();
    nodes.set('spyGuessModal', { style: {} });
    const calls = { finish: 0, stories: [], shares: [], registrations: [] };
    const makeNode = () => ({ innerHTML: '', innerText: '', textContent: '', className: '', style: {}, dataset: {} });
    const container = {
        innerHTML: '',
        appendChild(node) { if (node.id) nodes.set(node.id, node); }
    };
    const window = {
        location: { href: 'https://example.test/' }, currentRoomCode: 'ROOM42',
        Telegram: { WebApp: {
            initDataUnsafe: { user: { is_premium: true } },
            shareToStory: (...args) => calls.stories.push(args),
            openTelegramLink: url => calls.shares.push(url)
        } },
        apiRequest: () => ({ status: 'ok', media_url: 'https://example.test/spyfall-card.png' }),
        spyfallFinish: () => calls.finish++,
        safeHTML: value => String(value ?? ''),
        addEventListener() {}
    };
    let clickHandler;
    const document = {
        addEventListener(event, handler) { if (event === 'click') clickHandler = handler; },
        getElementById(id) {
            if (id === 'game-area') return container;
            if (id === 'spyfall-wrapper') return nodes.get(id) || null;
            return nodes.get(id) || null;
        },
        createElement() {
            const node = makeNode();
            Object.defineProperty(node, 'innerHTML', {
                get() { return this._innerHTML || ''; },
                set(value) {
                    this._innerHTML = value;
                    for (const [, id] of String(value).matchAll(/\bid="([^"]+)"/g)) nodes.set(id, makeNode());
                }
            });
            return node;
        }
    };
    const context = vm.createContext({ window, document, console, URLSearchParams, setTimeout, clearTimeout });
    context.window = context;
    Object.assign(context, window);
    const load = file => vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context, { filename: file });
    load('js/config/games-config.js');
    if (withProvider) {
        load('js/modules/game-summary-provider.js');
        const register = context.GameSummaryProvider.register;
        context.GameSummaryProvider.register = (id, provider) => {
            calls.registrations.push(id);
            return register(id, provider);
        };
    }
    load('js/games/spyfall/ui.js');
    return {
        context, calls, nodes,
        render(state = baseState, host = isHost) {
            context.render_spyfall({
                room: { game_state: JSON.stringify(state) },
                user: { id: 1 }, is_host: host, players
            });
        },
        click(action) {
            clickHandler({ target: { closest: () => ({
                dataset: { gameSummaryAction: action, gameId: 'spyfall' },
                innerHTML: 'Action', disabled: false
            }) }, preventDefault() {} });
        }
    };
}

function build(runtime, state, selectedPlayers = players) {
    const originalState = JSON.stringify(state);
    const originalPlayers = JSON.stringify(selectedPlayers);
    const result = runtime.context.GameSummaryProvider.build('spyfall', state, { players: selectedPlayers });
    assert.equal(JSON.stringify(state), originalState);
    assert.equal(JSON.stringify(selectedPlayers), originalPlayers);
    assert.equal(result.gameId, 'spyfall');
    assert.equal(result.gameTitle, runtime.context.AVAILABLE_GAMES.find(game => game.id === 'spyfall').name);
    assert.deepEqual(plain(result.participants), selectedPlayers.map(player => ({
        id: player.id, name: player.display_name || player.custom_name || player.first_name || player.username || 'Игрок'
    })));
    assert.ok(result.outcome);
    assert.ok(result.awards.length <= 2);
    return result;
}

async function run() {
    const runtime = setup();
    assert.deepEqual(runtime.calls.registrations, ['spyfall']);
    const spyWin = build(runtime, baseState);
    assert.deepEqual(plain(spyWin.winner), { id: 2, name: 'Борис', score: null });
    assert.match(spyWin.outcome, /Шпион Борис победил/);
    assert.deepEqual(plain(spyWin.awards), [
        { iconClass: 'bi bi-award-fill', title: 'Шпион', player: 'Борис', text: 'Борис' },
        { iconClass: 'bi bi-award-fill', title: 'Локация', player: 'Больница', text: 'Больница' }
    ]);
    assert.equal(spyWin.participants.length, 3);
    const locals = build(runtime, { ...baseState, winner: 'locals' });
    assert.equal(locals.winner, null);
    assert.match(locals.outcome, /Местные жители победили\. Шпион — Борис/);
    const invalid = [null, undefined, 'broken'];
    for (const winner of invalid) {
        const result = build(runtime, { phase: 'results', winner, spy_id: 2, location: 'Больница' });
        assert.equal(result.winner, null);
        assert.equal(result.outcome, 'Раунд завершён.');
    }
    const missingSpy = build(runtime, { ...baseState, spy_id: 99 });
    assert.equal(missingSpy.winner, null);
    assert.equal(missingSpy.outcome, 'Шпион победил.');
    assert.deepEqual(plain(missingSpy.awards), [
        { iconClass: 'bi bi-award-fill', title: 'Локация', player: 'Больница', text: 'Больница' }
    ]);
    for (const location of [null, '']) {
        const result = build(runtime, { ...baseState, location });
        assert.ok(result);
        assert.ok(result.awards.every(award => award.title !== 'Локация'));
    }

    // Pre-results skeletons never include the shared summary.
    for (const phase of ['setup', 'playing']) {
        const wrapper = { innerHTML: '' };
        runtime.context.buildSpyfallSkeleton({ phase }, wrapper, false, { players });
        assert.doesNotMatch(wrapper.innerHTML, /data-game-summary="spyfall"/);
    }

    const host = setup(true, true);
    host.render();
    const hostHtml = host.nodes.get('spyfall-wrapper').innerHTML;
    assert.match(hostHtml, /spyfall-result-title/);
    assert.match(hostHtml, /spyfall-result-spy/);
    assert.match(hostHtml, /spyfall-result-loc/);
    assert.match(hostHtml, /data-game-summary="spyfall"/);
    assert.match(hostHtml, /Вернуться в лобби/);
    assert.doesNotMatch(hostHtml, /onclick="window\.spyfallFinish\(\)"/);
    assert.equal((hostHtml.match(/data-game-summary-action="return-to-room"/g) || []).length, 1);
    host.click('return-to-room');
    assert.equal(host.calls.finish, 1);

    const guest = setup(true, false);
    guest.render(baseState, false);
    const guestHtml = guest.nodes.get('spyfall-wrapper').innerHTML;
    assert.match(guestHtml, /spyfall-result-title/);
    assert.match(guestHtml, /data-game-summary="spyfall"/);
    assert.match(guestHtml, /Ждём хоста\.\.\./);
    assert.match(guestHtml, /data-game-summary-action="return-to-room"[^>]*disabled/);
    assert.doesNotMatch(guestHtml, /restart|leave-room/);
    assert.equal(guest.calls.finish, 0);

    const fallbackHost = setup(false, true);
    fallbackHost.render();
    assert.match(fallbackHost.nodes.get('spyfall-wrapper').innerHTML, /onclick="window\.spyfallFinish\(\)"/);
    const fallbackGuest = setup(false, false);
    fallbackGuest.render(baseState, false);
    assert.match(fallbackGuest.nodes.get('spyfall-wrapper').innerHTML, /Ждем хоста\.\.\./);

    await host.context.GameSummaryProvider.shareStory('spyfall', spyWin);
    const [media, params] = host.calls.stories[0];
    assert.equal(media, 'https://example.test/spyfall-card.png');
    assert.equal(params.widget_link.name, 'Об игре');
    assert.equal(params.widget_link.url, 'https://t.me/mpartygamebot/app?startapp=gameinfo_spyfall');
    host.context.GameSummaryProvider.share('spyfall', spyWin);
    assert.equal(new URL(host.calls.shares[0]).searchParams.get('url'), spyWin.inviteLink);
    console.log('Spyfall provider coverage smoke: PASS (team/winner semantics, final UI, host mapping, fallbacks, P3 sharing)');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
