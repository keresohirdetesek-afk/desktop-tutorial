// Szakaszos úthálózati adatok: hidak, korlátozások, burkolat, sávszám,
// belterület, kezelő — a NAP statikus adatcsomagjaiból.
//
// Az állomány (adatok/szakaszadatok.json) az alkalmazással együtt érkezik,
// és a szelvényjelekkel együtt frissül. Geometria nincs benne: a helyet a
// szelvényjel-hálózat adja meg (útszám + pályakód + szelvény méterben),
// ehhez keresünk itt tartományt.
//
// Forrás: Nemzeti Adathozzáférési Pont (NAP), CC BY 4.0.

const SZAKASZ_FAJL = 'adatok/szakaszadatok.json';

let adat = null;
let betoltes = null;
let utIndex = null;          // útszám (szöveg) → index az `utak` tömbben
const retegIndex = new Map(); // réteg neve → Map(ut → sorszámok)

/** Útszám-egyezés: a NAP néha „4812” , néha „4812 j.” alakban hozza. */
const normUt = (s) => String(s == null ? '' : s).trim().toLowerCase()
  .replace(/\s*j\.?\s*(út)?$/, '').replace(/\s+/g, '');

function indexel() {
  utIndex = new Map();
  adat.utak.forEach((nev, i) => utIndex.set(normUt(nev), i));

  for (const reteg of ['burkolat', 'lakott', 'sav']) {
    const r = adat[reteg];
    const m = new Map();
    if (r && r.ut) {
      for (let i = 0; i < r.ut.length; i++) {
        let arr = m.get(r.ut[i]);
        if (!arr) { arr = []; m.set(r.ut[i], arr); }
        arr.push(i);
      }
    }
    retegIndex.set(reteg, m);
  }
  for (const reteg of ['hidak', 'korlatok']) {
    const r = adat[reteg] || [];
    const m = new Map();
    r.forEach((sor, i) => {
      let arr = m.get(sor.ut);
      if (!arr) { arr = []; m.set(sor.ut, arr); }
      arr.push(i);
    });
    retegIndex.set(reteg, m);
  }
  const u = adat.utAdat || { ut: [] };
  const m = new Map();
  u.ut.forEach((ui, i) => m.set(ui, i));
  retegIndex.set('utAdat', m);
}

/** Betöltés (egyszer). Offline is megy: a fájl a gyorsítótárban van. */
export async function szakaszAdat() {
  if (adat) return adat;
  if (betoltes) return betoltes;
  betoltes = (async () => {
    try {
      // az egyfájlos változatban az adat a lapba van sütve
      adat = globalThis.__UB_SZAKASZ || await (await fetch(SZAKASZ_FAJL, { cache: 'no-cache' })).json();
      indexel();
      return adat;
    } catch (_) {
      adat = null;
      return null;
    } finally {
      betoltes = null;
    }
  })();
  return betoltes;
}

/** Be van-e töltve (szinkron kérdés a megjelenítéshez). */
export const szakaszAdatKesz = () => !!adat;

/** Mikor készült az állomány (a forrásmegjelöléshez). */
export const szakaszAdatKeszult = () => (adat ? adat.keszult : null);

const utSorszam = (utszam) => (utIndex ? utIndex.get(normUt(utszam)) : undefined);

/** Egy tartományos réteg találata a megadott szelvénynél. */
function tartomanyErtek(reteg, ui, pk, meter) {
  const r = adat[reteg];
  const idx = retegIndex.get(reteg);
  if (!r || !idx) return null;
  const sorok = idx.get(ui);
  if (!sorok) return null;
  let maskPalya = null;
  for (const i of sorok) {
    if (meter < r.k[i] || meter > r.v[i]) continue;
    if (r.pk[i] === pk || r.pk[i] === 0 || pk === 0) return i;
    maskPalya = i;                    // a másik pálya adata jobb, mint a semmi
  }
  return maskPalya;
}

/**
 * Minden, amit erről a pontról tudunk: út neve, kategóriája, kezelője,
 * belterület-e, burkolat, sávszám.
 *
 * @param {string} utszam  pl. „42”
 * @param {number} pk      pályakód (0 = egypályás)
 * @param {number} meter   szelvény méterben
 */
export function szakaszInfo(utszam, pk = 0, meter = 0) {
  if (!adat) return null;
  const ui = utSorszam(utszam);
  if (ui === undefined) return null;
  const ki = {};

  const ua = retegIndex.get('utAdat').get(ui);
  if (ua !== undefined) {
    const u = adat.utAdat;
    ki.utNev = adat.utnevek[u.nev[ua]] || '';
    ki.kategoria = adat.kategoriak[u.kat[ua]] || '';
    ki.kezelo = adat.kezelok[u.kez[ua]] || '';
    ki.kezeloVegyes = !!u.vegyes[ua];
  }

  const b = tartomanyErtek('burkolat', ui, pk, meter);
  if (b != null) {
    const sz = adat.burkolat.sz[b];
    if (sz) ki.burkolatSzelesseg = sz / 100;      // cm → m
    ki.burkolatTipus = adat.burkolattipusok[adat.burkolat.t[b]] || '';
  }
  const s = tartomanyErtek('sav', ui, pk, meter);
  if (s != null && adat.sav.n[s]) ki.savszam = adat.sav.n[s];

  const l = tartomanyErtek('lakott', ui, pk, meter);
  if (l != null) ki.belterulet = adat.lakott.a[l] === 1;

  return ki;
}

