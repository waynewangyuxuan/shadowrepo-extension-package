---
name: shadowrepo-pr-comment
description: >
  Open a draft GitHub PR and post a ShadowRepo-aware summary as its first
  comment. Reads .shadowrepo/features.json + coverage.json + specs.json,
  renders a markdown context block, wraps `gh pr create --draft` then
  `gh pr comment`. Degrades to summary-only when `gh` is missing or
  unauthenticated. Use when: "/shadowrepo-pr-comment", "open PR with
  shadowrepo summary", "draft pr with context", "post shadowrepo summary
  on pr".
---

# ShadowRepo PR-Comment (M-A)

A single-hook-scenario GitHub-ops wrap for ShadowRepo. Per
`META/00-robin-plan/specs/decision-M-A-breakdown-001.yaml`, M-A ships ONE
functional GitHub-hook path: open a draft PR and seed it with a
ShadowRepo context comment.

Per `RL-A-1` (Claude plugin hook event names may not match the chosen
scenario), this MVP ships as a **slash-command wrapper** (non-hook). The
pre-authorized fallback is already taken. Real PreToolUse-style hook
binding is deferred post-MVP.

## What "ShadowRepo-aware output" means at MVP (AC-A-1)

A markdown block of the form:

```
## ShadowRepo Context

This PR touches a workspace with N top-level features in its semantic
knowledge graph.

### Top features
| Feature | Type | Description |
|---|---|---|
| ... | ... | ... |

### Coverage
- Coverage: X%
- Covered files: ...
- Uncovered files: ...

See `.shadowrepo/` for the full spec graph.

---

### Known limitation (MVP)
Online-vs-local ShadowRepo diff is approximated by JSON-string diff in
the current MVP; full semantic merge is post-MVP.
```

posted as the **first comment** on a freshly opened draft PR.

## Prerequisites

1. Read `stdlib/data-model.md` — Feature / Spec types
2. (Recommended) `gh auth status` is green so the wrapper can actually
   open a PR. If not, the runner degrades to summary-only and prints the
   markdown for manual copy/paste (`RL-A-2` fallback).

## Precondition

1. `.shadowrepo/` exists under the workspace root. If not: tell the user
   to run `/shadowrepo build` first. The runner exits with code 1.

## Execution

### Step 1 — Locate inputs

- `repo_root`: directory containing `.shadowrepo/`. Default: cwd.
- `features_path`: `<repo_root>/.shadowrepo/features.json` (required)
- `coverage_path`: `<repo_root>/.shadowrepo/coverage.json` (optional)
- `specs_path`:    `<repo_root>/.shadowrepo/specs.json` (optional)

### Step 2 — Run the wrapper

Invoke the bundled runner via the Bash tool:

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/pr-comment/runner.mjs <repo_root> \
  [--title "<pr title>"] \
  [--body-file <path>]  \
  [--base <branch>]     \
  [--dry-run]           \
  [--summary-only]      \
  [--out <markdown_path>]
```

Behavior matrix:

| Flag combination | What runs |
|---|---|
| (none) | Write summary, then `gh pr create --draft ...`, then `gh pr comment <num> --body-file <summary>` |
| `--dry-run` | Write summary; print the two `gh` commands that WOULD run; exit 0 |
| `--summary-only` | Write summary; print to stdout; exit 0 — do not touch `gh` |
| `gh` not on PATH | Auto-degrade to `--summary-only` (RL-A-2 fallback). exit 0 |
| `gh auth status` fails | Auto-degrade to `--summary-only`. exit 0 |

The runner ALWAYS writes the markdown summary to
`<repo_root>/.shadowrepo/pr-comments/<ISO8601-basic>.md` (or
`--out <path>` if provided) and prints it on stdout, so the human path
("paste this into the GitHub UI") works even when the automated path
fails.

### Step 3 — Read the runner's summary line back to the user

The final stdout line is:

```
shadowrepo-pr-comment summary: features=N coverage=X specs=S summary=<path> gh=present|missing
```

If `gh=present` and the real-run path was taken, the runner also prints
the opened PR URL on the line immediately before. If degraded to
summary-only, tell the user where the markdown lives and that they can
paste it into the PR UI manually.

## Acceptance (from decision-M-A-breakdown-001)

- **AC-A-1** (signal 6): at least one GitHub-hook path runs without
  error in demo; produces ShadowRepo-aware output.
  **Satisfied by** invoking this slash command in dry-run or real-run
  mode against any workspace whose `.shadowrepo/features.json` exists.
  The summary markdown is the ShadowRepo-aware output; the
  `gh pr create --draft` invocation is the GitHub-ops path. Per
  `RL-A-1`, the slash command counts (pre-authorized in spawn input).

## Error handling

- `.shadowrepo/` missing under `<repo_root>`: exit 1 with message
  pointing at `/shadowrepo build`.
- `features.json` malformed JSON: exit 1 with parse error.
- `gh` missing on PATH: auto-degrade to summary-only, exit 0. The user
  still gets the markdown.
- `gh auth status` non-zero: auto-degrade to summary-only, exit 0.
- `gh pr create` non-zero exit during real run: exit 2 with stderr
  forwarded. The summary file is still on disk.
- `gh pr comment` non-zero exit: exit 2 with stderr forwarded. The PR is
  open but the auto-comment failed; the user can post the summary
  manually from the saved file.

## Known limitation

Online-vs-local ShadowRepo diff is approximated by JSON-string diff in
the current MVP; full semantic merge is post-MVP. This is also recorded
in `README.md`.

## Reference

- `decision-M-A-breakdown-001.yaml` — milestone breakdown
- `decision-run2-plan-001.yaml` — run-2 batching + dispatch boilerplate
- `skills/review/SKILL.md` — sibling slash command (TIER-2 wrap pattern)
- `skills/stdlib/data-model.md` — Feature / Spec / Anchor types
