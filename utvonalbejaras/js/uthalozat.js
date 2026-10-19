// Országos úthálózati adat (NAP) betöltése és lekérdezése.
//
// A Nemzeti Adathozzáférési Pont (napportal.kozut.hu) regisztráció után
// közzéteszi az országos úthálózat vonalas állományát — többek között
// GeoJSON formátumban. Ha ezt egyszer betöltjük, a bejárás minden pontjához
// helyben, hálózat nélkül megmondható az útszám és — ha az adat tartalmazza
// a szelvényezést — a km szelvény is.
//
// Az állomány mezőneveit nem ismerjük előre (és verziónként változhatnak),
// ezért az app megpróbálja kitalálni, melyik mező mit jelent, és a
// felhasználó felül tudja bírálni.

import { eovToWgs84 } from './eov.js';
import { unzip } from './docx.js';

/** Mezőnév-tippek szerepenként (ékezet és elválasztók nélkül hasonlítunk). */
const FIELD_HINTS = {
  utszam: ['utszam', 'utszama', 'utszamozas', 'utjel', 'jel', 'szam', 'ref', 'road', 'roadnumber', 'roadref', 'kozutszam'],
  kmKezd: ['kezdoszelveny', 'kezdoszelv', 'szelvenykezd', 'kmkezd', 'kezdokm', 'kmtol', 'fromkm', 'kmfrom', 'kezdo', 'start'],
  kmVeg: ['vegszelveny', 'vegszelv', 'szelvenyveg', 'kmveg', 'vegkm', 'kmig', 'tokm', 'kmto', 'veg', 'end'],
  telepules: ['telepules', 'telepulesnev', 'helyseg', 'varos', 'kozigegyseg', 'settlement', 'city', 'town'],
};

const norm = (s) => String(s).toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]/g, '');

/**
 * Melyik mező melyik szerepre a legjobb tipp.
 *
 * A szelvénymezők neve sokféle lehet („KEZDOSZELVENY”, „km szelvény -tól”,
 * „szelv_kezd”), ezért a szelvényre utaló szavak mellett a kezdetre/végre
 * utaló toldalékot is nézzük.
 */
export function guessFields(sample) {
  const keys = Object.keys(sample || {});
  const out = {};
  for (const [role, hints] of Object.entries(FIELD_HINTS)) {
    let best = null;
    let bestScore = 0;
    for (const key of keys) {
      const n = norm(key);
      let score = 0;
      for (let i = 0; i < hints.length; i++) {
        const h = hints[i];
        const sc = n === h ? 100 - i : n.includes(h) ? 50 - i : 0;
        if (sc > score) score = sc;
      }
      // „szelvény” vagy „km” + kezdet/vég jelölés
      if ((role === 'kmKezd' || role === 'kmVeg') && (n.includes('szelv') || n.includes('km'))) {
        const kezd = /(tol|kezd|from|start|eleje|^km$)/.test(n);
        const veg = /(ig|veg|end|vege)$/.test(n) || n.includes('tokm') || n.includes('kmig');
        if (role === 'kmKezd' && kezd && score < 40) score = 40;
        if (role === 'kmVeg' && veg && !kezd && score < 40) score = 40;
      }
      if (score > bestScore) { bestScore = score; best = key; }
    }
    if (best) out[role] = best;
  }
  // ugyanaz a mező ne legyen a kezdet és a vég is
  if (out.kmKezd && out.kmKezd === out.kmVeg) delete out.kmVeg;
  return out;
}

/** Szelvényérték méterben: „27+387”, „27,387 km”, 27387, 27.387 is lehet. */
function toMeters(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') {
    // a 10 000-nél nagyobb szám biztosan méter, az alatta lévő inkább km
    return value > 10000 ? value : value * 1000;
  }
  const s = String(value).trim().replace(/\s+/g, '');
  let m = /^(\d+)\+(\d+)$/.exec(s);                        // 27+387
  if (m) return Number(m[1]) * 1000 + Number(m[2]);
  m = /^(\d+)[.,](\d+)$/.exec(s);                          // 27,387 (km)
  if (m) return Number(m[1]) * 1000 + Number(m[2].padEnd(3, '0').slice(0, 3));
  const n = Number(s.replace(',', '.'));
  if (!isFinite(n)) return null;
  return n > 10000 ? n : n * 1000;
}

