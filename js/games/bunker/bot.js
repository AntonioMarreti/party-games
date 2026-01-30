/**
 * Bunker Bot Logic
 * Automatically plays for bot users when the current client is the Host.
 */
window.BunkerBot = {
    isThinking: false,

    check: function (state, players, isHost) {
        if (!isHost) return;
        if (this.isThinking) return;

        var activeId = state.current_player_id;
        if (!activeId) return;

        // Find active player
        var activePlayer = players.find(function (p) { return String(p.id) === String(activeId); });

        // Check if Bot (assuming 'is_bot' flag or specific naming convention if flag missing)
        // In Blokus we used 'is_bot' column. Let's assume it's passed in 'players' array.
        // If not, we might need to rely on other markers. 
        // For now, let's assume if it has is_bot=1.

        if (activePlayer && activePlayer.is_bot) {
            console.log("🤖 Bot Turn Detected:", activePlayer.first_name);
            this.playTurn(state, activePlayer);
        }
    },

    playTurn: function (state, player) {
        var self = this;
        this.isThinking = true;
        var delay = 1500 + Math.random() * 1000;

        setTimeout(function () {
            var result = self.decideAction(state, player);
            if (result) {
                console.log("🤖 Bot Action:", result);
                window.sendGameAction(result.type, result.data);

                // If action was reveal, we also need to end turn after reading
                if (result.type === 'reveal_card' || result.type === 'use_ability') {
                    setTimeout(function () {
                        window.sendGameAction('end_turn');
                        self.isThinking = false;
                    }, 3000);
                } else {
                    self.isThinking = false;
                }
            } else {
                self.isThinking = false;
                // If no action possible, maybe end turn?
                if (state.turn_phase === 'discussion') {
                    window.sendGameAction('end_turn');
                }
            }
        }, delay);
    },

    decideAction: function (state, player) {
        // 1. Voting Phase
        if (state.phase === 'voting' || state.phase === 'tie_voting') {
            // Vote for random alive player (not self)
            var candidates = [];

            // Check global players
            var allPlayers = window.bunkerState && window.bunkerState.lastRes ? window.bunkerState.lastRes.players : [];
            var kicked = state.kicked_players || [];

            if (state.phase === 'tie_voting' && state.tie_candidates) {
                candidates = state.tie_candidates.filter(function (id) {
                    return String(id) !== String(player.id);
                });
            } else {
                candidates = allPlayers.filter(function (p) {
                    return !kicked.includes(String(p.id)) && String(p.id) !== String(player.id);
                }).map(function (p) { return p.id; });
            }

            if (candidates.length > 0) {
                var target = candidates[Math.floor(Math.random() * candidates.length)];
                return { type: 'vote_kick', data: { target_id: target } };
            }
            return null;
        }

        // 2. Round Phase
        if (state.phase === 'round') {
            if (state.turn_phase === 'reveal') {
                // Reveal a random closed card
                var playerCards = state.players_cards[player.id];
                if (!playerCards) return null;

                var closedKeys = [];
                // Standard keys
                ['professions', 'biology', 'health', 'hobby', 'advantages', 'disadvantages', 'luggage', 'facts', 'condition'].forEach(function (k) {
                    if (playerCards[k] && !playerCards[k].revealed) closedKeys.push(k);
                });

                if (closedKeys.length > 0) {
                    var randomKey = closedKeys[Math.floor(Math.random() * closedKeys.length)];
                    return { type: 'reveal_card', data: { card_type: randomKey } };
                }
            } else if (state.turn_phase === 'discussion') {
                // Done discussing
                // Handled in playTurn via timeout
                return null;
            }
        }

        return null;
    }
};
