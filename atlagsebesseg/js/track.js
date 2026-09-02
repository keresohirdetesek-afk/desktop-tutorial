/* GPS-rögzítés és szakaszhatár-figyelés.

   Két munkamód:
   • Kijelölt szakasz: a felhasználó megadja a szakasz elejét és végét a
     térképen. Az app magától indítja a mérést, amikor a jármű elhalad a
     kezdőpont mellett, és leállítja a végpontnál.
   • Kézi: induláskor és érkezéskor a felhasználó nyom gombot.

   A pontokat csak a memóriában tartjuk — semmi nem kerül lemezre.        */

import { haversine, pointToSegment, vetitSzakaszra, MAX_SEBESSEG } from './geo.js';

const MAX_PONTATLANSAG = 60;  // m — ennél rosszabb GPS-fixet eldobunk
const MIN_LEPES = 4;          // m — ennél kisebb elmozdulás nem új pont
const MIN_IDO = 900;          // ms — de legalább ennyi időnként rögzítünk
// Ennyi egymás utáni gyanús fix után mégis elfogadunk egyet: a vevő
// hosszabb kiesés után jogosan „ugrik” nagyot, és nem akadhatunk el.
const MAX_ELDOBAS = 5;

/* Kapu nélküli mérésnél a hosszú állás elrontja a szakaszátlagot: egy
   ebédszünet után a szám már semmit nem mond a vezetésről. Ennyi állás
   után rákérdezünk, hogy felfüggesszük-e.                             */
const ALLO_SEBESSEG = 3;      // km/h — ez alatt állónak tekintjük
const ALLAS_KERDES = 70000;   // ms — ennyi állás után kérdezünk
const FOLYTAT_SEBESSEG = 10;  // km/h — ennél gyorsabban magától folytatja

export const ALLAPOT = {
  ALLO: 'allo',           // nem fut a GPS
  VAR: 'var',             // fut, de a kezdőpontra vár
  MER: 'mer',             // mérés folyamatban
  KESZ: 'kesz',           // szakasz teljesítve
};

export class Meres {
  constructor({ onChange, onError, onAllas } = {}) {
    this.onChange = onChange || (() => {});
    this.onError = onError || (() => {});
    this.onAllas = onAllas || (() => {});
    this.reset();
    this.watchId = null;
    this.wakeLock = null;
  }

  reset() {
    this.allapot = ALLAPOT.ALLO;
    this.pontok = [];
    this.utolso = null;      // legutóbbi nyers fix (rögzítés nélkül is)
    this.kezdoTav = null;    // távolság a szakasz elejétől
    this.vegTav = null;      // távolság a szakasz végétől
    this.kozelites = null;   // legkisebb eddigi távolság a figyelt ponttól
    this.kozelitoPont = null;
    this.kapuElozo = null;   // az előző nyers fix a kapuvizsgálathoz
    this.allasKezdet = null;   // mióta állunk a végponti kapun belül
    this.eldobott = 0;        // egymás utáni, ugrásnak tűnő fixek
    this.hianyos = false;     // volt-e olyan GPS-kiesés, ami kihagyott utat
    this.szunet = false;      // fel van-e függesztve a mérés
    this.szunetKezdet = null; // mikor függesztettük fel
    this.szunetOsszes = 0;    // ms, összesen ennyit álltunk felfüggesztve
    this.allasKezdete = null; // mióta állunk egyhelyben
    this.allasKerdezve = false;
    this.uzenet = '';
    // csak a valódi gond kerül a felületre; a szokásos állapotot a
    // szakaszpanel mondja el, azt nem kell megismételni
    this.figyelmeztet = false;
  }

