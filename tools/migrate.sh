#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

MODE="dry-run"
MIGRATION_ID=""

for arg in "$@"; do
    case "$arg" in
        --apply) MODE="apply" ;;
        --dry-run) MODE="dry-run" ;;
        -*)
            echo "Error: Unknown flag $arg"
            exit 1
            ;;
        *)
            MIGRATION_ID="$arg"
            ;;
    esac
done

if [ -z "$MIGRATION_ID" ]; then
    echo "Error: No migration ID specified."
    exit 1
fi

# Allowlist definition
MIGRATION_FILE=""
case "$MIGRATION_ID" in
    "016") MIGRATION_FILE="server/migrations/016_wordclash_blacklist_to_db.php" ;;
    "017") MIGRATION_FILE="server/migrations/017_add_qr_auth_sessions.php" ;;
    *)
        echo "Error: Migration ID '$MIGRATION_ID' is not in the allowlist."
        exit 1
        ;;
esac

echo "Mode: $MODE"
echo "Migration: $MIGRATION_ID -> $MIGRATION_FILE"

if [ "$MODE" == "dry-run" ]; then
    echo "Dry run complete. The following command would be executed remotely:"
    echo "php <DEPLOY_PATH>/$MIGRATION_FILE"
    exit 0
fi

if [ ! -f "$PROJECT_ROOT/.env.deploy.local" ]; then
    echo "Error: Missing .env.deploy.local."
    exit 1
fi

set -o allexport
source "$PROJECT_ROOT/.env.deploy.local"
set +o allexport

: "${DEPLOY_HOST:?Set DEPLOY_HOST}"
: "${DEPLOY_USER:?Set DEPLOY_USER}"
: "${DEPLOY_PATH:?Set DEPLOY_PATH}"
: "${DEPLOY_KEY:?Set DEPLOY_KEY}"

read -r -p "Type MIGRATE $MIGRATION_ID to confirm: " confirm
if [ "$confirm" != "MIGRATE $MIGRATION_ID" ]; then
    echo "Migration cancelled."
    exit 1
fi

echo "Deploying migration file via existing transport..."
printf 'DEPLOY\n' | "$SCRIPT_DIR/deploy.sh" --apply --allow-migrations "$MIGRATION_FILE"

if [ $? -ne 0 ]; then
    echo "Error: Failed to deploy migration file."
    exit 1
fi

echo "Running migration on remote server..."
ssh -o StrictHostKeyChecking=accept-new -i "${DEPLOY_KEY}" "${DEPLOY_USER}@${DEPLOY_HOST}" "php \"${DEPLOY_PATH}/${MIGRATION_FILE}\""

if [ $? -ne 0 ]; then
    echo "Error: Migration script failed on remote server."
    exit 1
fi

echo "Migration $MIGRATION_ID applied successfully."
