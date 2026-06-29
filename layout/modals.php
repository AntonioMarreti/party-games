<!-- === MODALS === -->

<div class="modal fade" id="wordclashDictionaryModal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable">
        <div class="modal-content border-0 shadow" style="border-radius: 24px;">
            <div class="modal-header border-0 pb-0">
                <h5 class="modal-title fw-bold ps-2" id="wordclash-dictionary-title">Предложить слово для Wordclash</h5>
                <button type="button" class="btn-close wordclash-suggest-close-btn" data-bs-dismiss="modal" aria-label="Закрыть"></button>
            </div>
            <div class="modal-body pt-2">
                <form id="wordclash-dictionary-suggest-panel" onsubmit="submitWordclashDictionarySuggestion(); return false;">
                    <label class="form-label small fw-bold text-muted" for="wordclash-dictionary-suggest-word">Слово</label>
                    <input type="text" id="wordclash-dictionary-suggest-word" class="form-control mb-3" placeholder="5–7 русских букв">
                    <label class="form-label small fw-bold text-muted" for="wordclash-dictionary-suggest-comment">Комментарий</label>
                    <textarea id="wordclash-dictionary-suggest-comment" class="form-control mb-3" maxlength="180" rows="3"
                        placeholder="Почему слово стоит добавить?"></textarea>
                    <button type="submit" class="btn btn-primary w-100 rounded-pill py-2 fw-bold">Отправить</button>
                    <div id="wordclash-dictionary-suggest-result" class="small text-muted mt-3"></div>
                </form>
            </div>
        </div>
    </div>
</div>

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

<!-- 3. Rewards Overview Modal -->
<div id="modal-detailed-stats" class="custom-modal-overlay" style="display: none;">
    <div class="custom-modal-content glass-panel rewards-overview-modal">
        <div class="rewards-modal-header">
            <button type="button" class="btn-unstyled rewards-modal-back" id="rewards-modal-back"
                onclick="setRewardsView('overview')" style="display:none;" aria-label="Назад">
                <i class="bi bi-chevron-left" aria-hidden="true"></i>
                <span>Назад</span>
            </button>
            <h5 class="fw-bold mb-0 text-main" id="rewards-modal-title" style="color: var(--text-main);">Задания и награды</h5>
            <button class="btn-close position-absolute top-50 end-0 translate-middle-y"
                onclick="closeRewardsModal()" style="font-size: 0.8rem;"></button>
        </div>

        <div id="rewards-overview-view">
            <div class="rewards-level-strip">
                <div class="rewards-level-strip-top">
                    <span id="detail-level-val">1 LVL</span>
                    <span id="detail-xp-range">0 / 100 XP</span>
                </div>
                <div class="rewards-level-progress" aria-hidden="true">
                    <div id="detail-xp-progress" class="rewards-level-progress-fill"></div>
                </div>
            </div>

            <section class="rewards-overview-section">
                <div class="rewards-overview-section-head">
                    <div>
                        <div class="rewards-overview-eyebrow">Сегодня</div>
                        <h6 class="rewards-overview-title">Задания дня</h6>
                    </div>
                    <span class="rewards-overview-chip" id="detail-daily-summary">Загружаем...</span>
                </div>
                <div id="detail-daily-list" class="rewards-overview-daily-list">
                    <div class="daily-tasks-modal-state">Загружаем задания...</div>
                </div>
            </section>

            <section class="rewards-overview-section">
                <div class="rewards-overview-section-head">
                    <div>
                        <div class="rewards-overview-eyebrow">Коллекция</div>
                        <h6 class="rewards-overview-title">Полученные награды</h6>
                    </div>
                    <span class="rewards-overview-chip" id="detail-achievements-summary">0</span>
                </div>
                <div id="detail-achievements-list" class="rewards-overview-achievements-list"></div>
                <div class="rewards-overview-note">Больше достижений скоро</div>
            </section>
        </div>

        <div id="rewards-detail-view" style="display:none;"></div>

        <button class="btn btn-primary w-100 mt-2 rounded-pill py-2 fw-bold shadow-sm"
            onclick="closeRewardsModal()">Закрыть</button>
    </div>