  /** @param {{start:?{lat,lon}, end:?{lat,lon}, sugar:number}} szakasz */
  async indit(szakasz) {
    if (!navigator.geolocation) {
      this.onError('Ez a böngésző nem támogatja a helymeghatározást.');
      return;
    }
    this.reset();
    this.szakasz = szakasz;
    this.allapot = szakasz.start ? ALLAPOT.VAR : ALLAPOT.MER;
    this.uzenet = szakasz.start
      ? 'Várakozás a szakasz elejére…'
      : 'Mérés fut. A leállítás gombbal zárhatod le.';
    this.watchId = navigator.geolocation.watchPosition(
      (pos) => this.#fix(pos),
      (err) => this.#hiba(err),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
    );
    await this.#kepernyoEbren();
    this.onChange(this);
  }

  /** Kézi leállítás (vagy a szakasz vége). */
  leallit(kesz = false) {
    if (this.watchId !== null) navigator.geolocation.clearWatch(this.watchId);
    this.watchId = null;
    this.#kepernyoElenged();
    this.allapot = kesz || this.pontok.length > 1 ? ALLAPOT.KESZ : ALLAPOT.ALLO;
    this.uzenet = this.pontok.length > 1 ? 'Mérés lezárva.' : 'Nem rögzült elég pont.';
    this.onChange(this);
  }

  /* A megtett út. A `hezag` jelű pontokat nem kötjük az előzőhöz: oda a
     vevő ugrott, nem a jármű ment. Az ilyen szakasz hossza kimarad, az
     eredmény pedig megjelöltté válik.                                 */
  get tav() {
    let d = 0;
    for (let i = 1; i < this.pontok.length; i++) {
      if (this.pontok[i].hezag) continue;
      d += haversine(this.pontok[i - 1], this.pontok[i]);
    }
    return d;
  }

  /* A menetidőből kimarad, amit felfüggesztve álltunk. Szünet alatt nem
     rögzítünk pontot, tehát az utolsó pont ideje áll; a folytatás utáni
     ugrást viszont le kell vonni, különben a szünet is menetidő lenne. */
  get ido() {
    if (this.pontok.length < 2) return 0;
    const nyers = this.pontok[this.pontok.length - 1].t - this.pontok[0].t;
    return Math.max(0, nyers - this.szunetOsszes);
  }

  get atlag() {
    const t = this.ido / 1000;
    return t > 0 ? (this.tav / t) * 3.6 : 0;
  }

  /** Pillanatnyi sebesség: a GPS-től, ha megadja, különben az utolsó pontokból. */
  get pillanatnyi() {
    if (this.utolso && typeof this.utolso.spd === 'number' && this.utolso.spd >= 0) {
      return Math.min(this.utolso.spd * 3.6, MAX_SEBESSEG);
    }
    const n = this.pontok.length;
    if (n < 2) return 0;
    const a = this.pontok[n - 2];
    const b = this.pontok[n - 1];
    const dt = (b.t - a.t) / 1000;
    return dt > 0 ? Math.min((haversine(a, b) / dt) * 3.6, MAX_SEBESSEG) : 0;
  }

  /* --------------------------------------------------------- belső rész */

  #fix(pos) {
    const c = pos.coords;
    const p = {
      lat: c.latitude,
      lon: c.longitude,
      t: pos.timestamp,
      acc: c.accuracy,
      spd: c.speed,
    };
    this.utolso = p;

    if (c.accuracy > MAX_PONTATLANSAG) {
      this.uzenet = `Gyenge GPS-jel (±${Math.round(c.accuracy)} m). Várunk a pontosabb helyzetre.`;
      this.figyelmeztet = true;
      this.onChange(this);
      return;
    }

