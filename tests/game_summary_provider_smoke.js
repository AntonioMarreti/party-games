const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const sourcePath = path.join(__dirname, '../js/modules/game-summary-provider.js');
const source = fs.readFileSync(sourcePath, 'utf8');
const mediaUrl = 'https://example.test/result.png';
const summary = {
    gameId: 'test',
    gameTitle: 'Тест',
    winner: { name: 'Анна' },
    outcome: 'Матч завершён',
    inviteLink: 'https://t.me/mpartygamebot/app?startapp=TEST',
    shareText: 'Итог игры: Анна победила!'
};

function setup({ apiRequest, storyCall, storyAvailable = true, telegramLink = true } = {}) {
    const shares = [];
    const stories = [];
    const requests = [];
    let click;
    const windowObject = {
        location: { href: 'https://example.test/' },
        currentRoomCode: 'TEST',
        Telegram: { WebApp: {} },
        open: (...args) => shares.push(args),
        apiRequest: request => {
            requests.push(request);
            return apiRequest ? apiRequest(request) : { status: 'ok', media_url: mediaUrl };
        }
    };
    if (telegramLink) {
        windowObject.Telegram.WebApp.openTelegramLink = url => shares.push([url]);
    }
    if (storyAvailable) {
        windowObject.Telegram.WebApp.shareToStory = (...args) => {
            stories.push(args);
            return storyCall?.(...args);
        };
    }
    vm.runInNewContext(source, {
        window: windowObject,
        document: { addEventListener: (event, handler) => { click = handler; } }
    }, { filename: sourcePath });
    return { provider: windowObject.GameSummaryProvider, shares, stories, requests, click };
}

function assertFallback(runtime, expectedSummary = summary) {
    assert.equal(runtime.shares.length, 1, 'One Story attempt must open normal share exactly once');
    const url = new URL(runtime.shares[0][0]);
    assert.equal(url.origin + url.pathname, 'https://t.me/share/url');
    assert.equal(url.searchParams.get('url'), expectedSummary.inviteLink);
    assert.equal(url.searchParams.get('text'), runtime.provider.formatShareText(expectedSummary));
}

const failureCases = [
    ['missing Story API', { storyAvailable: false }, 0],
    ['generation error response', { apiRequest: () => ({ status: 'error', media_url: mediaUrl }) }, 0],
    ['empty media', { apiRequest: () => ({ status: 'ok', media_url: '' }) }, 0],
    ['generation throws', { apiRequest: () => { throw new Error('generation'); } }, 0],
    ['generation rejects', { apiRequest: () => Promise.reject(new Error('generation')) }, 0],
    ['Story throws', { storyCall: () => { throw new Error('Story'); } }, 1],
    ['Story Promise rejects', { storyCall: () => Promise.reject(new Error('Story')) }, 1],
    ['Story thenable rejects', { storyCall: () => ({ then(resolve, reject) { reject(new Error('Story')); } }) }, 1]
];

async function run() {
    for (const [name, options, storyCount] of failureCases) {
        const runtime = setup(options);
        await runtime.provider.shareStory('test', summary);
        assertFallback(runtime);
        assert.equal(runtime.stories.length, storyCount, name);
        if (options.storyAvailable === false) {
            assert.equal(runtime.requests.length, 0);
        }
    }

    for (const storyCall of [
        () => undefined,
        () => Promise.resolve(),
        () => ({ then(resolve) { resolve(); } }),
        () => false // A non-error return must not be interpreted as cancellation/failure.
    ]) {
        const runtime = setup({ storyCall });
        const withStory = {
            ...summary,
            story: { mediaUrl, text: 'Итог для истории', widget_link: { url: summary.inviteLink, name: 'Реванш' } }
        };
        await runtime.provider.shareStory('test', withStory);
        assert.equal(runtime.shares.length, 0);
        assert.equal(runtime.requests.length, 0, 'Provider media must bypass generation');
        assert.equal(runtime.stories.length, 1);
        assert.equal(runtime.stories[0][0], mediaUrl);
        assert.deepEqual(JSON.parse(JSON.stringify(runtime.stories[0][1])), {
            text: 'Итог для истории',
            widget_link: { url: summary.inviteLink, name: 'Реванш' }
        });
    }

    const generated = setup();
    await generated.provider.shareStory('test', summary);
    await generated.provider.shareStory('test', summary);
    assert.equal(generated.requests.length, 1, 'Successful generated media must remain cached');
    assert.equal(generated.requests[0].action, 'generate_share_card');
    assert.equal(JSON.parse(generated.requests[0].summary).inviteLink, summary.inviteLink);
    assert.equal(generated.stories.length, 2);
    assert.equal(generated.stories[0][0], mediaUrl);
    assert.equal(generated.stories[0][1].text, summary.shareText);
    assert.equal(generated.stories[0][1].widget_link, undefined, 'Do not derive Story widget_link from inviteLink');
    assert.equal(generated.shares.length, 0);

    for (const failedGeneration of [
        () => { throw new Error('generation'); },
        () => Promise.reject(new Error('generation')),
        () => ({ status: 'error' }),
        () => ({ status: 'ok', media_url: '' })
    ]) {
        let attempts = 0;
        const runtime = setup({ apiRequest: () => ++attempts === 1
            ? failedGeneration() : { status: 'ok', media_url: mediaUrl } });
        await runtime.provider.shareStory('test', summary);
        await runtime.provider.shareStory('test', summary);
        await runtime.provider.shareStory('test', summary);
        assert.equal(attempts, 2, 'Failed generation must be retried; successful URL must be cached');
        assertFallback(runtime);
        assert.equal(runtime.stories.length, 2);
    }

    const browserFallback = setup({ storyAvailable: false, telegramLink: false });
    const defaultTextSummary = { ...summary, shareText: '' };
    await browserFallback.provider.shareStory('test', defaultTextSummary);
    assertFallback(browserFallback, defaultTextSummary);
    assert.equal(browserFallback.shares[0][1], '_blank');

    const unhandled = [];
    const onUnhandled = error => unhandled.push(error);
    process.on('unhandledRejection', onUnhandled);
    try {
        for (const [name, options, storyCount] of failureCases) {
            const runtime = setup(options);
            runtime.provider.register('test', { buildSummary: () => summary });
            const button = {
                dataset: { gameSummaryAction: 'share-story', gameId: 'test' },
                disabled: false,
                innerHTML: 'В историю'
            };
            runtime.click({ target: { closest: () => button }, preventDefault() {} });
            assert.equal(button.disabled, true, name);
            assert.match(button.innerHTML, /Готовим/);
            await new Promise(resolve => setImmediate(resolve));
            assert.equal(button.disabled, false, name);
            assert.equal(button.innerHTML, 'В историю', name);
            assertFallback(runtime);
            assert.equal(runtime.stories.length, storyCount, name);
        }
        assert.deepEqual(unhandled, [], 'Story errors must not cause unhandled rejection in the click handler');
    } finally {
        process.removeListener('unhandledRejection', onUnhandled);
    }
    console.log('GameSummaryProvider smoke: PASS (fallbacks, success, payload, cache, loading state)');
}

run().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
