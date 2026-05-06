# Party Battle Import Sources

Этот файл описывает внешние базы, которые имеет смысл использовать как сырье для локального импорта в canonical Party Battle packs.

Правило:

- внешний сайт нужен только для единоразовой выгрузки;
- runtime проекта не должен зависеть от доступности источника;
- после выгрузки данные импортируются в `server/games/packs/partybattle/*` и коммитятся в репозиторий.

## Приоритетные русские текстовые базы

### 1. Kaggle: Jokes in Russian Dataset (500K+)

- URL: `https://www.kaggle.com/datasets/dokster/jokes-in-russian-dataset-500k`
- Формат: `txt`, одна шутка на строку
- Импортер: `format=lines`
- Подходит для:
  - `joke/base`
  - `meme/base`
  - тематических `meme/*` после ручной фильтрации
- Риск:
  - много мусора, повторы, не все строки годятся как prompt

### 2. Kaggle: Russian Jokes Dataset

- URL: `https://www.kaggle.com/datasets/darkl1ght/russian-jokes-dataset`
- Формат: табличный датасет, обычно `csv`
- Импортер: `format=csv`, поле чаще всего `text`
- Подходит для:
  - `joke/base`
  - `advice/base` после фильтрации
  - `meme/base` после отбора коротких prompt-like строк
- Плюс:
  - большой объем

### 3. Hugging Face: IgorVolochay/russian_jokes

- URL: `https://huggingface.co/datasets/IgorVolochay/russian_jokes`
- Форматы: `dataset.csv`, `dataset.json`, `dataset.txt`
- Импортер:
  - `format=csv`, поле `text`
  - или `format=lines` для `dataset.txt`
- Подходит для:
  - `joke/base`
  - `advice/base`
  - `meme/base` после дополнительного отбора
- Плюс:
  - удобный локальный экспорт

### 4. Hugging Face: samedad/mem-and-russian-jokes-dataset

- URL: `https://huggingface.co/datasets/samedad/mem-and-russian-jokes-dataset`
- Формат: conversations-like JSON/parquet
- Импортер:
  - если экспортирован в JSON conversations, `format=hf_conversations_json`
- Подходит для:
  - `joke/base`
  - `meme/base`
- Плюс:
  - уже ближе к короткому humorous-style контенту

### 5. Hugging Face: gorovuha/CleanComedy

- URL: `https://huggingface.co/datasets/gorovuha/CleanComedy`
- Использование:
  - скорее как reference / cleaner source
  - для более безопасного и менее токсичного backfill
- Подходит для:
  - `joke/base`
  - `advice/base`

### 6. Hugging Face: samedad/mem-and-russian-jokes-dataset

- URL: `https://huggingface.co/datasets/samedad/mem-and-russian-jokes-dataset`
- Формат: parquet / conversations-style
- Импортер:
  - после локального экспорта в JSON можно использовать `format=hf_conversations_json`
- Подходит для:
  - `joke/base`
  - `meme/base`
- Плюс:
  - 522k строк
  - MIT license
- Риск:
  - нужен отдельный отбор по коротким prompt-like строкам

## Дополнительные полезные базы

### 7. Hugging Face: nyuuzyou/ru-QnA-333K

- URL: `https://huggingface.co/datasets/nyuuzyou/ru-QnA-333K`
- Формат: parquet
- Подходит не для шуток, а как сырье для:
  - `advice`
  - `whoami`-style question prompts
  - общих проблемных ситуаций и вопросных формулировок
- Плюс:
  - 333k русских вопросов
- Риск:
  - много серьезных и неигровых категорий, нужен сильный отбор

### 8. Hugging Face: gorovuha/CleanComedyGold

- URL: `https://huggingface.co/datasets/gorovuha/CleanComedyGold`
- Использование:
  - не как основной bulk-source
  - а как более качественный ручной reference set
- Подходит для:
  - проверки наших эвристик
  - сравнения качества отобранных joke-candidates

## Базы для фильтрации, а не для прямого импорта

### 9. Hugging Face: Mikimi/MultiLingvAllToxic

- URL: `https://huggingface.co/datasets/Mikimi/MultiLingvAllToxic`
- Использование:
  - источник токсичных паттернов и дополнительного blacklist
  - не источник игрового контента

### 10. Hugging Face: Mnwa/russian-toxic

- URL: `https://huggingface.co/datasets/Mnwa/russian-toxic`
- Использование:
  - дополнительная база для расширения анти-токсичных фильтров
  - не для прямого импорта в Party Battle

### 11. Hugging Face: Onidle/ru-merged-toxic-comments

- URL: `https://huggingface.co/datasets/Onidle/ru-merged-toxic-comments`
- Использование:
  - полезно для усиления blacklist/детектора нежелательного текста
  - не для прямого импорта

## Что не тащить вслепую

### GIPHY / Tenor

- годятся для поиска и отбора GIF;
- не годятся как надежная готовая canonical база без локального curating;
- для `caption` и `meme` visual-packs нужен локальный curated manifest ссылок или локальные assets.

### Open Trivia DB

- подходит как источник trivia/fact prompts;
- не русскоязычный по умолчанию;
- может пригодиться позже для генерации `bluff`-фактов, но не для прямого слепого импорта.

### ruVQA / question-answer corpora без бытового юмора

- например `MERA-evaluation/ruVQA`;
- полезны для image-question задач, но не дают Party Battle-ready шуток или prompts;
- можно использовать только точечно, не как основной источник.

## Рекомендуемый порядок импорта

1. `joke/base`
2. `advice/base`
3. `meme/base`
4. тематические `meme/*` и `joke/advice/*`
5. потом уже отдельный curated pipeline для `caption`

## Практический shortlist на сейчас

Если идти без лишней распыленности, я бы работал в таком порядке:

1. `russian_jokes.txt` как bulk-source для `joke`
2. `CleanComedy` как cleaner/reference source
3. `ru-QnA-333K` как отдельный кандидат под `advice`
4. `mem-and-russian-jokes-dataset` как дополнительный источник для `meme`
