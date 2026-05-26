# Quality Gates

Validation checkpoints applied during the Merge step of recursion and during final output. A gate failure doesn't abort — it flags for review or correction.

---

## Spec Quality Gate

Applied to each individual spec before saving.

| Check | Pass Criteria | On Failure |
|-------|--------------|------------|
| Summary captures WHY | Does not restate what the code does | Rewrite or discard |
| Has anchors | At least one anchor with valid `file` path | Discard — anchors are non-negotiable |
| Confidence >= 0.5 | Score meets minimum threshold | Discard |
| spec_id format | Matches `{feature}/{type}/{slug}` pattern | Fix the ID |
| No duplicate | No existing spec with same anchors + same knowledge | Merge with existing or discard |

## Feature Tree Gate

Applied after merging all features.

| Check | Pass Criteria | On Failure |
|-------|--------------|------------|
| Feature count | 10-25 features total | Merge small features or split large ones |
| Tree depth | 2-3 levels max | Flatten or restructure |
| Tree hierarchy | >= 60% of features have non-null `parent` | Run Merge step 6b to link orphan features |
| Feature types | All types in {`business`, `platform`, `cross-cutting`} | Reclassify per `methodology.md` Section 1 |
| File coverage | Every source file in exactly one feature | Assign orphans, resolve duplicates |
| Cross-cutting files | Cross-cutting features have empty key_files | Move files to business/platform features |
| Size bounds | No feature with >15 files, none with <3 | Split or merge |

## Coverage Gate

Applied after all extraction is complete.

| Check | Pass Criteria | On Failure |
|-------|--------------|------------|
| File coverage | >= 80% of source files have at least one anchored spec | **ENFORCE:** return `uncovered_files` list to caller. Build skill runs backfill round. |
| Feature coverage | Every feature has at least one spec | Extract for bare features |

## Density Gate

Applied to the final spec set.

| Repo Size | Target Spec Count | Tolerance |
|-----------|-------------------|-----------|
| Small (<100 files) | 50-100 specs | ±30% |
| Medium (100-500 files) | 150-200 specs | ±25% |
| Large (>500 files) | 200-400 specs | ±25% |

On failure: if too few, flag under-extracted areas. If too many, flag potential "WHAT not WHY" specs for review.

## Relation Gate

| Check | Pass Criteria | On Failure |
|-------|--------------|------------|
| Relation coverage | 20-30% of specs have at least one relation | Look for cross-feature dependencies |
| No orphan supersedes | Every `supersedes` target is marked `stale` | Mark target as stale |

## Confidence Distribution

A healthy extraction has a bell curve around 0.7-0.8:
- <10% of specs at 0.5 (educated guesses should be rare)
- 40-60% of specs at 0.7-0.8 (strong inferences)
- 20-30% of specs at 0.9 (directly observable facts)

Skewed low = too much guessing. Skewed high = may be restating obvious facts (WHAT not WHY).

## Gate Enforcement Levels

Not all gates are equal. Some block, some retry, some advise.

| Gate | Level | Behavior |
|------|-------|----------|
| Spec Quality | **Hard** | Discard failing specs immediately — no exceptions |
| Feature Tree | Soft | Flag, auto-correct where possible (merge/split) |
| Coverage | **Enforced** | Triggers backfill rounds in the build skill |
| Density | Advisory | Flag in report, no automatic retry |
| Relation | Advisory | Flag in report, no automatic retry |
| Confidence | Advisory | Flag in report, no automatic retry |

**Enforced** means the calling skill (build) will re-run extraction for uncovered areas. The coverage gate returns structured data so the caller can act on it:

```json
{
  "passed": "boolean",
  "coverage_percent": "number",
  "covered_files": ["string[]"],
  "uncovered_files": ["string[]"]
}
```

This structured result is what the build skill's backfill loop consumes. See `build/SKILL.md` Step 2.
