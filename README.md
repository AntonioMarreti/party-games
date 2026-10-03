# Party Games

Веб/Telegram Mini App для мультиплеерных party-игр: приватные и публичные комнаты, боты, мобильный UI и desktop mockup.

Production: https://lapin.live/mpg/

## Игры и возможности

- **Бункер**: персонажи, reveal, дискуссия, голосование, AI outro и боты.
- **Мозговая Битва / BrainBattle**: раунды на эрудицию, реакцию, логику и внимание.
- **Party Battle / Кто из нас?**: meme, joke, advice, acronym, caption, bluff, whoami с canonical контент-паками.
- **Битва Слов / WordClash и WordClash Party**: broad dictionaries для guesses, отдельные curated targets для секретных слов; DB-backed active targets, suggestions и audit реализованы.
- **Дурак / Durak**: 2–5 участников, колоды 36/52, настройки подкидывания и перевода, Easy/Medium/Hard bots. Сервер хранит руки и правила, клиент получает только свою проекцию. Есть финал, серверная статистика, rematch, защита состава/результата и выход non-host.
- **Blokus**, **Крестики-нолики / Ultimate Tic-Tac-Toe**, **Spyfall**, **Backgammon**, **Minesweeper BR**.
- Room invites: deep link, QR, копирование ссылки и приглашение друзей через бота.
- Scheduled Games: создание/список, запись/отмена записи, перенос/отмена игры, invite/share, открытие публичной waiting-комнаты, ручные и автоматические напоминания.
- Общий post-game summary/share: текст и Telegram share URL, Story API с публичной PNG-карточкой и fallback. Интегрирован в BrainBattle, PartyBattle, WordClash, Durak и обе версии Tic-Tac-Toe.
- Профиль, история/XP, daily tasks, настройки и QA tools для тестеров.

Это обзор реализации в репозитории, а не новый production QA PASS. Работа scheduler, состояние production migrations, доставка bot messages и Story на конкретных устройствах требуют отдельной проверки.

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

## Стабильные foundations

- Общий room lifecycle в `server/lib/room_lifecycle.php`: create/join guards, single membership, host transfer активному человеку, cleanup после последнего человека и удаление public listing.
- Основной цикл комнаты: `no_room -> waiting -> playing -> waiting`; join разрешён в waiting, start/stop/finish управляет host. Game-specific финалы и rematch живут в состоянии игры.
- Общие API/actions, lifecycle logging и pending-флаги клиента защищают базовые повторные действия. Это не утверждение об отсутствии всех race conditions.
- Durak использует authoritative server state, player projection, серверную запись финала с `stats_recorded`; изменения roster во время активной партии и клиентская подмена результата блокируются.
- Party Battle runtime читает canonical packs через `pb_getPartyBattlePackRegistry()`; staging `data/import/` не является runtime-зависимостью.
- Существуют room lifecycle и Durak regression tests; их наличие не заменяет ручную QA текущей сборки.

## Планирование и проверки

- [BACKLOG.md](BACKLOG.md): конкретные незавершённые задачи.
- [FUTURE_WORK.md](FUTURE_WORK.md): текущие приоритеты P1–P5, уже реализованное и границы scope; точка сверки с кодом указана там.
- [Smoke checklist](docs/testing/smoke-checklist.md) и [Tester guide](docs/testing/tester-guide.md): code checks, browser/debug QA и device/production verification.
- [Durak MVP E2E report](qa-reports/durak-mvp-e2e-qa.md): историческая проверка от 2026-07-09.
- [Packs registry](server/games/packs/README.md) и [Content progress](tools/parsers/partybattle_content_progress.md): подключённый coverage и контентные хвосты.

## Требования и настройка

PHP 8+, MySQL/PDO, HTTPS для Telegram Mini App. Пример конфигурации: `server/config.example.php`; реальные credentials не хранятся в документации.

Production E2E QA использует скрытую dev-login панель согласно [AGENTS.md](AGENTS.md). Debug accounts не подтверждают native Telegram UI или реальную доставку уведомлений.

## Лицензия

MIT License. См. [LICENSE](LICENSE).
