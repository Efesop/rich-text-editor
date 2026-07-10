# Privacy-First Note Taking

> Context document for generating a landing/resource page about privacy-first design and how Dash implements it.

---

## SEO Target Keywords

- privacy-first note taking
- private notes app
- zero-knowledge notes
- no tracking note app
- secure notes app
- private journal app
- no cloud notes
- no telemetry notes app
- local notes app privacy
- notes app without account

---

## What Does Privacy-First Mean?

Privacy-first is a design philosophy where user privacy is the **primary constraint** that shapes every technical and product decision. It's not a feature added on top — it's the foundation everything else is built on.

A privacy-first app asks: "How do we build this so we never need to see user data?" rather than "How do we protect the user data we collect?"

This is fundamentally different from how most software is built. Most apps collect data by default and add privacy controls as an afterthought. A privacy-first app is architectured from day one to minimize or eliminate data collection entirely.

### Privacy-First vs Privacy-Focused vs Privacy-Compliant

**Privacy-compliant:**
- Meets legal requirements (GDPR, CCPA, etc.)
- Collects data but gives users control over it
- Has a privacy policy, cookie consent, data deletion requests
- Example: Most major apps with a "Privacy Center"

**Privacy-focused:**
- Takes privacy more seriously than required by law
- May encrypt data, limit collection, anonymize analytics
- Still typically involves servers, accounts, and some data processing
- Example: Standard Notes, Proton Notes

**Privacy-first / Zero-knowledge:**
- Architectured so the developer **cannot** read user data even if they wanted to — content is encrypted on-device and only ciphertext ever leaves it
- No account for local note-taking; no telemetry; any server involvement (optional sync/sharing) is zero-knowledge — it handles ciphertext it cannot decrypt
- Privacy is guaranteed by architecture (client-side encryption), not by policy or promise
- Example: Dash

---

## The Problem with Cloud Note Apps

Most popular note-taking apps operate on a cloud-first model:

### Your Data on Their Servers
When you type a note in a cloud app, that text is sent to and stored on the company's servers. Even with encryption, the service typically holds the keys — they can read your notes if compelled by law enforcement, if an employee goes rogue, or if their systems are breached.

### Accounts and Identity
Cloud apps require an account. That account ties your notes to your email address, which ties to your identity. Your note-taking habits, topics, timestamps, and patterns become a profile — even if the content itself is encrypted.

### Telemetry and Analytics
Most apps include analytics that track how you use the product: which features you use, how often you open the app, how many notes you create, how long you spend writing. This data is typically sent to third-party analytics services (Amplitude, Segment, Mixpanel, Google Analytics) and processed on external infrastructure.

### Terms of Service
Cloud providers can change their terms. They can introduce AI training on your content, sell aggregated data, shut down the service, or increase prices. Your continued access depends on their continued operation and goodwill.

---

## How Dash Implements Privacy-First Design

### Zero Data Collection

Dash never reads your notes and never collects analytics. This isn't a policy choice — it's enforced by client-side encryption:

- **No data-reading server**: Dash has no backend that can read your notes. A zero-knowledge relay exists for optional features (encrypted sharing and, if you subscribe, Dash Sync), but it only ever handles ciphertext it cannot decrypt — no note content, no vault keys
- **No account for local use**: creating and editing notes needs no sign-up, login, or email. The optional Dash Sync feature uses a **passwordless magic-link email** to tie your subscription to your devices — the only personal data the service ever sees is that email (plus purchase state), never your notes
- **No analytics**: No Segment, Amplitude, Google Analytics, Mixpanel, Sentry, or any other telemetry service
- **No telemetry**: The app makes no tracking or analytics network requests. Outbound network activity is limited to: checking for app updates (desktop), optional encrypted share uploads, and — only if you enable it — Dash Sync (all end-to-end encrypted)
- **No cookies or tracking**: No third-party scripts, no tracking pixels, no fingerprinting

This can be verified by inspecting the open-source code — there are no analytics packages in the dependencies and no tracking calls in the application logic.

### Local-First Storage

By default, all data in Dash stays on your device:

- **Desktop**: JSON files in your local app data directory
- **Mobile/PWA**: IndexedDB in your browser's sandboxed storage
- **Web**: localStorage in your browser

With sync off, your notes exist in exactly one place — the device you're using. **Dash Sync** is an optional subscription feature: when you turn it on, notes are encrypted on-device and synced across your own devices through the zero-knowledge relay, which stores only ciphertext it cannot read. Either way, the developer never has a readable copy of your notes.

### Client-Side Encryption

When you choose to encrypt a page in Dash:

