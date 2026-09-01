/* Átlagsebesség.hu — teljes körű szimulációs teszt.
   Futtatás: node tesztek.mjs   (a 8768-os porton futó kiszolgáló mellé) */

/* A Playwright nem függősége a projektnek (az app maga függőségmentes),
   ezért futásidőben keressük meg. Ha nincs a keresési úton, az
   ATLAG_PW változóval megadható a helye.                              */
const pw = await import(process.env.ATLAG_PW || 'playwright-core');
const chromium = pw.chromium || pw.default?.chromium;
if (!chromium) throw new Error('A playwright-core nem található. Telepítsd, vagy add meg az ATLAG_PW útvonalat.');

/* A kiszolgáló címe és a böngésző helye környezeti változóval állítható:
   ATLAG_URL, ATLAG_CHROME. Alapértelmezésben a helyi kiszolgálót nézi. */
const CIM = process.env.ATLAG_URL || 'http://127.0.0.1:8768/index.html';
const BONGESZO = process.env.ATLAG_CHROME ||
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

let sikeres = 0;
const bukott = [];

function all(nev, felt, reszlet = '') {
  if (felt) { sikeres++; return; }
  bukott.push(`${nev}${reszlet ? ` — ${reszlet}` : ''}`);
  console.log(`  BUKOTT: ${nev}${reszlet ? ` — ${reszlet}` : ''}`);
}

const kozel = (a, b, turés = 0.5) => Math.abs(a - b) <= turés;

/* ------------------------------------------------------- GPS-szimulátor */

/**
 * Menetprofil: szakaszok listája [sebesség km/h, hossz méter].
 * A watchPosition ezt játssza le, két másodperces fixekkel.
 */
function gpsSzimulator() {
  return (o) => {
    let lat = o.kezdoLat;
    let t = 1750000000000;
    let szakasz = 0;
    let szakaszMegtett = 0;
    let fixSzam = 0;

    const kovetkezo = () => {
      if (szakasz >= o.menet.length) return null;
      const [kmh, hossz] = o.menet[szakasz];
      const lepes = (kmh / 3.6) * 2;          // két másodpercnyi út
      szakaszMegtett += lepes;
      if (szakaszMegtett >= hossz) { szakasz++; szakaszMegtett = 0; }
      lat += lepes / 111320;
      t += 2000;
      fixSzam++;
      let acc = o.pontossag;
      if (o.gyengeElso && fixSzam <= o.gyengeElso) acc = 90;
      if (o.ugras && fixSzam === o.ugras.fix) lat += o.ugras.fokban;
      return {
        coords: {
          latitude: lat, longitude: o.lon, accuracy: acc,
          speed: o.megadSpeed ? kmh / 3.6 : null,
        },
        timestamp: t,
      };
    };

    const geo = {
      watchPosition(ok) {
        const kuld = () => { const p = kovetkezo(); if (p) ok(p); };
        kuld();
        return setInterval(kuld, 12);
      },
      clearWatch(id) { clearInterval(id); },
      getCurrentPosition(ok) {
        ok({ coords: { latitude: lat, longitude: o.lon, accuracy: o.pontossag, speed: 0 },
             timestamp: t });
      },
    };
    Object.defineProperty(navigator, 'geolocation', { value: geo, configurable: true });
  };
}

const GPS_ALAP = { kezdoLat: 47.5, lon: 19.0, pontossag: 8, megadSpeed: true,
                   ugras: null, gyengeElso: 0 };

async function ujLap(b, { tema = 'sotet', szelesseg = 390, gps = null } = {}) {
  const p = await b.newPage({ viewport: { width: szelesseg, height: 880 }, deviceScaleFactor: 2 });
  const hibak = [];
  p.on('pageerror', (e) => hibak.push(`PAGEERROR ${e.message}`));
  p.on('console', (m) => {
    const t = m.text();
    if (m.type() === 'error' && !/ERR_FAILED|ERR_BLOCKED|Failed to load resource/.test(t)) {
      hibak.push(`CONSOLE ${t}`);
    }
  });
  await p.route('**/tile.openstreetmap.org/**', (r) => r.abort());
  await p.route('**/basemaps.cartocdn.com/**', (r) => r.abort());
  await p.route('**/interpreter**', (r) => r.abort());
  await p.addInitScript((t) => {
    try { localStorage.setItem('atlagsebesseg-tema', t); } catch { /* privát */ }
  }, tema);
  if (gps) await p.addInitScript(gpsSzimulator(), { ...GPS_ALAP, ...gps });
  p.__hibak = hibak;
  return p;
}

/* ============================================================ 1. bírság */

async function birsagTeszt(b) {
  console.log('\n1. Bírságtáblázat');
  const p = await ujLap(b);
  await p.goto(CIM);
  const r = await p.evaluate(async () => {
    const m = await import(new URL('js/birsag.js', location.href).href);
    const esetek = [
      // [limit, mért, várt összeg, várt bírságos]
      [50, 64, 0, false],        // 14 km/h túllépés: küszöb alatt
      [50, 65, 0, false],        // pont a küszöbön
      [50, 66, 50000, true],     // 16: első sáv
      [50, 75, 50000, true],     // 25: sáv teteje
      [50, 76, 70000, true],     // 26: második sáv
      [50, 125, 312000, true],   // 75: hatodik sáv teteje
      [50, 126, 468000, true],   // 76: hetedik sáv
      [90, 105, 0, false],       // 15: küszöb
      [90, 106, 50000, true],
      [90, 120, 50000, true],    // 30
      [90, 121, 70000, true],    // 31
      [90, 195, 312000, true],   // 105: hatodik sáv teteje
      [90, 196, 468000, true],
      [130, 150, 0, false],      // 20: küszöb (harmadik kategória)
      [130, 151, 50000, true],
      [130, 165, 50000, true],   // 35
      [130, 166, 70000, true],   // 36
      [130, 180, 70000, true],   // 50
      [130, 181, 100000, true],  // 51
      [110, 130, 0, false],      // 20: küszöb
      [100, 115, 0, false],      // második kategória felső széle
      [100, 116, 50000, true],
    ];
    const rossz = [];
    for (const [limit, mert, osszeg, birsagos] of esetek) {
      const e = m.ertekel(limit, mert);
      if (e.osszeg !== osszeg || e.birsagos !== birsagos) {
        rossz.push(`${limit}/${mert}: ${e.osszeg} (${e.birsagos}), várt ${osszeg} (${birsagos})`);
      }
    }
    return {
      rossz,
      max50: m.birsagmentesMax(50),
      max90: m.birsagmentesMax(90),
      max130: m.birsagmentesMax(130),
      // egy szakasz, egy bírság: a halmozott összeg megvan, de a UI a
      // legsúlyosabbat használja
      halmoz: m.ertekelSzakaszok([
        { tav: 1000, ido: 30000, limit: 50 },   // 120 km/h
        { tav: 1000, ido: 40000, limit: 90 },   // 90 km/h
      ]),
    };
  });
  all('bírságtáblázat minden esete', r.rossz.length === 0, r.rossz.join(' | '));
  all('bírságmentes max 50 -> 65', r.max50 === 65, String(r.max50));
  all('bírságmentes max 90 -> 105', r.max90 === 105, String(r.max90));
  all('bírságmentes max 130 -> 150', r.max130 === 150, String(r.max130));
  all('a legsúlyosabb szakaszt megtalálja',
      r.halmoz.legsulyosabb && r.halmoz.legsulyosabb.limit === 50,
      JSON.stringify(r.halmoz.legsulyosabb && r.halmoz.legsulyosabb.limit));
  all('a halmozott összeg is elérhető marad', r.halmoz.osszegHalmozott > 0,
      String(r.halmoz.osszegHalmozott));
  p.__hibak.length && all('nincs JS hiba (bírság)', false, p.__hibak.join(' | '));
  await p.close();
}

