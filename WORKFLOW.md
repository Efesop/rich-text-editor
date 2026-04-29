# Development Workflow

## Commit and Push Changes

When ready to commit and push changes:

```bash
npm test                  # Security test suite — MUST pass before release (116 tests, 19 suites)
git add .
git commit -m "Your commit message here"
npm version patch
git push origin main --follow-tags
```

### Pre-Release Checklist

Before every release:

1. **Run `npm test`** — all tests must pass. Covers XSS, encryption schema, import safety, export escaping, URL validation, data-safety invariants, codebase static analysis, page-switch race-condition prevention.
2. Verify no `savePagesToStorage([])` patterns in the diff.
3. Verify encrypted-content field names match schema (`data`/`iv`, NOT `ciphertext`).
4. (Optional) Run `npm run build` to confirm a clean compile.

If `npm test` fails, **do not release**. Diagnose and fix first.

### Version Bumping Options
- `npm version patch` - Bug fixes (1.3.85 → 1.3.86)
- `npm version minor` - New features (1.3.85 → 1.4.0)
- `npm version major` - Breaking changes (1.3.85 → 2.0.0)

### Example
```bash
npm test
git add .
git commit -m "fix: critical bugs — folder state sync, modal redesign"
npm version patch
git push origin main --follow-tags
```

### Important Notes
- **Never** include "Co-Authored-By: Claude" or any AI attribution in commits
- Keep commit messages concise but descriptive
- Use conventional commit style: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `perf:`

## Open Source Guidelines

This is an open source project. When contributing:
- All code is MIT licensed
- No tracking, analytics, or data collection
- All data stays 100% local on user devices
- PRs welcome for bug fixes and improvements
