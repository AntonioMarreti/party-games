# Packs Registry

Canonical pack consumers in this repo:

- `server/games/partybattle.php`
  Uses:
  - `packs/partybattle/meme/*`
  - `packs/partybattle/joke/*`
  - `packs/partybattle/advice/*`
  - `packs/partybattle/acronym/*`
  - `packs/partybattle/caption/*`
  - `packs/partybattle/bluff/*`
  - `packs/partybattle/whoami/*`
  - `packs/partybattle_bots.json`

- `server/games/spyfall.php`
  Uses:
  - `packs/spyfall/*`

- `server/games/bunker.php`
  Uses:
  - `packs/bunker/base.json`

- `server/games/wordclash.php`
  Does not use `server/games/packs`.
  Dictionary files live in `words/`.

Notes:

- `partybattle/meme/base.json` and `partybattle/whoami/base.json` are canonical aggregated bases for those modes.
- Canonical meme theme packs also exist in `partybattle/meme/office.json`, `relationships.json`, `school.json`, `it.json`, and `simple_base.json`.
- Canonical Party Battle packs must use the `meta + entries` contract and pass server-side validation by `mode`, `theme`, and `kind`.
- If a pack is added for Party Battle, it should be registered in `pb_getPartyBattlePackRegistry()` first.
- Offline import into canonical Party Battle packs is supported by `tools/parsers/partybattle_importer.php`.
- Recommended source catalog for offline imports lives in `tools/parsers/partybattle_sources.md`.
- External datasets should be downloaded once, stored locally, filtered, and imported into repo packs. Runtime should not depend on third-party sites staying online.

Offline import workflow:

1. Download the source dataset locally.
2. Put it into a repo-relative folder such as `data/import/`.
3. Run `php tools/parsers/partybattle_importer.php --source=data/import/file --mode=joke --theme=base --format=lines --rebuild`.
4. Review the resulting canonical pack in `server/games/packs/partybattle/*`.
5. Commit the imported pack so the project stays self-contained.
6. For batch imports, start from `tools/parsers/partybattle_import_manifest.russian_text.example.json`.

Path rules:

- relative `source_path`, `output`, and `--manifest` paths are resolved from the project root;
- absolute paths still work, but examples should prefer repo-relative paths so moving the project to another machine or server does not break the workflow.

Useful importer inputs:

- `lines`: one text item per line
- `jsonl`: one JSON object per line
- `json_array`: a JSON array of strings or objects
- `csv`: CSV with a named field such as `text`
- `parquet`: parquet with a named field such as `text`
- `hf_conversations_json`: Hugging Face style conversations dumps

Useful importer flags:

- `--dry-run`: inspect counts without rewriting the target pack
- `--preview-limit=N`: show top accepted candidates by score
- `--rebuild`: rebuild the target pack from the filtered source instead of only merging new rows into existing entries

Parquet note:

- `format=parquet` uses the local project virtualenv at `.venv/bin/python` when available;
- parquet imports require `pyarrow` installed in that environment.
- question-like sources such as `ru-QnA-333K` should usually use `profile=advice_question` instead of `advice_prompt`.

Coverage snapshot:

- `meme`
  Themes: `base`, `18plus`, `office`, `relationships`, `school`, `it`, `simple_base`
  Gaps: baseline thematic coverage is good

- `joke`
  Themes: `base`, `18plus`, `office`, `relationships`, `party`
  Gaps: baseline thematic coverage is good

- `advice`
  Themes: `base`, `18plus`, `office`, `relationships`, `party`
  Gaps: baseline thematic coverage is good

- `acronym`
  Themes: `base`, `18plus`
  Gaps: no extra themed packs yet

- `caption`
  Themes: `base`
  Gaps: no `18plus`, no themed image packs yet

- `bluff`
  Themes: `base`, `18plus`, `weird_facts`, `history`, `body`
  Gaps: baseline thematic coverage is good

- `whoami`
  Themes: `base`, `18plus`, `cinema`, `friendship`, `office`, `party`, `provocative`
  Gaps: theming is strongest here; no issue

Recommended next additions:

- `caption/18plus.json`
- themed `caption/*` image packs such as `office`, `relationships`, `party`