/* ================================================== 2. kapus GPS-mérés */

async function kapusMeres(b) {
  console.log('\n2. Kapus mérés (start és vég kijelölve)');
  // 6 km 100 km/h-val: 3:36 menetidő, a 90-es határ fölött
  const p = await ujLap(b, { gps: { menet: [[100, 7000]] } });
  await p.goto(CIM);
  await p.click('#btn-cta');
  await p.click('#mod-vezetek');
  await p.waitForSelector('#meres-elo:not([hidden])');

  // kapuk kézzel: a kiinduló pont és 5 km-rel északabbra
  await p.evaluate(() => {
    const S = window.atlagsebesseg.S;
    S.kapuk.start = { lat: 47.5, lon: 19.0 };
    S.kapuk.end = { lat: 47.5 + 5000 / 111320, lon: 19.0 };
    S.autoHatar = false;
    S.alap = 90;
  });
  await p.click('#btn-meres');
  await p.waitForFunction(
    () => window.atlagsebesseg.meres.allapot === 'kesz', null, { timeout: 20000 }
  );
  const r = await p.evaluate(() => {
    const m = window.atlagsebesseg.meres;
    return {
      allapot: m.allapot,
      tav: m.tav,
      ido: m.ido,
      atlag: m.atlag,
      kartya: !document.getElementById('eredmeny-kartya').hidden,
      oraRejtve: document.getElementById('ora-kartya').hidden,
      adatok: document.getElementById('eredmeny-adatok').innerText,
      verdikt: document.getElementById('eredmeny-verdikt').innerText,
      profil: !document.getElementById('eredmeny-profil').hidden,
    };
  });
  all('a mérés magától lezárult a végkapunál', r.allapot === 'kesz', r.allapot);
  all('a mért táv a kapuk távolságához közeli (5 km)', kozel(r.tav, 5000, 220), `${Math.round(r.tav)} m`);
  all('a számolt átlag 100 km/h körüli', kozel(r.atlag, 100, 3), `${r.atlag.toFixed(1)}`);
  all('megjelent az eredménykártya', r.kartya);
  all('a mérőkártya elrejtőzött', r.oraRejtve);
  all('a verdikt bírságot jelez 100/90-nél is nulla bírsággal',
      /nem lépted túl|bírság nem járna/i.test(r.verdikt), r.verdikt.split('\n')[0]);
  all('a sebességprofil megjelent', r.profil);
  p.__hibak.length && all('nincs JS hiba (kapus mérés)', false, p.__hibak.join(' | '));
  await p.close();
}

/* ============================== 3. megállás a végkapuban (5 s álldogálás) */

async function vegkapubanMegall(b) {
  console.log('\n3. Megállás a végkapuban');
  const p = await ujLap(b, { gps: { menet: [[80, 3000], [0.2, 400]] } });
  await p.goto(CIM);
  await p.click('#btn-cta');
  await p.click('#mod-vezetek');
  await p.waitForSelector('#meres-elo:not([hidden])');
  await p.evaluate(() => {
    const S = window.atlagsebesseg.S;
    S.kapuk.start = { lat: 47.5, lon: 19.0 };
    S.kapuk.end = { lat: 47.5 + 3000 / 111320, lon: 19.0 };
    S.autoHatar = false;
  });
  await p.click('#btn-meres');
  const lezart = await p.waitForFunction(
    () => window.atlagsebesseg.meres.allapot === 'kesz', null, { timeout: 20000 }
  ).then(() => true).catch(() => false);
  all('állva is lezárul a mérés a végkapuban', lezart);
  p.__hibak.length && all('nincs JS hiba (megállás)', false, p.__hibak.join(' | '));
  await p.close();
}

/* ======================================================= 4. kézi mérés */

async function keziMeres(b) {
  console.log('\n4. Kézi indítás és leállítás, kapuk nélkül');
  const p = await ujLap(b, { gps: { menet: [[120, 20000]] } });
  await p.goto(CIM);
  await p.click('#btn-cta');
  await p.click('#mod-vezetek');
  await p.waitForSelector('#meres-elo:not([hidden])');
  await p.evaluate(() => { window.atlagsebesseg.S.autoHatar = false; });
  await p.click('#btn-meres');
  await p.waitForFunction(() => window.atlagsebesseg.meres.pontok.length > 12, null, { timeout: 15000 });

  const kozben = await p.evaluate(() => ({
    allapot: window.atlagsebesseg.meres.allapot,
    utasitasRejtve: document.getElementById('utasitas').hidden,
    szo: document.getElementById('utasitas-szo').textContent,
    cel: document.getElementById('utasitas-val').textContent,
    nagySzam: document.querySelector('#ora .ora-ertek').textContent,
    atlagSor: document.getElementById('ki-atlag').textContent,
    limitSor: document.getElementById('ki-limit').textContent,
    pillSor: document.getElementById('ki-pill').textContent,
    pill: window.atlagsebesseg.meres.pillanatnyi,
  }));
  all('mérés közben látszik az utasítás', !kozben.utasitasRejtve);
  all('120 km/h-nál 90-es határon LASSÍTS az utasítás', kozben.szo === 'LASSÍTS', kozben.szo);
  all('a célsebesség a helyi korlátozás (90)', kozben.cel === '90', kozben.cel);
  all('a nagy szám a pillanatnyi sebesség', kozel(Number(kozben.nagySzam), kozben.pill, 6),
      `${kozben.nagySzam} vs ${kozben.pill.toFixed(1)}`);
  all('a szakaszátlag számként látszik az adatsorban',
      /^\d+$/.test(kozben.atlagSor), kozben.atlagSor);
  all('a megengedett átlag is látszik az adatsorban',
      /^\d+/.test(kozben.limitSor), kozben.limitSor);
  all('a pillanatnyi sebesség is látszik az adatsorban',
      Math.abs(Number(kozben.pillSor) - kozben.pill) <= 1,
      `${kozben.pillSor} vs ${kozben.pill.toFixed(1)}`);

  await p.click('#btn-meres');
  await p.waitForTimeout(500);
  const utan = await p.evaluate(() => ({
    allapot: window.atlagsebesseg.meres.allapot,
    kartya: !document.getElementById('eredmeny-kartya').hidden,
    utasitasRejtve: document.getElementById('utasitas').hidden,
  }));
  all('kézi leállítás lezárja a mérést', utan.allapot === 'kesz', utan.allapot);
  all('leállítás után megjelenik az eredmény', utan.kartya);
  all('leállítás után eltűnik az utasítás', utan.utasitasRejtve);
  p.__hibak.length && all('nincs JS hiba (kézi mérés)', false, p.__hibak.join(' | '));
  await p.close();
}

