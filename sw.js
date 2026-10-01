// Service worker: makes the film an installable app (Android Chrome "Install app"; the installed app runs
// on Chrome's engine, so WebXR AR / VR work in it). NETWORK FIRST for everything — a new version on the
// site is always what plays; the cache only answers when the device is offline.
const CACHE = 'awc-v1';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
  await self.clients.claim();
})()));
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith((async () => {
    try {
      const res = await fetch(req, { cache: 'no-cache' });
      if (res.ok && res.type === 'basic') { const c = await caches.open(CACHE); c.put(req, res.clone()).catch(() => {}); }
      return res;
    } catch (err) {
      const hit = await caches.match(req, { ignoreSearch: false });
      if (hit) return hit;
      throw err;
    }
  })());
});
