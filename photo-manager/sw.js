const CACHE_NAME = "pluginflex-shell-v4";
const CACHE_PREFIX = "pluginflex-shell-";
const SHELL = ["./", "./manifest.webmanifest", "./icon.svg", "./icon-192.png"];
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", event => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(async () => (await caches.match("./")) || Response.error()));
    return;
  }
  if (["/manifest.webmanifest", "/icon.svg", "/icon-192.png"].some(path => url.pathname.endsWith(path))) {
    event.respondWith(caches.open(CACHE_NAME).then(async cache => (await cache.match(request)) || fetch(request)));
  }
});
