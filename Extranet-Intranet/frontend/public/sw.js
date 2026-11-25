/* Global Group service worker.
 * Caches only the app itself (HTML shell, hashed JS/CSS, icons) so the app opens fast and shows an
 * offline page without a connection. It never caches API responses, files or anything personal:
 * /api/, /socket.io/ and course content always go to the network.
 */
const VERSION = 'gg-v2'
const SHELL = `${VERSION}-shell`
const ASSETS = `${VERSION}-assets`
const PRECACHE = ['/', '/offline.html', '/manifest.webmanifest', '/icon.svg', '/icon-192.png', '/icon-512.png']
const MAX_ASSETS = 120

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys()
    await Promise.all(keys.filter((key) => !key.startsWith(VERSION)).map((key) => caches.delete(key)))
    await self.clients.claim()
  })())
})

const bypass = (url) => url.origin !== self.location.origin
  || url.pathname.startsWith('/api/')
  || url.pathname.startsWith('/socket.io/')

async function trim(cacheName) {
  const cache = await caches.open(cacheName)
  const keys = await cache.keys()
  await Promise.all(keys.slice(0, Math.max(0, keys.length - MAX_ASSETS)).map((key) => cache.delete(key)))
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (bypass(url)) return

  // Pages: network first (always the latest app), cached shell or offline page when there is no connection.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(request)
        if (fresh.ok) {
          const cache = await caches.open(SHELL)
          cache.put('/', fresh.clone())
        }
        return fresh
      } catch {
        return (await caches.match('/')) || (await caches.match('/offline.html')) || Response.error()
      }
    })())
    return
  }

  // Built files have a content hash in their name: cache first, they never change.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith((async () => {
      const cached = await caches.match(request)
      if (cached) return cached
      const response = await fetch(request)
      if (response.ok) {
        const cache = await caches.open(ASSETS)
        await cache.put(request, response.clone())
        trim(ASSETS)
      }
      return response
    })())
    return
  }

  // Icons and other public files: cached copy if offline.
  if (PRECACHE.includes(url.pathname)) {
    event.respondWith(fetch(request).catch(() => caches.match(request)))
  }
})

// ---- Phone and desktop alerts (Web Push) ----
// The app hands over the person's dictionary (src/i18n/index.js) so alerts are shown in their language.
const I18N = `${VERSION}-i18n`
const I18N_KEY = '/__gg-i18n.json'

self.addEventListener('message', (event) => {
  const message = event.data
  if (message?.type !== 'gg-i18n' || typeof message.lang !== 'string') return
  if (new URL(event.origin || self.location.origin).origin !== self.location.origin) return
  const body = JSON.stringify({ lang: message.lang, dict: message.dict && typeof message.dict === 'object' ? message.dict : null })
  event.waitUntil(caches.open(I18N).then((cache) => cache.put(I18N_KEY, new Response(body, { headers: { 'Content-Type': 'application/json' } }))))
})

async function dictionary() {
  try {
    const cached = await caches.match(I18N_KEY, { cacheName: I18N })
    return cached ? (await cached.json()).dict : null
  } catch {
    return null
  }
}

// The payload is { id, type, title, body, link } from the server; only in-app links are opened.
self.addEventListener('push', (event) => {
  let data
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { title: event.data?.text() }
  }
  event.waitUntil((async () => {
    const dict = await dictionary()
    const tr = (text) => (text && dict && typeof dict[text] === 'string' ? dict[text] : text)
    await self.registration.showNotification(tr(data.title) || 'Global Group', {
      body: tr(data.body) || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: data.id ? `gg-${data.id}` : undefined,
      data: { link: typeof data.link === 'string' && data.link.startsWith('/') ? data.link : '/' },
    })
  })())
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = new URL(event.notification.data?.link || '/', self.location.origin).href
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const existing = windows.find((client) => new URL(client.url).origin === self.location.origin)
    if (existing) {
      await existing.focus()
      return existing.navigate(target).catch(() => existing.postMessage({ type: 'open', link: target }))
    }
    return self.clients.openWindow(target)
  })())
})

// The browser renewed the subscription: tell the app so it can save the new one at the next start.
self.addEventListener('pushsubscriptionchange', () => {
  self.clients.matchAll({ type: 'window' }).then((windows) => windows.forEach((client) => client.postMessage({ type: 'push-renew' })))
})
