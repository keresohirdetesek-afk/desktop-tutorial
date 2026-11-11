// Útkövetés online útvonaltervezővel — NAP-adat nélkül is.
//
// A NAP úthálózati állománnyal az app offline, a készüléken számol utat.
// Csakhogy azt a fájlt le kell tölteni, be kell tölteni, és eszközönként
// külön. Ha ez nincs meg, a rajzolt vonal egyenes szakaszokból áll.
//
// Ezért van egy második, kényelmesebb út: egy nyilvános útvonaltervező
// (OSRM, OpenStreetMap-adatból). Két pont koordinátáját elküldjük neki, és
// visszaadja a közöttük vezető út vonalát.
//
// FONTOS, és ezért kapcsolható:
//   - a két pont koordinátája elhagyja a készüléket (maga a bejárás, a
//     fotók és minden más nem),
//   - internet kell hozzá,
//   - a szolgáltatás ingyenes, de nem garantált: ha nem válaszol, a vonal
//     egyenes marad, és az app ezt ki is írja,
//   - az útszámot és a km szelvényt NEM tudja — az továbbra is a NAP-adat
//     dolga.
//
// Alapból ki van kapcsolva; a felhasználó kapcsolja be a szerkesztőben.

const ROUTER_ALAP = 'https://router.project-osrm.org';

/** Saját (céges) OSRM-kiszolgáló is megadható — és a tesztek is ezt használják. */
function router() {
  try { return localStorage.getItem('onlineUtUrl') || ROUTER_ALAP; } catch (_) { return ROUTER_ALAP; }
}
const TIMEOUT_MS = 7000;
const MAX_PAIR_KM = 200;     // ennél távolabbi két pont biztosan félrekoppintás

export function onlineRouting() {
  try { return localStorage.getItem('onlineUt') === '1'; } catch (_) { return false; }
}

export function setOnlineRouting(on) {
  try { localStorage.setItem('onlineUt', on ? '1' : '0'); } catch (_) {}
}

/** Lekérés időkorláttal — a szerkesztő nem állhat meg egy lassú válasz miatt. */
async function ask(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, mode: 'cors' });
    if (!res.ok) return null;
    const data = await res.json();
    return data && data.code === 'Ok' ? data : null;
  } catch (_) {
    return null;              // nincs net, lassú válasz, elutasított kérés
  } finally {
    clearTimeout(timer);
  }
}

const coord = (p) => `${Number(p.lon).toFixed(6)},${Number(p.lat).toFixed(6)}`;

const kmBetween = (a, b) => {
  const dLat = (b.lat - a.lat) * 111.32;
  const dLon = (b.lon - a.lon) * 111.32 * Math.cos(((a.lat + b.lat) / 2 * Math.PI) / 180);
  return Math.hypot(dLat, dLon);
};

/**
 * A ponthoz legközelebbi út pontja.
 * @returns {{lat, lon, nev}|null}
 */
export async function snapOnline(pt) {
  if (!onlineRouting() || pt == null || pt.lat == null) return null;
  const data = await ask(`${router()}/nearest/v1/driving/${coord(pt)}?number=1`);
  const w = data && data.waypoints && data.waypoints[0];
  if (!w || !Array.isArray(w.location)) return null;
  // ha az út messzebb van 120 méternél, ne rángassuk oda a pontot
  if (w.distance != null && w.distance > 120) return null;
  return { lat: w.location[1], lon: w.location[0], nev: w.name || '' };
}

/**
 * A két pont között vezető út vonala.
 * @returns {Array<{lat, lon}>|null} a KÖZBENSŐ pontok (a két végpont nélkül),
 *   vagy null, ha nincs útvonal / nincs válasz.
 */
export async function routeOnline(from, to) {
  if (!onlineRouting() || !from || !to) return null;
  if (kmBetween(from, to) > MAX_PAIR_KM) return null;

  const url = `${router()}/route/v1/driving/${coord(from)};${coord(to)}`
    + '?overview=full&geometries=geojson&alternatives=false&steps=false';
  const data = await ask(url);
  const route = data && data.routes && data.routes[0];
  const line = route && route.geometry && route.geometry.coordinates;
  if (!Array.isArray(line) || line.length < 2) return null;

  // A geometria a két végponttal kezdődik és végződik; a hívó maga teszi le
  // a végpontot, ezért csak a közbenső pontok kellenek.
  const mid = line.slice(1, -1)
    .filter((c) => Array.isArray(c) && c.length >= 2)
    .map((c) => ({ lat: c[1], lon: c[0] }));
  return mid;
}

export const ROUTER_HOST = 'router.project-osrm.org';
