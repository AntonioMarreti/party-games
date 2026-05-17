# Future Work

## Scheduled open games

- Add edit flow for host-owned scheduled games:
  - UI action: `Изменить` near `Открыть` / `Отменить`.
  - API action: `update_scheduled_game`.
  - Allow editing only while status is `scheduled`.
  - Editable fields: `title`, `description`, `starts_at`, `min_players`, `max_players`.
- Add Telegram bot reminders for `room_subscriptions`.
- Add scheduled game expiry/cancel cleanup job.
- Decide final naming for the rooms mode labels after real usage data.

## Game history and retention

- Verify that every completed game writes a fresh history record.
- Store richer history payloads where games can provide them:
  - winner;
  - place;
  - score;
  - players count;
  - replay payload.
- Improve history cards from dry XP records into useful game results.

## Post-game share

- Finish visual share card for Telegram.
- Add Telegram story/share target when the asset pipeline is ready.
- Keep `GameSummaryProvider` as the common contract for per-game summaries.

## Rooms and catalog UX

- Continue tightening room cards on small screens.
- Improve game catalog filters so the catalog feels as complete as the home flow.
- Re-check thermal-safe mode after each major UI screen, but keep it token-based rather than screen-specific.
