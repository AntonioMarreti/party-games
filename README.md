# Party Games

Веб/Telegram Mini App для мультиплеерных party-игр: комнаты, публичные комнаты, боты, мобильный UI и desktop mockup.

Production: https://lapin.live/mpg/

## Текущий фокус

Проект уже живой, поэтому ближайший приоритет не новые режимы, а стабильность:

1. единый lifecycle комнаты;
2. защита от race conditions;
3. короткий smoke/regression набор;
4. стабилизация публичных комнат;
5. консистентность игровых экранов на mobile/Telegram WebView.

## Доступные игры

- **Бункер**: дискуссионная игра с персонажами, голосованием, AI outro и ботами.
- **Мозговая Битва**: быстрые раунды на эрудицию, реакцию, логику и внимание.
- **Кто из нас? / Party Battle**: набор party-режимов с вопросами и голосованиями.
- **Битва Слов / WordClash**: соревновательная игра в слова.
- **Blokus**: стратегическая настольная игра.
- **Крестики-нолики / Ultimate Tic-Tac-Toe**.
- **Spyfall, Backgammon, Minesweeper BR**: дополнительные игровые режимы.

## Технологический стек

- Frontend: HTML, CSS, Vanilla JS, Bootstrap 5, Telegram Web App API.
- Backend: PHP 8+, MySQL через PDO.
- Realtime модель: polling/fetch через `server/api.php`.
- AI: `server/lib/AI/*`, GigaChat/Yandex/HuggingFace providers.

## Ключевые директории

- `index.php` - входная точка приложения.
- `layout/` - экраны, навигация, модалки, общие шаблоны.
- `js/modules/` - клиентские менеджеры: комнаты, игры, API, auth, UI.
- `js/games/` - клиентская логика игровых режимов.
- `css/` и `styles.css` - общие стили и стили модулей.
- `server/api.php` - API router, auth, shared helpers.
- `server/actions/` - серверные действия по комнатам, играм, пользователям, social.
- `server/games/` - серверная логика игровых режимов.
- `server/games/packs/` - контент-паки игр.
- `server/lib/AI/` - AI service/providers и bot framework.
- `tests/` - текущие PHP-проверки и симуляции.
- `tools/` - dev/maintenance scripts.
- `logs/` - локальные audit/token/usage файлы, не источник truth для фич.

## Недельный план стабилизации

## Room Lifecycle Rules

Базовый lifecycle комнаты: `no_room -> waiting -> playing -> waiting` с удалением комнаты при отсутствии людей.

| Action | Кто может | Из состояния | Результат |
| --- | --- | --- | --- |
| `create_room` | любой авторизованный игрок | `no_room` или после очистки старых membership | новая `waiting`-комната, игрок становится host |
| `join_room` | человек | только `waiting` | вход в комнату, старые membership очищаются |
| `leave_room` | любой участник | `waiting` / `playing` | игрок выходит; host transfer только активному человеку |
| `kick_player` | host | только `waiting` / `playing` своей комнаты | удаляет target из комнаты |
| `start_game` | host | только `waiting` и при валидном составе игроков | `playing`, инициализируется `game_state` |
| `stop_game` | host | `playing` | возврат в `waiting`, `game_state = null` |
| `finish_game_session` | host | `playing` | возврат в `waiting`, состав комнаты сохраняется |
| cleanup last human | server | любое | если людей не осталось, комната и public listing удаляются |

## Current Status

Что уже зафиксировано в коде:

- server-side lifecycle helper'ы вынесены в `server/lib/room_lifecycle.php`;
- `create_room`, `join_room`, `leave_room`, `start_game`, `stop_game`, `finish_game_session` получили базовые guard/idempotency правила;
- host transfer разрешен только живому human membership;
- cleanup комнаты удаляет `public_rooms`, если людей не осталось;
- room/game lifecycle логируется единообразно через `logRoomLifecycle(...)`;
- клиентские `createRoom()`, `joinRoom()`, `startGame()`, `leaveRoom()` защищены от простого double click через pending-флаги.

Что уже покрыто smoke:

- host leave -> host transfer;
- last human leave -> room cleanup;
- repeated leave -> noop;
- join same room -> noop;
- join another waiting room -> single membership transfer;
- join playing room -> reject;
- join full room -> reject.

Локальный запуск smoke:

```bash
php tests/room_lifecycle_smoke.php
```

Ожидаемый результат:

```text
>>> ROOM LIFECYCLE SMOKE <<<
[+] Host transfer scenario passed
[+] Last human cleanup scenario passed
[+] Repeated leave noop scenario passed
[+] Join noop scenario passed
[+] Join transfer scenario passed
[+] Join non-waiting reject scenario passed
[+] Join full-room reject scenario passed
PASS
```

