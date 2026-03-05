# Encryption

> Context document for generating a landing/resource page about encryption and how Dash uses it.

---

## SEO Target Keywords

- aes-256 encryption
- aes-256-gcm encryption explained
- client-side encryption
- zero-knowledge encryption
- encrypt notes app
- encrypted note taking
- pbkdf2 key derivation
- end-to-end encrypted notes

---

## What Is Encryption?

Encryption is the process of converting readable data (plaintext) into an unreadable format (ciphertext) using a mathematical algorithm and a secret key. Only someone with the correct key can decrypt the data back to its original form.

Encryption protects data from unauthorized access. Even if someone gains access to the encrypted data — through a stolen device, a compromised backup, or a data breach — they cannot read it without the key.

### Symmetric vs Asymmetric Encryption

- **Symmetric encryption**: The same key encrypts and decrypts. Faster, used for encrypting data at rest. Examples: AES, ChaCha20.
- **Asymmetric encryption**: Uses a key pair (public + private). Slower, used for key exchange and digital signatures. Examples: RSA, ECDSA.

Dash uses **symmetric encryption** because the same person who encrypts the note is the one who decrypts it — there's no need to share keys between parties.

---

## What Is AES-256-GCM?

**AES** (Advanced Encryption Standard) is the most widely used symmetric encryption algorithm in the world. It was adopted by the U.S. National Institute of Standards and Technology (NIST) in 2001 and is used by governments, banks, and security-critical applications globally.

- **256** refers to the key size in bits. AES supports 128, 192, and 256-bit keys. 256-bit is the strongest, providing 2^256 possible key combinations — a number so large it's practically impossible to brute force.
- **GCM** (Galois/Counter Mode) is the mode of operation. GCM provides both **confidentiality** (data is unreadable) and **authentication** (data hasn't been tampered with). This is called "authenticated encryption." If even a single bit of the ciphertext is modified, decryption fails entirely — preventing tampering attacks.

### Why AES-256-GCM Specifically?

- **Proven security**: Decades of cryptanalysis with no practical attacks found
- **Performance**: Hardware-accelerated on modern CPUs (AES-NI instruction set)
- **Authentication built-in**: No need for a separate HMAC step — GCM handles integrity verification
- **Standard compliance**: Recommended by NIST, NSA (for TOP SECRET), and OWASP

---

## What Is PBKDF2 Key Derivation?

A user's password can't be used directly as an encryption key — passwords are typically short, predictable, and not the right length. **PBKDF2** (Password-Based Key Derivation Function 2) transforms a password into a cryptographically strong key.

### How PBKDF2 Works

1. Takes the user's password + a random **salt** (unique random bytes)
2. Runs the password through a hash function (SHA-256) **hundreds of thousands of times**
3. Produces a fixed-length key suitable for AES encryption

### Why So Many Iterations?

Each iteration makes the key derivation slower. This is intentional — it's called **key stretching**. A legitimate user only derives the key once (negligible delay), but an attacker trying millions of password guesses is slowed dramatically.

- At 600,000 iterations, each password guess takes measurable time
- An attacker trying 1 billion passwords would need years instead of seconds
- This is the defense against brute-force and dictionary attacks

---

## How Dash Uses Encryption

### Overview

Dash implements **client-side, zero-knowledge encryption**. This means:

- Encryption and decryption happen entirely on your device
- Your password never leaves your device
- No server, cloud service, or third party ever sees your plaintext data or your password
- Even the app developer cannot read your encrypted notes

### Technical Implementation

When you lock a page in Dash with a password:

**Encryption (locking a page):**

1. Your password is hashed with **bcrypt** (10 salt rounds) for verification purposes
2. A random 16-byte (128-bit) **salt** is generated
3. A random 12-byte (96-bit) **initialization vector (IV)** is generated
4. Your password is run through **PBKDF2-SHA256 with 600,000 iterations** using the salt to derive a 256-bit encryption key
5. Your page content is encrypted with **AES-256-GCM** using the derived key and IV
6. The encrypted content, salt, and IV are stored — the password and derived key are not stored

**Decryption (unlocking a page):**

1. Your password is verified against the stored bcrypt hash
2. The stored salt is combined with your password through PBKDF2-SHA256 (600,000 iterations) to re-derive the same encryption key
3. The content is decrypted with AES-256-GCM using the derived key and stored IV
4. The derived key is cached in memory for the session to avoid re-deriving on every auto-save

### What Gets Encrypted

- The **page content** (all text, formatting, blocks) is encrypted
- Page **metadata** (title, tags, timestamps) remains unencrypted for sidebar display and search
- Each page has its own unique salt and IV — no two pages share encryption parameters

### Encrypted Data Format

Each encrypted page stores a structured object containing:
- Version number (for future algorithm upgrades)
- KDF identifier: `PBKDF2-SHA256`
- Cipher identifier: `AES-GCM-256`
- Salt, IV, and ciphertext as byte arrays

### Security Parameters

| Parameter | Value | Why |
|-----------|-------|-----|
| Algorithm | AES-256-GCM | Gold standard authenticated encryption |
| Key derivation | PBKDF2-SHA256 | NIST-recommended password-based KDF |
| Iterations | 600,000 | Meets NIST SP 800-132 (2024) recommendation |
| Salt size | 128 bits | Prevents rainbow table attacks |
| IV size | 96 bits | GCM recommended nonce size |
| Key size | 256 bits | Maximum AES strength |
| Password hashing | bcrypt (10 rounds) | Industry standard for password verification |
| Crypto implementation | WebCrypto API | Browser-native, audited, hardware-accelerated |

### What This Means for Users

- **No master password**: Each page can have its own password (or share one — your choice)
- **No password recovery**: Since the password never leaves your device and is never stored, there is no "forgot password" option. This is a feature, not a limitation — it means nobody can reset or bypass your encryption.
- **No cloud dependency**: Encryption works fully offline. No internet connection, server, or account needed.
- **Future-proof format**: The versioned encryption format allows Dash to upgrade algorithms in the future while maintaining backward compatibility with existing encrypted pages.

---

## Key Differentiators vs Other Note Apps

| Feature | Dash | Typical cloud note app |
|---------|------|----------------------|
| Where encryption happens | On your device | On their server (if at all) |
| Who holds the key | Only you | The service provider |
| Password recovery | Not possible (zero-knowledge) | Usually available (they can read your data) |
| Internet required | No | Yes |
| Encryption algorithm | AES-256-GCM | Varies, often unspecified |
| Key derivation | PBKDF2-SHA256, 600K iterations | Often not disclosed |
| Data location | Your device only | Their cloud servers |
| Audit trail | Open source, inspectable | Proprietary, trust-based |
