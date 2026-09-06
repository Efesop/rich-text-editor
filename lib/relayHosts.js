/**
 * Relay host aliases + reachability fallback.
 *
 * The public relay answers under more than one hostname. They are the SAME
 * server (same KV, same vaults, same auth); only the name differs. Why two:
 * some phones refuse every name under `deno.net` — iCloud Private Relay's
 * partner resolvers and some DNS-filter apps treat the shared Deno Deploy
 * domain as risky — so the sync server was unreachable from those devices
 * while every other site worked ("Sync error — Load failed", Sep 2026).
 * `sync.dashnote.io` sits on our own domain and is not filtered.
 *
 * Rules:
 *  - The URL STORED in vault metadata / carried in pair packets stays the
 *    legacy name, so older app versions (whose stale-relay guard wipes the
 *    vault if the stored URL differs from their build-time URL) keep working.
 *  - `isSameRelay()` treats all aliases as equal — the guard uses it.
 *  - `resolveRelayUrl()` picks a reachable alias at runtime (probing /health
 *    on all of them concurrently, preferring the direct name) and caches the
 *    winner for the session. `markRelayUnreachable()` clears the cache after
 *    a network-level failure so the next request re-probes.
 *  - Self-hosted relays (any URL not in the alias list) are returned as-is,
 *    never probed.
 *
 * Aliases, in preference order:
 *  1. DIRECT  — the relay's own Deno Deploy name. WebSocket doorbell works.
 *  2. CUSTOM  — `sync.dashnote.io`, a custom domain on the relay. Not created
 *               yet (Sep 2026); listed so every shipped build picks it up the
 *               day it exists. Fails fast (NXDOMAIN) until then.
 *  3. PROXY   — `dashnote.io/relay`, a Vercel rewrite in front of the relay.
 *               HTTPS only: no WebSocket, so devices that land here rely on
 *               the periodic + foreground pulls. Reachable wherever the
 *               marketing site is, which is what makes it the safety net.
 */

export const DIRECT_RELAY_URL = 'wss://dash-relay.efesop.deno.net'
export const CUSTOM_RELAY_URL = 'wss://sync.dashnote.io'
export const PROXY_RELAY_URL = 'wss://dashnote.io/relay'
/** Preferred first. Same server under every name. */
export const RELAY_ALIASES = Object.freeze([DIRECT_RELAY_URL, CUSTOM_RELAY_URL, PROXY_RELAY_URL])
/** The name older clients require verbatim in packets / metadata. */
export const LEGACY_RELAY_URL = DIRECT_RELAY_URL
export const PRIMARY_RELAY_URL = DIRECT_RELAY_URL

const DEFAULT_TIMEOUT_MS = 4000
// How long the direct name gets to answer before a slower-to-answer alias
// may win. Generous so a merely slow network doesn't drop to the proxy.
const DEFAULT_PREFER_MS = 2500

/**
 * Canonical form: ws(s) scheme, lower-case scheme + host, no trailing slash.
 * http(s) input is mapped to ws(s) so both spellings compare equal.
 */
