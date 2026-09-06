/* DrawNigh (web) — offline cache.
   Bump CACHE's version number whenever index.html, app.js, engine.js, app.css,
   bible.json or notes.json change — that is what makes a phone that already
   has the app take the new copy. Without the bump it keeps serving the old
   one from cache. */
var CACHE = 'drawnigh-v2';
var ASSETS = [
  './',
  './index.html',
  './app.css',
  './app.js',
  './engine.js',
  './bible.json',
  './notes.json',
  './manifest.webmanifest',
  './icons/icon-16.png',
  './icons/icon-32.png',
  './icons/icon-48.png',
  './icons/icon-96.png',
  './icons/icon-128.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(ASSETS); }));
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

// Serve from cache first (so the app opens instantly and works offline),
// and quietly fetch a fresh copy in the background for next time.
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(function (cached) {
      var network = fetch(e.request).then(function (res) {
        if (res && res.status === 200) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
        }
        return res;
      }).catch(function () { return cached; });
      return cached || network;
    })
  );
});
