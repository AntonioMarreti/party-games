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

// Split overlong words by Unicode code point, never by UTF-8 byte offset.
function share_text_lines($text, $size, $font, $maxWidth)
{
    $words = preg_split('/\s+/u', trim((string) $text), -1, PREG_SPLIT_NO_EMPTY) ?: [];
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
            $line = '';
        }
        foreach (preg_split('//u', $word, -1, PREG_SPLIT_NO_EMPTY) ?: [] as $char) {
            if ($line !== '' && share_text_width($line . $char, $size, $font) > $maxWidth) {
                $lines[] = $line;
                $line = '';
            }
            $line .= $char;
        }
    }
    if ($line !== '') $lines[] = $line;
    return $lines;
}

function share_wrap_text($text, $size, $font, $maxWidth, $maxLines = 3)
{
    $lines = share_text_lines($text, $size, $font, $maxWidth);
    if (count($lines) <= $maxLines) return $lines;
    $lines = array_slice($lines, 0, $maxLines);
    $chars = preg_split('//u', $lines[$maxLines - 1], -1, PREG_SPLIT_NO_EMPTY) ?: [];
    while ($chars && share_text_width(implode('', $chars) . '…', $size, $font) > $maxWidth) {
        array_pop($chars);
    }
    $lines[$maxLines - 1] = rtrim(implode('', $chars)) . '…';
    return $lines;
}

// Small, bounded sizing pass for the handful of text roles on this Story card.
function share_fit_text($text, $font, $width, $maxSize, $minSize, $maxLines)
{
    for ($size = $maxSize; $size > $minSize; $size -= 2) {
        if (count(share_text_lines($text, $size, $font, $width)) <= $maxLines) break;
    }
    $size = max($minSize, $size);
    $lines = share_wrap_text($text, $size, $font, $width, $maxLines);
    $lineHeight = (int) ceil($size * 1.65);
    return ['lines' => $lines, 'size' => $size, 'line_height' => $lineHeight,
        'height' => count($lines) * $lineHeight];
}

