---
name: shadowrepo-build
description: >
  Cold-start a ShadowRepo for a codebase. Scans the entire repo, builds a feature tree
  and spec graph, writes structured JSON to .shadowrepo/. Use when: "build shadowrepo",
  "scan this project", "create a shadow repo", or first-time setup.
---

# ShadowRepo Build

Cold-start: scan the entire repo, build feature tree + spec graph, write to `.shadowrepo/`.

## Prerequisites

1. Read `stdlib/methodology.md` — extraction rules and quality standards
2. Read `stdlib/data-model.md` — types (Spec, Feature, Anchor, Relation)
3. Read `stdlib/recursion-engine.md` — the execution pattern you will follow
4. Read `stdlib/file-discovery.md` — what to include/exclude
5. Read `stdlib/quality-gates.md` — validation checks applied during Merge step

## Precondition Check

1. Check if `.shadowrepo/` already exists in the target repo:
   - If yes: warn user "A shadowRepo already exists. This will rebuild from scratch. Continue?"
   - If user declines: suggest `/shadowrepo check` or `/shadowrepo update` instead
2. Verify the target path is a valid directory with source files

## Execution

### Step 1: Create Root Scope + Build Manifest

Construct the initial scope covering the entire repo:

```
scope = {
  scope_id: "root",
  parent_scope_id: null,
  depth: 0,
  target_repo_path: <current working directory>,
  files: <all source files after applying file-discovery rules>,
  context: {
    existing_features: [],
    existing_specs: [],
    parent_understanding: null
  },
  mode: "full"
}
```

Use Glob to find all files. Apply `file-discovery.md` to classify and filter.

**Build manifest (ground truth for coverage):**
- Record `all_source_files` — the complete filtered file list
- Record `total_source_count` — `len(all_source_files)`
- This list does NOT change across rounds. It is the denominator for all coverage calculations.

### Step 2: Run Recursion Engine (with coverage loop)

Execute up to **3 rounds**. Each round targets uncovered files. The coverage gate (see `quality-gates.md`) is **enforced** — if coverage < 80%, backfill automatically.

#### Round 1 — Full Scan

1. Run `stdlib/recursion-engine.md` with the root scope (all source files)
2. Collect the merge-result (per `contracts/merge-result.md`)
3. Compute coverage:
   - `covered_files` = merge-result.covered_files
   - `coverage_percent` = `len(covered_files) / total_source_count * 100`
4. If `coverage_percent >= 80%` → **DONE**, proceed to Step 3
5. Otherwise: compute `gap_files = all_source_files − covered_files`
6. Report: `"Round 1: {specs} specs, {coverage}% coverage, {gap} files remaining"`

#### Round 2 — Targeted Backfill

1. Create a backfill scope:
   ```
   scope = {
     scope_id: "backfill-r2",
     parent_scope_id: "root",
     depth: 0,
     files: gap_files,
     context: {
       existing_features: <features from round 1>,
       existing_specs: [],
       parent_understanding: "Backfill round: these files were missed in round 1. Extract specs and assign to existing features. Do NOT rebuild the feature tree — use existing_features. Skip the Understand step."
     },
     mode: "full"
   }
   ```
2. Run `stdlib/recursion-engine.md` with the backfill scope
3. **Merge additively** into round 1 results:
   - New specs → append
   - Duplicate spec_ids → keep higher-confidence version
   - Features → merge (keep round 1 tree, add sub-features if discovered)
   - `covered_files` → union of round 1 + round 2
   - `uncovered_files` → recalculate: `all_source_files − covered_files`
4. Recompute `coverage_percent`
5. If `coverage_percent >= 80%` → **DONE**, proceed to Step 3
6. Otherwise: compute remaining `gap_files`
7. Report: `"Round 2: +{new_specs} specs, {coverage}% coverage, {gap} files remaining"`

#### Round 3 — Final Sweep