/** Egy híd adatai megjelenítésre előkészítve. */
function hidKi(h) {
  return {
    utszam: adat.utak[h.ut],
    palyakod: h.pk,
    meter: h.m,
    hidszam: h.sz,
    nev: h.nev,
    fajta: adat.hidnemek[h.nem] || '',
    felettunk: h.f === 1,                     // közút feletti híd: alatta megyünk el
    teherbiras: adat.teherbirasok[h.tb] || '',
    korlatozasok: (h.korl || []).map((k) => ({
      fajta: k.f,
      ertek: k.e,
      nev: adat.korlatnevek[k.n] || '',
    })),
  };
}

/** Hidak egy útszakaszon (szelvénytartományban). */
export function hidakSzakaszon(utszam, pk, tol, ig) {
  if (!adat) return [];
  const ui = utSorszam(utszam);
  if (ui === undefined) return [];
  const sorok = retegIndex.get('hidak').get(ui) || [];
  const a = Math.min(tol, ig); const b = Math.max(tol, ig);
  const ki = [];
  for (const i of sorok) {
    const h = adat.hidak[i];
    if (h.m < a - 50 || h.m > b + 50) continue;
    if (pk && h.pk && h.pk !== pk) continue;
    ki.push(hidKi(h));
  }
  return ki;
}

/** Tehergépjármű-korlátozások egy útszakaszon. */
export function korlatozasokSzakaszon(utszam, pk, tol, ig) {
  if (!adat) return [];
  const ui = utSorszam(utszam);
  if (ui === undefined) return [];
  const sorok = retegIndex.get('korlatok').get(ui) || [];
  const a = Math.min(tol, ig); const b = Math.max(tol, ig);
  const ki = [];
  for (const i of sorok) {
    const k = adat.korlatok[i];
    if (k.v < a || k.k > b) continue;
    if (pk && k.pk && k.pk !== pk) continue;
    ki.push({
      utszam: adat.utak[k.ut],
      palyakod: k.pk,
      tol: k.k,
      ig: k.v,
      kezelo: adat.kezelok[k.kez] || '',
      korlatozasok: (k.korl || []).map((x) => ({
        fajta: x.f,
        ertek: x.e,
        nev: adat.korlatnevek[x.n] || '',
        kiegeszites: adat.kiegeszitok[x.kieg] || '',
      })),
    });
  }
  return ki;
}

/** „40 t. (sz: 1986)” → 40 */
export function teherbirasTonna(szoveg) {
  const m = /(\d+(?:[.,]\d+)?)\s*t/i.exec(String(szoveg || ''));
  return m ? Number(m[1].replace(',', '.')) : null;
}

/* ----------------------------------------------- ütközésvizsgálat */