/** „27 km + 387 m” — ahogy az útszámkereső is kiírja. */
export function formatSzelveny(meters) {
  if (meters == null || !isFinite(meters)) return '';
  const total = Math.round(meters);          // előbb kerekítünk, különben
  const km = Math.floor(total / 1000);       // „27 km + 1000 m” lenne
  return `${km} km + ${total - km * 1000} m`;
}

const EARTH = 6371008.8;
const DEG = Math.PI / 180;

/** Két pont távolsága méterben (síkbeli közelítés — pár km-en belül pontos). */
function metersBetween(latA, lonA, latB, lonB) {
  const k = Math.cos(((latA + latB) / 2) * DEG);
  return Math.hypot((latA - latB) * DEG * EARTH, (lonA - lonB) * DEG * EARTH * k);
}

/** A ponthoz legközelebbi pont a szakaszon, és a szakasz elejétől mért táv. */
function projectToSegment(lat, lon, aLat, aLon, bLat, bLon) {
  const k = Math.cos(lat * DEG);
  const ax = aLon * k, ay = aLat, bx = bLon * k, by = bLat, px = lon * k, py = lat;
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const cLat = ay + t * dy;
  const cLon = (ax + t * dx) / (k || 1);
  return { t, distance: metersBetween(lat, lon, cLat, cLon) };
}

/* ------------------------------------------------------- betöltés */

const isZip = (buf) => buf.byteLength > 4 && new Uint8Array(buf, 0, 2)[0] === 0x50
  && new Uint8Array(buf, 0, 2)[1] === 0x4b;

/** GeoJSON kinyerése: sima fájl vagy ZIP, amiben benne van. */
async function readGeoJson(file) {
  const buf = await file.arrayBuffer();
  if (isZip(buf)) {
    const parts = await unzip(buf);
    const hit = parts.find((p) => /\.(geojson|json)$/i.test(p.name));
    if (!hit) {
      throw new Error('a ZIP-ben nincs GeoJSON (a Shape formátumot az app nem olvassa)');
    }
    return JSON.parse(new TextDecoder().decode(hit.data));
  }
  return JSON.parse(new TextDecoder().decode(buf));
}

/** EOV-nak látszik-e a koordináta (a GeoJSON [x, y] sorrendben tárol). */
function looksLikeEov(c) {
  return Math.abs(c[0]) > 1000 && c[0] > 300000 && c[0] < 1000000
    && c[1] > 20000 && c[1] < 400000;
}

/**
 * Úthálózat feldolgozása keresésre alkalmas, tömör alakra.
 *
 * @param {File|Blob} file   GeoJSON (vagy ZIP, benne GeoJSON)
 * @param {object} [fields]  mezőhozzárendelés; ha nincs, az app tippel
 * @param {(msg: string) => void} [progress]
 */
