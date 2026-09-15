import React, { useState, useEffect, useLayoutEffect, useRef } from 'react'
import { ArrowRight, Fingerprint, ScanFace } from 'lucide-react'
import LockScreenField from './LockScreenField'
import { WRONG_PASSWORD, biometricMessage, lockMessage, lockTheme, lockoutFor } from '@/lib/lockScreen'

// Rate-limit storage helpers — use Electron IPC (tamper-resistant) with localStorage fallback
const ATTEMPT_KEY = 'dl_a'
const LOCKOUT_KEY = 'dl_u'

async function loadAttemptData () {
  try {
    if (typeof window !== 'undefined' && window.electron?.invoke) {
      const data = await window.electron.invoke('lock-get-attempts')
      if (data) return data
    }
  } catch {}
  try {
    return {
      attempts: parseInt(localStorage.getItem(ATTEMPT_KEY) || '0', 10),
      lockedUntil: parseInt(localStorage.getItem(LOCKOUT_KEY) || '0', 10)
    }
  } catch { return { attempts: 0, lockedUntil: 0 } }
}

function persistAttemptData (attempts, lockedUntil) {
  try { localStorage.setItem(ATTEMPT_KEY, String(attempts)) } catch {}
  try { localStorage.setItem(LOCKOUT_KEY, String(lockedUntil)) } catch {}
  if (typeof window !== 'undefined' && window.electron?.invoke) {
    window.electron.invoke('lock-record-attempt', { attempts, lockedUntil }).catch(() => {})
  }
}

function clearAttemptData () {
  try { localStorage.removeItem(ATTEMPT_KEY) } catch {}
  try { localStorage.removeItem(LOCKOUT_KEY) } catch {}
  if (typeof window !== 'undefined' && window.electron?.invoke) {
    window.electron.invoke('lock-record-attempt', { attempts: 0, lockedUntil: 0 }).catch(() => {})
  }
}

const NO_NOTICE = { text: '', bad: false }
const nextPaint = () => new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)))

