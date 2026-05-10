// Network-first service worker. Falls back to cache only when offline.
// Bumped cache name to force purge of v2 (which served stale chunks
// indefinitely and broke sync env-var changes).
const CACHE_NAME = 'dash-cache-v4'

self.addEventListener('install', event => {
  // Take over immediately so the new SW serves the page on the next nav.
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  event.waitUntil(
    Promise.all([
      caches.keys().then(names =>
        Promise.all(names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n)))
      ),
      self.clients.claim()
    ])
  )
})

self.addEventListener('fetch', event => {
  const req = event.request
  // Only handle GETs; let POST/PUT/DELETE pass through (sync push, etc.)
  if (req.method !== 'GET') return

  // NEVER intercept the relay or any cross-origin API call. The SW must
  // not touch /sync/* or wss:// at all.
  let url
  try { url = new URL(req.url) } catch { return }
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/sync/')) return

  // Network-first with cache fallback.
  event.respondWith(
    fetch(req).then(response => {
      // Cache only successful same-origin static responses.
      if (response && response.status === 200 && response.type === 'basic') {
        const copy = response.clone()
        caches.open(CACHE_NAME).then(cache => cache.put(req, copy))
      }
      return response
    }).catch(() => caches.match(req))
  )
})
