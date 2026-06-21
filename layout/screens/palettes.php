<!-- Screen: Palettes -->
<div id="screen-palettes" class="screen">
    <div class="room-content-wrapper">
        <div class="settings-screen-header">
            <button class="btn-back settings-back-btn" onclick="window.showScreen('settings')" aria-label="Назад">
                <i class="bi bi-chevron-left"></i>
            </button>
            <h4 class="fw-bold m-0">Палитры</h4>
        </div>

        <div class="settings-group settings-screen-group mb-4">
            <div class="settings-section-head">
                <h6 class="settings-section-title"><i class="bi bi-palette"></i>Встроенные палитры</h6>
            </div>
            <div class="palette-grid" id="palette-grid-container">
                <div class="palette-tile" data-palette="amber-sapphire" onclick="applyPalette('amber-sapphire'); highlightPaletteBtn(this);">
                    <span class="palette-preview" style="--palette-a:#0F4C81;--palette-b:#F59E0B" aria-hidden="true"><span class="palette-preview-tone palette-preview-tone-a"></span><span class="palette-preview-tone palette-preview-tone-b"></span></span>
                    <div class="palette-name">Янтарный сапфир</div>
                </div>
                <div class="palette-tile" data-palette="olive-sand" onclick="applyPalette('olive-sand'); highlightPaletteBtn(this);">
                    <span class="palette-preview" style="--palette-a:#6B705C;--palette-b:#A5A58D" aria-hidden="true"><span class="palette-preview-tone palette-preview-tone-a"></span><span class="palette-preview-tone palette-preview-tone-b"></span></span>
                    <div class="palette-name">Оливковый песок</div>
                </div>
                <div class="palette-tile" data-palette="lavender-graphite" onclick="applyPalette('lavender-graphite'); highlightPaletteBtn(this);">
                    <span class="palette-preview" style="--palette-a:#413F54;--palette-b:#B19CD9" aria-hidden="true"><span class="palette-preview-tone palette-preview-tone-a"></span><span class="palette-preview-tone palette-preview-tone-b"></span></span>
                    <div class="palette-name">Лавандовый графит</div>
                </div>
                <div class="palette-tile" data-palette="burgundy-cream" onclick="applyPalette('burgundy-cream'); highlightPaletteBtn(this);">
                    <span class="palette-preview" style="--palette-a:#722F37;--palette-b:#EED9C4" aria-hidden="true"><span class="palette-preview-tone palette-preview-tone-a"></span><span class="palette-preview-tone palette-preview-tone-b"></span></span>
                    <div class="palette-name">Бордовый крем</div>
                </div>
                <div class="palette-tile" data-palette="jade-biscuit" onclick="applyPalette('jade-biscuit'); highlightPaletteBtn(this);">
                    <span class="palette-preview" style="--palette-a:#3F8E83;--palette-b:#FFDCA8" aria-hidden="true"><span class="palette-preview-tone palette-preview-tone-a"></span><span class="palette-preview-tone palette-preview-tone-b"></span></span>
                    <div class="palette-name">Нефритовый бисквит</div>
                </div>
                <div class="palette-tile" data-palette="azure-quartz" onclick="applyPalette('azure-quartz'); highlightPaletteBtn(this);">
                    <span class="palette-preview" style="--palette-a:#296D98;--palette-b:#EAF3FA" aria-hidden="true"><span class="palette-preview-tone palette-preview-tone-a"></span><span class="palette-preview-tone palette-preview-tone-b"></span></span>
                    <div class="palette-name">Лазурный кварц</div>
                </div>
                <div class="palette-tile" data-palette="graphite-lemon" onclick="applyPalette('graphite-lemon'); highlightPaletteBtn(this);">
                    <span class="palette-preview" style="--palette-a:#1E1E1E;--palette-b:#FFE788" aria-hidden="true"><span class="palette-preview-tone palette-preview-tone-a"></span><span class="palette-preview-tone palette-preview-tone-b"></span></span>
                    <div class="palette-name">Графитовый лимон</div>
                </div>
                <div class="palette-tile" data-palette="beige-olive" onclick="applyPalette('beige-olive'); highlightPaletteBtn(this);">
                    <span class="palette-preview" style="--palette-a:#424E2B;--palette-b:#E5D9C6" aria-hidden="true"><span class="palette-preview-tone palette-preview-tone-a"></span><span class="palette-preview-tone palette-preview-tone-b"></span></span>
                    <div class="palette-name">Бежево-оливковая</div>
                </div>
            </div>
        </div>
    </div>
</div>
