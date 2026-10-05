<?php
// Real GD renderer, deterministic fixtures, no API/network/config or production uploads.
require_once __DIR__ . '/../server/actions/share.php';

function cardCheck($condition, $message)
{
    if (!$condition) throw new RuntimeException($message);
}

function cardSummary($overrides = [])
{
    return share_normalize_summary_payload(json_encode(array_replace([
        'gameId' => 'brainbattle',
        'gameTitle' => 'Мозговая Битва',
        'winner' => ['name' => 'Александра'],
        'outcome' => '12 правильных ответов. Победа с отрывом в 3 очка.',
        'participants' => ['Александра', 'Михаил', 'Екатерина', 'Даниил'],
        'awards' => [
            ['title' => 'Самый быстрый ответ', 'player' => 'Михаил'],
            ['title' => 'Невероятная серия', 'player' => 'Александра'],
            ['title' => 'Душа компании', 'player' => 'Екатерина']
        ],
        'inviteLink' => 'https://t.me/mpartygamebot/app?startapp=TEST'
    ], $overrides), JSON_UNESCAPED_UNICODE));
}

$paths = [];
$keepPreviews = in_array('--previews', $argv, true);
try {
    $normal = cardSummary();
    cardCheck($normal === [
        'game_id' => 'brainbattle',
        'game_title' => 'Мозговая Битва',
        'outcome' => '12 правильных ответов. Победа с отрывом в 3 очка.',
        'participants' => ['Александра', 'Михаил', 'Екатерина', 'Даниил'],
        'winner_name' => 'Александра',
        'awards' => [
            ['title' => 'Самый быстрый ответ', 'player' => 'Михаил'],
            ['title' => 'Невероятная серия', 'player' => 'Александра'],
            ['title' => 'Душа компании', 'player' => 'Екатерина']
        ],
        'invite_link' => 'https://t.me/mpartygamebot/app?startapp=TEST'
    ], 'Existing normalized payload contract');
    $bounded = cardSummary([
        'participants' => array_fill(0, 8, ['name' => '  Имя   игрока  ']),
        'awards' => array_fill(0, 5, ['text' => 'Игрок']),
        'winner' => 'Победитель', 'inviteLink' => 'invalid'
    ]);
    cardCheck(count($bounded['participants']) === 6 && $bounded['participants'][0] === 'Имя игрока', 'Existing participant cap/normalization');
    cardCheck(count($bounded['awards']) === 3 && $bounded['awards'][0] === ['title' => 'Титул вечера', 'player' => 'Игрок'], 'Existing award defaults/cap');
    cardCheck($bounded['winner_name'] === 'Победитель' && $bounded['invite_link'] === '', 'Existing winner/URL normalization');
    $defaults = share_normalize_summary_payload('{}');
    cardCheck($defaults['game_title'] === 'Party Games' && $defaults['outcome'] === 'Партия завершена. Самое время на реванш.', 'Existing default result');
    $aliases = share_normalize_summary_payload('{"game_id":"test!","game_title":"Тест"}');
    cardCheck($aliases['game_id'] === 'test' && $aliases['game_title'] === 'Тест', 'Existing snake-case aliases');
    try {
        share_normalize_summary_payload('invalid');
        throw new RuntimeException('Invalid payload must be rejected');
    } catch (Exception $error) {
        cardCheck($error->getMessage() === 'Invalid summary', 'Existing invalid payload error');
    }
    $source = file_get_contents(__DIR__ . '/../server/actions/share.php');
    cardCheck(str_contains($source, "'share-card-v3:' . json_encode(\$summary"), 'Renderer salt participates in cache hash');

    if (!extension_loaded('gd') || !function_exists('imagettftext')) {
        throw new RuntimeException('PNG generation blocked: GD/FreeType unavailable (normalization checks passed)');
    }
    $font = share_font_candidates();
    $bold = share_font_candidates(true) ?: $font;
    cardCheck($font !== null, 'PNG generation requires an available Cyrillic TrueType font');
    foreach (['Крестики-нолики Ultimate', str_repeat('Длинное имя ', 20), str_repeat('Ж', 120)] as $text) {
        $block = share_fit_text($text, $bold, 740, 64, 24, 2);
        cardCheck(count($block['lines']) <= 2 && $block['size'] >= 24 && $block['size'] <= 64, 'Bounded font/line sizing');
        foreach ($block['lines'] as $line) {
            cardCheck(preg_match('//u', $line) === 1, 'UTF-8 safe wrapping/ellipsis');
            cardCheck(share_text_width($line, $block['size'], $bold) <= 740, 'Every visible line fits its container');
        }
    }
    $truncated = share_wrap_text(str_repeat('Щ', 120), 40, $font, 300, 2);
    cardCheck(str_ends_with(end($truncated), '…'), 'Omitted content has a visible ellipsis');
    $full = share_text_lines(str_repeat('Щ', 40), 40, $font, 300);
    cardCheck(implode('', $full) === str_repeat('Щ', 40), 'Long single word wraps without dropping characters');

    foreach (['Александра', 'Antonio Marreti', 'Александра Константинопольская', 'VeryLongNicknameWithoutSpaces12345'] as $name) {
        $block = share_fit_winner($name, $bold);
        cardCheck($block['size'] >= 50 && $block['size'] <= 128 && count($block['lines']) <= 2, 'Winner remains a bounded hero');
        foreach ($block['lines'] as $line) {
            cardCheck(preg_match('//u', $line) === 1, 'Winner ellipsis preserves UTF-8');
            cardCheck(share_text_width($line, $block['size'], $bold) <= 888, 'Winner lines fit actual TTF width');
            cardCheck(!str_contains($line, '-') && !str_contains($line, '–'), 'No artificial winner hyphen');
        }
        $uppercase = share_uppercase($name);
        $tooWideAtMinimum = share_text_width($uppercase, 50, $bold) > 888;
        if ($name === 'VeryLongNicknameWithoutSpaces12345') {
            cardCheck(count($block['lines']) === 1, 'Single token never splits into lines');
            cardCheck(!$tooWideAtMinimum || str_ends_with($block['lines'][0], '…'), 'Overlong single token is ellipsized');
        } else {
            cardCheck(implode(' ', $block['lines']) === $uppercase, 'Complete winner words preserved');
        }
        if (!$tooWideAtMinimum) {
            cardCheck(count($block['lines']) === 1, 'Prefer one line whenever it fits above minimum');
            if ($block['size'] < 128) {
                cardCheck(share_text_width($uppercase, $block['size'] + 2, $bold) > 888, 'One-line fitting picks the largest measured size');
            }
        } else {
            cardCheck($block['size'] === 50, 'Wrapping/ellipsis follows shrink to minimum');
        }
    }
    cardCheck(share_result_headline('Ничья! Обе команды удержали позиции.') === ['НИЧЬЯ', 'Обе команды удержали позиции.'], 'Short result separated from detail');
    cardCheck(share_result_headline('Все победили! Команда справилась.') === ['ВСЕ ПОБЕДИЛИ', 'Команда справилась.'], 'No-winner heading is derived, not always НИЧЬЯ');
    $neutralOutcome = 'После долгой партии обе команды удержали свои позиции';
    cardCheck(share_result_headline($neutralOutcome) === ['РЕЗУЛЬТАТ', $neutralOutcome], 'Uncertain headline leaves outcome intact');

    $fixtures = [
        'normal' => $normal,
        'long-name' => cardSummary(['winner' => ['name' => 'Александра Константинопольская']]),
        'long-token' => cardSummary(['winner' => ['name' => 'VeryLongNicknameWithoutSpaces12345']]),
        'no-winner' => cardSummary(['winner' => null, 'gameTitle' => 'Крестики-нолики Ultimate — вечерний турнир',
            'outcome' => 'Ничья! После долгой партии обе команды удержали свои позиции. Сегодня победила дружба — каждый нашёл свой лучший ход.',
            'participants' => ['Александра Константинопольская', 'Михаил Александрович', 'Екатерина Воскресенская', 'Даниил Владиславович', 'Анастасия Стародубцева', 'Константин Михайлович'],
            'awards' => []]),
        'awards-0' => cardSummary(['awards' => []]),
        'awards-1' => cardSummary(['awards' => array_slice($normal['awards'], 0, 1)]),
        'awards-2' => cardSummary(['awards' => array_slice($normal['awards'], 0, 2)]),
        'antonio' => cardSummary(['winner' => ['name' => 'Antonio Marreti']]),
        'long-title' => cardSummary(['gameTitle' => str_repeat('Длинное название игры ', 6)]),
        'long-outcome' => cardSummary(['outcome' => str_repeat('Длинный итог партии ', 6)]),
        'long-participants' => cardSummary(['participants' => array_fill(0, 6, str_repeat('Длинное имя ', 10))]),
        // Preserve the existing combined stress fixture, including unbroken Cyrillic text.
        'dense' => cardSummary(['gameTitle' => str_repeat('Ж', 120), 'winner' => ['name' => str_repeat('Щ', 120)],
            'outcome' => str_repeat('Длинный итог партии ', 6),
            'participants' => array_fill(0, 6, str_repeat('Длинное имя ', 10)),
            'awards' => array_fill(0, 3, ['title' => str_repeat('Большое достижение ', 6), 'player' => str_repeat('Щ', 120)])]),
        'defaults' => $defaults,
        'fallback-case' => cardSummary(['gameTitle' => '  pArTy GaMeS  ']),
        'participants-0' => cardSummary(['participants' => []]),
        'participants-1' => cardSummary(['participants' => ['Александра']]),
        'party-battle' => cardSummary(['gameTitle' => 'Party Battle'])
    ];
    $noAwardsLayout = share_card_layout($fixtures['awards-0'], $font, $bold);
    $threeAwardsLayout = share_card_layout($normal, $font, $bold);
    cardCheck($noAwardsLayout['end'] - $noAwardsLayout['start'] < $threeAwardsLayout['end'] - $threeAwardsLayout['start'], 'No empty award section reserved');
    cardCheck(!isset($noAwardsLayout['positions']['awards']), 'Zero awards section is fully omitted');
    cardCheck(share_card_layout($fixtures['awards-1'], $font, $bold)['awards_heading'] === 'ТИТУЛ ВЕЧЕРА', 'Singular award heading');
    cardCheck($threeAwardsLayout['awards_heading'] === 'ТИТУЛЫ ВЕЧЕРА', 'Plural award heading');
    $defaultLayout = share_card_layout($defaults, $font, $bold);
    cardCheck($defaults['game_title'] === 'Party Games', 'API fallback value is unchanged');
    cardCheck($defaultLayout['title'] === null && !isset($defaultLayout['positions']['title']) && isset($defaultLayout['positions']['brand']), 'Fallback title omitted while branding stays');
    cardCheck(share_card_layout($fixtures['fallback-case'], $font, $bold)['title'] === null, 'Fallback title match is trimmed and case-insensitive');
    $emptyPlayers = share_card_layout($fixtures['participants-0'], $font, $bold);
    $onePlayer = share_card_layout($fixtures['participants-1'], $font, $bold);
    cardCheck($emptyPlayers['participants'] === null && !isset($emptyPlayers['positions']['participants_heading'], $emptyPlayers['positions']['participants']), 'No zero-player label or empty block');
    cardCheck($onePlayer['participants']['lines'] === ['Александра'] && isset($onePlayer['positions']['participants_heading']), 'One participant keeps the section');
    cardCheck($emptyPlayers['end'] - $emptyPlayers['start'] < $onePlayer['end'] - $onePlayer['start'] && $emptyPlayers['positions']['footer'] < $onePlayer['positions']['footer'], 'Empty participants naturally pull footer upward');
    cardCheck($threeAwardsLayout['title']['lines'] === ['Мозговая Битва'] && $threeAwardsLayout['kicker'] === 'ПОБЕДИТЕЛЬ'
        && count($threeAwardsLayout['awards']) === 3 && $threeAwardsLayout['participants']['lines']
        && isset($threeAwardsLayout['positions']['brand'], $threeAwardsLayout['positions']['title'], $threeAwardsLayout['positions']['participants_heading'], $threeAwardsLayout['positions']['footer']), 'Normal card structure preserved');
    cardCheck(share_card_layout($fixtures['party-battle'], $font, $bold)['title']['lines'] === ['Party Battle'], 'Real game titles remain visible');
    foreach ($fixtures as $name => $fixture) {
        // Semantic layout checks replace the old flat-background pixel assertions:
        // the approved rings may enter overlay areas, but content must stay inside them.
        $layout = share_card_layout($fixture, $font, $bold);
        $positions = $layout['positions'];
        cardCheck($layout['start'] >= 170 && $layout['end'] <= 1750, 'Content respects Story safe area');
        $previousEnd = $layout['start'];
        foreach (['title' => 888, 'hero' => 888, 'detail' => 800, 'participants' => 888] as $role => $width) {
            if ($layout[$role] === null) {
                cardCheck(!isset($positions[$role]), 'Hidden section reserves no position');
                continue;
            }
            cardCheck($positions[$role] >= $previousEnd, 'Text blocks never overlap');
            $previousEnd = $positions[$role] + $layout[$role]['height'];
            cardCheck($previousEnd <= $layout['end'], 'Text block fits measured content bounds');
            foreach ($layout[$role]['lines'] as $line) {
                $roleFont = in_array($role, ['title', 'hero'], true) ? $bold : $font;
                cardCheck(preg_match('//u', $line) === 1, 'Layout text is valid UTF-8');
                cardCheck(share_text_width($line, $layout[$role]['size'], $roleFont) <= $width, 'Layout line fits measured width');
            }
        }
        cardCheck($layout['hero']['lines'] && isset($positions['brand']), 'Meaningful branding/result present');
        if (strcasecmp(trim($fixture['game_title']), 'Party Games') !== 0) cardCheck($layout['title']['lines'], 'Real game heading present');
        if ($name === 'no-winner') cardCheck($layout['hero']['lines'] === ['НИЧЬЯ'], 'No-winner renders short hero instead of paragraph');
        foreach ($layout['awards'] as $index => $award) {
            $x = $layout['award_x'] + $index * ($layout['award_width'] + $layout['award_gap']);
            cardCheck($x >= 96 && $x + $layout['award_width'] <= 984, 'Award columns stay inside side safe area');
            foreach (['title' => $font, 'player' => $bold] as $role => $roleFont) {
                foreach ($award[$role]['lines'] as $line) {
                    cardCheck(preg_match('//u', $line) === 1 && share_text_width($line, $award[$role]['size'], $roleFont) <= $layout['award_width'], 'Award text fits its column');
                }
            }
        }
        if ($layout['awards']) {
            $awardsEnd = $positions['awards'] + 70 + $layout['award_title_height'] + 12 + $layout['award_player_height'];
            cardCheck($awardsEnd <= ($positions['participants_heading'] ?? $positions['divider']), 'Awards do not overlap participants/footer');
        }
        $path = $keepPreviews ? '/tmp/party-games-share-production-' . $name . '.png'
            : tempnam(sys_get_temp_dir(), 'share-card-test-');
        $paths[] = $path;
        share_generate_card_png($fixture, $path);
        cardCheck(file_get_contents($path, false, null, 0, 8) === "\x89PNG\r\n\x1a\n", 'PNG signature');
        $info = getimagesize($path);
        cardCheck($info[0] === 1080 && $info[1] === 1920 && $info[2] === IMAGETYPE_PNG, 'Exactly 1080×1920 PNG');
        $img = imagecreatefrompng($path);
        cardCheck($img !== false, 'PNG decodes with GD');
        unset($img);
        if ($keepPreviews) echo 'Production preview: ' . $path . PHP_EOL;
    }
    echo "PASS share-card generator: normalization, measured winner fitting, no-winner result, awards 0–3, renderer v3, 17 GD fixtures, fallback title/zero participants, PNG dimensions/decode, layout bounds\n";
} finally {
    if (!$keepPreviews) foreach ($paths as $path) @unlink($path);
}
