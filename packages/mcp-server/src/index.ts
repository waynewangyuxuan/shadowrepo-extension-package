#!/usr/bin/env node
/**
 * ShadowRepo MCP server.
 *
 * Exposes six tools for incremental .shadowrepo/ updates over stdio:
 *   - read_features
 *   - read_specs
 *   - upsert_feature
 *   - upsert_spec
 *   - delete_spec
 *   - diff_shadowrepo
 *
 * Per Regulation.md, this is MVP — naive read-modify-write, no locking, no
 * caching, minimal validation. Single-user demo only.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { Feature, Spec } from "@shadowrepo/shared";
import {
  readBundle,
  readFeatures,
  readSpecs,
  touchMeta,
  writeFeatures,
  writeSpecs,
} from "./shadowrepo-io.js";

/**
 * Resolve the project root. Priority:
 *   1. SHADOWREPO_REPO_ROOT env var (set by plugin manifest)
 *   2. process.cwd()
 *
 * The MCP client (Claude Code) launches us with the workspace cwd, so cwd
 * is a sensible fallback.
 */
function resolveRepoRoot(): string {
  return process.env["SHADOWREPO_REPO_ROOT"] ?? process.cwd();
}

interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

const TOOLS: ToolDefinition[] = [
  {
    name: "read_features",
    description:
      "Read all Feature[] entries from .shadowrepo/features.json in the current repo root.",
    inputSchema: {
      type: "object",
      properties: {
        repo_root: {
          type: "string",
          description:
            "Optional absolute path to repo root containing .shadowrepo/. Defaults to MCP server cwd.",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "read_specs",
    description:
      "Read Spec[] entries from .shadowrepo/specs.json, optionally filtered by feature_name.",
    inputSchema: {
      type: "object",
      properties: {
        repo_root: { type: "string" },
        feature_name: {
          type: "string",
          description:
            "If provided, only specs whose feature_name matches will be returned.",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "upsert_feature",
    description:
      "Insert or replace a Feature in .shadowrepo/features.json by feature_id. Updates meta.json timestamp.",
    inputSchema: {
      type: "object",
      properties: {
        repo_root: { type: "string" },
        feature: {
          type: "object",
          description:
            "Feature object matching the @shadowrepo/shared Feature schema.",
        },
      },
      required: ["feature"],
      additionalProperties: false,
    },
  },
  {
    name: "upsert_spec",
    description:
      "Insert or replace a Spec in .shadowrepo/specs.json by spec_id. Updates meta.json timestamp.",
    inputSchema: {
      type: "object",
      properties: {
        repo_root: { type: "string" },
        spec: {
          type: "object",
          description:
            "Spec object matching the @shadowrepo/shared Spec schema.",
        },
      },
      required: ["spec"],
      additionalProperties: false,
    },
  },
  {
    name: "delete_spec",
    description:
      "Remove a Spec from .shadowrepo/specs.json by spec_id. Updates meta.json timestamp.",
    inputSchema: {
      type: "object",
      properties: {
        repo_root: { type: "string" },
        spec_id: { type: "string" },
      },
      required: ["spec_id"],
      additionalProperties: false,
    },
  },
  {
    name: "diff_shadowrepo",
    description:
      "Compute a coarse JSON-string diff between two .shadowrepo/ directories. Returns the before and after bundles plus naive added/removed lists for features and specs. Blunt by design (per ADR; semantic diff deferred post-MVP).",
    inputSchema: {
      type: "object",
      properties: {
        before_path: {
          type: "string",
          description: "Absolute path to repo root for the 'before' side.",
        },
        after_path: {
          type: "string",
          description: "Absolute path to repo root for the 'after' side.",
        },
      },
      required: ["before_path", "after_path"],
      additionalProperties: false,
    },
  },
];

type ToolArgs = Record<string, unknown>;

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function rootFromArgs(args: ToolArgs): string {
  return asString(args["repo_root"]) ?? resolveRepoRoot();
}

function jsonReply(value: unknown): { content: { type: "text"; text: string }[] } {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(value, null, 2),
      },
    ],
  };
}

async function handleReadFeatures(args: ToolArgs) {
  const root = rootFromArgs(args);
  const features = await readFeatures(root);
  return jsonReply({ repo_root: root, count: features.length, features });
}

async function handleReadSpecs(args: ToolArgs) {
  const root = rootFromArgs(args);
  const featureName = asString(args["feature_name"]);
  const allSpecs = await readSpecs(root);
  const specs =
    featureName === undefined
      ? allSpecs
      : allSpecs.filter((s) => s.feature_name === featureName);
  return jsonReply({
    repo_root: root,
    feature_name_filter: featureName ?? null,
    count: specs.length,
    specs,
  });
}

async function handleUpsertFeature(args: ToolArgs) {
  const root = rootFromArgs(args);
  const feature = args["feature"] as Feature | undefined;
  if (!feature || typeof feature !== "object" || !asString((feature as Feature).feature_id)) {
    throw new Error("upsert_feature: missing or invalid `feature.feature_id`");
  }
  const existing = await readFeatures(root);
  const idx = existing.findIndex((f) => f.feature_id === feature.feature_id);
  const next = [...existing];
  if (idx >= 0) {
    next[idx] = feature;
  } else {
    next.push(feature);
  }
  await writeFeatures(root, next);
  await touchMeta(root);
  return jsonReply({
    repo_root: root,
    action: idx >= 0 ? "updated" : "inserted",
    feature_id: feature.feature_id,
    feature_count: next.length,
  });
}

async function handleUpsertSpec(args: ToolArgs) {
  const root = rootFromArgs(args);
  const spec = args["spec"] as Spec | undefined;
  if (!spec || typeof spec !== "object" || !asString((spec as Spec).spec_id)) {
    throw new Error("upsert_spec: missing or invalid `spec.spec_id`");
  }
  const now = new Date().toISOString();
  const stamped: Spec = {
    ...spec,
    created_at: spec.created_at ?? now,
    updated_at: now,
  };
  const existing = await readSpecs(root);
  const idx = existing.findIndex((s) => s.spec_id === stamped.spec_id);
  const next = [...existing];
  if (idx >= 0) {
    next[idx] = stamped;
  } else {
    next.push(stamped);
  }
  await writeSpecs(root, next);
  await touchMeta(root);
  return jsonReply({
    repo_root: root,
    action: idx >= 0 ? "updated" : "inserted",
    spec_id: stamped.spec_id,
    spec_count: next.length,
  });
}

async function handleDeleteSpec(args: ToolArgs) {
  const root = rootFromArgs(args);
  const specId = asString(args["spec_id"]);
  if (!specId) {
    throw new Error("delete_spec: missing `spec_id`");
  }
  const existing = await readSpecs(root);
  const next = existing.filter((s) => s.spec_id !== specId);
  const removed = existing.length - next.length;
  if (removed > 0) {
    await writeSpecs(root, next);
    await touchMeta(root);
  }
  return jsonReply({
    repo_root: root,
    spec_id: specId,
    removed,
    spec_count: next.length,
  });
}

async function handleDiffShadowrepo(args: ToolArgs) {
  const beforePath = asString(args["before_path"]);
  const afterPath = asString(args["after_path"]);
  if (!beforePath || !afterPath) {
    throw new Error("diff_shadowrepo: both `before_path` and `after_path` required");
  }
  const [before, after] = await Promise.all([
    readBundle(beforePath),
    readBundle(afterPath),
  ]);

  // Naive added/removed by id sets. Per RL-B-2 this is acceptably blunt.
  const beforeFeatureIds = new Set(
    (Array.isArray(before.features)
      ? (before.features as Feature[])
      : (before.features as { features?: Feature[] } | null)?.features ?? []
    ).map((f) => f.feature_id),
  );
  const afterFeatureIds = new Set(
    (Array.isArray(after.features)
      ? (after.features as Feature[])
      : (after.features as { features?: Feature[] } | null)?.features ?? []
    ).map((f) => f.feature_id),
  );
  const beforeSpecIds = new Set(
    (Array.isArray(before.specs)
      ? (before.specs as Spec[])
      : (before.specs as { specs?: Spec[] } | null)?.specs ?? []
    ).map((s) => s.spec_id),
  );
  const afterSpecIds = new Set(
    (Array.isArray(after.specs)
      ? (after.specs as Spec[])
      : (after.specs as { specs?: Spec[] } | null)?.specs ?? []
    ).map((s) => s.spec_id),
  );

  const featuresAdded = [...afterFeatureIds].filter((id) => !beforeFeatureIds.has(id));
  const featuresRemoved = [...beforeFeatureIds].filter((id) => !afterFeatureIds.has(id));
  const specsAdded = [...afterSpecIds].filter((id) => !beforeSpecIds.has(id));
  const specsRemoved = [...beforeSpecIds].filter((id) => !afterSpecIds.has(id));

  return jsonReply({
    before_path: beforePath,
    after_path: afterPath,
    features_added: featuresAdded,
    features_removed: featuresRemoved,
    specs_added: specsAdded,
    specs_removed: specsRemoved,
    raw_before: before,
    raw_after: after,
    note:
      "Blunt JSON-string diff. Semantic diff deferred post-MVP (see RL-B-2 in M-B.yaml).",
  });
}

const HANDLERS: Record<string, (args: ToolArgs) => Promise<ReturnType<typeof jsonReply>>> = {
  read_features: handleReadFeatures,
  read_specs: handleReadSpecs,
  upsert_feature: handleUpsertFeature,
  upsert_spec: handleUpsertSpec,
  delete_spec: handleDeleteSpec,
  diff_shadowrepo: handleDiffShadowrepo,
};

async function main(): Promise<void> {
  const server = new Server(
    {
      name: "shadowrepo-mcp-server",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: rawArgs } = request.params;
    const handler = HANDLERS[name];
    if (!handler) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Unknown tool: ${name}`,
          },
        ],
        isError: true,
      };
    }
    try {
      const args = (rawArgs ?? {}) as ToolArgs;
      return await handler(args);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[shadowrepo-mcp-server] tool ${name} failed:`, message);
      return {
        content: [
          {
            type: "text" as const,
            text: `Tool ${name} failed: ${message}`,
          },
        ],
        isError: true,
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[shadowrepo-mcp-server] listening on stdio");
}

main().catch((err) => {
  console.error("[shadowrepo-mcp-server] fatal:", err);
  process.exit(1);
});
