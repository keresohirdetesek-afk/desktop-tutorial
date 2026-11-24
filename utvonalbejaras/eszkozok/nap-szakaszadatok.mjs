#!/usr/bin/env node
// A NAP szakaszos adatcsomagjaiból egyetlen tömör állomány az alkalmazásnak.
//
// Miért: a felhasználónak ne kelljen a NAP-portálra regisztrálnia és fájlt
// töltögetnie. Ezek az adatok az alkalmazással együtt települnek, és
// ugyanúgy frissülnek, mint a szelvényjelek.
//
// Mit dolgoz fel (a mezőnevekből ismeri fel, melyik melyik):
//   • Hídhasználati feltételek           — hszam, hnev, hkorlt1..6
//   • Tehergépjármű-korlátozások         — sulyk, sulykorl
//   • Burkolat típusa és szélessége      — rbtsz, rbtip
//   • Lakott területi szakaszok          — szakjel (átkelési / külsőségi)
//   • Összes gépjármű forgalmi sávok sz. — savossz
//   • Közút neve, kategóriája, kezelője  — utnev, utkategori, kezelo
//
// Geometriára nincs szükség: az útszám + pályakód + szelvénytartomány
// elég, mert a helyet a már meglévő szelvényjel-hálózat adja meg.
//
//   node eszkozok/nap-szakaszadatok.mjs <fájl|mappa> [...] [-o kimenet.json]
//
// Bemenet lehet .dbf, .shp (a .dbf-et keresi mellé), .zip vagy mappa.
// Alapértelmezett kimenet: adatok/szakaszadatok.json

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readDbf } from '../js/shapefile.js';
import { szelvenyMeters } from '../js/uthalozat.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(here, '..');

const argv = process.argv.slice(2);
let ki = path.join(appDir, 'adatok', 'szakaszadatok.json');
const bemenetek = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '-o') { ki = argv[++i]; continue; }
  bemenetek.push(argv[i]);
}
if (!bemenetek.length) {
  console.error('Használat: node eszkozok/nap-szakaszadatok.mjs <fájl|mappa> [...] [-o kimenet.json]');
  process.exit(1);
}

const bufOf = (f) => {
  const b = readFileSync(f);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
};

/** Minden bemenetből összeszedjük a .dbf fájlokat (a zipeket kicsomagoljuk). */
function dbfFajlok(be) {
  // ugyanaz a réteg sokszor szerepelhet (zip + kicsomagolt .shp + .dbf),
  // ezért fájlnév szerint csak egyszer dolgozzuk fel
  const talalt = new Map();
  const ki = { push: (p) => { const k = path.basename(p).toLowerCase(); if (!talalt.has(k)) talalt.set(k, p); } };
  const jar = (p) => {
    const st = statSync(p);
    if (st.isDirectory()) {
      for (const n of readdirSync(p)) jar(path.join(p, n));
      return;
    }
    if (/\.dbf$/i.test(p)) { ki.push(p); return; }
    if (/\.shp$/i.test(p)) {
      const d = p.replace(/\.shp$/i, '.dbf');
      if (existsSync(d)) ki.push(d);
      return;
    }
    if (/\.zip$/i.test(p)) {
      const dir = mkdtempSync(path.join(tmpdir(), 'nap-'));
      try {
        execFileSync('unzip', ['-o', '-q', p, '-d', dir], { stdio: 'ignore' });
      } catch (_) {
        console.error(`figyelmeztetés: a(z) ${path.basename(p)} nem csomagolható ki (kell az „unzip”)`);
        return;
      }
      jar(dir);
    }
  };
  for (const p of be) jar(p);
  return [...talalt.values()];
}

/** Mezőérték kisbetűs névvel, akárhogy írták a fejlécben. */
const mezo = (sor, nev) => {
  for (const k of Object.keys(sor)) if (k.toLowerCase() === nev) return sor[k];
  return undefined;
};
const van = (sor, nev) => mezo(sor, nev) !== undefined;

/* ------------------------------------------------------------ gyűjtők */

const utNevek = [];
const utIndex = new Map();
const utIdx = (nev) => {
  let i = utIndex.get(nev);
  if (i === undefined) { i = utNevek.length; utNevek.push(nev); utIndex.set(nev, i); }
  return i;
};

/** Szótáras érték: ismétlődő szövegeket csak egyszer tárolunk. */
function szotar() {
  const lista = [];
  const index = new Map();
  return {
    lista,
    idx(v) {
      const s = String(v == null ? '' : v).trim();
      let i = index.get(s);
      if (i === undefined) { i = lista.length; lista.push(s); index.set(s, i); }
      return i;
    },
  };
}

