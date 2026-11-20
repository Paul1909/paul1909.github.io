// Offline mode was removed. Phones that installed the old worker fetch this file,
// which deletes this app's cache and unregisters itself. Other arcade apps are untouched.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(
  caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('accurate-horoscope-')).map(k => caches.delete(k))))
    .then(() => self.registration.unregister())
));