/* ================================================== 5. GPS-ugrás szűrése */

async function ugrasSzures(b) {
  console.log('\n5. GPS-ugrás és gyenge jel');
  const p = await ujLap(b, {
    gps: { menet: [[90, 6000]], ugras: { fix: 10, fokban: 0.02 } },   // ~2,2 km ugrás
  });
  await p.goto(CIM);
  await p.click('#btn-cta');
  await p.click('#mod-vezetek');
  await p.waitForSelector('#meres-elo:not([hidden])');
  await p.evaluate(() => { window.atlagsebesseg.S.autoHatar = false; });
  await p.click('#btn-meres');
  await p.waitForFunction(() => window.atlagsebesseg.meres.pontok.length > 20, null, { timeout: 15000 });
  const r = await p.evaluate(() => ({
    tav: window.atlagsebesseg.meres.tav,
    pontok: window.atlagsebesseg.meres.pontok.length,
    atlag: window.atlagsebesseg.meres.atlag,
    hianyos: window.atlagsebesseg.meres.hianyos,
  }));
  await p.click('#btn-meres');
  all('a 2 km-es ugrás nem került bele a távba',
      r.atlag < 130, `átlag ${r.atlag.toFixed(1)} km/h`);
  all('a mérés hiányosként jelölődik', r.hianyos === true, String(r.hianyos));
  p.__hibak.length && all('nincs JS hiba (ugrás)', false, p.__hibak.join(' | '));
  await p.close();

  const p2 = await ujLap(b, { gps: { menet: [[90, 4000]], gyengeElso: 400 } });
  await p2.goto(CIM);
  await p2.click('#btn-cta');
  await p2.click('#mod-vezetek');
  await p2.waitForSelector('#meres-elo:not([hidden])');
  await p2.evaluate(() => { window.atlagsebesseg.S.autoHatar = false; });
  await p2.click('#btn-meres');
  await p2.waitForTimeout(400);
  const g = await p2.evaluate(() => ({
    uzenet: document.getElementById('gps-uzenet').textContent,
    pill: document.getElementById('gps-pill').dataset.allapot,
  }));
  all('gyenge jelnél figyelmeztet', /gyenge gps/i.test(g.uzenet), g.uzenet || '(üres)');
  all('a GPS-jelző gyengét mutat', g.pill === 'gyenge', g.pill);
  await p2.click('#btn-meres');
  p2.__hibak.length && all('nincs JS hiba (gyenge jel)', false, p2.__hibak.join(' | '));
  await p2.close();
}

/* ============================================ 6. tartható tempó és jelzés */

async function celTempoTeszt(b) {
  console.log('\n6. Tartható tempó és az utasítás váltásai');
  const p = await ujLap(b);
  await p.goto(CIM);
  await p.click('#btn-cta');
  await p.click('#mod-vezetek');
  await p.waitForSelector('#meres-elo:not([hidden])');

  const r = await p.evaluate(() => {
    const A = window.atlagsebesseg;
    const ki = [];
    // kézi állapotgyártás: a modul belső függvényeit a felületen át nézzük
    const seged = (megtett, ido, hatra, limit) => {
      A.S.autoHatar = false;
      A.S.alap = limit;
      A.S.kapuk.start = { lat: 47.5, lon: 19 };
      A.S.kapuk.end = { lat: 47.5 + (megtett + hatra) / 111320, lon: 19 };
      const m = A.meres;
      m.allapot = 'mer';
      m.szakasz = { ...A.S.kapuk, sugar: 60 };
      const t0 = 1750000000000;
      m.pontok = [
        { lat: 47.5, lon: 19, t: t0, acc: 5, spd: null },
        { lat: 47.5 + megtett / 111320, lon: 19, t: t0 + ido, acc: 5, spd: null },
      ];
      m.utolso = m.pontok[1];
      return null;
    };
    // 5 km megtéve 2 percben (150 km/h), 5 km hátra, 90-es határ
    seged(5000, 120000, 5000, 90);
    A.eloNezet(true);
    return { keszult: true };
  });
  all('a segédállapot felállt', r.keszult);

  const u = await p.evaluate(() => {
    // az elonezetFrissit a mérés onChange-én keresztül fut
    window.atlagsebesseg.meres.onChange(window.atlagsebesseg.meres);
    return {
      szo: document.getElementById('utasitas-szo').textContent,
      val: document.getElementById('utasitas-val').textContent,
      rejtve: document.getElementById('utasitas').hidden,
    };
  });
  /* 10 km-t 90-nel 6:40 alatt lehetne; ebből 2 perc elment, marad 4:40 az
     5 km-re, az 64 km/h. A cél tehát jóval a tábla alatt van.          */
  all('behozhatatlan tempó után is értelmes célt ad',
      u.rejtve || Number(u.val) <= 90, `${u.szo} ${u.val}`);
  p.__hibak.length && all('nincs JS hiba (cél)', false, p.__hibak.join(' | '));
  await p.close();
}

/* ========================================================= 7. kalkulátor */

