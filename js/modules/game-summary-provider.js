/**
 * Shared post-game summary and Telegram sharing helpers.
 *
 * Game modules can register a provider:
 * GameSummaryProvider.register('game_id', {
 *   buildSummary(gameState, context) {
 *     return {
 *       gameId: 'game_id',
 *       gameTitle: 'Game title',
 *       participants: [{ id, name }],
 *       winner: { id, name, score },
 *       outcome: 'Short human result',
 *       awards: [{ iconClass: 'bi bi-trophy-fill', title, player }],
 *       shareText: 'Optional custom Telegram text',
 *       story: { mediaUrl, text } // optional public image/video URL for Telegram Story
 *     };
 *   },
 *   playAgain(gameState, context) {}
 * });
 */
(function () {
    const providers = new Map();
    const storyUrlCache = new Map();

    function escapeHtml(value) {
        if (typeof window.safeHTML === 'function') {
            return window.safeHTML(value);
        }
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function getInviteLink() {
        const roomCode = window.currentRoomCode || window.APP_STATE?.room?.code || '';
        return roomCode ? `https://t.me/mpartygamebot/app?startapp=${encodeURIComponent(roomCode)}` : window.location.href;
    }

    function getRoomPlayers() {
        return window.APP_STATE?.room?.players || [];
    }

    function normalizeParticipant(participant) {
        if (participant && typeof participant === 'object') {
            return {
                id: participant.id ?? participant.user_id ?? null,
                name: participant.name
                    || participant.display_name
                    || participant.custom_name
                    || participant.first_name
                    || 'Игрок'
            };
        }
        return { id: null, name: String(participant || 'Игрок') };
    }

    function normalizeWinner(winner) {
        if (!winner) return null;
        if (typeof winner === 'object') {
            return {
                id: winner.id ?? winner.user_id ?? null,
                name: winner.name
                    || winner.display_name
                    || winner.custom_name
                    || winner.first_name
                    || 'Победитель',
                score: winner.score ?? winner.points ?? null
            };
        }
        return { id: null, name: String(winner), score: null };
    }

    function normalizeAward(award) {
        const safeAward = award || {};
        return {
            iconClass: safeAward.iconClass || safeAward.icon_class || 'bi bi-award-fill',
            title: safeAward.title || 'Титул вечера',
            player: safeAward.player || safeAward.name || safeAward.text || '',
            text: safeAward.text || safeAward.player || safeAward.name || ''
        };
    }

    function normalizeStory(story) {
        if (!story || typeof story !== 'object') return null;
        const mediaUrl = story.mediaUrl || story.media_url || '';
        if (!mediaUrl) return null;
        return {
            mediaUrl,
            text: story.text || '',
            widgetLink: story.widgetLink || story.widget_link || null
        };
    }

    function getGameTitle(gameId) {
        const config = Array.isArray(window.AVAILABLE_GAMES)
            ? window.AVAILABLE_GAMES.find(game => game.id === gameId)
            : null;
        return config?.name || gameId || 'Party Games';
    }

    function normalizeSummary(summary) {
        const safeSummary = summary || {};
        const gameId = safeSummary.gameId || safeSummary.game_id || window.selectedGameId || 'game';
        const awards = Array.isArray(safeSummary.awards)
            ? safeSummary.awards.slice(0, 3).map(normalizeAward)
            : [];
        const participants = Array.isArray(safeSummary.participants)
            ? safeSummary.participants.slice(0, 8).map(normalizeParticipant)
            : getRoomPlayers().slice(0, 8).map(normalizeParticipant);

        return {
            gameId,
            gameTitle: safeSummary.gameTitle || safeSummary.game_title || getGameTitle(gameId),
            participants,
            winner: normalizeWinner(safeSummary.winner),
            outcome: safeSummary.outcome || '',
            awards,
            shareText: safeSummary.shareText || '',
            story: normalizeStory(safeSummary.story || safeSummary.storyShare),
            inviteLink: safeSummary.inviteLink || getInviteLink()
        };
    }

    function getStoryCacheKey(summary) {
        const data = normalizeSummary(summary);
        return JSON.stringify({
            gameId: data.gameId,
            gameTitle: data.gameTitle,
            winner: data.winner?.name || '',
            outcome: data.outcome || '',
            awards: data.awards.map(award => [award.title, award.player || award.text]),
            participants: data.participants.map(player => player.name)
        });
    }

    function getShareCardPayload(summary) {
        const data = normalizeSummary(summary);
        return {
            gameId: data.gameId,
            gameTitle: data.gameTitle,
            participants: data.participants,
            winner: data.winner,
            outcome: data.outcome,
            awards: data.awards,
            shareText: data.shareText,
            inviteLink: data.inviteLink
        };
    }

    function getProvider(gameId) {
        return providers.get(gameId || window.selectedGameId);
    }

    function register(gameId, provider) {
        if (!gameId || !provider) return false;
        const buildSummary = provider.buildSummary || provider.getSummary;
        if (typeof buildSummary !== 'function') return false;
        providers.set(gameId, {
            ...provider,
            buildSummary
        });
        return true;
    }

    function build(gameId, gameState, context = {}) {
        const provider = getProvider(gameId);
        if (!provider) {
            return normalizeSummary({
                gameId,
                gameTitle: getGameTitle(gameId),
                outcome: 'Матч завершён. Можно сразу собрать реванш.',
                participants: context.players || getRoomPlayers(),
                awards: []
            });
        }

        provider.lastState = gameState || {};
        provider.lastContext = context || {};
        return normalizeSummary(provider.buildSummary(gameState, {
            players: getRoomPlayers(),
            inviteLink: getInviteLink(),
            ...context
        }));
    }

    function render(summary, options = {}) {
        const data = normalizeSummary(summary);
        const awards = data.awards.length > 0
            ? data.awards.map((award) => `
                <div class="game-summary-award">
                    <span><i class="${escapeHtml(award.iconClass)}" aria-hidden="true"></i></span>
                    <div>
                        <div class="game-summary-award-title">${escapeHtml(award.title || 'Титул вечера')}</div>
                        <div class="game-summary-award-name">${escapeHtml(award.player || award.text || '')}</div>
                    </div>
                </div>
            `).join('')
            : '<div class="game-summary-empty">Сыграйте еще раунд, чтобы собрать титулы.</div>';

        const participantNames = data.participants.length > 0
            ? data.participants.map(p => escapeHtml(p.name || p)).join(', ')
            : 'Участники комнаты';

        const winnerName = data.winner?.name || data.winner || '';
        const playAgainLabel = options.playAgainLabel || 'Играть еще раз';
        const playAgainAction = options.playAgainAction || 'play-again';
        const shareLabel = options.shareLabel || 'Поделиться в Telegram';
        const canShareStory = Boolean(window.Telegram?.WebApp?.shareToStory);
        const previewTitle = winnerName ? `Победитель: ${winnerName}` : (data.outcome || 'Итог партии');
        const previewMeta = data.awards.length > 0
            ? `${data.awards.length} титула · ${data.participants.length || 0} игроков`
            : `${data.participants.length || 0} игроков · реванш в один тап`;

        return `
            <section class="game-summary-card" data-game-summary="${escapeHtml(data.gameId)}">
                <div class="game-summary-head">
                    <div class="game-summary-title-wrap">
                        <div class="game-summary-kicker">Итог для чата</div>
                        <div class="game-summary-title">${escapeHtml(data.gameTitle)}</div>
                    </div>
                    ${winnerName ? `<div class="game-summary-winner" title="${escapeHtml(winnerName)}"><i class="bi bi-trophy-fill" aria-hidden="true"></i><span class="game-summary-winner-name">${escapeHtml(winnerName)}</span></div>` : ''}
                </div>
                ${data.outcome ? `<div class="game-summary-outcome">${escapeHtml(data.outcome)}</div>` : ''}
                <div class="game-summary-participants"><i class="bi bi-people-fill" aria-hidden="true"></i>${participantNames}</div>
                <div class="game-summary-awards">${awards}</div>
                <div class="game-summary-share-preview" aria-label="Превью результата для Telegram">
                    <div class="game-summary-share-preview-icon">
                        <i class="bi bi-image-fill" aria-hidden="true"></i>
                    </div>
                    <div class="game-summary-share-preview-copy">
                        <div class="game-summary-share-preview-label">Карточка для Telegram</div>
                        <div class="game-summary-share-preview-title">${escapeHtml(previewTitle)}</div>
                        <div class="game-summary-share-preview-meta">${escapeHtml(previewMeta)}</div>
                    </div>
                </div>
                <div class="game-summary-actions">
                    <button class="btn btn-primary game-summary-btn" type="button" data-game-summary-action="share" data-game-id="${escapeHtml(data.gameId)}">
                        <i class="bi bi-telegram me-2"></i> ${escapeHtml(shareLabel)}
                    </button>
                    <button class="btn btn-outline-secondary game-summary-btn" type="button" data-game-summary-action="${escapeHtml(playAgainAction)}" data-game-id="${escapeHtml(data.gameId)}">
                        <i class="bi bi-arrow-repeat me-2"></i> ${escapeHtml(playAgainLabel)}
                    </button>
                    ${canShareStory ? `
                        <button class="btn btn-outline-secondary game-summary-btn" type="button" data-game-summary-action="share-story" data-game-id="${escapeHtml(data.gameId)}">
                            <i class="bi bi-camera-fill me-2"></i> В историю
                        </button>
                    ` : ''}
                </div>
            </section>
        `;
    }

    function formatShareText(summary) {
        const data = normalizeSummary(summary);
        const lines = [
            `${data.gameTitle}: итог игры`,
            data.winner?.name ? `Победитель: ${data.winner.name}` : '',
            data.outcome,
            ...data.awards.map(a => `${a.title || 'Титул'}: ${a.player || a.text || ''}`),
            '',
            'Заходи в следующий раунд:'
        ].filter(line => line !== null && line !== undefined);

        return data.shareText || lines.join('\n').trim();
    }

    function share(gameId, summaryOverride = null) {
        const provider = getProvider(gameId);
        const summary = summaryOverride || build(gameId, provider?.lastState || {}, provider?.lastContext || {});
        if (!summary) return;

        const text = formatShareText(summary);
        const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(summary.inviteLink)}&text=${encodeURIComponent(text)}`;

        if (window.Telegram?.WebApp?.openTelegramLink) {
            window.Telegram.WebApp.openTelegramLink(shareUrl);
        } else {
            window.open(shareUrl, '_blank');
        }
    }

    async function generateStoryMediaUrl(summary) {
        const data = normalizeSummary(summary);
        if (data.story?.mediaUrl) return data.story.mediaUrl;

        const cacheKey = getStoryCacheKey(data);
        if (storyUrlCache.has(cacheKey)) {
            return storyUrlCache.get(cacheKey);
        }

        if (typeof window.apiRequest !== 'function') {
            return '';
        }

        const response = await window.apiRequest({
            action: 'generate_share_card',
            summary: JSON.stringify(getShareCardPayload(data))
        });

        const mediaUrl = response?.status === 'ok' ? (response.media_url || response.mediaUrl || '') : '';
        if (mediaUrl) {
            storyUrlCache.set(cacheKey, mediaUrl);
        }
        return mediaUrl;
    }

    async function shareStory(gameId, summaryOverride = null) {
        const provider = getProvider(gameId);
        const summary = normalizeSummary(summaryOverride || build(gameId, provider?.lastState || {}, provider?.lastContext || {}));
        if (!window.Telegram?.WebApp?.shareToStory) {
            share(gameId, summary);
            return;
        }

        const mediaUrl = await generateStoryMediaUrl(summary);
        if (!mediaUrl) {
            share(gameId, summary);
            return;
        }

        const params = {
            text: summary.story?.text || formatShareText(summary)
        };

        if (summary.story?.widgetLink?.url) {
            params.widget_link = {
                url: summary.story.widgetLink.url,
                name: summary.story.widgetLink.name || 'Играть'
            };
        }

        window.Telegram.WebApp.shareToStory(mediaUrl, params);
    }

    function playAgain(gameId) {
        const provider = getProvider(gameId);
        if (provider && typeof provider.playAgain === 'function') {
            provider.playAgain(provider.lastState || {}, provider.lastContext || {});
            return;
        }
        if (typeof window.finishGameSession === 'function') window.finishGameSession();
    }

    function remember(gameId, gameState, context = {}) {
        const provider = getProvider(gameId);
        return build(gameId, gameState, context);
    }

    function mount(target, gameId, gameState, context = {}, options = {}) {
        const node = typeof target === 'string' ? document.querySelector(target) : target;
        if (!node) return null;
        const summary = remember(gameId, gameState, context);
        node.innerHTML = render(summary, options);
        return summary;
    }

    document.addEventListener('click', (event) => {
        const button = event.target?.closest?.('[data-game-summary-action]');
        if (!button) return;

        const action = button.dataset.gameSummaryAction;
        const gameId = button.dataset.gameId;

        if (action === 'share') {
            event.preventDefault();
            share(gameId);
        } else if (action === 'share-story') {
            event.preventDefault();
            button.disabled = true;
            const originalHtml = button.innerHTML;
            button.innerHTML = '<span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>Готовим';
            shareStory(gameId).finally(() => {
                button.disabled = false;
                button.innerHTML = originalHtml;
            });
        } else if (action === 'play-again') {
            event.preventDefault();
            playAgain(gameId);
        } else {
            const provider = getProvider(gameId);
            if (provider && typeof provider[action] === 'function') {
                event.preventDefault();
                provider[action](provider.lastState || {}, provider.lastContext || {});
            }
        }
    });

    window.GameSummaryProvider = {
        register,
        build,
        remember,
        mount,
        render,
        share,
        shareStory,
        playAgain,
        formatShareText
    };
})();
