/* 世界宗教地图 · Service Worker（网络优先，离线回退） */
/* 静态资源改动后请把 CACHE 版本号 +1，否则旧缓存会继续生效 */
const CACHE = "world-religion-atlas-v6";
const ASSETS = [
  "./",
  "./index.html",
  "./404.html",
  "./manifest.webmanifest",
  "./assets/css/style.css",
  "./assets/js/data.js",
  "./assets/js/spread.js",
  "./assets/js/arrival.js",
  "./assets/js/world-geo.js",
  "./assets/js/map-engine.js",
  "./assets/js/app.js",
  "./assets/icons/icon.svg",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/icon-maskable-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  if (new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    fetch(req).then((res) => {
      if (res && res.status === 200 && res.type === "basic") {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put(req, copy));
      }
      return res;
    }).catch(() => {
      return caches.match(req).then((cached) => {
        if (cached) return cached;
        return caches.match("./index.html");
      });
    })
  );
});
