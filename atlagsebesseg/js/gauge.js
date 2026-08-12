/* Sebességóra: a mért szakaszátlagot mutatja mutatóval, a skálán pedig
   színezve a három tartományt — szabályos, túllépés bírság nélkül, bírság.

   A skála mindig a korlátozáshoz igazodik: 110-es határnál 80–140, 50-esnél
   20–80. Így a mutató a lényeges tartományban mozog, nem a skála szélén. */

const NS = 'http://www.w3.org/2000/svg';

const CX = 150;
const CY = 160;
const R = 110;          // színes ív sugara
const R_BELSO = 84;     // vékonyabb belső ív (a megtett tartomány)
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

/** A korlátozáshoz illeszkedő skála alsó és felső vége. */
export function skala(limit, birsagHatar) {
  const min = Math.max(0, Math.floor((limit - 30) / 10) * 10);
  const max = Math.ceil(Math.max(birsagHatar + 10, limit + 30) / 10) * 10;
  return { min, max };
}

export class Ora {
  constructor(svg) {
    this.svg = svg;
    svg.setAttribute('viewBox', '0 0 300 232');
    svg.innerHTML = '';

    this.hatter = mk('path', { class: 'ora-hatter', fill: 'none' });
    this.zonaOk = mk('path', { class: 'ora-zona ok', fill: 'none' });
    this.zonaHatar = mk('path', { class: 'ora-zona hatar', fill: 'none' });
    this.zonaBirsag = mk('path', { class: 'ora-zona birsag', fill: 'none' });
    this.belso = mk('path', { class: 'ora-belso', fill: 'none' });
    this.skalaJelek = mk('g', { class: 'ora-jelek' });
    this.limitJel = mk('polygon', { class: 'ora-limitjel' });
    this.mutato = mk('path', { class: 'ora-mutato' });
    this.tengely = mk('circle', { class: 'ora-tengely', cx: CX, cy: CY, r: 9 });

    this.ertekSzoveg = mk('text', {
      class: 'ora-ertek', x: CX, y: CY + 8, 'text-anchor': 'middle',
    });
    this.egysegSzoveg = mk('text', {
      class: 'ora-egyseg', x: CX, y: CY + 34, 'text-anchor': 'middle',
    });
    this.egysegSzoveg.textContent = 'km/h';

    svg.append(
      this.hatter, this.zonaOk, this.zonaHatar, this.zonaBirsag, this.belso,
      this.skalaJelek, this.limitJel, this.mutato, this.tengely,
      this.ertekSzoveg, this.egysegSzoveg
    );

    this.jelenlegi = { min: null, max: null, limit: null, hatar: null };
  }

  #szog(ertek, { min, max }) {
    const t = Math.min(1, Math.max(0, (ertek - min) / (max - min)));
    return A0 - IV * t;
  }

  /**
   * @param {{ertek:number, limit:number, birsagHatar:number, allapot:string}} adat
   *        allapot: 'ok' | 'hatar' | 'birsag' | 'semleges'
   */
  frissit({ ertek, limit, birsagHatar, allapot }) {
    const s = skala(limit, birsagHatar);
    const ujSkala =
      s.min !== this.jelenlegi.min || s.max !== this.jelenlegi.max ||
      limit !== this.jelenlegi.limit || birsagHatar !== this.jelenlegi.hatar;

    if (ujSkala) {
      this.jelenlegi = { ...s, limit, hatar: birsagHatar };
      this.hatter.setAttribute('d', iv(A0, A0 - IV, R));

      const aLimit = this.#szog(limit, s);
      const aHatar = this.#szog(birsagHatar, s);
      this.zonaOk.setAttribute('d', iv(A0, aLimit, R));
      this.zonaHatar.setAttribute('d', iv(aLimit, aHatar, R));
      this.zonaBirsag.setAttribute('d', iv(aHatar, A0 - IV, R));

      // skálaosztás: 10-esével vonal, minden másodiknál felirat
      this.skalaJelek.innerHTML = '';
      const lepes = (s.max - s.min) > 80 ? 20 : 10;
      for (let v = s.min; v <= s.max; v += 10) {
        const a = this.#szog(v, s);
        const [x1, y1] = pont(a, R - 13);
        const [x2, y2] = pont(a, R - 20);
        this.skalaJelek.append(mk('line', { x1, y1, x2, y2, class: 'ora-tick' }));
        if ((v - s.min) % lepes === 0) {
          const [tx, ty] = pont(a, R - 32);
          const t = mk('text', { x: tx, y: ty + 5, 'text-anchor': 'middle', class: 'ora-cimke' });
          t.textContent = String(v);
          this.skalaJelek.append(t);
        }
      }

      // a korlátozás helye: fehér háromszög az ív fölött
      const [lx, ly] = pont(aLimit, R + 9);
      const [bx, by] = pont(aLimit + 3.2, R + 24);
      const [jx, jy] = pont(aLimit - 3.2, R + 24);
      this.limitJel.setAttribute(
        'points',
        `${lx.toFixed(1)},${ly.toFixed(1)} ${bx.toFixed(1)},${by.toFixed(1)} ${jx.toFixed(1)},${jy.toFixed(1)}`
      );
    }

    const van = isFinite(ertek) && ertek > 0;
    const a = this.#szog(van ? ertek : s.min, s);

    this.belso.setAttribute('d', van ? iv(A0, a, R_BELSO) : '');
    this.belso.setAttribute('class', `ora-belso ${allapot}`);

    const [mx, my] = pont(a, R - 26);
    const [hx, hy] = pont(a + 180, 14);
    this.mutato.setAttribute('d', `M ${hx.toFixed(1)} ${hy.toFixed(1)} L ${mx.toFixed(1)} ${my.toFixed(1)}`);
    this.mutato.setAttribute('class', `ora-mutato ${allapot}`);

    this.ertekSzoveg.textContent = van ? String(Math.round(ertek)) : '—';
    this.ertekSzoveg.setAttribute('class', `ora-ertek ${allapot}`);
  }
}
