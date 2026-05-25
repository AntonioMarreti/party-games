<?php

require_once 'config.php';
require_once __DIR__ . '/lib/achievement_definitions.php';

try {
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    echo "Seeding Achievements...<br>";
    $count = seedAchievementDefinitions($pdo);
    echo "Seeded {$count} achievements.<br>";
    echo "Done.";
} catch (PDOException $e) {
    echo "Error: " . $e->getMessage();
}
