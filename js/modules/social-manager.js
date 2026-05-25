/**
 * Social Manager Module
 * Handles friends, leaderboards, user profiles, and stats fetching.
 */

// === STATE ===
let cachedUserStats = null;
let cachedDailyTasks = [];
let cachedAllAchievements = null;
let profileDailyExpanded = false;
let profileDailyShowAll = false;
let dailyTaskClaimInFlight = null;
let rewardsView = 'overview';
let rewardsAchievementFilter = 'all';

// === USER PROFILES & STATS ===

async function loadMyProfileStats() {
    if (typeof window.apiRequest !== 'function') return;
    if (!window.globalUser) return;

    try {
        // We need achievements count, so we must fetch full stats
        const res = await window.apiRequest({ action: 'get_stats', user_id: window.globalUser.id });
        if (res.status !== 'ok') return;

        const stats = res.stats || {};
        cachedUserStats = stats;

        // Update Main View Counts
        if (window.safeText) {
            window.safeText('profile-stat-wins', stats.total_wins || 0);
            window.safeText('profile-stat-xp', (stats.total_points_earned || 0));
            window.safeText('profile-stat-achievements', (stats.achievements || []).length);
        }

        // Ensure Level is sync
        const xp = stats.total_points_earned || 0;
        const lvl = typeof window.calculateLevel === 'function' ? window.calculateLevel(xp) : 1;
        const progress = getLevelProgress(xp, lvl);
        if (window.safeText) {
            window.safeText('profile-level-badge', lvl);
            window.safeText('profile-level-text', 'Уровень ' + lvl);
            window.safeText('profile-xp-text', xp + ' XP');
        }
        const profileProgress = document.getElementById('profile-xp-progress');
        if (profileProgress) profileProgress.style.width = progress.percent + '%';
    } catch (err) {
        console.warn('Profile Stats Error:', err);
    }

    loadProfileDailyTasks();
}

function getLevelProgress(xp, level) {
    const safeXp = Math.max(0, Number(xp) || 0);
    const safeLevel = Math.max(1, Number(level) || 1);
    const prevThreshold = Math.pow(safeLevel - 1, 2) * 100;
    const nextThreshold = Math.pow(safeLevel, 2) * 100;
    const span = Math.max(1, nextThreshold - prevThreshold);
    const percent = Math.min(100, Math.max(0, ((safeXp - prevThreshold) / span) * 100));
    return { prevThreshold, nextThreshold, percent };
}

function escapeProfileHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    }[char]));
}

async function loadProfileDailyTasks() {
    const card = document.getElementById('profile-daily-card');
    const list = document.getElementById('profile-daily-list');
    const summary = document.getElementById('profile-daily-summary');
    if (!card || !list || typeof window.apiRequest !== 'function') return;

    try {
        card.style.display = 'block';
        if (summary) summary.textContent = 'Загружаем...';

        await fetchDailyTasks();
        renderProfileDailyTasks();
    } catch (err) {
        console.warn('Daily Tasks Error:', err);
        card.style.display = 'block';
        card.classList.remove('expanded');
        cachedDailyTasks = [];
        if (summary) summary.textContent = 'Задания временно недоступны';
        const chip = document.getElementById('profile-daily-reward-chip');
        const toggle = document.getElementById('profile-daily-toggle');
        const head = document.getElementById('profile-daily-head');
        const expandedWrap = document.getElementById('profile-daily-expanded-wrap');
        if (chip) chip.style.display = 'none';
        if (toggle) toggle.style.display = 'none';
        if (head) head.setAttribute('aria-expanded', 'false');
        if (expandedWrap) expandedWrap.classList.remove('is-open');
        list.innerHTML = '';
    }
}

async function fetchDailyTasks() {
    if (typeof window.apiRequest !== 'function') {
        throw new Error('Daily tasks API unavailable');
    }

    const res = await window.apiRequest({ action: 'get_daily_tasks' });
    if (res.status !== 'ok' || !Array.isArray(res.tasks)) {
        throw new Error(res.message || 'Не удалось загрузить задания');
    }

    cachedDailyTasks = res.tasks;
    return cachedDailyTasks;
}

function renderProfileDailyTasks(options = {}) {
    const card = document.getElementById('profile-daily-card');
    const list = document.getElementById('profile-daily-list');
    const summary = document.getElementById('profile-daily-summary');
    const toggle = document.getElementById('profile-daily-toggle');
    const head = document.getElementById('profile-daily-head');
    const chip = document.getElementById('profile-daily-reward-chip');
    const expandedWrap = document.getElementById('profile-daily-expanded-wrap');
    if (!card || !list) return;
    const animateList = !!options.animateList;
    const previousWrapHeight = animateList && expandedWrap ? expandedWrap.getBoundingClientRect().height : 0;

    const tasks = Array.isArray(cachedDailyTasks) ? cachedDailyTasks : [];
    if (!tasks.length) {
        card.style.display = 'block';
        card.classList.remove('expanded');
        profileDailyShowAll = false;
        if (summary) summary.textContent = 'Заданий пока нет';
        if (chip) chip.style.display = 'none';
        list.innerHTML = '';
        if (toggle) toggle.style.display = 'none';
        if (head) head.setAttribute('aria-expanded', 'false');
        if (expandedWrap) expandedWrap.classList.remove('is-open');
        return;
    }

    const completed = tasks.filter(task => task.status === 'completed' || task.status === 'claimed').length;
    const readyToClaim = tasks.filter(task => task.status === 'completed');
    const readyXp = readyToClaim.reduce((sum, task) => sum + (Number(task.xp_reward) || 0), 0);
    if (summary) summary.textContent = `${completed}/${tasks.length} выполнено`;
    if (chip) {
        chip.style.display = readyXp > 0 ? 'inline-flex' : 'none';
        chip.textContent = readyXp > 0 ? `+${readyXp} XP` : '';
    }

    card.classList.toggle('expanded', profileDailyExpanded);
    if (head) head.setAttribute('aria-expanded', profileDailyExpanded ? 'true' : 'false');
    if (expandedWrap) expandedWrap.classList.toggle('is-open', profileDailyExpanded);

    const visibleTasks = profileDailyShowAll ? tasks : tasks.slice(0, 3);
    list.innerHTML = visibleTasks.map(renderProfileDailyTaskRow).join('');

    if (toggle) {
        toggle.style.display = profileDailyExpanded ? 'block' : 'none';
        if (tasks.length > 3 && !profileDailyShowAll) {
            toggle.innerHTML = `
                <div class="daily-profile-actions">
                    <button type="button" class="btn-unstyled daily-profile-action-link" onclick="event.stopPropagation(); showAllProfileDailyTasks()">
                        Показать все ${tasks.length}
                    </button>
                    <span class="daily-profile-actions-separator" aria-hidden="true">·</span>
                    <button type="button" class="btn-unstyled daily-profile-action-link" onclick="event.stopPropagation(); collapseProfileDailyTasks()">
                        Свернуть
                    </button>
                </div>
            `;
        } else if (tasks.length > 3 && profileDailyShowAll) {
            toggle.innerHTML = `
                <div class="daily-profile-actions">
                    <button type="button" class="btn-unstyled daily-profile-action-link" onclick="event.stopPropagation(); previewProfileDailyTasks()">
                        Показать 3
                    </button>
                    <span class="daily-profile-actions-separator" aria-hidden="true">·</span>
                    <button type="button" class="btn-unstyled daily-profile-action-link" onclick="event.stopPropagation(); collapseProfileDailyTasks()">
                        Свернуть
                    </button>
                </div>
            `;
        } else {
            toggle.innerHTML = `
                <div class="daily-profile-actions">
                    <button type="button" class="btn-unstyled daily-profile-action-link" onclick="event.stopPropagation(); collapseProfileDailyTasks()">
                        Свернуть
                    </button>
                </div>
            `;
        }
    }

    animateProfileDailyHeight(expandedWrap, previousWrapHeight, animateList);
}

