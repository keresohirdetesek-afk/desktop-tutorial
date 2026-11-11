// Útszám és km szelvény nyílt térképadatból (OpenStreetMap / Overpass).
//
// A hiteles forrás a Közút NAP-állománya: ha az be van töltve, mindig az
// dönt. Csakhogy amíg nincs, eddig semmi nem derült ki a helyszínről —
// pedig a közút felé az útszám és a szelvény a legfontosabb adat.
//
// Ez a modul ezt pótolja, amennyire nyílt adatból lehet:
//
//   útszám   – az OSM utak `ref` címkéjéből (81, M35, 4808 …). Ez a
//              térképen is ez a szám, tehát ugyanaz, amit a táblán látni.
//   szelvény – a kilométerkövekből (`highway=milestone`, `distance`):
//              a ponthoz legközelebbi két kő közé arányosan beosztva.
//              Ahol nincs kő feltérképezve, ott nem ad értéket — inkább
//              semmit, mint rosszat.
//
// A szelvény így BECSÜLT érték: a jegyzőkönyvben és az adatlapon meg is
// jelöljük, és kézzel bármikor felülírható.
//
// Hálózat kell hozzá, ezért ugyanaz a kapcsoló vonatkozik rá, mint az
// online útkövetésre (utvonalterv.js), és a lekérdezések eredményét
// eltároljuk, hogy egy bejárás ne küldjön ugyanarra a helyre többször.

import { formatSzelveny } from './uthalozat.js';
import { wgs84ToEov } from './eov.js';

const OVERPASS_ALAP = 'https://osmOverpass-api.de/api/interpreter';
const OSM_TIMEOUT_MS = 9000;
const UT_TAVOLSAG = 80;      // ennél messzebbi utat nem veszünk a ponthoz
const KO_SUGAR = 7000;       // ekkora körben keresünk kilométerkövet

function osmOverpass() {
  try { return localStorage.getItem('utadatUrl') || OVERPASS_ALAP; } catch (_) { return OVERPASS_ALAP; }
}

/* ----------------------------------------------------------- számítás */

const OSM_DEG = Math.PI / 180;

/** Méter-koordináták egy helyi síkon (pár km-en belül pontos). */
function osmMeters(lat, lon, lat0) {
  const k = Math.cos(lat0 * OSM_DEG);
  return { x: lon * 111320 * k, y: lat * 110574 };
}