function share_draw_text_block($img, $block, $x, $top, $color, $font)
{
    foreach ($block['lines'] as $i => $line) {
        share_draw_text($img, $line, $x, $top + (int) ceil($block['size'] * 1.3)
            + $i * $block['line_height'], $block['size'], $color, $font);
    }
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

function share_uppercase($text)
{
    if (function_exists('mb_strtoupper')) return mb_strtoupper($text, 'UTF-8');
    $lower = preg_split('//u', 'абвгдеёжзийклмнопрстуфхцчшщъыьэюя', -1, PREG_SPLIT_NO_EMPTY);
    $upper = preg_split('//u', 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ', -1, PREG_SPLIT_NO_EMPTY);
    return strtr(strtoupper($text), array_combine($lower, $upper));
}

function share_ellipsize($text, $size, $font, $width)
{
    $chars = preg_split('//u', $text, -1, PREG_SPLIT_NO_EMPTY) ?: [];
    while ($chars && share_text_width(implode('', $chars) . '…', $size, $font) > $width) {
        array_pop($chars);
    }
    return rtrim(implode('', $chars)) . '…';
}

function share_fit_winner($name, $font, $width = 888, $maxSize = 128, $minSize = 50)
{
    $text = share_uppercase(trim($name));
    for ($size = $maxSize; $size > $minSize; $size -= 2) {
        if (share_text_width($text, $size, $font) <= $width) break;
    }
    $size = max($minSize, $size);
    if (share_text_width($text, $size, $font) <= $width) {
        $lines = [$text];
    } else {
        $words = preg_split('/\s+/u', $text, -1, PREG_SPLIT_NO_EMPTY) ?: [];
        if (count($words) <= 1) {
            $lines = [share_ellipsize($text, $size, $font, $width)];
        } else {
            // At minimum size only word boundaries can become line breaks.
            $first = '';
            $next = 0;
            foreach ($words as $index => $word) {
                $candidate = $first === '' ? $word : $first . ' ' . $word;
                if (share_text_width($candidate, $size, $font) > $width) break;
                $first = $candidate;
                $next = $index + 1;
            }
            if ($first === '') {
                $first = share_ellipsize($words[0], $size, $font, $width);
                $next = 1;
            }
            $tail = implode(' ', array_slice($words, $next));
            $lines = [$first, share_text_width($tail, $size, $font) <= $width
                ? $tail : share_ellipsize($tail, $size, $font, $width)];
        }
    }
    $lineHeight = (int) ceil($size * 1.55);
    return ['size' => $size, 'lines' => $lines, 'line_height' => $lineHeight,
        'height' => count($lines) * $lineHeight];
}

function share_result_headline($outcome)
{
    // Only promote a short standalone clause, terminated explicitly; no invented result.
    if (preg_match('/^([А-ЯЁA-Z][\p{L} -]{3,30})[!:.]\s+(.+)$/u', $outcome, $parts)
        && count(preg_split('/\s+/u', $parts[1])) <= 4) {
        return [share_uppercase($parts[1]), $parts[2]];
    }
    return ['РЕЗУЛЬТАТ', $outcome];
}

function share_card_layout($summary, $font, $bold)
{
    $winner = $summary['winner_name'] !== '';
    [$headline, $description] = $winner
        ? [$summary['winner_name'], $summary['outcome']] : share_result_headline($summary['outcome']);
    $title = strcasecmp(trim($summary['game_title']), 'Party Games') === 0
        ? null : share_fit_text($summary['game_title'], $bold, 888, 39, 30, 2);
    $hero = share_fit_winner($headline, $bold);
    $detail = share_fit_text($description, $font, 800, 29, 25, 3);
    $participants = $summary['participants']
        ? share_fit_text(implode(' · ', $summary['participants']), $font, 888, 23, 21, 2) : null;
    $count = count($summary['awards']);
    $columnWidth = $count === 1 ? 430 : ($count === 2 ? 360 : 270);
    $awards = [];
    $awardTitleHeight = 0;
    $awardPlayerHeight = 0;
    foreach ($summary['awards'] as $award) {
        $awardTitle = share_fit_text($award['title'], $font, $columnWidth, 23, 20, 3);
        $player = share_fit_text($award['player'], $bold, $columnWidth, 27, 23, 2);
        $awardTitleHeight = max($awardTitleHeight, $awardTitle['height']);
        $awardPlayerHeight = max($awardPlayerHeight, $player['height']);
        $awards[] = ['title' => $awardTitle, 'player' => $player];
    }

    // Measure the same flowing sections used by the renderer, then center in safe space.
    $positions = ['brand' => 0];
    $currentY = 80;
    if ($title) {
        $positions['title'] = $currentY;
        $currentY += $title['height'] + 76;
    }
    $positions['kicker'] = $currentY;
    $currentY += 72;
    $positions['hero'] = $currentY;
    $currentY += $hero['height'] + 58;
    $positions['detail'] = $currentY;
    $currentY += $detail['height'];
    if ($awards) {
        $currentY += 90;
        $positions['awards_heading'] = $currentY;
        $currentY += 60;
        $positions['awards'] = $currentY;
        $currentY += 70 + $awardTitleHeight + 12 + $awardPlayerHeight;
    }
    $currentY += 68;
    if ($participants) {
        $positions['participants_heading'] = $currentY;
        $currentY += 38;
        $positions['participants'] = $currentY;
        $currentY += $participants['height'] + 46;
    }
    $positions['divider'] = $currentY;
    $positions['footer'] = $currentY + 30;
    $height = $currentY + 60;
    $start = max(170, (int) floor((1920 - $height) / 2));
    if ($start + $height > 1750) throw new Exception('Share-card content exceeds Story safe area');
    foreach ($positions as &$position) $position += $start;
    unset($position);
    $gap = $count === 3 ? 34 : 60;
    $awardsX = (int) floor((1080 - ($count * $columnWidth + max(0, $count - 1) * $gap)) / 2);
    return [
        'positions' => $positions, 'start' => $start, 'end' => $start + $height,
        'title' => $title, 'hero' => $hero, 'detail' => $detail, 'participants' => $participants,
        'kicker' => $winner ? 'ПОБЕДИТЕЛЬ' : 'ФИНАЛ ПАРТИИ',
        'awards' => $awards, 'awards_heading' => $count === 1 ? 'ТИТУЛ ВЕЧЕРА' : 'ТИТУЛЫ ВЕЧЕРА',
        'award_width' => $columnWidth, 'award_gap' => $gap, 'award_x' => $awardsX,
        'award_title_height' => $awardTitleHeight, 'award_player_height' => $awardPlayerHeight
    ];
}

function share_draw_centered_block($img, $block, $top, $color, $font, $left = 96, $width = 888)
{
    foreach ($block['lines'] as $index => $line) {
        $x = $left + (int) (($width - share_text_width($line, $block['size'], $font)) / 2);
        share_draw_text($img, $line, $x, $top + (int) ceil($block['size'] * 1.3)
            + $index * $block['line_height'], $block['size'], $color, $font);
    }
}

function share_draw_centered_label($img, $text, $top, $size, $color, $font)
{
    $block = share_fit_text($text, $font, 888, $size, $size, 1);
    share_draw_centered_block($img, $block, $top, $color, $font);
}

function share_draw_arc($img, $cx, $cy, $radius, $thickness, $color)
{
    // Filled outline avoids the artifacts of thick GD arcs with alpha blending.
    $points = [];
    foreach (range(180, 360) as $degree) {
        $angle = deg2rad($degree);
        $points[] = (int) round($cx + $radius * cos($angle));
        $points[] = (int) round($cy + $radius * sin($angle));
    }
    foreach (range(360, 180) as $degree) {
        $angle = deg2rad($degree);
        $points[] = (int) round($cx + ($radius - $thickness) * cos($angle));
        $points[] = (int) round($cy + ($radius - $thickness) * sin($angle));
    }
    imagefilledpolygon($img, $points, $color);
}

function share_generate_card_png($summary, $path)
{
    if (!extension_loaded('gd')) throw new Exception('GD extension is unavailable');
    $font = share_font_candidates();
    $bold = share_font_candidates(true) ?: $font;
    $layout = share_card_layout($summary, $font, $bold);
    $positions = $layout['positions'];
    $img = imagecreatetruecolor(1080, 1920);

    // Approved FINAL CANDIDATE: saturated violet into blue-purple, never black/navy.
    $stops = [[117, 67, 201], [98, 58, 205], [53, 60, 154]];
    for ($y = 0; $y < 1920; $y++) {
        $half = $y < 960 ? 0 : 1;
        $ratio = ($y - $half * 960) / 960;
        $rgb = [];
        for ($i = 0; $i < 3; $i++) {
            $rgb[] = (int) round($stops[$half][$i] + ($stops[$half + 1][$i] - $stops[$half][$i]) * $ratio);
        }
        imageline($img, 0, $y, 1079, $y, imagecolorallocate($img, ...$rgb));
    }
    share_draw_arc($img, 540, 690, 735, 38, share_alloc($img, '#DCC6FF', 108));
    imageellipse($img, 540, 690, 1280, 1280, share_alloc($img, '#D8C5FF', 111));
    imagefilledellipse($img, -240, 1260, 880, 1180, share_alloc($img, '#D890EC', 119));
    $white = share_alloc($img, '#FFFFFF');
    $gold = share_alloc($img, '#FFE5A6');
    $muted = share_alloc($img, '#E0D5FF');

    share_draw_centered_label($img, 'PARTY GAMES', $positions['brand'], 22, $muted, $bold);
    if ($layout['title']) share_draw_centered_block($img, $layout['title'], $positions['title'], $white, $bold);
    share_draw_centered_label($img, $layout['kicker'], $positions['kicker'], 19, $gold, $bold);
    share_draw_centered_block($img, $layout['hero'], $positions['hero'], $gold, $bold);
    share_draw_centered_block($img, $layout['detail'], $positions['detail'], $white, $font, 140, 800);
    if ($layout['awards']) {
        share_draw_centered_label($img, $layout['awards_heading'], $positions['awards_heading'], 17, $muted, $bold);
        $x = $layout['award_x'];
        $y = $positions['awards'];
        foreach ($layout['awards'] as $index => $award) {
            imagefilledrectangle($img, $x, $y, $x + 40, $y + 3, $gold);
            $marker = share_fit_text(sprintf('%02d', $index + 1), $bold, $layout['award_width'], 17, 17, 1);
            share_draw_text_block($img, $marker, $x, $y + 20, $gold, $bold);
            share_draw_text_block($img, $award['title'], $x, $y + 70, $muted, $font);
            share_draw_text_block($img, $award['player'], $x, $y + 70 + $layout['award_title_height'] + 12, $white, $bold);
            $x += $layout['award_width'] + $layout['award_gap'];
        }
    }
    if ($layout['participants']) {
        share_draw_centered_label($img, 'ИГРАЛИ · ' . count($summary['participants']), $positions['participants_heading'], 17, $muted, $bold);
        share_draw_centered_block($img, $layout['participants'], $positions['participants'], $muted, $font);
    }
    imageline($img, 160, $positions['divider'], 920, $positions['divider'], share_alloc($img, '#E0D5FF', 94));
    share_draw_centered_label($img, 'Party Games · Telegram', $positions['footer'], 18, $muted, $font);
    imagepng($img, $path, 8);
    unset($img);
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

    $hash = substr(hash('sha256', 'share-card-v3:' . json_encode($summary, JSON_UNESCAPED_UNICODE) . ':' . (int) $currentUser['id']), 0, 24);
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
