<!-- === MODALS === -->

<!-- 1. Removed: Leaderboard is now a separate screen -->

<!-- 2. Invite Friends Modal -->
<div class="modal fade" id="inviteFriendsModal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable">
        <div class="modal-content border-0 shadow" style="border-radius: 24px;">
            <div class="modal-header border-0 pb-0">
                <h5 class="modal-title fw-bold ps-2">Позвать друзей</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body pt-2">
                <div class="text-center mb-3">
                    <div class="invite-icon-wrapper">
                        <i class="bi bi-envelope-paper-heart-fill invite-icon"></i>
                    </div>
                    <p class="text-muted small">Отправьте приглашение друзьям,<br>чтобы они присоединились к игре.</p>
                </div>

                <div class="invite-search-group mb-3">
                    <div class="invite-search-icon"><i class="bi bi-search"></i></div>
                    <input type="text" id="invite-search-input" class="invite-search-input" placeholder="Поиск друга..."
                        oninput="filterInviteList()">
                </div>

                <div id="invite-friends-list" class="mb-3 custom-scrollbar"
                    style="max-height: 300px; overflow-y: auto; overflow-x: hidden;">
                    <div class="text-center py-4">
                        <div class="spinner-border spinner-border-sm text-primary"></div>
                    </div>
                </div>
            </div>
            <div class="modal-footer invite-modal-footer">
                <button class="invite-send-btn link-light" onclick="sendInvites()" id="btn-send-invites" disabled>
                    Отправить (<span id="invite-count">0</span>)
                </button>
            </div>
        </div>
    </div>
</div>

<!-- 3. Detailed Stats Modal -->
<div id="modal-detailed-stats" class="custom-modal-overlay" style="display: none;">
    <div class="custom-modal-content glass-panel p-3" style="max-width: 400px; width: 90%;">
        <div class="position-relative mb-3 text-center">
            <h5 class="fw-bold mb-0 text-dark">Статистика</h5>
            <button class="btn-close position-absolute top-50 end-0 translate-middle-y"
                onclick="closeModal('modal-detailed-stats')" style="font-size: 0.8rem;"></button>
        </div>

        <div class="row g-2 mb-3">
            <div class="col-12">
                <div class="p-2 bg-white bg-opacity-50 rounded-4 border border-white shadow-sm">
                    <div class="d-flex justify-content-between align-items-end mb-1">
                        <div>
                            <div class="text-muted"
                                style="font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px;">Уровень и
                                Прогресс</div>
                            <div class="fw-bold fs-5 text-primary"><span id="detail-level-val">1</span> LVL</div>
                        </div>
                        <div class="text-muted" style="font-size: 11px;" id="detail-xp-range">0 / 100 XP</div>
                    </div>
                    <div class="progress" style="height: 6px; border-radius: 3px; background: rgba(0,0,0,0.05);">
                        <div id="detail-xp-progress"
                            class="progress-bar progress-bar-striped progress-bar-animated bg-primary"
                            role="progressbar" style="width: 0%; border-radius: 3px;"></div>
                    </div>
                </div>
            </div>
            <div class="col-6">
                <div class="p-2 bg-white bg-opacity-50 rounded-4 text-center border border-white shadow-sm">
                    <i class="bi bi-controller text-primary mb-1 d-block" style="font-size: 1.1rem;"></i>
                    <div class="text-muted mb-0" style="font-size: 9px; text-transform: uppercase;">Игр</div>
                    <div class="fw-bold fs-6 text-dark" id="detail-total-games">0</div>
                </div>
            </div>
            <div class="col-6">
                <div class="p-2 bg-white bg-opacity-50 rounded-4 text-center border border-white shadow-sm">
                    <i class="bi bi-graph-up-arrow text-success mb-1 d-block" style="font-size: 1.1rem;"></i>
                    <div class="text-muted mb-0" style="font-size: 9px; text-transform: uppercase;">Винрейт</div>
                    <div class="fw-bold fs-6 text-success" id="detail-winrate">0%</div>
                </div>
            </div>
        </div>

        <h6 class="fw-bold mb-3 text-dark text-center" style="font-size: 14px;">Достижения</h6>
        <div id="detail-achievements-list" class="overflow-auto" style="max-height: 280px; min-height: 60px;"></div>

        <button class="btn btn-primary w-100 mt-4 rounded-pill py-3 fw-bold shadow-sm"
            onclick="closeModal('modal-detailed-stats')">Закрыть</button>
    </div>
</div>

