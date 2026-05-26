# DEMO — ShadowRepo

How to try ShadowRepo today. Two paths: install from registries (fast), or build from source (full sidebar experience).

**Repository:** https://github.com/waynewangyuxuan/shadowrepo-extension-package
**npm:** https://www.npmjs.com/package/shadowrepo-mcp-server

**Status today:**
- ✅ Claude Code plugin — installable via GitHub-based marketplace
- ✅ MCP server (`shadowrepo-mcp-server`) — on npm, pulled automatically by the plugin via `npx`
- 🚧 VS Code extension — currently **install-from-source only** (Marketplace listing deferred; see Path B below)

---

## Path A — Just the Claude plugin (no clone needed)

The plugin gives you the slash commands and `.shadowrepo/` generation. Sidebar not included (Path B for that).

### Prerequisites
- **Claude Code** ([install](https://docs.claude.com/en/docs/claude-code))
- **Node.js 20+** (npx pulls the MCP server automatically)

### Install

In any Claude Code session:

```
/plugin marketplace add waynewangyuxuan/shadowrepo-extension-package
/plugin install shadowrepo
```

### Try it

In any project of yours (or this one):

```
/shadowrepo-build
```

The plugin will walk your repo and write `.shadowrepo/features.json`, `.shadowrepo/specs.json`, and `.shadowrepo/meta.json`. Other commands:

- `/shadowrepo-check` — flag drift between code and existing specs
- `/shadowrepo-update` — incremental updates (uses MCP server)
- `/shadowrepo-render` — generate an HTML dashboard from `.shadowrepo/`
- `/shadowrepo-preview` — quick preview
- `/shadowrepo-review` — pre-commit alignment report
- `/shadowrepo-pr-comment` — wrap `gh pr create --draft` with a ShadowRepo summary as the first PR comment

---

## Path B — Full experience including VS Code sidebar (clone + build)

The sidebar isn't on the VS Code Marketplace yet, so you need to clone this repo, build, and sideload the packaged `.vsix`.

### Prerequisites

- **Node.js 20+** (`node --version`)
- **pnpm 9+** — `npm install -g pnpm` if you don't have it
- **VS Code** with the `code` CLI on your `PATH` (test with `code --version`)
- **(Optional)** **GitHub CLI** (`gh`) — only if you want to dry-run the PR-comment command
- **(Optional)** **Claude Code** — already covered by Path A; the runners below can be invoked directly with `node` without Claude installed

> Assumes a Linux/WSL environment. The build is pure Node + pnpm, so it should work on any Unix-like setup.

### 1. Clone and build

```bash
git clone https://github.com/waynewangyuxuan/shadowrepo-extension-package.git
cd shadowrepo-extension-package
pnpm install
pnpm -r build
```

Then package the VS Code extension:

```bash
cd packages/vscode-extension
pnpm package        # produces shadowrepo-vscode-0.1.0.vsix
cd ../..
```

The build produces:

- `packages/vscode-extension/shadowrepo-vscode-0.1.0.vsix` — the installable extension
- `packages/mcp-server/dist/index.js` — the built MCP server (identical to what's on npm)
- `packages/shared/dist/` — shared TypeScript types

### 2. Install the VS Code extension

```bash
code --install-extension packages/vscode-extension/shadowrepo-vscode-0.1.0.vsix
```

### 3. Open the demo workspace

```bash
code fixtures/sample-repo
```

In the new VS Code window, click the **ShadowRepo** icon in the activity bar. The sidebar should populate with a feature tree (36 features, 629 specs). Expand any feature to see its specs; click a spec's anchor to jump to the underlying source file.

> **Note.** The bundled fixture's anchor paths are off-disk (they point at the original project's directory layout). The extension's warn-and-skip path handles this — clicks log a warning instead of opening a missing file. The tree itself is fully populated and navigable.

### 4. Run the pre-commit review (no Claude needed)

```bash
node packages/claude-plugin/skills/review/runner.mjs fixtures/sample-repo
```

This writes a markdown report under `fixtures/sample-repo/.shadowrepo/reviews/<ISO>.md` with three heuristics applied (anchored / anchor-file-exists / schema-validates). On the bundled fixture: 629 files scanned, ~2183 findings.

### 5. (Optional) Dry-run the PR-comment generator

```bash
node packages/claude-plugin/skills/pr-comment/runner.mjs fixtures/sample-repo \
  --summary-only --out /tmp/shadowrepo-pr-comment.md
```

This produces the markdown comment ShadowRepo would post on a PR (top features, coverage %, spec count) without touching any GitHub remote. You can also pass `--dry-run --title "test" --base main` to see the exact `gh` commands that would run.

---

## Troubleshooting

- **`pnpm install` fails on Node 18 or earlier** — upgrade to Node 20+. The TypeScript build uses APIs that require it.
- **`code` command not found** — install the `code` CLI from your VS Code's command palette ("Shell Command: Install 'code' command in PATH"), or add `<vscode-install-dir>/bin/` to your `PATH`.
- **Sidebar shows nothing** — make sure you opened `fixtures/sample-repo` as the workspace, not the repo root. The extension looks for a `.shadowrepo/` folder at the workspace root.
- **Anchor clicks open the wrong file (or warn-and-skip)** — expected on the bundled fixture; see the note under step 3.
- **`/plugin marketplace add` fails** — make sure your Claude Code version supports plugin marketplaces. Try `claude --version`.
- **MCP-backed commands fail** — verify `npx -y shadowrepo-mcp-server@latest` works from your shell. It downloads the published package and should print `[shadowrepo-mcp-server] listening on stdio` before you Ctrl-C.

## What's not in this demo

- `/shadowrepo-pr-comment` real-run mode (`gh pr create --draft`) is intentionally not exercised here — it would create a draft PR on the demo'er's GitHub. The dry-run in step 5 prints the exact commands.
- The VS Code extension's Marketplace listing (one-click install for VS Code, Cursor, Windsurf) is in progress. Until then, Path B is the only way to get the sidebar.
