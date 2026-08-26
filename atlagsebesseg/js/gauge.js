/* Sebességóra a mai autók digitális műszerfalának modorában.

   A régi változat vastag, színes sávokkal dolgozott, és mutatóval. Ez
   messziről olvasható volt, de úgy nézett ki, mint egy nyomtatott
   számlap. A mai műszeregységek fordítva építkeznek: minden halvány,
   és csak az él, ami éppen történik.

   Ezért itt:
   - a számlap egyetlen hajszálvékony ív, alig látható;
   - a tartományokat nem sávok, hanem a skálaosztások színe jelzi;
   - a mért szakaszátlagot egy vékony, világító ív rajzolja ki az ív
     elejétől, a végén egy pontocskával; mutató nincs;
   - a pillanatnyi sebesség egy vékony jel az íven belül, hogy a kettő
     távolsága látsszon, de ne vonja el a figyelmet;
   - középen nagy, könnyű vonalvezetésű szám.

   A skála mindig a korlátozáshoz igazodik: 110-es határnál 80-140,
   50-esnél 20-80. Így a lényeges tartomány tölti ki a számlapot.     */

import { MAX_SEBESSEG } from './geo.js';

const NS = 'http://www.w3.org/2000/svg';

const CX = 150;
const CY = 150;
const R = 104;          // a számlap íve
const A0 = 214;         // bal alsó vég, fokban
const IV = 248;         // teljes elfordulás

/* Az ívet normalizált hosszúságúra állítjuk. Így a kirajzolt hányadot
   egyetlen szám, a stroke-dashoffset adja, amit a CSS át tud úsztatni:
   ez sokkal simább, mint minden fixnél új útvonalat számolni.        */
