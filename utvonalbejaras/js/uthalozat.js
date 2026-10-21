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
  const places = [];
  const placeIndex = new Map();
  const segPlace = [];
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

    // település (ha van ilyen mező): ide is lehet majd ugrani a térképen
    let pi = -1;
    if (map.telepules && props[map.telepules]) {
      const pn = String(props[map.telepules]).trim();
      pi = placeIndex.has(pn) ? placeIndex.get(pn) : -1;
      if (pi < 0) { pi = places.length; places.push(pn); placeIndex.set(pn, pi); }
    }

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
        segPlace.push(pi);
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
    places,
    segPlace: Int32Array.from(segPlace),
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
    // a pont rávetítve az útra — ebből lesz az úthoz illesztett útvonal
    lat: net.aLat[best] + (net.bLat[best] - net.aLat[best]) * bestT,
    lon: net.aLon[best] + (net.bLon[best] - net.aLon[best]) * bestT,
    seg: best,
    t: bestT,
  };
}

/* ------------------------------------------- keresés a hálózatban */

/** Egy út adott szelvényének helye — „81” + 27387 m. */
export function pointOnRoad(net, road, meters) {
  if (!net || !net.count) return null;
  const name = String(road).trim().toLowerCase();
  const ri = net.roads.findIndex((r) => String(r).trim().toLowerCase() === name);
  if (ri < 0) return null;

  let best = -1;
  let bestDiff = Infinity;
  let bestT = 0;
  for (let i = 0; i < net.segRoad.length; i++) {
    if (net.segRoad[i] !== ri) continue;
    const km = net.segKm[i];
    if (!isFinite(km)) continue;
    const end = km + net.segLen[i];
    if (meters >= km && meters <= end) {
      return along(net, i, (meters - km) / (net.segLen[i] || 1), road, meters);
    }
    const diff = Math.min(Math.abs(meters - km), Math.abs(meters - end));
    if (diff < bestDiff) { bestDiff = diff; best = i; bestT = meters < km ? 0 : 1; }
  }
  if (best < 0) {
    // szelvény nélküli adat: legalább az út elejét megmutatjuk
    const i = net.segRoad.findIndex((r) => r === ri);
    return i < 0 ? null : along(net, i, 0, road, null);
  }
  return along(net, best, bestT, road, meters);
}

function along(net, i, t, road, meters) {
  const tt = Math.max(0, Math.min(1, t));
  return {
    lat: net.aLat[i] + (net.bLat[i] - net.aLat[i]) * tt,
    lon: net.aLon[i] + (net.bLon[i] - net.aLon[i]) * tt,
    cim: `${road}${meters != null ? ' · ' + formatSzelveny(meters) : ''}`,
  };
}

/** Település helye a hálózatból (a hozzá tartozó szakaszok közepe). */
export function findPlace(net, name) {
  if (!net || !net.places || !net.places.length) return null;
  const want = String(name).trim().toLowerCase();
  let pi = net.places.findIndex((p) => String(p).trim().toLowerCase() === want);
  if (pi < 0) pi = net.places.findIndex((p) => String(p).trim().toLowerCase().startsWith(want));
  if (pi < 0) return null;

  let sumLat = 0; let sumLon = 0; let n = 0;
  for (let i = 0; i < net.segPlace.length; i++) {
    if (net.segPlace[i] !== pi) continue;
    sumLat += net.aLat[i]; sumLon += net.aLon[i]; n += 1;
  }
  if (!n) return null;
  return { lat: sumLat / n, lon: sumLon / n, cim: net.places[pi], span: 4000 };
}

/* ------------------------------------- útvonalkeresés az úthálózaton */

const NODE = 1e5;      // csomópont-rács: kb. 1 m-re egyező végpontok egyek
const nodeKey = (lat, lon) => `${Math.round(lat * NODE)}|${Math.round(lon * NODE)}`;

/** A megadott téglalapba eső szakaszok (a rácsos index alapján). */
function segmentsInBox(net, minLat, minLon, maxLat, maxLon) {
  const out = new Set();
  const y0 = Math.round(minLat / CELL) - 1;
  const y1 = Math.round(maxLat / CELL) + 1;
  const x0 = Math.round(minLon / CELL) - 1;
  const x1 = Math.round(maxLon / CELL) + 1;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const arr = net.cells.get(`${y}|${x}`);
      if (arr) for (const i of arr) out.add(i);
    }
  }
  return out;
}

/**
 * Útvonal két pont között, az úthálózaton haladva.
 *
 * Csak a két pont környékére épít gráfot (ezért gyors), és Dijkstrával
 * keresi a legrövidebb utat. Ha nem talál összefüggő utat, null-t ad —
 * ilyenkor a hívó egyenes vonalat húz.
 *
 * @returns {Array<{lat:number, lon:number}>|null} a közbülső pontok
 */
export function routeBetween(net, from, to, margin = 3000) {
  if (!net || !net.count) return null;
  const degLat = margin / 111320;
  const degLon = margin / (111320 * Math.cos(((from.lat + to.lat) / 2) * DEG) || 1);
  const segs = segmentsInBox(net,
    Math.min(from.lat, to.lat) - degLat, Math.min(from.lon, to.lon) - degLon,
    Math.max(from.lat, to.lat) + degLat, Math.max(from.lon, to.lon) + degLon);
  if (!segs.size) return null;

  // szomszédsági lista a környékbeli szakaszokból
  const adj = new Map();
  const coord = new Map();
  const link = (k, other, len, i) => {
    let arr = adj.get(k);
    if (!arr) { arr = []; adj.set(k, arr); }
    arr.push({ to: other, len, seg: i });
  };
  for (const i of segs) {
    const ka = nodeKey(net.aLat[i], net.aLon[i]);
    const kb = nodeKey(net.bLat[i], net.bLon[i]);
    if (ka === kb) continue;
    coord.set(ka, { lat: net.aLat[i], lon: net.aLon[i] });
    coord.set(kb, { lat: net.bLat[i], lon: net.bLon[i] });
    link(ka, kb, net.segLen[i], i);
    link(kb, ka, net.segLen[i], i);
  }

  const nearestNode = (p) => {
    let best = null;
    let bestD = Infinity;
    for (const [k, c] of coord) {
      const d = metersBetween(p.lat, p.lon, c.lat, c.lon);
      if (d < bestD) { bestD = d; best = k; }
    }
    return bestD < 400 ? best : null;
  };

  const start = nearestNode(from);
  const goal = nearestNode(to);
  if (!start || !goal) return null;
  if (start === goal) return [];

  // Dijkstra — egyszerű, rendezett sorral; a környék kicsi, ez bőven elég
  const dist = new Map([[start, 0]]);
  const prev = new Map();
  const queue = [{ k: start, d: 0 }];
  const done = new Set();
  let found = false;

  while (queue.length) {
    queue.sort((a, b) => a.d - b.d);
    const cur = queue.shift();
    if (done.has(cur.k)) continue;
    done.add(cur.k);
    if (cur.k === goal) { found = true; break; }
    if (done.size > 60000) break;          // ne fusson el a kereséssel
    for (const edge of adj.get(cur.k) || []) {
      const nd = cur.d + edge.len;
      if (nd < (dist.get(edge.to) ?? Infinity)) {
        dist.set(edge.to, nd);
        prev.set(edge.to, cur.k);
        queue.push({ k: edge.to, d: nd });
      }
    }
  }
  if (!found) return null;

  const path = [];
  let k = goal;
  while (k && k !== start) {
    const c = coord.get(k);
    if (c) path.push(c);
    k = prev.get(k);
  }
  path.reverse();
  return path;
}
