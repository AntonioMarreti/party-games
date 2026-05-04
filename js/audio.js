class AudioManager {
    constructor() {
        // Default to true if not explicitly set to false
        const stored = localStorage.getItem('audio_enabled');
        this.enabled = stored === null ? true : stored === 'true';
        this.sounds = {};
        this.basePath = 'sounds/';
        this.unlocked = false;
        this.volumes = {
            click: 0.28,
            tick_soft: 0.18,
            hover: 0.2,
            success: 0.24,
            success_bright: 0.2,
            error: 0.2,
            error_soft: 0.16,
            notification: 0.18,
            pop: 0.22,
            reveal: 0.14,
            round_start: 0.16,
            move: 0.18,
            win: 0.24,
            join: 0.18,
            leave: 0.18,
            alert: 0.18,
            glitch: 0.16,
            scratch: 0.14,
            ambient_glass: 0.12
        };

        // Define sound library
        this.library = {
            'click': 'click_001.ogg',
            'tick_soft': 'tick_001.ogg',
            'hover': 'switch_001.ogg',
            'success': 'confirmation_001.ogg',
            'success_bright': 'confirmation_004.ogg',
            'error': 'error_001.ogg',
            'error_soft': 'error_004.ogg',
            'notification': 'toggle_001.ogg',
            'pop': 'drop_002.ogg',
            'reveal': 'glass_003.ogg',
            'round_start': 'maximize_008.ogg',
            'move': 'pluck_001.ogg',
            'win': 'confirmation_004.ogg',
            'join': 'switch_003.ogg',
            'leave': 'switch_004.ogg',
            'alert': 'error_008.ogg',
            'glitch': 'glitch_001.ogg',
            'scratch': 'scratch_001.ogg',
            'ambient_glass': 'glass_004.ogg'
        };

        this.preload();
    }

    preload() {
        for (const [key, file] of Object.entries(this.library)) {
            const audio = new Audio(this.basePath + file);
            audio.preload = 'auto'; // Force browser to start downloading
            audio.volume = this.volumes[key] ?? 0.2;
            this.sounds[key] = audio;
            // Trigger load for especially critical sounds
            audio.load();
        }
    }

    // Modern browsers require a user gesture to start audio
    async unlock() {
        if (this.unlocked) return;

        // Play a silent buffer to unlock
        const silent = new Audio();
        try {
            await silent.play();
            this.unlocked = true;
            console.log("[Audio] System unlocked by user gesture");
        } catch (e) {
            console.warn("[Audio] Unlock failed:", e);
        }
    }

    async play(key) {
        if (!this.enabled) return;

        const sound = this.sounds[key];
        if (sound) {
            // Clone node to allow overlapping sounds
            const clone = sound.cloneNode();
            clone.volume = sound.volume;
            try {
                await clone.play();
            } catch (e) {
                console.warn('Audio play restricted:', e);
            }
        } else {
            console.warn(`Sound '${key}' not found in library.`);
        }
    }

    toggle(state) {
        if (typeof state === 'boolean') {
            this.enabled = state;
        } else {
            this.enabled = !this.enabled;
        }
        localStorage.setItem('audio_enabled', this.enabled);
        return this.enabled;
    }
}

// Create global instance
const audioManager = new AudioManager();
window.audioManager = audioManager;
