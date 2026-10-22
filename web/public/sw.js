// Vortex of Stories service worker.
// Caches only the app shell (the page, styles, scripts and artwork) so the app opens quickly.
// Story text, chat and account data always come from the server and are never cached.
const CACHE = 'vortex-shell-v1';
const SHELL = ['./', './index.html', './vortex-art.jpg', './favicon.jpg', './manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Never touch requests to other sites, including the database and authentication service.
  if (url.origin !== self.location.origin) return;

  // Built JavaScript and CSS have unique names, so the cached copy never goes stale.
  if (url.pathname.includes('/assets/')) {
    event.respondWith(
      caches.match(request).then((hit) => hit || fetch(request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(request, copy));
        return res;
      }))
    );
    return;
  }

  // Pages: try the network first, and fall back to the cached shell when offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('./index.html'))
    );
  }
});
