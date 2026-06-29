#!/usr/bin/env bash
set -euo pipefail

# Точечный deploy Party Games.
# Никогда не отправляй корень проекта и не используй --delete.
# server/config.php и .env-файлы существуют отдельно на production:
# их перезапись может сломать подключение к БД, Telegram и другие production-настройки.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

MODE="dry-run"
ALLOW_MIGRATIONS=0
FILES=()

for arg in "$@"; do
    case "$arg" in
        --apply) MODE="apply" ;;
        --dry-run) MODE="dry-run" ;;
        --allow-migrations) ALLOW_MIGRATIONS=1 ;;
        -*)
            echo "Error: Unknown flag $arg"
            exit 1
            ;;
        *)
            FILES+=("$arg")
            ;;
    esac
done

if [ ${#FILES[@]} -eq 0 ]; then
    echo "Error: No files specified for deployment."
    exit 1
fi

if [ "$ALLOW_MIGRATIONS" -eq 1 ] && [ "$MODE" != "apply" ]; then
    echo "Error: --allow-migrations can only be used with --apply"
    exit 1
fi

VALID_FILES=()

for f in "${FILES[@]}"; do
    if [[ "$f" == /* ]]; then
        echo "Error: Absolute paths are not allowed ($f)"
        exit 1
    fi
    if [[ "$f" == *".."* ]]; then
        echo "Error: Paths with '..' are not allowed ($f)"
        exit 1
    fi
    if [ -d "$PROJECT_ROOT/$f" ]; then
        echo "Error: Directories are not allowed ($f)"
        exit 1
    fi

    # Blocked paths and patterns MUST be checked before git check
    base=$(basename "$f")
    if [[ "$f" == "server/config.php" ]] || \
       [[ "$f" == "server/config.local.php" ]] || \
       [[ "$base" == ".env" ]] || \
       [[ "$base" == .env.* ]] || \
       [[ "$base" == ".envrc" ]] || \
       [[ "$f" == .git/* ]] || \
       [[ "$f" == .agents/* ]] || \
       [[ "$f" == .local/* ]] || \
       [[ "$f" == node_modules/* ]] || \
       [[ "$base" == *.db ]] || \
       [[ "$base" == *.sqlite ]] || \
       [[ "$base" == *.sqlite3 ]] || \
       [[ "$base" == *.log ]] || \
       [[ "$base" == ".DS_Store" ]] || \
       [[ "$base" == "recording.webm" ]]; then
        echo "Error: Deployment of $f is blocked by rules."
        exit 1
    fi

    if [[ "$f" == server/migrations/* ]] && [ "$ALLOW_MIGRATIONS" -eq 0 ]; then
        echo "Error: Migration files ($f) require --allow-migrations flag."
        exit 1
    fi

    # Check if tracked by git
    if ! git -C "$PROJECT_ROOT" ls-files --error-unmatch "$f" >/dev/null 2>&1; then
        echo "Error: File is untracked or does not exist ($f)"
        exit 1
    fi

    VALID_FILES+=("$f")
done

echo "Mode: $MODE"
echo "Files to deploy:"
for f in "${VALID_FILES[@]}"; do
    echo "  - $f"
done

cd "$PROJECT_ROOT"

if [ "$MODE" == "apply" ]; then
    if [ -f "$PROJECT_ROOT/.env.deploy.local" ]; then
        set -o allexport
        source "$PROJECT_ROOT/.env.deploy.local"
        set +o allexport
    fi

    : "${DEPLOY_HOST:?Set DEPLOY_HOST}"
    : "${DEPLOY_USER:?Set DEPLOY_USER}"
    : "${DEPLOY_PATH:?Set DEPLOY_PATH}"
    : "${DEPLOY_KEY:?Set DEPLOY_KEY}"

    read -p "Type DEPLOY to confirm: " confirm
    if [ "$confirm" != "DEPLOY" ]; then
        echo "Deployment cancelled."
        exit 1
    fi

    echo "Deploying..."
    for f in "${VALID_FILES[@]}"; do
        rsync -azR \
            -e "ssh -o StrictHostKeyChecking=accept-new -i ${DEPLOY_KEY}" \
            "$f" "${DEPLOY_USER}@${DEPLOY_HOST}:${DEPLOY_PATH}"
    done
    echo "Deployment sync complete."

    echo "Verifying SHA-256..."
    for f in "${VALID_FILES[@]}"; do
        LOCAL_SHA=$(shasum -a 256 "$f" | awk '{print $1}')
        REMOTE_SHA=$(ssh -o StrictHostKeyChecking=accept-new -i "${DEPLOY_KEY}" "${DEPLOY_USER}@${DEPLOY_HOST}" "shasum -a 256 \"${DEPLOY_PATH}/$f\"" | awk '{print $1}')
        if [ "$LOCAL_SHA" == "$REMOTE_SHA" ]; then
            echo "$f: OK"
        else
            echo "$f: MISMATCH"
        fi
    done
else
    echo "Dry run complete. No files were transferred."
fi
