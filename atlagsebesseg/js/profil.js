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
   azt mutatja meg, hol keletkezett az az átlag.

   Egy valódi úton negyven fölötti korlátozásváltás is lehet. Telefon
   szélességében ezek egymásra csúsznak, ezért a grafikon nagyítható:
   nagyításkor a rajz szélesebb vászonra kerül (a betűk maradnak
   ugyanakkorák), és oldalt görgethető. Ami így sem fér ki, annak a
   felirata elmarad, a vonása marad.                                   */

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
export function profilMinta(pontok, szakaszok, rekeszek = 240) {
  if (!pontok || pontok.length < 3) return [];

  // pontonkénti sebesség és halmozott táv
  const nyers = [];
  let halmozott = 0;
  for (let i = 1; i < pontok.length; i++) {
    // a GPS-kiesés áthidalt szakasza nem megtett út, itt sem
    if (pontok[i].hezag) continue;
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
    const db = Math.max(1, Math.round(hossz / 100));
    for (let i = 0; i < db; i++) {
      minta.push({ tav: tav + (hossz * (i + 0.5)) / db, seb: atlag, limit: s.limit });
    }
    tav += hossz;
  }
  return minta;
}

/* ------------------------------------------------------------ geometria */

const ALAP_SZ = 320;
const ALAP_MA = 150;

/* A margó a feliratok méretéhez igazodik, nem a vászonéhoz. Az SVG-ben a
   betűket a CSS adja fix képpontban, ott tehát a margó is fix; a vásznon
   a betűk a rajzzal együtt nőnek, ott a margó is szorzót kap.        */
const margok = (k) => ({ BAL: 34 * k, JOBB: 8 * k, FENT: 14 * k, LENT: 26 * k });

/** A rajzoláshoz közös számítás: tengelyek, skála, sorozatok. */
function geometria(minta, { osszTav, sz, ma, margoSkala = 1 }) {
  const { BAL, JOBB, FENT, LENT } = margok(margoSkala);
  const teljes = osszTav || minta[minta.length - 1].tav;
  const elteres = (m) => (m.limit > 0 ? m.seb - m.limit : 0);
  const elteresek = minta.map(elteres);
  const felette = Math.max(5, ...elteresek);
  const alatta = Math.min(-5, ...elteresek);

  const x = (tav) => BAL + ((sz - BAL - JOBB) * tav) / (teljes || 1);
  const y = (e) => FENT + ((ma - FENT - LENT) * (felette - e)) / (felette - alatta);

  /* A korlátozás váltásai. Ami a nagyítás mellett túl közel esik az
     előzőhöz, az felirat nélkül marad: a vonása még segít tájékozódni,
     a rácsúszott szám viszont már csak zaj.                          */
  const valtasok = [];
  let elozo = null;
  let utolsoCimkeX = -Infinity;
  for (const m of minta) {
    if (!m.limit || m.limit === elozo) continue;
    const px = x(m.tav);
    const cimke = px - utolsoCimkeX >= 26 * margoSkala;
    if (cimke) utolsoCimkeX = px;
    valtasok.push({ tav: m.tav, limit: m.limit, cimke, uj: elozo !== null });
    elozo = m.limit;
  }

  return { teljes, elteres, felette, alatta, x, y, y0: y(0), valtasok,
           BAL, JOBB, FENT, LENT };
}

const km = (m) =>
  m >= 1000
    ? `${(m / 1000).toFixed(1).replace('.', ',')} km`
    : `${Math.round(m)} m`;

/* ------------------------------------------------------------- SVG rajz */

/**
 * Kirajzolja a profilt egy meglévő <svg> elembe.
 * @param {SVGElement} svg
 * @param {Array} minta
 * @param {{osszTav?:number, nagyitas?:number, magassag?:number}} opciok
 * @returns {boolean} igaz, ha volt mit rajzolni
 */
