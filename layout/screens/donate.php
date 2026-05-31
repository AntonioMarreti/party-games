<!-- Tab: Donate -->
<!-- Screen: Donate -->
<div id="screen-donate" class="screen" style="display: none;">
    <div class="header-bg">
        <div class="d-flex align-items-center">
            <button class="btn btn-link text-white p-0 me-3" onclick="showScreen('lobby'); switchTab('profile');">
                <i class="bi bi-chevron-left fs-3"></i>
            </button>
            <h4 class="fw-bold m-0">Поддержать</h4>
        </div>
    </div>

    <!-- Scrollable Content -->
    <div class="content-wrapper px-3 pt-3" style="padding-bottom: 120px;">

        <!-- Premium Banner -->
        <div class="donate-banner text-center mb-4 p-4 rounded-4 shadow-sm" style="background: linear-gradient(135deg, rgba(var(--bs-primary-rgb), 0.08) 0%, rgba(var(--bs-primary-rgb), 0.02) 100%); border: 1px solid rgba(var(--bs-primary-rgb), 0.15);">
            <div class="mb-3">
                <i class="bi bi-heart-fill text-primary" style="font-size: 2.5rem;"></i>
            </div>
            <h5 class="fw-bold mb-2">Спасибо за поддержку!</h5>
            <p class="mb-0 text-muted" style="font-size: 0.9rem; line-height: 1.4;">Ваши звезды помогают оплачивать серверы и развивать проект.</p>
        </div>

        <!-- Presets -->
        <div class="settings-group mb-4 p-4 rounded-4 shadow-sm border-0" style="background: var(--bg-content);">
            <h6 class="fw-bold text-uppercase small mb-3 opacity-75 d-flex align-items-center">
                <i class="bi bi-lightning-charge-fill me-2 text-primary"></i> Выберите сумму
            </h6>
            <div class="donation-grid" style="grid-template-columns: repeat(4, 1fr); gap: 10px;">
                <div class="donation-preset p-2 rounded-3 text-center" onclick="selectDonationPreset(10, this)">
                    <div class="preset-amount fs-5 fw-bold">10</div>
                </div>
                <div class="donation-preset p-2 rounded-3 text-center" onclick="selectDonationPreset(25, this)">
                    <div class="preset-amount fs-5 fw-bold">25</div>
                </div>
                <div class="donation-preset p-2 rounded-3 text-center" onclick="selectDonationPreset(50, this)">
                    <div class="preset-amount fs-5 fw-bold">50</div>
                </div>
                <div class="donation-preset p-2 rounded-3 text-center" onclick="selectDonationPreset(100, this)">
                    <div class="preset-amount fs-5 fw-bold">100</div>
                </div>
                <!-- Row 2 -->
                <div class="donation-preset p-2 rounded-3 text-center" onclick="selectDonationPreset(250, this)">
                    <div class="preset-amount fs-5 fw-bold">250</div>
                </div>
                <div class="donation-preset p-2 rounded-3 text-center" onclick="selectDonationPreset(500, this)">
                    <div class="preset-amount fs-5 fw-bold">500</div>
                </div>
                <div class="donation-preset p-2 rounded-3 text-center" onclick="selectDonationPreset(1000, this)">
                    <div class="preset-amount fs-5 fw-bold">1k</div>
                </div>
                <div class="donation-preset p-2 rounded-3 text-center" onclick="selectDonationPreset(2500, this)">
                    <div class="preset-amount fs-5 fw-bold">2.5k</div>
                </div>
            </div>
        </div>

        <!-- Custom Amount Input -->
        <div class="settings-group mb-4 p-4 rounded-4 shadow-sm border-0" style="background: var(--bg-content);">
            <h6 class="fw-bold text-uppercase small mb-3 opacity-75 d-flex align-items-center">
                <i class="bi bi-pencil-square me-2 text-primary"></i> Или введите свою
            </h6>

            <div class="stepper-container d-flex align-items-center justify-content-between p-2 rounded-3"
                style="background: var(--bg-app); border: 1px solid var(--border-color); height: 60px;">

                <button class="btn btn-link text-decoration-none text-primary"
                    style="width: 46px; height: 100%; display: flex; align-items: center; justify-content: center;"
                    onclick="adjustDonation(-10)">
                    <i class="bi bi-dash-lg" style="font-size: 1.2rem;"></i>
                </button>

                <div class="flex-grow-1 d-flex align-items-center justify-content-center position-relative h-100 px-2">
                    <i class="bi bi-star-fill text-primary opacity-75 me-2" style="font-size: 1.2rem;"></i>
                    <input type="number" id="custom-donation-input"
                        class="form-control border-0 bg-transparent p-0 fw-bolder text-center shadow-none" placeholder="0"
                        value="50" style="font-size: 1.8rem; width: 100px; color: var(--text-main);"
                        onfocus="this.select()">
                </div>

                <button class="btn btn-link text-decoration-none text-primary"
                    style="width: 46px; height: 100%; display: flex; align-items: center; justify-content: center;"
                    onclick="adjustDonation(10)">
                    <i class="bi bi-plus-lg" style="font-size: 1.2rem;"></i>
                </button>
            </div>
        </div>

        <div class="text-center mt-4 mb-2">
            <div class="d-inline-flex align-items-center justify-content-center px-3 py-2 rounded-pill" style="background: rgba(var(--bs-primary-rgb), 0.05); border: 1px solid rgba(var(--bs-primary-rgb), 0.1);">
                <i class="bi bi-shield-check text-primary opacity-75 me-2 fs-6"></i>
                <small class="text-muted fw-medium" style="font-size: 12px;">Безопасная оплата через Telegram Stars</small>
            </div>
        </div>
    </div>

    <!-- Fixed Bottom Button -->
    <div class="fixed-bottom p-3"
        style="background: linear-gradient(to top, var(--bg-app) 80%, transparent); z-index: 1000;">
        <div class="container" style="max-width: 480px;">
            <button class="donate-btn-lg clickable w-100 shadow-sm rounded-4 btn-primary" onclick="processDonation()" style="margin: 0; border: none; height: 56px; font-weight: 600; color: #fff; background-color: var(--bs-primary);">
                <span id="donate-btn-text">Донат: 0 <i class="bi bi-star-fill"></i></span>
            </button>
        </div>
    </div>
