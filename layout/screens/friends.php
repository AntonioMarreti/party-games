<!-- Screen: Friends -->
<div id="screen-friends" class="screen">
    <div class="friends-view-wrapper">
        <div class="d-flex align-items-center mb-4">
            <button class="btn-back me-3" onclick="closeFriendsScreen()"
                style="color: var(--primary-color) !important; background: var(--bg-card); border: 1px solid var(--primary-color);">
                <i class="bi bi-chevron-left"></i>
            </button>
            <h4 class="fw-bold m-0">Друзья</h4>
        </div>

        <!-- Tabs -->
        <div class="nav nav-pills nav-fill mb-3 rounded-pill p-1" style="background: var(--bg-secondary);">
            <div class="nav-item" style="cursor:pointer">
                <a class="nav-link active rounded-pill" id="btn-friends-my" onclick="switchFriendsTab('my')">Мои</a>
            </div>
            <div class="nav-item" style="cursor:pointer">
                <a class="nav-link rounded-pill" id="btn-friends-requests" onclick="switchFriendsTab('requests')">Заявки
                    <span id="friends-req-count" class="badge bg-danger rounded-circle"
                        style="display:none;">0</span></a>
            </div>
        </div>

        <!-- Custom Tabs Content -->
        <div class="friends-tab-content w-100">
            <!-- My Friends Tab -->
            <div id="tab-friends-my" class="friends-tab-pane active w-100" style="display: block;">
                <div class="friend-search-shell mb-2">
                    <div class="friend-search-input-wrap friend-search-input-wrap-filter">
                        <span class="friend-search-icon bi bi-search"></span>
                        <input type="text" id="friends-search-input" class="friend-search-field"
                            placeholder="Поиск по друзьям"
                            autocomplete="off"
                            oninput="debounceFilterFriends()">
                    </div>
                </div>

                <div class="friend-add-card mb-3">
                    <button type="button" id="friend-add-toggle-btn" class="friend-add-action-row btn-unstyled" onclick="toggleFriendAddSearch()" aria-expanded="false">
                        <span class="friend-add-action-icon"><i class="bi bi-person-plus"></i></span>
                        <span class="friend-add-action-text">Добавить нового друга</span>
                        <span class="friend-add-action-chevron bi bi-chevron-down"></span>
                    </button>

                    <div id="friend-add-search-block" class="friend-add-panel" style="display:none;">
                        <div class="friend-search-shell mb-3">
                            <div class="friend-search-input-wrap friend-search-input-wrap-add">
                                <input type="text" id="friend-add-search-input" class="friend-search-field"
                                    placeholder="Введите @username или имя"
                                    autocomplete="off"
                                    oninput="debounceSearchUsersToAdd()">
                                <button type="button" class="friend-search-button" onclick="searchUsersToAddAction()" aria-label="Искать новых пользователей">
                                    <i class="bi bi-search"></i>
                                </button>
                            </div>
                        </div>
                        <div id="friend-add-search-results" class="friend-add-results" style="display:none;">
                            <div id="friend-add-search-list"></div>
                        </div>
                    </div>
                </div>

                <div class="friend-section-label mb-2">Мои друзья</div>
                <!-- Friends List -->
                <div id="friends-list-container">
                    <div class="text-center py-5">
                        <div class="spinner-border text-primary spinner-border-sm"></div>
                    </div>
                </div>
            </div>

            <!-- Requests Tab -->
            <div id="tab-friends-requests" class="friends-tab-pane w-100" style="display: none;">
                <div id="friends-req-container">
                    <p class="text-center text-muted m-0 p-0">Нет новых заявок</p>
                </div>
            </div>
        </div>
    </div>
</div>