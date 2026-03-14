window.startMsTutorial = function() {
    window._msInTutorial = true;
    window._msTutorialStep = 0;
    
    // Initial board for tutorial (5x5)
    // 0 0 0 0 0
    // 0 1 m m 0  (7, 8 are mines)
    // 0 1 2 2 1  (11=1, 12=2, 13=2, 14=1)
    // 0 0 0 0 0
    // 0 0 0 0 0
    window._msTutorialData = {
        grid: [
            0, 0, 0, 0, 0,
            0, 1, -1, -1, 0,
            0, 1, 2, 2, 0,
            0, 0, 0, 0, 0,
            0, 0, 0, 0, 0
        ],
        revealed: {},
        flags: {},
        boardSize: [5, 5],
        status: 'playing',
        turnOrder: ['player'],
        currentTurnIndex: 0,
        safeCellsRemaining: 23,
        mineCount: 2,
        scores: { player: 0 },
        stunned: {}
    };
    
    render_minesweeper_br({
        room: { game_state: JSON.stringify(window._msTutorialData) },
        user: { id: window.currentUser?.id || 'player' },
        players: [{ id: window.currentUser?.id || 'player', first_name: 'Вы' }],
        _isTutorial: true
    });
};

window.advanceMsTutorial = function(action, data) {
    const step = window._msTutorialStep;
    const state = window._msTutorialData;
    
    if (step === 0 && action === 'reveal' && data.index === 12) {
        window._msTutorialStep = 1;
        state.revealed[12] = 'player';
        state.revealed[11] = 'player'; // reveal nearby 1 for comparison
    } else if (step === 1 && action === 'flag' && data.index === 7) {
        window._msTutorialStep = 2;
        state.flags[7] = 'player';
    } else if (step === 2 && action === 'flag' && data.index === 8) {
        window._msTutorialStep = 3;
        state.flags[8] = 'player';
    } else if (step === 3 && action === 'chord' && data.index === 12) {
        window._msTutorialStep = 4;
        [6, 13, 16, 17, 18].forEach(idx => state.revealed[idx] = 'player');
    }
    
    render_minesweeper_br({
        room: { game_state: JSON.stringify(state) },
        user: { id: window.currentUser?.id || 'player' },
        players: [{ id: window.currentUser?.id || 'player', first_name: 'Вы' }],
        _isTutorial: true
    });
};

window.minesweeperSetDifficulty = function(diff) {
    if (window.ThemeManager) window.ThemeManager.triggerHaptic('selection');
    sendGameAction('set_difficulty', { difficulty: diff });
};

window.minesweeperStartGame = function() {
    if (window.ThemeManager) window.ThemeManager.triggerHaptic('impact', 'medium');
    sendGameAction('start_game');
};

window.minesweeperReveal = function (idx) {
    if (window._msInTutorial) {
        window.advanceMsTutorial('reveal', {index: idx});
        return;
    }
    if (window.ThemeManager) window.ThemeManager.triggerHaptic('impact', 'light');
    sendGameAction('reveal_cell', { index: idx });
};

// ... replace other actions similarly ...
window.triggerMineFeedback = function() {
// ... existing code ...
    const root = document.getElementById('ms-board-root');
    if (root) {
        root.classList.add('ms-shake');
        document.body.classList.add('ms-hit-flash');
        if (window.ThemeManager) window.ThemeManager.triggerHaptic('notification', 'error');
        setTimeout(() => {
            root.classList.remove('ms-shake');
            document.body.classList.remove('ms-hit-flash');
        }, 500);
    }
};

window.minesweeperToggleFlag = function (idx) {
    if (window._msInTutorial) {
        window.advanceMsTutorial('flag', {index: idx});
        return;
    }
    if (window.ThemeManager) window.ThemeManager.triggerHaptic('selection');
    sendGameAction('toggle_flag', { index: idx });
};

window.minesweeperChord = function (idx) {
    if (window._msInTutorial) {
        window.advanceMsTutorial('chord', {index: idx});
        return;
    }
    if (window.ThemeManager) window.ThemeManager.triggerHaptic('impact', 'medium');
    sendGameAction('chord', { index: idx });
};

window.minesweeperFinish = function () {
    if (window._msInTutorial) {
        window._msInTutorial = false;
        // Cleanup UI elements
        document.querySelectorAll('.ms-tutorial-pane, .ms-tutorial-dimmer').forEach(el => el.remove());
        // Instead of reload, just trigger a state check to return to lobby
        if (window.checkState) window.checkState();
        return;
    }
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
