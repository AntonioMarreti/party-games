(function () {
    let lastStatus = null;

    function isAdmin(user = window.globalUser) {
        return user?.is_admin === true || user?.is_admin === 1 || user?.is_admin === '1';
    }

    function isTester(user = window.globalUser) {
        return isAdmin(user)
            || user?.is_tester === true
            || user?.is_tester === 1
            || user?.is_tester === '1';
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function openSuggestionModal() {
        const suggestPanel = document.getElementById('wordclash-dictionary-suggest-panel');
        const title = document.getElementById('wordclash-dictionary-title');
        if (!suggestPanel) return;

        suggestPanel.style.display = '';
        if (title) title.textContent = 'Предложить слово для Wordclash';

        const modalEl = document.getElementById('wordclashDictionaryModal');
        if (modalEl && window.bootstrap) {
            bootstrap.Modal.getOrCreateInstance(modalEl).show();
        }
    }

    async function refreshDictionaryAdmin(word = '') {
        const res = await window.apiRequest({ action: 'wordclash_dictionary_get', word });
        if (res.status !== 'ok') {
            clearSearchResult();
            renderStatus(res.message || 'Ошибка загрузки');
            return;
        }
        if (res.word_status) {
            lastStatus = res.word_status;
            renderWordStatus(res.word_status);
        }
        renderCounts(res.counts);
        renderSuggestions(res.suggestions || []);
        renderAudit(res.audit || []);
    }

    function renderStatus(text) {
        const el = document.getElementById('wordclash-dictionary-status');
        if (el) el.textContent = text;
    }

    function renderSearchResult(text) {
        const result = document.getElementById('wordclash-dictionary-result');
        const resultText = document.getElementById('wordclash-dictionary-result-text');
        if (resultText) resultText.textContent = text;
        if (result) result.hidden = false;
    }

    function renderSearchResultHtml(html) {
        const result = document.getElementById('wordclash-dictionary-result');
        const resultText = document.getElementById('wordclash-dictionary-result-text');
        if (resultText) resultText.innerHTML = html;
        if (result) result.hidden = false;
    }

    function clearSearchResult() {
        const result = document.getElementById('wordclash-dictionary-result');
        const resultText = document.getElementById('wordclash-dictionary-result-text');
        const actions = document.getElementById('wordclash-dictionary-actions');
        if (result) result.hidden = true;
        if (resultText) resultText.textContent = '';
        if (actions) actions.innerHTML = '';
    }

    function dictionaryStateLabel(state) {
        const labels = {
            active: 'В словаре',
            removed: 'Убрано из загадок',
            banned: 'Запрещено для загадок',
            absent: 'Не добавлено в словарь',
            add: 'добавлено в словарь',
            remove: 'убрано из загадок',
            restore: 'возвращено в словарь',
            ban: 'запрещено для загадок',
            unban: 'разрешено снова',
            suggest: 'предложено',
            suggestion_approved: 'предложение одобрено',
            suggestion_rejected: 'предложение отклонено'
        };
        return labels[state] || state || 'неизвестно';
    }

    function dictionaryStatusTone(state) {
        if (state === 'active') return 'active';
        if (state === 'banned') return 'banned';
        if (state === 'removed') return 'removed';
        return 'absent';
    }

    function dictionaryStatusDescription(status) {
        const acceptsGuess = !!status.in_broad_guess;
        if (status.state === 'banned') {
            return acceptsGuess
                ? 'Игра может принять это слово как попытку, но не выберет его загадкой.'
                : 'Слово запрещено для загадок и не найдено в словаре допустимых попыток.';
        }
        if (status.state === 'active') {
            return acceptsGuess
                ? 'Может быть загадкой и принимается в попытках.'
                : 'Может быть загадкой, но не найдено в словаре допустимых попыток.';
        }
        if (status.state === 'removed') {
            return acceptsGuess
                ? 'Не выпадет загадкой, но принимается в попытках.'
                : 'Не выпадет загадкой и не найдено в словаре допустимых попыток.';
        }
        if (acceptsGuess) {
            return 'Слово принимается в попытках и его можно добавить как возможную загадку.';
        }
        return 'Слова нет в широком словаре допустимых попыток, поэтому его нельзя добавить как загадку.';
    }

    function renderWordStatus(status) {
        const label = dictionaryStateLabel(status.state);
        renderStatus('');
        renderSearchResultHtml(`
            <div class="wordclash-search-word">${escapeHtml(status.word)}</div>
            <div class="wordclash-search-meta">
                <span>${escapeHtml(status.length)} букв</span>
                <span aria-hidden="true">·</span>
                <span class="wordclash-search-status-chip is-${dictionaryStatusTone(status.state)}">${escapeHtml(label)}</span>
            </div>
            <div class="wordclash-search-description">${escapeHtml(dictionaryStatusDescription(status))}</div>
        `);
        renderActions(status);
    }

    function renderActionButton(buttons, op, word, label, className) {
        buttons.push(`<button type="button" class="btn btn-sm ${className} rounded-pill" onclick="runWordclashDictionaryAction('${op}', '${word}')">${label}</button>`);
    }

    function renderActions(status) {
        const el = document.getElementById('wordclash-dictionary-actions');
        if (!el) return;
        const word = escapeHtml(status.word);
        const buttons = [];
        if (status.state === 'banned') {
            renderActionButton(buttons, 'unban', word, 'Разрешить снова', 'btn-outline-warning');
        } else if (status.state === 'active') {
            renderActionButton(buttons, 'remove', word, 'Убрать из загадок', 'btn-outline-secondary');
            renderActionButton(buttons, 'ban', word, 'Запретить', 'btn-outline-danger');
        } else if (status.state === 'removed') {
            renderActionButton(buttons, 'restore', word, 'Вернуть в словарь', 'btn-outline-primary');
            renderActionButton(buttons, 'ban', word, 'Запретить', 'btn-outline-danger');
        } else if (status.state === 'absent') {
            if (status.in_broad_guess) {
                renderActionButton(buttons, 'add', word, 'Добавить в словарь', 'btn-success');
                renderActionButton(buttons, 'ban', word, 'Запретить', 'btn-outline-danger');
            }
        }
        el.innerHTML = buttons.join('');
    }

    function actionResultMessage(op, status) {
        const word = status?.word || 'Слово';
        const messages = {
            add: `${word} добавлено в словарь загадок.`,
            remove: `${word} убрано из загадок.`,
            restore: `${word} возвращено в словарь загадок.`,
            ban: `${word} запрещено для загадок.`,
            unban: `${word} разрешено снова и переведено в убранные.`
        };
        return messages[op] || 'Изменение сохранено.';
    }

    function renderCounts(counts) {
        const el = document.getElementById('wordclash-dictionary-counts');
        if (!el || !counts) return;
        const rows = [5, 6, 7].map(length => {
            const c = counts[String(length)] || {};
            return `<span>${length} букв · <strong>${Number(c.active || 0)}</strong></span>`;
        }).join('');
        el.innerHTML = `
            <div class="wordclash-dictionary-count-title">В словаре</div>
            <div class="wordclash-dictionary-count-list">${rows}</div>
        `;
    }

    function renderSuggestions(items) {
        const el = document.getElementById('wordclash-dictionary-suggestions');
        const badge = document.getElementById('wordclash-dictionary-suggestions-badge');
        if (!el) return;
        if (badge) {
            badge.textContent = String(items.length);
            badge.hidden = false;
        }
        if (!items.length) {
            el.innerHTML = '<div class="text-muted small">Пока нет предложений.</div>';
            return;
        }
        el.innerHTML = items.map(item => `
            <div class="wordclash-dictionary-suggestion-card">
                <div class="d-flex justify-content-between gap-2">
                    <div class="fw-bold">${escapeHtml(item.word)} <span class="text-muted small">${escapeHtml(item.word_length)} букв</span></div>
                    <div class="text-muted small text-nowrap">${escapeHtml(item.created_at || '')}</div>
                </div>
                <div class="small text-muted mt-1">${escapeHtml(item.comment || 'Без комментария')}</div>
                <div class="small text-muted mt-1">Пользователь #${escapeHtml(item.author_user_id || '—')}</div>
                <div class="d-flex flex-wrap gap-2 mt-3">
                    <button type="button" class="btn btn-sm btn-success rounded-pill" onclick="reviewWordclashDictionarySuggestion(${Number(item.id)}, 'approved')">Одобрить</button>
                    <button type="button" class="btn btn-sm btn-outline-secondary rounded-pill" onclick="reviewWordclashDictionarySuggestion(${Number(item.id)}, 'rejected')">Отклонить</button>
                </div>
            </div>
        `).join('');
    }

    function renderAudit(items) {
        const el = document.getElementById('wordclash-dictionary-audit');
        if (!el) return;
        if (!items.length) {
            el.innerHTML = '<div>Пока нет изменений.</div>';
            return;
        }
        el.innerHTML = items.map(item => `
            <div class="wordclash-dictionary-audit-row">
                <span>${escapeHtml(item.timestamp)}</span>
                <strong>${escapeHtml(item.word)}</strong>
                <span>${escapeHtml(dictionaryStateLabel(item.action))}</span>
                <span>${escapeHtml(item.word_length)} букв</span>
            </div>
        `).join('');
    }

    window.refreshWordclashDictionaryAccess = function (user = window.globalUser) {
        const toolsRow = document.getElementById('game-tools-row');
        if (toolsRow) toolsRow.style.display = isTester(user) ? '' : 'none';

        const adminToolRow = document.getElementById('wordclash-tool-admin-row');
        const suggestToolRow = document.getElementById('wordclash-tool-suggest-row');
        const hasAdminAccess = isAdmin(user);
        const hasTesterAccess = user?.is_tester === true
            || user?.is_tester === 1
            || user?.is_tester === '1';
        if (adminToolRow) {
            adminToolRow.style.display = hasAdminAccess ? '' : 'none';
            adminToolRow.classList.toggle('border-0', hasAdminAccess && !hasTesterAccess);
            adminToolRow.classList.toggle('pb-0', hasAdminAccess && !hasTesterAccess);
        }
        if (suggestToolRow) {
            suggestToolRow.style.display = hasTesterAccess ? '' : 'none';
        }
    };

    window.openGameTools = function () {
        if (!isTester()) return;
        if (window.showScreen) window.showScreen('game-tools');
    };

    window.closeGameToolsScreen = function () {
        if (window.showScreen) window.showScreen('lobby');
        if (window.switchTab) window.switchTab('profile');
    };

    window.openWordclashDictionaryAdmin = function () {
        if (!isAdmin()) return;
        lastStatus = null;
        const input = document.getElementById('wordclash-dictionary-search');
        if (input) input.value = '';
        clearSearchResult();
        renderStatus('Введите слово для проверки.');
        if (window.showScreen) window.showScreen('wordclash-dictionary');
        refreshDictionaryAdmin();
    };

    window.closeWordclashDictionaryScreen = function () {
        if (window.showScreen) window.showScreen('game-tools');
    };

    window.openWordclashDictionarySuggest = function () {
        openSuggestionModal();
    };

    window.searchWordclashDictionaryWord = function () {
        const input = document.getElementById('wordclash-dictionary-search');
        const word = input ? input.value.trim() : '';
        if (!word) {
            renderStatus('Введите слово для проверки.');
            clearSearchResult();
            return;
        }
        refreshDictionaryAdmin(word);
    };

    window.runWordclashDictionaryAction = async function (op, word) {
        const res = await window.apiRequest({ action: 'wordclash_dictionary_action', op, word });
        if (res.status !== 'ok') {
            const actions = document.getElementById('wordclash-dictionary-actions');
            if (actions) actions.innerHTML = '';
            renderSearchResult(res.message || 'Действие невозможно');
            renderStatus(res.message || 'Ошибка изменения');
            return;
        }
        lastStatus = res.word_status || lastStatus;
        if (lastStatus) renderWordStatus(lastStatus);
        renderStatus(res.message || actionResultMessage(op, lastStatus));
        renderCounts(res.counts);
        renderSuggestions(res.suggestions || []);
        renderAudit(res.audit || []);
    };

    window.reviewWordclashDictionarySuggestion = async function (suggestionId, decision) {
        const res = await window.apiRequest({
            action: 'wordclash_dictionary_review_suggestion',
            suggestion_id: suggestionId,
            decision
        });
        if (res.status !== 'ok') {
            renderStatus(res.message || 'Ошибка обработки предложения');
            return;
        }
        renderCounts(res.counts);
        renderSuggestions(res.suggestions || []);
        renderAudit(res.audit || []);
    };

    window.submitWordclashDictionarySuggestion = async function () {
        const wordEl = document.getElementById('wordclash-dictionary-suggest-word');
        const commentEl = document.getElementById('wordclash-dictionary-suggest-comment');
        const resultEl = document.getElementById('wordclash-dictionary-suggest-result');
        const res = await window.apiRequest({
            action: 'wordclash_dictionary_suggest',
            word: wordEl ? wordEl.value.trim() : '',
            comment: commentEl ? commentEl.value.trim() : ''
        });
        if (resultEl) {
            resultEl.textContent = res.status === 'ok'
                ? 'Предложение отправлено.'
                : (res.message || 'Ошибка отправки');
        }
        if (res.status === 'ok') {
            if (wordEl) wordEl.value = '';
            if (commentEl) commentEl.value = '';
        }
    };
})();