// tartományos rétegek nyers sorai: { ut, pk, k, v, ertek... }
const burkolat = [];
const lakott = [];
const sav = [];
const hidak = [];
const korlatok = [];
// útszám szintű adatok: útszám → { nev, kat, kez } előfordulások
const utAdatNyers = new Map();

const tipusSzotar = szotar();
const nevSzotar = szotar();
const katSzotar = szotar();
const kezSzotar = szotar();
const hidNemSzotar = szotar();
const teherbirasSzotar = szotar();
const korlNevSzotar = szotar();
const kiegSzotar = szotar();

/**
 * A hídkorlátozás szövegéből gépileg kezelhető fajta és mértékegység.
 * Ezekre tudunk a szerelvény adataival ütközést vizsgálni.
 */
const KORLAT_FAJTAK = [
  { re: /összsúly/i, fajta: 'tomeg', szorzo: 1 },                  // tonna
  { re: /tengelysúly/i, fajta: 'tengely', szorzo: 1 },             // tonna
  { re: /híd alatti magasság|híd alatti merev kapu/i, fajta: 'alattMagassag', szorzo: 0.1 }, // dm → m
  { re: /lengő kapu|merev kapu/i, fajta: 'kapu', szorzo: 0.1 },
  { re: /magasságkorlátozás/i, fajta: 'magassag', szorzo: 0.1 },
  { re: /útszűkület/i, fajta: 'szelesseg', szorzo: 0.1 },
  { re: /sebességkorlátozás/i, fajta: 'sebesseg', szorzo: 1 },     // km/h
  { re: /követési távolság/i, fajta: 'kovetes', szorzo: 1 },       // m
];

function korlatFajta(szoveg) {
  const s = String(szoveg || '');
  if (!s || /nincs korlátozás/i.test(s)) return null;
  for (const f of KORLAT_FAJTAK) if (f.re.test(s)) return f;
  return { fajta: 'egyeb', szorzo: 1 };
}

