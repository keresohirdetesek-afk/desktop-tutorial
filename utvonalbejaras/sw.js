// Offline működés: az alkalmazás fájljai gyorsítótárba kerülnek.
// A bejárások adatai IndexedDB-ben vannak, azokat a service worker nem érinti.

const PREFIX = 'utvonalbejaras-';
const CACHE = PREFIX + 'v2';
const ASSETS = [
  './',
  'index.html',
  'css/app.css',
  'js/app.js',
  'js/db.js',
  'js/geo.js',
  'js/ui.js',
  'js/media.js',
  'js/editor.js',
  'js/trackedit.js',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  // Szándékosan nincs elnyelve a hiba: ha egy fájl nem tölthető le, a
  // telepítés elbukik, és marad a korábbi, működő változat — így nem
  // keletkezik féloffline állapot, amiről nem tudni, hogy hiányos.
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        // CSAK a saját korábbi verzióink törölhetők: a GitHub Pages-en több
        // alkalmazás osztozik ugyanazon az eredeten, az ő gyorsítótáruk nem
        // a miénk.
        keys.filter((k) => k.startsWith(PREFIX) && k !== CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// Az alkalmazás lekérdezheti, hogy tényleg készen áll-e offline használatra.
self.addEventListener('message', (e) => {
  if (!e.data || e.data.type !== 'status') return;
  const reply = (payload) => {
    if (e.ports && e.ports[0]) e.ports[0].postMessage(payload);
  };
  caches.open(CACHE)
    .then((c) => c.keys())
    .then((keys) => reply({ version: CACHE, cached: keys.length, expected: ASSETS.length }))
    .catch((err) => reply({ version: CACHE, cached: 0, expected: ASSETS.length, error: String(err) }));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // külső kérés (pl. térkép) menjen a hálózatra

  // Navigáció: hálózat először, offline esetén a gyorsítótárból
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).catch(() => caches.match('index.html').then((r) => r || caches.match('./')))
    );
    return;
  }

  e.respondWith(
    caches.match(req).then((hit) => {
      if (hit) {
        // háttérfrissítés, hogy a következő indítás már a friss fájlt kapja
        fetch(req).then((res) => {
          if (res && res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone()));
        }).catch(() => {});
        return hit;
      }
      return fetch(req).then((res) => {
        if (res && res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      });
    })
  );
});