function renderProfileDailyTaskRow(task) {
    const progress = Math.min(Number(task.progress) || 0, Number(task.target_count) || 1);
    const target = Math.max(1, Number(task.target_count) || 1);
    const reward = Number(task.xp_reward) || 0;
    const title = escapeProfileHtml(task.title || 'Задание');
    const code = escapeProfileHtml(task.code || '');
    const taskId = Number(task.task_id || task.id || 0);
    const isCompleted = task.status === 'completed';
    const isClaimed = task.status === 'claimed';
    const rowClass = isCompleted ? 'is-claimable' : (isClaimed ? 'is-claimed' : 'is-active');
    const subtitle = isCompleted
        ? `Выполнено · +${reward} XP`
        : (isClaimed ? `Получено · +${reward} XP` : `${progress}/${target} · +${reward} XP`);
    const clickAttr = isCompleted ? ` onclick="claimProfileDailyTask(${taskId}, '${code}')"` : '';
    const checkIcon = `
        <svg class="profile-daily-status-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M9 12.5l2 2 4.5-5"></path>
            <circle cx="12" cy="12" r="8.5"></circle>
        </svg>
    `;
    const claimIcon = `
        <svg class="profile-daily-status-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <circle cx="12" cy="12" r="8.5"></circle>
            <path d="M12 7.5v9"></path>
            <path d="M7.5 12h9"></path>
        </svg>
    `;
    let statusHtml = `
        <span class="profile-daily-status profile-daily-status-active" aria-label="${progress}/${target}">
            ${progress}/${target}
        </span>
    `;

    if (isCompleted) {
        statusHtml = `
            <button type="button" class="btn-unstyled profile-daily-status profile-daily-status-claim"
                onclick="event.stopPropagation(); claimProfileDailyTask(${taskId}, '${code}')"
                aria-label="Получить ${reward} XP">
                ${claimIcon}
            </button>
        `;
    } else if (isClaimed) {
        statusHtml = `
            <span class="profile-daily-status profile-daily-status-claimed" aria-label="Получено">
                ${checkIcon}
            </span>
        `;
    }

    return `
        <div class="profile-daily-row ${rowClass}"${clickAttr}>
            <div class="profile-daily-row-main">
                <div class="profile-daily-row-title">${title}</div>
                <div class="profile-daily-row-meta">${subtitle}</div>
            </div>
            ${statusHtml}
        </div>
    `;
}

function toggleProfileDailyTasks() {
    profileDailyExpanded = !profileDailyExpanded;
    if (!profileDailyExpanded) profileDailyShowAll = false;
    renderProfileDailyTasks();
}

function showAllProfileDailyTasks() {
    profileDailyExpanded = true;
    profileDailyShowAll = true;
    renderProfileDailyTasks({ animateList: true });
}

function previewProfileDailyTasks() {
    profileDailyExpanded = true;
    profileDailyShowAll = false;
    renderProfileDailyTasks({ animateList: true });
}

function collapseProfileDailyTasks() {
    profileDailyExpanded = false;
    profileDailyShowAll = false;
    renderProfileDailyTasks();
}

function animateProfileDailyHeight(expandedWrap, previousHeight, shouldAnimate) {
    if (!expandedWrap || !shouldAnimate || !profileDailyExpanded) return;
    const nextHeight = expandedWrap.getBoundingClientRect().height;
    if (!previousHeight || !nextHeight || Math.abs(nextHeight - previousHeight) < 2) return;
    expandedWrap.style.height = `${previousHeight}px`;
    expandedWrap.classList.add('is-resizing');
    requestAnimationFrame(() => {
        expandedWrap.style.height = `${nextHeight}px`;
        window.setTimeout(() => {
            expandedWrap.style.height = '';
            expandedWrap.classList.remove('is-resizing');
        }, 240);
    });
}

async function claimProfileDailyTask(taskId, code) {
    return claimDailyTaskReward(taskId, code);
}

async function claimDailyTaskReward(taskId, code) {
    if (typeof window.apiRequest !== 'function') return;
    const sourceKey = taskId > 0 ? String(taskId) : String(code || '');
    if (dailyTaskClaimInFlight === sourceKey) return;
    dailyTaskClaimInFlight = sourceKey;
    renderDailyTasksModal();

    try {
        const payload = { action: 'claim_daily_task' };
        if (taskId > 0) payload.task_id = taskId;
        else payload.code = code;

        const res = await window.apiRequest(payload);
        if (res.status !== 'ok') {
            throw new Error(res.message || 'Не удалось получить XP');
        }

        if (window.showToast) window.showToast(res.already_claimed ? 'Награда уже получена' : 'XP получен', 'success');
        await fetchDailyTasks();
        renderProfileDailyTasks();
        renderDailyTasksModal();
        await loadMyProfileStats();
        renderRewardsCurrentView();
    } catch (err) {
        console.warn('Daily Task Claim Error:', err);
        if (window.showToast) window.showToast(err.message || 'Не удалось получить награду', 'error');
    } finally {
        dailyTaskClaimInFlight = null;
        renderDailyTasksModal();
    }
}

async function openDailyTasksModal() {
    if (typeof window.showModal === 'function') {
        window.showModal('modal-daily-tasks');
    }

    if (cachedDailyTasks.length) {
        renderDailyTasksModal();
    } else {
        renderDailyTasksModalState('Загружаем задания...');
    }

    try {
        await fetchDailyTasks();
        renderDailyTasksModal();
    } catch (err) {
        console.warn('Daily Tasks Modal Error:', err);
        renderDailyTasksModalState('Не удалось загрузить задания', true);
    }
}

function renderDailyTasksModalState(message, showRetry = false) {
    const summary = document.getElementById('daily-modal-summary-text');
    const chip = document.getElementById('daily-modal-reward-chip');
    const bar = document.getElementById('daily-modal-progress-bar');
    const list = document.getElementById('daily-modal-list');
    if (summary) summary.textContent = message;
    if (chip) chip.style.display = 'none';
    if (bar) bar.style.width = '0%';
    if (list) {
        list.innerHTML = `
            <div class="daily-tasks-modal-state">
                ${escapeProfileHtml(message)}
                ${showRetry ? '<br><button type="button" class="btn-unstyled daily-tasks-modal-retry mt-2" onclick="openDailyTasksModal()">Повторить</button>' : ''}
            </div>
        `;
    }
}

function renderDailyTasksModal() {
    const summary = document.getElementById('daily-modal-summary-text');
    const chip = document.getElementById('daily-modal-reward-chip');
    const bar = document.getElementById('daily-modal-progress-bar');
    const list = document.getElementById('daily-modal-list');
    if (!summary || !list) return;

    const tasks = Array.isArray(cachedDailyTasks) ? cachedDailyTasks : [];
    if (!tasks.length) {
        renderDailyTasksModalState('Сегодня заданий пока нет');
        return;
    }

    const completed = tasks.filter(task => task.status === 'completed' || task.status === 'claimed').length;
    const readyXp = tasks
        .filter(task => task.status === 'completed')
        .reduce((sum, task) => sum + (Number(task.xp_reward) || 0), 0);
    summary.textContent = `${completed}/${tasks.length} выполнено`;
    if (chip) {
        chip.style.display = readyXp > 0 ? 'inline-flex' : 'none';
        chip.textContent = readyXp > 0 ? `+${readyXp} XP доступно` : '';
    }
    if (bar) {
        bar.style.width = Math.min(100, Math.max(0, (completed / Math.max(1, tasks.length)) * 100)) + '%';
    }

    list.innerHTML = tasks.map(renderDailyTaskModalRow).join('');
}

function renderDailyTaskModalRow(task) {
    const progress = Math.min(Number(task.progress) || 0, Number(task.target_count) || 1);
    const target = Math.max(1, Number(task.target_count) || 1);
    const reward = Number(task.xp_reward) || 0;
    const title = escapeProfileHtml(task.title || 'Задание');
    const description = escapeProfileHtml(task.description || '');
    const code = escapeProfileHtml(task.code || '');
    const taskId = Number(task.task_id || task.id || 0);
    const isCompleted = task.status === 'completed';
    const isClaimed = task.status === 'claimed';
    const rowClass = isCompleted ? 'is-claimable' : (isClaimed ? 'is-claimed' : 'is-active');
    const subtitle = isCompleted
        ? `Выполнено · +${reward} XP`
        : (isClaimed ? `Получено · +${reward} XP` : `${progress}/${target} · +${reward} XP`);
    const clickAttr = isCompleted ? ` onclick="claimDailyTaskReward(${taskId}, '${code}')"` : '';
    const isLoading = dailyTaskClaimInFlight === (taskId > 0 ? String(taskId) : String(code || ''));
    const checkIcon = `
        <svg class="daily-task-modal-status-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M9 12.5l2 2 4.5-5"></path>
            <circle cx="12" cy="12" r="8.5"></circle>
        </svg>
    `;
    const claimIcon = `
        <svg class="daily-task-modal-status-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <circle cx="12" cy="12" r="8.5"></circle>
            <path d="M12 7.5v9"></path>
            <path d="M7.5 12h9"></path>
        </svg>
    `;
    let statusHtml = `
        <span class="daily-task-modal-status daily-task-modal-status-active" aria-label="${progress}/${target}">
            ${progress}/${target}
        </span>
    `;

    if (isCompleted) {
        statusHtml = `
            <button type="button" class="btn-unstyled daily-task-modal-status daily-task-modal-status-claim ${isLoading ? 'is-loading' : ''}"
                onclick="event.stopPropagation(); claimDailyTaskReward(${taskId}, '${code}')"
                aria-label="Получить ${reward} XP">
                ${isLoading ? '<span class="spinner-border spinner-border-sm" aria-hidden="true"></span>' : claimIcon}
            </button>
        `;
    } else if (isClaimed) {
        statusHtml = `
            <span class="daily-task-modal-status daily-task-modal-status-claimed" aria-label="Получено">
                ${checkIcon}
            </span>
        `;
    }

    return `
        <div class="daily-task-modal-row ${rowClass}"${clickAttr}>
            <div class="daily-task-modal-main">
                <div class="daily-task-modal-title">${title}</div>
                ${description ? `<div class="daily-task-modal-description">${description}</div>` : ''}
                <div class="daily-task-modal-meta">${subtitle}</div>
            </div>
            ${statusHtml}
        </div>
    `;
}