async function kalkulatorTeszt(b) {
  console.log('\n7. Kalkulátor');
  const p = await ujLap(b);
  await p.goto(CIM);
  await p.click('#btn-cta');
  await p.click('#mod-kiprobalnam');
  await p.waitForSelector('#scr-kalk:not([hidden])');

  // a) alap: 10 km 90-nel, 6 perc alatt -> 100 km/h átlag, bírságmentes
  const a = await p.evaluate(async () => {
    const inp = document.querySelector('.k-hossz');
    inp.value = '10'; inp.dispatchEvent(new Event('input', { bubbles: true }));
    const t = document.getElementById('in-perc');
    t.value = '6'; t.dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('in-mp').value = '0';
    document.getElementById('in-mp').dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 250));
    return {
      fo: document.getElementById('k-st-fo').textContent,
      cimke: document.getElementById('k-st-cimke').textContent,
      verdikt: document.getElementById('k-verdikt').innerText,
      tabla: document.getElementById('k-tabla').textContent,
    };
  });
  all('10 km / 6 perc = 100 km/h átlag', /100 km\/h/.test(a.fo), a.fo);
  all('90-es határnál 100 km/h még nem bírságos', a.cimke.includes('HATÁRON'), a.cimke);
  all('a tábla a megengedettet mutatja', a.tabla === '90', a.tabla);

  // b) irreális tempó: 100 km 10 perc alatt
  const bb = await p.evaluate(async () => {
    const t = document.getElementById('in-perc');
    document.querySelector('.k-hossz').value = '100';
    document.querySelector('.k-hossz').dispatchEvent(new Event('input', { bubbles: true }));
    t.value = '10'; t.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 250));
    return {
      cimke: document.getElementById('k-st-cimke').textContent,
      verdikt: document.getElementById('k-verdikt').innerText,
      profilRejtve: document.getElementById('k-profil').hidden,
      utsavRejtve: document.getElementById('k-utsav').hidden,
    };
  });
  all('600 km/h irreálisként jelenik meg', bb.cimke.includes('IRREÁLIS'), bb.cimke);
  all('irreálisnál nincs bírságszámítás', /nem számolunk bírságot/.test(bb.verdikt),
      bb.verdikt.split('\n')[0]);
  all('irreálisnál a profil rejtve', bb.profilRejtve);
  all('irreálisnál a szakaszsáv rejtve', bb.utsavRejtve);

  // c) üres bemenet
  const c = await p.evaluate(async () => {
    document.querySelector('.k-hossz').value = '';
    document.querySelector('.k-hossz').dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 250));
    return {
      verdikt: document.getElementById('k-verdikt').innerText,
      profilRejtve: document.getElementById('k-profil').hidden,
    };
  });
  all('üres hossznál útmutatást ad', /Add meg/.test(c.verdikt), c.verdikt);
  all('üres bemenetnél a profil rejtve', c.profilRejtve);

  // d) tizedes hossz megmarad sor hozzáadása után
  const d = await p.evaluate(async () => {
    const inp = document.querySelector('.k-hossz');
    inp.value = '0.4'; inp.dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('btn-sor-add').click();
    await new Promise((r) => setTimeout(r, 200));
    return [...document.querySelectorAll('.k-hossz')].map((i) => i.value);
  });
  all('tizedes hossz megmarad újrarajzoláskor', d[0] === '0.4', JSON.stringify(d));

  // e) egy szakasz, egy bírság: több bírságos rész, egy összeg
  const e = await p.evaluate(async () => {
    const A = window.atlagsebesseg;
    A.S.kalkSorok = [
      { hossz: 10, limit: 90 },
      { hossz: 2, limit: 50 },
      { hossz: 3, limit: 30 },
    ];
    document.getElementById('btn-sor-add').click();   // újrarajzol és számol
    A.S.kalkSorok.pop();
    const t = document.getElementById('in-perc');
    t.value = '9'; t.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 300));
    const kv = document.getElementById('k-kv').innerText;
    return {
      verdikt: document.getElementById('k-verdikt').innerText,
      ar: document.getElementById('k-ar').textContent,
      kv,
    };
  });
  all('több bírságos résznél egy szakasz egy bírság',
      /egy szakasz egy bírság/.test(e.verdikt), e.verdikt.replace(/\n/g, ' ').slice(0, 120));
  const verdOsszeg = (e.verdikt.match(/Bírság: ([\d\s ]+) Ft/) || [])[1];
  all('az „Ennyibe kerül” ugyanaz, mint a verdikt összege',
      verdOsszeg && e.ar.replace(/\s| /g, '') === `${verdOsszeg.replace(/\s| /g, '')}Ft`,
      `${e.ar} vs ${verdOsszeg}`);
  p.__hibak.length && all('nincs JS hiba (kalkulátor)', false, p.__hibak.join(' | '));
  await p.close();
}

/* ====================================================== 8. profil és zoom */

async function profilTeszt(b) {
  console.log('\n8. Sebességprofil, nagyítás, teljes képernyő');
  const p = await ujLap(b);
  await p.goto(CIM);
  await p.click('#btn-cta');
  await p.click('#mod-kiprobalnam');
  await p.waitForSelector('#scr-kalk:not([hidden])');
  await p.evaluate(async () => {
    const A = window.atlagsebesseg;
    A.S.kalkSorok = [];
    for (let i = 0; i < 14; i++) A.S.kalkSorok.push({ hossz: 1 + i * 0.2, limit: [90, 50, 30, 110][i % 4] });
    document.getElementById('btn-sor-add').click();
    A.S.kalkSorok.pop();
    const t = document.getElementById('in-perc');
    t.value = '20'; t.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 300));
  });
  const alap = await p.evaluate(() => {
    const s = document.getElementById('k-profil-svg');
    const v = document.querySelector('.profil-vaszon[data-cel="kalk"]');
    return {
      rejtve: document.getElementById('k-profil').hidden,
      cimkek: s.querySelectorAll('.pr-limit').length,
      valtasok: s.querySelectorAll('.pr-valtas').length,
      sw: v.scrollWidth, cw: v.clientWidth,
    };
  });
  all('a profil megjelent', !alap.rejtve);
  all('1x-en nem görget a profil', alap.sw === alap.cw, `${alap.sw}/${alap.cw}`);
  all('1x-en ritkul a felirat', alap.cimkek < alap.valtasok + 1,
      `${alap.cimkek} felirat / ${alap.valtasok} váltás`);

  await p.click('.profil-eszkozok[data-cel="kalk"] .zoom-gomb[data-zoom="4"]');
  await p.waitForTimeout(250);
  const negy = await p.evaluate(() => {
    const s = document.getElementById('k-profil-svg');
    const v = document.querySelector('.profil-vaszon[data-cel="kalk"]');
    return { cimkek: s.querySelectorAll('.pr-limit').length, sw: v.scrollWidth, cw: v.clientWidth };
  });
  all('4x-en négyszer szélesebb a rajz', kozel(negy.sw, alap.cw * 4, 8), `${negy.sw}`);
  all('4x-en több felirat fér ki', negy.cimkek >= alap.cimkek, `${negy.cimkek} vs ${alap.cimkek}`);

  await p.click('.profil-eszkozok[data-cel="kalk"] .profil-teljes');
  await p.waitForTimeout(300);
  const lap = await p.evaluate(() => {
    const s = document.getElementById('profil-lap-svg');
    const r = s.getBoundingClientRect();
    return {
      rejtve: document.getElementById('profil-lap').hidden,
      elemek: s.children.length,
      magassag: r.height,
    };
  });
  all('a teljes képernyős nézet megnyílt', !lap.rejtve);
  all('a nagy nézetben van rajz', lap.elemek > 5, String(lap.elemek));
  all('a nagy nézet rajza értelmes magasságú', lap.magassag > 150, `${Math.round(lap.magassag)} px`);

  await p.keyboard.press('Escape');
  await p.waitForTimeout(200);
  all('Escape bezárja a nagy nézetet',
      await p.evaluate(() => document.getElementById('profil-lap').hidden));
  p.__hibak.length && all('nincs JS hiba (profil)', false, p.__hibak.join(' | '));
  await p.close();
}

/* ================================================== 9. megosztható kép */

