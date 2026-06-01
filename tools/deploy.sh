#!/usr/bin/env bash
set -euo pipefail

# This is the only supported production deploy helper.
# Do not use or restore deploy_with_lock.sh.
# Run checks and bump version before deploy.
# This script does not run migrations.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Ensure we have a .env.deploy.local file loaded if it exists
if [ -f "$PROJECT_ROOT/.env.deploy.local" ]; then
    set -o allexport
    source "$PROJECT_ROOT/.env.deploy.local"
    set +o allexport
fi

: "${DEPLOY_HOST:?Set DEPLOY_HOST}"
: "${DEPLOY_USER:?Set DEPLOY_USER}"
: "${DEPLOY_PATH:?Set DEPLOY_PATH}"
: "${DEPLOY_KEY:?Set DEPLOY_KEY}"

echo "Deploying to production..."
cd "$PROJECT_ROOT"

rsync -az \
  --exclude='.git/' --exclude='.vscode/' --exclude='.agents/' \
  --exclude='node_modules/' --exclude='venv/' --exclude='.venv/' \
  --exclude='logs/' --exclude='.DS_Store' \
  -e "ssh -o StrictHostKeyChecking=accept-new -i ${DEPLOY_KEY}" \
  ./ "${DEPLOY_USER}@${DEPLOY_HOST}:${DEPLOY_PATH}"

echo "Deploy complete!"