/** Egy réteg beolvasása és a megfelelő gyűjtőbe pakolása. */
function feldolgoz(dbfUt) {
  const { sorok } = readDbf(bufOf(dbfUt));
  if (!sorok.length) return { fajta: 'üres', db: 0 };
  const minta = sorok[0];

  const tartomany = (sor) => {
    const kszam = String(mezo(sor, 'kszam') ?? mezo(sor, 'utszam') ?? '').trim();
    if (!kszam) return null;
    const k = szelvenyMeters(mezo(sor, 'kszelv'));
    const v = szelvenyMeters(mezo(sor, 'vszelv'));
    if (k == null || v == null) return null;
    return {
      ut: utIdx(kszam),
      pk: Number(mezo(sor, 'pkod')) || 0,
      k: Math.round(Math.min(k, v)),
      v: Math.round(Math.max(k, v)),
    };
  };

  // --- hidak (pontréteg): a híd szelvénye + a rajta lévő korlátozások
  if (van(minta, 'hszam') || van(minta, 'hkorlt1')) {
    let db = 0;
    for (const s of sorok) {
      const kszam = String(mezo(s, 'kszam') ?? '').trim();
      if (!kszam) continue;
      const m = szelvenyMeters(mezo(s, 'kszelv'));
      if (m == null) continue;
      const korl = [];
      for (let i = 1; i <= 6; i++) {
        const szoveg = String(mezo(s, 'hkorlt' + i) || '').trim();
        const f = korlatFajta(szoveg);
        if (!f) continue;
        const nyers = Number(String(mezo(s, 'hkorle' + i) || '').replace(/[^0-9.,-]/g, '').replace(',', '.'));
        const ertek = Number.isFinite(nyers) && nyers > 0 ? Math.round(nyers * f.szorzo * 100) / 100 : null;
        korl.push({ f: f.fajta, e: ertek, n: korlNevSzotar.idx(szoveg) });
      }
      hidak.push({
        ut: utIdx(kszam),
        pk: Number(mezo(s, 'pkod')) || 0,
        m: Math.round(m),
        sz: String(mezo(s, 'hszam') || '').trim(),
        nev: String(mezo(s, 'hnev') || '').trim(),
        nem: hidNemSzotar.idx(mezo(s, 'hnem')),
        // „közút feletti híd”: a szállítmány ALATTA megy el — ilyenkor a
        // szabad magasság a kérdés; „közúti híd”: a szállítmány RAJTA megy át
        f: /feletti/i.test(String(mezo(s, 'hhely') || '')) ? 1 : 0,
        tb: teherbirasSzotar.idx(mezo(s, 'huzemtb')),
        korl,
      });
      db += 1;
    }
    return { fajta: 'hídhasználati feltételek', db };
  }

  // --- tehergépjármű-korlátozások (tartományok)
  if (van(minta, 'sulyk') || van(minta, 'sulykorl')) {
    let db = 0;
    for (const s of sorok) {
      const t = tartomany(s);
      if (!t) continue;
      const egy = (nevMezo, ertekMezo, kiegMezo) => {
        const nev = String(mezo(s, nevMezo) || '').trim();
        if (!nev) return null;
        const nyers = Number(String(mezo(s, ertekMezo) || '').replace(/[^0-9.,-]/g, '').replace(',', '.'));
        return {
          n: korlNevSzotar.idx(nev),
          e: Number.isFinite(nyers) && nyers > 0 ? Math.round(nyers * 100) / 100 : null,
          kieg: kiegSzotar.idx(mezo(s, kiegMezo)),
          // mire vonatkozik: össztömeg, tengelyterhelés vagy behajtási tilalom
          f: /tengelyterhelés/i.test(nev) ? 'tengely'
            : /össztömeg|összsúly/i.test(nev) ? 'tomeg'
              : /behajtani tilos|zóna|övezet/i.test(nev) ? 'tilalom' : 'egyeb',
        };
      };
      const lista = [egy('sulyk', 'sulykorl', 'sulykieg'), egy('sulyk2', 'sulykorl2', 'sulykieg2')]
        .filter(Boolean);
      if (!lista.length) continue;
      t.korl = lista;
      t.kez = kezSzotar.idx(mezo(s, 'kezelo'));
      korlatok.push(t); db += 1;
    }
    return { fajta: 'tehergépjármű-korlátozások', db };
  }

  if (van(minta, 'rbtsz') || van(minta, 'rbtip')) {
    let db = 0;
    for (const s of sorok) {
      const t = tartomany(s);
      if (!t) continue;
      const sz = Number(String(mezo(s, 'rbtsz') ?? '').replace(',', '.'));
      t.sz = Number.isFinite(sz) && sz > 0 ? Math.round(sz * 100) : 0;   // cm
      t.t = tipusSzotar.idx(mezo(s, 'rbtip'));
      burkolat.push(t); db += 1;
    }
    return { fajta: 'burkolat (típus és szélesség)', db };
  }

  if (van(minta, 'szakjel')) {
    let db = 0;
    for (const s of sorok) {
      const t = tartomany(s);
      if (!t) continue;
      // „átkelési” = belterületi átkelési szakasz, „külsőségi” = külterület
      t.a = /átkel/i.test(String(mezo(s, 'szakjel') || '')) ? 1 : 0;
      lakott.push(t); db += 1;
    }
    return { fajta: 'lakott területi szakaszok', db };
  }

  if (van(minta, 'savossz')) {
    let db = 0;
    for (const s of sorok) {
      const t = tartomany(s);
      if (!t) continue;
      t.n = Number(mezo(s, 'savossz')) || 0;
      sav.push(t); db += 1;
    }
    return { fajta: 'forgalmi sávok száma', db };
  }

  if (van(minta, 'kezelo') || van(minta, 'utnev')) {
    let db = 0;
    for (const s of sorok) {
      const kszam = String(mezo(s, 'kszam') ?? '').trim();
      if (!kszam) continue;
      const kulcs = [
        nevSzotar.idx(mezo(s, 'utnev')),
        katSzotar.idx(mezo(s, 'utkategori')),
        kezSzotar.idx(mezo(s, 'kezelo')),
      ].join(',');
      let m = utAdatNyers.get(kszam);
      if (!m) { m = new Map(); utAdatNyers.set(kszam, m); }
      m.set(kulcs, (m.get(kulcs) || 0) + 1);
      db += 1;
    }
    return { fajta: 'közút neve, kategóriája, kezelője', db };
  }

  if (van(minta, 'kmjel')) return { fajta: 'szelvényjelek — ezt a nap-szelvenyek.mjs dolgozza fel', db: 0 };
  return { fajta: 'ismeretlen réteg (' + Object.keys(minta).join(', ') + ')', db: 0 };
}

/* ------------------------------------------- tömörítés és kiírás */

/**
 * Szomszédos, azonos értékű tartományok összevonása — így sokkal kisebb
 * lesz az állomány, és a keresés is gyorsabb.
 */
