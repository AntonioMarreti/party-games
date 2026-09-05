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
    if [ ! -f "$PROJECT_ROOT/.env.deploy.local" ]; then
        echo "Missing .env.deploy.local. Deployment stopped; do not search shell history, env files, or SSH config."
        exit 1
    fi

    set -o allexport
    source "$PROJECT_ROOT/.env.deploy.local"
    set +o allexport

    : "${DEPLOY_HOST:?Set DEPLOY_HOST}"
    : "${DEPLOY_USER:?Set DEPLOY_USER}"
    : "${DEPLOY_PATH:?Set DEPLOY_PATH}"
    : "${DEPLOY_KEY:?Set DEPLOY_KEY}"

    read -p "Type DEPLOY to confirm: " confirm
    if [ "$confirm" != "DEPLOY" ]; then
        echo "Deployment cancelled."
        exit 1
    fi

    MAX_SSH_ATTEMPTS=3
    RETRY_DELAY_SECONDS=2
    RETRY_OUTPUT=""

    is_transient_connection_failure() {
        local status="$1"
        local output="$2"

        if [ "$status" -eq 255 ]; then
            return 0
        fi

        case "$output" in
            *"Connection closed"*|\
            *"Connection reset"*|\
            *"kex_exchange_identification"*|\
            *"banner exchange"*|\
            *"Connection timed out"*|\
            *"Operation timed out"*|\
            *"unexpected end of file"*)
                return 0
                ;;
        esac

        return 1
    }

    run_with_retry() {
        local label="$1"
        shift
        local attempt
        local output
        local status

        for ((attempt = 1; attempt <= MAX_SSH_ATTEMPTS; attempt++)); do
            if output=$("$@" 2>&1); then
                RETRY_OUTPUT="$output"
                return 0
            else
                status=$?
            fi

            if [ -n "$output" ]; then
                printf '%s\n' "$output" >&2
            fi

            if [ "$attempt" -lt "$MAX_SSH_ATTEMPTS" ] && \
               is_transient_connection_failure "$status" "$output"; then
                echo "$label attempt $attempt/$MAX_SSH_ATTEMPTS failed, retrying..." >&2
                sleep "$RETRY_DELAY_SECONDS"
                continue
            fi

            return "$status"
        done
    }

    echo "Deploying..."
    if run_with_retry "Deploy" \
        rsync -azR \
            -e "ssh -o StrictHostKeyChecking=accept-new -i ${DEPLOY_KEY}" \
            "${VALID_FILES[@]}" "${DEPLOY_USER}@${DEPLOY_HOST}:${DEPLOY_PATH}"; then
        if [ -n "$RETRY_OUTPUT" ]; then
            printf '%s\n' "$RETRY_OUTPUT"
        fi
    else
        exit $?
    fi
    echo "Deployment sync complete."

    echo "Verifying SHA-256..."
    run_remote_verification() {
        {
            printf 'set -euo pipefail\n'
            printf 'deploy_path=%q\n' "$DEPLOY_PATH"
            printf 'files=('
            printf ' %q' "${VALID_FILES[@]}"
            printf ' )\n'
            printf 'for f in "${files[@]}"; do\n'
            printf '    shasum -a 256 "$deploy_path/$f"\n'
            printf 'done\n'
        } | ssh -o StrictHostKeyChecking=accept-new -i "${DEPLOY_KEY}" \
            "${DEPLOY_USER}@${DEPLOY_HOST}" bash -s
    }

    if run_with_retry "Verification" run_remote_verification; then
        VERIFY_OUTPUT="$RETRY_OUTPUT"
    else
        exit $?
    fi

    REMOTE_SHAS=()
    while IFS= read -r line; do
        if [[ "$line" =~ ^([[:xdigit:]]{64})[[:space:]] ]]; then
            REMOTE_SHAS+=("${BASH_REMATCH[1]}")
        fi
    done <<< "$VERIFY_OUTPUT"

    VERIFY_FAILED=0
    for i in "${!VALID_FILES[@]}"; do
        f="${VALID_FILES[$i]}"
        LOCAL_SHA=$(shasum -a 256 "$f" | awk '{print $1}')
        REMOTE_SHA="${REMOTE_SHAS[$i]:-}"
        if [ "$LOCAL_SHA" == "$REMOTE_SHA" ]; then
            echo "$f: OK"
        else
            echo "$f: MISMATCH"
            VERIFY_FAILED=1
        fi
    done

    if [ "$VERIFY_FAILED" -ne 0 ]; then
        exit 1
    fi
else
    echo "Dry run complete. No files were transferred."
fi