export async function buildNetwork(file, fields, progress = () => {}) {
  progress('Úthálózati adat beolvasása…');
  const data = await readGeoJson(file);
  const features = data && (data.features || (data.type === 'Feature' ? [data] : null));
  if (!features || !features.length) throw new Error('nincs benne úthálózati vonal');

  const sample = (features.find((f) => f.properties) || {}).properties || {};
  const map = Object.assign(guessFields(sample), fields || {});
  if (!map.utszam) throw new Error('nem találtam útszám mezőt az adatban');

  // vetület: EOV vagy már WGS84
  let eov = false;
  for (const f of features) {
    const c = firstCoord(f.geometry);
    if (c) { eov = looksLikeEov(c); break; }
  }

  const roads = [];
  const roadIndex = new Map();
  const aLat = []; const aLon = []; const bLat = []; const bLon = [];
  const segRoad = []; const segKm = []; const segLen = [];
  let skipped = 0;

  features.forEach((f, n) => {
    if (n % 5000 === 0) progress(`Úthálózat feldolgozása… (${n}/${features.length})`);
    const g = f.geometry;
    if (!g) return;
    const lines = g.type === 'LineString' ? [g.coordinates]
      : g.type === 'MultiLineString' ? g.coordinates : null;
    if (!lines) { skipped += 1; return; }

    const props = f.properties || {};
    const utszam = props[map.utszam];
    if (utszam == null || utszam === '') { skipped += 1; return; }
    const name = String(utszam).trim();
    let ri = roadIndex.get(name);
    if (ri == null) { ri = roads.length; roads.push(name); roadIndex.set(name, ri); }

    const kmFrom = map.kmKezd ? toMeters(props[map.kmKezd]) : null;
    const kmTo = map.kmVeg ? toMeters(props[map.kmVeg]) : null;

    for (const line of lines) {
      const pts = line.map((c) => (eov ? eovToWgs84(c[0], c[1]) : { lat: c[1], lon: c[0] }));
      // a vonal hossza a szelvény szétosztásához
      let total = 0;
      for (let i = 1; i < pts.length; i++) {
        total += metersBetween(pts[i - 1].lat, pts[i - 1].lon, pts[i].lat, pts[i].lon);
      }
      let run = 0;
      for (let i = 1; i < pts.length; i++) {
        const d = metersBetween(pts[i - 1].lat, pts[i - 1].lon, pts[i].lat, pts[i].lon);
        if (!d) continue;
        aLat.push(pts[i - 1].lat); aLon.push(pts[i - 1].lon);
        bLat.push(pts[i].lat); bLon.push(pts[i].lon);
        segRoad.push(ri);
        segLen.push(d);
        // a szakasz elejéhez tartozó szelvény (ha van mihez viszonyítani)
        segKm.push(kmFrom == null ? null
          : kmTo != null && total > 0 ? kmFrom + ((kmTo - kmFrom) * run) / total
            : kmFrom + run);
        run += d;
      }
    }
  });

  if (!segRoad.length) throw new Error('nem találtam vonalas útszakaszt az adatban');

  // rácsos index: 0,02 fok ~ 1,5–2 km, így pár tucat szakaszt kell nézni
  const cells = new Map();
  for (let i = 0; i < segRoad.length; i++) {
    const key = cellKey(aLat[i], aLon[i]);
    let arr = cells.get(key);
    if (!arr) { arr = []; cells.set(key, arr); }
    arr.push(i);
    const key2 = cellKey(bLat[i], bLon[i]);
    if (key2 !== key) {
      arr = cells.get(key2);
      if (!arr) { arr = []; cells.set(key2, arr); }
      arr.push(i);
    }
  }

  progress('Úthálózat mentése…');
  return {
    version: 1,
    created: Date.now(),
    name: file.name || 'úthálózat',
    fields: map,
    sampleKeys: Object.keys(sample),
    roads,
    aLat: Float64Array.from(aLat),
    aLon: Float64Array.from(aLon),
    bLat: Float64Array.from(bLat),
    bLon: Float64Array.from(bLon),
    segRoad: Int32Array.from(segRoad),
    segKm: Float64Array.from(segKm.map((v) => (v == null ? NaN : v))),
    segLen: Float64Array.from(segLen),
    cells,
    count: segRoad.length,
    skipped,
    hasSzelveny: segKm.some((v) => v != null),
  };
}

function firstCoord(g) {
  if (!g) return null;
  if (g.type === 'LineString') return g.coordinates[0];
  if (g.type === 'MultiLineString') return g.coordinates[0] && g.coordinates[0][0];
  if (g.type === 'Point') return g.coordinates;
  return null;
}

const CELL = 0.02;
const cellKey = (lat, lon) => `${Math.round(lat / CELL)}|${Math.round(lon / CELL)}`;

/* ------------------------------------------------------ lekérdezés */

/**
 * Melyik út melyik szelvényénél van ez a pont.
 * @returns {{utszam: string, szelveny: string, meters: number|null, distance: number}|null}
 */
export function lookupRoad(net, lat, lon, maxDistance = 120) {
  if (!net || !net.count) return null;
  let best = -1;
  let bestD = Infinity;
  let bestT = 0;

  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const arr = net.cells.get(cellKey(lat + dy * CELL, lon + dx * CELL));
      if (!arr) continue;
      for (const i of arr) {
        const p = projectToSegment(lat, lon, net.aLat[i], net.aLon[i], net.bLat[i], net.bLon[i]);
        if (p.distance < bestD) { bestD = p.distance; best = i; bestT = p.t; }
      }
    }
  }
  if (best < 0 || bestD > maxDistance) return null;

  const km = net.segKm[best];
  const meters = isFinite(km) ? km + bestT * net.segLen[best] : null;
  return {
    utszam: net.roads[net.segRoad[best]],
    szelveny: formatSzelveny(meters),
    meters,
    distance: Math.round(bestD),
  };
}
