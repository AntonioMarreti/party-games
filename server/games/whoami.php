<?php
// server/games/whoami.php

define('WAI_PACKS_DIR', __DIR__ . '/packs/whoami/');

function getInitialState() {
    $themes = [];
    $files = glob(WAI_PACKS_DIR . '*.json');
    foreach ($files as $file) {
        $data = json_decode(file_get_contents($file), true);
        if ($data) {
            $themes[] = [
                'id' => basename($file, '.json'),
                'name' => $data['name'] ?? 'Без названия',
                'desc' => $data['description'] ?? ''
            ];
        }
    }
    return [
        'phase' => 'theme_select',
        'available_themes' => $themes,
        'current_q' => '',
        'questions_queue' => [],
        'votes' => [],
        'cumulative_scores' => [], // ID => количество побед в раундах
        'round_settings' => ['total' => 10, 'current' => 0]
    ];
}

function handleGameAction($pdo, $room, $user, $postData) {
    $state = json_decode($room['game_state'], true);
    $type = $postData['type'];

    if ($type === 'select_theme') {
        if (!$room['is_host']) return;
        
        $themeId = basename($postData['theme']);
        $limit = isset($postData['limit']) ? (int)$postData['limit'] : 10;
        $file = WAI_PACKS_DIR . $themeId . '.json';
        
        if (file_exists($file)) {
            $data = json_decode(file_get_contents($file), true);
            $questions = $data['questions'] ?? [];
            shuffle($questions);
            
            // Считаем сколько реально можем сыграть
            $totalToPlay = min(count($questions), $limit);
            
            $state['questions_queue'] = array_slice($questions, 0, $totalToPlay);
            $state['current_q'] = array_shift($state['questions_queue']);
            $state['phase'] = 'voting';
            $state['votes'] = [];
            
            // Правильно ставим лимит раундов
            $state['round_settings'] = ['total' => $totalToPlay, 'current' => 1];
            
            $stmt = $pdo->prepare("SELECT user_id FROM room_players WHERE room_id = ?");
            $stmt->execute([$room['id']]);
            foreach ($stmt->fetchAll(PDO::FETCH_COLUMN) as $pid) {
                $state['cumulative_scores'][(string)$pid] = 0;
            }
            updateGameState($room['id'], $state);
        }
    }

    elseif ($type === 'vote') {
        if ($state['phase'] !== 'voting') return;
        $state['votes'][(string)$user['id']] = $postData['target_id'];

        $stmt = $pdo->prepare("SELECT COUNT(*) FROM room_players WHERE room_id = ?");
        $stmt->execute([$room['id']]);
        if (count($state['votes']) >= $stmt->fetchColumn()) {
            $state['phase'] = 'results';
            $counts = array_count_values($state['votes']);
            if (!empty($counts)) {
                arsort($counts);
                $max = reset($counts);
                foreach ($counts as $uid => $v) {
                    if ($v === $max) {
                        $state['cumulative_scores'][(string)$uid] = ($state['cumulative_scores'][(string)$uid] ?? 0) + 1;
                    }
                }
            }
        }
        updateGameState($room['id'], $state);
    }
    
    elseif ($type === 'next_round') {
        if (!$room['is_host']) return;
        if (empty($state['questions_queue'])) {
            $state['phase'] = 'final_leaderboard';
        } else {
            $state['phase'] = 'voting';
            $state['votes'] = [];
            $state['current_q'] = array_shift($state['questions_queue']);
            $state['round_settings']['current']++;
        }
        updateGameState($room['id'], $state);
    }

    return ['status' => 'ok'];
}