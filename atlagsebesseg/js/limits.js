/* Sebességhatárok az útvonal mentén.

   Az átlagsebesség önmagában semmit nem mond: 20 km-en a 130-as autópálya
   után jöhet 80-as útépítés, majd egy 50-es település. Ezért a nyomvonalat
   sebességhatár szerinti szakaszokra bontjuk, és mindegyiket a saját
   korlátozásához mérjük.

   Adatforrás: OpenStreetMap, az Overpass API-n keresztül lekérdezve.
   A lekérdezés a böngészőből indul, kizárólag akkor, ha a felhasználó
   megnyomja a gombot — más szerverrel az app nem beszél.                */

import { decimate, pointToSegment } from './geo.js';

export const OVERPASS_VEGPONTOK = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

// Ennél távolabbi utat már nem tekintünk a nyomvonalhoz tartozónak.
const TALALAT_SUGAR = 40; // méter
// Ennél rövidebb szakaszt nem érdemes külön kezelni (GPS-zaj).
const MIN_SZAKASZ = 120; // méter

/* ------------------------------------------------- maxspeed értelmezése */

const HU_IMPLICIT = {
  'hu:urban': { limit: 50, cimke: 'lakott terület' },
  'hu:rural': { limit: 90, cimke: 'lakott területen kívül' },
  'hu:trunk': { limit: 110, cimke: 'autóút' },
  'hu:motorway': { limit: 130, cimke: 'autópálya' },
  'hu:living_street': { limit: 20, cimke: 'lakó-pihenő övezet' },
};

const UT_ALAPERTELMEZES = {
  motorway: { limit: 130, cimke: 'autópálya (becsült)' },
  motorway_link: { limit: 80, cimke: 'fel-/lehajtó (becsült)' },
  trunk: { limit: 110, cimke: 'autóút (becsült)' },
  trunk_link: { limit: 80, cimke: 'fel-/lehajtó (becsült)' },
  primary: { limit: 90, cimke: 'főút (becsült)' },
  primary_link: { limit: 70, cimke: 'csomópont (becsült)' },
  secondary: { limit: 90, cimke: 'összekötő út (becsült)' },
  secondary_link: { limit: 70, cimke: 'csomópont (becsült)' },
  tertiary: { limit: 90, cimke: 'bekötőút (becsült)' },
  tertiary_link: { limit: 70, cimke: 'csomópont (becsült)' },
  unclassified: { limit: 90, cimke: 'egyéb út (becsült)' },
  residential: { limit: 50, cimke: 'lakóutca (becsült)' },
  living_street: { limit: 20, cimke: 'lakó-pihenő övezet' },
  service: { limit: 30, cimke: 'kiszolgáló út (becsült)' },
};

function szamotOlvas(ertek) {
  if (!ertek) return null;
  const s = String(ertek).trim().toLowerCase();
  if (s === 'walk') return 5;
  if (s === 'none' || s === 'signals' || s === 'variable') return null;
  const mph = s.match(/^(\d+(?:\.\d+)?)\s*mph$/);
  if (mph) return Math.round(parseFloat(mph[1]) * 1.609344);
  const km = s.match(/^(\d+(?:\.\d+)?)(\s*km\/h)?$/);
  if (km) return Math.round(parseFloat(km[1]));
  return null;
}

function implicitOlvas(ertek) {
  if (!ertek) return null;
  const s = String(ertek).trim().toLowerCase();
  if (HU_IMPLICIT[s]) return { ...HU_IMPLICIT[s] };
  // pl. „HU:zone30” vagy „HU:zone:30”
  const zona = s.match(/zone:?(\d+)/);
  if (zona) return { limit: parseInt(zona[1], 10), cimke: `${zona[1]}-es zóna` };
  return null;
}

/**
 * Egy OSM útvonal (way) sebességhatára a címkéiből.
 * @returns {{limit:number, cimke:string, becsult:boolean, utepites:boolean,
 *            lakott:boolean}|null}
 */
export function utHatara(tags) {
  if (!tags) return null;
  const utepites =
    tags.highway === 'construction' ||
    !!tags.construction ||
    !!tags['temporary:maxspeed'] ||
    tags.hazard === 'construction';

  // Ideiglenes (útépítési) korlátozás mindent felülír.
  const ideiglenes = szamotOlvas(tags['temporary:maxspeed']);
  if (ideiglenes) {
    return { limit: ideiglenes, cimke: 'útépítés — ideiglenes korlátozás', becsult: false, utepites: true, lakott: false };
  }

  const kitett = szamotOlvas(tags.maxspeed);
  const implicit =
    implicitOlvas(tags['maxspeed:type']) ||
    implicitOlvas(tags['zone:maxspeed']) ||
    implicitOlvas(tags['source:maxspeed']);
  const lakott =
    /hu:urban/i.test(tags['maxspeed:type'] || '') ||
    /hu:urban/i.test(tags['source:maxspeed'] || '') ||
    /hu:urban/i.test(tags['zone:traffic'] || '') ||
    tags.highway === 'residential' ||
    tags.highway === 'living_street';

  if (kitett) {
    return {
      limit: kitett,
      cimke: implicit ? implicit.cimke : 'kitáblázott korlátozás',
      becsult: false,
      utepites,
      lakott,
    };
  }
  if (implicit) return { ...implicit, becsult: false, utepites, lakott };

  const alap = UT_ALAPERTELMEZES[tags.highway];
  if (alap) return { ...alap, becsult: true, utepites, lakott };
  return null;
}

