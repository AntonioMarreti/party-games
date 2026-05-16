<div id="screen-history" class="screen" style="display: none; height: 100vh; overflow-y: auto;">
    <div class="header-bg history-hero">
        <div class="header-title">История игр</div>
        <div class="header-subtitle">Итоги партий и быстрый повтор</div>
    </div>

    <div class="content-wrapper history-content pt-4" id="history-list-container"
        style="padding-bottom: calc(160px + env(safe-area-inset-bottom));">
        <div id="history-loader" class="history-state-card text-center">
            <div class="spinner-border text-primary text-opacity-50" role="status">
                <span class="visually-hidden">Загрузка...</span>
            </div>
            <div class="text-muted small fw-bold mt-3">Загружаем историю...</div>
        </div>

        <div id="history-content-list" class="d-flex flex-column gap-3"></div>

        <div id="history-empty" class="history-state-card text-center" style="display: none;">
            <div class="empty-state-icon text-muted mb-3 opacity-50" aria-hidden="true">
                <i class="bi bi-controller" style="font-size: 4rem;"></i>
            </div>
            <h5 class="fw-bold mb-2">История пока пустая</h5>
            <p class="text-muted small">Сыграйте первую партию — здесь появятся итоги, победители и быстрый повтор.</p>
            <button class="btn btn-primary rounded-pill mt-3 px-4 shadow-sm" onclick="switchTab('home')">Начать
                игру</button>
        </div>
    </div>

    <div id="history-details-sheet" class="history-details-overlay" aria-hidden="true"
        onclick="closeHistoryDetails()">
        <div class="history-details-sheet" role="dialog" aria-modal="true" aria-labelledby="history-details-title"
            onclick="event.stopPropagation()">
            <button type="button" class="history-sheet-grabber" aria-label="Закрыть итоги"
                onclick="closeHistoryDetails()"></button>

            <div class="history-sheet-header">
                <div id="history-details-icon" class="history-details-icon">
                    <i class="bi bi-controller"></i>
                </div>
                <div class="min-w-0">
                    <div id="history-details-title" class="history-details-title">Игра</div>
                    <div id="history-details-meta" class="history-details-meta">Дата</div>
                </div>
            </div>

            <div class="history-result-card">
                <div class="history-result-copy">
                    <div class="history-details-summary-label">Итог матча</div>
                    <div class="history-details-result">
                        <i id="history-details-result-icon" class="bi bi-trophy-fill history-details-result-icon"
                            aria-hidden="true"></i>
                        <span id="history-details-result">Результат</span>
                    </div>
                    <div id="history-details-outcome" class="history-details-outcome">Ваш результат</div>
                </div>
                <div class="history-result-side">
                    <div id="history-details-badge" class="history-result-badge">Итог</div>
                    <div id="history-details-xp" class="history-details-xp">+0 XP</div>
                </div>
            </div>

            <div class="history-details-breakdown">
                <div class="history-details-breakdown-title">Опыт за игру</div>
                <div class="history-details-row">
                    <span>Участие</span>
                    <strong>+20 XP</strong>
                </div>
                <div class="history-details-row">
                    <span id="history-details-rank-label">За место</span>
                    <strong id="history-details-rank-bonus">+0 XP</strong>
                </div>
                <div class="history-details-row">
                    <span>Очки в игре</span>
                    <strong id="history-details-score-bonus">+0 XP</strong>
                </div>
            </div>

            <p class="history-details-note mb-0">Бонус за счёт: 10% от игровых очков, максимум +150 XP.</p>

            <div class="history-details-actions">
                <button id="history-details-replay" type="button" class="btn btn-primary rounded-pill fw-bold"
                    onclick="replayHistoryGameFromSheet(event)">Сыграть ещё</button>
                <button type="button" class="btn btn-light rounded-pill fw-bold"
                    onclick="closeHistoryDetails()">Закрыть</button>
            </div>
            <!-- TODO: add "Поделиться итогом" when share-card generation is ready. -->
        </div>
    </div>
</div>