### День 1 - Зафиксировать lifecycle комнаты

Цель: описать и унифицировать переходы `no_room -> waiting -> playing -> finished/stopped -> waiting/no_room`.

Файлы:

- `server/api.php`
- `server/actions/room.php`
- `server/actions/game.php`
- `js/modules/room-manager.js`
- `js/modules/game-manager.js`
- `layout/screens/room.php`

Что сделать:

- Вынести короткую lifecycle-таблицу в код/README: кто может создать, join, leave, kick, start, stop, finish.
- Проверить, что `leave_room`, `clearUserRooms`, `stop_game`, `start_game`, `get_state` не дают разный результат для host/non-host.
- Убедиться, что host transfer работает только на живого человека, а не на бота или stale membership.
- Добавить/уточнить server-side guards: нельзя join в playing/finished, нельзя start без валидной комнаты и игроков.

Проверять:

- host создает комнату, второй игрок входит, host выходит, хостство переходит;
- последний человек выходит, комната исчезает или перестает быть публичной;
- игрок не остается в двух комнатах после create/join;
- bot-only комната не висит публично.

Риск: высокий. Это общий фундамент для всех игр.

### День 2 - Race conditions и idempotency на room/game actions

Цель: сделать повторные/поздние запросы безопасными.

Файлы:

- `server/actions/room.php`
- `server/actions/game.php`
- `server/games/brainbattle.php`
- `server/games/bunker.php`
- `js/modules/api-manager.js`
- `js/modules/room-manager.js`

Что сделать:

- Проверить транзакции вокруг `join_room`, `create_room`, `leave_room`, `start_game`, `stop_game`.
- Для критичных action добавить повторяемое поведение: duplicate leave/stop не должен ломать состояние.
- Для игр придерживаться паттерна Brain Battle: `round_id`, phase validation, duplicate submit guard.
- Отметить игры, где этого еще нет, и не чинить все сразу без smoke-покрытия.

Проверять:

- двойной клик join/create/start/stop;
- submit ответа после смены раунда;
- два клиента host-а одновременно жмут start/stop;
- polling не возвращает устаревший экран после выхода.

Риск: высокий. Ошибки здесь дают ghost rooms, broken UI и неверные очки.

### День 3 - Минимальный smoke/regression набор

Цель: получить быстрые проверки, которые реально запускать перед деплоем.

Файлы:

- `tests/`
- `tools/check_db.php`
- `tools/cleanup_dev.sh`
- `server/actions/room.php`
- `server/games/brainbattle.php`
- `server/games/bunker.php`

Что сделать:

- Добавить smoke checklist в `tests/README.md` или отдельный `tests/smoke.md`.
- Существующие PHP-симуляции не расширять хаотично, а выбрать 5-7 окупаемых сценариев.
- Для Brain Battle добавить/закрепить проверку stale/duplicate submit и нулевых очков в финале.
- Для Bunker добавить/закрепить проверку single AI outro request и voting phase.
- Для public rooms добавить серверную проверку фильтрации waiting + human host + capacity.

Минимальный набор:

- Room lifecycle: create, join, leave host, transfer host, cleanup last human.
- Public rooms: visible only waiting rooms with active human host; password join error keeps modal flow.
- Brain Battle: valid submit, duplicate submit, stale `round_id`, final includes zero-score players.
- Bunker: voting phase opens, vote submit accepted once, final outro generated once.
- API auth/dev login: two dev users can run a full room scenario locally.
- Mobile smoke: 390px viewport, Telegram WebView mock, final footer/buttons visible.

Проверять:

- smoke выполняется локально без ручной чистки БД между каждым шагом;
- ошибки понятны по сообщению, а не только по PHP warning;
- тесты не требуют production credentials.

Риск: средний. Основной риск - потратить день на слишком широкий test framework.

### День 4 - Публичные комнаты как стабильный entry point

Цель: убрать flaky join/list поведение и stale публичные комнаты.

Файлы:

- `server/actions/room.php`
- `server/actions/social.php`
- `js/modules/room-manager.js`
- `css/modules/lobby.css`
- `layout/screens/home.php`
- `layout/screens/room.php`

Что сделать:

- Проверить `make_room_public`, `get_public_rooms`, `join_room` на единые capacity/status правила.
- Убедиться, что password flow не закрывает modal/prompt при ошибке.
- Добавить server-side reason codes/messages для full/password/not waiting/not found.
- На клиенте не полагаться на старый список после failed join: обновлять карточку или список.
- Проверить, что главная иконка карточки берется из game config, а не из avatar host.

Проверять:

- room full;
- wrong password;
- host ушел между list и join;
- игра стартовала между list и join;
- публичная комната с ботами, но без людей, не видна.