- Encryption happens **in your browser/app** using the WebCrypto API
- Your password is used to derive an encryption key via PBKDF2-SHA256 (600,000 iterations)
- Content is encrypted with AES-256-GCM (authenticated encryption)
- The password and derived key are **never stored** — only the encrypted ciphertext, salt, and IV
- Decryption requires re-entering the password, which re-derives the key locally

This is zero-knowledge encryption: even if someone obtained a copy of your entire Dash data store, encrypted pages would be unreadable without the password.

### No Password Recovery (By Design)

Dash cannot offer "forgot password" functionality because:

- The password is never sent anywhere
- No hash of the password exists on any server
- No recovery key is stored externally
- The encryption is mathematically impossible to reverse without the password

This is the trade-off of true zero-knowledge design. The benefit: absolute certainty that only you can read your encrypted notes. The responsibility: you must remember your passwords.

### Open Source

Dash's code is publicly available and inspectable. Any claim about privacy can be verified by reading the source code. There are no hidden network calls, no obfuscated telemetry, and no backdoors. Privacy-first isn't a marketing claim — it's a verifiable technical property of the software.

---

## What Dash Doesn't Do

This is as important as what Dash does:

- **No AI processing of your content** — your notes are never sent to an AI service for "smart features"
- **No "anonymous" analytics** — there's no usage tracking at all, not even anonymized
- **No crash reporting** — no Sentry, Bugsnag, or similar services that capture app state
- **No A/B testing** — no feature flags that phone home
- **End-to-end encrypted sharing and sync** — when you choose to share a note, or enable Dash Sync, content is encrypted on your device before anything touches the network. The relay only sees encrypted blobs it cannot decrypt. Shared note blobs are auto-deleted after 30 days
- **No advertisements** — no ad networks, no tracking for ad targeting
- **No data broker relationships** — no user data exists to sell

---

## Privacy Comparison

| Aspect | Dash | Typical cloud note app |
|--------|------|----------------------|
| Account required | No for local use; magic-link email only for optional sync | Yes (email + password) |
| Data stored on servers | No by default; only E2E-encrypted ciphertext if you enable sync | Yes (readable by the service) |
| Encryption key holder | Only you | Usually the service |
| Analytics/telemetry | None | Typically 3-5 analytics services |
| Network requests (normal use) | None by default; E2E-encrypted sync/sharing only if enabled | Continuous (sync, analytics, ads) |
| Password recovery | Not possible (zero-knowledge) | Usually available (they have your data) |
| AI training on your content | Never (only ciphertext ever leaves the device) | Check their ToS (often ambiguous) |
| Works without internet | Yes, fully | Limited or not at all |
| Data portability | Full export (7 formats) | Usually limited |
| Code inspectable | Yes (open source) | Usually no |
| Third-party scripts | None | Multiple (analytics, ads, support) |

---

## Privacy Regulations Context

While Dash doesn't need to comply with data protection regulations in the traditional sense (it doesn't collect data), its architecture naturally aligns with the principles behind these regulations:

- **GDPR** (EU): Right to erasure, data minimization, purpose limitation — Dash stores no readable content externally; the only personal data the optional sync service holds is your email and purchase state, which you can delete by cancelling and purging your vault
- **CCPA** (California): Right to know what data is collected — Dash collects no note content and no analytics
- **HIPAA** (US Healthcare): While Dash isn't HIPAA-certified, its zero-knowledge architecture means protected health information is never readable off the device — even synced, only ciphertext leaves it
- **Data residency**: Note content is encrypted on-device before it ever leaves, so plaintext always stays in your control

This is privacy through architecture (client-side encryption), not just legal effort. Because content is encrypted before it leaves the device, most data-protection concerns are addressed structurally.

---

## Threat Model

For technically-minded users, here's what Dash protects against and what it doesn't:

### Protected Against
- Server-side data breaches (relay only stores ciphertext it cannot read; shared blobs auto-deleted after 30 days)
- Man-in-the-middle attacks on note content (sharing and sync are end-to-end encrypted; share keys live in URL fragments, never sent to servers)
- Service provider reading your notes (zero-knowledge architecture — even the relay cannot decrypt content)
- Government data requests to the developer (no note content is readable; the sync service holds only your email + purchase state, never plaintext notes)
- Analytics company profiling (no analytics)
- Brute-force on encrypted pages (PBKDF2 with 600K iterations + AES-256)

### User's Responsibility
- Device security (if someone has physical access to your unlocked device, they can read unencrypted pages)
- Password strength (encrypted pages are only as secure as the password chosen)
- Backups (since there's no cloud copy, local data loss means data loss — users should export backups)
- Device malware (a keylogger or screen recorder could capture content regardless of encryption)
