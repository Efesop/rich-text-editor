/**
 * Relay host alias + fallback tests.
 *
 * Run with: npm test
 */

import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

const {
  PRIMARY_RELAY_URL, LEGACY_RELAY_URL,
  normalizeRelayUrl, toHttpUrl, isSameRelay, relayCandidates, compatRelayUrl,
  resolveRelayUrl, markRelayUnreachable, _resetRelayHostCache
} = await import('../lib/relayHosts.js')

const SELF_HOSTED = 'wss://relay.example.org'

function fakeFetch (behaviour) {
  // behaviour: { [host]: 'ok' | 'fail' | 'hang' | number (delay ms then ok) }
  const calls = []
  const fn = async (url, init) => {
    const host = new URL(url).host
    calls.push(host)
    const b = behaviour[host]
    if (b === 'ok') return { ok: true }
    if (b === 'fail') throw new TypeError('Load failed')
    if (typeof b === 'number') {
      await new Promise(r => setTimeout(r, b))
      return { ok: true }
    }
    // hang until aborted
    return new Promise((resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))
    })
  }
  fn.calls = calls
  return fn
}

const PRIMARY_HOST = new URL(toHttpUrl(PRIMARY_RELAY_URL)).host
const LEGACY_HOST = new URL(toHttpUrl(LEGACY_RELAY_URL)).host

describe('relay host aliases', () => {
  it('normalizes scheme, case and trailing slashes', () => {
    assert.equal(normalizeRelayUrl('WSS://Sync.DashNote.io/'), 'wss://sync.dashnote.io')
    assert.equal(normalizeRelayUrl('https://dash-relay.efesop.deno.net//'), LEGACY_RELAY_URL)
    assert.equal(normalizeRelayUrl('ws://localhost:8000'), 'ws://localhost:8000')
    assert.equal(normalizeRelayUrl(null), '')
  })

  it('maps ws(s) to http(s)', () => {
    assert.equal(toHttpUrl(PRIMARY_RELAY_URL), 'https://sync.dashnote.io')
    assert.equal(toHttpUrl('ws://localhost:8000/'), 'http://localhost:8000')
  })

  it('treats the two public names as the same relay, and nothing else', () => {
    assert.equal(isSameRelay(PRIMARY_RELAY_URL, LEGACY_RELAY_URL), true)
    assert.equal(isSameRelay(LEGACY_RELAY_URL, 'https://dash-relay.efesop.deno.net/'), true)
    assert.equal(isSameRelay(SELF_HOSTED, SELF_HOSTED + '/'), true)
    assert.equal(isSameRelay(SELF_HOSTED, LEGACY_RELAY_URL), false)
    assert.equal(isSameRelay('', LEGACY_RELAY_URL), false)
  })

  it('lists candidates primary-first for public names only', () => {
    assert.deepEqual(relayCandidates(LEGACY_RELAY_URL), [PRIMARY_RELAY_URL, LEGACY_RELAY_URL])
    assert.deepEqual(relayCandidates(PRIMARY_RELAY_URL), [PRIMARY_RELAY_URL, LEGACY_RELAY_URL])
    assert.deepEqual(relayCandidates(SELF_HOSTED), [SELF_HOSTED])
    assert.deepEqual(relayCandidates(undefined), [])
  })

  it('writes the legacy name into packets/metadata for any public alias', () => {
    assert.equal(compatRelayUrl(PRIMARY_RELAY_URL), LEGACY_RELAY_URL)
    assert.equal(compatRelayUrl(LEGACY_RELAY_URL), LEGACY_RELAY_URL)
    assert.equal(compatRelayUrl(SELF_HOSTED + '/'), SELF_HOSTED)
  })
})

