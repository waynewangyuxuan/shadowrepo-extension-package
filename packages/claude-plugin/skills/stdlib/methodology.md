# Extraction Methodology

The core rules for distilling semantic knowledge from code. This is the identity of what ShadowRepo extracts and how quality is maintained.

Load this file at the start of any extraction work (build, update).

---

## 1. Feature Tree Construction

### Classification

| Type | Definition | Owns files? |
|------|-----------|-------------|
| **business** | Delivers direct user value: a user-facing capability or workflow | Yes |
| **platform** | Technical infrastructure consumed by multiple business features | Yes |
| **cross-cutting** | Patterns, conventions, or constraints spanning >50% of modules | No — describes patterns, does not own files |

### Tree Rules

- Root features represent major subsystems. Sub-features represent distinct capabilities within a subsystem.
- If a feature accumulates >15 `key_files`, split it into sub-features.
- If a feature has <3 `key_files`, merge into a sibling or parent.
- Every source file belongs to exactly one feature's `key_files`. No unassigned files, no duplicates.
- Cross-cutting features have empty `key_files`. They describe patterns observed across other features' files.
- Parent field uses the parent's `feature_id`. Root features have no parent.
- Target: 10-25 features in 2-3 levels.

### Naming

- kebab-case: `user-auth`, `payment-processing`, `database-migrations`
- Sub-features: `parent-slug/child-slug` — e.g. `api-gateway/rate-limiting`
- Be specific. Prefer `error-handling` over `utils`. Prefer `stripe-integration` over `payments-misc`.

---

## 2. Spec Types — What to Extract

For each type: extract it when you see the trigger signal. Capture WHY (valuable), not WHAT (worthless).

### intent

**Trigger:** A module/class/function exists to solve a specific problem, and the reason is not obvious from its name.

- Good: "TokenBucket exists because the payment API enforces 100 req/s with no retry-after header, so the app must self-throttle."
- Bad: "Implements a token bucket algorithm for rate limiting."

### contract

**Trigger:** An interface, API boundary, or data format that other code depends on. Breaking it would cause failures elsewhere.

- Good: "Webhook handlers must return 200 within 5s or Stripe retries 3x with exponential backoff. event.type determines routing; unrecognized types must be accepted silently (200)."
- Bad: "The webhook endpoint receives POST requests and returns 200."

### convention

**Trigger:** A repeated pattern across 3+ files not enforced by linter or type system.

- Good: "All repos return null (not exceptions) for not-found because the service layer distinguishes 'missing' (create default) vs 'error' (propagate). Not type-enforced — new repos must follow manually."
- Bad: "Repository classes return null when not found."

### constraint

**Trigger:** A limitation, invariant, or non-obvious restriction that must be preserved. Often discovered after a bug.

- Good: "DB connections must not be held across await boundaries because pool is limited to 10; a slow downstream call would starve other requests. Introduced after 2024-03 outage."
- Bad: "The connection pool size is 10."

### decision

**Trigger:** A technology choice or architectural pattern where alternatives existed and the choice was deliberate.

- Good: "JWT with 15-min tokens + refresh chosen over server-side sessions because the system runs across 3 regions and session replication added ~200ms latency."
- Bad: "The application uses JWT for authentication."

### context

**Trigger:** Background knowledge needed to understand a subsystem — history, business domain, external dependencies.

- Good: "legacy_account_id maps to v1 billing (deprecated Q2 2024). Preserved in responses because mobile app v3.x (18% traffic) uses it for deep linking. Safe to remove after v3.x sunset."
- Bad: "The account model has a legacy_account_id field from an older system."

### change

**Trigger:** An active migration, deprecation, or planned refactor that is partially complete.

- Good: "Migrating REST→GraphQL. New code in graphql/, old frozen in rest/, both parallel. REST removal blocked on mobile app v4.0 (ETA Q3). Controllers with GraphQL equivalent marked @deprecated."
- Bad: "The project is migrating from REST to GraphQL."

### Granularity

- One spec = one piece of knowledge. If >3 sentences in summary → split.
- If two specs always apply together and neither makes sense alone → merge.
- Use `detail` for extended context. A spec with only `summary` is fine if simple.

---

## 3. Anchor Quality

### Required

Every anchor must have a `file` field (relative path). Non-negotiable.

Optional but recommended: `symbols` (function/class names), `line_range` (when spec applies to a specific section).

### Multi-File Anchoring

Anchor a spec to ALL files it applies to:
- **Convention** — every file following the convention (or representative 3-5 if >10)
- **Interface contract** — the interface definition AND its implementations
- **Decision** — the config file AND usage sites relying on the decision

### No Directory Anchors

Directories are not valid. Always anchor to specific files.

---

## 4. Relations

### When to Add

- During extraction: `depends_on` / `conflicts_with` when directly observable
- During synthesis (merge step): `relates_to` / `supersedes` for cross-feature patterns

### Types

| Type | Meaning |
|------|---------|
| `depends_on` | This spec assumes the target is true. If target changes, this may need updating |
| `conflicts_with` | Both true, but pull in opposite directions (tension/tradeoff) |
| `supersedes` | Replaces the target. Target must be marked `stale` |
| `relates_to` | Useful to read together, but no direct dependency |

### Discipline

- Target ~20-30% of specs having at least one relation
- `depends_on` and `conflicts_with` carry strong signal — use whenever real
- `relates_to` is weakest — use sparingly
- `supersedes` must pair with marking target spec `stale`

---

## 5. Confidence Calibration

| Score | Criteria | Example |
|-------|----------|---------|
| **0.9** | Directly observable: explicit comment, config, unambiguous code | `// IMPORTANT:` comment on a timeout value |
| **0.8** | Clear from structure: naming, module org, types | `RetryPolicy` class with `maxRetries` and `backoffMs` |
| **0.7** | Strong inference from 2+ files: consistent pattern | Every repo returning null for not-found (5+ examples) |
| **0.6** | Reasonable single-file inference with supporting context | `TODO: remove after v4 launch` comment |
| **0.5** | Educated guess — must state reasoning in `detail` | "Service likely handles idempotency via requestId + DB constraint" |
| **<0.5** | **Do not save.** Insufficient evidence. | Guessing from a variable name alone |

---

## 6. Core Principles

- **Extract the WHY, not the WHAT.** A spec that restates code is worthless.
- **Every spec needs at least one anchor.** The `file` field is required.
- **When unsure, skip.** An empty shadowRepo is better than an inaccurate one.
- **Depth vs breadth:** Spend more effort on business features (most non-obvious knowledge). For cross-cutting, breadth matters more.
- **Density target:** ~150-200 high-quality specs per medium repo (~200-500 files). Scale linearly.
