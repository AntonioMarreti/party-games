window.render_wordclash = async function (res) {
    // 1. Load CSS
    if (!document.getElementById('wc-css')) {
        var link = document.createElement('link');
        link.id = 'wc-css';
        link.rel = 'stylesheet';
        link.href = 'js/games/wordclash/wordclash.css?v=' + Date.now();
        document.head.appendChild(link);
    }

    // 2. Load UI Script if needed
    if (!window.renderWordClash) {
        var script = document.createElement('script');
        script.src = 'js/games/wordclash/ui.js?v=' + Date.now();
        script.onload = function () {
            window.renderWordClash(res);
        };
        document.body.appendChild(script);
    } else {
        window.renderWordClash(res);
    }
};
