window.render_wordclash_party = async function (res) {
    if (!document.getElementById('wcp-css') && !document.querySelector('link[href^="js/games/wordclash_party/wordclash_party.css"]')) {
        const link = document.createElement('link');
        link.id = 'wcp-css';
        link.rel = 'stylesheet';
        link.href = 'js/games/wordclash_party/wordclash_party.css?v=' + (window.appVersion || Date.now());
        document.head.appendChild(link);
    }

    if (!window.renderWordClashParty) {
        const script = document.createElement('script');
        script.src = 'js/games/wordclash_party/ui.js?v=' + (window.appVersion || Date.now());
        script.onload = function () {
            window.renderWordClashParty(res);
        };
        document.body.appendChild(script);
        return;
    }

    window.renderWordClashParty(res);
};