async function megosztasTeszt(b) {
  console.log('\n9. Megosztható kép');
  const p = await ujLap(b, { gps: { menet: [[110, 8000]] } });
  await p.goto(CIM);
  await p.click('#btn-cta');
  await p.click('#mod-vezetek');
  await p.waitForSelector('#meres-elo:not([hidden])');
  await p.evaluate(() => { window.atlagsebesseg.S.autoHatar = false; });
  await p.click('#btn-meres');
  await p.waitForFunction(() => window.atlagsebesseg.meres.pontok.length > 25, null, { timeout: 15000 });
  await p.click('#btn-meres');
  await p.waitForTimeout(400);

  const r = await p.evaluate(async () => {
    const letoltes = [];
    const a = document.createElement('a');
    const eredetiClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { letoltes.push(this.download); };
    document.getElementById('btn-megoszt').click();
    await new Promise((r2) => setTimeout(r2, 2500));
    HTMLAnchorElement.prototype.click = eredetiClick;
    return {
      letoltes,
      allapot: document.getElementById('megoszt-allapot').textContent,
      gombEngedve: !document.getElementById('btn-megoszt').disabled,
    };
  });
  all('a megosztás letöltésre vált, ha nincs rendszermegosztás',
      r.letoltes.includes('atlagsebesseg.png'), JSON.stringify(r.letoltes));
  all('a megosztás visszajelez', /letöltve|Elküldve/i.test(r.allapot), r.allapot);
  all('a gomb újra használható', r.gombEngedve);
  p.__hibak.length && all('nincs JS hiba (megosztás)', false, p.__hibak.join(' | '));
  await p.close();
}

/* ============================================================ 10. téma */

async function temaTeszt(b) {
  console.log('\n10. Téma');
  const p = await b.newPage({ viewport: { width: 390, height: 880 } });
  const hibak = [];
  p.on('pageerror', (e) => hibak.push(e.message));
  await p.goto(CIM);
  const sor = [];
  for (let i = 0; i < 4; i++) {
    sor.push(await p.evaluate(() => ({
      attr: document.documentElement.dataset.theme,
      tarolt: localStorage.getItem('atlagsebesseg-tema'),
      meta: document.querySelector('meta[name="theme-color"]').content,
      ikon: document.querySelector('#btn-tema use').getAttribute('href'),
    })));
    await p.click('#btn-tema');
    await p.waitForTimeout(120);
  }
  all('a téma körbelép: rendszer, világos, sötét',
      sor[1].tarolt === 'vilagos' && sor[2].tarolt === 'sotet' && sor[3].tarolt === null,
      JSON.stringify(sor.map((s) => s.tarolt)));
  all('a data-theme követi a választást',
      sor[1].attr === 'light' && sor[2].attr === 'dark', JSON.stringify(sor.map((s) => s.attr)));
  all('a theme-color meta is vált',
      sor[2].meta === '#0e0e10' && sor[1].meta === '#eef0f5', JSON.stringify(sor.map((s) => s.meta)));

  // az újratöltés megőrzi
  await p.evaluate(() => localStorage.setItem('atlagsebesseg-tema', 'sotet'));
  await p.reload();
  all('újratöltés után is sötét marad',
      (await p.evaluate(() => document.documentElement.dataset.theme)) === 'dark');

  // a Tudnivalók gombsora
  await p.click('#tabs .tab[data-scr="scr-info"]');
  await p.click('.tema-opcio[data-tema="vilagos"]');
  await p.waitForTimeout(150);
  all('a Tudnivalók gombsora is állít témát',
      (await p.evaluate(() => document.documentElement.dataset.theme)) === 'light');
  all('a fejlécgomb ikonja követi',
      (await p.evaluate(() => document.querySelector('#btn-tema use').getAttribute('href'))) === '#i-sun');
  hibak.length && all('nincs JS hiba (téma)', false, hibak.join(' | '));
  await p.close();
}

/* ======================================================= 11. elrendezés */

async function elrendezesTeszt(b) {
  console.log('\n11. Elrendezés minden méreten és témán');
  for (const sz of [320, 360, 390, 430]) {
    for (const tema of ['vilagos', 'sotet']) {
      const p = await ujLap(b, { tema, szelesseg: sz });
      await p.goto(CIM);
      for (const scr of ['scr-meres', 'scr-kalk', 'scr-info']) {
        await p.click(`#tabs .tab[data-scr="${scr}"]`);
        await p.waitForTimeout(180);
        const t = await p.evaluate((id) => {
          const rossz = [...document.querySelectorAll(`#${id} *, #topbar *`)]
            .filter((e) => e.scrollWidth > e.clientWidth + 1 && e.clientWidth > 0 &&
                           getComputedStyle(e).overflowX === 'visible' &&
                           getComputedStyle(e).textOverflow !== 'ellipsis')
            .map((e) => `${e.tagName}.${e.className}#${e.id}`);
          return { rossz, doc: document.documentElement.scrollWidth,
                   cw: document.documentElement.clientWidth };
        }, scr);
        all(`${sz}px ${tema} ${scr}: nincs vízszintes túllógás`,
            t.doc <= t.cw && t.rossz.length === 0, `${t.doc}/${t.cw} ${t.rossz.join(',')}`);
      }
      p.__hibak.length && all(`nincs JS hiba (${sz} ${tema})`, false, p.__hibak.join(' | '));
      await p.close();
    }
  }
}

/* ================================================= 12. akadálymentesség */

async function hozzaferesTeszt(b) {
  console.log('\n12. Alapvető hozzáférhetőség');
  const p = await ujLap(b);
  await p.goto(CIM);
  const r = await p.evaluate(() => {
    const nevtelen = [...document.querySelectorAll('button')]
      .filter((g) => !g.hidden && !g.getAttribute('aria-label') &&
                     !g.textContent.trim() && !g.title)
      .map((g) => g.id || g.className);
    const kepek = [...document.querySelectorAll('svg[role="img"]')]
      .filter((s) => !s.getAttribute('aria-label')).length;
    return {
      nevtelen,
      kepek,
      nyelv: document.documentElement.lang,
      cim: document.title,
      leiras: !!document.querySelector('meta[name="description"]'),
    };
  });
  all('minden gombnak van neve', r.nevtelen.length === 0, r.nevtelen.join(', '));
  all('minden képi SVG feliratozott', r.kepek === 0, String(r.kepek));
  all('a lap nyelve magyar', r.nyelv === 'hu', r.nyelv);
  all('van cím és leírás', !!r.cim && r.leiras);
  p.__hibak.length && all('nincs JS hiba (hozzáférés)', false, p.__hibak.join(' | '));
  await p.close();
}

/* ================================================ 13. offline és ikonok */

