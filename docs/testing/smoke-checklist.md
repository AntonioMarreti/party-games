# Smoke Checklist

Сценарии для будущего QA, не результаты текущего прогона. Сверка с кодом: 2026-10-03, `3d050059faf5e7995f7c78f52bc9ea958fe4c061`. В documentation reset tests/Browser Tester/production QA не запускались.

## Code regression

Существующие проверки для отдельного разрешённого code-check этапа:

```bash
php tests/room_lifecycle_smoke.php
php tests/durak_rules_test.php
php tests/durak_actions_test.php
node tests/durak_ui_smoke.js
```

Room smoke использует test doubles; Durak rules/actions/UI checks не доказывают DB/network/device behavior. UI smoke проверяет обработчики/markup, не реальный touch/layout в WebView.

## Room lifecycle

- Create/join/start/finish или stop → waiting → повторный старт.
- Host leave → transfer активному человеку; last human leave → cleanup комнаты/public listing; repeated leave и join same room безопасны.
- Join another waiting room оставляет одно membership; playing/full/password/not found errors не ломают modal flow.
- Double click create/join/start/leave и поздний polling после выхода не восстанавливают старый экран.
- Public listing соответствует waiting/capacity/human-host guards; bot-only/stale room не становится входом для игрока.

## Android Scroll

- BrainBattle final/results скроллится с текста и карточек.
- BrainBattle waiting/review не клипает верхнюю иконку.
- PartyBattle results скроллится одним контейнером.
- Bunker outro/final доскролливается до нижних actions.
- Bunker reveal popup скроллится внутри карточки.
- Daily modal и create room modal не получают double scroll.

## Games

- BrainBattle: полный матч с людьми и ботами.
- Bunker: полный матч, reveal, voting, final/outro.
- PartyBattle: полный матч и final/results.

## Durak manual smoke

- 2–5 участников (люди/боты), 36/52, throw-in/transfer включены и выключены; все Easy/Medium/Hard bots.
- Видна только собственная рука; attack/defense/take/pass/transfer, добор и смена ролей синхронны на независимых клиентах.
- Выбор defense card/target не отправляет невалидный ход; пустая колода сохраняет козырную масть, hand controls доступны.
- Финал/статистика записываются сервером один раз, клиент не подменяет результат; roster mutations активной партии блокируются.
- Request/start/decline rematch, host return-to-room и non-host leave-room; повторное нажатие exit не дублирует действие.
- iPhone/Telegram safe-area: карты, hand settings, нижние действия/exit доступны при узком viewport и смене ориентации.
- Июльский [MVP report](../../qa-reports/durak-mvp-e2e-qa.md) не подтверждает этот расширенный сценарий.

## Product Flows

- Scheduled: create → invite → `scheduled_<id>` card → subscribe → reminder → host open → live room join. Список обновляется после каждого перехода.
- Unsubscribe/resubscribe, full signup, reschedule (новое время/сброс reminder marks), cancel и старая/expired ссылка дают понятный UI.
- Host open раньше окна 5 минут запрещён; недобор min_players возвращает warning. Disabled-copy пока не соответствует временному guard (backlog).
- Manual reminder: subscribed recipients, host-only, cooldown 10 минут; live CTA ведёт в комнату, scheduled CTA в карточку.
- Неоткрытая игра старше часа и live-запись удалённой комнаты становятся expired; удаление архивных записей >90 дней ещё не реализовано.
- Shared final в BrainBattle/PartyBattle/WordClash/Durak/Tic-Tac-Toe/Ultimate: outcome, участники, share text + invite URL, rematch/room controls по роли.
- Story там, где доступен API: public media card, читаемость кириллицы/длинных имён, отмена; при отсутствии API/media — обычный share. Ошибки API/Story проверить отдельно, не считать fallback полностью подтверждённым.
- Daily tasks: load, complete, claim, repeated claim blocked.
- Profile/settings: profile data loads, QA tools visible only for testers.
- Thermal-safe mode: no dirty glass, good contrast, no broken layout.

## Production / device verification

- Scheduler/cron действительно запускает reminder job в 5-минутном окне; доставка host/subscriber без дублей, перенос/отмена не дают старого reminder.
- Фактические migrations/schema (Scheduled 007, history 008, WordClash 015/016), seed/blacklist state и webhook configuration подтверждаются отдельно разрешённой ops-проверкой.
- Bot friend invites/request/accept и `/start` entry корректны в Telegram; debug accounts не доказывают delivery.
- PNG доступна Telegram по public HTTPS, GD/шрифты/permissions работают; Story UX и safe-area проверены на Telegram Android/iPhone с указанием версий.
- Для browser/debug-account production E2E использовать только [dev-login flow](tester-guide.md#production-e2e-для-агентов). Native Telegram/device/delivery требуют отдельного разрешённого QA этапа.
