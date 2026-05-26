# Check Result Contract

The output of the check skill. Describes drift between code and existing specs.

## Schema

```json
{
  "checked_at": "string — ISO8601 timestamp",
  "git_range": "string — e.g. 'abc123..HEAD'",
  "changed_files": {
    "modified": ["string[] — files with content changes"],
    "added": ["string[] — new files not in any spec anchor"],
    "deleted": ["string[] — removed files that specs still anchor to"],
    "renamed": ["{ from: string, to: string }[] — renamed/moved files"]
  },
  "drifts": [
    {
      "spec_id": "string — the affected spec",
      "drift_type": "'content_changed' | 'anchor_orphaned' | 'anchor_missing'",
      "severity": "'high' | 'medium' | 'low'",
      "affected_files": ["string[] — which changed files triggered this drift"],
      "summary": "string — human-readable description of what changed and how it affects the spec"
    }
  ],
  "new_file_gaps": ["string[] — added files with no spec coverage"],
  "stats": {
    "files_changed": "number",
    "specs_affected": "number",
    "new_files_unanchored": "number",
    "orphaned_anchors": "number"
  }
}
```

## Drift Types

- `content_changed` — file was modified, spec's described logic may no longer hold
- `anchor_orphaned` — file was deleted, spec's anchor points to nothing
- `anchor_missing` — file was renamed, anchor path is stale (but file still exists under new name)

## Severity Rules

- **high** — contract or constraint spec affected (breaking changes likely)
- **medium** — intent or decision spec affected (semantics may have shifted)
- **low** — convention or context spec affected (may still hold)
