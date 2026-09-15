/**
 * The app lock screen's waits, words and colours (components/AppLockScreen.js).
 * DOM-free so it runs under `node --test`.
 */

/** How long to wait after wrong passwords in a row: 1 s after 3, 5 s after 5, 15 s after 7 and 30 s after 9. */
export function lockoutFor (attempts) {
  if (attempts >= 9) return 30000
  if (attempts >= 7) return 15000
  if (attempts >= 5) return 5000
  if (attempts >= 3) return 1000
  return 0
}

export const WRONG_PASSWORD = 'Wrong password'

/** What the lock screen says under the password field: the wait while there is one, otherwise the last message. */
export function lockMessage ({ attempts = 0, waitSeconds = 0, message = '' } = {}) {
  if (waitSeconds > 0) {
    return attempts >= 5
      ? `Too many tries. Try again in ${waitSeconds} s`
      : `${WRONG_PASSWORD}. Try again in ${waitSeconds} s`
  }
  return message || ''
}

/**
 * What to say when Touch ID or Face ID doesn't unlock Dash. `needs-password`
 * means it recognised you but Dash still needs the password to decrypt the
 * notes, which is always the case on iPhone for now.
 */
export function biometricMessage (outcome, name = 'Touch ID') {
  if (outcome === 'needs-password') return 'Enter your password to finish unlocking'
  if (outcome === 'unavailable') return `${name} isn’t available. Enter your password.`
  return `${name} didn’t unlock Dash. Enter your password.`
}

/** The lock screen in each theme's own colours (components/AppearanceSheet.js). The field draws in `ink`, from `base` to `peak` opacity. */
export const LOCK_THEMES = Object.freeze({
  light: Object.freeze({ ground: '#ffffff', text: '#171717', sub: '#737373', border: '#e5e5e5', field: '#ffffff', fieldShadow: '0 1px 2px rgba(0, 0, 0, 0.05)', bad: '#dc2626', ink: '23,23,23', base: 0.075, peak: 0.3 }),
  dark: Object.freeze({ ground: '#0d0d0d', text: '#ececec', sub: '#8a8a8a', border: '#2e2e2e', field: '#141414', fieldShadow: 'none', bad: '#f87171', ink: '236,236,236', base: 0.045, peak: 0.25 }),
  darkblue: Object.freeze({ ground: '#0c1017', text: '#e0e6f0', sub: '#7483a3', border: '#1c2438', field: '#0f1420', fieldShadow: 'none', bad: '#f87171', ink: '224,230,240', base: 0.05, peak: 0.26 }),
  fallout: Object.freeze({ ground: '#0e120e', text: '#86efac', sub: '#16a34a', border: 'rgba(34, 197, 94, 0.3)', field: '#0b0f0b', fieldShadow: 'none', bad: '#f87171', ink: '134,239,172', base: 0.062, peak: 0.3 })
})

export function lockTheme (theme) {
  return LOCK_THEMES[theme] || LOCK_THEMES.light
}

/** How long the lock screen stays up after Dash unlocks, while it plays the unlock and fades. */
export const LOCK_SCREEN_EXIT_MS = 600
