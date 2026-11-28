// Utcás átvezetés a Közút szakaszlistájából.
//
// Az engedélyben a két szelvényezett szakasz közé néha utcanevek kerülnek:
//
//   81 45 -> 27 km
//   Mór, Ipar u. - Hammerstein u. - Mester u. - Gyár u. - Deák Ferenc u.
//   81 26 -> 2 km
//
// Ezek belterületi utak: a NAP országos szelvényadatában nincsenek benne,
// ezért eddig egyenes maradt a helyükön. Itt a nyílt térképadatból
// (OpenStreetMap) kérjük le a megnevezett utcák vonalát, és a két szakasz
// vége között CSAK ezeken az utcákon keresünk utat. Ha nem áll össze,
// inkább nem rajzolunk semmit — a félrevezető vonalnál jobb a figyelmeztetés.
//
// Hálózat kell hozzá, ezért ugyanaz a kapcsoló vonatkozik rá, mint az
// online útkövetésre: „Online kiegészítés”.

const UTCA_OVERPASS = 'https://overpass-api.de/api/interpreter';
const IDOKORLAT_MS = 12000;
const MIN_SUGAR = 1200;          // ekkora körben mindenképpen keresünk
const MAX_SUGAR = 6000;          // ennél nagyobb kört nem kérdezünk le
const KERULO_SZOROZO = 6;        // ennél hosszabb út nem lehet az átvezetés

function overpassUrl() {
  try { return localStorage.getItem('utadatUrl') || UTCA_OVERPASS; } catch (_) { return UTCA_OVERPASS; }
}

/* ------------------------------------------------------------ nevek */

/** Összehasonlításhoz: kisbetű, egy szóköz, pont nélkül. */
function utcaNorm(s) {
  return String(s || '').toLowerCase().replace(/\./g, ' ').replace(/\s+/g, ' ').trim();
}

// az „út” és az „utca” ugyanaz a fajta — az engedély és az OSM gyakran eltér
const UTCA_FAJTA = { utca: 'u', út: 'u', ut: 'u', körút: 'krt', krt: 'krt' };
const fajta = (szo) => UTCA_FAJTA[szo] || szo;

/**
 * Egyezik-e az OSM utcaneve a listában megadottal.
 * „Hammerstein utca” illeszkedik a „Hammerstein Richárd utca” névre is,
 * mert az engedélyben gyakran rövidítve szerepel.
 */
export function utcaEgyezik(osmNev, kertNev) {
  const n = utcaNorm(osmNev);
  const k = utcaNorm(kertNev);
  if (!n || !k) return false;
  if (n === k) return true;
  const nw = n.split(' ');
  const kw = k.split(' ');
  if (nw.length < 2 || kw.length < 2) return false;
  if (fajta(nw[nw.length - 1]) !== fajta(kw[kw.length - 1])) return false;
  const nBase = nw.slice(0, -1);
  const kBase = kw.slice(0, -1);
  return kBase.every((w) => nBase.includes(w));
}

/* ------------------------------------------------------- geometria */

const UTCA_DEG = Math.PI / 180;

function tavolsag(a, b) {
  const dLat = (b.lat - a.lat) * 110574;
  const dLon = (b.lon - a.lon) * 111320 * Math.cos(((a.lat + b.lat) / 2) * UTCA_DEG);
  return Math.hypot(dLat, dLon);
}

/** Csomópont-kulcs: kb. 1 méteres rácsra kerekítve. */
const csomo = (lat, lon) => `${lat.toFixed(5)},${lon.toFixed(5)}`;

/* ---------------------------------------------------------- lekérés */

