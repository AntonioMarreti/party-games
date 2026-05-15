<?php

declare(strict_types=1);

const PB_ADVICE_REPO_ROOT = __DIR__ . '/../../';
const PB_ADVICE_DEFAULT_SOURCE = __DIR__ . '/../../data/import/ru_qna_333k/data.parquet';
const PB_ADVICE_DEFAULT_OUTPUT = __DIR__ . '/../../data/import/advice_ru_qna_candidates.json';

main($argv);

function main(array $argv): void
{
    $options = getopt('', [
        'source::',
        'output::',
        'limit::',
        'preview-limit::',
    ]);

    $source = (string) ($options['source'] ?? PB_ADVICE_DEFAULT_SOURCE);
    $output = (string) ($options['output'] ?? PB_ADVICE_DEFAULT_OUTPUT);
    $limit = max(1, (int) ($options['limit'] ?? 120));
    $previewLimit = max(1, (int) ($options['preview-limit'] ?? 24));

    $entries = [];
    $seen = [];
    pb_streamRuQnaRows(pb_resolveAdvicePath($source), static function (array $row) use (&$entries, &$seen, $limit): bool {
        $entry = pb_buildAdviceCandidate($row);
        if ($entry === null) {
            return true;
        }

        $key = mb_strtolower((string) $entry['text']);
        if (isset($seen[$key])) {
            return true;
        }

        $seen[$key] = true;
        $entries[] = $entry;

        return count($entries) < $limit;
    });

    usort($entries, static function (array $a, array $b): int {
        if (($a['_score'] ?? 0) === ($b['_score'] ?? 0)) {
            return strcmp((string) $a['text'], (string) $b['text']);
        }
        return (($b['_score'] ?? 0) <=> ($a['_score'] ?? 0));
    });

    $preview = array_slice(array_map(static function (array $entry): array {
        return [
            'score' => (int) ($entry['_score'] ?? 0),
            'category' => (string) ($entry['_category'] ?? ''),
            'text' => (string) $entry['text'],
        ];
    }, $entries), 0, $previewLimit);

    $packEntries = array_map(static function (array $entry): array {
        return [
            'text' => (string) $entry['text'],
            'tags' => array_values(array_filter([
                'ru_qna',
                (string) ($entry['_category'] ?? ''),
            ])),
        ];
    }, $entries);

    $payload = [
        'meta' => [
            'source' => 'ru_qna_333k',
            'kind' => 'advice_question_candidates',
            'generated_at' => gmdate('c'),
        ],
        'entries' => $packEntries,
    ];

    $outputPath = pb_resolveAdvicePath($output);
    $dir = dirname($outputPath);
    if (!is_dir($dir)) {
        mkdir($dir, 0777, true);
    }
    file_put_contents($outputPath, json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT) . PHP_EOL);

    echo json_encode([
        'source' => pb_resolveAdvicePath($source),
        'output' => $outputPath,
        'generated_entries' => count($packEntries),
        'preview' => $preview,
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT) . PHP_EOL;
}

function pb_buildAdviceCandidate(array $row): ?array
{
    $title = pb_cleanAdviceText((string) ($row['question_title'] ?? ''));
    $category = mb_strtolower(pb_cleanAdviceText((string) ($row['category'] ?? '')));
    $tags = $row['tags'] ?? [];
    $rating = (int) ($row['question_rating'] ?? 0);

    if ($title === '' || $category === '') {
        return null;
    }
    if (!in_array($category, pb_allowedAdviceCategories(), true)) {
        return null;
    }
    if (!preg_match('/\?\s*$/u', $title)) {
        return null;
    }
    $length = mb_strlen($title);
    if ($length < 24 || $length > 150) {
        return null;
    }
    if (!pb_hasAdviceQuestionLead($title)) {
        return null;
    }
    if (!pb_hasPlayableAdviceSituation($title)) {
        return null;
    }
    if (pb_isBadAdviceCandidate($title, $category, $tags)) {
        return null;
    }

    $score = pb_scoreAdviceCandidate($title, $category, $tags, $rating);
    if ($score < 4) {
        return null;
    }

    return [
        'text' => $title,
        '_category' => $category,
        '_score' => $score,
    ];
}