/* ------------------------------------------------------- Overpass lekérés */

const KIHAGYOTT =
  'footway|path|cycleway|steps|pedestrian|bridleway|track|corridor|platform|raceway';

function lekerdezes(coords) {
  const lista = coords.map((p) => `${p.lat.toFixed(5)},${p.lon.toFixed(5)}`).join(',');
  return `[out:json][timeout:60];
way(around:${TALALAT_SUGAR},${lista})["highway"]["highway"!~"^(${KIHAGYOTT})$"];
out tags geom;`;
}

async function egyKeres(vegpont, query, signal) {
  const res = await fetch(vegpont, {
    method: 'POST',
    body: new URLSearchParams({ data: query }),
    signal,
  });
  if (!res.ok) throw new Error(`Overpass hiba: HTTP ${res.status}`);
  const json = await res.json();
  return json.elements || [];
}

/**
 * Utak lekérése a nyomvonal környékéről. Hosszú útvonalnál több részletben
 * kérdez, hogy egyik kérés se legyen túl nagy.
 */
export async function utakLekerese(points, { onProgress, signal } = {}) {
  const ritka = decimate(points, 60);
  const darabok = [];
  for (let i = 0; i < ritka.length; i += 200) darabok.push(ritka.slice(i, i + 200 + 1));

  const utak = new Map();
  let hiba = null;
  for (let d = 0; d < darabok.length; d++) {
    onProgress?.(d, darabok.length);
    const query = lekerdezes(darabok[d]);
    let siker = false;
    for (const vegpont of OVERPASS_VEGPONTOK) {
      try {
        const elemek = await egyKeres(vegpont, query, signal);
        for (const e of elemek) if (e.type === 'way') utak.set(e.id, e);
        siker = true;
        break;
      } catch (e) {
        hiba = e;
      }
    }
    if (!siker) throw hiba || new Error('Nem sikerült lekérdezni a sebességhatárokat.');
  }
  onProgress?.(darabok.length, darabok.length);
  return [...utak.values()];
}

/* --------------------------------------------------------- illesztés */

/* Rácsos index: a szakaszokat kb. 200 m-es cellákba soroljuk, így egy
   ponthoz csak a szomszédos cellák szakaszait kell végignézni.          */
const CELLA = 0.002; // fok

function cellaKulcs(lat, lon) {
  return `${Math.floor(lat / CELLA)}|${Math.floor(lon / CELLA)}`;
}

function indexEpites(utak) {
  const racs = new Map();
  for (const w of utak) {
    const hatar = utHatara(w.tags);
    if (!hatar || !w.geometry) continue;
    for (let i = 1; i < w.geometry.length; i++) {
      const a = { lat: w.geometry[i - 1].lat, lon: w.geometry[i - 1].lon };
      const b = { lat: w.geometry[i].lat, lon: w.geometry[i].lon };
      const szakasz = { a, b, hatar, nev: w.tags.name || w.tags.ref || '', id: w.id };
      const latMin = Math.min(a.lat, b.lat);
      const latMax = Math.max(a.lat, b.lat);
      const lonMin = Math.min(a.lon, b.lon);
      const lonMax = Math.max(a.lon, b.lon);
      for (let la = Math.floor(latMin / CELLA); la <= Math.floor(latMax / CELLA); la++) {
        for (let lo = Math.floor(lonMin / CELLA); lo <= Math.floor(lonMax / CELLA); lo++) {
          const k = `${la}|${lo}`;
          if (!racs.has(k)) racs.set(k, []);
          racs.get(k).push(szakasz);
        }
      }
    }
  }
  return racs;
}

/* A rácsot és a pontonkénti találatot is megjegyezzük: mérés közben
   másodpercenként újraszámolnánk ugyanazt a több ezer pontot.          */
const RACS_GYORSITO = new WeakMap();
const PONT_GYORSITO = new WeakMap();

