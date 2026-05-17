# Future Work

## Scheduled open games

- Add Telegram bot reminders for `room_subscriptions`.
- Add scheduled game expiry/cancel cleanup job.
- Decide final naming for the rooms mode labels after real usage data.

## Game history and retention

- Server-side history write audit is done for active finished games.
  Blokus and Minesweeper now use `stats_recorded` guards and real duration.
- Bunker still needs a product decision for what counts as the final result/history payload.
- Production migration `server/migrations/008_enrich_game_history.php` has been run.
  New games can persist:
  - winner;
  - place/score;
  - saved XP;
  - players count;
  - replay/result payload.
- Backfill old history rows if we want existing May records to look richer.
- Add per-game emotional summaries where a game can provide more than place/score.

## Post-game share

- Finish visual share card for Telegram.
- Add full Telegram story/share target polishing after real device testing.
- Keep `GameSummaryProvider` as the common contract for per-game summaries.

## Rooms and catalog UX

- Continue tightening room cards on small screens.
- Add deeper catalog sorting/grouping only if the game list grows enough.
- Re-check thermal-safe mode after each major UI screen, but keep it token-based rather than screen-specific.