export function normalizeRelayUrl (url) {
  if (typeof url !== 'string') return ''
  let u = url.trim().replace(/\/+$/, '')
  u = u.replace(/^https:\/\//i, 'wss://').replace(/^http:\/\//i, 'ws://')
  const m = u.match(/^(wss?):\/\/([^/]+)(.*)$/i)
  if (!m) return u
  return `${m[1].toLowerCase()}://${m[2].toLowerCase()}${m[3]}`
}

export function toHttpUrl (wsUrl) {
  return normalizeRelayUrl(wsUrl)
    .replace(/^wss:\/\//, 'https://')
    .replace(/^ws:\/\//, 'http://')
}

export function isKnownRelay (url) {
  return RELAY_ALIASES.includes(normalizeRelayUrl(url))
}

/** True when both URLs name the same relay (identical, or both public aliases). */
export function isSameRelay (a, b) {
  const na = normalizeRelayUrl(a)
  const nb = normalizeRelayUrl(b)
  if (!na || !nb) return false
  if (na === nb) return true
  return RELAY_ALIASES.includes(na) && RELAY_ALIASES.includes(nb)
}

/** Aliases to try for a stored URL, primary first. Non-public URLs: just themselves. */
export function relayCandidates (url) {
  const n = normalizeRelayUrl(url)
  if (!n) return []
  return RELAY_ALIASES.includes(n) ? [...RELAY_ALIASES] : [n]
}

/**
 * The URL to write into pair packets / vault metadata: the legacy name for
 * any public alias (older clients require it verbatim), otherwise unchanged.
 */
export function compatRelayUrl (url) {
  return isKnownRelay(url) ? LEGACY_RELAY_URL : normalizeRelayUrl(url)
}

/** False for the HTTPS-only proxy alias; the WS doorbell must not be attempted there. */
export function relaySupportsWebSocket (url) {
  return normalizeRelayUrl(url) !== PROXY_RELAY_URL
}

let cached = null // normalized URL known to answer /health this session
let inflight = null

/** Forget the cached winner (after a network-level failure) so the next call re-probes. */
export function markRelayUnreachable (url) {
  if (!cached) return
  if (!url || isSameRelay(cached, url)) cached = null
}

/** Test hook. */
export function _resetRelayHostCache () {
  cached = null
  inflight = null
}

async function probeOne (wsUrl, { fetchImpl, timeoutMs }) {
  const ctrl = typeof AbortController === 'function' ? new AbortController() : null
  const timer = setTimeout(() => { try { ctrl?.abort() } catch { /* */ } }, timeoutMs)
  try {
    const res = await fetchImpl(toHttpUrl(wsUrl) + '/health', { method: 'GET', signal: ctrl?.signal })
    return !!res && res.ok === true
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

function sleep (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Probe every candidate concurrently. The first (preferred) alias wins if it
 * answers within `preferMs`; otherwise the first alias to answer wins; null if
 * none does.
 */
async function pickReachable (candidates, opts) {
  const results = candidates.map(c => probeOne(c, opts).then(ok => (ok ? c : null)))
  const primary = await Promise.race([results[0], sleep(opts.preferMs).then(() => undefined)])
  if (primary) return primary
  return new Promise(resolve => {
    let pending = results.length
    for (const p of results) {
      p.then(v => {
        if (v) resolve(v)
        else if (--pending === 0) resolve(null)
      })
    }
  })
}

/**
 * Resolve the relay URL to use RIGHT NOW for a stored/preferred URL.
 * Returns a normalized ws(s) URL. Never throws; if nothing answers, returns
 * the preferred URL so callers fail the same way they always did.
 *
 * @param {string} preferred - stored relay URL (vault metadata / env)
 * @param {object} [opts]
 * @param {Function} [opts.fetchImpl] - fetch to use (tests)
 * @param {number} [opts.timeoutMs] - per-probe timeout
 * @param {number} [opts.preferMs] - how long to wait for the preferred alias before accepting another
 */
export async function resolveRelayUrl (preferred, opts = {}) {
  const candidates = relayCandidates(preferred)
  if (candidates.length === 0) return normalizeRelayUrl(preferred)
  if (candidates.length === 1) return candidates[0]
  if (cached && candidates.includes(cached)) return cached
  const fetchImpl = opts.fetchImpl || (typeof fetch === 'function' ? fetch : null)
  if (!fetchImpl) return normalizeRelayUrl(preferred)
  if (inflight) return inflight
  inflight = (async () => {
    try {
      const winner = await pickReachable(candidates, {
        fetchImpl,
        timeoutMs: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        preferMs: opts.preferMs ?? DEFAULT_PREFER_MS
      })
      if (winner) {
        cached = winner
        return winner
      }
      return normalizeRelayUrl(preferred)
    } finally {
      inflight = null
    }
  })()
  return inflight
}
