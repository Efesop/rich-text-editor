# App Lock & Full-Device Encryption

> Context document for generating a landing/resource page about Dash's app lock feature and how it provides real encryption for all notes.

---

## SEO Target Keywords

- app lock notes
- lock notes app
- password protect notes
- encrypt all notes at once
- biometric notes app
- touch id notes app
- full disk encryption notes
- password lock note app
- secure notes with fingerprint
- auto-lock notes app

---

## What Is App Lock?

App lock is a security feature that protects an entire application behind a password or biometric authentication (like fingerprint or Face ID). When enabled, the app requires authentication every time it's opened or after a period of inactivity.

Most app locks are **cosmetic** — they show a password screen on top of the app, but the underlying data remains unencrypted on disk. If someone accesses the device's file system directly, they can read everything. It's a locked door with no walls.

Dash's app lock is different. It performs **real encryption**.

---

## How Most Apps Handle App Lock

### The Typical Approach (UI Gate Only)

1. User sets a password
2. App stores a hash of the password
3. On launch, a full-screen password prompt blocks the UI
4. User enters password, hash matches, screen is dismissed
5. Data on disk: **completely unreadable? No. Still plaintext.**

This protects against casual snooping — someone picking up your phone and opening the app. It does **not** protect against:
- Someone accessing the device's file system (via backup extraction, jailbreak, or forensic tools)
- Malware reading the app's storage directory
- Device theft where the attacker has technical knowledge
- Legal or corporate data extraction processes

### Why This Is Insufficient

The data is still stored as readable text (or easily parseable JSON/SQLite) on disk. The password screen is just a UI layer — remove the screen (or access the files directly), and the data is exposed.

---

## How Dash's App Lock Works

### Real Encryption, Not Just a Screen

When you enable app lock in Dash, your notes are **actually encrypted** using AES-256-GCM — the same military-grade encryption used for individual page locks, but applied to all your pages automatically.

### The Full Flow

**Setting up app lock:**

1. You choose a password (and optionally enable Touch ID)
2. Dash generates a random cryptographic salt (16 bytes)
3. Your password is run through PBKDF2-SHA256 with 600,000 iterations to derive a 256-bit encryption key
4. All your pages are encrypted with AES-256-GCM using this key
5. The encrypted data is saved to disk — plaintext content is wiped from storage
6. If Touch ID is enabled, your password is stored in the operating system's secure keychain (encrypted by the OS itself)

**Opening the app:**

1. Dash shows the lock screen
2. You enter your password (or use Touch ID)
3. The encryption key is re-derived from your password
4. All pages are decrypted into memory
5. You use the app normally — edits are re-encrypted before every save to disk

**Locking (manual or auto):**

1. All page content in memory is encrypted
2. Encrypted data is written to disk
3. Plaintext is cleared from memory
4. Lock screen is displayed

### What Gets Encrypted

- All page **content** (text, formatting, blocks) is encrypted
- Page **titles** and **metadata** (tags, timestamps, folder structure) remain unencrypted for sidebar display
- Pages that already have their own individual password lock are skipped — they manage their own encryption independently

### Auto-Lock

Dash can automatically lock after a period of inactivity:
- 1 minute
- 5 minutes
- 15 minutes
- 30 minutes
- Custom duration (minutes, hours, or days)
- Never (manual lock only)

When the idle timer triggers, Dash encrypts all pages before displaying the lock screen. The same happens when you close the app.

---

## Touch ID / Biometric Unlock

### The Challenge

Biometric authentication (fingerprint, face) can verify your identity, but it can't provide a password for key derivation. A fingerprint isn't a string you can feed into PBKDF2. So how does Dash decrypt your notes with just a fingerprint?

### The Solution: OS Keychain Integration

When you enable Touch ID alongside app lock:

1. Your password is encrypted by the operating system's secure keychain (macOS Keychain via Electron's `safeStorage` API)
2. The encrypted password is stored on disk — but only the OS can decrypt it, and only after biometric verification
3. When you use Touch ID to unlock:
   - The OS verifies your fingerprint
   - The OS decrypts and returns your password from the keychain
   - Dash uses this password to derive the encryption key
   - Your notes are decrypted normally

This means Touch ID provides **real decryption**, not just a UI bypass. The biometric verification gates access to the actual encryption password, which is needed to derive the key that decrypts your data.

