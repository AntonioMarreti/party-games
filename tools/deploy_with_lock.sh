#!/usr/bin/env bash
set -euo pipefail

# Safe live deploy for the current SFTP-based workflow.
# What it does:
# 1. Optionally bumps asset/app version.
# 2. Runs a small local preflight.
# 3. Syncs local project to remote via rsync with web-readable permissions.
# 4. Verifies critical remote files exist and are readable.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SFTP_CONFIG="$ROOT_DIR/.vscode/sftp.json"
BUMP_VERSION=0

usage() {
  cat <<'EOF'
Usage:
  tools/deploy.sh [--bump]
  tools/deploy_with_lock.sh [--bump]  # compatibility alias; no lock is used

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

echo "Running local preflight"
php -l "$ROOT_DIR/index.php" >/dev/null
php -l "$ROOT_DIR/server/api.php" >/dev/null
php -l "$ROOT_DIR/layout/head.php" >/dev/null
php -l "$ROOT_DIR/layout/scripts.php" >/dev/null
node --check "$ROOT_DIR/js/app.js" >/dev/null
node --check "$ROOT_DIR/js/modules/api-manager.js" >/dev/null
node --check "$ROOT_DIR/js/modules/room-manager.js" >/dev/null
if [[ -f "$ROOT_DIR/js/modules/game-summary-provider.js" ]]; then
  node --check "$ROOT_DIR/js/modules/game-summary-provider.js" >/dev/null
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
SSH_OPTS=(-i "$PRIVATE_KEY_PATH" -p "$PORT" -o BatchMode=yes -o StrictHostKeyChecking=accept-new)
RSYNC_RSH="ssh ${SSH_OPTS[*]}"
EXCLUDES_FILE="$(mktemp)"

cleanup() {
  rm -f "$EXCLUDES_FILE"
}
trap cleanup EXIT

for pattern in "${IGNORE_PATTERNS[@]}"; do
  [[ -n "$pattern" ]] && printf '%s\n' "$pattern" >> "$EXCLUDES_FILE"
done

# VS Code SFTP glob syntax is not the same as rsync exclude syntax.
# Keep explicit rsync-safe excludes here so deploy never publishes repo/dev metadata.
cat >> "$EXCLUDES_FILE" <<'EOF'
.git/
.git/**
.vscode/
.vscode/**
.agents/
.agents/**
.DS_Store
node_modules/
node_modules/**
venv/
venv/**
.venv/
.venv/**
logs/
logs/**
EOF

echo "Syncing project to $SSH_TARGET:$REMOTE_PATH"
rsync -az \
  --checksum \
  --human-readable \
  --itemize-changes \
  --chmod=Du=rwx,Dgo=rx,Fu=rw,Fgo=r \
  --exclude-from="$EXCLUDES_FILE" \
  -e "$RSYNC_RSH" \
  "$ROOT_DIR/" "$SSH_TARGET:$REMOTE_PATH/"

echo "Fixing remote file permissions"
ssh "${SSH_OPTS[@]}" "$SSH_TARGET" "find '$REMOTE_PATH' -type d -exec chmod 755 {} + && find '$REMOTE_PATH' -type f -exec chmod 644 {} +"

echo "Verifying critical remote files"
ssh "${SSH_OPTS[@]}" "$SSH_TARGET" "
  set -e
  test -r '${REMOTE_PATH%/}/index.php'
  test -r '${REMOTE_PATH%/}/server/api.php'
  test -r '${REMOTE_PATH%/}/js/app.js'
  test -r '${REMOTE_PATH%/}/js/modules/api-manager.js'
  test -r '${REMOTE_PATH%/}/libs/bootstrap.part1.min.css'
  test -r '${REMOTE_PATH%/}/libs/bootstrap.part2.min.css'
  test -r '${REMOTE_PATH%/}/libs/bootstrap-icons.css'
  test -r '${REMOTE_PATH%/}/libs/fonts/bootstrap-icons.woff2'
  test -r '${REMOTE_PATH%/}/libs/fonts/bootstrap-icons.woff'
  test -r '${REMOTE_PATH%/}/favicon.png'
  test ! -e '${REMOTE_PATH%/}/.git'
  rm -f '${REMOTE_PATH%/}/server/deploy.lock'
"

echo "Deploy sync complete"
