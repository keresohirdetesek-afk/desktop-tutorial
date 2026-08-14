/* Átlagsebesség.hu — összefogó réteg.
   Semmit nem ment el: minden állapot ebben a modulban, a memóriában él. */

import {
  fmtSpeed, fmtSpeed1, fmtDistance, fmtDuration, fmtDurationWords, fmtForint,
  trackLength, haversine, MAX_SEBESSEG,
} from './geo.js';
import { ertekelSzakaszok, birsagmentesMax, KATEGORIAK, JOGSZABALY } from './birsag.js';
import { utakLekerese, utakPontKorul, pontonkentiHatar, szakaszokra } from './limits.js';
import { Terkep } from './map.js';
import { Ora } from './gauge.js';
import { Meres, ALLAPOT } from './track.js';
import { Gong } from './hang.js';
import { keszitKep, megoszt } from './megosztas.js';

const $ = (id) => document.getElementById(id);

/** Görgetés a mozgásérzékenységi beállítás szerint. */
const gorget = (node, block = 'nearest') => node.scrollIntoView({
  behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
  block,
});
const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
};

const S = {
  kapuk: { start: null, end: null, sugar: 60 },
  jelolMod: null,      // 'start' | 'end' | null
  utak: null,          // OSM utak (lekérés után)
  felulir: new Map(),  // szakaszindex -> kézzel megadott határ
  alap: 90,
  kezi: null,          // kézzel megadott határ az egész szakaszra
  autoHatar: true,     // menet közbeni, automatikus határlekérés
  utakMap: new Map(),  // way-id -> way, hogy a részletek összeadódjanak
  lekeresKozep: null,  // hol jártunk a legutóbbi lekéréskor
  lekeresFut: false,
  lekeresAllapot: 'nincs',   // nincs | fut | kesz | hiba
  kalkSorok: [{ hossz: 10, limit: 90 }],
};

// A magyar közutakon előforduló korlátozások — ezek jönnek fel koppintásra.
const LIMIT_JELEK = [30, 40, 50, 60, 70, 80, 90, 100, 110, 130];

const STATUSZ = {
  ok:        { fo: 'JELENLEGI ÁTLAG',        cimke: '[● BIZTONSÁGOS]', megj: '(Sebesség tartása OK)' },
  hatar:     { fo: 'JELENLEGI ÁTLAG',        cimke: '[● HATÁRON]',     megj: '(A megengedett átlag felett, még bírság nélkül)' },
  birsag:    { fo: 'JELENLEGI ÁTLAG',        cimke: '[● BÍRSÁGOS]',    megj: '(Ezen a szakaszon már bírság járna)' },
  varakozik: { fo: 'MÉG NEM INDULT A MÉRÉS', cimke: '[○ VÁRAKOZÁS]',   megj: '(A szakasz elejére vár)' },
  semleges:  { fo: 'JELENLEGI ÁTLAG',        cimke: '[○ NINCS ADAT]',  megj: '(Indítsd el a mérést)' },
};

let terkep = null;
let ora = null;
let kalkOra = null;      // ugyanaz a műszer a kalkulátor eredményénél
const gong = new Gong();
let elozoAllapot = 'semleges';   // a hangjelzéshez: mikor váltott az állapot
let utolsoJelzes = 0;            // ms, a bírságos ismétlés ütemezéséhez
let utolsoEredmeny = null;   // a legutóbbi értékelés, a választóhoz
let lapValaszt = null;       // a nyitott választó visszahívása
const meres = new Meres({
  onChange: () => elonezetFrissit(),
  onError: (m) => ($('gps-uzenet').textContent = m),
});

/* ============================================================ képernyők */

function fulek() {
  document.querySelectorAll('#tabs .tab').forEach((gomb) => {
    gomb.addEventListener('click', () => {
      document.querySelectorAll('#tabs .tab').forEach((g) => g.classList.toggle('active', g === gomb));
      document.querySelectorAll('.screen').forEach((s) => (s.hidden = s.id !== gomb.dataset.scr));
      if (gomb.dataset.scr === 'scr-meres') setTimeout(() => terkep?.frissit(), 60);
    });
  });
}

function fulre(id) {
  document.querySelector(`#tabs .tab[data-scr="${id}"]`).click();
}

/* Az élő nézet térképe kezdetben rejtett elemben ül; a Leaflet ilyenkor
   nulla méretet mér, ezért csak az első megjelenítéskor hozzuk létre.   */
function eloNezet(be) {
  $('meres-intro').hidden = be;
  $('meres-elo').hidden = !be;
  if (!be) return;
  if (!terkep) {
    terkep = new Terkep($('map'), {
      onTap: (pont) => {
        if (!S.jelolMod) return;
        S.kapuk[S.jelolMod] = pont;
        jelolMod(null);
        kapukFrissit();
      },
    });
    window.atlagsebesseg.terkep = terkep;
    kapukFrissit();
    kezdoHelyzet();
  }
  setTimeout(() => terkep.frissit(), 60);
}

/* A térkép első megnyitásakor a jelenlegi helyzet kerül középre, kb. 150
   km-es kivágattal: ekkora területen a szakasz mindkét vége látszik.   */
function kezdoHelyzet() {
  if (meres.utolso) {
    terkep.kezdoNezet(meres.utolso);
    terkep.pozicioRajz(meres.utolso);
    return;
  }
  navigator.geolocation?.getCurrentPosition(
    (pos) => {
      meres.utolso = {
        lat: pos.coords.latitude,
        lon: pos.coords.longitude,
        t: pos.timestamp,
        acc: pos.coords.accuracy,
        spd: null,
      };
      terkep.kezdoNezet(meres.utolso);
      terkep.pozicioRajz(meres.utolso);
      elonezetFrissit();
    },
    () => { /* helyzet nélkül marad az országos áttekintő nézet */ },
    { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 }
  );
}

/* ------------------------------------------------- automatikus határok

   A határok eddig csak gombnyomásra jöttek le, a Haladó beállítások alól.
   Élesben ez pont akkor nem segít, amikor kellene: a szakasz közepén a
   táblán a beállított alapérték állt, nem az, ami tényleg ki van téve.
   Mostantól a mérés magától kér le, és menet közben frissít.

   Nem a teljes nyomvonal mentén kérdez, hanem egy kis korongot a jelenlegi
   helyzet körül: az gyors, ritkán fut időtúllépésre, és előre is rálát.  */

const LEKERES_SUGAR = 1800;   // m, ekkora körből kérünk adatot
const UJRA_TAVOLSAG = 1200;   // m, ennyit haladva kérünk újat