function osszevon(sorok, kulcsok) {
  sorok.sort((a, b) => (a.ut - b.ut) || (a.pk - b.pk) || (a.k - b.k));
  const ki = [];
  for (const s of sorok) {
    const e = ki[ki.length - 1];
    const egyezik = e && e.ut === s.ut && e.pk === s.pk && e.v >= s.k - 1
      && kulcsok.every((k) => e[k] === s[k]);
    if (egyezik) { e.v = Math.max(e.v, s.v); continue; }
    ki.push({ ...s });
  }
  return ki;
}

/** Oszlopos alak: minden mező külön tömb (kisebb JSON, gyors betöltés). */
function oszlopos(sorok, kulcsok) {
  const ki = { ut: [], pk: [], k: [], v: [] };
  for (const k of kulcsok) ki[k] = [];
  for (const s of sorok) {
    ki.ut.push(s.ut); ki.pk.push(s.pk); ki.k.push(s.k); ki.v.push(s.v);
    for (const k of kulcsok) ki[k].push(s[k]);
  }
  return ki;
}

const dbfek = dbfFajlok(bemenetek);
if (!dbfek.length) {
  console.error('Hiba: egyetlen .dbf sem található a megadott bemenetben.');
  process.exit(1);
}
for (const f of dbfek) {
  const r = feldolgoz(f);
  console.log(`  ${path.basename(f)} → ${r.fajta}${r.db ? ` (${r.db} sor)` : ''}`);
}

// Ha egyik ismert réteg sem volt a bemenetben (pl. csak a szelvényjelek
// csomagot töltötték fel), NE írjuk felül a meglévő, jó állományt.
if (!burkolat.length && !lakott.length && !sav.length && !hidak.length
  && !korlatok.length && !utAdatNyers.size) {
  console.log('Nincs feldolgozható szakaszos réteg a bemenetben — '
    + 'a meglévő állomány változatlan marad.');
  process.exit(0);
}

// útszám szintű adat: ahol több változat van, a leggyakoribb nyer, de
// megjelöljük, hogy a többi szakaszon más szerepel
const utAdat = { ut: [], nev: [], kat: [], kez: [], vegyes: [] };
for (const [kszam, valtozatok] of utAdatNyers) {
  const rendezett = [...valtozatok].sort((a, b) => b[1] - a[1]);
  const [nev, kat, kez] = rendezett[0][0].split(',').map(Number);
  utAdat.ut.push(utIdx(kszam));
  utAdat.nev.push(nev);
  utAdat.kat.push(kat);
  utAdat.kez.push(kez);
  utAdat.vegyes.push(rendezett.length > 1 ? 1 : 0);
}

const adat = {
  verzio: 1,
  keszult: new Date().toISOString().slice(0, 10),
  forras: 'Nemzeti Adathozzáférési Pont (NAP) — statikus úthálózati adatcsomagok',
  licenc: 'CC BY 4.0',
  utak: utNevek,
  utnevek: nevSzotar.lista,
  kategoriak: katSzotar.lista,
  kezelok: kezSzotar.lista,
  burkolattipusok: tipusSzotar.lista,
  hidnemek: hidNemSzotar.lista,
  teherbirasok: teherbirasSzotar.lista,
  korlatnevek: korlNevSzotar.lista,
  kiegeszitok: kiegSzotar.lista,
  utAdat,
  // hidak: szelvény szerint rendezve, hogy gyors legyen a keresés
  hidak: hidak.sort((a, b) => (a.ut - b.ut) || (a.pk - b.pk) || (a.m - b.m)),
  korlatok: korlatok.sort((a, b) => (a.ut - b.ut) || (a.pk - b.pk) || (a.k - b.k)),
  burkolat: oszlopos(osszevon(burkolat, ['sz', 't']), ['sz', 't']),
  lakott: oszlopos(osszevon(lakott, ['a']), ['a']),
  sav: oszlopos(osszevon(sav, ['n']), ['n']),
};

mkdirSync(path.dirname(ki), { recursive: true });
writeFileSync(ki, JSON.stringify(adat));
const meret = readFileSync(ki).length;
console.log(`kész: ${ki}`);
console.log(`  útszám: ${utNevek.length} · útadat: ${utAdat.ut.length}`
  + ` · burkolat: ${adat.burkolat.ut.length} · lakott: ${adat.lakott.ut.length}`
  + ` · sáv: ${adat.sav.ut.length} · híd: ${adat.hidak.length}`
  + ` · korlátozás: ${adat.korlatok.length}`);
const korlatosHid = adat.hidak.filter((h) => h.korl.length).length;
console.log(`  ebből korlátozott híd: ${korlatosHid}`);
console.log(`  méret: ${(meret / 1048576).toFixed(2)} MB`);