function renderRewardsDailyOverview() {
    const summary = document.getElementById('detail-daily-summary');
    const list = document.getElementById('detail-daily-list');
    if (!summary || !list) return;

    const tasks = Array.isArray(cachedDailyTasks) ? cachedDailyTasks : [];
    if (!tasks.length) {
        summary.textContent = '0/0';
        list.innerHTML = '<div class="rewards-overview-empty">Сегодня заданий пока нет</div>';
        return;
    }

    const completed = tasks.filter(task => task.status === 'completed' || task.status === 'claimed').length;
    const readyXp = tasks
        .filter(task => task.status === 'completed')
        .reduce((sum, task) => sum + (Number(task.xp_reward) || 0), 0);
    summary.textContent = readyXp > 0
        ? `${completed}/${tasks.length} · +${readyXp} XP`
        : `${completed}/${tasks.length}`;
    list.innerHTML = renderRewardsDailySummaryBlock(tasks);
}

function renderRewardsDailySummaryBlock(tasks) {
    const safeTasks = Array.isArray(tasks) ? tasks : [];
    const preview = safeTasks.slice(0, 4);

    return `
        <div class="rewards-preview-tile-row" aria-label="Задания дня">
            ${preview.map(renderRewardsDailyPreviewTile).join('')}
            ${renderRewardsNavTile('daily', 'Все задания')}
        </div>
    `;
}

function getRewardsDailyIconClass(task) {
    const code = String(task?.code || task?.event_type || '').toLowerCase();
    if (code.includes('win')) return 'bi-trophy-fill';
    if (code.includes('create_room') || code.includes('room_created')) return 'bi-people-fill';
    if (code.includes('schedule') || code.includes('scheduled_created')) return 'bi-calendar2-plus';
    if (code.includes('join_scheduled') || code.includes('scheduled_subscribed')) return 'bi-calendar2-check';
    if (code.includes('game_finished') || code.includes('play')) return 'bi-controller';
    return 'bi-stars';
}

function renderRewardsDailyPreviewTile(task) {
    const title = escapeProfileHtml(task?.title || 'Задание');
    const status = String(task?.status || '');
    const stateClass = status === 'claimed'
        ? 'is-claimed'
        : (status === 'completed' ? 'is-ready' : 'is-active');
    const iconClass = getRewardsDailyIconClass(task);

    return `
        <div class="rewards-preview-tile rewards-preview-tile-task ${stateClass}" title="${title}" aria-label="${title}">
            <i class="bi ${iconClass}" aria-hidden="true"></i>
            ${status === 'claimed' ? '<span class="rewards-preview-state-dot"><i class="bi bi-check2" aria-hidden="true"></i></span>' : ''}
            ${status === 'completed' ? '<span class="rewards-preview-state-dot"><i class="bi bi-plus" aria-hidden="true"></i></span>' : ''}
        </div>
    `;
}

function renderRewardsNavTile(view, label) {
    const safeView = view === 'achievements' ? 'achievements' : 'daily';
    return `
        <button type="button" class="btn-unstyled rewards-preview-tile rewards-preview-tile-nav"
            onclick="setRewardsView('${safeView}')" aria-label="${escapeProfileHtml(label)}">
            <i class="bi bi-chevron-right" aria-hidden="true"></i>
        </button>
    `;
}

function renderRewardsDailyTaskRow(task) {
    const progress = Math.min(Number(task.progress) || 0, Number(task.target_count) || 1);
    const target = Math.max(1, Number(task.target_count) || 1);
    const reward = Number(task.xp_reward) || 0;
    const title = escapeProfileHtml(task.title || 'Задание');
    const code = escapeProfileHtml(task.code || '');
    const taskId = Number(task.task_id || task.id || 0);
    const isCompleted = task.status === 'completed';
    const isClaimed = task.status === 'claimed';
    const rowClass = isCompleted ? 'is-claimable' : (isClaimed ? 'is-claimed' : 'is-active');
    const meta = isCompleted
        ? `Выполнено · +${reward} XP`
        : (isClaimed ? `Получено · +${reward} XP` : `${progress}/${target} · +${reward} XP`);
    const clickAttr = isCompleted ? ` onclick="claimDailyTaskReward(${taskId}, '${code}')"` : '';
    const isLoading = dailyTaskClaimInFlight === (taskId > 0 ? String(taskId) : String(code || ''));
    const checkIcon = `
        <svg class="rewards-daily-status-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M9 12.5l2 2 4.5-5"></path>
            <circle cx="12" cy="12" r="8.5"></circle>
        </svg>
    `;
    const claimIcon = `
        <svg class="rewards-daily-status-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <circle cx="12" cy="12" r="8.5"></circle>
            <path d="M12 7.5v9"></path>
            <path d="M7.5 12h9"></path>
        </svg>
    `;
    let statusHtml = `
        <span class="rewards-daily-status rewards-daily-status-active" aria-label="${progress}/${target}">
            ${progress}/${target}
        </span>
    `;

    if (isCompleted) {
        statusHtml = `
            <button type="button" class="btn-unstyled rewards-daily-status rewards-daily-status-claim ${isLoading ? 'is-loading' : ''}"
                onclick="event.stopPropagation(); claimDailyTaskReward(${taskId}, '${code}')"
                aria-label="Получить ${reward} XP">
                ${isLoading ? '<span class="spinner-border spinner-border-sm" aria-hidden="true"></span>' : claimIcon}
            </button>
        `;
    } else if (isClaimed) {
        statusHtml = `
            <span class="rewards-daily-status rewards-daily-status-claimed" aria-label="Получено">
                ${checkIcon}
            </span>
        `;
    }

    return `
        <div class="rewards-daily-row ${rowClass}"${clickAttr}>
            <div class="rewards-daily-copy">
                <div class="rewards-daily-title">${title}</div>
                <div class="rewards-daily-meta">${meta}</div>
            </div>
            ${statusHtml}
        </div>
    `;
}

function formatAchievementDate(value) {
    if (!value) return '';
    const normalized = String(value).replace(' ', 'T');
    const date = new Date(normalized);
    if (Number.isNaN(date.getTime())) return '';

    try {
        return new Intl.DateTimeFormat('ru-RU', {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
        }).format(date);
    } catch (err) {
        return '';
    }
}

