# Recursion Engine

The universal execution pattern for ShadowRepo. Every recursion level performs the same steps. Build, check, and update all invoke this engine with different scopes.

Load `methodology.md` and `data-model.md` before running this engine.

---

## Input

A Scope object (see `contracts/scope.md`):
- `scope_id`, `depth`, `files`, `mode`, and parent context

## The Recursion Step

Every level performs these six operations in order.

### 1. Sense

Read files in the current scope to understand what this code does.

**How:**
- Use Glob to inventory the scope's files
- Apply `file-discovery.md` classification rules: separate source, config, doc, test, other
- Read key files: manifests first (package.json, etc.), then README/docs, then source
- For large scopes: read directory structure + manifests + docs first, defer full source reads to Extract

**Output:** File inventory with classifications. An initial understanding of what this scope's code does.

### 2. Understand

Form or update feature understanding for this scope level.

**How:**
- Based on the file inventory and initial reading, identify features at this level
- If root level, build the tree in two passes:
  1. **Identify 5-8 root features** — major subsystems visible from top-level directories and manifests. Each root must be typed as exactly one of: `business`, `platform`, or `cross-cutting` (no other types — see `methodology.md` classification table). Root features represent coarse ownership boundaries (e.g. `api`, `auth`, `data-pipeline`, `shared-infra`).
  2. **Nest sub-features under roots** — for each root, identify 1-4 distinct capabilities as sub-features. Set `parent` to the root's `feature_id`. Use `parent-slug/child-slug` naming (e.g. `auth/oauth`, `auth/jwt`). A sub-feature inherits its parent's type unless it clearly belongs to a different type. The total tree should have 10-25 features across 2-3 levels.
  3. **Validate before proceeding:** every feature has `type` in {`business`, `platform`, `cross-cutting`}. Every non-root feature has a valid `parent`. At least 60% of features have a non-null `parent`.
- If sub-level: propose sub-features within the parent's scope. Set `parent` to the parent scope's feature. Do not create new root features at sub-levels.
- Apply `methodology.md` feature tree rules (classification, naming, file assignment)
- In `incremental` mode: load existing features from `.shadowrepo/features.json`, only adjust affected areas

**Output:** Preliminary feature assignments for files in this scope. The feature list MUST form a tree (not a flat list).

### 3. Extract

Read source files and extract specs.

**How:**
- Read source files (batch: use Read tool, up to 10 files per batch for efficiency)
- Assign each spec to a feature. The feature's `type` MUST be one of: `business`, `platform`, `cross-cutting`. Do not invent other types (no `library`, `adapter`, `framework`, `ui`, etc.). If unsure, use `platform`.
- For each file, apply `methodology.md` spec type triggers
- Capture WHY, not WHAT. Follow the good/bad examples in methodology
- Apply confidence calibration from methodology
- Create anchors for each spec (multi-file when applicable)
- Add `depends_on` / `conflicts_with` relations when directly observable

**File tracking (non-negotiable):**
- Maintain a checklist of every file in this scope
- As each file is read, mark it `read`
- If ≥1 spec was extracted with an anchor to that file, mark it `covered`
- Files read but yielding no spec → add to `uncovered_files` in the merge-result
- Files never read (skipped due to size, binary, error) → add to `uncovered_files`
- At the end of Extract, every file in the scope MUST be in exactly one bucket: `covered` or `uncovered`

**Output:** Array of Spec objects for this scope, plus the file checklist (covered/uncovered).

### 4. Split (decision point)

Evaluate whether to recurse deeper.

**Criteria:**
- If scope has **> 50 source files** → SPLIT
- If scope has **<= 50 source files** → DO NOT SPLIT, this level is the leaf
- If `depth` >= 3 → DO NOT SPLIT regardless (max depth safety)

**How to split:**
- Group files by directory structure first
- Then by feature affinity (files belonging to the same feature stay together)
- Target sub-scopes of 15-25 files each
- Create a Scope object for each sub-scope (per `contracts/scope.md`)
- Pass down: current feature understanding, existing specs (for dedup), parent summary

**Completeness check (non-negotiable):**
- After creating all sub-scopes, verify: `union(sub_scope.files for all sub-scopes) == this_scope.files`
- If any files are missing from sub-scopes, create a **remainder sub-scope** containing them
- Log: `"Split into {n} sub-scopes covering {total} files ({remainder} in remainder scope)"`
- This prevents the primary source of file loss — imperfect splitting

### 5. Recurse (conditional)

If split: spawn parallel agents for each sub-scope using the Claude Code **Agent tool**.

**How:**
- Use the Agent tool to launch one agent per sub-scope. Launch all agents in a single message to maximize parallelism.
- Each agent's prompt includes: this engine definition (`recursion-engine.md`) + `methodology.md` + `data-model.md` + its sub-scope object + the parent-level feature tree (so sub-agents create sub-features under existing roots, not new root features)
- Each agent writes its result to `.shadowrepo/.tmp/{scope_id}.json` (per `contracts/merge-result.md`)
- Agents work independently — no cross-agent communication, no shared writes
- Each agent runs this same engine from Step 1

