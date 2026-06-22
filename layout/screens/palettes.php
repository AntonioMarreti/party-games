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
    <div class="room-content-wrapper palette-picker-shell">
        <header class="palette-app-header">
            <button type="button" class="palette-app-header-back" onclick="ThemeManager.cancelPalettePreview()" aria-label="Назад в настройки">
                <i class="bi bi-chevron-left" aria-hidden="true"></i>
            </button>
            <h1 class="palette-app-header-title">Палитры</h1>
        </header>

        <div class="palette-picker-scroll">
            <section class="palette-hero" id="palette-hero" data-preview-palette="amber-sapphire" aria-labelledby="palette-hero-name">
                <div class="palette-hero-canvas" aria-hidden="true">
                    <div class="palette-hero-surface"></div>
                    <div class="palette-hero-raised"></div>
                    <div class="palette-hero-accent"></div>
                </div>
                <div class="palette-hero-footer">
                    <span class="palette-hero-name" id="palette-hero-name">Янтарный сапфир</span>
                    <i class="bi bi-check-circle-fill palette-hero-check" aria-hidden="true"></i>
                </div>
            </section>

            <section class="palette-picker-section" aria-labelledby="built-in-palettes-title">
                <div class="palette-picker-section-head">
                    <h2 id="built-in-palettes-title">Встроенные палитры</h2>
                    <span><?= count($paletteDefinitions) ?> палитр</span>
                </div>

                <div class="palette-list" role="listbox" aria-labelledby="built-in-palettes-title">
                    <?php foreach ($paletteDefinitions as $id => $name): ?>
                    <button type="button"
                        class="palette-row"
                        data-palette="<?= $id ?>"
                        role="option"
                        aria-selected="false"
                        onclick="ThemeManager.previewPalette('<?= $id ?>')">
                        <span class="palette-role-swatch" data-preview-palette="<?= $id ?>" aria-hidden="true">
                            <span class="palette-role-surface"></span>
                            <span class="palette-role-raised"></span>
                            <span class="palette-role-accent"></span>
                        </span>
                        <span class="palette-name"><?= $name ?></span>
                        <i class="bi bi-check-circle-fill palette-row-check" aria-hidden="true"></i>
                    </button>
                    <?php endforeach; ?>
                </div>
            </section>
        </div>

        <footer class="palette-picker-footer">
            <button type="button" class="palette-action palette-action-secondary" id="palette-cancel-button" onclick="ThemeManager.cancelPalettePreview()">Назад</button>
            <button type="button" class="palette-action palette-action-primary" id="palette-apply-button" onclick="ThemeManager.commitPalettePreview()" disabled>Применить</button>
        </footer>
    </div>
</div>
