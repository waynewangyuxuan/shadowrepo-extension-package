# Spec Contract

The atomic unit of semantic knowledge. Each spec captures one piece of "why" behind code.

## Schema

```json
{
  "spec_id": "string — format: {feature_slug}/{type}/{short_slug}",
  "feature_name": "string — owning feature's feature_id",
  "type": "'intent' | 'decision' | 'constraint' | 'contract' | 'convention' | 'context' | 'change'",
  "summary": "string — one sentence, captures WHY not WHAT",
  "detail": "string | null — extended context, examples, history",
  "evidence": "string | null — code location or reasoning chain",
  "anchors": [
    {
      "file": "string — relative path (required)",
      "symbols": ["string — function/class names (optional)"],
      "line_range": [0, 0]
    }
  ],
  "relations": [
    {
      "type": "'depends_on' | 'conflicts_with' | 'supersedes' | 'relates_to'",
      "target_spec_id": "string",
      "strength": "'hard' | 'soft' | null — only for depends_on",
      "description": "string | null"
    }
  ],
  "confidence": "number — 0.5 to 1.0 (below 0.5 = do not save)",
  "provenance": "'code_scan' | 'documentation' | 'git_history'",
  "state": "'active' | 'stale'",
  "created_at": "string — ISO8601",
  "updated_at": "string — ISO8601"
}
```

## Validation Rules

- `spec_id` must match: `^[a-z0-9-]+(\/[a-z0-9-]+){2}$`
- `anchors` must have at least one entry
- Each anchor must have a non-empty `file` field (relative path, no directories)
- `confidence` must be >= 0.5
- `summary` must describe WHY, not WHAT the code does
- `state` defaults to `'active'` on creation

## File Format

`.shadowrepo/specs.json` is an array of Spec objects:

```json
[
  { "spec_id": "auth/decision/jwt-over-sessions", ... },
  { "spec_id": "auth/contract/token-refresh-flow", ... }
]
```
