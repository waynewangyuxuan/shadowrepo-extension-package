import * as vscode from "vscode";
import {
  normalizeAnchor,
  normalizeRelation,
  specFeatureName,
  specId,
  specSummary,
  type Feature,
  type Spec,
} from "@shadowrepo/shared";
import type { ShadowRepoCache } from "./cache.js";

// The tree mirrors the JSON shape directly:
//
//   feature (feature_id)
//     spec (spec_id)
//       summary  ← leaf, full text
//       detail   ← leaf, full text (if present)
//       anchor[] ← leaves, one per anchor (label = file)
//       relation[] ← leaves, one per relation (label = target)
//
// No invented "Anchors / Relations / Detail" folders — the JSON has those as
// direct fields, render them directly.

type Node =
  | { kind: "feature"; feature: Feature }
  | { kind: "spec"; spec: Spec }
  | { kind: "summary"; text: string }
  | { kind: "detail"; text: string }
  | {
      kind: "anchor";
      file: string;
      line?: number;
      symbols?: string[];
    }
  | {
      kind: "relation";
      relType: string;
      target: string;
      strength?: string;
    };

export class FeatureTreeProvider implements vscode.TreeDataProvider<Node> {
  private readonly _onDidChange = new vscode.EventEmitter<Node | undefined>();
  readonly onDidChangeTreeData = this._onDidChange.event;

  constructor(private readonly cache: ShadowRepoCache) {}

  refresh(): void {
    this._onDidChange.fire(undefined);
  }

  getTreeItem(node: Node): vscode.TreeItem {
    switch (node.kind) {
      case "feature":  return this.featureItem(node.feature);
      case "spec":     return this.specItem(node.spec);
      case "summary":  return this.textLeaf(node.text, "quote", "shadowrepo.summary");
      case "detail":   return this.textLeaf(node.text, "book", "shadowrepo.detail");
      case "anchor":   return this.anchorItem(node);
      case "relation": return this.relationItem(node);
    }
  }

  private featureItem(feature: Feature): vscode.TreeItem {
    const item = new vscode.TreeItem(
      feature.feature_id,
      vscode.TreeItemCollapsibleState.Collapsed,
    );
    const specs = this.specsOfFeature(feature);
    item.description = `${specs.length} ${specs.length === 1 ? "spec" : "specs"}`;
    item.tooltip = buildFeatureTooltip(feature, specs);
    item.iconPath = new vscode.ThemeIcon("symbol-namespace");
    item.contextValue = "shadowrepo.feature";
    item.command = {
      command: "shadowrepo.openFeature",
      title: "Open feature",
      arguments: [feature.feature_id],
    };
    return item;
  }

  private specItem(spec: Spec): vscode.TreeItem {
    // Spec rows are now leaves — clicking opens the dossier webview where
    // the full summary/detail/anchors/relations render (with theme-matched
    // styling like VS Code's built-in markdown preview).
    const item = new vscode.TreeItem(
      specId(spec),
      vscode.TreeItemCollapsibleState.None,
    );
    item.tooltip = buildSpecTooltip(spec);
    item.iconPath = iconForSpec(spec);
    item.contextValue = "shadowrepo.spec";
    item.command = {
      command: "shadowrepo.openSpec",
      title: "Open spec",
      arguments: [specId(spec)],
    };
    return item;
  }

  private textLeaf(text: string, icon: string, ctx: string): vscode.TreeItem {
    const item = new vscode.TreeItem(text, vscode.TreeItemCollapsibleState.None);
    item.iconPath = new vscode.ThemeIcon(icon);
    item.tooltip = new vscode.MarkdownString(text);
    item.contextValue = ctx;
    return item;
  }

