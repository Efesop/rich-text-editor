# Decoy App in Dash

## What is the Decoy App?

The Decoy App feature (also known as a decoy password) lets you set a secondary password that shows fake decoy notes when entered at the lock screen. If someone forces you to unlock the app, you enter the decoy password instead of your real one. The app opens normally — but shows convincing fake notes instead of your real data. Your actual notes stay encrypted and hidden on disk.

## How It Works

### Setup

You can set a decoy password in two places:

1. **During initial app lock setup** — expand the optional "Decoy App" section
2. **In App Lock Settings** — go to the "Decoy" tab

To set it up:
1. Enter a decoy password (must be at least 4 characters)
2. Confirm the password
3. Configure your decoy notes that will appear when the decoy password is used
4. The decoy password must be different from your real app lock password

### At the Lock Screen

When the app is locked:
- **Enter your real password** — app unlocks normally with all your data
- **Enter the decoy password** — shows the decoy notes, real data stays encrypted on disk
- **Enter a wrong password** — shows "Incorrect password" error with rate limiting. No decoy action is triggered.

There is zero visual difference between a normal unlock and a decoy unlock. The attacker cannot tell which password was entered.

## How Hide Mode Works

When the decoy password is entered:

- Clears all real notes from memory (the app appears to contain only the decoy notes)
- **Data is preserved on disk** — nothing is deleted or wiped
- The app lock encryption key is cleared from memory
- All saves are blocked to prevent the empty/decoy state from overwriting real data
- Next time you lock and unlock with your real password, all data is restored

This is hide mode only — your real data is always safe and recoverable.

## Security Considerations

- The decoy password hash is stored alongside (but separately from) the real password hash using bcrypt
- Both hashes use independent salt values — comparing them reveals nothing
- The lock screen checks the decoy password first, then the real password. A wrong password (matching neither) just shows an error.
- Rate limiting applies equally to all password attempts (real, decoy, or wrong)
- When app lock is disabled, decoy settings are also cleared

## Comparison with Other Apps

| Feature | Dash | VeraCrypt | Signal |
|---------|------|-----------|--------|
| Decoy password | Yes | Yes (hidden volumes) | No |
| Hide mode (reversible) | Yes | Yes | N/A |
| Works offline | Yes | Yes | No |
| Plausible deniability | Yes | Yes | N/A |

## Important Notes

- **Test your decoy password** after setting it up to make sure it works as expected
- **Remember both passwords** — there is no password recovery for either
- **Hide mode is reversible** — you can always get your data back by entering the real password after a decoy unlock
- **Your data is never deleted** — the decoy feature only hides data, it does not wipe it
- The decoy password feature is designed for extreme privacy scenarios. Most users will never need it.
