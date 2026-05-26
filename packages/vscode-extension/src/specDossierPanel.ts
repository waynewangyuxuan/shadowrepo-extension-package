import * as vscode from "vscode";
import {
  normalizeAnchor,
  normalizeRelation,
  specSummary,
  specId,
  type Feature,
  type Spec,
} from "@shadowrepo/shared";

/** Singleton webview panel; reused across opens (spec OR feature). */
let panel: vscode.WebviewPanel | undefined;

function ensurePanel(
  context: vscode.ExtensionContext,
  title: string,
  html: string,
): vscode.WebviewPanel {
  const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;
  const targetColumn =
    column === vscode.ViewColumn.One ? vscode.ViewColumn.Two : column;

  if (panel) {
    panel.title = title;
    panel.webview.html = html;
    panel.reveal(targetColumn, true);
    return panel;
  }

  panel = vscode.window.createWebviewPanel(
    "shadowrepoDossier",
    title,
    targetColumn,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      enableFindWidget: true,
    },
  );
  panel.iconPath = new vscode.ThemeIcon("book");
  panel.webview.html = html;

  panel.webview.onDidReceiveMessage(
    async (msg: {
      type: string;
      file?: string;
      line?: number;
      id?: string;
    }) => {
      if (msg.type === "openAnchor" && msg.file) {
        await vscode.commands.executeCommand("shadowrepo.openAnchor", {
          file: msg.file,
          line: msg.line,
        });
      } else if (msg.type === "openSpec" && msg.id) {
        await vscode.commands.executeCommand("shadowrepo.openSpec", msg.id);
      } else if (msg.type === "openFeature" && msg.id) {
        await vscode.commands.executeCommand("shadowrepo.openFeature", msg.id);
      }
    },
    undefined,
    context.subscriptions,
  );

  panel.onDidDispose(
    () => {
      panel = undefined;
    },
    undefined,
    context.subscriptions,
  );

  return panel;
}

export function showSpecDossier(
  context: vscode.ExtensionContext,
  spec: Spec,
  allSpecs: Spec[] = [],
): void {
  ensurePanel(context, slugOfSpec(spec), renderSpec(spec, allSpecs));
}

export function showFeatureDossier(
  context: vscode.ExtensionContext,
  feature: Feature,
  specs: Spec[],
): void {
  ensurePanel(context, feature.feature_id, renderFeature(feature, specs));
}

// ---------------------------------------------------------------------------

function slugOfSpec(spec: Spec): string {
  const id = specId(spec);
  return id.split("/").slice(-1)[0] || id;
}

