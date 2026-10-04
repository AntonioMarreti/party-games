# Backlog

Статус обновлён 2026-10-04 на baseline `6f18f79a86a7f9deefb665717e7ec40afbe8c22e`. P1 — Scheduled Games COMPLETE: P1-A deployed, production cron и реальная automatic Telegram delivery подтверждены владельцем. Текущий активный приоритет — P2. Приоритеты и реализованные foundations: [FUTURE_WORK.md](FUTURE_WORK.md). P2–P5 сохраняют предыдущую сверку от 2026-10-03; нового аудита не проводилось.

## Telegram integration (P2)

- [ ] Modernize **room invite** с Rich Messages/rich-message buttons: сохранить entry deep link и fallback; проверить поддерживаемые клиенты и фактический UX.
- [ ] Следующим отдельным шагом адаптировать **scheduled invite/reminder**, сохранив различие scheduled-card и live-room CTA.
- [ ] Оценивать другие bot notifications только после этих двух flows. Rich Messages пока отсутствуют в реализации; ephemeral messages выбирать только под конкретный UX.

## Sharing (P3)

- [ ] Провести real-device QA обычного share и Story на Telegram Android/iOS: public PNG, кириллица, отмена, API availability и fallback при недоступном media.
- [ ] Довести visual/product polish существующей share-card: длинные имена/outcome, титулы, читаемость и CTA.
- [ ] Согласовать invite/deep-link и CTA после финала, в том числе когда исходная комната уже закрыта; определить политику Story widget_link (сейчас только опциональное поле provider).
- [ ] Проверить единообразие fallback при ошибке генерации/API: сейчас fallback покрывает отсутствие Story API/media URL, но вызовы могут отклониться/бросить исключение.
- [ ] Выбрать подходящие следующие игры для shared provider (Bunker, Blokus, Minesweeper BR, Spyfall, Backgammon, WordClash Party пока без регистрации). Отсутствие provider само по себе не баг; для Bunker сначала определить итог/history payload.

## Technical / security (P4)

Открытые issues подтверждены через GitHub на 2026-10-03. Они не объявляются blocker’ами продуктовых задач без отдельного доказательства.

- [ ] [#3 Safely move session DDL out of request path](https://github.com/AntonioMarreti/party-games/issues/3).
- [ ] [#4 Add Telegram bot webhook secret rollout](https://github.com/AntonioMarreti/party-games/issues/4): rollout и проверка webhook configuration отдельно от наличия кода.
- [ ] [#6 Review CSP frame-ancestors for Telegram Mini App](https://github.com/AntonioMarreti/party-games/issues/6).

## QA / content later (P5)

- [ ] [#7 QA Bug Reporter v2](https://github.com/AntonioMarreti/party-games/issues/7).
- [ ] Новая ручная production QA Durak: 2–5 игроков, 36/52, throw-in/transfer, все сложности ботов, final/stats/rematch и non-host exit. Июльский MVP report этого не подтверждает.
- [ ] Party Battle: review и решение о подключении существующих Whoami `cinema/friendship/office/party/provocative` и Joke `office/relationships/party` (файлы есть, registry их не использует).
- [ ] Party Battle: curated advice batches, live-feedback для bluff и curated caption visual expansion; joke/meme развивать generation/curation-first. Детали в [content strategy](tools/parsers/partybattle_content_strategy.md).

WordClash target dictionaries и DB-backed active targets/suggestions/audit уже реализованы; старая задача создания targets снята. Это не подтверждение состояния production DB.

## Deferred maintenance / data policy

- [ ] Добавить maintenance cleanup `expired/cancelled` scheduled records старше 90 дней и связанных reminder/subscription данных после отдельного product/data retention decision. Cleanup не реализован и сознательно отложен; не блокирует Scheduled Games completion (P1).
