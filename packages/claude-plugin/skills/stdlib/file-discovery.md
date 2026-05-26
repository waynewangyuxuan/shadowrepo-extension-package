# File Discovery

Rules for classifying files in a repository. Used during the Sense step of recursion.

---

## Source File Extensions

Include files with these extensions:

`.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs`, `.py`, `.rb`, `.go`, `.rs`, `.java`, `.kt`, `.swift`, `.vue`, `.svelte`, `.astro`, `.c`, `.cpp`, `.h`, `.hpp`, `.cs`

## Skip Patterns

Exclude files matching any of these patterns (layered on top of .gitignore):

- `**/*.test.*` — test files
- `**/*.spec.*` — spec/test files
- `**/__tests__/**` — test directories
- `**/*.d.ts` — TypeScript declaration files
- `**/*.min.*` — minified files
- `**/fixture/**`, `**/fixtures/**` — test fixtures
- `**/mock/**`, `**/mocks/**` — test mocks
- `.shadowrepo/**` — our own output

## Excluded Directories

When .gitignore is unavailable, always exclude:

`node_modules`, `.git`, `dist`, `build`, `out`, `.next`, `coverage`, `.turbo`, `.cache`, `__pycache__`, `.venv`, `vendor`, `target`, `.shadowrepo`

## Document Detection

Files that are documentation (not source code):

- `README.md` (case-insensitive)
- `CONTRIBUTING.md`, `CHANGELOG.md`, `ARCHITECTURE.md`, `CLAUDE.md`
- Anything under `docs/`
- Anything under `.github/`
- Files starting with `ADR-` or `ADR_`

## Important Manifest Files

Files that reveal project structure and dependencies:

`README.md`, `package.json`, `tsconfig.json`, `pyproject.toml`, `setup.py`, `go.mod`, `Cargo.toml`, `pom.xml`, `build.gradle`

## Max File Size

100 KB. Skip files larger than this — they are likely generated or vendored.

## Classification

Given a file path, classify as:

| Category | Criteria |
|----------|----------|
| **source** | Extension in source list, not matching skip patterns |
| **document** | Matches document detection patterns |
| **config** | Manifest files, or `.json`/`.yaml`/`.toml` in repo root |
| **test** | Matches `*.test.*`, `*.spec.*`, or in `__tests__/` |
| **other** | Everything else — ignore for extraction |