</div>

<style>
    /* FIX: Ensure modal is on top of everything (Device Wrapper is 2000, Nav is 10000) */
    .modal {
        z-index: 20000 !important;
    }

    .modal-backdrop {
        z-index: 10999 !important;
        opacity: 0.8 !important;
        background-color: #000 !important;
    }
</style>

<script>
    let currentDonationAmount = 50; // Default start

    // Init on load
    setTimeout(() => {
        const input = document.getElementById('custom-donation-input');
        if (input) {
            input.value = currentDonationAmount;
            updateDonateButton();
            // Highlight default preset
            const defaultPreset = document.querySelector(`.donation-preset[onclick*="${currentDonationAmount}"]`);
            if (defaultPreset) defaultPreset.classList.add('active');
        }
    }, 100);

    function selectDonationPreset(amount, el) {
        // UI Update
        document.querySelectorAll('.donation-preset').forEach(b => b.classList.remove('active'));
        if (el) el.classList.add('active');

        // Logic Update
        currentDonationAmount = amount;
        document.getElementById('custom-donation-input').value = amount;
        updateDonateButton();
    }

    function adjustDonation(delta) {
        let newAmount = currentDonationAmount + delta;
        if (newAmount < 1) newAmount = 1;

        currentDonationAmount = newAmount;
        document.getElementById('custom-donation-input').value = newAmount;

        // Update presets UI if matches
        document.querySelectorAll('.donation-preset').forEach(b => b.classList.remove('active'));
        const matchingPreset = document.querySelector(`.donation-preset[onclick*="${newAmount}"]`);
        if (matchingPreset) matchingPreset.classList.add('active');

        updateDonateButton();
    }

    document.getElementById('custom-donation-input').addEventListener('input', (e) => {
        document.querySelectorAll('.donation-preset').forEach(b => b.classList.remove('active'));
        let val = parseInt(e.target.value);
        if (isNaN(val)) val = 0;
        currentDonationAmount = val;
        updateDonateButton();
    });

    function updateDonateButton() {
        const btnText = document.getElementById('donate-btn-text');
        // Btn element
        const btn = document.querySelector('.donate-btn-lg');

        if (currentDonationAmount > 0) {
            btnText.innerHTML = `ПОЖЕРТВОВАТЬ ${currentDonationAmount} <i class="bi bi-star-fill"></i>`;
            btn.style.opacity = '1';
            btn.style.pointerEvents = 'auto';
        } else {
            btnText.innerHTML = `ВВЕДИТЕ СУММУ`;
            btn.style.opacity = '0.5';
            btn.style.pointerEvents = 'none';
        }
    }

    async function processDonation() {
        if (currentDonationAmount < 1) {
            if (window.showAlert) window.showAlert('Ошибка', 'Минимальная сумма 1 звезда', 'error');
            return;
        }

        const btn = document.querySelector('.donate-btn-lg');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<div class="spinner-border spinner-border-sm"></div>';
        btn.style.pointerEvents = 'none';

        try {
            const res = await window.apiRequest({
                action: 'create_invoice',
                amount: currentDonationAmount
            });

            if (res.status === 'ok') {
                // Open Invoice
                if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.openInvoice) {
                    window.Telegram.WebApp.openInvoice(res.invoice_link, (status) => {
                        if (status === 'paid') {
                            if (window.showAlert) window.showAlert('Спасибо!', 'Оплата прошла успешно! 💖', 'success');
                            window.triggerHaptic('notification', 'success');
                            window.createConfetti(); // Assuming we have this utility
                        } else if (status === 'cancelled') {
                            // cancelled
                        } else if (status === 'failed') {
                            if (window.showAlert) window.showAlert('Ошибка', 'Оплата не прошла', 'error');
                        }
                    });
                } else {
                    // Browser Fallback (QR or DeepLink)
                    showPaymentModal(res.invoice_link);
                }
            } else {
                if (window.showAlert) window.showAlert('Ошибка', res.message, 'error');
            }
        } catch (e) {
            console.error(e);
            if (window.showAlert) window.showAlert('Ошибка', 'Не удалось создать счет', 'error');
        } finally {
            btn.innerHTML = originalText;
            btn.style.pointerEvents = 'auto';
        }
    }

    let paymentPollInterval;
    let initialTotalDonated = 0;

    async function showPaymentModal(url) {
        // 1. Get current donation amount to compare against
        try {
            // We assume user data is somewhere, but let's fetch fresh to be sure
            const res = await window.apiRequest({ action: 'get_me' });
            if (res.status === 'ok') {
                initialTotalDonated = parseInt(res.user.total_donated_stars) || 0;
            }
        } catch (e) { console.error("Failed to fetch initial stats", e); }

        // Detect if mobile
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

        const modalBody = document.getElementById('payment-modal-body');
        modalBody.innerHTML = '';

        if (isMobile) {
            // Mobile: Button
            modalBody.innerHTML = `
                <div class="text-center" id="payment-content">
                    <div class="mb-4">
                        <i class="bi bi-telegram display-1 text-primary"></i>
                    </div>
                    <p class="text-muted small mb-4">Нажмите кнопку ниже, чтобы перейти в приложение Telegram для оплаты.</p>
                    <a href="${url}" class="btn btn-primary w-100 py-3 rounded-4 fw-bold shadow-sm">
                        <i class="bi bi-credit-card-2-front me-2"></i> Перейти к оплате
                    </a>
                </div>
            `;
        } else {
            // Desktop: QR Code
            modalBody.innerHTML = `
                <div class="text-center" id="payment-content">
                    <div class="qr-wrapper my-3 bg-white p-3 rounded-4 border border-light shadow-sm d-inline-block">
                        <div id="payment-qrcode"></div>
                    </div>
                    <p class="text-muted small">Откройте камеру на телефоне или Telegram, чтобы оплатить.</p>
                    <a href="${url}" target="_blank" class="btn btn-link btn-sm text-primary mt-2 text-decoration-none">
                        Открыть ссылку вручную <i class="bi bi-box-arrow-up-right"></i>
                    </a>
                </div>
            `;

            // Generate QR
            setTimeout(() => {
                const qrContainer = document.getElementById("payment-qrcode");
                if (qrContainer) {
                    new QRCode(qrContainer, {
                        text: url,
                        width: 180,
                        height: 180,
                        colorDark: "#000000",
                        colorLight: "#ffffff",
                        correctLevel: QRCode.CorrectLevel.H
                    });
                }
            }, 100);
        }

        // Show Modal using Bootstrap
        const paymentModalEl = document.getElementById('paymentModal');

        // Move to body to avoid z-index/transform issues in .screen
        if (paymentModalEl.parentElement !== document.body) {
            document.body.appendChild(paymentModalEl);
        }

        const paymentModal = new bootstrap.Modal(paymentModalEl);
        paymentModal.show();

        // Start Polling
        if (paymentPollInterval) clearInterval(paymentPollInterval);
        paymentPollInterval = setInterval(async () => {
            try {
                const check = await window.apiRequest({ action: 'get_me' });
                if (check.status === 'ok') {
                    const currentTotal = parseInt(check.user.total_donated_stars) || 0;
                    if (currentTotal > initialTotalDonated) {
                        // SUCCESS!
                        clearInterval(paymentPollInterval);
                        showPaymentSuccess();
                    }
                }
            } catch (e) { console.error("Polling error", e); }
        }, 3000);

        // Clear interval on close
        paymentModalEl.addEventListener('hidden.bs.modal', () => {
            if (paymentPollInterval) clearInterval(paymentPollInterval);
        }, { once: true });
    }

    function showPaymentSuccess() {
        const content = document.getElementById('payment-content');
        if (!content) return;

        content.innerHTML = `
            <div class="mb-4 animate__animated animate__bounceIn">
                <i class="bi bi-check-circle-fill display-1 text-success"></i>
            </div>
            <h4 class="fw-bold mb-3 text-dark">Оплата прошла!</h4>
            <p class="text-muted mb-4">Спасибо за вашу поддержку! 💖<br>Звезды успешно зачислены.</p>
            <button class="btn btn-success w-100 py-3 rounded-4 fw-bold shadow-sm" data-bs-dismiss="modal">
                Отлично!
            </button>
        `;
        // Trigger confetti
        if (window.createConfetti) window.createConfetti();
        if (window.triggerHaptic) window.triggerHaptic('notification', 'success');

        // Update UI stats if needed (user object might need refresh elsewhere)
    }
</script>

<!-- Payment Modal -->
<div class="modal fade" id="paymentModal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered mx-auto" style="max-width: 380px;">
        <div class="modal-content border-0 shadow-lg"
            style="border-radius: 30px; background: rgba(255,255,255,0.9); backdrop-filter: blur(10px);">
            <div class="modal-header border-0 pb-0 justify-content-center position-relative">
                <h5 class="modal-title fw-bold">Оплата Stars</h5>
                <button type="button" class="btn-close position-absolute end-0 top-0 m-3" data-bs-dismiss="modal"
                    aria-label="Close"></button>
            </div>
            <div class="modal-body pt-2 pb-4 px-4 text-center" id="payment-modal-body">
                <!-- Content injected via JS -->
            </div>
        </div>
    </div>
</div>