/** Pont és szakasz távolsága méterben, és a vetítés aránya a szakaszon. */
function osmToSegment(p, a, b) {
  const vx = b.x - a.x, vy = b.y - a.y;
  const len2 = vx * vx + vy * vy;
  let t = len2 ? ((p.x - a.x) * vx + (p.y - a.y) * vy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const dx = a.x + vx * t - p.x, dy = a.y + vy * t - p.y;
  return { distance: Math.hypot(dx, dy), t };
}

/* --------------------------------------------------------- lekérdezés */

async function osmAsk(query) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), OSM_TIMEOUT_MS);
  try {
    const res = await fetch(osmOverpass(), {
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

// ugyanarra a környékre ne kérdezzünk újra: kb. 100 méteres rácsra kerekítve
const osmCache = new Map();
const osmCellKey = (lat, lon) => `${lat.toFixed(3)}|${lon.toFixed(3)}`;

/**
 * Útszám és (ha van kilométerkő) szelvény egy ponthoz.
 * @returns {{utszam, szelveny, meters, telepules, tavolsag, becsult}|null}
 */
export async function lookupOsm(lat, lon) {
  if (lat == null || lon == null) return null;
  const key = osmCellKey(lat, lon);
  if (osmCache.has(key)) return osmCache.get(key);

  const q = `[out:json][timeout:25];
(
  way(around:${UT_TAVOLSAG},${lat},${lon})[highway][ref];
  node(around:${KO_SUGAR},${lat},${lon})[highway=milestone];
);
out geom;`;

  const data = await osmAsk(q);
  if (!data) return null;                 // nincs net / nem válaszolt: ne tároljuk

  const result = parseOsm(data, lat, lon);
  osmCache.set(key, result);
  return result;
}

/** A válasz feldolgozása — külön, hogy tesztelhető legyen. */
export function parseOsm(data, lat, lon) {
  const lat0 = lat;
  const p = osmMeters(lat, lon, lat0);

  // 1. a ponthoz legközelebbi út, aminek van útszáma
  let best = null;
  for (const el of data.elements) {
    if (el.type !== 'way' || !el.tags || !el.tags.ref || !Array.isArray(el.geometry)) continue;
    const g = el.geometry.map((c) => osmMeters(c.lat, c.lon, lat0));
    for (let i = 1; i < g.length; i++) {
      const s = osmToSegment(p, g[i - 1], g[i]);
      if (!best || s.distance < best.distance) {
        best = { distance: s.distance, ref: String(el.tags.ref).trim(), tags: el.tags };
      }
    }
  }
  if (!best) return null;

  // Az OSM több útszámot is írhat egy útra („4808;4817”) — az elsőt vesszük,
  // de a többit is megtartjuk, hogy a felhasználó lássa.
  const refs = best.ref.split(';').map((r) => r.trim()).filter(Boolean);
  const utszam = refs[0] || '';

  // 2. kilométerkövek ugyanazon az útszámon
  const kovek = [];
  for (const el of data.elements) {
    if (el.type !== 'node' || !el.tags) continue;
    const d = el.tags.distance != null ? el.tags.distance : el.tags.kms;
    const km = szamKm(d);
    if (km == null) continue;
    const koRef = (el.tags.ref || el.tags['ref:road'] || '').split(';').map((r) => r.trim());
    if (utszam && koRef.length && koRef[0] && !koRef.includes(utszam)) continue;
    kovek.push({ km, ...osmMeters(el.lat, el.lon, lat0) });
  }

  let szelvenyM = null;
  if (kovek.length >= 2) {
    kovek.sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
    const [m1, m2] = kovek;
    const vx = m2.x - m1.x, vy = m2.y - m1.y;
    const len2 = vx * vx + vy * vy;
    if (len2 > 1 && m1.km !== m2.km) {
      const t = ((p.x - m1.x) * vx + (p.y - m1.y) * vy) / len2;
      szelvenyM = (m1.km + t * (m2.km - m1.km)) * 1000;
    }
  } else if (kovek.length === 1) {
    // egyetlen kő: a tőle mért távolsággal becsülünk (irány nélkül, ezért
    // csak akkor, ha egészen közel van)
    const k = kovek[0];
    const d = Math.hypot(k.x - p.x, k.y - p.y);
    if (d < 1200) szelvenyM = k.km * 1000 + d;
  }

  return {
    utszam,
    tovabbiUtszamok: refs.slice(1),
    szelveny: szelvenyM == null ? '' : formatSzelveny(szelvenyM),
    meters: szelvenyM,
    telepules: '',
    tavolsag: Math.round(best.distance),
    nev: best.tags.name || '',
    // honnan jön, és hogy a szelvény csak becslés
    forras: 'osm',
    becsult: szelvenyM != null,
  };
}

/** „27”, „27.4”, „27+387”, „27,4 km” → kilométerben kifejezett szám. */
export function szamKm(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  const s = String(v).trim().toLowerCase().replace(/\s+/g, '').replace(/km$/, '');
  let m = /^(\d+)\+(\d+)$/.exec(s);
  if (m) return Number(m[1]) + Number(m[2]) / 1000;
  const n = Number(s.replace(',', '.'));
  return isFinite(n) ? n : null;
}

export const OVERPASS_HOST = 'osmOverpass-api.de';


/* ------------------------------------------- a Közút útszámkeresője

Az útszámkereső oldala mögött van egy JSON-végpont, ami EOV-koordinátára
megadja a hiteles útszámot és szelvényt. A böngésző viszont nem engedi, hogy
egy másik címen futó oldal közvetlenül hívja (a válasz nem engedélyezi az
idegen eredetet). Ezért kell a saját tárhelyre egy pici továbbító fájl —
`kiszolgalo/kozut-hid.php` a repóban —, és annak a címét ide beírva az app
magától kikeresi a helyszín útszámát és szelvényét.

Ha nincs beállítva, minden marad a régiben: nyílt térképadat, kézi beírás
vagy a keresőből való átmásolás.                                         */

export function kozutHid() {
  try { return localStorage.getItem('utszamHid') || ''; } catch (_) { return ''; }
}

export function setKozutHid(url) {
  try {
    if (url) localStorage.setItem('utszamHid', url);
    else localStorage.removeItem('utszamHid');
  } catch (_) {}
}

/**
 * Egy érték kikeresése a válaszból, akármilyen mélyen és akárhogy hívják.
 * A `kizar` azért kell, mert a méter-mezőt keresve a kilométer-mező neve is
 * illeszkedne („szelvenyKm” is m-re végződik).
 */
function mezo(obj, minta, ellenorz, kizar) {
  const sor = [obj];
  while (sor.length) {
    const cur = sor.shift();
    if (!cur || typeof cur !== 'object') continue;
    for (const [k, v] of Object.entries(cur)) {
      if (v && typeof v === 'object') { sor.push(v); continue; }
      if (v == null || v === '') continue;
      if (kizar && kizar.test(k)) continue;
      if (minta.test(k) && (!ellenorz || ellenorz(v))) return v;
    }
  }
  return null;
}

/**
 * A válasz feldolgozása. Szándékosan nem egyetlen mezőnévre épül: a
 * szolgáltatás átnevezhet valamit, és akkor sem akarjuk, hogy elszálljon.
 */
export function parseKozut(data) {
  if (!data || typeof data !== 'object') return null;

  const utszam = mezo(data, /^(utszam|utszám|utsz|roadnumber|road_number|roadno|ref)$/i,
    (v) => String(v).trim().length > 0 && String(v).trim().length < 12);

  // A szelvény sokféle alakban jöhet: külön km és m mezőben, egyetlen
  // méterértékben, vagy szövegesen („27+387”). Mindegyiket megpróbáljuk,
  // ebben a sorrendben.
  let meters = null;

  // 1. szöveges alak
  const szoveg = mezo(data, /szelv|chainage/i, (v) => typeof v === 'string' && /\d/.test(v));
  if (szoveg != null) {
    const km = szamKm(szoveg);
    if (km != null) meters = km * 1000;
  }

  // 2. külön km és m mező (szelvenyKm / kmSzelveny / km + m)
  if (meters == null) {
    const km = mezo(data, /(szelv.*km|km.*szelv|^km$|^kmtol$)/i, (v) => typeof v === 'number' && isFinite(v));
    if (km != null) {
      const m = mezo(data, /(szelv.*m$|m.*szelv|^m$|^meter$|^meterek$)/i,
        (v) => typeof v === 'number' && isFinite(v) && v >= 0 && v < 1000,
        /km/i);
      meters = km * 1000 + (m || 0);
    }
  }

  // 3. egyetlen szám: 10 000 fölött méter, alatta kilométer
  if (meters == null) {
    const szam = mezo(data, /szelv|chainage/i, (v) => typeof v === 'number' && isFinite(v));
    if (szam != null) meters = szam > 10000 ? szam : szam * 1000;
  }

  const telepules = mezo(data, /telep|helyseg|varos|settlement/i,
    (v) => typeof v === 'string' && v.trim().length > 1);
  // a szakasz kezelője (mérnökség) — a Közút-űrlapokon is kérdezik
  const kezelo = mezo(data, /kezelo|mernokseg|fenntarto|operator/i,
    (v) => typeof v === 'string' && v.trim().length > 1);

  if (!utszam && meters == null) return null;
  return {
    utszam: utszam ? String(utszam).trim() : '',
    szelveny: meters == null ? '' : formatSzelveny(meters),
    meters,
    telepules: telepules ? String(telepules).trim() : '',
    kezelo: kezelo ? String(kezelo).trim() : '',
    tavolsag: null,
    forras: 'kozut',
    becsult: false,
  };
}

/**
 * Ha a híd nem működik, ne lassítsa a munkát: két sikertelen kérés után
 * ebben a futásban nem próbálkozunk tovább (a rögzítés különben minden
 * egyes pontnál megvárná az időkorlátot).
 */
let hidHibak = 0;
export const hidKiesett = () => hidHibak >= 2;
export const hidUjraprobal = () => { hidHibak = 0; };

/** Hiteles útszám és szelvény a Közút szolgáltatásából, a hídon keresztül. */
export async function lookupKozut(lat, lon) {
  const hid = kozutHid();
  if (!hid || lat == null || lon == null || hidKiesett()) return null;

  const kulcs = 'kozut|' + osmCellKey(lat, lon);
  if (osmCache.has(kulcs)) return osmCache.get(kulcs);

  // A hídnak mindkettőt elküldjük: a WGS84-et használja, az EOV-t csak akkor,
  // ha a régebbi változat van fent a tárhelyen.
  const eov = wgs84ToEov(lat, lon);
  const url = hid + (hid.includes('?') ? '&' : '?')
    + `lat=${lat.toFixed(6)}&lon=${lon.toFixed(6)}`
    + (eov && isFinite(eov.y) ? `&y=${eov.y.toFixed(2)}&x=${eov.x.toFixed(2)}` : '');

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), OSM_TIMEOUT_MS);
  let data = null;
  try {
    const res = await fetch(url, { signal: ctrl.signal, mode: 'cors' });
    if (res.ok) data = await res.json();
  } catch (_) {
    data = null;
  } finally {
    clearTimeout(timer);
  }
  if (!data || data.hiba) {
    hidHibak += 1;
    return null;
  }

  const out = parseKozut(data);
  if (!out) { hidHibak += 1; return null; }
  hidHibak = 0;
  osmCache.set(kulcs, out);
  return out;
}


/**
 * A híd kipróbálása, beszédes hibaüzenettel.
 *
 * A leggyakoribb tévedés, hogy a fájl olyan helyre kerül, ahol nem fut le:
 * a GitHub Pages például nem futtat PHP-t, csak kiadja a fájl szövegét.
 * Ezt felismerjük, és meg is mondjuk, mit kell tenni.
 *
 * @returns {{ok: boolean, uzenet: string, adat: object|null}}
 */
export async function probaHid(url) {
  if (!url) return { ok: false, uzenet: 'Nincs megadva cím.', adat: null };
  if (!/^https?:\/\//i.test(url)) {
    return { ok: false, uzenet: 'A cím http:// vagy https:// kezdetű legyen.', adat: null };
  }

  const proba = url + (url.includes('?') ? '&' : '?') + 'lat=47.376131&lon=18.190796&y=585310.16&x=226147.28';
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), OSM_TIMEOUT_MS);
  let res = null;
  let szoveg = '';
  try {
    res = await fetch(proba, { signal: ctrl.signal, mode: 'cors' });
    szoveg = await res.text();
  } catch (_) {
    clearTimeout(timer);
    // Nem mindegy, hogy a kiszolgáló meg sem szólalt, vagy válaszolt, csak a
    // válasz nem engedi az idegen eredetet. Egy „no-cors” próbával ez
    // elkülöníthető: az akkor is sikerül, ha a választ nem olvashatjuk.
    const biztonsagos = location.protocol === 'https:' && /^http:\/\//i.test(url);
    if (biztonsagos) {
      return {
        ok: false,
        adat: null,
        uzenet: 'A cím http://-sel kezdődik, az app viszont https://-en fut, ezért a '
          + 'böngésző letiltja a kérést. Írja át a címet https://-re.',
      };
    }
    let valaszolt = false;
    try {
      await fetch(proba, { mode: 'no-cors', cache: 'no-store' });
      valaszolt = true;
    } catch (_) { valaszolt = false; }

    return {
      ok: false,
      adat: null,
      uzenet: valaszolt
        ? 'A kiszolgáló válaszol, de a választ nem engedi átvenni (hiányzó CORS-fejléc). '
          + 'Ez rendszerint azt jelenti, hogy a PHP hibára futott, és a hibaoldal jött '
          + 'vissza — nézze meg a címet a böngészőben közvetlenül, ott látszik a hibaüzenet.'
        : 'A cím nem érhető el. Ellenőrizze, jó-e a cím (nyissa meg a böngészőben), és '
          + 'hogy tényleg oda került-e a fájl.',
    };
  } finally {
    clearTimeout(timer);
  }

  // Gyakori tévedés: nem a PHP kerül fel, hanem valamelyik másik fájl
  // szövege (pl. a kiadási munkafolyamat YAML-je). Ezt megnevezzük.
  if (/^\s*#/.test(szoveg) && /(jobs:|runs-on:|uses:\s*actions)/.test(szoveg)) {
    return {
      ok: false,
      adat: null,
      uzenet: 'A címen nem a továbbító fájl van, hanem egy GitHub-munkafolyamat szövege. '
        + 'A feltöltött fájl tartalma rossz: a helyes fájl a repóban '
        + 'utvonalbejaras/kiszolgalo/kozut-hid.php, és „<?php” sorral kezdődik.',
    };
  }
  if (/^\s*<\?php/i.test(szoveg) || /\$_GET\[/.test(szoveg)) {
    return {
      ok: false,
      adat: null,
      uzenet: 'Ez a hely nem futtatja a PHP-t, csak a fájl szövegét adja vissza. '
        + 'A GitHub Pages ilyen — a fájlt a saját (PHP-t futtató) tárhelyre kell tenni.',
    };
  }
  // Előbb a tartalom: a híd a saját hibáját JSON-ban küldi, és az sokkal
  // többet mond, mint a HTTP-státusz.
  let data = null;
  try { data = JSON.parse(szoveg); } catch (_) { data = null; }
  if (data && data.hiba) {
    return { ok: false, adat: data, uzenet: String(data.hiba) };
  }
  if (!res.ok) {
    return { ok: false, adat: null, uzenet: `A kiszolgáló ${res.status} hibát adott.` };
  }
  if (!data) {
    return { ok: false, adat: null, uzenet: 'A válasz nem JSON. Biztosan a továbbító fájl címe ez?' };
  }

  const road = parseKozut(data);
  if (!road || !road.utszam) {
    return {
      ok: false,
      adat: data,
      uzenet: 'A híd válaszolt, de a próbapontra nem jött útszám. Lehet, hogy a tárhely '
        + 'nem engedi a kimenő kéréseket a Közút felé.',
    };
  }
  return {
    ok: true,
    adat: data,
    uzenet: `Működik. Próbapont: ${road.utszam}${road.szelveny ? ' · ' + road.szelveny : ''}.`,
  };
}
