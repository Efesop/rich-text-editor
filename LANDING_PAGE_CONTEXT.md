# Dash - Product Context for Landing Page

> This document provides full context about Dash for use by AI or developers working on the landing page, marketing site, or SEO content.

---

## Product Overview

**Dash** is a privacy-first, offline note-taking application. It's designed for people who want complete control over their data without relying on cloud services, accounts, or internet connectivity.

### One-Liner
> "Your notes, your device, your privacy. No cloud, no tracking, no compromises."

### Elevator Pitch
Dash is a beautiful, privacy-first note-taking app that keeps your thoughts completely offline and encrypted. Unlike Notion, Evernote, or Google Keep, your data never touches a server. Everything stays on your device, protected by military-grade encryption. Built for people who value their privacy above all else - no accounts, no tracking, no compromises. Also trusted by journalists, lawyers, and professionals who need true privacy.

---

## Target Audience

### Primary Users (Privacy-Focused)
1. **Privacy-Conscious Individuals** - People who value their digital privacy and want complete control over their data
2. **Security-Minded Users** - People who distrust cloud services and prefer local-first software
3. **Data Ownership Advocates** - Users who believe in owning their data, not renting it from big tech companies
4. **Offline-First Advocates** - People who want tools that work without internet dependency
5. **Privacy Enthusiasts** - Users actively seeking alternatives to mainstream note apps due to privacy concerns

### Secondary Users (Professional Use Cases)
1. **Journalists** - Handle sensitive sources and information, need offline, encrypted note-taking
2. **Lawyers & Legal Professionals** - Client confidentiality, attorney-client privilege protection
3. **Activists & Organizers** - Protect sensitive planning and information from surveillance
4. **Healthcare Professionals** - HIPAA compliance, patient information protection (when used carefully)
5. **Students** - Need reliable, distraction-free note-taking with data privacy
6. **Writers & Authors** - Want a clean, focused writing environment with full data control
7. **Developers** - Appreciate open-source, self-hostable solutions
8. **Digital Minimalists** - Prefer simple tools that do one thing well
9. **Remote Workers** - Work in areas with limited/no internet (remote locations, flights, etc.)

### User Pain Points We Solve
- "I don't trust my notes in someone else's cloud"
- "I want a note app that truly respects my privacy"
- "I need my notes to work without internet"
- "I want to encrypt specific sensitive notes"
- "I'm tired of subscription-based note apps that mine my data"
- "I want to own my data, not rent access to it"
- "I don't want to create an account just to take notes"
- "I need a tool that doesn't track or profile me"

---

## Key Features

### 🔒 Privacy & Security
| Feature | Description | Benefit |
|---------|-------------|---------|
| 100% Offline | No internet required, ever | Your data never leaves your device |
| AES-256 Encryption | Military-grade encryption | Protect sensitive notes with passwords |
| Auto-Lock on Inactivity | Lock the entire app after idle timeout | Unattended devices stay protected |
| Touch ID / Biometric Unlock | Use Touch ID instead of typing a password | Fast, secure access on macOS |
| Self-Destructing Notes | Set notes to auto-delete after a time period | Sensitive info doesn't linger |
| No Account Required | Use immediately, no sign-up | Zero personal data collected |
| No Tracking | Zero analytics or telemetry | Complete privacy, no profiling |
| Local Storage | Data stored in user directory | You control where your data lives |

### 📝 Note Taking
| Feature | Description | Benefit |
|---------|-------------|---------|
| Rich Text Editor | Headers, lists, checklists, quotes, code blocks | Full formatting without complexity |
| Syntax-Highlighted Code | 20+ languages with proper syntax coloring | Developer-friendly code snippets |
| Focus Mode | Distraction-free writing with Cmd+Shift+F | Full-screen writing without clutter |
| Multiple Block Types | Paragraphs, headers, lists, code, embeds | Flexible content creation |
| Live Word Count | Real-time character/word counting | Track writing progress |
| Auto-Save | Changes saved automatically | Never lose work |

### 📤 Export & Portability
| Feature | Description | Benefit |
|---------|-------------|---------|
| PDF Export | Professional PDF output | Share or print notes |
| Markdown Export | Standard .md format | Use notes in any tool |
| Word/DOCX Export | Microsoft Word format | Professional documents |
| Encrypted Bundles | .dashpack format | Securely share between devices |
| JSON/XML Export | Raw data formats | Developer-friendly backups |

### 🗂️ Organization
| Feature | Description | Benefit |
|---------|-------------|---------|
| Folders | Nested organization | Keep notes structured |
| Color-Coded Tags | Visual categorization | Quick identification |
| Quick Switcher (Cmd+P) | VS Code-style fuzzy search overlay | Jump to any page instantly |
| Fuzzy Search | Find-as-you-type | Instant results |
| Smart Filtering | Filter by folder, tag, or search | Find anything fast |

