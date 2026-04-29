<p align="center">
  <img src="icons/Dashmac1024.png" width="128" height="128" alt="Dash">
</p>

<h1 align="center">Dash</h1>

<p align="center">
  <strong>Private notes app. No cloud, no tracking, your data stays on your device.</strong>
</p>

<p align="center">
  <a href="https://dashnote.io">Website</a> &middot;
  <a href="https://github.com/Efesop/rich-text-editor/releases">Releases</a> &middot;
  <a href="./FEATURES.md">Features</a> &middot;
  <a href="./CHANGELOG.md">Changelog</a>
</p>

---

## What is Dash?

Dash is a privacy-first, offline-first note-taking app. Everything is stored locally on your device with AES-256 encryption. No accounts, no cloud sync, no telemetry.

**Get it at [dashnote.io](https://dashnote.io)**

### Highlights

- **100% Offline** - Works without internet. No data ever leaves your device.
- **AES-256 Encryption** - Lock individual notes or the entire app with password protection.
- **Rich Editor** - 15+ block types: headers, lists, code, tables, images, embeds, seed phrase storage, and more.
- **Page Linking** - Type `[[` to create wiki-style links between pages, or highlight text and link via the toolbar.
- **4 Themes** - Light, Dark, Dark Blue, and Fallout (retro terminal).
- **Folders & Tags** - Organize with drag-and-drop folders and color-coded tags.
- **Quick Switcher** - Cmd+P to jump to any note instantly.
- **Self-Destructing Notes** - Set notes to auto-delete after a time period.
- **Duress Password** - A secondary password that silently shows decoy notes under coercion (real data stays encrypted on disk).
- **Seed Phrase Storage** - Secure numbered grid for crypto wallet recovery phrases with BIP-39 validation.
- **Touch ID** - Biometric unlock on macOS.
- **Focus Mode** - Distraction-free writing with typewriter scrolling, paragraph dimming, and session stats.
- **Export Anywhere** - PDF, Markdown, Word, RTF, JSON, XML, CSV. All optionally encrypted.

See [FEATURES.md](./FEATURES.md) for the full feature list.

## Platforms

| Platform | Method |
|----------|--------|
| **macOS** | Native app ([download](https://dashnote.io)) |
| **Browser** | [Web version](https://efesop.github.io/rich-text-editor/) |

## Tech Stack

Next.js 13, React 18, Editor.js, Electron, Tailwind CSS, Zustand, @dnd-kit, WebCrypto API.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for technical details.

## Development

```bash
npm install
npm run dev            # Web dev server (localhost:3000)
npm run electron-dev   # Desktop app dev mode
```

## Contributing

Contributions welcome. Please open an issue first to discuss what you'd like to change.

1. Fork the repo
2. Create a feature branch
3. Make your changes
4. Open a Pull Request

## License

[MIT](./LICENSE) - Filmshape Ltd