export function profilRajz(svg, minta, { osszTav, nagyitas = 1, magassag } = {}) {
  svg.innerHTML = '';
  if (!minta || minta.length < 2) return false;

  const sz = Math.round(ALAP_SZ * nagyitas);
  const ma = magassag || ALAP_MA;
  svg.setAttribute('viewBox', `0 0 ${sz} ${ma}`);
  /* A vászon a nagyítás arányában szélesedik, a betűk viszont maradnak
     ugyanakkorák: egy vászonegység így végig egy képpont marad.      */
  svg.style.width = `${100 * nagyitas}%`;

  const g = geometria(minta, { osszTav, sz, ma });
  const { BAL, JOBB, FENT, LENT } = g;

  // vízszintes segédvonalak és a skála
  for (const e of [g.felette, 0, g.alatta]) {
    const yy = g.y(e);
    svg.append(mk('line', {
      x1: BAL, y1: yy, x2: sz - JOBB, y2: yy,
      class: e === 0 ? 'pr-nulla' : 'pr-racs',
    }));
    // a szélső felirat elmarad, ha rácsúszna a nullára
    if (e !== 0 && Math.abs(yy - g.y0) < 12) continue;
    const c = mk('text', { x: BAL - 6, y: yy + 3.5, 'text-anchor': 'end', class: 'pr-cimke' });
    c.textContent = e === 0 ? '0' : `${e > 0 ? '+' : ''}${Math.round(e)}`;
    svg.append(c);
  }

  /* Két kitöltés: ami a nulla fölé megy, az a túllépés, ami alá, az a
     ráhagyás. Egyetlen zárt alakzat mindkettőre félrevezető lenne.   */
  svg.append(mk('path', { d: teruletUt(minta, g, -1), class: 'pr-alatt' }));
  svg.append(mk('path', { d: teruletUt(minta, g, 1), class: 'pr-felett' }));
  svg.append(mk('path', { d: vonalUt(minta, g), class: 'pr-vonal', fill: 'none' }));

  // korlátozásváltások
  for (const v of g.valtasok) {
    if (v.uj) {
      svg.append(mk('line', {
        x1: g.x(v.tav), y1: FENT, x2: g.x(v.tav), y2: ma - LENT, class: 'pr-valtas',
      }));
    }
    if (!v.cimke) continue;
    const jobbSzel = g.x(v.tav) > sz - JOBB - 20;
    const t = mk('text', {
      x: g.x(v.tav) + (jobbSzel ? -3 : 3), y: FENT + 8,
      'text-anchor': jobbSzel ? 'end' : 'start', class: 'pr-limit',
    });
    t.textContent = `${v.limit}`;
    svg.append(t);
  }

  // vízszintes skála: a szakasz eleje és vége
  const bal = mk('text', { x: BAL, y: ma - 6, class: 'pr-cimke' });
  bal.textContent = '0';
  const jobbC = mk('text', { x: sz - JOBB, y: ma - 6, 'text-anchor': 'end', class: 'pr-cimke' });
  jobbC.textContent = km(g.teljes);
  svg.append(bal, jobbC);

  return true;
}

/** Kitöltött terület a nulla vonal fölött (jel > 0) vagy alatt. */
function teruletUt(minta, g, jel) {
  let d = '';
  let nyitva = false;
  minta.forEach((m, i) => {
    const e = g.elteres(m);
    const bent = jel > 0 ? e > 0 : e < 0;
    if (bent && !nyitva) {
      d += `M ${g.x(m.tav).toFixed(1)} ${g.y0.toFixed(1)} `;
      nyitva = true;
    }
    if (bent) d += `L ${g.x(m.tav).toFixed(1)} ${g.y(e).toFixed(1)} `;
    if (nyitva && (!bent || i === minta.length - 1)) {
      const zaro = minta[bent ? i : Math.max(0, i - 1)];
      d += `L ${g.x(zaro.tav).toFixed(1)} ${g.y0.toFixed(1)} Z `;
      nyitva = false;
    }
  });
  return d;
}

function vonalUt(minta, g) {
  return minta
    .map((m, i) => `${i === 0 ? 'M' : 'L'} ${g.x(m.tav).toFixed(1)} ${g.y(g.elteres(m)).toFixed(1)}`)
    .join(' ');
}

/* ---------------------------------------------------------- vászonrajz */

/**
 * Ugyanaz a grafikon vászonra, a megosztható képhez. A CSS ott nem
 * segít, ezért a színeket kapja.
 *
 * @param {CanvasRenderingContext2D} c
 * @param {Array} minta
 * @param {{x:number, y:number, sz:number, ma:number, osszTav:number,
 *          szinek:Object, betu:string}} opciok
 */
