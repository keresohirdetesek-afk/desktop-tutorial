/* Átlagsebesség.hu — összefogó réteg.
   Semmit nem ment el: minden állapot ebben a modulban, a memóriában él. */

import {
  fmtSpeed, fmtSpeed1, fmtDistance, fmtDuration, fmtDurationWords, fmtForint,
  trackLength, haversine,
} from './geo.js';
import { ertekelSzakaszok, birsagmentesMax, KATEGORIAK, JOGSZABALY } from './birsag.js';
import { utakLekerese, pontonkentiHatar, szakaszokra } from './limits.js';
import { Terkep } from './map.js';
import { Ora } from './gauge.js';
import { Meres, ALLAPOT } from './track.js';

const $ = (id) => document.getElementById(id);
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
  kalkSorok: [{ hossz: 10, limit: 90 }],
};

const STATUSZ = {
  ok:        { cimke: '[● BIZTONSÁGOS]', megj: '(Sebesség tartása OK)' },
  hatar:     { cimke: '[● HATÁRON]',     megj: '(A megengedett átlag felett, még bírság nélkül)' },
  birsag:    { cimke: '[● BÍRSÁGOS]',    megj: '(Ezen a szakaszon már bírság járna)' },
  semleges:  { cimke: '[○ NINCS ADAT]',  megj: '(Indítsd el a mérést)' },
};

let terkep = null;
let ora = null;
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
  }
  setTimeout(() => terkep.frissit(), 60);
}

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

/* A megengedett átlag egyetlen korlátozásnál kerek szám (90, 130) — ilyenkor
   a tizedes csak zajt vinne bele. Vegyes szakasznál viszont számít.      */
function fmtLimit(v) {
  return Math.abs(v - Math.round(v)) < 0.05 ? String(Math.round(v)) : fmtSpeed1(v);
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
    node.innerHTML = felette
      ? `<strong>⚠ Gyorsabb voltál a megengedettnél, de bírság nem járna.</strong><br>` +
        `<span class="small">A megengedett átlag ${fmtLimit(megengedett)} km/h volt, ` +
        `a tiéd ${fmtSpeed1(eredmeny.osszAtlag)} km/h. ` +
        (tartalek < 0.5
          ? 'Épp a bírsághatáron vagy.'
          : `A bírsághatárig még ${fmtSpeed1(tartalek)} km/h maradt.`) +
        `</span>`
      : `<strong>✓ Ebben a szimulációban nem lépted túl az átlagsebesség-határt.</strong><br>` +
        `<span class="small">` +
        (tartalek < 0.5
          ? 'Épp a határon vagy — egy hajszállal gyorsabban már jönne a csekk.'
          : `A legszorosabb szakaszon még ${fmtSpeed1(tartalek)} km/h ráhagyásod volt.`) +
        `</span>`;
    return;
  }
  const e = eredmeny.legsulyosabb.ertekeles;
  node.className = 'verdikt birsag';
  node.innerHTML =
    `<strong>✕ Bírság: ${fmtForint(birsagOsszeg(eredmeny))}</strong><br>` +
    `<span class="small">` +
    (b.length > 1 ? `${b.length} szakaszon lépted túl a határt; a legsúlyosabb: ` : '') +
    `${e.limit} km/h-s szakaszon ${fmtSpeed1(e.mert)} km/h átlag ` +
    `(+${fmtSpeed1(e.tullepes)} km/h) — ${fmtForint(e.osszeg)}.</span>`;
}

function jelvenyek(sz) {
  const j = [];
  if (sz.utepites) j.push('<span class="badge warn">🚧 útépítés</span>');
  if (sz.lakott) j.push('<span class="badge">🏘 lakott terület</span>');
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
      ? el('label', 'seg-limit',
          `<input type="number" min="5" max="150" step="5" value="${sz.limit}" aria-label="Sebességhatár"><span>km/h</span>`)
      : el('div', 'seg-limit', `<strong>${sz.limit}</strong><span>km/h</span>`);

    const info = el('div', 'seg-info',
      `<strong>${fmtDistance(sz.tav)}</strong> · ${fmtDuration(sz.ido)} · átlag ${fmtSpeed1(e.mert)} km/h<br>` +
      `<span class="muted small">${sz.nev ? `${sz.nev} — ` : ''}${sz.cimke}</span> ${jelvenyek(sz)}`);

    const verd = el('div', `seg-verd ${allapot}`,
      e.birsagos
        ? fmtForint(e.osszeg)
        : `+${fmtSpeed1(Math.max(0, e.tartalek))}<span class="small"> km/h</span>`);

    sor.append(limitDoboz, info, verd);
    node.append(sor);

    if (szerkesztheto) {
      sor.querySelector('input').addEventListener('change', (ev) => {
        const ertek = parseInt(ev.target.value, 10);
        if (ertek > 0) {
          S.felulir.set(i, ertek);
          elonezetFrissit();
        }
      });
    }
  });
}