Риск: средний-высокий. Это первый экран входа для случайных игроков.

### День 5 - UI consistency игровых экранов

Цель: закрепить паттерны, которые уже помогли Bunker и Brain Battle.

Файлы:

- `js/games/bunker/*`
- `js/games/brainbattle.js`
- `css/modules/brainbattle.css`
- `js/games/bunker/bunker.css`
- `css/layout.css`
- `css/components.css`
- `layout/screens/game.php`

Что сделать:

- Описать общий подход для fixed/portal action footer.
- Проверить экраны финала, голосования, fact-check, overlays и round transitions.
- Убрать локальные z-index/overflow хаки, если они конфликтуют с desktop mockup.
- Зафиксировать минимум responsive states: mobile 390px, desktop mockup, Telegram WebView.

Проверять:

- кнопки финала видны и кликабельны;
- overlay очищается между раундами;
- body/page scroll не блокируется после модалок;
- длинные тексты вопросов не перекрывают controls.

Риск: средний. UI-правки легко ломают Telegram WebView.

### День 6 - Content cleanup и AI audit

Цель: снизить риск спорного/ломающего контента и лишних AI-запросов.

Файлы:

- `server/games/packs/`
- `server/games/brainbattle.php`
- `server/games/bunker.php`
- `server/lib/AI/AIService.php`
- `server/lib/AI/Providers/*`
- `logs/gigachat_usage.json`
- `logs/gigachat_audit.json`

Что сделать:

- Пройти только контент, который участвует в активных режимах: Brain Battle, Bunker, Party Battle.
- Для AI quiz/fact-check проверить prompt constraints и fallback при невалидном ответе.
- Добавить audit-рекомендацию: какие поля смотреть при подозрении на лишние запросы.
- Не расширять AI-фичи, пока нет стабильного lifecycle.

Проверять:

- AI fallback не ломает раунд;
- один server-side generation на событие, а не N клиентов;
- invalid AI JSON не попадает на клиент как сломанный вопрос;
- спорные fact_check вопросы либо исправлены, либо отключены.

Риск: средний. Контентные изменения могут незаметно менять баланс игры.

### День 7 - Regression pass и release notes

Цель: пройти полный ручной сценарий и подготовить деплой без сюрпризов.

Файлы:

- `README.md`
- `tests/smoke.md` или `tests/README.md`
- `layout/version.php`
- `tools/bump-version.js`
- затронутые файлы недели

Что сделать:

- Запустить smoke из Дня 3.
- Пройти 2-player сценарии: create/join/start/finish/restart/leave.
- Проверить mobile viewport и desktop.
- Обновить краткие release notes: что стабилизировано, что осталось риском.
- Поднять версию только после smoke.

Проверять:

- нет PHP fatal/error в API responses;
- нет stuck overlay/backdrop;
- public rooms обновляются после join/leave/start;
- Bunker и Brain Battle проходят по одному полному матчу.

Риск: низкий-средний. Это день интеграции, не день больших новых правок.

## Что делать первым

1. Room lifecycle и guards на сервере.
2. Idempotency/race protection для room/game actions.
3. Минимальный smoke на lifecycle, public rooms, Brain Battle, Bunker.
4. Public rooms как стабильный вход.
5. Mobile/UI pass только после стабилизации поведения.

Максимальный эффект на стабильность дадут lifecycle, idempotency и smoke. UI cleanup и content cleanup важны, но их безопаснее делать после того, как серверные состояния перестанут расходиться.

## Что можно отложить

- Новые игры и новые режимы.
- WebSockets.
- PWA/TV mode.
- Trust/reputation layer.
- История матчей/replay/post-game review.
- Расширение AI host/commentary.
- Большой рефакторинг `app.js` без конкретного regression покрытия.

## Локальная установка

### Требования

- PHP 8+
- MySQL
- HTTPS для реального Telegram Mini App
- Telegram bot token для production-like запуска

### Настройка

```bash
cp server/config.example.php server/config.php
```

Дальше укажите параметры БД, Telegram bot token и AI provider credentials в `server/config.php`.

Для локальной разработки используйте `dev_login` только в dev-среде. Production не должен зависеть от dev users.

## Быстрая проверка перед деплоем

```bash
php -l server/api.php
php -l server/actions/room.php
php -l server/actions/game.php
php -l server/games/brainbattle.php
php -l server/games/bunker.php
php tests/backgammon_rules_test.php
```

Дополнительно вручную:

- создать комнату;
- войти вторым dev-пользователем;
- сделать комнату публичной;
- проверить password/full/not waiting ошибки;
- пройти один матч Brain Battle;
- пройти Bunker до voting/final;
- проверить мобильный viewport около 390px.

## Лицензия

MIT License. См. [LICENSE](LICENSE).
