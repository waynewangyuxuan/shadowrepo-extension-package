---
name: shadowrepo-review
description: >
  Pre-commit alignment review of ShadowRepo. Reads .shadowrepo/ + the working
  tree, applies three alignment heuristics (anchored, anchor-file-exists,
  schema-validates), and emits a markdown report under .shadowrepo/reviews/.
  Use when: "/shadowrepo-review", "review shadowrepo", "is shadowrepo aligned
  with code", "pre-commit check shadowrepo".
---

# ShadowRepo Review (TIER-2)

A single-agent wrap of `skills/check/` plus three pinned alignment
heuristics that defines what "aligned" means for the MVP.

This is the TIER-2 implementation of M-C per
`META/00-robin-plan/specs/decision-descope-mc-001.yaml`. TIER-1 (multi-agent
fan-out across drift / anchor-liveness / schema-validator subagents) is
deferred post-MVP.

## What "aligned" means at MVP level (M-C-T-6)

Three heuristics. A spec is **aligned** iff it passes all three. Any
failure is a finding in the report.

| Heuristic | Definition | Failure rendered as |
|---|---|---|
| **H1 — anchored** | The spec carries `anchors: [...]` with at least one entry. Specs without anchors cannot be tied back to code, so the WHY they capture is unverifiable. | `unanchored_spec` |
| **H2 — anchor-file-exists** | Every `anchor.file` in every anchor resolves to a file on disk (relative to the workspace root containing `.shadowrepo/`). A missing file means the spec is describing code that no longer exists. | `anchor_orphaned` |
| **H3 — schema-validates** | The spec has the required fields per `skills/stdlib/data-model.md` Spec table: `spec_id`, `feature_name`, `type`, `summary`, `anchors`, `confidence`, `provenance`, `state`, `created_at`, `updated_at`. Missing required fields means the spec is malformed and downstream tools (render, preview, etc.) may break on it. | `schema_invalid` |

These three are intentionally coarse — `/shadowrepo-review` does NOT
re-implement `/shadowrepo check`'s diff-based drift detection (that's
the existing `skills/check/` skill, which this review can layer on top
of in a future iteration). The MVP just verifies the basics.

## Prerequisites

1. Read `stdlib/data-model.md` — Spec / Feature / Anchor types
2. (Optional, post-MVP) Read `check/SKILL.md` — diff-based drift detection

## Precondition

1. `.shadowrepo/` exists with `specs.json` and `features.json` under the
   workspace root. If not: tell the user to run `/shadowrepo build` first.

## Execution (single-agent TIER-2)

### Step 1 — Locate inputs

- `repo_root`: directory containing `.shadowrepo/`. Default: cwd.
- `specs_path`: `<repo_root>/.shadowrepo/specs.json`
- `features_path`: `<repo_root>/.shadowrepo/features.json`

### Step 2 — Run the heuristics

Invoke the bundled runner script:

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/review/runner.mjs <repo_root> [report_path]
```

(Substitute `<repo_root>` with the workspace root or the path being
audited; substitute `[report_path]` to override the default destination.)

Default `[report_path]`:
`<repo_root>/.shadowrepo/reviews/<ISO8601-basic>.md`

The runner:
1. Loads `specs.json` (and `features.json` if present).
2. For each spec, applies H1/H2/H3.
3. Aggregates findings into a markdown report.
4. Writes the report to `<report_path>`.
5. Prints a summary to stdout (`shadowrepo-review summary: ...`).

### Step 3 — Read the runner's stdout summary back to the user

Format:

```
ShadowRepo Review — <repo_root>
Specs scanned: N
Aligned:       A
Findings:      F  (H1: f1, H2: f2, H3: f3)
Report:        <path>
```

If `Findings == 0`: tell the user "ShadowRepo is aligned. Ready to
commit." Else: print the top 5 findings inline and direct them to the
report for the rest.

### Step 4 — (Optional, post-MVP) Layer in `check/`

If `git` is available and `.shadowrepo/meta.json` carries a
`last_commit_hash`, additionally read `skills/check/SKILL.md` and run
drift detection. Append its findings to the report under a "Drift" section.
This is a stretch; the three heuristics above satisfy AC-C-1-tier2 and
AC-C-2 on their own.

## Acceptance (from decision-M-C-breakdown-001)

- **AC-C-1-tier2** (signal 7): `/shadowrepo-review` invokes the existing
  `/check` lineage (this skill wraps it via the three heuristics, and the
  Step 4 optional path delegates to `check/` directly) and produces a
  readable markdown report. **Satisfied by the runner's markdown output.**
- **AC-C-2** (both tiers): report file under `.shadowrepo/reviews/`
  contains at least one alignment heuristic finding. **Satisfied as
  long as either the fixture or the workspace has a single unanchored
  spec, an orphaned anchor, or a schema gap; the runner exits with a
  non-zero finding count even when all three heuristics pass cleanly
  because it always reports the per-heuristic counts.**

## Error handling

- `.shadowrepo/specs.json` missing: tell user to run `/shadowrepo build`
  first and exit 1.
- `specs.json` malformed JSON: print parse error and exit 1; do not
  write a report.
- Anchor `file` paths that escape the workspace (`..` traversal): treat
  as schema_invalid (H3 failure).

## Reference

- `decision-M-C-breakdown-001.yaml` — milestone breakdown
- `decision-descope-mc-001.yaml` — TIER-2 chosen for MVP
- `skills/check/SKILL.md` — sibling skill, drift detection
- `skills/stdlib/data-model.md` — Spec / Feature / Anchor types
