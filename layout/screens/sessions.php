<!-- Screen: Active Sessions -->
<div id="screen-sessions" class="screen">
    <div class="room-content-wrapper">
        <div class="d-flex align-items-center mb-4">
            <button class="btn-back me-3" onclick="window.showScreen('settings')"
                style="color: var(--primary-color) !important; background: var(--bg-card); border: 1px solid var(--primary-color);">
                <i class="bi bi-chevron-left"></i>
            </button>
            <div class="flex-grow-1">
                <h4 class="fw-bold m-0">Активные сеансы</h4>
                <div class="text-muted small" id="sessions-screen-counter">Загрузка...</div>
            </div>
        </div>

        <!-- Sessions List -->
        <div id="sessions-list" class="sessions-list mb-3"></div>

        <!-- Revoke All Button (shown if >1 sessions) -->
        <button class="btn w-100 btn-outline-danger mb-4" style="border-radius:14px; font-weight:600;"
            onclick="window.SessionManager.revokeAll()">
            <i class="bi bi-slash-circle me-2"></i>Закрыть все остальные сеансы
        </button>

        <!-- TTL Settings -->
        <div class="settings-group p-3 mb-3">
            <h6 class="fw-bold text-uppercase small mb-3" style="color: var(--text-main); opacity: 0.7;">
                <i class="bi bi-clock-history me-2"></i>Автоудаление неактивных сеансов
            </h6>
            <div class="d-flex gap-2 flex-wrap" id="session-ttl-buttons">
                <button class="ttl-btn" data-days="7" onclick="selectTtl(this, 7)">7 дней</button>
                <button class="ttl-btn" data-days="30" onclick="selectTtl(this, 30)">30 дней</button>
                <button class="ttl-btn" data-days="90" onclick="selectTtl(this, 90)">3 месяца</button>
                <button class="ttl-btn" data-days="0" onclick="selectTtl(this, 0)">Никогда</button>
            </div>
            <div class="text-muted small mt-2">
                Сеансы, в которых не было активности дольше указанного срока, будут автоматически завершены.
            </div>
        </div>

        <!-- Security tip -->
        <div class="sessions-tip">
            <i class="bi bi-shield-check me-2" style="color: var(--primary-color);"></i>
            Если вы видите незнакомый сеанс — закройте его и смените аккаунт.
        </div>
    </div>
</div>