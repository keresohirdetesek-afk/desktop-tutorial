/* Sebességóra a mai autók digitális műszeregységének modorában.

   A minta egy gyári műszerfal: majdnem fekete alapon egy vastag,
   hátulról megvilágított gyűrű, középen nagy fehér számmal. Nem vékony
   vonalrajz, hanem világító szalag, ami mögött ott dereng a fény.

   Ezért itt:
   - a gyűrűnek van egy sötét csatornája (a ki nem világított rész) és
     egy világító íve (a mért szakaszátlagig);
   - a világítást széles, halvány másolat és a szám mögötti derengés adja,
     szűrő nélkül, hogy mobilon se akadjon;
   - az osztások a gyűrűbe vágott sötét rovátkák, nem külön vonalkák;
   - a bírságos tartomány a csatornán is látszik, mint a fordulatszámmérő
     vörös mezője;
   - a korlátozás helyét világos vonás jelöli a gyűrűn át;
   - középen nagy, fehér szám, alatta kicsiben a mértékegység.

   A skála mindig a korlátozáshoz igazodik: 110-es határnál 80-140,
   50-esnél 20-80. Így a lényeges tartomány tölti ki a számlapot.     */

import { MAX_SEBESSEG } from './geo.js';

const NS = 'http://www.w3.org/2000/svg';

const CX = 150;
const CY = 144;
const R = 100;          // a gyűrű középvonala
const VASTAG = 19;      // a gyűrű vastagsága
const A0 = 214;         // bal alsó vég, fokban
const IV = 248;         // teljes elfordulás

/* Az ívet normalizált hosszúságúra állítjuk. Így a kirajzolt hányadot
   egyetlen szám, a stroke-dashoffset adja, amit a CSS át tud úsztatni:
   ez sokkal simább, mint minden fixnél új útvonalat számolni.        */
const IV_HOSSZ = 1000;

let egyediSzamlalo = 0;

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
    A mért érték is beleszámít: enélkül nagy túllépésnél a jel a skála
    végén megülne, és ellentmondana a közepén álló számnak.            */
export function skala(limit, birsagHatar, ertek = 0) {
  const min = Math.max(0, Math.floor((limit - 30) / 10) * 10);
  const felso = Math.max(birsagHatar + 10, limit + 30, (ertek || 0) + 10);
  return { min, max: Math.min(MAX_SEBESSEG, Math.ceil(felso / 10) * 10) };
}

export class Ora {
  constructor(svg) {
    this.svg = svg;
    svg.setAttribute('viewBox', '0 0 300 246');
    svg.innerHTML = '';

    const ivPalya = iv(A0, A0 - IV, R);
    const id = `ora${++egyediSzamlalo}`;

    /* A szám mögötti derengés: a gyári műszeren a gyűrű fénye beleszóródik
       a számlap közepébe. Sugaras színátmenet adja, az állapot színével. */
    const defs = mk('defs');
    this.derengesSzin = mk('radialGradient', { id: `${id}-dereng` });
    this.derengesBelso = mk('stop', { offset: '0%', 'stop-opacity': '0.30' });
    this.derengesKulso = mk('stop', { offset: '100%', 'stop-opacity': '0' });
    this.derengesSzin.append(this.derengesBelso, this.derengesKulso);
    defs.append(this.derengesSzin);
    this.derenges = mk('circle', {
      cx: CX, cy: CY, r: R - 4, fill: `url(#${id}-dereng)`,
    });

    // a gyűrű sötét csatornája: a ki nem világított rész
    this.csatorna = mk('path', { class: 'ora-csatorna', fill: 'none', d: ivPalya });
    // a bírságos tartomány a csatornán, mint a fordulatszámmérő vörös mezője
    this.veszelySav = mk('path', { class: 'ora-veszely', fill: 'none' });

    /* A mért érték íve kétszer van meg: egyszer szélesen és halványan
       (ez a fényudvar), egyszer élesen.                               */
    this.udvarIv = mk('path', {
      class: 'ora-iv udvar', fill: 'none', d: ivPalya,
      pathLength: IV_HOSSZ, 'stroke-dasharray': IV_HOSSZ,
      'stroke-dashoffset': IV_HOSSZ,
    });
    this.ertekIv = mk('path', {
      class: 'ora-iv', fill: 'none', d: ivPalya,
      pathLength: IV_HOSSZ, 'stroke-dasharray': IV_HOSSZ,
      'stroke-dashoffset': IV_HOSSZ,
    });

    // osztások: a gyűrűbe vágott sötét rovátkák és kívül a számok
    this.rovatkak = mk('g', { class: 'ora-rovatkak' });
    this.cimkek = mk('g', { class: 'ora-cimkek' });

    // a korlátozás helye: világos vonás a gyűrűn át
    this.limitJel = mk('path', { class: 'ora-limitjel' });

    /* A világító ív elülső éle és a pillanatnyi sebesség jele forgatott
       csoportban ül: a transform-ot a CSS átúsztatja.                 */
    this.elG = mk('g', { class: 'ora-forgo' });
    this.elJel = mk('path', {
      class: 'ora-el',
      d: `M ${CX + R - VASTAG / 2} ${CY} L ${CX + R + VASTAG / 2} ${CY}`,
    });
    this.elG.append(this.elJel);

    this.pillG = mk('g', { class: 'ora-forgo' });
    this.pillJel = mk('path', {
      class: 'ora-pill-jel',
      d: `M ${CX + R - VASTAG / 2 - 12} ${CY} L ${CX + R - VASTAG / 2 - 3} ${CY}`,
    });
    this.pillG.append(this.pillJel);

    this.cimSzoveg = mk('text', {
      class: 'ora-cim', x: CX, y: CY - 46, 'text-anchor': 'middle',
    });
    this.cimSzoveg.textContent = 'SZAKASZÁTLAG';

    this.ertekSzoveg = mk('text', {
      class: 'ora-ertek', x: CX, y: CY + 22, 'text-anchor': 'middle',
    });
    this.egysegSzoveg = mk('text', {
      class: 'ora-egyseg', x: CX, y: CY + 44, 'text-anchor': 'middle',
    });
    this.egysegSzoveg.textContent = 'km/h';

    svg.append(
      defs, this.derenges, this.csatorna, this.veszelySav,
      this.udvarIv, this.ertekIv, this.rovatkak, this.cimkek,
      this.limitJel, this.elG, this.pillG,
      this.cimSzoveg, this.ertekSzoveg, this.egysegSzoveg
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

  #arany(ertek, { min, max }) {
    return Math.min(1, Math.max(0, (ertek - min) / (max - min)));
  }

  #szog(ertek, s) {
    return A0 - IV * this.#arany(ertek, s);
  }

