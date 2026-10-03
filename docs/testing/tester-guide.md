# Tester Guide

Чат тестировщиков: https://t.me/+w6d97lbezTlmYzky

## Как стать тестировщиком

Администратор включает флаг в базе:

```sql
UPDATE users SET is_tester = 1 WHERE id = ...;
```

После этого в настройках приложения появится блок `QA tools`.

Для временной проверки без флага можно включить Scroll QA через URL:

```text
?debug_scroll_qa=1
```

Отключение:

```js
localStorage.removeItem('DEBUG_SCROLL_QA')
```

## Как сообщать баги

1. Откройте `Настройки -> QA tools`.
2. Нажмите `Скопировать баг-репорт`.
3. Заполните, что произошло, что ожидали и шаги воспроизведения.
4. Приложите скриншот или видео.
5. Отправьте в чат тестировщиков или создайте GitHub issue.

Обязательно прикладывайте:

- скриншот или видео;
- устройство;
- Android/iOS;
- Telegram WebView или браузер;
- debug info из QA tools;
- ссылку/экран, где произошла ошибка.

## Android Scroll QA

1. Откройте `Настройки -> QA tools`.
2. Нажмите `Открыть Scroll QA`.
3. Проверьте сценарии BrainBattle, PartyBattle, Bunker и модалки.
4. В каждом сценарии попробуйте свайп:
   - с текста;
   - с карточки;
   - с пустого фона;
   - рядом с нижними кнопками.

Ожидаемое поведение:

- экран скроллится без рывков;
- нет второго маленького scroll-контейнера;
- нижние actions достижимы;
- кнопки остаются кликабельными.

## Production E2E для агентов

При явно разрешённой production QA:

1. Открыть `https://lapin.live/mpg/?debug_dev_login=1`.
2. Использовать скрытую панель с QA/dev secret field и Dev 1–Dev 4. Секрет не записывать в prompts, logs, screenshots, videos или отчёты.
3. Для multiplayer открыть независимые browser sessions и выбрать разных Dev участников; для 5-player Durak можно добавить бота обычным UI.
4. Если панель недоступна, остановиться и указать точный on-screen шаг. Не заменять её regular Telegram/QR login, real accounts, mock initData, Console/API или ручным `devLogin()`.
5. После входа все игровые действия выполнять только через нормальный UI.

Полные правила: [AGENTS.md](../../AGENTS.md). Debug-account QA подтверждает только пройденный browser flow. Native Telegram UI, реальная bot delivery, Story, cron и DB rollout отмечаются отдельно; без соответствующего разрешения этот этап не выполняется.

## Smoke-сценарии

- BrainBattle: старт, раунд, боты/timeout, next round, финал.
- Bunker: старт, reveal, voting, финал/outro.
- PartyBattle: старт, голосование, финальные результаты.
- Room lifecycle: create/join, host transfer, last-human cleanup, full/password/playing ошибки, finish/restart и late polling после выхода.
- Durak: 2–5 игроков, 36/52, throw-in/transfer, все сложности ботов, hidden hands, финал/stats/rematch, host/non-host exit и safe-area.
- Scheduled games: create/invite/deep link, subscribe/unsubscribe, reschedule/cancel, manual/automatic reminder, open/join. Смена времени и открытие должны давать корректный CTA; реальную доставку отмечать отдельно.
- Post-game summary/share: BrainBattle, PartyBattle, WordClash, Durak и обе Tic-Tac-Toe; text + room link, Story там, где доступен API, public card и fallback.
- Telegram/iPhone: нижние действия и exit не перекрыты safe-area/клавиатурой; сравнить с Android scroll и desktop mockup.
- Daily tasks: выполнить, получить XP, повторный claim невозможен.
- Profile/settings: профиль загружается, QA tools доступны только тестеру.
- Thermal-safe mode: карточки и модалки читаемые, легкие анимации работают.

Подробный набор и code regression commands: [smoke-checklist.md](smoke-checklist.md). Перечень сценариев не означает PASS; historical Durak report от 2026-07-09 относится только к июльскому MVP.

## Как фиксировать результаты проверки

Указывать дату, commit/build (если известен), окружение, устройство/OS/Telegram version, сценарий, ожидаемый и фактический результат. Раздельно отмечать:

- code checks/test doubles;
- browser/debug-account checks;
- native Telegram/device checks и real delivery;
- ops verification scheduler/migrations/webhook.

Если шаг не выполнялся, писать «не проверено», а не PASS. В этом documentation reset 2026-10-03 выполнялась только сверка документации с кодом.
