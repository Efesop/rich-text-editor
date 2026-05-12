// Magic-link identity layer.
//
// Why: Option C (cross-platform sync subscription) needs a way to
// identify a subscriber across devices without passwords or full
// accounts. We email a 6-digit code, the user types it back, we mint
// an opaque session token (HMAC-signed) that the app stores and
// presents on every sync request.
//
// Privacy stance: the server learns ONE piece of PII per user — their
// email — which it stores keyed by code/token and uses solely to look
// up entitlement state. Vault contents remain E2E encrypted with a key
// the server never sees. The privacy policy must disclose this (see
// pages/privacy.js and DashLandingPage/app/privacy-policy/page.tsx).
//
// Endpoints (mounted by relay.ts via routeAuth):
//   POST /auth/code/request   { email } -> { ok: true }
//     - Always returns ok (no email-existence enumeration leak).
//     - Rate-limited 1 request per 60 s per email.
//     - Stores ['auth-code', email] -> { code, attempts: 0, createdAt }
//       with 10-min TTL.
//
//   POST /auth/code/verify    { email, code } -> { token, email }
//     - Max 5 attempts per code; 6th deletes the entry.
//     - Token format: tok_<32 hex>.<hmac>. The hmac lets us validate
//       format before a KV lookup (cheap rejection of bogus tokens).
//     - Stores ['auth-session', tokenId] -> { email, createdAt } with
//       90-day TTL.
//
//   POST /auth/signout        (Authorization: Bearer ...) -> { ok }
//     - Deletes the session KV entry.
//
//   GET  /auth/me             (Authorization: Bearer ...) ->
//     { email, hasSync, source }
//     - Calls hasEntitlement(); used by clients to decide whether to
//       prompt for purchase/subscribe.
//
// Token validation is exported as verifySessionToken() so sync.ts can
// stack it on top of the existing HMAC vault auth.

import { hasEntitlement } from './entitlements.ts'
import { sendCode } from './resend.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

// ── KV shapes ───────────────────────────────────────────────────────
type AuthCodeRec = {
  code: string
  attempts: number
  createdAt: number
}
type AuthSessionRec = {
  email: string
  createdAt: number
}
const codeKey = (email: string) => ['auth-code', email.trim().toLowerCase()] as const
const sessionKey = (tokenId: string) => ['auth-session', tokenId] as const
const throttleKey = (email: string) => ['auth-throttle', email.trim().toLowerCase()] as const

const CODE_TTL_MS = 10 * 60 * 1000
const SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000
const REQUEST_THROTTLE_MS = 60 * 1000
const MAX_VERIFY_ATTEMPTS = 5

// ── helpers ─────────────────────────────────────────────────────────

function isValidEmail(s: unknown): s is string {
  if (typeof s !== 'string') return false
  if (s.length < 3 || s.length > 320) return false
  // Cheap shape check — Resend will hard-bounce malformed anyway.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)
}

function generateSixDigitCode(): string {
  // crypto.getRandomValues mod 1_000_000, zero-padded to 6 digits.
  // Bias from modulus is negligible at 1e6 vs 2^32.
  const buf = new Uint32Array(1)
  crypto.getRandomValues(buf)
  return (buf[0] % 1_000_000).toString().padStart(6, '0')
}

function generateTokenId(): string {
  // 16 random bytes = 32 hex chars. Unguessable.
  const buf = crypto.getRandomValues(new Uint8Array(16))
  return [...buf].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function hmacHex(message: string, secret: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message))
  return [...new Uint8Array(sig)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let mismatch = 0
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return mismatch === 0
}

async function mintToken(): Promise<string> {
  const secret = Deno.env.get('AUTH_TOKEN_SECRET')
  if (!secret) throw new Error('AUTH_TOKEN_SECRET not configured')
  const id = generateTokenId()
  const sig = await hmacHex(id, secret)
  return `tok_${id}.${sig}`
}

/**
 * Parse + signature-check a presented bearer token. Does NOT hit KV.
 * Returns the inner tokenId on success so the caller can perform a
 * single KV lookup. Returns null on any format/sig failure.
 *
 * This lets us cheaply reject obviously-bogus tokens (e.g. random
 * 32-char strings) before paying for KV reads.
 */
async function parseToken(presented: string): Promise<string | null> {
  if (!presented.startsWith('tok_')) return null
  const rest = presented.slice(4)
  const dot = rest.indexOf('.')
  if (dot <= 0) return null
  const id = rest.slice(0, dot)
  const sig = rest.slice(dot + 1)
  if (id.length !== 32 || !/^[0-9a-f]+$/.test(id)) return null
  if (sig.length !== 64 || !/^[0-9a-f]+$/.test(sig)) return null
  const secret = Deno.env.get('AUTH_TOKEN_SECRET')
  if (!secret) return null
  const expected = await hmacHex(id, secret)
  if (!constantTimeEqual(sig, expected)) return null
  return id
}

function extractBearer(req: Request): string | null {
  const h = req.headers.get('Authorization') || req.headers.get('authorization') || ''
  if (!h.startsWith('Bearer ')) return null
  const t = h.slice(7).trim()
  return t || null
}

// ── Public API ──────────────────────────────────────────────────────

/**
 * Verify a session token (HMAC sig + KV lookup). Returns the
 * authenticated email or null. Called from sync.ts via the
 * requireSyncEntitlement helper.
 */
