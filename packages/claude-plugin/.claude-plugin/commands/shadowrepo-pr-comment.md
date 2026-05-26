---
description: Open a draft GitHub PR and post a ShadowRepo-aware summary as its first comment. Wraps `gh pr create --draft` then `gh pr comment`. Degrades to summary-only when `gh` is missing or unauthenticated.
allowed-tools: Bash, Read, Glob
---

# /shadowrepo-pr-comment

A single-hook-scenario GitHub-ops wrap for ShadowRepo.

Per `decision-M-A-breakdown-001` this command ships as the **slash-command
wrapper fallback (RL-A-1)** for the MVP; real PreToolUse-style hook
binding is deferred post-MVP. The slash command counts toward AC-A-1
(pre-authorized in the spawn input).

## What this does

1. Read `${CLAUDE_PLUGIN_ROOT}/skills/pr-comment/SKILL.md` and follow it.
2. The skill invokes the bundled runner:
   ```bash
   node ${CLAUDE_PLUGIN_ROOT}/skills/pr-comment/runner.mjs <repo_root> \
     [--title "<pr title>"] [--body-file <path>] [--base <branch>] \
     [--dry-run] [--summary-only] [--out <markdown_path>]
   ```
3. The runner:
   - reads `<repo_root>/.shadowrepo/features.json`, `coverage.json`, and
     (optionally) `specs.json`;
   - writes a ShadowRepo-aware markdown summary to
     `<repo_root>/.shadowrepo/pr-comments/<ISO8601-basic>.md` (or to
     `--out`);
   - prints the same markdown to stdout;
   - in the default mode, runs `gh pr create --draft --title <title> --body <body>`
     then `gh pr comment <PR#> --body-file <summary>` so the summary
     lands as the first comment on the freshly opened draft PR;
   - in `--dry-run` mode, prints the two `gh` commands without executing;
   - in `--summary-only` mode (or when `gh` is missing/unauthenticated),
     writes + prints the summary and exits 0 — the user can paste the
     markdown into the GitHub UI manually (RL-A-2 fallback).

## Tier reminder

If a reviewer / planner wants a real PreToolUse hook entry on the
plugin manifest (not the slash-command wrap), see
`decision-M-A-breakdown-001` RL-A-1 — that path is deferred post-MVP
because Claude plugin hook event names did not deterministically match
the `gh pr create` scenario at MVP time, and the spawn input
pre-authorized the slash-command fallback.

## Quick fallback

If `gh` is unavailable in the user's shell, the runner auto-degrades to
summary-only and exits 0. The markdown lives at
`<repo_root>/.shadowrepo/pr-comments/<ISO8601-basic>.md`. The user can
copy/paste it into the GitHub PR description or first comment manually.

## Known limitation

Online-vs-local ShadowRepo diff is approximated by JSON-string diff in
the current MVP; full semantic merge is post-MVP. See `README.md`.
