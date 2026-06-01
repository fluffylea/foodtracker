/// <reference types="@sveltejs/kit" />
/// <reference lib="esnext" />
/// <reference lib="webworker" />

// App-shell service worker (SvelteKit auto-registers this file).
//
// Goal is "app-feel", not full offline data sync: the versioned build assets and
// static files are precached so the installed PWA opens instantly, and pages are
// served network-first with a cache fallback so a flaky connection still shows
// the last-seen screen instead of the browser's offline error. POSTs (mutations)
// and cross-origin requests (Open Food Facts) always go to the network.

import { build, files, version } from '$service-worker';

const sw = self as unknown as ServiceWorkerGlobalScope;
const CACHE = `plate-${version}`;
// Immutable, content-hashed app assets + static files (icons, manifest).
const PRECACHE = [...build, ...files];

sw.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => sw.skipWaiting())
  );
});

sw.addEventListener('activate', (event) => {
  // Drop caches from older versions, then take control of open tabs.
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => sw.clients.claim())
  );
});

sw.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return; // never cache mutations
  const url = new URL(request.url);
  if (url.origin !== location.origin) return; // skip OFF + other cross-origin

  // Hashed build assets / static files are immutable → cache-first.
  if (build.includes(url.pathname) || files.includes(url.pathname)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Pages and same-origin data → network-first, falling back to the last copy.
  event.respondWith(networkFirst(request));
});

async function cacheFirst(request: Request): Promise<Response> {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
}

async function networkFirst(request: Request): Promise<Response> {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(request);
    if (res.ok && res.type === 'basic') cache.put(request, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(request);
    if (hit) return hit;
    throw err;
  }
}