export function profilVaszonra(c, minta, { x0, y0, sz, ma, osszTav, szinek, betu }) {
  if (!minta || minta.length < 2) return false;

  const k = ma / ALAP_MA;                  // a betűk is a mérettel nőnek
  const g = geometria(minta, { osszTav, sz, ma, margoSkala: k });
  const { BAL, JOBB, FENT, LENT } = g;
  const px = (tav) => x0 + g.x(tav);
  const py = (e) => y0 + g.y(e);

  c.save();

  // segédvonalak
  c.lineWidth = 1.5 * k;
  for (const e of [g.felette, 0, g.alatta]) {
    const yy = py(e);
    c.beginPath();
    c.setLineDash(e === 0 ? [] : [4 * k, 5 * k]);
    c.strokeStyle = e === 0 ? szinek.szoveg : szinek.keret;
    c.globalAlpha = e === 0 ? 0.55 : 1;
    c.moveTo(x0 + BAL, yy);
    c.lineTo(x0 + sz - JOBB, yy);
    c.stroke();
    c.globalAlpha = 1;
    if (e !== 0 && Math.abs(yy - py(0)) < 12 * k) continue;
    c.setLineDash([]);
    c.fillStyle = szinek.halvany;
    c.font = `500 ${Math.round(10 * k)}px ${betu}`;
    c.textAlign = 'right';
    c.fillText(e === 0 ? '0' : `${e > 0 ? '+' : ''}${Math.round(e)}`, x0 + BAL - 6 * k, yy + 3.5 * k);
  }
  c.setLineDash([]);

  // területek
  const terulet = (jel, szin) => {
    c.beginPath();
    let nyitva = false;
    minta.forEach((m, i) => {
      const e = g.elteres(m);
      const bent = jel > 0 ? e > 0 : e < 0;
      if (bent && !nyitva) {
        c.moveTo(px(m.tav), py(0));
        nyitva = true;
      }
      if (bent) c.lineTo(px(m.tav), py(e));
      if (nyitva && (!bent || i === minta.length - 1)) {
        const zaro = minta[bent ? i : Math.max(0, i - 1)];
        c.lineTo(px(zaro.tav), py(0));
        c.closePath();
        nyitva = false;
      }
    });
    c.fillStyle = szin;
    c.fill();
  };
  c.globalAlpha = 0.7;
  terulet(-1, szinek.ok);
  terulet(1, szinek.birsag);
  c.globalAlpha = 1;

  // a profil vonala
  c.beginPath();
  minta.forEach((m, i) => {
    const p = [px(m.tav), py(g.elteres(m))];
    if (i === 0) c.moveTo(...p); else c.lineTo(...p);
  });
  c.strokeStyle = szinek.szoveg;
  c.globalAlpha = 0.8;
  c.lineWidth = 1.8 * k;
  c.lineJoin = 'round';
  c.stroke();
  c.globalAlpha = 1;

  // korlátozásváltások
  c.font = `500 ${Math.round(9 * k)}px ${betu}`;
  for (const v of g.valtasok) {
    if (v.uj) {
      c.beginPath();
      c.setLineDash([3 * k, 4 * k]);
      c.strokeStyle = szinek.keret;
      c.lineWidth = 1.5 * k;
      c.moveTo(px(v.tav), y0 + FENT);
      c.lineTo(px(v.tav), y0 + ma - LENT);
      c.stroke();
      c.setLineDash([]);
    }
    if (!v.cimke) continue;
    const jobbSzel = g.x(v.tav) > sz - JOBB - 20 * k;
    c.fillStyle = szinek.halvany;
    c.textAlign = jobbSzel ? 'right' : 'left';
    c.fillText(`${v.limit}`, px(v.tav) + (jobbSzel ? -3 : 3) * k, y0 + FENT + 8 * k);
  }

  // vízszintes skála
  c.fillStyle = szinek.halvany;
  c.font = `500 ${Math.round(10 * k)}px ${betu}`;
  c.textAlign = 'left';
  c.fillText('0', x0 + BAL, y0 + ma - 6 * k);
  c.textAlign = 'right';
  c.fillText(km(g.teljes), x0 + sz - JOBB, y0 + ma - 6 * k);

  c.restore();
  return true;
}

export { ALAP_SZ, ALAP_MA };