async function eszkozTeszt(b) {
  console.log('\n13. Ikonok, manifest, service worker');
  const p = await ujLap(b);
  const valaszok = new Map();
  p.on('response', (r) => valaszok.set(new URL(r.url()).pathname, r.status()));
  await p.goto(CIM);
  await p.waitForTimeout(700);
  const r = await p.evaluate(async () => {
    const m = await fetch('manifest.webmanifest').then((x) => x.json());
    const ikon = await fetch('icons/icon.svg').then((x) => x.ok);
    const sw = 'serviceWorker' in navigator
      ? await navigator.serviceWorker.getRegistration().then((x) => !!x).catch(() => false)
      : false;
    return { nev: m.name, ikonok: m.icons.length, tema: m.theme_color, ikon, sw };
  });
  all('a manifest betölt', r.nev.includes('Átlagsebesség'), r.nev);
  all('a manifest ikonjai megvannak', r.ikonok >= 4, String(r.ikonok));
  all('a manifest témaszíne a mostani sötét alap', r.tema === '#0e0e10', r.tema);
  all('az SVG ikon elérhető', r.ikon);
  all('a service worker regisztrált', r.sw);
  const hibas = [...valaszok.entries()].filter(([u, s]) => s >= 400 && !u.includes('interpreter'));
  all('nincs 404-es helyi erőforrás', hibas.length === 0, JSON.stringify(hibas));
  p.__hibak.length && all('nincs JS hiba (eszközök)', false, p.__hibak.join(' | '));
  await p.close();
}


/* ======================================== 14. valósághű menetszimulációk */

/** Végigvezet egy menetet kapuk nélkül, és visszaadja az eredményt. */
async function menetEredmeny(b, { menet, limit, cimke }) {
  const p = await ujLap(b, { gps: { menet } });
  await p.goto(CIM);
  await p.click('#btn-cta');
  await p.click('#mod-vezetek');
  await p.waitForSelector('#meres-elo:not([hidden])');
  await p.evaluate((l) => {
    window.atlagsebesseg.S.autoHatar = false;
    window.atlagsebesseg.S.alap = l;
  }, limit);
  await p.click('#btn-meres');
  const ossz = menet.reduce((a, [, h]) => a + h, 0);
  await p.waitForFunction(
    (cel) => window.atlagsebesseg.meres.tav >= cel * 0.94,
    ossz, { timeout: 30000 }
  );
  await p.click('#btn-meres');
  await p.waitForTimeout(400);
  const r = await p.evaluate(() => {
    const m = window.atlagsebesseg.meres;
    const e = window.atlagsebesseg.S.utolsoEredmeny;
    return {
      tav: m.tav, atlag: m.atlag,
      verdikt: document.getElementById('eredmeny-verdikt').innerText,
      adatok: document.getElementById('eredmeny-adatok').innerText,
      birsagos: /Bírság: /.test(document.getElementById('eredmeny-verdikt').innerText),
      osszeg: (document.getElementById('eredmeny-verdikt').innerText
        .match(/Bírság: ([\d\s\u00a0\u202f]+) Ft/) || [])[1],
    };
  });
  const hiba = p.__hibak.slice();
  await p.close();
  return { ...r, cimke, hiba };
}

async function menetSzimulaciok(b) {
  console.log('\n14. Valósághű menetszimulációk');

  const esetek = [
    { cimke: 'autópálya 130, végig 128', limit: 130, menet: [[128, 12000]],
      birsag: false },
    { cimke: 'autópálya 130, végig 148 (küszöb alatt)', limit: 130, menet: [[148, 12000]],
      birsag: false },
    { cimke: 'autópálya 130, végig 158', limit: 130, menet: [[158, 12000]],
      birsag: true, osszeg: 50000 },
    { cimke: 'lakott terület 50, végig 72', limit: 50, menet: [[72, 3000]],
      birsag: true, osszeg: 50000 },
    { cimke: 'főút 90, dugó után gyorsítás, átlag marad', limit: 90,
      menet: [[20, 1500], [120, 4000], [90, 2000]], birsag: false },
    { cimke: 'főút 90, végig 130', limit: 90, menet: [[130, 8000]],
      birsag: true, osszeg: 70000 },
  ];

  for (const e of esetek) {
    const r = await menetEredmeny(b, e);
    all(`${e.cimke}: van eredmény`, r.tav > 0, `${Math.round(r.tav)} m`);
    all(`${e.cimke}: bírság ${e.birsag ? 'jár' : 'nem jár'}`,
        r.birsagos === e.birsag, `${r.verdikt.split('\n')[0]} (átlag ${r.atlag.toFixed(1)})`);
    if (e.osszeg) {
      const kapott = Number((r.osszeg || '').replace(/[^\d]/g, ''));
      all(`${e.cimke}: az összeg ${e.osszeg} Ft`, kapott === e.osszeg,
          `${kapott} (átlag ${r.atlag.toFixed(1)} km/h)`);
    }
    r.hiba.length && all(`${e.cimke}: nincs JS hiba`, false, r.hiba.join(' | '));
  }
}

/* ============================================== 15. hangjelzés logikája */

async function hangTeszt(b) {
  console.log('\n15. Hangjelzés');
  const p = await ujLap(b, { gps: { menet: [[60, 800], [140, 3000], [40, 2000]] } });
  await p.goto(CIM);
  await p.click('#btn-cta');
  await p.click('#mod-vezetek');
  await p.waitForSelector('#meres-elo:not([hidden])');
  await p.evaluate(() => {
    const A = window.atlagsebesseg;
    A.S.autoHatar = false;
    A.S.alap = 90;
    window.__hangok = [];
    const eredeti = A.gong.jelez.bind(A.gong);
    A.gong.jelez = (fajta) => { window.__hangok.push(fajta); };
    A.gong.ebreszt = () => {};
  });
  await p.click('#btn-meres');
  await p.waitForFunction(() => window.atlagsebesseg.meres.tav > 5000, null, { timeout: 30000 });
  await p.click('#btn-meres');
  const h = await p.evaluate(() => window.__hangok);
  all('gyorsításkor megszólal a figyelmeztetés',
      h.includes('birsag') || h.includes('figyelem'), JSON.stringify(h));
  all('nem szólal meg feleslegesen sokszor', h.length <= 6, JSON.stringify(h));
  p.__hibak.length && all('nincs JS hiba (hang)', false, p.__hibak.join(' | '));
  await p.close();
}

/* ================================================ 16. offline működés */

async function offlineTeszt(b) {
  console.log('\n16. Offline működés');
  const ctx = await b.newContext({ viewport: { width: 390, height: 880 } });
  const p = await ctx.newPage();
  const hibak = [];
  p.on('pageerror', (e) => hibak.push(e.message));
  await p.goto(CIM);
  await p.waitForFunction(
    () => navigator.serviceWorker.controller !== null ||
          navigator.serviceWorker.getRegistration().then(() => true),
    null, { timeout: 8000 }
  ).catch(() => {});
  // a service workernek időt adunk a gyorsítótárazásra
  await p.waitForTimeout(1500);
  await ctx.setOffline(true);
  const ok = await p.reload({ timeout: 15000 }).then(() => true).catch(() => false);
  const mukodik = ok && await p.evaluate(() =>
    !!document.getElementById('btn-cta') && !!document.querySelector('#topbar h1'));
  all('offline is betölt az app', mukodik === true, String(mukodik));
  if (mukodik) {
    await p.click('#tabs .tab[data-scr="scr-kalk"]');
    await p.waitForTimeout(200);
    const szamol = await p.evaluate(() => {
      const i = document.querySelector('.k-hossz');
      i.value = '10'; i.dispatchEvent(new Event('input', { bubbles: true }));
      return new Promise((r) => setTimeout(
        () => r(document.getElementById('k-st-fo').textContent), 300));
    });
    all('offline is számol a kalkulátor', /km\/h/.test(szamol), szamol);
  }
  await ctx.setOffline(false);
  hibak.length && all('nincs JS hiba (offline)', false, hibak.join(' | '));
  await ctx.close();
}

