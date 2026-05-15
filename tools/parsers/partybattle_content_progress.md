# Party Battle Content Progress

Этот файл фиксирует текущее состояние контентной работы по Party Battle, чтобы можно было вернуться без повторного аудита и раскопок.

## Что уже сделано

### Общая инфраструктура

- Добавлен аудит паков:
  - `tools/audit_partybattle_content.php`
- Зафиксирована контентная стратегия:
  - `tools/parsers/partybattle_content_strategy.md`
- Собран текущий manifest для старых staging-источников:
  - `tools/parsers/partybattle_import_manifest.current.json`

### Bluff

- В registry подключены ранее неиспользуемые паки:
  - `body`
  - `history`
  - `weird_facts`
- Добавлен bluff manifest:
  - `tools/parsers/partybattle_import_manifest.bluff.example.json`
- Добавлен export helper:
  - `tools/parsers/export_bluff_packs_to_import_sources.php`
- Добавлена поддержка `field=__raw` в importer для structured JSON:
  - `tools/parsers/partybattle_importer.php`
- Собраны и дочищены staging-файлы:
  - `data/import/bluff_body_facts.json`
  - `data/import/bluff_history_facts.json`
  - `data/import/bluff_weird_facts.json`
- Эти staging-файлы уже импортированы в canonical packs:
  - `server/games/packs/partybattle/bluff/body.json`
  - `server/games/packs/partybattle/bluff/history.json`
  - `server/games/packs/partybattle/bluff/weird_facts.json`

### Advice

- В registry подключены существующие thematic packs:
  - `office`
  - `party`
  - `relationships`
- Собран builder под `ru_qna_333k`:
  - `tools/parsers/build_advice_staging_from_ru_qna.php`
- Собран auto-staging слой:
  - `data/import/advice_ru_qna_candidates.json`
- Собран ручной shortlist:
  - `data/import/advice_ru_qna_shortlist.json`
- Добавлен manifest для advice import dry-run:
  - `tools/parsers/partybattle_import_manifest.advice.example.json`
- Auto-layer признан слишком сыроватым для прямого импорта.
- Вместо него собраны curated rewrite batches:
  - `data/import/advice_curated_rewrites.json`
  - `data/import/advice_curated_rewrites_batch2.json`

### Advice import status

- Первый curated batch уже импортирован в:
  - `server/games/packs/partybattle/advice/base.json`
- Второй curated batch тоже уже импортирован туда же.
- Текущее состояние после последних импортов:
  - `advice/base`: `179` entries
  - общий активный `advice` pool: `249`

## Что сознательно НЕ сделано

- Не импортирован сырой `ru_qna` слой напрямую.
- Не строился auto-import через GigaChat в production packs.
- Не трогались `caption` visual manifests для массового расширения.
- Не делался новый bulk-import для `joke` из joke datasets, потому что качество плохое для Party Battle.

## Что осталось сделать

### Advice

- Сделать еще 1-3 curated batches по `15-25` карточек.
- Если развивать pipeline дальше:
  - использовать `ru_qna` только как source of situations;
  - финальный текст всегда переписывать в Party Battle tone;
  - импортировать только после review.

### Bluff

- При желании нарастить `body/history/weird_facts` еще на один проход.
- Проверить live-feel нового bluff pool в реальной игре.

### Whoami

- Посмотреть неиспользуемые паки на диске:
  - `cinema`
  - `friendship`
  - `office`
  - `party`
  - `provocative`
- Решить, какие из них просто подключать в registry, а какие сначала preview.

### Caption

- Собрать curated visual expansion отдельно.
- Не тащить caption blind import’ом из текстовых источников.

### Joke / Meme

- Не использовать blind bulk-import как основной путь.
- Если возвращаться:
  - `joke` -> curated setup writing
  - `meme` -> template-driven prompt writing

## Идея на будущее

Возможный безопасный pipeline роста базы:

1. Периодический AI-assisted generation в staging.
2. Генерация НЕ в canonical packs, а в отдельные `data/import/*.json`.
3. Короткий ручной review.
4. Dry-run importer.
5. Только потом импорт в `server/games/packs/partybattle/*`.

Важно:
- не пускать нейросеть напрямую в production packs;
- не смешивать generation и import без review.

## Быстрый вход в тему в следующий раз

Если возвращаемся к контенту, сначала смотреть:

1. `tools/parsers/partybattle_content_progress.md`
2. `tools/parsers/partybattle_content_strategy.md`
3. `tools/audit_partybattle_content.php`
4. `data/import/advice_curated_rewrites.json`
5. `data/import/advice_curated_rewrites_batch2.json`
6. `data/import/bluff_*_facts.json`
