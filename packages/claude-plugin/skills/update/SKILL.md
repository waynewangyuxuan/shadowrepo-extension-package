---
name: shadowrepo-update
description: >
  Update ShadowRepo based on detected drift. Runs check first, then does a scoped
  rebuild on affected areas. Use when: "update shadowrepo", "sync specs",
  "fix drift", "bring shadowrepo up to date".
---

# ShadowRepo Update

Run check → scoped rebuild on drift areas → merge back into `.shadowrepo/`.

## Prerequisites

1. Read `stdlib/methodology.md` — extraction rules
2. Read `stdlib/data-model.md` — types
3. Read `stdlib/recursion-engine.md` — for scoped rebuild
4. Read `stdlib/git-operations.md` — for change detection
5. Read `stdlib/quality-gates.md` — validation checks applied during Merge step

## Precondition Check

Same as check: `.shadowrepo/` must exist, must be a git repo.

## Execution

### Step 1: Run Check

Execute the check skill logic (from `check/SKILL.md`). The check result stays in conversation context as an intermediate value — no file I/O needed.

If no drifts found: report "ShadowRepo is up to date. Nothing to update." and stop.

### Step 2: Present Drift Summary

Show the user what was found (same format as check output). Then:

"Found {count} drifts. Proceeding with update."

### Step 3: Handle Each Drift Type

**For `content_changed` drifts:**
- Create an incremental scope containing the affected files
- Run the recursion engine in `incremental` mode
- The engine re-reads files, re-extracts specs, produces updated specs
- Merge: replace old spec versions with new ones (match by spec_id)

**For `anchor_orphaned` drifts (deleted files):**
- Mark affected specs as `stale` (set `state: "stale"`, update `updated_at`)
- If a spec's ONLY anchor was the deleted file, the spec itself is orphaned
- If a spec has other valid anchors, just remove the orphaned anchor

**For `anchor_missing` drifts (renamed files):**
- Update anchor paths from old name to new name
- No need to re-extract — the knowledge hasn't changed, just the location

**For new file gaps:**
- Create an incremental scope containing the new files
- Run the recursion engine to extract specs for them
- Assign new files to appropriate features (may need to update feature tree)

### Step 4: Merge Results

Load existing `.shadowrepo/specs.json` and `.shadowrepo/features.json`.

Merge changes:
1. Updated specs → replace by spec_id
2. New specs → append
3. Stale specs → update state field
4. Updated anchors → replace in place
5. New features or feature changes → merge into tree

Apply `quality-gates.md` to the merged result.

### Step 5: Write Output

Overwrite `.shadowrepo/` files with merged data:
- `specs.json` — updated specs
- `features.json` — updated features (if changed)
- `coverage.json` — recalculated coverage
- `meta.json` — update `last_commit_hash` and timestamp

Clean up `.shadowrepo/.tmp/` if used.

Re-bundle the dashboard: same as build Step 3b — read `build/dashboard.html` template, replace data placeholders, write `.shadowrepo/index.html`.

### Step 6: Report

```
ShadowRepo Update Complete.

Resolved:   {resolved_count} drifts
  Updated:  {updated} specs re-extracted
  Staled:   {staled} specs marked stale
  Fixed:    {fixed} anchors updated (renames)
  New:      {new} specs from new files

Specs:      {total} total ({active} active, {stale} stale)
Coverage:   {percent}%
```

## Error Handling

- Check fails: report check error, do not proceed with update
- Partial agent failure during scoped rebuild: report which scopes failed, save what succeeded
- Merge conflict (two scopes produce conflicting spec updates): keep higher-confidence version, flag to user