/** Nyomvonalpontonként a legközelebbi út sebességhatára (vagy null). */
export function pontonkentiHatar(points, utak) {
  let racs = RACS_GYORSITO.get(utak);
  if (!racs) {
    racs = indexEpites(utak);
    RACS_GYORSITO.set(utak, racs);
  }
  return points.map((p) => {
    const gyors = PONT_GYORSITO.get(p);
    if (gyors && gyors.utak === utak) return gyors.hatar;
    const hatar = keres(p, racs);
    PONT_GYORSITO.set(p, { utak, hatar });
    return hatar;
  });
}

function keres(p, racs) {
  let legjobb = null;
  let legkisebb = TALALAT_SUGAR;
  const la = Math.floor(p.lat / CELLA);
  const lo = Math.floor(p.lon / CELLA);
  for (let i = -1; i <= 1; i++) {
    for (let j = -1; j <= 1; j++) {
      const lista = racs.get(`${la + i}|${lo + j}`);
      if (!lista) continue;
      for (const sz of lista) {
        const d = pointToSegment(p, sz.a, sz.b);
        if (d < legkisebb) {
          legkisebb = d;
          legjobb = sz;
        }
      }
    }
  }
  return legjobb ? { ...legjobb.hatar, nev: legjobb.nev, tavolsag: legkisebb } : null;
}

/** Az ismeretlen pontokat a legközelebbi ismert szomszédról tölti fel. */
function hezagokPotlasa(hatarok) {
  const ki = hatarok.slice();
  let utolso = null;
  for (let i = 0; i < ki.length; i++) {
    if (ki[i]) utolso = ki[i];
    else if (utolso) ki[i] = { ...utolso, potolt: true };
  }
  utolso = null;
  for (let i = ki.length - 1; i >= 0; i--) {
    if (ki[i]) utolso = ki[i];
    else if (utolso) ki[i] = { ...utolso, potolt: true };
  }
  return ki;
}

/**
 * Sebességhatár szerinti szakaszokra bontja a nyomvonalat.
 * @param {Array<{lat,lon,t}>} points időbélyeges nyomvonalpontok
 * @param {Array} hatarok pontonkénti határ (pontonkentiHatar eredménye)
 * @param {number} alapertelmezett ha semmilyen adat nincs, ezzel számol
 * @returns {Array<{tav, ido, limit, cimke, becsult, utepites, lakott, i0, i1}>}
 */
export function szakaszokra(points, hatarok, alapertelmezett) {
  if (points.length < 2) return [];
  const kitoltott = hezagokPotlasa(hatarok).map(
    (h) => h || { limit: alapertelmezett, cimke: 'nincs adat — kézzel megadott', becsult: true }
  );

  const nyers = [];
  for (let i = 1; i < points.length; i++) {
    const h = kitoltott[i];
    const elozo = nyers[nyers.length - 1];
    if (elozo && elozo.limit === h.limit && elozo.utepites === !!h.utepites) {
      elozo.i1 = i;
    } else {
      nyers.push({
        i0: i - 1,
        i1: i,
        limit: h.limit,
        cimke: h.cimke,
        becsult: !!h.becsult,
        potolt: !!h.potolt,
        utepites: !!h.utepites,
        lakott: !!h.lakott,
        nev: h.nev || '',
      });
    }
  }

  // hossz és idő kiszámítása, majd a túl rövid szakaszok beolvasztása
  const merve = nyers.map((sz) => merj(points, sz));
  return osszevon(points, merve);
}

function merj(points, sz) {
  let tav = 0;
  for (let i = sz.i0 + 1; i <= sz.i1; i++) {
    const a = points[i - 1];
    const b = points[i];
    const dLat = (b.lat - a.lat) * (Math.PI / 180);
    const dLon = (b.lon - a.lon) * (Math.PI / 180);
    const la1 = a.lat * (Math.PI / 180);
    const la2 = b.lat * (Math.PI / 180);
    const h =
      Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
    tav += 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  return { ...sz, tav, ido: points[sz.i1].t - points[sz.i0].t };
}

function osszevon(points, szakaszok) {
  const ki = [];
  for (const sz of szakaszok) {
    const elozo = ki[ki.length - 1];
    if (sz.tav < MIN_SZAKASZ && elozo) {
      // rövid, zajos darab: az előzőhöz csatoljuk (a szigorúbb határt tartva)
      elozo.i1 = sz.i1;
      elozo.limit = Math.min(elozo.limit, sz.limit);
      elozo.utepites = elozo.utepites || sz.utepites;
      Object.assign(elozo, merj(points, elozo));
    } else {
      ki.push({ ...sz });
    }
  }
  // ha az első darab volt rövid, most fordítva olvasztjuk be
  if (ki.length > 1 && ki[0].tav < MIN_SZAKASZ) {
    ki[1].i0 = ki[0].i0;
    ki[1].limit = Math.min(ki[0].limit, ki[1].limit);
    Object.assign(ki[1], merj(points, ki[1]));
    ki.shift();
  }
  return ki;
}
