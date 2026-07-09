Production deploy:
- Use only ./tools/deploy.sh.
- Never use direct rsync, scp or ssh for deployment.
- Never search shell history, .envrc, ~/.ssh or environment variables for deploy settings.
- tools/deploy.sh is the only component allowed to load .env.deploy.local.
- Never deploy project root or use --delete.
- Never deploy server/config.php, .env files, migrations, logs or local artifacts unless explicitly requested.

Asset version:
- For frontend assets loaded with ?v=, use the existing .agents/workflows/bump-version.md workflow.
- Do not edit layout/version.php manually when the commit hook/workflow manages the version.
- Before deployment, include layout/version.php only when the version was actually changed by that workflow.

Workflow:
- Before commit: run relevant syntax checks and git diff --check.
- Before deploy: run ./tools/deploy.sh --dry-run with the exact files.
- Deploy only explicitly named files through ./tools/deploy.sh --apply.
- After deploy: rely on its SHA-256 verification; do not run alternative deploy commands.

Production QA dev login:
- For Party Games production E2E QA, use the hidden dev-login panel at https://lapin.live/mpg/?debug_dev_login=1.
- The panel appears only with ?debug_dev_login=1 and contains the QA/dev secret field plus Dev 1, Dev 2, Dev 3 and Dev 4 buttons.
- For multiplayer QA, open independent browser sessions and sign in as different Dev participants.
- This is the standard Browser/Antigravity QA flow for production E2E tests.
- Do not use regular Telegram/QR login, real accounts, localhost, mock initData, Console/API calls or manual devLogin() calls for production E2E QA.
- Never write the secret in prompts, logs, screenshots, videos, commits or documentation.
- If the dev-login panel is unavailable, stop and report the exact on-screen step that failed instead of looking for workarounds.
- After login, perform game actions only through the normal UI.

Execution discipline:
- Do not commit, push, deploy, change production settings, or invoke Browser Tester unless the current task explicitly requests that phase.
- On a failed check or missing deploy configuration, stop and report the exact blocker. Do not search shell history, .envrc, SSH config, environment variables, or attempt alternative deployment commands.
- Do not make unrelated cleanup, refactors, new top-level files, or duplicate instruction files.
- Distinguish code checks, browser/debug-account checks, and real production delivery in reports. Debug accounts do not prove native Telegram UI, real bot delivery, or push notifications.
- Before creating or changing agent instructions, inspect existing AGENTS.md and .agents workflows first.
- Do not start localhost servers, python -m http.server, dev servers, Docker containers, or local test pages unless the current task explicitly requires local runtime testing. Prefer Browser Tester against the intended environment or direct code/computed-style inspection.
