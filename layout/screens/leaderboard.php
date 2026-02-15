<!-- Screen: Leaderboard -->
<div id="screen-leaderboard" class="screen">
    <div class="header-bg">
        <div class="header-title">Топ игроков</div>
        <div class="header-subtitle">Лучшие из лучших</div>
    </div>

    <div class="content-wrapper pt-4">
        <!-- Tabs -->
        <ul class="nav nav-pills nav-fill mb-3 rounded-pill p-1 shadow-sm mx-3"
            style="background: var(--bg-secondary);">
            <li class="nav-item">
                <a class="nav-link active rounded-pill" id="btn-lb-global" data-bs-toggle="pill" href="#tab-lb-global"
                    onclick="loadLeaderboardList('global')">Глобальный</a>
            </li>
            <li class="nav-item">
                <a class="nav-link rounded-pill" id="btn-lb-friends" data-bs-toggle="pill" href="#tab-lb-friends"
                    onclick="loadLeaderboardList('friends')">Друзья</a>
            </li>
        </ul>

        <!-- Leaderboard List -->
        <div id="leaderboard-screen-container" class="px-2 pb-5">
            <div class="text-center py-5">
                <div class="spinner-border text-primary spinner-border-sm"></div>
            </div>
        </div>
        <div style="height: 100px;"></div>
    </div>
</div>