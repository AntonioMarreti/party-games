<?php
/** @var string $v Asset version */
?>
<!DOCTYPE html>
<html lang="ru">

<head>
    <meta charset="UTF-8">
    <meta name="viewport"
        content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
    <title>Party Games</title>
    <link rel="icon" type="image/png" href="favicon.png?v=<?php echo $v; ?>">

    <!-- Libs -->
    <link rel="stylesheet" href="libs/bootstrap.part1.min.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="libs/bootstrap.part2.min.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css">
    <link rel="stylesheet" href="libs/animate.min.css?v=<?php echo $v; ?>">

    <!-- Custom CSS -->
    <link rel="stylesheet" href="css/variables.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="css/base.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="css/layout.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="css/components.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="css/modules/lobby.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="css/modules/profile.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="css/modules/room.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="css/modules/modals.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="css/modules/blokus.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="css/games/backgammon.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="css/modules/avatar.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="css/modules/donate.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="styles.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="css/dark-mode.css?v=<?php echo $v; ?>">

    <!-- Telegram WebApp -->
    <script src="js/libs/telegram-web-app.js?v=<?php echo $v; ?>"></script>
    <script>
        // Immediate Theme Init to prevent "Flash of Default Color"
        (function () {
            try {
                // 1. Read Preferences
                var themePref = { preference: 'system', palette: 'amber-sapphire' };
                try {
                    var storedTheme = localStorage.getItem('pgb_theme_preferences');
                    if (storedTheme) {
                        var parsed = JSON.parse(storedTheme);
                        if (parsed.preference && parsed.palette) themePref = parsed;
                    } else {
                        // Migrate
                        var legacySettings = JSON.parse(localStorage.getItem('pgb_settings') || '{}');
                        if (typeof legacySettings.darkMode !== 'undefined') {
                            themePref.preference = legacySettings.darkMode ? 'dark' : 'light';
                        }
                    }
                } catch(e) {}

                // 2. Resolve Theme
                var resolvedTheme = themePref.preference;
                var tg = window.Telegram && window.Telegram.WebApp;

                if (resolvedTheme === 'system') {
                    if (tg && tg.colorScheme) {
                        resolvedTheme = tg.colorScheme;
                    } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
                        resolvedTheme = 'dark';
                    } else {
                        resolvedTheme = 'light';
                    }
                }

                // 3. Apply DOM Attributes to DocumentElement (HTML) immediately
                document.documentElement.setAttribute('data-theme-preference', themePref.preference);
                document.documentElement.setAttribute('data-theme', resolvedTheme);
                document.documentElement.setAttribute('data-palette', themePref.palette);
                if (resolvedTheme === 'dark') {
                    document.documentElement.classList.add('dark-mode');
                }

                // 4. Telegram early shell setup
                if (tg) {
                    if (tg.expand) tg.expand();
                }
            } catch (e) { console.error('Early TG Init failed', e); }
        })();
    </script>
</head>
