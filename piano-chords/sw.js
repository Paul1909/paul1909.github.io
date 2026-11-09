// Offline cache. Change VERSION whenever any file changes, so installed copies update.
const APP = 'piano-chords';
const VERSION = APP + '-v5';
const FILES = [
  './',
  './index.html',
  './app.js',
  './glyphs.js',
  './manifest.webmanifest',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png',
  './piano/p31.m4a',
  './piano/p33.m4a',
  './piano/p35.m4a',
  './piano/p37.m4a',
  './piano/p38.m4a',
  './piano/p40.m4a',
  './piano/p41.m4a',
  './piano/p43.m4a',
  './piano/p45.m4a',
  './piano/p47.m4a',
  './piano/p48.m4a',
  './piano/p50.m4a',
  './piano/p52.m4a',
  './piano/p53.m4a',
  './piano/p55.m4a',
  './piano/p56.m4a',
  './piano/p57.m4a',
  './piano/p58.m4a',
  './piano/p59.m4a',
  './piano/p60.m4a',
  './piano/p62.m4a',
  './piano/p64.m4a',
  './piano/p65.m4a',
  './piano/p67.m4a',
  './piano/p69.m4a',
  './piano/p71.m4a',
  './piano/p72.m4a',
  './piano/p74.m4a',
  './piano/p76.m4a',
  './piano/p77.m4a',
  './piano/p79.m4a',
  './piano/p80.m4a',
  './piano/p81.m4a',
  './piano/p82.m4a',
  './piano/p83.m4a',
  './piano/p85.m4a',
  './piano/p86.m4a',
  './piano/p87.m4a',
  './piano/p88.m4a',
  './piano/p89.m4a',
  './piano/p90.m4a',
  './piano/p91.m4a',
  './piano/p92.m4a',
  './piano/p93.m4a',
  './piano/p94.m4a',
  './piano/p95.m4a',
  './piano/p96.m4a',
  './piano/p97.m4a',
  './piano/p98.m4a',
  './piano/p99.m4a',
  './piano/p100.m4a',
  './piano/p101.m4a',
  './piano/p102.m4a',
  './piano/p103.m4a',
  './piano/p104.m4a',
  './piano/p105.m4a',
  './piano/p106.m4a',
  './piano/p107.m4a',
  './piano/p108.m4a',
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
