import '../styles/globals.css'
import { ThemeProvider } from 'next-themes'
import { AppErrorBoundary } from '../components/ErrorBoundary'
import useTagStore from '../store/tagStore'
import { useEffect } from 'react'

// Build marker — bumped on every release. Surfaced in error messages
// so a stale-cache install (iOS WebView serving old chunks despite
// new IPA) can be identified by comparing the marker in the UI to
// the build the user thinks they installed.
const DASH_BUILD = '76'

function MyApp({ Component, pageProps }) {
  const loadTags = useTagStore(state => state.loadTags)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.__DASH_BUILD__ = DASH_BUILD
    }
    // Mobile: portal Editor.js block popovers (slash menu / block tunes) to
    // <body> when they open. The popover node lives deep inside the editor
    // DOM, where a transformed/clipped ancestor re-scopes its
    // `position: fixed` — the bottom-sheet renders inside the editor's
    // clipped box and its lower rows are cut off at the editor's edge
    // (the "menu ends at Image / can't scroll / no shadow" bug — the
    // sheet's bottom half was never on screen). Reparenting to <body>
    // restores true viewport-fixed behavior. Editor.js keeps working: it
    // holds a reference to the same node and toggles classes on it.
    // Desktop keeps native anchored popovers; inline toolbar untouched.
    if (typeof window !== 'undefined') {
      const isMobile = window.matchMedia('(max-width: 768px)')
      const portal = new MutationObserver(() => {
        if (!isMobile.matches) return
        const pop = document.querySelector('.ce-popover--opened:not(.ce-popover--inline)')
        if (pop && pop.parentElement !== document.body) {
          document.body.appendChild(pop)
        }
      })
      portal.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] })
    }
    loadTags()
    // Initialise RevenueCat once per app boot. No-op on non-iOS platforms;
    // SDK is lazy-loaded via dynamic import so web/Electron bundles stay slim.
    ;(async () => {
      try {
        const { init } = await import('@/lib/rc')
        await init()
      } catch (err) {
        console.warn('[rc] init failed (non-fatal)', err?.message || err)
      }
    })()
    // Service worker policy:
    //   * PWA (browser / Vercel): register `/sw.js` (cache-first offline).
    //   * Capacitor / Electron: ALSO register, BUT `/sw.js` itself
    //     detects the native shell origin and self-destructs (deletes
    //     all caches, unregisters, force-reloads). We register here so
    //     the browser is forced to re-fetch the latest sw.js, which is
    //     how an OLD-SW-still-controlling-an-iOS-install gets the new
    //     self-destruct logic in the first place — without this call
    //     the old SW just keeps serving cached chunks across IPA
    //     updates (build-33 → 34 pair-packet v=2 stale-cache regression).
    //   * Also force a one-shot reload when the controller changes so
    //     the new SW's self-destruct + cache wipe takes effect on this
    //     same launch instead of two launches later.
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      let reloadedOnce = false
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloadedOnce) return
        reloadedOnce = true
        try { window.location.reload() } catch { /* */ }
      })
      const register = async () => {
        try {
          const basePath = process.env.NEXT_PUBLIC_BASE_PATH || ''
          // SW filename changed `/sw.js` → `/sw-v2.js` to force-bypass
          // an old iOS SW that cached its own `/sw.js` URL via its
          // fetch listener — browser update checks for the same URL
          // returned the cached old bytes from the SW Cache API
          // instead of the fresh sandbox file, so the new
          // self-destruct logic could never install. New filename
          // isn't in the old cache → fetched fresh → installs the
          // self-destructing v2 SW → wipes caches + unregisters old.
          const reg = await navigator.serviceWorker.register(`${basePath}/sw-v2.js`, {
            // Bypass HTTP cache for SW script updates entirely.
            updateViaCache: 'none'
          })
          reg.update().catch(err => console.warn('SW update check failed (non-fatal)', err?.message || err))
        } catch (err) {
          console.error('SW registration failed', err)
        }
      }
      register()
    }
  }, [loadTags])

  return (
    <AppErrorBoundary>
      <ThemeProvider 
        attribute="class" 
        themes={['light', 'dark', 'darkblue', 'fallout']}
        defaultTheme="light"
      >
        <Component {...pageProps} />
      </ThemeProvider>
    </AppErrorBoundary>
  )
}

export default MyApp