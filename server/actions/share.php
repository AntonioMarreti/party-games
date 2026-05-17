<?php

function share_text($value, $fallback = '')
{
    $text = trim((string) ($value ?? ''));
    $text = preg_replace('/\s+/u', ' ', $text);
    $text = $text ?: $fallback;
    return function_exists('mb_substr') ? mb_substr($text, 0, 120) : substr($text, 0, 120);
}

function share_public_base_url()
{
    $scheme = 'http';
    if (!empty($_SERVER['HTTP_X_FORWARDED_PROTO'])) {
        $scheme = strtolower($_SERVER['HTTP_X_FORWARDED_PROTO']) === 'https' ? 'https' : 'http';
    } elseif (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') {
        $scheme = 'https';
    }

    $host = $_SERVER['HTTP_HOST'] ?? '';
    if (!$host) {
        return '';
    }

    $scriptDir = str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/server/api.php'));
    $appDir = preg_replace('#/server$#', '', $scriptDir);
    return rtrim($scheme . '://' . $host . $appDir, '/');
}

function share_font_candidates($bold = false)
{
    $names = $bold
        ? ['DejaVuSans-Bold.ttf', 'Arial Bold.ttf', 'Arial Bold Unicode.ttf']
        : ['DejaVuSans.ttf', 'Arial.ttf', 'Arial Unicode.ttf'];

    $dirs = [
        __DIR__ . '/../../libs/fonts',
        '/usr/share/fonts/truetype/dejavu',
        '/usr/share/fonts/truetype/liberation2',
        '/usr/share/fonts/dejavu',
        '/System/Library/Fonts/Supplemental',
        '/Library/Fonts',
    ];

    foreach ($dirs as $dir) {
        foreach ($names as $name) {
            $path = $dir . '/' . $name;
            if (is_readable($path)) {
                return $path;
            }
        }
    }

    return null;
}

function share_color($hex)
{
    $hex = ltrim($hex, '#');
    return [
        hexdec(substr($hex, 0, 2)),
        hexdec(substr($hex, 2, 2)),
        hexdec(substr($hex, 4, 2))
    ];
}

function share_alloc($img, $hex, $alpha = 0)
{
    [$r, $g, $b] = share_color($hex);
    return imagecolorallocatealpha($img, $r, $g, $b, $alpha);
}

function share_draw_round_rect($img, $x1, $y1, $x2, $y2, $radius, $color)
{
    imagefilledrectangle($img, $x1 + $radius, $y1, $x2 - $radius, $y2, $color);
    imagefilledrectangle($img, $x1, $y1 + $radius, $x2, $y2 - $radius, $color);
    imagefilledellipse($img, $x1 + $radius, $y1 + $radius, $radius * 2, $radius * 2, $color);
    imagefilledellipse($img, $x2 - $radius, $y1 + $radius, $radius * 2, $radius * 2, $color);
    imagefilledellipse($img, $x1 + $radius, $y2 - $radius, $radius * 2, $radius * 2, $color);
    imagefilledellipse($img, $x2 - $radius, $y2 - $radius, $radius * 2, $radius * 2, $color);
}

function share_text_width($text, $size, $font)
{
    if ($font && function_exists('imagettfbbox')) {
        $box = imagettfbbox($size, 0, $font, $text);
        return abs($box[2] - $box[0]);
    }
    return strlen($text) * imagefontwidth(5);
}

function share_draw_text($img, $text, $x, $y, $size, $color, $font = null)
{
    if ($font && function_exists('imagettftext')) {
        imagettftext($img, $size, 0, $x, $y, $color, $font, $text);
        return;
    }
    imagestring($img, 5, $x, $y - 18, $text, $color);
}

function share_wrap_text($text, $size, $font, $maxWidth, $maxLines = 3)
{
    $words = preg_split('/\s+/u', trim((string) $text)) ?: [];
    $lines = [];
    $line = '';

    foreach ($words as $word) {
        $candidate = $line === '' ? $word : $line . ' ' . $word;
        if (share_text_width($candidate, $size, $font) <= $maxWidth) {
            $line = $candidate;
            continue;
        }

        if ($line !== '') {
            $lines[] = $line;
            $line = $word;
        } else {
            $lines[] = function_exists('mb_substr') ? mb_substr($word, 0, 22) : substr($word, 0, 22);
        }

        if (count($lines) >= $maxLines) {
            break;
        }
    }

    if ($line !== '' && count($lines) < $maxLines) {
        $lines[] = $line;
    }

    return array_slice($lines, 0, $maxLines);
}

