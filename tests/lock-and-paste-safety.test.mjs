/**
 * Locked notes, App Lock and untrusted content: fixes from the October 2026
 * security scan. Most of this code lives in React hooks and the Electron main
 * process, which these tests can't run, so alongside the functional checks
 * they pin each fix in the source the same way security.test.mjs pins the
 * data-safety rules.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
const { sanitizeEditorContent } = await import('../utils/securityUtils.js')
const { parseMarkdownToBlocks } = await import('../lib/markdownBlocks.js')

// The body of the first function or callback that starts at `start`, up to
// the closing line at its own indent.
function bodyFrom (source, start) {
  const at = source.indexOf(start)
  assert.ok(at !== -1, `${start} not found`)
  const indent = source.slice(source.lastIndexOf('\n', at) + 1, at)
  const end = source.indexOf(`\n${indent}}`, at)
  return source.slice(at, end)
}

describe('Markdown paste is sanitized before it reaches the editor', () => {
  const payload = '# Meeting template\n\n**Agenda** for the week\n\nNotes <img src="x" onerror="window.__poc = 42">'

  it('the parser alone keeps the handler (why the paste path must sanitize)', () => {
    const raw = JSON.stringify(parseMarkdownToBlocks(payload))
    assert.ok(raw.includes('onerror'))
  })

  it('sanitizing the parsed blocks strips it and keeps the text', () => {
    const blocks = sanitizeEditorContent({ blocks: parseMarkdownToBlocks(payload) }).blocks
    const json = JSON.stringify(blocks)
    assert.ok(!json.includes('onerror'))
    assert.ok(json.includes('Meeting template'))
    assert.ok(json.includes('Agenda'))
  })

  it('Editor.js sanitizes in the markdown paste handler', () => {
    const handler = bodyFrom(read('components/Editor.js'), 'const markdownPasteHandler')
    assert.match(handler, /sanitizeEditorContent\(\{ blocks: parseMarkdownToBlocks\(plain\) \}\)/)
  })
})

describe('Every note is sanitized before the editor renders it', () => {
  const editor = read('components/Editor.js')

  it('prepareForRender sanitizes after migrating', () => {
    assert.match(editor, /const prepareForRender = \(data\) => sanitizeEditorContent\(migrateEditorData\(data\)\)/)
  })

  it('no render path skips it', () => {
    assert.ok(!editor.includes('migrateEditorData(validData)'), 'a render path calls migrateEditorData directly')
    assert.ok((editor.match(/prepareForRender\(validData\)/g) || []).length >= 4)
  })
})

describe('A note still encrypted in memory is never saved over', () => {
  it('savePage refuses editor content for a note with no plaintext loaded', () => {
    const savePage = bodyFrom(read('hooks/usePagesManager.js'), 'const savePage = useCallback')
    assert.match(savePage, /currentPageData\.content == null && currentPageData\.encryptedContent/)
  })
})

describe('Locked notes stay encrypted at rest after re-locking', () => {
  it('preparePagesForStorage encrypts any locked note with plaintext and a cached key', () => {
    const prepare = bodyFrom(read('hooks/usePagesManager.js'), 'const preparePagesForStorage')
    assert.match(prepare, /page\.password\?\.hash && page\.content && \(tempUnlockedPagesRef\.current\.has\(page\.id\) \|\| encryptionKeysRef\.current\.has\(page\.id\)\)/)
  })
})

describe('App Lock keeps notes encrypted and readable', () => {
  const editor = read('components/RichTextEditor.js')

  it('setting up App Lock encrypts the notes at once', () => {
    const setup = bodyFrom(editor, 'const handleAppLockSetup = useCallback')
    assert.match(setup, /await reEncryptAppLockPages\(key, salt\)/)
  })

  it('a quick switch away only saves encrypted; memory is cleared only with a lock', () => {
    const fire = bodyFrom(editor, 'const fireEncrypt = (opts = {}) =>')
    const forceBranch = fire.slice(fire.indexOf('if (force) {'), fire.indexOf('} else {'))
    const quickBranch = fire.slice(fire.indexOf('} else {'))
    assert.ok(forceBranch.includes('encryptAndClearAppLockPages()') && forceBranch.includes('appLock.lock'))
    assert.ok(quickBranch.includes('flushSavesNow()'))
    assert.ok(!quickBranch.includes('encryptAndClearAppLockPages'), 'clearing memory without locking left notes blank')
  })

  it('locking after a long time away goes through handleInstantLock', () => {
    const visibility = bodyFrom(editor, 'const onVisibility = () =>')
    assert.ok(visibility.includes('handleInstantLock()'))
    assert.ok(!visibility.includes('appLock.lock?.()'))
  })

  it('sync does not pull while the app is locked or in duress', () => {
    const pull = bodyFrom(read('hooks/useSyncQueue.js'), 'const pull = useCallback')
    assert.match(pull, /isAppLockedRef\.current/)
    assert.match(pull, /duressActiveRef\.current/)
  })

  it('everything behind the lock screen is made inert', () => {
    assert.match(editor, /child\.inert = locked && !child\.classList\.contains\('dash-lock'\)/)
  })
})

describe('Mac app: no developer tools, Touch ID gates the stored password', () => {
  const main = read('electron-main.js')

  it('released builds disable DevTools and replace the default menu', () => {
    assert.match(main, /devTools: !app\.isPackaged/)
    assert.match(main, /if \(app\.isPackaged\) Menu\.setApplicationMenu\(buildReleaseMenu\(\)\)/)
    const menu = bodyFrom(main, 'function buildReleaseMenu')
    assert.ok(!/toggleDevTools|forceReload|role: 'reload'|viewMenu/.test(menu))
  })

  it('safe-storage-retrieve never returns the app-lock password', () => {
    const handler = bodyFrom(main, "ipcMain.handle('safe-storage-retrieve'")
    assert.match(handler, /if \(key === 'app-lock-password'\) return null/)
  })

  it('unlock-with-touch-id prompts before reading the password', () => {
    const handler = bodyFrom(main, "ipcMain.handle('unlock-with-touch-id'")
    assert.ok(handler.indexOf('promptTouchID') !== -1)
    assert.ok(handler.indexOf('promptTouchID') < handler.indexOf("readSafeStorage('app-lock-password')"))
  })

  it('the renderer unlocks through it, and preload allows the channel', () => {
    const unlock = bodyFrom(read('components/RichTextEditor.js'), 'const handleBiometricUnlock = useCallback')
    assert.ok(unlock.includes("invoke('unlock-with-touch-id')"))
    assert.ok(!unlock.includes("'safe-storage-retrieve', 'app-lock-password'"))
    assert.ok(read('preload.js').includes("'unlock-with-touch-id'"))
  })
})

describe('Attachments that could run are not opened', () => {
  const main = read('electron-main.js')
  const allowed = new Set(main.match(/SAFE_OPEN_EXTENSIONS = new Set\(\[([\s\S]*?)\]\)/)[1].match(/'([a-z0-9]+)'/g).map(s => s.slice(1, -1)))

  it('the Mac app opens documents and media, and reveals everything else in Finder', () => {
    for (const ext of ['pdf', 'png', 'jpg', 'docx', 'mp4']) assert.ok(allowed.has(ext), ext)
    for (const ext of ['html', 'htm', 'svg', 'terminal', 'command', 'sh', 'app', 'pkg', 'dmg', 'webloc', 'fileloc', 'inetloc', 'scpt', 'jar', 'zip']) {
      assert.ok(!allowed.has(ext), `${ext} must not open directly`)
    }
    const handler = bodyFrom(main, "ipcMain.handle('open-attachment'")
    assert.match(handler, /if \(isSafeToOpenFile\(safeName\)\)/)
    assert.match(handler, /shell\.showItemInFolder\(tmpFile\)/)
  })

  it('the web app opens only raster images and PDFs in a tab', () => {
    const source = read('lib/attachmentStorage.js')
    const pattern = new RegExp(source.match(/return \/(.+)\/i\.test\(String\(mimeType/)[1], 'i')
    for (const type of ['image/png', 'image/jpeg', 'image/webp', 'application/pdf']) assert.ok(pattern.test(type), type)
    for (const type of ['text/html', 'image/svg+xml', 'application/xhtml+xml', 'text/xml', 'application/octet-stream', '']) {
      assert.ok(!pattern.test(type), `${type || '(none)'} must download`)
    }
    assert.match(source, /type: inline \? mimeType : 'application\/octet-stream'/)
  })
})