describe('resolveRelayUrl', () => {
  beforeEach(() => _resetRelayHostCache())

  it('returns self-hosted URLs unchanged without probing', async () => {
    const f = fakeFetch({})
    assert.equal(await resolveRelayUrl(SELF_HOSTED + '/', { fetchImpl: f }), SELF_HOSTED)
    assert.deepEqual(f.calls, [])
  })

  it('prefers the primary when it answers', async () => {
    const f = fakeFetch({ [PRIMARY_HOST]: 'ok', [LEGACY_HOST]: 'ok' })
    assert.equal(await resolveRelayUrl(LEGACY_RELAY_URL, { fetchImpl: f, preferMs: 200 }), PRIMARY_RELAY_URL)
    assert.ok(f.calls.includes(PRIMARY_HOST) && f.calls.includes(LEGACY_HOST), 'probes both concurrently')
  })

  it('falls back to the legacy name when the primary fails fast', async () => {
    const f = fakeFetch({ [PRIMARY_HOST]: 'fail', [LEGACY_HOST]: 'ok' })
    assert.equal(await resolveRelayUrl(LEGACY_RELAY_URL, { fetchImpl: f, preferMs: 200 }), LEGACY_RELAY_URL)
  })

  it('uses the legacy name when the primary hangs past the preference window', async () => {
    const f = fakeFetch({ [PRIMARY_HOST]: 'hang', [LEGACY_HOST]: 'ok' })
    const t0 = Date.now()
    assert.equal(await resolveRelayUrl(LEGACY_RELAY_URL, { fetchImpl: f, preferMs: 100, timeoutMs: 300 }), LEGACY_RELAY_URL)
    assert.ok(Date.now() - t0 < 300, 'did not wait for the hanging probe to time out')
  })

  it('uses the primary when only it answers (deno.net blocked)', async () => {
    const f = fakeFetch({ [PRIMARY_HOST]: 'ok', [LEGACY_HOST]: 'fail' })
    assert.equal(await resolveRelayUrl(LEGACY_RELAY_URL, { fetchImpl: f, preferMs: 200 }), PRIMARY_RELAY_URL)
  })

  it('returns the preferred URL when nothing answers, and does not cache that', async () => {
    const f = fakeFetch({ [PRIMARY_HOST]: 'fail', [LEGACY_HOST]: 'fail' })
    assert.equal(await resolveRelayUrl(LEGACY_RELAY_URL, { fetchImpl: f, preferMs: 100 }), LEGACY_RELAY_URL)
    const g = fakeFetch({ [PRIMARY_HOST]: 'ok', [LEGACY_HOST]: 'ok' })
    assert.equal(await resolveRelayUrl(LEGACY_RELAY_URL, { fetchImpl: g, preferMs: 100 }), PRIMARY_RELAY_URL)
    assert.ok(g.calls.length > 0, 're-probed after a total failure')
  })

  it('caches the winner and re-probes only after markRelayUnreachable', async () => {
    const f = fakeFetch({ [PRIMARY_HOST]: 'fail', [LEGACY_HOST]: 'ok' })
    assert.equal(await resolveRelayUrl(LEGACY_RELAY_URL, { fetchImpl: f, preferMs: 100 }), LEGACY_RELAY_URL)
    const n = f.calls.length
    assert.equal(await resolveRelayUrl(PRIMARY_RELAY_URL, { fetchImpl: f, preferMs: 100 }), LEGACY_RELAY_URL)
    assert.equal(f.calls.length, n, 'served from cache')
    markRelayUnreachable(SELF_HOSTED)
    assert.equal(await resolveRelayUrl(LEGACY_RELAY_URL, { fetchImpl: f, preferMs: 100 }), LEGACY_RELAY_URL)
    assert.equal(f.calls.length, n, 'unrelated URL does not clear the cache')
    markRelayUnreachable(LEGACY_RELAY_URL)
    const g = fakeFetch({ [PRIMARY_HOST]: 'ok', [LEGACY_HOST]: 'ok' })
    assert.equal(await resolveRelayUrl(LEGACY_RELAY_URL, { fetchImpl: g, preferMs: 100 }), PRIMARY_RELAY_URL)
    assert.ok(g.calls.length > 0, 're-probed after the cache was cleared')
  })

  it('coalesces concurrent resolutions into one probe round', async () => {
    const f = fakeFetch({ [PRIMARY_HOST]: 50, [LEGACY_HOST]: 'ok' })
    const [a, b, c] = await Promise.all([
      resolveRelayUrl(LEGACY_RELAY_URL, { fetchImpl: f, preferMs: 200 }),
      resolveRelayUrl(LEGACY_RELAY_URL, { fetchImpl: f, preferMs: 200 }),
      resolveRelayUrl(LEGACY_RELAY_URL, { fetchImpl: f, preferMs: 200 })
    ])
    assert.deepEqual([a, b, c], [PRIMARY_RELAY_URL, PRIMARY_RELAY_URL, PRIMARY_RELAY_URL])
    assert.equal(f.calls.length, 2, 'one probe per alias, not per caller')
  })
})
