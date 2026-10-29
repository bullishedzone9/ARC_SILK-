const CACHE_NAME = "pluginflex-shell-v2";
const CACHE_PREFIX = "pluginflex-shell-";
const SHELL = ["./", "./manifest.webmanifest", "./icon.svg"];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);

  // Keep writes and all cross-origin/private API or storage traffic network-only.
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const cachedShell = await caches.match("./");
        return cachedShell || Response.error();
      })
    );
    return;
  }

  if (url.pathname.endsWith("/manifest.webmanifest") || url.pathname.endsWith("/icon.svg")) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async cache => {
        const cached = await cache.match(request);
        if (cached) return cached;
        return fetch(request);
      })
    );
  }
});
