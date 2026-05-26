# @shadowrepo/shared

Shared TypeScript types and constants for the ShadowRepo `.shadowrepo/*.json` on-disk schema.

Consumed by both `@shadowrepo/vscode-extension` (reads the JSON) and the Claude plugin's skills (writes the JSON). Keeping the schema in one place prevents drift between producer and consumer.

Source of truth for the type definitions is [`packages/claude-plugin/spec/Schema/Types.md`](../claude-plugin/spec/Schema/Types.md). Update both when the schema evolves.
