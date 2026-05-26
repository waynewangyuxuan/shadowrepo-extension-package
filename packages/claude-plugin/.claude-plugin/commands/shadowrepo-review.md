---
description: Pre-commit alignment review of ShadowRepo. Reads .shadowrepo/ + the working tree and produces a markdown spec-vs-code alignment report under .shadowrepo/reviews/.
allowed-tools: Bash, Read, Glob
---

# /shadowrepo-review

A pre-commit "is the ShadowRepo aligned with the code?" review.

Per `decision-descope-mc-001` this command ships as **TIER-2** (single-agent
wrap) for the MVP. TIER-1 (multi-agent fan-out) is deferred post-MVP.

## What this does

1. Read `${CLAUDE_PLUGIN_ROOT}/skills/review/SKILL.md` and follow it.
2. The skill applies three alignment heuristics to the `.shadowrepo/` in
   the current working directory:
   - **H1 — anchored**: every active spec has at least one anchor.
   - **H2 — anchor-file-exists**: every anchor `file` path resolves on disk.
   - **H3 — schema-validates**: every spec has the required keys per
     `${CLAUDE_PLUGIN_ROOT}/skills/stdlib/data-model.md`.
3. The skill writes a markdown report to `.shadowrepo/reviews/<ISO>.md`
   AND prints a summary to stdout.

## Tier reminder

If a reviewer / planner wants the TIER-1 multi-agent flavor (drift +
anchor-liveness + schema-validator as parallel subagents), see
`decision-M-C-breakdown-001` "Deliverables (TIER-1)" and
`decision-descope-mc-001`. The TIER-2 wrap below satisfies AC-C-1-tier2
and AC-C-2 from `decision-M-C-breakdown-001`.

## Quick fallback

If the review skill is unavailable for any reason, the underlying
`${CLAUDE_PLUGIN_ROOT}/skills/check/SKILL.md` skill remains the source of
truth for code-vs-spec drift and can be invoked directly.