const IV_HOSSZ = 1000;

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
    svg.setAttribute('viewBox', '0 0 300 244');
    svg.innerHTML = '';

    const ivPalya = iv(A0, A0 - IV, R);

    // a számlap: hajszálvékony, alig látszik
    this.hatter = mk('path', { class: 'ora-hatter', fill: 'none', d: ivPalya });

    // osztások és feliratok kívül, hogy a belső tér a nagy számé maradjon
    this.skalaJelek = mk('g', { class: 'ora-jelek' });

    /* A mért érték íve kétszer van meg: egyszer szélesen és halványan
       (ez a derengés), egyszer élesen. Külön szűrő nélkül is világít,
       és nem terheli a mobil grafikáját.                              */
    this.derengesIv = mk('path', {
      class: 'ora-iv dereng', fill: 'none', d: ivPalya,
      pathLength: IV_HOSSZ, 'stroke-dasharray': IV_HOSSZ,
      'stroke-dashoffset': IV_HOSSZ,
    });
    this.ertekIv = mk('path', {
      class: 'ora-iv', fill: 'none', d: ivPalya,
      pathLength: IV_HOSSZ, 'stroke-dasharray': IV_HOSSZ,
      'stroke-dashoffset': IV_HOSSZ,
    });

    // a korlátozás helye: vékony vonás az íven át
    this.limitJel = mk('path', { class: 'ora-limitjel' });

    /* Az ív végén ülő pont és a pillanatnyi sebesség jele forgatott
       csoportban ül: a transform-ot a CSS átúsztatja.                */
    this.vegG = mk('g', { class: 'ora-forgo' });
    this.vegHalo = mk('circle', { class: 'ora-veg-halo', cx: CX + R, cy: CY, r: 11 });
    this.vegPont = mk('circle', { class: 'ora-veg', cx: CX + R, cy: CY, r: 5 });
    this.vegG.append(this.vegHalo, this.vegPont);

    this.pillG = mk('g', { class: 'ora-forgo' });
    this.pillJel = mk('path', {
      class: 'ora-pill-jel',
      d: `M ${CX + R - 26} ${CY} L ${CX + R - 13} ${CY}`,
    });
    this.pillG.append(this.pillJel);

    this.ertekSzoveg = mk('text', {
      class: 'ora-ertek', x: CX, y: CY + 14, 'text-anchor': 'middle',
    });
    this.egysegSzoveg = mk('text', {
      class: 'ora-egyseg', x: CX, y: CY + 38, 'text-anchor': 'middle',
    });
    this.egysegSzoveg.textContent = 'KM/H';

    this.cimSzoveg = mk('text', {
      class: 'ora-cim', x: CX, y: CY - 50, 'text-anchor': 'middle',
    });
    this.cimSzoveg.textContent = 'SZAKASZÁTLAG';

    svg.append(
      this.hatter, this.skalaJelek, this.derengesIv, this.ertekIv,
      this.limitJel, this.vegG, this.pillG,
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

  /** Skálaosztások. A szín a tartomány, nem külön sáv rajzolja. */
  #jelek(s, limit, birsagHatar) {
    this.skalaJelek.innerHTML = '';
    const cimkeLepes = (s.max - s.min) > 80 ? 20 : 10;
    for (let v = s.min; v <= s.max; v += 5) {
      const fo = v % 10 === 0;
      const a = this.#szog(v, s);
      const zona = v > birsagHatar ? 'birsag' : v > limit ? 'hatar' : 'ok';
      const [x1, y1] = pont(a, R + 7);
      const [x2, y2] = pont(a, R + (fo ? 15 : 11));
      this.skalaJelek.append(
        mk('line', { x1, y1, x2, y2, class: `ora-tick ${zona}${fo ? ' fo' : ''}` })
      );
      if (fo && (v - s.min) % cimkeLepes === 0) {
        const [tx, ty] = pont(a, R + 27);
        const t = mk('text', {
          x: tx, y: ty + 4, 'text-anchor': 'middle', class: `ora-cimke ${zona}`,
        });
        t.textContent = String(v);
        this.skalaJelek.append(t);
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
      this.#jelek(s, limit, birsagHatar);

      const aLimit = this.#szog(limit, s);
      const [k1x, k1y] = pont(aLimit, R - 7);
      const [k2x, k2y] = pont(aLimit, R + 7);
      this.limitJel.setAttribute(
        'd', `M ${k1x.toFixed(1)} ${k1y.toFixed(1)} L ${k2x.toFixed(1)} ${k2y.toFixed(1)}`
      );
    }

    const van = isFinite(ertek) && ertek > 0;
    const t = van ? this.#arany(ertek, s) : 0;
    const eltolas = (IV_HOSSZ * (1 - t)).toFixed(1);

    for (const el of [this.ertekIv, this.derengesIv]) {
      el.setAttribute('stroke-dashoffset', eltolas);
      el.setAttribute('class', `${el === this.ertekIv ? 'ora-iv' : 'ora-iv dereng'} ${allapot}`);
      el.style.visibility = van ? 'visible' : 'hidden';
    }

    // mérés előtt ne üljön a jel a skála alján, mintha nullát mérnénk
    const a = this.#szog(van ? ertek : s.min, s);
    this.vegG.setAttribute('transform', `rotate(${(-a).toFixed(2)} ${CX} ${CY})`);
    this.vegG.style.visibility = van ? 'visible' : 'hidden';
    this.vegPont.setAttribute('class', `ora-veg ${allapot}`);
    this.vegHalo.setAttribute('class', `ora-veg-halo ${allapot}`);

    if (van) {
      this.#szamlal(ertek);
    } else {
      this.mutatottErtek = 0;
      this.ertekSzoveg.textContent = '-';
    }
    this.ertekSzoveg.setAttribute('class', `ora-ertek ${allapot}${van ? '' : ' halvany'}`);

    /* A pillanatnyi sebességnek nincs külön száma a számlapon: az élő
       nézet adatrácsában úgyis ott áll, itt a jel helye a lényeg, hogy
       lássam, mennyivel húz el a szakaszátlagtól.                     */
    const vanPill = isFinite(pillanat) && pillanat > 0;
    this.pillG.style.visibility = vanPill ? 'visible' : 'hidden';
    if (vanPill) {
      const ap = this.#szog(pillanat, s);
      this.pillG.setAttribute('transform', `rotate(${(-ap).toFixed(2)} ${CX} ${CY})`);
    }
  }
}
