import { useEffect, useState } from 'react'
import Head from 'next/head'
import DOMPurify from 'dompurify'
import { decryptSharePayload } from '@/utils/shareDecrypt'

/**
 * Static decryptor page for shared notes.
 * URL format: /share#[password].[base64url-encrypted-data]
 * The fragment never leaves the browser — zero-knowledge.
 */

function renderBlocks(blocks) {
  return blocks.map(function (b) {
    const d = b.data || {}
    switch (b.type) {
      case 'paragraph': return '<p>' + (d.text || '') + '</p>'
      case 'header': return '<h' + (d.level || 2) + '>' + (d.text || '') + '</h' + (d.level || 2) + '>'
      case 'list': case 'nestedlist': {
        const tag = d.style === 'ordered' ? 'ol' : 'ul'
        const items = (d.items || []).map(function (i) {
          const text = typeof i === 'string' ? i : (i.content || i.text || '')
          return '<li>' + text + '</li>'
        }).join('')
        return '<' + tag + '>' + items + '</' + tag + '>'
      }
      case 'checklist':
        return '<ul style="list-style:none;padding-left:0">' + (d.items || []).map(function (i) {
          const check = i.checked ? '\u2611' : '\u2610'
          return '<li>' + check + ' ' + (i.text || '') + '</li>'
        }).join('') + '</ul>'
      case 'bulletListItem': return '<ul><li>' + (d.text || '') + '</li></ul>'
      case 'numberedListItem': return '<ol><li>' + (d.text || '') + '</li></ol>'
      case 'checklistItem': {
        const ck = d.checked ? '\u2611' : '\u2610'
        return '<p>' + ck + ' ' + (d.text || '') + '</p>'
      }
      case 'quote':
        return '<blockquote><p>' + (d.text || '') + '</p>' +
          (d.caption ? '<cite>' + d.caption + '</cite>' : '') + '</blockquote>'
      case 'code': case 'codeBlock':
        return '<pre><code>' + (d.code || '').replace(/</g, '&lt;') + '</code></pre>'
      case 'image': {
        const url = d.file ? d.file.url : (d.url || '')
        return '<figure><img src="' + url + '" style="max-width:100%;border-radius:8px" />' +
          (d.caption ? '<figcaption>' + d.caption + '</figcaption>' : '') + '</figure>'
      }
      case 'table': {
        const rows = (d.content || []).map(function (row) {
          return '<tr>' + row.map(function (cell) { return '<td>' + cell + '</td>' }).join('') + '</tr>'
        }).join('')
        return '<table>' + rows + '</table>'
      }
      case 'delimiter': return '<hr />'
      default: return d.text ? '<p>' + d.text + '</p>' : ''
    }
  }).join('')
}

function sanitize(html) {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote', 'pre', 'code',
      'strong', 'em', 'b', 'i', 'u', 'a', 'br', 'hr', 'table', 'tbody', 'thead', 'tr', 'td', 'th',
      'figure', 'figcaption', 'img', 'cite', 'mark', 's', 'sub', 'sup', 'span', 'div'],
    ALLOWED_ATTR: ['href', 'src', 'alt', 'style'],
    ALLOW_DATA_ATTR: false
  })
}

