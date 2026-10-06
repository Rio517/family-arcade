@AGENTS.md

## Claude Code

- The skills in `.claude/skills/` load by name: `arcade-game-playbook` before
  game work, `/audit` for a codebase sweep.
- `.claude/settings.json` holds the shared permissions; personal ones go in
  `.claude/settings.local.json`, personal notes in `CLAUDE.local.md` (both
  git-ignored).
