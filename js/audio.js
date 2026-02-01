class AudioManager {
    constructor() {
        // Default to true if not explicitly set to false
        const stored = localStorage.getItem('audio_enabled');
        this.enabled = stored === null ? true : stored === 'true';
        this.sounds = {};
        this.basePath = 'sounds/';
        this.unlocked = false;

        // Define sound library
        this.library = {
            'click': 'click_001.ogg',
            'hover': 'switch_001.ogg',
            'success': 'confirmation_001.ogg',
            'error': 'error_001.ogg',
            'notification': 'toggle_001.ogg',
            'pop': 'drop_002.ogg',
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
            audio.volume = 0.5;
            this.sounds[key] = audio;
            // Trigger load for especially critical sounds
            audio.load();
        }
    }

    // Modern browsers require a user gesture to start audio
    unlock() {
        if (this.unlocked) return;

        // Play a silent buffer to unlock
        const silent = new Audio();
        silent.play().then(() => {
            this.unlocked = true;
            console.log("[Audio] System unlocked by user gesture");
        }).catch(e => {
            console.warn("[Audio] Unlock failed:", e);
        });
    }

    play(key) {
        if (!this.enabled) return;

        const sound = this.sounds[key];
        if (sound) {
            // Clone node to allow overlapping sounds
            const clone = sound.cloneNode();
            clone.volume = sound.volume;
            clone.play().catch(e => {
                console.warn('Audio play restricted:', e);
            });
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
