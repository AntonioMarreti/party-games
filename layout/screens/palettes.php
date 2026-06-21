<!-- Screen: Palettes -->
<?php
$paletteDefinitions = [
    'amber-sapphire' => 'Янтарный сапфир',
    'olive-sand' => 'Оливковый песок',
    'lavender-graphite' => 'Лавандовый графит',
    'burgundy-cream' => 'Бордовый крем',
    'jade-biscuit' => 'Нефритовый бисквит',
    'azure-quartz' => 'Лазурный кварц',
    'graphite-lemon' => 'Графитовый лимон',
    'beige-olive' => 'Бежево-оливковая'
];
?>
<div id="screen-palettes" class="screen">
    <div class="room-content-wrapper">
        <div class="settings-screen-header mb-4">
            <button class="btn-back settings-back-btn" onclick="window.showScreen('settings')" aria-label="Назад">
                <i class="bi bi-chevron-left"></i>
            </button>
            <h4 class="fw-bold m-0">Палитры</h4>
        </div>

        <div class="palettes-gallery-header px-3 mb-3">
            <h5 class="fw-bold mb-1">Встроенные палитры</h5>
            <div class="text-muted small">8 вариантов оформления</div>
        </div>

        <div class="palette-list px-3 pb-5">
            <?php foreach($paletteDefinitions as $id => $name): ?>
            <div class="palette-card palette-tile" data-palette="<?= $id ?>" data-preview-palette="<?= $id ?>" onclick="applyPalette('<?= $id ?>'); highlightPaletteBtn(this);">

                <div class="p-preview-window">
                    <div class="p-preview-surface">
                        <div class="p-preview-text p-preview-text-1"></div>
                        <div class="p-preview-text p-preview-text-2"></div>
                        <div class="p-preview-accent"></div>
                    </div>
                    <div class="p-preview-raised">
                        <div class="p-preview-fab"></div>
                    </div>
                </div>

                <div class="p-card-footer">
                    <div class="palette-name"><?= $name ?></div>
                    <div class="palette-status">
                        <i class="bi bi-check-circle-fill"></i> <span class="ms-1">Выбрано</span>
                    </div>
                </div>
                <!-- Hidden existing preview span so that settings row extraction in JS continues working without changes to JS -->
                <span class="palette-preview d-none" style="--palette-a:var(--app-accent); --palette-b:var(--app-text)" aria-hidden="true">
                    <span class="palette-preview-tone palette-preview-tone-a"></span>
                    <span class="palette-preview-tone palette-preview-tone-b"></span>
                </span>
            </div>
            <?php endforeach; ?>
        </div>
    </div>
</div>
