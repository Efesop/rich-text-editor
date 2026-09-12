/**
 * What a note stores when the editor saves it (lib/editorSave.js).
 *
 * The editor saves a note as soon as it opens, edited or not. That save used
 * to drop lastEdited, trashed, trashedAt and restoredAt: a note opened from
 * the quick switcher left Trash, and sync compared every opened note as if it
 * had never been edited. A save keeps the note's other fields, and moves
 * lastEdited only when the content changed.
 *
 * Run with: npm test
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

// Imported directly on purpose: a module that fails to load must fail this
// suite, not quietly skip it.
import { applyEditorSave, contentFingerprint } from '../lib/editorSave.js'
import { linkifyTableBlocks } from '../lib/markdownBlocks.js'
import { sanitizeEditorContent } from '../utils/securityUtils.js'
import { buildImageBlockData } from '../lib/imageAttachments.js'
import { applyPulledChanges } from '../lib/syncPull.js'
import { rebasePulledPages } from '../lib/syncRebase.js'

const T0 = Date.UTC(2026, 8, 1) // when the note was last edited
const LATER = T0 + 60 * 60 * 1000 // when it is opened
const HASH = '$2a$10$abcdefghijklmnopqrstuu'
const LEFT = { alignment: { alignment: 'left' } }
const CENTER = { alignment: { alignment: 'center' } }

const paragraph = (id, text, tunes) => ({ id, type: 'paragraph', data: { text }, ...(tunes ? { tunes } : {}) })
const content = (blocks, time = T0) => ({ time, blocks, version: '2.30.6' })
const texts = (page) => page.content.blocks.map(block => block.data.text)

function note (fields = {}) {
  return {
    id: 'note-1',
    title: 'Groceries',
    content: content([paragraph('b1', 'Milk'), paragraph('b2', 'Eggs')]),
    tags: [],
    tagNames: ['home'],
    createdAt: '2026-08-01T09:00:00.000Z',
    password: null,
    folderId: null,
    lastEdited: T0,
    ...fields
  }
}

// What the editor saves for content it loaded, at a later time: each block in
// the key order its tool writes (the sanitizer's), and a left alignment on
// every paragraph and heading that had none, which
// components/editor-tools/AlignmentTune.js saves by default.
function editorSaves (loaded) {
  const saved = sanitizeEditorContent({ ...structuredClone(loaded), time: LATER })
  saved.blocks = saved.blocks.map(block =>
    ['paragraph', 'header'].includes(block.type) && !block.tunes ? { ...block, tunes: LEFT } : block
  )
  return saved
}

// A note envelope as pullSince returns it. payloadTimestamp is when the
// writer queued the push, a little after its save.
const noteEnvelope = (payload, payloadTimestamp, authorDeviceId = 'device-phone') => ({
  envelopeType: 'note',
  resourceType: 'note',
  resourceId: payload.id,
  payload,
  version: 1,
  payloadTimestamp,
  uploadedAt: payloadTimestamp + 100,
  authorDeviceId
})

describe('applyEditorSave: opening a note is not an edit', () => {
  it('keeps lastEdited when the editor saves the note back unchanged', () => {
    const page = note()
    const saved = applyEditorSave(page, editorSaves(page.content), { now: LATER })
    assert.equal(saved.isValid, true)
    assert.equal(saved.edited, false)
    assert.equal(saved.sanitized.lastEdited, T0)
  })

  it('keeps lastEdited when the editor adds its default left alignment to paragraphs and headings', () => {
    const page = note({ content: content([paragraph('b1', 'Milk'), { id: 'h1', type: 'header', data: { text: 'Shopping', level: 2 } }]) })
    const saved = editorSaves(page.content)
    assert.deepEqual(saved.blocks.map(block => block.tunes), [LEFT, LEFT])
    const result = applyEditorSave(page, saved, { now: LATER })
    assert.equal(result.edited, false)
    assert.equal(result.sanitized.lastEdited, T0)
  })

  it('keeps lastEdited when the editor gives blocks without ids new ones', () => {
    const page = note({ content: content([{ type: 'paragraph', data: { text: 'Milk' } }, { type: 'paragraph', data: { text: 'Eggs' } }]) })
    const saved = applyEditorSave(page, editorSaves(content([paragraph('Zx81aB', 'Milk'), paragraph('Qw3rtY', 'Eggs')])), { now: LATER })
    assert.equal(saved.edited, false)
    assert.equal(saved.sanitized.lastEdited, T0)
  })

  it('keeps lastEdited when an old checklist block is split into items as the note opens', () => {
    const page = note({ content: content([{ id: 'c1', type: 'checklist', data: { items: [{ text: 'Milk', checked: true }, { text: 'Eggs', checked: false }] } }]) })
    const saved = applyEditorSave(page, editorSaves(content([
      { id: 'k1', type: 'checklistItem', data: { text: 'Milk', checked: true } },
      { id: 'k2', type: 'checklistItem', data: { text: 'Eggs', checked: false } }
    ])), { now: LATER })
    assert.equal(saved.edited, false)
    assert.equal(saved.sanitized.lastEdited, T0)
  })

  it('keeps lastEdited when the editor links a plain web address in a table', () => {
    const table = { id: 't1', type: 'table', data: { withHeadings: true, stretched: false, content: [['Shop', 'Site'], ['Market', 'https://example.com/market']] } }
    const page = note({ content: content([table]) })
    // What the desktop app saved for this table when the note opened: linking
    // adds rel, and the table tool drops it again when it saves.
    const linkedCell = '<a href="https://example.com/market" target="_blank">https://example.com/market</a>'
    const linked = { ...table, data: { ...table.data, content: [['Shop', 'Site'], ['Market', linkedCell]] } }
    const saved = applyEditorSave(page, editorSaves(content([linked])), { now: LATER })
    assert.equal(saved.edited, false)
    assert.equal(saved.sanitized.lastEdited, T0)
  })

  it("keeps lastEdited when a tool changes or drops a link's rel or target", () => {
    const page = note({ content: content([paragraph('b1', 'See <a href="https://example.com" target="_blank" rel="nofollow">the site</a>', LEFT)]) })
    for (const link of [
      '<a href="https://example.com" target="_blank" rel="noopener noreferrer">the site</a>',
      '<a href="https://example.com">the site</a>'
    ]) {
      const result = applyEditorSave(page, editorSaves(content([paragraph('b1', `See ${link}`, LEFT)])), { now: LATER })
      assert.equal(result.edited, false, link)
    }
  })

  it("keeps an imported note's date from the app it came from", () => {
    // An importer writes blocks in its own key order and without tunes, never
    // through the editor.
    const editedIn2019 = Date.UTC(2019, 4, 17)
    const imported = note({
      lastEdited: editedIn2019,
      content: content([
        { id: 'h1', type: 'header', data: { level: 2, text: 'Trip' } },
        { id: 'p1', type: 'paragraph', data: { text: 'Leave at <b>six</b>' } },
        { id: 'l1', type: 'bulletListItem', data: { text: 'Passport' } },
        { id: 'l2', type: 'bulletListItem', data: { indent: 1, text: 'Visa' } },
        { id: 'k1', type: 'checklistItem', data: { checked: false, text: 'Book the hotel' } },
        { id: 'q1', type: 'quote', data: { alignment: 'left', caption: '', text: 'Pack light' } },
        { id: 'c1', type: 'code', data: { encoding: 'raw', language: 'bash', code: 'ls -la' } },
        { id: 't1', type: 'table', data: { content: [['Day', 'City'], ['1', 'Lisbon']], stretched: false, withHeadings: true } },
        { id: 'd1', type: 'delimiter', data: {} }
      ])
    })
    const saved = applyEditorSave(imported, editorSaves(imported.content), { now: LATER })
    assert.equal(saved.edited, false)
    assert.equal(saved.sanitized.lastEdited, editedIn2019)
  })

  it('keeps lastEdited when a note whose photos moved to attachments is opened', () => {
    const photo = {
      id: 'img1',
      type: 'image',
      data: buildImageBlockData({ attachmentId: '0b6f3c1e-2d4a-4e5b-9c7d-8e9f0a1b2c3d', mimeType: 'image/jpeg', width: 1600, height: 1200, caption: 'Harbour', stretched: true })
    }
    const page = note({ content: content([paragraph('b1', 'Before the photo'), photo]) })
    const saved = applyEditorSave(page, editorSaves(page.content), { now: LATER })
    assert.equal(saved.edited, false)
    assert.equal(saved.sanitized.lastEdited, T0)
    assert.deepEqual(saved.sanitized.content.blocks[1], photo)
  })
})

describe('applyEditorSave: an edit moves lastEdited', () => {
  it('sets lastEdited to the time of the save when text changes', () => {
    const saved = applyEditorSave(note(), content([paragraph('b1', 'Oat milk'), paragraph('b2', 'Eggs')], LATER), { now: LATER })
    assert.equal(saved.edited, true)
    assert.equal(saved.sanitized.lastEdited, LATER)
  })

  it('counts added, removed, reordered and realigned blocks as edits', () => {
    const edits = {
      added: [paragraph('b1', 'Milk'), paragraph('b2', 'Eggs'), paragraph('b3', 'Bread')],
      removed: [paragraph('b1', 'Milk')],
      reordered: [paragraph('b2', 'Eggs'), paragraph('b1', 'Milk')],
      realigned: [paragraph('b1', 'Milk', CENTER), paragraph('b2', 'Eggs')]
    }
    for (const [edit, blocks] of Object.entries(edits)) {
      const saved = applyEditorSave(note(), content(blocks, LATER), { now: LATER })
      assert.equal(saved.edited, true, edit)
      assert.equal(saved.sanitized.lastEdited, LATER, edit)
    }
  })

  it('counts moving a centred paragraph back to the left as an edit', () => {
    const page = note({ content: content([paragraph('b1', 'Milk', CENTER)]) })
    const saved = applyEditorSave(page, content([paragraph('b1', 'Milk', LEFT)], LATER), { now: LATER })
    assert.equal(saved.edited, true)
    assert.equal(saved.sanitized.lastEdited, LATER)
  })

  it("counts a change to a link's address as an edit", () => {
    const page = note({ content: content([paragraph('b1', 'See <a href="https://example.com" target="_blank">the site</a>', LEFT)]) })
    const saved = applyEditorSave(page, content([paragraph('b1', 'See <a href="https://example.org" target="_blank">the site</a>', LEFT)], LATER), { now: LATER })
    assert.equal(saved.edited, true)
  })

  it('gives a note without lastEdited one on its first edit, and not before', () => {
    const page = note()
    delete page.lastEdited
    assert.equal('lastEdited' in applyEditorSave(page, editorSaves(page.content), { now: LATER }).sanitized, false)
    assert.equal(applyEditorSave(page, content([paragraph('b1', 'Milk')], LATER), { now: LATER }).sanitized.lastEdited, LATER)
  })

  it('hands back the fingerprint the next save of the note compares against', () => {
    const table = { id: 't1', type: 'table', data: { withHeadings: false, stretched: false, content: [['https://example.com']] } }
    const edited = content(linkifyTableBlocks([paragraph('b1', 'Milk', LEFT), table]), LATER)
    const first = applyEditorSave(note(), edited, { now: LATER })
    assert.equal(first.edited, true)
    assert.equal(first.fingerprint, contentFingerprint(first.sanitized.content))
    const savedAgain = { ...structuredClone(edited), time: LATER + 1000 }
    for (const storedFingerprint of [first.fingerprint, undefined]) {
      const second = applyEditorSave(first.sanitized, savedAgain, { now: LATER + 1000, storedFingerprint })
      assert.equal(second.edited, false)
      assert.equal(second.sanitized.lastEdited, LATER)
    }
  })
})

describe('applyEditorSave: the rest of the note survives', () => {
  it('keeps a note in Trash when it is opened, and when it is edited there', () => {
    const page = note({ trashed: true, trashedAt: T0 + 1000, trashedBy: 'device-phone' })
    for (const editorSaved of [editorSaves(page.content), content([paragraph('b1', 'Oat milk')], LATER)]) {
      const { sanitized } = applyEditorSave(page, editorSaved, { now: LATER })
      assert.equal(sanitized.trashed, true)
      assert.equal(sanitized.trashedAt, T0 + 1000)
      assert.equal(sanitized.trashedBy, 'device-phone')
    }
  })

  it('keeps restoredAt, the folder, tags, lock and self-destruct time', () => {
    const page = note({ restoredAt: T0 + 500, folderId: 'folder-trips', tagNames: ['home', 'weekly'], password: { hash: HASH }, selfDestructAt: LATER + 86400000 })
    const { sanitized } = applyEditorSave(page, content([paragraph('b1', 'Oat milk')], LATER), { now: LATER })
    for (const field of ['restoredAt', 'folderId', 'tagNames', 'password', 'selfDestructAt', 'createdAt', 'title']) {
      assert.deepEqual(sanitized[field], page[field], field)
    }
  })

  it('drops encryptedContent and appLockEncrypted, which belong to the content the save replaces', () => {
    const page = note({ password: { hash: HASH }, encryptedContent: { data: [1, 2], iv: [3], salt: [4] }, appLockEncrypted: true })
    const { sanitized } = applyEditorSave(page, content([paragraph('b1', 'Oat milk')], LATER), { now: LATER })
    assert.equal('encryptedContent' in sanitized, false)
    assert.equal('appLockEncrypted' in sanitized, false)
    assert.deepEqual(texts(sanitized), ['Oat milk'])
  })
})

describe('Sync after an editor save', () => {
  it('an older copy from another device still loses to a note that was only opened', async () => {
    const page = note()
    const opened = applyEditorSave(page, editorSaves(page.content), { now: LATER }).sanitized
    const olderCopy = noteEnvelope({ ...note(), title: 'Groceries (older copy)', lastEdited: T0 - 5000 }, T0 - 4000)
    const { applied, newPages } = await applyPulledChanges([opened], [olderCopy])
    assert.deepEqual(applied, [])
    assert.equal(newPages[0].title, 'Groceries')
  })

  it("this device's own earlier push, pulled back, does not undo typing saved after it", async () => {
    // The relay returns a device's own envelopes on its next pull. Typing
    // saved after that push is newer, and has not been pushed yet.
    const first = applyEditorSave(note(), content([paragraph('b1', 'Milk'), paragraph('b2', 'Eggs'), paragraph('b3', 'Bread')], LATER), { now: LATER }).sanitized
    const ownPush = noteEnvelope(first, LATER + 800, 'device-mac')
    const typedAfter = content([paragraph('b1', 'Milk'), paragraph('b2', 'Eggs'), paragraph('b3', 'Bread'), paragraph('b4', 'Butter')], LATER + 5000)
    const second = applyEditorSave(first, typedAfter, { now: LATER + 5000 }).sanitized
    const { applied, newPages } = await applyPulledChanges([second], [ownPush])
    assert.deepEqual(applied, [])
    assert.deepEqual(texts(newPages[0]), ['Milk', 'Eggs', 'Bread', 'Butter'])
  })

  it('an edit made on another device after the local one still wins', async () => {
    const local = applyEditorSave(note(), content([paragraph('b1', 'Oat milk')], LATER), { now: LATER }).sanitized
    const peer = noteEnvelope({ ...note(), content: content([paragraph('b1', 'Almond milk')], LATER + 9000), lastEdited: LATER + 9000 }, LATER + 9500)
    const { applied, newPages } = await applyPulledChanges([local], [peer])
    assert.deepEqual(applied, ['note-1'])
    assert.deepEqual(texts(newPages[0]), ['Almond milk'])
  })

  it('typing saved while a pull runs is kept over an older pulled copy', () => {
    const base = note()
    const pulled = { ...note(), content: content([paragraph('b1', 'From the phone')], LATER - 2000), lastEdited: LATER - 2000 }
    const typed = applyEditorSave(base, content([paragraph('b1', 'Typed on the Mac')], LATER), { now: LATER }).sanitized
    const { pages, keptLocal } = rebasePulledPages({ base: [base], pulled: [pulled], changedIds: ['note-1'], latest: [typed] })
    assert.deepEqual(keptLocal, ['note-1'])
    assert.deepEqual(texts(pages[0]), ['Typed on the Mac'])
  })

  it('a note opened from Trash stays there when a device that missed the trash sends an edit', async () => {
    const trashed = note({ trashed: true, trashedAt: T0 + 1000, lastEdited: T0 + 1000 })
    const opened = applyEditorSave(trashed, editorSaves(trashed.content), { now: LATER }).sanitized
    const staleEdit = noteEnvelope({ ...note(), content: content([paragraph('b1', 'Edited on the phone')], LATER + 1000), lastEdited: LATER + 1000 }, LATER + 1500)
    const { newPages } = await applyPulledChanges([opened], [staleEdit])
    assert.equal(newPages[0].trashed, true)
    assert.deepEqual(texts(newPages[0]), ['Milk', 'Eggs'])
  })
})
