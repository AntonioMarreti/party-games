#!/usr/bin/env bash
set -euo pipefail

if ! command -v gh >/dev/null 2>&1; then
  echo "gh CLI is required to apply labels." >&2
  exit 1
fi

upsert_label() {
  local name="$1"
  local color="$2"
  local description="$3"

  gh label create "$name" --color "$color" --description "$description" 2>/dev/null \
    || gh label edit "$name" --color "$color" --description "$description"
}

upsert_label "bug" "d73a4a" "Something is not working"
upsert_label "p0" "b60205" "Critical production issue"
upsert_label "p1" "d93f0b" "High-priority issue"
upsert_label "p2" "fbca04" "Normal-priority issue"
upsert_label "android" "3f51b5" "Android-specific issue"
upsert_label "ios" "bfd4f2" "iOS-specific issue"
upsert_label "telegram-webview" "54aeef" "Telegram WebView issue"
upsert_label "ui" "c5def5" "User interface issue"
upsert_label "gameplay" "5319e7" "Game flow or rules issue"
upsert_label "scroll-touch" "0e8a16" "Scroll, touch or gesture issue"
upsert_label "brainbattle" "6f42c1" "BrainBattle issue"
upsert_label "bunker" "8b572a" "Bunker issue"
upsert_label "partybattle" "c2e0c6" "PartyBattle issue"
upsert_label "scheduled-games" "1d76db" "Scheduled games issue"
upsert_label "daily-tasks" "fbca04" "Daily tasks issue"
upsert_label "needs-repro" "ededed" "Needs reproduction details"
upsert_label "fixed-needs-test" "0e8a16" "Fixed and waiting for tester verification"
upsert_label "tester-feedback" "5319e7" "Feedback from testers"

echo "GitHub labels are ready."
