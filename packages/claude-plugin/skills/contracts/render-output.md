# Render Output Contract

The output specification for the render skill.

## Schema

```json
{
  "format": "'onboarding' | 'architecture' | 'feature-detail' | 'changelog' | 'custom'",
  "content": "string — rendered markdown document",
  "source_specs": ["string[] — spec_ids that contributed to this document"],
  "target_path": "string | null — file path if user wants it written to disk"
}
```

## Format Descriptions

- **onboarding** — New developer guide: project structure, key features, important constraints and conventions
- **architecture** — System overview: feature tree, major decisions, cross-cutting patterns, dependency relationships
- **feature-detail** — Deep dive on one feature: all specs, related specs from other features, file inventory
- **changelog** — What changed since last update: new specs, updated specs, resolved drifts
- **custom** — User-specified format with a description of what they want
