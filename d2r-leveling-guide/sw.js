// Offline cache. Change VERSION whenever any file changes, so installed copies update.
const APP = 'd2r-leveling-guide';
const VERSION = APP + '-v1';
const FILES = [
  './',
  './index.html',
  './app.js',
  './data.js',
  './engine.js',
  './manifest.webmanifest',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(VERSION)
      .then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  // Delete only this app's old caches; the other games on this origin keep theirs.
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith(APP + '-') && k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network first, so updates arrive when online; cache as fallback, so it works offline.
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(req, { cache: 'no-cache' })
      .then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true, cacheName: VERSION })
        .then(hit => hit || caches.match('./index.html', { cacheName: VERSION })))
  );
});