export async function verifySessionToken(
  kv: Deno.Kv,
  presentedToken: string | null,
): Promise<{ email: string; tokenId: string } | null> {
  if (!presentedToken) return null
  const tokenId = await parseToken(presentedToken)
  if (!tokenId) return null
  const rec = await kv.get<AuthSessionRec>(sessionKey(tokenId))
  if (!rec.value?.email) return null
  return { email: rec.value.email, tokenId }
}

/**
 * Verify a session token directly from a Request's Authorization
 * header. Convenience wrapper for sync gates.
 */
export async function verifyAuthRequest(
  kv: Deno.Kv,
  req: Request,
): Promise<{ email: string; tokenId: string } | null> {
  return verifySessionToken(kv, extractBearer(req))
}

/**
 * Router for /auth/* endpoints. Returns null if the path doesn't
 * match so relay.ts can fall through.
 */
export async function routeAuth(kv: Deno.Kv, req: Request): Promise<Response | null> {
  const url = new URL(req.url)
  const path = url.pathname

  if (req.method === 'OPTIONS' && path.startsWith('/auth/')) {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  // ── POST /auth/code/request ───────────────────────────────────────
  if (path === '/auth/code/request' && req.method === 'POST') {
    let body: any
    try { body = await req.json() } catch { return json({ error: 'invalid json' }, 400) }
    if (!isValidEmail(body?.email)) {
      // Don't leak — pretend we sent
      return json({ ok: true })
    }
    const email = body.email.trim().toLowerCase()

    // Throttle: at most 1 code request per 60 s per email.
    const throttle = await kv.get<{ at: number }>(throttleKey(email))
    if (throttle.value && Date.now() - throttle.value.at < REQUEST_THROTTLE_MS) {
      // Don't leak — pretend we sent
      return json({ ok: true, throttled: true })
    }

    const code = generateSixDigitCode()
    const rec: AuthCodeRec = { code, attempts: 0, createdAt: Date.now() }
    // Set throttle first so a Resend failure doesn't allow rapid retries.
    await kv.set(throttleKey(email), { at: Date.now() }, { expireIn: REQUEST_THROTTLE_MS })
    await kv.set(codeKey(email), rec, { expireIn: CODE_TTL_MS })

    const resendResult = await sendCode(email, code)
    if (!resendResult.ok) {
      console.error(`[auth] sendCode failed for ${email}: ${resendResult.error}`)
      // Still 200 to caller — don't leak email existence — but log loudly.
      // User will retry after 60 s if they don't see an email.
    } else {
      console.log(`[auth] code sent to ${email} (resendId=${resendResult.id})`)
    }
    return json({ ok: true })
  }

  // ── POST /auth/code/verify ────────────────────────────────────────
  if (path === '/auth/code/verify' && req.method === 'POST') {
    let body: any
    try { body = await req.json() } catch { return json({ error: 'invalid json' }, 400) }
    if (!isValidEmail(body?.email) || typeof body?.code !== 'string') {
      return json({ error: 'invalid input' }, 400)
    }
    const email = body.email.trim().toLowerCase()
    const presented = body.code.trim()
    if (!/^\d{6}$/.test(presented)) {
      return json({ error: 'invalid code' }, 401)
    }

    const rec = await kv.get<AuthCodeRec>(codeKey(email))
    if (!rec.value) {
      return json({ error: 'no code pending' }, 401)
    }
    if (rec.value.attempts >= MAX_VERIFY_ATTEMPTS) {
      await kv.delete(codeKey(email))
      return json({ error: 'too many attempts' }, 401)
    }
    if (!constantTimeEqual(presented, rec.value.code)) {
      // Increment attempts atomically; on max, delete on next verify.
      await kv.set(codeKey(email), {
        ...rec.value,
        attempts: rec.value.attempts + 1,
      }, { expireIn: CODE_TTL_MS })
      return json({ error: 'incorrect code' }, 401)
    }

    // Success — consume the code so it can't be reused, mint token.
    await kv.delete(codeKey(email))
    let token: string
    try {
      token = await mintToken()
    } catch (err) {
      console.error('[auth] mintToken failed', err)
      return json({ error: 'server misconfigured' }, 500)
    }
    // Strip the "tok_" prefix + signature suffix to get bare tokenId
    // for the KV key.
    const tokenId = token.slice(4, 4 + 32)
    const sessRec: AuthSessionRec = { email, createdAt: Date.now() }
    await kv.set(sessionKey(tokenId), sessRec, { expireIn: SESSION_TTL_MS })
    console.log(`[auth] signed in ${email}`)
    return json({ token, email })
  }

  // ── POST /auth/signout ────────────────────────────────────────────
  if (path === '/auth/signout' && req.method === 'POST') {
    const presented = extractBearer(req)
    if (!presented) return json({ ok: true })
    const tokenId = await parseToken(presented)
    if (tokenId) {
      await kv.delete(sessionKey(tokenId))
    }
    return json({ ok: true })
  }

  // ── GET /auth/me ─────────────────────────────────────────────────
  if (path === '/auth/me' && req.method === 'GET') {
    const sess = await verifyAuthRequest(kv, req)
    if (!sess) return json({ error: 'not authenticated' }, 401)
    // Composed entitlement state across all rails (mac, ios, stripe-sub).
    const ent = await hasEntitlement(kv, { email: sess.email })
    return json({ email: sess.email, hasSync: ent.hasSync, source: ent.source ?? null })
  }

  return null
}