const szam = (v) => {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(',', '.').replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * Elfér-e a szerelvény? Végigmegy a megadott útszakaszokon, és kigyűjti,
 * hol ütközik a jármű mérete vagy tömege a hidak és a korlátozások
 * adataival.
 *
 * @param {Array<{utszam:string, palyakod?:number, tol:number, ig:number}>} szakaszok
 * @param {{width?:string|number, height?:string|number, csokkHeight?:string|number,
 *          weight?:string|number, axleLoad?:string|number}} jarmu
 * @returns {{talalatok:Array, ellenorzott:number, hiany:Array<string>}}
 */
export function utkozesek(szakaszok, jarmu = {}) {
  const talalatok = [];
  const hiany = [];
  if (!adat) return { talalatok, ellenorzott: 0, hiany: ['Az adat még nem töltődött be.'] };

  const szelesseg = szam(jarmu.width);
  const magassag = szam(jarmu.height);
  const csokk = szam(jarmu.csokkHeight);
  const tomeg = szam(jarmu.weight);
  const tengely = szam(jarmu.axleLoad);
  if (!szelesseg) hiany.push('szélesség');
  if (!magassag) hiany.push('magasság');
  if (!tomeg) hiany.push('össztömeg');
  if (!tengely) hiany.push('tengelyterhelés');

  // a legkisebb magasság, amivel el tud menni (ha van leengedhető rakomány)
  const legkisebbMagassag = csokk && magassag ? Math.min(csokk, magassag) : (magassag || csokk);

  const hozzaad = (t) => {
    // ugyanaz a híd több szakaszon is előjöhet — egyszer soroljuk fel
    const kulcs = [t.utszam, t.meter, t.mi, t.hatar].join('|');
    if (talalatok.some((x) => x.kulcs === kulcs)) return;
    talalatok.push({ ...t, kulcs });
  };

  for (const sz of szakaszok) {
    const pk = sz.palyakod || 0;

    for (const h of hidakSzakaszon(sz.utszam, pk, sz.tol, sz.ig)) {
      const hol = { utszam: h.utszam, meter: h.meter, hely: `${h.utszam} · ${szelvenySzoveg(h.meter)}`,
        nev: h.nev || ('híd ' + h.hidszam), forras: 'híd' };

      // a híd teherbírása (üzemi besorolás)
      // A híd üzemi teherbírása nem kitáblázott tilalom: túlsúlyos
      // szállításnál ilyenkor a közútkezelő egyedi hídvizsgálata dönt.
      // Ezért ez figyelmeztetés, nem „nem fér el”.
      const tb = teherbirasTonna(h.teherbiras);
      if (!h.felettunk && tomeg && tb && tomeg > tb) {
        hozzaad({ ...hol, sulyossag: 'figyelem', mi: 'hidteherbiras', hatar: tb, egyseg: 't',
          mienk: tomeg,
          szoveg: `A híd üzemi teherbírása ${h.teherbiras}, a szerelvény ${tomeg} t — `
            + 'ehhez a közútkezelő egyedi hídvizsgálata kell.' });
      }

      for (const k of h.korlatozasok) {
        if (k.ertek == null) {
          if (k.fajta !== 'sebesseg' && k.fajta !== 'kovetes') {
            hozzaad({ ...hol, sulyossag: 'figyelem', mi: k.nev, hatar: null, egyseg: '',
              mienk: null, szoveg: k.nev });
          }
          continue;
        }
        const vizsgal = (ertek, mi, egyseg) => {
          if (ertek == null) return;
          if (ertek > k.ertek) {
            hozzaad({ ...hol, sulyossag: 'utkozes', mi, hatar: k.ertek, egyseg,
              mienk: ertek, szoveg: `${k.nev}: ${k.ertek} ${egyseg} — a szerelvény ${ertek} ${egyseg}.` });
          } else if (ertek > k.ertek - (egyseg === 'm' ? 0.2 : 1)) {
            hozzaad({ ...hol, sulyossag: 'figyelem', mi, hatar: k.ertek, egyseg,
              mienk: ertek, szoveg: `${k.nev}: ${k.ertek} ${egyseg} — a szerelvény ${ertek} ${egyseg}, épphogy elfér.` });
          }
        };
        if (k.fajta === 'tomeg') vizsgal(tomeg, 'össztömeg', 't');
        else if (k.fajta === 'tengely') vizsgal(tengely, 'tengelyterhelés', 't');
        else if (k.fajta === 'szelesseg') vizsgal(szelesseg, 'szélesség', 'm');
        else if (k.fajta === 'alattMagassag' || k.fajta === 'kapu' || k.fajta === 'magassag') {
          vizsgal(legkisebbMagassag, 'magasság', 'm');
        }
      }
    }

    for (const k of korlatozasokSzakaszon(sz.utszam, pk, sz.tol, sz.ig)) {
      const hol = {
        utszam: k.utszam,
        meter: k.tol,
        hely: `${k.utszam} · ${szelvenySzoveg(k.tol)} – ${szelvenySzoveg(k.ig)}`,
        nev: 'Súlykorlátozott szakasz',
        forras: 'korlátozás',
      };
      for (const x of k.korlatozasok) {
        const kieg = x.kiegeszites ? ` (${x.kiegeszites})` : '';
        if (x.fajta === 'tilalom') {
          hozzaad({ ...hol, sulyossag: 'figyelem', mi: x.nev, hatar: null, egyseg: '', mienk: null,
            szoveg: `${x.nev}${kieg} — engedéllyel vagy célforgalomban járható lehet.` });
          continue;
        }
        if (x.ertek == null) continue;
        const mienk = x.fajta === 'tengely' ? tengely : tomeg;
        const mi = x.fajta === 'tengely' ? 'tengelyterhelés' : 'össztömeg';
        if (mienk && mienk > x.ertek) {
          hozzaad({ ...hol, sulyossag: 'utkozes', mi, hatar: x.ertek, egyseg: 't', mienk,
            szoveg: `${x.nev}: ${x.ertek} t${kieg} — a szerelvény ${mienk} t.` });
        }
      }
    }
  }

  talalatok.sort((a, b) => (a.sulyossag === b.sulyossag ? 0 : a.sulyossag === 'utkozes' ? -1 : 1));
  return { talalatok, ellenorzott: szakaszok.length, hiany };
}

/** 27387 → „27+387” */
export function szelvenySzoveg(meter) {
  if (meter == null || !Number.isFinite(meter)) return '';
  const km = Math.floor(meter / 1000);
  const m = Math.round(meter - km * 1000);
  return `${km}+${String(m).padStart(3, '0')}`;
}
