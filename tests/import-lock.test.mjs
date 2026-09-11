/**
 * Importers: one import at a time, and actions that wait for it.
 *
 * Run with: npm test
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

const { beginImport, importInProgress, whenImportEnds } = await import('../lib/import/lock.js')

describe('import lock', () => {
  it('allows one import at a time and runs waiting actions once it ends', () => {
    assert.equal(importInProgress(), false)
    const ran = []
    whenImportEnds(() => ran.push('now'))
    assert.deepEqual(ran, ['now'], 'nothing running: runs straight away')

    const end = beginImport('Evernote')
    assert.equal(importInProgress(), true)
    assert.throws(() => beginImport('Notion'), /already running/)
    const lock = () => ran.push('lock')
    whenImportEnds(lock)
    whenImportEnds(lock)
    whenImportEnds(() => { throw new Error('boom') })
    assert.deepEqual(ran, ['now'])

    const original = console.error
    console.error = () => {}
    try {
      end()
    } finally {
      console.error = original
    }
    assert.equal(importInProgress(), false)
    assert.deepEqual(ran, ['now', 'lock'], 'the same action waiting twice runs once, and a failing one does not stop the rest')
    end()
    assert.deepEqual(ran, ['now', 'lock'], 'ending twice does nothing')
  })
})
