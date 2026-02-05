/**
 * Game Configuration Module
 * Contains static definitions for all available games.
 */

window.AVAILABLE_GAMES = [
    {
        id: 'bunker',
        name: 'Бункер',
        icon: 'bi-shield-check',
        color: '#E67E22',
        bgColor: '#FDF2E9',
        promoImage: 'assets/promo/bunker.jpg',
        description: 'Дискуссионная игра о выживании.',
        longDescription: `
            <p>Планета охвачена катастрофой. У вас есть шанс спастись в защищенном бункере, но места на всех не хватит. Это не просто игра, это проверка вашей способности убеждать, манипулировать и работать в команде.</p>
            <p><strong>Ваш Персонаж:</strong> Каждый игрок получает уникальный набор характеристик — «Карты Жизни». Ваша профессия, состояние здоровья, багаж и даже странные хобби могут стать как билетом к спасению, так и причиной вашего изгнания.</p>
            <p>В этой игре нет правильных ответов, есть только ваша харизма и умение плести интриги. Будете ли вы честным врачом или хитрым политиком? Решать только вам.</p>
        `,
        stats: { players: '4-16', time: '30-60 мин', difficulty: 'Средняя' },
        rules: [
            { icon: 'bi-people-fill', text: 'Убедите других, что вы полезны' },
            { icon: 'bi-exclamation-triangle', text: 'Скрывайте свои слабые стороны' },
            { icon: 'bi-door-closed', text: 'Голосуйте, кто не попадет в бункер' }
        ],
        gallery: [
            {
                type: 'html',
                content: `
                    <div class="p-2 rounded-4 mb-3" style="background:var(--bg-app); border:1px solid var(--border-main);">
                         <div class="text-center mb-2" style="font-weight:bold; color:var(--text-main); font-size:11px; letter-spacing:1px;">ГЛОУБ АЛЬТ: ГОЛОСОВАНИЕ</div>
                         <div class="d-flex justify-content-center gap-2 mb-1">
                            <div style="width:28px; height:28px; background:#e74c3c; border-radius:50%; color:white; text-align:center; line-height:28px; font-size:12px;">✖</div>
                            <div style="width:28px; height:28px; background:var(--bg-secondary); border-radius:50%;"></div>
                            <div style="width:28px; height:28px; background:var(--bg-secondary); border-radius:50%;"></div>
                         </div>
                         <div class="text-center x-small opacity-50 mt-1" style="color:var(--text-muted);">Решим, кто покинет убежище</div>
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
        name: 'Мозговая Битва',
        icon: 'bi-lightbulb-fill',
        color: '#9B59B6',
        bgColor: '#F4ECF7',
        promoImage: 'assets/promo/brainbattle.jpg',
        description: 'Динамичный турнир из быстрых мини-игр!',
        longDescription: `
            <p>Забудьте о скучных викторинах. «Мозговая Битва» — это аттракцион для вашего ума! Мы собрали лучшие механики на проверку скорости реакции, логического мышления и математической интуиции в одном приложении.</p>
            <p>Игра идеально подходит как для большой компании, так и для одиночной тренировки мозга. Соревнуйтесь в реальном времени, зарабатывайте баллы и докажите, что ваш интеллект достоин звания гроссмейстера вечеринок!</p>
        `,
        stats: { players: '1-8', time: '5-15 мин', difficulty: 'Легкая' },
        rules: [
            { icon: 'bi-lightning-charge', text: 'Мини-игры на любой вкус' },
            { icon: 'bi-stopwatch', text: 'Каждая секунда на счету' },
            { icon: 'bi-graph-up-arrow', text: 'Рост сложности со временем' }
        ],
        gallery: [
            {
                type: 'html',
                content: `
                    <div class="p-3 rounded-4 mb-3" style="background: var(--bg-glass); border: 1px dashed var(--primary-color);">
                        <div class="text-center mb-2" style="font-weight: bold; color: var(--primary-color); font-size: 11px; letter-spacing: 1px;">ЛОГИКА (LOGIC)</div>
                        <div class="d-flex justify-content-center">
                            <div class="p-3 rounded-3 shadow-sm text-center" style="width: 100%; background:var(--bg-card);">
                                <div style="font-size:14px; color: var(--text-muted); margin-bottom: 5px;">Цветовая ловушка</div>
                                <div style="font-size:24px; font-weight:bold; color: #e74c3c;">СИНИЙ</div>
                                <div style="font-size:11px; color: var(--primary-color);">(Нажми на цвет текста)</div>
                            </div>
                        </div>
                    </div>
                `
            },
            {
                type: 'html',
                content: `
                    <div class="p-3 rounded-4 mb-3" style="background: var(--bg-glass); border: 1px dashed var(--primary-color);">
                        <div class="text-center mb-2" style="font-weight: bold; color: var(--primary-color); font-size: 11px; letter-spacing: 1px;">ВНИМАНИЕ (ATTENTION)</div>
                        <div class="p-3 rounded-3 shadow-sm text-center" style="background:var(--bg-card);">
                            <div style="font-size:14px; color: var(--text-muted); margin-bottom: 8px;">Матрица: Найди пару</div>
                            <div class="d-flex justify-content-center gap-2">
                                <div style="width:30px; height:30px; background:var(--primary-color); border-radius:6px; color:var(--text-on-accent); display:flex; align-items:center; justify-content:center;"><i class="bi bi-star-fill"></i></div>
                                <div style="width:30px; height:30px; background:var(--bg-secondary); border-radius:6px;"></div>
                                <div style="width:30px; height:30px; background:var(--primary-color); border-radius:6px; color:var(--text-on-accent); display:flex; align-items:center; justify-content:center;"><i class="bi bi-star-fill"></i></div>
                            </div>
                        </div>
                    </div>
                `
            },
            {
                type: 'html',
                content: `
                    <div class="p-3 rounded-4 mb-3" style="background: var(--bg-glass); border: 1px dashed var(--primary-color);">
                        <div class="text-center mb-2" style="font-weight: bold; color: var(--primary-color); font-size: 11px; letter-spacing: 1px;">РЕАКЦИЯ (MOTOR)</div>
                        <div class="d-flex flex-column align-items-center p-3 rounded-3 shadow-sm" style="background:var(--bg-card);">
                            <div style="width:50px; height:50px; background:#2ecc71; border-radius:50%; display:flex; align-items:center; justify-content:center; color:white; font-size:20px;">
                                <i class="bi bi-cursor-fill"></i>
                            </div>
                            <div style="font-size:12px; margin-top:8px; font-weight: bold; color: #2ecc71;">ЖМИ СЕЙЧАС!</div>
                        </div>
                    </div>
                `
            },
            {
                type: 'html',
                content: `
                    <div class="p-3 rounded-4 mb-3" style="background: var(--bg-glass); border: 1px dashed var(--primary-color);">
                        <div class="text-center mb-2" style="font-weight: bold; color: var(--primary-color); font-size: 11px; letter-spacing: 1px;">РЕЗУЛЬТАТЫ БИТВЫ</div>
                        <div class="small p-2 rounded-3" style="background:var(--bg-card); color:var(--text-main);">
                            <div class="d-flex justify-content-between border-bottom py-1" style="border-color:var(--border-main) !important;"><span>1. Алексей</span><span class="fw-bold text-success">1450</span></div>
                            <div class="d-flex justify-content-between border-bottom py-1" style="border-color:var(--border-main) !important;"><span>2. Мария</span><span class="fw-bold">1200</span></div>
                            <div class="d-flex justify-content-between py-1"><span>3. Вы</span><span class="fw-bold text-primary">1180</span></div>
                        </div>
                    </div>
                `
            }
        ],
        files: ['js/games/brainbattle.js']
    },
    {
        id: 'whoami',
        name: 'Кто из нас?',
        icon: 'bi-question-circle-fill',
        color: '#1ABC9C',
        bgColor: '#E8F8F5',
        promoImage: 'assets/promo/whoami.jpg',
        description: 'Раскройте все секреты вашей компании!',
        longDescription: `
            <p>«Кто из нас?» — это игра, которая превращает обычную посиделку в вечер откровений и безудержного смеха. Правила элементарны: ведущий зачитывает провокационный или забавный вопрос, а все остальные анонимно голосуют за того, кто больше всего подходит под описание.</p>
            <p>«Кто из нас чаще всего забывает ключи?» или «Кто из нас мог бы стать секретным агентом?» — вопросы варьируются от невинных до по-настоящему острых. Это лучший способ узнать, что друзья думают о вас на самом деле.</p>
            <p>Никаких обид, только юмор и искренность. Самое интересное начинается после подсчета голосов!</p>
        `,
        stats: { players: '3-20', time: '10-30 мин', difficulty: 'Легкая' },
        rules: [
            { icon: 'bi-chat-heart', text: 'Необычные и смешные вопросы' },
            { icon: 'bi-people-fill', text: 'Голосуйте за своих друзей' },
            { icon: 'bi-incognito', text: 'Полная анонимность выбора' }
        ],
        gallery: [
            {
                type: 'html',
                content: `
                    <div class="p-3 rounded-4 mb-3" style="background: var(--bg-card); border:1px solid var(--border-main); text-align:center; color:var(--text-main);">
                        <div style="font-size:14px; font-weight:bold; color:var(--primary-color); margin-bottom:8px;">КТО ИЗ НАС...</div>
                        <div style="font-size:16px; font-style:italic;">Будет первым, кто предложит заказать пиццу в 3 часа ночи?</div>
                    </div>
                `
            }
        ],
        files: ['js/games/whoami.js']
    },
    {
        id: 'blokus',
        name: 'Blokus',
        icon: 'bi-grid-3x3',
        color: '#3498db',
        bgColor: '#ebf5fb',
        promoImage: 'assets/promo/blockus.jpg',
        description: 'Легендарная абстрактная стратегия.',
        longDescription: `
            <p>Blokus — это математически выверенная битва за пространство. У каждого игрока есть набор из 21 фигуры разной формы. Ваша цель проста: выставить как можно больше фигур на поле 20x20.</p>
            <p>Уникальность игры в её единственном правиле размещения: каждая новая фигура вашего цвета должна соприкасаться с вашей же фигурой хотя бы одним углом. Касаться гранями (сторонами) — запрещено.</p>
            <p>Постепенно поле заполняется, и ваша задача — не только расширять свою территорию, но и блокировать пути наступления противников. Это идеальное сочетание глубины шахмат и простоты тетриса.</p>
        `,
        stats: { players: '2-4', time: '15-25 мин', difficulty: 'Высокая' },
        rules: [
            { icon: 'bi-bounding-box', text: 'Захват территории поля' },
            { icon: 'bi-node-plus', text: 'Правило касания только углами' },
            { icon: 'bi-slash-circle', text: 'Блокируйте пути врагам' }
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
        name: 'Битва Слов',
        icon: 'bi-fonts',
        color: '#6aaa64',
        bgColor: '#e8f5e9',
        promoImage: 'assets/promo/wordclash.jpg',
        description: 'Найдите секретное слово быстрее всех!',
        longDescription: `
            <p>Любите ли вы головоломки так, как любим их мы? «Битва Слов» — это соревновательная версия классических словесных игр. Ваша задача — отгадать загаданное слово из 5 букв за ограниченное количество попыток.</p>
            <p>Каждое введенное слово дает подсказку: зеленые буквы стоят на своих местах, желтые — есть в слове, но в другой позиции, а серые отсутствуют вовсе. Но помните, время — ваш главный враг. Каждый участник видит прогресс друг друга, что превращает игру в настоящую интеллектуальную гонку.</p>
            <p>Используйте логику, словарный запас и интуицию, чтобы стать мастером лингвистических сражений!</p>
        `,
        stats: { players: '1-8', time: '3-10 мин', difficulty: 'Средняя' },
        rules: [
            { icon: 'bi-keyboard-fill', text: 'Вводите только настоящие слова' },
            { icon: 'bi-palette2', text: 'Следите за цветом букв' },
            { icon: 'bi-trophy-fill', text: 'Побеждает самый быстрый' }
        ],
        gallery: [
            {
                type: 'html',
                label: 'Зеленый: Правильное место',
                content: `
                    <div class="word-demo-row mb-3">
                        <div class="word-tile tile-correct" style="width: 44px; height: 44px;">Б</div>
                        <div class="word-tile tile-absent" style="width: 44px; height: 44px;">У</div>
                        <div class="word-tile tile-absent" style="width: 44px; height: 44px;">К</div>
                        <div class="word-tile tile-absent" style="width: 44px; height: 44px;">В</div>
                        <div class="word-tile tile-absent" style="width: 44px; height: 44px;">А</div>
                    </div>
                `
            },
            {
                type: 'html',
                label: 'Желтый: Буква есть, но не там',
                content: `
                    <div class="word-demo-row mb-3">
                        <div class="word-tile tile-absent" style="width: 44px; height: 44px;">С</div>
                        <div class="word-tile tile-present" style="width: 44px; height: 44px;">Л</div>
                        <div class="word-tile tile-absent" style="width: 44px; height: 44px;">О</div>
                        <div class="word-tile tile-absent" style="width: 44px; height: 44px;">В</div>
                        <div class="word-tile tile-absent" style="width: 44px; height: 44px;">О</div>
                    </div>
                `
            }
        ],
        files: ['js/games/wordclash/index.js']
    }
];

// export const GAMES_CONFIG = window.AVAILABLE_GAMES; // Removed for sync loading
