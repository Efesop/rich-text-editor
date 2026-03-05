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
- Architectured so the developer **cannot** access user data even if they wanted to
- No accounts, no servers processing user data, no telemetry
- Privacy is guaranteed by architecture, not by policy or promise
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

Dash collects **zero** user data. This isn't a policy choice — it's an architectural impossibility:

- **No server**: Dash has no backend server that receives, processes, or stores user data
- **No accounts**: No sign-up, no login, no email, no identity
- **No analytics**: No Segment, Amplitude, Google Analytics, Mixpanel, Sentry, or any other telemetry service
- **No external API calls**: The app makes zero network requests during normal operation (the only network activity is checking for app updates on desktop)
- **No cookies or tracking**: No third-party scripts, no tracking pixels, no fingerprinting

This can be verified by inspecting the open-source code — there are no analytics packages in the dependencies and no outbound network calls in the application logic.

### Local-Only Storage

All data in Dash stays on your device:

- **Desktop**: JSON files in your local app data directory
- **Mobile/PWA**: IndexedDB in your browser's sandboxed storage
- **Web**: localStorage in your browser

There is no cloud sync, no backup service, no server-side copy of your data. The data exists in exactly one place — the device you're using.

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
- **No social features** — no sharing, collaboration, or "discover" features that require servers
- **No advertisements** — no ad networks, no tracking for ad targeting
- **No data broker relationships** — no user data exists to sell

---

## Privacy Comparison

| Aspect | Dash | Typical cloud note app |
|--------|------|----------------------|
| Account required | No | Yes (email + password) |
| Data stored on servers | No | Yes |
| Encryption key holder | Only you | Usually the service |
| Analytics/telemetry | None | Typically 3-5 analytics services |
| Network requests (normal use) | None | Continuous (sync, analytics, ads) |
| Password recovery | Not possible (zero-knowledge) | Usually available (they have your data) |
| AI training on your content | Never (no data leaves device) | Check their ToS (often ambiguous) |
| Works without internet | Yes, fully | Limited or not at all |
| Data portability | Full export (7 formats) | Usually limited |
| Code inspectable | Yes (open source) | Usually no |
| Third-party scripts | None | Multiple (analytics, ads, support) |

---

## Privacy Regulations Context

While Dash doesn't need to comply with data protection regulations in the traditional sense (it doesn't collect data), its architecture naturally aligns with the principles behind these regulations:

- **GDPR** (EU): Right to erasure, data minimization, purpose limitation — Dash stores nothing externally, so there's nothing to erase, minimize, or limit purpose on
- **CCPA** (California): Right to know what data is collected — Dash collects nothing
- **HIPAA** (US Healthcare): While Dash isn't HIPAA-certified, its zero-knowledge architecture means protected health information never leaves the device
- **Data residency**: Since data never leaves your device, it's always in your jurisdiction

This isn't compliance through legal effort — it's compliance through architecture. When you don't collect data, most privacy regulations become irrelevant.

---

## Threat Model

For technically-minded users, here's what Dash protects against and what it doesn't:

### Protected Against
- Server-side data breaches (no server)
- Man-in-the-middle attacks on note content (no network transmission)
- Service provider reading your notes (no service provider)
- Government data requests to the developer (no data to provide)
- Analytics company profiling (no analytics)
- Account compromise (no accounts)
- Brute-force on encrypted pages (PBKDF2 with 600K iterations + AES-256)

### User's Responsibility
- Device security (if someone has physical access to your unlocked device, they can read unencrypted pages)
- Password strength (encrypted pages are only as secure as the password chosen)
- Backups (since there's no cloud copy, local data loss means data loss — users should export backups)
- Device malware (a keylogger or screen recorder could capture content regardless of encryption)