### 🎨 Design & UX
| Feature | Description | Benefit |
|---------|-------------|---------|
| Light Theme | Clean, bright interface | Comfortable daytime use |
| Dark Theme | Easy on the eyes | Late night writing |
| Fallout Theme | Retro terminal aesthetic | Unique, fun experience |
| Responsive Design | Works on any screen | Desktop to mobile |
| Minimal Interface | Distraction-free | Focus on writing |

### 📱 Platform Support
| Platform | Type | Notes |
|----------|------|-------|
| macOS | Native Electron App | Primary platform, auto-updates |
| Windows | Native Electron App | Full feature parity |
| Linux | Native Electron App | AppImage, deb, rpm |
| iOS | Progressive Web App | Install from Safari |
| Android | Progressive Web App | Install from Chrome |

---

## Competitive Positioning

### How Dash Compares

| Feature | Dash | Notion | Evernote | Apple Notes | Obsidian |
|---------|------|--------|----------|-------------|----------|
| 100% Offline | ✅ | ❌ | ❌ | ⚠️ | ✅ |
| No Account Required | ✅ | ❌ | ❌ | ❌ | ✅ |
| No Subscription | ✅ | ❌ | ❌ | ✅ | ✅ |
| End-to-End Encryption | ✅ | ❌ | ❌ | ⚠️ | ⚠️ |
| Biometric Unlock | ✅ | ❌ | ❌ | ✅ | ❌ |
| Self-Destructing Notes | ✅ | ❌ | ❌ | ❌ | ❌ |
| Open Source | ✅ | ❌ | ❌ | ❌ | ❌ |
| Cross-Platform | ✅ | ✅ | ✅ | ❌ | ✅ |
| Rich Text Editor | ✅ | ✅ | ✅ | ✅ | ⚠️ |
| Export Formats | 8+ | Limited | Limited | Limited | ✅ |

### Key Differentiators
1. **True Privacy** - Not "privacy-focused" marketing, actually offline-first
2. **No Vendor Lock-In** - Export everything in standard formats
3. **One-Time Purchase** - No subscriptions (or free forever for personal use)
4. **Open Source** - Audit the code yourself
5. **Beautiful Design** - Privacy doesn't mean ugly

---

## Technical Details

### Tech Stack
- **Frontend**: Next.js 13, React 18
- **Editor**: Editor.js
- **Desktop**: Electron
- **Mobile**: Progressive Web App (PWA)
- **Styling**: Tailwind CSS, Radix UI
- **Encryption**: AES-256-GCM
- **State Management**: Zustand

### Data Storage
| Platform | Method | Location |
|----------|--------|----------|
| macOS | JSON files | `~/Library/Application Support/Dash/` |
| Windows | JSON files | `%APPDATA%/Dash/` |
| Linux | JSON files | `~/.config/Dash/` |
| Mobile PWA | IndexedDB | Browser storage |

### Security Features
- AES-256-GCM encryption for password-protected pages
- Auto-lock on inactivity with configurable timeout
- Touch ID / biometric unlock (macOS)
- Self-destructing notes with timed auto-deletion
- DOMPurify sanitization to prevent XSS
- No external network requests
- Electron sandbox enabled
- Rate limiting on password attempts

---

## Brand Voice & Messaging

### Tone
- **Confident** - We know privacy matters
- **Straightforward** - No marketing fluff
- **Empowering** - You own your data
- **Approachable** - Not intimidating or overly technical

### Key Messages (Priority Order)
1. "Your notes, your device, your privacy" (PRIMARY)
2. "The note app that truly respects your privacy" (PRIMARY)
3. "No cloud. No tracking. No compromises." (PRIMARY)
4. "Privacy shouldn't require a subscription" (PRIMARY)
5. "Beautiful notes, brutal privacy" (SECONDARY)
6. "Take notes without being tracked" (PRIMARY)
7. "100% offline. 100% private." (PRIMARY)
8. "The note app built for privacy advocates" (SECONDARY)

### Words to Use
- Privacy, Secure, Encrypted, Offline, Local, Own, Control, Free, Open
- Beautiful, Clean, Minimal, Focused, Distraction-free
- Cross-platform, Portable, Export, Sync (device-to-device)

