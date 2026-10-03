# Party Battle Import Sources

Этот файл описывает внешние базы, которые имеет смысл использовать как сырье для локального импорта в canonical Party Battle packs.

Правило:

- внешний сайт нужен только для единоразовой выгрузки;
- runtime проекта не должен зависеть от доступности источника;
- после выгрузки данные импортируются в `server/games/packs/partybattle/*` и коммитятся в репозиторий.

## Роль источников

Основной pipeline задаёт [content strategy](partybattle_content_strategy.md): `bluff` — facts import + curation, `advice` — situations + rewrite/review, `whoami` — curated social prompts, `joke/meme` — generation/curation-first, `caption` — visual curation.

Каталог ниже — кандидаты сырья, не готовые runtime packs и не подтверждение актуального формата/лицензии внешней выгрузки. Проверять экспорт и условия использования перед новым импортом. Joke corpora могут служить reference для ручной трансформации; blind bulk-import в joke/meme не является рекомендуемым путём.

## Русские текстовые базы для reference/curation

### 1. Kaggle: Jokes in Russian Dataset (500K+)

- URL: `https://www.kaggle.com/datasets/dokster/jokes-in-russian-dataset-500k`
- Формат: `txt`, одна шутка на строку
- Импортер: `format=lines`
- Роль: reference/raw premises для ручного переписывания; не прямой canonical импорт готовых шуток в `joke/meme/advice`.
- Риск:
  - много мусора, повторы, не все строки годятся как prompt

### 2. Kaggle: Russian Jokes Dataset

- URL: `https://www.kaggle.com/datasets/darkl1ght/russian-jokes-dataset`
- Формат: табличный датасет, обычно `csv`
- Импортер: `format=csv`, поле чаще всего `text`
- Роль: reference/raw premises для ручного переписывания; не прямой canonical импорт готовых шуток в `joke/meme/advice`.
- Плюс:
  - большой объем

### 3. Hugging Face: IgorVolochay/russian_jokes

- URL: `https://huggingface.co/datasets/IgorVolochay/russian_jokes`
- Форматы: `dataset.csv`, `dataset.json`, `dataset.txt`
- Импортер:
  - `format=csv`, поле `text`
  - или `format=lines` для `dataset.txt`
- Роль: reference/raw premises для ручного переписывания; не прямой canonical импорт готовых шуток в `joke/meme/advice`.
- Плюс:
  - удобный локальный экспорт

### 4. Hugging Face: samedad/mem-and-russian-jokes-dataset

- URL: `https://huggingface.co/datasets/samedad/mem-and-russian-jokes-dataset`
- Формат: conversations-like JSON/parquet
- Импортер:
  - если экспортирован в JSON conversations, `format=hf_conversations_json`
- Роль: reference/raw premises для ручного переписывания; не прямой canonical импорт готовых шуток в `joke/meme/advice`.
- Плюс:
  - уже ближе к короткому humorous-style контенту

### 5. Hugging Face: gorovuha/CleanComedy

- URL: `https://huggingface.co/datasets/gorovuha/CleanComedy`
- Использование:
  - скорее как reference / cleaner source
  - для более безопасного и менее токсичного backfill
- Роль: reference/raw premises для ручного переписывания; не прямой canonical импорт готовых шуток в `joke/meme/advice`.

## Дополнительные полезные базы

### 6. Hugging Face: nyuuzyou/ru-QnA-333K

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

### 7. Hugging Face: gorovuha/CleanComedyGold

- URL: `https://huggingface.co/datasets/gorovuha/CleanComedyGold`
- Использование:
  - не как основной bulk-source
  - а как более качественный ручной reference set
- Подходит для:
  - проверки наших эвристик
  - сравнения качества отобранных joke-candidates

## Базы для фильтрации, а не для прямого импорта

### 8. Hugging Face: Mikimi/MultiLingvAllToxic

- URL: `https://huggingface.co/datasets/Mikimi/MultiLingvAllToxic`
- Использование:
  - источник токсичных паттернов и дополнительного blacklist
  - не источник игрового контента

### 9. Hugging Face: Mnwa/russian-toxic

- URL: `https://huggingface.co/datasets/Mnwa/russian-toxic`
- Использование:
  - дополнительная база для расширения анти-токсичных фильтров
  - не для прямого импорта в Party Battle

### 10. Hugging Face: Onidle/ru-merged-toxic-comments

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

## Рекомендуемый порядок работы с контентом (later)

1. `bluff`: fact sources → playable facts → curation → importer dry-run.
2. `advice`: `ru-QnA-333K` или curated situations → rewrite → review → dry-run.
3. `whoami`: review существующих thematic files перед решением о registry, затем curated social sources при необходимости.
4. `caption`: отдельно curated visual pool.
5. `joke/meme`: generation по правилам режима + ручной review; corpora выше только вспомогательный reference.

Текущий coverage и оставшиеся тематические подключения: [content progress](partybattle_content_progress.md). Временные `data/import/*` не обязаны лежать в git; durable результат — canonical packs вместе с registry. Manifests не доказывают импорт и не заменяют проверку source files.
