/**
 * Relay host alias + fallback tests.
 *
 * Run with: npm test
 */

import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

const {
  DIRECT_RELAY_URL, CUSTOM_RELAY_URL, PROXY_RELAY_URL, LEGACY_RELAY_URL, RELAY_ALIASES,
  normalizeRelayUrl, toHttpUrl, isSameRelay, relayCandidates, compatRelayUrl, relaySupportsWebSocket,
  resolveRelayUrl, markRelayUnreachable, _resetRelayHostCache
} = await import('../lib/relayHosts.js')

const SELF_HOSTED = 'wss://relay.example.org'

const hostOf = (wsUrl) => new URL(toHttpUrl(wsUrl)).host + new URL(toHttpUrl(wsUrl)).pathname.replace(/\/$/, '')
const DIRECT = hostOf(DIRECT_RELAY_URL)
const CUSTOM = hostOf(CUSTOM_RELAY_URL)
const PROXY = hostOf(PROXY_RELAY_URL)

function fakeFetch (behaviour) {
  // behaviour keyed by host[/path-prefix]: 'ok' | 'fail' | 'hang' | number (delay ms then ok)
  const calls = []
  const fn = async (url, init) => {
    const u = new URL(url)
    const key = Object.keys(behaviour).find(k => (u.host + u.pathname).startsWith(k)) || u.host
    calls.push(key)
    const b = behaviour[key]
    if (b === 'ok') return { ok: true }
    if (b === 'fail') throw new TypeError('Load failed')
    if (typeof b === 'number') {
      await new Promise(r => setTimeout(r, b))
      return { ok: true }
    }
    return new Promise((resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))
    })
  }
  fn.calls = calls
  return fn
}

describe('relay host aliases', () => {
  it('normalizes scheme, case and trailing slashes, keeping paths', () => {
    assert.equal(normalizeRelayUrl('WSS://Sync.DashNote.io/'), CUSTOM_RELAY_URL)
    assert.equal(normalizeRelayUrl('https://dash-relay.efesop.deno.net//'), DIRECT_RELAY_URL)
    assert.equal(normalizeRelayUrl('https://DashNote.io/relay/'), PROXY_RELAY_URL)
    assert.equal(normalizeRelayUrl('ws://localhost:8000'), 'ws://localhost:8000')
    assert.equal(normalizeRelayUrl(null), '')
  })

  it('maps ws(s) to http(s)', () => {
    assert.equal(toHttpUrl(CUSTOM_RELAY_URL), 'https://sync.dashnote.io')
    assert.equal(toHttpUrl(PROXY_RELAY_URL), 'https://dashnote.io/relay')
    assert.equal(toHttpUrl('ws://localhost:8000/'), 'http://localhost:8000')
  })

  it('treats every public name as the same relay, and nothing else', () => {
    assert.equal(RELAY_ALIASES.length, 3)
    assert.equal(isSameRelay(DIRECT_RELAY_URL, CUSTOM_RELAY_URL), true)
    assert.equal(isSameRelay(DIRECT_RELAY_URL, PROXY_RELAY_URL), true)
    assert.equal(isSameRelay(LEGACY_RELAY_URL, 'https://dash-relay.efesop.deno.net/'), true)
    assert.equal(isSameRelay(SELF_HOSTED, SELF_HOSTED + '/'), true)
    assert.equal(isSameRelay(SELF_HOSTED, DIRECT_RELAY_URL), false)
    assert.equal(isSameRelay('', DIRECT_RELAY_URL), false)
  })

  it('lists candidates in preference order for public names only', () => {
    assert.deepEqual(relayCandidates(PROXY_RELAY_URL), [DIRECT_RELAY_URL, CUSTOM_RELAY_URL, PROXY_RELAY_URL])
    assert.deepEqual(relayCandidates(SELF_HOSTED), [SELF_HOSTED])
    assert.deepEqual(relayCandidates(undefined), [])
  })

  it('writes the legacy name into packets/metadata for any public alias', () => {
    assert.equal(LEGACY_RELAY_URL, DIRECT_RELAY_URL)
    assert.equal(compatRelayUrl(CUSTOM_RELAY_URL), LEGACY_RELAY_URL)
    assert.equal(compatRelayUrl(PROXY_RELAY_URL), LEGACY_RELAY_URL)
    assert.equal(compatRelayUrl(SELF_HOSTED + '/'), SELF_HOSTED)
  })

  it('only the proxy alias lacks WebSocket support', () => {
    assert.equal(relaySupportsWebSocket(DIRECT_RELAY_URL), true)
    assert.equal(relaySupportsWebSocket(CUSTOM_RELAY_URL), true)
    assert.equal(relaySupportsWebSocket(SELF_HOSTED), true)
    assert.equal(relaySupportsWebSocket('https://dashnote.io/relay/'), false)
  })
})

