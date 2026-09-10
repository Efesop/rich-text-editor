/**
 * Where attachments and version history live, and moving them out of
 * localStorage on the iOS app.
 *
 * Run with: npm test
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { webcrypto } from 'node:crypto'

if (!globalThis.crypto) globalThis.crypto = webcrypto
if (!globalThis.CryptoKey) globalThis.CryptoKey = webcrypto.CryptoKey

const root = new URL('..', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')

const limits = await import('../lib/attachmentLimits.js')
const migration = await import('../lib/legacyStorageMigration.js')
const { encryptBytes, importVaultKey, generateVaultKey } = await import('../lib/syncCrypto.js')

describe('storage backends', () => {
  it('never lets the Capacitor app fall back to localStorage', () => {
    const files = readdirSync(new URL('lib/', root)).filter(f => f.endsWith('.js'))
    let scanned = 0
    for (const file of files) {
      const src = read(`lib/${file}`)
      if (!src.includes('display-mode: standalone')) continue
      scanned++
      assert.match(src, /Capacitor\?\.isNativePlatform\?\.\(\)/, `${file} checks for a standalone PWA but not the Capacitor app`)
    }
    assert.ok(scanned >= 4, `expected to scan the storage modules, found ${scanned}`)
  })
})

describe('attachment size limit', () => {
  it('is the relay limit less what encryption adds', async () => {
    const match = read('server/sync.ts').match(/export const MAX_ATTACHMENT_BYTES = ([\d\s*]+)/)
    assert.ok(match, 'server/sync.ts MAX_ATTACHMENT_BYTES not found')
    const relayLimit = match[1].split('*').map(n => Number(n.trim())).reduce((a, b) => a * b, 1)
    assert.equal(limits.RELAY_MAX_ATTACHMENT_BYTES, relayLimit)

    const key = await importVaultKey(generateVaultKey())
    const encrypted = await encryptBytes(new Uint8Array(1000), key)
    assert.equal(encrypted.length - 1000, limits.ATTACHMENT_ENCRYPTION_OVERHEAD_BYTES)
    assert.equal(limits.MAX_ATTACHMENT_BYTES + limits.ATTACHMENT_ENCRYPTION_OVERHEAD_BYTES, relayLimit)
  })

  it('is the limit local attachment storage enforces', () => {
    assert.match(read('lib/attachmentStorage.js'), /const MAX_FILE_SIZE = MAX_ATTACHMENT_BYTES/)
  })
})

function fakeLocalStorage (entries = {}) {
  const map = new Map(Object.entries(entries))
  return {
    get length () { return map.size },
    key: (i) => [...map.keys()][i] ?? null,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)) },
    removeItem: (k) => { map.delete(k) },
    has: (k) => map.has(k)
  }
}

function fakeAttachmentDb ({ dropWrites = false } = {}) {
  const map = new Map()
  return {
    map,
    async loadAttachment (id) { return map.has(id) ? map.get(id).slice(0) : null },
    async saveAttachment (id, buffer) { if (!dropWrites) map.set(id, buffer.slice(0)) }
  }
}

const b64 = (bytes) => btoa(String.fromCharCode(...bytes))

describe('migrateLegacyAttachments', () => {
  it('moves an attachment, removing it from localStorage only after it reads back', async () => {
    const bytes = new Uint8Array([1, 2, 3, 250])
    const storage = fakeLocalStorage({ 'attachment-a1': b64(bytes), 'dash-pages': '[]' })
    const idb = fakeAttachmentDb()
    const result = await migration.migrateLegacyAttachments({ storage, idb })
    assert.deepEqual(result, { moved: 1, kept: 0 })
    assert.deepEqual([...new Uint8Array(idb.map.get('a1'))], [...bytes])
    assert.equal(storage.has('attachment-a1'), false)
    assert.equal(storage.has('dash-pages'), true)
  })

  it('keeps the localStorage copy when the IndexedDB write does not land', async () => {
    const storage = fakeLocalStorage({ 'attachment-a1': b64([9, 9]) })
    const result = await migration.migrateLegacyAttachments({ storage, idb: fakeAttachmentDb({ dropWrites: true }) })
    assert.deepEqual(result, { moved: 0, kept: 1 })
    assert.equal(storage.has('attachment-a1'), true)
  })

  it('keeps both copies when IndexedDB holds different bytes under the same id', async () => {
    const storage = fakeLocalStorage({ 'attachment-a1': b64([1, 1]) })
    const idb = fakeAttachmentDb()
    idb.map.set('a1', new Uint8Array([2, 2]).buffer)
    const result = await migration.migrateLegacyAttachments({ storage, idb })
    assert.deepEqual(result, { moved: 0, kept: 1 })
    assert.equal(storage.has('attachment-a1'), true)
    assert.deepEqual([...new Uint8Array(idb.map.get('a1'))], [2, 2])
  })

  it('clears the localStorage copy when IndexedDB already has the same bytes', async () => {
    const storage = fakeLocalStorage({ 'attachment-a1': b64([7, 8]) })
    const idb = fakeAttachmentDb()
    idb.map.set('a1', new Uint8Array([7, 8]).buffer)
    assert.deepEqual(await migration.migrateLegacyAttachments({ storage, idb }), { moved: 1, kept: 0 })
    assert.equal(storage.has('attachment-a1'), false)
  })
})

describe('migrateLegacyVersions', () => {
  const snap = (timestamp, contentHash) => ({ timestamp, contentHash, blocks: [] })

  function fakeVersionDb ({ failSave = false } = {}) {
    const map = new Map()
    return {
      map,
      async readVersions (pageId) { return map.has(pageId) ? JSON.parse(JSON.stringify(map.get(pageId))) : [] },
      async saveVersions (pageId, snapshots) {
        if (failSave) return { success: false }
        map.set(pageId, JSON.parse(JSON.stringify(snapshots)))
        return { success: true }
      }
    }
  }

  it('merges localStorage history into IndexedDB, newest first, without duplicates', async () => {
    const legacy = [snap('2026-01-02T00:00:00.000Z', 'b'), snap('2026-01-01T00:00:00.000Z', 'a')]
    const storage = fakeLocalStorage({ 'dash-versions-p1': JSON.stringify(legacy) })
    const idb = fakeVersionDb()
    idb.map.set('p1', [snap('2026-03-01T00:00:00.000Z', 'c'), snap('2026-01-02T00:00:00.000Z', 'b')])
    const result = await migration.migrateLegacyVersions({ storage, idb, maxVersions: 10 })
    assert.deepEqual(result, { moved: 1, kept: 0 })
    assert.deepEqual(idb.map.get('p1').map(s => s.contentHash), ['c', 'b', 'a'])
    assert.equal(storage.has('dash-versions-p1'), false)
  })

  it('keeps localStorage history when the IndexedDB save fails', async () => {
    const storage = fakeLocalStorage({ 'dash-versions-p1': JSON.stringify([snap('2026-01-01T00:00:00.000Z', 'a')]) })
    const result = await migration.migrateLegacyVersions({ storage, idb: fakeVersionDb({ failSave: true }), maxVersions: 10 })
    assert.deepEqual(result, { moved: 0, kept: 1 })
    assert.equal(storage.has('dash-versions-p1'), true)
  })

  it('caps merged history at the length captureVersion keeps', () => {
    const many = Array.from({ length: 15 }, (_, i) => snap(`2026-01-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`, `h${i}`))
    const merged = migration.mergeVersionSnapshots(many.slice(0, 8), many.slice(8), 10)
    assert.equal(merged.length, 10)
    assert.equal(merged[0].contentHash, 'h14')
  })
})
