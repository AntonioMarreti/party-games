/**
 * Game Configuration Module
 * Contains static definitions for all available games.
 */

window.AVAILABLE_GAMES = [
    {
        id: 'bunker',
        category: 'party',
        name: 'Бункер',
        icon: 'bi-shield-check',
        color: '#E67E22',
        bgColor: '#FDF2E9',
        promoImage: 'assets/promo/bunker.jpg',
        description: 'Дискуссионная игра о выживании.',
        longDescription: `
            <p><strong>Бункер</strong> — это не просто игра, это социальный эксперимент по выживанию в условиях постапокалипсиса. Мир разрушен (ядерная война, падение метеорита или восстание динозавров), и ваше единственное спасение — герметичное убежище.</p>
            <p><strong>Этапы выживания:</strong></p>
            <ul>
                <li><strong>1. Знакомство с угрозой:</strong> В начале игры раскрывается катастрофа. Узнайте, сколько лет вам предстоит провести в изоляции и какие опасности ждут снаружи.</li>
                <li><strong>2. Раскрытие карт:</strong> В каждом раунде игроки открывают по одной своей характеристике: профессию, биологические данные (возраст/пол), состояние здоровья, хобби, багаж и особые факты.</li>
                <li><strong>3. Великие дебаты:</strong> Ваша задача — убедить остальных, что именно вы (например, «Врач-кардиолог с диабетом и мешком картошки») необходимы группе.</li>
                <li><strong>4. Голосование и финал:</strong> Группа решает, кто займет ограниченные места. Оставшиеся снаружи погибают, а выжившие узнают свою судьбу: хватит ли им навыков, чтобы восстановить цивилизацию?</li>
            </ul>
        `,
        stats: { players: '4-16', time: '30-60 мин', difficulty: 'Средняя' },
        rules: [
            { icon: 'bi-radioactive', text: 'Адаптируйте стратегию под тип катастрофы' },
            { icon: 'bi-briefcase-fill', text: 'Открывайте карты и доказывайте свою пользу' },
            { icon: 'bi-hand-thumbs-down', text: 'Голосуйте против самых слабых звеньев' },
            { icon: 'bi-stars', text: 'Используйте Спецкарты, чтобы изменить правила' },
            { icon: 'bi-exclamation-triangle-fill', text: 'Следите за событиями в бункере' }
        ],
        gallery: [
            {
                type: 'html',
                label: 'Катастрофа: Ядерная Война',
                content: `
                    <div class="p-3 rounded-4" style="background: rgba(255,255,255,0.05); border: 1px solid var(--border-main); color: var(--text-main);">
                        <div class="d-flex justify-content-between mb-3">
                            <div class="badge bg-danger rounded-pill px-3 py-2">Раунд 1</div>
                            <div class="badge bg-secondary rounded-pill px-3 py-2">Мест: 4</div>
                        </div>
                        <div class="p-3 rounded-4" style="background: rgba(231, 76, 60, 0.1); border: 1px solid rgba(231, 76, 60, 0.2);">
                            <div class="fw-bold mb-1"><i class="bi bi-radioactive text-danger me-2"></i>Ядерная Война</div>
                            <div style="font-size: 11px; opacity: 0.8;">Через 15 минут мир перестал существовать. Выживание возможно только в герметичном бункере. Срок: 3 года.</div>
                        </div>
                    </div>
                `
            },
            {
                type: 'html',
                label: 'Момент раскрытия',
                content: `
                    <div class="p-4 rounded-4 shadow-lg text-center" style="background: linear-gradient(to bottom, #2b323b, #1a1e23); border: 2px solid var(--primary-color);">
                        <div class="mb-3">
                            <img src="data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64' fill='%23e0e0e0'%3E%3Crect width='64' height='64' rx='32' fill='%23cccccc'/%3E%3Ccircle cx='32' cy='25' r='12' fill='%239e9e9e'/%3E%3Cpath d='M12 56c0-11 9-20 20-20s20 9 20 20' fill='%239e9e9e'/%3E%3C/svg%3E" style="width: 60px; height: 60px; border-radius: 50%; border: 3px solid white;">
                            <div class="fw-bold mt-2 text-white">Александр</div>
                        </div>
                        <div class="p-3 rounded-3" style="background: white; color: black;">
                            <div style="font-size: 40px; color: var(--primary-color);" class="mb-1"><i class="bi bi-briefcase-fill"></i></div>
                            <div class="text-uppercase small fw-bold opacity-50 mb-1">Профессия</div>
                            <div class="h4 fw-bold">ИНЖЕНЕР-АТОМЩИК</div>
                        </div>
                    </div>
                `
            },
            {
                type: 'html',
                label: 'Твоё Досье (Инвентарь)',
                content: `
                    <div class="d-grid gap-2">
                        <div class="p-2 px-3 rounded-3 d-flex align-items-center" style="background: var(--bg-card); border: 1px solid var(--border-main);">
                            <i class="bi bi-heart-pulse-fill me-3 text-danger"></i>
                            <div class="small"><b>Здоровье:</b> Диабет</div>
                        </div>
                        <div class="p-2 px-3 rounded-3 d-flex align-items-center" style="background: var(--bg-card); border: 1px solid var(--border-main);">
                            <i class="bi bi-palette-fill me-3 text-warning"></i>
                            <div class="small"><b>Хобби:</b> Разведение кроликов</div>
                        </div>
                        <div class="p-2 px-3 rounded-3 d-flex align-items-center" style="background: var(--bg-card); border: 1px solid var(--border-main);">
                            <i class="bi bi-backpack-fill me-3 text-info"></i>
                            <div class="small"><b>Багаж:</b> Аптечка (Action: Heal)</div>
                        </div>
                    </div>
                `
            }
        ],
        files: [
            'js/games/bunker/bunker.css',
            'js/games/bunker/ui.js',
            'js/games/bunker/handlers.js',
            'js/games/bunker/index.js'
        ]
    },
    {
        id: 'brainbattle',
        category: 'logic',
        name: 'Мозговая Битва',
        icon: 'bi-lightbulb-fill',
        color: '#9B59B6',
        bgColor: '#F4ECF7',
        promoImage: 'assets/promo/brainbattle.jpg',
        description: 'Динамичный турнир из быстрых мини-игр!',
        longDescription: `
            <p><strong>Мозговая Битва</strong> — это динамичный турнир, состоящий из серии интеллектуальных мини-игр, проверяющих ваш ум на прочность в условиях ограниченного времени.</p>
            <p><strong>Как проходит турнир:</strong></p>
            <ul>
                <li><strong>1. Настройка:</strong> Хост выбирает количество раундов и категории испытаний: Логика, Внимание, Эрудиция, Реакция или Память.</li>
                <li><strong>2. Подготовка:</strong> Перед каждым заданием вы видите тип испытания и короткий обратный отсчет. Соберитесь, секунды решают всё!</li>
                <li><strong>3. Испытание:</strong> Решайте математические примеры, ищите дубликаты среди хаоса символов или определяйте цвет слова, игнорируя его смысл (эффект Струпа).</li>
                <li><strong>4. Результат:</strong> Ваша скорость напрямую влияет на количество полученных очков. Чем быстрее правильный ответ, тем выше вы в таблице лидеров турнира.</li>
            </ul>
        `,
        stats: { players: '1-8', time: '5-15 мин', difficulty: 'Легкая' },
        rules: [
            { icon: 'bi-puzzle-fill', text: 'Логика: математика и сравнения' },
            { icon: 'bi-grid-3x3-gap-fill', text: 'Внимание: поиск дубликатов и лишнего' },
            { icon: 'bi-lightning-fill', text: 'Реакция: проверка скорости отклика' },
            { icon: 'bi-stopwatch-fill', text: 'Память: запоминание последовательностей' },
            { icon: 'bi-globe', text: 'Эрудиция: быстрые вопросы и ответы' }
        ],
        gallery: [
            {
                type: 'html',
                label: 'Категории и раунды',
                content: `
                    <div class="p-3 rounded-4" style="background: var(--bg-card); border: 1px solid var(--border-main);">
                        <div class="small fw-bold text-muted text-uppercase mb-2">Настройка турнира</div>
                        <div class="d-flex flex-wrap gap-2 mb-3">
                            <span class="badge bg-primary rounded-pill p-2 px-3"><i class="bi bi-grid-3x3-gap-fill me-1"></i> Внимание</span>
                            <span class="badge bg-warning rounded-pill p-2 px-3 text-dark"><i class="bi bi-puzzle-fill me-1"></i> Логика</span>
                            <span class="badge bg-danger rounded-pill p-2 px-3"><i class="bi bi-lightning-fill me-1"></i> Реакция</span>
                        </div>
                        <div class="p-2 rounded-3 text-center fw-bold" style="background: var(--bg-secondary); color: var(--primary-color);">10 РАУНДОВ</div>
                    </div>
                `
            },
            {
                type: 'html',
                label: 'Логика: Больше или меньше?',
                content: `
                    <div class="p-3 rounded-4" style="background: var(--bg-card); border: 1px solid var(--border-main);">
                        <div class="text-center mb-3">
                            <span class="badge bg-secondary p-1 px-2" style="font-size: 10px;">БОЛЬШЕ / МЕНЬШЕ</span>
                            <div class="h6 fw-bold mt-2">Какое число больше?</div>
                        </div>
                        <div class="d-flex gap-2">
                            <div class="flex-grow-1 p-3 rounded-4 text-center fw-bold" style="background: rgba(var(--primary-rgb), 0.1); border: 2px solid var(--primary-color); color: var(--primary-color); font-size: 24px;">32</div>
                            <div class="flex-grow-1 p-3 rounded-4 text-center fw-bold" style="background: var(--bg-secondary); border: 1px solid var(--border-main); opacity: 0.6; font-size: 24px;">28</div>
                        </div>
                    </div>
                `
            },
            {
                type: 'html',
                label: 'Внимание: Цветовой Хаос',
                content: `
                    <div class="p-3 rounded-4" style="background: var(--bg-card); border: 1px solid var(--border-main);">
                        <div class="text-center mb-3">
                            <span class="badge bg-secondary p-1 px-2" style="font-size: 10px;">ЭФФЕКТ СТРУПА</span>
                            <div class="h6 fw-bold mt-2 text-muted">Назови ЦВЕТ слова:</div>
                        </div>
                        <div class="display-5 fw-bold text-center mb-3" style="color: #e63946;">СИНИЙ</div>
                        <div class="d-grid gap-2" style="grid-template-columns: 1fr 1fr;">
                            <div class="p-2 border rounded-3 text-center small fw-bold">Синий</div>
                            <div class="p-2 border rounded-3 text-center small fw-bold" style="background: var(--primary-color); color: white; border-color: var(--primary-color) !important;">Красный</div>
                        </div>
                    </div>
                `
            }
        ],
        files: ['js/games/brainbattle.js']
    },
    {
        id: 'partybattle',
        category: 'party',
        name: 'Party Battle',
        icon: 'bi-controller',
        color: '#6c5ce7',
        bgColor: 'rgba(108, 92, 231, 0.1)',
        promoImage: 'assets/promo/partybattle.jpg',
        description: 'Сборник популярных игр для веселой компании.',
        longDescription: `
            <p><strong>Party Battle</strong> — это ультимативный набор игр для компании, объединенный в одну мета-игру. Больше не нужно выбирать — играйте во всё сразу!</p>
            <p><strong>Доступные режимы:</strong></p>
            <ul>
                <li><strong>МемоБатл:</strong> Классическая битва гифок. Подбирайте смешные реакции на забавные ситуации.</li>
                <li><strong>Добивка:</strong> Текстовый батл юмора. Дописывайте концовки к шуткам и голосуйте за лучший вариант.</li>
                <li><strong>Кто из нас?</strong> Узнайте правду о своих друзьях. Голосуйте за того, кто больше всего подходит под описание.</li>
            </ul>
            <p>Настраивайте количество раундов, выбирайте интересующие темы и используйте AI для бесконечной генерации контента!</p>
        `,
        stats: { players: '3-16', time: '15-40 мин', difficulty: 'Легкая' },
        rules: [
            { icon: 'bi-shuffle', text: 'Разнообразные игровые режимы в одной сессии' },
            { icon: 'bi-stars', text: 'AI-генерация уникальных ситуаций и шуток' },
            { icon: 'bi-hand-thumbs-up', text: 'Анонимное голосование за лучшие ответы' },
            { icon: 'bi-trophy', text: 'Единая система прогрессии и лидерборд' }
        ],
        files: [
            'js/games/partybattle/ui-modes.js',
            'js/games/partybattle/ui.js',
            'js/games/partybattle/index.js'
        ],
        renderFunction: 'render_partybattle'
    },
    {
        id: 'tictactoe_ultimate',
        category: 'strategy',
        name: 'Крестики-нолики Ultimate',
        icon: 'bi-grid-3x3-gap-fill',
        color: '#4D96FF',
        bgColor: 'rgba(77, 150, 255, 0.1)',
        promoImage: '',
        description: 'Стратегические крестики-нолики на поле 9x9.',
        longDescription: `
            <p><strong>Ultimate Tic-Tac-Toe</strong> (или Стратегические крестики-нолики) — это игра, которая превращает знакомую с детства забаву в глубокое тактическое противостояние.</p>
            <p>Вы играете на большом поле 3x3, где каждая клетка — это еще одно маленькое поле. Чтобы занять клетку на большом поле, нужно сначала победить в мини-игре внутри неё.</p>
            <p><strong>Главная фишка:</strong> Ваш ход определяет, в какой части большого поля будет ходить соперник. Мастерство заключается в том, чтобы не только выигрывать свои клетки, но и умело «загонять» оппонента в невыгодные позиции.</p>
        `,
        stats: { players: '2', time: '5-15 мин', difficulty: 'Высокая' },
        rules: [
            { icon: 'bi-grid-3x3', text: 'Побеждайте в мини-полях' },
            { icon: 'bi-compass', text: 'Управляйте ходами соперника' },
            { icon: 'bi-trophy', text: 'Соберите 3 мини-победы в ряд' }
        ],
        gallery: [
            {
                type: 'html',
                label: 'Механика: Управление врагом',
                content: `
                    <div class="p-3 rounded-4 mb-3" style="background: var(--bg-card); border: 1px solid var(--border-main);">
                        <div style="font-size:11px; font-weight:bold; color:var(--text-muted); text-transform:uppercase; margin-bottom:10px;">Куда ты походишь...</div>
                        <div class="d-flex justify-content-center align-items-center gap-3">
                            <div style="width:60px; height:60px; border:2px solid var(--primary-color); position:relative; display:grid; grid-template-columns:repeat(3,1fr); gap:2px; padding:2px;">
                                <div style="background:var(--bg-secondary);"></div><div style="background:var(--bg-secondary);"></div><div style="background:var(--primary-color); border-radius:2px;"></div>
                                <div style="background:var(--bg-secondary);"></div><div style="background:var(--bg-secondary);"></div><div style="background:var(--bg-secondary);"></div>
                                <div style="background:var(--bg-secondary);"></div><div style="background:var(--bg-secondary);"></div><div style="background:var(--bg-secondary);"></div>
                            </div>
                            <div style="font-size:24px; color:var(--primary-color);">→</div>
                            <div style="width:60px; height:60px; border:2px dashed var(--text-muted); display:grid; grid-template-columns:repeat(3,1fr); gap:2px; padding:2px; opacity:0.5;">
                                <div style="background:var(--bg-secondary);"></div><div style="background:var(--bg-secondary);"></div><div style="background:var(--primary-color); border-radius:2px; animation: pulse 1s infinite;"></div>
                                <div style="background:var(--bg-secondary);"></div><div style="background:var(--bg-secondary);"></div><div style="background:var(--bg-secondary);"></div>
                                <div style="background:var(--bg-secondary);"></div><div style="background:var(--bg-secondary);"></div><div style="background:var(--bg-secondary);"></div>
                            </div>
                        </div>
                        <div class="mt-2 text-center x-small" style="color:var(--text-muted);">Ход в правый угол мини-поля отправляет врага в правое большое поле!</div>
                    </div>
                `
            }
        ],
        scripts: [
            'js/games/tictactoe_ultimate/index.js',
            'js/games/tictactoe_ultimate/ui.js',
            'js/games/tictactoe_ultimate/bot.js'
        ],
        css: ['js/games/tictactoe_ultimate/tictactoe_ultimate.css'],
        renderFunction: 'render_tictactoe_ultimate'
    },
    {
        id: 'blokus',
        category: 'strategy',
        name: 'Blokus',
        icon: 'bi-grid-3x3',
        color: '#3498db',
        bgColor: '#ebf5fb',
        promoImage: 'assets/promo/blockus.jpg',
        description: 'Легендарная абстрактная стратегия.',
        longDescription: `
            <p><strong>Blokus</strong> — это легендарная стратегия, где каждый миллиметр игрового поля на вес золота. В вашем распоряжении 21 фигура различной формы, и ваша задача — захватить как можно больше пространства, умело блокируя пути соперникам.</p>
            <p><strong>Главное правило:</strong></p>
            <ul>
                <li>Каждая ваша новая фигура должна соприкасаться с уже выставленной фигурой вашего цвета <strong>только углами</strong>.</li>
                <li>Касаться своих фигур сторонами (гранями) строго запрещено. Это создает уникальную механику «просачивания» сквозь оборону противника.</li>
            </ul>
            <p>Побеждает тот, кто к концу матча сможет выставить на поле больше всего квадратов. Blokus — это идеальный баланс между простотой Тетриса и стратегической глубиной Шахмат.</p>
        `,
        stats: { players: '2-4', time: '15-25 мин', difficulty: 'Высокая' },
        rules: [
            { icon: 'bi-bounding-box', text: 'Захват территории поля' },
            { icon: 'bi-node-plus', text: 'Правило касания только углами' },
            { icon: 'bi-slash-circle', text: 'Блокируйте пути врагам' },
            { icon: 'bi-1-square-fill', text: '21 уникальная фигура в арсенале' }
        ],
        gallery: [
            {
                type: 'html',
                label: 'Правило: Касание углами',
                content: `
                    <div class="demo-blokus-move">
                        <div class="move-box" style="margin: 0 auto; background: rgba(39, 174, 96, 0.05); border: 1px dashed rgba(39, 174, 96, 0.2);">
                            <div class="move-grid">
                                <div class="mg-cell"></div><div class="mg-cell"></div><div class="mg-cell"></div><div class="mg-cell"></div><div class="mg-cell"></div>
                                <div class="mg-cell"></div><div class="mg-cell active"></div><div class="mg-cell active"></div><div class="mg-cell"></div><div class="mg-cell"></div>
                                <div class="mg-cell"></div><div class="mg-cell active"></div><div class="mg-cell active"></div><div class="mg-cell"></div><div class="mg-cell"></div>
                                <div class="mg-cell"></div><div class="mg-cell"></div><div class="mg-cell"></div><div class="mg-cell active"></div><div class="mg-cell active"></div>
                                <div class="mg-cell"></div><div class="mg-cell"></div><div class="mg-cell"></div><div class="mg-cell active"></div><div class="mg-cell"></div>
                            </div>
                            <div style="font-size:10px; color:#27ae60; font-weight:800; text-transform: uppercase;"><i class="bi bi-check-circle-fill"></i> Только уголок</div>
                        </div>
                    </div>
                `
            },
            {
                type: 'html',
                label: 'Ошибка: Касание сторонами',
                content: `
                    <div class="demo-blokus-move">
                        <div class="move-box" style="margin: 0 auto; background: rgba(231, 76, 60, 0.05); border: 1px dashed rgba(231, 76, 60, 0.2);">
                            <div class="move-grid">
                                <div class="mg-cell"></div><div class="mg-cell"></div><div class="mg-cell"></div><div class="mg-cell"></div><div class="mg-cell"></div>
                                <div class="mg-cell"></div><div class="mg-cell active"></div><div class="mg-cell active"></div><div class="mg-cell"></div><div class="mg-cell"></div>
                                <div class="mg-cell"></div><div class="mg-cell active"></div><div class="mg-cell active"></div><div class="mg-cell"></div><div class="mg-cell"></div>
                                <div class="mg-cell"></div><div class="mg-cell active"></div><div class="mg-cell active"></div><div class="mg-cell active"></div><div class="mg-cell active"></div>
                                <div class="mg-cell"></div><div class="mg-cell"></div><div class="mg-cell"></div><div class="mg-cell"></div><div class="mg-cell"></div>
                            </div>
                            <div style="font-size:10px; color:#e74c3c; font-weight:800; text-transform: uppercase;"><i class="bi bi-x-circle-fill"></i> Нельзя касаться гранями</div>
                        </div>
                    </div>
                `
            }
        ],
        files: ['js/games/blokus/engine.js', 'js/games/blokus/ui.js', 'js/games/blokus/handlers.js', 'js/games/blokus/bot.js', 'js/games/blokus.js']
    },
    {
        id: 'wordclash',
        category: 'logic',
        name: 'Битва Слов',
        icon: 'bi-fonts',
        color: '#6aaa64',
        bgColor: '#e8f5e9',
        promoImage: 'assets/promo/wordclash.jpg',
        description: 'Найдите секретное слово быстрее всех!',
        longDescription: `
            <p><strong>Битва Слов</strong> — это интеллектуальная дуэль в реальном времени, вдохновленная классическим Wordle, но с соревновательным уклоном. Ваша задача — отгадать секретное слово из 5 букв быстрее всех соперников.</p>
            <p><strong>Правила выживания в гонке:</strong></p>
            <ul>
                <li><strong>Интеллектуальный штурм:</strong> У вас есть 6 попыток. Каждое введенное слово дает подсказки: 🟩 Зеленый — буква на месте, 🟨 Желтый — буква есть, но не там, ⬛ Серый — буквы нет.</li>
                <li><strong>Видеть всё:</strong> Вы не одни. На экране отображается «поток» попыток ваших соперников в реальном времени. Вы видите, как они ошибаются и как близко подошли к разгадке.</li>
                <li><strong>Скорость решает:</strong> Побеждает тот, кто первым введет правильное слово. Каждая секунда и каждая попытка на счету!</li>
            </ul>
        `,
        stats: { players: '1-8', time: '3-10 мин', difficulty: 'Средняя' },
        rules: [
            { icon: 'bi-spellcheck', text: 'Словарь из тысяч русских слов' },
            { icon: 'bi-eye-fill', text: 'Следите за прогрессом врагов LIVE' },
            { icon: 'bi-keyboard', text: 'Удобная кастомная клавиатура' },
            { icon: 'bi-trophy-fill', text: 'Рейтинг по скорости отгадывания' }
        ],
        gallery: [
            {
                type: 'html',
                label: 'Поток битвы (Live)',
                content: `
                    <div class="wc-stream-demo p-3 rounded-4" style="background: #1e2a3a; border: 1px solid rgba(255,255,255,0.1);">
                        <div class="wc-guess-row d-flex align-items-center gap-3 mb-3">
                            <div class="position-relative">
                                <img src="https://api.dicebear.com/7.x/bottts/svg?seed=1" class="rounded-circle border border-2 border-white border-opacity-25" style="width:40px; height:40px; background:#333;">
                                <span class="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-warning text-dark" style="font-size:10px;">+10</span>
                            </div>
                            <div class="d-flex gap-1">
                                <div class="rounded-2 d-flex align-items-center justify-content-center fw-bold text-white shadow-sm" style="width:36px; height:36px; background:#6aaa64; font-size:18px;">А</div>
                                <div class="rounded-2 d-flex align-items-center justify-content-center fw-bold text-white shadow-sm" style="width:36px; height:36px; background:#6aaa64; font-size:18px;">Р</div>
                                <div class="rounded-2 d-flex align-items-center justify-content-center fw-bold text-white shadow-sm" style="width:36px; height:36px; background:#6aaa64; font-size:18px;">Б</div>
                                <div class="rounded-2 d-flex align-items-center justify-content-center fw-bold text-white shadow-sm" style="width:36px; height:36px; background:#6aaa64; font-size:18px;">У</div>
                                <div class="rounded-2 d-flex align-items-center justify-content-center fw-bold text-white shadow-sm" style="width:36px; height:36px; background:#6aaa64; font-size:18px;">З</div>
                            </div>
                        </div>
                        <div class="wc-guess-row d-flex align-items-center gap-3 opacity-75">
                            <img src="https://api.dicebear.com/7.x/bottts/svg?seed=2" class="rounded-circle border border-2 border-white border-opacity-10" style="width:40px; height:40px; background:#333;">
                            <div class="d-flex gap-1">
                                <div class="rounded-2 d-flex align-items-center justify-content-center fw-bold text-white shadow-sm" style="width:36px; height:36px; background:#787c7e; font-size:18px;">П</div>
                                <div class="rounded-2 d-flex align-items-center justify-content-center fw-bold text-white shadow-sm" style="width:36px; height:36px; background:#c9b458; font-size:18px;">И</div>
                                <div class="rounded-2 d-flex align-items-center justify-content-center fw-bold text-white shadow-sm" style="width:36px; height:36px; background:#787c7e; font-size:18px;">Р</div>
                                <div class="rounded-2 d-flex align-items-center justify-content-center fw-bold text-white shadow-sm" style="width:36px; height:36px; background:#787c7e; font-size:18px;">О</div>
                                <div class="rounded-2 d-flex align-items-center justify-content-center fw-bold text-white shadow-sm" style="width:36px; height:36px; background:#787c7e; font-size:18px;">Г</div>
                            </div>
                        </div>
                    </div>
                `
            },
            {
                type: 'html',
                label: 'Как читать подсказки',
                content: `
                    <div class="wc-legend-demo p-3 rounded-4" style="background: #1e2a3a; border: 1px solid rgba(255,255,255,0.1);">
                        <div class="d-flex align-items-center gap-3 mb-3">
                            <div class="rounded-2 d-flex align-items-center justify-content-center fw-bold text-white shadow-sm" style="min-width:40px; width:40px; height:40px; background:#6aaa64; font-size:20px;">П</div>
                            <div class="flex-grow-1">
                                <div class="fw-black text-white small text-uppercase" style="letter-spacing: 0.5px;">Верное место</div>
                                <div class="text-white-50" style="font-size:11px; line-height: 1.2;">Буква стоит именно там, где нужно.</div>
                            </div>
                        </div>
                        <div class="d-flex align-items-center gap-3 mb-3">
                            <div class="rounded-2 d-flex align-items-center justify-content-center fw-bold text-white shadow-sm" style="min-width:40px; width:40px; height:40px; background:#c9b458; font-size:20px;">Л</div>
                            <div class="flex-grow-1">
                                <div class="fw-black text-white small text-uppercase" style="letter-spacing: 0.5px;">Есть в слове</div>
                                <div class="text-white-50" style="font-size:11px; line-height: 1.2;">Буква есть, но на другой позиции.</div>
                            </div>
                        </div>
                        <div class="d-flex align-items-center gap-3">
                            <div class="rounded-2 d-flex align-items-center justify-content-center fw-bold text-white shadow-sm" style="min-width:40px; width:40px; height:40px; background:#787c7e; font-size:20px;">О</div>
                            <div class="flex-grow-1">
                                <div class="fw-black text-white small text-uppercase" style="letter-spacing: 0.5px;">Нет в слове</div>
                                <div class="text-white-50" style="font-size:11px; line-height: 1.2;">Этой буквы в загаданном слове нет.</div>
                            </div>
                        </div>
                    </div>
                `
            },
            {
                type: 'html',
                label: 'Ввод слова',
                content: `
                    <div class="p-3 rounded-4" style="background: #1e2a3a; border: 1px solid rgba(255,255,255,0.1);">
                        <div class="d-flex justify-content-center gap-1 mb-3">
                            <div class="rounded-3 border-2 border border-white border-opacity-25 d-flex align-items-center justify-content-center fw-bold text-white" style="width:44px; height:44px; background:rgba(255,255,255,0.05); font-size:24px;">С</div>
                            <div class="rounded-3 border-2 border border-white border-opacity-25 d-flex align-items-center justify-content-center fw-bold text-white" style="width:44px; height:44px; background:rgba(255,255,255,0.05); font-size:24px;">Л</div>
                            <div class="rounded-3 border-2 border border-white border-opacity-25 d-flex align-items-center justify-content-center fw-bold text-white" style="width:44px; height:44px; background:rgba(255,255,255,0.05); font-size:24px;">О</div>
                            <div class="rounded-3 border-2 border border-white border-opacity-25 d-flex align-items-center justify-content-center fw-bold text-white" style="width:44px; height:44px; background:rgba(255,255,255,0.05); font-size:24px;">В</div>
                            <div class="rounded-3 border-2 border border-white border-opacity-10 d-flex align-items-center justify-content-center fw-bold text-white-50" style="width:44px; height:44px; background:rgba(255,255,255,0.02); font-size:24px;">_</div>
                        </div>
                        <div class="d-grid gap-1" style="grid-template-columns: repeat(11, 1fr);">
                            ${['Й', 'Ц', 'У', 'К', 'Е', 'Н', 'Г', 'Ш', 'Щ', 'З', 'Х'].map(l => `<div class="rounded-1 text-white x-small d-flex align-items-center justify-content-center py-1" style="background:rgba(255,255,255,0.1); font-size:10px;">${l}</div>`).join('')}
                        </div>
                    </div>
                `
            },
            {
                type: 'html',
                label: 'Победа!',
                content: `
                    <div class="p-3 rounded-4 shadow text-center" style="background: rgba(30, 42, 58, 0.95); border: 2px solid #6aaa64; color: white;">
                        <div class="fs-1 mb-2">🏆</div>
                        <div class="fw-bold h6 mb-1">ТЫ ЧЕМПИОН!</div>
                        <div class="x-small opacity-50 mb-3">Слово угадано за 4 попытки</div>
                        <div class="p-2 rounded-3 mb-2" style="background: rgba(255,255,255,0.05);">
                            <div class="x-small opacity-50 text-uppercase mb-1" style="font-size:9px;">Загаданное слово</div>
                            <div class="h5 fw-black text-success" style="letter-spacing:4px; margin-bottom:0;">АРБУЗ</div>
                        </div>
                    </div>
                `
            }
        ],
        files: ['js/games/wordclash/index.js', 'js/games/wordclash/ui.js', 'server/games/packs/wordclash/words.json']
    },
    {
        id: 'tictactoe',
        category: 'strategy',
        name: 'Крестики-Нолики',
        icon: 'bi-x-lg',
        color: '#FFD93D',
        bgColor: '#FFFBEB',
        promoImage: '',
        description: 'Классическая битва умов.',
        longDescription: `
            <p><strong>Крестики-Нолики</strong> — это нестареющая классика в современном исполнении. Самая быстрая и понятная игра для двоих, которая проверит вашу внимательность и умение просчитывать ходы оппонента наперед.</p>
            <p><strong>Особенности версии:</strong></p>
            <ul>
                <li><strong>Умный Бот:</strong> Если друга нет рядом, попробуйте обыграть нашего AI. Он не прощает ошибок на сложном уровне!</li>
                <li><strong>Система рангов:</strong> Каждая победа приносит XP и приближает вас к званию Гроссмейстера крестиков.</li>
                <li><strong>Мгновенная игра:</strong> Никаких лишних настроек — зашли, походили, победили.</li>
            </ul>
        `,
        stats: { players: '2', time: '1-3 мин', difficulty: 'Легкая' },
        rules: [
            { icon: 'bi-grid-3x3', text: 'Поле 3х3: классика жанра' },
            { icon: 'bi-robot', text: 'Три уровня сложности бота' },
            { icon: 'bi-lightning-fill', text: 'Мгновенные матчи без лагов' },
            { icon: 'bi-trophy-fill', text: 'Глобальная таблица рекордов' }
        ],
        gallery: [
            {
                type: 'html',
                label: 'Победная комбинация',
                content: `
                    <div class="p-3 rounded-4 shadow-sm" style="background: var(--bg-card); border: 1px solid var(--border-main);">
                        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; width: 120px; margin: 0 auto;">
                            <div class="p-2 text-white rounded-3 d-flex align-items-center justify-content-center fw-bold" style="background: var(--primary-color); aspect-ratio:1; font-size:24px;">X</div>
                            <div class="p-2 rounded-3" style="background: var(--bg-secondary); aspect-ratio:1;"></div>
                            <div class="p-2 rounded-3" style="background: var(--bg-secondary); aspect-ratio:1;"></div>
                            <div class="p-2 rounded-3" style="background: var(--bg-secondary); aspect-ratio:1;"></div>
                            <div class="p-2 text-white rounded-3 d-flex align-items-center justify-content-center fw-bold" style="background: var(--primary-color); aspect-ratio:1; font-size:24px;">X</div>
                            <div class="p-2 rounded-3" style="background: var(--bg-secondary); aspect-ratio:1;"></div>
                            <div class="p-2 rounded-3" style="background: var(--bg-secondary); aspect-ratio:1;"></div>
                            <div class="p-2 rounded-3" style="background: var(--bg-secondary); aspect-ratio:1;"></div>
                            <div class="p-2 text-white rounded-3 d-flex align-items-center justify-content-center fw-bold" style="background: var(--primary-color); aspect-ratio:1; font-size:24px;">X</div>
                        </div>
                    </div>
                `
            }
        ],
        files: [
            'js/games/tictactoe/tictactoe.css',
            'js/games/tictactoe/ui.js',
            'js/games/tictactoe/bot.js',
            'js/games/tictactoe/index.js'
        ]
    },
    {
        id: 'spyfall',
        category: 'party',
        name: 'Шпион',
        icon: 'bi-incognito',
        color: '#E74C3C',
        bgColor: '#FDEDEC',
        promoImage: '',
        description: 'Найди шпиона среди своих!',
        longDescription: `
            <p><strong>Шпион</strong> — это разговорная игра для компании. Кто-то из вас шпион, а остальные — обычные люди в секретной локации.</p>
            <p><strong>Как играть:</strong></p>
            <ul>
                <li><strong>Локация:</strong> Все, кроме шпиона, видят тайную локацию, в которой они находятся (например, "Школа" или "Пиратский корабль").</li>
                <li><strong>Вопросы:</strong> Игроки по очереди задают друг другу один наводящий вопрос о локации. Цель мирных — вычислить, кто задает странные вопросы. Цель шпиона — понять, где все находятся.</li>
                <li><strong>Развязка:</strong> Если таймер истек или игроки решили проголосовать, выбирается подозреваемый. Шпион также может в любой момент остановить игру, если догадался, что это за локация!</li>
            </ul>
        `,
        stats: { players: '3-10', time: '8-15 мин', difficulty: 'Средняя' },
        rules: [
            { icon: 'bi-chat-left-dots', text: 'Задавайте обтекаемые вопросы' },
            { icon: 'bi-search', text: 'Внимательно слушайте ответы других' },
            { icon: 'bi-hand-index-thumb', text: 'Голосуйте за самого подозрительного' },
            { icon: 'bi-pin-map', text: 'Шпион может победить, угадав локацию!' }
        ],
        gallery: [
            {
                type: 'html',
                label: 'Роль',
                content: `
                    <div class="p-3 rounded-4 shadow-sm text-center" style="background: var(--bg-card); border: 1px solid var(--border-main);">
                        <div style="font-size:40px; color:var(--primary-color);"><i class="bi bi-geo-alt-fill"></i></div>
                        <div class="h5 fw-bold mt-2">Космическая станция</div>
                        <div class="small text-muted mt-1">Твоя роль: Механик</div>
                    </div>
                `
            }
        ],
        files: [
            'css/games/spyfall.css',
            'js/games/spyfall/ui.js',
            'js/games/spyfall/index.js'
        ],
        renderFunction: 'render_spyfall'
    },
    {
        id: 'minesweeper_br',
        category: 'logic',
        name: 'Сапёр Battle Royale',
        icon: 'bi-patch-exclamation-fill',
        color: '#2C3E50',
        bgColor: '#EBEDEF',
        description: 'Пошаговая дуэль на минном поле — думай или взлетай!',
        longDescription: `
            <p><strong>Сапёр Battle Royale</strong> — это легендарная головоломка, превращённая в пошаговое соревнование. Теперь вы не просто чистите поле, а боретесь за каждую клетку с друзьями.</p>
            <p><strong>Как проходит матч:</strong></p>
            <ul>
                <li><strong>Пошаговая тактика:</strong> Игроки ходят по очереди. Каждый клик — это ваш единственный шанс заработать очки или всё потерять.</li>
                <li><strong>Честная логика:</strong> Поле генерируется так, что его всегда можно решить без угадывания. Если вы взорвались — значит, где-то просчитались.</li>
                <li><strong>Прожимание (Chording):</strong> Расставляйте флажки на мины и открывайте соседние клетки одним кликом — рискованно, но это может принести огромное преимущество.</li>
                <li><strong>Наказание за ошибки:</strong> Подрыв на мине отнимает очки и оглушает на 1 ход. Противники получат шанс вырваться вперёд!</li>
            </ul>
        `,
        stats: { players: '2-8', time: '5-15 мин', difficulty: 'Высокая' },
        rules: [
            { icon: 'bi-shield-check', text: 'Поле всегда решается чистой логикой' },
            { icon: 'bi-crosshair', text: 'Каждый клик — стратегическое решение' },
            { icon: 'bi-lightning-fill', text: 'Подрыв на мине оглушает на 1 ход' },
            { icon: 'bi-trophy-fill', text: 'Побеждает тот, кто наберёт больше очков' }
        ],
        gallery: [
            {
                type: 'html',
                label: 'Игровое поле',
                content: `
                    <div class="p-3 rounded-4 shadow-sm" style="background: var(--bg-card); border: 1px solid var(--border-main);">
                        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; width: 140px; margin: 0 auto;">
                            <div class="rounded-1 d-flex align-items-center justify-content-center fw-bold" style="background: rgba(var(--primary-rgb), 0.1); color: var(--primary-color); aspect-ratio:1;">1</div>
                            <div class="rounded-1" style="background: var(--bg-secondary); aspect-ratio:1; border: 1px solid var(--border-main);"></div>
                            <div class="rounded-1" style="background: var(--bg-secondary); aspect-ratio:1; border: 1px solid var(--border-main);"></div>
                            <div class="rounded-1" style="background: var(--bg-secondary); aspect-ratio:1; border: 1px solid var(--border-main);"></div>
                            <div class="rounded-1 d-flex align-items-center justify-content-center fw-bold" style="background: rgba(var(--primary-rgb), 0.1); color: var(--primary-color); aspect-ratio:1;">2</div>
                            <div class="rounded-1 d-flex align-items-center justify-content-center fw-bold" style="background: #e74c3c; color: white; aspect-ratio:1;"><i class="bi bi-flag-fill"></i></div>
                            <div class="rounded-1 d-flex align-items-center justify-content-center fw-bold" style="background: rgba(var(--primary-rgb), 0.1); color: var(--primary-color); aspect-ratio:1;">1</div>
                            <div class="rounded-1" style="background: var(--bg-secondary); aspect-ratio:1; border: 1px solid var(--border-main);"></div>
                        </div>
                    </div>
                `
            }
        ],
        files: [
            'css/games/minesweeper.css',
            'js/games/minesweeper/ui.js',
            'js/games/minesweeper/index.js'
        ],
        renderFunction: 'render_minesweeper_br'
    },
    {
        id: 'backgammon_game',
        category: 'logic',
        name: 'Длинные Нарды',
        icon: 'bi-dice-5',
        color: '#8b5a2b',
        bgColor: '#fdf2e9',
        description: 'Классические Длинные Нарды.',
        longDescription: `
            <p><strong>Длинные нарды</strong> — классическая настольная игра для двух игроков на логику и стратегию.</p>
        `,
        stats: { players: '2', time: '10-20 мин', difficulty: 'Средняя' },
        rules: [
            { icon: 'bi-dice-5', text: '15 фишек, бросок кубиков определяет ход' },
            { icon: 'bi-arrow-clockwise', text: 'Движение строго против часовой стрелки' },
            { icon: 'bi-slash-circle', text: 'Запрещено выбивать чужие фишки' }
        ],
        gallery: [],
        css: ['css/games/backgammon.css'],
        files: [
            'js/games/backgammon/logic.js',
            'js/games/backgammon/ui.js',
            'js/games/backgammon/index.js'
        ],
        renderFunction: 'render_backgammon_game'
    }
];

// export const GAMES_CONFIG = window.AVAILABLE_GAMES;
