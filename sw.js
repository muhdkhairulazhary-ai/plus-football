/* plus+ Football: cache only public, explicitly listed static files.
 * Run `node scripts/update-pwa-cache.mjs` after changing cached content.
 * Football APIs and every cross-origin request are ALWAYS network-only.
 */
const VERSION = 'pwa-v1-567cd9fce351db80';
const CACHE_PREFIX = 'plus-football-static-';
const CACHE_NAME = CACHE_PREFIX + VERSION;
const NETWORK_TIMEOUT_MS = 4000;
const ASSETS = ["/","/index.html","/styles.css","/app.js","/match-data.js","/match-centre.js","/pwa.js","/offline.html","/manifest.webmanifest","/icon.svg","/images/carrick-exit.svg","/images/dion-cools-malaysia-2022-480.webp","/images/dion-cools-malaysia-2022.webp","/images/liverpool-penalty.svg","/images/nations-league.svg","/images/ribut-charles.svg","/images/roberto-de-zerbi-2021-480.webp","/images/roberto-de-zerbi-2021.webp","/images/uefa-champions-league-trophy-2009-480.webp","/images/uefa-champions-league-trophy-2009.webp","/icons/apple-touch-icon-plus-football-v2.png","/icons/apple-touch-icon.png","/icons/icon-192.png","/icons/icon-512.png","/icons/plus-football-192-v2.png","/icons/plus-football-512-v2.png","/icons/plus-football-brand.svg"];
const STATIC_PATHS = new Set(ASSETS);

self.addEventListener('install', event => {
  // Install is all-or-nothing from the browser's perspective: a failed
  // precache never replaces the active worker. No automatic skipWaiting.
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(ASSETS.map(async path => {
      const response = await fetch(new Request(path, {cache: 'reload'}));
      if (!response.ok || response.type === 'opaque') throw Error('Static install unavailable');
      await cache.put(path, response);
    }));
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data?.type === 'ACTIVATE_UPDATE' && event.source?.url?.startsWith(self.location.origin + '/'))
    event.waitUntil(self.skipWaiting());
});

async function networkOnly(request) {
  try { return await fetch(new Request(request, {cache: 'no-store'})); }
  catch {
    return Response.json({error: 'Offline: fresh football data unavailable'}, {
      status: 503, headers: {'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'}
    });
  }
}

async function savedDocument(response) {
  // Mark cached news in the document itself, even when navigator.onLine is
  // misleading (e.g. server outage). No claim that cached news is current.
  const html = (await response.text()).replace('<head>', '<head><meta name="plus-offline" content="true">');
  return new Response(html, {status: 200, headers: {'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store'}});
}

async function networkFirst(request, cacheKey, documentRequest, allowCache) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NETWORK_TIMEOUT_MS);
  try {
    // Never let a long-lived browser HTTP cache pin articles/app.js to an
    // old edition. Cache Storage is only the explicit offline fallback.
    const response = await fetch(new Request(request, {cache: 'no-store', signal: controller.signal}));
    if (response.status >= 500) throw Error('Network unavailable');
    if (allowCache && response.ok && response.type !== 'opaque') {
      try { const cache = await caches.open(CACHE_NAME); await cache.put(cacheKey, response.clone()); }
      catch { /* Storage pressure must not prevent a fresh online response. */ }
    }
    return response;
  } catch {
    let cache;
    try { cache = await caches.open(CACHE_NAME); } catch { /* Private mode/storage eviction. */ }
    const cached = allowCache && cache ? await cache.match(cacheKey) : undefined;
    if (cached) return documentRequest ? savedDocument(cached) : cached;
    if (documentRequest) {
      const fallback = cache ? await cache.match('/offline.html') : undefined;
      if (fallback) return fallback;
      return new Response('Anda di luar talian. Sambung ke internet dan cuba lagi.', {
        status: 503, headers: {'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store'}
      });
    }
    return Response.error();
  } finally { clearTimeout(timer); }
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) {
    event.respondWith(networkOnly(request));
    return;
  }
  const documentRequest = request.mode === 'navigate';
  const path = url.pathname;
  const allowed = STATIC_PATHS.has(path) && !request.headers.has('Authorization');
  if (documentRequest || allowed) {
    event.respondWith(networkFirst(request, path, documentRequest, allowed));
  }
});
