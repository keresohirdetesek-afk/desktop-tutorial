// A Magyar Közút bejárási dokumentumainak kitöltése a bejárás adataiból.
//
// A Közút az adott engedélyre kiállított Word-űrlapokat küld (bejárás,
// részletező, itiner, jegyzék, rendkívüli jegyzék). Ezek a sajátjai: a
// fejléc, az iktatószám, a szerelvény adatai és az útvonal már benne van.
// Az app nem írja át őket — csak kitölti azt, amit a bejárás során
// rögzítettünk, a hiányzó mezőket pedig itt lehet kézzel megadni.
//
// A kitöltött fájl ugyanaz a Word-dokumentum marad: nyomtatható, és a
// Közút felé beadható.

import {
  unzip, zipFiles, parseDocumentXml, serializeDocumentXml,
  textOf, tablesOf, fillTable, findLeafParagraphs, addParagraphAfter, fillDotsNear,
  insertImageAfter,
} from './docx.js';
import { formatCoord, formatDistance, typeLabel, categoryLabel, conditionLabel, severityLabel, isRejected, trackLength } from './geo.js';
import { formatEov } from './eov.js';
import { buildNetwork, lookupRoad } from './uthalozat.js';
import * as db from './db.js';
import { $, el, toast, modal, download, formatDateTime } from './ui.js';

/** A felismert dokumentumtípusok — a sorrend számít (az első találat nyer). */
const TYPES = [
  { id: 'rendkivuli', nev: 'Rendkívüli jegyzék', test: (t) => /rendkívüli/i.test(t) },
  { id: 'itiner', nev: 'Itiner', test: (t) => /\bitiner\b/i.test(t) },
  { id: 'reszletezo', nev: 'Útvonal bejárási részletező', test: (t) => t.includes('Elvégzendő munka megnevezése') },
  { id: 'jegyzek', nev: 'Jegyzék', test: (t) => t.includes('Elbontandó jelzőtábla') },
  { id: 'bejaras', nev: 'Útvonal bejárás (alapdokumentum)', test: (t) => t.includes('A bejárást végző') },
];

const typeName = (id) => (TYPES.find((t) => t.id === id) || {}).nev || 'Ismeretlen dokumentum';

const dateHu = (t) => {
  const d = t ? new Date(t) : new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}. ${p(d.getMonth() + 1)}. ${p(d.getDate())}.`;
};
const timeHu = (t) => {
  if (!t) return '';
  const d = new Date(t);
  const p = (n) => String(n).padStart(2, '0');
  return `${dateHu(t)} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

/**
 * A Magyar Közút útszámkeresője. A GPS-ből az útszám és a km szelvény nem
 * derül ki, de ezen az oldalon a koordináta alapján kikereshető.
 */
const UTSZAM_KERESO = 'https://utszamkereso.kozut.hu/';

/**
 * Az útszámkereső jobb oldali paneljéből kimásolt szöveg feldolgozása.
 * Elég a panelt kijelölni és másolni — ebből kiszedjük, ami kell.
 */
export function parseKeresoSzoveg(text) {
  const t = String(text || '').replace(/\s+/g, ' ');
  const out = {};
  const ut = /[ÚUÚ]tsz[áa]m\s*:?\s*([A-Za-z0-9][A-Za-z0-9./-]*)/i.exec(t);
  if (ut) out.utszam = ut[1];
  const sz = /Szelv[ée]ny\s*:?\s*(\d+)\s*km\s*\+\s*(\d+)\s*m/i.exec(t)
    || /(\d+)\s*km\s*\+\s*(\d+)\s*m/i.exec(t);
  if (sz) out.szelveny = `${Number(sz[1])} km + ${Number(sz[2])} m`;
  else {
    const plus = /\b(\d{1,3})\s*\+\s*(\d{1,3})\b/.exec(t);      // „27+387”
    if (plus) out.szelveny = `${Number(plus[1])} km + ${Number(plus[2])} m`;
  }
  const hely = /Telep[üu]l[ée]s\s*:?\s*([^·|,;]+)/i.exec(t);
  if (hely) out.telepules = hely[1].trim();
  return out;
}