function renderUnlockedRewards(achievements) {
    const unlocked = Array.isArray(achievements)
        ? achievements.filter(item => item && item.unlocked_at)
        : [];

    if (!unlocked.length) {
        return '<div class="rewards-overview-empty">Пока нет полученных наград. Они появятся здесь после выполнения условий.</div>';
    }

    return `
        <div class="rewards-achievement-list">
            ${unlocked.map(achievement => {
                const name = escapeProfileHtml(achievement.name || 'Награда');
                const description = escapeProfileHtml(achievement.description || '');
                const date = escapeProfileHtml(formatAchievementDate(achievement.unlocked_at));
                const iconHtml = renderAchievementIconHtml(achievement, 'bi-award-fill');

                return `
                    <div class="rewards-achievement-row">
                        <div class="rewards-achievement-icon" aria-hidden="true">${iconHtml}</div>
                        <div class="rewards-achievement-copy">
                            <div class="rewards-achievement-name">${name}</div>
                            ${description ? `<div class="rewards-achievement-desc">${description}</div>` : ''}
                            ${date ? `<div class="rewards-achievement-date">Получено ${date}</div>` : ''}
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

function renderAchievementIconHtml(achievement, fallbackIcon = 'bi-trophy-fill') {
    const icon = String(achievement?.icon || '').trim();
    const iconType = String(achievement?.icon_type || '').trim().toLowerCase();
    const isBootstrapIcon = /^bi-[a-z0-9-]+$/i.test(icon);

    if ((iconType === 'bootstrap' || icon.startsWith('bi-')) && isBootstrapIcon) {
        return `<i class="bi ${escapeProfileHtml(icon)}" aria-hidden="true"></i>`;
    }

    return `<i class="bi ${escapeProfileHtml(fallbackIcon)}" aria-hidden="true"></i>`;
}

function getUnlockedRewards(achievements) {
    return Array.isArray(achievements)
        ? achievements.filter(item => item && item.unlocked_at)
        : [];
}

function sortAchievementsForRewards(achievements) {
    return (Array.isArray(achievements) ? achievements.slice() : []).sort((a, b) => {
        const sortA = Number(a?.sort_order);
        const sortB = Number(b?.sort_order);
        const safeA = Number.isFinite(sortA) ? sortA : 100;
        const safeB = Number.isFinite(sortB) ? sortB : 100;
        if (safeA !== safeB) return safeA - safeB;
        const idA = Number(a?.id);
        const idB = Number(b?.id);
        if (Number.isFinite(idA) && Number.isFinite(idB) && idA !== idB) return idA - idB;
        return String(a?.code || '').localeCompare(String(b?.code || ''), 'ru');
    });
}

function getAchievementCategoryLabel(category) {
    const labels = {
        game: 'Игры',
        social: 'Социальные',
        milestone: 'Прогресс'
    };
    return labels[String(category || '')] || 'Другое';
}

function getAchievementRarityLabel(rarity) {
    const labels = {
        common: 'Обычная',
        uncommon: 'Необычная',
        rare: 'Редкая'
    };
    return labels[String(rarity || '')] || 'Обычная';
}

async function ensureAllAchievementsLoaded(force = false) {
    if (!force && Array.isArray(cachedAllAchievements)) return cachedAllAchievements;
    if (typeof window.apiRequest !== 'function') {
        cachedAllAchievements = [];
        return cachedAllAchievements;
    }

    const res = await window.apiRequest({ action: 'get_achievements' });
    if (res.status !== 'ok' || !Array.isArray(res.achievements)) {
        throw new Error(res.message || 'Не удалось загрузить награды');
    }

    cachedAllAchievements = sortAchievementsForRewards(res.achievements);
    return cachedAllAchievements;
}

function renderRewardsAchievementPreview(achievements) {
    const unlocked = getUnlockedRewards(achievements);
    if (!unlocked.length) {
        return '<div class="rewards-overview-empty rewards-overview-empty-compact">Пока нет полученных наград</div>';
    }

    return `
        <div class="rewards-preview-tile-row" aria-label="Полученные награды">
            ${unlocked.slice(0, 4).map(achievement => {
                const label = escapeProfileHtml(achievement.name || 'Награда');
                const iconHtml = renderAchievementIconHtml(achievement, 'bi-trophy-fill');
                return `
                    <div class="rewards-preview-tile rewards-preview-tile-achievement" title="${label}" aria-label="${label}">
                        ${iconHtml}
                    </div>
                `;
            }).join('')}
            ${renderRewardsNavTile('achievements', 'Все награды')}
        </div>
    `;
}

function renderRewardsAchievementsOverview(stats) {
    const container = document.getElementById('detail-achievements-list');
    const summary = document.getElementById('detail-achievements-summary');
    if (!container) return;

    const achievements = Array.isArray(stats?.achievements) ? stats.achievements : [];
    if (summary) summary.textContent = String(getUnlockedRewards(achievements).length);
    container.innerHTML = renderRewardsAchievementPreview(achievements);
}

function renderRewardsFullDailyView() {
    const detail = document.getElementById('rewards-detail-view');
    if (!detail) return;

    const tasks = Array.isArray(cachedDailyTasks) ? cachedDailyTasks : [];
    detail.innerHTML = tasks.length
        ? `<div class="rewards-overview-daily-list">${tasks.map(renderRewardsDailyTaskRow).join('')}</div>`
        : '<div class="rewards-overview-empty">Сегодня заданий пока нет</div>';
}

function renderRewardsFullAchievementsView() {
    const detail = document.getElementById('rewards-detail-view');
    if (!detail) return;

    if (!Array.isArray(cachedAllAchievements)) {
        detail.innerHTML = '<div class="rewards-overview-empty">Загружаем награды...</div>';
        return;
    }

    const achievements = sortAchievementsForRewards(cachedAllAchievements || []);
    if (!achievements.length) {
        detail.innerHTML = '<div class="rewards-overview-empty">Награды скоро появятся</div>';
        return;
    }

    const unlocked = getUnlockedRewards(achievements);
    const filtered = rewardsAchievementFilter === 'all'
        ? achievements
        : achievements.filter(item => String(item?.category || '') === rewardsAchievementFilter);

    detail.innerHTML = `
        <div class="rewards-collection-shell">
            <div class="rewards-collection-summary">
                <span>Получено: ${unlocked.length}</span>
                <span>Всего доступно: ${achievements.length}</span>
            </div>
            ${renderRewardsAchievementFilters()}
            <div class="rewards-collection-scroll">
                ${filtered.length ? `
                    <div class="rewards-achievement-list">
                        ${filtered.map(renderRewardsAchievementRow).join('')}
                    </div>
                ` : '<div class="rewards-overview-empty rewards-collection-empty">В этой категории пока нет наград</div>'}
            </div>
        </div>
    `;
}

function renderRewardsAchievementFilters() {
    const filters = [
        ['all', 'Все'],
        ['game', 'Игры'],
        ['social', 'Социальные'],
        ['milestone', 'Прогресс']
    ];

    return `
        <div class="rewards-achievement-filters" aria-label="Фильтр наград">
            ${filters.map(([value, label]) => `
                <button type="button"
                    class="btn-unstyled rewards-achievement-filter ${rewardsAchievementFilter === value ? 'is-active' : ''}"
                    onclick="setRewardsAchievementFilter('${value}')">
                    ${label}
                </button>
            `).join('')}
        </div>
    `;
}

function renderRewardsAchievementRow(achievement) {
    const unlocked = !!achievement?.unlocked_at;
    const name = escapeProfileHtml(achievement?.name || 'Награда');
    const description = escapeProfileHtml(achievement?.description || '');
    const date = escapeProfileHtml(formatAchievementDate(achievement?.unlocked_at));
    const iconHtml = renderAchievementIconHtml(achievement, 'bi-award-fill');
    const rarity = escapeProfileHtml(getAchievementRarityLabel(achievement?.rarity));
    const category = escapeProfileHtml(getAchievementCategoryLabel(achievement?.category));

    return `
        <div class="rewards-achievement-row ${unlocked ? 'is-unlocked' : 'is-locked'}">
            <div class="rewards-achievement-icon" aria-hidden="true">${iconHtml}</div>
            <div class="rewards-achievement-copy">
                <div class="rewards-achievement-title-line">
                    <div class="rewards-achievement-name">${name}</div>
                    ${unlocked ? '' : '<i class="bi bi-lock-fill rewards-achievement-lock" aria-hidden="true"></i>'}
                </div>
                ${description ? `<div class="rewards-achievement-desc">${description}</div>` : ''}
                <div class="rewards-achievement-meta-line">
                    <span class="rewards-achievement-rarity">${rarity}</span>
                    <span>${category}</span>
                    ${unlocked && date ? `<span>Получено ${date}</span>` : '<span>Не получено</span>'}
                </div>
            </div>
        </div>
    `;
}

function setRewardsAchievementFilter(filter) {
    rewardsAchievementFilter = ['all', 'game', 'social', 'milestone'].includes(filter) ? filter : 'all';
    renderRewardsFullAchievementsView();
}

function resetRewardsView() {
    rewardsView = 'overview';
    rewardsAchievementFilter = 'all';
    renderRewardsCurrentView();
}

function closeRewardsModal() {
    resetRewardsView();
    if (typeof window.closeModal === 'function') {
        window.closeModal('modal-detailed-stats');
    }
}

function renderRewardsCurrentView() {
    const title = document.getElementById('rewards-modal-title');
    const back = document.getElementById('rewards-modal-back');
    const overview = document.getElementById('rewards-overview-view');
    const detail = document.getElementById('rewards-detail-view');
    if (!overview || !detail) return;

    const isOverview = rewardsView === 'overview';
    overview.style.display = isOverview ? '' : 'none';
    detail.style.display = isOverview ? 'none' : '';
    if (back) back.style.display = isOverview ? 'none' : 'inline-flex';

    if (rewardsView === 'daily') {
        if (title) title.textContent = 'Задания дня';
        renderRewardsFullDailyView();
    } else if (rewardsView === 'achievements') {
        if (title) title.textContent = 'Коллекция наград';
        renderRewardsFullAchievementsView();
    } else {
        if (title) title.textContent = 'Задания и награды';
        renderRewardsDailyOverview();
        renderRewardsAchievementsOverview(cachedUserStats || {});
    }
}

function setRewardsView(view) {
    rewardsView = ['daily', 'achievements'].includes(view) ? view : 'overview';
    if (rewardsView === 'overview') {
        rewardsAchievementFilter = 'all';
    }
    renderRewardsCurrentView();
    if (rewardsView === 'achievements') {
        ensureAllAchievementsLoaded()
            .then(() => {
                if (rewardsView === 'achievements') renderRewardsCurrentView();
            })
            .catch(err => {
                console.warn('Achievements Collection Error:', err);
                const detail = document.getElementById('rewards-detail-view');
                if (detail) detail.innerHTML = '<div class="rewards-overview-empty">Не удалось загрузить награды</div>';
            });
    }
}

async function openDetailedStatsModal() {
    rewardsView = 'overview';
    if (!cachedUserStats) {
        if (window.showToast) window.showToast("Загрузка статистики...", "info");
        await loadMyProfileStats();
    }

    try {
        await fetchDailyTasks();
    } catch (err) {
        console.warn('Rewards Daily Tasks Error:', err);
    }

    if (!cachedUserStats) {
        if (window.showToast) window.showToast("Не удалось загрузить награды", "error");
        return;
    }

    if (window.triggerHaptic) window.triggerHaptic('impact', 'light');

    const s = cachedUserStats || {};
    const xp = s.total_points_earned || 0;

    const level = typeof window.calculateLevel === 'function' ? window.calculateLevel(xp) : 1;
    const prevThreshold = Math.pow(level - 1, 2) * 100;
    const nextThreshold = Math.pow(level, 2) * 100;
    const progressXP = xp - prevThreshold;
    const neededXP = nextThreshold - prevThreshold;
    const progressPct = Math.min(100, Math.max(0, (progressXP / neededXP) * 100));

    if (window.safeText) {
        window.safeText('detail-level-val', `${level} LVL`);
        window.safeText('detail-xp-range', `${xp} / ${nextThreshold} XP`);
    }

    const progBar = document.getElementById('detail-xp-progress');
    if (progBar) progBar.style.width = progressPct + '%';

    renderRewardsCurrentView();

    if (window.showModal) window.showModal('modal-detailed-stats');
}

async function fetchUserStats() {
    const res = await window.apiRequest({ action: 'get_stats' });
    if (res.status === 'ok') {
        if (window.safeText) {
            window.safeText('profile-stat-wins', res.stats.total_wins);
            window.safeText('profile-stat-games', res.stats.total_games_played);
            window.safeText('profile-stat-rating', res.stats.rating);
        }

        const container = document.getElementById('profile-achievements-container');
        if (container && typeof window.renderAchievements === 'function') {
            container.innerHTML = window.renderAchievements(res.stats.achievements);
        }
    }
}

async function openUserProfile(userId) {
    if (window.showModal) window.showModal('userProfileModal');

    const container = document.getElementById('public-profile-content');
    if (container) container.innerHTML = '<div class="spinner-border text-primary my-4"></div>';

    const res = await window.apiRequest({ action: 'get_public_profile', user_id: userId });

    if (res.status === 'ok') {
        const p = res.profile;
        const fs = res.friend_status;
        const xp = p.total_points_earned || 0;
        const level = typeof window.calculateLevel === 'function' ? window.calculateLevel(xp) : 1;

        const prevThreshold = Math.pow(level - 1, 2) * 100;
        const nextThreshold = Math.pow(level, 2) * 100;
        const progressXP = xp - prevThreshold;
        const neededXP = nextThreshold - prevThreshold;
        const progressPct = Math.max(0, Math.min(100, (progressXP / neededXP) * 100));

        let actionBtn = '';
        if (fs === 'none') {
            actionBtn = `<button id="friend-action-btn-${p.id}" class="btn btn-primary rounded-pill px-4 fw-bold shadow-sm" onclick="addFriend(${p.id}, event)"><i class="bi bi-person-plus me-2"></i>Добавить</button>`;
        } else if (fs === 'pending_out') {
            actionBtn = `<button class="btn btn-light rounded-pill px-4 border" disabled>Ожидание</button>`;
        } else if (fs === 'pending_in') {
            actionBtn = `<button class="btn btn-success rounded-pill px-4 fw-bold shadow-sm" onclick="acceptFriend(${p.id}, event)">Принять</button>`;
        } else if (fs === 'accepted') {
            actionBtn = `<button class="btn btn-link text-danger btn-sm text-decoration-none" onclick="removeFriend(${p.id}, event)">Удалить друга</button>`;
        }

        if (container) {
            container.innerHTML = `
                <div class="d-flex align-items-center gap-3 mb-4 text-start">
                     ${typeof window.renderAvatar === 'function' ? window.renderAvatar(p, 'xl') : ''}
                     <div>
                        <h4 class="fw-bold mb-0">${p.custom_name || p.first_name}</h4>
                        <div class="text-muted small">ID: ${p.id}</div>
                     </div>
                </div>

                <div class="p-2 bg-light rounded-4 border mb-3 text-start">
                    <div class="d-flex justify-content-between align-items-end mb-1">
                        <div class="fw-bold text-primary" style="font-size: 14px;">${level} LVL</div>
                        <div class="text-muted" style="font-size: 10px;">${xp} / ${nextThreshold} XP</div>
                    </div>
                    <div class="progress" style="height: 6px; border-radius: 3px; background: rgba(0,0,0,0.05);">
                        <div class="progress-bar bg-primary" role="progressbar" style="width: ${progressPct}%; border-radius: 3px;"></div>
                    </div>
                </div>
                
                <div class="row g-2 mb-4">
                    <div class="col-6">
                        <div class="p-2 bg-light rounded-4 text-center border">
                            <div class="text-muted" style="font-size: 9px; text-transform: uppercase;">Игр</div>
                            <div class="fw-bold fs-6">${p.total_games_played}</div>
                        </div>
                    </div>
                    <div class="col-6">
                        <div class="p-2 bg-light rounded-4 text-center border">
                            <div class="text-muted" style="font-size: 9px; text-transform: uppercase;">Побед</div>
                            <div class="fw-bold fs-6 text-success">${p.total_wins}</div>
                        </div>
                    </div>
                </div>

                <div class="achievements-section text-center mb-4">
                     <h6 class="fw-bold mb-3" style="font-size: 13px; text-transform: uppercase; color: #666;">Достижения</h6>
                     ${typeof window.renderAchievements === 'function' ? window.renderAchievements(res.achievements) : ''}
                </div>

                <div class="mt-2">
                    ${actionBtn}
                </div>
            `;
        }
    } else {
        if (container) container.innerHTML = '<p class="text-danger">Ошибка загрузки</p>';
    }
}

// === FRIENDS ===

async function openFriendsModal() {
    if (window.showModal) window.showModal('friendsModal');
    await loadFriends();
}

async function loadFriends() {
    const res = await window.apiRequest({ action: 'get_friends' });
    if (res.status === 'ok') {
        renderFriends(res.friends, res.requests);
    }
}

function renderFriends(friends, requests) {
    const reqContainer = document.getElementById('friends-req-container');
    const badge = document.getElementById('friends-req-badge');

    if (requests.length > 0) {
        if (badge) {
            badge.style.display = 'inline-block';
            badge.innerText = requests.length;
        }
        if (reqContainer) {
            reqContainer.innerHTML = '';
            requests.forEach(req => {
                const div = document.createElement('div');
                div.className = 'd-flex align-items-center justify-content-between p-2 mb-2 bg-light rounded-4';
                div.innerHTML = `
                    <div class="d-flex align-items-center gap-2">
                        ${typeof window.renderAvatar === 'function' ? window.renderAvatar(req, 'sm') : ''}
                        <div class="fw-bold">${req.custom_name || req.first_name}</div>
                    </div>
                    <div>
                         <button class="btn btn-sm btn-success rounded-circle" onclick="acceptFriend(${req.id})"><i class="bi bi-check-lg"></i></button>
                    </div>
                `;
                reqContainer.appendChild(div);
            });
        }
    } else {
        if (badge) badge.style.display = 'none';
        if (reqContainer) reqContainer.innerHTML = '<p class="text-center text-muted mt-4">Нет новых заявок</p>';
    }

    const listContainer = document.getElementById('friends-list-container');
    if (listContainer) {
        listContainer.innerHTML = '';
        if (friends.length === 0) {
            listContainer.innerHTML = '<p class="text-center text-muted mt-3">У вас пока нет друзей.</p>';
            return;
        }
        friends.forEach(f => {
            const div = document.createElement('div');
            div.className = 'd-flex align-items-center justify-content-between p-2 mb-2 border-bottom';
            div.innerHTML = `
                <div class="d-flex align-items-center gap-2">
                     ${typeof window.renderAvatar === 'function' ? window.renderAvatar(f, 'md') : ''}
                     <div>
                        <div class="fw-bold">${f.custom_name || f.first_name}</div>
                        <div style="font-size:10px; color: #888;">ID: ${f.id}</div>
                     </div>
                </div>
                <button class="btn btn-sm text-danger" onclick="removeFriend(${f.id})"><i class="bi bi-x-lg"></i></button>
            `;
            listContainer.appendChild(div);
        });
    }
}

async function searchFriendsAction() {
    const input = document.getElementById('friend-search-input');
    const query = input ? input.value.trim() : '';
    const resultsArea = document.getElementById('friends-search-results');
    const list = document.getElementById('friends-search-list');

    if (query.length < 2) {
        if (resultsArea) resultsArea.style.display = 'none';
        return;
    }

    if (list) list.innerHTML = '<div class="spinner-border spinner-border-sm text-primary"></div>';
    if (resultsArea) resultsArea.style.display = 'block';

    const res = await window.apiRequest({ action: 'search_users', query: query });
    if (res.status === 'ok') {
        if (list) {
            list.innerHTML = '';
            if (res.users.length === 0) {
                list.innerHTML = '<div class="text-muted small">Никого не найдено</div>';
                return;
            }
            res.users.forEach(u => {
                const div = document.createElement('div');
                div.className = 'd-flex align-items-center justify-content-between p-2 mb-1 bg-white rounded-3 shadow-sm';
                div.innerHTML = `
                    <div class="d-flex align-items-center gap-2">
                        ${typeof window.renderAvatar === 'function' ? window.renderAvatar(u, 'sm') : ''}
                        <div class="fw-bold">${u.custom_name || u.first_name}</div>
                    </div>
                    <button class="btn btn-sm btn-primary rounded-circle" onclick="addFriend(${u.id})"><i class="bi bi-person-plus"></i></button>
                 `;
                list.appendChild(div);
            });
        }
    }
}

async function addFriend(id, event) {
    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }
    const res = await window.apiRequest({ action: 'add_friend', friend_id: id });
    if (res.status === 'ok') {
        if (window.showAlert) window.showAlert('Успех', 'Заявка отправлена!', 'success');
        const profileBtn = document.getElementById(`friend-action-btn-${id}`);
        if (profileBtn) {
            profileBtn.disabled = true;
            profileBtn.className = 'btn btn-outline-secondary rounded-pill px-4 text-muted';
            profileBtn.innerHTML = '✓ Заявка отправлена';
        }
        const searchInput = document.getElementById('friend-search-input');
        if (searchInput) searchInput.value = '';
        const searchResults = document.getElementById('friends-search-results');
        if (searchResults) searchResults.style.display = 'none';
    } else {
        if (window.showAlert) window.showAlert('Внимание', res.message, 'warning');
    }
}

