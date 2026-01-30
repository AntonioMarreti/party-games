class AudioManager {
    constructor() {
        this.enabled = localStorage.getItem('audio_enabled') === 'true'; // Default false
        this.sounds = {};
        this.basePath = 'sounds/';

        // Define sound library
        this.library = {
            'click': 'click1.ogg',
            'hover': 'switch10.ogg',
            'success': 'confirmation_001.ogg',
            'error': 'error_001.ogg',
            'notification': 'switch25.ogg',
            'pop': 'drop_002.ogg',
            'move': 'cardPlace1.ogg',
            'win': 'jingles_steel.ogg',
            'join': 'switch3.ogg',
            'leave': 'switch4.ogg'
        };

        this.preload();
    }

    preload() {
        for (const [key, file] of Object.entries(this.library)) {
            this.sounds[key] = new Audio(this.basePath + file);
            this.sounds[key].volume = 0.5;
        }
    }

    play(key) {
        if (!this.enabled) return;

        const sound = this.sounds[key];
        if (sound) {
            // Clone node to allow overlapping sounds (rapid clicks)
            const clone = sound.cloneNode();
            clone.volume = sound.volume;
            clone.play().catch(e => {
                // Auto-play policy might block init sounds, ignore
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
