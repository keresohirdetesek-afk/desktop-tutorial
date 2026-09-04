/* Megosztható eredménykép.

   A képet a böngésző rajzolja vászonra, a készüléken: semmilyen adat nem
   megy szerverre, és nincs hozzá külső szolgáltatás. Ez a megosztás az
   egyetlen módja annak, hogy az eredmény kikerüljön a telefonról, és azt
   is a felhasználó indítja.

   Álló képarány: ez fér el a legtöbb közösségi felületen levágás nélkül.
   A sebességprofil is rákerül, mert a képen az a legbeszédesebb rész:
   egyetlen számnál sokkal többet mond, hogy hol keletkezett az átlag.  */

import { profilVaszonra } from './profil.js';

const SZ = 1080;
const PROFIL_MA = 300;      // a grafikon sávjának magassága
const MA_ALAP = 1230;

const SZIN = {
  hatter: '#0e0e10',
  kartya: '#17171a',
  keret: '#2c2c33',
  szoveg: '#f2f3f5',
  halvany: '#9a9aa4',
  narancs: '#ff6a1f',
  marka: '#e8332a',
  ok: '#35c46a',
  hatar: '#ffb020',
  birsag: '#ff4d43',
};

const ALLAPOT_SZIN = { ok: SZIN.ok, hatar: SZIN.hatar, birsag: SZIN.birsag, semleges: SZIN.halvany };

/* A jelkép vászonra: ugyanaz a rajz, mint a fejlécben, csak kézzel
   megrajzolva. A képet a böngésző készíti, ide nem tölthetünk be SVG-t
   anélkül, hogy a vászon idegen tartalommal szennyeződne.            */
function jelkepVaszonra(c, x, y, meret) {
  // ugyanaz a kivágat, mint a fejlécben: viewBox 60 118 392 344
  const k = meret / 392;
  const p = (vx, vy) => [x + (vx - 60) * k, y + (vy - 118) * k];

  c.save();
  // út: lent széles, a horizont felé elkeskenyedő sáv
  c.beginPath();
  c.moveTo(...p(78, 452));
  c.bezierCurveTo(...p(140, 392), ...p(250, 330), ...p(322, 266));
  c.lineTo(...p(348, 266));
  c.bezierCurveTo(...p(392, 330), ...p(430, 392), ...p(428, 452));
  c.closePath();
  c.fillStyle = SZIN.szoveg;
  c.fill();

  // felezővonal
  c.fillStyle = SZIN.hatter;
  for (const cs of [
    [[331.0, 272], [335.4, 272], [329.0, 296], [323.1, 296]],
    [[318.5, 310], [325.3, 310], [313.9, 340], [305.1, 340]],
    [[297.8, 356], [307.6, 356], [295.0, 392], [282.8, 392]],
    [[269.0, 410], [282.3, 410], [261.0, 452], [245.0, 452]],
  ]) {
    c.beginPath();
    cs.forEach((pt, i) => (i ? c.lineTo(...p(...pt)) : c.moveTo(...p(...pt))));
    c.closePath();
    c.fill();
  }

  // a két végpontot összekötő ív: bal fele tömör piros, jobb fele szaggatott
  c.lineWidth = 26 * k;
  c.beginPath();
  c.arc(...p(255, 301.5), 161 * k, -2.868, -1.6755);
  c.strokeStyle = SZIN.marka;
  c.lineCap = 'round';
  c.stroke();

  c.beginPath();
  c.arc(...p(255, 301.5), 161 * k, -1.466, -0.274);
  c.strokeStyle = SZIN.szoveg;
  c.lineCap = 'butt';
  c.setLineDash([30 * k, 20 * k]);
  c.stroke();
  c.setLineDash([]);

  // helyjelölő tűk: a szakasz eleje és vége
  c.fillStyle = SZIN.marka;
  for (const cx of [110, 400]) {
    // csepp: a körhöz érintőlegesen futnak le az oldalak a csúcsig
    c.beginPath();
    c.arc(...p(cx, 292), 42 * k, 2.729, 6.695);
    c.lineTo(...p(cx, 397));
    c.closePath();
    c.fill();
  }
  c.restore();
}

