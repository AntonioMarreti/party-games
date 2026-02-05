<?php
require_once 'layout/version.php';
?>
<?php include 'layout/head.php'; ?>

<body class="safe-top">
    <div class="device-wrapper">
        <div class="device-content">
            <div class="container">
                <?php include 'layout/screens/splash.php'; ?>
                <?php include 'layout/screens/login.php'; ?>

                <div id="screen-lobby" class="screen">
                    <?php include 'layout/screens/home.php'; ?>
                    <?php include 'layout/screens/games.php'; ?>
                    <?php include 'layout/screens/profile.php'; ?>
                </div>

                <?php include 'layout/screens/leaderboard.php'; ?>
                <?php include 'layout/screens/room.php'; ?>
                <?php include 'layout/screens/game.php'; ?>
                <?php include 'layout/screens/profile-edit.php'; ?>
                <?php include 'layout/screens/friends.php'; ?>
                <?php include 'layout/screens/settings.php'; ?>
                <?php include 'layout/screens/game-detail.php'; ?>
            </div>

            <?php include 'layout/nav.php'; ?>
        </div>
    </div>

    <?php include 'layout/modals.php'; ?>
    <?php include 'layout/scripts.php'; ?>
</body>

</html>