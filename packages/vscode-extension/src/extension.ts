import * as vscode from "vscode";
import * as fs from "node:fs";
import * as path from "node:path";
import { FeatureTreeProvider } from "./featureTreeProvider.js";
import { ShadowRepoCache } from "./cache.js";
import { watchShadowRepo } from "./fileWatcher.js";
import { showSpecDossier, showFeatureDossier } from "./specDossierPanel.js";
import { specFeatureName, specId } from "@shadowrepo/shared";

const CONFIG_NS = "shadowrepo";
const FIXTURE_KEY = "fixturePath";

export function activate(context: vscode.ExtensionContext): void {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    return;
  }
  const workspaceRoot = workspaceFolder.uri.fsPath;

  const fixturePath = readFixtureSetting();
  const cache = new ShadowRepoCache(workspaceRoot, fixturePath);
  const treeProvider = new FeatureTreeProvider(cache);

  let watcherDisposable = mountWatcher(cache, async () => {
    await cache.reload();
    treeProvider.refresh();
  });

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider("shadowrepo.features", treeProvider),
    vscode.commands.registerCommand("shadowrepo.refresh", async () => {
      await cache.reload();
      treeProvider.refresh();
    }),
    vscode.commands.registerCommand(
      "shadowrepo.openAnchor",
      async (anchor: { file: string; line?: number }) => {
        await openAnchor(cache, workspaceRoot, anchor);
      },
    ),
    vscode.commands.registerCommand(
      "shadowrepo.openSpec",
      (id: string) => {
        const spec = cache.specs.find((s) => specId(s) === id);
        if (!spec) {
          void vscode.window.showWarningMessage(
            `ShadowRepo: spec not found (${id})`,
          );
          return;
        }
        showSpecDossier(context, spec, cache.specs);
      },
    ),
    vscode.commands.registerCommand(
      "shadowrepo.openFeature",
      (id: string) => {
        const feature = cache.features.find((f) => f.feature_id === id);
        if (!feature) {
          void vscode.window.showWarningMessage(
            `ShadowRepo: feature not found (${id})`,
          );
          return;
        }
        const specs = cache.specs.filter((s) => {
          const fn = specFeatureName(s);
          return fn === feature.feature_id || fn === feature.name;
        });
        showFeatureDossier(context, feature, specs);
      },
    ),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (!e.affectsConfiguration(`${CONFIG_NS}.${FIXTURE_KEY}`)) return;
      cache.setFixturePath(readFixtureSetting());
      watcherDisposable.dispose();
      watcherDisposable = mountWatcher(cache, async () => {
        await cache.reload();
        treeProvider.refresh();
      });
      void cache.reload().then(() => treeProvider.refresh());
    }),
    {
      dispose(): void {
        watcherDisposable.dispose();
      },
    },
  );

  void cache.reload().then(() => treeProvider.refresh());
}

export function deactivate(): void {
  // no-op
}

function readFixtureSetting(): string | undefined {
  const v = vscode.workspace.getConfiguration(CONFIG_NS).get<string>(FIXTURE_KEY);
  return v && v.trim().length > 0 ? v : undefined;
}

function mountWatcher(
  cache: ShadowRepoCache,
  onChange: () => Promise<void>,
): vscode.Disposable {
  // baseDir already points at .shadowrepo/
  return watchShadowRepo(cache.baseDir, onChange);
}

/**
 * Open an anchor file at the given line.
 *
 * Per decision-002 consequence (a): best-effort. We try (in order):
 *   1. <anchorRoot>/<file>  (anchorRoot = meta.repo_path when present)
 *   2. <workspaceRoot>/<file>
 *   3. <fixtureRoot>/<file>  (parent of .shadowrepo)
 * If none of these exist on disk, we log + show a non-modal warning and skip.
 */
async function openAnchor(
  cache: ShadowRepoCache,
  workspaceRoot: string,
  anchor: { file: string; line?: number },
): Promise<void> {
  if (!anchor || !anchor.file) {
    return;
  }
  const candidates: string[] = [];
  const anchorRoot = cache.anchorRoot;
  if (anchorRoot) candidates.push(path.join(anchorRoot, anchor.file));
  candidates.push(path.join(workspaceRoot, anchor.file));
  const fixtureRoot = path.dirname(cache.baseDir);
  if (fixtureRoot && fixtureRoot !== workspaceRoot) {
    candidates.push(path.join(fixtureRoot, anchor.file));
  }

  const resolved = candidates.find((c) => fs.existsSync(c));
  if (!resolved) {
    // eslint-disable-next-line no-console
    console.warn(
      `[shadowrepo] anchor file not found on disk: ${anchor.file} (tried: ${candidates.join(", ")})`,
    );
    void vscode.window.showWarningMessage(
      `ShadowRepo: anchor file not found on disk (${anchor.file}). The fixture references a repo that isn't checked out locally.`,
    );
    return;
  }

  const uri = vscode.Uri.file(resolved);
  const doc = await vscode.workspace.openTextDocument(uri);
  const editor = await vscode.window.showTextDocument(doc);
  if (anchor.line !== undefined) {
    const pos = new vscode.Position(Math.max(0, anchor.line - 1), 0);
    editor.selection = new vscode.Selection(pos, pos);
    editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
  }
}