<!-- 4. Confirmation Modal -->
<div class="modal fade" id="confirmationModal" tabindex="-1" aria-hidden="true" style="z-index: 1060;">
    <div class="modal-dialog modal-dialog-centered mx-auto" style="max-width: 340px;">
        <div class="modal-content border-0 shadow-lg"
            style="border-radius: 30px; background: rgba(255,255,255,0.9); backdrop-filter: blur(10px);">
            <div class="modal-header border-0 pb-0">
                <h5 class="modal-title fw-bold w-100 text-center mt-2" id="confirm-modal-title">Подтвердите</h5>
            </div>
            <div class="modal-body pt-3 pb-4 px-4 text-center">
                <p class="text-muted mb-4" id="confirm-modal-text" style="font-size: 15px;">Вы уверены?</p>
                <div class="d-grid gap-2">
                    <button class="btn btn-primary rounded-pill py-3 fw-bold shadow-sm"
                        id="confirm-modal-yes-btn">Подтвердить</button>
                    <button class="btn btn-light rounded-pill py-2 fw-bold text-muted"
                        data-bs-dismiss="modal">Отмена</button>
                </div>
            </div>
        </div>
    </div>
</div>

<!-- 5. Alert Modal -->
<div class="modal fade" id="alertModal" tabindex="-1" aria-hidden="true" style="z-index: 1070;">
    <div class="modal-dialog modal-dialog-centered mx-auto" style="max-width: 320px;">
        <div class="modal-content border-0 shadow-lg"
            style="border-radius: 30px; background: rgba(255,255,255,0.95); backdrop-filter: blur(10px);">
            <div class="modal-body p-4 text-center">
                <div class="mb-3" id="alert-modal-icon-container">
                    <i class="bi bi-info-circle text-primary fs-1"></i>
                </div>
                <h5 class="fw-bold mb-2" id="alert-modal-title">Уведомление</h5>
                <p class="text-muted mb-4" id="alert-modal-text" style="font-size: 14px;">Сообщение</p>
                <button class="btn btn-dark w-100 rounded-pill py-3 fw-bold" data-bs-dismiss="modal">Хорошо</button>
            </div>
        </div>
    </div>
</div>

<!-- 6. Custom Alert Modal (HTML) -->
<div class="modal fade" id="customAlertModal" tabindex="-1" aria-hidden="true" style="z-index: 1075;">
    <div class="modal-dialog modal-dialog-centered mx-auto" style="max-width: 340px;">
        <div class="modal-content border-0 shadow-lg"
            style="border-radius: 30px; background: rgba(255,255,255,0.85); backdrop-filter: blur(20px); box-shadow: 0 8px 32px 0 rgba(31, 38, 135, 0.37); border: 1px solid rgba(255, 255, 255, 0.18);">
            <div class="modal-body p-4 text-center">
                <div class="mb-3">
                    <i id="customAPIIcon" class="bi bi-robot text-primary"
                        style="font-size: 3rem; text-shadow: 0 4px 10px rgba(0,0,0,0.1);"></i>
                </div>
                <h5 class="fw-bold mb-3" id="customAPITitle" style="color: #2c3e50;">Уведомление</h5>
                <div id="customAPIBody" class="mb-4"></div>
                <button class="btn btn-dark w-100 rounded-pill py-3 fw-bold shadow-sm" data-bs-dismiss="modal"
                    style="background: rgba(0,0,0,0.8); backdrop-filter: blur(5px);">Закрыть</button>
            </div>
        </div>
    </div>
</div>

<!-- 7. Join Modal -->
<div class="modal fade" id="joinModal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content border-0 shadow" style="border-radius: 24px;">
            <div class="modal-header border-0 pb-0">
                <h5 class="modal-title fw-bold ps-2">Присоединиться к комнате</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body pt-2">
                <form onsubmit="joinRoom(); closeModal('joinModal'); return false;">
                    <input type="text" id="join-room-code"
                        class="form-control form-control-lg text-center text-uppercase mb-3 fw-bold"
                        placeholder="A1B2C3"
                        style="border-radius: 16px; height: 60px; font-size: 24px; letter-spacing: 2px;">
                    <input type="password" id="join-room-pass" class="form-control mb-3"
                        placeholder="Пароль комнаты (необязательно)" style="border-radius: 16px;">
                    <button type="submit" class="btn btn-primary w-100 btn-lg"
                        style="border-radius: 16px;">Присоединиться</button>
                </form>
            </div>
        </div>
    </div>
</div>

<!-- 8. Create Modal -->
<div class="modal fade" id="createModal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content border-0 shadow" style="border-radius: 24px;">
            <div class="modal-header border-0 pb-0">
                <h5 class="modal-title fw-bold ps-2">Новая комната</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body pt-2">
                <form onsubmit="createRoom(); return false;">
                    <input type="text" id="create-room-title" class="form-control mb-3 fw-bold"
                        placeholder="Название комнаты" style="border-radius: 16px;">
                    <input type="password" id="create-room-pass" class="form-control mb-3"
                        placeholder="Пароль комнаты (необязательно)" style="border-radius: 16px;">
                    <div class="form-check form-switch mb-3 ps-5">
                        <input class="form-check-input" type="checkbox" id="create-room-public"
                            style="transform: scale(1.3);">
                        <label class="form-check-label ms-2 fw-bold" for="create-room-public">Сделать публичной</label>
                    </div>
                    <button type="submit" class="btn btn-primary w-100 btn-lg"
                        style="border-radius: 16px;">Создать</button>
                </form>
            </div>
        </div>
    </div>
