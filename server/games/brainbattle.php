<?php
// server/games/brainbattle.php

function getGameLibrary()
{
    return [
        'logic' => ['math_blitz', 'greater_less'],
        'attention' => ['color_chaos', 'odd_one_out', 'count_objects', 'find_duplicate'],
        'motor' => ['reaction_test', 'timing_safe', 'defuse_numbers'],
        'memory' => ['photo_memory', 'blind_timer', 'simon_says'],
        'erudition' => ['edible_inedible', 'alchemy', 'ai_quiz']
    ];
}

function getInitialState()
{
    return [
        'phase' => 'setup',
        'current_round' => 0,
        'total_rounds' => 5,
        'remaining_games' => [], // Очередь для честной ротации
        'scores' => [],
        'round_data' => null,
        'round_results' => [],
        'selected_categories' => ['logic', 'attention', 'motor', 'memory', 'erudition'],
        'previous_game_type' => null
    ];
}

function handleGameAction($pdo, $room, $user, $postData)
{
    $state = json_decode($room['game_state'], true);
    $type = $postData['type'];
    $userId = (string) $user['id'];

    if ($type === 'setup_game') {
        if (!$room['is_host'])
            return;
        $state['total_rounds'] = (int) $postData['rounds'];
        $state['selected_categories'] = json_decode($postData['categories'], true);
        $state['scores'] = [];
        $state['current_round'] = 0;
        $state['remaining_games'] = []; // СБРАСЫВАЕМ ОЧЕРЕДЬ ПРИ НОВОЙ НАСТРОЙКЕ
        startNextRound($state);
        updateGameState($room['id'], $state);
        return ['status' => 'ok'];
    }

    if ($type === 'submit_result') {
        // Если игрок уже отвечал в этом раунде - игнорируем (защита от дабл-клика)
        if (isset($state['round_results'][$userId]))
            return ['status' => 'ok'];

        $time = (float) $postData['time_ms'];
        $isCorrect = $postData['success'] === 'true';
        $gameType = $state['previous_game_type'] ?? '';

        // Анти-чит: если ответ пришел быстрее 100мс - скорее всего это бот или баг
        // Исключаем blind_timer, так как там "время" - это модуль ошибки (0ms = идеально)
        if ($time < 100 && $gameType !== 'blind_timer') {
            $isCorrect = false;
        }

        $score = 0;
        if ($isCorrect) {
            // Формула очков: база 1000. Отнимаем за каждые 5мс задержки/погрешности.
            $score = max(100, 1000 - floor($time / 5));

            if (empty($state['round_results'])) {
                $score += 50; // Бонус первому (в играх на скорость)
            }
        }

        $state['round_results'][$userId] = [
            'time' => $time,
            'correct' => $isCorrect,
            'score' => (int) $score
        ];

        if (!isset($state['scores'][$userId]))
            $state['scores'][$userId] = 0;
        $state['scores'][$userId] += (int) $score;

        // Process Bots!
        processBots($pdo, $room['id'], $state);

        updateGameState($room['id'], $state);
        return ['status' => 'ok'];
    }

    if ($type === 'next_round') {
        if (!$room['is_host'])
            return;
        if ($state['current_round'] < $state['total_rounds']) {
            startNextRound($state);
        } else {
            $state['phase'] = 'game_over';
        }
        updateGameState($room['id'], $state);
        return ['status' => 'ok'];
    }
}

function startNextRound(&$state)
{
    $library = getGameLibrary();
    $state['current_round']++;
    $state['phase'] = 'playing';
    $state['round_results'] = [];

    // Определяем доступный пул игр на основе выбранных категорий
    $pool = [];
    $cats = $state['selected_categories'] ?? ['logic', 'attention', 'motor', 'memory', 'erudition'];
    foreach ($cats as $cat) {
        if (isset($library[$cat])) {
            $pool = array_merge($pool, $library[$cat]);
        }
    }
    if (empty($pool))
        $pool = ['math_blitz'];

    // Честная ротация: если очередь пуста, заполняем её заново и перемешиваем
    if (empty($state['remaining_games'])) {
        $state['remaining_games'] = $pool;
        shuffle($state['remaining_games']);

        // Гарантируем, что первая игра новой очереди не совпадает с последней предыдущей
        if (count($state['remaining_games']) > 1 && $state['remaining_games'][0] === $state['previous_game_type']) {
            $first = array_shift($state['remaining_games']);
            $state['remaining_games'][] = $first;
        }
    }

    $gameType = array_shift($state['remaining_games']);
    $state['previous_game_type'] = $gameType;
    $state['round_data'] = generateTaskData($gameType);
}

