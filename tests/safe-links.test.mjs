/**
 * Links in notes: only absolute web, email and phone links open, and nothing
 * reaches Capacitor's internal paths on iOS (GHSA-rvm3-566m-v7fv, October
 * 2026). The click handlers live in React components these tests can't run,
 * so alongside the functional checks they pin the handlers in the source.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
const { externalLinkTarget, isAppInternalPath } = await import('../lib/safeLinks.js')

const IOS_PAGE = 'capacitor://localhost/'
const INTERCEPTOR = '/_capacitor_http_interceptor_?u=https%3A%2F%2Fevil.example%2Fsteal.html'

describe('externalLinkTarget', () => {
  it('opens web, email and phone links', () => {
    assert.equal(externalLinkTarget('https://dashnote.io/sync'), 'https://dashnote.io/sync')
    assert.equal(externalLinkTarget('http://example.com'), 'http://example.com/')
    assert.equal(externalLinkTarget('mailto:hello@dashnote.io'), 'mailto:hello@dashnote.io')
    assert.equal(externalLinkTarget('tel:+441234567890'), 'tel:+441234567890')
    assert.equal(externalLinkTarget('  https://example.com/a b  '), 'https://example.com/a%20b')
  })

  it('ignores relative links, which resolve to the app on iOS', () => {
    assert.equal(externalLinkTarget(INTERCEPTOR), null)
    assert.equal(externalLinkTarget('_capacitor_http_interceptor_?u=x'), null)
    assert.equal(externalLinkTarget('//evil.example/page'), null)
    assert.equal(externalLinkTarget('Other%20Note.md'), null)
    assert.equal(externalLinkTarget('#'), null)
  })

  it('ignores script, data and app-internal schemes', () => {
    for (const href of [
      'javascript:alert(1)',
      'JAVASCRIPT:alert(1)',
      'java\tscript:alert(1)',
      ' javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox(1)',
      'file:///etc/passwd',
      'blob:capacitor://localhost/1234',
      'capacitor://localhost/_capacitor_http_interceptor_?u=https://evil.example',
      'capacitor://localhost/_capacitor_file_/private/tmp/x.html'
    ]) {
      assert.equal(externalLinkTarget(href), null, href)
    }
  })

  it('ignores missing hrefs', () => {
    assert.equal(externalLinkTarget(null), null)
    assert.equal(externalLinkTarget(undefined), null)
    assert.equal(externalLinkTarget(''), null)
    assert.equal(externalLinkTarget('   '), null)
  })
})

describe('isAppInternalPath', () => {
  it("spots Capacitor's paths on the app's own origin", () => {
    assert.equal(isAppInternalPath(INTERCEPTOR, IOS_PAGE), true)
    assert.equal(isAppInternalPath('_capacitor_http_interceptor_?u=x', IOS_PAGE), true)
    assert.equal(isAppInternalPath(' /_capacitor_file_/private/tmp/x.html', IOS_PAGE), true)
    assert.equal(isAppInternalPath('capacitor://localhost/_capacitor_http_interceptor_?u=x', 'capacitor://localhost/index.html'), true)
  })

  it('leaves other links alone', () => {
    assert.equal(isAppInternalPath('https://evil.example/_capacitor_http_interceptor_', IOS_PAGE), false)
    assert.equal(isAppInternalPath('/notes/today', IOS_PAGE), false)
    assert.equal(isAppInternalPath('#', IOS_PAGE), false)
    assert.equal(isAppInternalPath('https://dashnote.io', 'https://efesop.github.io/rich-text-editor/'), false)
    assert.equal(isAppInternalPath(null, IOS_PAGE), false)
  })
})

describe('click handlers', () => {
  it('the editor opens only what externalLinkTarget allows', () => {
    const editor = read('components/Editor.js')
    assert.match(editor, /import \{ externalLinkTarget \} from '@\/lib\/safeLinks'/)
    assert.match(editor, /const href = externalLinkTarget\(link\.getAttribute\('href'\)\)\s*\n\s*if \(!href\) return/)
    assert.doesNotMatch(editor, /const href = link\.href/)
  })

  it('the app-wide handler blocks internal paths before anything else', () => {
    const app = read('components/RichTextEditor.js')
    const at = app.indexOf('const handleLinkClick = (event) =>')
    assert.ok(at !== -1)
    const handler = app.slice(at, app.indexOf("document.addEventListener('click', handleLinkClick)", at))
    const guard = handler.indexOf('isAppInternalPath(href, window.location.href)')
    assert.ok(guard !== -1, 'guard missing')
    assert.ok(guard < handler.indexOf('event.isTrusted'), 'guard must run before the early returns')
  })
})