</div>

<!-- 9. QR Invite Modal -->
<div class="modal fade" id="qrInviteModal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered" style="width: 85%; max-width: 480px;">
        <div class="modal-content border-0 shadow-lg" style="border-radius: 32px; padding: 20px; position: relative;">
            <button type="button" class="btn-close position-absolute top-0 end-0 m-3"
                onclick="closeModal('qrInviteModal')" data-bs-dismiss="modal" aria-label="Close"
                style="z-index: 10;"></button>
            <div class="d-flex justify-content-center mb-2">
                <div style="width: 40px; height: 4px; background: #E0E0E0; border-radius: 2px;"></div>
            </div>
            <div class="text-center">
                <h5 class="fw-bold mb-4" style="color: var(--text-dark); font-size: 18px;">Комната <span
                        id="modal-room-code-title">...</span></h5>
                <div class="d-flex justify-content-center mb-3">
                    <div id="modal-qr-code"
                        style="padding: 12px; border-radius: 20px; border: 2px solid #F8F9FA; background: white; filter: drop-shadow(0 4px 6px rgba(0,0,0,0.05));">
                    </div>
                </div>
                <h2 class="fw-bold mb-4"
                    style="font-size: 32px; color: var(--primary-color); letter-spacing: 1.5px; font-family: 'Outfit', sans-serif;"
                    id="modal-room-code-text">...</h2>
                <div class="d-grid gap-3">
                    <button
                        class="btn btn-primary py-3 rounded-4 fw-bold shadow-sm d-flex align-items-center justify-content-center"
                        style="background: linear-gradient(135deg, var(--primary-color) 0%, var(--accent-color) 100%); border: none; font-size: 17px; height: 56px;"
                        id="btn-copy-invite" onclick="copyInviteLink()">
                        <i class="bi bi-link-45deg me-2" id="btn-copy-icon" style="font-size: 20px;"></i>
                        <span id="btn-copy-text">Скопировать ссылку</span>
                    </button>
                    <button class="btn py-3 rounded-4 fw-bold shadow-sm"
                        style="background: #24A1DE; color: white; border: none; font-size: 18px;"
                        onclick="sendToTelegram()">
                        <i class="bi bi-telegram me-2"></i> Отправить в чат
                    </button>
                    <button class="btn py-3 rounded-4 fw-bold shadow-sm"
                        style="background: #fff; color: var(--primary-color); border: 1px solid #eee; font-size: 18px;"
                        onclick="closeModal('qrInviteModal'); openInviteModal()">
                        <i class="bi bi-person-plus-fill me-2"></i> Позвать друга
                    </button>
                </div>
            </div>
        </div>
    </div>
</div>

<!-- 10. Game Selector Modal -->
<div class="modal fade" id="gameSelectorModal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable">
        <div class="modal-content border-0 shadow" style="border-radius: 24px;">
            <div class="modal-header border-0">
                <h5 class="modal-title fw-bold ps-2">Выбрать игру</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body p-0">
                <div class="list-group list-group-flush" id="game-selector-list"></div>
            </div>
        </div>
    </div>
</div>

<!-- 11. Public Profile Modal -->
<div class="modal fade" id="userProfileModal" tabindex="-1">
    <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content border-0 shadow" style="border-radius: 24px;">
            <div class="modal-header border-0 pb-0">
                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body text-center pt-0 pb-4">
                <div id="public-profile-content">
                    <div class="spinner-border text-primary"></div>
                </div>
            </div>
        </div>
    </div>
</div>

<!-- 12. Avatar Viewer Modal -->
<div id="modal-avatar-view" class="custom-modal-overlay" onclick="closeModal('modal-avatar-view')">
    <div class="modal-content animate__animated animate__zoomIn"
        style="background: transparent; box-shadow: none; width: 100%; max-width: 350px;"
        onclick="event.stopPropagation()">
        <div class="d-flex justify-content-center align-items-center position-relative">
            <button class="btn btn-light rounded-circle position-absolute top-0 end-0 m-2 shadow"
                style="z-index: 10; width: 40px; height: 40px; flex-shrink: 0; padding: 0; display: flex; align-items: center; justify-content: center;"
                onclick="closeModal('modal-avatar-view')">
                <i class="bi bi-x-lg"></i>
            </button>
            <div id="avatar-view-container"
                class="rounded-circle shadow-lg d-flex align-items-center justify-content-center overflow-hidden"
                style="width: 300px; height: 300px; background: white; border: 4px solid white;"></div>
        </div>
    </div>
</div>