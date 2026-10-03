# Future Work

Status checked against repository at commit `3d050059faf5e7995f7c78f52bc9ea958fe4c061`.
Дата сверки: 2026-10-03. HEAD = origin/main на момент preflight. Это рабочая приоритизация после documentation reset, которую можно пересматривать по результатам использования.

Проверены код и открытые GitHub issues; production, migrations, scheduler и устройства не проверялись. Конкретные задачи: [BACKLOG.md](BACKLOG.md); ручные сценарии: [smoke checklist](docs/testing/smoke-checklist.md).

## P1 — Scheduled Games completion

### Уже есть

- `server/actions/scheduled_games.php` и API router: create, list, subscribe/unsubscribe, reschedule, cancel, open; host/access/status/capacity guards.
- `room-manager.js`, `scheduled-game-invite.js`, `auth-manager.js` и `app.js`: расписание, `scheduled_<id>` deep link, подсветка карточки/сообщение о недоступной игре, invite/share через Telegram URL.
- Host открывает публичную waiting-комнату за 5 минут до старта или позже; scheduled становится `live`, участники входят через room flow. Недобор минимума возвращает warning.
- Ручное host reminder для subscribed участников с cooldown 10 минут; уведомления подписчиков при переносе, отмене и открытии комнаты.
- `server/jobs/send_scheduled_game_reminders.php`: автоматическое напоминание host/subscribers в окне ближайших 5 минут, MySQL lock и отметки успешной отправки. Поле `remind_before_minutes` в схеме не означает configurable schedule: job использует фиксированное окно.
- Expiry в scheduled actions: неоткрытые игры старше часа → `expired`, orphaned live-room → `expired`; room lifecycle также помечает связанную live-запись при удалении комнаты.
- Схема и совместимые обновления в migration `007_add_scheduled_games.php`. Наличие migration не подтверждает её применение в production.

### Осталось

- Закончить retention loop проверкой production scheduler, delivery и полного create/invite/subscribe/reminder/open/join сценария, включая перенос/отмену. Repository job не доказывает установленный или работающий cron.
- Maintenance cleanup старых `expired/cancelled` записей (>90 дней): TODO есть, отдельного job в репозитории нет. Это отличается от уже реализованного expiry по запросу.
- Согласовать disabled-copy кнопки открытия с временным guard: сейчас текст обещает ожидание набора игроков.

### Не сейчас

Повторная разработка subscriptions/reminders MVP, новые retention механики, replay/history backfill без продуктового запроса.

## P2 — Telegram-native room/scheduled integration

### Уже есть

- Room deep links, QR invite/scan и copy invite; friend invite через bot (`social.php`).
- Scheduled invite (`t.me/share/url`), автоматические/ручные reminders и state-change notifications.
- `/start` в `bot.php` передаёт entry parameter в Mini App; friend request/accept notifications существуют.
- Bot flows используют обычный `sendMessage`: `/start`, friend invite/request/accept, reminders и перенос/открытие с `inline_keyboard`; cancellation отправляет текст без кнопки. QR/copy и post-game share не являются bot sendMessage flows.

### Осталось

