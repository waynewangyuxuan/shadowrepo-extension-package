#!/usr/bin/env node
/**
 * Smoke test for shadowrepo-mcp-server.
 *
 * Launches dist/index.js as a child process over stdio, speaks raw JSON-RPC
 * (per MCP spec), and exercises tools/list, read_features, upsert_feature,
 * read_features (again to confirm mutation), and a delete_spec on a fresh
 * temp .shadowrepo/.
 *
 * Acceptance: prints "SMOKE TEST PASSED" with no stderr exceptions.
 */

import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SERVER_ENTRY = new URL("../dist/index.js", import.meta.url).pathname;

function makeRpc(id, method, params) {
  return JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n";
}

async function runSmokeTest() {
  const tmpRoot = mkdtempSync(join(tmpdir(), "shadowrepo-mcp-smoke-"));
  console.log(`[smoke] tmp repo root: ${tmpRoot}`);

  const child = spawn("node", [SERVER_ENTRY], {
    cwd: tmpRoot,
    env: { ...process.env, SHADOWREPO_REPO_ROOT: tmpRoot },
    stdio: ["pipe", "pipe", "pipe"],
  });

  child.stderr.on("data", (chunk) => {
    process.stderr.write(`[server stderr] ${chunk}`);
  });

  let buffer = "";
  const pending = new Map();

  child.stdout.on("data", (chunk) => {
    buffer += chunk.toString("utf-8");
    let idx;
    while ((idx = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line) continue;
      try {
        const msg = JSON.parse(line);
        if (msg.id !== undefined && pending.has(msg.id)) {
          pending.get(msg.id)(msg);
          pending.delete(msg.id);
        }
      } catch (err) {
        console.error("[smoke] failed to parse stdout line:", line, err);
      }
    }
  });

  function call(id, method, params) {
    return new Promise((resolve, reject) => {
      pending.set(id, resolve);
      child.stdin.write(makeRpc(id, method, params));
      setTimeout(() => {
        if (pending.has(id)) {
          pending.delete(id);
          reject(new Error(`Timeout waiting for response to ${method} (id=${id})`));
        }
      }, 5000);
    });
  }

  // MCP initialize handshake.
  const initResp = await call(1, "initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "shadowrepo-smoke", version: "0.1.0" },
  });
  console.log("[smoke] initialize ->", initResp.result?.serverInfo?.name ?? "??");

  // Required: notifications/initialized after initialize.
  child.stdin.write(JSON.stringify({
    jsonrpc: "2.0",
    method: "notifications/initialized",
  }) + "\n");

  // 1. tools/list
  const listResp = await call(2, "tools/list", {});
  const toolNames = (listResp.result?.tools ?? []).map((t) => t.name);
  console.log("[smoke] tools/list ->", toolNames.join(", "));
  const expected = [
    "read_features",
    "read_specs",
    "upsert_feature",
    "upsert_spec",
    "delete_spec",
    "diff_shadowrepo",
  ];
  for (const t of expected) {
    if (!toolNames.includes(t)) {
      throw new Error(`Missing expected tool: ${t}`);
    }
  }

  // 2. read_features (empty)
  const readEmpty = await call(3, "tools/call", {
    name: "read_features",
    arguments: { repo_root: tmpRoot },
  });
  const readEmptyPayload = JSON.parse(readEmpty.result.content[0].text);
  console.log("[smoke] read_features (empty) ->", readEmptyPayload.count);
  if (readEmptyPayload.count !== 0) {
    throw new Error(`Expected 0 features in fresh tmp dir, got ${readEmptyPayload.count}`);
  }

  // 3. upsert_feature
  const upsertResp = await call(4, "tools/call", {
    name: "upsert_feature",
    arguments: {
      repo_root: tmpRoot,
      feature: {
        feature_id: "f-smoke-1",
        name: "Smoke Feature",
        type: "platform",
        description: "Inserted by smoke test",
        key_files: ["packages/mcp-server/src/index.ts"],
      },
    },
  });
  const upsertPayload = JSON.parse(upsertResp.result.content[0].text);
  console.log("[smoke] upsert_feature ->", upsertPayload.action, upsertPayload.feature_id);
  if (upsertPayload.action !== "inserted") {
    throw new Error(`Expected 'inserted', got ${upsertPayload.action}`);
  }

  // 4. .shadowrepo/features.json on disk should now contain f-smoke-1.
  //    (file name is plural — see packages/shared/src/paths.ts FEATURE_FILE alias).
  const featuresPath = join(tmpRoot, ".shadowrepo", "features.json");
  if (!existsSync(featuresPath)) {
    throw new Error(`Expected ${featuresPath} to exist after upsert`);
  }
  const onDisk = JSON.parse(readFileSync(featuresPath, "utf-8"));
  console.log("[smoke] on-disk features.json ->", JSON.stringify(onDisk));
  const onDiskFeatures = Array.isArray(onDisk) ? onDisk : onDisk.features;
  if (!onDiskFeatures.some((f) => f.feature_id === "f-smoke-1")) {
    throw new Error("on-disk features.json missing f-smoke-1");
  }

  // 5. read_features (now 1)
  const readAfter = await call(5, "tools/call", {
    name: "read_features",
    arguments: { repo_root: tmpRoot },
  });
  const readAfterPayload = JSON.parse(readAfter.result.content[0].text);
  console.log("[smoke] read_features (after upsert) ->", readAfterPayload.count);
  if (readAfterPayload.count !== 1) {
    throw new Error(`Expected 1 feature post-upsert, got ${readAfterPayload.count}`);
  }

  // 6. upsert_spec
  const upsertSpec = await call(6, "tools/call", {
    name: "upsert_spec",
    arguments: {
      repo_root: tmpRoot,
      spec: {
        spec_id: "s-smoke-1",
        feature_name: "Smoke Feature",
        type: "intent",
        summary: "Smoke spec",
        anchors: [],
        relations: [],
        confidence: 0.9,
        provenance: "code_scan",
        state: "active",
      },
    },
  });
  const upsertSpecPayload = JSON.parse(upsertSpec.result.content[0].text);
  console.log("[smoke] upsert_spec ->", upsertSpecPayload.action, upsertSpecPayload.spec_id);

  // 7. delete_spec
  const delResp = await call(7, "tools/call", {
    name: "delete_spec",
    arguments: { repo_root: tmpRoot, spec_id: "s-smoke-1" },
  });
  const delPayload = JSON.parse(delResp.result.content[0].text);
  console.log("[smoke] delete_spec ->", delPayload);
  if (delPayload.removed !== 1) {
    throw new Error(`Expected delete_spec to remove 1, got ${delPayload.removed}`);
  }

  // 8. diff_shadowrepo against itself (sanity).
  const diffResp = await call(8, "tools/call", {
    name: "diff_shadowrepo",
    arguments: { before_path: tmpRoot, after_path: tmpRoot },
  });
  const diffPayload = JSON.parse(diffResp.result.content[0].text);
  console.log("[smoke] diff_shadowrepo (self) ->",
    `added_features=${diffPayload.features_added.length}`,
    `removed_features=${diffPayload.features_removed.length}`,
  );
  if (diffPayload.features_added.length !== 0 || diffPayload.features_removed.length !== 0) {
    throw new Error("Self-diff should yield zero diffs");
  }

  child.stdin.end();
  await new Promise((resolve) => child.on("exit", resolve));
  rmSync(tmpRoot, { recursive: true, force: true });
  console.log("SMOKE TEST PASSED");
}

runSmokeTest().catch((err) => {
  console.error("SMOKE TEST FAILED:", err);
  process.exit(1);
});
