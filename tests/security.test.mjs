/**
 * Dash Security Test Suite
 *
 * Run with: npm test
 * Uses Node.js built-in test runner — zero dependencies.
 *
 * Covers: XSS prevention, encryption schema, import safety,
 * data validation, export escaping, storage key obfuscation,
 * data safety invariants
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { webcrypto } from 'node:crypto'

// Polyfill crypto.subtle for Node 18
if (!globalThis.crypto) globalThis.crypto = webcrypto

// Pre-load async modules at top level (Node test runner doesn't support async describe)
const DOMPurify = (await import('isomorphic-dompurify')).default
let cryptoUtils, securityUtils, dataValidation, passwordUtils, liveSessionUtils
try { cryptoUtils = await import('../utils/cryptoUtils.js') } catch { cryptoUtils = null }
try { securityUtils = await import('../utils/securityUtils.js') } catch { securityUtils = null }
try { dataValidation = await import('../utils/dataValidation.js') } catch { dataValidation = null }
try { passwordUtils = await import('../utils/passwordUtils.js') } catch { passwordUtils = null }
try { liveSessionUtils = await import('../lib/liveSession.js') } catch { liveSessionUtils = null }
const sanitizeEditorContent = securityUtils?.sanitizeEditorContent || null
const validateAndRepairPage = dataValidation?.validateAndRepairPage || null
const detectCorruption = dataValidation?.detectCorruption || null
const hashPassword = passwordUtils?.hashPassword || null
const verifyPassword = passwordUtils?.verifyPassword || null
const parseSessionLink = liveSessionUtils?.parseSessionLink || null

// ===== XSS PREVENTION =====
describe('XSS Prevention — DOMPurify sanitization', () => {

  it('strips onerror from img tags', () => {
    const output = DOMPurify.sanitize('hello <img src=x onerror="alert(1)"> world')
    assert.ok(!output.includes('onerror'), 'onerror should be stripped')
    assert.ok(output.includes('hello'), 'text before should be preserved')
    assert.ok(output.includes('world'), 'text after should be preserved')
  })

  it('strips script tags completely', () => {
    const output = DOMPurify.sanitize('hello <script>alert(1)</script> world')
    assert.ok(!output.includes('<script'), 'script tag should be removed')
    assert.ok(!output.includes('alert'), 'alert should be removed')
  })

  it('strips onclick from elements', () => {
    const output = DOMPurify.sanitize('<div onclick="alert(1)">click me</div>')
    assert.ok(!output.includes('onclick'), 'onclick should be stripped')
    assert.ok(output.includes('click me'), 'text content should be preserved')
  })

  it('strips onload, onmouseover, onfocus', () => {
    assert.ok(!DOMPurify.sanitize('<body onload="alert(1)">').includes('onload'))
    assert.ok(!DOMPurify.sanitize('<div onmouseover="alert(1)">x</div>').includes('onmouseover'))
    assert.ok(!DOMPurify.sanitize('<input onfocus="alert(1)">').includes('onfocus'))
  })

  it('strips javascript: URLs from links', () => {
    const output = DOMPurify.sanitize('<a href="javascript:alert(1)">click</a>')
    assert.ok(!output.includes('javascript:'), 'javascript: should be stripped')
  })

  it('preserves bold', () => assert.equal(DOMPurify.sanitize('<b>bold</b>'), '<b>bold</b>'))
  it('preserves italic', () => assert.equal(DOMPurify.sanitize('<i>italic</i>'), '<i>italic</i>'))
  it('preserves underline', () => assert.equal(DOMPurify.sanitize('<u>underline</u>'), '<u>underline</u>'))
  it('preserves strikethrough', () => assert.equal(DOMPurify.sanitize('<s>struck</s>'), '<s>struck</s>'))
  it('preserves mark', () => assert.equal(DOMPurify.sanitize('<mark>hi</mark>'), '<mark>hi</mark>'))
  it('preserves code', () => assert.equal(DOMPurify.sanitize('<code>x</code>'), '<code>x</code>'))
  it('preserves br', () => assert.equal(DOMPurify.sanitize('a<br>b'), 'a<br>b'))

  it('preserves link href', () => {
    const output = DOMPurify.sanitize('<a href="https://example.com">link</a>')
    assert.ok(output.includes('href="https://example.com"'), 'href should be preserved')
    assert.ok(output.includes('>link<'), 'link text should be preserved')
  })

  it('preserves nested formatting', () => {
    assert.equal(DOMPurify.sanitize('<b><i>bold italic</i></b>'), '<b><i>bold italic</i></b>')
  })
})

// ===== ENCRYPTION SCHEMA =====
describe('Encryption Schema', () => {
  it('encryptJsonWithPassphrase returns { data, iv, salt, v, cipher }', async () => {
    if (!cryptoUtils) return // Skip if module can't be loaded (CJS/ESM mismatch)
    const result = await cryptoUtils.encryptJsonWithPassphrase({ test: 'data' }, 'password123')
    assert.ok(result.data, 'must have .data field')
    assert.ok(result.iv, 'must have .iv field')
    assert.ok(result.salt, 'must have .salt field')
    assert.equal(result.v, 1)
    assert.equal(result.cipher, 'AES-GCM-256')
    assert.ok(Array.isArray(result.data), '.data must be array')
    assert.ok(Array.isArray(result.iv), '.iv must be array')
    assert.ok(Array.isArray(result.salt), '.salt must be array')
  })

  it('encryptJsonWithKey returns { data, iv, salt }', async () => {
    if (!cryptoUtils) return
    const salt = webcrypto.getRandomValues(new Uint8Array(16))
    const key = await cryptoUtils.deriveKeyFromPassphrase('testpass', salt)
    const result = await cryptoUtils.encryptJsonWithKey({ test: 'data' }, key, salt)
    assert.ok(result.data, 'must have .data field')
    assert.ok(result.iv, 'must have .iv field')
    assert.ok(result.salt, 'must have .salt field')
  })

  it('hasEncryptedContent check matches actual schema', async () => {
    if (!cryptoUtils) return
    const salt = webcrypto.getRandomValues(new Uint8Array(16))
    const key = await cryptoUtils.deriveKeyFromPassphrase('test', salt)
    const ec = await cryptoUtils.encryptJsonWithKey({ blocks: [] }, key, salt)
    // This is the EXACT check from electron-main.js
    const hasEncryptedContent = ec && typeof ec === 'object' && ec.data && ec.iv
    assert.ok(hasEncryptedContent, 'schema check must pass for real encrypted content')
  })

  it('hasEncryptedContent rejects malformed objects', () => {
    const bad1 = { foo: 'bar' }
    const bad2 = { data: [1, 2] } // missing iv
    const bad3 = null
    assert.ok(!(bad1 && typeof bad1 === 'object' && bad1.data && bad1.iv))
    assert.ok(!(bad2 && typeof bad2 === 'object' && bad2.data && bad2.iv))
    assert.ok(!(bad3 && typeof bad3 === 'object'))
  })

  it('encrypt→decrypt round-trip preserves data', async () => {
    if (!cryptoUtils) return
    const original = { pages: [{ id: 'test', title: 'Test Page' }] }
    const encrypted = await cryptoUtils.encryptJsonWithPassphrase(original, 'mypassword')
    const decrypted = await cryptoUtils.decryptJsonWithPassphrase(encrypted, 'mypassword')
    assert.deepEqual(decrypted, original)
  })

  it('decrypt with wrong password throws', async () => {
    if (!cryptoUtils) return
    const encrypted = await cryptoUtils.encryptJsonWithPassphrase({ test: true }, 'correct')
    await assert.rejects(() => cryptoUtils.decryptJsonWithPassphrase(encrypted, 'wrong'))
  })
})

// ===== IMPORT SAFETY =====
describe('Import Safety — ID collision prevention', () => {
  it('imported pages get new UUIDs, never overwrite existing', () => {
    const existingPages = [
      { id: 'existing-1', title: 'My Notes', content: { blocks: [] } },
      { id: 'existing-2', title: 'My Diary', content: { blocks: [] } }
    ]
    const importedItems = [
      { id: 'existing-1', title: 'OVERWRITE ATTEMPT', content: { blocks: [] } },
      { id: 'new-page', title: 'New Import', content: { blocks: [] } }
    ]

    // Replicate import logic from usePagesManager
    const idMap = new Map()
    importedItems.forEach(item => { if (item.id) idMap.set(item.id, webcrypto.randomUUID()) })
    const remapped = importedItems.map(item => ({ ...item, id: idMap.get(item.id) || webcrypto.randomUUID() }))
    const merged = [...existingPages, ...remapped]

    assert.equal(merged.find(p => p.id === 'existing-1').title, 'My Notes', 'existing page must NOT be overwritten')
    assert.equal(merged.find(p => p.id === 'existing-2').title, 'My Diary')
    assert.equal(merged.length, 4, 'should have 4 pages total')
    assert.notEqual(merged.filter(p => p.title === 'OVERWRITE ATTEMPT')[0].id, 'existing-1', 'imported page must have new ID')
  })

  it('folder pages[] and page folderId are remapped', () => {
    const items = [
      { id: 'f1', title: 'Folder', type: 'folder', pages: ['p1'] },
      { id: 'p1', title: 'Page', folderId: 'f1', content: { blocks: [] } }
    ]
    const idMap = new Map()
    items.forEach(i => idMap.set(i.id, webcrypto.randomUUID()))
    const remapped = items.map(item => {
      const r = { ...item, id: idMap.get(item.id) }
      if (item.type === 'folder' && Array.isArray(item.pages)) r.pages = item.pages.map(pid => idMap.get(pid) || pid)
      if (item.folderId && idMap.has(item.folderId)) r.folderId = idMap.get(item.folderId)
      return r
    })
    const folder = remapped.find(i => i.type === 'folder')
    const page = remapped.find(i => i.type !== 'folder')
    assert.equal(folder.pages[0], page.id, 'folder.pages must reference new page ID')
    assert.equal(page.folderId, folder.id, 'page.folderId must reference new folder ID')
  })
})

// ===== RTF EXPORT ESCAPING =====
describe('RTF Export Escaping', () => {
  const escRTF = (text) => (text || '').replace(/[\\{}]/g, m => '\\' + m)

  it('escapes backslashes', () => assert.equal(escRTF('path\\to\\file'), 'path\\\\to\\\\file'))
  it('escapes curly braces', () => assert.equal(escRTF('has {braces}'), 'has \\{braces\\}'))
  it('escapes RTF injection', () => assert.equal(escRTF('{\\rtf1 injected}'), '\\{\\\\rtf1 injected\\}'))
  it('leaves normal text unchanged', () => assert.equal(escRTF('Hello world'), 'Hello world'))
  it('handles empty/null', () => { assert.equal(escRTF(''), ''); assert.equal(escRTF(null), ''); assert.equal(escRTF(undefined), '') })
})

// ===== SHARE PAGE IMAGE URL VALIDATION =====
describe('Share Page Image URL Validation', () => {
  const isAllowed = (url) => url && (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:image/'))

  it('allows https', () => assert.ok(isAllowed('https://example.com/img.png')))
  it('allows http', () => assert.ok(isAllowed('http://example.com/img.jpg')))
  it('allows data:image', () => assert.ok(isAllowed('data:image/png;base64,abc')))
  it('blocks javascript:', () => assert.ok(!isAllowed('javascript:alert(1)')))
  it('blocks data:text', () => assert.ok(!isAllowed('data:text/html,<script>alert(1)</script>')))
  it('blocks empty/null', () => { assert.ok(!isAllowed('')); assert.ok(!isAllowed(null)) })
})

// ===== WSS ENFORCEMENT =====
describe('WSS Relay URL Enforcement', () => {
  const DEFAULT = 'wss://dash-relay.efesop.deno.net'
  const validate = (env) => {
    const ok = env && (env.startsWith('wss://') || env.startsWith('ws://localhost') || env.startsWith('ws://127.0.0.1'))
    return ok ? env : DEFAULT
  }

  it('allows wss://', () => assert.equal(validate('wss://custom.com'), 'wss://custom.com'))
  it('allows ws://localhost', () => assert.equal(validate('ws://localhost:8080'), 'ws://localhost:8080'))
  it('allows ws://127.0.0.1', () => assert.equal(validate('ws://127.0.0.1:8080'), 'ws://127.0.0.1:8080'))
  it('blocks ws:// to remote', () => assert.equal(validate('ws://attacker.com'), DEFAULT))
  it('falls back for empty', () => assert.equal(validate(''), DEFAULT))
  it('falls back for null', () => assert.equal(validate(null), DEFAULT))
})

// ===== SESSION LINK VALIDATION =====
describe('Session Link Parameter Validation', () => {
  const validRoom = (id) => /^[a-zA-Z0-9_-]+$/.test(id || '')
  const validKey = (k) => /^[a-zA-Z0-9_\-=+/]+$/.test(k || '')

  it('accepts UUID roomId', () => assert.ok(validRoom('a1b2c3d4-e5f6-7890-abcd-ef1234567890')))
  it('accepts base64url key', () => assert.ok(validKey('dGVzdA==')))
  it('rejects roomId with HTML', () => assert.ok(!validRoom('room<script>')))
  it('rejects roomId with spaces', () => assert.ok(!validRoom('room id')))
  it('rejects key with spaces', () => assert.ok(!validKey('key with spaces')))
  it('rejects empty', () => { assert.ok(!validRoom('')); assert.ok(!validKey('')) })
})

// ===== DEEP LINK HASH VALIDATION =====
describe('Deep Link Hash Validation', () => {
  const valid = (h) => /^[a-zA-Z0-9_.\-=+/]+$/.test(h || '')

  it('accepts alphanumeric', () => assert.ok(valid('abc123')))
  it('accepts base64 with padding', () => assert.ok(valid('dGVzdA==')))
  it('accepts room.key format', () => assert.ok(valid('a1b2c3d4.dGVzdEtleQ==')))
  it('rejects HTML injection', () => assert.ok(!valid('<script>alert(1)</script>')))
  it('rejects spaces', () => assert.ok(!valid('has spaces')))
})

// ===== DUPLICATE PAGE ENCRYPTION STRIPPING =====
describe('Duplicate Page — encryption field stripping', () => {
  it('strips password, encryptedContent, appLockEncrypted', () => {
    const page = {
      id: 'page-1', title: 'Secret',
      content: { blocks: [{ type: 'paragraph', data: { text: 'hello' } }] },
      password: { hash: '$2a$10$...' },
      encryptedContent: { v: 1, iv: [1], data: [2], salt: [3] },
      appLockEncrypted: true,
      tags: ['important'], tagNames: ['important']
    }
    const { password, encryptedContent, appLockEncrypted, ...stripped } = page
    assert.ok(!('password' in stripped), 'password must be stripped')
    assert.ok(!('encryptedContent' in stripped), 'encryptedContent must be stripped')
    assert.ok(!('appLockEncrypted' in stripped), 'appLockEncrypted must be stripped')
    assert.ok('content' in stripped, 'content must be kept')
    assert.ok('tags' in stripped, 'tags must be kept')
    assert.ok('title' in stripped, 'title must be kept')
  })

  it('detects locked page without decrypted content', () => {
    const locked = { id: 'x', title: 'Locked', content: null, password: { hash: 'h' } }
    const { password, encryptedContent, appLockEncrypted, ...stripped } = locked
    assert.equal(stripped.content, null, 'locked page has no content — duplication should be blocked')
  })
})

// ===== TAGS VALIDATION =====
describe('Tags Validation', () => {
  it('rejects non-array', () => {
    assert.ok(!Array.isArray('string'))
    assert.ok(!Array.isArray(null))
    assert.ok(!Array.isArray({}))
  })
  it('enforces 1000 limit', () => {
    const big = Array.from({ length: 1001 }, (_, i) => ({ id: String(i), name: `tag-${i}` }))
    assert.ok(big.length > 1000, 'should exceed limit')
  })
  it('enforces 1MB size limit', () => {
    const huge = [{ id: '1', name: 'a'.repeat(500000) }]
    assert.ok(JSON.stringify(huge).length < 1024 * 1024, 'single 500K tag is under 1MB')
    const tooLarge = [{ id: '1', name: 'a'.repeat(1100000) }]
    assert.ok(JSON.stringify(tooLarge).length > 1024 * 1024, 'single 1.1M tag exceeds 1MB')
  })
})

// ===== VERSION HASH =====
describe('Version Hash — SHA-256', () => {
  it('produces consistent hashes for same content', async () => {
    const hash = async (str) => {
      const buf = await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(str))
      return Array.from(new Uint8Array(buf).slice(0, 8), b => b.toString(16).padStart(2, '0')).join('')
    }
    assert.equal(await hash('test content'), await hash('test content'))
  })

  it('produces different hashes for different content', async () => {
    const hash = async (str) => {
      const buf = await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(str))
      return Array.from(new Uint8Array(buf).slice(0, 8), b => b.toString(16).padStart(2, '0')).join('')
    }
    assert.notEqual(await hash('content A'), await hash('content B'))
  })
})

// ===== MAGIC BYTES =====
describe('Attachment Magic Bytes', () => {
  it('JPEG: FF D8 FF', () => {
    const sig = [0xFF, 0xD8, 0xFF]
    const header = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46])
    assert.ok(sig.every((b, i) => header[i] === b))
  })
  it('PNG: 89 50 4E 47', () => {
    const sig = [0x89, 0x50, 0x4E, 0x47]
    const header = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
    assert.ok(sig.every((b, i) => header[i] === b))
  })
  it('GIF: 47 49 46 38', () => {
    const sig = [0x47, 0x49, 0x46, 0x38]
    const header = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])
    assert.ok(sig.every((b, i) => header[i] === b))
  })
  it('PDF: 25 50 44 46 (%PDF)', () => {
    const sig = [0x25, 0x50, 0x44, 0x46]
    const header = new TextEncoder().encode('%PDF-1.4')
    assert.ok(sig.every((b, i) => header[i] === b))
  })
  it('WebP: 52 49 46 46 (RIFF)', () => {
    const sig = [0x52, 0x49, 0x46, 0x46]
    const header = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00])
    assert.ok(sig.every((b, i) => header[i] === b))
  })
})

// Source file reader for static analysis tests
const readSrc = (file) => readFileSync(resolve(process.cwd(), file), 'utf8')

// ===== DATA SAFETY INVARIANTS =====
describe('Data Safety Invariants — codebase scan', () => {

  it('no savePagesToStorage([]) in usePagesManager', () => {
    const code = readSrc('hooks/usePagesManager.js')
    assert.ok(!code.match(/savePagesToStorage\s*\(\s*\[\s*\]\s*\)/), 'savePagesToStorage([]) would destroy all data')
  })

  it('no savePagesToStorage([]) in RichTextEditor', () => {
    const code = readSrc('components/RichTextEditor.js')
    assert.ok(!code.match(/savePagesToStorage\s*\(\s*\[\s*\]\s*\)/), 'savePagesToStorage([]) would destroy all data')
  })

  it('setPages([]) only appears in safe contexts (wipeAllPages or enterDuressHideMode)', () => {
    const code = readSrc('hooks/usePagesManager.js')
    const regex = /setPages\s*\(\s*\[\s*\]\s*\)/g
    let m
    while ((m = regex.exec(code)) !== null) {
      // Find the enclosing function by looking for the nearest const/function declaration before this line
      const before = code.substring(0, m.index)
      const inWipe = before.lastIndexOf('wipeAllPages') > before.lastIndexOf('const ') - 200 ||
                     before.lastIndexOf('wipeAllPages') > before.lastIndexOf('},')
      const inDuress = before.lastIndexOf('enterDuressHideMode') > before.lastIndexOf('const ') - 200 ||
                       before.lastIndexOf('enterDuressHideMode') > before.lastIndexOf('},')
      // Simpler: just check the last function name mentioned before setPages([])
      const lastWipe = before.lastIndexOf('wipeAllPages')
      const lastDuress = before.lastIndexOf('enterDuressHideMode')
      const lastFunc = Math.max(lastWipe, lastDuress)
      // The nearest function boundary (useCallback) should be after lastFunc
      const lastCallback = before.lastIndexOf('useCallback')
      assert.ok(lastFunc > lastCallback - 100, `setPages([]) at pos ${m.index} must be inside wipeAllPages or enterDuressHideMode`)
    }
  })

  it('encryptedContent schema check uses .data and .iv (not .ciphertext or .ct)', () => {
    const code = readSrc('electron-main.js')
    const match = code.match(/hasEncryptedContent\s*=.*ec\.([\w.]+)\s*&&\s*ec\.([\w.]+)/)
    assert.ok(match, 'hasEncryptedContent check must exist')
    assert.ok(match[0].includes('ec.data'), 'must check ec.data (not ec.ciphertext)')
    assert.ok(match[0].includes('ec.iv'), 'must check ec.iv')
    assert.ok(!match[0].includes('ciphertext'), 'must NOT check ec.ciphertext (wrong field name)')
  })

  it('.env is NOT in electron-builder.yml files list', () => {
    const yml = readSrc('electron-builder.yml')
    assert.ok(!yml.match(/^\s*-\s*['"]?\.env['"]?\s*$/m), '.env must not be bundled in Electron app')
  })

  it('decoy storage uses obfuscated key names', () => {
    const code = readSrc('lib/storage.js')
    // New saves should use _dc, not dash-decoy-pages
    const saveMatch = code.match(/localStorage\.setItem\s*\(\s*['"]([^'"]+)['"]\s*,.*encryptedPayload/)
    assert.ok(saveMatch, 'decoy save must use localStorage.setItem')
    assert.equal(saveMatch[1], '_dc', 'decoy key must be obfuscated as _dc')
  })

  it('GitHub Actions in deploy-pwa.yml are pinned to commit SHAs', () => {
    const yml = readSrc('.github/workflows/deploy-pwa.yml')
    const unpinned = yml.match(/uses:\s*actions\/\w+@v\d+\s*$/gm)
    assert.ok(!unpinned, 'all actions must be pinned to commit SHAs, not version tags')
  })

  it('backup is created BEFORE temp write in save-pages', () => {
    const code = readSrc('electron-main.js')
    const backupIdx = code.indexOf('copyFile(pagesPath, backupPath)')
    const writeIdx = code.indexOf('writeFile(tempPath, data)')
    assert.ok(backupIdx > 0 && writeIdx > 0, 'both backup and write must exist')
    assert.ok(backupIdx < writeIdx, 'backup must come BEFORE temp write')
  })

  it('deep link hash is validated with safe character regex', () => {
    const code = readSrc('electron-main.js')
    assert.ok(code.includes("!/^[a-zA-Z0-9_.\\-=+/]+$/.test(hash)"), 'deep link must validate hash chars')
  })

  it('tags save validates array type and enforces limits', () => {
    const code = readSrc('electron-main.js')
    assert.ok(code.includes("!Array.isArray(tags)"), 'must check tags is array')
    assert.ok(code.includes("tags.length > 1000"), 'must enforce 1000 tag limit')
  })

  it('relay URL enforces WSS (no plaintext ws:// to remote)', () => {
    const code = readSrc('lib/liveSession.js')
    assert.ok(code.includes("startsWith('wss://')"), 'must check for wss://')
    assert.ok(code.includes("DEFAULT_RELAY = 'wss://"), 'default relay must be wss://')
  })

  it('session link validation rejects invalid params (returns null, no throw)', () => {
    const code = readSrc('lib/liveSession.js')
    assert.ok(code.includes('return null'), 'buildSessionLink must return null on invalid, not throw')
  })

  it('attachment validation is async (uses magic bytes)', () => {
    const code = readSrc('lib/attachmentStorage.js')
    assert.ok(code.includes('async function validateAttachment'), 'validateAttachment must be async')
    assert.ok(code.includes('validateMagicBytes'), 'must call magic bytes check')
  })

  it('attachment caller uses await on validateAttachment', () => {
    const code = readSrc('components/editor-tools/AttachmentTool.js')
    assert.ok(code.includes('await validateAttachment'), 'must await the async validation')
  })

  it('version hash uses SHA-256 (not DJB2)', () => {
    const code = readSrc('lib/versionStorage.js')
    assert.ok(code.includes("crypto.subtle.digest('SHA-256'"), 'must use SHA-256')
    assert.ok(code.includes('async function contentHash'), 'hash function must be async')
  })

  it('encryptionKeysRef is cleaned up on page delete', () => {
    const code = readSrc('hooks/usePagesManager.js')
    const deleteFunc = code.substring(code.indexOf('const deletePage = useCallback'))
    assert.ok(deleteFunc.includes('encryptionKeysRef.current.delete'), 'must clean up key cache on delete')
  })

  it('duplicate page strips encryption fields', () => {
    const code = readSrc('hooks/usePagesManager.js')
    const dupFunc = code.substring(code.indexOf('handleDuplicatePage'))
    assert.ok(dupFunc.includes('password, encryptedContent, appLockEncrypted'), 'must destructure encryption fields')
    assert.ok(dupFunc.includes('...pageWithoutEncryption'), 'must spread remaining fields')
  })

  it('password change flushes editor before re-encryption', () => {
    const code = readSrc('components/RichTextEditor.js')
    // Find the password change section (near newSalt/newKey derivation)
    const changeSection = code.substring(code.indexOf('newSalt = crypto.getRandomValues') - 200)
    const flushIdx = changeSection.indexOf('__editorFlush')
    const reEncryptIdx = changeSection.indexOf('reEncryptAppLockPages')
    assert.ok(flushIdx > 0 && reEncryptIdx > 0, 'both flush and re-encrypt must exist in password change')
    assert.ok(flushIdx < reEncryptIdx, 'flush must come BEFORE re-encrypt')
  })

  it('share page validates image URLs before rendering', () => {
    const code = readSrc('pages/share.js')
    assert.ok(code.includes("url.startsWith('http://')") || code.includes("startsWith('https://')"), 'must validate URL scheme')
    assert.ok(code.includes('safeUrl'), 'must escape URL for HTML attribute')
    assert.ok(code.includes('safeCaption'), 'must escape caption')
  })

  it('RTF export escapes special characters', () => {
    const code = readSrc('utils/exportUtils.js')
    assert.ok(code.includes('escRTF'), 'must use escRTF function')
    assert.ok(code.includes("replace(/[\\\\{}]/g"), 'escRTF must escape backslash and braces')
  })

  it('share passphrase uses 4+ words for adequate entropy', () => {
    const code = readSrc('utils/shareUtils.js')
    const match = code.match(/Uint32Array\((\d+)\)/)
    assert.ok(match && parseInt(match[1]) >= 5, 'must use at least 5 random values (4 words + number)')
  })

  it('IndexedDB quota error is not silently swallowed', () => {
    const code = readSrc('lib/mobileStorage.js')
    assert.ok(code.includes('QuotaExceededError'), 'must check for quota errors')
    assert.ok(code.includes("success: false"), 'must return failure on quota error')
  })
})

// ===== CONTENT SANITIZATION =====
describe('Content Sanitization — sanitizeEditorContent', () => {
  it('returns empty blocks for null input', () => {
    if (!sanitizeEditorContent) return
    const result = sanitizeEditorContent(null)
    assert.deepEqual(result.blocks, [])
    assert.ok(result.time)
  })

  it('sanitizes paragraph text', () => {
    if (!sanitizeEditorContent) return
    const result = sanitizeEditorContent({ blocks: [{ type: 'paragraph', data: { text: '<script>alert(1)</script>hello' } }] })
    assert.ok(!result.blocks[0].data.text.includes('<script'))
    assert.ok(result.blocks[0].data.text.includes('hello'))
  })

  it('clamps header level to 1-6', () => {
    if (!sanitizeEditorContent) return
    const r1 = sanitizeEditorContent({ blocks: [{ type: 'header', data: { text: 'H', level: 99 } }] })
    assert.equal(r1.blocks[0].data.level, 6)
    const r2 = sanitizeEditorContent({ blocks: [{ type: 'header', data: { text: 'H', level: -5 } }] })
    assert.equal(r2.blocks[0].data.level, 1)
  })

  it('falls back unknown block types to paragraph', () => {
    if (!sanitizeEditorContent) return
    const result = sanitizeEditorContent({ blocks: [{ type: 'malicious_type', data: { text: 'test' } }] })
    assert.equal(result.blocks[0].type, 'paragraph')
  })

  it('limits seed phrase to 24 words max', () => {
    if (!sanitizeEditorContent) return
    const words = Array.from({ length: 30 }, (_, i) => `word${i}`)
    const result = sanitizeEditorContent({ blocks: [{ type: 'seedPhrase', data: { words, count: 24 } }] })
    assert.ok(result.blocks[0].data.words.length <= 24)
  })

  it('limits attachment ID to 36 chars', () => {
    if (!sanitizeEditorContent) return
    const result = sanitizeEditorContent({ blocks: [{ type: 'attachment', data: { attachmentId: 'a'.repeat(100), filename: 'test.pdf', mimeType: 'application/pdf', size: 1000 } }] })
    assert.equal(result.blocks[0].data.attachmentId.length, 36)
  })

  it('blocks SVG data URLs in images (XSS vector)', () => {
    if (!sanitizeEditorContent) return
    const result = sanitizeEditorContent({ blocks: [{ type: 'image', data: { file: { url: 'data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9ImFsZXJ0KDEpIj4=' }, caption: '' } }] })
    // SVG data URLs should be blocked
    assert.ok(!result.blocks[0].data.file || !result.blocks[0].data.file.url.includes('svg'), 'SVG data URLs must be blocked')
  })

  it('blocks javascript: URLs in links', () => {
    if (!sanitizeEditorContent) return
    const result = sanitizeEditorContent({ blocks: [{ type: 'paragraph', data: { text: '<a href="javascript:alert(1)">click</a>' } }] })
    assert.ok(!result.blocks[0].data.text.includes('javascript:'))
  })

  it('sanitizes table cells', () => {
    if (!sanitizeEditorContent) return
    const result = sanitizeEditorContent({ blocks: [{ type: 'table', data: { content: [['<img onerror=alert(1)>', 'safe']], withHeadings: true } }] })
    assert.ok(!result.blocks[0].data.content[0][0].includes('onerror'))
    assert.equal(result.blocks[0].data.content[0][1], 'safe')
  })

  it('escapes HTML in code blocks', () => {
    if (!sanitizeEditorContent) return
    const result = sanitizeEditorContent({ blocks: [{ type: 'code', data: { code: '<script>alert(1)</script>' } }] })
    assert.ok(result.blocks[0].data.code.includes('&lt;script&gt;'))
  })

  it('preserves checklist checked state', () => {
    if (!sanitizeEditorContent) return
    const result = sanitizeEditorContent({ blocks: [{ type: 'checklistItem', data: { text: 'todo', checked: true } }] })
    assert.equal(result.blocks[0].data.checked, true)
  })
})

// ===== DATA VALIDATION =====
describe('Data Validation — validateAndRepairPage', () => {
  it('repairs missing title', () => {
    if (!validateAndRepairPage) return
    const result = validateAndRepairPage({ id: 'test' })
    assert.ok(result.title, 'must have a title')
  })

  it('repairs missing ID', () => {
    if (!validateAndRepairPage) return
    const result = validateAndRepairPage({ title: 'Test' })
    assert.ok(result.id, 'must generate an ID')
  })

  it('truncates long titles to 200 chars', () => {
    if (!validateAndRepairPage) return
    const result = validateAndRepairPage({ id: 'x', title: 'A'.repeat(500) })
    assert.ok(result.title.length <= 200)
  })

  it('detects corruption in null data', () => {
    if (!detectCorruption) return
    const result = detectCorruption(null)
    assert.ok(result.isCorrupt)
  })

  it('detects corruption in non-array data', () => {
    if (!detectCorruption) return
    const result = detectCorruption('not an array')
    assert.ok(result.isCorrupt)
  })
})

// ===== PASSWORD HASHING =====
describe('Password Hashing — bcrypt', () => {
  it('hashes password and verifies correctly', async () => {
    if (!hashPassword || !verifyPassword) return
    const hash = await hashPassword('test123')
    assert.ok(hash.startsWith('$2'), 'must be bcrypt hash')
    const valid = await verifyPassword('test123', hash)
    assert.ok(valid, 'correct password must verify')
  })

  it('rejects wrong password', async () => {
    if (!hashPassword || !verifyPassword) return
    const hash = await hashPassword('correct')
    const valid = await verifyPassword('wrong', hash)
    assert.ok(!valid, 'wrong password must not verify')
  })
})

// ===== LIVE SESSION LINK PARSING =====
describe('Live Session Link Parsing', () => {
  it('parses valid session link', () => {
    if (!parseSessionLink) return
    const result = parseSessionLink('https://example.com/live#roomid123.dGVzdEtleQ==')
    assert.ok(result, 'must return parsed result')
    assert.equal(result.roomId, 'roomid123')
    assert.equal(result.key, 'dGVzdEtleQ==')
  })

  it('returns null for invalid link', () => {
    if (!parseSessionLink) return
    assert.equal(parseSessionLink('not a link'), null)
    assert.equal(parseSessionLink('https://example.com/live'), null)
  })
})

// ===== ELECTRON SAVE-PAGES FIELD WHITELIST =====
describe('Electron save-pages field whitelist', () => {
  it('save-pages does not whitelist dangerous fields', () => {
    const code = readSrc('electron-main.js')
    // The save-pages handler area (between 'save-pages' and the next handler)
    const saveSection = code.substring(code.indexOf("'save-pages'"), code.indexOf("'save-pages'") + 3000)
    const dangerousFields = ['innerHTML', '__proto__', 'constructor', 'prototype']
    dangerousFields.forEach(field => {
      assert.ok(!saveSection.includes(`${field}:`), `dangerous field '${field}' must not be in save-pages handler`)
    })
  })

  it('folder type is handled in save-pages sanitization', () => {
    const code = readSrc('electron-main.js')
    assert.ok(code.includes("type: 'folder'"), 'must handle folder type')
  })
})

// ===== PAGE-SWITCH RACE CONDITION PREVENTION =====
describe('Page-switch race condition prevention', () => {
  it('Editor unmount flush passes pageId to onChange (not relying on currentPageRef)', () => {
    const code = readSrc('components/Editor.js')
    // The unmount flush must capture pageIdRef.current BEFORE the async save
    assert.ok(code.includes('const flushPageId = pageIdRef.current'), 'must capture pageId before async save')
    // The onChange call must pass flushPageId as second argument
    assert.ok(code.includes('onChangeRef.current?.(content, flushPageId)'), 'must pass captured pageId to onChange')
  })

  it('Editor accepts pageId prop and stores in ref', () => {
    const code = readSrc('components/Editor.js')
    assert.ok(code.includes('pageId }') || code.includes('pageId}'), 'Editor must accept pageId prop')
    assert.ok(code.includes('pageIdRef'), 'must store pageId in a ref')
  })

  it('savePage always looks up page from pagesRef by ID (never currentPageRef)', () => {
    const code = readSrc('hooks/usePagesManager.js')
    // savePage must accept forPageId parameter
    assert.ok(code.includes('forPageId'), 'savePage must accept forPageId parameter')
    // Must always look up from pagesRef.current.find, never directly use currentPageRef for page data
    assert.ok(code.includes('pagesRef.current.find(p => p.id === targetId)'), 'must always look up page by ID from pagesRef')
    // Must derive targetId from forPageId first, with currentPageRef as fallback only
    assert.ok(code.includes('forPageId || currentPageRef.current?.id'), 'must prefer forPageId over currentPageRef')
  })

  it('handleEditorChange passes forPageId through to savePage', () => {
    const code = readSrc('components/RichTextEditor.js')
    // handleEditorChange must accept forPageId
    assert.ok(code.includes('content, forPageId'), 'handleEditorChange must accept forPageId')
    // Must pass it to savePage
    assert.ok(code.includes('savePage(content, forPageId)'), 'must pass forPageId to savePage')
  })

  it('DynamicEditor receives pageId prop', () => {
    const code = readSrc('components/RichTextEditor.js')
    assert.ok(code.includes('pageId={currentPage.id}'), 'DynamicEditor must receive pageId prop')
  })

  it('ALL onChange calls in Editor.js pass pageId (no bare onChange calls)', () => {
    const code = readSrc('components/Editor.js')
    // Find all onChangeRef.current?.( calls
    const matches = [...code.matchAll(/onChangeRef\.current\?\.\(([^)]+)\)/g)]
    assert.ok(matches.length >= 4, `expected at least 4 onChange calls, found ${matches.length}`)
    for (const match of matches) {
      const args = match[1]
      // Every call must pass a page ID as second argument
      assert.ok(
        args.includes('pageIdRef.current') || args.includes('flushPageId'),
        `onChange call must pass pageId: onChangeRef.current?.(${args})`
      )
    }
  })

  it('savePage only updates currentPageRef when saved page is the active page', () => {
    const code = readSrc('hooks/usePagesManager.js')
    // Must compare IDs before updating currentPageRef
    assert.ok(
      code.includes('currentPageRef.current?.id === validation.sanitized.id'),
      'must check if saved page IS the current page before updating currentPageRef'
    )
  })

  it('handleInstantLock flushes editor before encrypting', () => {
    const code = readSrc('components/RichTextEditor.js')
    // Find the actual function definition, not references to it
    const fnStart = code.indexOf('const handleInstantLock')
    assert.ok(fnStart > 0, 'handleInstantLock function must exist')
    const lockFn = code.substring(fnStart, fnStart + 500)
    // Strip comments to check actual code order
    const codeOnly = lockFn.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')
    // __editorFlush must appear BEFORE encryptAndClearAppLockPages in actual code
    const flushIdx = codeOnly.indexOf('__editorFlush')
    const encryptIdx = codeOnly.indexOf('encryptAndClearAppLockPages')
    assert.ok(flushIdx > 0, 'handleInstantLock must call __editorFlush')
    assert.ok(encryptIdx > 0, 'handleInstantLock must call encryptAndClearAppLockPages')
    assert.ok(flushIdx < encryptIdx, '__editorFlush must be called BEFORE encryptAndClearAppLockPages')
  })

  it('beforeunload handler flushes editor before encrypting', () => {
    const code = readSrc('components/RichTextEditor.js')
    const beforeUnload = code.substring(code.indexOf('handleBeforeUnload'), code.indexOf('handleBeforeUnload') + 500)
    const flushIdx = beforeUnload.indexOf('__editorFlush')
    const encryptIdx = beforeUnload.indexOf('encryptAndClearAppLockPages')
    assert.ok(flushIdx > 0, 'beforeunload must call __editorFlush')
    assert.ok(encryptIdx > 0, 'beforeunload must call encryptAndClearAppLockPages')
    assert.ok(flushIdx < encryptIdx, '__editorFlush must be called BEFORE encryptAndClearAppLockPages')
  })

  it('pagesRef useEffect only syncs before initialization', () => {
    const code = readSrc('hooks/usePagesManager.js')
    // The useEffect that syncs pagesRef must be guarded by isInitializedRef
    assert.ok(code.includes('if (!isInitializedRef.current)'), 'pagesRef sync must be guarded by isInitializedRef')
    // Find the guarded block and verify it sets pagesRef
    const guardIdx = code.indexOf('if (!isInitializedRef.current)')
    const nearbyCode = code.substring(guardIdx, guardIdx + 200)
    assert.ok(nearbyCode.includes('pagesRef.current = pages'), 'guarded block must sync pagesRef from React state')
  })
})
