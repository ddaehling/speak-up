/* Describe It! service worker — offline support on a GitHub Pages subpath.
   Lives at repo root so its scope covers describe.html and index.html.
   BUMP VERSION whenever any precached asset changes, or clients keep the old cache. */
const VERSION = 'v2';
const CACHE = 'describe-' + VERSION;
const BASE = self.registration.scope; // e.g. https://ddaehling.github.io/speak-up/

const SLUGS = [
  'london-big-ben','london-tower-bridge','london-eye','london-oxford-street',
  'wales-snowdonia','wales-caernarfon-castle',
  'liverpool-anfield','liverpool-albert-dock','liverpool-cathedral',
  'ireland-cliffs-of-moher','ireland-beach'
];
const ASSETS = ['', 'describe.html', 'index.html', 'manifest.webmanifest',
  'icons/icon-180.png','icons/icon-192.png','icons/icon-512.png']
  .concat(SLUGS.map(s => 'images/' + s + '.jpg'));

const abs = p => new URL(p, BASE).toString();

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // allSettled so one 404 can't brick the whole install
    await Promise.allSettled(ASSETS.map(async p => {
      try { const r = await fetch(abs(p), { cache: 'no-cache' }); if (r.ok) await cache.put(abs(p), r); } catch (e) { console.warn('[sw] precache miss', p); }
    }));
    const cs = await self.clients.matchAll({ includeUncontrolled: true });
    cs.forEach(c => c.postMessage({ type: 'cached' }));
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // only same-origin

  const isImg = /\.(jpe?g|png|webp|gif|svg)$/i.test(url.pathname);

  // HTML / navigations: network-first (fresh online, cached offline)
  if (req.mode === 'navigate' || req.destination === 'document') {
    e.respondWith((async () => {
      try {
        const r = await fetch(req);
        const c = await caches.open(CACHE); c.put(req, r.clone());
        return r;
      } catch (err) {
        return (await caches.match(req)) || (await caches.match(abs('describe.html'))) || Response.error();
      }
    })());
    return;
  }

  // images: cache-first (versioned cache handles updates)
  if (isImg) {
    e.respondWith((async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      try { const r = await fetch(req); const c = await caches.open(CACHE); c.put(req, r.clone()); return r; }
      catch (err) { return cached || Response.error(); }
    })());
    return;
  }

  // everything else: cache, then network
  e.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    try { const r = await fetch(req); const c = await caches.open(CACHE); c.put(req, r.clone()); return r; }
    catch (err) { return cached || Response.error(); }
  })());
});
