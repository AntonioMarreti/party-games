# Backlog

Сверено с кодом на 2026-10-03, commit `3d050059faf5e7995f7c78f52bc9ea958fe4c061`. Приоритеты и реализованные foundations: [FUTURE_WORK.md](FUTURE_WORK.md). Здесь только незавершённая работа; verification не означает отсутствующую реализацию.

## Product / retention (P1)

- [ ] Проверить Scheduled retention loop в production: create → invite → subscribe → reminder → open → join; отдельно перенос, отмена, unsubscribe и недоступная старая ссылка. Нужны подтверждение scheduler и реальной доставки, не только debug accounts.
- [ ] Добавить maintenance cleanup `expired/cancelled` scheduled records старше 90 дней и связанных reminder/subscription данных с явной политикой хранения. TODO есть в `scheduled_cleanup_expired()`, отдельный job не найден.
- [ ] Исправить disabled-copy «Откроется после набора игроков»: UI/server открывают игру по времени (за 5 минут), а недобор min_players на сервере даёт предупреждение, не запрет.

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
