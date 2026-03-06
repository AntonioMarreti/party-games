// js/games/minesweeper/index.js

window.minesweeperStartGame = function () {
    sendGameAction('start_game');
};

window.minesweeperSetDifficulty = function (diff) {
    // Optimistic UI: instantly update checkmarks
    const diffs = ['easy', 'medium', 'hard'];
    diffs.forEach(d => {
        const btn = document.getElementById(`ms-diff-${d}`);
        if (!btn) return;
        const checkSpan = btn.querySelector('.ms-diff-check');
        if (d === diff) {
            btn.classList.add('active');
            if (checkSpan) checkSpan.innerHTML = '<i class="bi bi-check-circle-fill text-primary"></i>';
        } else {
            btn.classList.remove('active');
            if (checkSpan) checkSpan.innerHTML = '';
        }
    });
    // Then sync with server
    sendGameAction('set_difficulty', { difficulty: diff });
};

window.minesweeperReveal = function (idx) {
    if (window.ThemeManager) window.ThemeManager.triggerHaptic('impact', 'light');
    sendGameAction('reveal_cell', { index: idx });
};

window.minesweeperToggleFlag = function (idx) {
    if (window.ThemeManager) window.ThemeManager.triggerHaptic('selection');
    sendGameAction('toggle_flag', { index: idx });
};

window.minesweeperChord = function (idx) {
    if (window.ThemeManager) window.ThemeManager.triggerHaptic('impact', 'medium');
    sendGameAction('chord', { index: idx });
};

window.minesweeperFinish = function () {
    sendGameAction('back_to_lobby');
};

window.minesweeperSetMode = function (flagMode) {
    window._msFlagMode = flagMode;
    if (window.ThemeManager) window.ThemeManager.triggerHaptic('selection');
    // Update segmented control buttons
    document.querySelectorAll('.ms-mode-btn').forEach(btn => {
        const isFlag = btn.textContent.trim().includes('Флажок');
        btn.classList.toggle('active', isFlag === flagMode);
        btn.classList.toggle('flag-mode', isFlag && flagMode);
    });
};

window.minesweeperToggleFlagMode = function () {
    window.minesweeperSetMode(!window._msFlagMode);
};

// Header menu toggle
window.toggleMsMenu = function (e) {
    if (e) e.stopPropagation();
    const menu = document.getElementById('ms-header-menu');
    if (!menu) return;

    const isOpen = menu.classList.contains('active');
    if (isOpen) {
        menu.classList.remove('active');
    } else {
        menu.classList.add('active');
        setTimeout(() => document.addEventListener('click', closeMsMenu, { once: true }), 0);
    }
};

function closeMsMenu() {
    const menu = document.getElementById('ms-header-menu');
    if (menu) {
        menu.classList.remove('active');
    }
}
