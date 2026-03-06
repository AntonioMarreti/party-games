<?php
$_SERVER['DOCUMENT_ROOT'] = __DIR__ . '/..';
require __DIR__ . '/../server/config.php';
$stmt = $pdo->prepare("SELECT user_id, total_points_earned, total_games_played, rating FROM user_statistics WHERE user_id = 3");
$stmt->execute();
print_r($stmt->fetchAll(PDO::FETCH_ASSOC));