async function hatarokFrissitese() {
  if (!S.autoHatar || S.lekeresFut || !meres.utolso) return;
  const kell =
    !S.lekeresKozep || haversine(meres.utolso, S.lekeresKozep) > UJRA_TAVOLSAG;
  if (!kell) return;

  S.lekeresFut = true;
  S.lekeresAllapot = 'fut';
  const kozep = meres.utolso;
  try {
    const utak = await utakPontKorul(kozep, LEKERES_SUGAR);
    for (const w of utak) S.utakMap.set(w.id, w);
    // új tömb, hogy az illesztés gyorsítótára frissüljön
    S.utak = [...S.utakMap.values()];
    S.lekeresKozep = kozep;
    S.lekeresAllapot = 'kesz';
  } catch {
    // a hálózat elmehet alagútban; a következő fixnél újrapróbáljuk
    S.lekeresAllapot = 'hiba';
  } finally {
    S.lekeresFut = false;
    elonezetFrissit();
  }
}

const HATAR_ALLAPOT = {
  nincs: 'Sebességhatárok: a beállított alapértékkel számolunk.',
  fut: 'Sebességhatárok: lekérés folyamatban…',
  kesz: 'Sebességhatárok: automatikusan frissítve az útvonal mentén.',
  hiba: 'Sebességhatárok: most nem elérhető a lekérés, a beállított értékkel számolunk.',
};

/* ======================================================= szakaszbontás */

/** A nyomvonal felbontása sebességhatár szerinti szakaszokra. */
function bontas(pontok) {
  if (pontok.length < 2) return [];
  let szakaszok;
  if (S.utak) {
    szakaszok = szakaszokra(pontok, pontonkentiHatar(pontok, S.utak), S.alap);
  } else {
    szakaszok = [{
      i0: 0,
      i1: pontok.length - 1,
      tav: trackLength(pontok),
      ido: pontok[pontok.length - 1].t - pontok[0].t,
      limit: S.alap,
      cimke: 'kézzel megadott határ',
      becsult: true,
      utepites: false,
      lakott: false,
      nev: '',
    }];
  }
  szakaszok = szakaszok.filter((sz) => sz.tav > 0 && sz.ido > 0);
  // sorrend: adat (OSM vagy alapértelmezés) → kézi felülírás az egészre →
  // szakaszonkénti kézi érték
  if (S.kezi) {
    for (const sz of szakaszok) {
      sz.limit = S.kezi;
      sz.cimke = 'kézzel megadva';
      sz.becsult = false;
    }
  }
  S.felulir.forEach((limit, i) => {
    if (szakaszok[i]) {
      szakaszok[i].limit = limit;
      szakaszok[i].cimke = 'kézzel megadva';
      szakaszok[i].becsult = false;
    }
  });
  return szakaszok;
}

/** A szakasz megengedett átlaga: a szabályos menetidőből visszaszámolva.
    Egyetlen korlátozásnál ez maga a korlátozás; több esetén a hosszokkal
    súlyozott érték — ennyivel lehet a szakaszt szabályosan teljesíteni. */
function megengedettAtlag(eredmeny) {
  if (!eredmeny.szabalyosIdo) return S.alap;
  return (eredmeny.osszTav / (eredmeny.szabalyosIdo / 1000)) * 3.6;
}

/** Az az átlag, ami felett már bírság járna (ugyanígy súlyozva). */
function birsagHatarAtlag(eredmeny) {
  if (!eredmeny.minIdo) return birsagmentesMax(S.alap);
  return (eredmeny.osszTav / (eredmeny.minIdo / 1000)) * 3.6;
}

/* Ami a jelenlegi helyeden érvényes. Lekért adat esetén a valóban ott lévő
   korlátozás, nem a beállított alapérték — ez kerül a táblára.          */
function aktualisHatar() {
  if (S.kezi) return { limit: S.kezi, tipus: 'kezi' };
  if (S.utak && meres.utolso) {
    const [h] = pontonkentiHatar([meres.utolso], S.utak);
    if (h) return { limit: h.limit, tipus: 'osm', becsult: h.becsult, nev: h.nev };
  }
  return { limit: S.alap, tipus: 'alap' };
}

const TABLA_SUGO = { kezi: 'kézi ✎', osm: 'itt érvényes', alap: 'koppints' };

/* A megengedett átlag egyetlen korlátozásnál kerek szám (90, 130) — ilyenkor
   a tizedes csak zajt vinne bele. Vegyes szakasznál viszont számít.      */
function fmtLimit(v) {
  return Math.abs(v - Math.round(v)) < 0.05 ? String(Math.round(v)) : fmtSpeed1(v);
}

/* „az ötven”, de „a nyolcvan” — a névelő a szám kiejtésétől függ. */
function nevelo(n) {
  return n === 1 || n === 5 || (n >= 50 && n < 60) ? 'az' : 'a';
}

function allapotJel(eredmeny) {
  if (!eredmeny || eredmeny.szakaszok.length === 0) return 'semleges';
  if (eredmeny.birsagosak.length > 0) return 'birsag';
  if (eredmeny.osszAtlag > megengedettAtlag(eredmeny) + 0.05) return 'hatar';
  return 'ok';
}

function birsagOsszeg(eredmeny) {
  if (!eredmeny.birsagosak.length) return 0;
  return eredmeny.birsagosak.length > 1
    ? eredmeny.osszegHalmozott
    : eredmeny.legsulyosabb.ertekeles.osszeg;
}

/* ------------------------------------------- sebességhatár-választó */

function limitLapNyit({ cim, alcim, ertek, osmGomb, onValaszt, onOsm }) {
  $('lap-cim').textContent = cim;
  $('lap-alcim').textContent = alcim || '';
  $('lap-alcim').hidden = !alcim;

  const racs = $('limit-racs');
  racs.innerHTML = '';
  for (const v of LIMIT_JELEK) {
    const gomb = el('button', `limit-jel${v === Math.round(ertek) ? ' aktiv' : ''}`, String(v));
    gomb.addEventListener('click', () => {
      onValaszt(v);
      limitLapZar();
    });
    racs.append(gomb);
  }

  $('limit-egyeni').value = Math.round(ertek) || '';
  lapValaszt = onValaszt;

  const osm = $('limit-osm');
  osm.hidden = !osmGomb;
  osm.onclick = () => {
    onOsm?.();
    limitLapZar();
  };

  $('limit-lap').hidden = false;
}

function limitLapZar() {
  $('limit-lap').hidden = true;
  lapValaszt = null;
}

/** A táblára koppintva megadott érték az egész szakaszra érvényes. */
function limitBeallit(v) {
  S.alap = v;
  if (S.utak) S.kezi = v;          // a lekért adatot írjuk felül
  const sel = $('sel-alap');
  if ([...sel.options].some((o) => Number(o.value) === v)) sel.value = String(v);
  elonezetFrissit();
}

/* ========================================================= megjelenítés */