async function acceptFriend(id, event) {
    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }
    if (typeof window.showConfirmation !== 'function') return;
    window.showConfirmation('Дружба', 'Принять заявку в друзья?', async () => {
        const res = await window.apiRequest({ action: 'accept_friend', friend_id: id });
        if (res.status === 'ok') {
            loadFriends();
            if (window.showAlert) window.showAlert('Ура!', 'Теперь вы друзья! 🎉', 'success');
            openUserProfile(id);
        } else {
            if (window.showAlert) window.showAlert('Ошибка', res.message, 'error');
        }
    }, { confirmText: 'Принять' });
}

async function removeFriend(id, event) {
    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }
    if (typeof window.showConfirmation !== 'function') return;
    window.showConfirmation('Удаление', 'Удалить пользователя из друзей?', async () => {
        const res = await window.apiRequest({ action: 'remove_friend', friend_id: id });
        if (res.status === 'ok') {
            loadFriends();
            if (window.showAlert) window.showAlert('Готово', 'Пользователь удален из друзей', 'success');
            openUserProfile(id);
        } else {
            if (window.showAlert) window.showAlert('Ошибка', res.message, 'error');
        }
    }, { isDanger: true, confirmText: 'Удалить' });
}

// === LEADERBOARD ===

function openLeaderboardScreen() {
    if (window.showScreen) window.showScreen('leaderboard');
    loadLeaderboardList('global');
}

