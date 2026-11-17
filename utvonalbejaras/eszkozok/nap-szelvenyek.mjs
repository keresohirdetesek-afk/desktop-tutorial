#!/usr/bin/env node
// A NAP „szelvényjelek” adatcsomagjából tömör állomány az alkalmazásnak.
//
// Miért: a felhasználónak ne kelljen regisztrálnia a NAP-portálra és fájlt
// töltögetnie. Az állomány az alkalmazással együtt települ, és hetente
// magától frissül (lásd .github/workflows/nap-frissites.yml).
//
// Az adat forrása a Nemzeti Adathozzáférési Pont, CC BY 4.0 licenc alatt —
// a forrásmegjelölés az alkalmazásban és a jegyzőkönyvekben szerepel.
//
//   node eszkozok/nap-szelvenyek.mjs <bemenet> [kimenet.json]
//
// A bemenet lehet:
//   — egy .shp fájl (mellette ugyanazon a néven a .dbf),
//   — vagy egy .geojson/.json fájl.
//
// Alapértelmezett kimenet: adatok/szelvenyjelek.json

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { eovToWgs84 } from '../js/eov.js';
import { readShp, readDbf } from '../js/shapefile.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(here, '..');

const be = process.argv[2];
const ki = process.argv[3] || path.join(appDir, 'adatok', 'szelvenyjelek.json');
if (!be) {
  console.error('Használat: node eszkozok/nap-szelvenyek.mjs <bemenet.shp|.geojson> [kimenet.json]');
  process.exit(1);
}

const bufOf = (f) => {
  const b = readFileSync(f);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
};

/** A pontok és az adataik kinyerése, akármelyik formátumból jöttek. */
function beolvas(forras) {
  if (/\.shp$/i.test(forras)) {
    const dbfUt = forras.replace(/\.shp$/i, '.dbf');
    if (!existsSync(dbfUt)) {
      console.error(`Hiba: a .shp mellett nincs .dbf (${dbfUt}) — abban vannak az adatok.`);
      process.exit(1);
    }
    const geo = readShp(bufOf(forras));
    const adat = readDbf(bufOf(dbfUt));
    if (geo.tipus !== 'pont') {
      console.error('Hiba: ez nem pontréteg. A szelvényjelek adatcsomag kell.');
      process.exit(1);
    }
    return geo.elemek.map((c, i) => (c ? { c, pr: adat.sorok[i] || {} } : null)).filter(Boolean);
  }
  const gj = JSON.parse(readFileSync(forras, 'utf8'));
  const features = gj.features || (gj.type === 'Feature' ? [gj] : []);
  return features
    .filter((f) => f.geometry && f.geometry.type === 'Point')
    .map((f) => ({ c: f.geometry.coordinates, pr: f.properties || {} }));
}

/** A mezőnév állományonként változhat; a NAP-é: kszam, pkod, kmjel. */
const mezo = (pr, nevek) => {
  for (const n of nevek) {
    for (const k of Object.keys(pr)) {
      if (k.toLowerCase() === n) return pr[k];
    }
  }
  return '';
};

/** EOV-nak látszik-e a koordináta (a WGS84 fok sosem ekkora). */
const eovNek = (c) => Math.abs(c[0]) > 180 || Math.abs(c[1]) > 90;

const pontok = beolvas(be);
const utNevek = [];
const utIndex = new Map();
const ut = []; const pk = []; const km = []; const lat = []; const lon = [];
let kihagyva = 0;

for (const { c, pr } of pontok) {
  const kszam = String(mezo(pr, ['kszam', 'utszam', 'ref'])).trim();
  const kmjel = Number(String(mezo(pr, ['kmjel', 'km', 'szelveny'])).replace(',', '.'));
  if (!kszam || !Number.isFinite(kmjel)) { kihagyva += 1; continue; }

  const w = eovNek(c) ? eovToWgs84(c[0], c[1]) : { lat: c[1], lon: c[0] };
  if (!w || !Number.isFinite(w.lat) || !Number.isFinite(w.lon)) { kihagyva += 1; continue; }

  let idx = utIndex.get(kszam);
  if (idx === undefined) { idx = utNevek.length; utNevek.push(kszam); utIndex.set(kszam, idx); }
  ut.push(idx);
  pk.push(Number(mezo(pr, ['pkod', 'palyakod'])) || 0);
  km.push(kmjel);
  // 5 tizedes ≈ 1 méter — szelvénykőnél ennél pontosabbra nincs szükség
  lat.push(Math.round(w.lat * 1e5) / 1e5);
  lon.push(Math.round(w.lon * 1e5) / 1e5);
}

if (!ut.length) {
  console.error('Hiba: egyetlen használható szelvényjel sem jött ki a fájlból.');
  process.exit(1);
}

const adat = {
  verzio: 1,
  keszult: new Date().toISOString().slice(0, 10),
  forras: 'Nemzeti Adathozzáférési Pont (NAP) — Szelvényjelek adatcsomag',
  licenc: 'CC BY 4.0',
  darab: ut.length,
  utak: utNevek,
  ut, pk, km, lat, lon,
};

mkdirSync(path.dirname(ki), { recursive: true });
writeFileSync(ki, JSON.stringify(adat));
const meret = readFileSync(ki).length;
console.log(`kész: ${ki}`);
console.log(`  ${ut.length} szelvényjel, ${utNevek.length} útszám, kihagyva ${kihagyva}`);
console.log(`  méret: ${(meret / 1048576).toFixed(2)} MB (tömörítve ennek a töredéke)`);
