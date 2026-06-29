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
