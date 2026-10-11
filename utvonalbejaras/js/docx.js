// Word-dokumentumok (.docx) kitöltése a böngészőben.
//
// A Magyar Közút a bejáráshoz saját, az adott engedélyre kiállított Word
// űrlapokat küld (bejárás, részletező, itiner, jegyzék, rendkívüli jegyzék).
// Ezeket nem átszerkeszteni kell, hanem kitölteni: a dokumentum minden más
// része — fejléc, iktatószám, méretek, aláírásblokk — érintetlen marad.
//
// A .docx valójában egy ZIP, benne a word/document.xml. Itt van a ZIP
// kibontása és visszacsomagolása, valamint a kitöltéshez való XML-műveletek.
// Külső könyvtár nélkül, mert az app offline, telefonon is működik.

const WNS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n';

/* ----------------------------------------------------------------- ZIP */

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(bytes) {
  let c = -1;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

async function inflateRaw(bytes) {
  if (typeof DecompressionStream !== 'function') {
    throw new Error('A böngésző nem tudja kibontani a Word-fájlt (DecompressionStream hiányzik).');
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function deflateRaw(bytes) {
  if (typeof CompressionStream !== 'function') return null;
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * ZIP kibontása.
 * @returns {Promise<Array<{name: string, data: Uint8Array}>>} az eredeti sorrendben
 */
export async function unzip(buffer) {
  const buf = new Uint8Array(buffer);
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

  // a központi jegyzék vége hátulról kereshető meg
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 66000; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Ez nem Word-fájl (hiányzik a ZIP jegyzéke).');

  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const out = [];
  const dec = new TextDecoder();

  for (let i = 0; i < count; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('Sérült Word-fájl.');
    const method = dv.getUint16(p + 10, true);
    const compSize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const localOff = dv.getUint32(p + 42, true);
    const name = dec.decode(buf.subarray(p + 46, p + 46 + nameLen));

    const lNameLen = dv.getUint16(localOff + 26, true);
    const lExtraLen = dv.getUint16(localOff + 28, true);
    const start = localOff + 30 + lNameLen + lExtraLen;
    const raw = buf.subarray(start, start + compSize);
    out.push({ name, data: method === 8 ? await inflateRaw(raw) : raw.slice() });

    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

/** ZIP összeállítása (tömörítve, ha a böngésző tudja). */
export async function zipFiles(entries) {
  const enc = new TextEncoder();
  const parts = [];
  const central = [];
  let offset = 0;

  for (const e of entries) {
    const nameBytes = enc.encode(e.name);
    const data = e.data;
    const packed = await deflateRaw(data);
    const useDeflate = packed && packed.length < data.length;
    const body = useDeflate ? packed : data;
    const crc = crc32(data);

    const local = new Uint8Array(30 + nameBytes.length);
    const ldv = new DataView(local.buffer);
    ldv.setUint32(0, 0x04034b50, true);
    ldv.setUint16(4, 20, true);                    // kell hozzá: 2.0
    ldv.setUint16(6, 0x0800, true);                // UTF-8 nevek
    ldv.setUint16(8, useDeflate ? 8 : 0, true);
    ldv.setUint16(10, 0, true);                    // idő
    ldv.setUint16(12, 0x21, true);                 // dátum (2000.01.01)
    ldv.setUint32(14, crc, true);
    ldv.setUint32(18, body.length, true);
    ldv.setUint32(22, data.length, true);
    ldv.setUint16(26, nameBytes.length, true);
    ldv.setUint16(28, 0, true);
    local.set(nameBytes, 30);

    parts.push(local, body);

    const cen = new Uint8Array(46 + nameBytes.length);
    const cdv = new DataView(cen.buffer);
    cdv.setUint32(0, 0x02014b50, true);
    cdv.setUint16(4, 20, true);
    cdv.setUint16(6, 20, true);
    cdv.setUint16(8, 0x0800, true);
    cdv.setUint16(10, useDeflate ? 8 : 0, true);
    cdv.setUint16(12, 0, true);
    cdv.setUint16(14, 0x21, true);
    cdv.setUint32(16, crc, true);
    cdv.setUint32(20, body.length, true);
    cdv.setUint32(24, data.length, true);
    cdv.setUint16(28, nameBytes.length, true);
    cdv.setUint32(42, offset, true);
    cen.set(nameBytes, 46);
    central.push(cen);

    offset += local.length + body.length;
  }

  const centralSize = central.reduce((s, c) => s + c.length, 0);
  const end = new Uint8Array(22);
  const edv = new DataView(end.buffer);
  edv.setUint32(0, 0x06054b50, true);
  edv.setUint16(8, entries.length, true);
  edv.setUint16(10, entries.length, true);
  edv.setUint32(12, centralSize, true);
  edv.setUint32(16, offset, true);

  return new Blob([...parts, ...central, end],
    { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

/* ------------------------------------------------------- Word XML */

export function parseDocumentXml(bytes) {
  const text = new TextDecoder().decode(bytes);
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('A Word-fájl tartalma nem olvasható.');
  return doc;
}

export function serializeDocumentXml(doc) {
  let xml = new XMLSerializer().serializeToString(doc);
  // egyes böngészők kiírják az XML-fejlécet, mások nem — pontosan egy kell,
  // kettőtől a Word érvénytelennek látná a fájlt
  xml = xml.replace(/^\s*<\?xml[^>]*\?>\s*/, '');
  return new TextEncoder().encode(XML_HEAD + xml);
}

const wTags = (root, tag) => Array.from(root.getElementsByTagNameNS(WNS, tag));

/** Egy elem összes szövege. */
export function textOf(el) {
  return wTags(el, 't').map((t) => t.textContent).join('');
}

export function tablesOf(doc) {
  return wTags(doc, 'tbl');
}

/** Egy táblázat saját sorai (a beágyazott táblázatokéi nélkül). */
export function rowsOf(tbl) {
  return Array.from(tbl.childNodes).filter((n) => n.localName === 'tr');
}

export function cellsOf(tr) {
  return Array.from(tr.childNodes).filter((n) => n.localName === 'tc');
}

/**
 * Szöveg beírása egy cellába. A formázás megmarad: a meglévő (üres) futamot
 * írjuk át, vagy a bekezdés saját betűbeállításával hozunk létre újat.
 */
export function setCellText(tc, text) {
  const value = String(text == null ? '' : text);
  const paragraphs = wTags(tc, 'p');
  const p = paragraphs[0];
  if (!p) return;

  // a cella többi bekezdése és futama törlődik, hogy ne maradjon régi szöveg
  for (let i = 1; i < paragraphs.length; i++) paragraphs[i].remove();
  const runs = wTags(p, 'r');
  for (let i = 1; i < runs.length; i++) runs[i].remove();

  let run = runs[0];
  if (!run) {
    run = p.ownerDocument.createElementNS(WNS, 'w:r');
    const pPr = wTags(p, 'pPr')[0];
    const rPr = pPr && wTags(pPr, 'rPr')[0];
    if (rPr) run.appendChild(rPr.cloneNode(true));
    p.appendChild(run);
  }

  for (const t of wTags(run, 't')) t.remove();
  for (const br of wTags(run, 'br')) br.remove();

  const lines = value.split('\n');
  lines.forEach((line, i) => {
    if (i) run.appendChild(p.ownerDocument.createElementNS(WNS, 'w:br'));
    const t = p.ownerDocument.createElementNS(WNS, 'w:t');
    t.setAttribute('xml:space', 'preserve');
    t.textContent = line;
    run.appendChild(t);
  });
}

/** Üres (kitöltésre váró) sor-e. */
function isEmptyRow(tr) {
  return !textOf(tr).trim();
}

/**
 * Táblázat kitöltése. Az üres sorokat tölti fel sorban; ha kevés van,
 * az utolsót klónozza — a táblázat szerkezete és stílusa marad.
 *
 * @param {Element} tbl
 * @param {Array<Array<string>>} rows
 */
export function fillTable(tbl, rows) {
  const all = wTags(tbl, 'tr');
  const empty = all.filter(isEmptyRow);
  if (!empty.length || !rows.length) return 0;

  const template = empty[empty.length - 1];
  let used = 0;
  for (const data of rows) {
    let tr = empty[used];
    if (!tr) {
      tr = template.cloneNode(true);
      for (const tc of cellsOf(tr)) setCellText(tc, '');
      template.parentNode.insertBefore(tr, template.nextSibling);
      empty.push(tr);
    }
    const cells = cellsOf(tr);
    data.forEach((value, i) => {
      if (cells[i] != null && value != null) setCellText(cells[i], value);
    });
    used += 1;
  }
  return used;
}

/** Az a bekezdés, amelynek szövege tartalmazza a keresett részletet. */
export function findParagraph(doc, needle) {
  return findParagraphs(doc, needle)[0] || null;
}

/**
 * Minden ilyen bekezdés. A Word a szövegdobozokat két változatban tárolja
 * (mc:Choice és mc:Fallback), ezért ugyanaz a felirat kétszer is szerepelhet
 * — mindkettőt ki kell tölteni, különben a megnyitó programtól függne, hogy
 * látszik-e a beírt érték.
 */
export function findParagraphs(doc, needle) {
  return wTags(doc, 'p').filter((p) => textOf(p).includes(needle));
}

/**
 * Csak a „levél” bekezdések: a szövegdobozt tartalmazó külső bekezdés szövege
 * a dobozban lévőket is magában foglalja, oda beírni félrevinne. Beszúrásnál
 * ezt használjuk, hogy az érték a felirat mellé kerüljön.
 */
export function findLeafParagraphs(doc, needle) {
  return findParagraphs(doc, needle).filter((p) => wTags(p, 'p').length === 0);
}

/**
 * A felirathoz tartozó pontozott kitöltőhely feltöltése. A pontsor lehet a
 * felirat bekezdésében vagy az azt követő néhány bekezdésben (a Közút
 * űrlapjain a felirat gyakran szövegdobozban van, a pontsor alatta).
 */
export function fillDotsNear(doc, label, text, filled = new Set()) {
  let count = 0;
  for (const p of findParagraphs(doc, label)) {
    let el = p;
    for (let step = 0; step < 4 && el; step++) {
      if (!filled.has(el) && fillDots(el, text)) {
        filled.add(el);
        count += 1;
        break;
      }
      el = el.nextElementSibling;
    }
  }
  return count;
}

/** Új bekezdés a megadott után, ugyanazzal a formázással. */
export function addParagraphAfter(p, text, opts = {}) {
  const doc = p.ownerDocument;
  const copy = p.cloneNode(true);
  for (const r of wTags(copy, 'r')) r.remove();
  for (const bookmark of wTags(copy, 'bookmarkStart').concat(wTags(copy, 'bookmarkEnd'))) {
    bookmark.remove();
  }
  const run = doc.createElementNS(WNS, 'w:r');
  const pPr = wTags(copy, 'pPr')[0];
  const rPr = pPr && wTags(pPr, 'rPr')[0];
  if (rPr) {
    const copyRPr = rPr.cloneNode(true);
    // a kitöltött érték ne legyen félkövér, ha a címke az volt
    if (opts.plain) for (const b of wTags(copyRPr, 'b')) b.remove();
    run.appendChild(copyRPr);
  }
  String(text).split('\n').forEach((line, i) => {
    if (i) run.appendChild(doc.createElementNS(WNS, 'w:br'));
    const t = doc.createElementNS(WNS, 'w:t');
    t.setAttribute('xml:space', 'preserve');
    t.textContent = line;
    run.appendChild(t);
  });
  copy.appendChild(run);
  p.parentNode.insertBefore(copy, p.nextSibling);
  return copy;
}

/**
 * Pontozott kitöltőhely („…………”) feltöltése a megadott szöveggel.
 * A pontsor annyit megtart magából, amennyi a szöveg után még kifér.
 */
export function fillDots(el, text, minDots = 6) {
  const value = String(text || '');
  if (!value) return false;
  for (const t of wTags(el, 't')) {
    const m = /([…\.]{5,})/.exec(t.textContent);
    if (!m) continue;
    const keep = Math.max(minDots, m[1].length - value.length);
    t.setAttribute('xml:space', 'preserve');
    t.textContent = t.textContent.replace(m[1], ' ' + value + ' ' + m[1].slice(0, keep));
    return true;
  }
  return false;
}
