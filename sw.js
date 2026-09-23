/* DrawNigh — service worker for the web build.

   Cache name discipline, carried from the v1.0.9 web build and from Order My
   Steps' oms-vN: BUMP THE NUMBER on every build that changes any file listed
   below. A failed upload and a stale cache look identical from the phone, and
   the number is what separates them.

   drawnigh-v1 → first web build, 6 Sep 2026
   drawnigh-v2 → 44px header buffer
   drawnigh-v3 → 84px header buffer + Quick access
   drawnigh-v4 → Web 1.1.4 — The Secret Place, reading aloud, seasons, the
                 square, and the long press that holds the screen light.
   drawnigh-v5 → Web 1.1.4 (NLT) — the New Living Translation, fetched a
                 chapter at a time from Tyndale. NOTE: the fetch handler below
                 already ignores every address that is not this site's own, so
                 api.nlt.to passes straight through and is never cached. That
                 is deliberate: Scripture borrowed over a connection is not
                 ours to keep on the phone.
   drawnigh-v6 → Web 1.1.4 (NLT) — the version is now named in every request
                 to Tyndale. Without it their server answered this key with the
                 SPANISH Bible, and the verses arrived in Spanish.
*/
var CACHE = 'drawnigh-v6';
var FILES = [
  '.',
  'index.html',
  'app.css',
  'app.js',
  'engine.js',
  'qrcode.js',
  'jsqr.js',
  'bible.json',
  'notes.json',
  'manifest.webmanifest',
  'icons/icon-48.png',
  'icons/icon-96.png',
  'icons/icon-128.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) { return c.addAll(FILES); })
          .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        return (k === CACHE) ? null : caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

/* Stale-while-revalidate: the page opens instantly from the cache and the
   fresh copy is fetched behind it for next time. Only same-origin GETs — a
   reading app has nothing else to serve. */
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  if (new URL(e.request.url).origin !== self.location.origin) return;
  e.respondWith(
    caches.match(e.request).then(function (hit) {
      var live = fetch(e.request).then(function (res) {
        if (res && res.status === 200) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
        }
        return res;
      }).catch(function () { return hit; });
      return hit || live;
    })
  );
});
