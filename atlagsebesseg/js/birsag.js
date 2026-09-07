/* Gyorshajtási közigazgatási bírság — 410/2007. (XII. 29.) Korm. rendelet.

   FONTOS: ez az egyetlen hely, ahol a jogszabályi összegek szerepelnek.
   Ha a rendelet módosul, elég ezt a fájlt átírni.

   Utoljára ellenőrizve: 2026-08-10.
   A táblázat három kategóriát ismer a megengedett legnagyobb sebesség
   szerint, és a túllépés mértéke (mért sebesség − megengedett sebesség)
   szerint sávosan növekvő fix összeget rendel hozzá.
   A legkisebb kiszabható összeg 50 000 Ft, a legnagyobb 468 000 Ft.

   A sávok felső határa „bezárólag” értendő: 130-as határnál 180 km/h
   (50 km/h túllépés) még 70 000 Ft, 181 km/h már 100 000 Ft.            */

export const JOGSZABALY = {
  nev: '410/2007. (XII. 29.) Korm. rendelet',
  ellenorizve: '2026. 08. 10.',
};

export const KATEGORIAK = [
  {
    // lakott területen jellemző korlátozások: 30, 40, 50 km/h
    nev: '50 km/h vagy annál kisebb megengedett sebesség',
    limitMax: 50,
    kuszob: 15, // eddig a túllépésig nincs bírság
    savok: [
      { max: 25, osszeg: 50000 },
      { max: 35, osszeg: 70000 },
      { max: 45, osszeg: 100000 },
      { max: 55, osszeg: 140000 },
      { max: 65, osszeg: 210000 },
      { max: 75, osszeg: 312000 },
      { max: Infinity, osszeg: 468000 },
    ],
  },
  {
    // lakott területen kívül, főutakon: 70, 80, 90, 100 km/h
    nev: '50 km/h feletti, de legfeljebb 100 km/h megengedett sebesség',
    limitMax: 100,
    kuszob: 15,
    savok: [
      { max: 30, osszeg: 50000 },
      { max: 45, osszeg: 70000 },
      { max: 60, osszeg: 100000 },
      { max: 75, osszeg: 140000 },
      { max: 90, osszeg: 210000 },
      { max: 105, osszeg: 312000 },
      { max: Infinity, osszeg: 468000 },
    ],
  },
  {
    // autóút, autópálya: 110, 130 km/h
    nev: '100 km/h feletti megengedett sebesség',
    limitMax: Infinity,
    kuszob: 20,
    savok: [
      { max: 35, osszeg: 50000 },
      { max: 50, osszeg: 70000 },
      { max: 65, osszeg: 100000 },
      { max: 80, osszeg: 140000 },
      { max: 95, osszeg: 210000 },
      { max: 110, osszeg: 312000 },
      { max: Infinity, osszeg: 468000 },
    ],
  },
];

export function kategoria(limit) {
  return KATEGORIAK.find((k) => limit <= k.limitMax) || KATEGORIAK[KATEGORIAK.length - 1];
}

/** A legnagyobb sebesség, ami adott korlátozásnál még nem jár bírsággal. */
export function birsagmentesMax(limit) {
  return limit + kategoria(limit).kuszob;
}

/**
 * Bírságértékelés egy korlátozáshoz és egy mért (átlag)sebességhez.
 * @returns {{limit:number, mert:number, tullepes:number, osszeg:number,
 *            birsagos:boolean, hatar:number, tartalek:number,
 *            kovetkezoSav:?{tullepes:number, osszeg:number}}}
 */
/* A sávhatárok „bezárólag” értendők, a mért érték viszont osztás
   eredménye: 4 km / 120 mp pontosan 120 km/h, lebegőpontosan viszont
   120,00000000000001. Enélkül egy hajszálnyi számítási maradék átvinné a
   vezetőt a következő, drágább sávba.                                 */
const HATAR_TURES = 1e-9;

