# GitHub Repository Setup for Open Source

## 🔒 Repository Protection Settings

### 1. Branch Protection Rules
Go to: **Settings → Branches → Add rule**

**Rule Name**: `main`

**Enable these protections:**
- ✅ Require a pull request before merging
- ✅ Require approvals (set to 1 - meaning you must approve)
- ✅ Dismiss stale reviews when new commits are pushed
- ✅ Require status checks to pass before merging
- ✅ Require branches to be up to date before merging
- ✅ Include administrators (applies rules to you too)

### 2. General Settings
Go to: **Settings → General**

**Features to Enable:**
- ✅ Issues (for bug reports)
- ✅ Discussions (for community questions)
- ✅ Wiki (if you want documentation)

**Features to Consider Disabling:**
- ❌ Projects (unless you want public project boards)
- ❌ Security advisories (enable if you want vulnerability reporting)

### 3. Collaborators & Teams
Go to: **Settings → Collaborators and teams**

**Keep this empty** unless you want to give others direct write access.

### 4. Security Settings
Go to: **Settings → Security & analysis**

**Enable:**
- ✅ Dependency alerts
- ✅ Dependabot security updates
- ✅ Secret scanning (prevents API keys from being committed)

## 🔄 How Open Source Contributions Work

### The Safe Process:
1. **Someone finds a bug or wants a feature**
2. **They fork your repository** (makes their own copy)
3. **They make changes in their copy**
4. **They submit a Pull Request** (asks you to review their changes)
5. **You review the code** (you can see exactly what they changed)
6. **You decide:** Accept, request changes, or reject
7. **If you accept:** You merge their changes into your repository

### You Always Have Control:
- **Review every change** before it goes into your code
- **Reject any changes** you don't like
- **Request modifications** before accepting
- **Close pull requests** without merging

## 🚨 What to Watch For

### Red Flags in Pull Requests:
- Changes to security-related files (`electron-main.js`, crypto utils)
- Addition of network requests or tracking
- Suspicious dependencies in `package.json`
- Changes to build scripts or CI/CD
- Large, unexplained changes

### Safe Contributions:
- Bug fixes with clear explanations
- UI improvements with screenshots
- New features that align with your privacy goals
- Documentation improvements
- Small, focused changes

## 📋 Recommended Workflow

### For Each Pull Request:
1. **Read the description** - understand what they're trying to do
2. **Review the code changes** - check every modified file
3. **Test locally** if it's a significant change:
   ```bash
   git checkout pr-branch
   npm install
   npm run electron-dev
   ```
4. **Ask questions** if anything is unclear
5. **Approve or request changes**

### Templates for Responses:
**Requesting Changes:**
> Thanks for the contribution! Could you please clarify why you changed X? Also, this feature seems to require internet connectivity, which goes against Dash's offline-first principle.

**Approving:**
> Great fix! I've tested this and it resolves the issue. Thanks for contributing to Dash!

**Rejecting:**
> Thanks for the suggestion, but this feature doesn't align with Dash's privacy-focused goals. I'm going to close this PR.

## 🛠️ Quick Setup Commands

Run these after making your repository public:

```bash
# Add repository topics for discoverability
# Go to GitHub → About section → Settings (gear icon)
# Add topics: privacy, notes, electron, offline, encryption

# Create issue templates
mkdir -p .github/ISSUE_TEMPLATE
```

## 🎯 Bottom Line

**You maintain complete control.** Open source just means people can see your code and suggest improvements. Every change still requires your explicit approval.
