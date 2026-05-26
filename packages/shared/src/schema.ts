/**
 * .shadowrepo/*.json on-disk schema.
 *
 * Source of truth (monorepo): this file. Reference doc:
 * packages/claude-plugin/spec/Schema/Types.md (preserved sub-project doc).
 *
 * M-D drift notes (real fixture at /Users/waynewang/ShadowRepo-MCP/.shadowrepo/):
 *  - features.json is a raw Feature[] (not { features: Feature[] })
 *  - specs.json is a raw Spec[] (not { specs: Spec[] })
 *  - coverage.json shape: { covered_files, uncovered_files, coverage_percent }
 *  - meta.json carries repo_path, last_commit_hash, built_at, build_status,
 *    build_rounds, stats — richer than the original RepoMeta.
 *  - Spec.relations may be string[] OR Relation[]; Relation uses "target"
 *    (not "target_spec_id"); relation types include implements/uses/extends/
 *    supports/related_to in addition to the originally-declared set.
 *  - Spec.anchors may include bare string entries.
 *  - Optional alias fields appear sparsely: id (vs spec_id), title (vs summary),
 *    feature (vs feature_name), why, detail.
 *
 * Strategy: keep the canonical types but loosen optionality + add union forms
 * so the VS Code extension can consume real-world JSON without crashing.
 */

export type FeatureType = "business" | "platform" | "cross-cutting" | string;

export interface Feature {
  feature_id: string;
  name: string;
  type: FeatureType;
  description: string;
  key_files: string[];
  parent?: string | null;
}

export type SpecType =
  | "intent"
  | "decision"
  | "constraint"
  | "contract"
  | "convention"
  | "context"
  | "change"
  | string;

export type SpecState = "active" | "stale" | string;

export type Provenance = "code_scan" | "documentation" | "git_history" | string;

export interface Anchor {
  file: string;
  symbols?: string[];
  line_range?: [number, number];
}

/** Anchors in the wild may be bare path strings. */
export type AnchorLike = Anchor | string;

export type RelationType =
  | "depends_on"
  | "conflicts_with"
  | "supersedes"
  | "relates_to"
  | "implements"
  | "uses"
  | "extends"
  | "supports"
  | "related_to"
  | string;

export interface Relation {
  type: RelationType;
  /** Real fixture uses "target". Older docs used "target_spec_id". Either may appear. */
  target?: string;
  target_spec_id?: string;
  strength?: "hard" | "soft" | string;
  description?: string;
}

/** Relations in the wild may be bare spec-id strings. */
export type RelationLike = Relation | string;

export interface Spec {
  spec_id: string;
  feature_name: string;
  type: SpecType;
  summary: string;
  detail?: string;
  why?: string;
  evidence?: string;
  anchors: AnchorLike[];
  relations: RelationLike[];
  confidence?: number;
  provenance?: Provenance;
  state?: SpecState;
  created_at?: string;
  updated_at?: string;
  // tolerated aliases
  id?: string;
  title?: string;
  feature?: string;
}

export interface RepoMetaStats {
  total_files?: number;
  total_features?: number;
  total_specs?: number;
  coverage_percent?: number;
}

export interface RepoMeta {
  repo_name: string;
  repo_path?: string;
  shadowrepo_version?: string;
  last_commit_hash?: string;
  generated_at?: string;
  built_at?: string;
  build_status?: string;
  build_rounds?: number;
  generator?: string;
  stats?: RepoMetaStats;
}

export interface Coverage {
  covered_files?: string[];
  uncovered_files?: string[];
  coverage_percent?: number;
  // back-compat fields from the original schema
  total_files?: number;
  anchored_files?: number;
  anchored_ratio?: number;
  stale_specs?: number;
  active_specs?: number;
}

/**
 * Disk-format unions. The real plugin writes raw arrays; the original scaffold
 * assumed wrapper objects. Accept both at the consumer (cache.ts) layer.
 */
export type FeaturesFile = Feature[] | { features: Feature[] };
export type SpecsFile = Spec[] | { specs: Spec[] };

/* ----- normalization helpers (consumed by vscode-extension) ----- */

export function normalizeFeatures(raw: FeaturesFile | null | undefined): Feature[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  return raw.features ?? [];
}

export function normalizeSpecs(raw: SpecsFile | null | undefined): Spec[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  return raw.specs ?? [];
}

export function normalizeAnchor(a: AnchorLike): Anchor {
  if (typeof a === "string") return { file: a };
  return a;
}

export function normalizeRelation(r: RelationLike): Relation {
  if (typeof r === "string") return { type: "relates_to", target: r };
  return r;
}

export function specId(spec: Spec): string {
  return spec.spec_id ?? spec.id ?? "<unknown>";
}

export function specSummary(spec: Spec): string {
  return spec.summary ?? spec.title ?? specId(spec);
}

export function specFeatureName(spec: Spec): string {
  return spec.feature_name ?? spec.feature ?? "";
}
