---
name: shadowrepo-help
description: >
  Show all ShadowRepo capabilities and usage. Use when: "shadowrepo help",
  "what can shadowrepo do", "how to use shadowrepo".
---

# ShadowRepo Help

Output this exactly:

```
◆ ShadowRepo
  Semantic Code Knowledge Graph

  Commands:

    /shadowrepo-build    Build feature tree + spec graph
    /shadowrepo-check    Detect code-spec drift
    /shadowrepo-update   Fix drifted specs
    /shadowrepo-render   Generate docs from specs
    /shadowrepo-preview  Impact assessment (coming soon)
    /shadowrepo-help     Show this screen

  Output:

    .shadowrepo/
    ├── features.json    Feature tree (product → sub-features)
    ├── specs.json       Semantic specs (the WHY behind code)
    ├── coverage.json    File coverage map
    └── meta.json        Repo metadata

  Workflow:

    build → code → check → update → render
```
