/**
 * Scheduled game invite sharing.
 *
 * Keeps the existing scheduled-game lifecycle untouched: this module only adds
 * a host-only “Пригласить” action after a card is rendered. The shared link
 * reuses the existing scheduled_<id> deep-link flow.
 */
(function () {
    const BOT_USERNAME = 'mpartygamebot';
    const CARD_SELECTOR = '.scheduled-game-card[data-scheduled-game-id]';

    function getScheduledInviteLink(scheduledGameId) {
        return `https://t.me/${BOT_USERNAME}/app?startapp=scheduled_${encodeURIComponent(scheduledGameId)}`;
    }

    function getCardText(card, selector) {
        return String(card.querySelector(selector)?.textContent || '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function isHostCard(card) {
        return Boolean(card.querySelector(
            '[onclick^="openScheduledGame("], [onclick^="editScheduledGame("], [onclick^="cancelScheduledGame("]'
        ));
    }

    function getInviteText(card) {
        const title = getCardText(card, '.scheduled-game-title') || 'Игра в Party Games';
        const date = getCardText(card, '.scheduled-game-meta-line span:first-child');
        const gameName = getCardText(card, '.scheduled-game-meta-line span:nth-child(2)');
        const details = [gameName, date].filter(Boolean).join(' · ');

        return [
            `Собираю игру «${title}»${details ? ` — ${details}` : ''}`,
            '',
            'Записывайся и заходи в Party Games 👇'
        ].join('\n');
    }

    function shareScheduledGameInvite(card) {
        const scheduledGameId = Number(card?.dataset?.scheduledGameId || 0);
        if (!scheduledGameId) return;

        const inviteLink = getScheduledInviteLink(scheduledGameId);
        const shareText = getInviteText(card);
        const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(inviteLink)}&text=${encodeURIComponent(shareText)}`;

        if (window.Telegram?.WebApp?.openTelegramLink) {
            window.Telegram.WebApp.openTelegramLink(shareUrl);
            return;
        }

        window.open(shareUrl, '_blank', 'noopener');
    }

    function addInviteAction(card) {
        if (!card || card.dataset.scheduledInviteEnhanced === 'true' || !isHostCard(card)) return;

        const scheduledGameId = Number(card.dataset.scheduledGameId || 0);
        const actions = card.querySelector('.scheduled-game-actions');
        if (!scheduledGameId || !actions) return;

        card.dataset.scheduledInviteEnhanced = 'true';

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn btn-sm btn-outline-primary rounded-pill px-3';
        button.dataset.scheduledInviteAction = 'true';
        button.setAttribute('aria-label', 'Пригласить игроков');
        button.innerHTML = '<i class="bi bi-send me-1" aria-hidden="true"></i>Пригласить';
        button.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            shareScheduledGameInvite(card);
        });

        const firstSecondaryButton = actions.querySelector('.btn-outline-primary, .btn-outline-danger');
        if (firstSecondaryButton) {
            actions.insertBefore(button, firstSecondaryButton);
        } else {
            actions.appendChild(button);
        }
    }

    function enhanceScheduledGameCards() {
        document.querySelectorAll(CARD_SELECTOR).forEach(addInviteAction);
    }

    function start() {
        const list = document.getElementById('scheduled-games-list');
        if (!list) return;

        enhanceScheduledGameCards();
        const observer = new MutationObserver(enhanceScheduledGameCards);
        observer.observe(list, { childList: true, subtree: true });
    }

    window.shareScheduledGameInvite = shareScheduledGameInvite;
    document.addEventListener('DOMContentLoaded', start);
})();