function verdiktRender(node, eredmeny) {
  if (!eredmeny || eredmeny.szakaszok.length === 0) {
    node.className = 'verdikt semleges';
    node.textContent = 'Még nincs elég adat a számításhoz.';
    return;
  }
  const b = eredmeny.birsagosak;
  if (b.length === 0) {
    const tartalek = Math.min(...eredmeny.szakaszok.map((s) => s.ertekeles.tartalek));
    const megengedett = megengedettAtlag(eredmeny);
    const felette = eredmeny.osszAtlag > megengedett + 0.05;
    node.className = `verdikt ${felette || tartalek <= 5 ? 'hatar' : 'ok'}`;
    const szoros = eredmeny.szakaszok.reduce(
      (a, sz) => (sz.ertekeles.tartalek < a.ertekeles.tartalek ? sz : a)
    );
    node.innerHTML = felette
      ? `<strong>Gyorsabb voltál a megengedettnél, de bírság nem járna.</strong><br>` +
        `<span class="small">A legszorosabb ${nevelo(szoros.limit)} ${szoros.limit} km/h-s szakasz volt: ` +
        `${fmtSpeed1(szoros.ertekeles.mert)} km/h átlaggal. ` +
        (tartalek < 0.5
          ? 'Épp a bírsághatáron vagy.'
          : `A bírsághatárig még ${fmtSpeed1(tartalek)} km/h maradt.`) +
        `</span>`
      : `<strong>Ebben a szimulációban nem lépted túl az átlagsebesség-határt.</strong><br>` +
        `<span class="small">` +
        (tartalek < 0.5
          ? 'Épp a határon vagy. Egy hajszállal gyorsabban már jönne a csekk.'
          : `A legszorosabb szakaszon még ${fmtSpeed1(tartalek)} km/h ráhagyásod volt.`) +
        `</span>`;
    return;
  }
  const e = eredmeny.legsulyosabb.ertekeles;
  node.className = 'verdikt birsag';
  node.innerHTML =
    `<strong>Bírság: ${fmtForint(birsagOsszeg(eredmeny))}</strong><br>` +
    `<span class="small">` +
    (b.length > 1 ? `${b.length} szakaszon lépted túl a határt; a legsúlyosabb: ` : '') +
    `${e.limit} km/h-s szakaszon ${fmtSpeed1(e.mert)} km/h átlag ` +
    `(+${fmtSpeed1(e.tullepes)} km/h), ${fmtForint(e.osszeg)}.</span>`;
}

function jelvenyek(sz) {
  const j = [];
  if (sz.utepites) {
    j.push('<span class="badge warn"><svg class="ikon" aria-hidden="true">' +
           '<use href="#i-traffic-cone"/></svg>útépítés</span>');
  }
  if (sz.lakott) {
    j.push('<span class="badge"><svg class="ikon" aria-hidden="true">' +
           '<use href="#i-buildings"/></svg>lakott terület</span>');
  }
  if (sz.becsult) j.push('<span class="badge">becsült</span>');
  return j.join(' ');
}

function szakaszLista(node, eredmeny, { szerkesztheto }) {
  node.innerHTML = '';
  if (!eredmeny || eredmeny.szakaszok.length === 0) return;
  eredmeny.szakaszok.forEach((sz, i) => {
    const e = sz.ertekeles;
    const allapot = e.birsagos ? 'birsag' : e.tartalek <= 5 ? 'hatar' : 'ok';
    const sor = el('div', `seg ${allapot}`);

    const limitDoboz = szerkesztheto
      ? el('button', 'limit-gomb', `<strong>${sz.limit}</strong><span>km/h</span>`)
      : el('div', 'seg-limit', `<strong>${sz.limit}</strong><span>km/h</span>`);

    const info = el('div', 'seg-info',
      `<strong>${fmtDistance(sz.tav)}</strong> · ${fmtDuration(sz.ido)}<br>` +
      `<span class="muted">átlag ${fmtSpeed1(e.mert)} km/h</span><br>` +
      `<span class="muted small">${sz.nev ? `${sz.nev}, ` : ''}${sz.cimke}</span> ${jelvenyek(sz)}`);

    const verd = el('div', `seg-verd ${allapot}`,
      e.birsagos
        ? fmtForint(e.osszeg)
        : `+${fmtSpeed1(Math.max(0, e.tartalek))}<span class="small"> km/h</span>` +
          `<small>a bírsághatárig</small>`);

    sor.append(limitDoboz, info, verd);
    node.append(sor);

    if (szerkesztheto) {
      limitDoboz.addEventListener('click', () => limitLapNyit({
        cim: 'Szakaszrész sebességhatára',
        alcim: `${fmtDistance(sz.tav)}, ${sz.nev || sz.cimke}`,
        ertek: sz.limit,
        onValaszt: (v) => {
          S.felulir.set(i, v);
          elonezetFrissit();
        },
      }));
    }
  });
}

/* ------------------------------------------------- szakasz és haladás */

/** A szakasz neve a leghosszabb, névvel bíró útszakaszból. */
function szakaszNev(eredmeny, vanKapu) {
  const utNev = eredmeny.szakaszok
    .slice()
    .sort((a, b) => b.tav - a.tav)
    .map((sz) => sz.nev)
    .find(Boolean);
  if (utNev) return `${utNev} szakasz`;
  return vanKapu ? 'Kijelölt szakasz' : 'Kézi mérés';
}

function szakaszPanel(eredmeny) {
  const vanKapu = !!(S.kapuk.start && S.kapuk.end);
  // a lezárás után az eredménykártya mondja el ugyanezt
  $('szakasz-panel').hidden = meres.allapot === ALLAPOT.KESZ;
  // kapu nélkül nincs mihez viszonyítani a haladást — ne mutassunk üres sávot
  $('kapu-bal').hidden = !vanKapu;
  $('kapu-jobb').hidden = !vanKapu;
  $('halado-sor').hidden = !vanKapu;

  $('szakasz-nev').textContent = szakaszNev(eredmeny, vanKapu);

  const kozep = $('szp-hatra');
  const idoSor = $('szp-ido');
  const sav = $('szp-sav');

  if (!vanKapu) {
    const indulasElott = meres.allapot === ALLAPOT.ALLO;
    kozep.textContent = indulasElott
      ? 'Készen áll'
      : `Megtéve: ${fmtDistance(meres.tav)}`;
    idoSor.textContent = indulasElott
      ? 'Jelöld ki a szakaszt a térképen, vagy indíts kézzel'
      : 'Nincs kijelölt kapu, kézi leállítás';
    sav.style.width = '0%';
    return;
  }

  if (meres.allapot === ALLAPOT.VAR) {
    kozep.textContent = 'A szakasz elejére vár';
    idoSor.textContent = meres.kezdoTav != null
      ? `Kapu #1 még ${fmtDistance(meres.kezdoTav)}`
      : 'Keresi a helyzetedet…';
    sav.style.width = '0%';
    return;
  }

  const hatra = meres.utolso && meres.allapot !== ALLAPOT.KESZ
    ? haversine(meres.utolso, S.kapuk.end)
    : 0;
  const megtett = meres.tav;

  if (meres.allapot === ALLAPOT.KESZ) {
    kozep.textContent = `Teljesítve: ${fmtDistance(megtett)}`;
    idoSor.textContent = `Menetidő: ${fmtDuration(meres.ido)}`;
    sav.style.width = '100%';
    return;
  }

  kozep.textContent = `Még: ${fmtDistance(hatra)}`;
  const tempo = Math.max(eredmeny.osszAtlag || 0, 20) / 3.6;   // m/s, alsó korláttal
  idoSor.textContent = `Becsült idő: ${fmtDuration((hatra / tempo) * 1000)}`;
  const arany = megtett + hatra > 0 ? (megtett / (megtett + hatra)) * 100 : 0;
  sav.style.width = `${Math.min(100, Math.max(0, arany)).toFixed(1)}%`;
}

