import * as vscode from "vscode";
import * as path from "node:path";
import { SHADOWREPO_DIR } from "@shadowrepo/shared";

/**
 * Watch `.shadowrepo/*.json` (create / change / delete) inside `watchDir`,
 * which should be the directory CONTAINING `.shadowrepo/` (typically the
 * workspace root, or the fixture's parent). When `watchDir` already ends in
 * `.shadowrepo`, we watch the directory itself.
 */
export function watchShadowRepo(
  watchDir: string,
  onChange: () => void | Promise<void>,
): vscode.Disposable {
  const baseIsShadowRepo = path.basename(watchDir) === SHADOWREPO_DIR;
  const baseDir = baseIsShadowRepo ? watchDir : path.join(watchDir, SHADOWREPO_DIR);
  const pattern = new vscode.RelativePattern(baseDir, `*.json`);
  const watcher = vscode.workspace.createFileSystemWatcher(pattern);
  const handler = (): void => {
    void onChange();
  };
  const subs: vscode.Disposable[] = [
    watcher.onDidChange(handler),
    watcher.onDidCreate(handler),
    watcher.onDidDelete(handler),
    watcher,
  ];
  return {
    dispose(): void {
      for (const d of subs) d.dispose();
    },
  };
}
