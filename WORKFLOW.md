# Development Workflow

## Commit and Push Changes

When ready to commit and push changes:

```bash
npm test                  # Test suite — MUST pass before release (71 suites, 336 subtests)
git add .
git commit -m "Your commit message here"
npm version patch
git push origin main --follow-tags
```

### Pre-Release Checklist

Before every release:

1. **Run `npm test`** — all 71 suites (336 subtests) must pass. Covers XSS, encryption schema, import safety, export escaping, URL validation, data-safety invariants, codebase static analysis, page-switch race-condition prevention.
2. **Run the server-side sync tests** — `cd server && deno test --allow-net --allow-read --allow-env --unstable-kv sync-tests.ts` (51 tests). Important now that sync is live.
3. Verify no `savePagesToStorage([])` patterns in the diff.
4. Verify encrypted-content field names match schema (`data`/`iv`, NOT `ciphertext`).
5. (Optional) Run `npm run build` to confirm a clean compile.

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
- **Release tags**: `npm version patch|minor` creates the tag; pushing it (`git push origin main --follow-tags`) triggers the GitHub Actions macOS DMG build and the PWA deploy. Tags are current (latest `v1.6.3`, Sep 8 2026). The iOS app ships separately via Xcode archive + App Store Connect, not git tags — bump `MARKETING_VERSION` / `CURRENT_PROJECT_VERSION` in `ios/App/App.xcodeproj/project.pbxproj` on every upload.

## Open Source Guidelines

This is an open source project. When contributing:
- All code is MIT licensed
- No tracking, analytics, or data collection
- All data stays 100% local on user devices
- PRs welcome for bug fixes and improvements