### Security Properties

- The password stored in the keychain is encrypted by the OS using hardware-backed keys
- On macOS, the Keychain is protected by the Secure Enclave
- The password is only accessible after successful biometric authentication
- If Touch ID fails, you can always fall back to password entry

---

## Individual Page Locks + App Lock

Dash supports two layers of encryption that work independently:

### App Lock (All Pages)
- Encrypts every page that doesn't have its own individual lock
- One password protects everything
- Automatic — no action needed per page
- Encryption key is derived once on unlock

### Individual Page Locks (Per Page)
- Each page can have its own unique password
- Content is encrypted with a separate key derived from that page's password
- Survives app lock being disabled — the page stays encrypted
- Requires entering the page password even after app lock is unlocked

### How They Interact

- Pages with individual locks are **not double-encrypted** by app lock
- If you have app lock + an individually locked page: you enter the app lock password first (or use Touch ID), then enter the page-specific password to view that particular page
- Disabling app lock decrypts app-lock-encrypted pages but does **not** touch individually locked pages
- You can use both, either, or neither — they're fully independent

---

## Password Change & Recovery

### Changing the App Lock Password

When you change your app lock password:
1. A new salt is generated
2. A new encryption key is derived from the new password
3. All app-lock-encrypted pages are re-encrypted with the new key
4. If Touch ID is enabled, the new password replaces the old one in the OS keychain

### No Password Recovery

Because Dash is zero-knowledge:
- Your password is never sent to any server
- There is no "forgot password" flow
- If you forget your password and don't have biometric unlock enabled, **your encrypted data is permanently inaccessible**

This is the trade-off of real encryption. The warning during setup makes this clear: "Your notes will be encrypted with this password. There is no way to recover it."

Touch ID serves as a safety net — if enabled, it provides an alternative decryption path even if you forget the password.

### Disabling App Lock

You can disable app lock at any time (while unlocked):
- All app-lock-encrypted pages are decrypted
- Plaintext content is saved to disk
- The encryption salt and keychain entry are deleted
- Individually locked pages remain encrypted with their own passwords

---

## Technical Specifications

| Parameter | Value |
|-----------|-------|
| Encryption algorithm | AES-256-GCM (authenticated encryption) |
| Key derivation | PBKDF2-SHA256, 600,000 iterations |
| Salt size | 128 bits (16 bytes), unique per app lock setup |
| IV size | 96 bits (12 bytes), unique per page per save |
| Key size | 256 bits |
| Password hashing | bcrypt (10 salt rounds) for verification |
| Biometric key storage | Electron safeStorage (OS keychain) |
| Auto-lock options | 1 min, 5 min, 15 min, 30 min, custom, never |
| Encryption scope | Page content only (titles/metadata stay readable for sidebar) |

---

## Migration & Backward Compatibility

Existing users who already had app lock enabled (before the encryption upgrade) experience a seamless migration:

1. On their next unlock after updating, Dash detects no encryption salt exists
2. A new salt is generated and the encryption key is derived
3. Pages are encrypted for the first time on the next save
4. From that point forward, data on disk is encrypted

No data loss, no manual action, no re-setup required.

---

## Key Differentiators

| Feature | Dash | Most note apps with "app lock" |
|---------|------|-------------------------------|
| Data encrypted on disk | Yes (AES-256-GCM) | No (UI gate only) |
| Biometric decrypts data | Yes (via OS keychain) | No (just dismisses screen) |
| Works offline | Yes | Usually yes |
| Per-page + app-wide encryption | Both supported | Rarely |
| Password recovery | Not possible (zero-knowledge) | Usually available (data not truly encrypted) |
| Auto-lock with encryption | Yes (encrypts on idle) | Shows screen, data still plaintext |
| Open source / verifiable | Yes | Rarely |
| Encryption on window close | Yes | N/A (data already plaintext) |

---

## Use Cases

- **Shared devices**: Family computer or work laptop where others have access
- **Device theft**: If your laptop is stolen, encrypted notes can't be read without your password
- **Compliance**: Industries requiring data-at-rest encryption
- **Peace of mind**: Know that closing the app means your notes are truly locked, not just hidden behind a screen
- **Quick protection**: One password encrypts everything, Touch ID for convenience
