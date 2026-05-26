/**
 * Naive read-modify-write helpers for .shadowrepo/ JSON files.
 *
 * Per Regulation.md and milestone M-B execution_notes: MVP only. No locking,
 * no atomic writes, no concurrency safety. Single-user demo.
 */

import { promises as fs } from "node:fs";
import * as path from "node:path";
import {
  SHADOWREPO_DIR,
  FEATURE_FILE,
  SPECS_FILE,
  META_FILE,
  type Feature,
  type Spec,
} from "@shadowrepo/shared";

export interface ShadowrepoPaths {
  root: string;
  shadowrepoDir: string;
  featuresFile: string;
  specsFile: string;
  metaFile: string;
}

export function resolvePaths(repoRoot: string): ShadowrepoPaths {
  const shadowrepoDir = path.join(repoRoot, SHADOWREPO_DIR);
  return {
    root: repoRoot,
    shadowrepoDir,
    featuresFile: path.join(shadowrepoDir, FEATURE_FILE),
    specsFile: path.join(shadowrepoDir, SPECS_FILE),
    metaFile: path.join(shadowrepoDir, META_FILE),
  };
}

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

async function readJsonOrDefault<T>(file: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(file, "utf-8");
    return JSON.parse(raw) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return fallback;
    }
    throw err;
  }
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await ensureDir(path.dirname(file));
  await fs.writeFile(file, JSON.stringify(value, null, 2) + "\n", "utf-8");
}

/**
 * features.json shape: the existing shared schema declares FeaturesFile as
 * { features: Feature[] } but real fixtures may store either an array or a
 * wrapped object. We support both reads; writes always use the wrapped form
 * to match @shadowrepo/shared FeaturesFile.
 *
 * TODO: tighten — pick one shape after fixture audit.
 */
export async function readFeatures(repoRoot: string): Promise<Feature[]> {
  const { featuresFile } = resolvePaths(repoRoot);
  const data = await readJsonOrDefault<unknown>(featuresFile, { features: [] });
  if (Array.isArray(data)) {
    return data as Feature[];
  }
  if (data && typeof data === "object" && Array.isArray((data as { features?: unknown }).features)) {
    return (data as { features: Feature[] }).features;
  }
  return [];
}

export async function writeFeatures(repoRoot: string, features: Feature[]): Promise<void> {
  const { featuresFile } = resolvePaths(repoRoot);
  await writeJson(featuresFile, { features });
}

export async function readSpecs(repoRoot: string): Promise<Spec[]> {
  const { specsFile } = resolvePaths(repoRoot);
  const data = await readJsonOrDefault<unknown>(specsFile, { specs: [] });
  if (Array.isArray(data)) {
    return data as Spec[];
  }
  if (data && typeof data === "object" && Array.isArray((data as { specs?: unknown }).specs)) {
    return (data as { specs: Spec[] }).specs;
  }
  return [];
}

export async function writeSpecs(repoRoot: string, specs: Spec[]): Promise<void> {
  const { specsFile } = resolvePaths(repoRoot);
  await writeJson(specsFile, { specs });
}

/**
 * Touch meta.json's generated_at. Creates a minimal stub if missing.
 */
export async function touchMeta(repoRoot: string): Promise<void> {
  const { metaFile, root } = resolvePaths(repoRoot);
  const now = new Date().toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const existing = await readJsonOrDefault<Record<string, unknown>>(metaFile, {});
  const merged: Record<string, unknown> = {
    repo_name: existing["repo_name"] ?? path.basename(root),
    shadowrepo_version: existing["shadowrepo_version"] ?? "0.1.0",
    generated_at: now,
    generator: existing["generator"] ?? "shadowrepo-mcp-server",
    ...existing,
    generated_at_last_mcp_write: now,
  };
  await writeJson(metaFile, merged);
}

/**
 * Read raw .shadowrepo/ JSON bundle for diff_shadowrepo.
 * Returns the three primary files as one object so the diff is a single value.
 */
export async function readBundle(repoRoot: string): Promise<{
  features: unknown;
  specs: unknown;
  meta: unknown;
}> {
  const { featuresFile, specsFile, metaFile } = resolvePaths(repoRoot);
  const [features, specs, meta] = await Promise.all([
    readJsonOrDefault<unknown>(featuresFile, null),
    readJsonOrDefault<unknown>(specsFile, null),
    readJsonOrDefault<unknown>(metaFile, null),
  ]);
  return { features, specs, meta };
}
