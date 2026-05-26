---
name: shadowrepo-render
description: >
  Generate human-readable documentation from ShadowRepo data. Supports onboarding guides,
  architecture overviews, feature deep-dives, and changelogs. Runs check first to ensure
  specs are current. Use when: "render docs", "generate onboarding guide", "architecture overview".
---

# ShadowRepo Render

Generate human-readable docs from `.shadowrepo/` data.

## Prerequisites

1. Read `stdlib/data-model.md` — understand the types

## Precondition Check

1. `.shadowrepo/` must exist with `specs.json` and `features.json`
   - If not: "No shadowRepo found. Run `/shadowrepo build` first."

2. Optional freshness check:
   - If this is a git repo and git is available: run check logic to detect drifts
   - If drifts found: warn user "ShadowRepo has {count} drifts. Docs may be stale. Run `/shadowrepo-update` first, or continue anyway?"
   - If user continues, git unavailable, or not a git repo: proceed with current data

## Determine Format

Parse user intent to determine output format:

- "onboarding guide" / "new developer guide" → `onboarding`
- "architecture overview" / "system overview" → `architecture`
- "tell me about {feature}" / "deep dive on {feature}" → `feature-detail`
- "what changed" / "changelog" → `changelog`
- Anything else → `custom` — ask user what they want

## Render Logic

### onboarding

Read features.json and specs.json. Produce:

1. **Project Overview** — from root features + high-confidence context specs
2. **Architecture** — feature tree visualization, major decisions
3. **Key Constraints** — all constraint specs, sorted by confidence
4. **Conventions** — all convention specs (what patterns to follow)
5. **Getting Started** — key files per feature, active change specs (what's in flux)

### architecture

1. **Feature Tree** — visual tree with descriptions and file counts
2. **Key Decisions** — all decision specs with rationale
3. **Cross-Cutting Patterns** — cross-cutting features with their specs
4. **Dependencies** — specs with `depends_on` / `conflicts_with` relations
5. **Coverage Map** — which areas are well-documented vs sparse

### feature-detail

For a specific feature:

1. **Overview** — feature description, type, file count
2. **All Specs** — grouped by type, sorted by confidence
3. **Related Specs** — specs from other features that reference this feature's specs
4. **Files** — key_files list with brief description of each

### changelog

Compare current specs.json against the previous state (from git or snapshots):

1. **New Specs** — recently created
2. **Updated Specs** — recently modified
3. **Stale Specs** — recently marked stale
4. **Drift Resolved** — what was fixed in the last update

### custom

Ask the user: "What kind of document do you need? Who is the audience?"
Then compose from available specs based on their answer.

## Output

Write the rendered markdown to the location the user specifies, or output directly in the conversation.

Per `contracts/render-output.md`: track which spec_ids contributed to the document.
