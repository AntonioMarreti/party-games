<?php
require_once 'config.php';

$achievements = [
    [
        'code' => 'first_win',
        'name' => 'Первая победа',
        'description' => 'Выиграй свою первую игру',
        'icon' => '🏆',
        'category' => 'game',
        'condition_type' => 'wins',
        'condition_value' => 1
    ],
    [
        'code' => 'social_butterfly',
        'name' => 'Душа компании',
        'description' => 'Добавь 3 друзей',
        'icon' => '🦋',
        'category' => 'social',
        'condition_type' => 'friends_added',
        'condition_value' => 3
    ],
    [
        'code' => 'veteran',
        'name' => 'Ветеран',
        'description' => 'Сыграй 50 игр',
        'icon' => '🎖️',
        'category' => 'milestone',
        'condition_type' => 'games_played',
        'condition_value' => 50
    ],
    [
        'code' => 'champion',
        'name' => 'Чемпион',
        'description' => 'Выиграй 10 игр',
        'icon' => '👑',
        'category' => 'game',
        'condition_type' => 'wins',
        'condition_value' => 10
    ],
    [
        'code' => 'pacifist',
        'name' => 'Миротворец',
        'description' => 'Выиграй в Блокус, никого не заблокировав',
        'icon' => '🕊️',
        'category' => 'game',
        'condition_type' => 'game_event',
        'condition_value' => 0
    ],
    [
        'code' => 'flash',
        'name' => 'Молния',
        'description' => 'Ответь быстрее чем за 0.5 сек',
        'icon' => '⚡',
        'category' => 'game',
        'condition_type' => 'game_event',
        'condition_value' => 500 // ms
    ],
    [
        'code' => 'brute',
        'name' => 'Вышибала',
        'description' => 'Выгони 3 человек в Бункере',
        'icon' => '🔪',
        'category' => 'game',
        'condition_type' => 'game_event',
        'condition_value' => 3
    ],
    // NEW ACHIEVEMENTS
    [
        'code' => 'polyglot',
        'name' => 'Полиглот',
        'description' => 'Сыграй во все типы игр',
        'icon' => '🎮',
        'category' => 'milestone',
        'condition_type' => 'polyglot',
        'condition_value' => 1
    ],
    [
        'code' => 'night_owl',
        'name' => 'Ночная сова',
        'description' => 'Сыграй игру после 2 часов ночи',
        'icon' => '🦉',
        'category' => 'game',
        'condition_type' => 'game_event',
        'condition_value' => 2
    ],
    [
        'code' => 'strategist',
        'name' => 'Стратег',
        'description' => 'Выиграй в Блокус с отрывом 20+ очков',
        'icon' => '🧠',
        'category' => 'game',
        'condition_type' => 'game_event',
        'condition_value' => 20
    ],
    [
        'code' => 'survivor',
        'name' => 'Выживший',
        'description' => 'Выиграй в Бункере 3 раза подряд',
        'icon' => '🧟',
        'category' => 'game',
        'condition_type' => 'bunker_streak',
        'condition_value' => 3
    ],
    [
        'code' => 'tictactoe_master',
        'name' => 'Мастер Крестиков',
        'description' => 'Выиграй 10 раз в Крестики-Нолики',
        'icon' => '❌',
        'category' => 'game',
        'condition_type' => 'game_event',
        'condition_value' => 10
    ],
    [
        'code' => 'tictactoe_unbeatable',
        'name' => 'Непобедимый',
        'description' => 'Заверши 5 игр в ничью в Крестики-Нолики',
        'icon' => '⭕',
        'category' => 'game',
        'condition_type' => 'game_event',
        'condition_value' => 5
    ],
    [
        'code' => 'collector',
        'name' => 'Коллекционер',
        'description' => 'Набери 1000 XP',
        'icon' => '💎',
        'category' => 'milestone',
        'condition_type' => 'xp_milestone',
        'condition_value' => 1000
    ]
];

try {
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    echo "Seeding Achievements...<br>";

    $stmt = $pdo->prepare("INSERT INTO achievements (code, name, description, icon, category, condition_type, condition_value) VALUES (?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE name=VALUES(name), description=VALUES(description), condition_value=VALUES(condition_value)");

    foreach ($achievements as $ach) {
        $stmt->execute([
            $ach['code'],
            $ach['name'],
            $ach['description'],
            $ach['icon'],
            $ach['category'],
            $ach['condition_type'],
            $ach['condition_value']
        ]);
        echo "Achievement '{$ach['code']}' seeded.<br>";
    }

    echo "Done.";

} catch (PDOException $e) {
    echo "Error: " . $e->getMessage();
}