/** Szöveg a vágólapra — hogy a keresőbe csak be kelljen illeszteni. */
async function toClipboard(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (_) { /* jöhet a tartalék */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;left:-9999px;top:0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch (_) {
    return false;
  }
}

/** Egy elem leírása a dokumentumokba — minden, amit róla tudunk. */
function describeForDoc(it) {
  const bits = [];
  if (it.type === 'condition') {
    bits.push(categoryLabel(it.category));
    if (it.what) bits.push(it.what);
    if (it.condition) bits.push(conditionLabel(it.condition));
    if (it.severity) bits.push(severityLabel(it.severity));
  } else {
    bits.push(it.title || typeLabel(it.type));
  }
  if ((it.dims || []).length) bits.push(it.dims.join(' · '));
  if ((it.texts || []).length) bits.push(it.texts.join(' · '));   // a fotóra írt feliratok
  if (it.note) bits.push(it.note);
  return bits.filter(Boolean).join(' – ');
}

export class KozutDocs {
  constructor(root) {
    this.root = root;
    this.docs = [];      // { name, type, blob }
    this.bind();
  }

  bind() {
    $('#kozut-close', this.root).addEventListener('click', () => this.close());
    $('#kozut-add', this.root).addEventListener('click', () => $('#kozut-file', this.root).click());
    $('#kozut-file', this.root).addEventListener('change', (e) => {
      const files = Array.from(e.target.files || []);
      e.target.value = '';
      this.addFiles(files);
    });
    $('#kozut-fill', this.root).addEventListener('click', () => this.fillAll());

    $('#kozut-net-add', this.root).addEventListener('click', () => $('#kozut-net-file', this.root).click());
    $('#kozut-net-file', this.root).addEventListener('change', (e) => {
      const f = e.target.files[0];
      e.target.value = '';
      if (f) this.loadNetwork(f);
    });
  }

  async open({ session, points, items, onSave }) {
    this.session = session;
    this.points = points;
    this.items = items;
    this.onSave = onSave;
    this.form = Object.assign({
      nevek: '',
      datum: dateHu(session.created),
      feltetelek: '',
      kritikus: '',
      kiindulo: '',
      indulas: '',
      vasut: '',
      megallok: '',
      mogottes: '',
      erkezes: '',
      cel: '',
      zarasi: '',
      rendkivuli: '',
    }, session.kozut || {});
    this.prefill();
    this.docs = (session.docs || []).slice();

    this.root.hidden = false;
    document.body.classList.add('modal-open');
    this.render();

    // a korábban betöltött úthálózati adat a készüléken marad
    if (!this.net) {
      try {
        this.net = await db.getNetwork();
      } catch (_) { /* nincs tárolt hálózat */ }
      if (this.net) this.render();
    }
  }

  close() {
    this.save();
    this.root.hidden = true;
    document.body.classList.remove('modal-open');
  }

  /** Amit a bejárásból tudunk, az előre bekerül — felülírható. */
  prefill() {
    const coords = this.points.filter((p) => p.lat != null);
    const first = coords[0];
    const last = coords[coords.length - 1];
    if (first) {
      if (!this.form.kiindulo) this.form.kiindulo = formatCoord(first.lat, first.lon);
      if (!this.form.indulas) this.form.indulas = timeHu(first.t);
    }
    if (last) {
      if (!this.form.cel) this.form.cel = formatCoord(last.lat, last.lon);
      if (!this.form.erkezes) this.form.erkezes = timeHu(last.t);
    }
    if (!this.form.feltetelek) {
      const kritikus = this.items.filter((i) => i.severity === 'kritikus').length;
      // a térképen megadott (otthon megrajzolt) szakasz is az útvonal része
      const drawn = (this.session.drawn || []).reduce((sum, d) => sum + trackLength(d.pts || []), 0);
      const valid = formatDistance(trackLength(this.points.filter((p) => !isRejected(p))) + drawn);
      this.form.feltetelek = kritikus
        ? `A bejárás ${valid} hosszú útvonalon megtörtént. ${kritikus} kritikus helyszín a részletezőben felsorolva.`
        : `A bejárás ${valid} hosszú útvonalon megtörtént, kritikus helyszín nem merült fel.`;
    }

    // elemenkénti adatok: amit tudunk, azt kitöltjük
    for (const it of this.items) {
      it.kozut = Object.assign({
        telepules: '', utszam: '', km: '',
        // minden rögzített helyszín bekerül a részletezőbe — a fotók is,
        // nemcsak az állapotbejegyzések; ami nem kell, az kivehető
        munka: describeForDoc(it),
        reszletezo: true,
        jegyzek: it.type === 'condition' && it.category === 'tabla',
        megnevezes: it.type === 'condition' ? (it.what || categoryLabel(it.category)) : (it.title || ''),
        ideiglenes: '', vegleges: '', technologia: '', jovahagyas: '',
      }, it.kozut || {});
    }
  }

  save() {
    this.session.kozut = this.form;
    this.session.docs = this.docs;
    if (this.onSave) this.onSave();
  }

  /* ------------------------------------------------------ fájlok */

  async addFiles(files) {
    for (const f of files) {
      if (!/\.docx$/i.test(f.name)) {
        toast(`${f.name}: csak .docx fájl tölthető be.`, 'error');
        continue;
      }
      try {
        const type = await this.detect(f);
        this.docs = this.docs.filter((d) => d.name !== f.name);
        this.docs.push({ name: f.name, type, blob: f });
      } catch (err) {
        toast(`${f.name}: ${err.message}`, 'error');
      }
    }
    this.save();
    this.render();
  }

  async detect(blob) {
    const files = await unzip(await blob.arrayBuffer());
    const main = files.find((f) => f.name === 'word/document.xml');
    if (!main) throw new Error('nem Word-dokumentum');
    const text = new TextDecoder().decode(main.data).replace(/<[^>]+>/g, ' ');
    const hit = TYPES.find((t) => t.test(text));
    return hit ? hit.id : 'ismeretlen';
  }

  /* ------------------------------------------- úthálózati adat (NAP) */

  async loadNetwork(file, fields) {
    this.netFile = file;
    toast('Úthálózati adat feldolgozása… ez nagyobb fájlnál eltarthat egy percig.');
    try {
      const net = await buildNetwork(file, fields, (msg) => toast(msg));
      this.net = net;
      await db.saveNetwork(net);
      toast(`Úthálózat betöltve: ${net.roads.length} útszám, ${net.count} szakasz`
        + (net.hasSzelveny ? ', szelvényezéssel.' : ' (szelvény nincs benne).'));
    } catch (err) {
      toast('Az úthálózati adat nem olvasható: ' + err.message, 'error');
    }
    this.render();
  }

  async dropNetwork() {
    this.net = null;
    this.netFile = null;
    try { await db.clearNetwork(); } catch (_) {}
    this.render();
  }

  /** Mezőhozzárendelés módosítása — ha rosszat tippelt az app. */
  async remapNetwork() {
    if (!this.netFile) {
      toast('A mezők módosításához töltse be újra a fájlt.', 'error');
      $('#kozut-net-file', this.root).click();
      return;
    }
    const keys = this.net.sampleKeys || [];
    const options = [{ value: '', label: '— nincs —' }]
      .concat(keys.map((k) => ({ value: k, label: k })));
    const res = await modal({
      title: 'Melyik mező mit jelent?',
      text: 'Az úthálózati fájl oszlopai közül válassza ki a megfelelőt.',
      fields: [
        { name: 'utszam', label: 'Útszám', type: 'select', value: this.net.fields.utszam || '', options },
        { name: 'kmKezd', label: 'Kezdő szelvény', type: 'select', value: this.net.fields.kmKezd || '', options },
        { name: 'kmVeg', label: 'Vég szelvény', type: 'select', value: this.net.fields.kmVeg || '', options },
        { name: 'telepules', label: 'Település', type: 'select', value: this.net.fields.telepules || '', options },
      ],
      okText: 'Újrafeldolgozás',
    });
    if (!res) return;
    const fields = {};
    for (const [k, v] of Object.entries(res)) if (v) fields[k] = v;
    await this.loadNetwork(this.netFile, fields);
  }

  /**
   * Az útszámkeresőből kimásolt panel feldolgozása egy sorba.
   * Először a vágólapot nézzük; ha nem megy (a böngésző nem engedi), kérünk
   * egy beillesztő mezőt.
   */
  async pasteFromKereso(it, k) {
    let text = '';
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        text = await navigator.clipboard.readText();
      }
    } catch (_) { /* jöhet a kézi beillesztés */ }

    let data = parseKeresoSzoveg(text);
    if (!data.utszam && !data.szelveny) {
      const res = await modal({
        title: 'Beillesztés az útszámkeresőből',
        text: 'Az útszámkeresőben a találatra kattintva megjelenik a jobb oldali panel '
          + '(Útszám, Szelvény). Jelölje ki és másolja ki a panel szövegét, majd illessze be ide.',
        fields: [{ name: 'szoveg', label: 'Kimásolt szöveg', type: 'textarea', value: '' }],
        okText: 'Feldolgozás',
      });
      if (!res) return;
      data = parseKeresoSzoveg(res.szoveg);
    }

    if (!data.utszam && !data.szelveny) {
      toast('Ebből nem tudtam kiolvasni útszámot vagy szelvényt.', 'error');
      return;
    }
    if (data.utszam) k.utszam = data.utszam;
    if (data.szelveny) k.km = data.szelveny;
    if (data.telepules && !k.telepules) k.telepules = data.telepules;
    this.save();
    this.render();
    toast(`Beírva: ${[data.utszam, data.szelveny].filter(Boolean).join(' · ')}`);
  }

  /** Egy sor adatai az úthálózatból. */
  netHit(it) {
    if (!this.net || it.lat == null) return null;
    return lookupRoad(this.net, it.lat, it.lon);
  }

  /** Üres mezők kitöltése a hálózatból. */
  fillFromNetwork(only) {
    if (!this.net) return;
    let n = 0;
    for (const it of this.items) {
      if (only && it !== only) continue;
      const hit = this.netHit(it);
      if (!hit) continue;
      const k = it.kozut;
      if (!k.utszam) { k.utszam = hit.utszam; n += 1; }
      if (!k.km && hit.szelveny) { k.km = hit.szelveny; n += 1; }
    }
    this.save();
    this.render();
    toast(n ? `${n} mező kitöltve az úthálózatból.` : 'Nem volt mit kitölteni.');
  }

  renderNetwork() {
    const box = $('#kozut-net', this.root);
    box.innerHTML = '';
    if (!this.net) {
      box.appendChild(el('p', { class: 'hint', text: 'Nincs betöltve úthálózati adat.' }));
      return;
    }
    const n = this.net;
    const fields = Object.entries(n.fields).map(([k, v]) => `${k}: ${v}`).join(' · ');
    box.appendChild(el('div', { class: 'net-card' }, [
      el('b', { text: n.name }),
      el('span', {
        class: 'muted small',
        text: `${n.roads.length} útszám · ${n.count} szakasz · `
          + (n.hasSzelveny ? 'szelvényezéssel' : 'szelvény nélkül'),
      }),
      el('span', { class: 'muted small', text: 'Mezők — ' + fields }),
      el('div', { class: 'editor-row' }, [
        el('button', {
          class: 'btn primary tiny', type: 'button', text: '⤵ Üres mezők kitöltése',
          onclick: () => this.fillFromNetwork(),
        }),
        el('button', {
          class: 'btn ghost tiny', type: 'button', text: 'Mezők módosítása',
          onclick: () => this.remapNetwork(),
        }),
        el('button', {
          class: 'btn ghost tiny', type: 'button', text: 'Eltávolítás',
          onclick: () => this.dropNetwork(),
        }),
      ]),
    ]));
  }

  /* ------------------------------------------------------- felület */

  render() {
    const list = $('#kozut-list', this.root);
    list.innerHTML = '';
    if (!this.docs.length) {
      list.appendChild(el('p', {
        class: 'hint',
        text: 'Még nincs betöltve dokumentum. Töltse be a Közúttól kapott .docx fájlokat — '
          + 'az app felismeri, melyik melyik, és kitölti őket.',
      }));
    }
    for (const d of this.docs) {
      const summary = this.previewOf(d.type);
      list.appendChild(el('div', { class: 'kozut-doc' }, [
        el('div', { class: 'kozut-doc-main' }, [
          el('b', { text: typeName(d.type) }),
          el('span', { class: 'muted small block', text: d.name }),
          el('span', {
            class: 'kozut-prev small',
            text: summary.length ? 'Bekerül: ' + summary.join(' · ') : 'Ehhez most nincs kitölthető adat.',
          }),
          d.status ? el('span', { class: 'kozut-done small', text: d.status }) : null,
        ]),
        el('div', { class: 'kozut-doc-actions' }, [
          el('button', {
            class: 'btn primary tiny', type: 'button', text: '📥 Kitöltés',
            onclick: () => this.fillOne(d),
          }),
          el('button', {
            class: 'btn ghost tiny', type: 'button', text: 'Eltávolítás',
            onclick: () => { this.docs = this.docs.filter((x) => x !== d); this.save(); this.render(); },
          }),
        ]),
      ]));
    }

    const form = $('#kozut-form', this.root);
    form.innerHTML = '';
    const field = (name, label, opts = {}) => {
      const input = el(opts.multiline ? 'textarea' : 'input', {
        id: 'kz-' + name,
        value: this.form[name] || '',
        rows: opts.rows || 3,
        placeholder: opts.placeholder || '',
        oninput: (e) => { this.form[name] = e.target.value; },
      });
      if (opts.multiline) input.value = this.form[name] || '';
      form.appendChild(el('label', { class: 'field' }, [
        el('span', { text: label }), input,
      ]));
    };

    field('nevek', 'A bejárást végző(k) neve, elérhetősége', { multiline: true, rows: 2 });
    field('datum', 'Dátum');
    field('feltetelek', 'A szállítás feltételei (bejárási nyilatkozat)', { multiline: true, rows: 3 });
    field('kritikus', 'Az MK által megjelölt kritikus helyszínek vizsgálata', { multiline: true, rows: 2 });

    form.appendChild(el('p', { class: 'section-head', text: 'Itiner' }));
    field('kiindulo', 'Kiinduló állomás');
    field('indulas', 'Indulás időpontja');
    field('vasut', 'Vasúti átkelés időpontja / időablaka');
    field('megallok', 'Megálló(k)', { multiline: true, rows: 2 });
    field('mogottes', 'Mögöttes forgalom elengedésére alkalmas helyszín', { multiline: true, rows: 2 });
    field('erkezes', 'Tervezett érkezés időpontja');
    field('cel', 'Célállomás');
    field('zarasi', 'Zárási terv', { multiline: true, rows: 4 });
    field('rendkivuli', 'Rendkívüli jegyzék — további megjegyzés', { multiline: true, rows: 2 });

    this.renderNetwork();
    this.renderRows();
  }

  renderRows() {
    const wrap = $('#kozut-rows', this.root);
    wrap.innerHTML = '';
    const rows = this.items.filter((i) => i.lat != null || i.type === 'condition');
    if (!rows.length) {
      wrap.appendChild(el('p', { class: 'hint', text: 'Nincs rögzített helyszín a bejárásban.' }));
      return;
    }
    const setAll = (on) => {
      for (const it of rows) it.kozut.reszletezo = on;
      this.save();
      this.render();
    };
    wrap.appendChild(el('div', { class: 'editor-row' }, [
      el('span', { class: 'muted small', text: `${rows.length} helyszín` }),
      el('button', { class: 'btn ghost tiny', type: 'button', text: 'Mind a részletezőbe', onclick: () => setAll(true) }),
      el('button', { class: 'btn ghost tiny', type: 'button', text: 'Egyik se', onclick: () => setAll(false) }),
    ]));
    rows.forEach((it, idx) => {
      const k = it.kozut;
      const input = (name, label, width) => el('label', { class: 'field tiny' + (width ? ' ' + width : '') }, [
        el('span', { text: label }),
        el('input', {
          value: k[name] || '',
          oninput: (e) => { k[name] = e.target.value; },
        }),
      ]);
      const card = el('div', { class: 'kozut-row' }, [
        el('div', { class: 'kozut-row-head' }, [
          el('b', { text: `${idx + 1}. ${it.title || it.what || typeLabel(it.type)}` }),
          el('span', { class: 'muted small', text: it.lat != null ? formatCoord(it.lat, it.lon) : '—' }),
        ]),
        el('div', { class: 'kozut-grid' }, [
          input('telepules', 'Település'),
          input('utszam', 'Útszám'),
          input('km', 'km szelvény'),
        ]),
        // a Közút útszámkeresője koordináta alapján megmondja az útszámot és
        // a szelvényt; a koordinátát a vágólapra tesszük, hogy csak be
        // kelljen illeszteni
        // amit az úthálózati adat mond erre a pontra
        (() => {
          const hit = this.netHit(it);
          if (!hit) return null;
          return el('div', { class: 'kozut-hit' }, [
            el('span', { text: `🛣️ ${hit.utszam}${hit.szelveny ? ' · ' + hit.szelveny : ''} (${hit.distance} m-re)` }),
            el('button', {
              class: 'btn ghost tiny', type: 'button', text: '⤵ beírom',
              onclick: () => {
                k.utszam = hit.utszam;
                if (hit.szelveny) k.km = hit.szelveny;
                this.save();
                this.render();
              },
            }),
          ]);
        })(),
        it.lat != null ? el('div', { class: 'kozut-eov' }, [
          el('button', {
            class: 'btn ghost tiny', type: 'button',
            text: '🔎 Útszám és szelvény keresése',
            onclick: async (e) => {
              e.preventDefault();
              // az útszámkereső koordinátakeresője EOV Y–X értéket vár
              const eov = formatEov(it.lat, it.lon);
              const copied = await toClipboard(eov);
              // ugyanabban a fülben nyílik meg, nem szaporodnak a lapok
              window.open(UTSZAM_KERESO, 'utszamkereso');
              toast(copied
                ? 'EOV koordináta a vágólapon. A Koordinátakeresőben: Beilleszt → Keres. '
                  + 'A jobb oldali panelből írja ide az útszámot és a szelvényt.'
                : `Koordinátakereső, EOV: ${eov}`);
            },
          }),
          el('button', {
            class: 'btn ghost tiny', type: 'button',
            text: '📋 Beillesztés a keresőből',
            onclick: (e) => { e.preventDefault(); this.pasteFromKereso(it, k); },
          }),
          el('span', { class: 'muted small', text: 'EOV: ' + formatEov(it.lat, it.lon) }),
        ]) : null,
        // egy bejárás rendszerint ugyanazon az úton halad: elég egyszer beírni
        el('button', {
          class: 'btn ghost tiny', type: 'button', text: '⤓ Település és útszám a többi üres sorba',
          onclick: () => {
            if (!k.telepules && !k.utszam) {
              toast('Előbb töltse ki ebben a sorban a települést vagy az útszámot.', 'error');
              return;
            }
            let n = 0;
            for (const other of rows) {
              if (other === it) continue;
              if (!other.kozut.telepules && k.telepules) { other.kozut.telepules = k.telepules; n += 1; }
              if (!other.kozut.utszam && k.utszam) { other.kozut.utszam = k.utszam; n += 1; }
            }
            this.save();
            this.renderRows();
            toast(n ? `Átmásolva ${n} mezőbe.` : 'Minden sor ki volt már töltve.');
          },
        }),
        input('munka', 'Elvégzendő munka / leírás (részletező)'),
        el('label', { class: 'check-row' }, [
          el('input', {
            type: 'checkbox',
            checked: k.reszletezo !== false,
            onchange: (e) => { k.reszletezo = e.target.checked; this.render(); },
          }),
          el('span', { text: 'Kerüljön a részletezőbe' }),
        ]),
        el('label', { class: 'check-row' }, [
          el('input', {
            type: 'checkbox',
            checked: !!k.jegyzek,
            onchange: (e) => { k.jegyzek = e.target.checked; this.renderRows(); },
          }),
          el('span', { text: 'Jegyzékbe (elbontandó tábla, érintett közúti jelzés)' }),
        ]),
      ]);
      if (k.jegyzek) {
        card.appendChild(el('div', { class: 'kozut-grid' }, [
          input('megnevezes', 'Megnevezés'),
          input('ideiglenes', 'Helyreállítás – ideiglenes'),
          input('vegleges', 'Helyreállítás – végleges'),
          input('technologia', 'Alkalmazott technológia'),
        ]));
      }
      wrap.appendChild(card);
    });
  }

  /* ------------------------------------------------- kitöltés */

  /** Ha a helyszín rovatok üresek, a koordináta kerüljön a leírás végére. */
  withPlace(it, k, text) {
    const known = k.telepules || k.utszam || k.km;
    if (known || it.lat == null) return text;
    return `${text} (${formatCoord(it.lat, it.lon)})`;
  }

  munkaRows() {
    const out = [];
    this.items.forEach((it) => {
      const k = it.kozut || {};
      if (k.reszletezo === false || !k.munka) return;
      out.push([
        String(out.length + 1), k.telepules || '', k.utszam || '', k.km || '',
        this.withPlace(it, k, k.munka),
      ]);
    });
    return out;
  }

  jegyzekRows() {
    const out = [];
    this.items.forEach((it) => {
      const k = it.kozut || {};
      if (!k.jegyzek) return;
      out.push([
        String(out.length + 1), k.telepules || '', k.utszam || '', k.km || '',
        this.withPlace(it, k, k.megnevezes || describeForDoc(it)),
        k.ideiglenes || '', k.vegleges || '', k.technologia || '', k.jovahagyas || '',
      ]);
    });
    return out;
  }

  /** Melyik elemek fotói kerüljenek a részletezőbe. */
  photoItems() {
    return this.items.filter((it) => (it.kozut || {}).reszletezo !== false && (it.flat || it.photo))
      .slice(0, 30);
  }

  /**
   * A fotók előkészítése a Word-dokumentumhoz: kisebb méret, hogy a fájl
   * elküldhető maradjon, és a képpontméret, amiből a Word a helyet számolja.
   */
  async preparePhotos() {
    const out = [];
    for (const it of this.photoItems()) {
      const blob = it.flat || it.photo;
      try {
        const bitmap = await createImageBitmap(blob);
        const scale = Math.min(1, 1100 / Math.max(bitmap.width, bitmap.height));
        const w = Math.round(bitmap.width * scale);
        const h = Math.round(bitmap.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
        if (bitmap.close) bitmap.close();
        const small = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.78));
        out.push({
          item: it,
          bytes: new Uint8Array(await (small || blob).arrayBuffer()),
          ext: 'jpeg',
          width: w,
          height: h,
        });
      } catch (_) { /* ezt a képet kihagyjuk */ }
    }
    return out;
  }

  /** A szállítás közben rögzített észrevételek — ezek valók a rendkívüli jegyzékbe. */
  rendkivuliText() {
    const bits = [];
    this.items.filter((i) => i.phase === 'transport').forEach((it, i) => {
      const k = it.kozut || {};
      const hely = [k.telepules, k.utszam, k.km].filter(Boolean).join(', ')
        || (it.lat != null ? formatCoord(it.lat, it.lon) : '');
      bits.push(`${i + 1}. Helyszín, időpont: ${hely} – ${timeHu(it.created)}`);
      bits.push(`   Károkozás leírása: ${describeForDoc(it)}`);
      bits.push(`   Jellege: ${it.type === 'condition' ? conditionLabel(it.condition) : typeLabel(it.type)}`);
      bits.push('   Ideiglenes helyreállítás időpontja: ');
    });
    if (this.form.rendkivuli) bits.push(this.form.rendkivuli);
    return bits.join('\n');
  }

  fillDoc(id, doc, files, photos) {
    const f = this.form;
    const tableWith = (needle) => tablesOf(doc).find((t) => textOf(t).includes(needle));
    let touched = 0;

    if (id === 'jegyzek' || id === 'reszletezo') {
      const t = tableWith('Elbontandó jelzőtábla');
      if (t) touched += fillTable(t, this.jegyzekRows());
    }
    if (id === 'reszletezo') {
      const t = tableWith('Elvégzendő munka');
      if (t) touched += fillTable(t, this.munkaRows());

      // „Fényképfelvétel a kritikus helyszínekről és a jelenlegi
      // állapotokról” — ide kerülnek a bejáráson készült fotók
      const head = findLeafParagraphs(doc, 'Fényképfelvétel')[0];
      if (head && photos && photos.length) {
        let anchor = head;
        photos.forEach((photo, i) => {
          const k = photo.item.kozut || {};
          const it = photo.item;
          const hely = [k.telepules, k.utszam, k.km].filter(Boolean).join(', ')
            || (it.lat != null ? formatCoord(it.lat, it.lon) : '');
          const ido = it.created ? ' · ' + timeHu(it.created) : '';
          const cim = `${i + 1}. ${hely ? hely + ' — ' : ''}${k.munka || describeForDoc(it)}${ido}`;
          anchor = addParagraphAfter(anchor, cim, { plain: true });
          anchor = insertImageAfter(files, anchor, photo, i + 1);
          touched += 1;
        });
      }
    }
    if (id === 'bejaras') {
      if (f.nevek) {
        for (const p of findLeafParagraphs(doc, 'A bejárást végző')) {
          addParagraphAfter(p, f.nevek, { plain: true });
          touched++;
        }
      }
      if (f.feltetelek) {
        touched += fillDotsNear(doc, 'A szállítás a bejárt útvonalon lebonyolítható', f.feltetelek);
      }
      if (f.kritikus) {
        // ehhez is pontozott hely tartozik; ha nincs, a felirat alá kerül
        const n = fillDotsNear(doc, 'kritikus helyszín(ek) vizsgálata', f.kritikus);
        if (n) touched += n;
        else {
          for (const krit of findLeafParagraphs(doc, 'kritikus helyszín(ek) vizsgálata')) {
            addParagraphAfter(krit, f.kritikus, { plain: true });
            touched++;
          }
        }
      }
    }
    if (id === 'itiner') {
      const pairs = [
        ['Kiinduló állomás', f.kiindulo],
        ['Indulás időpontja', f.indulas],
        ['Vasúti átkelés', f.vasut],
        ['Megálló(k)', f.megallok],
        ['Mögöttes forgalom', f.mogottes],
        ['Tervezett érkezés', f.erkezes],
        ['Célállomás', f.cel],
        ['Zárási terv', f.zarasi],
      ];
      for (const [label, value] of pairs) {
        if (!value) continue;
        for (const p of findLeafParagraphs(doc, label)) {
          addParagraphAfter(p, value, { plain: true });
          touched++;
        }
      }
    }
    if (id === 'rendkivuli') {
      const text = this.rendkivuliText();
      const ps = findLeafParagraphs(doc, 'Károkozás leírása');
      const targets = ps.length ? ps : findLeafParagraphs(doc, 'Rendkívüli');
      if (text) for (const p of targets) { addParagraphAfter(p, text, { plain: true }); touched++; }
    }

    // dátum minden dokumentumban
    if (f.datum) touched += fillDotsNear(doc, 'Dátum', f.datum);
    return touched;
  }

  /** Előnézet: mi kerül bele ebbe a dokumentumba. */
  previewOf(id) {
    const f = this.form;
    const out = [];
    const jegyzek = this.jegyzekRows().length;
    const munka = this.munkaRows().length;
    if (id === 'jegyzek' && jegyzek) out.push(`${jegyzek} sor a jegyzékbe`);
    if (id === 'reszletezo') {
      if (munka) out.push(`${munka} sor az elvégzendő munkákhoz`);
      if (jegyzek) out.push(`${jegyzek} sor a jegyzékbe`);
      const fotok = this.photoItems().length;
      if (fotok) out.push(`${fotok} fénykép`);
    }
    if (id === 'bejaras') {
      if (f.nevek) out.push('bejárást végzők');
      if (f.feltetelek) out.push('bejárási nyilatkozat');
      if (f.kritikus) out.push('kritikus helyszínek');
    }
    if (id === 'itiner') {
      const n = ['kiindulo', 'indulas', 'vasut', 'megallok', 'mogottes', 'erkezes', 'cel', 'zarasi']
        .filter((k) => f[k]).length;
      if (n) out.push(`${n} itiner-mező`);
    }
    if (id === 'rendkivuli') {
      const n = this.items.filter((i) => i.phase === 'transport').length;
      if (n) out.push(`${n} szállítás közbeni esemény`);
      else if (f.rendkivuli) out.push('megjegyzés');
    }
    if (f.datum && id !== 'ismeretlen') out.push('dátum');
    return out;
  }

  /** Egy dokumentum kitöltése és letöltése. */
  async fillOne(d) {
    this.save();
    try {
      const files = await unzip(await d.blob.arrayBuffer());
      const main = files.find((f) => f.name === 'word/document.xml');
      if (!main) throw new Error('nem Word-dokumentum');
      const doc = parseDocumentXml(main.data);
      const photos = d.type === 'reszletezo' ? await this.preparePhotos() : [];
      const touched = this.fillDoc(d.type, doc, files, photos);
      main.data = serializeDocumentXml(doc);
      const blob = await zipFiles(files);
      download(blob, d.name.replace(/\.docx$/i, '') + ' - kitoltve.docx');
      d.status = touched
        ? `✓ kitöltve (${touched} helyen) — a letöltések között`
        : '✓ letöltve, de nem volt mit beleírni';
      this.render();
      return true;
    } catch (err) {
      d.status = '✕ ' + err.message;
      this.render();
      toast(`${d.name}: ${err.message}`, 'error');
      return false;
    }
  }

  async fillAll() {
    if (!this.docs.length) {
      toast('Előbb töltse be a Közúttól kapott .docx fájlokat.', 'error');
      return;
    }
    let ok = 0;
    for (const d of this.docs) {
      if (await this.fillOne(d)) ok += 1;
      // a böngészők egymás után érkező letöltéseket blokkolhatnak; a kis
      // szünet és a külön kérés után rendre átmennek
      await new Promise((r) => setTimeout(r, 700));
    }
    if (ok) {
      toast(`${ok} dokumentum kitöltve. Ha a böngésző rákérdez, engedélyezze `
        + 'a több fájl letöltését — vagy töltse le őket egyesével.');
    }
  }
}
