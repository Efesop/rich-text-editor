/**
 * App-lock encryption must not drop a change made while it runs.
 *
 * Run with: npm test
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

const { encryptPagesUntilStable } = await import('../lib/appLockSnapshot.js')

const encryptPage = async (p) => {
  await new Promise(resolve => setTimeout(resolve, 1))
  return { ...p, content: null, appLockEncrypted: true }
}

describe('encryptPagesUntilStable', () => {
  it('encrypts and saves the current list when nothing changes', async () => {
    const list = [{ id: 'a', content: {} }, { id: 'b', content: {} }]
    const saved = []
    const result = await encryptPagesUntilStable({ read: () => list, save: async (p) => saved.push(p), encryptPage })
    assert.equal(result.stable, true)
    assert.equal(result.attempts, 1)
    assert.deepEqual(result.pages.map(p => p.id), ['a', 'b'])
    assert.equal(saved[0], list)
  })

  it('starts again when the list is replaced mid-encryption, so the new page is saved and kept', async () => {
    let current = [{ id: 'a', content: {} }]
    const saved = []
    let encrypted = 0
    const result = await encryptPagesUntilStable({
      read: () => current,
      save: async (p) => saved.push(p),
      encryptPage: async (p) => {
        encrypted++
        // A pull or an import commits while the first pass is running.
        if (encrypted === 1) current = [...current, { id: 'imported', content: {} }]
        return encryptPage(p)
      }
    })
    assert.equal(result.stable, true)
    assert.equal(result.attempts, 2)
    assert.deepEqual(result.pages.map(p => p.id), ['a', 'imported'])
    assert.deepEqual(saved.at(-1).map(p => p.id), ['a', 'imported'])
  })

  it('gives up without a result when the list never settles', async () => {
    let n = 0
    const result = await encryptPagesUntilStable({
      read: () => [{ id: `p${n++}`, content: {} }],
      save: async () => {},
      encryptPage,
      maxAttempts: 3
    })
    assert.equal(result.stable, false)
    assert.equal(result.pages, null)
  })
})
