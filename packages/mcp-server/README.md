# shadowrepo-mcp-server

[![npm](https://img.shields.io/npm/v/shadowrepo-mcp-server.svg)](https://www.npmjs.com/package/shadowrepo-mcp-server)
[![license](https://img.shields.io/npm/l/shadowrepo-mcp-server.svg)](https://github.com/waynewangyuxuan/shadowrepo-extension-package/blob/main/LICENSE)

MCP server exposing incremental read/write tools for the `.shadowrepo/` semantic knowledge graph. Companion to the [ShadowRepo Claude Code plugin](https://github.com/waynewangyuxuan/shadowrepo-extension-package) and the [ShadowRepo VS Code extension](https://marketplace.visualstudio.com/items?itemName=waynewangyuxuan.shadowrepo-vscode).

## Install

This package is launched on demand by MCP-compatible clients (Claude Code, Cursor, Windsurf, Continue.dev, etc.) — you usually don't install it globally.

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

The server operates on the workspace cwd by default. To pin a specific repo, pass `SHADOWREPO_REPO_ROOT=/abs/path` as an environment variable, or pass `repo_root` per tool call.

## Tools

| Tool | Purpose |
|---|---|
| `read_features` | Read the feature tree from `.shadowrepo/features.json` |
| `read_specs` | Read specs from `.shadowrepo/specs.json` (optional `feature_name` filter) |
| `upsert_feature` | Insert/replace a feature by `feature_id` (auto-updates meta timestamp) |
| `upsert_spec` | Insert/replace a spec by `spec_id` |
| `delete_spec` | Remove a spec by `spec_id` |
| `diff_shadowrepo` | Coarse JSON-string diff between two `.shadowrepo/` directories |

All tools accept an optional `repo_root` (absolute path); fall back to `SHADOWREPO_REPO_ROOT` env var, then `process.cwd()`.

## What is ShadowRepo?

A semantic knowledge graph of *what your code does and why*, stored as JSON in `.shadowrepo/`. An AI agent (the [Claude plugin](https://github.com/waynewangyuxuan/shadowrepo-extension-package/tree/main/packages/claude-plugin)) populates and maintains it; a [VS Code sidebar](https://marketplace.visualstudio.com/items?itemName=waynewangyuxuan.shadowrepo-vscode) renders it for humans; this MCP server is the read/write engine that both consume.

Full project: https://github.com/waynewangyuxuan/shadowrepo-extension-package

## License

MIT
