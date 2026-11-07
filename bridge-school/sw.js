// Offline cache. Change VERSION whenever any file changes, so installed copies update.
const APP = 'bridge-school';
const VERSION = APP + '-v1';
const FILES = [
  './',
  './index.html',
  './engine.js',
  './app.js',
  './manifest.webmanifest',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png',
  './fonts/bodoni-moda-latin-500-normal.woff2',
  './fonts/bodoni-moda-latin-700-normal.woff2',
  './fonts/bodoni-moda-latin-700-italic.woff2',
  './fonts/figtree-latin-400-normal.woff2',
  './fonts/figtree-latin-500-normal.woff2',
  './fonts/figtree-latin-600-normal.woff2',
  './fonts/figtree-latin-700-normal.woff2',
];

self.addEventListener('install', e => {
  // cache: 'reload' skips the browser's HTTP cache, so a fresh install gets the new files.
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