function kerekDoboz(c, x, y, sz, ma, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + sz, y, x + sz, y + ma, r);
  c.arcTo(x + sz, y + ma, x, y + ma, r);
  c.arcTo(x, y + ma, x, y, r);
  c.arcTo(x, y, x + sz, y, r);
  c.closePath();
}

/**
 * @param {{atlag:string, megengedett:string, tav:string, ido:string,
 *          allapot:string, verdikt:string, szakaszok:Array<{limit:number,
 *          tav:number, allapot:string}>, profil?:Array, osszTav?:number}} adat
 * @returns {Promise<Blob>}
 */
export async function keszitKep(adat) {
  // a saját betűtípus csak akkor kerül a vászonra, ha már betöltött
  try { await document.fonts.ready; } catch { /* nem kritikus */ }

  const vanProfil = !!(adat.profil && adat.profil.length > 1);
  const ELTOLAS = vanProfil ? PROFIL_MA + 120 : 0;
  const MA = MA_ALAP + ELTOLAS;

  const v = document.createElement('canvas');
  v.width = SZ;
  v.height = MA;
  const c = v.getContext('2d');
  const mono = "'Muszer', ui-monospace, monospace";
  const sans = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

  c.fillStyle = SZIN.hatter;
  c.fillRect(0, 0, SZ, MA);

  // fejléc: jelkép és szóvédjegy
  jelkepVaszonra(c, 74, 36, 96);
  c.fillStyle = SZIN.marka;
  c.font = `italic 800 44px ${sans}`;
  c.textAlign = 'left';
  c.fillText('átlag', 190, 112);
  c.fillStyle = SZIN.szoveg;
  c.fillText('sebesség.hu', 190 + c.measureText('átlag').width, 112);

  if (adat.szakaszNev) {
    c.fillStyle = SZIN.halvany;
    c.font = `400 30px ${sans}`;
    c.textAlign = 'right';
    c.fillText(adat.szakaszNev, SZ - 80, 108);
    c.textAlign = 'left';
  }

  // fő kártya
  const kx = 80;
  const ky = 170;
  const ksz = SZ - 160;
  c.fillStyle = SZIN.kartya;
  c.strokeStyle = SZIN.keret;
  c.lineWidth = 2;
  kerekDoboz(c, kx, ky, ksz, 560, 36);
  c.fill();
  c.stroke();

  c.textAlign = 'center';
  c.fillStyle = SZIN.halvany;
  c.font = `600 30px ${sans}`;
  c.fillText('SZAKASZÁTLAGOM', SZ / 2, ky + 80);

  c.fillStyle = ALLAPOT_SZIN[adat.allapot] || SZIN.szoveg;
  c.font = `700 220px ${mono}`;
  c.fillText(adat.atlag, SZ / 2, ky + 290);

  c.fillStyle = SZIN.halvany;
  c.font = `400 44px ${sans}`;
  c.fillText('km/h', SZ / 2, ky + 350);

  c.fillStyle = SZIN.szoveg;
  c.font = `500 34px ${sans}`;
  c.fillText(`Megengedett átlag: ${adat.megengedett} km/h`, SZ / 2, ky + 430);
  c.fillStyle = SZIN.halvany;
  c.fillText(`${adat.tav}  ·  ${adat.ido}`, SZ / 2, ky + 490);

  // szakaszsáv: a szélesség a hossz, a szín az ítélet
  if (adat.szakaszok.length) {
    const sy = ky + 610;
    const ossz = adat.szakaszok.reduce((a, sz) => a + sz.tav, 0) || 1;
    let x = kx;
    for (const sz of adat.szakaszok) {
      const w = Math.max(6, (sz.tav / ossz) * ksz - 6);
      c.fillStyle = ALLAPOT_SZIN[sz.allapot] || SZIN.halvany;
      kerekDoboz(c, x, sy, w, 76, 12);
      c.fill();
      if (w > 70) {
        c.fillStyle = '#0d1b12';
        c.font = `700 32px ${mono}`;
        c.textAlign = 'center';
        c.fillText(String(sz.limit), x + w / 2, sy + 50);
      }
      x += w + 6;
    }
  }

  /* Sebességprofil: a nulla vonal a helyben érvényes korlátozás, ami fölé
     megy, azzal többel haladt. A felirata is rákerül, hogy a kép magában
     is érthető legyen.                                                 */
  const profilY = ky + 750;
  if (vanProfil) {
    c.fillStyle = SZIN.szoveg;
    c.font = `600 30px ${sans}`;
    c.textAlign = 'left';
    c.fillText('Hol mennyivel a korlátozáshoz képest', kx, profilY);
    profilVaszonra(c, adat.profil, {
      x0: kx, y0: profilY + 20, sz: ksz, ma: PROFIL_MA, osszTav: adat.osszTav,
      szinek: SZIN, betu: mono,
    });
    c.fillStyle = SZIN.halvany;
    c.font = `400 22px ${sans}`;
    c.textAlign = 'left';
    c.fillText('pillanatnyi sebesség a korlátozáshoz mérve, km/h', kx, profilY + PROFIL_MA + 54);
  }

  // verdikt
  const vy = ky + 730 + ELTOLAS;
  const szin = ALLAPOT_SZIN[adat.allapot] || SZIN.halvany;
  c.fillStyle = `${szin}22`;
  c.strokeStyle = szin;
  kerekDoboz(c, kx, vy, ksz, 150, 28);
  c.fill();
  c.stroke();

  c.fillStyle = szin;
  c.font = `700 40px ${sans}`;
  c.textAlign = 'center';
  sortor(c, adat.verdikt, SZ / 2, vy + 62, ksz - 80, 50);

  /* A mérleg egy sorban a verdikt alatt: ez a projekt legbeszédesebb
     két száma, és megosztva is ez az, amit megértenek.               */
  if (adat.nyereseg) {
    const my = vy + 196;
    c.textAlign = 'center';
    c.font = `700 32px ${sans}`;
    const bal = `${adat.nyereseg} nyereség`;
    const jobb = adat.ar;
    const kozep = '  ·  ';
    const wBal = c.measureText(bal).width;
    const wKoz = c.measureText(kozep).width;
    const wJobb = c.measureText(jobb).width;
    let x = SZ / 2 - (wBal + wKoz + wJobb) / 2;
    c.textAlign = 'left';
    c.fillStyle = SZIN.ok;
    c.fillText(bal, x, my);
    x += wBal;
    c.fillStyle = SZIN.halvany;
    c.fillText(kozep, x, my);
    x += wKoz;
    c.fillStyle = adat.arIngyen ? SZIN.ok : SZIN.birsag;
    c.fillText(jobb, x, my);
  }

  // lábléc
  c.fillStyle = SZIN.narancs;
  c.font = `600 34px ${sans}`;
  c.textAlign = 'center';
  c.fillText('Próbáld ki te is: atlagsebesseg.hu', SZ / 2, MA - 62);

  return new Promise((ok) => v.toBlob(ok, 'image/png'));
}

