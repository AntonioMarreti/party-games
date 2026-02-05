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
                <!-- Search -->
                <div class="input-group mb-3" style="box-shadow: 0 2px 5px rgba(0,0,0,0.05); border-radius: 16px;">
                    <input type="text" id="friends-search-input" class="form-control bg-light border-0"
                        placeholder="🔍 Найти друга по имени..."
                        style="border-top-left-radius: 16px; border-bottom-left-radius: 16px; padding: 12px;"
                        oninput="debounceSearchFriends()">
                    <button class="btn btn-primary" onclick="searchFriendsAction()"
                        style="border-top-right-radius: 16px; border-bottom-right-radius: 16px; padding-left: 20px; padding-right: 20px;">
                        <i class="bi bi-search"></i>
                    </button>
                </div>

                <!-- Search Results -->
                <div id="friends-search-results" class="mb-3" style="display:none;">
                    <h6 class="text-muted small">Результаты:</h6>
                    <div id="friends-search-list"></div>
                    <hr>
                </div>

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