function esc(s: string | number | undefined | null): string {
  if (s === undefined || s === null) return "";
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

/** Convert inline `backtick` segments in plain prose into <code> spans. */
function inlineCode(s: string): string {
  return esc(s).replace(/`([^`]+)`/g, "<code>$1</code>");
}

/** Wrap a paragraph of prose into <p> blocks, preserving double-newline breaks. */
function paragraphs(s: string): string {
  return s
    .split(/\n{2,}/)
    .map((para) => `<p>${inlineCode(para).replace(/\n/g, "<br>")}</p>`)
    .join("\n");
}

// ---------------------------------------------------------------------------
// SPEC dossier

function renderSpec(spec: Spec, allSpecs: Spec[] = []): string {
  const id = specId(spec);
  const type = String(spec.type ?? "");
  const summary = specSummary(spec);
  const detail = spec.detail ?? "";
  const anchors = (spec.anchors ?? []).map(normalizeAnchor);
  const relations = (spec.relations ?? []).map(normalizeRelation);
  const neighborhoodSvg = renderNeighborhoodSvg(spec, allSpecs);

  const metaRows: Array<[string, string]> = [];
  if (spec.state !== undefined) metaRows.push(["State", String(spec.state)]);
  if (spec.confidence !== undefined)
    metaRows.push(["Confidence", String(spec.confidence)]);
  if (spec.provenance !== undefined)
    metaRows.push(["Provenance", String(spec.provenance)]);
  if (spec.updated_at) metaRows.push(["Updated", String(spec.updated_at)]);
  if (spec.feature_name)
    metaRows.push(["Feature", String(spec.feature_name)]);

  const featureName = String(spec.feature_name ?? "");
  const featureLink = featureName
    ? `<a href="#" class="feature-link" data-feature-id="${esc(featureName)}"><code>${esc(featureName)}</code></a>`
    : "";

  const anchorsHtml =
    anchors.length === 0
      ? ""
      : `
    <h2>Anchors</h2>
    <ul class="anchors">
      ${anchors
        .map((a) => {
          const line = a.line_range?.[0];
          const symStr =
            a.symbols && a.symbols.length > 0
              ? ` <span class="dim">· ${esc(a.symbols.join(", "))}</span>`
              : "";
          const lineLabel = line !== undefined ? `:${line}` : "";
          return `<li><a href="#" class="anchor-link" data-file="${esc(a.file)}" data-line="${line ?? ""}"><code>${esc(a.file)}${esc(lineLabel)}</code></a>${symStr}</li>`;
        })
        .join("\n      ")}
    </ul>`;

  const relationsHtml =
    relations.length === 0
      ? ""
      : `
    <h2>Relations</h2>
    <ul class="relations">
      ${relations
        .map((r) => {
          const target = r.target_spec_id || r.target || "?";
          const strength = r.strength
            ? ` <span class="dim">(${esc(r.strength)})</span>`
            : "";
          return `<li><span class="rel-type">${esc(r.type)}</span> → <a href="#" class="spec-link" data-spec-id="${esc(target)}"><code>${esc(target)}</code></a>${strength}</li>`;
        })
        .join("\n      ")}
    </ul>`;

  const metaHtml =
    metaRows.length === 0
      ? ""
      : `
    <table class="meta-table">
      <tbody>
        ${metaRows
          .map(([k, v]) => {
            const valHtml =
              k === "Feature" && featureLink
                ? featureLink
                : `<code>${esc(v)}</code>`;
            return `<tr><th>${esc(k)}</th><td>${valHtml}</td></tr>`;
          })
          .join("\n        ")}
      </tbody>
    </table>`;

  return shellHtml(slugOfSpec(spec), `
  <div class="header-strip">
    ${type ? `<span class="type-tag" data-type="${esc(type)}">${esc(type)}</span>` : ""}
    <span class="spec-id"><code>${esc(id)}</code></span>
  </div>

  ${summary ? `<h1>${inlineCode(summary)}</h1>` : ""}

  ${detail ? `<div class="detail">${paragraphs(detail)}</div>` : ""}

  ${neighborhoodSvg}

  ${anchorsHtml}

  ${relationsHtml}

  ${metaHtml}
`);
}

// ---------------------------------------------------------------------------
// Neighborhood graph — small SVG of this spec and its in/out relations.

function relationStyle(type: string): {
  stroke: string;
  dash: string;
} {
  // Use VS Code chart colors so the graph adapts to the active theme.
  switch (type) {
    case "depends_on":
      return { stroke: "var(--vscode-charts-orange)", dash: "0" };
    case "conflicts_with":
      return { stroke: "var(--vscode-charts-red)", dash: "5 3" };
    case "supersedes":
    case "superseded_by":
      return { stroke: "var(--vscode-charts-blue)", dash: "0" };
    case "extends":
      return { stroke: "var(--vscode-charts-green)", dash: "0" };
    case "derived_from":
      return { stroke: "var(--vscode-charts-purple)", dash: "3 2" };
    case "relates_to":
    default:
      return {
        stroke: "var(--vscode-descriptionForeground)",
        dash: "3 3",
      };
  }
}

function renderNeighborhoodSvg(spec: Spec, allSpecs: Spec[]): string {
  const myId = specId(spec);

  // Collect edges, separating incoming vs outgoing right away.
  type SideEdge = { id: string; type: string; strength?: string };
  const incoming: SideEdge[] = [];
  const outgoing: SideEdge[] = [];

  for (const raw of spec.relations ?? []) {
    const r = normalizeRelation(raw);
    const t = r.target_spec_id || r.target;
    if (t && t !== myId) {
      outgoing.push({ id: t, type: r.type, strength: r.strength });
    }
  }
  for (const other of allSpecs) {
    const oid = specId(other);
    if (oid === myId) continue;
    for (const raw of other.relations ?? []) {
      const r = normalizeRelation(raw);
      const t = r.target_spec_id || r.target;
      if (t === myId) {
        incoming.push({ id: oid, type: r.type, strength: r.strength });
      }
    }
  }

  if (incoming.length === 0 && outgoing.length === 0) return "";

  // Dedupe each side by node id (combine multiple edges to same target).
  const dedupe = (
    arr: SideEdge[],
  ): Array<{ id: string; edges: SideEdge[] }> => {
    const map = new Map<string, SideEdge[]>();
    for (const e of arr) {
      if (!map.has(e.id)) map.set(e.id, []);
      map.get(e.id)!.push(e);
    }
    return [...map.entries()].map(([id, edges]) => ({ id, edges }));
  };

  const leftNodes = dedupe(incoming);
  const rightNodes = dedupe(outgoing);

  // Layout: three columns. Left = incoming, center = this spec, right = outgoing.
  const COL_W = 240;
  const W = COL_W * 3; // 720
  const NODE_H = 52;
  const NODE_GAP = 14;
  const ROW_H = NODE_H + NODE_GAP;
  const PADDING_Y = 20;
  const rows = Math.max(1, leftNodes.length, rightNodes.length);
  const H = PADDING_Y * 2 + rows * NODE_H + (rows - 1) * NODE_GAP;
  const cxLeft = COL_W / 2;
  const cxCenter = W / 2;
  const cxRight = W - COL_W / 2;
  const cy = H / 2;

  const nodeY = (i: number, total: number): number => {
    const colH = total * NODE_H + (total - 1) * NODE_GAP;
    const startY = (H - colH) / 2;
    return startY + i * ROW_H + NODE_H / 2;
  };

  const NODE_W_NEIGHBOR = COL_W - 30; // leave 15px gutter each side
  const NODE_W_CENTER = COL_W - 20;
  const halfNW = NODE_W_NEIGHBOR / 2;
  const halfNH = NODE_H / 2;
  const halfCW = NODE_W_CENTER / 2;

  const defs = `
    <defs>
      <marker id="arrow-end" viewBox="0 0 10 10" refX="9" refY="5"
              markerWidth="8" markerHeight="8" orient="auto-start-reverse">
        <path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" />
      </marker>
    </defs>`;

  // Build edges as cubic bezier curves.
  const leftEdges = leftNodes
    .map(({ edges }, i) => {
      const y = nodeY(i, leftNodes.length);
      // Edge goes FROM neighbor (right edge of left node) TO center (left edge of center node), arrow at center end.
      const x1 = cxLeft + halfNW;
      const y1 = y;
      const x2 = cxCenter - halfCW;
      const y2 = cy;
      const cx1 = x1 + (x2 - x1) * 0.55;
      const cx2 = x2 - (x2 - x1) * 0.55;
      // For multiple edges between same pair, slightly offset (rare but possible).
      return edges
        .map((e, j) => {
          const s = relationStyle(e.type);
          const offset = (j - (edges.length - 1) / 2) * 4;
          return `<path class="nbhd-edge" d="M ${x1.toFixed(1)} ${(y1 + offset).toFixed(1)} C ${cx1.toFixed(1)} ${(y1 + offset).toFixed(1)}, ${cx2.toFixed(1)} ${(y2 + offset).toFixed(1)}, ${x2.toFixed(1)} ${(y2 + offset).toFixed(1)}"
        stroke="${s.stroke}" stroke-width="1.5" stroke-dasharray="${s.dash}" fill="none"
        marker-end="url(#arrow-end)">
        <title>${esc(e.type)}${e.strength ? esc(" (" + e.strength + ")") : ""}</title>
      </path>`;
        })
        .join("\n      ");
    })
    .join("\n      ");

  const rightEdges = rightNodes
    .map(({ edges }, i) => {
      const y = nodeY(i, rightNodes.length);
      // Edge from center (right edge) to neighbor (left edge), arrow at neighbor end.
      const x1 = cxCenter + halfCW;
      const y1 = cy;
      const x2 = cxRight - halfNW;
      const y2 = y;
      const cx1 = x1 + (x2 - x1) * 0.55;
      const cx2 = x2 - (x2 - x1) * 0.55;
      return edges
        .map((e, j) => {
          const s = relationStyle(e.type);
          const offset = (j - (edges.length - 1) / 2) * 4;
          return `<path class="nbhd-edge" d="M ${x1.toFixed(1)} ${(y1 + offset).toFixed(1)} C ${cx1.toFixed(1)} ${(y1 + offset).toFixed(1)}, ${cx2.toFixed(1)} ${(y2 + offset).toFixed(1)}, ${x2.toFixed(1)} ${(y2 + offset).toFixed(1)}"
        stroke="${s.stroke}" stroke-width="1.5" stroke-dasharray="${s.dash}" fill="none"
        marker-end="url(#arrow-end)">
        <title>${esc(e.type)}${e.strength ? esc(" (" + e.strength + ")") : ""}</title>
      </path>`;
        })
        .join("\n      ");
    })
    .join("\n      ");

  // Center node
  const centerSlug = slugOfSpec(spec);
  const featSeg = myId.split("/")[0] ?? "";
  const centerNode = `
    <g class="nbhd-node nbhd-center" data-spec-id="${esc(myId)}">
      <title>${esc(myId)}</title>
      <rect x="${(cxCenter - halfCW).toFixed(1)}" y="${(cy - halfNH).toFixed(1)}" width="${NODE_W_CENTER}" height="${NODE_H}" rx="7" />
      <text class="nbhd-label" x="${cxCenter.toFixed(1)}" y="${(cy - 2).toFixed(1)}" text-anchor="middle">${esc(centerSlug)}</text>
      <text class="nbhd-sub" x="${cxCenter.toFixed(1)}" y="${(cy + 14).toFixed(1)}" text-anchor="middle">${esc(featSeg)}</text>
    </g>`;

  const sideNode = (
    nid: string,
    side: "left" | "right",
    i: number,
    total: number,
  ): string => {
    const x = side === "left" ? cxLeft : cxRight;
    const y = nodeY(i, total);
    const slug = nid.split("/").pop() || nid;
    const feat = nid.split("/")[0] ?? "";
    const delay = 80 + i * 50;
    return `
    <g class="nbhd-node nbhd-neighbor" data-spec-id="${esc(nid)}" style="animation-delay:${delay}ms">
      <title>${esc(nid)}</title>
      <rect x="${(x - halfNW).toFixed(1)}" y="${(y - halfNH).toFixed(1)}" width="${NODE_W_NEIGHBOR}" height="${NODE_H}" rx="7" />
      <text class="nbhd-label" x="${x.toFixed(1)}" y="${(y - 2).toFixed(1)}" text-anchor="middle">${esc(slug)}</text>
      <text class="nbhd-sub" x="${x.toFixed(1)}" y="${(y + 14).toFixed(1)}" text-anchor="middle">${esc(feat)}</text>
    </g>`;
  };

  const leftNodesSvg = leftNodes
    .map(({ id }, i) => sideNode(id, "left", i, leftNodes.length))
    .join("\n");
  const rightNodesSvg = rightNodes
    .map(({ id }, i) => sideNode(id, "right", i, rightNodes.length))
    .join("\n");

  // Column headers (small captions above each side)
  const headers = `
    <text class="nbhd-colhead" x="${cxLeft.toFixed(1)}" y="14" text-anchor="middle">INCOMING · ${leftNodes.length}</text>
    <text class="nbhd-colhead" x="${cxRight.toFixed(1)}" y="14" text-anchor="middle">OUTGOING · ${rightNodes.length}</text>`;

  // Collect relation types that actually appear, only show them in legend.
  const presentTypes = new Set<string>();
  for (const arr of [incoming, outgoing]) {
    for (const e of arr) presentTypes.add(e.type);
  }
  const legendItems: Array<{ type: string; dashed: boolean; color: string }> =
    [];
  if (presentTypes.has("depends_on"))
    legendItems.push({
      type: "depends_on",
      dashed: false,
      color: "var(--vscode-charts-orange)",
    });
  if (presentTypes.has("relates_to"))
    legendItems.push({
      type: "relates_to",
      dashed: true,
      color: "var(--vscode-descriptionForeground)",
    });
  if (presentTypes.has("supersedes") || presentTypes.has("superseded_by"))
    legendItems.push({
      type: "supersedes",
      dashed: false,
      color: "var(--vscode-charts-blue)",
    });
  if (presentTypes.has("extends"))
    legendItems.push({
      type: "extends",
      dashed: false,
      color: "var(--vscode-charts-green)",
    });
  if (presentTypes.has("derived_from"))
    legendItems.push({
      type: "derived_from",
      dashed: true,
      color: "var(--vscode-charts-purple)",
    });
  if (presentTypes.has("conflicts_with"))
    legendItems.push({
      type: "conflicts_with",
      dashed: true,
      color: "var(--vscode-charts-red)",
    });

  const legend =
    legendItems.length === 0
      ? ""
      : `
  <div class="nbhd-legend">
    ${legendItems
      .map(
        (l) =>
          `<span><span class="lk ${l.dashed ? "dashed" : ""}" style="background:${l.color};border-color:${l.color}"></span>${esc(l.type)}</span>`,
      )
      .join("\n    ")}
  </div>`;

  return `
  <section class="nbhd">
    <h2>Neighborhood <span class="dim">(${leftNodes.length + rightNodes.length})</span></h2>
    <svg class="nbhd-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Spec relationship graph">
      ${defs}
      ${headers}
      <g class="nbhd-edges">${leftEdges}${rightEdges}</g>
      ${centerNode}
      ${leftNodesSvg}
      ${rightNodesSvg}
    </svg>
    ${legend}
  </section>`;
}

// ---------------------------------------------------------------------------
// FEATURE dossier

function renderFeature(feature: Feature, specs: Spec[]): string {
  const fid = feature.feature_id;
  const fname = feature.name && feature.name !== fid ? feature.name : "";
  const ftype = String(feature.type ?? "");
  const desc = feature.description ?? "";
  const keyFiles = feature.key_files ?? [];

  // group specs by type
  const byType = new Map<string, Spec[]>();
  for (const s of specs) {
    const t = String(s.type);
    if (!byType.has(t)) byType.set(t, []);
    byType.get(t)!.push(s);
  }

  const keyFilesHtml =
    keyFiles.length === 0
      ? ""
      : `
    <h2>Key files</h2>
    <ul class="key-files">
      ${keyFiles
        .map((f) => `<li><code>${esc(f)}</code></li>`)
        .join("\n      ")}
    </ul>`;

  const specsHtml =
    specs.length === 0
      ? `<h2>Specs</h2><p class="dim">No specs.</p>`
      : `
    <h2>Specs <span class="dim">(${specs.length})</span></h2>
    <div class="spec-table">
      ${specs
        .map((s) => {
          const id = specId(s);
          const slug = id.split("/").slice(-1)[0] || id;
          const sum = specSummary(s) || "";
          return `
        <div class="spec-row">
          <span class="type-tag mini" data-type="${esc(s.type)}">${esc(s.type)}</span>
          <div class="spec-row__body">
            <a href="#" class="spec-link spec-row__slug" data-spec-id="${esc(id)}"><code>${esc(slug)}</code></a>
            <div class="spec-row__sum">${inlineCode(sum)}</div>
          </div>
        </div>`;
        })
        .join("\n      ")}
    </div>`;

  const breakdownHtml =
    byType.size <= 1
      ? ""
      : `
    <h2>By type</h2>
    <ul class="dim">
      ${[...byType.entries()]
        .sort((a, b) => b[1].length - a[1].length)
        .map(([t, ss]) => `<li>${esc(t)} · ${ss.length}</li>`)
        .join("\n      ")}
    </ul>`;

  const totalAnchors = specs.reduce(
    (n, s) => n + (s.anchors ?? []).length,
    0,
  );

  const metaHtml = `
    <table class="meta-table">
      <tbody>
        <tr><th>Feature ID</th><td><code>${esc(fid)}</code></td></tr>
        ${ftype ? `<tr><th>Type</th><td><code>${esc(ftype)}</code></td></tr>` : ""}
        ${feature.parent ? `<tr><th>Parent</th><td><code>${esc(String(feature.parent))}</code></td></tr>` : ""}
        <tr><th>Specs</th><td><code>${specs.length}</code></td></tr>
        <tr><th>Anchors</th><td><code>${totalAnchors}</code></td></tr>
      </tbody>
    </table>`;

  return shellHtml(fid, `
  <div class="header-strip">
    ${ftype ? `<span class="type-tag" data-type="feature-${esc(ftype)}">${esc(ftype)}</span>` : ""}
    <span class="spec-id"><code>${esc(fid)}</code></span>
  </div>

  <h1>${esc(fname || fid)}</h1>

  ${desc ? `<div class="detail">${paragraphs(desc)}</div>` : ""}

  ${keyFilesHtml}

  ${specsHtml}

  ${breakdownHtml}

  ${metaHtml}
`);
}

// ---------------------------------------------------------------------------
// shared HTML shell (styles + script)

function shellHtml(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
<title>${esc(title)}</title>
<style>
  :root { color-scheme: light dark; }
  html, body {
    margin: 0;
    padding: 0;
    background: var(--vscode-editor-background);
    color: var(--vscode-editor-foreground, var(--vscode-foreground));
  }
  body {
    font-family: var(--vscode-font-family);
    /* VS Code's default --vscode-font-size is 13px which is too small for
       reading prose. Bump for the dossier (h1/h2/code etc. scale relatively). */
    font-size: 15px;
    line-height: 1.6;
    padding: 28px 32px 64px;
    max-width: 820px;
    margin: 0 auto;
    word-wrap: break-word;
  }
  code, .mono {
    font-family: var(--vscode-editor-font-family, var(--vscode-font-family));
    font-size: 0.92em;
    background: var(--vscode-textCodeBlock-background, rgba(127, 127, 127, 0.10));
    padding: 0.1em 0.35em;
    border-radius: 3px;
  }
  pre {
    font-family: var(--vscode-editor-font-family, var(--vscode-font-family));
    background: var(--vscode-textCodeBlock-background, rgba(127, 127, 127, 0.10));
    padding: 12px 14px;
    border-radius: 4px;
    overflow-x: auto;
    white-space: pre;
  }
  h1 {
    font-size: 1.7em;
    font-weight: 600;
    margin: 0 0 0.4em;
    line-height: 1.25;
  }
  h2 {
    font-size: 1.1em;
    font-weight: 600;
    margin: 2em 0 0.6em;
    padding-bottom: 0.35em;
    border-bottom: 1px solid var(--vscode-textSeparator-foreground, rgba(127, 127, 127, 0.30));
  }
  p { margin: 0 0 1em; }
  a {
    color: var(--vscode-textLink-foreground);
    text-decoration: none;
    cursor: pointer;
  }
  a:hover {
    color: var(--vscode-textLink-activeForeground);
    text-decoration: underline;
  }
  .header-strip {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.6rem;
    margin-bottom: 1.4em;
  }
  .type-tag {
    font-family: var(--vscode-editor-font-family, var(--vscode-font-family));
    font-size: 0.68em;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    padding: 2px 8px;
    border-radius: 3px;
    font-weight: 600;
    border: 1px solid currentColor;
    color: var(--vscode-descriptionForeground);
    white-space: nowrap;
  }
  .type-tag.mini {
    font-size: 0.6em;
    padding: 1px 6px;
  }
  .type-tag[data-type="intent"]     { color: var(--vscode-charts-green); }
  .type-tag[data-type="decision"]   { color: var(--vscode-charts-orange); }
  .type-tag[data-type="constraint"] { color: var(--vscode-charts-purple); }
  .type-tag[data-type="contract"]   { color: var(--vscode-charts-blue); }
  .type-tag[data-type="convention"] { color: var(--vscode-charts-yellow); }
  .type-tag[data-type="context"]    { color: var(--vscode-foreground); }
  .type-tag[data-type="change"]     { color: var(--vscode-charts-red); }
  .type-tag[data-type="feature-business"]      { color: var(--vscode-charts-blue); }
  .type-tag[data-type="feature-platform"]      { color: var(--vscode-charts-green); }
  .type-tag[data-type="feature-cross-cutting"] { color: var(--vscode-charts-yellow); }
  .spec-id {
    font-family: var(--vscode-editor-font-family, var(--vscode-font-family));
    font-size: 0.92em;
    color: var(--vscode-descriptionForeground);
  }
  .detail {
    font-size: 1em;
    color: var(--vscode-editor-foreground, var(--vscode-foreground));
  }
  ul {
    padding-left: 1.4em;
    margin: 0 0 1em;
  }
  li { margin-bottom: 0.35em; }
  .anchors li, .relations li, .key-files li {
    line-height: 1.5;
  }
  .anchors code, .relations code, .key-files code {
    background: transparent;
    padding: 0;
    color: var(--vscode-textPreformat-foreground, inherit);
  }
  .rel-type {
    font-family: var(--vscode-editor-font-family, var(--vscode-font-family));
    font-size: 0.78em;
    color: var(--vscode-descriptionForeground);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
  .dim {
    color: var(--vscode-descriptionForeground);
    font-size: 0.9em;
  }
  .meta-table {
    margin: 1.2em 0;
    border-collapse: collapse;
    font-size: 0.9em;
  }
  .meta-table th {
    text-align: left;
    font-weight: 500;
    color: var(--vscode-descriptionForeground);
    padding: 0.25em 1.4em 0.25em 0;
    vertical-align: top;
    font-size: 0.78em;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    white-space: nowrap;
  }
  .meta-table td {
    padding: 0.25em 0;
  }
  .meta-table code {
    background: transparent;
    padding: 0;
  }
  /* Feature dossier — spec list */
  .spec-table {
    display: flex;
    flex-direction: column;
    gap: 0;
    border-top: 1px solid var(--vscode-textSeparator-foreground, rgba(127, 127, 127, 0.20));
  }
  .spec-row {
    display: grid;
    grid-template-columns: 6.5rem 1fr;
    gap: 0.9rem;
    align-items: baseline;
    padding: 0.55rem 0;
    border-bottom: 1px solid var(--vscode-textSeparator-foreground, rgba(127, 127, 127, 0.20));
  }
  .spec-row__body { min-width: 0; }
  .spec-row__slug {
    display: inline-block;
    margin-bottom: 0.15em;
  }
  .spec-row__sum {
    color: var(--vscode-descriptionForeground);
    font-size: 0.92em;
    line-height: 1.5;
  }
  .spec-row__sum code {
    background: transparent;
    padding: 0;
    color: var(--vscode-textPreformat-foreground, inherit);
  }
  hr {
    border: 0;
    border-top: 1px solid var(--vscode-textSeparator-foreground, rgba(127, 127, 127, 0.30));
    margin: 2em 0;
  }
  /* Neighborhood graph — two-column directed layout */
  .nbhd { margin: 1.8em 0 0; }
  .nbhd-svg {
    display: block;
    width: 100%;
    height: auto;
    margin: 0.6em 0 0.4em;
  }
  .nbhd-edge {
    transition: stroke-width 150ms ease, opacity 150ms ease;
  }
  .nbhd-node rect {
    transition: fill 150ms ease, stroke 150ms ease;
  }
  .nbhd-center rect {
    fill: var(--vscode-textBlockQuote-background, rgba(127, 127, 127, 0.12));
    stroke: var(--vscode-foreground);
    stroke-width: 1.6;
  }
  .nbhd-center .nbhd-label {
    fill: var(--vscode-foreground);
    font-family: var(--vscode-editor-font-family, var(--vscode-font-family));
    font-size: 13px;
    font-weight: 600;
  }
  .nbhd-center .nbhd-sub {
    fill: var(--vscode-descriptionForeground);
    font-family: var(--vscode-editor-font-family, var(--vscode-font-family));
    font-size: 10px;
    letter-spacing: 0.05em;
  }
  .nbhd-neighbor rect {
    fill: var(--vscode-editor-background);
    stroke: var(--vscode-textSeparator-foreground, rgba(127, 127, 127, 0.45));
    stroke-width: 1.2;
    cursor: pointer;
  }
  .nbhd-neighbor:hover rect {
    fill: var(--vscode-list-hoverBackground, rgba(127, 127, 127, 0.10));
    stroke: var(--vscode-textLink-activeForeground);
    stroke-width: 1.6;
  }
  .nbhd-neighbor text {
    pointer-events: none;
    font-family: var(--vscode-editor-font-family, var(--vscode-font-family));
  }
  .nbhd-neighbor .nbhd-label {
    fill: var(--vscode-textLink-foreground);
    font-size: 12px;
    font-weight: 500;
  }
  .nbhd-neighbor:hover .nbhd-label {
    fill: var(--vscode-textLink-activeForeground);
  }
  .nbhd-neighbor .nbhd-sub {
    fill: var(--vscode-descriptionForeground);
    font-size: 9.5px;
    letter-spacing: 0.04em;
  }
  .nbhd-colhead {
    fill: var(--vscode-descriptionForeground);
    font-family: var(--vscode-editor-font-family, var(--vscode-font-family));
    font-size: 9.5px;
    letter-spacing: 0.18em;
    font-weight: 600;
  }
  /* Entrance animations */
  .nbhd-center {
    animation: centerIn 260ms cubic-bezier(.22,.7,.3,1) backwards;
    transform-origin: 50% 50%;
    transform-box: fill-box;
  }
  @keyframes centerIn {
    from { opacity: 0; transform: scale(0.92); }
    to   { opacity: 1; transform: scale(1); }
  }
  .nbhd-neighbor {
    animation: neighborIn 380ms cubic-bezier(.22,.7,.3,1) backwards;
    transform-origin: 50% 50%;
    transform-box: fill-box;
  }
  @keyframes neighborIn {
    from { opacity: 0; transform: translateX(0) scale(0.92); }
    to   { opacity: 1; transform: translateX(0) scale(1); }
  }
  .nbhd-edges .nbhd-edge {
    animation: edgeFade 500ms ease 200ms backwards;
  }
  @keyframes edgeFade {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
  .nbhd-legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem 1.2rem;
    font-family: var(--vscode-editor-font-family, var(--vscode-font-family));
    font-size: 0.78em;
    color: var(--vscode-descriptionForeground);
    margin-top: 0.2em;
  }
  .nbhd-legend > span {
    display: inline-flex;
    align-items: center;
    gap: 0.4em;
  }
  .nbhd-legend .lk {
    display: inline-block;
    width: 18px;
    height: 2px;
    border-radius: 1px;
  }
  .nbhd-legend .lk.dashed {
    background: transparent !important;
    border-top: 2px dashed currentColor;
    height: 0;
    width: 18px;
  }
</style>
</head>
<body>
${body}
<script>
  const vscode = acquireVsCodeApi();
  function send(payload) { vscode.postMessage(payload); }

  document.querySelectorAll('a.anchor-link').forEach((a) => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      const file = a.getAttribute('data-file');
      const lineRaw = a.getAttribute('data-line');
      const line = lineRaw ? parseInt(lineRaw, 10) : undefined;
      send({ type: 'openAnchor', file, line });
    });
  });

  document.querySelectorAll('a.spec-link').forEach((a) => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      send({ type: 'openSpec', id: a.getAttribute('data-spec-id') });
    });
  });

  document.querySelectorAll('a.feature-link').forEach((a) => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      send({ type: 'openFeature', id: a.getAttribute('data-feature-id') });
    });
  });

  document.querySelectorAll('.nbhd-neighbor').forEach((g) => {
    g.addEventListener('click', () => {
      send({ type: 'openSpec', id: g.getAttribute('data-spec-id') });
    });
  });
</script>
</body>
</html>`;
}
