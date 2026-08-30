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
const MA_ALAP = 1180;

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
  const k = meret / 512;
  const p = (vx, vy) => [x + vx * k, y + vy * k];

  c.save();
  // út
  c.beginPath();
  c.moveTo(...p(228, 316));
  c.lineTo(...p(284, 316));
  c.lineTo(...p(474, 472));
  c.lineTo(...p(38, 472));
  c.closePath();
  c.fillStyle = SZIN.szoveg;
  c.fill();

  // mérőív: sötét fő szakasz és piros vég
  const iv = (tol, ig, szin) => {
    c.beginPath();
    c.arc(...p(256, 300), 160 * k, tol, ig);
    c.strokeStyle = szin;
    c.lineWidth = 44 * k;
    c.lineCap = 'round';
    c.stroke();
  };
  iv(Math.PI, -Math.PI * 0.31, SZIN.szoveg);
  iv(-Math.PI * 0.28, -Math.PI * 0.04, SZIN.marka);

  // mutató
  c.beginPath();
  c.moveTo(...p(256, 300));
  c.lineTo(...p(366, 190));
  c.strokeStyle = SZIN.marka;
  c.lineWidth = 26 * k;
  c.stroke();
  c.beginPath();
  c.arc(...p(256, 300), 26 * k, 0, Math.PI * 2);
  c.fillStyle = SZIN.marka;
  c.fill();

  // kapuk: bal a szakasz eleje, jobb a vége
  const kapu = (bx, szeles, szin) => {
    c.fillStyle = szin;
    c.fillRect(...p(bx, 292), szeles * k, 46 * k);
    c.fillRect(...p(bx + 6, 338), 28 * k, 118 * k);
    c.fillRect(...p(bx + szeles - 34, 338), 28 * k, 118 * k);
  };
  kapu(70, 140, SZIN.marka);
  kapu(316, 126, SZIN.szoveg);
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
  jelkepVaszonra(c, 76, 40, 88);
  c.fillStyle = SZIN.marka;
  c.font = `italic 800 44px ${sans}`;
  c.textAlign = 'left';
  c.fillText('átlag', 182, 112);
  c.fillStyle = SZIN.szoveg;
  c.fillText('sebesség.hu', 182 + c.measureText('átlag').width, 112);

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
