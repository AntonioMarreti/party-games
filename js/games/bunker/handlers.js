/**
 * Bunker Game Handlers
 * Manages user interactions and server communication.
 * Using 'var' and explicit 'window' scope to allow multiple re-loads via dynamic script tags.
 */

window.BUNKER_ROUND_NAMES = {
    professions: 'Профессия', biology: 'Биология', health: 'Здоровье',
    hobby: 'Хобби', advantages: 'Сильная черта', disadvantages: 'Слабость',
    luggage: 'Багаж', facts: 'Факт', condition: 'Особое условие'
};

window.switchBunkerTab = function (tab) {
    if (window.bunkerState) {
        window.bunkerState.activeTab = tab;
        if (window.bunkerState.lastRes) {
            window.bunkerState.lastStateHash = '';
            window.render_bunker(window.bunkerState.lastRes);
        }
    }
};

window.startBunkerGame = async function () {
    try {
        var hardcore = document.getElementById('modeHardcore')?.checked;
        await window.sendGameAction('init_bunker', {
            mode: hardcore ? 'hardcore' : 'normal'
        });
    } catch (e) {
        alert("Ошибка: " + e.message);
    }
};

window.triggerBunkerReveal = function (key, name) {
    var displayName = name || window.BUNKER_ROUND_NAMES[key] || key;
    if (confirm(`Показать всем карту "${displayName}"?`)) {
        window.sendGameAction('reveal_card', { card_type: key });
    }
};

window.sendVoteQuery = function (val) {
    window.sendGameAction('vote_query_answer', { answer: val });
};

window.sendVoteKick = function (targetId) {
    if (confirm('Точно этот игрок?')) {
        window.sendGameAction('vote_kick', { target_id: targetId });
    }
};

// Use window-scoped flag to survive re-loads safely
window.bunkerIsFinishing = false;

window.bunkerFinish = async function (evt) {
    if (window.bunkerIsFinishing) return;

    var isHost = (window.isHost === true) || (window.bunkerState?.lastRes?.is_host == 1);

    if (!isHost) {
        if (typeof window.leaveRoom === 'function') {
            await window.leaveRoom();
        } else {
            window.location.reload();
        }
        return;
    }

    if (!confirm('Завершить игру и выйти в лобби?')) return;

    window.bunkerIsFinishing = true;

    var btn = evt?.target || (window.event ? window.event.target : null);
    if (btn) {
        btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>...';
        btn.style.opacity = '0.7';
    }

    try {
        var s = window.bunkerState?.lastServerState;
        var r = window.bunkerState?.lastRes;

        if (s && s.kicked_players && r && r.players) {
            try {
                var playersData = r.players.map(function (p) {
                    return {
                        user_id: parseInt(p.id),
                        score: 0,
                        rank: s.kicked_players.includes(String(p.id)) ? 2 : 1
                    };
                });
                if (typeof window.submitGameResults === 'function') {
                    await window.submitGameResults(playersData);
                }
            } catch (err) { console.error(err); }
        }

        await window.apiRequest({ action: 'stop_game' });
        window.bunkerState = { activeTab: 'me', lastRes: null, lastServerState: null, lastStateHash: '' };

        if (typeof window.checkState === 'function') {
            await window.checkState();
        } else {
            window.location.reload();
        }
    } catch (e) {
        alert("Ошибка: " + e.message);
    } finally {
        window.bunkerIsFinishing = false;
        if (btn) {
            btn.innerHTML = '↩️ В Лобби';
            btn.style.opacity = '1';
        }
    }
};

window.finishGameSession = window.bunkerFinish;
