/**
 * Electron 44 upgrade (October 2026): the release must not be offered to
 * Macs older than macOS 13, and links in notes reach the main process
 * because a sandboxed preload has no `shell`. Release config and Electron
 * code can't run under `node --test`, so they're pinned in the source.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
const require = createRequire(import.meta.url)
const { markMinimumMacOS, MIN_DARWIN } = require('../scripts/mark-min-macos.js')

const FEED = `version: 1.6.16
files:
  - url: Dash-1.6.16-arm64-mac.zip
    sha512: abc
    size: 1
path: Dash-1.6.16-arm64-mac.zip
sha512: abc
releaseDate: '2026-10-23T10:00:00.000Z'
`

describe('mark-min-macos', () => {
  it('uses the Darwin version of macOS 13, which is what os.release() reports', () => {
    assert.equal(MIN_DARWIN, '22.0.0')
  })

  it('adds a top-level minimumSystemVersion to latest-mac.yml', () => {
    const out = markMinimumMacOS(FEED)
    assert.match(out, /\nminimumSystemVersion: 22\.0\.0\n$/)
    assert.ok(out.startsWith(FEED.trimEnd()))
  })

  it('replaces an existing value rather than adding a second one', () => {
    const out = markMinimumMacOS(markMinimumMacOS(FEED, '21.0.0'))
    assert.equal(out.match(/^minimumSystemVersion:/gm).length, 1)
    assert.match(out, /^minimumSystemVersion: 22\.0\.0$/m)
  })
})

describe('release config', () => {
  it('the app says it needs macOS 13 and the release starts as a draft', () => {
    const yml = read('electron-builder.yml')
    assert.match(yml, /^ {2}minimumSystemVersion: '13\.0'$/m)
    assert.match(yml, /^ {2}releaseType: draft$/m)
  })

  it('the workflow marks the feed before it publishes the release', () => {
    const wf = read('.github/workflows/build-and-release.yml')
    const mark = wf.indexOf('node scripts/mark-min-macos.js dist/latest-mac.yml')
    const upload = wf.indexOf('gh release upload "$GITHUB_REF_NAME" dist/latest-mac.yml --clobber')
    const publish = wf.indexOf('gh release edit "$GITHUB_REF_NAME" --draft=false')
    assert.ok(mark !== -1 && upload > mark && publish > upload, 'mark, then upload, then publish')
    assert.ok(wf.indexOf('npm run release:mac') < mark, 'after the build')
  })

  it('ships Electron 44 or later', () => {
    const { devDependencies } = JSON.parse(read('package.json'))
    assert.ok(Number(devDependencies.electron.replace(/^\D*/, '').split('.')[0]) >= 44)
  })
})

describe('Mac links and updates', () => {
  it('the preload asks the main process to open links', () => {
    const preload = read('preload.js')
    assert.doesNotMatch(preload, /\bshell\.openExternal\b/)
    assert.doesNotMatch(preload, /\{[^}]*\bshell\b[^}]*\}\s*=\s*require/)
    assert.match(preload, /openExternal: \(url\) => ipcRenderer\.invoke\('open-external', String\(url\)\)/)
  })

  it('the main process opens only web links', () => {
    const main = read('electron-main.js')
    const at = main.indexOf("ipcMain.handle('open-external'")
    assert.ok(at !== -1, 'handler missing')
    const handler = main.slice(at, main.indexOf('\n})\n', at))
    assert.match(handler, /protocol === 'http:' \|\| protocol === 'https:'/)
    assert.match(handler, /shell\.openExternal\(target\)/)
  })

  it("the update check trusts the updater's own answer", () => {
    const main = read('electron-main.js')
    assert.match(main, /const updateAvailable = typeof result\.isUpdateAvailable === 'boolean'\s*\n\s*\? result\.isUpdateAvailable/)
  })
})
