# Merge Result Contract

The output of each recursion agent. Written to a temp file, collected by the synthesizer.

## Schema

```json
{
  "scope_id": "string — matches the input scope's scope_id",
  "features": ["Feature[] — discovered/updated features at this scope level"],
  "specs": ["Spec[] — extracted specs"],
  "covered_files": ["string[] — files with ≥1 anchored spec in this result"],
  "uncovered_files": ["string[] — files in scope that have no anchored spec (skipped, errored, or yielded no extractable knowledge)"],
  "stats": {
    "files_in_scope": "number — total files in the input scope",
    "files_read": "number — files actually opened and analyzed",
    "files_with_specs": "number — files appearing in ≥1 spec anchor",
    "specs_extracted": "number"
  }
}
```

### Field semantics

- `covered_files ∪ uncovered_files` MUST equal the input scope's file list. No file may be silently dropped.
- `covered_files` = files appearing as an anchor in at least one spec in `specs[]`.
- `uncovered_files` = everything else: files that were skipped (too large, binary), files that were read but yielded no spec, and files that were never reached (lost during split/recurse).
- `stats.files_with_specs` = `len(covered_files)`. Redundant but convenient for quick checks.

## Temp File Protocol

Each agent writes its result to: `.shadowrepo/.tmp/{scope_id}.json`

- File name = scope_id with `/` replaced by `--` (e.g. `src--auth.json`)
- Only the agent for that scope writes to that file
- Synthesizer reads all temp files, merges, then deletes `.shadowrepo/.tmp/`

## Merge Rules

When synthesizer combines multiple merge-results:

1. **Features**: Deduplicate by `feature_id`. If two scopes discovered the same feature, keep the one with more `key_files`.
2. **Specs**: Deduplicate by anchor overlap. If two specs anchor to the same file with overlapping knowledge, keep the higher-confidence one.
3. **Uncovered files**: Union of all uncovered files.
4. **Stats**: Sum across all results.