/* --------------------------------------------------------- óra, státusz */

function oraEsStatusz(eredmeny) {
  const van = eredmeny.szakaszok.length > 0;
  const allapot = meres.allapot === ALLAPOT.VAR ? 'varakozik' : allapotJel(eredmeny);
  const megengedett = megengedettAtlag(eredmeny);
  const hatar = birsagHatarAtlag(eredmeny);

  const fut = meres.allapot === ALLAPOT.MER;
  ora.frissit({
    ertek: van ? eredmeny.osszAtlag : 0,
    pillanat: fut && meres.utolso ? meres.pillanatnyi : null,
    limit: Math.round(megengedett),
    birsagHatar: Math.round(hatar),
    allapot,
  });

  const hely = aktualisHatar();
  $('ora-tabla').textContent = fmtLimit(hely.limit);
  $('tabla-sugo').textContent =
    hely.tipus === 'osm' && hely.becsult ? 'becsült' : TABLA_SUGO[hely.tipus];
  $('ki-hely-limit').textContent = `${fmtLimit(hely.limit)} km/h`;

  hangJelzes(allapot);

  const sav = $('statuszsav');
  sav.className = `statuszsav ${allapot}`;
  const st = STATUSZ[allapot];
  $('st-fo').textContent = allapot === 'varakozik'
    ? st.fo
    : `${st.fo}: ${van ? `${fmtSpeed(eredmeny.osszAtlag)} km/h` : '-'}`;
  $('st-cimke').textContent = st.cimke;
  $('st-megj').textContent =
    allapot === 'birsag'
      ? `(Ezen a szakaszon ${fmtForint(birsagOsszeg(eredmeny))} bírság járna)`
      : allapot === 'varakozik' && meres.kezdoTav != null
        ? `(Kapu #1 még ${fmtDistance(meres.kezdoTav)})`
        : st.megj;

  $('ki-atlag').textContent = van ? `${fmtSpeed(eredmeny.osszAtlag)} km/h` : '-';
  $('ki-pill').textContent = meres.utolso ? `${fmtSpeed(meres.pillanatnyi)} km/h` : '-';
  $('ki-limit').textContent = `${fmtLimit(megengedett)} km/h`;
  $('ki-ido').textContent = fmtDuration(meres.ido);
  $('ki-birsag').textContent = fmtForint(birsagOsszeg(eredmeny));
  $('ki-birsag').style.color = eredmeny.birsagosak.length ? 'var(--danger)' : '';

  $('ki-melleklet').textContent =
    `Táv: ${fmtDistance(meres.tav)} · GPS: ` +
    (meres.utolso ? `±${Math.round(meres.utolso.acc)} m` : '-');
}

/* Vezetés közben a képernyőt nem nézi senki, ezért az állapotváltást
   hallani kell. Csak váltáskor szólal meg, nem folyamatosan; a bírságos
   tartományban félpercenként emlékeztet, amíg vissza nem lassulsz.     */
const JELZES_ISMETLES = 30000;

function hangJelzes(allapot) {
  if (meres.allapot !== ALLAPOT.MER) {
    elozoAllapot = allapot;
    return;
  }
  const most = Date.now();
  if (allapot !== elozoAllapot) {
    // csak romló irányban figyelmeztetünk: lefelé jövet már lassítasz,
    // ott elég a feloldó hang
    const sulyossag = { semleges: 0, varakozik: 0, ok: 1, hatar: 2, birsag: 3 };
    const elore = (sulyossag[allapot] ?? 0) > (sulyossag[elozoAllapot] ?? 0);
    if (elore && allapot === 'birsag') gong.jelez('birsag');
    else if (elore && allapot === 'hatar') gong.jelez('figyelem');
    else if (allapot === 'ok' && (sulyossag[elozoAllapot] ?? 0) >= 2) gong.jelez('rendben');
    utolsoJelzes = most;
    elozoAllapot = allapot;
    return;
  }
  if (allapot === 'birsag' && most - utolsoJelzes > JELZES_ISMETLES) {
    gong.jelez('birsag');
    utolsoJelzes = most;
  }
}

function gpsPill() {
  const p = $('gps-pill');
  p.dataset.allapot = !meres.utolso ? 'ki' : meres.utolso.acc > 25 ? 'gyenge' : 'be';
}

/* A hátralévő út a végpontig légvonalban mérve — ez alsó becslés, ezért a
   „várhatóan” szó nem udvariasság, hanem pontos megfogalmazás.          */
function projekcio(eredmeny) {
  const node = $('h-projekcio');
  if (meres.allapot !== ALLAPOT.MER || !S.kapuk.end || !meres.utolso || eredmeny.szakaszok.length === 0) {
    node.hidden = true;
    return;
  }
  const megtett = meres.tav;
  const hatra = haversine(meres.utolso, S.kapuk.end);
  if (hatra < 150 || megtett < 150) {
    node.hidden = true;
    return;
  }
  const tempo = megengedettAtlag(eredmeny);          // km/h, ezzel haladna tovább
  const teljes = megtett + hatra;
  const ido = meres.ido / 1000 + hatra / (tempo / 3.6);
  const varhato = (teljes / ido) * 3.6;

  node.hidden = false;
  node.className = `projekcio ${varhato > tempo + 0.05 ? 'rossz' : 'jo'}`;
  /* Vegyes korlátozású szakaszon a súlyozott átlag nem olyan tempó, amivel
     bárhol szabályosan mehetnél — ilyenkor ne is írjuk ki számként.     */
  const egyfele = new Set(eredmeny.szakaszok.map((sz) => sz.limit)).size === 1;
  node.innerHTML =
    (egyfele
      ? `Ha innen <strong>${fmtLimit(tempo)} km/h</strong>-val haladsz tovább, `
      : 'Ha innen végig tartod a korlátozásokat, ') +
    `várhatóan <strong>${Math.round(varhato)} km/h</strong> lesz a szakaszátlagod.`;
}

