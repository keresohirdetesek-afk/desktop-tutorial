/* Sebességóra: a mért szakaszátlagot mutatja mutatóval, a skálán pedig
   színezve a három tartományt — szabályos, túllépés bírság nélkül, bírság.

   A skála mindig a korlátozáshoz igazodik: 110-es határnál 80–140, 50-esnél
   20–80. Így a mutató a lényeges tartományban mozog, nem a skála szélén.

   A számok az ív *külső* oldalán vannak: belül a nagy érték ül, és ha a
   feliratok is ott lennének, keskeny kijelzőn egymásra csúsznának.      */

import { MAX_SEBESSEG } from './geo.js';

const NS = 'http://www.w3.org/2000/svg';

const CX = 150;
const CY = 158;
const R = 100;          // színes ív sugara
const R_BELSO = 78;     // vékonyabb belső ív (a megtett tartomány)
const A0 = 210;         // bal alsó vég, fokban
const IV = 240;         // teljes elfordulás

const mk = (nev, attrs = {}) => {
  const n = document.createElementNS(NS, nev);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
};

const pont = (szog, r) => {
  const a = (szog * Math.PI) / 180;
  return [CX + r * Math.cos(a), CY - r * Math.sin(a)];
};

/** Körív útvonal két szög között (az óramutató járásával egyezően). */
function iv(szogA, szogB, r) {
  const [x1, y1] = pont(szogA, r);
  const [x2, y2] = pont(szogB, r);
  const nagy = Math.abs(szogA - szogB) > 180 ? 1 : 0;
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${nagy} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

/** A korlátozáshoz illeszkedő skála alsó és felső vége.
    A mért érték is beleszámít: enélkül nagy túllépésnél a mutató a skála
    végén megülne, és ellentmondana a közepén álló számnak.            */
export function skala(limit, birsagHatar, ertek = 0) {
  const min = Math.max(0, Math.floor((limit - 30) / 10) * 10);
  const felso = Math.max(birsagHatar + 10, limit + 30, (ertek || 0) + 10);
  return { min, max: Math.min(MAX_SEBESSEG, Math.ceil(felso / 10) * 10) };
}

export class Ora {
  constructor(svg) {
    this.svg = svg;
    svg.setAttribute('viewBox', '0 0 300 244');
    svg.innerHTML = '';

    this.hatter = mk('path', { class: 'ora-hatter', fill: 'none' });
    this.zonaOk = mk('path', { class: 'ora-zona ok', fill: 'none' });
    this.zonaHatar = mk('path', { class: 'ora-zona hatar', fill: 'none' });
    this.zonaBirsag = mk('path', { class: 'ora-zona birsag', fill: 'none' });
    this.belso = mk('path', { class: 'ora-belso', fill: 'none' });
    this.skalaJelek = mk('g', { class: 'ora-jelek' });
    this.limitJel = mk('path', { class: 'ora-limitjel' });
    /* A mutatók vízszintesen megrajzolva, forgatott csoportban ülnek.
       Így a mozgásukat a CSS tudja átúsztatni: az SVG `d` attribútumot
       nem lehet megbízhatóan animálni, a `transform`-ot igen.        */
    this.mutatoPillG = mk('g', { class: 'ora-mutato-g' });
    this.mutatoPill = mk('path', {
      class: 'ora-mutato-pill',
      d: `M ${CX - 8} ${CY} L ${CX + R - 10} ${CY}`,
    });
    this.mutatoPillG.append(this.mutatoPill);

    this.mutatoG = mk('g', { class: 'ora-mutato-g' });
    this.mutato = mk('path', {
      class: 'ora-mutato',
      d: `M ${CX - 12} ${CY} L ${CX + R - 22} ${CY}`,
    });
    this.mutatoG.append(this.mutato);
    this.tengely = mk('circle', { class: 'ora-tengely', cx: CX, cy: CY, r: 8 });

    this.ertekSzoveg = mk('text', {
      class: 'ora-ertek', x: CX, y: CY + 8, 'text-anchor': 'middle',
    });
    this.egysegSzoveg = mk('text', {
      class: 'ora-egyseg', x: CX, y: CY + 32, 'text-anchor': 'middle',
    });
    this.egysegSzoveg.textContent = 'km/h';

    this.mostSzoveg = mk('text', {
      class: 'ora-most', x: CX, y: CY + 54, 'text-anchor': 'middle',
    });

    svg.append(
      this.hatter, this.zonaOk, this.zonaHatar, this.zonaBirsag, this.belso,
      this.skalaJelek, this.limitJel, this.mutatoPillG, this.mutatoG, this.tengely,
      this.ertekSzoveg, this.egysegSzoveg, this.mostSzoveg
    );

    this.jelenlegi = { min: null, max: null, limit: null, hatar: null };
    this.mutatottErtek = 0;   // a számláló animációhoz
    this.animacio = null;
  }

  /** A nagy szám átszámlál az új értékre, hogy a műszer élőnek hasson. */
  #szamlal(cel) {
    const kerek = Math.round(cel);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.mutatottErtek = kerek;
      this.ertekSzoveg.textContent = String(kerek);
      return;
    }
    const kezdo = this.mutatottErtek;
    if (kezdo === kerek) return;
    cancelAnimationFrame(this.animacio);
    const t0 = performance.now();
    const HOSSZ = 320;
    const lepes = (most) => {
      const t = Math.min(1, (most - t0) / HOSSZ);
      const lagy = 1 - Math.pow(1 - t, 3);
      const ertek = Math.round(kezdo + (kerek - kezdo) * lagy);
      this.ertekSzoveg.textContent = String(ertek);
      this.mutatottErtek = ertek;
      if (t < 1) this.animacio = requestAnimationFrame(lepes);
    };
    this.animacio = requestAnimationFrame(lepes);
  }

  #szog(ertek, { min, max }) {
    const t = Math.min(1, Math.max(0, (ertek - min) / (max - min)));
    return A0 - IV * t;
  }

  /**
   * @param {{ertek:number, pillanat:?number, limit:number, birsagHatar:number,
   *           allapot:string}} adat
   *        ertek: a szakaszátlag, pillanat: az éppen mért sebesség
   *        allapot: 'ok' | 'hatar' | 'birsag' | 'semleges'
   */
  frissit({ ertek, pillanat, limit, birsagHatar, allapot }) {
    const s = skala(limit, birsagHatar, ertek);
    const ujSkala =
      s.min !== this.jelenlegi.min || s.max !== this.jelenlegi.max ||
      limit !== this.jelenlegi.limit || birsagHatar !== this.jelenlegi.hatar;
    // a skála a mért értékkel nőhet, de ne ugráljon vissza minden fixnél

    if (ujSkala) {
      this.jelenlegi = { ...s, limit, hatar: birsagHatar };
      this.hatter.setAttribute('d', iv(A0, A0 - IV, R));

      const aLimit = this.#szog(limit, s);
      const aHatar = this.#szog(birsagHatar, s);
      this.zonaOk.setAttribute('d', iv(A0, aLimit, R));
      this.zonaHatar.setAttribute('d', iv(aLimit, aHatar, R));
      this.zonaBirsag.setAttribute('d', iv(aHatar, A0 - IV, R));

      // osztás és felirat kívül, hogy a belső tér a nagy számé maradjon
      this.skalaJelek.innerHTML = '';
      const lepes = (s.max - s.min) > 80 ? 20 : 10;
      for (let v = s.min; v <= s.max; v += 10) {
        const a = this.#szog(v, s);
        const [x1, y1] = pont(a, R + 10);
        const [x2, y2] = pont(a, R + 15);
        this.skalaJelek.append(mk('line', { x1, y1, x2, y2, class: 'ora-tick' }));
        if ((v - s.min) % lepes === 0) {
          const [tx, ty] = pont(a, R + 27);
          const t = mk('text', { x: tx, y: ty + 5, 'text-anchor': 'middle', class: 'ora-cimke' });
          t.textContent = String(v);
          this.skalaJelek.append(t);
        }
      }

      // a korlátozás helye: az íven átvágó fehér vonás
      const [k1x, k1y] = pont(aLimit, R - 11);
      const [k2x, k2y] = pont(aLimit, R + 11);
      this.limitJel.setAttribute(
        'd', `M ${k1x.toFixed(1)} ${k1y.toFixed(1)} L ${k2x.toFixed(1)} ${k2y.toFixed(1)}`
      );
    }

    const van = isFinite(ertek) && ertek > 0;
    const a = this.#szog(van ? ertek : s.min, s);

    this.belso.setAttribute('d', van ? iv(A0, a, R_BELSO) : '');
    this.belso.setAttribute('class', `ora-belso ${allapot}`);

    // mérés előtt ne álljon a mutató a skála alján, mintha nullát mérnénk
    this.mutatoG.setAttribute('transform', `rotate(${(-a).toFixed(2)} ${CX} ${CY})`);
    this.mutatoG.style.visibility = van ? 'visible' : 'hidden';
    this.mutato.setAttribute('class', `ora-mutato ${allapot}`);
    this.tengely.setAttribute('class', `ora-tengely${van ? '' : ' halvany'}`);

    if (van) {
      this.#szamlal(ertek);
    } else {
      this.mutatottErtek = 0;
      this.ertekSzoveg.textContent = '-';
    }
    this.ertekSzoveg.setAttribute('class', `ora-ertek ${allapot}${van ? '' : ' halvany'}`);

    const vanPill = isFinite(pillanat) && pillanat > 0;
    this.mutatoPillG.style.visibility = vanPill ? 'visible' : 'hidden';
    if (vanPill) {
      const ap = this.#szog(pillanat, s);
      this.mutatoPillG.setAttribute('transform', `rotate(${(-ap).toFixed(2)} ${CX} ${CY})`);
      this.mostSzoveg.textContent = `most: ${Math.round(pillanat)}`;
    } else {
      this.mostSzoveg.textContent = '';
    }
  }
}
