/* Sebességprofil: hol, mennyivel haladtál a korlátozás felett.

   Az eredménykártya egyetlen számot mond (a szakaszátlagot), a
   szakaszlista pedig részenként bont. Egyik sem mutatja meg, hogy a
   szakaszon belül hol gyorsultál be. Ez a grafikon igen.

   A vízszintes tengely a megtett út, a nulla vonal a helyben érvényes
   korlátozás. Ami a vonal fölé nyúlik, azzal többel mentél; ami alá, azzal
   kevesebbel. Így a korlátozás változása nem billenti meg a képet: egy
   lakott területi 50-es és egy autópályás 130-as ugyanazon a nullán ül.

   Fontos, és a felirat is kimondja: ez a pillanatnyi sebesség, nem a
   szakaszátlag. Bírság nem ebből lesz, hanem az átlagból. A grafikon
   azt mutatja meg, hol keletkezett az az átlag.                       */

import { haversine, MAX_SEBESSEG } from './geo.js';

const NS = 'http://www.w3.org/2000/svg';

const mk = (nev, attrs = {}) => {
  const n = document.createElementNS(NS, nev);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
};

/**
 * Mintavétel a nyomvonalból: pontonkénti sebesség és az ott érvényes
 * korlátozás, egyenletes távolságközökre újramintázva.
 *
 * @param {Array<{lat:number, lon:number, t:number}>} pontok
 * @param {Array<{i0:number, i1:number, limit:number}>} szakaszok
 * @param {number} rekeszek hány oszlopra bontsuk a szakaszt
 * @returns {Array<{tav:number, seb:number, limit:number}>}
 */
export function profilMinta(pontok, szakaszok, rekeszek = 120) {
  if (!pontok || pontok.length < 3) return [];

  // pontonkénti sebesség és halmozott táv
  const nyers = [];
  let halmozott = 0;
  for (let i = 1; i < pontok.length; i++) {
    const d = haversine(pontok[i - 1], pontok[i]);
    const dt = (pontok[i].t - pontok[i - 1].t) / 1000;
    if (!(dt > 0) || !(d >= 0)) continue;
    halmozott += d;
    nyers.push({
      tav: halmozott,
      seb: Math.min((d / dt) * 3.6, MAX_SEBESSEG),
      limit: limitIndexre(szakaszok, i),
    });
  }
  if (nyers.length < 2) return [];

  const teljes = nyers[nyers.length - 1].tav;
  if (!(teljes > 0)) return [];

  /* Egyenletes távolságközök: enélkül az álló helyzetben töltött idő
     ugyanannyi helyet foglalna a grafikonon, mint egy kilométer út. */
  const szeles = teljes / rekeszek;
  const minta = [];
  let j = 0;
  for (let r = 0; r < rekeszek; r++) {
    const tol = r * szeles;
    const ig = tol + szeles;
    let osszSeb = 0;
    let db = 0;
    let limit = 0;
    while (j < nyers.length && nyers[j].tav <= ig) {
      osszSeb += nyers[j].seb;
      limit = nyers[j].limit || limit;
      db++;
      j++;
    }
    const elozo = minta[minta.length - 1];
    minta.push({
      tav: tol + szeles / 2,
      seb: db > 0 ? osszSeb / db : (elozo ? elozo.seb : 0),
      limit: limit || (elozo ? elozo.limit : 0),
    });
  }

  // a GPS zaja pontonként több km/h is lehet: háromtagú simítás
  return minta.map((m, i) => {
    const a = minta[Math.max(0, i - 1)];
    const b = minta[Math.min(minta.length - 1, i + 1)];
    return { ...m, seb: (a.seb + m.seb + b.seb) / 3 };
  });
}

function limitIndexre(szakaszok, i) {
  if (!szakaszok) return 0;
  for (const sz of szakaszok) if (i >= sz.i0 && i <= sz.i1) return sz.limit;
  return szakaszok.length ? szakaszok[szakaszok.length - 1].limit : 0;
}

/** Egyenletes tempójú menet profilja: a kalkulátorhoz, ahol nincs nyomvonal. */
export function profilSorokbol(sorok, atlag) {
  const minta = [];
  let tav = 0;
  for (const s of sorok) {
    const hossz = s.hossz * 1000;
    // rövid részekből is legyen legalább egy oszlop
    const db = Math.max(1, Math.round((hossz / 100)));
    for (let i = 0; i < db; i++) {
      minta.push({ tav: tav + (hossz * (i + 0.5)) / db, seb: atlag, limit: s.limit });
    }
    tav += hossz;
  }
  return minta;
}

const SZ = 320;
const MA = 150;
const BAL = 34;
const JOBB = 8;
const FENT = 12;
const LENT = 24;

/**
 * Kirajzolja a profilt egy meglévő <svg> elembe.
 * @returns {boolean} igaz, ha volt mit rajzolni
 */