function share_draw_wrapped_text($img, $text, $x, $y, $size, $color, $font, $maxWidth, $lineHeight, $maxLines = 3)
{
    $lines = share_wrap_text($text, $size, $font, $maxWidth, $maxLines);
    foreach ($lines as $i => $line) {
        share_draw_text($img, $line, $x, $y + ($i * $lineHeight), $size, $color, $font);
    }
    return count($lines) * $lineHeight;
}

function share_normalize_summary_payload($raw)
{
    $summary = json_decode((string) $raw, true);
    if (!is_array($summary)) {
        throw new Exception('Invalid summary');
    }

    $participants = [];
    foreach (array_slice($summary['participants'] ?? [], 0, 6) as $participant) {
        if (is_array($participant)) {
            $participants[] = share_text($participant['name'] ?? '', 'Игрок');
        } else {
            $participants[] = share_text($participant, 'Игрок');
        }
    }

    $awards = [];
    foreach (array_slice($summary['awards'] ?? [], 0, 3) as $award) {
        if (!is_array($award)) {
            continue;
        }
        $awards[] = [
            'title' => share_text($award['title'] ?? '', 'Титул вечера'),
            'player' => share_text($award['player'] ?? $award['text'] ?? '', '')
        ];
    }

    $winner = $summary['winner'] ?? null;
    $winnerName = '';
    if (is_array($winner)) {
        $winnerName = share_text($winner['name'] ?? '', '');
    } elseif ($winner) {
        $winnerName = share_text($winner, '');
    }

    return [
        'game_id' => preg_replace('/[^a-z0-9_\-]/i', '', (string) ($summary['gameId'] ?? $summary['game_id'] ?? 'game')),
        'game_title' => share_text($summary['gameTitle'] ?? $summary['game_title'] ?? '', 'Party Games'),
        'outcome' => share_text($summary['outcome'] ?? '', 'Партия завершена. Самое время на реванш.'),
        'participants' => $participants,
        'winner_name' => $winnerName,
        'awards' => $awards,
        'invite_link' => filter_var($summary['inviteLink'] ?? '', FILTER_VALIDATE_URL) ? (string) $summary['inviteLink'] : ''
    ];
}

