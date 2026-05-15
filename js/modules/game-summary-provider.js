/**
 * Shared post-game summary and Telegram sharing helpers.
 *
 * Each game can register a provider with:
 * - buildSummary(gameState, context)
 * - playAgain(gameState, context)
 */
(function () {
    const providers = new Map();

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

    function normalizeSummary(summary) {
        const safeSummary = summary || {};
        const awards = Array.isArray(safeSummary.awards) ? safeSummary.awards.slice(0, 3) : [];
        const participants = Array.isArray(safeSummary.participants) ? safeSummary.participants.slice(0, 8) : [];

        return {
            gameId: safeSummary.gameId || window.selectedGameId || 'game',
            gameTitle: safeSummary.gameTitle || 'Party Games',
            participants,
            winner: safeSummary.winner || null,
            outcome: safeSummary.outcome || '',
            awards,
            shareText: safeSummary.shareText || '',
            inviteLink: safeSummary.inviteLink || getInviteLink()
        };
    }

    function getProvider(gameId) {
        return providers.get(gameId || window.selectedGameId);
    }

    function register(gameId, provider) {
        if (!gameId || !provider || typeof provider.buildSummary !== 'function') return;
        providers.set(gameId, provider);
    }

    function build(gameId, gameState, context = {}) {
        const provider = getProvider(gameId);
        if (!provider) return null;
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
                    <span>${escapeHtml(award.icon || '🏅')}</span>
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

        return `
            <section class="game-summary-card" data-game-summary="${escapeHtml(data.gameId)}">
                <div class="game-summary-kicker">Итог для чата</div>
                <div class="game-summary-title">${escapeHtml(data.gameTitle)}</div>
                ${winnerName ? `<div class="game-summary-winner">${escapeHtml(winnerName)}</div>` : ''}
                ${data.outcome ? `<div class="game-summary-outcome">${escapeHtml(data.outcome)}</div>` : ''}
                <div class="game-summary-participants">${participantNames}</div>
                <div class="game-summary-awards">${awards}</div>
                <div class="game-summary-actions">
                    <button class="btn btn-primary game-summary-btn" type="button" data-game-summary-action="share" data-game-id="${escapeHtml(data.gameId)}">
                        <i class="bi bi-telegram me-2"></i> Поделиться в Telegram
                    </button>
                    <button class="btn btn-outline-secondary game-summary-btn" type="button" data-game-summary-action="${escapeHtml(playAgainAction)}" data-game-id="${escapeHtml(data.gameId)}">
                        <i class="bi bi-arrow-repeat me-2"></i> ${escapeHtml(playAgainLabel)}
                    </button>
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
            ...data.awards.map(a => `${a.icon || '🏅'} ${a.title || 'Титул'}: ${a.player || a.text || ''}`),
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
        if (!provider) return null;
        provider.lastState = gameState || {};
        provider.lastContext = context || {};
        return build(gameId, gameState, context);
    }

    document.addEventListener('click', (event) => {
        const button = event.target?.closest?.('[data-game-summary-action]');
        if (!button) return;

        const action = button.dataset.gameSummaryAction;
        const gameId = button.dataset.gameId;

        if (action === 'share') {
            event.preventDefault();
            share(gameId);
        } else if (action === 'play-again') {
            event.preventDefault();
            playAgain(gameId);
        }
    });

    window.GameSummaryProvider = {
        register,
        build,
        remember,
        render,
        share,
        playAgain,
        formatShareText
    };
})();