function pb_scoreAdviceCandidate(string $title, string $category, array $tags, int $rating): int
{
    $score = 0;
    $lower = mb_strtolower($title);

    foreach ([
        'что делать, если',
        'что делать если',
        'как выкрутиться',
        'как отказать',
        'как намекнуть',
        'как не спалиться',
        'как признаться',
        'как реагировать',
        'как скрыть',
        'как объяснить',
        'что сказать',
    ] as $needle) {
        if (mb_strpos($lower, $needle) !== false) {
            $score += 3;
            break;
        }
    }

    foreach ([
        'случайно',
        'опоздал',
        'забыл',
        'соврал',
        'обид',
        'бывш',
        'начальник',
        'коллег',
        'друг',
        'подруг',
        'парень',
        'девушк',
        'муж',
        'жен',
        'родител',
        'сосед',
        'вечерин',
    ] as $needle) {
        if (mb_strpos($lower, $needle) !== false) {
            $score += 2;
            break;
        }
    }

    if ($category === 'знакомства, любовь, отношения' || $category === 'работа и карьера' || $category === 'семья и дом') {
        $score += 2;
    }
    if ($category === 'досуг и развлечения') {
        $score += 1;
    }
    if ($rating >= 3) {
        $score += 1;
    }
    if (count($tags) > 0) {
        $score += 1;
    }

    return $score;
}

function pb_allowedAdviceCategories(): array
{
    return [
        'семья и дом',
        'знакомства, любовь, отношения',
        'работа и карьера',
        'досуг и развлечения',
        'другое',
        'общество',
    ];
}

function pb_isBadAdviceCandidate(string $title, string $category, array $tags): bool
{
    $lower = mb_strtolower($title);
    $tagsString = mb_strtolower(implode(' ', array_map(static fn($tag): string => (string) $tag, $tags)));

    $patterns = [
        '/\b(болезн|лечить|лечение|медицина|врач|беремен|месячн|эрекц|инфаркт|инсульт|кашель|грибок|зуб|кров|диабет|иммунитет|туберкул|клещ|простуд|желудок)\b/ui',
        '/\b(банк|банкомат|налог|кредит|ипотек|страхов|деньги на счет|счет\b|ооо\b|паспорт|прописк|судебн|пристав|юридическ|полици)\b/ui',
        '/\b(экзамен|егэ|учеб|домашн|задач|теорем|формул|логическ)\b/ui',
        '/\b(windows|facebook|adsense|аккаунт|интернет|компьютер|модем|nokia|планшет|смартфон)\b/ui',
        '/\b(рецепт|как приготовить|сварить|посолить|ананас|брокколи|коктейль|зелень|грибы|имбирь)\b/ui',
        '/\b(утеплить|мансард|подвал|пластиковых окон|скважин|ремонт|дистиллированную воду|ручной тормоз|ваз)\b/ui',
        '/\b(крокодил|иисуса христа|талисман|евреи|инфляци|олимпийских чемпионов|поисковиками|скрининг|золотух|солитер|описторхоз)\b/ui',
        '/\b(заработать 1 миллион долларов|как стать счастливым|как стать гордым человеком|как определить, .* кровь|как выглядели бы истории|как вы относились)\b/ui',
        '/\b(секс|оргазм|наркоман|учительниц|угроз|виртуальн|развод|разводятся|ненавидит моего ребёнка|ненавидит моего ребенка|не дает видеться|не да[её]т видеться|женится на другой|первого брака|первого\s+брака|бывшая супруга|бывший супруг|армейск\w+\s+мечт|папа\b.*ребенк|папа\b.*ребёнк|требовать деньги за секс)\b/ui',
        '/\b(умер|смерт|похорон|измен[а-яё]*|предательств|изнасил|насили|избил|ударил мужчина|алкоголик|пьянств|суицид|депресси|психушк|ненавижу)\b/ui',
        '/\b(одинок|никому не нужна|нет желания работать|ноги не идут на работу|муж меня раздражает|надоел девушке|не за кого выходить замуж|человеку его несбывшуюся|предал\b|подруга тебя предала|друг предал|повышать голос|делят детей на любимых|страшным неряхой)\b/ui',
        '/\b(домовой|плутоний|заживо закопали|гробу|к чему бы это|выглядеть умным в глазах женщины|молодой человек не любит моих кошек)\b/ui',
    ];

    foreach ($patterns as $pattern) {
        if (preg_match($pattern, $lower)) {
            return true;
        }
    }

    if ($category === 'другое' || $category === 'общество') {
        if (!preg_match('/\b(если|случайно|опоздал|обид|соврал|бывш|сосед|друг|подруг|парень|девушк|муж|жен|родител|коллег|начальник|вечерин)\b/ui', $lower . ' ' . $tagsString)) {
            return true;
        }
    }

    return false;
}