function generateTaskData($type)
{
    // 1. МАТЕМАТИКА
    if ($type === 'math_blitz') {
        $ops = ['+', '-', '*'];
        $op = $ops[array_rand($ops)];
        if ($op === '*') {
            $a = rand(2, 12);
            $b = rand(2, 12);
        } else {
            $a = rand(5, 100);
            $b = rand(5, 100);
            if ($op === '-' && $a < $b) {
                $tmp = $a;
                $a = $b;
                $b = $tmp;
            }
        }

        $ans = 0;
        if ($op === '+')
            $ans = $a + $b;
        elseif ($op === '-')
            $ans = $a - $b;
        elseif ($op === '*')
            $ans = $a * $b;

        $opts = [$ans, $ans + rand(1, 5), $ans - rand(1, 5), $ans + 10];
        if ($op === '*')
            $opts = [$ans, $ans + $a, $ans - $b, $ans + rand(2, 10)];

        shuffle($opts);
        return ['type' => $type, 'title' => 'Математика', 'question' => "$a $op $b", 'options' => $opts, 'correct_val' => $ans];
    }

    // 2. СРАВНЕНИЕ (С примерами)
    if ($type === 'greater_less') {
        $genExpr = function () {
            if (rand(0, 100) < 40) { // 40% шанс на число
                $val = rand(10, 200);
                return ['text' => (string) $val, 'val' => $val];
            } else { // 60% шанс на пример
                $op = rand(0, 1) ? '+' : '*';
                if ($op === '+') {
                    $a = rand(10, 100);
                    $b = rand(10, 100);
                    return ['text' => "$a + $b", 'val' => $a + $b];
                } else {
                    $a = rand(2, 13);
                    $b = rand(2, 13);
                    return ['text' => "$a × $b", 'val' => $a * $b];
                }
            }
        };

        $item1 = $genExpr();
        $item2 = $genExpr();
        while ($item1['val'] == $item2['val'])
            $item2 = $genExpr();

        return [
            'type' => $type,
            'title' => 'Что больше?',
            'question' => 'Выбери максимальное значение',
            'n1_text' => $item1['text'],
            'n1_val' => $item1['val'],
            'n2_text' => $item2['text'],
            'n2_val' => $item2['val'],
            'correct_val' => ($item1['val'] > $item2['val'] ? $item1['val'] : $item2['val'])
        ];
    }

    if ($type === 'simon_says') {
        $colors = ['red', 'blue', 'green', 'yellow'];
        $sequence = [];
        // Генерируем цепочку из 3 цветов (было 5)
        for ($i = 0; $i < 3; $i++) {
            $sequence[] = $colors[array_rand($colors)];
        }

        return [
            'type' => 'simon_says',
            'title' => 'Память',
            'question' => 'Повтори последовательность!',
            'sequence' => $sequence, // Передаем массив цветов
            'correct_val' => implode(',', $sequence) // Правильная строка для проверки
        ];
    }

    // 3. ЦВЕТА
    if ($type === 'color_chaos') {
        $c = [
            'red' => 'Красный',
            'blue' => 'Синий',
            'green' => 'Зеленый',
            'yellow' => 'Желтый',
            'orange' => 'Оранжевый',
            'purple' => 'Фиолетовый',
            'pink' => 'Розовый',
            'black' => 'Черный'
        ];
        $k = array_keys($c);
        $tk = $k[array_rand($k)];
        $ck = $k[array_rand($k)];

        // Pick 4 random options including the correct one
        $all_vals = array_values($c);
        $correct_val = $c[$ck];
        $opts = [$correct_val];
        $others = array_diff($all_vals, [$correct_val]);
        shuffle($others);
        $opts = array_merge($opts, array_slice($others, 0, 3));
        shuffle($opts);

        return ['type' => $type, 'title' => 'Цвета', 'question' => 'Жми на ЦВЕТ текста!', 'text' => $c[$tk], 'color' => $ck, 'options' => $opts, 'correct_val' => $correct_val];
    }

    // 4. ЛИШНИЙ
    if ($type === 'odd_one_out') {
        // Pairs of [Majority, Minority] using Bootstrap Icons
        $pairs = [
            ['bi-circle', 'bi-circle-fill'],
            ['bi-square', 'bi-square-fill'],
            ['bi-triangle', 'bi-triangle-fill'],
            ['bi-heart', 'bi-heart-fill'],
            ['bi-star', 'bi-star-fill'],
            ['bi-chat', 'bi-chat-fill'],
            ['bi-envelope', 'bi-envelope-open'],
            ['bi-lock-fill', 'bi-unlock-fill'],
            ['bi-volume-up-fill', 'bi-volume-mute-fill'],
            ['bi-mic-fill', 'bi-mic-mute-fill'],
            ['bi-person-fill', 'bi-person'],
            ['bi-hand-thumbs-up-fill', 'bi-hand-thumbs-down-fill'],
            ['bi-arrow-up-circle-fill', 'bi-arrow-down-circle-fill'],
            ['bi-pause-circle-fill', 'bi-play-circle-fill'],
            ['bi-wifi', 'bi-wifi-off'],
            ['bi-battery-full', 'bi-battery-half'],
            ['bi-brightness-high-fill', 'bi-moon-fill'],
            ['bi-check-circle-fill', 'bi-x-circle-fill'],
            ['bi-bell-fill', 'bi-bell-slash-fill'],
            ['bi-bookmark-fill', 'bi-bookmark']
        ];
        $p = $pairs[array_rand($pairs)];

        // Majority is usually p[0], Minority is p[1] or vice versa? 
        // Logic: array_fill with p[0], one p[1].
        // Ensuring random role assignment
        if (rand(0, 1)) {
            $maj = $p[0];
            $min = $p[1];
        } else {
            $maj = $p[1];
            $min = $p[0];
        }

        // Увеличиваем до 16 элементов (сетка 4x4)
        $opts = array_fill(0, 15, $maj);
        $opts[] = $min;
        shuffle($opts);
        return ['type' => $type, 'title' => 'Найди лишний', 'question' => 'Найди отличающуюся иконку', 'options' => $opts, 'correct_val' => $min];
    }

    // 5. РЕАКЦИЯ
    if ($type === 'reaction_test') {
        return ['type' => $type, 'title' => 'Реакция', 'question' => 'Жди зеленый!', 'delay_ms' => rand(2000, 5000)];
    }

    // === НОВЫЕ ИГРЫ ===

    // 6. ФОТОПАМЯТЬ (Memory)
    if ($type === 'photo_memory') {
        $emojis = [
            '🍎',
            '🚗',
            '🐶',
            '🍕',
            '⚽',
            '🚀',
            '💎',
            '⏰',
            '🦁',
            '🐼',
            '🐘',
            '🦜',
            '🐢',
            '🍩',
            '🍣',
            '🥨',
            '🏰',
            '🎡',
            '🌋',
            '🏖️',
            '🛸',
            '🤖',
            '🎈',
            '🎁',
            '🎨',
            '🎭',
            '🎮',
            '🔋',
            '⚡',
            '🌈',
            '🔥',
            '🧊',
            '🍄',
            '🥕',
            '🥑',
            '🍍',
            '🥞',
            '🍔',
            '🍟',
            '🍿',
            '🥤',
            '🍺',
            '🥂',
            '🛹',
            '🚲',
            '🚜',
            '⛵',
            '🛰️',
            '🔭',
            '🔬',
            '🧬',
            '💼',
            '📁',
            '🔑',
            '💰',
            '💳',
            '💎',
            '🔮'
        ];
        shuffle($emojis);
        $shown = array_slice($emojis, 0, 4); // Показываем 4
        $hidden = $shown[array_rand($shown)]; // Один из них правильный

        // Варианты ответа: правильный + 3 левых
        $opts = [$hidden];
        $others = array_diff($emojis, $shown);
        shuffle($others);
        $opts = array_merge($opts, array_slice($others, 0, 3));
        shuffle($opts);

        return [
            'type' => 'photo_memory',
            'title' => 'Фотопамять',
            'question' => 'Запомни предметы!',
            'phase2_q' => 'Что было на картинке?',
            'shown_items' => $shown,
            'options' => $opts,
            'correct_val' => $hidden
        ];
    }

    // 1. Кости (Dice Sum)
    if ($type === 'dice_sum') {
        $dice_map = [1 => '⚀', 2 => '⚁', 3 => '⚂', 4 => '⚃', 5 => '⚄', 6 => '⚅'];
        $count = rand(3, 5);
        $sum = 0;
        $icons = [];
        for ($i = 0; $i < $count; $i++) {
            $v = rand(1, 6);
            $sum += $v;
            $icons[] = $dice_map[$v];
        }
        $opts = [$sum, $sum + rand(1, 3), $sum - rand(1, 2), $sum + 5];
        shuffle($opts);
        return ['type' => $type, 'title' => 'Счет', 'question' => 'Сумма точек?', 'icons' => $icons, 'options' => $opts, 'correct_val' => $sum];
    }

    // 2. Алхимия (Mixing)
    if ($type === 'alchemy') {
        $recipes = [
            ['items' => ['🔥', '💧'], 'res' => '💨', 'name' => 'Пар'],
            ['items' => ['🌍', '🔥'], 'res' => '🌋', 'name' => 'Лава'],
            ['items' => ['❄️', '💧'], 'res' => '🧊', 'name' => 'Лед'],
            ['items' => ['☁️', '💧'], 'res' => '🌧️', 'name' => 'Дождь'],
            ['items' => ['☀️', '🌧️'], 'res' => '🌈', 'name' => 'Радуга'],
            ['items' => ['🌱', '💧'], 'res' => '🌻', 'name' => 'Цветок'],
            ['items' => ['🥚', '🔥'], 'res' => '🍳', 'name' => 'Яичница'],
            ['items' => ['🐛', '⏳'], 'res' => '🦋', 'name' => 'Бабочка'],
            ['items' => ['🐟', '🍚'], 'res' => '🍣', 'name' => 'Суши'],
            ['items' => ['🍇', '⏳'], 'res' => '🍷', 'name' => 'Вино'],
            ['items' => ['📄', '✂️'], 'res' => '🎊', 'name' => 'Конфетти'],
            ['items' => ['🐮', '🥛'], 'res' => '🧀', 'name' => 'Сыр'],
            ['items' => ['🔋', '💡'], 'res' => '🔦', 'name' => 'Свет'],
            ['items' => ['🌧️', '❄️'], 'res' => '🌨️', 'name' => 'Снег'],
            ['items' => ['🌽', '🔥'], 'res' => '🍿', 'name' => 'Попкорн'],
            ['items' => ['🍞', '🧀'], 'res' => '🥪', 'name' => 'Сэндвич'],
            ['items' => ['🧱', '🧱'], 'res' => '🏠', 'name' => 'Дом'],
            ['items' => ['🖌️', '🎨'], 'res' => '🖼️', 'name' => 'Картина'],
            ['items' => ['🔨', '🪵'], 'res' => '🪑', 'name' => 'Стул'],
            ['items' => ['🚿', '🧼'], 'res' => '🫧', 'name' => 'Пузыри'],
            ['items' => ['🍓', '🥛'], 'res' => '🥤', 'name' => 'Коктейль'],
            ['items' => ['👓', '☀️'], 'res' => '😎', 'name' => 'Очки'],
            ['items' => ['🌲', '🪓'], 'res' => '🪵', 'name' => 'Дрова'],
            ['items' => ['✉️', '📫'], 'res' => '📬', 'name' => 'Почта'],
        ];
        $r = $recipes[array_rand($recipes)];
        $all_res = array_column($recipes, 'res');
        $wrong = ['💀', '👽', '🤖', '🎃', '💩', '🤡', '👻', '🌵', '🍄', '🕸️'];
        $wrong = array_merge($wrong, array_diff($all_res, [$r['res']]));
        shuffle($wrong);
        $opts = [$r['res'], $wrong[0], $wrong[1], $wrong[2]];
        shuffle($opts);
        return ['type' => $type, 'title' => 'Алхимия', 'question' => "{$r['items'][0]} + {$r['items'][1]} = ?", 'options' => $opts, 'correct_val' => $r['res']];
    }

    // === ВНИМАНИЕ ===

    // 3. Найди дубли (Find Pairs) - выберем 1 лишний
    if ($type === 'find_duplicate') {
        $set = [
            '🍎',
            '🍌',
            '🍒',
            '🥑',
            '🍔',
            '🍕',
            '🌮',
            '🍦',
            '🍟',
            '🍕',
            '🦁',
            '🐼',
            '🐨',
            '🐮',
            '🐸',
            '🦊',
            '🐼',
            '🦁',
            '🐯',
            '🦒',
            '🚗',
            '🚕',
            '🚲',
            '🛸',
            '🚁',
            '🚜',
            '🏎️',
            '🚓',
            '🚑',
            '🛰️'
        ];
        shuffle($set);
        $target = $set[0];
        $grid = [$target, $target]; // Две одинаковых
        // Увеличиваем до 16 элементов (2 целевых + 14 других)
        for ($i = 1; $i < 15; $i++)
            $grid[] = $set[$i];
        shuffle($grid);
        return ['type' => $type, 'title' => 'Внимание', 'question' => 'Найди ПАРУ (2 одинаковых)', 'grid' => $grid, 'correct_val' => $target];
    }

    // === МОТОРИКА ===

    // 4. Разминирование (1-9)
    if ($type === 'defuse_numbers') {
        $nums = range(1, 9);
        shuffle($nums);
        return ['type' => $type, 'title' => 'Разминирование', 'question' => 'Нажми цифры от 1 до 9!', 'grid' => $nums];
    }

    // 5. Тайминг-сейф (Green Zone)
    if ($type === 'timing_safe') {
        // Уменьшаем скорость (было rand(2, 4)), чтобы играть было комфортнее
        $speed = rand(12, 20) / 10;
        return ['type' => $type, 'title' => 'Сейф', 'question' => 'Жми в ЗЕЛЕНОЙ зоне!', 'speed' => $speed];
    }

    // 7. СЛЕПОЙ СЕКУНДОМЕР
    if ($type === 'blind_timer') {
        $targets = [3000, 4000, 5000, 6000, 7000, 8000];
        $targetMs = $targets[array_rand($targets)];
        $targetSec = $targetMs / 1000;

        return [
            'type' => 'blind_timer',
            'title' => 'Чувство времени',
            'question' => "Останови на $targetSec.00 сек",
            'target' => $targetMs
        ];
    }

    // 8. СЪЕДОБНОЕ - НЕСЪЕДОБНОЕ (Эрудиция)
    if ($type === 'edible_inedible') {
        $items = [
            ['name' => 'Кирпич', 'type' => 'no'],
            ['name' => 'Яблоко', 'type' => 'yes'],
            ['name' => 'Гвоздь', 'type' => 'no'],
            ['name' => 'Бургер', 'type' => 'yes'],
            ['name' => 'Мыло', 'type' => 'no'],
            ['name' => 'Суп', 'type' => 'yes'],
            ['name' => 'Кактус', 'type' => 'no'],
            ['name' => 'Пицца', 'type' => 'yes'],
            ['name' => 'Камень', 'type' => 'no'],
            ['name' => 'Банан', 'type' => 'yes'],
            ['name' => 'Носок', 'type' => 'no'],
            ['name' => 'Стейк', 'type' => 'yes'],
            ['name' => 'Стекло', 'type' => 'no'],
            ['name' => 'Морковь', 'type' => 'yes'],
            ['name' => 'Батарейка', 'type' => 'no'],
            ['name' => 'Клубника', 'type' => 'yes'],
            ['name' => 'Шина', 'type' => 'no'],
            ['name' => 'Сыр', 'type' => 'yes'],
            ['name' => 'Монета', 'type' => 'no'],
            ['name' => 'Пончик', 'type' => 'yes'],
            ['name' => 'Лампочка', 'type' => 'no'],
            ['name' => 'Арбуз', 'type' => 'yes'],
            ['name' => 'Песок', 'type' => 'no'],
            ['name' => 'Брокколи', 'type' => 'yes'],
            ['name' => 'Бумага', 'type' => 'no'],
            ['name' => 'Курица', 'type' => 'yes'],
            ['name' => 'Краб', 'type' => 'yes'],
            ['name' => 'Мел', 'type' => 'no'],
            ['name' => 'Шоколад', 'type' => 'yes'],
            ['name' => 'Ключ', 'type' => 'no'],
            ['name' => 'Пульт', 'type' => 'no'],
            ['name' => 'Малина', 'type' => 'yes'],
            ['name' => 'Флэшка', 'type' => 'no'],
            ['name' => 'Авокадо', 'type' => 'yes'],
            ['name' => 'Кроссовки', 'type' => 'no'],
            ['name' => 'Манго', 'type' => 'yes'],
            ['name' => 'Ложка', 'type' => 'no'],
            ['name' => 'Огурец', 'type' => 'yes'],
            ['name' => 'Вилка', 'type' => 'no'],
            ['name' => 'Помидор', 'type' => 'yes'],
            ['name' => 'Шкаф', 'type' => 'no'],
            ['name' => 'Черника', 'type' => 'yes'],
            ['name' => 'Подушка', 'type' => 'no'],
            ['name' => 'Пельмени', 'type' => 'yes'],
            ['name' => 'Очки', 'type' => 'no'],
            ['name' => 'Шаурма', 'type' => 'yes'],
            ['name' => 'Чайник', 'type' => 'no'],
            ['name' => 'Блины', 'type' => 'yes'],
            ['name' => 'Зонт', 'type' => 'no'],
            ['name' => 'Мед', 'type' => 'yes'],
            ['name' => 'Утюг', 'type' => 'no'],
            ['name' => 'Творог', 'type' => 'yes'],
            ['name' => 'Книга', 'type' => 'no'],
            ['name' => 'Редис', 'type' => 'yes'],
            ['name' => 'Часы', 'type' => 'no'],
            ['name' => 'Зефир', 'type' => 'yes'],
            ['name' => 'Ножницы', 'type' => 'no'],
            ['name' => 'Абрикос', 'type' => 'yes'],
            ['name' => 'Пуговица', 'type' => 'no'],
            ['name' => 'Грибы', 'type' => 'yes'],
            ['name' => 'Карандаш', 'type' => 'no'],
            ['name' => 'Ананас', 'type' => 'yes'],
            ['name' => 'Ластик', 'type' => 'no'],
            ['name' => 'Сырники', 'type' => 'yes'],
            ['name' => 'Телефон', 'type' => 'no'],
            ['name' => 'Котлета', 'type' => 'yes'],
            ['name' => 'Кольцо', 'type' => 'no'],
            ['name' => 'Груша', 'type' => 'yes'],
            ['name' => 'Кофемолка', 'type' => 'no'],
            ['name' => 'Баклажан', 'type' => 'yes'],
            ['name' => 'Ботинок', 'type' => 'no'],
            ['name' => 'Облепиха', 'type' => 'yes'],
            ['name' => 'Скрепка', 'type' => 'no'],
            ['name' => 'Креветка', 'type' => 'yes'],
            ['name' => 'Кисточка', 'type' => 'no'],
            ['name' => 'Апельсин', 'type' => 'yes'],
            ['name' => 'Линейка', 'type' => 'no'],
            ['name' => 'Макароны', 'type' => 'yes'],
            ['name' => 'Молоток', 'type' => 'no'],
            ['name' => 'Йогурт', 'type' => 'yes'],
            ['name' => 'Краска', 'type' => 'no'],
            ['name' => 'Киви', 'type' => 'yes']
        ];
        $item = $items[array_rand($items)];
        return [
            'type' => 'edible_inedible',
            'title' => 'Съедобное?',
            'item_name' => $item['name'],
            'correct_val' => ($item['type'] === 'yes' ? 'Съедобное' : 'Несъедобное')
        ];
    }

    // 9. СЧЕТ ОБЪЕКТОВ (Attention)
    if ($type === 'count_objects') {
        $emojis = ['🍎', '🐶', '🚗', '⚽', '💎', '⭐', '🚀', '🍔'];
        $target = $emojis[array_rand($emojis)];
        $count = rand(3, 7);
        $grid = array_fill(0, $count, $target);

        // Fill rest with other emojis
        $others = array_diff($emojis, [$target]);
        shuffle($others);
        for ($i = 0; $i < 5; $i++)
            $grid[] = $others[0];
        for ($i = 0; $i < 4; $i++)
            $grid[] = $others[1];
        shuffle($grid);

        $opts = [$count, $count + 1, $count - 1, rand(8, 12)];
        sort($opts);
        $opts = array_unique($opts);
        shuffle($opts);

        return [
            'type' => $type,
            'title' => 'Внимание',
            'question' => "Сколько тут $target ?",
            'grid' => $grid,
            'options' => $opts,
            'correct_val' => $count
        ];
    }

    // 10. AI QUIZ
    if ($type === 'ai_quiz') {
        // require_once __DIR__ . '/../lib/GigaChat.php'; // Deprecated
        require_once __DIR__ . '/../lib/AI/AIService.php';

        $topics = ['История', 'Наука', 'Космос', 'Кино', 'Животные', 'Интернет', 'Игры'];
        $topic = $topics[array_rand($topics)];

        $backups = [
            ['question' => 'Столица Франции?', 'options' => ['Париж', 'Лондон', 'Берлин', 'Рим'], 'correct_val' => 'Париж'],
            ['question' => 'Сколько планет в Солнечной системе?', 'options' => ['8', '9', '7', '10'], 'correct_val' => '8'],
            ['question' => 'Самое глубокое озеро?', 'options' => ['Байкал', 'Виктория', 'Танганьика', 'Гурон'], 'correct_val' => 'Байкал'],
            ['question' => 'Химическая формула воды?', 'options' => ['H2O', 'CO2', 'O2', 'NaCl'], 'correct_val' => 'H2O'],
            ['question' => 'Кто написал "Войну и мир"?', 'options' => ['Толстой', 'Достоевский', 'Пушкин', 'Лермонтов'], 'correct_val' => 'Толстой']
        ];
        $bk = $backups[array_rand($backups)];

        try {
            $system = "Ты генератор викторины/квиза. Тема: $topic. Ответь JSON.";
            $prompt = "Придумай вопрос с 4 вариантами. Один правильный.
            JSON: {\"question\": \"...\", \"options\": [\"...\", \"...\", \"...\", \"...\"], \"correct_index\": 0}";

            // $response = GigaChat::getInstance()->chat([['role' => 'system', 'content' => $system], ['role' => 'user', 'content' => $prompt]], 0.8);
            $response = AIService::getProvider('text')->text([['role' => 'system', 'content' => $system], ['role' => 'user', 'content' => $prompt]], ['temperature' => 0.8]);

            if (isset($response['content'])) {
                $content = $response['content'];
                if (preg_match('/```json(.*?)```/s', $content, $matches)) {
                    $content = trim($matches[1]);
                } elseif (preg_match('/\{.*\}/s', $content, $matches)) {
                    $content = $matches[0];
                }

                $json = json_decode($content, true);

                if ($json && isset($json['question']) && isset($json['options'])) {
                    return [
                        'type' => 'ai_quiz',
                        'title' => 'AI: ' . $topic,
                        'question' => $json['question'],
                        'options' => $json['options'],
                        'correct_val' => $json['options'][$json['correct_index']],
                        'is_ai' => true
                    ];
                }
            }
        } catch (Exception $e) {
            if (class_exists('TelegramLogger'))
                TelegramLogger::logError('ai_fail', ['m' => $e->getMessage()]);
        }
        return ['type' => 'ai_quiz', 'title' => 'AI: ' . $topic . ' (Backup)', 'question' => $bk['question'], 'options' => $bk['options'], 'correct_val' => $bk['correct_val']];
    }

    return ['type' => 'math_blitz', 'title' => 'Ошибка', 'question' => '2+2', 'options' => [4], 'correct_val' => 4];
}

function processBots($pdo, $roomId, &$state)
{
    require_once __DIR__ . '/../lib/AI/Bot/BotManager.php';

    // 1. Get Bots in Room
    $stmt = $pdo->prepare("SELECT u.* FROM room_players rp JOIN users u ON rp.user_id = u.id WHERE rp.room_id = ? AND u.is_bot = 1");
    $stmt->execute([$roomId]);
    $bots = $stmt->fetchAll(PDO::FETCH_ASSOC);

    if (empty($bots))
        return;

    $roundData = $state['round_data'];
    $correctVal = $roundData['correct_val'];
    $options = $roundData['options'] ?? [];

    // Determine correct index
    $correctIndex = -1;
    foreach ($options as $i => $opt) {
        if ($opt == $correctVal) { // Loose comparison for numbers/strings
            $correctIndex = $i;
            break;
        }
    }

    // Determine game type to handle specific cases (like blind_timer)
    $gameType = $state['previous_game_type'] ?? '';

    foreach ($bots as $bot) {
        $botId = $bot['id'];

        // Skip if already answered
        if (isset($state['round_results'][$botId]))
            continue;

        // 30% chance to "think longer" and not answer on this specific tick (simulate delays)
        // BUT for MVP simplicity, let's make them all answer once triggered, but with varied times.
        // Actually, let's just make them answer.

        $brain = BotManager::getBot($botId, $bot['custom_name'] ?? $bot['first_name']);

        // Logic for specific games
        $isCorrect = false;
        $timeMs = rand(2000, 8000); // Random speed 2s - 8s

        if ($gameType === 'blind_timer') {
            // Special case logic for blind timer
            // Difficulty 1 => huge error, 10 => small error
            $diff = $brain->getPersona()->difficulty;
            $target = $roundData['target'];
            $errorMargin = rand(0, 1000) * (11 - $diff); // 1=>10000ms err max, 10=>1000ms err max
            if (rand(0, 1))
                $errorMargin *= -1;

            $timeMs = abs($target + $errorMargin); // "Time" here is the stop time
            $isCorrect = true; // Always "correct" submission, score depends on accuracy
        } elseif ($correctIndex !== -1) {
            // Standard Quiz/Option games
            $chosenIndex = $brain->answerQuiz($correctIndex, count($options));
            $isCorrect = ($chosenIndex === $correctIndex);
        } else {
            // Games without options (e.g. reaction test, or open input?)
            // For reaction_test:
            if ($gameType === 'reaction_test') {
                // Faster reaction for harder bots
                $diff = $brain->getPersona()->difficulty;
                $timeMs = rand(200, 600) - ($diff * 20);
                if ($timeMs < 150)
                    $timeMs = 150; // Human limit cap
                $isCorrect = true;
            } else {
                // Fallback: Assume correct call for simplicity or 50/50
                $isCorrect = (rand(1, 10) <= $brain->getPersona()->difficulty);
            }
        }

        // Calculate Score
        $score = 0;
        if ($isCorrect) {
            if ($gameType === 'blind_timer') {
                // Score calc for blind timer is handled in frontend usually? 
                // Wait, submit_result handles score calc: max(100, 1000 - floor($time / 5))
                // But for blind timer, "time" passed to submit_result is the ACTUAL TIME STOPPED?
                // Let's check submit_result logic: "Formula: base 1000. Subtract time/5".
                // That formula implies "Time taken to answer".
                // For Blind Timer, score logic might be different? 
                // Checked submit_result: "if($time < 100 && $gameType !== 'blind_timer')".
                // It applies standard formula? If so, blind timer "time" should be "delta"?
                // Let's look at submit_result again. It takes `time_ms`.
                // If I pass "delta" as time_ms, then smaller is better. Yes.
                // So for blind timer, let's simulate delta.
                if ($gameType === 'blind_timer') {
                    $timeMs = abs($state['round_data']['target'] - $timeMs); // Delta
                }
            }

            $score = max(100, 1000 - floor($timeMs / 5));
        }

        // Record Result
        $state['round_results'][$botId] = [
            'time' => $timeMs,
            'correct' => $isCorrect,
            'score' => (int) $score
        ];

        if (!isset($state['scores'][$botId]))
            $state['scores'][$botId] = 0;
        $state['scores'][$botId] += (int) $score;
    }

    // --- Chat Logic ---
    // Try to chat
    $chatData = BotManager::maybeChat($pdo, $roomId, []); // Empty history for now, or fetch recent events

    if ($chatData) {
        $text = $chatData['message'];
        $botId = $chatData['bot_id'];

        // Add to Room Events so clients see it via polling
        // We use 'chat' type which we just added support for in frontend
        $payload = json_encode(['text' => $text]);

        $pdo->prepare("INSERT INTO room_events (room_id, user_id, type, payload) VALUES (?, ?, 'chat', ?)")
            ->execute([$roomId, $botId, $payload]);
    }
}