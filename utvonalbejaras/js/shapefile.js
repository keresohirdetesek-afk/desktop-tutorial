// Shapefile-olvasó — annyi belőle, amennyi az úthálózati adathoz kell.
//
// A NAP-portálról (és a Magyar Közúttól) a rétegek Shape formátumban is
// jönnek. Egy „shapefile” valójában több fájl: a .shp a geometria, a .dbf
// az adatok (útszám, szelvény), a .prj a vetület. Az app eddig csak
// GeoJSON-t olvasott, ezért a letöltést előbb át kellett alakítani — most
// már közvetlenül betölthető.
//
// Amit tud: pont- és vonalrétegek (Point, PolyLine, ezek Z/M változatai),
// és a hozzájuk tartozó .dbf szöveges/szám mezői. Amit nem: többrészes
// poligonok, dátum- és logikai mezők finomságai — ezekre itt nincs szükség.

/** .dbf → sorok tömbje (mezőnév → szöveg). */
export function readDbf(buffer) {
  const b = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const nrec = b.getUint32(4, true);
  const hlen = b.getUint16(8, true);
  const rlen = b.getUint16(10, true);

  const dekod = new TextDecoder('utf-8');
  const mezok = [];
  for (let o = 32; o < hlen - 1 && bytes[o] !== 0x0d; o += 32) {
    const nev = dekod.decode(bytes.subarray(o, o + 11)).replace(/\0[\s\S]*$/, '').trim();
    mezok.push({ nev, tipus: String.fromCharCode(bytes[o + 11]), hossz: bytes[o + 16] });
  }

  const sorok = [];
  for (let r = 0; r < nrec; r++) {
    let o = hlen + r * rlen;
    if (o + rlen > bytes.length) break;
    if (bytes[o] === 0x2a) { o += rlen; continue; }      // törölt rekord
    o += 1;
    const sor = {};
    for (const m of mezok) {
      sor[m.nev] = dekod.decode(bytes.subarray(o, o + m.hossz)).trim();
      o += m.hossz;
    }
    sorok.push(sor);
  }
  return { mezok: mezok.map((m) => m.nev), sorok };
}

const PONT = new Set([1, 11, 21]);              // Point, PointZ, PointM
const VONAL = new Set([3, 13, 23]);             // PolyLine, PolyLineZ, PolyLineM

/**
 * .shp → geometriák tömbje.
 * Pontréteg: `{ tipus: 'pont', koordinatak: [[x, y], …] }`
 * Vonalréteg: `{ tipus: 'vonal', koordinatak: [[[x, y], …], …] }` (részenként)
 * A null geometria helyén `null` áll, hogy a .dbf sorai illeszkedjenek.
 */
export function readShp(buffer) {
  const b = new DataView(buffer);
  if (b.getUint32(0, false) !== 9994) throw new Error('ez nem .shp fájl');
  const fajlTipus = b.getUint32(32, true);
  const pont = PONT.has(fajlTipus);
  const vonal = VONAL.has(fajlTipus);
  if (!pont && !vonal) {
    throw new Error(`ezt a shape-típust (${fajlTipus}) az app nem olvassa — `
      + 'pont- vagy vonalréteg kell');
  }

  const elemek = [];
  let o = 100;
  while (o + 8 <= buffer.byteLength) {
    const hossz = b.getUint32(o + 4, false) * 2;
    const t = b.getUint32(o + 8, true);
    if (t === 0) {
      elemek.push(null);                                   // null shape
    } else if (PONT.has(t)) {
      elemek.push([b.getFloat64(o + 12, true), b.getFloat64(o + 20, true)]);
    } else if (VONAL.has(t)) {
      // 12: box(4×8) → 44: numParts, 48: numPoints, 52: parts, utána pontok
      const reszek = b.getUint32(o + 44, true);
      const pontok = b.getUint32(o + 48, true);
      const hatarok = [];
      for (let i = 0; i < reszek; i++) hatarok.push(b.getUint32(o + 52 + i * 4, true));
      const kezd = o + 52 + reszek * 4;
      const minden = [];
      for (let i = 0; i < pontok; i++) {
        minden.push([
          b.getFloat64(kezd + i * 16, true),
          b.getFloat64(kezd + i * 16 + 8, true),
        ]);
      }
      const vonalak = [];
      for (let i = 0; i < reszek; i++) {
        vonalak.push(minden.slice(hatarok[i], i + 1 < reszek ? hatarok[i + 1] : pontok));
      }
      elemek.push(vonalak);
    } else {
      elemek.push(null);
    }
    o += 8 + hossz;
  }
  return { tipus: pont ? 'pont' : 'vonal', elemek };
}

/**
 * A .shp és a .dbf összefűzése GeoJSON-ná — innentől az app a megszokott
 * úton dolgozza fel. A koordináták érintetlenül maradnak (EOV is lehet),
 * a vetületet a feldolgozó ismeri fel.
 */
export function shapefileToGeoJson(shpBuffer, dbfBuffer) {
  const geo = readShp(shpBuffer);
  const adat = dbfBuffer ? readDbf(dbfBuffer) : { sorok: [] };
  const features = [];
  geo.elemek.forEach((g, i) => {
    if (!g) return;
    const properties = adat.sorok[i] || {};
    if (geo.tipus === 'pont') {
      features.push({ type: 'Feature', properties, geometry: { type: 'Point', coordinates: g } });
    } else if (g.length === 1) {
      features.push({ type: 'Feature', properties, geometry: { type: 'LineString', coordinates: g[0] } });
    } else {
      features.push({ type: 'Feature', properties, geometry: { type: 'MultiLineString', coordinates: g } });
    }
  });
  return { type: 'FeatureCollection', features };
}
