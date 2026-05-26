#!/usr/bin/env node
/**
 * ShadowRepo Review runner (TIER-2 single-agent).
 *
 * Reads <repo_root>/.shadowrepo/specs.json and applies three alignment
 * heuristics:
 *   H1 — anchored:           spec.anchors length >= 1
 *   H2 — anchor-file-exists: every anchor.file resolves on disk
 *   H3 — schema-validates:   spec has all required fields per data-model.md
 *
 * Writes a markdown report to <repo_root>/.shadowrepo/reviews/<ISO>.md
 * (or to the second positional argument if provided).
 *
 * Usage:
 *   node runner.mjs <repo_root> [report_path]
 *
 * Exit codes:
 *   0 — report written successfully (regardless of findings count)
 *   1 — precondition failure (no .shadowrepo/, malformed specs.json)
 *
 * Per decision-M-C-breakdown-001 + decision-descope-mc-001.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from "node:fs";
import { join, resolve, dirname, relative, isAbsolute } from "node:path";

const REQUIRED_SPEC_FIELDS = [
  "spec_id",
  "feature_name",
  "type",
  "summary",
  "anchors",
  "confidence",
  "provenance",
  "state",
  "created_at",
  "updated_at",
];

function die(msg, code = 1) {
  console.error(`shadowrepo-review: ${msg}`);
  process.exit(code);
}

function loadSpecs(repoRoot) {
  const specsPath = join(repoRoot, ".shadowrepo", "specs.json");
  if (!existsSync(specsPath)) {
    die(`no .shadowrepo/specs.json under ${repoRoot}; run /shadowrepo build first`);
  }
  let raw;
  try {
    raw = readFileSync(specsPath, "utf-8");
  } catch (err) {
    die(`cannot read ${specsPath}: ${err.message}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    die(`malformed JSON in ${specsPath}: ${err.message}`);
  }
  // Accept either an array or a { specs: [...] } envelope (the MCP server
  // upsert path uses array; some build pipelines emit the envelope).
  const specs = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed.specs)
      ? parsed.specs
      : null;
  if (specs === null) {
    die(`${specsPath} is neither an array nor a { specs: [...] } envelope`);
  }
  return { specs, specs_path: specsPath };
}

function isPathInsideRoot(repoRoot, candidate) {
  const absRoot = resolve(repoRoot);
  const absCandidate = resolve(repoRoot, candidate);
  const rel = relative(absRoot, absCandidate);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function applyHeuristics(repoRoot, specs) {
  const findings = [];
  let aligned = 0;
  for (const spec of specs) {
    const specId = spec?.spec_id ?? "<missing spec_id>";
    let specFindings = 0;

    // H3 first — if the spec is malformed we still want to capture H1/H2 where
    // possible. We treat missing required fields individually rather than
    // bailing.
    for (const field of REQUIRED_SPEC_FIELDS) {
      const v = spec?.[field];
      const missing =
        v === undefined ||
        v === null ||
        (field === "anchors" && (!Array.isArray(v) || v.length === 0) ? false : false);
      // Note: H1 covers the "anchors empty" case separately so H3 here just
      // checks presence-of-key. (Empty array is still "present".)
      if (v === undefined || v === null) {
        findings.push({
          heuristic: "H3",
          code: "schema_invalid",
          spec_id: specId,
          detail: `missing required field: ${field}`,
        });
        specFindings += 1;
      }
    }

    // H1 — anchored
    const anchors = Array.isArray(spec?.anchors) ? spec.anchors : [];
    if (anchors.length === 0) {
      findings.push({
        heuristic: "H1",
        code: "unanchored_spec",
        spec_id: specId,
        detail: "spec has no anchors; cannot be verified against code",
      });
      specFindings += 1;
    }

    // H2 — anchor-file-exists (only for anchors that look well-formed)
    for (const anchor of anchors) {
      const file = anchor?.file;
      if (typeof file !== "string" || file.length === 0) {
        findings.push({
          heuristic: "H3",
          code: "schema_invalid",
          spec_id: specId,
          detail: `anchor missing 'file' field: ${JSON.stringify(anchor)}`,
        });
        specFindings += 1;
        continue;
      }
      // Path-traversal escape -> H3 schema_invalid (per SKILL.md error handling)
      if (!isPathInsideRoot(repoRoot, file)) {
        findings.push({
          heuristic: "H3",
          code: "schema_invalid",
          spec_id: specId,
          detail: `anchor file escapes workspace: ${file}`,
        });
        specFindings += 1;
        continue;
      }
      const abs = resolve(repoRoot, file);
      if (!existsSync(abs)) {
        findings.push({
          heuristic: "H2",
          code: "anchor_orphaned",
          spec_id: specId,
          detail: `anchor file does not exist: ${file}`,
        });
        specFindings += 1;
      }
    }

    if (specFindings === 0) aligned += 1;
  }

  return { findings, aligned };
}

function renderMarkdown({ repoRoot, specs, findings, aligned, generatedAt }) {
  const total = specs.length;
  const h1 = findings.filter((f) => f.heuristic === "H1").length;
  const h2 = findings.filter((f) => f.heuristic === "H2").length;
  const h3 = findings.filter((f) => f.heuristic === "H3").length;

  const lines = [];
  lines.push(`# ShadowRepo Review — ${generatedAt}`);
  lines.push("");
  lines.push(`**Workspace**: \`${repoRoot}\``);
  lines.push(`**Tier**: TIER-2 (single-agent wrap, per \`decision-descope-mc-001\`)`);
  lines.push(`**Heuristics applied**: H1 anchored, H2 anchor-file-exists, H3 schema-validates`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`| Metric | Count |`);
  lines.push(`|---|---|`);
  lines.push(`| Specs scanned | ${total} |`);
  lines.push(`| Aligned (pass all 3 heuristics) | ${aligned} |`);
  lines.push(`| Findings (total) | ${findings.length} |`);
  lines.push(`| Findings — H1 unanchored_spec | ${h1} |`);
  lines.push(`| Findings — H2 anchor_orphaned | ${h2} |`);
  lines.push(`| Findings — H3 schema_invalid | ${h3} |`);
  lines.push("");

  // Per AC-C-2 we must contain at least one alignment heuristic finding when
  // findings exist. We always render the heuristic table above (the per-row
  // H1/H2/H3 counts are themselves "alignment heuristic findings"). The
  // section below lists individual finding records when any exist.
  if (findings.length === 0) {
    lines.push("## Findings");
    lines.push("");
    lines.push("None. ShadowRepo passes all three alignment heuristics. Ready to commit.");
    lines.push("");
  } else {
    lines.push("## Findings (detail)");
    lines.push("");
    lines.push(`| # | Heuristic | Code | Spec | Detail |`);
    lines.push(`|---|---|---|---|---|`);
    findings.forEach((f, i) => {
      const safeDetail = String(f.detail).replace(/\|/g, "\\|").replace(/\n/g, " ");
      lines.push(`| ${i + 1} | ${f.heuristic} | ${f.code} | \`${f.spec_id}\` | ${safeDetail} |`);
    });
    lines.push("");

    // Top-5 inline rollup for stdout consumers that follow the markdown
    lines.push("### Top 5 findings");
    lines.push("");
    findings.slice(0, 5).forEach((f, i) => {
      lines.push(`${i + 1}. **[${f.heuristic} ${f.code}]** \`${f.spec_id}\` — ${f.detail}`);
    });
    lines.push("");
  }

  lines.push("## Heuristic definitions");
  lines.push("");
  lines.push("- **H1 anchored**: every active spec has at least one anchor.");
  lines.push("- **H2 anchor-file-exists**: every anchor `file` path resolves on disk relative to the workspace root.");
  lines.push("- **H3 schema-validates**: every spec has the required keys per `skills/stdlib/data-model.md` (spec_id, feature_name, type, summary, anchors, confidence, provenance, state, created_at, updated_at).");
  lines.push("");
  lines.push("## Tier note");
  lines.push("");
  lines.push("This report is TIER-2 (single-agent wrap, decision-descope-mc-001). TIER-1 (multi-agent fan-out across drift / anchor-liveness / schema-validator subagents) is deferred post-MVP. Drift-vs-git is covered by the sibling `/shadowrepo check` skill.");
  lines.push("");
  return lines.join("\n");
}

function isoBasic(d = new Date()) {
  // 20260524T003500Z style — filename-safe
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function main() {
  const [, , rawRepoRoot, rawReportPath] = process.argv;
  if (!rawRepoRoot) {
    die("usage: node runner.mjs <repo_root> [report_path]");
  }
  const repoRoot = resolve(rawRepoRoot);
  if (!existsSync(repoRoot) || !statSync(repoRoot).isDirectory()) {
    die(`<repo_root> ${repoRoot} is not an existing directory`);
  }

  const { specs } = loadSpecs(repoRoot);
  const { findings, aligned } = applyHeuristics(repoRoot, specs);
  const generatedAt = new Date().toISOString();

  const reportPath =
    rawReportPath !== undefined && rawReportPath !== ""
      ? resolve(rawReportPath)
      : join(repoRoot, ".shadowrepo", "reviews", `${isoBasic()}.md`);

  mkdirSync(dirname(reportPath), { recursive: true });
  const markdown = renderMarkdown({ repoRoot, specs, findings, aligned, generatedAt });
  writeFileSync(reportPath, markdown);

  const h1 = findings.filter((f) => f.heuristic === "H1").length;
  const h2 = findings.filter((f) => f.heuristic === "H2").length;
  const h3 = findings.filter((f) => f.heuristic === "H3").length;
  console.log(
    `shadowrepo-review summary: scanned=${specs.length} aligned=${aligned} findings=${findings.length} (H1=${h1} H2=${h2} H3=${h3}) report=${reportPath}`,
  );
}

main();