/* A képre rövid mondat kell: a kártyán olvasható hosszú szöveg ott nem
   fér ki, és megosztva úgyis a szám a lényeg.                          */
const MEGOSZT_VERDIKT = {
  ok: () => 'Végig a megengedett átlag alatt maradtam.',
  hatar: () => 'A megengedett átlag felett, de bírság nélkül.',
  birsag: (e) => `Ezen a szakaszon ${fmtForint(birsagOsszeg(e))} bírság járna.`,
  semleges: () => 'Átlagsebesség-szimuláció.',
};

/* ========================================================= eredménykártya */

/* A lezárás után az eredménykártya veszi át a szerepet — a futó mérés
   panelje ugyanazt mondaná el még egyszer, ezért elrejtjük.            */
function eredmenyKartya(eredmeny) {
  const kartya = $('eredmeny-kartya');
  const kesz = meres.allapot === ALLAPOT.KESZ && eredmeny.szakaszok.length > 0;
  kartya.hidden = !kesz;
  $('ora-kartya').hidden = kesz;
  if (!kesz) return;

  $('eredmeny-alcim').textContent =
    szakaszNev(eredmeny, !!(S.kapuk.start && S.kapuk.end));
  utolsoEredmeny = eredmeny;

  const sorok = [
    ['Szakasz', fmtDistance(eredmeny.osszTav)],
    ['Idő', fmtDuration(eredmeny.osszIdo)],
    ['Átlag', `${fmtSpeed1(eredmeny.osszAtlag)} km/h`],
    ['Megengedett átlag', `${fmtLimit(megengedettAtlag(eredmeny))} km/h`],
  ];
  if (eredmeny.birsagosak.length) sorok.push(['Bírság', fmtForint(birsagOsszeg(eredmeny))]);
  $('eredmeny-adatok').innerHTML = sorok.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
  verdiktRender($('eredmeny-verdikt'), eredmeny);
}

/* ============================================================ élő nézet */

function elonezetFrissit() {
  const p = meres.pontok;
  const szakaszok = bontas(p);
  const eredmeny = ertekelSzakaszok(szakaszok);
  utolsoEredmeny = eredmeny;

  hatarokFrissitese();

  szakaszPanel(eredmeny);
  oraEsStatusz(eredmeny);
  projekcio(eredmeny);
  eredmenyKartya(eredmeny);
  gpsPill();

  $('gps-uzenet').textContent = meres.figyelmeztet ? meres.uzenet : '';
  const hatarSor = $('hatar-allapot');
  hatarSor.textContent = S.autoHatar
    ? HATAR_ALLAPOT[S.lekeresAllapot]
    : 'Sebességhatárok: az automatikus lekérés ki van kapcsolva.';
  hatarSor.className = `muted small center${S.lekeresAllapot === 'hiba' ? ' figyelem' : ''}`;

  const mutat = eredmeny.szakaszok.length > 1 || meres.allapot === ALLAPOT.KESZ;
  $('szakasz-kartya').hidden = !mutat;
  if (mutat) {
    szakaszLista($('szakasz-lista'), eredmeny, { szerkesztheto: meres.allapot !== ALLAPOT.MER });
  }

  terkep?.nyomvonalRajz(p, eredmeny.szakaszok);
  terkep?.pozicioRajz(meres.utolso);

  const fut = meres.allapot === ALLAPOT.VAR || meres.allapot === ALLAPOT.MER;
  $('btn-meres').innerHTML = fut
    ? '<svg class="ikon" aria-hidden="true"><use href="#i-stop"/></svg>Mérés leállítása'
    : '<svg class="ikon" aria-hidden="true"><use href="#i-play"/></svg>Mérés indítása';
  $('btn-meres').classList.toggle('stop', fut);
}

/* =========================================================== kalkulátor */

function kalkSorokRender() {
  const node = $('kalk-sorok');
  node.innerHTML = '';
  S.kalkSorok.forEach((sor, i) => {
    const d = el('div', 'seg edit',
      `<button class="limit-gomb k-limit" aria-label="Sebességhatár"><strong>${sor.limit}</strong><span>km/h</span></button>
       <div class="seg-info"><label>Hossz <input class="k-hossz" type="number" min="0.1" step="0.1" value="${String(sor.hossz).replace('.', ',')}" inputmode="decimal"> km</label></div>
       <button class="seg-torol" aria-label="Sor törlése" ${S.kalkSorok.length === 1 ? 'disabled' : ''}><svg class="ikon" aria-hidden="true"><use href="#i-x"/></svg></button>`);
    d.querySelector('.k-limit').addEventListener('click', () => limitLapNyit({
      cim: 'Szakaszrész sebességhatára',
      alcim: 'Válassz a gyakori korlátozásokból, vagy írj be egyéni értéket.',
      ertek: sor.limit,
      onValaszt: (v) => {
        S.kalkSorok[i].limit = v;
        kalkSorokRender();
        kalkSzamol();
      },
    }));
    d.querySelector('.k-hossz').addEventListener('input', (e) => {
      S.kalkSorok[i].hossz = parseFloat(String(e.target.value).replace(',', '.')) || 0;
      kalkSzamol();
    });
    d.querySelector('.seg-torol').addEventListener('click', () => {
      S.kalkSorok.splice(i, 1);
      kalkSorokRender();
      kalkSzamol();
    });
    node.append(d);
  });
}

