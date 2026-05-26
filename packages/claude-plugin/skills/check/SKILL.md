---
name: shadowrepo-check
description: >
  Detect drift between code and existing ShadowRepo specs. Compares git changes against
  spec anchors to find content changes, orphaned anchors, and uncovered new files.
  Use when: "check for drift", "is shadowrepo up to date", "what specs are stale".
---

# ShadowRepo Check

Detect drift between current code and existing specs. Read-only — does not modify `.shadowrepo/`.

## Prerequisites

1. Read `stdlib/data-model.md` — understand Spec and Anchor types
2. Read `stdlib/git-operations.md` — how to get changed files

## Precondition Check

1. Verify `.shadowrepo/` exists with `specs.json` and `features.json`
   - If not: "No shadowRepo found. Run `/shadowrepo build` first."
2. Verify this is a git repository (`.git/` exists)
   - If not: "Check requires git history to detect changes."

## Execution

### Step 1: Determine Reference Point

Read `.shadowrepo/meta.json` to get `last_commit_hash`.

- If `last_commit_hash` exists: use it as the `since_ref`
- If not: use `HEAD~20` as fallback, warn user

### Step 2: Get Changed Files

Follow `stdlib/git-operations.md` to get:
- Modified files: `git diff --name-only --diff-filter=ACMR {since_ref}`
- Deleted files: `git diff --name-only --diff-filter=D {since_ref}`
- Renamed files: `git diff --name-only -M --diff-filter=R {since_ref}`

Filter results through `stdlib/file-discovery.md` — only care about source files.

### Step 3: Load Existing Specs

Read `.shadowrepo/specs.json`. Build a lookup:
- **file → specs**: for each anchor's `file` field, map to the spec(s) that anchor to it
- This is many-to-many: one file can have multiple specs, one spec can anchor multiple files

### Step 4: Analyze Drift

For each changed file:

1. Look up all specs anchored to this file
2. Read the current file content
3. For each anchored spec, evaluate: **does the spec's described logic still hold?**
   - Read the spec's `summary`, `detail`, and `evidence`
   - Compare against the current code
   - Classify the drift:
     - `content_changed` — the code changed in a way that may invalidate the spec
     - `anchor_orphaned` — the file was deleted
     - `anchor_missing` — the file was renamed (anchor path is stale)

4. Assign severity:
   - **high** — contract or constraint spec affected
   - **medium** — intent or decision spec affected
   - **low** — convention or context spec affected

For added files (not in any spec anchor):
- Add to `new_file_gaps` — these are uncovered new code

### Step 5: Produce Check Result

Construct the result per `contracts/check-result.md`. Do NOT write to `.shadowrepo/` — check is read-only.

**Lifecycle:**
- **Standalone run** (`/shadowrepo check`): the result lives in conversation context only. Output the report (Step 6) and discard.
- **Called by update** (`/shadowrepo update`): the result is held in conversation context as an intermediate value. Update's Step 3 reads it directly — no file I/O needed.

### Step 6: Report

Output to user:

```
ShadowRepo Check — {since_ref_short}..HEAD

Files changed:  {modified} modified, {added} added, {deleted} deleted
Specs affected: {count} ({high} high, {medium} medium, {low} low)
New gaps:       {new_file_count} uncovered new files

Drifts:
  [{severity}] {spec_id} — {summary}
  [{severity}] {spec_id} — {summary}
  ...

Run `/shadowrepo update` to resolve these drifts.
```

If no drifts found:
```
ShadowRepo Check — {since_ref_short}..HEAD

No drift detected. ShadowRepo is up to date.
```

## Error Handling

- Git unavailable: abort with clear message
- specs.json malformed: abort, suggest rebuild
- File in diff no longer exists (deleted between diff and check): treat as deleted