describe('resolveRelayUrl', () => {
  beforeEach(() => _resetRelayHostCache())

  it('returns self-hosted URLs unchanged without probing', async () => {
    const f = fakeFetch({})
    assert.equal(await resolveRelayUrl(SELF_HOSTED + '/', { fetchImpl: f }), SELF_HOSTED)
    assert.deepEqual(f.calls, [])
  })

  it('prefers the direct name when it answers', async () => {
    const f = fakeFetch({ [DIRECT]: 'ok', [CUSTOM]: 'ok', [PROXY]: 'ok' })
    assert.equal(await resolveRelayUrl(DIRECT_RELAY_URL, { fetchImpl: f, preferMs: 200 }), DIRECT_RELAY_URL)
    assert.equal(f.calls.length, 3, 'probes every alias concurrently')
  })

  it('lands on the proxy when *.deno.net is blocked and the custom name does not exist', async () => {
    const f = fakeFetch({ [DIRECT]: 'fail', [CUSTOM]: 'fail', [PROXY]: 'ok' })
    assert.equal(await resolveRelayUrl(DIRECT_RELAY_URL, { fetchImpl: f, preferMs: 200 }), PROXY_RELAY_URL)
  })

  it('takes the custom name over the proxy once it exists', async () => {
    const f = fakeFetch({ [DIRECT]: 'fail', [CUSTOM]: 'ok', [PROXY]: 'ok' })
    assert.equal(await resolveRelayUrl(DIRECT_RELAY_URL, { fetchImpl: f, preferMs: 200 }), CUSTOM_RELAY_URL)
  })

  it('does not wait for a hanging direct name past the preference window', async () => {
    const f = fakeFetch({ [DIRECT]: 'hang', [CUSTOM]: 'fail', [PROXY]: 'ok' })
    const t0 = Date.now()
    assert.equal(await resolveRelayUrl(DIRECT_RELAY_URL, { fetchImpl: f, preferMs: 100, timeoutMs: 400 }), PROXY_RELAY_URL)
    assert.ok(Date.now() - t0 < 400, 'did not wait for the hanging probe to time out')
  })

  it('returns the preferred URL when nothing answers, and does not cache that', async () => {
    const f = fakeFetch({ [DIRECT]: 'fail', [CUSTOM]: 'fail', [PROXY]: 'fail' })
    assert.equal(await resolveRelayUrl(DIRECT_RELAY_URL, { fetchImpl: f, preferMs: 100 }), DIRECT_RELAY_URL)
    const g = fakeFetch({ [DIRECT]: 'ok', [CUSTOM]: 'ok', [PROXY]: 'ok' })
    assert.equal(await resolveRelayUrl(DIRECT_RELAY_URL, { fetchImpl: g, preferMs: 100 }), DIRECT_RELAY_URL)
    assert.ok(g.calls.length > 0, 're-probed after a total failure')
  })

  it('caches the winner and re-probes only after markRelayUnreachable', async () => {
    const f = fakeFetch({ [DIRECT]: 'fail', [CUSTOM]: 'fail', [PROXY]: 'ok' })
    assert.equal(await resolveRelayUrl(DIRECT_RELAY_URL, { fetchImpl: f, preferMs: 100 }), PROXY_RELAY_URL)
    const n = f.calls.length
    assert.equal(await resolveRelayUrl(CUSTOM_RELAY_URL, { fetchImpl: f, preferMs: 100 }), PROXY_RELAY_URL)
    assert.equal(f.calls.length, n, 'served from cache for any alias')
    markRelayUnreachable(SELF_HOSTED)
    assert.equal(await resolveRelayUrl(DIRECT_RELAY_URL, { fetchImpl: f, preferMs: 100 }), PROXY_RELAY_URL)
    assert.equal(f.calls.length, n, 'unrelated URL does not clear the cache')
    markRelayUnreachable(PROXY_RELAY_URL)
    const g = fakeFetch({ [DIRECT]: 'ok', [CUSTOM]: 'ok', [PROXY]: 'ok' })
    assert.equal(await resolveRelayUrl(DIRECT_RELAY_URL, { fetchImpl: g, preferMs: 100 }), DIRECT_RELAY_URL)
    assert.ok(g.calls.length > 0, 're-probed after the cache was cleared')
  })

  it('coalesces concurrent resolutions into one probe round', async () => {
    const f = fakeFetch({ [DIRECT]: 50, [CUSTOM]: 'fail', [PROXY]: 'ok' })
    const [a, b, c] = await Promise.all([
      resolveRelayUrl(DIRECT_RELAY_URL, { fetchImpl: f, preferMs: 200 }),
      resolveRelayUrl(DIRECT_RELAY_URL, { fetchImpl: f, preferMs: 200 }),
      resolveRelayUrl(DIRECT_RELAY_URL, { fetchImpl: f, preferMs: 200 })
    ])
    assert.deepEqual([a, b, c], [DIRECT_RELAY_URL, DIRECT_RELAY_URL, DIRECT_RELAY_URL])
    assert.equal(f.calls.length, 3, 'one probe per alias, not per caller')
  })
})
