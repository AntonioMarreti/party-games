/**
 * Storage Manager
 * Wrapper around Telegram CloudStorage with localStorage fallback.
 */
class StorageManager {
    constructor() {
        this.tg = window.Telegram?.WebApp;
        this.useCloud = this.tg && this.tg.CloudStorage && this.tg.isVersionAtLeast('6.9');
    }

    /**
     * Get value from storage
     * @param {string} key 
     * @returns {Promise<string|null>}
     */
    get(key) {
        return new Promise((resolve) => {
            // First try CloudStorage if available
            if (this.useCloud) {
                this.tg.CloudStorage.getItem(key, (err, value) => {
                    if (!err && value) {
                        resolve(value);
                    } else {
                        // Fallback to localStorage if Cloud fails or is empty (migration strategy)
                        resolve(localStorage.getItem(key));
                    }
                });
            } else {
                resolve(localStorage.getItem(key));
            }
        });
    }

    /**
     * Set value in storage
     * @param {string} key 
     * @param {string} value 
     * @returns {Promise<boolean>}
     */
    set(key, value) {
        return new Promise((resolve) => {
            // Always save to localStorage for sync access if needed elsewhere/fallback
            localStorage.setItem(key, value);

            if (this.useCloud) {
                this.tg.CloudStorage.setItem(key, value, (err, stored) => {
                    resolve(!err && stored);
                });
            } else {
                resolve(true);
            }
        });
    }

    /**
     * Remove value from storage
     * @param {string} key 
     * @returns {Promise<boolean>}
     */
    remove(key) {
        return new Promise((resolve) => {
            localStorage.removeItem(key);

            if (this.useCloud) {
                this.tg.CloudStorage.removeItem(key, (err, deleted) => {
                    resolve(!err && deleted);
                });
            } else {
                resolve(true);
            }
        });
    }
}

window.StorageManager = new StorageManager();
