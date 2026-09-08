# Contributing to Dash

Thanks for your interest in contributing to Dash! 🎉

## 🚀 Quick Start

1. **Fork** the repository
2. **Clone** your fork: `git clone https://github.com/YOUR_USERNAME/rich-text-editor.git`
3. **Install** dependencies: `npm install`
4. **Start** development: `npm run electron-dev`

## 🛠️ Development

### Running the App

```bash
# Web development server (for UI development)
npm run dev

# Desktop app in development (recommended for testing)
npm run electron-dev

# Build desktop app for production
npm run electron:build

# Build PWA for mobile
npm run build:pwa
```

### Testing Your Changes

**For most changes**, test in the desktop app (`npm run electron-dev`) since that's how users run Dash.

Browser mode (`npm run dev`) is useful for:
- Rapid UI iteration
- React component development
- Styling and theme work

Browser mode **won't work** for:
- File system operations
- Auto-update features
- Testing persistence across sessions

### Code Style

- **Standard.js**: No semicolons, 2-space indentation
- **Functional components**: Always use hooks, never class components — the sole exception is `components/ErrorBoundary.js`, which must be a class (React error boundaries have no hook equivalent)
- **Descriptive naming**: `isLoading`, `hasError`, `handleSubmit`
- **File organization**: Component → Subcomponents → Helpers → Static content
- **Theme support**: Always handle all four themes — Light, Dark, Night (`darkblue`, labelled "Dark Blue" before v1.6), and Terminal (`fallout`, labelled "Fallout" before v1.6) — plus the "Match system appearance" toggle

### Project Structure

```
components/       # React components
hooks/            # Custom React hooks
lib/              # Storage abstractions
utils/            # Utility functions
store/            # Zustand stores
electron-main.js  # Electron main process
preload.js        # Electron preload (IPC bridge)
```

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed technical docs.

## 🎯 What We're Looking For

### 🔒 **Privacy & Security First**
- All features must maintain offline-first design
- No telemetry, analytics, or data collection
- Security enhancements are always welcome

### 🎨 **UI/UX Improvements**
- Clean, minimal design improvements
- Accessibility enhancements
- Mobile responsiveness fixes
- Theme improvements

### 📝 **Editor Features**
- New Editor.js blocks or tools
- Export format improvements
- Keyboard shortcuts
- Writing experience enhancements

### 🐛 **Bug Fixes**
- Cross-platform compatibility fixes
- Performance improvements
- Memory leak fixes
- Edge case handling

## 📋 Guidelines

### Before You Start
- **Check existing issues** to avoid duplicates
- **Open an issue** to discuss major changes first
- **Keep it simple** - Dash should remain lightweight and fast

### Pull Request Process
1. **Create a feature branch**: `git checkout -b feature/your-feature`
2. **Make your changes** and test thoroughly
3. **Test on macOS** — the only platform the release pipeline builds and ships. Windows/Linux code paths exist but aren't released, so testing them is best-effort.
4. **Write clear commit messages**
5. **Open a pull request** with a detailed description

### What to Include in PRs
- **Clear description** of what the change does
- **Screenshots** for UI changes
- **Testing instructions** for reviewers
- **Platform compatibility** notes if relevant

## 🚫 What We Don't Want

- Features that require internet connectivity
- Analytics, tracking, or telemetry of any kind
- Cloud storage integrations
- Heavy dependencies that bloat the app
- Features that compromise user privacy

## 🤝 Community

- Be respectful and constructive
- Help newcomers get started
- Share ideas and feedback
- Report bugs with detailed reproduction steps

## 📞 Questions?

- **Open an issue** for bugs or feature requests
- **Start a discussion** for questions or ideas
- **Check existing issues** for common problems

---

**Remember**: Dash is built for privacy-conscious users. Every contribution should respect that core principle.

Thanks for helping make Dash better! 🙏