async function loadLeaderboardList(type = 'global') {
    const container = document.getElementById('leaderboard-screen-container');
    if (!container) return;

    container.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-primary spinner-border-sm"></div></div>';

    const res = await window.apiRequest({ action: 'get_leaderboard', type: type });
    if (res.status === 'ok') {
        container.innerHTML = '';
        if (res.leaderboard.length === 0) {
            container.innerHTML = '<div class="text-center text-muted mt-5">Пока пусто 🏜️</div>';
            return;
        }
        res.leaderboard.forEach((u, index) => {
            let rankClass = '';
            let rankContent = index + 1;
            if (index === 0) { rankClass = 'top-1'; rankContent = '🥇'; }
            else if (index === 1) { rankClass = 'top-2'; rankContent = '🥈'; }
            else if (index === 2) { rankClass = 'top-3'; rankContent = '🥉'; }
            else { rankClass = 'text-muted'; rankContent = index + 1; }

            const div = document.createElement('div');
            div.className = 'lb-card';
            div.onclick = () => openUserProfile(u.user_id || u.id);
            div.style.cursor = 'pointer';

            div.innerHTML = `
                <div class="lb-rank ${rankClass}" style="min-width: 30px; text-align: center; font-size: ${index < 3 ? '24px' : '16px'}">${rankContent}</div>
                <div class="me-3">${typeof window.renderAvatar === 'function' ? window.renderAvatar(u, 'md') : ''}</div>
                <div class="lb-info">
                    <div class="lb-name">${u.custom_name || u.first_name}</div>
                    <div class="lb-detail">
                        <span class="level-pill">LVL ${typeof window.calculateLevel === 'function' ? window.calculateLevel(u.total_points_earned) : 1}</span>
                    </div>
                </div>
                <div class="lb-score">
                    ${u.total_points_earned || 0}
                    <small>XP</small>
                </div>
            `;
            container.appendChild(div);
        });
    } else {
        container.innerHTML = '<p class="text-center text-danger">Ошибка загрузки</p>';
    }
}

// === FRIENDS SCREEN (NEW UI) ===

function openFriendsScreen() {
    if (window.showScreen) window.showScreen('friends');
    loadFriendsList();
}

function closeFriendsScreen() {
    if (window.showScreen) window.showScreen('lobby');
    if (window.switchTab) window.switchTab('profile');
}

async function loadFriendsList() {
    try {
        const container = document.getElementById('friends-list-container');
        if (!container) return;
        container.style.display = 'block';

        const res = await window.apiRequest({ action: 'get_friends' });
        if (res.status === 'ok') {
            container.innerHTML = '';
            const friends = res.friends || [];
            if (friends.length === 0) {
                container.innerHTML = '<div class="text-center text-muted mt-4"><i class="bi bi-people h1 d-block mb-2"></i>Пока нет друзей</div>';
                return;
            }
            friends.forEach(f => {
                const div = document.createElement('div');
                div.className = 'd-flex align-items-center mb-3 p-3 rounded-4';
                div.style.background = 'rgba(255, 255, 255, 0.7)';
                div.style.backdropFilter = 'blur(10px)';
                div.style.boxShadow = '0 4px 15px rgba(0,0,0,0.05)';
                div.onclick = () => openUserProfile(f.id);
                div.style.cursor = 'pointer';
                div.innerHTML = `
                    <div class="me-3">${typeof window.renderAvatar === 'function' ? window.renderAvatar(f, 'md') : ''}</div>
                    <div class="flex-grow-1">
                        <div class="fw-bold">${f.custom_name || f.first_name}</div>
                        <div class="small text-muted">Друг</div>
                    </div>
                    <button class="btn btn-sm btn-outline-danger rounded-pill" onclick="removeFriend(${f.id}, event)">
                        <i class="bi bi-person-dash"></i>
                    </button>
                `;
                container.appendChild(div);
            });
        } else {
            container.innerHTML = '<p class="text-center text-danger">Ошибка: ' + (res.message || 'Unknown') + '</p>';
        }
    } catch (e) {
        console.error("Error loading friends:", e);
    }
}

async function loadFriendRequests() {
    const container = document.getElementById('friends-req-container');
    if (!container) return;
    container.innerHTML = '<div class="text-center py-4"><div class="spinner-border text-primary spinner-border-sm"></div></div>';

    const res = await window.apiRequest({ action: 'get_friends' });
    if (res.status === 'ok') {
        container.innerHTML = '';
        const requests = res.requests || [];
        if (requests.length === 0) {
            container.innerHTML = '<p class="text-center text-muted mt-2">Нет новых заявок</p>';
            return;
        }
        requests.forEach(req => {
            const div = document.createElement('div');
            div.className = 'd-flex align-items-center mb-3 p-3 rounded-4';
            div.style.background = 'rgba(255, 255, 255, 0.7)';
            div.style.backdropFilter = 'blur(10px)';
            div.style.boxShadow = '0 4px 15px rgba(0,0,0,0.05)';
            div.onclick = () => openUserProfile(req.id);
            div.style.cursor = 'pointer';
            div.innerHTML = `
                <div class="me-3">${typeof window.renderAvatar === 'function' ? window.renderAvatar(req, 'md') : ''}</div>
                <div class="flex-grow-1">
                    <div class="fw-bold">${req.custom_name || req.first_name}</div>
                    <div class="small text-muted">Хочет добавить вас</div>
                </div>
                <button class="btn btn-sm btn-primary rounded-pill px-3 fw-bold" onclick="acceptFriend(${req.id}, event)">
                    Принять
                </button>
            `;
            container.appendChild(div);
        });
    } else {
        container.innerHTML = '<p class="text-center text-danger">Ошибка загрузки</p>';
    }
}



// === PROFILE & ACHIEVEMENTS ===