export function ertekel(limit, mert) {
  const kat = kategoria(limit);
  const tullepes = mert - limit;
  const hatar = limit + kat.kuszob; // efölött kezdődik a bírság
  const out = {
    limit,
    mert,
    tullepes,
    hatar,
    tartalek: hatar - mert, // ennyivel mehetnél még gyorsabban
    kategoria: kat.nev,
    osszeg: 0,
    birsagos: false,
    kovetkezoSav: null,
  };
  if (tullepes <= kat.kuszob + HATAR_TURES) {
    out.kovetkezoSav = { tullepes: kat.kuszob + 1, osszeg: kat.savok[0].osszeg };
    return out;
  }
  out.birsagos = true;
  for (let i = 0; i < kat.savok.length; i++) {
    if (tullepes <= kat.savok[i].max + HATAR_TURES) {
      out.osszeg = kat.savok[i].osszeg;
      const kov = kat.savok[i + 1];
      if (kov) out.kovetkezoSav = { tullepes: kat.savok[i].max + 1, osszeg: kov.osszeg };
      break;
    }
  }
  return out;
}

/**
 * Egy szakasz összesített értékelése.
 *
 * A bírság a TELJES szakasz egyetlen átlagából jön (`teljes`). Egy
 * átlagsebesség-mérő két pont között méri az időt, és nem tudja, hogy a
 * szakaszon belül hol mentél gyorsabban — így nem is szankcionálhat
 * szakaszrészenként. A viszonyítási érték a szakasz megengedett átlaga:
 * az a sebesség, ami akkor jönne ki, ha végig pontosan a táblát tartanád.
 * Egységes korlátozású szakaszon ez pontosan maga a korlátozás, tehát a
 * szokásos eset változatlanul jön ki.
 *
 * A korlátozás szerinti bontás (`szakaszok`, `birsagosak`) megmarad, de
 * már csak magyarázat: megmutatja, hol keletkezett az átlag, és mi lenne,
 * ha minden egységes határú részen külön mérés állna. Ez szigorúbb, mint
 * egyetlen mérés, ezért nem ebből lesz a bírság.
 *
 * @param {Array<{tav:number, ido:number, limit:number}>} szakaszok
 *        tav: méter, ido: ezredmásodperc, limit: km/h
 */
export function ertekelSzakaszok(szakaszok) {
  const ervenyes = szakaszok.filter((s) => s.tav > 0 && s.ido > 0 && s.limit > 0);
  const eredmenyek = ervenyes.map((s) => {
    const atlag = (s.tav / (s.ido / 1000)) * 3.6;
    return { ...s, atlag, ertekeles: ertekel(s.limit, atlag) };
  });

  const osszTav = ervenyes.reduce((a, s) => a + s.tav, 0);
  const osszIdo = ervenyes.reduce((a, s) => a + s.ido, 0);

  // A bírságmentes minimum menetidő: szakaszonként a bírsághatárral haladva.
  const minIdo = ervenyes.reduce(
    (a, s) => a + (s.tav / (birsagmentesMax(s.limit) / 3.6)) * 1000,
    0
  );
  // A szabályos menetidő: szakaszonként pontosan a korlátozással haladva.
  const szabalyosIdo = ervenyes.reduce((a, s) => a + (s.tav / (s.limit / 3.6)) * 1000, 0);

  const birsagosak = eredmenyek.filter((e) => e.ertekeles.birsagos);
  const legsulyosabb = birsagosak.reduce(
    (a, e) => (a && a.ertekeles.osszeg >= e.ertekeles.osszeg ? a : e),
    null
  );

  const osszAtlag = osszIdo > 0 ? (osszTav / (osszIdo / 1000)) * 3.6 : 0;
  const megengedett = szabalyosIdo > 0 ? (osszTav / (szabalyosIdo / 1000)) * 3.6 : 0;
  const limitek = [...new Set(ervenyes.map((s) => s.limit))];

  /* Ez a mérvadó értékelés: egy áthaladás, egy átlag, egy ítélet. */
  const teljes = {
    atlag: osszAtlag,
    megengedett,
    // ha végig ugyanaz a korlátozás, a megengedett átlag maga a tábla
    egysegesLimit: limitek.length === 1 ? limitek[0] : null,
    ertekeles: megengedett > 0 ? ertekel(megengedett, osszAtlag) : null,
  };

  return {
    szakaszok: eredmenyek,
    osszTav,
    osszIdo,
    osszAtlag,
    minIdo,
    szabalyosIdo,
    teljes,
    birsagosak,
    legsulyosabb,
    /* Csak összehasonlításnak: ennyi lenne, ha minden egységes határú
       részen külön mérés állna, és a legsúlyosabb rész számítana. */
    reszenkentiOsszeg: legsulyosabb ? legsulyosabb.ertekeles.osszeg : 0,
  };
}
