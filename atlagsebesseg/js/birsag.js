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
  if (tullepes <= kat.kuszob) {
    out.kovetkezoSav = { tullepes: kat.kuszob + 1, osszeg: kat.savok[0].osszeg };
    return out;
  }
  out.birsagos = true;
  for (let i = 0; i < kat.savok.length; i++) {
    if (tullepes <= kat.savok[i].max) {
      out.osszeg = kat.savok[i].osszeg;
      const kov = kat.savok[i + 1];
      if (kov) out.kovetkezoSav = { tullepes: kat.savok[i].max + 1, osszeg: kov.osszeg };
      break;
    }
  }
  return out;
}

/**
 * Több, eltérő sebességhatárú szakasz összesített értékelése.
 * Minden szakasz a saját korlátozásához mérve kap bírságot; az összesített
 * eredmény a legsúlyosabb szakaszt emeli ki (a hatóság szakaszonként
 * szankcionál, nem az egész út „vegyes” átlagára).
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

  return {
    szakaszok: eredmenyek,
    osszTav,
    osszIdo,
    osszAtlag: osszIdo > 0 ? (osszTav / (osszIdo / 1000)) * 3.6 : 0,
    minIdo,
    szabalyosIdo,
    birsagosak,
    legsulyosabb,
    // Tájékoztató: ha több szakaszon is bírságolnának, az összegek halmozódnak.
    osszegHalmozott: birsagosak.reduce((a, e) => a + e.ertekeles.osszeg, 0),
  };
}