export default function SharePage() {
  const [status, setStatus] = useState('loading')
  const [title, setTitle] = useState('')
  const [contentHtml, setContentHtml] = useState('')
  const [error, setError] = useState('')
  const [password, setPassword] = useState('')
  const [encData, setEncData] = useState('')
  const [decrypting, setDecrypting] = useState(false)
  const [dashStatus, setDashStatus] = useState(null) // null | 'checking' | 'not-found'

  useEffect(() => {
    const hash = window.location.hash.slice(1)
    if (!hash) {
      setStatus('empty')
      return
    }

    if (!crypto?.subtle) {
      setStatus('error')
      setError('Your browser cannot decrypt this note. Please open this link in Chrome, Firefox, Safari, or Edge.')
      return
    }

    const dotIdx = hash.indexOf('.')
    if (dotIdx === -1) {
      // No password in URL — show password input
      setEncData(hash)
      setStatus('needPassword')
      return
    }

    const pw = decodeURIComponent(hash.slice(0, dotIdx))
    const data = hash.slice(dotIdx + 1)
    decryptNote(pw, data)
  }, [])

  function handlePasswordSubmit(e) {
    e?.preventDefault()
    if (!password.trim() || decrypting) return
    decryptNote(password.trim(), encData)
  }

  async function decryptNote(pw, b64Data) {
    setStatus('decrypting')
    setDecrypting(true)
    setError('')
    try {
      const json = await decryptSharePayload(pw, b64Data)

      setTitle(json.title || 'Untitled')
      const blocks = json.content?.blocks || []
      setContentHtml(sanitize(renderBlocks(blocks)))
      setStatus('success')
    } catch {
      if (encData) {
        setStatus('needPassword')
        setError('Wrong password. Please try again.')
      } else {
        setStatus('error')
        setError('Unable to decrypt this note. The link may be invalid or corrupted.')
      }
    } finally {
      setDecrypting(false)
    }
  }

  return (
    <>
      <Head>
        <title>{status === 'success' ? title : 'Encrypted Note'} — Dash</title>
        <meta name="robots" content="noindex, nofollow" />
        <link rel="icon" type="image/png" href="./icons/dash-logo.png" />
        <link rel="apple-touch-icon" href="./icons/icon-192.png" />
      </Head>

      <div style={{
        minHeight: '100vh',
        background: '#0a0a0a',
        color: '#e5e5e5',
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20
      }}>
        <div style={{ maxWidth: 640, width: '100%' }}>

          {status === 'loading' && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>&#128274;</div>
              <p style={{ color: '#737373' }}>Loading...</p>
            </div>
          )}

          {status === 'decrypting' && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>&#128274;</div>
              <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>Encrypted Note</h1>
              <p style={{ color: '#737373', fontSize: 14 }}>Decrypting...</p>
            </div>
          )}

          {status === 'empty' && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>&#128274;</div>
              <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>No Note Found</h1>
              <p style={{ color: '#737373', fontSize: 14 }}>This link doesn&apos;t contain a shared note.</p>
            </div>
          )}

          {status === 'needPassword' && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>&#128274;</div>
              <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>Encrypted Note</h1>
              <p style={{ color: '#737373', fontSize: 14, marginBottom: 24 }}>Enter the password to view this note</p>
              <form onSubmit={handlePasswordSubmit}>
                <input
                  type="text"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password..."
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck="false"
                  style={{
                    width: '100%', padding: '12px 16px', borderRadius: 10,
                    border: '1px solid #262626', background: '#171717', color: '#e5e5e5',
                    fontSize: 16, outline: 'none', WebkitAppearance: 'none'
                  }}
                />
                <button
                  type="submit"
                  disabled={decrypting || !password.trim()}
                  style={{
                    width: '100%', padding: 12, borderRadius: 10, border: 'none',
                    background: decrypting ? '#1e3a5f' : '#3b82f6', color: 'white',
                    fontSize: 14, fontWeight: 500, cursor: decrypting ? 'not-allowed' : 'pointer',
                    marginTop: 12
                  }}
                >
                  {decrypting ? 'Decrypting...' : 'Decrypt'}
                </button>
              </form>
              {error && <p style={{ color: '#ef4444', fontSize: 13, marginTop: 8 }}>{error}</p>}
            </div>
          )}

          {status === 'error' && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>&#128274;</div>
              <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>Cannot Open Note</h1>
              <p style={{ color: '#ef4444', fontSize: 14 }}>{error}</p>
            </div>
          )}

          {status === 'success' && (
            <div>
              <div style={{
                fontSize: 24,
                fontWeight: 700,
                marginBottom: 16,
                paddingBottom: 12,
                borderBottom: '1px solid #262626'
              }}>
                {title}
              </div>
              <div
                className="share-note-content"
                dangerouslySetInnerHTML={{ __html: contentHtml }}
              />
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 14px',
                borderRadius: 10,
                border: '1px solid #262626',
                background: '#111',
                marginTop: 24
              }}>
                <p style={{ color: '#737373', fontSize: 12, margin: 0 }}>
                  {dashStatus === 'checking'
                    ? 'If Dash didn\u2019t open, it may not be installed.'
                    : 'Import this note into your Dash app for offline access.'}
                  {dashStatus === 'checking' && (
                    <span>
                      {' '}<a
                        href="https://github.com/Efesop/rich-text-editor/releases"
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: '#3b82f6' }}
                      >
                        Download Dash
                      </a>
                    </span>
                  )}
                </p>
                <a
                  href={'dashnotes://share#' + (typeof window !== 'undefined' ? window.location.hash.slice(1) : '')}
                  onClick={() => setDashStatus('checking')}
                  style={{
                    flexShrink: 0,
                    marginLeft: 12,
                    padding: '6px 14px',
                    borderRadius: 6,
                    border: '1px solid #3b82f6',
                    background: 'transparent',
                    color: '#3b82f6',
                    fontSize: 12,
                    fontWeight: 500,
                    cursor: 'pointer',
                    textDecoration: 'none',
                    whiteSpace: 'nowrap'
                  }}
                >
                  Save to Dash
                </a>
              </div>
              <div style={{
                marginTop: 24,
                paddingTop: 16,
                borderTop: '1px solid #262626',
                textAlign: 'center'
              }}>
                <p style={{ fontSize: 13, color: '#a3a3a3' }}>
                  Shared with <a href="https://dashnote.io" target="_blank" rel="noopener noreferrer" style={{ color: '#3b82f6', textDecoration: 'none', fontWeight: 500 }}>Dash</a> — the privacy-first note app
                </p>
                <p style={{ fontSize: 13, color: '#737373', marginTop: 4 }}>
                  <a href="https://dashnote.io" target="_blank" rel="noopener noreferrer" style={{ color: '#737373', textDecoration: 'underline' }}>dashnote.io</a>
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      <style jsx global>{`
        * { margin: 0; padding: 0; box-sizing: border-box; }
        .share-note-content { line-height: 1.7; font-size: 15px; }
        .share-note-content p { margin: 8px 0; }
        .share-note-content h1, .share-note-content h2, .share-note-content h3 { margin: 16px 0 8px; font-weight: 600; }
        .share-note-content h1 { font-size: 28px; }
        .share-note-content h2 { font-size: 22px; }
        .share-note-content h3 { font-size: 18px; }
        .share-note-content blockquote { border-left: 3px solid #3b82f6; padding-left: 16px; color: #a3a3a3; font-style: italic; margin: 12px 0; }
        .share-note-content pre { background: #171717; padding: 14px; border-radius: 8px; overflow-x: auto; margin: 12px 0; font-size: 13px; }
        .share-note-content code { font-family: 'SF Mono', Monaco, monospace; }
        .share-note-content img { max-width: 100%; border-radius: 8px; margin: 8px 0; }
        .share-note-content table { width: 100%; border-collapse: collapse; margin: 12px 0; }
        .share-note-content td { border: 1px solid #262626; padding: 8px 12px; }
        .share-note-content hr { border: none; border-top: 1px solid #262626; margin: 16px 0; }
        .share-note-content ul, .share-note-content ol { padding-left: 24px; margin: 8px 0; }
        .share-note-content li { margin: 4px 0; }
        .share-note-content figure { margin: 12px 0; }
        .share-note-content figcaption, .share-note-content cite { color: #737373; font-size: 13px; }
      `}</style>
    </>
  )
}