If not split: skip to Merge. The current level's Extract output is the final result.

### 6. Merge

Collect and synthesize results.

**If agents were spawned:**
- Read all `.shadowrepo/.tmp/{child_scope_id}.json` files
- Merge features: deduplicate by `feature_id`, keep version with more `key_files`
- Merge specs: deduplicate by anchor overlap, keep higher-confidence version
- Collect uncovered files from all children

**Always (whether agents were spawned or not), run these sub-steps in order:**

**6a. Enforce feature type constraint:**
- Scan all features. Any feature with `type` not in {`business`, `platform`, `cross-cutting`} MUST be reclassified using the definitions in `methodology.md` Section 1 Classification table. If unclear, default to `platform`.

**6b. Link orphan features into a tree:**
- Collect all features where `parent` is null — these are current roots.
- Target: 5-8 root features. If there are more orphan roots:
  1. Group orphan features by directory proximity (features whose `key_files` share a common parent directory likely belong together).
  2. For each group, pick the broadest feature as the root and set the others' `parent` to it. Update their `feature_id` to use `parent-slug/child-slug` naming.
  3. If an orphan doesn't fit any group, check if it is a subset of an existing root's file directories — if so, make it a sub-feature of that root.
- After linking, verify: at least 60% of features have a non-null `parent`. If not, repeat grouping with looser affinity (shared top-2 directory levels).
- Apply size bounds: split features with >15 files, merge features with <3 files into the nearest sibling or parent.
- Correct feature tree based on bottom-up discoveries (a sub-scope may reveal that the parent's feature split was wrong).

**6c. Synthesize cross-scope anchors:**
- For each `convention` and `contract` spec, check if files from OTHER scopes follow the same pattern:
  1. Collect the spec's anchor file paths. Identify the pattern (e.g. "all files matching `src/repos/*.ts` return null for not-found").
  2. Search other scopes' file lists for files matching the same pattern (same directory, same suffix, same naming convention).
  3. Add those files as additional anchors to the existing spec. For conventions with >10 matching files, anchor to a representative 3-5.
- For each `decision` spec, check if usage sites exist in other scopes. Add those as anchors.
- Goal: conventions and contracts should average 3+ anchors. Single-anchor specs should drop below 60%.

**6d. Build cross-scope relations:**
- Perform a pairwise scan of specs from different features/scopes:
  1. **Same-pattern dedup:** If two specs from different scopes describe the same convention or constraint (similar summary, overlapping anchor directories), MERGE them into one spec with combined anchors. Keep the higher-confidence version's summary.
  2. **depends_on:** If spec A's anchor imports/calls code anchored by spec B, add `depends_on` from A to B.
  3. **relates_to:** If specs from different features share the same anchor file, add `relates_to` between them (the file is a boundary point).
  4. **Cross-cutting linkage:** For each `cross-cutting` feature's specs, add `relates_to` links to the `business`/`platform` specs whose anchors exhibit the described pattern.
- Target: 20-30% of specs should have at least one relation. If below 20% after this pass, make a second pass looking for specs whose summaries reference the same domain concept (e.g. "retry", "auth", "caching").

**6e. Reconcile and validate:**
- Ensure tree invariants hold (every file assigned to exactly one feature, 10-25 features, 2-3 levels)
- Apply `quality-gates.md` checks: density, coverage, confidence distribution, relation coverage
- Final verification: all feature types valid, all non-root features have valid parent, relation coverage >= 20%

**Coverage verification (non-negotiable):**
- Compute `covered_files` = union of all files appearing in any spec anchor across all child results
- Compute `missed_files` = `scope.files − covered_files − uncovered_files`
- If `missed_files` is non-empty: these are files that were in the scope but never appeared in any child result (lost during split/recurse). Add them to `uncovered_files`.
- Populate both `covered_files` and `uncovered_files` in the merge-result
- Verify: `len(covered_files) + len(uncovered_files) == len(scope.files)` — if not, something was silently dropped. Investigate before writing output.

**Output:** A `merge-result.md` conforming to `contracts/merge-result.md`. The `covered_files` and `uncovered_files` fields MUST be fully populated.

---

## Mode-Specific Behavior

### full mode (build)

- Scope starts as the entire repo
- All files are in play
- Feature tree is built from scratch

### incremental mode (update)

- Scope contains only changed files (from check result)
- Load existing features and specs from `.shadowrepo/`
- Re-extract specs for changed files
- Mark orphaned specs as `stale`
- Merge new extractions with existing data

---

## Termination

Recursion stops when:
- No scope exceeds the split threshold (50 files), OR
- Depth reaches 3

The root level's Merge step produces the final result, which the calling skill writes to `.shadowrepo/`.

---

## Error Handling

See `error-handling.md` for failure modes at each step. Key principle: **degrade gracefully, never hallucinate.** If a file can't be read, skip it. If an agent fails, fall back to sequential processing.
