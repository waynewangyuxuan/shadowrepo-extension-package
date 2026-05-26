# Error Handling

How to handle failures at each step of the recursion engine. Core principle: **degrade gracefully, never hallucinate.**

---

## By Recursion Step

### Sense Failures

| Failure | Response |
|---------|----------|
| Permission denied on file | Skip file, note in uncovered_files |
| File exceeds 100KB | Skip — likely generated or vendored |
| Scope has >1000 files | Partition into sub-scopes before sensing |
| Directory does not exist | Report error to user, abort this scope |

### Understand Failures

| Failure | Response |
|---------|----------|
| Cannot determine feature boundaries | Present file list to user, ask for guidance |
| Feature count outside 10-25 range | Present proposed tree to user for confirmation |
| Files don't cluster naturally | Use directory structure as fallback grouping |

### Extract Failures

| Failure | Response |
|---------|----------|
| File is binary or unreadable | Skip, add to uncovered_files |
| Cannot determine WHY for a file | Skip — no spec is better than a wrong spec |
| Confidence below 0.5 | Do not save the spec |
| Token/context limit approaching | Summarize remaining files, extract only high-level specs |

### Split Failures

| Failure | Response |
|---------|----------|
| Cannot create meaningful sub-scopes | Do not split, process all files at current level |
| Sub-scope would have <5 files | Merge with nearest sibling sub-scope |

### Recurse Failures

| Failure | Response |
|---------|----------|
| Agent tool call fails | Fall back to sequential processing in main context |
| Agent produces malformed output | Discard result, retry once with the Agent tool, then skip that scope |
| Agent times out | Process that scope sequentially in main context |

### Merge Failures

| Failure | Response |
|---------|----------|
| Duplicate spec IDs | Keep higher-confidence version |
| Conflicting feature assignments | Prefer the assignment with more file affinity |
| Quality gate fails | Flag for user review, do not silently drop |
| Coverage gate fails | Return `uncovered_files` list in merge-result. Build skill handles backfill retry. |

---

## General Principles

1. **Skip over hallucinate.** If you cannot confidently extract knowledge, leave it blank.
2. **Report over hide.** When something fails, include it in uncovered_files or report to user.
3. **Fallback over abort.** If parallel fails, go sequential. If git fails, use file system.
4. **Ask over guess.** When ambiguous, present the situation to the user rather than making a silent judgment call.

---

## Coverage Recovery

When build coverage is below 80% after a recursion pass, the **build skill** (not the recursion engine) runs backfill rounds. The recursion engine's job is to report coverage honestly; the build skill decides what to do about it.

Backfill rules:

1. **Only target uncovered files.** Do not re-run the entire recursion. The gap shrinks each round.
2. **Inherit the feature tree** from the previous round. Backfill scopes skip the Understand step — features are already known. Pass `existing_features` in scope context.
3. **Backfill scope ≤50 files → process as leaf** (no split). Most backfill rounds will be small enough.
4. **Backfill scope >50 files → split normally**, but with existing feature context to guide grouping.
5. **Max 3 total rounds** (1 full + 2 backfill). After round 3, accept the result — some files genuinely have no extractable specs.
6. **Each round merges additively** — never discard previous round's specs. New specs append, updated specs replace by `spec_id`, coverage counters recalculate from the union.
