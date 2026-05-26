#!/usr/bin/env node
/**
 * ShadowRepo PR-Comment runner (M-A, single-hook scenario fallback).
 *
 * Generates a ShadowRepo-aware markdown summary from <repo_root>/.shadowrepo/
 * and optionally wraps `gh pr create --draft` + `gh pr comment` so that the
 * first comment on a newly opened PR carries the ShadowRepo context. When
 * `gh` is unavailable or unauthenticated, the runner degrades gracefully
 * (per RL-A-2): the summary is still written to disk and printed to stdout,
 * and exit code remains 0 so callers can choose to paste the markdown into
 * the GitHub UI by hand.
 *
 * Per decision-M-A-breakdown-001 + decision-run2-plan-001. Honors the
 * binding constraint 能跑就行了 — minimum viable wrap, no over-engineering.
 *
 * Usage:
 *   node runner.mjs <repo_root> [--title <pr_title>] [--body-file <path>]
 *                              [--base <branch>] [--dry-run] [--summary-only]
 *                              [--out <markdown_path>]
 *
 * Modes:
 *   --summary-only   Only generate the ShadowRepo summary markdown; do not
 *                    call `gh` at all. Default when `gh` is missing.
 *   --dry-run        Print the `gh` commands that WOULD run, without
 *                    invoking them. Summary markdown is still written.
 *   (no flag)        Real run: `gh pr create --draft ...` then
 *                    `gh pr comment <num> --body-file <summary>`.
 *
 * Exit codes:
 *   0  — summary generated; (real run) PR + comment created OR gh-missing
 *        fallback completed gracefully
 *   1  — precondition failure (no .shadowrepo, malformed JSON)
 *   2  — `gh` invocation failed in a non-recoverable way during real run
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { spawnSync } from "node:child_process";

function die(msg, code = 1) {
  console.error(`shadowrepo-pr-comment: ${msg}`);
  process.exit(code);
}

function isoBasic(d = new Date()) {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function parseArgs(argv) {
  // argv[0] = node, argv[1] = script, argv[2] = repo_root, then flags
  const args = {
    repo_root: argv[2],
    title: null,
    body_file: null,
    base: null,
    dry_run: false,
    summary_only: false,
    out: null,
  };
  for (let i = 3; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--dry-run") args.dry_run = true;
    else if (a === "--summary-only") args.summary_only = true;
    else if (a === "--title") args.title = argv[++i];
    else if (a === "--body-file") args.body_file = argv[++i];
    else if (a === "--base") args.base = argv[++i];
    else if (a === "--out") args.out = argv[++i];
    else if (a === "--help" || a === "-h") {
      console.log(
        "usage: node runner.mjs <repo_root> [--title T] [--body-file F]\n" +
        "                              [--base B] [--dry-run] [--summary-only] [--out P]",
      );
      process.exit(0);
    } else if (a.startsWith("--")) {
      die(`unknown flag: ${a}`);
    }
  }
  return args;
}

function loadJson(path) {
  let raw;
  try {
    raw = readFileSync(path, "utf-8");
  } catch (err) {
    die(`cannot read ${path}: ${err.message}`);
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    die(`malformed JSON in ${path}: ${err.message}`);
  }
}

function loadShadowRepoContext(repoRoot) {
  const dir = join(repoRoot, ".shadowrepo");
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    die(
      `no .shadowrepo/ under ${repoRoot}; run /shadowrepo build first, or pass a different <repo_root>`,
    );
  }

  const ctx = {
    features: [],
    coverage_percent: null,
    covered_count: null,
    uncovered_count: null,
    specs_count: null,
    has_features: false,
    has_coverage: false,
    has_specs: false,
  };

  const featuresPath = join(dir, "features.json");
  if (existsSync(featuresPath)) {
    const parsed = loadJson(featuresPath);
    const arr = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.features)
        ? parsed.features
        : [];
    ctx.features = arr;
    ctx.has_features = true;
  }

  const coveragePath = join(dir, "coverage.json");
  if (existsSync(coveragePath)) {
    const parsed = loadJson(coveragePath);
    const covered = Array.isArray(parsed?.covered_files) ? parsed.covered_files.length : null;
    const uncovered = Array.isArray(parsed?.uncovered_files)
      ? parsed.uncovered_files.length
      : null;
    let pct =
      parsed?.coverage_percent ??
      parsed?.coverage_pct ??
      parsed?.percent ??
      null;
    if (pct === null && covered !== null && uncovered !== null) {
      const total = covered + uncovered;
      pct = total > 0 ? (covered / total) * 100 : null;
    }
    if (typeof pct === "number") {
      // Normalize: if pct looks like 0-1 fraction, scale.
      if (pct > 0 && pct <= 1) pct = pct * 100;
    }
    ctx.coverage_percent = typeof pct === "number" ? Math.round(pct * 10) / 10 : null;
    ctx.covered_count = covered;
    ctx.uncovered_count = uncovered;
    ctx.has_coverage = true;
  }

  const specsPath = join(dir, "specs.json");
  if (existsSync(specsPath)) {
    const parsed = loadJson(specsPath);
    const arr = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.specs)
        ? parsed.specs
        : [];
    ctx.specs_count = arr.length;
    ctx.has_specs = true;
  }

  return ctx;
}

function renderSummary(ctx, { repoRoot, generatedAt }) {
  const lines = [];
  lines.push("## ShadowRepo Context");
  lines.push("");
  const featuresN = ctx.features.length;
  if (featuresN === 0) {
    lines.push(
      `This PR opens against a workspace whose \`.shadowrepo/\` carries no top-level features yet. Run \`/shadowrepo build\` to populate the spec graph.`,
    );
  } else {
    lines.push(
      `This PR touches a workspace with **${featuresN} top-level features** in its semantic knowledge graph.`,
    );
  }
  lines.push("");
  if (featuresN > 0) {
    lines.push("### Top features");
    lines.push("");
    lines.push("| Feature | Type | Description |");
    lines.push("|---|---|---|");
    const top = ctx.features.slice(0, 10);
    for (const f of top) {
      const name = f?.name ?? f?.feature_id ?? "(unnamed)";
      const type = f?.type ?? "—";
      const desc = String(f?.description ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
      lines.push(`| ${name} | ${type} | ${desc} |`);
    }
    if (featuresN > 10) {
      lines.push(`| _…and ${featuresN - 10} more_ | | |`);
    }
    lines.push("");
  }

  lines.push("### Coverage");
  lines.push("");
  if (ctx.has_coverage) {
    const pct = ctx.coverage_percent;
    const covered = ctx.covered_count;
    const uncovered = ctx.uncovered_count;
    if (pct !== null) {
      lines.push(`- Coverage: **${pct}%**`);
    } else {
      lines.push(`- Coverage: (percentage unavailable)`);
    }
    if (covered !== null) lines.push(`- Covered files: ${covered}`);
    if (uncovered !== null) lines.push(`- Uncovered files: ${uncovered}`);
  } else {
    lines.push("- `.shadowrepo/coverage.json` not present.");
  }
  lines.push("");

  if (ctx.has_specs) {
    lines.push(`Specs in graph: **${ctx.specs_count}**.`);
    lines.push("");
  }

  lines.push("See `.shadowrepo/` for the full spec graph.");
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("### Known limitation (MVP)");
  lines.push("");
  lines.push(
    "Online-vs-local ShadowRepo diff is approximated by JSON-string diff in the current MVP; full semantic merge is post-MVP.",
  );
  lines.push("");
  lines.push(
    `_Generated by \`/shadowrepo-pr-comment\` at ${generatedAt} from \`${repoRoot}/.shadowrepo/\`._`,
  );
  lines.push("");
  return lines.join("\n");
}

function ghAvailable() {
  const probe = spawnSync("gh", ["--version"], { encoding: "utf-8" });
  return probe.status === 0;
}

function ghAuthed() {
  const probe = spawnSync("gh", ["auth", "status"], { encoding: "utf-8" });
  return probe.status === 0;
}

function runGh(args, opts = {}) {
  const res = spawnSync("gh", args, { encoding: "utf-8", ...opts });
  return {
    status: res.status,
    stdout: res.stdout ?? "",
    stderr: res.stderr ?? "",
  };
}

function extractPrNumberFromUrl(url) {
  if (!url) return null;
  const m = url.match(/\/pull\/(\d+)/);
  return m ? m[1] : null;
}

function main() {
  const args = parseArgs(process.argv);
  if (!args.repo_root) {
    die("usage: node runner.mjs <repo_root> [--title T] [--body-file F] [--base B] [--dry-run] [--summary-only] [--out P]");
  }
  const repoRoot = resolve(args.repo_root);
  if (!existsSync(repoRoot) || !statSync(repoRoot).isDirectory()) {
    die(`<repo_root> ${repoRoot} is not an existing directory`);
  }

  const ctx = loadShadowRepoContext(repoRoot);
  const generatedAt = new Date().toISOString();
  const summary = renderSummary(ctx, { repoRoot, generatedAt });

  // Decide where to write the summary
  const outPath = args.out
    ? resolve(args.out)
    : join(repoRoot, ".shadowrepo", "pr-comments", `${isoBasic()}.md`);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, summary);

  // Print the summary to stdout so the caller (slash-command harness) can echo it
  process.stdout.write(summary);
  console.log(""); // separator newline before the summary line

  const ghOk = ghAvailable();
  const summaryLine = `shadowrepo-pr-comment summary: features=${ctx.features.length} coverage=${ctx.coverage_percent ?? "n/a"} specs=${ctx.specs_count ?? "n/a"} summary=${outPath} gh=${ghOk ? "present" : "missing"}`;

  // Mode 1: explicit --summary-only or gh missing -> emit summary, exit 0.
  if (args.summary_only || !ghOk) {
    if (!ghOk) {
      console.log(
        "shadowrepo-pr-comment: `gh` CLI not found on PATH; degrading to summary-only (RL-A-2 fallback). " +
          "Paste the markdown above into the GitHub PR UI manually.",
      );
    }
    console.log(summaryLine);
    process.exit(0);
  }

  // Mode 2: dry-run -> print the gh commands we WOULD run.
  const title = args.title ?? "shadowrepo: draft PR (auto-generated)";
  const bodyFlag = args.body_file ? ["--body-file", args.body_file] : ["--body", ""];
  const baseFlag = args.base ? ["--base", args.base] : [];
  const createArgs = ["pr", "create", "--draft", "--title", title, ...bodyFlag, ...baseFlag];
  const commentArgsTemplate = ["pr", "comment", "<PR_NUMBER>", "--body-file", outPath];

  if (args.dry_run) {
    console.log("shadowrepo-pr-comment: dry-run mode — commands NOT executed");
    console.log(`  gh ${createArgs.map((a) => (a.includes(" ") ? JSON.stringify(a) : a)).join(" ")}`);
    console.log(`  gh ${commentArgsTemplate.map((a) => (a.includes(" ") ? JSON.stringify(a) : a)).join(" ")}`);
    console.log(summaryLine);
    process.exit(0);
  }

  // Mode 3: real run. Require gh to be authenticated.
  if (!ghAuthed()) {
    console.error(
      "shadowrepo-pr-comment: `gh auth status` indicates not authenticated; degrading to summary-only (RL-A-2 fallback). " +
        "Run `gh auth login` and re-invoke without --summary-only to actually open the PR.",
    );
    console.log(summaryLine);
    process.exit(0);
  }

  const create = runGh(createArgs);
  if (create.status !== 0) {
    console.error(`shadowrepo-pr-comment: gh pr create failed (exit ${create.status})`);
    if (create.stderr) console.error(create.stderr);
    if (create.stdout) console.error(create.stdout);
    process.exit(2);
  }
  const prUrl = create.stdout.trim();
  console.log(`shadowrepo-pr-comment: opened draft PR ${prUrl}`);

  const prNumber = extractPrNumberFromUrl(prUrl);
  if (!prNumber) {
    console.error(
      "shadowrepo-pr-comment: could not parse PR number from gh output; skipping comment step. " +
        "Comment markdown is at " + outPath,
    );
    console.log(summaryLine);
    process.exit(0);
  }

  const commentArgs = ["pr", "comment", prNumber, "--body-file", outPath];
  const comment = runGh(commentArgs);
  if (comment.status !== 0) {
    console.error(`shadowrepo-pr-comment: gh pr comment failed (exit ${comment.status})`);
    if (comment.stderr) console.error(comment.stderr);
    if (comment.stdout) console.error(comment.stdout);
    process.exit(2);
  }
  console.log(`shadowrepo-pr-comment: posted ShadowRepo summary as first comment on PR #${prNumber}`);
  console.log(summaryLine);
}

main();
