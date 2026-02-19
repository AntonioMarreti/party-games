/**
 * Game State Store
 * Encapsulates global state to prevent window leaking and race conditions
 */
class StateStore {
    constructor() {
        this.state = new Map();
        this.listeners = new Map();
    }

    set(key, value) {
        this.state.set(key, value);
        this.notify(key, value);
    }

    get(key, defaultValue = null) {
        return this.state.has(key) ? this.state.get(key) : defaultValue;
    }

    delete(key) {
        this.state.delete(key);
    }

    subscribe(key, callback) {
        if (!this.listeners.has(key)) {
            this.listeners.set(key, new Set());
        }
        this.listeners.get(key).add(callback);
        
        // Return unsubscribe function
        return () => {
            const subs = this.listeners.get(key);
            if (subs) subs.delete(callback);
        };
    }

    notify(key, value) {
        const subs = this.listeners.get(key);
        if (subs) {
            subs.forEach(cb => {
                try {
                    cb(value);
                } catch (e) {
                    console.error(`Error in state listener for ${key}:`, e);
                }
            });
        }
    }
}

// Global instance 
window.appState = new StateStore();
