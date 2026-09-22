// OpenStreetMap csempék betöltése és gyorsítótárazása.
//
// Külső térképkönyvtár nélkül: a csempéket közvetlenül a nyomvonal vásznára
// rajzoljuk. Ami már egyszer letöltődött, offline is megmarad (Cache API),
// így a bejárt terület terepen, hálózat nélkül is látszik.

const TILE_CACHE = 'utvonalbejaras-tiles';
const MAX_MEMORY_TILES = 400;
const MAX_PARALLEL = 6;

export const TILE_SIZE = 256;
export const ATTRIBUTION = '© OpenStreetMap közreműködők';

/**
 * Alapértelmezetten az OSM nyilvános csempeszervere. Saját vagy fizetős
 * szolgáltató a localStorage `tileUrl` kulcsával adható meg — céges,
 * nagy forgalmú használathoz ez az ajánlott (az OSM szervere közösségi
 * erőforrás, tömeges letöltésre nem való).
 */
const DEFAULT_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

export function tileUrlTemplate() {
  try {
    return localStorage.getItem('tileUrl') || DEFAULT_URL;
  } catch (_) {
    return DEFAULT_URL;
  }
}

const memory = new Map();      // "z/x/y" -> ImageBitmap | 'loading' | 'error'
const queue = [];
let active = 0;
let listener = () => {};
let enabled = true;

export function setTilesEnabled(on) {
  enabled = !!on;
  if (!enabled) { queue.length = 0; }
}

export function tilesEnabled() {
  return enabled;
}

/** A vászon újrarajzolása, amint befut egy csempe. */
export function onTileLoad(fn) {
  listener = fn || (() => {});
}

/**
 * Egy csempe képe, ha már megvan. Ha még nincs, elindítja a letöltést és
 * null-lal tér vissza — a hívó addig csempe nélkül rajzol.
 */
export function getTile(z, x, y) {
  if (!enabled) return null;
  const n = 2 ** z;
  if (y < 0 || y >= n) return null;
  const wrapped = ((x % n) + n) % n;         // dátumvonalon át is működjön
  const key = `${z}/${wrapped}/${y}`;

  const hit = memory.get(key);
  if (hit && hit !== 'loading' && hit !== 'error') {
    // legutóbb használt elem a sor végére
    memory.delete(key);
    memory.set(key, hit);
    return hit;
  }
  if (hit) return null;                       // épp tölt, vagy hibás

  memory.set(key, 'loading');
  queue.push({ key, z, x: wrapped, y });
  pump();
  return null;
}

function pump() {
  while (active < MAX_PARALLEL && queue.length) {
    const job = queue.shift();
    active++;
    load(job).finally(() => { active--; pump(); });
  }
}

async function load({ key, z, x, y }) {
  const url = tileUrlTemplate()
    .replace('{z}', z).replace('{x}', x).replace('{y}', y);
  try {
    let res = null;
    let fromCache = false;
    try {
      const cache = await caches.open(TILE_CACHE);
      res = await cache.match(url);
      fromCache = !!res;
      if (!res) {
        res = await fetch(url, { mode: 'cors' });
        if (res.ok) cache.put(url, res.clone()).catch(() => {});
      }
    } catch (_) {
      // nincs Cache API (pl. nem biztonságos kapcsolat): sima letöltés
      res = await fetch(url, { mode: 'cors' });
    }
    if (!res || !res.ok) throw new Error('HTTP ' + (res ? res.status : '?'));

    const blob = await res.blob();
    const img = typeof createImageBitmap === 'function'
      ? await createImageBitmap(blob)
      : await blobToImage(blob);

    memory.set(key, img);
    trimMemory();
    listener(fromCache);
  } catch (_) {
    memory.set(key, 'error');
  }
}

function blobToImage(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { resolve(img); setTimeout(() => URL.revokeObjectURL(url), 1000); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('kép')); };
    img.src = url;
  });
}

function trimMemory() {
  while (memory.size > MAX_MEMORY_TILES) {
    const oldest = memory.keys().next().value;
    const val = memory.get(oldest);
    if (val && val.close) val.close();
    memory.delete(oldest);
  }
}

/** Hány csempe van letöltve offline használatra. */
export async function cachedTileCount() {
  try {
    const cache = await caches.open(TILE_CACHE);
    return (await cache.keys()).length;
  } catch (_) {
    return 0;
  }
}

export async function clearTileCache() {
  try {
    await caches.delete(TILE_CACHE);
    for (const [, v] of memory) if (v && v.close) v.close();
    memory.clear();
    return true;
  } catch (_) {
    return false;
  }
}
