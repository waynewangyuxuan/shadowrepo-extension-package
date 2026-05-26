# Git Operations

How to interact with git for drift detection and context gathering. Follow the fallback chains top-to-bottom — use the first approach that works.

---

## Get Changed Files

### Primary: git diff
```bash
git diff --name-only --diff-filter=ACMR {since_ref}
```
For renamed files:
```bash
git diff --name-only --diff-filter=R {since_ref}
```
For deleted files:
```bash
git diff --name-only --diff-filter=D {since_ref}
```

### Determining `since_ref`
1. If `.shadowrepo/meta.json` exists and has `last_commit_hash`: use that
2. Else if user provides a ref: use that
3. Else: use `HEAD~20` as a reasonable default for first check

### Fallback: file system only
If not in a git repository (no `.git` directory):
- Cannot detect changes — report error: "Not a git repository. Check/update requires git history."
- Build skill can still work without git (scans all files)

---

## Get Last Commit Info

```bash
git log -1 --format="%H %s"
```

Returns: commit hash + message for `.shadowrepo/meta.json`.

---

## Get File Blame (optional context)

```bash
git blame -L {start},{end} -- {filepath}
```

Use sparingly — only when you need to understand when/why a specific section was written. Not needed for most extraction.

---

## Get Remote Info

```bash
git remote get-url origin
```

For repo identification in `meta.json`. If no remote: use directory name.

---

## Error Handling

- `git` command not found → degrade to file-system-only mode
- Not a git repo → build works (full scan), check/update report error
- Detached HEAD → use `HEAD` as ref, note in meta.json
- Merge conflicts present → warn user, proceed with current file state