function kalkSzamol() {
  const sorok = S.kalkSorok.filter((s) => s.hossz > 0 && s.limit > 0);
  const osszTav = sorok.reduce((a, s) => a + s.hossz * 1000, 0);
  const idoMod = $('sel-mod').value === 'ido';

  let osszIdo; // ms
  if (idoMod) {
    const perc = parseFloat($('in-perc').value) || 0;
    const mp = parseFloat($('in-mp').value) || 0;
    osszIdo = (perc * 60 + mp) * 1000;
  } else {
    const tempo = parseFloat(String($('in-tempo').value).replace(',', '.')) || 0;
    osszIdo = tempo > 0 ? (osszTav / (tempo / 3.6)) * 1000 : 0;
  }

  if (osszTav <= 0 || osszIdo <= 0) {
    kalkOra.frissit({ ertek: 0, pillanat: null, limit: 90, birsagHatar: 105, allapot: 'semleges' });
    $('k-tabla').textContent = '-';
    $('k-statuszsav').className = 'statuszsav semleges';
    $('k-st-fo').textContent = 'ÁTLAGSEBESSÉG: -';
    $('k-st-cimke').textContent = STATUSZ.semleges.cimke;
    $('k-utsav').hidden = true;
    $('k-merleg').hidden = true;
    $('k-verdikt').className = 'verdikt semleges';
    $('k-verdikt').textContent = 'Add meg a szakasz hosszát és a menetidőt.';
    $('k-reszletek').innerHTML = '';
    $('k-kv').innerHTML = '';
    return;
  }

  // Egyenletes tempót feltételezünk: a menetidőt hossz arányában osztjuk szét.
  const atlag = (osszTav / (osszIdo / 1000)) * 3.6;

  /* Személyautóval 250 km/h fölött nem közlekedünk: ilyenkor a megadott
     idő vagy hossz hibás, és bírságot számolni rá félrevezető lenne.   */
  if (atlag > MAX_SEBESSEG) {
    kalkOra.frissit({
      ertek: MAX_SEBESSEG, pillanat: null,
      limit: Math.round(sorok[0].limit), birsagHatar: Math.round(sorok[0].limit) + 20,
      allapot: 'semleges',
    });
    $('k-tabla').textContent = '-';
    $('k-statuszsav').className = 'statuszsav semleges';
    $('k-st-fo').textContent = `ÁTLAGSEBESSÉG: ${Math.round(atlag)} km/h`;
    $('k-st-cimke').textContent = '[○ IRREÁLIS]';
    $('k-utsav').hidden = true;
    $('k-merleg').hidden = true;
    $('k-verdikt').className = 'verdikt hatar';
    $('k-verdikt').innerHTML =
      `<strong>Ez ${Math.round(atlag)} km/h átlag lenne.</strong><br>` +
      `<span class="small">Személyautóval ${MAX_SEBESSEG} km/h fölött nem ` +
      `közlekedünk, ezért erre nem számolunk bírságot. Nézd meg a megadott ` +
      `hosszt és menetidőt.</span>`;
    $('k-reszletek').innerHTML = '';
    $('k-kv').innerHTML = '';
    return;
  }
  const szakaszok = sorok.map((s) => ({
    tav: s.hossz * 1000,
    ido: ((s.hossz * 1000) / (atlag / 3.6)) * 1000,
    limit: s.limit,
    cimke: 'megadott szakaszrész',
    nev: '',
    becsult: false,
    utepites: false,
    lakott: false,
  }));
  const eredmeny = ertekelSzakaszok(szakaszok);

  const megengedett = megengedettAtlag(eredmeny);
  const allapot = allapotJel(eredmeny);

  kalkOra.frissit({
    ertek: atlag,
    pillanat: null,
    limit: Math.round(megengedett),
    birsagHatar: Math.round(birsagHatarAtlag(eredmeny)),
    allapot,
  });
  /* Ha minden szakaszrészen ugyanaz a korlátozás, az érték valóban ki van
     táblázva: mehet közúti tábla. Vegyes szakaszon viszont a súlyozott
     átlag sehol nincs kint, ezért ott semleges jelölés jár, kerekítve. */
  const egyfeleLimit = new Set(sorok.map((x) => x.limit)).size === 1;
  const tabla = $('k-tabla');
  tabla.classList.toggle('atlagjel', !egyfeleLimit);
  tabla.textContent = egyfeleLimit ? fmtLimit(megengedett) : `Ø ${Math.round(megengedett)}`;
  tabla.nextElementSibling.textContent = egyfeleLimit ? 'megengedett' : 'megengedett átlag';

  $('k-statuszsav').className = `statuszsav ${allapot}`;
  $('k-st-fo').textContent = `ÁTLAGSEBESSÉG: ${fmtSpeed(atlag)} km/h`;
  $('k-st-cimke').textContent = STATUSZ[allapot].cimke;

  utsavRender(eredmeny);

  verdiktRender($('k-verdikt'), eredmeny);
  szakaszLista($('k-reszletek'), eredmeny, { szerkesztheto: false });

  const nyereseg = eredmeny.szabalyosIdo - osszIdo;
  const merleg = $('k-merleg');
  merleg.hidden = nyereseg <= 0;
  if (nyereseg > 0) {
    $('k-nyereseg').textContent = fmtDurationWords(nyereseg);
    const ar = eredmeny.osszegHalmozott;
    $('k-ar').textContent = ar > 0 ? fmtForint(ar) : 'semmibe';
    merleg.querySelector('.ar').classList.toggle('ingyen', ar === 0);
  }

  const kv = [
    ['Össztáv', fmtDistance(osszTav)],
    ['Menetidő', fmtDuration(osszIdo)],
    ['Megengedett átlag', `${fmtLimit(megengedett)} km/h`],
    ['Szabályos menetidő (végig a korlátozással)', fmtDuration(eredmeny.szabalyosIdo)],
    ['Bírságmentes minimum menetidő', fmtDuration(eredmeny.minIdo)],
  ];
  if (nyereseg > 0) {
    kv.push(['Időnyereség a szabályoshoz képest', fmtDurationWords(nyereseg)]);
    if (eredmeny.osszegHalmozott > 0) {
      const perc = nyereseg / 60000;
      kv.push([
        'A nyert idő ára',
        `${fmtForint(eredmeny.osszegHalmozott)}, azaz ` +
        `${fmtForint(eredmeny.osszegHalmozott / Math.max(perc, 0.01))} percenként`,
      ]);
    }
  } else if (nyereseg < 0) {
    kv.push(['A szabályoshoz képest', `${fmtDurationWords(-nyereseg)}-cel lassabb`]);
  }
  if (osszIdo < eredmeny.minIdo) {
    kv.push(['Figyelem', 'Ennyi idő alatt a szakasz bírság nélkül nem teljesíthető.']);
  }

  $('k-kv').innerHTML = kv.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
}

/** A szakasz arányos képe: a szélesség a hossz, a szín az ítélet. */
function utsavRender(eredmeny) {
  const sav = $('k-utsav');
  sav.innerHTML = '';
  sav.hidden = eredmeny.szakaszok.length === 0;
  if (sav.hidden) return;

  for (const sz of eredmeny.szakaszok) {
    const e = sz.ertekeles;
    const allapot = e.birsagos ? 'birsag' : e.tartalek <= 5 ? 'hatar' : 'ok';
    const resz = el('div', `utsav-resz ${allapot}`,
      `<span class="utsav-limit">${sz.limit}</span>` +
      `<span class="utsav-hossz">${fmtDistance(sz.tav)}</span>`);
    resz.style.flex = `${sz.tav} 1 0`;
    resz.title = `${sz.limit} km/h, átlag ${fmtSpeed1(e.mert)} km/h`;
    sav.append(resz);
  }
}

/* ============================================================ OSM lekérés */

