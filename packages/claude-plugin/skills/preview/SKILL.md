---
name: shadowrepo-preview
description: >
  Impact assessment: given a feature doc or PRD, analyze how it would affect the existing
  ShadowRepo. Runs check first to ensure specs are current. v0.2 — stub implementation.
  Use when: "what would this change affect", "preview impact", "impact assessment".
---

# ShadowRepo Preview

**Status: v0.2 — not yet implemented.**

## Intent

Given a feature document, PRD, or description of planned changes, analyze:
- Which existing features/specs would be affected
- Which specs might become stale
- Which areas would need new specs
- Potential conflicts with existing constraints or decisions

## When Available

This skill will be built after build, check, and update are validated. It depends on:
- A mature spec graph with good relation coverage
- Reliable drift detection (check skill)
- Understanding of how to map natural-language feature descriptions to code areas

## Workaround

Until preview is implemented, users can:
1. Run `/shadowrepo check` to see current state
2. Manually read relevant specs from `.shadowrepo/specs.json`
3. Use `/shadowrepo render feature-detail {feature}` to understand affected areas
