import { useEffect, useState } from 'react'
import Head from 'next/head'
import DOMPurify from 'dompurify'
import { decryptSharePayload } from '@/utils/shareDecrypt'

/**
 * Static decryptor page for shared notes.
 * URL format: /share#[password].[base64url-encrypted-data]
 * The fragment never leaves the browser — zero-knowledge.
 */

/** Convert inline markdown to HTML (fallback for blocks containing raw markdown text) */
function convertInlineMarkdown(text) {
  if (!text || text.includes('<b>') || text.includes('<a ') || text.includes('<strong>')) return text
  return text
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\*{3}([^*]+)\*{3}/g, '<b><i>$1</i></b>')
    .replace(/\*{2}([^*]+)\*{2}/g, '<b>$1</b>')
    .replace(/\*([^*]+)\*/g, '<i>$1</i>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/~~([^~]+)~~/g, '<s>$1</s>')
    .replace(/==([^=]+)==/g, '<mark>$1</mark>')
}

function renderBlocks(blocks) {
  return blocks.map(function (b) {
    const d = b.data || {}
    switch (b.type) {
      case 'paragraph': {
        const text = d.text || ''
        // If a paragraph contains markdown line breaks (e.g. pasted raw markdown),
        // split and render each line with markdown conversion
        if (text.includes('---') || text.includes('# ') || text.includes('**')) {
          const lines = text.split(/(?:<br\s*\/?>|\n)/)
          if (lines.length > 1) {
            return lines.map(function (line) {
              const trimmed = line.trim()
              if (!trimmed) return ''
              if (/^---+$/.test(trimmed)) return '<hr />'
              const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/)
              if (headingMatch) {
                const level = Math.min(Math.max(headingMatch[1].length, 2), 4)
                return '<h' + level + '>' + convertInlineMarkdown(headingMatch[2]) + '</h' + level + '>'
              }
              return '<p>' + convertInlineMarkdown(trimmed) + '</p>'
            }).join('')
          }
        }
        return '<p>' + convertInlineMarkdown(text) + '</p>'
      }
      case 'header': return '<h' + (d.level || 2) + '>' + convertInlineMarkdown(d.text || '') + '</h' + (d.level || 2) + '>'
      case 'list': case 'nestedlist': {
        const tag = d.style === 'ordered' ? 'ol' : 'ul'
        const items = (d.items || []).map(function (i) {
          const text = typeof i === 'string' ? i : (i.content || i.text || '')
          return '<li>' + convertInlineMarkdown(text) + '</li>'
        }).join('')
        return '<' + tag + '>' + items + '</' + tag + '>'
      }
      case 'checklist':
        return '<ul style="list-style:none;padding-left:0">' + (d.items || []).map(function (i) {
          const check = i.checked ? '\u2611' : '\u2610'
          return '<li>' + check + ' ' + convertInlineMarkdown(i.text || '') + '</li>'
        }).join('') + '</ul>'
      case 'bulletListItem': return '<ul><li>' + convertInlineMarkdown(d.text || '') + '</li></ul>'
      case 'numberedListItem': return '<ol><li>' + convertInlineMarkdown(d.text || '') + '</li></ol>'
      case 'checklistItem': {
        const ck = d.checked ? '\u2611' : '\u2610'
        return '<p>' + ck + ' ' + convertInlineMarkdown(d.text || '') + '</p>'
      }
      case 'quote':
        return '<blockquote><p>' + convertInlineMarkdown(d.text || '') + '</p>' +
          (d.caption ? '<cite>' + convertInlineMarkdown(d.caption) + '</cite>' : '') + '</blockquote>'
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
      console.log('[share] decrypted — title:', json.title, 'blocks:', blocks.length, 'types:', blocks.map(function (b) { return b.type }).join(', '))
      if (blocks[0]) console.log('[share] first block:', JSON.stringify(blocks[0]).slice(0, 300))
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

  const securityBanner = (
    <div style={{
      position: 'sticky',
      top: 0,
      zIndex: 10,
      background: 'rgba(10, 10, 10, 0.85)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      borderBottom: '1px solid #1a1a1a',
    }}>
      <div style={{
        maxWidth: 720,
        margin: '0 auto',
        padding: '10px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <a href="https://dashnote.io" target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 28,
              height: 28,
              borderRadius: 7,
              background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 14,
              fontWeight: 700,
              color: 'white',
            }}>D</div>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#e5e5e5', letterSpacing: '-0.01em' }}>Dash</span>
          </a>
          <span style={{
            fontSize: 11,
            color: '#22c55e',
            background: 'rgba(34, 197, 94, 0.1)',
            border: '1px solid rgba(34, 197, 94, 0.2)',
            padding: '2px 8px',
            borderRadius: 20,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            End-to-end encrypted
          </span>
        </div>
        <a
          href="https://dashnote.io"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            fontSize: 12,
            fontWeight: 500,
            color: '#3b82f6',
            textDecoration: 'none',
            padding: '5px 12px',
            borderRadius: 6,
            border: '1px solid rgba(59, 130, 246, 0.3)',
            background: 'rgba(59, 130, 246, 0.05)',
            transition: 'background 0.15s',
          }}
        >
          Get Dash
        </a>
      </div>
    </div>
  )

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
      }}>
        {securityBanner}

        <div style={{
          maxWidth: 720,
          margin: '0 auto',
          padding: '0 20px',
        }}>

          {/* Loading / Decrypting / Empty / Error states */}
          {(status === 'loading' || status === 'decrypting') && (
            <div style={{ textAlign: 'center', paddingTop: 120 }}>
              <div style={{
                width: 56,
                height: 56,
                borderRadius: 14,
                background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 20,
              }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              </div>
              <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>
                {status === 'loading' ? 'Loading...' : 'Decrypting...'}
              </h1>
              <p style={{ color: '#737373', fontSize: 14 }}>This note is end-to-end encrypted</p>
            </div>
          )}

          {status === 'empty' && (
            <div style={{ textAlign: 'center', paddingTop: 120 }}>
              <div style={{
                width: 56,
                height: 56,
                borderRadius: 14,
                background: '#1a1a1a',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 20,
              }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#737373" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              </div>
              <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>No Note Found</h1>
              <p style={{ color: '#737373', fontSize: 14 }}>This link doesn&apos;t contain a shared note.</p>
            </div>
          )}

          {status === 'needPassword' && (
            <div style={{ textAlign: 'center', paddingTop: 100, maxWidth: 380, margin: '0 auto' }}>
              <div style={{
                width: 56,
                height: 56,
                borderRadius: 14,
                background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 20,
              }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              </div>
              <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 6 }}>Password Protected</h1>
              <p style={{ color: '#737373', fontSize: 14, marginBottom: 24 }}>Enter the password to decrypt this note</p>
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
                    border: '1px solid #262626', background: '#141414', color: '#e5e5e5',
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
            <div style={{ textAlign: 'center', paddingTop: 120 }}>
              <div style={{
                width: 56,
                height: 56,
                borderRadius: 14,
                background: '#1a1a1a',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 20,
              }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              </div>
              <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>Cannot Open Note</h1>
              <p style={{ color: '#ef4444', fontSize: 14 }}>{error}</p>
            </div>
          )}

          {/* Success — note content */}
          {status === 'success' && (
            <div style={{ paddingTop: 48, paddingBottom: 40 }}>
              {/* Title */}
              <h1 style={{
                fontSize: 32,
                fontWeight: 700,
                lineHeight: 1.2,
                marginBottom: 24,
                paddingBottom: 16,
                borderBottom: '1px solid #1a1a1a',
                letterSpacing: '-0.02em',
              }}>
                {title}
              </h1>

              {/* Note content */}
              <div
                className="share-note-content"
                dangerouslySetInnerHTML={{ __html: contentHtml }}
              />

              {/* Save to Dash CTA */}
              <div style={{
                marginTop: 40,
                padding: '20px 24px',
                borderRadius: 16,
                border: '1px solid #1a1a1a',
                background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.04), rgba(59, 130, 246, 0.01))',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                  <div style={{
                    width: 36,
                    height: 36,
                    borderRadius: 9,
                    background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 16,
                    fontWeight: 700,
                    color: 'white',
                    flexShrink: 0,
                  }}>D</div>
                  <div>
                    <p style={{ fontSize: 14, fontWeight: 600, color: '#e5e5e5', margin: 0 }}>Save to Dash</p>
                    <p style={{ fontSize: 12, color: '#737373', margin: 0, marginTop: 1 }}>Import this note for offline access</p>
                  </div>
                  <a
                    href={'dashnotes://share#' + (typeof window !== 'undefined' ? window.location.hash.slice(1) : '')}
                    onClick={() => setDashStatus('checking')}
                    style={{
                      marginLeft: 'auto',
                      flexShrink: 0,
                      padding: '8px 16px',
                      borderRadius: 8,
                      border: 'none',
                      background: '#3b82f6',
                      color: 'white',
                      fontSize: 13,
                      fontWeight: 500,
                      cursor: 'pointer',
                      textDecoration: 'none',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Open in Dash
                  </a>
                </div>
                {dashStatus === 'checking' && (
                  <p style={{ fontSize: 12, color: '#737373', margin: 0 }}>
                    If Dash didn&apos;t open, you may need to install it.{' '}
                    <a href="https://dashnote.io" target="_blank" rel="noopener noreferrer" style={{ color: '#3b82f6' }}>
                      Get Dash
                    </a>
                  </p>
                )}
              </div>

              {/* Features / sell section */}
              <div style={{
                marginTop: 24,
                padding: '20px 24px',
                borderRadius: 16,
                border: '1px solid #1a1a1a',
                background: '#0f0f0f',
              }}>
                <p style={{ fontSize: 14, fontWeight: 600, color: '#e5e5e5', margin: 0, marginBottom: 16 }}>
                  This note was shared with Dash
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                    <div>
                      <p style={{ fontSize: 12, fontWeight: 500, color: '#d4d4d4', margin: 0 }}>End-to-end encrypted</p>
                      <p style={{ fontSize: 11, color: '#525252', margin: 0, marginTop: 2 }}>Only you and the sender can read this</p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                    <div>
                      <p style={{ fontSize: 12, fontWeight: 500, color: '#d4d4d4', margin: 0 }}>Zero-knowledge</p>
                      <p style={{ fontSize: 11, color: '#525252', margin: 0, marginTop: 2 }}>No server ever sees your content</p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    <div>
                      <p style={{ fontSize: 12, fontWeight: 500, color: '#d4d4d4', margin: 0 }}>Offline-first</p>
                      <p style={{ fontSize: 11, color: '#525252', margin: 0, marginTop: 2 }}>Your notes live on your device</p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
                    <div>
                      <p style={{ fontSize: 12, fontWeight: 500, color: '#d4d4d4', margin: 0 }}>Desktop, mobile & web</p>
                      <p style={{ fontSize: 11, color: '#525252', margin: 0, marginTop: 2 }}>macOS, Windows, Linux, iOS, Android</p>
                    </div>
                  </div>
                </div>
                <a
                  href="https://dashnote.io"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'block',
                    textAlign: 'center',
                    marginTop: 16,
                    padding: '10px 20px',
                    borderRadius: 8,
                    border: '1px solid #262626',
                    background: 'transparent',
                    color: '#e5e5e5',
                    fontSize: 13,
                    fontWeight: 500,
                    textDecoration: 'none',
                  }}
                >
                  Learn more at dashnote.io
                </a>
              </div>
            </div>
          )}

        </div>
      </div>

      <style jsx global>{`
        * { margin: 0; padding: 0; box-sizing: border-box; }
        .share-note-content { line-height: 1.75; font-size: 16px; color: #d4d4d4; }
        .share-note-content p { margin: 10px 0; }
        .share-note-content h1, .share-note-content h2, .share-note-content h3 { margin: 24px 0 10px; font-weight: 600; color: #e5e5e5; }
        .share-note-content h1 { font-size: 28px; }
        .share-note-content h2 { font-size: 22px; }
        .share-note-content h3 { font-size: 18px; }
        .share-note-content a { color: #3b82f6; text-decoration: none; }
        .share-note-content a:hover { text-decoration: underline; }
        .share-note-content blockquote { border-left: 3px solid #3b82f6; padding-left: 16px; color: #a3a3a3; font-style: italic; margin: 16px 0; }
        .share-note-content pre { background: #141414; padding: 16px; border-radius: 10px; overflow-x: auto; margin: 16px 0; font-size: 13px; border: 1px solid #1a1a1a; }
        .share-note-content code { font-family: 'SF Mono', Monaco, monospace; }
        .share-note-content p code { background: #1a1a1a; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; }
        .share-note-content img { max-width: 100%; border-radius: 10px; margin: 12px 0; }
        .share-note-content table { width: 100%; border-collapse: collapse; margin: 16px 0; }
        .share-note-content td { border: 1px solid #1a1a1a; padding: 10px 14px; }
        .share-note-content hr { border: none; border-top: 1px solid #1a1a1a; margin: 24px 0; }
        .share-note-content ul, .share-note-content ol { padding-left: 24px; margin: 10px 0; }
        .share-note-content li { margin: 4px 0; }
        .share-note-content figure { margin: 16px 0; }
        .share-note-content figcaption, .share-note-content cite { color: #737373; font-size: 13px; }
        .share-note-content b, .share-note-content strong { color: #e5e5e5; }
      `}</style>
    </>
  )
}
