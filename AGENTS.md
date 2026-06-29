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

Execution discipline:
- Do not commit, push, deploy, change production settings, or invoke Browser Tester unless the current task explicitly requests that phase.
- On a failed check or missing deploy configuration, stop and report the exact blocker. Do not search shell history, .envrc, SSH config, environment variables, or attempt alternative deployment commands.
- Do not make unrelated cleanup, refactors, new top-level files, or duplicate instruction files.
- Distinguish code checks, browser/debug-account checks, and real production delivery in reports. Debug accounts do not prove native Telegram UI, real bot delivery, or push notifications.
- Before creating or changing agent instructions, inspect existing AGENTS.md and .agents workflows first.
- Do not start localhost servers, python -m http.server, dev servers, Docker containers, or local test pages unless the current task explicitly requires local runtime testing. Prefer Browser Tester against the intended environment or direct code/computed-style inspection.
