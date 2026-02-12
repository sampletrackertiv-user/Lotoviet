const CACHE_NAME = 'loto-master-v2-dynamic';
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json'
];

// 1. Install Event: Cache core static files immediately
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// 2. Activate Event: Clean up old caches
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// 3. Fetch Event: Network First, then Cache (Dynamic Caching)
self.addEventListener('fetch', (e) => {
  // Only handle HTTP/HTTPS requests
  if (!e.request.url.startsWith('http')) return;

  e.respondWith(
    fetch(e.request)
      .then((networkResponse) => {
        // If network fetch is successful, clone and cache it
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }

        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(e.request, responseToCache);
        });

        return networkResponse;
      })
      .catch(() => {
        // If network fails (offline), try to get from cache
        return caches.match(e.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          
          // Fallback for navigation requests (e.g., reloading the page while offline)
          if (e.request.mode === 'navigate') {
            return caches.match('./index.html');
          }

          return null; // Resource not found in cache or network
        });
      })
  );
});