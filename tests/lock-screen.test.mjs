import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

const { LOCK_SCREEN_EXIT_MS, LOCK_THEMES, WRONG_PASSWORD, biometricMessage, lockMessage, lockTheme, lockoutFor } = await import('../lib/lockScreen.js')

describe('lock screen — waits after wrong passwords', () => {
  it('waits 1 s after 3 tries, 5 s after 5, 15 s after 7 and 30 s after 9', () => {
    assert.deepEqual(
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 20].map(lockoutFor),
      [0, 0, 0, 1000, 1000, 5000, 5000, 15000, 15000, 30000, 30000]
    )
  })

  it('counts the wait down under the password field', () => {
    assert.equal(lockMessage({ attempts: 3, waitSeconds: 1 }), 'Wrong password. Try again in 1 s')
    assert.equal(lockMessage({ attempts: 7, waitSeconds: 12, message: WRONG_PASSWORD }), 'Too many tries. Try again in 12 s')
  })

  it('shows the last message once there is nothing to wait for', () => {
    assert.equal(lockMessage({ attempts: 7, waitSeconds: 0, message: WRONG_PASSWORD }), 'Wrong password')
    assert.equal(lockMessage({}), '')
  })
})

describe('lock screen — Touch ID and Face ID', () => {
  it('names the way the device unlocks', () => {
    assert.equal(biometricMessage('failed', 'Face ID'), 'Face ID didn’t unlock Dash. Enter your password.')
    assert.equal(biometricMessage(false), 'Touch ID didn’t unlock Dash. Enter your password.')
    assert.equal(biometricMessage('unavailable', 'Face ID'), 'Face ID isn’t available. Enter your password.')
  })

  it('asks for the password when the device recognised you but Dash still needs it', () => {
    assert.equal(biometricMessage('needs-password', 'Face ID'), 'Enter your password to finish unlocking')
  })
})

describe('lock screen — themes', () => {
  it('has colours and field ink for every app theme', () => {
    for (const theme of ['light', 'dark', 'darkblue', 'fallout']) {
      const colours = LOCK_THEMES[theme]
      for (const key of ['ground', 'text', 'sub', 'border', 'field', 'fieldShadow', 'bad']) assert.equal(typeof colours[key], 'string', `${theme}.${key}`)
      assert.match(colours.ink, /^\d{1,3},\d{1,3},\d{1,3}$/)
      assert.ok(colours.base > 0 && colours.base < 0.1, `${theme} rests faintly`)
      assert.ok(colours.peak > colours.base && colours.peak <= 0.35, `${theme} sweep stays soft`)
    }
  })

  it('falls back to the light theme', () => {
    assert.equal(lockTheme('unknown'), LOCK_THEMES.light)
    assert.equal(lockTheme(undefined), LOCK_THEMES.light)
  })

  it('stays up long enough to play the unlock, and no longer', () => {
    assert.ok(LOCK_SCREEN_EXIT_MS >= 500 && LOCK_SCREEN_EXIT_MS <= 1000)
  })
})
