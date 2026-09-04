// Offline működés: az alkalmazás saját fájljai gyorsítótárba kerülnek.
// Mérési adat nincs — nincs is mit menteni vagy szinkronizálni.

const CACHE = 'atlagsebesseg-v17';
const ASSETS = [
  './',
  'index.html',
  'adatvedelem.html',
  'css/app.css',
  'js/app.js',
  'js/birsag.js',
  'js/gauge.js',
  'js/hang.js',
  'js/megosztas.js',
  'js/geo.js',
  'js/limits.js',
  'js/map.js',
  'js/profil.js',
  'js/tema.js',
  'js/track.js',
  'vendor/fonts/jetbrains-mono-400.woff2',
  'vendor/fonts/jetbrains-mono-700.woff2',
  'vendor/leaflet/leaflet.js',
  'vendor/leaflet/leaflet.css',
  'vendor/leaflet/images/marker-icon.png',
  'vendor/leaflet/images/marker-icon-2x.png',
  'vendor/leaflet/images/marker-shadow.png',
  'vendor/leaflet/images/layers.png',
  'vendor/leaflet/images/layers-2x.png',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' }))))
      .catch(() => {})
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  // A térképcsempék és az Overpass-lekérések mindig a hálózatra mennek,
  // és soha nem kerülnek gyorsítótárba.
  if (new URL(req.url).origin !== location.origin) return;

  /* Az app saját fájljai hálózat-először, 2,5 másodperces türelemmel.

     Korábban gyorsítótár-először mentek, háttérfrissítéssel. Ennek az volt
     a következménye, hogy egy kiadás után az első indítás még a RÉGI appot
     futtatta, és az új kód csak a következő indításkor jelent meg. Aki
     kipróbált egy frissen kitett funkciót, nem találta.

     Hálózat nélkül vagy lassú kapcsolatnál a türelmi idő után a
     gyorsítótár válaszol, tehát az offline működés megmarad.            */
  e.respondWith(halozatEloszor(req));
});

async function halozatEloszor(req) {
  const gyorsitotarbol = caches.match(req);
  try {
    const res = await Promise.race([
      fetch(req),
      new Promise((_, rossz) => setTimeout(() => rossz(new Error('lassu')), 2500)),
    ]);
    if (res && res.ok && res.type === 'basic') {
      const masolat = res.clone();
      caches.open(CACHE).then((c) => c.put(req, masolat));
    }
    return res;
  } catch {
    const hit = await gyorsitotarbol;
    if (hit) return hit;
    if (req.mode === 'navigate') {
      return (await caches.match('index.html')) || (await caches.match('./'));
    }
    throw new Error('nem elérhető');
  }
}