1. Same pattern as Round 2, with `scope_id: "backfill-r3"`
2. For this round, use **leaf-only extraction**: do NOT split, even if >50 files. Process in batches of 10-15 files directly. This maximizes coverage at the cost of depth.
3. Merge additively into cumulative results
4. Compute final coverage — **this is the final result regardless of percentage**
5. Report: `"Round 3: +{new_specs} specs, {coverage}% coverage (final)"`

#### After All Rounds

- If `coverage_percent >= 80%` → `build_status = "COMPLETE"`
- If `coverage_percent < 80%` → `build_status = "PARTIAL"`

### Step 3: Write Output

After the coverage loop completes, write the final JSON files:

1. `.shadowrepo/features.json` — the feature tree (per `contracts/feature.md`)
2. `.shadowrepo/specs.json` — all specs (per `contracts/spec.md`)
3. `.shadowrepo/coverage.json` — file coverage map:
   ```json
   {
     "covered_files": ["string[] — files with at least one anchored spec"],
     "uncovered_files": ["string[] — files with no specs after all rounds"],
     "coverage_percent": "number"
   }
   ```
4. `.shadowrepo/meta.json` — repo metadata:
   ```json
   {
     "repo_name": "string",
     "repo_path": "string",
     "last_commit_hash": "string | null",
     "built_at": "string — ISO8601",
     "build_status": "'COMPLETE' | 'PARTIAL'",
     "build_rounds": "number — how many rounds were executed (1-3)",
     "stats": {
       "total_files": "number",
       "total_features": "number",
       "total_specs": "number",
       "coverage_percent": "number"
     }
   }
   ```

### Step 3b: Bundle Dashboard

Copy the dashboard template into `.shadowrepo/` with data inlined:

1. Read `dashboard.html` from this skill's directory (alongside this SKILL.md)
2. Replace the four data placeholders with the JSON just written:
   - `/*__SHADOWREPO_META__*/ null` → `/*__SHADOWREPO_META__*/ <meta.json contents>`
   - `/*__SHADOWREPO_FEATURES__*/ null` → `/*__SHADOWREPO_FEATURES__*/ <features.json contents>`
   - `/*__SHADOWREPO_SPECS__*/ null` → `/*__SHADOWREPO_SPECS__*/ <specs.json contents>`
   - `/*__SHADOWREPO_COVERAGE__*/ null` → `/*__SHADOWREPO_COVERAGE__*/ <coverage.json contents>`
3. Write to `.shadowrepo/index.html`

Result: one self-contained HTML file. Double-click to open — no server needed.

### Step 4: Clean Up

- Delete `.shadowrepo/.tmp/` directory (temp agent results from all rounds)

### Step 5: Report

Output a summary to the user (use `ascii-ui.md` Build Completion template):

```
ShadowRepo built {COMPLETE|PARTIAL}.

Features:  {count} ({root_count} root, {sub_count} sub-features)
Specs:     {count} (density: {specs_per_100_files}/100 files)
Coverage:  {percent}% ({covered}/{total} files)
Rounds:    {rounds_used}/3
Types:     {intent}i / {decision}d / {constraint}cn / {contract}ct / {convention}cv / {context}cx / {change}ch

{if PARTIAL}
⚠ Coverage below 80% target. {uncovered_count} files have no specs.
  Largest uncovered areas: {top_3_directories}
{endif}

Written to .shadowrepo/
Dashboard: open .shadowrepo/index.html in a browser
```

## Error Handling

Follow `stdlib/error-handling.md`. Key points:

- If a file can't be read: skip, note in coverage report
- If agent fails: fall back to sequential processing
- If feature tree doesn't converge: present to user for guidance
- If coverage < 80% after round 1: **automatic backfill** — run rounds 2-3 on uncovered files (see `error-handling.md` Coverage Recovery)
- If coverage < 80% after all 3 rounds: save with `build_status: "PARTIAL"`, report honestly to user
- If spec density is outside target: flag in report but still save
