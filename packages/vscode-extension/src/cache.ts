import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
  COVERAGE_FILE,
  FEATURES_FILE,
  META_FILE,
  SHADOWREPO_DIR,
  SPECS_FILE,
  normalizeFeatures,
  normalizeSpecs,
  specFeatureName,
  type Coverage,
  type Feature,
  type FeaturesFile,
  type RepoMeta,
  type Spec,
  type SpecsFile,
} from "@shadowrepo/shared";

export class ShadowRepoCache {
  features: Feature[] = [];
  specs: Spec[] = [];
  meta: RepoMeta | null = null;
  coverage: Coverage | null = null;
  loaded = false;
  /** Where we last read .shadowrepo/ from. Useful for the open-anchor handler. */
  resolvedRoot: string | null = null;

  /**
   * @param workspaceRoot The workspace folder root (always set when activated).
   * @param fixturePath Optional override (absolute or workspace-relative). When set,
   *   we read .shadowrepo from this directory regardless of workspace contents.
   */
  constructor(
    private readonly workspaceRoot: string,
    private fixturePath?: string,
  ) {}

  setFixturePath(p: string | undefined): void {
    this.fixturePath = p;
  }

  /** Absolute path to the .shadowrepo/ directory we should read. */
  get baseDir(): string {
    if (this.fixturePath && this.fixturePath.length > 0) {
      const abs = path.isAbsolute(this.fixturePath)
        ? this.fixturePath
        : path.join(this.workspaceRoot, this.fixturePath);
      // If user pointed at the parent of .shadowrepo, append it; if they
      // pointed at .shadowrepo directly, use as-is.
      if (path.basename(abs) === SHADOWREPO_DIR) return abs;
      return path.join(abs, SHADOWREPO_DIR);
    }
    return path.join(this.workspaceRoot, SHADOWREPO_DIR);
  }

  /** Root the anchors are relative to. Best-effort: meta.repo_path wins, else baseDir's parent. */
  get anchorRoot(): string {
    if (this.meta?.repo_path) return this.meta.repo_path;
    return path.dirname(this.baseDir);
  }

  async reload(): Promise<void> {
    this.resolvedRoot = this.baseDir;
    const [featuresRaw, specsRaw, metaRaw, coverageRaw] = await Promise.all([
      this.readJson<FeaturesFile>(FEATURES_FILE),
      this.readJson<SpecsFile>(SPECS_FILE),
      this.readJson<RepoMeta>(META_FILE),
      this.readJson<Coverage>(COVERAGE_FILE),
    ]);
    this.features = normalizeFeatures(featuresRaw);
    this.specs = normalizeSpecs(specsRaw);
    this.meta = metaRaw;
    this.coverage = coverageRaw;
    this.loaded = true;
  }

  specsForFeature(featureNameOrId: string): Spec[] {
    return this.specs.filter((s) => {
      const fn = specFeatureName(s);
      return fn === featureNameOrId;
    });
  }

  private async readJson<T>(filename: string): Promise<T | null> {
    try {
      const raw = await fs.readFile(path.join(this.baseDir, filename), "utf8");
      return JSON.parse(raw) as T;
    } catch (err) {
      // Don't throw — the sidebar should render an empty tree gracefully when
      // a file is missing, malformed, or unreadable.
      // eslint-disable-next-line no-console
      console.error(`[shadowrepo] failed to read ${filename}:`, (err as Error).message);
      return null;
    }
  }
}