// The screen Dash shows while app lock has it locked, on Mac and iPhone: the
// dashnote.io binary field (LockScreenField) behind the password field. A
// wrong password shakes the field and scrambles the bits around it. Once Dash
// unlocks, RichTextEditor keeps this screen up with `leaving` for
// LOCK_SCREEN_EXIT_MS (lib/lockScreen.js): the field stops drawing and the
// exit runs as a CSS transition growing from the password field, which stays
// smooth while notes decrypt underneath. Styles: .dash-lock in styles/globals.css.
export default function AppLockScreen ({ onUnlock, onBiometricUnlock, biometricAvailable, biometricEnabled, biometricName = 'Touch ID', onDuressUnlock, duressEnabled, theme, leaving = false }) {
  const [password, setPassword] = useState('')
  const [notice, setNotice] = useState(NO_NOTICE)
  const [attempts, setAttempts] = useState(0)
  const [lockedUntil, setLockedUntil] = useState(0)
  const [cooldownRemaining, setCooldownRemaining] = useState(0)
  const [busy, setBusy] = useState(false)
  const [wrong, setWrong] = useState(false)
  const [shaking, setShaking] = useState(false)
  const lockRef = useRef(null)
  const inputRef = useRef(null)
  const formRef = useRef(null)
  const wordsRef = useRef(null)
  const fieldRef = useRef(null)
  const colours = lockTheme(theme)

  // Load persisted attempt data on mount
  useEffect(() => {
    loadAttemptData().then(data => {
      if (data) {
        setAttempts(data.attempts || 0)
        setLockedUntil(data.lockedUntil || 0)
      }
    })
  }, [])

  // Cooldown timer
  useEffect(() => {
    if (lockedUntil <= Date.now()) {
      setCooldownRemaining(0)
      return
    }
    setCooldownRemaining(Math.ceil((lockedUntil - Date.now()) / 1000))
    const interval = setInterval(() => {
      const remaining = Math.ceil((lockedUntil - Date.now()) / 1000)
      if (remaining <= 0) {
        setCooldownRemaining(0)
        clearInterval(interval)
      } else {
        setCooldownRemaining(remaining)
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [lockedUntil])

  useEffect(() => {
    if (inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 200)
    }
  }, [])

  // Auto-prompt biometric (biometricAvailable may resolve after mount)
  const autoPromptedRef = useRef(false)
  useEffect(() => {
    if (biometricAvailable && biometricEnabled && !autoPromptedRef.current) {
      autoPromptedRef.current = true
      handleBiometric()
    }
  }, [biometricAvailable, biometricEnabled])

  const fieldCentre = () => {
    const form = formRef.current
    if (!form) return null
    const box = form.getBoundingClientRect()
    return { x: box.left + box.width / 2, y: box.top + box.height / 2 }
  }

  // The unlock grows from the password field (--lock-origin-x/y). It's set
  // before any unlock, since the transition starts the moment `leaving` lands.
  useLayoutEffect(() => {
    const place = () => {
      const lock = lockRef.current
      const centre = fieldCentre()
      if (!lock || !centre) return
      lock.style.setProperty('--lock-origin-x', `${Math.round(centre.x)}px`)
      lock.style.setProperty('--lock-origin-y', `${Math.round(centre.y)}px`)
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [])

  // Dash unlocked, whether by password, Touch ID, Face ID or a duress
  // password, which has to look exactly the same
  useEffect(() => {
    if (leaving) inputRef.current?.blur()
  }, [leaving])

  const handleChange = (e) => {
    setPassword(e.target.value)
    if (notice.text) setNotice(NO_NOTICE)
    if (wrong) setWrong(false)
  }

  const handleSubmit = async (e) => {
    e?.preventDefault()
    const typed = password
    if (!typed.trim() || cooldownRemaining > 0 || busy || leaving) return
    setBusy(true)
    try {
      // Let the pulsing arrow show first: checking the password blocks for a moment
      await nextPaint()
      // A duress password is checked first, and unlocks into the decoy like the real one
      let unlocked = false
      if (duressEnabled && onDuressUnlock) unlocked = await onDuressUnlock(typed)
      // onUnlock resolves once the notes are decrypted. Dash itself unlocks as
      // soon as the password matches, which starts `leaving`.
      if (!unlocked) unlocked = await onUnlock(typed)
      if (unlocked) {
        setPassword('')
        setNotice(NO_NOTICE)
        setWrong(false)
        setAttempts(0)
        clearAttemptData()
        return
      }

      // Waits grow with wrong passwords in a row: 1 s after 3, 5 s after 5, 15 s after 7, 30 s after 9
      const next = attempts + 1
      const wait = lockoutFor(next)
      const until = wait ? Date.now() + wait : 0
      setAttempts(next)
      if (until) setLockedUntil(until)
      persistAttemptData(next, until)
      setPassword('')
      setWrong(true)
      setNotice({ text: WRONG_PASSWORD, bad: true })
      setShaking(true)
      const centre = fieldCentre()
      if (centre) fieldRef.current?.scramble(centre.x, centre.y)
      inputRef.current?.focus()
    } finally {
      setBusy(false)
    }
  }

  const handleBiometric = async () => {
    if (busy || leaving) return
    try {
      const result = await onBiometricUnlock()
      if (result === 'needs-password') {
        setNotice({ text: biometricMessage('needs-password', biometricName), bad: false })
        inputRef.current?.focus()
      } else if (!result) {
        setNotice({ text: biometricMessage('failed', biometricName), bad: true })
      }
    } catch {
      setNotice({ text: biometricMessage('unavailable', biometricName), bad: true })
    }
  }

  const waiting = cooldownRemaining > 0
  const message = lockMessage({ attempts, waitSeconds: cooldownRemaining, message: notice.text })
  const BiometricIcon = biometricName === 'Face ID' ? ScanFace : Fingerprint
  const style = {
    '--lock-ground': colours.ground,
    '--lock-text': colours.text,
    '--lock-sub': colours.sub,
    '--lock-border': colours.border,
    '--lock-field': colours.field,
    '--lock-field-shadow': colours.fieldShadow,
    '--lock-bad': colours.bad
  }

  return (
    <div
      ref={lockRef}
      className={`dash-lock${theme === 'fallout' ? ' font-mono' : ''}${leaving ? ' is-leaving' : ''}`}
      style={style}
      role="dialog"
      aria-modal="true"
      aria-labelledby="dash-lock-title"
    >
      <LockScreenField ref={fieldRef} ink={colours.ink} base={colours.base} peak={colours.peak} clearRef={wordsRef} paused={leaving} />
      {/* The Mac window can still be dragged by its top edge while locked */}
      <div className="dash-lock-drag" aria-hidden="true" />

      <div className="dash-lock-center">
        <div ref={wordsRef} className="dash-lock-words">
          <img src="./icons/dash-logo.png" alt="" className="dash-lock-logo" />
          <h1 id="dash-lock-title" className="dash-lock-title">Dash is locked</h1>
          <p className="dash-lock-sub">Enter your password to unlock</p>

          <form
            ref={formRef}
            onSubmit={handleSubmit}
            onAnimationEnd={() => setShaking(false)}
            className={`dash-lock-form${wrong || waiting ? ' is-wrong' : ''}${shaking ? ' is-shaking' : ''}`}
          >
            <input
              ref={inputRef}
              type="password"
              value={password}
              onChange={handleChange}
              placeholder="Password"
              aria-label="Password"
              aria-invalid={wrong || undefined}
              autoFocus
              disabled={leaving}
              className="dash-lock-input"
            />
            <button
              type="submit"
              className={`dash-lock-go${waiting ? ' is-waiting' : ''}${busy ? ' is-busy' : ''}`}
              aria-label={waiting ? `Try again in ${cooldownRemaining} second${cooldownRemaining === 1 ? '' : 's'}` : 'Unlock'}
              disabled={!password.trim() || waiting || busy || leaving}
            >
              {waiting
                ? <span className="dash-lock-count">{cooldownRemaining}</span>
                : <ArrowRight className="h-[18px] w-[18px]" strokeWidth={2.25} aria-hidden="true" />}
            </button>
          </form>

          <p className={`dash-lock-message${notice.bad || waiting ? ' is-bad' : ''}`} role="status" aria-live="polite">
            {message}
          </p>

          {biometricAvailable && biometricEnabled && (
            <button type="button" onClick={handleBiometric} className="dash-lock-biometric" disabled={leaving}>
              <BiometricIcon className="h-[18px] w-[18px]" aria-hidden="true" />
              Use {biometricName}
            </button>
          )}
        </div>
      </div>

      <p className="dash-lock-spec">Encrypted with AES-256-GCM</p>
    </div>
  )
}
