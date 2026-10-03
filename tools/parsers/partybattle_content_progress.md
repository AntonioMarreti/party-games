# Party Battle Content Progress

Текущее состояние сверено 2026-10-03 с commit `3d050059faf5e7995f7c78f52bc9ea958fe4c061`. Источник истины — canonical packs + `pb_getPartyBattlePackRegistry()`; staging не является durable state. Этот reset не проверял live-feel в production.

## Реализованная инфраструктура

- Аудит: `tools/audit_partybattle_content.php`.
- Importer: `tools/parsers/partybattle_importer.php`, structured JSON через `field=__raw`, dry-run/preview.
- Strategy: [partybattle_content_strategy.md](partybattle_content_strategy.md).
- Manifests: `partybattle_import_manifest.current.json`, examples для bluff/advice; ссылки на локальные source files не гарантируют их наличие.
- Helpers: `export_bluff_packs_to_import_sources.php`, `build_advice_staging_from_ru_qna.php`.

## Canonical и registered coverage

| Режим | Подключённые темы | Файлы на диске вне registry |
| --- | --- | --- |
| meme | base, 18plus, office, relationships, school, it, simple_base | — |
| joke | base, 18plus | office, relationships, party |
| advice | base, 18plus, office, party, relationships | — |
| acronym | base, 18plus | — |
| caption | base | — |
| bluff | base, 18plus, body, history, weird_facts | — |
| whoami | base, 18plus | cinema, friendship, office, party, provocative |

Все указанные canonical files присутствуют. Неподключённые темы не становятся активными от наличия файла: resolver возвращает base. Детали: [packs README](../../server/games/packs/README.md).

- `advice/base` содержит 179 entries; сумма entries всех зарегистрированных advice files — 249 до runtime dedupe/backfill. Это не измерение количества уникальных доступных карточек в конкретном матче.
- `bluff/body`, `history`, `weird_facts` подключены и содержат 11/14/18 entries соответственно.
- Старые notes описывали curated advice batches и bluff staging/import. Эти временные `data/import/*` не требуются runtime и не считаются доказательством текущего локального наличия. Текущий результат проверяется по canonical packs, не по старому staging shortlist.

## Оставшаяся работа (later, P5)

### Advice / Bluff

- При расширении advice сделать небольшие curated batches: Q&A использовать как source of situations, переписывать в Party Battle tone и review до импорта.
- Расширять bluff body/history/weird_facts по качеству и live-feedback; проверить playable pool в реальной игре.

### Whoami / Joke theme files

- Review Whoami cinema/friendship/office/party/provocative и Joke office/relationships/party.
- Решить, какие подключать, какие дочистить; registry сейчас их не использует. В этом reset packs/registry не изменялись.

### Caption / Joke / Meme

- Caption расширять отдельным curated visual pool; 18plus/themed packs — кандидаты, не обязательный scope.
- Joke — curated setup writing; meme — template-driven prompts. Blind joke dataset import не является главным путём.

## Безопасный pipeline роста

1. Generation/download в локальный staging, не напрямую в canonical packs.
2. Трансформация в формат режима и ручной review.
3. Importer dry-run/preview.
4. Импорт, проверка canonical pack и решение о registry.
5. Live-feedback после отдельно разрешённой QA.

## Быстрый вход в тему

1. Этот файл и [content strategy](partybattle_content_strategy.md).
2. `server/games/partybattle.php::pb_getPartyBattlePackRegistry()` и canonical files.
3. `tools/audit_partybattle_content.php`.
4. [Sources catalog](partybattle_sources.md) и [staging rules](../../data/import/README.md); source files при необходимости восстановить отдельно.
