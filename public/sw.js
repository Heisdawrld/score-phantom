// ScorePhantom Service Worker v3
const CACHE_NAME = 'scorephantom-v3';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

// Install: cache ONLY icons (never cache index.html)
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activate: clean up all old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: network-first for EVERYTHING except icons
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Always network-first for HTML and API calls (never serve stale index.html)
  if (
    url.pathname === '/' ||
    url.pathname === '/index.html' ||
    url.pathname.startsWith('/api') ||
    url.pathname.startsWith('/acca') ||
    url.pathname.startsWith('/auth') ||
    url.pathname.startsWith('/fixtures') ||
    url.pathname.startsWith('/predict') ||
    url.pathname.startsWith('/admin')
  ) {
    event.respondWith(
      fetch(event.request).catch(() => {
        // Offline fallback for HTML only
        if (url.pathname === '/' || url.pathname === '/index.html') {
          return caches.match('/index.html');
        }
        return new Response(JSON.stringify({ error: 'Offline — check your connection' }), {
          headers: { 'Content-Type': 'application/json' },
        });
      })
    );
    return;
  }

  // Cache-first only for icons/images
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response.ok && event.request.method === 'GET') {
          // Clone BEFORE the async open so body isn't consumed
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
        }
        return response;
      });
    })
  );
});