/* ------------------------------------------------- szakasz és haladás */

function szakaszPanel(eredmeny) {
  const vanKapu = !!(S.kapuk.start && S.kapuk.end);

  let nev = vanKapu ? 'Kijelölt szakasz' : 'Kézi mérés';
  const utNev = eredmeny.szakaszok
    .slice()
    .sort((a, b) => b.tav - a.tav)
    .map((s) => s.nev)
    .find(Boolean);
  if (utNev) nev = `${utNev} szakasz`;
  $('szakasz-nev').textContent = nev;

  const kozep = $('szp-hatra');
  const idoSor = $('szp-ido');
  const sav = $('szp-sav');

  if (!vanKapu) {
    kozep.textContent = `Megtéve: ${fmtDistance(meres.tav)}`;
    idoSor.textContent = 'Nincs kijelölt kapu — kézi leállítás';
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
  const allapot = allapotJel(eredmeny);
  const megengedett = megengedettAtlag(eredmeny);
  const hatar = birsagHatarAtlag(eredmeny);

  ora.frissit({
    ertek: van ? eredmeny.osszAtlag : 0,
    limit: Math.round(megengedett),
    birsagHatar: Math.round(hatar),
    allapot,
  });
  $('ora-tabla').textContent = fmtLimit(megengedett);

  const sav = $('statuszsav');
  sav.className = `statuszsav ${allapot}`;
  $('st-fo').textContent = van
    ? `JELENLEGI ÁTLAG: ${fmtSpeed(eredmeny.osszAtlag)} km/h`
    : 'JELENLEGI ÁTLAG: —';
  $('st-cimke').textContent = STATUSZ[allapot].cimke;
  $('st-megj').textContent = allapot === 'birsag'
    ? `(Ezen a szakaszon ${fmtForint(birsagOsszeg(eredmeny))} bírság járna)`
    : STATUSZ[allapot].megj;

  $('ki-atlag').textContent = van ? `${fmtSpeed(eredmeny.osszAtlag)} km/h` : '—';
  $('ki-limit').textContent = `${fmtLimit(megengedett)} km/h`;
  $('ki-ido').textContent = fmtDuration(meres.ido);
  $('ki-birsag').textContent = fmtForint(birsagOsszeg(eredmeny));
  $('ki-birsag').style.color = eredmeny.birsagosak.length ? 'var(--danger)' : '';

  $('ki-melleklet').textContent =
    `Táv: ${fmtDistance(meres.tav)} · Pillanatnyi: ` +
    (meres.utolso ? `${fmtSpeed(meres.pillanatnyi)} km/h` : '—') +
    ` · GPS: ${meres.utolso ? `±${Math.round(meres.utolso.acc)} m` : '—'}`;
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
  const tempo = megengedettAtlag(eredmeny);          // km/h — ezzel haladna tovább
  const teljes = megtett + hatra;
  const ido = meres.ido / 1000 + hatra / (tempo / 3.6);
  const varhato = (teljes / ido) * 3.6;

  node.hidden = false;
  node.className = `projekcio ${varhato > tempo + 0.05 ? 'rossz' : 'jo'}`;
  node.innerHTML =
    `Ha innen <strong>${fmtLimit(tempo)} km/h</strong>-val haladsz tovább, ` +
    `várhatóan <strong>${Math.round(varhato)} km/h</strong> lesz a szakaszátlagod.`;
}

/* ========================================================= eredménykártya */

/* A lezárás után az eredménykártya veszi át a szerepet — a futó mérés
   panelje ugyanazt mondaná el még egyszer, ezért elrejtjük.            */
function eredmenyKartya(eredmeny) {
  const kartya = $('eredmeny-kartya');
  const kesz = meres.allapot === ALLAPOT.KESZ && eredmeny.szakaszok.length > 0;
  kartya.hidden = !kesz;
  $('ora-kartya').hidden = kesz;
  if (!kesz) return;

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

  szakaszPanel(eredmeny);
  oraEsStatusz(eredmeny);
  projekcio(eredmeny);
  eredmenyKartya(eredmeny);
  gpsPill();

  $('gps-uzenet').textContent = meres.figyelmeztet ? meres.uzenet : '';

  const mutat = eredmeny.szakaszok.length > 1 || meres.allapot === ALLAPOT.KESZ;
  $('szakasz-kartya').hidden = !mutat;
  if (mutat) {
    szakaszLista($('szakasz-lista'), eredmeny, { szerkesztheto: meres.allapot !== ALLAPOT.MER });
  }

  terkep?.nyomvonalRajz(p, eredmeny.szakaszok);
  terkep?.pozicioRajz(meres.utolso);

  const fut = meres.allapot === ALLAPOT.VAR || meres.allapot === ALLAPOT.MER;
  $('btn-meres').textContent = fut ? '◼ Mérés leállítása' : '▶ Mérés indítása';
  $('btn-meres').classList.toggle('stop', fut);
}

/* =========================================================== kalkulátor */

function kalkSorokRender() {
  const node = $('kalk-sorok');
  node.innerHTML = '';
  S.kalkSorok.forEach((sor, i) => {
    const d = el('div', 'seg edit',
      `<label class="seg-limit"><input class="k-limit" type="number" min="5" max="150" step="5" value="${sor.limit}" aria-label="Sebességhatár"><span>km/h</span></label>
       <div class="seg-info"><label>Hossz <input class="k-hossz" type="number" min="0.1" step="0.1" value="${String(sor.hossz).replace('.', ',')}" inputmode="decimal"> km</label></div>
       <button class="seg-torol" aria-label="Sor törlése" ${S.kalkSorok.length === 1 ? 'disabled' : ''}>✕</button>`);
    d.querySelector('.k-limit').addEventListener('input', (e) => {
      S.kalkSorok[i].limit = parseFloat(e.target.value) || 0;
      kalkSzamol();
    });
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
    $('k-atlag').textContent = '—';
    $('k-verdikt').className = 'verdikt semleges';
    $('k-verdikt').textContent = 'Add meg a szakasz hosszát és a menetidőt.';
    $('k-reszletek').innerHTML = '';
    $('k-kv').innerHTML = '';
    return;
  }

  // Egyenletes tempót feltételezünk: a menetidőt hossz arányában osztjuk szét.
  const atlag = (osszTav / (osszIdo / 1000)) * 3.6;
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

  $('k-atlag').textContent = fmtSpeed(atlag);
  verdiktRender($('k-verdikt'), eredmeny);
  szakaszLista($('k-reszletek'), eredmeny, { szerkesztheto: false });

  const nyereseg = eredmeny.szabalyosIdo - osszIdo;
  const kv = [
    ['Össztáv', fmtDistance(osszTav)],
    ['Menetidő', fmtDuration(osszIdo)],
    ['Megengedett átlag', `${fmtLimit(megengedettAtlag(eredmeny))} km/h`],
    ['Szabályos menetidő (végig a korlátozással)', fmtDuration(eredmeny.szabalyosIdo)],
    ['Bírságmentes minimum menetidő', fmtDuration(eredmeny.minIdo)],
  ];
  if (nyereseg > 0) {
    kv.push(['Időnyereség a szabályoshoz képest', fmtDurationWords(nyereseg)]);
    if (eredmeny.osszegHalmozott > 0) {
      const perc = nyereseg / 60000;
      kv.push([
        'A nyert idő ára',
        `${fmtForint(eredmeny.osszegHalmozott)} — ${fmtForint(eredmeny.osszegHalmozott / Math.max(perc, 0.01))} percenként`,
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

/* ============================================================ OSM lekérés */

async function osmLekeres() {
  const p = meres.pontok;
  if (p.length < 2) {
    $('osm-allapot').textContent = 'Előbb rögzíts egy nyomvonalat, utána kérhetők le a határok.';
    return;
  }
  const gomb = $('btn-osm');
  gomb.disabled = true;
  $('osm-allapot').textContent = 'Lekérés az OpenStreetMapből…';
  try {
    const utak = await utakLekerese(p, {
      onProgress: (i, n) => ($('osm-allapot').textContent = `Lekérés… (${i}/${n})`),
    });
    S.utak = utak;
    S.felulir.clear();
    $('osm-allapot').textContent =
      `${utak.length} útszakasz adata megérkezett. Ahol mást láttál kint, ` +
      `írd át a listában — a számítás azonnal frissül.`;
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
  $('info-jog').textContent = `${JOGSZABALY.nev} — a táblázat utoljára ellenőrizve: ${JOGSZABALY.ellenorizve}.`;
  const doboz = $('info-tabla');
  doboz.innerHTML = '';
  for (const kat of KATEGORIAK) {
    const t = el('table', 'jogtabla');
    let sorok = `<caption>${kat.nev}</caption><tr><th>Túllépés</th><th>Bírság</th></tr>`;
    sorok += `<tr><td>legfeljebb ${kat.kuszob} km/h</td><td>nincs bírság</td></tr>`;
    let also = kat.kuszob;
    for (const sav of kat.savok) {
      const cimke = sav.max === Infinity ? `${also} km/h felett` : `${also + 1}–${sav.max} km/h`;
      sorok += `<tr><td>${cimke}</td><td>${fmtForint(sav.osszeg)}</td></tr>`;
      also = sav.max;
    }
    t.innerHTML = sorok;
    doboz.append(t);
  }
}

function kapukFrissit() {
  const { start, end } = S.kapuk;
  terkep?.kapukRajz(start, end, S.kapuk.sugar);
  $('kapu-allapot').textContent = !start && !end
    ? 'Nincs kijelölt szakasz — kézi indítás és leállítás.'
    : start && end
      ? `Szakasz kijelölve. Légvonalban ${fmtDistance(haversine(start, end))} — a mérés automatikusan indul és áll le.`
      : start
        ? 'A szakasz eleje kijelölve; a végét kézzel kell leállítanod.'
        : 'Csak a végpont van kijelölve — jelöld ki a szakasz elejét is, vagy indíts kézzel.';
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
  S.utak = null;
  $('osm-allapot').textContent =
    'A lekérés a nyomvonal koordinátáit elküldi az Overpass API-nak. Ez az egyetlen ' +
    'alkalom, amikor adat hagyja el a készüléket — és az sem rólad szól, hanem az útról.';
  elonezetFrissit();
}

function esemenyek() {
  $('btn-info').addEventListener('click', () => fulre('scr-info'));

  $('btn-cta').addEventListener('click', () => {
    $('mod-valaszto').hidden = false;
    $('mod-valaszto').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
  $('mod-vezetek').addEventListener('click', () => eloNezet(true));
  $('mod-kiprobalnam').addEventListener('click', () => fulre('scr-kalk'));

  $('btn-meres').addEventListener('click', () => {
    if (meres.allapot === ALLAPOT.VAR || meres.allapot === ALLAPOT.MER) meres.leallit();
    else {
      S.felulir.clear();
      meres.indit({ ...S.kapuk });
    }
  });

  $('btn-ujra').addEventListener('click', ujSzimulacio);
  $('btn-uj-szimulacio').addEventListener('click', () => {
    ujSzimulacio();
    eloNezet(false);
  });
  $('btn-reszletek').addEventListener('click', () => {
    $('szakasz-kartya').hidden = false;
    $('szakasz-kartya').scrollIntoView({ behavior: 'smooth', block: 'start' });
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
    elonezetFrissit();
  });

  $('btn-osm').addEventListener('click', osmLekeres);

  $('btn-kozepre').addEventListener('click', () => {
    terkep.kovetesVissza();
    if (meres.utolso) terkep.pozicioRajz(meres.utolso);
    else navigator.geolocation?.getCurrentPosition(
      (pos) => terkep.pozicioRajz({
        lat: pos.coords.latitude, lon: pos.coords.longitude, acc: pos.coords.accuracy,
      }),
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
  window.atlagsebesseg = { S, meres, terkep: null, eloNezet };

  ora = new Ora($('ora'));
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