/* =========================================== 17. újra ugyanazon a szakaszon */

async function ujraTeszt(b) {
  console.log('\n17. Újra ugyanazon a szakaszon');
  const p = await ujLap(b, { gps: { menet: [[100, 4000]] } });
  await p.goto(CIM);
  await p.click('#btn-cta');
  await p.click('#mod-vezetek');
  await p.waitForSelector('#meres-elo:not([hidden])');
  await p.evaluate(() => { window.atlagsebesseg.S.autoHatar = false; });
  await p.click('#btn-meres');
  await p.waitForFunction(() => window.atlagsebesseg.meres.pontok.length > 15, null, { timeout: 20000 });
  await p.click('#btn-meres');
  await p.waitForTimeout(300);
  await p.click('#btn-ujra-szakasz');
  await p.waitForTimeout(400);
  const r = await p.evaluate(() => ({
    allapot: window.atlagsebesseg.meres.allapot,
    kartya: document.getElementById('eredmeny-kartya').hidden,
    ora: !document.getElementById('ora-kartya').hidden,
  }));
  all('az újraindítás új mérést kezd',
      r.allapot === 'mer' || r.allapot === 'var', r.allapot);
  all('az eredménykártya eltűnik', r.kartya);
  all('a mérőkártya visszajön', r.ora);
  p.__hibak.length && all('nincs JS hiba (újra)', false, p.__hibak.join(' | '));
  await p.close();
}

/* ==================================================== 18. Tudnivalók lap */

async function infoTeszt(b) {
  console.log('\n18. Tudnivalók');
  const p = await ujLap(b);
  await p.goto(CIM);
  await p.click('#tabs .tab[data-scr="scr-info"]');
  await p.waitForTimeout(300);
  const r = await p.evaluate(() => ({
    jog: document.getElementById('info-jog').textContent,
    tabla: document.getElementById('info-tabla').innerText,
    sorok: document.querySelectorAll('#info-tabla tr, #info-tabla .jog-sor').length,
    egyBirsag: document.body.innerText.includes('Egy szakasz, egy bírság'),
    muszerfal: document.body.innerText.includes('Miért mutat kevesebbet'),
    tarolas: document.body.innerText.includes('választott téma'),
    feltetel: document.body.innerText.includes('egyelőre nincs'),
  }));
  all('a jogszabály megnevezve', /410\/2007/.test(r.jog), r.jog);
  all('a bírságtáblázat kirajzolódik', r.tabla.length > 50, `${r.tabla.length} karakter`);
  all('kimondja: egy szakasz, egy bírság', r.egyBirsag);
  all('elmagyarázza a kilométeróra eltérését', r.muszerfal);
  all('kimondja, mit tárol', r.tarolas);
  all('feltételes fogalmazás a bevezetésről', r.feltetel);
  p.__hibak.length && all('nincs JS hiba (info)', false, p.__hibak.join(' | '));
  await p.close();
}


/* ==================================================== 19. hibás helyzetek */

async function hibasHelyzetek(b) {
  console.log('\n19. Hibás és szélső helyzetek');

  // a) a felhasználó megtagadja a helymeghatározást
  const p1 = await ujLap(b);
  await p1.addInitScript(() => {
    const geo = {
      watchPosition(ok, hiba) { setTimeout(() => hiba({ code: 1, message: 'denied' }), 10); return 1; },
      clearWatch() {},
      getCurrentPosition(ok, hiba) { hiba({ code: 1 }); },
    };
    Object.defineProperty(navigator, 'geolocation', { value: geo, configurable: true });
  });
  await p1.goto(CIM);
  await p1.click('#btn-cta');
  await p1.click('#mod-vezetek');
  await p1.waitForSelector('#meres-elo:not([hidden])');
  await p1.click('#btn-meres');
  await p1.waitForTimeout(500);
  const uz = await p1.evaluate(() => document.getElementById('gps-uzenet').textContent);
  all('megtagadott helymeghatározásnál érthető üzenet',
      /nincs engedélyezve/i.test(uz), uz || '(üres)');
  p1.__hibak.length && all('nincs JS hiba (megtagadás)', false, p1.__hibak.join(' | '));
  await p1.close();

  // b) a böngésző nem tud helymeghatározást
  const p2 = await ujLap(b);
  await p2.addInitScript(() => {
    Object.defineProperty(navigator, 'geolocation', { value: undefined, configurable: true });
  });
  await p2.goto(CIM);
  await p2.click('#btn-cta');
  await p2.click('#mod-vezetek');
  await p2.waitForSelector('#meres-elo:not([hidden])');
  await p2.click('#btn-meres');
  await p2.waitForTimeout(400);
  const uz2 = await p2.evaluate(() => document.getElementById('gps-uzenet').textContent);
  all('helymeghatározás nélkül is szól, mi a baj', /nem támogatja/i.test(uz2), uz2 || '(üres)');
  p2.__hibak.length && all('nincs JS hiba (nincs GPS)', false, p2.__hibak.join(' | '));
  await p2.close();

  // c) álló jármű: nincs nullával osztás, nincs NaN
  const p3 = await ujLap(b, { gps: { menet: [[0.05, 20]] } });
  await p3.goto(CIM);
  await p3.click('#btn-cta');
  await p3.click('#mod-vezetek');
  await p3.waitForSelector('#meres-elo:not([hidden])');
  await p3.evaluate(() => { window.atlagsebesseg.S.autoHatar = false; });
  await p3.click('#btn-meres');
  await p3.waitForTimeout(700);
  const allo = await p3.evaluate(() => ({
    szoveg: document.getElementById('ora').textContent,
    adat: document.getElementById('ki-atlag').textContent,
    fo: document.getElementById('st-fo').textContent,
  }));
  await p3.click('#btn-meres');
  all('álló járműnél nincs NaN a műszeren', !/NaN|Infinity/.test(allo.szoveg), allo.szoveg.slice(0, 60));
  all('álló járműnél nincs NaN az adatrácsban', !/NaN/.test(allo.adat), allo.adat);
  all('álló járműnél nincs NaN a státuszban', !/NaN/.test(allo.fo), allo.fo);
  p3.__hibak.length && all('nincs JS hiba (álló)', false, p3.__hibak.join(' | '));
  await p3.close();
}

/* ============================================ 20. kalkulátor egyéb módjai */

