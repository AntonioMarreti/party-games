<!-- ТАБ 3: ПРОФИЛЬ -->
<div id="tab-profile" class="tab-content profile-screen" data-screen="profile" style="display: none;">
    <!-- Modern Header -->
    <div class="profile-header-modern" style="padding-top: calc(60px + env(safe-area-inset-top));">
        <!-- Added padding for notch -->
        <div class="profile-avatar-xl" id="profile-avatar-big"></div>
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
                <div class="profile-daily-icon profile-menu-icon" aria-hidden="true">
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
                    <div id="profile-daily-toggle" class="profile-daily-toggle" style="display:none;"></div>
                </div>
            </div>
        </section>

        <!-- Menu Actions (Grouped Glass Style) -->
        <div class="settings-group profile-menu-group mb-3">
            <button type="button" class="btn-unstyled settings-item clickable profile-menu-row" onclick="openDetailedStatsModal()">
                <div class="profile-menu-main">
                    <div class="profile-menu-icon">
                        <i class="bi bi-award fs-5" aria-hidden="true"></i>
                    </div>
                    <span class="profile-menu-title">Задания и награды</span>
                </div>
                <i class="bi bi-chevron-right profile-menu-chevron" aria-hidden="true"></i>
            </button>

            <!-- Game History -->
            <button type="button" class="btn-unstyled settings-item clickable profile-menu-row" onclick="openGameHistory()">
                <div class="profile-menu-main">
                    <div class="profile-menu-icon">
                        <i class="bi bi-clock-history fs-5" aria-hidden="true"></i>
                    </div>
                    <span class="profile-menu-title">История игр</span>
                </div>
                <i class="bi bi-chevron-right profile-menu-chevron" aria-hidden="true"></i>
            </button>

            <!-- Edit Profile -->
            <button type="button" class="btn-unstyled settings-item clickable profile-menu-row" onclick="openProfileEditor()">
                <div class="profile-menu-main">
                    <div class="profile-menu-icon">
                        <i class="bi bi-pencil-square fs-5" aria-hidden="true"></i>
                    </div>
                    <span class="profile-menu-title">Редактировать профиль</span>
                </div>
                <i class="bi bi-chevron-right profile-menu-chevron" aria-hidden="true"></i>
            </button>

            <!-- Friends -->
            <button type="button" class="btn-unstyled settings-item clickable profile-menu-row" onclick="openFriendsScreen()">
                <div class="profile-menu-main">
                    <div class="profile-menu-icon">
                        <i class="bi bi-people fs-5" aria-hidden="true"></i>
                    </div>
                    <span class="profile-menu-title">Друзья</span>
                    <span id="friends-count-badge" class="badge bg-danger rounded-pill ms-2"
                        style="display:none;">0</span>
                </div>
                <i class="bi bi-chevron-right profile-menu-chevron" aria-hidden="true"></i>
            </button>

            <!-- Settings -->
            <button type="button" class="btn-unstyled settings-item clickable profile-menu-row" onclick="openSettingsScreen()">
                <div class="profile-menu-main">
                    <div class="profile-menu-icon">
                        <i class="bi bi-gear fs-5" aria-hidden="true"></i>
                    </div>
                    <span class="profile-menu-title">Настройки</span>
                </div>
                <i class="bi bi-chevron-right profile-menu-chevron" aria-hidden="true"></i>
            </button>

            <button type="button" id="game-tools-row" class="btn-unstyled settings-item clickable profile-menu-row"
                onclick="openGameTools()" style="display:none;">
                <div class="profile-menu-main">
                    <div class="profile-menu-icon">
                        <i class="bi bi-controller fs-5" aria-hidden="true"></i>
                    </div>
                    <span class="profile-menu-title">Управление играми</span>
                </div>
                <i class="bi bi-chevron-right profile-menu-chevron" aria-hidden="true"></i>
            </button>

            <!-- Donate -->
            <button type="button" class="btn-unstyled settings-item clickable profile-menu-row" onclick="showScreen('donate')">
                <div class="profile-menu-main">
                    <div class="profile-menu-icon profile-menu-icon-donate">
                        <i class="bi bi-heart-fill fs-5" aria-hidden="true"></i>
                    </div>
                    <span class="profile-menu-title">Поддержать проект</span>
                </div>
                <i class="bi bi-chevron-right profile-menu-chevron" aria-hidden="true"></i>
            </button>
        </div>

        <!-- Logout Group (Browser) -->
        <div class="settings-group profile-menu-group profile-menu-danger-group mb-3" id="logout-menu-item-group" style="display:none;">
            <button type="button" class="btn-unstyled settings-item clickable profile-menu-row profile-menu-danger" onclick="logout()">
                <div class="profile-menu-main">
                    <div class="profile-menu-icon profile-menu-icon-danger">
                        <i class="bi bi-box-arrow-left fs-5" aria-hidden="true"></i>
                    </div>
                    <span class="profile-menu-title">Выйти</span>
                </div>
            </button>
        </div>

        <!-- TMA Account Info Group -->
        <div class="settings-group profile-menu-group mb-3" id="tma-account-info-group" style="display:none;">
            <div class="settings-item profile-menu-row" style="flex-direction: column; align-items: flex-start; cursor: default; padding: 16px 6px;">
                <div class="profile-menu-main w-100 mb-1">
                    <div class="profile-menu-icon" style="background: rgba(41, 169, 234, 0.1); color: #29a9ea;">
                        <i class="bi bi-telegram fs-5" aria-hidden="true"></i>
                    </div>
                    <span class="profile-menu-title fw-bold">Вы вошли через Telegram</span>
                </div>
                <p class="text-muted mb-0" style="font-size: 0.85rem; line-height: 1.4; padding-left: 52px;">
                    Аккаунт берётся из Telegram. Чтобы сменить аккаунт, переключите его в Telegram.
                </p>
            </div>
        </div>

        <div style="height: 100px;"></div>
    </div>
</div>