  /** Osztások: rovátka a gyűrűben, szám kívül. */
  #jelek(s, birsagHatar) {
    this.rovatkak.innerHTML = '';
    this.cimkek.innerHTML = '';
    const cimkeLepes = (s.max - s.min) > 80 ? 20 : 10;
    for (let v = s.min; v <= s.max; v += 10) {
      const a = this.#szog(v, s);
      const [x1, y1] = pont(a, R - VASTAG / 2);
      const [x2, y2] = pont(a, R + VASTAG / 2);
      this.rovatkak.append(mk('line', { x1, y1, x2, y2, class: 'ora-rovatka' }));
      if ((v - s.min) % cimkeLepes === 0) {
        const [tx, ty] = pont(a, R + VASTAG / 2 + 14);
        const t = mk('text', {
          x: tx, y: ty + 4, 'text-anchor': 'middle',
          class: `ora-cimke${v > birsagHatar ? ' birsag' : ''}`,
        });
        t.textContent = String(v);
        this.cimkek.append(t);
      }
    }
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

    if (ujSkala) {
      this.jelenlegi = { ...s, limit, hatar: birsagHatar };
      this.#jelek(s, birsagHatar);

      const aHatar = this.#szog(birsagHatar, s);
      this.veszelySav.setAttribute(
        'd', birsagHatar < s.max ? iv(aHatar, A0 - IV, R) : ''
      );

      const aLimit = this.#szog(limit, s);
      const [k1x, k1y] = pont(aLimit, R - VASTAG / 2 - 3);
      const [k2x, k2y] = pont(aLimit, R + VASTAG / 2 + 3);
      this.limitJel.setAttribute(
        'd', `M ${k1x.toFixed(1)} ${k1y.toFixed(1)} L ${k2x.toFixed(1)} ${k2y.toFixed(1)}`
      );
    }

    const van = isFinite(ertek) && ertek > 0;
    const t = van ? this.#arany(ertek, s) : 0;
    const eltolas = (IV_HOSSZ * (1 - t)).toFixed(1);

    this.ertekIv.setAttribute('stroke-dashoffset', eltolas);
    this.udvarIv.setAttribute('stroke-dashoffset', eltolas);
    this.ertekIv.setAttribute('class', `ora-iv ${allapot}`);
    this.udvarIv.setAttribute('class', `ora-iv udvar ${allapot}`);
    this.ertekIv.style.visibility = van ? 'visible' : 'hidden';
    this.udvarIv.style.visibility = van ? 'visible' : 'hidden';

    // a szám mögötti derengés az állapot színét veszi fel
    const szin = getComputedStyle(this.svg)
      .getPropertyValue(`--m-${allapot === 'semleges' ? 'semleges' : allapot}`)
      .trim() || 'transparent';
    this.derengesBelso.setAttribute('stop-color', szin);
    this.derengesKulso.setAttribute('stop-color', szin);
    this.derenges.style.opacity = van ? '1' : '0';

    // mérés előtt ne üljön a jel a skála alján, mintha nullát mérnénk
    const a = this.#szog(van ? ertek : s.min, s);
    this.elG.setAttribute('transform', `rotate(${(-a).toFixed(2)} ${CX} ${CY})`);
    this.elG.style.visibility = van ? 'visible' : 'hidden';

    if (van) {
      this.#szamlal(ertek);
    } else {
      this.mutatottErtek = 0;
      this.ertekSzoveg.textContent = '-';
    }
    this.ertekSzoveg.setAttribute('class', `ora-ertek${van ? '' : ' halvany'}`);

    /* A pillanatnyi sebességnek a gyűrű belső élén van jele. A száma a
       műszer lábsorában áll, hogy a nagy szám maradjon a szakaszátlagé. */
    const vanPill = isFinite(pillanat) && pillanat > 0;
    this.pillG.style.visibility = vanPill ? 'visible' : 'hidden';
    if (vanPill) {
      const ap = this.#szog(pillanat, s);
      this.pillG.setAttribute('transform', `rotate(${(-ap).toFixed(2)} ${CX} ${CY})`);
    }
  }
}
