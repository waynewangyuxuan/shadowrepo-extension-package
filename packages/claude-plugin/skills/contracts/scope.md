# Scope Contract

The input to every recursion level. Created by the parent (or by the build skill for the root scope).

## Schema

```json
{
  "scope_id": "string — unique, e.g. 'root', 'src-auth', 'src-auth-oauth'",
  "parent_scope_id": "string | null — null for root",
  "depth": "number — 0 for root, +1 at each level. Max 3.",
  "target_repo_path": "string — absolute path to target repo root",
  "files": ["string — relative paths of source files in this scope"],
  "context": {
    "existing_features": ["Feature[] — features discovered so far (for context)"],
    "existing_specs": ["Spec[] — specs already extracted (for dedup)"],
    "parent_understanding": "string | null — parent's summary of what this scope contains"
  },
  "mode": "'full' | 'incremental'"
}
```

## Invariants

- `files` must not be empty
- `depth` must not exceed 3
- All file paths are relative to `target_repo_path`
- In `incremental` mode, `files` contains only changed files
- `scope_id` is unique within a single build/update run