    this.figyelmeztet = false;
    if (this.allapot === ALLAPOT.VAR) this.#varakozas(p);
    else if (this.allapot === ALLAPOT.MER) this.#meres(p);
    this.onChange(this);
  }

  /* A kezdő- és végpontnál nem az számít, mikor lépünk be a körbe, hanem
     a legközelebbi elhaladás pillanata: addig figyeljük a távolságot, amíg
     újra növekedni nem kezd. Így a mérés kezdete és vége néhány méteren
     belül pontos, nem a kör szélén billen.

     A vizsgálat nem a fixekre, hanem a két fix közötti szakaszra megy.
     130-cal haladva két fix között 70 méter is lehet, a kapu köre pedig
     60 méteres: pusztán a fixek távolságát nézve a kapu kimaradhatna, és
     a mérés sosem zárulna le. A találat pontja a szakaszra vetített
     legközelebbi pont, arányosan interpolált idővel.                  */
  #kapu(p, cel) {
    const sugar = this.szakasz.sugar;
    const d = haversine(p, cel);
    const elozo = this.kapuElozo;
    this.kapuElozo = p;

    const szakaszTav = elozo ? pointToSegment(cel, elozo, p) : d;
    if (szakaszTav <= sugar && (this.kozelites === null || szakaszTav < this.kozelites)) {
      this.kozelites = szakaszTav;
      this.kozelitoPont = elozo ? vetitSzakaszra(cel, elozo, p) : p;
    }

    /* Ha egyszer megközelítettük és már távolodunk, a kapu megvan. Ez
       akkor is teljesül, ha a következő fix már jóval a körön kívül van. */
    if (this.kozelites !== null && d > this.kozelites + 5) {
      const talalat = this.kozelitoPont;
      this.kozelites = null;
      this.kozelitoPont = null;
      this.kapuElozo = null;
      return talalat;
    }
    return null;
  }

  #varakozas(p) {
    this.kezdoTav = haversine(p, this.szakasz.start);
    const talalat = this.#kapu(p, this.szakasz.start);
    if (talalat) {
      this.allapot = ALLAPOT.MER;
      // a végkapu figyelése tiszta lappal indul
      this.kozelites = null;
      this.kozelitoPont = null;
      this.kapuElozo = null;
      this.pontok = [talalat];
      this.uzenet = 'Áthaladtál a szakasz elején, a mérés elindult.';
      if (navigator.vibrate) navigator.vibrate([60, 40, 60]);
    } else {
      this.uzenet = `Szakasz eleje ${Math.round(this.kezdoTav)} m-re.`;
    }
  }

  /** A mérés felfüggesztése: az állás ideje nem számít bele. */
  felfuggeszt() {
    if (this.allapot !== ALLAPOT.MER || this.szunet) return;
    this.szunet = true;
    this.szunetKezdet = this.utolso ? this.utolso.t : Date.now();
    this.uzenet = 'A mérés felfüggesztve. Elindulásra magától folytatódik.';
    this.onChange(this);
  }

  /** Folytatás: a felfüggesztés ideje kimarad a menetidőből. */
  folytat() {
    if (!this.szunet) return;
    const most = this.utolso ? this.utolso.t : Date.now();
    this.szunetOsszes += Math.max(0, most - (this.szunetKezdet ?? most));
    this.szunet = false;
    this.szunetKezdet = null;
    this.allasKezdete = null;
    this.allasKerdezve = false;
    this.uzenet = 'A mérés folytatódik.';
    this.onChange(this);
  }

  #meres(p) {
    /* Szünetben csak figyelünk: sem időt, sem utat nem számolunk, és
       amint elindulsz, magától folytatja.                            */
    if (this.szunet) {
      if (this.pillanatnyi > FOLYTAT_SEBESSEG) this.folytat();
      return;
    }

    this.#allasFigyeles(p);

    const utolsoPont = this.pontok[this.pontok.length - 1];

    /* GPS-ugrás kiszűrése: autóval 250 km/h fölött nem közlekedünk. Néhány
       eldobás után mégis elfogadunk egy fixet, különben egy hosszabb
       kiesés után végleg elakadnánk.                                   */
    let hezag = false;
    if (utolsoPont && this.#ugras(utolsoPont, p)) {
      this.eldobott++;
      if (this.eldobott <= MAX_ELDOBAS) {
        this.uzenet = 'GPS-ugrás, a fix kihagyva.';
        this.figyelmeztet = true;
        return;
      }
      /* Ennyi eldobás után folytatnunk kell, de a közbeeső szakaszt csak
         akkor számítjuk megtett útnak, ha az eltelt idő alatt egyáltalán
         megtehető lett volna. Ha nem, a vevő ugrott: a táv kimarad, és a
         mérést megjelöljük, mert onnantól nem teljes.                  */
      hezag = true;
      this.hianyos = true;
      this.uzenet =
        'GPS-kiesés volt: a kimaradt szakasz nem számít bele a távba.';
      this.figyelmeztet = true;
    }
    this.eldobott = 0;

    if (
      !utolsoPont ||
      haversine(utolsoPont, p) >= MIN_LEPES ||
      p.t - utolsoPont.t >= MIN_IDO
    ) {
      this.pontok.push(hezag ? { ...p, hezag: true } : p);
    }

    if (this.szakasz.end) {
      this.vegTav = haversine(p, this.szakasz.end);
      const talalat = this.#kapu(p, this.szakasz.end);
      if (talalat) {
        this.pontok.push(talalat);
        this.leallit(true);
        if (navigator.vibrate) navigator.vibrate([120, 60, 120]);
        return;
      }
      /* Ha a végpont maga az úti cél, nem hajtunk át rajta: megállunk rajta.
         Ilyenkor az elhaladás sosem következne be, ezért néhány másodperc
         állás a kapun belül szintén lezárja a mérést.                    */
      if (this.vegTav <= this.szakasz.sugar && this.pillanatnyi < 5) {
        if (this.allasKezdet === null) this.allasKezdet = p.t;
        else if (p.t - this.allasKezdet >= 5000) {
          this.leallit(true);
          if (navigator.vibrate) navigator.vibrate([120, 60, 120]);
          return;
        }
      } else {
        this.allasKezdet = null;
      }
      this.uzenet = `Szakasz vége ${Math.round(this.vegTav)} m-re.`;
    } else {
      this.uzenet = 'Mérés fut.';
    }
  }

  /* Kapu nélküli mérésnél hosszú állás után rákérdezünk, hogy
     felfüggesszük-e. Kijelölt szakasznál nincs értelme: ott a végkapu
     amúgy is lezárja a mérést, és az ottani állás a szakasz része.   */
  #allasFigyeles(p) {
    if (this.szakasz.start || this.szakasz.end) return;
    if (this.pillanatnyi >= ALLO_SEBESSEG) {
      this.allasKezdete = null;
      this.allasKerdezve = false;
      return;
    }
    if (this.allasKezdete === null) {
      this.allasKezdete = p.t;
      return;
    }
    if (!this.allasKerdezve && p.t - this.allasKezdete >= ALLAS_KERDES) {
      this.allasKerdezve = true;
      this.onAllas(this);
    }
  }

  /** Két fix között elvárható-e ekkora elmozdulás ennyi idő alatt? */
  #ugras(a, b) {
    const dt = (b.t - a.t) / 1000;
    if (dt <= 0) return true;
    return (haversine(a, b) / dt) * 3.6 > MAX_SEBESSEG;
  }

  #hiba(err) {
    const szoveg =
      err.code === 1
        ? 'A helymeghatározás nincs engedélyezve. Engedélyezd a böngésző beállításaiban.'
        : err.code === 2
          ? 'Nem érhető el a helyzeted (nincs GPS-jel).'
          : 'Időtúllépés a helymeghatározásnál.';
    this.uzenet = szoveg;
    this.figyelmeztet = true;
    this.onError(szoveg);
    this.onChange(this);
  }

  async #kepernyoEbren() {
    try {
      if ('wakeLock' in navigator) this.wakeLock = await navigator.wakeLock.request('screen');
    } catch { /* nem kritikus */ }
  }

  #kepernyoElenged() {
    try { this.wakeLock?.release(); } catch { /* nem kritikus */ }
    this.wakeLock = null;
  }
}
