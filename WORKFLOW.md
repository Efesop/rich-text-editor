# Development Workflow

## Commit and Push Changes

When ready to commit and push changes:

```bash
git add .
git commit -m "Your commit message here"
npm version patch
git push origin main --follow-tags
```

### Version Bumping Options
- `npm version patch` - Bug fixes (1.3.85 → 1.3.86)
- `npm version minor` - New features (1.3.85 → 1.4.0)
- `npm version major` - Breaking changes (1.3.85 → 2.0.0)

### Example
```bash
git add .
git commit -m "Fix critical bugs: folder state sync, modal redesign"
npm version patch
git push origin main --follow-tags
```

### Important Notes
- **Never** include "Co-Authored-By: Claude" or any AI attribution in commits
- Keep commit messages concise but descriptive
- Use conventional commit style when possible (fix:, feat:, docs:, etc.)

## Open Source Guidelines

This is an open source project. When contributing:
- All code is MIT licensed
- No tracking, analytics, or data collection
- All data stays 100% local on user devices
- PRs welcome for bug fixes and improvements
