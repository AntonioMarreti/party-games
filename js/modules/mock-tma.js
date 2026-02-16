/**
 * Mock Telegram WebApp for Local Development
 * Mimics the Telegram.WebApp object to prevent errors when running in a regular browser.
 */
(function () {
    if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData) {
        return; // Already running in TMA
    }

    console.log("Creating Mock Telegram WebApp...");

    window.Telegram = window.Telegram || {};

    // Create a mock user
    const mockUser = {
        id: 123456789,
        first_name: "Dev",
        last_name: "User",
        username: "dev_user",
        language_code: "en",
        photo_url: "https://via.placeholder.com/150"
    };

    // To test TMA Auto-Login, uncomment this line:
    // const enableMockUser = true;
    const enableMockUser = false; // Default: Disabled to allow Dev Login buttons

    const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

    window.Telegram.WebApp = {
        initData: enableMockUser ? "query_id=AAF...&user=" + encodeURIComponent(JSON.stringify(mockUser)) + "&auth_date=" + Math.floor(Date.now() / 1000) + "&hash=mock_hash" : "",
        initDataUnsafe: {
            query_id: "AAF...",
            user: enableMockUser ? mockUser : {},
            auth_date: Math.floor(Date.now() / 1000),
            hash: "mock_hash"
        },
        version: "6.0",
        platform: "unknown",
        colorScheme: "dark",
        themeParams: {
            bg_color: "#212121",
            text_color: "#ffffff",
            hint_color: "#aaaaaa",
            link_color: "#64b5f6",
            button_color: "#4caf50",
            button_text_color: "#ffffff",
            secondary_bg_color: "#303030"
        },
        isExpanded: true,
        viewportHeight: window.innerHeight,
        viewportStableHeight: window.innerHeight,

        // Methods
        ready: function () { console.log("[MockTMA] ready()"); },
        expand: function () { console.log("[MockTMA] expand()"); this.isExpanded = true; },
        close: function () { console.log("[MockTMA] close()"); },
        enableClosingConfirmation: function () { console.log("[MockTMA] enableClosingConfirmation()"); },
        disableClosingConfirmation: function () { console.log("[MockTMA] disableClosingConfirmation()"); },
        onEvent: function (eventType, callback) { console.log("[MockTMA] onEvent:", eventType); },
        offEvent: function (eventType, callback) { console.log("[MockTMA] offEvent:", eventType); },
        sendData: function (data) { console.log("[MockTMA] sendData:", data); },
        openLink: function (url) { window.open(url, '_blank'); },
        openTelegramLink: function (url) { window.open(url, '_blank'); },
        // openInvoice is added conditionally below
        setBackgroundColor: function (color) { console.log("[MockTMA] setBackgroundColor:", color); },
        setHeaderColor: function (color) { console.log("[MockTMA] setHeaderColor:", color); },

        // Haptic Feedback
        HapticFeedback: {
            impactOccurred: function (style) { console.log("[MockTMA] Haptic.impact:", style); },
            notificationOccurred: function (type) { console.log("[MockTMA] Haptic.notification:", type); },
            selectionChanged: function () { console.log("[MockTMA] Haptic.selection"); }
        },

        // CloudStorage
        CloudStorage: {
            setItem: function (key, value, callback) {
                console.log("[MockTMA] CloudStorage.setItem:", key, value);
                localStorage.setItem('cloud_' + key, value);
                if (callback) callback(null, true);
            },
            getItem: function (key, callback) {
                console.log("[MockTMA] CloudStorage.getItem:", key);
                const val = localStorage.getItem('cloud_' + key);
                if (callback) callback(null, val);
            },
            getItems: function (keys, callback) {
                console.log("[MockTMA] CloudStorage.getItems:", keys);
                const result = {};
                keys.forEach(k => result[k] = localStorage.getItem('cloud_' + k));
                if (callback) callback(null, result);
            },
            removeItem: function (key, callback) {
                console.log("[MockTMA] CloudStorage.removeItem:", key);
                localStorage.removeItem('cloud_' + key);
                if (callback) callback(null, true);
            },
            removeItems: function (keys, callback) {
                console.log("[MockTMA] CloudStorage.removeItems:", keys);
                keys.forEach(k => localStorage.removeItem('cloud_' + k));
                if (callback) callback(null, true);
            },
            getKeys: function (callback) {
                // Not fully implemented for localStorage mock simply
                if (callback) callback(null, []);
            }
        },

        // Swipe Behavior (New)
        swipeBehavior: {
            disableVertical: function () { console.log("[MockTMA] swipeBehavior.disableVertical()"); }
        },

        isVersionAtLeast: function (ver) { return true; }
    };

    if (isDev) {
        window.Telegram.WebApp.openInvoice = function (url, callback) {
            console.log("[MockTMA] openInvoice (Dev):", url);
            window.open(url, '_blank');
            // Simulate payment flow
            setTimeout(() => {
                const isPaid = confirm("[MockTMA] Simulate successful payment?\n\nClick OK for 'paid', Cancel for 'cancelled'.");
                if (callback) callback(isPaid ? 'paid' : 'cancelled');
            }, 1000);
        };
    }

    // Trigger event for apps waiting for it
    window.dispatchEvent(new Event('TelegramWebAppReady'));

})();
