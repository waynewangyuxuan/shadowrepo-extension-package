---
name: shadowrepo
description: >
  Semantic code knowledge graph builder. Scans repos, builds structured feature trees
  and spec graphs, detects code-spec drift, generates documentation.
  Six commands: build, check, update, render, preview, help.
  Use when: /shadowrepo, "build a shadow repo", "check for drift", "update specs",
  "render docs", "what would this change affect", "shadowrepo help".
---

# ShadowRepo

Semantic code knowledge graph — makes the WHY behind code visible to humans and AI.

## Dispatch

Parse the user's command and route to the appropriate sub-skill.

| User says | Route to |
|-----------|----------|
| `/shadowrepo build` or "scan this project" or "create shadowrepo" | `build/SKILL.md` |
| `/shadowrepo check` or "check for drift" or "is shadowrepo current" | `check/SKILL.md` |
| `/shadowrepo update` or "update specs" or "sync shadowrepo" | `update/SKILL.md` |
| `/shadowrepo render` or "generate docs" or "onboarding guide" | `render/SKILL.md` |
| `/shadowrepo preview` or "what would this affect" or "impact assessment" | `preview/SKILL.md` |
| `/shadowrepo help` or "what can shadowrepo do" | `help/SKILL.md` |
| `/shadowrepo` (no subcommand) | `help/SKILL.md` |

## Routing Logic

1. Read the user's message to determine which command they want
2. Read the target sub-skill's SKILL.md
3. Follow that skill's instructions completely

## First-Run Detection

Before routing, check if `.shadowrepo/` exists in the current working directory:

- If `.shadowrepo/` does NOT exist and user requested check/update/render:
  - "No shadowRepo found. Run `/shadowrepo build` first to create one."
  - Offer to run build instead

- If `.shadowrepo/` does NOT exist and user requested build:
  - Proceed normally

## Shared Resources

All sub-skills may reference files in:
- `stdlib/` — shared methodology, data model, recursion engine, quality gates
- `contracts/` — JSON schemas for data flowing between modules

Sub-skills specify which stdlib files they need in their Prerequisites section. Load only what's needed to manage context efficiently.
