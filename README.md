<p align="center">
  <img src="packages/vscode-extension/resources/icon.png" width="96" alt="ShadowRepo logo">
</p>

<h1 align="center">ShadowRepo</h1>

<p align="center">
  <strong>The context layer for codebases — for both coding agents and humans.</strong><br>
  <sub>A semantic knowledge graph of <em>what your code does and why</em>, kept in sync by an AI agent.</sub>
</p>

<p align="center">
  <a href="#install">Install</a> ·
  <a href="#whats-in-the-box">What's in the box</a> ·
  <a href="#how-it-works">How it works</a> ·
  <a href="#build-from-source">Build from source</a>
</p>

---

## The pitch

The decisions behind code — *why JWT over sessions? why this schema? why five pipeline stages?* — are scattered across PR threads, commit messages, and tribal knowledge. AI agents can read syntax, but **humans can't see the reasoning**.

ShadowRepo scans your repo, extracts structured semantic specs into a `.shadowrepo/` directory, organizes them into a feature tree, and detects when code drifts from those specs. Then it surfaces all of that in your editor.

## Install

ShadowRepo ships as **three connected pieces** that can be installed independently.

### 1. VS Code Extension — the human-facing sidebar

Install from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=waynewangyuxuan.shadowrepo-vscode) or [Open VSX](https://open-vsx.org/extension/waynewangyuxuan/shadowrepo-vscode). Or in VS Code: `Extensions → search "ShadowRepo"`.

The sidebar reads `.shadowrepo/*.json` from your workspace and renders a navigable feature tree with click-to-jump anchors.

### 2. Claude Code Plugin — the agent that builds and maintains `.shadowrepo/`

In Claude Code:

```
/plugin marketplace add waynewangyuxuan/shadowrepo-extension-package
/plugin install shadowrepo
```

This gives you slash commands like `/shadowrepo-build`, `/shadowrepo-check`, `/shadowrepo-update`, `/shadowrepo-review`, and `/shadowrepo-pr-comment`.

### 3. MCP Server — incremental spec updates over the Model Context Protocol

The Claude plugin pulls this in automatically via `npx`. To use it from another MCP-compatible client:

```bash
npx -y shadowrepo-mcp-server@latest
```

Or pin it in your client's MCP config:

```json
{
  "mcpServers": {
    "shadowrepo": {
      "command": "npx",
      "args": ["-y", "shadowrepo-mcp-server@latest"]
    }
  }
}
```

## What's in the box

| Package | Description | Distribution |
|---|---|---|
| [`packages/vscode-extension`](packages/vscode-extension) | Sidebar tree of features + specs + anchors. Spec dossier webviews. Auto-refresh on `.shadowrepo` change. | VS Code Marketplace, Open VSX |
| [`packages/claude-plugin`](packages/claude-plugin) | The agent that scans code and produces/maintains `.shadowrepo/`. Six core skills + two slash commands. | Claude Code plugin marketplace |
| [`packages/mcp-server`](packages/mcp-server) | MCP server exposing incremental `.shadowrepo/` read/write tools. | npm: [`shadowrepo-mcp-server`](https://www.npmjs.com/package/shadowrepo-mcp-server) |
| [`packages/shared`](packages/shared) | Shared TypeScript types for the `.shadowrepo/*.json` schema. | Internal, bundled into the above. |

## How it works

```
┌─────────────────┐   scans     ┌──────────────┐   reads    ┌──────────────────┐
│ Claude Plugin   │ ─────────► │ .shadowrepo/ │ ─────────► │ VS Code Sidebar  │
│ (the agent)     │             │   *.json     │             │   (humans)       │
└─────────────────┘             └──────────────┘             └──────────────────┘
         │                              ▲
         │   incremental updates        │
         └──────► MCP Server ───────────┘
                 (shadowrepo-mcp-server)
```

1. Run `/shadowrepo-build` once. The plugin walks your repo and writes a feature tree + spec graph to `.shadowrepo/`.
2. The VS Code sidebar lights up. Click any anchor to jump to its source line.
3. As you change code, `/shadowrepo-update` (or live MCP calls) keep the graph in sync. `/shadowrepo-check` flags drift.

## Build from source

See [DEMO.md](DEMO.md) for a step-by-step walkthrough (clone, install, build, sideload).

## License

MIT. See [LICENSE](LICENSE).