[Telegram Bot API](https://core.telegram.org/bots/api#richmessagebutton) описывает Rich Messages и rich-message buttons. В Party Games их реализации пока нет.

1. Modernize room invite: полезный структурированный контекст и entry CTA с совместимым fallback.
2. После проверки этого flow перейти к scheduled-game invite/reminder и правильным scheduled/live CTA.
3. Другие bot notifications оценивать отдельно, если есть UX-польза.

Поддержку клиентов и реальную доставку нужно проверять на устройствах; актуальное webhook configuration из кода не следует.

### Не сейчас

Массовая миграция всех bot messages, изменения gameplay, обязательное внедрение ephemeral messages. Ephemeral — отдельный инструмент для конкретного UX.

## P3 — Post-game sharing completion

### Уже есть

- Общий `GameSummaryProvider`: normal summary, participants/winner/outcome/awards, share text, invite/deep link, rematch hooks и общий UI.
- Registrations: `brainbattle`, `partybattle`, `wordclash`, `durak`, `tictactoe`, `tictactoe_ultimate`.
- Обычный share открывает `t.me/share/url` с текстом и invite URL через Telegram или browser; он не прикладывает PNG к chat message.
- Story вызывает `Telegram.WebApp.shareToStory` с public media URL: provider media либо API `generate_share_card`.
- `server/actions/share.php` генерирует PNG 1080×1920 через GD, хранит в `uploads/share-cards`, возвращает публичный URL; есть reuse по hash и очистка карточек с TTL 7 дней. Router и общий script подключены.
- Если Story API или media URL отсутствует, используется обычный share. `widget_link` поддержан только при явном `story.widgetLink` provider, автоматически из inviteLink не создаётся.

### Осталось

- Real-device Story/share QA (Telegram/iOS/Android), доступность публичной PNG, GD/шрифты/permissions в production, кириллица, длинные поля и отмена.
- Polish существующей share-card; единый полезный CTA/deep link после финала и закрытия комнаты.
- Проверить fallback consistency для rejected API calls/ошибок `shareToStory`, помимо уже существующего fallback при отсутствии API/URL.
- Выбрать следующую provider coverage по продуктовой пользе: Bunker, Blokus, Minesweeper BR, Spyfall, Backgammon и WordClash Party пока не зарегистрированы. Это не самостоятельные gameplay bugs.
- Для Bunker определить final/history payload перед общим summary: game-specific outro есть, но общего provider нет. Общая history infrastructure поддерживает расширенные поля по доступности схемы; старое утверждение о выполненной production migration 008 не подтверждено в этом reset.

### Не сейчас

Создание visual card generator с нуля, обязательная унификация финалов всех игр, массовый backfill старой истории или replay framework.

## P4 — Technical/security backlog

### Уже есть

Общие lifecycle helpers, guards/idempotency, logging; authoritative Durak и защита roster/stats. Существуют room lifecycle и Durak code regression tests. Это не гарантия всех конкурентных/production сценариев.

### Осталось

Открыты и подтверждены на GitHub:

- [#3 Safely move session DDL out of request path](https://github.com/AntonioMarreti/party-games/issues/3).
- [#4 Add Telegram bot webhook secret rollout](https://github.com/AntonioMarreti/party-games/issues/4).
- [#6 Review CSP frame-ancestors for Telegram Mini App](https://github.com/AntonioMarreti/party-games/issues/6).

Production schema, webhook secret/configuration и Telegram embedding требуют отдельной проверки. Эти задачи не считаются blanket blocker’ами P1–P3.

### Не сейчас

Большой рефакторинг `app.js`, WebSockets, смена architecture без конкретного regression case.

## P5 — QA tooling/content/game expansion

### Уже есть

- QA tools, bug-report copy и Scroll QA; [testing docs](docs/testing/tester-guide.md).
- Durak: 2–5 игроков, 36/52, throw-in/transfer, Easy/Medium/Hard bots, server projection, stats/final/rematch и non-host exit. Тесты: `durak_rules_test.php`, `durak_actions_test.php`, `durak_ui_smoke.js`.
- WordClash: JSON targets 850/851/803 для 5/6/7 букв, broad guesses, DB active targets/suggestions/audit и migration 015/016 для seed/blacklist. JSON fallback предусмотрен; создание targets больше не future task. Production seed/blacklist state не проверены.
- Party Battle importer/audit и canonical packs; registry покрывает meme themes, advice themes, bluff themes, остальные режимы — согласно [packs README](server/games/packs/README.md). Файл на диске не равен подключённому pack.

### Осталось

- [#7 QA Bug Reporter v2](https://github.com/AntonioMarreti/party-games/issues/7).
- Новый ручной Durak production pass после июля; historical MVP report сохраняется без переноса старого PASS на новые функции.
- Review/решение о подключении имеющихся Whoami и Joke theme files; advice curation, bluff live-feedback, caption visuals. Staging может отсутствовать локально и в git; durable truth — canonical packs + registry.
- Для joke/meme следовать generation/curation-first, не blind bulk-import. [Content strategy](tools/parsers/partybattle_content_strategy.md).

### Не сейчас

Новые игры без отдельного brief, PWA/TV mode, trust/reputation, широкое AI expansion и рост контента ради количества. Mobile safe-area/Android scroll и thermal-safe QA остаются регулярной проверкой затронутых экранов.