async function overpassKerdes(query) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), IDOKORLAT_MS);
  try {
    const res = await fetch(overpassUrl(), {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'data=' + encodeURIComponent(query),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data && Array.isArray(data.elements) ? data : null;
  } catch (_) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------------------------------------- út */

/** Legrövidebb út a gráfban (Dijkstra, kis gráfra elég egy egyszerű kupac). */
function legrovidebb(elek, start, cel) {
  const tav = new Map([[start, 0]]);
  const elozo = new Map();
  const kesz = new Set();
  // kis halmaz: egyszerű minimumkeresés is elég gyors (pár ezer csomópont)
  const varo = new Set([start]);
  while (varo.size) {
    let n = null;
    for (const v of varo) if (n === null || tav.get(v) < tav.get(n)) n = v;
    varo.delete(n);
    if (n === cel) break;
    kesz.add(n);
    for (const [szomszed, hossz] of (elek.get(n) || [])) {
      if (kesz.has(szomszed)) continue;
      const uj = tav.get(n) + hossz;
      if (!tav.has(szomszed) || uj < tav.get(szomszed)) {
        tav.set(szomszed, uj);
        elozo.set(szomszed, n);
        varo.add(szomszed);
      }
    }
  }
  if (!tav.has(cel)) return null;
  const ut = [cel];
  let n = cel;
  while (elozo.has(n)) { n = elozo.get(n); ut.push(n); }
  ut.reverse();
  return { ut, hossz: tav.get(cel) };
}

/**
 * A megnevezett utcákból álló vonal a két pont között.
 * A válasz feldolgozása külön, hogy hálózat nélkül is próbálható legyen.
 * @returns {{pts: Array, hossz: number, utcak: string[]}|null}
 */
export function utcaVonalbol(data, nevek, honnan, hova) {
  if (!data || !Array.isArray(data.elements)) return null;

  const elek = new Map();
  const pont = new Map();            // csomókulcs → {lat, lon}
  const talaltUtcak = new Set();
  const hozzaad = (a, b, h) => {
    if (!elek.has(a)) elek.set(a, []);
    elek.get(a).push([b, h]);
  };

  for (const el of data.elements) {
    if (el.type !== 'way' || !el.tags || !Array.isArray(el.geometry)) continue;
    const nev = el.tags.name;
    if (!nev) continue;
    const kert = nevek.find((n) => utcaEgyezik(nev, n));
    if (!kert) continue;
    talaltUtcak.add(nev);
    const g = el.geometry;
    for (let i = 1; i < g.length; i++) {
      const a = csomo(g[i - 1].lat, g[i - 1].lon);
      const b = csomo(g[i].lat, g[i].lon);
      if (a === b) continue;
      pont.set(a, { lat: g[i - 1].lat, lon: g[i - 1].lon });
      pont.set(b, { lat: g[i].lat, lon: g[i].lon });
      const h = tavolsag(g[i - 1], g[i]);
      hozzaad(a, b, h);
      // az egyirányúságot szándékosan nem nézzük: a kísérő útvonalát
      // rajzoljuk, nem navigálunk — a táblák a helyszínen döntenek
      hozzaad(b, a, h);
    }
  }
  if (!pont.size) return null;

  // a két vége: a szakaszvégekhez legközelebbi csomópont
  const legkozelebbi = (p) => {
    let best = null;
    for (const [kulcs, c] of pont) {
      const t = tavolsag(p, c);
      if (!best || t < best.t) best = { kulcs, t, c };
    }
    return best;
  };
  const a = legkozelebbi(honnan);
  const b = legkozelebbi(hova);
  if (!a || !b || a.kulcs === b.kulcs) return null;

  const ut = legrovidebb(elek, a.kulcs, b.kulcs);
  if (!ut) return null;

  // józansági próba: az átvezetés nem lehet sokszorosa a légvonalnak
  const legvonal = Math.max(120, tavolsag(honnan, hova));
  if (ut.hossz > legvonal * KERULO_SZOROZO) return null;

  return {
    pts: ut.ut.map((k) => pont.get(k)),
    hossz: Math.round(ut.hossz),
    utcak: [...talaltUtcak],
  };
}

/**
 * Utcás átvezetés lekérése és megrajzolása.
 * @param {{telepules?: string, nevek: string[]}} atvezetes
 * @param {{lat:number, lon:number}} honnan  az előző szakasz vége
 * @param {{lat:number, lon:number}} hova    a következő szakasz eleje
 */
export async function utcaVonal(atvezetes, honnan, hova) {
  if (!atvezetes || !(atvezetes.nevek || []).length) return null;
  if (!honnan || !hova || honnan.lat == null || hova.lat == null) return null;

  const kozep = { lat: (honnan.lat + hova.lat) / 2, lon: (honnan.lon + hova.lon) / 2 };
  const sugar = Math.min(MAX_SUGAR, Math.max(MIN_SUGAR, Math.round(tavolsag(honnan, hova))));
  const q = `[out:json][timeout:25];
way(around:${sugar},${kozep.lat.toFixed(6)},${kozep.lon.toFixed(6)})[highway][name];
out geom;`;

  const data = await overpassKerdes(q);
  if (!data) return null;
  return utcaVonalbol(data, atvezetes.nevek, honnan, hova);
}
