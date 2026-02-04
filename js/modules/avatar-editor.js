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

        // Initial white background
        this.clear();
    }

    resize() {
        // Make canvas square and responsive
        const rect = this.container.getBoundingClientRect();
        const size = Math.min(rect.width, 400); // Max 400px

        // Only resize if significantly different to avoid clearing on mobile scroll
        if (Math.abs(this.canvas.width - size) > 10) {
            this.canvas.width = size;
            this.canvas.height = size;

            // Re-apply styles after resize
            this.ctx.lineJoin = 'round';
            this.ctx.lineCap = 'round';
            this.restoreHistory();
        }
    }

    startDrawing(e) {
        this.isDrawing = true;
        [this.lastX, this.lastY] = this.getCoords(e);
        this.saveState(); // Save state before new stroke
    }

    draw(e) {
        if (!this.isDrawing) return;

        const [x, y] = this.getCoords(e);

        this.ctx.beginPath();
        this.ctx.moveTo(this.lastX, this.lastY);
        this.ctx.lineTo(x, y);

        this.ctx.lineWidth = this.lineWidth;
        if (this.mode === 'erase') {
            this.ctx.globalCompositeOperation = 'destination-out';
            this.ctx.strokeStyle = 'rgba(0,0,0,1)';
            this.ctx.lineWidth = 20; // Eraser is bigger
        } else {
            this.ctx.globalCompositeOperation = 'source-over';
            this.ctx.strokeStyle = this.color;
        }

        this.ctx.stroke();
        [this.lastX, this.lastY] = [x, y];
    }

    stopDrawing() {
        if (this.isDrawing) {
            this.isDrawing = false;
            this.ctx.closePath();
        }
    }

    getCoords(e) {
        const rect = this.canvas.getBoundingClientRect();
        return [
            e.clientX - rect.left,
            e.clientY - rect.top
        ];
    }

    setColor(color, element) {
        this.mode = 'draw';
        this.color = color;

        // Remove selection from all
        document.querySelectorAll('.avatar-color-option').forEach(el => el.classList.remove('selected'));

        // Add to current if passed
        if (element) {
            element.classList.add('selected');
        }
    }

    setSize(size) {
        this.lineWidth = size;
    }

    setEraser() {
        this.mode = 'erase';
        // Clear color selection to indicate eraser mode
        document.querySelectorAll('.avatar-color-option').forEach(el => el.classList.remove('selected'));
    }

    clear() {
        this.ctx.fillStyle = "#FFFFFF";
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.globalCompositeOperation = 'source-over';
        this.history = [];
        this.step = -1;
        this.saveState();
    }

    // --- History System ---
    saveState() {
        this.step++;
        if (this.step < this.history.length) {
            this.history.length = this.step; // Truncate redo
        }
        this.history.push(this.canvas.toDataURL());
    }

    undo() {
        if (this.step > 0) {
            this.step--;
            this.restoreHistoryFromStep();
        }
    }

    restoreHistoryFromStep() {
        const img = new Image();
        img.src = this.history[this.step];
        img.onload = () => {
            this.ctx.globalCompositeOperation = 'source-over';
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.drawImage(img, 0, 0);
        };
    }

    restoreHistory() {
        if (this.history.length > 0) {
            this.restoreHistoryFromStep();
        } else {
            this.clear();
        }
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