/** Szöveg tördelése a vásznon, legfeljebb két sorban. */
function sortor(c, szoveg, x, y, maxSzelesseg, sorMagassag) {
  const szavak = szoveg.split(' ');
  const sorok = [];
  let sor = '';
  for (const sz of szavak) {
    const proba = sor ? `${sor} ${sz}` : sz;
    if (c.measureText(proba).width > maxSzelesseg && sor) {
      sorok.push(sor);
      sor = sz;
    } else {
      sor = proba;
    }
  }
  if (sor) sorok.push(sor);
  sorok.slice(0, 2).forEach((s, i) => c.fillText(s, x, y + i * sorMagassag));
}

/**
 * Megosztás a rendszer megosztólapjával; ahol az nincs, letöltés.
 * @returns {Promise<'megosztva'|'letoltve'|'megszakitva'>}
 */
export async function megoszt(blob) {
  const fajl = new File([blob], 'atlagsebesseg.png', { type: 'image/png' });
  if (navigator.canShare?.({ files: [fajl] })) {
    try {
      await navigator.share({
        files: [fajl],
        title: 'Átlagsebesség.hu',
        text: 'Így teljesítettem egy átlagsebesség-mérős szakaszt.',
      });
      return 'megosztva';
    } catch (e) {
      if (e && e.name === 'AbortError') return 'megszakitva';
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'atlagsebesseg.png';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return 'letoltve';
}
