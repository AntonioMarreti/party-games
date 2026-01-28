<?php
require_once 'config.php';

$achievements = [
    [
        'code' => 'first_win',
        'name' => 'First Victory',
        'description' => 'Win your first game',
        'icon' => '🏆',
        'category' => 'game',
        'condition_type' => 'wins',
        'condition_value' => 1
    ],
    [
        'code' => 'social_butterfly',
        'name' => 'Social Butterfly',
        'description' => 'Add 3 friends',
        'icon' => '🦋',
        'category' => 'social',
        'condition_type' => 'friends_added',
        'condition_value' => 3
    ],
    [
        'code' => 'veteran',
        'name' => 'Veteran',
        'description' => 'Play 50 games',
        'icon' => '🎖️',
        'category' => 'milestone',
        'condition_type' => 'games_played',
        'condition_value' => 50
    ],
    [
        'code' => 'champion',
        'name' => 'Champion',
        'description' => 'Win 10 games',
        'icon' => '👑',
        'category' => 'game',
        'condition_type' => 'wins',
        'condition_value' => 10
    ]
];

try {
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    
    echo "Seeding Achievements...<br>";
    
    $stmt = $pdo->prepare("INSERT INTO achievements (code, name, description, icon, category, condition_type, condition_value) VALUES (?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE name=VALUES(name), description=VALUES(description), condition_value=VALUES(condition_value)");
    
    foreach ($achievements as $ach) {
        $stmt->execute([
            $ach['code'], $ach['name'], $ach['description'], $ach['icon'], $ach['category'], $ach['condition_type'], $ach['condition_value']
        ]);
        echo "Achievement '{$ach['code']}' seeded.<br>";
    }
    
    echo "Done.";
    
} catch (PDOException $e) {
    echo "Error: " . $e->getMessage();
}