</div>

<!-- Daily Tasks Modal -->
<div id="modal-daily-tasks" class="custom-modal-overlay" style="display: none;">
    <div class="custom-modal-content daily-tasks-modal">
        <div class="daily-tasks-modal-header">
            <div>
                <h5 class="daily-tasks-modal-title">Задания дня</h5>
                <p class="daily-tasks-modal-subtitle">Выполняйте задания и получайте XP</p>
            </div>
            <button type="button" class="btn-close" onclick="closeModal('modal-daily-tasks')"
                aria-label="Закрыть"></button>
        </div>

        <div class="daily-tasks-modal-summary">
            <div>
                <div class="daily-tasks-summary-label">Сегодняшний прогресс</div>
                <div class="daily-tasks-summary-value" id="daily-modal-summary-text">Загружаем...</div>
            </div>
            <span class="daily-tasks-summary-chip" id="daily-modal-reward-chip" style="display:none;"></span>
        </div>
        <div class="daily-tasks-summary-bar" aria-hidden="true">
            <div class="daily-tasks-summary-bar-fill" id="daily-modal-progress-bar"></div>
        </div>

        <div class="daily-tasks-modal-list" id="daily-modal-list">
            <div class="daily-tasks-modal-state">Загружаем задания...</div>
        </div>
    </div>
</div>

<!-- 4. Confirmation Modal -->
<div class="modal fade" id="confirmationModal" tabindex="-1" aria-hidden="true" style="z-index: 1060;">
    <div class="modal-dialog modal-dialog-centered mx-auto" style="max-width: 340px;">
        <div class="modal-content system-modal border-0 shadow-lg"
            style="border-radius: 30px;">
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
        <div class="modal-content system-modal border-0 shadow-lg"
            style="border-radius: 30px;">
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
        <div class="modal-content system-modal border-0 shadow-lg"
            style="border-radius: 30px;">
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
<div class="modal fade lobby-modal" id="joinModal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content border-0 shadow" style="border-radius: 24px;">
            <div class="modal-header border-0 pb-0">
                <h5 class="modal-title fw-bold ps-2">Присоединиться</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body pt-2">
                <form class="lobby-modal-form" onsubmit="joinRoom(); return false;">
                    <input type="text" id="join-room-code"
                        class="form-control lobby-modal-code-input text-center text-uppercase"
                        placeholder="A1B2C3">
                    <input type="password" id="join-room-pass" class="form-control"
                        placeholder="Пароль комнаты (необязательно)">

                    <button type="button" class="btn lobby-modal-secondary-btn" onclick="scanQrCode()">
                        <i class="bi bi-qr-code-scan me-2"></i>Сканировать QR
                    </button>

                    <button type="submit" class="btn btn-primary lobby-modal-primary-btn">Присоединиться</button>
                </form>
            </div>
        </div>
    </div>
</div>

<!-- 8. Create Modal -->
<div class="modal fade lobby-modal" id="createModal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content border-0 shadow" style="border-radius: 24px;">
            <div class="modal-header border-0 pb-0">
                <h5 class="modal-title fw-bold ps-2" id="create-modal-title">Новая комната</h5>
                <button type="button" class="btn-close" onclick="closeCreateRoomModal(event)"
                    aria-label="Закрыть"></button>
            </div>
            <div class="modal-body pt-2">
                <form class="lobby-modal-form" onsubmit="createRoom(); return false;">
                    <div id="create-room-replay-hint" class="create-room-replay-hint" hidden></div>
                    <input type="text" id="create-room-title" class="form-control"
                        placeholder="Название комнаты">
                    <input type="password" id="create-room-pass" class="form-control"
                        placeholder="Пароль комнаты (необязательно)">
                    <label class="create-room-public-row" for="create-room-public">
                        <span class="create-room-public-copy">
                            <span class="create-room-public-title">Сделать публичной</span>
                            <span class="create-room-public-help">Комната появится в открытых играх</span>
                        </span>
                        <span class="form-check form-switch create-room-public-switch">
                            <input class="form-check-input" type="checkbox" id="create-room-public">
                        </span>
                    </label>
                    <button type="submit" id="create-room-submit" class="btn btn-primary lobby-modal-primary-btn">Создать</button>
                </form>
            </div>
        </div>
    </div>
