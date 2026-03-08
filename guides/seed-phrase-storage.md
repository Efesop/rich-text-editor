# Seed Phrase Storage in Dash

## What is a Seed Phrase?

A seed phrase (also called a recovery phrase or mnemonic) is a set of 12 or 24 words that serves as the master key to a cryptocurrency wallet. Anyone with these words can access the funds in that wallet. Losing them means losing access permanently — there is no "forgot password" recovery.

This makes secure storage of seed phrases critically important.

## Why Store Seed Phrases in Dash?

Most people write seed phrases on paper, which can be lost, damaged, or found by someone else. Others store them in cloud-based note apps, which introduces the risk of server breaches, employee access, or government requests.

Dash offers a middle ground:
- **Local storage only** — your seed phrase never leaves your device
- **Page encryption** — lock the page with AES-256 encryption
- **App lock** — encrypt all notes behind a master password
- **No network requests** — Dash works entirely offline
- **BIP-39 validation** — confirms each word is valid to prevent typos

## How to Use It

1. Click the `+` button in the editor to open the block menu
2. Select "Seed Phrase" from the list
3. A numbered grid appears with 12 input fields
4. Type or paste your seed phrase words
5. Toggle between 12 and 24 words using the button in the header

### Entering Words

- **Type individually**: Click each numbered field and type the word
- **Paste all at once**: Copy your full phrase and paste into any field — words automatically distribute across all inputs
- **Tab/Enter to navigate**: Press Tab or Enter to move to the next field, Shift+Tab to go back

### BIP-39 Validation

Each word is validated against the BIP-39 English wordlist (2048 standard words):
- Green checkmark — word is valid
- Red X — word is not in the BIP-39 wordlist (possible typo)
- Empty — no word entered yet

### Copying

Click "Copy All" to copy the full phrase to your clipboard. The clipboard is automatically cleared after 30 seconds to prevent accidental exposure.

## Security Recommendations

1. **Lock the page** — Use Dash's page encryption to password-protect any page containing a seed phrase
2. **Enable app lock** — Set up the app lock with a strong master password so all notes are encrypted at rest
3. **Don't rely on digital storage alone** — Consider keeping a physical backup in a secure location as well
4. **Use the duress password** — If you're concerned about coercion, set up a duress password that wipes or hides your data

## How It's Stored

Seed phrase data is saved as a standard Editor.js block:

```json
{
  "type": "seedPhrase",
  "data": {
    "words": ["abandon", "ability", "able", ...],
    "count": 12
  }
}
```

When the page is locked with a password, this JSON (along with all other blocks) is encrypted with AES-256-GCM. The encrypted ciphertext replaces the plaintext content on disk.

## Export Support

Seed phrases are included in all 8 export formats:
- **PDF/Markdown/Plain Text/RTF/DOCX**: Rendered as a numbered list under a "Seed Phrase" heading
- **CSV**: Each word as a row with its number
- **JSON**: Raw block data
- **XML**: Structured element with word children

## What About BIP-39?

BIP-39 is the Bitcoin Improvement Proposal that standardizes mnemonic phrases. The English wordlist contains exactly 2048 words, carefully chosen to be:
- Unambiguous (no similar-sounding words)
- Common enough to remember
- Distinct in their first 4 characters

Dash includes the complete BIP-39 English wordlist for offline validation. No network requests are made during validation.
