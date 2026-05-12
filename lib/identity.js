// Magic-link identity client.
//
// Talks to the relay's /auth/* routes (server/auth.ts) to:
//   1. Request a 6-digit code by email
//   2. Verify the code → receive an opaque bearer token
//   3. Hold the token (localStorage) and attach it to sync requests
//   4. Sign out (delete server-side session + clear local state)
//
// This is the cross-platform identity layer for Option C. Same code path
// used on Electron, PWA, and (after Cap 6→8) iOS — though iOS users also
// have the RevenueCat path; signing in with email is the way an iOS
// subscriber unlocks sync on Mac/web (and vice versa).
//
// Privacy note: token stored in localStorage. App has no third-party
// scripts + strict CSP, so XSS risk is acceptable for v1.5. v1.6
// follow-up: move to iOS SecureStoragePlugin on Capacitor builds.

const RELAY_URL = (process.env.NEXT_PUBLIC_RELAY_URL || 'https://dash-relay.efesop.deno.net')
  .replace(/\/$/, '')
  .replace(/^wss:\/\//, 'https://')
  .replace(/^ws:\/\//, 'http://')

const TOKEN_KEY = 'dash:auth:token'
const EMAIL_KEY = 'dash:auth:email'

// ── Local-storage helpers ───────────────────────────────────────────

export function getToken () {
  if (typeof window === 'undefined') return null
  try {
    const v = window.localStorage.getItem(TOKEN_KEY)
    return v && v.startsWith('tok_') ? v : null
  } catch { return null }
}

export function getEmail () {
  if (typeof window === 'undefined') return null
  try {
    const v = window.localStorage.getItem(EMAIL_KEY)
    return v && v.trim() ? v.trim().toLowerCase() : null
  } catch { return null }
}

function storeSession (token, email) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(TOKEN_KEY, token)
    window.localStorage.setItem(EMAIL_KEY, email)
  } catch { /* */ }
}

function clearSession () {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(TOKEN_KEY)
    window.localStorage.removeItem(EMAIL_KEY)
  } catch { /* */ }
}

// ── Relay API ───────────────────────────────────────────────────────

/**
 * Request a 6-digit code emailed to the given address.
 * Returns { ok: true } regardless of whether the email exists (server
 * never leaks email existence). Throws only on network/server error.
 */
export async function requestCode (email) {
  const normalized = String(email || '').trim().toLowerCase()
  if (!normalized) throw new Error('Email required')
  const res = await fetch(`${RELAY_URL}/auth/code/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: normalized })
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Request failed (${res.status}): ${text.slice(0, 200)}`)
  }
  return res.json()
}

/**
 * Verify a 6-digit code. On success, stores the token + email in
 * localStorage and returns { token, email }. Throws on bad code.
 */
export async function verifyCode (email, code) {
  const normalizedEmail = String(email || '').trim().toLowerCase()
  const normalizedCode = String(code || '').trim()
  if (!normalizedEmail) throw new Error('Email required')
  if (!/^\d{6}$/.test(normalizedCode)) throw new Error('Code must be 6 digits')
  const res = await fetch(`${RELAY_URL}/auth/code/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: normalizedEmail, code: normalizedCode })
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    // 401 = wrong/expired code, surfaced as user-readable.
    if (res.status === 401) throw new Error(data.error || 'Incorrect or expired code')
    throw new Error(`Verify failed (${res.status})`)
  }
  if (!data.token) throw new Error('Server did not return a token')
  storeSession(data.token, data.email || normalizedEmail)
  return { token: data.token, email: data.email || normalizedEmail }
}

/**
 * Sign out — tells the server to delete the session, clears local
 * storage. Always clears local even if the server call fails (e.g.
 * offline), since the user expects sign-out to work instantly.
 */
export async function signOut () {
  const token = getToken()
  if (token) {
    try {
      await fetch(`${RELAY_URL}/auth/signout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      })
    } catch { /* offline = ok, local clear still happens */ }
  }
  clearSession()
}

/**
 * Fetch current identity + entitlement state from the server.
 * Returns null when not signed in (no token, or server says 401).
 */
export async function getMe () {
  const token = getToken()
  if (!token) return null
  try {
    const res = await fetch(`${RELAY_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (res.status === 401) {
      clearSession()
      return null
    }
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

/**
 * Returns an Authorization header object to splice into sync requests,
 * or an empty object when not signed in. Used by lib/syncAuth.js.
 */
export function authHeader () {
  const token = getToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}
