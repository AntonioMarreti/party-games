/**
 * Avatar Editor Module
 * Handles canvas drawing for custom avatars.
 */
class AvatarEditor {
    constructor(canvasId, containerId) {
        this.canvas = document.getElementById(canvasId);
        this.container = document.getElementById(containerId);
        this.ctx = this.canvas.getContext('2d');

        this.isDrawing = false;
        this.lastX = 0;
        this.lastY = 0;
        this.color = '#000000';
        this.lineWidth = 5;
        this.mode = 'draw'; // 'draw' or 'erase'

        // History for Undo
        this.history = [];
        this.step = -1;

        this.init();
    }

    init() {
        // Handle Resize
        this.resize();
        window.addEventListener('resize', () => this.resize());

        // Mouse Events
        this.canvas.addEventListener('mousedown', (e) => this.startDrawing(e));
        this.canvas.addEventListener('mousemove', (e) => this.draw(e));
        this.canvas.addEventListener('mouseup', () => this.stopDrawing());
        this.canvas.addEventListener('mouseout', () => this.stopDrawing());

        // Touch Events
        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault(); // Prevent scrolling
            this.startDrawing(e.touches[0]);
        }, { passive: false });

        this.canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            this.draw(e.touches[0]);
        }, { passive: false });

        this.canvas.addEventListener('touchend', () => this.stopDrawing());

        // Match CSS size
        this.resize();

        // Initial fill white
        this.ctx.fillStyle = "#FFFFFF";
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Initial save
        this.saveState();
    }

    resize() {
        // Make canvas square and responsive
        const rect = this.container.getBoundingClientRect();
        // Use shorter side to ensure square fits in container
        const width = Math.floor(rect.width);
        const height = Math.floor(rect.height);

        // Only resize if significantly different to avoid clearing on mobile scroll
        if (Math.abs(this.canvas.width - width) > 5 || Math.abs(this.canvas.height - height) > 5) {
            this.canvas.width = width;
            this.canvas.height = height;

            // Re-apply styles after resize
            this.ctx.lineCap = 'round';
            this.ctx.lineJoin = 'round';

            this.restoreHistory();
        }
    }

    startDrawing(e) {
        this.isDrawing = true;
        [this.lastX, this.lastY] = this.getCoords(e);
        // We do NOT save state on start, we save on stop to capture the stroke
    }

    draw(e) {
        if (!this.isDrawing) return;

        const [x, y] = this.getCoords(e);

        this.ctx.beginPath();
        this.ctx.moveTo(this.lastX, this.lastY);
        this.ctx.lineTo(x, y);

        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';

        if (this.mode === 'erase') {
            this.ctx.globalCompositeOperation = 'source-over';
            this.ctx.strokeStyle = '#FFFFFF';
            this.ctx.lineWidth = 20;
        } else {
            this.ctx.globalCompositeOperation = 'source-over';
            this.ctx.strokeStyle = this.color;
            this.ctx.lineWidth = this.lineWidth;
        }

        this.ctx.stroke();
        [this.lastX, this.lastY] = [x, y];
    }

    stopDrawing() {
        if (this.isDrawing) {
            this.isDrawing = false;
            this.ctx.closePath();
            this.saveState(); // Save state AFTER the stroke is done
        }
    }

    getCoords(e) {
        const rect = this.canvas.getBoundingClientRect();
        // Handle both mouse and touch events
        const clientX = e.clientX || (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
        const clientY = e.clientY || (e.touches && e.touches[0] ? e.touches[0].clientY : 0);

        // Account for any CSS scaling vs Canvas Resolution
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;

        return [
            (clientX - rect.left) * scaleX,
            (clientY - rect.top) * scaleY
        ];
    }

    setColor(color, element) {
        this.mode = 'draw';
        this.color = color;

        // Remove selection from all including eraser (if represented)
        document.querySelectorAll('.avatar-color-option, .btn-eraser').forEach(el => el.classList.remove('selected', 'active'));

        // Add to current if passed
        if (element) {
            element.classList.add('selected');
        }
    }

    setEraser(element) {
        this.mode = 'erase';
        document.querySelectorAll('.avatar-color-option').forEach(el => el.classList.remove('selected'));
        if (element) element.classList.add('active');
    }

    clear() {
        this.ctx.fillStyle = "#FFFFFF";
        this.ctx.globalCompositeOperation = 'source-over';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        this.saveState(); // Save the "cleared" state so we can undo it
    }

    // --- History System ---
    saveState() {
        // If we are not at the end of history (undid something), remove future states
        if (this.step < this.history.length - 1) {
            this.history = this.history.slice(0, this.step + 1);
        }

        this.history.push(this.canvas.toDataURL());
        this.step++;
    }

    undo() {
        if (this.step > 0) {
            this.step--;
            this.restoreHistoryFromStep(this.step);
        }
    }

    setBrushSize(size) {
        this.lineWidth = size;
    }

    restoreHistoryFromStep(stepIndex) {
        const img = new Image();
        img.src = this.history[stepIndex];
        img.onload = () => {
            this.ctx.globalCompositeOperation = 'source-over';
            // Fill white instead of clearing (avoids transparency)
            this.ctx.fillStyle = "#FFFFFF";
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

            // Draw image SCALED to fit current canvas size (fixes resizing gaps)
            this.ctx.drawImage(img, 0, 0, this.canvas.width, this.canvas.height);
        };
    }

    restoreHistory() {
        // Restore current step if resize happens
        if (this.history.length > 0 && this.step >= 0) {
            this.restoreHistoryFromStep(this.step);
        } else {
            // White background default
            this.ctx.fillStyle = "#FFFFFF";
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        }
    }

    async loadImageFromUrl(url) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = "Anonymous"; // Crucial for editing
            img.onload = () => {
                this.ctx.globalCompositeOperation = 'source-over';
                // Clear/Fill White
                this.ctx.fillStyle = "#FFFFFF";
                this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

                // Draw Scaled
                this.ctx.drawImage(img, 0, 0, this.canvas.width, this.canvas.height);
                this.saveState();
                resolve();
            };
            img.onerror = reject;
            img.src = url;
        });
    }

    setBrushSize(size) {
        this.lineWidth = size;
    }

    getBlob() {
        return new Promise(resolve => {
            // Create a temporary canvas to flatten transparency
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = this.canvas.width;
            tempCanvas.height = this.canvas.height;
            const tCtx = tempCanvas.getContext('2d');

            // Fill white background (handling transparency from eraser)
            tCtx.fillStyle = '#FFFFFF';
            tCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

            // Draw original canvas on top
            tCtx.drawImage(this.canvas, 0, 0);

            // Export as JPEG with 0.8 quality for smaller size
            tempCanvas.toBlob(resolve, 'image/jpeg', 0.8);
        });
    }
}

// === Global helper to open editor ===
window.openAvatarEditor = function () {
    const modal = document.getElementById('avatar-editor-overlay');
    if (modal) {
        modal.style.display = 'flex';

        // Force a layout reflow for accurate sizing
        requestAnimationFrame(() => {
            if (!window.avatarEditor) {
                window.avatarEditor = new AvatarEditor('avatar-canvas', 'avatar-canvas-container');
            } else {
                window.avatarEditor.resize();
            }
        });
    }
};

window.closeAvatarEditor = function () {
    const modal = document.getElementById('avatar-editor-overlay');
    if (modal) modal.style.display = 'none';
};
