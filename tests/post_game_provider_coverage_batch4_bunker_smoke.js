const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const players = [
    { id: 1, first_name: 'Анна' }, { id: 2, custom_name: 'Борис' },
    { id: 3, display_name: 'Вера' }, { id: 4, username: 'gleb' }
];
const finalState = {
    phase: 'outro', kicked_players: ['2', '4'], bunker_places: 2,
    catastrophe: { title: 'Ядерная война' },
    threat_results: [
        { title: 'Радиация', success: true },
        { title: 'Нехватка воды', success: false }
    ],
    players_cards: Object.fromEntries(players.map(player => [String(player.id), {
        condition: { data: { title: 'Испытание', win_text: 'Сохранил спокойствие', fail_text: 'Не прошёл' } }
    }]))
};
const plain = value => JSON.parse(JSON.stringify(value));

function setup(withProvider = true) {
    const calls = { finish: 0, ai: 0, stories: [], shares: [], registrations: [] };
    const window = {
        location: { href: 'https://example.test/' }, currentRoomCode: 'BUNKER42',
        Telegram: { WebApp: {
            initDataUnsafe: { user: { is_premium: true } },
            shareToStory: (...args) => calls.stories.push(args),
            openTelegramLink: url => calls.shares.push(url)
        } },
        apiRequest: () => ({ status: 'ok', media_url: 'https://example.test/bunker-card.png' }),
        bunkerFinish: () => calls.finish++,
        safeHTML: value => String(value ?? ''),
        addEventListener() {}
    };
    let clickHandler;
    const document = {
        addEventListener(event, handler) { if (event === 'click') clickHandler = handler; },
        getElementById() { return null; },
        createElement() { return { innerHTML: '', style: {}, classList: { add() {}, remove() {} } }; }
    };
    const context = vm.createContext({ window, document, console, setTimeout, clearTimeout, setInterval, clearInterval });
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
    load('js/games/bunker/ui.js');
    // Keep the actual outro renderer while isolating its pre-existing asynchronous AI side effect.
    context.fetchBunkerSummary = async () => { calls.ai++; };
    return {
        context, calls,
        render(state = finalState, isHost = true) {
            const wrapper = { innerHTML: '' };
            context.renderOutro(wrapper, state, { players, is_host: isHost });
            return wrapper.innerHTML;
        },
        click(action) {
            clickHandler({ target: { closest: () => ({
                dataset: { gameSummaryAction: action, gameId: 'bunker' }, disabled: false
            }) }, preventDefault() {} });
        }
    };
}

function build(runtime, state, selectedPlayers = players) {
    const beforeState = JSON.stringify(state);
    const beforePlayers = JSON.stringify(selectedPlayers);
    const result = runtime.context.GameSummaryProvider.build('bunker', state, { players: selectedPlayers });
    assert.equal(JSON.stringify(state), beforeState, 'Состояние игры не должно изменяться');
    assert.equal(JSON.stringify(selectedPlayers), beforePlayers, 'Список игроков не должен изменяться');
    assert.equal(result.gameId, 'bunker');
    assert.equal(result.gameTitle, runtime.context.AVAILABLE_GAMES.find(game => game.id === 'bunker').name);
    assert.equal(result.winner, null);
    assert.deepEqual(plain(result.participants), selectedPlayers.map(player => ({
        id: player.id, name: player.display_name || player.custom_name || player.first_name || player.username || 'Игрок'
    })));
    assert.ok(result.outcome);
    assert.ok(result.awards.length <= 3);
    return result;
}

