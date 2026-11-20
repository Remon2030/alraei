/* الراعي v2.1 — Offline-first app shell. Personal data stays in IndexedDB, not CacheStorage. */
const CACHE = 'alraei-pwa-shell-2.1';
const MAIN = new URL('./index.html', self.registration.scope).href;
const OPTIONAL = ['manifest.webmanifest','status.html','icons/icon-192.png','icons/icon-512.png','icons/icon-maskable-512.png','icons/apple-touch-icon.png'];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    // Installation MUST fail if the main page can't be saved, preserving an older working SW.
    const cache = await caches.open(CACHE);
    const response = await fetch(new Request(MAIN, {cache:'reload'}));
    if (!response.ok || response.type === 'opaque') throw new Error('Main page unavailable for offline storage');
    await cache.put(MAIN, response);
    // Icons and diagnostics must never prevent the app from working offline.
    await Promise.allSettled(OPTIONAL.map(async relative => {
      try {
        const url = new URL(relative, self.registration.scope).href;
        const r = await fetch(new Request(url, {cache:'reload'}));
        if (r.ok && r.type !== 'opaque') await cache.put(url, r);
      } catch (_) { /* optional */ }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Never purge a previous working version unless this one has a valid cached main page.
    if (await cache.match(MAIN)) {
      const keys = await caches.keys();
      await Promise.all(keys.filter(key => key.startsWith('alraei-pwa-shell-') && key !== CACHE)
        .map(key => caches.delete(key)));
    }
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data?.type !== 'CHECK_OFFLINE') return;
  event.waitUntil((async () => {
    const cached = await caches.match(MAIN);
    event.ports?.[0]?.postMessage({ offlineReady: Boolean(cached), version: '2.1' });
  })());
});

function offlineFallback(){
  return new Response('<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>الراعي</title><body style="font:16px system-ui;background:#f4f7f5;color:#123e39;max-width:450px;margin:65px auto;padding:24px;text-align:center"><h1>✝ الراعي</h1><p>لم تكتمل تهيئة التطبيق دون اتصال. افتحه مرة واحدة أثناء توفر الإنترنت من نفس المتصفح أو الأيقونة.</p><button onclick="location.reload()" style="border:0;border-radius:12px;color:white;background:#123e39;padding:12px 20px;font:inherit">إعادة المحاولة</button></body></html>', {headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const u = new URL(req.url);
  if (u.origin !== self.location.origin || !u.pathname.startsWith(new URL(self.registration.scope).pathname)) return;

  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const diagnostic = u.pathname.endsWith('/status.html');
      const wanted = diagnostic ? new URL('./status.html', self.registration.scope).href : MAIN;
      // This never contacts the server if we have the app cached.
      const saved = await cache.match(wanted) || await caches.match(wanted);
      if (saved) return saved;
      try {
        const r = await fetch(req);
        if (r.ok && r.type !== 'opaque') await cache.put(wanted, r.clone());
        return r;
      } catch (_) { return offlineFallback(); }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    try { return await fetch(req); }
    catch (_) { return Response.error(); }
  })());
});
