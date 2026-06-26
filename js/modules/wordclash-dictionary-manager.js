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

    function openDictionaryModal(mode) {
        const adminPanel = document.getElementById('wordclash-dictionary-admin-panel');
        const suggestPanel = document.getElementById('wordclash-dictionary-suggest-panel');
        const title = document.getElementById('wordclash-dictionary-title');
        if (!adminPanel || !suggestPanel) return;

        adminPanel.style.display = mode === 'admin' ? '' : 'none';
        suggestPanel.style.display = mode === 'suggest' ? '' : 'none';
        if (title) title.textContent = mode === 'admin' ? 'Словарь Wordclash' : 'Предложить слово для Wordclash';

        if (mode === 'admin') {
            refreshDictionaryAdmin();
        }

        const modalEl = document.getElementById('wordclashDictionaryModal');
        if (modalEl && window.bootstrap) {
            bootstrap.Modal.getOrCreateInstance(modalEl).show();
        }
    }

    async function refreshDictionaryAdmin(word = '') {
        const res = await window.apiRequest({ action: 'wordclash_dictionary_get', word });
        if (res.status !== 'ok') {
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

    function renderWordStatus(status) {
        const parts = [
            `Слово: ${status.word}`,
            `длина: ${status.length}`,
            `статус: ${status.state}`,
            `источник: ${status.source || 'нет'}`,
            status.in_broad_guess ? 'есть в guess-словаре' : 'нет в guess-словаре',
            status.in_static_blacklist ? 'в static blacklist' : 'не в static blacklist',
        ];
        renderStatus(parts.join(' · '));
        renderActions(status);
    }

    function renderActions(status) {
        const el = document.getElementById('wordclash-dictionary-actions');
        if (!el) return;
        const word = escapeHtml(status.word);
        const buttons = [];
        if (status.state === 'absent' || status.state === 'removed') {
            buttons.push(`<button type="button" class="btn btn-sm btn-success rounded-pill" onclick="runWordclashDictionaryAction('add', '${word}')">Добавить</button>`);
        }
        if (status.state === 'active') {
            buttons.push(`<button type="button" class="btn btn-sm btn-outline-secondary rounded-pill" onclick="runWordclashDictionaryAction('remove', '${word}')">Убрать из загадок</button>`);
        }
        if (status.state === 'removed') {
            buttons.push(`<button type="button" class="btn btn-sm btn-outline-primary rounded-pill" onclick="runWordclashDictionaryAction('restore', '${word}')">Вернуть</button>`);
        }
        if (status.state !== 'banned') {
            buttons.push(`<button type="button" class="btn btn-sm btn-outline-danger rounded-pill" onclick="runWordclashDictionaryAction('ban', '${word}')">Запретить</button>`);
        }
        if (status.state === 'banned') {
            buttons.push(`<button type="button" class="btn btn-sm btn-outline-warning rounded-pill" onclick="runWordclashDictionaryAction('unban', '${word}')">Разрешить снова</button>`);
        }
        el.innerHTML = buttons.join('');
    }

    function renderCounts(counts) {
        const el = document.getElementById('wordclash-dictionary-counts');
        if (!el || !counts) return;
        el.textContent = [5, 6, 7].map(length => {
            const c = counts[String(length)] || {};
            return `${length}: active ${c.active || 0}, removed ${c.removed || 0}, banned ${c.banned || 0}`;
        }).join(' · ');
    }

    function renderSuggestions(items) {
        const el = document.getElementById('wordclash-dictionary-suggestions');
        if (!el) return;
        if (!items.length) {
            el.innerHTML = '<div class="text-muted small">Очередь пуста.</div>';
            return;
        }
        el.innerHTML = items.map(item => `
            <div class="border rounded-3 p-2">
                <div class="fw-bold">${escapeHtml(item.word)} <span class="text-muted small">${escapeHtml(item.word_length)}</span></div>
                <div class="small text-muted">${escapeHtml(item.comment || 'Без комментария')}</div>
                <div class="d-flex gap-2 mt-2">
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
            <div>${escapeHtml(item.timestamp)} · ${escapeHtml(item.action)} · ${escapeHtml(item.word)} · ${escapeHtml(item.word_length)}</div>
        `).join('');
    }

    window.refreshWordclashDictionaryAccess = function (user = window.globalUser) {
        const adminRow = document.getElementById('wordclash-dictionary-admin-row');
        const suggestRow = document.getElementById('wordclash-dictionary-suggest-row');
        if (adminRow) adminRow.style.display = isAdmin(user) ? '' : 'none';
        if (suggestRow) suggestRow.style.display = isTester(user) ? '' : 'none';
    };

    window.openWordclashDictionaryAdmin = function () {
        openDictionaryModal('admin');
    };

    window.openWordclashDictionarySuggest = function () {
        openDictionaryModal('suggest');
    };

    window.searchWordclashDictionaryWord = function () {
        const input = document.getElementById('wordclash-dictionary-search');
        const word = input ? input.value.trim() : '';
        if (!word) {
            renderStatus('Введите слово для проверки.');
            return;
        }
        refreshDictionaryAdmin(word);
    };

    window.runWordclashDictionaryAction = async function (op, word) {
        const res = await window.apiRequest({ action: 'wordclash_dictionary_action', op, word });
        if (res.status !== 'ok') {
            renderStatus(res.message || 'Ошибка изменения');
            return;
        }
        lastStatus = res.word_status || lastStatus;
        if (lastStatus) renderWordStatus(lastStatus);
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
