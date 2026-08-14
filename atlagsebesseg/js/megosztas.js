/* Megosztható eredménykép.

   A képet a böngésző rajzolja vászonra, a készüléken: semmilyen adat nem
   megy szerverre, és nincs hozzá külső szolgáltatás. Ez a megosztás az
   egyetlen módja annak, hogy az eredmény kikerüljön a telefonról, és azt
   is a felhasználó indítja.

   Álló, 1080×1180 képarány: ez fér el a legtöbb közösségi felületen
   levágás nélkül.                                                       */

const SZ = 1080;
const MA = 1180;

const SZIN = {
  hatter: '#0e0e10',
  kartya: '#17171a',
  keret: '#2c2c33',
  szoveg: '#f2f3f5',
  halvany: '#9a9aa4',
  narancs: '#ff6a1f',
  ok: '#35c46a',
  hatar: '#ffb020',
  birsag: '#ff4d43',
};

const ALLAPOT_SZIN = { ok: SZIN.ok, hatar: SZIN.hatar, birsag: SZIN.birsag, semleges: SZIN.halvany };

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
 *          tav:number, allapot:string}>}} adat
 * @returns {Promise<Blob>}
 */
export async function keszitKep(adat) {
  // a saját betűtípus csak akkor kerül a vászonra, ha már betöltött
  try { await document.fonts.ready; } catch { /* nem kritikus */ }

  const v = document.createElement('canvas');
  v.width = SZ;
  v.height = MA;
  const c = v.getContext('2d');
  const mono = "'Muszer', ui-monospace, monospace";
  const sans = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

  c.fillStyle = SZIN.hatter;
  c.fillRect(0, 0, SZ, MA);

  // fejléc
  c.fillStyle = SZIN.narancs;
  c.font = `700 42px ${mono}`;
  c.textAlign = 'left';
  c.fillText('[á]', 80, 110);
  c.fillStyle = SZIN.szoveg;
  c.font = `600 42px ${sans}`;
  c.fillText('átlagsebesség', 168, 110);
  c.fillStyle = SZIN.narancs;
  c.fillText('.hu', 168 + c.measureText('átlagsebesség').width, 110);

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

  // verdikt
  const vy = ky + 730;
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
