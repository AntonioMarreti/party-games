<!-- ТАБ 3: ПРОФИЛЬ -->
<div id="tab-profile" class="tab-content profile-screen" data-screen="profile" style="display: none;">
    <!-- Modern Header -->
    <div class="profile-header-modern" style="padding-top: calc(60px + env(safe-area-inset-top));">
        <!-- Added padding for notch -->
        <div class="profile-avatar-xl" id="profile-avatar-big">
            <div class="profile-level-badge-float" id="profile-level-badge">1</div>
        </div>
        <h2 class="fw-bold mb-0" id="profile-name-big">...</h2>
        <div class="profile-level-summary">
            <div class="profile-level-summary-top">
                <span id="profile-level-text">Уровень 1</span>
                <span id="profile-xp-text">0 XP</span>
            </div>
            <div class="profile-level-progress" aria-hidden="true">
                <div id="profile-xp-progress" class="profile-level-progress-fill"></div>
            </div>
        </div>
    </div>

    <!-- Modern Stats Card (Overlapping) & Clickable -->
    <button type="button" class="btn-unstyled stats-card-modern" onclick="openDetailedStatsModal()">
        <div class="stat-box">
            <div class="value" id="profile-stat-achievements">0</div>
            <div class="label">Наград</div>
        </div>
        <div class="stat-divider-v"></div>
        <div class="stat-box">
            <div class="value" id="profile-stat-wins">0</div>
            <div class="label">Побед</div>
        </div>
        <div class="stat-divider-v"></div>
        <div class="stat-box">
            <div class="value" id="profile-stat-xp">0</div>
            <div class="label">XP</div>
        </div>
    </button>

    <div class="content-wrapper" style="padding-bottom: calc(110px + env(safe-area-inset-bottom));">
        <section class="profile-daily-card daily-tasks-card" id="profile-daily-card" style="display:none;">
            <button type="button" class="btn-unstyled profile-daily-head daily-collapsed-card" onclick="toggleProfileDailyTasks()"
                aria-expanded="false" id="profile-daily-head">
                <div class="profile-daily-icon" aria-hidden="true">
                    <i class="bi bi-calendar2-check"></i>
                    <i class="bi bi-stars"></i>
                </div>
                <div class="profile-daily-copy">
                    <div class="profile-daily-title">Задания дня</div>
                    <div class="profile-daily-subtitle" id="profile-daily-summary">Загружаем...</div>
                </div>
                <div class="profile-daily-actions">
                    <span class="profile-daily-reward-chip" id="profile-daily-reward-chip" style="display:none;"></span>
                    <i class="bi bi-chevron-down profile-daily-chevron" aria-hidden="true"></i>
                </div>
            </button>
            <div class="profile-daily-expanded-wrap" id="profile-daily-expanded-wrap">
                <div class="profile-daily-expanded-inner">
                    <div class="profile-daily-list" id="profile-daily-list"></div>
                    <button type="button" id="profile-daily-toggle" class="btn-unstyled profile-daily-toggle"
                        onclick="toggleProfileDailyTasks()" style="display:none;">Свернуть</button>
                </div>
            </div>
        </section>

        <!-- Menu Actions (Grouped Glass Style) -->
        <div class="settings-group mb-3">
            <button type="button" class="btn-unstyled settings-item clickable" onclick="openDetailedStatsModal()">
                <div class="d-flex align-items-center">
                    <div class="icon-wrap text-primary me-3" style="width:32px; text-align:center;">
                        <i class="bi bi-award fs-5" aria-hidden="true"></i>
                    </div>
                    <span class="fw-bold" style="color: var(--text-main)">Задания и награды</span>
                </div>
                <i class="bi bi-chevron-right text-muted opacity-50 pe-2" aria-hidden="true"></i>
            </button>

            <!-- Game History -->
            <button type="button" class="btn-unstyled settings-item clickable" onclick="openGameHistory()">
                <div class="d-flex align-items-center">
                    <div class="icon-wrap text-primary me-3" style="width:32px; text-align:center;">
                        <i class="bi bi-clock-history fs-5" aria-hidden="true"></i>
                    </div>
                    <span class="fw-bold" style="color: var(--text-main)">История игр</span>
                </div>
                <i class="bi bi-chevron-right text-muted opacity-50 pe-2" aria-hidden="true"></i>
            </button>

            <!-- Edit Profile -->
            <button type="button" class="btn-unstyled settings-item clickable" onclick="openProfileEditor()">
                <div class="d-flex align-items-center">
                    <div class="icon-wrap text-primary me-3" style="width:32px; text-align:center;">
                        <i class="bi bi-pencil-square fs-5" aria-hidden="true"></i>
                    </div>
                    <span class="fw-bold" style="color: var(--text-main)">Редактировать
                        профиль</span>
                </div>
                <i class="bi bi-chevron-right text-muted opacity-50 pe-2" aria-hidden="true"></i>
            </button>

            <!-- Friends -->
            <button type="button" class="btn-unstyled settings-item clickable" onclick="openFriendsScreen()">
                <div class="d-flex align-items-center">
                    <div class="icon-wrap me-3" style="width:32px; text-align:center; color: var(--primary-color);">
                        <i class="bi bi-people fs-5" aria-hidden="true"></i>
                    </div>
                    <span class="fw-bold" style="color: var(--text-main)">Друзья</span>
                    <span id="friends-count-badge" class="badge bg-danger rounded-pill ms-2"
                        style="display:none;">0</span>
                </div>
                <i class="bi bi-chevron-right text-muted opacity-50 pe-2" aria-hidden="true"></i>
            </button>

            <!-- Settings -->
            <button type="button" class="btn-unstyled settings-item clickable" onclick="openSettingsScreen()">
                <div class="d-flex align-items-center">
                    <div class="icon-wrap me-3" style="width:32px; text-align:center; color: var(--primary-color);"><i
                            class="bi bi-gear fs-5" aria-hidden="true"></i></div>
                    <span class="fw-bold" style="color: var(--text-main)">Настройки</span>
                </div>
                <i class="bi bi-chevron-right text-muted opacity-50 pe-2" aria-hidden="true"></i>
            </button>

            <!-- Donate -->
            <button type="button" class="btn-unstyled settings-item clickable" onclick="showScreen('donate')">
                <div class="d-flex align-items-center">
                    <div class="icon-wrap me-3" style="width:32px; text-align:center; color: #ff4757;">
                        <i class="bi bi-heart-fill fs-5" aria-hidden="true"></i>
                    </div>
                    <span class="fw-bold" style="color: var(--text-main)">Поддержать проект</span>
                </div>
                <i class="bi bi-chevron-right text-muted opacity-50 pe-2" aria-hidden="true"></i>
            </button>
        </div>

        <!-- Logout Group -->
        <div class="settings-group mb-3" id="logout-menu-item-group" style="display:none;">
            <button type="button" class="btn-unstyled settings-item clickable" onclick="logout()">
                <div class="d-flex align-items-center">
                    <div class="icon-wrap text-danger me-3" style="width:32px; text-align:center;">
                        <i class="bi bi-box-arrow-left fs-5" aria-hidden="true"></i>
                    </div>
                    <span class="fw-bold text-danger">Выйти</span>
                </div>
            </button>
        </div>

        <div style="height: 100px;"></div>
    </div>
</div>