async function osmLekeres() {
  // Nyomvonal nélkül is van értelme: a jelenlegi helyzet körül lekérve máris
  // a valódi korlátozás kerül a táblára, még indulás előtt.
  const p = meres.pontok.length >= 2
    ? meres.pontok
    : (meres.utolso ? [meres.utolso] : []);
  if (p.length === 0) {
    $('osm-allapot').textContent =
      'Ehhez tudnunk kell, hol vagy: indítsd el a mérést, vagy nyomd meg a térkép ' +
      'fölött az „Ide” gombot.';
    return;
  }
  const gomb = $('btn-osm');
  gomb.disabled = true;
  $('osm-allapot').textContent = 'Lekérés az OpenStreetMapből…';
  try {
    const utak = await utakLekerese(p, {
      onProgress: (i, n) => ($('osm-allapot').textContent = `Lekérés… (${i}/${n})`),
    });
    for (const w of utak) S.utakMap.set(w.id, w);
    S.utak = [...S.utakMap.values()];
    S.lekeresKozep = meres.utolso || S.lekeresKozep;
    S.lekeresAllapot = 'kesz';
    S.felulir.clear();
    $('osm-allapot').textContent =
      `${utak.length} útszakasz adata megérkezett. Ahol mást láttál kint, ` +
      `írd át a listában, és a számítás azonnal frissül.`;
    elonezetFrissit();
  } catch (e) {
    $('osm-allapot').textContent =
      `Nem sikerült a lekérés (${e.message}). Az app az alapértelmezett határral számol tovább.`;
  } finally {
    gomb.disabled = false;
  }
}

/* =============================================================== indítás */

function birsagTablaRender() {
  $('info-jog').textContent =
    `${JOGSZABALY.nev}. A táblázat utoljára ellenőrizve: ${JOGSZABALY.ellenorizve}.`;

  /* 24 hajszálvonalas táblázatsor helyett kategóriánként a két szám, ami
     tényleg érdekel (meddig nincs bírság, meddig terjed), a teljes sávozás
     pedig lenyitható. Így az oldal olvasható marad, az adat mégis megvan. */
  const doboz = $('info-tabla');
  doboz.innerHTML = '';
  for (const kat of KATEGORIAK) {
    const also = kat.savok[0].osszeg;
    const felso = kat.savok[kat.savok.length - 1].osszeg;

    const blokk = el('section', 'jog-kat');
    blokk.append(el('h3', null, kat.nev));
    blokk.append(el('p', 'jog-kulcs',
      `<strong>+${kat.kuszob} km/h</strong>-ig nincs bírság, felette ` +
      `<strong>${fmtForint(also)}</strong>-tól <strong>${fmtForint(felso)}</strong>-ig nő.`));

    let sorok = '';
    let hatar = kat.kuszob;
    for (const sav of kat.savok) {
      const cimke = sav.max === Infinity
        ? `${hatar} km/h felett`
        : `${hatar + 1}\u2013${sav.max} km/h`.replace('\u2013', '-');
      sorok += `<dt>${cimke}</dt><dd>${fmtForint(sav.osszeg)}</dd>`;
      hatar = sav.max;
    }
    const reszlet = el('details', 'jog-savok');
    reszlet.innerHTML = `<summary>Sávok részletesen</summary><dl class="kv">${sorok}</dl>`;
    blokk.append(reszlet);

    doboz.append(blokk);
  }
}

function kapukFrissit() {
  const { start, end } = S.kapuk;
  terkep?.kapukRajz(start, end, S.kapuk.sugar);
  $('kapu-allapot').textContent = !start && !end
    ? 'Nincs kijelölt szakasz. Kézi indítás és leállítás.'
    : start && end
      ? `Szakasz kijelölve. Légvonalban ${fmtDistance(haversine(start, end))}, a mérés automatikusan indul és áll le.`
      : start
        ? 'A szakasz eleje kijelölve; a végét kézzel kell leállítanod.'
        : 'Csak a végpont van kijelölve. Jelöld ki a szakasz elejét is, vagy indíts kézzel.';
  elonezetFrissit();
}

function jelolMod(mod) {
  S.jelolMod = mod;
  $('btn-start-jelol').classList.toggle('aktiv', mod === 'start');
  $('btn-end-jelol').classList.toggle('aktiv', mod === 'end');
  if (mod) {
    $('kapu-allapot').textContent =
      `Koppints a térképre a szakasz ${mod === 'start' ? 'elejének' : 'végének'} kijelöléséhez.`;
  }
}

function ujSzimulacio() {
  meres.leallit();
  meres.reset();
  S.felulir.clear();
  S.kezi = null;
  S.utak = null;
  S.utakMap.clear();
  S.lekeresKozep = null;
  S.lekeresAllapot = 'nincs';
  $('osm-allapot').textContent =
    'A lekérés a nyomvonal koordinátáit elküldi az Overpass API-nak. Ez az egyetlen ' +
    'alkalom, amikor adat hagyja el a készüléket, és az sem rólad szól, hanem az útról.';
  elonezetFrissit();
}

