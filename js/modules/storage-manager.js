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
            if (this.useCloud) {
                // 3s Failsafe Timeout
                const timeout = setTimeout(() => {
                    console.warn(`[Storage] Cloud get(${key}) timeout, using localStorage`);
                    resolve(localStorage.getItem(key));
                }, 3000);

                try {
                    this.tg.CloudStorage.getItem(key, (err, value) => {
                        clearTimeout(timeout);
                        if (!err && value) {
                            resolve(value);
                        } else {
                            // Fallback to localStorage if Cloud fails or is empty (migration strategy)
                            resolve(localStorage.getItem(key));
                        }
                    });
                } catch (e) {
                    clearTimeout(timeout);
                    resolve(localStorage.getItem(key));
                }
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
                // 3s Failsafe Timeout
                const timeout = setTimeout(() => {
                    console.warn(`[Storage] Cloud set(${key}) timeout`);
                    resolve(true); // Still resolve so app doesn't hang
                }, 3000);

                try {
                    this.tg.CloudStorage.setItem(key, value, (err, stored) => {
                        clearTimeout(timeout);
                        resolve(!err && stored);
                    });
                } catch (e) {
                    clearTimeout(timeout);
                    resolve(true);
                }
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
                // 3s Failsafe Timeout
                const timeout = setTimeout(() => {
                    console.warn(`[Storage] Cloud remove(${key}) timeout`);
                    resolve(true);
                }, 3000);

                try {
                    this.tg.CloudStorage.removeItem(key, (err, deleted) => {
                        clearTimeout(timeout);
                        resolve(!err && deleted);
                    });
                } catch (e) {
                    clearTimeout(timeout);
                    resolve(true);
                }
            } else {
                resolve(true);
            }
        });
    }
}

window.StorageManager = new StorageManager();
