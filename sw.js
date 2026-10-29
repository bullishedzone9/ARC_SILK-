const CACHE_NAME = "arcsilk-shell-v1";
const SHELL = [
  "./index.html",
  "./manifest.webmanifest",
  "./arcsilk-icon.svg"
];
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith("arcsilk-shell-") && key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(async () => (await caches.match("./index.html")) || Response.error()));
    return;
  }
  if (url.pathname.endsWith("/manifest.webmanifest") || url.pathname.endsWith("/arcsilk-icon.svg")) {
    event.respondWith(caches.match(request).then(cached => cached || fetch(request)));
  }
});