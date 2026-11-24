// Offline cache. Change VERSION whenever any file changes, so installed copies update.
const APP = 'wire-regions';
const VERSION = APP + '-v1';
const FILES = [
  './',
  './app.js',
  './apple-touch-icon.png',
  './geo.js',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './icon.svg',
  './index.html',
  './manifest.webmanifest',
  './meta.js',
  './flags/ch-ag.svg',
  './flags/ch-ai.svg',
  './flags/ch-ar.svg',
  './flags/ch-be.svg',
  './flags/ch-bl.svg',
  './flags/ch-bs.svg',
  './flags/ch-fr.svg',
  './flags/ch-ge.webp',
  './flags/ch-gl.svg',
  './flags/ch-gr.svg',
  './flags/ch-ju.svg',
  './flags/ch-lu.svg',
  './flags/ch-ne.svg',
  './flags/ch-nw.svg',
  './flags/ch-ow.svg',
  './flags/ch-sg.svg',
  './flags/ch-sh.svg',
  './flags/ch-so.svg',
  './flags/ch-sz.svg',
  './flags/ch-tg.svg',
  './flags/ch-ti.svg',
  './flags/ch-ur.svg',
  './flags/ch-vd.svg',
  './flags/ch-vs.svg',
  './flags/ch-zg.svg',
  './flags/ch-zh.svg',
  './flags/ch.svg',
  './flags/it-abr.svg',
  './flags/it-bas.svg',
  './flags/it-cal.svg',
  './flags/it-cam.svg',
  './flags/it-emr.svg',
  './flags/it-fvg.svg',
  './flags/it-laz.webp',
  './flags/it-lig.svg',
  './flags/it-lom.svg',
  './flags/it-mar.svg',
  './flags/it-mol.svg',
  './flags/it-pie.svg',
  './flags/it-pug.svg',
  './flags/it-sar.svg',
  './flags/it-sic.webp',
  './flags/it-taa.svg',
  './flags/it-tos.webp',
  './flags/it-umb.svg',
  './flags/it-vda.svg',
  './flags/it-ven.webp',
  './flags/it.svg',
  './flags/lt-al.svg',
  './flags/lt-kl.svg',
  './flags/lt-ku.svg',
  './flags/lt-mr.svg',
  './flags/lt-pn.webp',
  './flags/lt-sa.svg',
  './flags/lt-ta.webp',
  './flags/lt-te.webp',
  './flags/lt-ut.svg',
  './flags/lt-vl.svg',
  './flags/lt.svg',
  './flags/nl-dr.svg',
  './flags/nl-fl.svg',
  './flags/nl-fr.svg',
  './flags/nl-ge.svg',
  './flags/nl-gr.svg',
  './flags/nl-li.webp',
  './flags/nl-nb.svg',
  './flags/nl-nh.svg',
  './flags/nl-ov.svg',
  './flags/nl-ut.svg',
  './flags/nl-ze.webp',
  './flags/nl-zh.svg',
  './flags/nl.svg',
  './flags/us-ak.svg',
  './flags/us-al.svg',
  './flags/us-ar.svg',
  './flags/us-az.svg',
  './flags/us-ca.webp',
  './flags/us-co.svg',
  './flags/us-ct.webp',
  './flags/us-de.webp',
  './flags/us-fl.webp',
  './flags/us-ga.svg',
  './flags/us-hi.svg',
  './flags/us-ia.webp',
  './flags/us-id.webp',
  './flags/us-il.webp',
  './flags/us-in.svg',
  './flags/us-ks.webp',
  './flags/us-ky.webp',
  './flags/us-la.webp',
  './flags/us-ma.webp',
  './flags/us-md.svg',
  './flags/us-me.webp',
  './flags/us-mi.webp',
  './flags/us-mn.svg',
  './flags/us-mo.webp',
  './flags/us-ms.svg',
  './flags/us-mt.webp',
  './flags/us-nc.svg',
  './flags/us-nd.webp',
  './flags/us-ne.webp',
  './flags/us-nh.webp',
  './flags/us-nj.webp',
  './flags/us-nm.svg',
  './flags/us-nv.webp',
  './flags/us-ny.webp',
  './flags/us-oh.svg',
  './flags/us-ok.webp',
  './flags/us-or.svg',
  './flags/us-pa.webp',
  './flags/us-ri.svg',
  './flags/us-sc.svg',
  './flags/us-sd.webp',
  './flags/us-tn.svg',
  './flags/us-tx.svg',
  './flags/us-ut.svg',
  './flags/us-va.webp',
  './flags/us-vt.webp',
  './flags/us-wa.webp',
  './flags/us-wi.webp',
  './flags/us-wv.webp',
  './flags/us-wy.svg',
  './flags/us.svg',
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