export function profilRajz(svg, minta, { osszTav } = {}) {
  svg.innerHTML = '';
  if (!minta || minta.length < 2) return false;

  svg.setAttribute('viewBox', `0 0 ${SZ} ${MA}`);
  const teljes = osszTav || minta[minta.length - 1].tav;

  const elteresek = minta.map((m) => (m.limit > 0 ? m.seb - m.limit : 0));
  const felette = Math.max(5, ...elteresek);
  const alatta = Math.min(-5, ...elteresek);

  const x = (tav) => BAL + ((SZ - BAL - JOBB) * tav) / (teljes || 1);
  const y = (e) => FENT + ((MA - FENT - LENT) * (felette - e)) / (felette - alatta);
  const y0 = y(0);

  // vízszintes segédvonalak és a skála
  for (const e of [felette, 0, alatta]) {
    const yy = y(e);
    svg.append(mk('line', {
      x1: BAL, y1: yy, x2: SZ - JOBB, y2: yy,
      class: e === 0 ? 'pr-nulla' : 'pr-racs',
    }));
    // a szélső felirat elmarad, ha rácsúszna a nullára
    if (e !== 0 && Math.abs(yy - y0) < 12) continue;
    const c = mk('text', { x: BAL - 6, y: yy + 3.5, 'text-anchor': 'end', class: 'pr-cimke' });
    c.textContent = e === 0 ? '0' : `${e > 0 ? '+' : ''}${Math.round(e)}`;
    svg.append(c);
  }

  /* Két kitöltés: ami a nulla fölé megy, az a túllépés, ami alá, az a
     ráhagyás. Egyetlen zárt alakzat mindkettőre félrevezető lenne.   */
  const teruletek = (jel) => {
    let d = '';
    let nyitva = false;
    minta.forEach((m, i) => {
      const e = m.limit > 0 ? m.seb - m.limit : 0;
      const bent = jel > 0 ? e > 0 : e < 0;
      if (bent && !nyitva) {
        d += `M ${x(m.tav).toFixed(1)} ${y0.toFixed(1)} `;
        nyitva = true;
      }
      if (bent) d += `L ${x(m.tav).toFixed(1)} ${y(e).toFixed(1)} `;
      if (nyitva && (!bent || i === minta.length - 1)) {
        const zaro = minta[bent ? i : Math.max(0, i - 1)];
        d += `L ${x(zaro.tav).toFixed(1)} ${y0.toFixed(1)} Z `;
        nyitva = false;
      }
    });
    return d;
  };

  svg.append(mk('path', { d: teruletek(-1), class: 'pr-alatt' }));
  svg.append(mk('path', { d: teruletek(1), class: 'pr-felett' }));

  // a profil vonala
  const vonal = minta
    .map((m, i) => {
      const e = m.limit > 0 ? m.seb - m.limit : 0;
      return `${i === 0 ? 'M' : 'L'} ${x(m.tav).toFixed(1)} ${y(e).toFixed(1)}`;
    })
    .join(' ');
  svg.append(mk('path', { d: vonal, class: 'pr-vonal', fill: 'none' }));

  /* Korlátozásváltások: függőleges vonás és a hozzá tartozó szám. Ha az
     egész szakaszon egyetlen korlátozás van, nincs mit jelölni: az érték
     az eredménykártyán amúgy is ott áll.                              */
  const limitek = [...new Set(minta.map((m) => m.limit).filter(Boolean))];
  if (limitek.length > 1) {
    let elozoLimit = minta[0].limit;
    const jel = (tav, limit) => {
      svg.append(mk('line', {
        x1: x(tav), y1: FENT, x2: x(tav), y2: MA - LENT, class: 'pr-valtas',
      }));
      // a szakasz végénél a szám befelé fordul, hogy ne lógjon ki
      const jobbSzel = x(tav) > SZ - JOBB - 20;
      const t = mk('text', {
        x: x(tav) + (jobbSzel ? -3 : 3), y: FENT + 9,
        'text-anchor': jobbSzel ? 'end' : 'start', class: 'pr-limit',
      });
      t.textContent = `${limit}`;
      svg.append(t);
    };
    jel(0, elozoLimit);
    for (const m of minta) {
      if (m.limit && m.limit !== elozoLimit) {
        jel(m.tav, m.limit);
        elozoLimit = m.limit;
      }
    }
  }

  // vízszintes skála: a szakasz eleje és vége
  const km = (m) => `${(m / 1000).toFixed(1).replace('.', ',')} km`;
  const bal = mk('text', { x: BAL, y: MA - 6, class: 'pr-cimke' });
  bal.textContent = '0';
  const jobbC = mk('text', { x: SZ - JOBB, y: MA - 6, 'text-anchor': 'end', class: 'pr-cimke' });
  jobbC.textContent = km(teljes);
  svg.append(bal, jobbC);

  return true;
}