function share_generate_card_png($summary, $path)
{
    if (!extension_loaded('gd')) {
        throw new Exception('GD extension is unavailable');
    }

    $w = 1080;
    $h = 1920;
    $img = imagecreatetruecolor($w, $h);
    imagealphablending($img, true);
    imagesavealpha($img, true);

    $font = share_font_candidates(false);
    $fontBold = share_font_candidates(true) ?: $font;

    $bgTop = share_alloc($img, '#6C5CE7');
    $bgBottom = share_alloc($img, '#3659F5');
    for ($y = 0; $y < $h; $y++) {
        $ratio = $y / $h;
        $r = (int) (108 + (54 - 108) * $ratio);
        $g = (int) (92 + (89 - 92) * $ratio);
        $b = (int) (231 + (245 - 231) * $ratio);
        imageline($img, 0, $y, $w, $y, imagecolorallocate($img, $r, $g, $b));
    }

    $white = share_alloc($img, '#FFFFFF');
    $surface = share_alloc($img, '#F4F5FB');
    $ink = share_alloc($img, '#283038');
    $muted = share_alloc($img, '#8E9299');
    $primary = share_alloc($img, '#6C5CE7');
    $green = share_alloc($img, '#18B889');

    share_draw_text($img, 'PARTY GAMES', 92, 170, 28, share_alloc($img, '#D7D2FF'), $fontBold);
    share_draw_wrapped_text($img, $summary['game_title'], 92, 300, 64, $white, $fontBold, 840, 78, 2);

    $cardX = 70;
    $cardY = 520;
    $cardW = 940;
    $cardH = 1030;
    share_draw_round_rect($img, $cardX, $cardY, $cardX + $cardW, $cardY + $cardH, 46, $white);

    share_draw_round_rect($img, $cardX + 52, $cardY + 56, $cardX + 172, $cardY + 176, 30, $primary);
    share_draw_text($img, 'PG', $cardX + 84, $cardY + 133, 30, $white, $fontBold);

    share_draw_text($img, $summary['game_title'], $cardX + 210, $cardY + 106, 42, $ink, $fontBold);
    $winnerLine = $summary['winner_name'] ? 'Победитель: ' . $summary['winner_name'] : 'Итог игры';
    share_draw_wrapped_text($img, $winnerLine, $cardX + 210, $cardY + 158, 26, $muted, $fontBold, 610, 36, 1);

    share_draw_round_rect($img, $cardX + 52, $cardY + 235, $cardX + $cardW - 52, $cardY + 430, 34, $surface);
    share_draw_text($img, 'Итог партии', $cardX + 92, $cardY + 305, 28, $muted, $fontBold);
    share_draw_wrapped_text($img, $summary['outcome'], $cardX + 92, $cardY + 365, 34, $ink, $fontBold, 760, 44, 2);

    $participants = $summary['participants'] ? implode(', ', $summary['participants']) : 'Участники комнаты';
    share_draw_text($img, 'Участники', $cardX + 72, $cardY + 520, 28, $muted, $fontBold);
    share_draw_wrapped_text($img, $participants, $cardX + 72, $cardY + 575, 32, $ink, $font, 780, 42, 2);

    $awardY = $cardY + 710;
    share_draw_text($img, 'Титулы вечера', $cardX + 72, $awardY, 28, $muted, $fontBold);
    $awardY += 42;
    $awards = $summary['awards'] ?: [
        ['title' => 'Реванш просится', 'player' => 'Соберите компанию ещё раз']
    ];

    foreach (array_slice($awards, 0, 3) as $index => $award) {
        $rowY = $awardY + ($index * 92);
        share_draw_round_rect($img, $cardX + 72, $rowY, $cardX + $cardW - 72, $rowY + 72, 22, $surface);
        imagefilledellipse($img, $cardX + 120, $rowY + 36, 46, 46, share_alloc($img, '#E8E5FF'));
        share_draw_text($img, (string) ($index + 1), $cardX + 112, $rowY + 47, 18, $primary, $fontBold);
        share_draw_text($img, $award['title'], $cardX + 162, $rowY + 32, 24, $ink, $fontBold);
        share_draw_wrapped_text($img, $award['player'], $cardX + 162, $rowY + 60, 20, $muted, $fontBold, 610, 24, 1);
    }

    share_draw_round_rect($img, 158, 1630, 922, 1742, 34, $white);
    share_draw_text($img, 'Играть ещё раз в Telegram', 250, 1700, 34, $primary, $fontBold);

    imagepng($img, $path, 8);
    imagedestroy($img);
}

function share_cleanup_old_cards($dir, $ttlSeconds = 604800)
{
    if (!is_dir($dir)) {
        return;
    }

    $now = time();
    foreach (glob($dir . '/summary-*.png') ?: [] as $file) {
        if (is_file($file) && ($now - filemtime($file)) > $ttlSeconds) {
            @unlink($file);
        }
    }
}

function action_generate_share_card($pdo, $currentUser, $data)
{
    $summary = share_normalize_summary_payload($data['summary'] ?? '');
    $baseUrl = share_public_base_url();
    if (!$baseUrl) {
        sendError('Cannot build public URL');
    }

    $dir = __DIR__ . '/../../uploads/share-cards';
    if (!is_dir($dir) && !mkdir($dir, 0775, true)) {
        sendError('Cannot create share-card directory');
    }

    $ttlSeconds = 604800;
    share_cleanup_old_cards($dir, $ttlSeconds);

    $hash = substr(hash('sha256', json_encode($summary, JSON_UNESCAPED_UNICODE) . ':' . (int) $currentUser['id']), 0, 24);
    $fileName = 'summary-' . $hash . '.png';
    $path = $dir . '/' . $fileName;

    if (!is_file($path)) {
        share_generate_card_png($summary, $path);
    }

    echo json_encode([
        'status' => 'ok',
        'media_url' => $baseUrl . '/uploads/share-cards/' . $fileName,
        'expires_in' => $ttlSeconds
    ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}