  private anchorItem(node: Extract<Node, { kind: "anchor" }>): vscode.TreeItem {
    // file is the label. line stays in click payload (so jump-to-line still
    // works) but doesn't take row real estate. symbols, if present, go in
    // description as a small hint.
    const item = new vscode.TreeItem(node.file, vscode.TreeItemCollapsibleState.None);
    if (node.symbols && node.symbols.length > 0) {
      item.description = node.symbols.join(", ");
    }
    item.iconPath = new vscode.ThemeIcon("file-code");
    item.tooltip = node.file;
    item.command = {
      command: "shadowrepo.openAnchor",
      title: "Open",
      arguments: [{ file: node.file, line: node.line }],
    };
    item.contextValue = "shadowrepo.anchor";
    return item;
  }

  private relationItem(node: Extract<Node, { kind: "relation" }>): vscode.TreeItem {
    const item = new vscode.TreeItem(node.target, vscode.TreeItemCollapsibleState.None);
    item.description = node.strength
      ? `${node.relType} · ${node.strength}`
      : node.relType;
    item.iconPath = new vscode.ThemeIcon("link");
    item.tooltip = `${node.relType}${node.strength ? ` (${node.strength})` : ""} → ${node.target}`;
    item.contextValue = "shadowrepo.relation";
    return item;
  }

  getChildren(node?: Node): Node[] {
    if (!node) {
      const features = this.cache.features;
      if (features.length === 0) return [];
      const roots = features.filter((f) => !f.parent);
      const source = roots.length > 0 ? roots : features;
      return source.map((feature) => ({ kind: "feature" as const, feature }));
    }

    if (node.kind === "feature") {
      const childFeatures: Node[] = this.cache.features
        .filter((f) => f.parent === node.feature.feature_id)
        .map((feature) => ({ kind: "feature" as const, feature }));
      const specs: Node[] = this.specsOfFeature(node.feature).map((spec) => ({
        kind: "spec" as const,
        spec,
      }));
      return [...childFeatures, ...specs];
    }

    return [];
  }

  private specsOfFeature(feature: Feature): Spec[] {
    return this.cache.specs.filter((s) => {
      const fn = specFeatureName(s);
      return fn === feature.name || fn === feature.feature_id;
    });
  }
}

// --- helpers ---------------------------------------------------------------

const TYPE_COLOR: Record<string, string> = {
  intent: "charts.green",
  decision: "charts.orange",
  constraint: "charts.purple",
  contract: "charts.blue",
  convention: "charts.yellow",
  context: "charts.foreground",
  change: "charts.red",
};

const TYPE_ICON: Record<string, string> = {
  intent: "target",
  decision: "lightbulb",
  constraint: "shield",
  contract: "law",
  convention: "book",
  context: "info",
  change: "git-commit",
};

function iconForSpec(spec: Spec): vscode.ThemeIcon {
  const t = String(spec.type);
  const icon = TYPE_ICON[t] ?? "circle-outline";
  const colorId = TYPE_COLOR[t];
  return colorId
    ? new vscode.ThemeIcon(icon, new vscode.ThemeColor(colorId))
    : new vscode.ThemeIcon(icon);
}

function buildSpecTooltip(spec: Spec): vscode.MarkdownString {
  const parts: string[] = [];
  parts.push(`**\`${specId(spec)}\`**`);
  const summary = specSummary(spec);
  if (summary) parts.push(`\n${summary}`);
  if (spec.detail) parts.push(`\n${spec.detail}`);
  const mds = new vscode.MarkdownString(parts.join("\n"));
  mds.supportThemeIcons = true;
  mds.isTrusted = false;
  return mds;
}

function buildFeatureTooltip(
  feature: Feature,
  specs: Spec[],
): vscode.MarkdownString {
  const parts: string[] = [];
  parts.push(`**\`${feature.feature_id}\`**`);
  if (feature.name && feature.name !== feature.feature_id) {
    parts.push(`\n_${feature.name}_`);
  }
  if (feature.description) parts.push(`\n${feature.description}`);
  parts.push(`\n\n${specs.length} ${specs.length === 1 ? "spec" : "specs"}`);
  const mds = new vscode.MarkdownString(parts.join("\n"));
  mds.supportThemeIcons = true;
  mds.isTrusted = false;
  return mds;
}
