# Duress Password in Dash

## What is a Duress Password?

A duress password (also called a panic password or coercion password) is a secondary password that triggers a silent panic action when entered. If someone forces you to unlock your app, you enter the duress password instead of your real one. The app opens normally — but your data is either hidden or wiped. The attacker sees an empty app and has no way to tell that anything happened.

## How It Works

### Setup

You can set a duress password in two places:

1. **During initial app lock setup** — expand the optional "Duress Password" section
2. **In App Lock Settings** — go to the "Duress" tab

To set it up:
1. Enter a duress password (must be at least 4 characters)
2. Confirm the password
3. Choose an action: **Hide Data** or **Wipe All Data**
4. The duress password must be different from your real app lock password

### At the Lock Screen

When the app is locked:
- **Enter your real password** — app unlocks normally with all your data
- **Enter the duress password** — the chosen action triggers silently, and the app shows an empty state
- **Enter a wrong password** — shows "Incorrect password" error with rate limiting. No duress action is triggered.

There is zero visual difference between a normal unlock and a duress unlock. The attacker cannot tell which password was entered.

## Duress Actions

### Hide Data

- Clears all notes from memory (the app appears empty)
- **Data is preserved on disk** — nothing is deleted
- The app lock encryption key is cleared from memory
- Next time you lock and unlock with your real password, all data is restored
- Best for: situations where you might need your data back later

### Wipe All Data

- Permanently deletes all pages from memory and disk
- Clears the app lock settings entirely
- **This is irreversible** — there is no way to recover wiped data
- The app returns to a fresh, empty state
- Best for: extreme situations where data must not be recoverable

## Security Considerations

- The duress password hash is stored alongside (but separately from) the real password hash using bcrypt
- Both hashes use independent salt values — comparing them reveals nothing
- The lock screen checks the duress password first, then the real password. A wrong password (matching neither) just shows an error.
- Rate limiting applies equally to all password attempts (real, duress, or wrong)
- When app lock is disabled, duress settings are also cleared

## Comparison with Other Apps

| Feature | Dash | VeraCrypt | Signal |
|---------|------|-----------|--------|
| Duress password | Yes | Yes (hidden volumes) | No |
| Hide mode (reversible) | Yes | Yes | N/A |
| Wipe mode (irreversible) | Yes | No | No |
| Works offline | Yes | Yes | No |
| Plausible deniability | Yes | Yes | N/A |

## Important Notes

- **Test your duress password** in Hide mode first to make sure you understand how it works before considering Wipe mode
- **Remember both passwords** — there is no password recovery for either
- **Hide mode is reversible** — you can always get your data back by entering the real password after a hide-mode duress unlock
- **Wipe mode is permanent** — once triggered, all data is gone forever
- The duress password feature is designed for extreme privacy scenarios. Most users will never need it.
