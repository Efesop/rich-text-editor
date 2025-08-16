// Service Worker for Dash Notes PWA - Complete Offline Support
const CACHE_NAME = 'dash-notes-v3'
const BASE_PATH = self.location.pathname.replace(/\/sw\.js$/, '')

// Cache all essential files for offline operation
const urlsToCache = [
  BASE_PATH + '/',
  BASE_PATH + '/index.html',
  BASE_PATH + '/styles/globals.css',
  BASE_PATH + '/manifest.json'
]

// Install event - cache essential files
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
      .then(() => self.skipWaiting())
  )
})

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName)
          }
        })
      )
    }).then(() => self.clients.claim())
  )
})

// Fetch event - serve from cache first, then network
self.addEventListener('fetch', event => {
  // Skip cross-origin requests
  if (!event.request.url.startsWith(self.location.origin)) {
    return
  }

  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Cache hit - return response
        if (response) {
          return response
        }

        // Clone the request
        const fetchRequest = event.request.clone()

        return fetch(fetchRequest).then(response => {
          // Check if valid response
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response
          }

          // Clone the response
          const responseToCache = response.clone()

          // Cache the response for future offline use
          caches.open(CACHE_NAME)
            .then(cache => {
              // Cache all successful GET requests
              if (event.request.method === 'GET') {
                cache.put(event.request, responseToCache)
              }
            })

          return response
        }).catch(() => {
          // Network request failed, serve offline page if available
          if (event.request.destination === 'document') {
            return caches.match(BASE_PATH + '/index.html')
          }
        })
      })
  )
})

// Message event - handle cache updates and user data
self.addEventListener('message', event => {
  if (event.data.action === 'skipWaiting') {
    self.skipWaiting()
  } else if (event.data.type === 'CACHE_USER_DATA') {
    // Cache user data for extra persistence
    cacheUserData(event.data.key, event.data.data, event.data.timestamp)
  }
})

// Cache user data in service worker for extra persistence
async function cacheUserData(key, data, timestamp) {
  try {
    const cache = await caches.open(CACHE_NAME + '-userdata')
    const dataUrl = `/userdata/${key}`
    
    // Create a response with the user data
    const response = new Response(JSON.stringify({
      data: data,
      timestamp: timestamp,
      version: 1
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      }
    })
    
    await cache.put(dataUrl, response)
    console.log('User data cached in service worker:', key)
  } catch (e) {
    console.error('Failed to cache user data in service worker:', e)
  }
}

// Function to retrieve cached user data
async function getCachedUserData(key) {
  try {
    const cache = await caches.open(CACHE_NAME + '-userdata')
    const response = await cache.match(`/userdata/${key}`)
    
    if (response) {
      const data = await response.json()
      return data
    }
  } catch (e) {
    console.error('Failed to retrieve cached user data:', e)
  }
  return null
}