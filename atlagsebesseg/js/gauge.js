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
   - középen nagy, fehér szám, alatta kicsiben a mértékegység.

   Menet közben egyetlen kérdés van: lassítsak vagy mehetek gyorsabban?
   Ezért a gyűrű a *pillanatnyi* sebességet rajzolja, és a színe azt
   mondja meg, hogy a tartható tempóhoz képest hol tartasz. A tartható
   tempót világos jel mutatja a gyűrűn: ameddig a gyűrű ér el, addig jó.
   A szakaszátlag ugyanezen a gyűrűn egy karikás Ø jel, a színe pedig a
   bírság szerinti állapot. Így egyetlen műszerről leolvasható mind a
   három, és semmi nem villog külön.

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

    /* A tartható tempó jele: eddig mehetsz. Világos vonás a gyűrűn át,
       kívül egy kis háromszöggel, hogy vezetés közben is megtaláld.  */
    this.celG = mk('g', { class: 'ora-forgo' });
    this.celJel = mk('path', {
      class: 'ora-cel',
      d: `M ${CX + R - VASTAG / 2 - 2} ${CY} L ${CX + R + VASTAG / 2 + 2} ${CY}`,
    });
    this.celCsucs = mk('path', {
      class: 'ora-cel-csucs',
      d: `M ${CX + R + VASTAG / 2 + 3} ${CY} l 8 -5 v 10 Z`,
    });
    this.celG.append(this.celJel, this.celCsucs);

    // a szakaszátlag jele ugyanezen a gyűrűn
    this.atlagG = mk('g', { class: 'ora-forgo' });
    this.atlagJel = mk('circle', {
      class: 'ora-atlagjel', cx: CX + R, cy: CY, r: 7,
    });
    this.atlagG.append(this.atlagJel);

    /* A világító ív elülső éle és a pillanatnyi sebesség jele forgatott
       csoportban ül: a transform-ot a CSS átúsztatja.                 */
    this.elG = mk('g', { class: 'ora-forgo' });
    this.elJel = mk('path', {
      class: 'ora-el',
      d: `M ${CX + R - VASTAG / 2} ${CY} L ${CX + R + VASTAG / 2} ${CY}`,
    });
    this.elG.append(this.elJel);

    /* A fejsor a nagy szám fölött: mérés közben itt áll a szakaszátlag,
       felirattal együtt, hogy ne kelljen kitalálni, melyik szám melyik.
       A lenti nyílás a táblának és az utasításnak marad.             */
    this.cimSzoveg = mk('text', {
      class: 'ora-cim', x: CX, y: CY - 62, 'text-anchor': 'middle',
    });
    this.cimSzoveg.textContent = 'SZAKASZÁTLAG';

    this.masodSzoveg = mk('text', {
      class: 'ora-masod', x: CX, y: CY - 38, 'text-anchor': 'middle',
    });

    this.ertekSzoveg = mk('text', {
      class: 'ora-ertek', x: CX, y: CY + 26, 'text-anchor': 'middle',
    });
    this.egysegSzoveg = mk('text', {
      class: 'ora-egyseg', x: CX, y: CY + 48, 'text-anchor': 'middle',
    });
    this.egysegSzoveg.textContent = 'km/h';

    svg.append(
      defs, this.derenges, this.csatorna, this.veszelySav,
      this.udvarIv, this.ertekIv, this.rovatkak, this.cimkek,
      this.celG, this.atlagG, this.elG,
      this.cimSzoveg, this.ertekSzoveg, this.egysegSzoveg, this.masodSzoveg
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
        // a számok kijjebb ülnek, hogy a célt jelző csücsök elférjen
        const [tx, ty] = pont(a, R + VASTAG / 2 + 20);
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
   * @param {{most:?number, atlag:number, cel:?number, limit:number,
   *          birsagHatar:number, allapot:string, atlagAllapot:string}} adat
   *        most:  a pillanatnyi sebesség; ha nincs (kalkulátor), a nagy
   *               szám a szakaszátlag lesz
   *        atlag: a szakaszátlag
   *        cel:   a tartható tempó, ameddig még jó
   *        allapot:      a gyűrű színe (most a célhoz mérve)
   *        atlagAllapot: a Ø jel és a másodlagos szám színe (bírság szerint)
   */
  frissit({ most, atlag, cel, limit, birsagHatar, allapot, atlagAllapot }) {
    const vanMost = isFinite(most) && most > 0;
    // a nagy szám vezetés közben a pillanatnyi sebesség, egyébként az átlag
    const fo = vanMost ? most : atlag;
    const vanFo = isFinite(fo) && fo > 0;

    const s = skala(limit, birsagHatar, Math.max(fo || 0, atlag || 0, cel || 0));
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
    }

    const t = vanFo ? this.#arany(fo, s) : 0;
    const eltolas = (IV_HOSSZ * (1 - t)).toFixed(1);

    this.ertekIv.setAttribute('stroke-dashoffset', eltolas);
    this.udvarIv.setAttribute('stroke-dashoffset', eltolas);
    this.ertekIv.setAttribute('class', `ora-iv ${allapot}`);
    this.udvarIv.setAttribute('class', `ora-iv udvar ${allapot}`);
    this.ertekIv.style.visibility = vanFo ? 'visible' : 'hidden';
    this.udvarIv.style.visibility = vanFo ? 'visible' : 'hidden';

    // a szám mögötti derengés az állapot színét veszi fel
    const szin = getComputedStyle(this.svg)
      .getPropertyValue(`--m-${allapot || 'semleges'}`).trim() || 'transparent';
    this.derengesBelso.setAttribute('stop-color', szin);
    this.derengesKulso.setAttribute('stop-color', szin);
    this.derenges.style.opacity = vanFo ? '1' : '0';

    // mérés előtt ne üljön a jel a skála alján, mintha nullát mérnénk
    const a = this.#szog(vanFo ? fo : s.min, s);
    this.elG.setAttribute('transform', `rotate(${(-a).toFixed(2)} ${CX} ${CY})`);
    this.elG.style.visibility = vanFo ? 'visible' : 'hidden';

    if (vanFo) {
      this.#szamlal(fo);
    } else {
      this.mutatottErtek = 0;
      this.ertekSzoveg.textContent = '-';
    }
    this.ertekSzoveg.setAttribute('class', `ora-ertek${vanFo ? '' : ' halvany'}`);

    /* A tartható tempó jele: eddig mehetsz. Ha nincs értelmes cél (még
       nincs adat), nem rajzolunk félrevezető jelet.                   */
    const vanCel = isFinite(cel) && cel > 0;
    this.celG.style.visibility = vanCel ? 'visible' : 'hidden';
    if (vanCel) {
      const ac = this.#szog(cel, s);
      this.celG.setAttribute('transform', `rotate(${(-ac).toFixed(2)} ${CX} ${CY})`);
    }

    /* A szakaszátlag ugyanezen a gyűrűn, karikás jellel. Csak akkor kell,
       ha a nagy szám mást mutat: a kalkulátorban a kettő ugyanaz.     */
    const vanAtlagJel = vanMost && isFinite(atlag) && atlag > 0;
    this.atlagG.style.visibility = vanAtlagJel ? 'visible' : 'hidden';
    if (vanAtlagJel) {
      const aa = this.#szog(atlag, s);
      this.atlagG.setAttribute('transform', `rotate(${(-aa).toFixed(2)} ${CX} ${CY})`);
      this.atlagJel.setAttribute('class', `ora-atlagjel ${atlagAllapot || 'semleges'}`);
    }

    /* Mérés közben a fejsorban a szakaszátlag áll, a nagy szám pedig a
       pillanatnyi sebesség. A kalkulátorban nincs pillanatnyi érték, ott
       a nagy szám maga a szakaszátlag, fejsor nélkül.                */
    this.cimSzoveg.style.visibility = vanMost ? 'visible' : 'hidden';
    this.masodSzoveg.textContent = vanAtlagJel ? `Ø ${Math.round(atlag)}` : '';
    this.masodSzoveg.setAttribute('class', `ora-masod ${atlagAllapot || 'semleges'}`);
    if (!vanMost) this.cimSzoveg.style.visibility = 'visible';
  }
}
