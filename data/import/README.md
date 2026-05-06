# Offline Import Staging

Сюда складываются локально скачанные внешние датасеты перед импортом в canonical Party Battle packs.

Примеры:

- `data/import/full_jokes.txt`
- `data/import/russian_jokes.csv`
- `data/import/mem_and_russian_jokes.json`

Правила:

- файлы в этой папке считаются временным staging-слоем;
- они не должны требоваться runtime-части проекта;
- итоговые данные после фильтрации и импорта должны попадать в `server/games/packs/partybattle/*`;
- большие исходные выгрузки по умолчанию не коммитятся.

Базовый workflow:

1. Скачать внешний датасет в `data/import/`.
2. Прогнать `tools/parsers/partybattle_importer.php` в `--dry-run`.
3. Проверить результат.
4. Выполнить реальный импорт в canonical pack.
5. Закоммитить уже pack-файлы, а не сырую выгрузку.
