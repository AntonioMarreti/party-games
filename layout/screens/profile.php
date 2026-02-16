<!-- ТАБ 3: ПРОФИЛЬ -->
<div id="tab-profile" class="tab-content" style="display: none;">
    <!-- Modern Header -->
    <div class="profile-header-modern" style="padding-top: calc(60px + env(safe-area-inset-top));">
        <!-- Added padding for notch -->
        <div class="profile-avatar-xl" id="profile-avatar-big">
            <div class="profile-level-badge-float" id="profile-level-badge">1</div>
        </div>
        <h2 class="fw-bold mb-0" id="profile-name-big">...</h2>
        <div class="small opacity-75 mt-1" id="profile-xp-text">0 XP</div>
    </div>

    <!-- Modern Stats Card (Overlapping) & Clickable -->
    <div class="stats-card-modern" onclick="openDetailedStatsModal()" style="cursor: pointer;">
        <div class="stat-box">
            <div class="value" id="profile-stat-achievements">0</div>
            <div class="label">Ачивок</div>
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
    </div>

    <div class="content-wrapper">

        <!-- Menu Actions (Grouped Glass Style) -->
        <div class="settings-group mb-3">
            <!-- Edit Profile -->
            <div class="settings-item clickable" onclick="openProfileEditor()">
                <div class="d-flex align-items-center">
                    <div class="icon-wrap text-primary me-3" style="width:32px; text-align:center;">
                        <i class="bi bi-pencil-square fs-5"></i>
                    </div>
                    <span class="fw-bold" style="color: var(--text-main)">Редактировать
                        профиль</span>
                </div>
                <i class="bi bi-chevron-right text-muted opacity-50 pe-2"></i>
            </div>

            <!-- Friends -->
            <div class="settings-item clickable" onclick="openFriendsScreen()">
                <div class="d-flex align-items-center">
                    <div class="icon-wrap me-3" style="width:32px; text-align:center; color: var(--primary-color);">
                        <i class="bi bi-people-fill fs-5"></i>
                    </div>
                    <span class="fw-bold" style="color: var(--text-main)">Друзья</span>
                    <span id="friends-count-badge" class="badge bg-danger rounded-pill ms-2"
                        style="display:none;">0</span>
                </div>
                <i class="bi bi-chevron-right text-muted opacity-50 pe-2"></i>
            </div>

            <!-- Settings -->
            <div class="settings-item clickable" onclick="openSettingsScreen()">
                <div class="d-flex align-items-center">
                    <div class="icon-wrap me-3" style="width:32px; text-align:center; color: var(--primary-color);"><i
                            class="bi bi-gear-fill fs-5"></i></div>
                    <span class="fw-bold" style="color: var(--text-main)">Настройки</span>
                </div>
                <i class="bi bi-chevron-right text-muted opacity-50 pe-2"></i>
            </div>

            <!-- Donate -->
            <div class="settings-item clickable" onclick="showScreen('donate')">
                <div class="d-flex align-items-center">
                    <div class="icon-wrap me-3" style="width:32px; text-align:center; color: #ff4757;">
                        <i class="bi bi-heart-fill fs-5"></i>
                    </div>
                    <span class="fw-bold" style="color: var(--text-main)">Поддержать проект</span>
                </div>
                <i class="bi bi-chevron-right text-muted opacity-50 pe-2"></i>
            </div>
        </div>

        <!-- Logout Group -->
        <div class="settings-group mb-3" id="logout-menu-item-group" style="display:none;">
            <div class="settings-item clickable" onclick="logout()">
                <div class="d-flex align-items-center">
                    <div class="icon-wrap text-danger me-3" style="width:32px; text-align:center;">
                        <i class="bi bi-box-arrow-left fs-5"></i>
                    </div>
                    <span class="fw-bold text-danger">Выйти</span>
                </div>
            </div>
        </div>

        <div style="height: 100px;"></div>
    </div>
</div>