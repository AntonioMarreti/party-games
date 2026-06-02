# Wordclash dictionary cleanup backlog

Current Wordclash dictionaries (`words/russian_5.json`, `russian_6.json`, `russian_7.json`) are large allowed-word dumps. They include word forms and obscure/non-playable words such as `подта`.

Future task:
- keep current dictionaries as allowed words for input validation;
- add curated target dictionaries:
  - `words/russian_5_targets.json`
  - `words/russian_6_targets.json`
  - `words/russian_7_targets.json`
- use target dictionaries only for `secret_word` selection;
- keep allowed dictionaries for `isValidWord`;
- add tests/checks so target words are normalized and playable.
