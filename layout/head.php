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

    <!-- Libs -->
    <link rel="stylesheet" href="libs/bootstrap.min.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="libs/bootstrap-icons.css?v=<?php echo $v; ?>">
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
    <link rel="stylesheet" href="css/modules/avatar.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="css/modules/donate.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="styles.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="css/dark-mode.css?v=<?php echo $v; ?>">

    <!-- Telegram WebApp -->
    <script src="https://telegram.org/js/telegram-web-app.js"></script>
    <script>
        // Immediate Theme Init to prevent "Flash of Default Color"
        (function () {
            try {
                var tg = window.Telegram.WebApp;
                if (!tg) return;

                // 1. Background Color
                var settings = JSON.parse(localStorage.getItem('pgb_settings') || '{}');
                var isDark = settings.darkMode || false;
                var bg = isDark ? '#0f172a' : '#F8F9FD';
                if (tg.setBackgroundColor) tg.setBackgroundColor(bg);

                // 2. Header Color (Accent)
                var accent = localStorage.getItem('pgb_accent_color') || '#6C5CE7';
                if (tg.setHeaderColor) tg.setHeaderColor(accent);

                // 3. Expand immediately
                if (tg.expand) tg.expand();
            } catch (e) { console.error('Early TG Init failed', e); }
        })();
    </script>
</head>