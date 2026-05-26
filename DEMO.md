# DEMO — ShadowRepo

How to build and run ShadowRepo from source. Tested on macOS; should work on Linux/WSL with no changes.

## What you'll see

After the steps below you'll have:

1. A VS Code window with the **ShadowRepo** sidebar populated from a fixture repo (36 features, 629 specs).
2. (Optional) The **`/shadowrepo-review`** and **`/shadowrepo-pr-comment`** slash commands available inside Claude Code.

## Prerequisites

- **Node.js 20+** (`node --version`)
- **pnpm 9+** — `npm install -g pnpm` if you don't have it
- **VS Code** — needed for the sidebar demo. The `code` CLI should be on your PATH (in VS Code, open the command palette and run "Shell Command: Install 'code' command in PATH"). If you don't have VS Code, you can still inspect the `.vsix` artifact but won't see the sidebar.
- **(Optional)** **GitHub CLI** (`gh`) — only needed if you want to dry-run the PR-comment command. Skip if not interested.
- **(Optional)** **Claude Code** — only needed to install the plugin and try the slash commands inside a Claude session. The runners below can be invoked directly with `node` without Claude installed.

## 1. Clone and build

```bash
git clone https://github.com/waynewangyuxuan/shadowrepo-extension-package.git
cd shadowrepo-extension-package
pnpm install
pnpm -r build
```

The build produces:

- `packages/vscode-extension/shadowrepo-vscode-0.1.0.vsix` — the installable extension
- `packages/mcp-server/dist/index.js` — the built MCP server
- `packages/shared/dist/` — shared TypeScript types

## 2. Install the VS Code extension

```bash
code --install-extension packages/vscode-extension/shadowrepo-vscode-0.1.0.vsix
```

## 3. Open the demo workspace

```bash
code fixtures/sample-repo
```

In the new VS Code window, click the **ShadowRepo** icon in the activity bar. The sidebar should populate with a feature tree. Expand any feature to see its specs; click a spec's anchor to jump to the underlying source file.

> **Note.** The bundled fixture's anchor paths are off-disk (they point at the original project's directory layout). The extension's warn-and-skip path handles this — clicks log a warning instead of opening a missing file. The tree itself is fully populated and navigable.

## 4. Run the pre-commit review (no Claude needed)

```bash
node packages/claude-plugin/skills/review/runner.mjs fixtures/sample-repo
```

This writes a markdown report under `fixtures/sample-repo/.shadowrepo/reviews/<ISO>.md` with three heuristics applied (anchored / anchor-file-exists / schema-validates). On the bundled fixture: 629 files scanned, ~2183 findings.

## 5. (Optional) Dry-run the PR-comment generator

```bash
node packages/claude-plugin/skills/pr-comment/runner.mjs fixtures/sample-repo \
  --summary-only --out /tmp/shadowrepo-pr-comment.md
```

This produces the markdown comment ShadowRepo would post on a PR (top features, coverage %, spec count) without touching any GitHub remote. You can also pass `--dry-run --title "test" --base main` to see the exact `gh` commands that would run.

## 6. (Optional) Install in Claude Code

If you have Claude Code installed, you can register the plugin from this repo:

```
/plugin marketplace add waynewangyuxuan/shadowrepo-extension-package
/plugin install shadowrepo@shadowrepo
```

Once installed, the slash commands `/shadowrepo-review` and `/shadowrepo-pr-comment` are available inside any Claude session, and the MCP server registered by the plugin lets Claude make incremental updates to `.shadowrepo/` files.

## Troubleshooting

- **`pnpm install` fails on Node 18 or earlier** — upgrade to Node 20+. The TypeScript build uses APIs that require it.
- **`code` command not found** — open VS Code, command palette, "Shell Command: Install 'code' command in PATH" (macOS/Linux).
- **Sidebar shows nothing** — make sure you opened `fixtures/sample-repo` as the workspace, not the repo root. The extension looks for a `.shadowrepo/` folder at the workspace root.
- **Anchor clicks open the wrong file (or warn-and-skip)** — expected on the bundled fixture; see the note under step 3.

## What's not in this demo

- The Claude Plugin install path (step 6) is structurally validated but hasn't been smoke-tested against a fresh Claude Code environment.
- `/shadowrepo-pr-comment` real-run mode (`gh pr create --draft`) is intentionally not exercised here — it would create a draft PR on the demo'er's GitHub. The dry-run in step 5 prints the exact commands.