let lastUserUpdateHash = '';
let pendingAvatar = null; // {type: 'emoji', value: '😎', bg: '...'} or null
const COLOR_OPTIONS = [
    'linear-gradient(135deg, #FF9A9E 0%, #FECFEF 100%)',
    'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)',
    'linear-gradient(135deg, #84fab0 0%, #8fd3f4 100%)',
    'linear-gradient(135deg, #fccb90 0%, #d57eeb 100%)',
    'linear-gradient(135deg, #e0c3fc 0%, #8ec5fc 100%)',
    'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
    'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
    'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
];

function renderCurrentUser(user) {
    const userHash = JSON.stringify({
        id: user.id,
        name: user.custom_name || user.first_name,
        photo: user.photo_url,
        avatar: user.custom_avatar
    });

    const userChanged = userHash !== lastUserUpdateHash;
    lastUserUpdateHash = userHash;

    // Update Global State
    if (window.AuthManager) window.AuthManager.setGlobalUser(user);
    window.globalUser = user;
    window.isTesterUser = user?.is_tester === true
        || user?.is_tester === 1
        || user?.is_tester === '1';
    if (window.ScrollQA && typeof window.ScrollQA.refreshAccess === 'function') {
        window.ScrollQA.refreshAccess(user);
    }

    // Header Name
    if (window.safeText) window.safeText('user-name-display', user.custom_name || user.first_name);

    // Header Avatar (disable fullscreen click to preserve profile navigation)
    const headAv = document.getElementById('lobby-user-avatar');
    // Assuming renderAvatar is available globally (from display-avatars.js)
    if (headAv && window.renderAvatar) headAv.innerHTML = window.renderAvatar(user, 'sm', false, true);

    // === PROFILE TAB UPDATES ===
    if (window.safeText) window.safeText('profile-name-big', user.custom_name || user.first_name);

    // Avatar Big
    const bigAv = document.getElementById('profile-avatar-big');
    if (bigAv && window.renderAvatar) {
        // Preserve badge if it exists
        const badge = bigAv.querySelector('.profile-level-badge-float');
        bigAv.innerHTML = window.renderAvatar(user, 'xxl');
        if (badge) bigAv.appendChild(badge);
    }

    // Also update "My Stats" if needed
    if (userChanged || document.getElementById('profile-name-big')?.textContent === '...') {
        loadMyProfileStats();
    }
}

function renderAchievements(achievements) {
    if (!achievements || achievements.length === 0) {
        return '<div class="text-muted small w-100 py-4 text-center">Пока нет достижений 🕸️</div>';
    }

    return `
    <div class="achievement-list">
        ${achievements.map(a => `
                <div class="achievement-card">
                    <div class="achievement-icon-container">
                        ${renderAchievementIconHtml(a, 'bi-trophy-fill')}
                    </div>
                    <div class="achievement-info">
                        <div class="achievement-name">${a.name || 'Achievement'}</div>
                        <div class="achievement-desc">${a.description}</div>
                    </div>
                </div>
            `).join('')}
    </div>
    `;
}

function openProfileEditor() {
    const user = window.globalUser || { first_name: 'Guest' };

    // Set name
    const nameInput = document.getElementById('profile-name-input');
    if (nameInput) nameInput.value = user.custom_name || user.first_name;

    // Show Edit Screen
    if (window.showScreen) window.showScreen('profile-edit');

    // Render Color Grid
    const colorGrid = document.getElementById('color-grid');
    if (colorGrid) {
        colorGrid.innerHTML = '';
        COLOR_OPTIONS.forEach(bg => {
            const el = document.createElement('div');
            el.className = 'color-option';
            el.style.background = bg;
            el.onclick = () => {
                // selectColor Logic inline or helper? Inline for now
                if (!pendingEmoji) pendingEmoji = { type: 'emoji', value: '😎', bg: bg };
                else pendingEmoji.bg = bg;
                updatePreview();
            };
            colorGrid.appendChild(el);
        });
    }

    // Render Emoji Picker
    renderEmojiPicker();

    // Reset pending
    const userConfig = user.custom_avatar ? JSON.parse(user.custom_avatar) : null;

    // Split into separated states to preserve user input when switching tabs
    if (userConfig && userConfig.type === 'image') {
        pendingImage = userConfig;
        pendingEmoji = { type: 'emoji', value: '😎', bg: COLOR_OPTIONS[0] };
        activeAvatarTab = 'photo';
    } else if (userConfig && userConfig.type === 'emoji') {
        pendingImage = null;
        pendingEmoji = userConfig;
        activeAvatarTab = 'emoji';
    } else {
        // No avatar/default
        pendingImage = null;
        pendingEmoji = { type: 'emoji', value: '😎', bg: COLOR_OPTIONS[0] };
        activeAvatarTab = 'emoji';
    }

    switchAvatarTab(activeAvatarTab);
    updatePreview();
}

let activeAvatarTab = 'emoji';
let pendingEmoji = null;
let pendingImage = null;

const POPULAR_EMOJIS = [
    '😎', '🤩', '🥳', '🤯', '🥶', '🤠', '👻', '💀', '👽', '🤖',
    '👾', '🎃', '😺', '🙈', '🙉', '🙊', '🐶', '🐺', '🦊', '🦁',
    '🐯', '🦄', '🐲', '🐹', '🐰', '🐻', '🐼', '🐨', '🐸', '🐙',
    '🔥', '✨', '⚡', '🌈', '💎', '👑', '🏆', '🎮', '🎨', '🚀'
];

function renderEmojiPicker() {
    const container = document.getElementById('emoji-picker-container');
    if (!container) return;

    container.innerHTML = '';
    POPULAR_EMOJIS.forEach(emoji => {
        const el = document.createElement('div');
        el.className = 'emoji-option';
        el.innerText = emoji;
        el.style.fontSize = '24px';
        el.style.cursor = 'pointer';
        el.style.textAlign = 'center';
        el.style.padding = '5px';
        el.style.borderRadius = '8px';
        el.style.transition = 'background 0.2s';

        el.onclick = () => selectEmoji(emoji, el);

        // Highlight if selected
        if (pendingEmoji && pendingEmoji.value === emoji) {
            el.classList.add('selected');
            el.style.background = 'var(--divider, #eee)';
        }

        container.appendChild(el);
    });
}

function switchAvatarTab(tab) {
    activeAvatarTab = tab;

    // UI Updates
    document.querySelectorAll('.avatar-tab-pane').forEach(el => el.style.display = 'none');

    const pane = document.querySelector(`#tab-pane-${tab}`);
    if (pane) pane.style.display = 'block';

    document.querySelectorAll('[id^="tab-btn-"]').forEach(el => {
        el.classList.remove('bg-white', 'shadow-sm', 'text-primary');
        el.classList.add('text-muted');
    });

    const btn = document.getElementById(`tab-btn-${tab}`);
    if (btn) {
        btn.classList.add('bg-white', 'shadow-sm', 'text-primary');
        btn.classList.remove('text-muted');
    }

    updatePreview();
}

function updatePreview() {
    const preview = document.getElementById('avatar-preview-area');
    if (!preview) return;

    let configToShow = null;

    if (activeAvatarTab === 'emoji') {
        configToShow = pendingEmoji;
    } else if (activeAvatarTab === 'photo' || activeAvatarTab === 'draw') {
        configToShow = pendingImage;
    }

    if (configToShow && configToShow.type === 'image') {
        preview.innerHTML = `<img src="${configToShow.src}" style="width: 100%; height: 100%; object-fit: cover;">`;
    }
    else if (configToShow && configToShow.type === 'emoji') {
        preview.innerHTML = `<div style="width:100%; height:100%; background: ${configToShow.bg}; display:flex; align-items:center; justify-content:center; font-size: 40px;">${configToShow.value}</div>`;
    }
    else {
        // Fallback for empty state based on tab
        if ((activeAvatarTab === 'photo' || activeAvatarTab === 'draw') && !pendingImage) {
            preview.innerHTML = `<div class="d-flex align-items-center justify-content-center w-100 h-100 bg-light text-muted"><i class="bi bi-image fs-1 opacity-25"></i></div>`;
        } else if (activeAvatarTab === 'emoji' && !pendingEmoji) {
            preview.innerHTML = `<div style="width:100%; height:100%; background: #ddd; display:flex; align-items:center; justify-content:center; font-size: 40px;">😎</div>`;
        } else {
            preview.innerHTML = `<div class="d-flex align-items-center justify-content-center w-100 h-100 bg-light text-muted"><i class="bi bi-person fs-1 opacity-25"></i></div>`;
        }
    }
}

function handleAvatarUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Resize image (simplified for brevity, assume similar logic to app.js)
    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const MAX_SIZE = 300;
            let width = img.width;
            let height = img.height;

            if (width > height) {
                if (width > MAX_SIZE) {
                    height *= MAX_SIZE / width;
                    width = MAX_SIZE;
                }
            } else {
                if (height > MAX_SIZE) {
                    width *= MAX_SIZE / height;
                    height = MAX_SIZE;
                }
            }
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            canvas.toBlob((blob) => {
                const url = URL.createObjectURL(blob);
                pendingImage = {
                    type: 'image',
                    src: url,
                    blob: blob // keep blob for upload
                };
                // Auto switch to photo tab if uploaded
                switchAvatarTab('photo');
            }, 'image/jpeg', 0.85);
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

