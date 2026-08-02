/* Hifz service worker
   -------------------------------------------------------------------------
   Purpose: make the app open instantly and work fully offline, while still
   serving the freshest index.html whenever the device is online — so updates
   land automatically. The app (index.html) compares its own VERSION against the
   published one and shows a gentle update prompt; this worker just makes sure
   an online reload always fetches the newest file.

   You normally only re-upload this file if the caching logic below changes.
   Updating the app itself = upload the new index.html only.
------------------------------------------------------------------------- */

const CACHE = 'hifz-cache-v1';   // bump ONLY when this file's logic changes
const ASSETS = [
  './',
  './index.html',
  'https://fonts.googleapis.com/css2?family=Amiri+Quran&family=IBM+Plex+Sans:wght@400;500;600&display=swap'
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    try { await c.addAll(ASSETS); } catch (err) { /* fonts may fail; ignore */ }
    self.skipWaiting();          // this worker rarely changes, so activate promptly
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    // Delete any cache that isn't the current one — no old versions pile up.
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const isDoc = req.mode === 'navigate' || req.destination === 'document';

  if (isDoc) {
    // Network-first for the page: online users always get the freshest
    // index.html (bypassing the HTTP cache); offline falls back to the cache.
    e.respondWith((async () => {
      try {
        const fresh = await fetch(req, { cache: 'no-store' });
        const c = await caches.open(CACHE);
        c.put('./index.html', fresh.clone());
        c.put('./', fresh.clone());
        return fresh;
      } catch (err) {
        const cached = await caches.match('./index.html') || await caches.match('./');
        return cached || new Response('Offline and no cached copy yet.', {
          status: 503, headers: { 'Content-Type': 'text/plain' }
        });
      }
    })());
    return;
  }

  // Everything else (fonts, etc.): cache-first, then network — and cache it.
  e.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    try {
      const res = await fetch(req);
      if (res && (res.ok || res.type === 'opaque')) {
        const c = await caches.open(CACHE);
        c.put(req, res.clone());
      }
      return res;
    } catch (err) {
      return cached || Response.error();
    }
  })());
});