</div>

<!-- 8.1 Scheduled Game Modal -->
<div class="modal fade" id="scheduledGameModal" aria-hidden="true" data-bs-backdrop="static" data-bs-keyboard="false" data-bs-focus="false">
    <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content border-0 shadow" style="border-radius: 24px;">
            <div class="modal-header border-0 pb-0">
                <h5 class="modal-title fw-bold ps-2" id="scheduled-game-modal-title">Собери игру</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Закрыть"></button>
            </div>
            <div class="modal-body pt-2">
                <form onsubmit="createScheduledGame(); return false;">
                    <input type="hidden" id="scheduled-game-edit-id" value="">
                    <select id="scheduled-game-type" class="form-select mb-3 fw-bold" style="border-radius: 16px;"></select>
                    <input type="text" id="scheduled-game-title" class="form-control mb-3 fw-bold"
                        placeholder="Название игры" style="border-radius: 16px;">
                    <label class="form-label small fw-bold text-muted mb-1" for="scheduled-game-starts">Когда начать</label>
                    <input type="datetime-local" id="scheduled-game-starts" class="form-control mb-3"
                        style="border-radius: 16px;">
                    <div class="row g-2 mb-3">
                        <div class="col-6">
                            <label class="form-label small fw-bold text-muted mb-1" for="scheduled-game-min-players">Старт от</label>
                            <input type="number" min="1" max="16" id="scheduled-game-min-players"
                                class="form-control" value="2" placeholder="2 игрока" inputmode="numeric"
                                aria-describedby="scheduled-game-min-help" style="border-radius: 16px;">
                            <div id="scheduled-game-min-help" class="form-text small">Минимум для старта</div>
                        </div>
                        <div class="col-6">
                            <label class="form-label small fw-bold text-muted mb-1" for="scheduled-game-max-players">Мест всего</label>
                            <input type="number" min="2" max="16" id="scheduled-game-max-players"
                                class="form-control" value="8" placeholder="8 игроков" inputmode="numeric"
                                aria-describedby="scheduled-game-max-help" style="border-radius: 16px;">
                            <div id="scheduled-game-max-help" class="form-text small">Лимит комнаты</div>
                        </div>
                    </div>
                    <textarea id="scheduled-game-description" class="form-control mb-3" rows="2"
                        placeholder="Описание (необязательно)" style="border-radius: 16px;"></textarea>
                    <div class="form-text small mb-3">Записавшиеся увидят обновлённое время в расписании.</div>
                    <button type="submit" id="scheduled-game-submit" class="btn btn-primary w-100 btn-lg"
                        style="border-radius: 16px;">Собрать игру</button>
                </form>
            </div>
        </div>
    </div>
</div>

<!-- 9. QR Invite Modal -->
<div class="modal fade" id="qrInviteModal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered" style="width: 85%; max-width: 480px;">
        <div class="modal-content system-modal border-0 shadow-lg" style="border-radius: 32px; padding: 20px; position: relative;">
            <button type="button" class="btn-close position-absolute top-0 end-0 m-3"
                data-bs-dismiss="modal" aria-label="Close"
                style="z-index: 10;"></button>
            <div class="d-flex justify-content-center mb-2">
                <div style="width: 40px; height: 4px; background: #E0E0E0; border-radius: 2px;"></div>
            </div>
            <div class="text-center">
                <h5 class="fw-bold mb-4 system-modal-title" style="font-size: 18px;">Комната <span
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
                    <button class="btn system-modal-btn-secondary py-3 rounded-4 fw-bold shadow-sm"
                        style="font-size: 18px;"
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