### Words to Avoid
- Cloud, Server, Account, Sign up, Subscribe, Sync (to cloud)
- Track, Analytics, Telemetry, Data collection
- AI-powered, Machine learning (we don't use these)

---

## Landing Page Content Ideas

### Homepage Sections
1. **Hero** - Main value prop + screenshot + download buttons
2. **Features Grid** - Key features with icons
3. **Privacy Promise** - Detailed explanation of our privacy approach
4. **How It Works** - Simple 3-step explanation
5. **Comparison Table** - vs competitors
6. **Testimonials** - User quotes (when available)
7. **Pricing** - Free personal use, paid for commercial
8. **Download** - Platform-specific download buttons
9. **FAQ** - Common questions

### Additional SEO Pages

**Privacy-Focused (Priority)**
1. `/privacy` - Our privacy philosophy in depth (HIGH PRIORITY)
2. `/security` - Technical security details (HIGH PRIORITY)
3. `/private-notes` - SEO page for "private note taking" (HIGH PRIORITY)
4. `/encrypted-notes` - SEO page for "encrypted note taking" (HIGH PRIORITY)
5. `/offline-notes` - SEO page for "offline note taking" (HIGH PRIORITY)
6. `/no-tracking` - SEO page for "note app without tracking"
7. `/local-notes` - SEO page for "local note taking app"
8. `/open-source` - Why we're open source (HIGH PRIORITY)

**Comparison Pages**
9. `/vs-notion` - Dash vs Notion comparison (privacy angle)
10. `/vs-evernote` - Dash vs Evernote comparison (privacy angle)
11. `/vs-apple-notes` - Dash vs Apple Notes comparison (privacy angle)
12. `/vs-obsidian` - Dash vs Obsidian comparison

**Use Cases (Secondary)**
13. `/for-journalists` - Use case for journalists
14. `/for-lawyers` - Use case for lawyers
15. `/for-privacy-advocates` - Use case for privacy-focused users (HIGH PRIORITY)
16. `/for-students` - Use case for students
17. `/for-writers` - Use case for writers

**Other**
18. `/features` - Full feature breakdown
19. `/changelog` - Version history
20. `/roadmap` - Future plans

### Blog Post Ideas (Priority Order)

**Privacy-Focused (Primary)**
1. "Why Your Notes Shouldn't Live in the Cloud" (HIGH PRIORITY)
2. "The True Cost of 'Free' Note-Taking Apps" (HIGH PRIORITY)
3. "How to Keep Your Notes Private in [Year]" (HIGH PRIORITY)
4. "Privacy-First Note Taking: Why It Matters" (HIGH PRIORITY)
5. "Comparing Note-Taking Apps: A Privacy Perspective" (HIGH PRIORITY)
6. "The Case for Local-First Software" (HIGH PRIORITY)
7. "What Your Note App Knows About You" (HIGH PRIORITY)
8. "Why Privacy-Focused Note Apps Are Better" (HIGH PRIORITY)

**Secondary Topics**
9. "Offline-First: Why It Matters"
10. "Encryption for Everyone: Protecting Your Notes"
11. "Dash vs [Competitor]: Privacy Comparison"

---

## User Journey

### Awareness → Consideration → Decision → Retention

1. **Awareness**
   - User searches "private note taking app" or "offline notes app"
   - Lands on SEO page or comparison page
   
2. **Consideration**
   - Reads features, sees screenshots
   - Compares to current tool (Notion, etc.)
   - Checks if it works on their platform
   
3. **Decision**
   - Downloads app (free, no account needed)
   - Tries it immediately
   - Zero friction to value
   
4. **Retention**
   - Auto-updates keep app fresh
   - Export features prevent lock-in
   - Word of mouth referrals

---

## Downloads & Links

- **GitHub Releases**: https://github.com/Efesop/rich-text-editor/releases
- **PWA (Mobile)**: https://efesop.github.io/rich-text-editor/
- **Source Code**: https://github.com/Efesop/rich-text-editor
- **Landing Page**: https://dashnote.io (or wherever you host it)

---

## Version History (Recent)

### v1.3.101 (Current)
- What's New modal — shows new features after each update
- Quick Switcher (Cmd+P) — jump to any page instantly
- Self-Destructing Notes — set pages to auto-delete after a time period
- Auto-Lock on Inactivity — lock the app after idle timeout with password or Touch ID

### v1.3.100
- Focus Mode — distraction-free full-screen writing
- Syntax-highlighted code blocks (20+ languages)

### v1.3.98
- Dark Blue theme
- Tag system with color-coded tags
- Drag-and-drop page reordering

### v1.3.85
- Fixed pages leaving folders after editing
- Fixed folder data persistence
- Redesigned modals with modern styling
- Full theme support for all modals
- Improved accessibility

---

## FAQ

**Is Dash really free?**
Yes, Dash is free for personal use. No account, no subscription, no hidden costs.

**Can I use Dash offline?**
Yes! Dash is 100% offline. It never connects to the internet. Your data stays on your device.

**Where is my data stored?**
On your device only. Desktop: in your user application data folder. Mobile: in browser storage (IndexedDB).

**Is my data encrypted?**
Your data is stored locally in plain JSON by default. You can enable password protection on individual pages, which encrypts them with AES-256.

**Can I sync between devices?**
Yes, using encrypted export/import. Export a `.dashpack` file from one device, import on another. No cloud sync.

**What happens if I lose my device?**
Export your notes regularly as a backup. We recommend keeping encrypted `.dashpack` backups.

**Is Dash open source?**
Yes! The full source code is available on GitHub. You can audit it yourself.

---

*This document was last updated on March 1, 2026 and reflects Dash v1.3.101*
