# Dash - Privacy-First Note Taking

> Your notes, your device, your privacy. No cloud, no tracking, no compromises.

Dash is a beautiful, privacy-focused note-taking app that keeps your thoughts completely offline and encrypted. Built for people who value their privacy and want full control over their data.

![Dash Screenshot](https://via.placeholder.com/800x500?text=Dash+Screenshot+Coming+Soon)

## ✨ Features

### 🔒 **Privacy & Security**
- **100% Offline** - No internet required, no data ever leaves your device
- **AES-256 Encryption** - Military-grade encryption for sensitive notes
- **Password Protection** - Lock individual pages with custom passwords
- **No Tracking** - Zero analytics, telemetry, or data collection

### 📝 **Rich Note Taking**
- **Rich Text Editor** - Powered by Editor.js with full formatting support
- **Multiple Export Formats** - PDF, Markdown, Word, RTF, JSON, XML, and more
- **Encrypted Bundles** - Share notes securely with `.dashpack` files
- **Live Word Count** - Track your writing progress

### 🗂️ **Organization**
- **Folders & Tags** - Organize notes with folders and color-coded tags
- **Advanced Search** - Find anything instantly with fuzzy search
- **Smart Filtering** - Filter by tags, folders, or search terms

### 🎨 **Beautiful Design**
- **Multiple Themes** - Light, Dark, and unique Fallout themes
- **Responsive Design** - Adapts perfectly to any screen size
- **Clean Interface** - Distraction-free writing experience

### 📱 **Cross Platform**
- **Desktop App** - Native Electron app for Windows, macOS, and Linux
- **Mobile PWA** - Install on iOS/Android as a web app
- **Data Sync** - Import/export encrypted bundles between devices

## 🚀 Quick Start

### Desktop Installation

**Option 1: Download Release**
1. Go to [Releases](https://github.com/Efesop/rich-text-editor/releases)
2. Download the latest version for your OS
3. Install and run Dash

**Option 2: Install from npm**
```bash
npm install -g dash
dash
```

### Mobile Installation (PWA)
1. Visit: https://efesop.github.io/rich-text-editor/
2. Tap "Share" → "Add to Home Screen" 
3. Open Dash from your home screen

### Development Setup

```bash
# Clone the repository
git clone https://github.com/Efesop/rich-text-editor.git
cd rich-text-editor

# Install dependencies  
npm install

# Run development server
npm run dev

# Run Electron app in development
npm run electron-dev

# Build for production
npm run build
```

## 📖 Usage

### Creating Your First Note
1. Click "New Page" in the sidebar
2. Give your note a title
3. Start writing with the rich text editor
4. Add tags and organize in folders as needed

### Password Protection
1. Open any note
2. Click the lock icon in the toolbar
3. Set a password to encrypt that specific note
4. The note will require the password to open

### Exporting Notes
1. Click "Export" in the toolbar
2. Choose your format (PDF, Markdown, etc.)
3. For sharing: Use "Export all pages (Encrypted)" to create a `.dashpack` file

### Themes
1. Click the theme toggle in the top-right
2. Choose between Light, Dark, or Fallout themes
3. Your preference is saved automatically

## 🛠️ Tech Stack

- **Frontend**: Next.js 13, React 18, TypeScript
- **Editor**: Editor.js for rich text editing
- **Desktop**: Electron for cross-platform native apps
- **Mobile**: Progressive Web App (PWA)
- **Styling**: Tailwind CSS, Radix UI components
- **Security**: AES-256-GCM encryption, DOMPurify sanitization
- **State**: Zustand for state management

## 🤝 Contributing

Contributions are welcome! Here's how to get started:

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/amazing-feature`
3. **Make your changes** and test them
4. **Commit your changes**: `git commit -m 'Add amazing feature'`
5. **Push to the branch**: `git push origin feature/amazing-feature`
6. **Open a Pull Request**

### Development Guidelines
- Follow the existing code style (Standard.js)
- Focus on privacy and security in all features
- Test on both desktop and mobile
- Keep the UI clean and minimal

## 📋 Roadmap

- [ ] Real-time collaboration (local network only)
- [ ] Plugin system for custom blocks
- [ ] Advanced export templates
- [ ] Vim key bindings
- [ ] Database encryption at rest
- [ ] Self-hosted sync server option

## 🐛 Bug Reports

Found a bug? Please open an issue with:
- Steps to reproduce
- Expected vs actual behavior
- Your OS and Dash version
- Screenshots if applicable

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Editor.js](https://editorjs.io/) - Amazing rich text editor
- [Electron](https://www.electronjs.org/) - Cross-platform desktop apps
- [Next.js](https://nextjs.org/) - React framework
- [Tailwind CSS](https://tailwindcss.com/) - Utility-first CSS

---

**Built with ❤️ for privacy-conscious note takers**

*Your notes should be yours alone. With Dash, they always will be.*