# Data Model

Core types for the ShadowRepo knowledge graph. All JSON files in `.shadowrepo/` conform to these types.

---

## Spec

The atomic unit of semantic knowledge. One spec = one piece of "why" behind code.

**Fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| spec_id | string | yes | `{feature_slug}/{type}/{short_slug}` e.g. `auth/decision/jwt-over-sessions` |
| feature_name | string | yes | Owning feature's feature_id |
| type | SpecType | yes | What kind of knowledge this captures |
| summary | string | yes | One sentence — the WHY, not the WHAT |
| detail | string | no | Extended context, examples, history |
| evidence | string | no | Code location or reasoning chain |
| anchors | Anchor[] | yes | At least one. Code locations this spec describes |
| relations | Relation[] | no | Links to other specs |
| confidence | number | yes | 0.5–1.0. Below 0.5 = do not save |
| provenance | Provenance | yes | Where the knowledge came from |
| state | SpecState | yes | `active` or `stale` |
| created_at | string | yes | ISO8601 |
| updated_at | string | yes | ISO8601 |

## Feature

Organizes specs into a tree. Every source file belongs to exactly one feature.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| feature_id | string | yes | kebab-case slug |
| name | string | yes | Human-readable name |
| type | FeatureType | yes | business, platform, or cross-cutting |
| description | string | yes | One sentence |
| key_files | string[] | yes | Source files owned by this feature (empty for cross-cutting) |
| parent | string | no | Parent feature_id. Null = root level |

## Anchor

A code location that a spec describes.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| file | string | yes | Relative path from repo root. No directories |
| symbols | string[] | no | Function/class/export names |
| line_range | [number, number] | no | Start and end line numbers |

## Relation

A link between two specs.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| type | RelationType | yes | Nature of the relationship |
| target_spec_id | string | yes | The other spec |
| strength | `hard` \| `soft` | no | Only for `depends_on` |
| description | string | no | Why they're related |

## Enums

| Enum | Values |
|------|--------|
| SpecType | `intent`, `decision`, `constraint`, `contract`, `convention`, `context`, `change` |
| SpecState | `active`, `stale` |
| Provenance | `code_scan`, `documentation`, `git_history` |
| FeatureType | `business`, `platform`, `cross-cutting` |
| RelationType | `depends_on`, `conflicts_with`, `supersedes`, `relates_to` |