<!-- 12. Profile Badge Info Modal -->
<div id="profileBadgeInfoModal" class="custom-modal-overlay badge-info-modal-overlay" style="display: none;" role="dialog"
    aria-modal="true" aria-labelledby="profile-badge-info-title">
    <div class="custom-modal-content badge-info-modal" data-badge-info-id="beta_tester">
        <button type="button" class="badge-info-modal__close" onclick="closeModal('profileBadgeInfoModal')"
            aria-label="Закрыть информацию о значке">
            <i class="bi bi-x-lg" aria-hidden="true"></i>
        </button>

        <div class="badge-info-modal__body">
            <span class="badge-info-modal__icon" aria-hidden="true">β</span>
            <h5 id="profile-badge-info-title" class="badge-info-modal__title">Бета-тестер</h5>
            <div class="badge-info-modal__copy">
                <p>Этот игрок помогает тестировать Party Games до общих релизов и влияет на развитие проекта.</p>
                <p>Свой значок можно скрыть в настройках профиля.</p>
            </div>
        </div>

        <div class="badge-info-modal__footer">
            <button type="button" class="badge-info-modal__action"
                onclick="closeModal('profileBadgeInfoModal')">Понятно</button>
        </div>
    </div>
</div>

<!-- 13. Avatar Viewer Modal -->
<div id="modal-avatar-view" class="custom-modal-overlay" onclick="closeModal('modal-avatar-view')">
    <div class="avatar-view-shell animate__animated animate__zoomIn"
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

<!-- 13. XP Details Modal -->
<div class="modal fade" id="modal-xp-details" tabindex="-1" aria-hidden="true" style="z-index: 1075;">
    <div class="modal-dialog modal-dialog-centered mx-auto" style="max-width: 340px;">
        <div class="modal-content border-0 shadow-lg"
            style="border-radius: 30px; background: rgba(255,255,255,0.95); backdrop-filter: blur(20px);">
            <div class="modal-body p-4 text-center">
                <div class="mb-3">
                    <div class="icon-wrap mx-auto rounded-circle d-flex align-items-center justify-content-center bg-light"
                        style="width: 60px; height: 60px;">
                        <i id="xp-details-icon" class="bi bi-controller text-primary fs-1"></i>
                    </div>
                </div>
                <h5 class="fw-bold mb-1" id="xp-details-game">Brain Battle</h5>
                <p class="text-muted small mb-4" id="xp-details-date">27.02.2026 12:30</p>

                <div class="p-3 bg-light rounded-4 mb-4 text-start">
                    <h6 class="fw-bold mb-3 text-center" style="font-size: 14px;">Расчет опыта (XP)</h6>

                    <div class="d-flex justify-content-between mb-2 pb-2 border-bottom">
                        <span class="text-muted small"><i class="bi bi-gift me-1"></i> Базовый опыт:</span>
                        <span class="fw-bold">+20 XP</span>
                    </div>

                    <div class="d-flex justify-content-between mb-2 pb-2 border-bottom">
                        <span class="text-muted small"><i class="bi bi-trophy me-1"></i> За <span
                                id="xp-details-pos">1</span> место:</span>
                        <span class="fw-bold text-warning" id="xp-details-rank-bonus">+100 XP</span>
                    </div>

                    <div class="d-flex justify-content-between mb-2 pb-2 border-bottom">
                        <span class="text-muted small"><i class="bi bi-star me-1"></i> За игровой счет:</span>
                        <span class="fw-bold" id="xp-details-score-bonus">+150 XP</span>
                    </div>

                    <div class="d-flex justify-content-between mt-3">
                        <span class="fw-bold">Итого получено:</span>
                        <span class="fw-bold text-success fs-5" id="xp-details-total">+270 XP</span>
                    </div>
                </div>

                <div class="text-muted mb-4 small text-start px-2" style="font-size: 11px; line-height: 1.4;">
                    <i class="bi bi-info-circle me-1"></i>
                    Бонус за счет составляет 10% от ваших игровых очков <span id="xp-details-score-raw"
                        class="fw-bold">(3622)</span>, но не более 150 дополнительных XP за одну игру.
                </div>

                <button class="btn btn-primary w-100 rounded-pill py-3 fw-bold shadow-sm"
                    data-bs-dismiss="modal">Понятно</button>
            </div>
        </div>
    </div>
</div>
