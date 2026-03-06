<?php
// Since CLI has no DB config working, we dump a simple PHP script we can curl
$original_pwd = getcwd();
chdir(__DIR__ . '/server');
require 'config.php';
$stmt = $pdo->query("SELECT user_id, total_points_earned, total_games_played, total_wins FROM user_statistics WHERE user_id = 3");
echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
