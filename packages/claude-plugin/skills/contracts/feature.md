# Feature Contract

Features organize specs into a tree. Product = root, every source file belongs to exactly one feature.

## Schema

```json
{
  "feature_id": "string — kebab-case slug, e.g. 'user-auth'",
  "name": "string — human-readable, e.g. 'User Authentication'",
  "type": "'business' | 'platform' | 'cross-cutting'",
  "description": "string — one sentence",
  "key_files": ["string — relative paths of files owned by this feature"],
  "parent": "string | null — parent feature_id, null for root features"
}
```

## Tree Invariants

- 10-25 features total, organized in 2-3 levels
- Every source file appears in exactly one feature's `key_files`
- No file appears in two features
- `cross-cutting` features have empty `key_files` (they describe patterns, not code ownership)
- If a feature has >15 files, split into sub-features
- If a feature has <3 files, merge into a sibling or parent
- `parent` references a valid `feature_id` or is null (root level)

## Naming

- kebab-case: `user-auth`, `payment-processing`
- Sub-features: `parent-slug/child-slug` — e.g. `api-gateway/rate-limiting`
- Be specific: prefer `stripe-integration` over `payments-misc`

## File Format

`.shadowrepo/features.json` is an array of Feature objects:

```json
[
  { "feature_id": "auth", "name": "Authentication", "type": "business", "parent": null, ... },
  { "feature_id": "auth/oauth", "name": "OAuth Integration", "type": "business", "parent": "auth", ... }
]
```