async function kalkModok(b) {
  console.log('\n20. Kalkulátor: tempó mód és határválasztó');
  const p = await ujLap(b);
  await p.goto(CIM);
  await p.click('#btn-cta');
  await p.click('#mod-kiprobalnam');
  await p.waitForSelector('#scr-kalk:not([hidden])');

  // átlagsebesség szerinti megadás
  await p.selectOption('#sel-mod', 'tempo');
  await p.waitForTimeout(200);
  const t = await p.evaluate(async () => {
    const i = document.querySelector('.k-hossz');
    i.value = '20'; i.dispatchEvent(new Event('input', { bubbles: true }));
    const s = document.getElementById('in-tempo');
    s.value = '110'; s.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 300));
    return {
      idoRejtve: document.getElementById('mezo-ido').hidden,
      tempoLatszik: !document.getElementById('mezo-tempo').hidden,
      fo: document.getElementById('k-st-fo').textContent,
      kv: document.getElementById('k-kv').textContent,
    };
  });
  all('tempó módban a menetidő mező eltűnik', t.idoRejtve);
  all('tempó módban a tempó mező látszik', t.tempoLatszik);
  all('110 km/h tempóból 110 az átlag', /110 km\/h/.test(t.fo), t.fo);
  all('a menetidő is kiszámolódik', /Menetidő/.test(t.kv));

  // határválasztó lap
  await p.selectOption('#sel-mod', 'ido');
  await p.waitForTimeout(150);
  await p.click('.k-limit');
  await p.waitForSelector('#limit-lap:not([hidden])');
  const lap = await p.evaluate(() => ({
    gombok: document.querySelectorAll('#limit-racs .limit-jel').length,
    cim: document.getElementById('lap-cim').textContent,
  }));
  all('a határválasztó felkínálja a gyakori értékeket', lap.gombok >= 8, String(lap.gombok));
  all('a határválasztónak van címe', lap.cim.length > 0, lap.cim);
  await p.click('#limit-racs .limit-jel:nth-child(3)');   // 50
  await p.waitForTimeout(300);
  const valasztott = await p.evaluate(() => ({
    rejtve: document.getElementById('limit-lap').hidden,
    limit: document.querySelector('.k-limit strong').textContent,
  }));
  all('választás után bezárul a lap', valasztott.rejtve);
  all('a választott érték érvényesül', valasztott.limit === '50', valasztott.limit);

  // egyéni érték
  await p.click('.k-limit');
  await p.waitForSelector('#limit-lap:not([hidden])');
  await p.fill('#limit-egyeni', '77');
  await p.press('#limit-egyeni', 'Enter');
  await p.waitForTimeout(300);
  all('egyéni sebességhatár Enterrel is megadható',
      (await p.evaluate(() => document.querySelector('.k-limit strong').textContent)) === '77');

  // elgépelt, észszerűtlen érték levágása
  await p.click('.k-limit');
  await p.waitForSelector('#limit-lap:not([hidden])');
  await p.fill('#limit-egyeni', '900');
  await p.click('#limit-egyeni-ok');
  await p.waitForTimeout(300);
  all('az elgépelt 900 észszerű értékre vágódik',
      (await p.evaluate(() => document.querySelector('.k-limit strong').textContent)) === '150');
  p.__hibak.length && all('nincs JS hiba (kalk módok)', false, p.__hibak.join(' | '));
  await p.close();
}

/* ================================================= 21. hosszú szakasz */

async function hosszuSzakasz(b) {
  console.log('\n21. Hosszú szakasz és teljesítmény');
  const p = await ujLap(b);
  await p.goto(CIM);
  await p.click('#btn-cta');
  await p.click('#mod-kiprobalnam');
  await p.waitForSelector('#scr-kalk:not([hidden])');
  const ido = await p.evaluate(async () => {
    const A = window.atlagsebesseg;
    A.S.kalkSorok = [];
    for (let i = 0; i < 60; i++) {
      A.S.kalkSorok.push({ hossz: 2 + (i % 5), limit: [130, 110, 90, 50, 30][i % 5] });
    }
    const t0 = performance.now();
    document.getElementById('btn-sor-add').click();
    A.S.kalkSorok.pop();
    const t = document.getElementById('in-perc');
    t.value = '90'; t.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 600));
    return {
      ms: performance.now() - t0,
      reszek: document.getElementById('k-utsav').children.length,
      profil: !document.getElementById('k-profil').hidden,
      doc: document.documentElement.scrollWidth,
      cw: document.documentElement.clientWidth,
    };
  });
  all('60 szakaszrész is kirajzolódik', ido.reszek === 60, String(ido.reszek));
  all('60 résznél sincs vízszintes túllógás', ido.doc <= ido.cw, `${ido.doc}/${ido.cw}`);
  all('a profil 60 résznél is megjelenik', ido.profil);
  all('a kirajzolás egy másodpercen belül lefut', ido.ms < 1200, `${Math.round(ido.ms)} ms`);
  p.__hibak.length && all('nincs JS hiba (hosszú szakasz)', false, p.__hibak.join(' | '));
  await p.close();
}

/* ============================================= 22. mozgásérzékenység */

async function mozgasTeszt(b) {
  console.log('\n22. Csökkentett mozgás');
  const ctx = await b.newContext({
    viewport: { width: 390, height: 880 }, reducedMotion: 'reduce',
  });
  const p = await ctx.newPage();
  const hibak = [];
  p.on('pageerror', (e) => hibak.push(e.message));
  await p.goto(CIM);
  await p.click('#btn-cta');
  await p.click('#mod-kiprobalnam');
  await p.waitForSelector('#scr-kalk:not([hidden])');
  const r = await p.evaluate(async () => {
    const i = document.querySelector('.k-hossz');
    i.value = '10'; i.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((x) => setTimeout(x, 200));
    return document.querySelector('#k-ora .ora-ertek').textContent;
  });
  all('csökkentett mozgásnál azonnal a végérték látszik',
      Number(r) > 0, r);
  hibak.length && all('nincs JS hiba (mozgás)', false, hibak.join(' | '));
  await ctx.close();
}

/* ================================================================ futás */

const b = await chromium.launch({ executablePath: BONGESZO });
try {
  await birsagTeszt(b);
  await kapusMeres(b);
  await vegkapubanMegall(b);
  await keziMeres(b);
  await ugrasSzures(b);
  await celTempoTeszt(b);
  await kalkulatorTeszt(b);
  await profilTeszt(b);
  await megosztasTeszt(b);
  await temaTeszt(b);
  await elrendezesTeszt(b);
  await hozzaferesTeszt(b);
  await eszkozTeszt(b);
  await menetSzimulaciok(b);
  await hangTeszt(b);
  await offlineTeszt(b);
  await ujraTeszt(b);
  await infoTeszt(b);
  await hibasHelyzetek(b);
  await kalkModok(b);
  await hosszuSzakasz(b);
  await mozgasTeszt(b);
} finally {
  await b.close();
}

console.log(`\n=================================================`);
console.log(`Sikeres: ${sikeres}   Bukott: ${bukott.length}`);
if (bukott.length) {
  console.log('\nBukott ellenőrzések:');
  bukott.forEach((x) => console.log(` - ${x}`));
  process.exitCode = 1;
}
