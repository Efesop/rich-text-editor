import { useEffect } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'

/**
 * /live — Join a Live Session
 *
 * URL format: /live#roomId.encryptionKey
 * The fragment (after #) never leaves the browser — zero-knowledge.
 *
 * Parses the fragment, stores join info in sessionStorage,
 * then redirects to the main app which picks it up and joins the session.
 */
export default function LiveJoin () {
  const router = useRouter()

  useEffect(() => {
    const fragment = window.location.hash.slice(1)
    if (!fragment) return

    const dotIndex = fragment.indexOf('.')
    if (dotIndex === -1) return

    const roomId = fragment.slice(0, dotIndex)
    const key = fragment.slice(dotIndex + 1)
    if (!roomId || !key) return

    // Store in sessionStorage so the main app can pick it up
    sessionStorage.setItem('dash-live-join', JSON.stringify({ roomId, key }))

    // Redirect to main app (fragment stays client-side, never sent to server)
    router.replace('/')
  }, [router])

  return (
    <>
      <Head>
        <title>Joining Live Session — Dash</title>
      </Head>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: '#0a0a0a',
        color: '#fff',
        fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>Joining Live Session...</div>
          <div style={{ color: '#888', fontSize: '0.9rem' }}>End-to-end encrypted</div>
        </div>
      </div>
    </>
  )
}
