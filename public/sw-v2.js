// Service Worker for Dash Notes
//
// On PWA / Vercel build: cache-first offline strategy.
//
// On Capacitor (`capacitor://localhost`) and Electron (`file://`): the
// bundle is served direct from the app sandbox, so SW caching adds no
// value and creates real harm — old chunks from a previous IPA stay
// pinned even after a fresh install. Build-33 → 34 saw an iOS pair
// flow rejected v=2 packets because the iOS SW kept serving the
// pre-update `decryptPairPacket`. Solution: this SW now SELF-DESTRUCTS
// the moment it activates on a Capacitor / Electron origin — deletes
// all caches, unregisters itself. Next page load runs without SW
// interference.
//
// CACHE_NAME bumped on every release whose chunks change. Activate
// hook deletes any cache whose name differs from the current one.

const CACHE_NAME = 'dash-notes-v5'
const BASE_PATH = self.location.pathname.replace(/\/sw\.js$/, '')

// Heuristic: Capacitor uses `capacitor://localhost` as the WebView
// scheme, Electron uses `file://`. Either way, NOT a normal http(s)
// PWA — kill the SW.
const isNativeShell =
  self.location.protocol === 'capacitor:' ||
  self.location.protocol === 'file:' ||
  self.location.hostname === 'localhost' && self.location.protocol === 'capacitor'

const urlsToCache = [
  BASE_PATH + '/',
  BASE_PATH + '/index.html',
  BASE_PATH + '/styles/globals.css',
  BASE_PATH + '/manifest.json'
]

self.addEventListener('install', event => {
  if (isNativeShell) {
    // Skip waiting so the activate hook (which self-destructs) fires
    // immediately rather than waiting for all controlled clients to
    // close.
    event.waitUntil(self.skipWaiting())
    return
  }
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', event => {
  if (isNativeShell) {
    // SELF-DESTRUCT: wipe every Cache Storage entry, claim clients
    // (so we can immediately re-redirect them through the sandbox),
    // then unregister so subsequent loads don't go through us at all.
    event.waitUntil((async () => {
      try {
        const keys = await caches.keys()
        await Promise.all(keys.map(k => caches.delete(k)))
      } catch { /* */ }
      try { await self.clients.claim() } catch { /* */ }
      try {
        const clients = await self.clients.matchAll({ type: 'window' })
        for (const c of clients) {
          // Force a reload after unregister so the app boots without
          // SW interception → fresh chunks straight from app sandbox.
          try { c.navigate(c.url) } catch { /* */ }
        }
      } catch { /* */ }
      try { await self.registration.unregister() } catch { /* */ }
    })())
    return
  }
  event.waitUntil(
    caches.keys().then(cacheNames => Promise.all(
      cacheNames.map(name => name !== CACHE_NAME ? caches.delete(name) : null)
    )).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', event => {
  // On native shell, never intercept — let WebView load directly from
  // the app bundle. (We've also unregistered, but until the page
  // reloads this listener might still fire for in-flight requests.)
  if (isNativeShell) return
  if (!event.request.url.startsWith(self.location.origin)) return

  event.respondWith(
    caches.match(event.request).then(response => {
      if (response) return response
      const fetchRequest = event.request.clone()
      return fetch(fetchRequest).then(response => {
        if (!response || response.status !== 200 || response.type !== 'basic') return response
        const responseToCache = response.clone()
        caches.open(CACHE_NAME).then(cache => {
          if (event.request.method === 'GET') cache.put(event.request, responseToCache)
        })
        return response
      }).catch(() => {
        if (event.request.destination === 'document') {
          return caches.match(BASE_PATH + '/index.html')
        }
      })
    })
  )
})

self.addEventListener('message', event => {
  if (event.data?.action === 'skipWaiting') self.skipWaiting()
})