function pb_hasAdviceQuestionLead(string $text): bool
{
    return (bool) preg_match(
        '/^\s*(что делать(?:, если|\s+если)?|как объяснить|как выкрутиться|что сказать|как отказать|как отмазаться|как намекнуть|как сказать|как вести себя|как элегантно выйти|как выбраться|как скрыть|как перестать|как реагировать|как признаться|как не спалиться|почему\s+я\b|зачем\s+я\b)/ui',
        $text
    );
}

function pb_hasPlayableAdviceSituation(string $text): bool
{
    $lower = mb_strtolower($text);

    if (preg_match('/\b(случайно|внезапно|опоздал|забыл|соврал|спалил|спалилась|спалился|перепутал|разбил|пролил|позвал|объявили бойкот|запрещает|стесняюсь подойти|в приглашении на свадьбу|в знакомстве|работодателю белые пятна|волнуешься когда говоришь|обещает что-то сделать, а потом забывает)\b/ui', $lower)) {
        return true;
    }

    if (preg_match('/^(как объяснить|как отказать|как признаться|как реагировать|как намекнуть|что сказать)/ui', $text)) {
        return true;
    }

    if (preg_match('/^что делать(?:, если|\s+если)/ui', $text) && preg_match('/\b(парень|девушка|муж|жена|коллег|начальник|друг|подруг|родител|сосед|ребенок|ребёнок|работодател|свадьб|автомобил|телефон)\b/ui', $lower)) {
        return true;
    }

    return false;
}

function pb_cleanAdviceText(string $text): string
{
    $text = str_replace(["\r\n", "\r"], "\n", trim($text));
    $text = preg_replace('/[ \t]+/u', ' ', $text);
    $text = preg_replace('/\s+([,.!?:;])/u', '$1', $text);
    $text = trim((string) $text, "\"' \t\n\r\0\x0B");
    return trim((string) $text);
}

function pb_streamRuQnaRows(string $sourcePath, callable $consumer): void
{
    $python = pb_resolveAdvicePython();
    $script = <<<'PY'
import json
import sys
import pyarrow.parquet as pq

path = sys.argv[1]
columns = ['question_title', 'category', 'tags', 'question_rating']
table = pq.read_table(path, columns=columns)
rows = zip(
    table.column('question_title').to_pylist(),
    table.column('category').to_pylist(),
    table.column('tags').to_pylist(),
    table.column('question_rating').to_pylist(),
)
for title, category, tags, rating in rows:
    payload = {
        'question_title': title,
        'category': category,
        'tags': tags or [],
        'question_rating': rating or 0,
    }
    sys.stdout.write(json.dumps(payload, ensure_ascii=False) + "\n")
PY;

    $command = escapeshellarg($python)
        . ' -c '
        . escapeshellarg($script)
        . ' '
        . escapeshellarg($sourcePath);

    $descriptorSpec = [
        0 => ['pipe', 'r'],
        1 => ['pipe', 'w'],
        2 => ['pipe', 'w'],
    ];

    $process = proc_open($command, $descriptorSpec, $pipes, PB_ADVICE_REPO_ROOT);
    if (!is_resource($process)) {
        throw new RuntimeException('Failed to start ru_qna parquet reader');
    }

    fclose($pipes[0]);
    while (($line = fgets($pipes[1])) !== false) {
        $decoded = json_decode(trim($line), true);
        if (is_array($decoded)) {
            $shouldContinue = $consumer($decoded);
            if ($shouldContinue === false) {
                proc_terminate($process);
                break;
            }
        }
    }

    $stderr = stream_get_contents($pipes[2]);
    fclose($pipes[1]);
    fclose($pipes[2]);
    $exitCode = proc_close($process);

    if ($exitCode !== 0 && $exitCode !== 15) {
        throw new RuntimeException('ru_qna parquet reader failed: ' . trim((string) $stderr));
    }
}

function pb_resolveAdvicePython(): string
{
    $venvPython = PB_ADVICE_REPO_ROOT . '.venv/bin/python';
    if (file_exists($venvPython)) {
        return $venvPython;
    }
    return 'python3';
}

function pb_resolveAdvicePath(string $path): string
{
    if ($path === '') {
        return $path;
    }
    if ($path[0] === '/' || preg_match('/^[A-Za-z]:[\\\\\\/]/', $path)) {
        return $path;
    }
    return PB_ADVICE_REPO_ROOT . ltrim($path, '/');
}
