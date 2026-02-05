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
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css">
    <link rel="stylesheet" href="lib/bootstrap-icons.css">

    <!-- Custom CSS -->
    <link rel="stylesheet" href="css/variables.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="css/layout.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="css/components.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="css/modules/lobby.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="css/modules/profile.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="css/modules/room.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="css/modules/modals.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="css/modules/blokus.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="css/modules/avatar.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="styles.css?v=<?php echo $v; ?>">
    <link rel="stylesheet" href="css/dark-mode.css?v=<?php echo $v; ?>">

    <!-- Telegram WebApp -->
    <script src="https://telegram.org/js/telegram-web-app.js"></script>
</head>