function esemenyek() {
  $('btn-info').addEventListener('click', () => fulre('scr-info'));

  $('ora-tabla').addEventListener('click', () => limitLapNyit({
    cim: 'Sebességhatár a szakaszon',
    alcim: S.utak
      ? 'A tábla most a helyben érvényes, lekért korlátozást mutatja. Amit itt ' +
        'megadsz, felülírja azt: minden szakaszrészre ez az érték kerül.'
      : 'Ezzel számol az app, amíg le nem kéred a tényleges határokat.',
    ertek: aktualisHatar().limit,
    osmGomb: !!S.utak && S.kezi != null,
    onValaszt: limitBeallit,
    onOsm: () => {
      S.kezi = null;
      elonezetFrissit();
    },
  }));

  document.querySelectorAll('#limit-lap [data-zar]').forEach((n) =>
    n.addEventListener('click', limitLapZar));
  $('limit-egyeni-ok').addEventListener('click', () => {
    const v = parseInt($('limit-egyeni').value, 10);
    if (v > 0 && lapValaszt) {
      lapValaszt(v);
      limitLapZar();
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('limit-lap').hidden) limitLapZar();
  });

  $('btn-cta').addEventListener('click', () => {
    $('mod-valaszto').hidden = false;
    gorget($('mod-valaszto'));
  });
  $('mod-vezetek').addEventListener('click', () => eloNezet(true));
  $('mod-kiprobalnam').addEventListener('click', () => fulre('scr-kalk'));

  $('btn-meres').addEventListener('click', () => {
    if (meres.allapot === ALLAPOT.VAR || meres.allapot === ALLAPOT.MER) meres.leallit();
    else {
      S.felulir.clear();
      elozoAllapot = 'semleges';
      gong.ebreszt();          // hangot csak felhasználói mozdulat után enged a böngésző
      meres.indit({ ...S.kapuk });
    }
  });

  $('btn-megoszt').addEventListener('click', async () => {
    const gomb = $('btn-megoszt');
    const allapot = $('megoszt-allapot');
    if (!utolsoEredmeny || utolsoEredmeny.szakaszok.length === 0) return;
    gomb.disabled = true;
    allapot.hidden = false;
    allapot.textContent = 'Kép készítése…';
    try {
      const e = utolsoEredmeny;
      const jel = allapotJel(e);
      const blob = await keszitKep({
        atlag: String(Math.round(e.osszAtlag)),
        megengedett: fmtLimit(megengedettAtlag(e)),
        tav: fmtDistance(e.osszTav),
        ido: fmtDuration(e.osszIdo),
        allapot: jel,
        szakaszNev: szakaszNev(e, !!(S.kapuk.start && S.kapuk.end)),
        verdikt: MEGOSZT_VERDIKT[jel](e),
        szakaszok: e.szakaszok.map((sz) => ({
          limit: sz.limit,
          tav: sz.tav,
          allapot: sz.ertekeles.birsagos
            ? 'birsag'
            : sz.ertekeles.tartalek <= 5 ? 'hatar' : 'ok',
        })),
      });
      const eredmeny = await megoszt(blob);
      allapot.textContent = eredmeny === 'letoltve'
        ? 'A kép letöltve. Innen bárhová továbbküldheted.'
        : eredmeny === 'megszakitva' ? 'Megosztás megszakítva.' : 'Elküldve.';
    } catch {
      allapot.textContent = 'A kép készítése nem sikerült.';
    } finally {
      gomb.disabled = false;
    }
  });

  $('btn-ujra').addEventListener('click', ujSzimulacio);
  $('btn-ujra-szakasz').addEventListener('click', ujSzimulacio);
  $('btn-uj-szimulacio').addEventListener('click', () => {
    ujSzimulacio();
    eloNezet(false);
  });
  $('btn-reszletek').addEventListener('click', () => {
    $('szakasz-kartya').hidden = false;
    gorget($('szakasz-kartya'), 'start');
  });

  $('btn-start-jelol').addEventListener('click', () => jelolMod('start'));
  $('btn-end-jelol').addEventListener('click', () => jelolMod('end'));
  $('btn-kapu-torol').addEventListener('click', () => {
    S.kapuk.start = null;
    S.kapuk.end = null;
    jelolMod(null);
    kapukFrissit();
  });

  $('sel-sugar').addEventListener('change', (e) => {
    S.kapuk.sugar = parseInt(e.target.value, 10);
    kapukFrissit();
  });

  $('sel-alap').addEventListener('change', (e) => {
    S.alap = parseInt(e.target.value, 10);
    if (S.kezi != null) S.kezi = S.alap;
    elonezetFrissit();
  });

  $('btn-hang').addEventListener('click', (e) => {
    gong.be = !gong.be;
    const gomb = e.currentTarget;
    gomb.setAttribute('aria-pressed', String(gong.be));
    gomb.querySelector('use').setAttribute(
      'href', gong.be ? '#i-speaker-high' : '#i-speaker-slash'
    );
    gomb.querySelector('span').textContent = gong.be ? 'Hangjelzés be' : 'Hangjelzés ki';
    // bekapcsoláskor rögtön hallható, hogy tényleg működik
    if (gong.be) gong.probal('rendben');
  });

  $('btn-hang-proba').addEventListener('click', async () => {
    const allapot = $('hang-proba-allapot');
    const szolt = await gong.probal('figyelem');
    allapot.className = `muted small${szolt ? '' : ' figyelem'}`;
    allapot.textContent = szolt
      ? 'Most szólnia kellett. Ha nem hallottad: nézd meg a média-hangerőt, ' +
        'iPhone-on pedig a néma kapcsolót.'
      : 'A böngésző nem engedte a hangot. Próbáld újra, vagy indíts egy mérést: ' +
        'a hangkimenet gombnyomásra oldódik fel.';
  });

  $('btn-osm').addEventListener('click', osmLekeres);

  $('chk-auto-hatar').addEventListener('change', (e) => {
    S.autoHatar = e.target.checked;
    if (S.autoHatar) hatarokFrissitese();
    elonezetFrissit();
  });

  $('btn-kozepre').addEventListener('click', () => {
    if (meres.utolso) {
      terkep.kovetesVissza();
      terkep.pozicioRajz(meres.utolso);
      return;
    }
    navigator.geolocation?.getCurrentPosition(
      (pos) => {
        // mérés nélkül is jegyezzük meg, hova nézünk: enélkül a tábla és a
        // határlekérés nem tudná, hol vagy
        meres.utolso = {
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          t: pos.timestamp,
          acc: pos.coords.accuracy,
          spd: null,
        };
        terkep.pozicioRajz(meres.utolso);
        elonezetFrissit();
      },
      () => ($('gps-uzenet').textContent = 'Nem sikerült lekérni a helyzetedet.'),
      { enableHighAccuracy: true, timeout: 15000 }
    );
  });

  $('btn-illeszt').addEventListener('click', () => {
    terkep.illeszt([...meres.pontok, S.kapuk.start, S.kapuk.end].filter(Boolean));
  });

  $('btn-csempe').addEventListener('click', (e) => {
    const be = e.currentTarget.getAttribute('aria-pressed') === 'true';
    if (be) terkep.csempekKi(); else terkep.csempekBe();
    e.currentTarget.setAttribute('aria-pressed', String(!be));
    e.currentTarget.textContent = be ? 'kikapcsolva' : 'bekapcsolva';
  });

  $('btn-sor-add').addEventListener('click', () => {
    const utolso = S.kalkSorok[S.kalkSorok.length - 1];
    S.kalkSorok.push({ hossz: 2, limit: utolso ? Math.max(30, utolso.limit - 40) : 50 });
    kalkSorokRender();
    kalkSzamol();
  });

  $('sel-mod').addEventListener('change', (e) => {
    $('mezo-ido').hidden = e.target.value !== 'ido';
    $('mezo-tempo').hidden = e.target.value === 'ido';
    kalkSzamol();
  });
  ['in-perc', 'in-mp', 'in-tempo'].forEach((id) => $(id).addEventListener('input', kalkSzamol));
}

function indul() {
  // Fogódzó fejlesztéshez és automatikus teszthez. Nincs benne más, mint ami
  // amúgy is a memóriában van; sehová nem kerül el.
  window.atlagsebesseg = { S, meres, terkep: null, eloNezet, gong };

  ora = new Ora($('ora'));
  kalkOra = new Ora($('k-ora'));
  fulek();
  esemenyek();
  kalkSorokRender();
  kalkSzamol();
  birsagTablaRender();
  elonezetFrissit();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

indul();