async function run() {
    const runtime = setup();
    assert.deepEqual(runtime.calls.registrations, ['bunker']);
    assert.equal(typeof runtime.context.AIManager, 'undefined');
    const result = build(runtime, finalState);
    assert.equal(result.outcome, 'В бункере остались 2 из 4 игроков. Мест: 2.');
    assert.deepEqual(plain(result.awards.map(award => [award.title, award.player])), [
        ['Катастрофа', 'Ядерная война'], ['В бункере', '2 из 4 игроков'], ['Испытания', '1 из 2 преодолено']
    ]);
    assert.equal(result.winner, null);

    const allSurvive = build(runtime, { ...finalState, kicked_players: [] });
    assert.match(allSurvive.outcome, /4 из 4/);
    const noneSurvive = build(runtime, { ...finalState, kicked_players: players.map(player => player.id) });
    assert.match(noneSurvive.outcome, /0 из 4/);
    const unknownKicked = build(runtime, { ...finalState, kicked_players: ['999', '2'] });
    assert.match(unknownKicked.outcome, /3 из 4/);
    for (const kicked_players of [undefined, null, 'broken', {}]) {
        assert.match(build(runtime, { ...finalState, kicked_players }).outcome, /4 из 4/);
    }
    for (const threat_results of [undefined, [], {}, 'bad']) {
        const noThreats = build(runtime, { ...finalState, threat_results });
        assert.ok(noThreats.awards.every(award => award.title !== 'Испытания'));
    }
    const mixedThreats = build(runtime, { ...finalState, threat_results: [
        { success: true }, { success: 'true' }, { success: false }, { success: 1 }
    ] });
    assert.ok(mixedThreats.awards.some(award => award.title === 'Испытания' && award.player === '1 из 2 преодолено'));
    const noCatastrophe = build(runtime, { ...finalState, catastrophe: null });
    assert.ok(noCatastrophe.awards.every(award => award.title !== 'Катастрофа'));
    const noPlayers = build(runtime, { ...finalState }, []);
    assert.equal(noPlayers.participants.length, 0);
    assert.equal(noPlayers.outcome, 'История бункера завершена.');
    assert.equal(noPlayers.winner, null);

    const hostHtml = runtime.render(finalState, true);
    assert.match(hostHtml, /ИСТОРИЯ БУНКЕРА/);
    assert.match(hostHtml, /Выжило: 2/);
    assert.match(hostHtml, /Мест: 2/);
    assert.match(hostHtml, /bunker-ai-summary/);
    assert.match(hostHtml, /Радиация/);
    assert.match(hostHtml, /survivors-stories/);
    assert.match(hostHtml, /data-game-summary="bunker"/);
    assert.match(hostHtml, /В лобби/);
    assert.doesNotMatch(hostHtml, /onclick="window\.bunkerFinish\(event\)"/);
    assert.equal((hostHtml.match(/data-game-summary-action="finish-bunker"/g) || []).length, 1);
    runtime.click('finish-bunker');
    assert.equal(runtime.calls.finish, 1);
    assert.equal(runtime.calls.ai, 1);

    const guest = setup(true);
    const guestHtml = guest.render(finalState, false);
    assert.match(guestHtml, /ИСТОРИЯ БУНКЕРА/);
    assert.match(guestHtml, /data-game-summary="bunker"/);
    assert.match(guestHtml, /Выйти/);
    assert.doesNotMatch(guestHtml, /restart|play-again/);
    guest.click('finish-bunker');
    assert.equal(guest.calls.finish, 1);

    const fallbackHost = setup(false);
    const fallbackHostHtml = fallbackHost.render(finalState, true);
    assert.match(fallbackHostHtml, /onclick="window\.bunkerFinish\(event\)"[^>]*>↩️ В Лобби/);
    const fallbackGuest = setup(false);
    const fallbackGuestHtml = fallbackGuest.render(finalState, false);
    assert.match(fallbackGuestHtml, /onclick="window\.bunkerFinish\(event\)"[^>]*>Выйти/);

    await runtime.context.GameSummaryProvider.shareStory('bunker', result);
    const [media, params] = runtime.calls.stories[0];
    assert.equal(media, 'https://example.test/bunker-card.png');
    assert.equal(params.widget_link.name, 'Об игре');
    assert.equal(params.widget_link.url, 'https://t.me/mpartygamebot/app?startapp=gameinfo_bunker');
    runtime.context.GameSummaryProvider.share('bunker', result);
    assert.equal(new URL(runtime.calls.shares[0]).searchParams.get('url'), result.inviteLink);
    console.log('Проверка P3 Bunker provider: УСПЕХ (итоги, awards, outro, actions, fallback, Story и обычный share)');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