// Avatar Editor Integration

window.avatarEditor = null;

function openAvatarEditorWrapper() {
    // Assuming window.openAvatarEditor is defined in app.js or we move it here?
    // We should move logic here.
    const overlay = document.getElementById('avatar-editor-overlay');
    if (!overlay) return;
    overlay.style.display = 'flex';

    // Check if script loaded
    if (typeof AvatarEditor === 'undefined') {
        if (window.showAlert) window.showAlert('Ошибка', 'Модуль редактора не загружен', 'error');
        return;
    }

    if (!window.avatarEditor) {
        window.avatarEditor = new AvatarEditor('avatar-canvas', 'avatar-canvas-container');
    } else {
        window.avatarEditor.resize();
    }
    document.body.style.overflow = 'hidden';
}

// NOTE: We'll stick to 'openAvatarEditor' global name if possible or update HTML.
// Currently app.js has window.openAvatarEditor. 
// We will assign window.openAvatarEditor = openAvatarEditorWrapper; in exports.

async function saveDrawnAvatar() {
    if (!window.avatarEditor) return;
    try {
        const blob = await window.avatarEditor.getBlob();
        const url = URL.createObjectURL(blob);
        pendingImage = {
            type: 'image',
            src: url,
            blob: blob
        };
        // For better UX during split tabs, we can just update preview.
        // The user stays on 'draw' tab but sees the result in the top preview.
        updatePreview();

        // Close editor
        const overlay = document.getElementById('avatar-editor-overlay');
        if (overlay) overlay.style.display = 'none';
        document.body.style.overflow = '';

        if (window.showToast) window.showToast('Аватар обновлен. Нажмите "Сохранить"!', 'success');
    } catch (e) {
        console.error("Avatar Save Error", e);
    }
}


// ... (previous code)

function closeProfileEditor() {
    if (window.showScreen) window.showScreen('lobby');
    if (window.switchTab) window.switchTab('profile');
}

function selectEmoji(emoji, el) {
    document.querySelectorAll('.emoji-option').forEach(e => e.classList.remove('selected'));
    el.classList.add('selected');

    // Always update pendingEmoji
    if (!pendingEmoji) pendingEmoji = { type: 'emoji', value: emoji, bg: COLOR_OPTIONS[0] };
    else pendingEmoji.value = emoji;

    // Note: If user click emoji while in 'photo' tab, should we switch? Maybe not.
    // But preview will only update if on emoji tab.
    updatePreview();
}

function selectColor(bg, el) {
    document.querySelectorAll('.color-option').forEach(e => e.classList.remove('selected'));
    el.classList.add('selected');

    if (!pendingEmoji) pendingEmoji = { type: 'emoji', value: '😎', bg: bg };
    else pendingEmoji.bg = bg;

    updatePreview();
}

async function saveProfile() {
    const nameInput = document.getElementById('profile-name-input');
    const name = nameInput.value;

    const formData = new FormData();
    formData.append('action', 'update_profile');
    // Assuming authToken is global or accessible via AuthManager
    const token = window.AuthManager ? window.AuthManager.getAuthToken() : (window.authToken || localStorage.getItem('pg_token'));
    formData.append('token', token);
    formData.append('name', name);

    let avatarToSave = null;
    if (activeAvatarTab === 'emoji') {
        avatarToSave = pendingEmoji;
        // Fix: Ensure we fallback to defaults if null but user was on this tab?
        // Actually pendingEmoji is initialized in open.
    } else if (activeAvatarTab === 'photo' || activeAvatarTab === 'draw') {
        avatarToSave = pendingImage;
    }

    if (avatarToSave) {
        // If it's an image with a blob, send as file
        if (avatarToSave.type === 'image' && avatarToSave.blob) {
            formData.append('avatar_image', avatarToSave.blob, 'avatar.jpg');
            // We send a config placeholder, the server will replace src with base64
            formData.append('avatar_config', JSON.stringify({ type: 'image', src: 'placeholder' }));
        } else {
            formData.append('avatar_config', JSON.stringify(avatarToSave));
        }
    } else {
        // No avatar selected for this tab?
        // Maybe user wants to clear it? Or just keep old?
        // Logic: if tab is active but empty, we might not send update?
        // Or send null? Let's check logic.
        // If photo tab active but no photo -> Don't update avatar?
    }

    if (window.apiRequest) {
        await window.apiRequest(formData);
        location.reload();
    }
}

// === FRIENDS TAB SWITCHING ===
function switchFriendsTab(tabName) {
    // 1. Remove active class from buttons
    document.querySelectorAll('#screen-friends .nav-link').forEach(el => el.classList.remove('active'));

    // 2. Hide all panes
    document.querySelectorAll('.friends-tab-pane').forEach(el => el.style.display = 'none');

    // 3. Activate selected
    if (tabName === 'my') {
        const btn = document.getElementById('btn-friends-my');
        if (btn) btn.classList.add('active');
        const tab = document.getElementById('tab-friends-my');
        if (tab) tab.style.display = 'block';
        if (window.loadFriendsList) window.loadFriendsList();
    } else {
        const btn = document.getElementById('btn-friends-requests');
        if (btn) btn.classList.add('active');
        const tab = document.getElementById('tab-friends-requests');
        if (tab) tab.style.display = 'block';
        if (window.loadFriendRequests) window.loadFriendRequests();
    }
}

// === EXPORTS ===
window.SocialManager = {
    loadMyProfileStats,
    openDetailedStatsModal,
    fetchUserStats,
    openUserProfile,
    openFriendsModal,
    loadFriends,
    searchFriendsAction,
    addFriend,
    acceptFriend,
    removeFriend,
    openLeaderboardScreen,
    loadLeaderboardList,
    openFriendsScreen,
    closeFriendsScreen,
    loadFriendsList,
    loadFriendRequests,
    loadFriendRequests,
    getCachedUserStats: () => cachedUserStats,
    loadProfileDailyTasks,
    toggleProfileDailyTasks,
    showAllProfileDailyTasks,
    collapseProfileDailyTasks,
    claimProfileDailyTask,
    openDailyTasksModal,
    claimDailyTaskReward,
    setRewardsView,
    setRewardsAchievementFilter,
    resetRewardsView,
    closeRewardsModal,

    // NEW PROFILE LOGIC
    renderCurrentUser,
    openProfileEditor,
    handleAvatarUpload,
    saveDrawnAvatar,
    renderAchievements,

    // MISSING LOGIC ADDED
    closeProfileEditor,
    selectEmoji,
    selectColor,
    saveProfile,
    switchAvatarTab,
    switchFriendsTab
};

// Global aliases
window.loadMyProfileStats = loadMyProfileStats;
window.loadProfileDailyTasks = loadProfileDailyTasks;
window.toggleProfileDailyTasks = toggleProfileDailyTasks;
window.showAllProfileDailyTasks = showAllProfileDailyTasks;
window.collapseProfileDailyTasks = collapseProfileDailyTasks;
window.claimProfileDailyTask = claimProfileDailyTask;
window.openDailyTasksModal = openDailyTasksModal;
window.claimDailyTaskReward = claimDailyTaskReward;
window.setRewardsView = setRewardsView;
window.setRewardsAchievementFilter = setRewardsAchievementFilter;
window.resetRewardsView = resetRewardsView;
window.closeRewardsModal = closeRewardsModal;
window.openDetailedStatsModal = openDetailedStatsModal;
window.fetchUserStats = fetchUserStats;
window.openUserProfile = openUserProfile;
window.openFriendsModal = openFriendsModal;
window.loadFriends = loadFriends;
window.searchFriendsAction = searchFriendsAction;
window.addFriend = addFriend;
window.acceptFriend = acceptFriend;
window.removeFriend = removeFriend;
window.openLeaderboardScreen = openLeaderboardScreen;
window.loadLeaderboardList = loadLeaderboardList;
window.loadLeaderboard = loadLeaderboardList; // compat alias
window.openFriendsScreen = openFriendsScreen;
window.closeFriendsScreen = closeFriendsScreen;
window.loadFriendsList = loadFriendsList;
window.loadFriendRequests = loadFriendRequests;
window.switchFriendsTab = switchFriendsTab;

window.addEventListener('tabChanged', (event) => {
    if (event.detail && event.detail.tabId === 'profile') {
        loadMyProfileStats();
    }
});


// Profile Aliases
window.updateUserInfo = renderCurrentUser; // Alias for compat
window.openProfileEditor = openProfileEditor;
window.handleAvatarUpload = handleAvatarUpload;
window.saveDrawnAvatar = saveDrawnAvatar;
window.renderAchievements = renderAchievements;
window.saveProfile = saveProfile;
window.closeProfileEditor = closeProfileEditor;
window.selectEmoji = selectEmoji;
window.selectColor = selectColor;
