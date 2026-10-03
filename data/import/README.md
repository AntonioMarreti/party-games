# Offline Import Staging

Сюда складываются локально скачанные внешние датасеты перед импортом в canonical Party Battle packs.

Примеры имён временных файлов (не утверждение об их наличии в git или локально):

- `data/import/full_jokes.txt`
- `data/import/russian_jokes.csv`
- `data/import/mem_and_russian_jokes.json`
- `data/import/bluff_weird_facts.json`
- `data/import/bluff_history_facts.json`

Правила:

- файлы в этой папке считаются временным staging-слоем;
- они не должны требоваться runtime-части проекта;
- итоговые данные после фильтрации и импорта должны попадать в `server/games/packs/partybattle/*`;
- большие исходные выгрузки по умолчанию не коммитятся.

Базовый workflow:

1. Скачать внешний датасет в `data/import/`.
2. Прогнать `tools/parsers/partybattle_importer.php` в `--dry-run`.
3. Вручную проверить и при необходимости переписать кандидатов в игровой формат.
4. Выполнить реальный импорт в canonical pack.
5. Закоммитить уже pack-файлы, а не сырую выгрузку.

Подсказка для `bluff`:

- можно сгенерировать локальные import-ready source-файлы из текущих canonical pack’ов:
  - `php tools/parsers/export_bluff_packs_to_import_sources.php`
- после этого вручную дополнять и чистить `data/import/bluff_*_facts.json`
- затем прогонять:
  - `php tools/parsers/partybattle_importer.php --manifest=tools/parsers/partybattle_import_manifest.bluff.example.json --dry-run`

Durable source of truth: `server/games/packs/partybattle/*` вместе с `pb_getPartyBattlePackRegistry()` в `server/games/partybattle.php`. Manifest/staging не доказывает импорт или активный coverage.

Для `joke/meme` основной путь — generation/curation-first, для `caption` — visual curation; importer полезнее для `bluff/advice` и части `whoami`. См. [content strategy](../../tools/parsers/partybattle_content_strategy.md) и [registered coverage](../../server/games/packs/README.md).
