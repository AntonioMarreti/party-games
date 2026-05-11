#!/usr/bin/env bash
set -euo pipefail

# Safe live deploy for the current SFTP-based workflow.
# What it does:
# 1. Optionally bumps asset/app version.
# 2. Creates server/deploy.lock on remote.
# 3. Syncs local project to remote via rsync.
# 4. Removes deploy.lock even if sync fails.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SFTP_CONFIG="$ROOT_DIR/.vscode/sftp.json"
BUMP_VERSION=0

usage() {
  cat <<'EOF'
Usage:
  tools/deploy_with_lock.sh [--bump]

Options:
  --bump    Run tools/bump-version.js before deploy
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --bump)
      BUMP_VERSION=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ ! -f "$SFTP_CONFIG" ]]; then
  echo "Missing .vscode/sftp.json" >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required to read .vscode/sftp.json" >&2
  exit 1
fi

if ! command -v ssh >/dev/null 2>&1; then
  echo "ssh is required" >&2
  exit 1
fi

if ! command -v rsync >/dev/null 2>&1; then
  echo "rsync is required" >&2
  exit 1
fi

if [[ "$BUMP_VERSION" -eq 1 ]]; then
  echo "Bumping app version"
  node "$ROOT_DIR/tools/bump-version.js"
fi

CONFIG_OUTPUT="$(
  node -e "
    const fs = require('fs');
    const cfg = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
    const lines = [
      cfg.host || '',
      String(cfg.port || 22),
      cfg.username || '',
      cfg.privateKeyPath || '',
      cfg.remotePath || '',
      ...((cfg.ignore || []).map(String))
    ];
    process.stdout.write(lines.join('\n'));
  " "$SFTP_CONFIG"
)"

CONFIG_LINES=()
while IFS= read -r line; do
  CONFIG_LINES+=("$line")
done <<< "$CONFIG_OUTPUT"

HOST="${CONFIG_LINES[0]:-}"
PORT="${CONFIG_LINES[1]:-22}"
USERNAME="${CONFIG_LINES[2]:-}"
PRIVATE_KEY_PATH="${CONFIG_LINES[3]:-}"
REMOTE_PATH="${CONFIG_LINES[4]:-}"
IGNORE_PATTERNS=("${CONFIG_LINES[@]:5}")

if [[ -z "$HOST" || -z "$USERNAME" || -z "$PRIVATE_KEY_PATH" || -z "$REMOTE_PATH" ]]; then
  echo "sftp.json is missing required fields" >&2
  exit 1
fi

SSH_TARGET="$USERNAME@$HOST"
REMOTE_LOCK_PATH="${REMOTE_PATH%/}/server/deploy.lock"
SSH_OPTS=(-i "$PRIVATE_KEY_PATH" -p "$PORT" -o BatchMode=yes -o StrictHostKeyChecking=accept-new)
RSYNC_RSH="ssh ${SSH_OPTS[*]}"
EXCLUDES_FILE="$(mktemp)"
LOCK_CREATED=0

cleanup() {
  rm -f "$EXCLUDES_FILE"
  if [[ "$LOCK_CREATED" -eq 1 ]]; then
    ssh "${SSH_OPTS[@]}" "$SSH_TARGET" "rm -f '$REMOTE_LOCK_PATH'" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

for pattern in "${IGNORE_PATTERNS[@]}"; do
  [[ -n "$pattern" ]] && printf '%s\n' "$pattern" >> "$EXCLUDES_FILE"
done

echo "Creating deploy lock: $REMOTE_LOCK_PATH"
ssh "${SSH_OPTS[@]}" "$SSH_TARGET" "mkdir -p '$(dirname "$REMOTE_LOCK_PATH")' && : > '$REMOTE_LOCK_PATH'"
LOCK_CREATED=1

echo "Syncing project to $SSH_TARGET:$REMOTE_PATH"
rsync -az \
  --update \
  --exclude-from="$EXCLUDES_FILE" \
  -e "$RSYNC_RSH" \
  "$ROOT_DIR/" "$SSH_TARGET:$REMOTE_PATH/"

echo "Removing deploy lock"
ssh "${SSH_OPTS[@]}" "$SSH_TARGET" "rm -f '$REMOTE_LOCK_PATH'"
LOCK_CREATED=0

echo "Deploy sync complete"
