/* BelajarKuy service worker — offline shell + cache-first untuk aset lokal */
const CACHE = "belajarkuy-v3";
const SHELL = [
  "./",
  "./index.html",
  "./css/style.css",
  "./site.webmanifest",
  "./icons/icon.svg",
  "./js/stopwords.js",
  "./js/textutil.js",
  "./js/summarize.js",
  "./js/flashcards.js",
  "./js/quiz.js",
  "./js/ai.js",
  "./js/extract.js",
  "./js/app.js"
];

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      return c.addAll(SHELL).catch(function () {});
    }).then(function () { self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  /* navigasi: coba cache, fallback ke index */
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req).then(function (resp) {
        if (resp && resp.ok) {
          const copy = resp.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return resp;
      }).catch(function () {
        return caches.match(req).then(function (c) {
          return c || caches.match("./index.html");
        });
      })
    );
    return;
  }

  /* aset CDN (font, pustaka): stale-while-revalidate */
  if (url.origin !== location.origin) {
    e.respondWith(
      caches.match(req).then(function (cached) {
        const fetchP = fetch(req).then(function (resp) {
          if (resp && resp.ok) {
            const copy = resp.clone();
            caches.open(CACHE).then(function (c) { c.put(req, copy); });
          }
          return resp;
        }).catch(function () { return cached; });
        return cached || fetchP;
      })
    );
    return;
  }

  /* aset lokal: stale-while-revalidate (tampilkan cache, perbarui diam-diam) */
  e.respondWith(
    caches.match(req).then(function (cached) {
      const fetchP = fetch(req).then(function (resp) {
        if (resp && resp.ok) {
          const copy = resp.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return resp;
      }).catch(function () { return cached; });
      return cached || fetchP;
    })
  );
});