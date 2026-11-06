// Neon Ice Hockey — offline cache (lives in its own folder on the shared arcade site).
// Bump VERSION whenever you change any file, so phones pick up the update.
const VERSION = 'neon-ice-hockey-v2';
const FILES = [
  './',
  './index.html',
  './game.js',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('neon-ice-hockey-') && k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network first (so updates arrive when online), cache as fallback (so it works offline).
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request)
      .then(res => {
        if (res.ok && new URL(event.request.url).origin === self.location.origin) {
          const copy = res.clone();
          caches.open(VERSION).then(c => c.put(event.request, copy));
        }
        return res;
      })
      .catch(() => caches.open(VERSION).then(c => c.match(event.request, { ignoreSearch: true }).then(r => r || c.match('./index.html'))))
  );
});
