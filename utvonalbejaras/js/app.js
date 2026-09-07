// Útvonalbejárás — fő alkalmazáslogika

import * as db from './db.js';
import {
  TrackRecorder, currentPosition, renderTrack, lengthByStatus, isRejected,
  rejectedSections, drawnLength, detectGap, formatDistance, formatDuration,
  formatCoord, toGPX, toGeoJSON, typeLabel, describeItem,
} from './geo.js';
import { AudioRecorder, shrinkImage, makeThumb, readExif } from './media.js';
import { PhotoEditor } from './editor.js';
import { TrackEditor } from './trackedit.js';
import { $, $$, el, toast, modal, download, formatDateTime, formatTime } from './ui.js';

const state = {
  screen: 'list',
  session: null,
  points: [],
  items: [],
  itemFilter: 'all',
  searchFilter: 'all',
  recording: false,
  recStartedAt: null,
  recElapsed: 0,
  urls: new Set(),
};

const RECORDING_HINT = 'Rögzítés fut — tartsa nyitva az alkalmazást, a képernyő zárolása megszakíthatja a mérést.';

let recorder = null;
let audioRec = null;
let editor = null;
let trackEditor = null;
let tickTimer = null;
let trackHit = null;
let firstPointAfterStart = false;

/* ------------------------------------------------------------ segédek */

function objectUrl(blob) {
  const u = URL.createObjectURL(blob);
  state.urls.add(u);
  return u;
}

function releaseUrls() {
  for (const u of state.urls) URL.revokeObjectURL(u);
  state.urls.clear();
}

function blobToDataURL(blob) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = () => rej(fr.error);
    fr.readAsDataURL(blob);
  });
}

async function dataURLToBlob(url) {
  const r = await fetch(url);
  return r.blob();
}

function slug(s) {
  return (s || 'bejaras')
    .toLowerCase()
    .replace(/[áàâä]/g, 'a').replace(/[éèêë]/g, 'e').replace(/[íìîï]/g, 'i')
    .replace(/[óòôöő]/g, 'o').replace(/[úùûüű]/g, 'u')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'bejaras';
}

/* --------------------------------------------------------- képernyők */

function show(screen) {
  state.screen = screen;
  for (const s of $$('.screen')) s.hidden = s.id !== 'scr-' + screen;
  for (const t of $$('.tab')) t.classList.toggle('active', t.dataset.screen === screen);

  const titles = { list: 'Útvonalbejárás', session: state.session ? state.session.name : 'Bejárás', search: 'Keresés' };
  $('#topbar-title').textContent = titles[screen] || 'Útvonalbejárás';
  $('#back-btn').hidden = screen !== 'session';
  window.scrollTo(0, 0);

  if (screen === 'session') drawTrack();
  if (screen === 'search') runSearch();
  if (screen === 'list') renderSessionList();
}

/* ------------------------------------------------- bejárások listája */

let sessionCache = [];

async function renderSessionList() {
  sessionCache = await db.listSessions();
  const filter = $('#list-filter').value.trim().toLowerCase();
  const list = $('#session-list');
  list.innerHTML = '';

  const shown = sessionCache.filter(
    (s) => !filter || s.name.toLowerCase().includes(filter) || (s.note || '').toLowerCase().includes(filter)
  );
  $('#list-empty').hidden = sessionCache.length !== 0;

  const counts = await itemCounts();
  for (const s of shown) {
    const c = counts[s.id] || { photo: 0, audio: 0, note: 0 };
    const card = el('button', { class: 'card', type: 'button', onclick: () => openSession(s.id) }, [
      el('div', { class: 'card-main' }, [
        el('div', { class: 'card-title', text: s.name }),
        el('div', { class: 'card-sub', text: formatDateTime(s.created) }),
        el('div', { class: 'card-tags' }, [
          el('span', { class: 'tag', text: formatDistance(s.stats?.distance || 0) }),
          el('span', { class: 'tag', text: `📷 ${c.photo}` }),
          el('span', { class: 'tag', text: `🎙️ ${c.audio}` }),
          el('span', { class: 'tag', text: `📝 ${c.note}` }),
        ]),
        s.vehicle && (s.vehicle.width || s.vehicle.height || s.vehicle.length)
          ? el('div', { class: 'card-sub', text: vehicleSummary(s.vehicle) })
          : null,
      ]),
      el('span', { class: 'card-chev', text: '›' }),
    ]);
    list.appendChild(card);
  }
  updateStorageInfo();
}

async function itemCounts() {
  const all = await db.allItems();
  const out = {};
  for (const i of all) {
    out[i.sessionId] = out[i.sessionId] || { photo: 0, audio: 0, note: 0 };
    out[i.sessionId][i.type] = (out[i.sessionId][i.type] || 0) + 1;
  }
  return out;
}

function vehicleSummary(v) {
  const parts = [];
  if (v.length) parts.push(`H ${v.length} m`);
  if (v.width) parts.push(`Sz ${v.width} m`);
  if (v.height) parts.push(`M ${v.height} m`);
  if (v.weight) parts.push(`${v.weight} t`);
  if (v.plate) parts.push(v.plate);
  return parts.join(' · ');
}

async function updateStorageInfo() {
  const est = await db.storageEstimate();
  if (!est || !est.usage) { $('#storage-info').textContent = ''; return; }
  const mb = (est.usage / 1048576).toFixed(1).replace('.', ',');
  $('#storage-info').textContent = `Helyben tárolva: ${mb} MB — az adatok nem hagyják el a készüléket.`;
}

/* --------------------------------------------------- bejárás adatlap */

const vehicleFields = (v = {}) => [
  { name: 'name', label: 'Bejárás megnevezése', value: v.name || '', placeholder: 'pl. Győr – Komárom, trafó szállítás' },
  { name: 'plate', label: 'Rendszám / szerelvény', value: v.plate || '', placeholder: 'pl. ABC-123 + pótkocsi' },
  { name: 'length', label: 'Hossz (m)', type: 'text', inputmode: 'decimal', value: v.length || '' },
  { name: 'width', label: 'Szélesség (m)', type: 'text', inputmode: 'decimal', value: v.width || '' },
  { name: 'height', label: 'Magasság (m)', type: 'text', inputmode: 'decimal', value: v.height || '' },
  { name: 'weight', label: 'Össztömeg (t)', type: 'text', inputmode: 'decimal', value: v.weight || '' },
  { name: 'axleLoad', label: 'Max. tengelyterhelés (t)', type: 'text', inputmode: 'decimal', value: v.axleLoad || '' },
  { name: 'note', label: 'Megjegyzés', type: 'textarea', value: v.note || '' },
];

async function newSession() {
  const res = await modal({
    title: 'Új bejárás',
    fields: vehicleFields({ name: defaultSessionName() }),
    okText: 'Létrehozás',
  });
  if (!res) return;
  const s = await db.createSession({
    name: res.name || defaultSessionName(),
    note: res.note,
    vehicle: {
      plate: res.plate, length: res.length, width: res.width,
      height: res.height, weight: res.weight, axleLoad: res.axleLoad,
    },
  });
  await openSession(s.id);
  toast('Bejárás létrehozva. Indíthatja a nyomvonal rögzítését.');
}

function defaultSessionName() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `Bejárás ${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}.`;
}

async function editSessionData() {
  const s = state.session;
  const res = await modal({
    title: 'Bejárás adatai',
    fields: vehicleFields({ ...s.vehicle, name: s.name, note: s.note }),
  });
  if (!res) return;
  s.name = res.name || s.name;
  s.note = res.note;
  s.vehicle = {
    plate: res.plate, length: res.length, width: res.width,
    height: res.height, weight: res.weight, axleLoad: res.axleLoad,
  };
  await db.saveSession(s);
  $('#topbar-title').textContent = s.name;
  renderMeta();
  toast('Adatok mentve.');
}

/* ----------------------------------------------------- aktív bejárás */

async function openSession(id) {
  stopRecording(true);
  releaseUrls();
  state.session = await db.getSession(id);
  if (!state.session) { toast('A bejárás nem található.', 'error'); return; }
  state.points = await db.getPoints(id);
  state.items = await db.getItems(id);
  state.recElapsed = state.session.stats?.elapsed || 0;
  $('[data-screen="session"]').disabled = false;
  renderItems();
  renderMeta();
  updateStats();
  show('session');
}

function renderMeta() {
  const s = state.session;
  const len = lengthByStatus(state.points);
  const secs = rejectedSections(state.points);
  const rows = [
    ['Megnevezés', s.name],
    ['Létrehozva', formatDateTime(s.created)],
    ['Szerelvény', vehicleSummary(s.vehicle) || '—'],
    ['Érvényes útvonal', `${formatDistance(len.ok)} · ${state.points.length} pont`],
  ];
  const drawn = s.drawn || [];
  if (drawn.length) {
    rows.push(['Berajzolt szakasz', `${drawn.length} db · ${formatDistance(drawnLength(drawn))}`]);
    drawn.forEach((seg, i) => {
      rows.push([`↳ ${i + 1}.`, `${seg.name || 'névtelen'}${seg.note ? ' — ' + seg.note : ''}`]);
    });
  }
  if (secs.length) {
    rows.push(['Elvetett szakasz', `${secs.length} db · ${formatDistance(len.rejected)}`]);
    secs.forEach((sec, i) => {
      rows.push([`↳ ${i + 1}.`, `${sec.reason || 'nincs indoklás'} (${formatDistance(sec.length)})`]);
    });
    rows.push(['Bejárt összesen', formatDistance(len.total)]);
  }
  if (len.gaps) {
    rows.push(['GPS-kimaradás', `${len.gaps} db · ${formatDistance(len.gap)} ismeretlen szakasz`]);
  }
  rows.push(['Megjegyzés', s.note || '—']);
  renderBackupStatus();
  $('#session-meta').innerHTML = '';
  for (const [k, v] of rows) {
    $('#session-meta').appendChild(
      el('div', { class: 'meta-row' }, [
        el('span', { class: 'meta-key', text: k }),
        el('span', { class: 'meta-val', text: v }),
      ])
    );
  }
}

function updateStats() {
  // a „táv” a hivatalos útvonal hossza: az elvetett szakaszok nem számítanak bele
  const len = lengthByStatus(state.points);
  $('#st-distance').textContent = formatDistance(len.ok);
  $('#st-dist-label').textContent = len.rejected > 0 ? 'Érvényes' : 'Táv';
  $('#st-points').textContent = String(state.points.length);
  const elapsed = state.recording ? state.recElapsed + (Date.now() - state.recStartedAt) : state.recElapsed;
  $('#st-time').textContent = formatDuration(elapsed);
  const last = recorder && recorder.current;
  $('#st-acc').textContent = last && last.acc != null ? '±' + last.acc + ' m' : '—';

  const secs = rejectedSections(state.points);
  const summary = $('#reject-summary');
  summary.hidden = secs.length === 0;
  if (secs.length) {
    summary.textContent =
      `⚠️ ${secs.length} elvetett szakasz · ${formatDistance(len.rejected)} — megnyitás szerkesztésre`;
  }

  if (state.session) {
    state.session.stats = {
      ...(state.session.stats || {}),
      distance: len.ok,          // hivatalos útvonal
      distanceDriven: len.total, // a kísérőautó teljes útja
      rejected: len.rejected,
      points: state.points.length,
      elapsed,
    };
  }
}

function drawTrack() {
  const canvas = $('#track-canvas');
  if (!canvas.clientWidth) return;
  trackHit = renderTrack(canvas, state.points, state.items, {
    drawn: (state.session && state.session.drawn) || [],
  });
}

/* ------------------------------------------------------- GPS felvétel */

function startRecording() {
  recorder = new TrackRecorder({
    onPoint: async (pt) => {
      const rec = { ...pt, sessionId: state.session.id };
      // az újraindítás utáni első pont, illetve a hosszú jelkimaradás után
      // érkező pont mögött nincs igazolt útvonal
      const prev = state.points[state.points.length - 1];
      if (prev && (firstPointAfterStart || detectGap(prev, rec))) rec.gap = true;
      firstPointAfterStart = false;
      state.points.push(rec);
      rec.id = await db.addPoint(rec); // az azonosító kell a későbbi szerkesztéshez
      $('#gps-status').textContent = RECORDING_HINT;
      updateStats();
      if (state.screen === 'session') drawTrack();
    },
    onError: (err) => {
      const msg =
        err.code === 1 ? 'A helymeghatározás le van tiltva. Engedélyezze a böngésző beállításaiban.'
        : err.code === 2 ? 'Pillanatnyilag nincs helyadat — a rögzítés fut, jel esetén folytatódik.'
        : err.code === 3 ? 'Nincs GPS-jel (időtúllépés) — szabad ég alatt pontosabb.'
        : 'GPS hiba: ' + (err.message || 'ismeretlen');
      $('#gps-status').textContent = msg;
      // csak az engedélyhiányt érdemes felugró üzenettel jelezni, a többi
      // gyakran percenként többször is előfordul menet közben
      if (err.code === 1) toast(msg, 'error');
    },
  });
  if (!recorder.start()) return;

  state.recording = true;
  state.recStartedAt = Date.now();
  firstPointAfterStart = true;   // az újraindítás előtti pontokhoz nincs igazolt út
  if (!state.session.stats?.startedAt) {
    state.session.stats = { ...(state.session.stats || {}), startedAt: Date.now() };
  }
  $('#rec-toggle').textContent = '■ Rögzítés leállítása';
  $('#rec-toggle').classList.add('active');
  $('#rec-mark').disabled = false;
  $('#gps-status').textContent = RECORDING_HINT;
  tickTimer = setInterval(() => { updateStats(); }, 1000);
  keepAwake(true);
}

async function stopRecording(silent = false) {
  if (!state.recording) return;
  state.recording = false;
  state.recElapsed += Date.now() - state.recStartedAt;
  if (recorder) { recorder.stop(); recorder = null; }
  clearInterval(tickTimer);
  keepAwake(false);
  $('#rec-toggle').textContent = '● Nyomvonal rögzítése';
  $('#rec-toggle').classList.remove('active');
  $('#rec-mark').disabled = true;
  $('#gps-status').textContent = '';
  if (state.session) {
    state.session.stats = {
      ...(state.session.stats || {}),
      endedAt: Date.now(),
      elapsed: state.recElapsed,
      distance: lengthByStatus(state.points).ok,
      points: state.points.length,
    };
    await db.saveSession(state.session);
    renderMeta();
  }
  if (!silent) {
    toast('Rögzítés leállítva, a nyomvonal mentve.');
    if (backupStale(state.session)) {
      setTimeout(() => {
        toast('Ne felejtse kiírni a biztonsági mentést a bejárás végén.');
        renderBackupStatus();
      }, 3400);
    }
  }
}

/**
 * Nyomvonal utólagos szerkesztése: a kísérőautó útja nem feltétlenül a
 * jóváhagyandó útvonal, ezért szakaszonként elvethető vagy törölhető.
 */
async function openTrackEditor() {
  if (state.points.length < 2) {
    toast('Ehhez a bejáráshoz még nincs elég rögzített nyomvonalpont.', 'error');
    return;
  }
  if (state.recording) {
    const ok = await modal({
      title: 'Rögzítés fut',
      text: 'A szerkesztéshez le kell állítani a nyomvonal rögzítését. Leállítsuk most?',
      okText: 'Leállítás és szerkesztés',
    });
    if (!ok) return;
    await stopRecording(true);
  }

  if (!trackEditor) trackEditor = new TrackEditor($('#trackedit'));
  const changed = await trackEditor.open({
    points: state.points,
    items: state.items,
    drawn: state.session.drawn || [],
    onApply: async ({ updated, deleted, drawn }) => {
      if (updated) await db.updatePoints(updated);
      if (deleted) await db.deletePoints(deleted);
      if (state.session) {
        if (drawn) state.session.drawn = drawn;
        const len = lengthByStatus(state.points);
        state.session.stats = {
          ...(state.session.stats || {}),
          distance: len.ok,
          distanceDriven: len.total,
          rejected: len.rejected,
          drawn: drawnLength(state.session.drawn || []),
          points: state.points.length,
        };
        await db.saveSession(state.session);
      }
    },
  });

  if (changed) {
    updateStats();
    renderMeta();
    drawTrack();
  }
}

let wakeLock = null;
async function keepAwake(on) {
  try {
    if (on && 'wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
    else if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch (_) { /* nem kritikus */ }
}

/* --------------------------------------------------------- elem rögzítés */

/** Rögzítés közben a nyomvonal utolsó fixe ennyi ideig fogadható el (ms). */
const POSITION_MAX_AGE = 10000;

/**
 * Aktuális pozíció elemhez. Csak akkor használja a rögzítő utolsó fixét,
 * ha az valóban friss — különben új mérést kér. Így nem ragad be egy régi,
 * más helyszínen mért koordináta egy most készült fotóra.
 */
async function positionNow() {
  const now = Date.now();
  const cur = state.recording && recorder ? recorder.current : null;
  if (cur && cur.t && now - cur.t < POSITION_MAX_AGE) {
    return { lat: cur.lat, lon: cur.lon, acc: cur.acc, heading: cur.heading, posAt: cur.t, posSource: 'gps' };
  }
  // valóban új mérés (tárolt fix nem fogadható el)
  const fresh = await currentPosition(7000, 0);
  if (fresh) {
    return { lat: fresh.lat, lon: fresh.lon, acc: fresh.acc, heading: fresh.heading, posAt: fresh.t || now, posSource: 'gps' };
  }
  // ha nincs friss jel, inkább egy megjelölt, tárolt mérés, mint semmi
  const cached = await currentPosition(3000, 60000);
  if (cached) {
    return { lat: cached.lat, lon: cached.lon, acc: cached.acc, heading: cached.heading, posAt: cached.t || null, posSource: 'gps-cached' };
  }
  return { lat: null, lon: null, acc: null, heading: null, posAt: null, posSource: 'none' };
}

async function onPhotoSelected(e) {
  const files = Array.from(e.target.files || []);
  e.target.value = '';
  if (!files.length) return;

  toast(files.length > 1 ? `${files.length} fotó feldolgozása…` : 'Fotó feldolgozása…');

  // Egy most készült fotóhoz friss mérés kell. Több fájl egyszerre viszont
  // jellemzően galériából jön: azoknál a készítés helye a képben van (EXIF),
  // az eszköz pillanatnyi helye félrevezető lenne.
  const live = files.length === 1 ? await positionNow() : null;
  let firstId = null;
  let noPos = 0;

  for (const file of files) {
    try {
      const exif = await readExif(file);
      let pos;
      if (exif && exif.lat != null) {
        pos = { lat: exif.lat, lon: exif.lon, acc: null, heading: null, posAt: exif.takenAt || null, posSource: 'exif' };
      } else if (live) {
        pos = live;
      } else {
        pos = { lat: null, lon: null, acc: null, heading: null, posAt: null, posSource: 'none' };
      }
      if (pos.lat == null) noPos++;

      const { blob, width, height } = await shrinkImage(file);
      const thumb = await makeThumb(blob);
      const item = {
        id: db.uid(),
        sessionId: state.session.id,
        type: 'photo',
        // importált képnél a felvétel ideje a mérvadó, nem a behozatalé
        created: (exif && exif.takenAt) || Date.now(),
        importedAt: exif && exif.takenAt ? Date.now() : undefined,
        ...pos,
        title: '',
        note: '',
        dims: [],
        texts: [],
        ops: [],
        photo: blob,
        flat: null,
        thumb,
        width,
        height,
      };
      await db.saveItem(item);
      state.items.push(item);
      if (!firstId) firstId = item.id;
    } catch (err) {
      toast('A fotó nem menthető: ' + err.message, 'error');
    }
  }
  state.items.sort((a, b) => a.created - b.created);
  markUnsaved();
  renderItems();
  drawTrack();

  if (noPos) {
    toast(
      noPos === files.length
        ? 'Nincs helyadat a fotó(k)hoz — a részleteknél kézzel megadható.'
        : `${noPos} fotóhoz nincs helyadat — a részleteknél kézzel megadható.`,
      'error'
    );
  }

  if (files.length === 1 && firstId) {
    await annotate(firstId);
  } else {
    toast(`${files.length} fotó mentve. Koppintson rá a jelöléshez.`);
  }
}

/** Fotó megnyitása a jelölő szerkesztőben. */
async function annotate(itemId) {
  const item = state.items.find((i) => i.id === itemId) || (await db.getItem(itemId));
  if (!item) return;
  if (!editor) editor = new PhotoEditor($('#editor'));

  const res = await editor.open({
    imageBlob: item.photo,
    ops: item.ops || [],
    title: item.title || 'Fotó jelölése',
  });
  if (!res) return;

  item.ops = res.ops;
  item.dims = res.dims;
  item.texts = res.texts;
  item.flat = res.flat;
  item.thumb = await makeThumb(res.flat || item.photo);
  await db.saveItem(item);
  const idx = state.items.findIndex((i) => i.id === item.id);
  if (idx >= 0) state.items[idx] = item;
  markUnsaved();
  renderItems();
  toast(res.dims.length ? `Mentve — ${res.dims.length} méret rögzítve.` : 'Jelölések mentve.');
}

async function recordAudio(attachToItemId = null) {
  if (!AudioRecorder.supported) {
    toast('Ez a böngésző nem támogatja a hangrögzítést.', 'error');
    return;
  }
  const overlay = $('#rec-overlay');
  overlay.hidden = false;
  $('#rec-time').textContent = '0:00';
  $('#rec-level').style.width = '0%';

  audioRec = new AudioRecorder({
    onTick: (ms) => { $('#rec-time').textContent = formatDuration(ms); },
    onLevel: (l) => { $('#rec-level').style.width = Math.round(l * 100) + '%'; },
  });

  try {
    await audioRec.start();
  } catch (err) {
    overlay.hidden = true;
    toast('Nincs mikrofon-hozzáférés: ' + err.message, 'error');
    return;
  }

  const finish = async (save) => {
    $('#rec-stop').onclick = null;
    $('#rec-cancel').onclick = null;
    overlay.hidden = true;
    if (!save) { audioRec.cancel(); audioRec = null; return; }

    const out = await audioRec.stop();
    audioRec = null;
    if (!out || !out.blob.size) { toast('Üres felvétel.', 'error'); return; }

    if (attachToItemId) {
      const item = state.items.find((i) => i.id === attachToItemId);
      item.audio = out.blob;
      item.audioDuration = out.duration;
      await db.saveItem(item);
      renderItems();
      toast('Hangjegyzet a fotóhoz csatolva.');
      return;
    }

    const pos = await positionNow();
    const item = {
      id: db.uid(),
      sessionId: state.session.id,
      type: 'audio',
      created: Date.now(),
      ...pos,
      title: '',
      note: '',
      dims: [],
      audio: out.blob,
      audioDuration: out.duration,
    };
    await db.saveItem(item);
    state.items.push(item);
    markUnsaved();
    renderItems();
    drawTrack();
    toast(`Hangjegyzet mentve (${formatDuration(out.duration)}).`);
  };

  $('#rec-stop').onclick = () => finish(true);
  $('#rec-cancel').onclick = () => finish(false);
}

async function addNote() {
  const res = await modal({
    title: 'Írott jegyzet',
    fields: [
      { name: 'title', label: 'Cím', placeholder: 'pl. útszűkület a hídnál' },
      { name: 'note', label: 'Jegyzet', type: 'textarea', rows: 4 },
      { name: 'dims', label: 'Méretek (vesszővel elválasztva)', placeholder: 'pl. szabad magasság: 4,30 m, útszélesség: 5,10 m' },
    ],
    okText: 'Mentés',
  });
  if (!res || (!res.note && !res.title)) return;
  const pos = await positionNow();
  const item = {
    id: db.uid(),
    sessionId: state.session.id,
    type: 'note',
    created: Date.now(),
    ...pos,
    title: res.title,
    note: res.note,
    dims: res.dims ? res.dims.split(',').map((s) => s.trim()).filter(Boolean) : [],
  };
  await db.saveItem(item);
  state.items.push(item);
  markUnsaved();
  renderItems();
  drawTrack();
  toast('Jegyzet mentve.');
}

async function markPoint() {
  const pos = await positionNow();
  if (pos.lat == null) { toast('Nincs GPS-pozíció.', 'error'); return; }
  const res = await modal({
    title: 'Pont jelölése',
    text: formatCoord(pos.lat, pos.lon),
    fields: [{ name: 'title', label: 'Megnevezés', placeholder: 'pl. kritikus kereszteződés' }],
    okText: 'Jelölés',
  });
  if (!res) return;
  const item = {
    id: db.uid(), sessionId: state.session.id, type: 'note', created: Date.now(),
    ...pos, title: res.title || 'Jelölt pont', note: '', dims: [],
  };
  await db.saveItem(item);
  state.items.push(item);
  markUnsaved();
  renderItems();
  drawTrack();
  toast('Pont jelölve.');
}

/* ---------------------------------------------------------- elemlista */

function renderItems() {
  const wrap = $('#item-list');
  wrap.innerHTML = '';
  const list = state.items
    .filter((i) => state.itemFilter === 'all' || i.type === state.itemFilter)
    .slice()
    .reverse();

  $('#item-count').textContent = String(state.items.length);
  $('#items-empty').hidden = list.length !== 0;

  for (const item of list) wrap.appendChild(itemCard(item));
  updateStats();
  renderMeta();
}

function itemCard(item, extraSub) {
  const thumb = item.type === 'photo' && item.thumb
    ? el('img', { class: 'thumb', src: objectUrl(item.thumb), alt: '' })
    : el('div', { class: 'thumb placeholder', text: item.type === 'audio' ? '🎙️' : '📝' });

  const sub = [];
  sub.push(formatTime(item.created));
  if (item.type === 'audio' && item.audioDuration) sub.push(formatDuration(item.audioDuration));
  if (item.lat != null) sub.push(formatCoord(item.lat, item.lon));

  const tags = [];
  for (const d of item.dims || []) tags.push(el('span', { class: 'tag dim', text: '↔ ' + d }));
  if (item.audio && item.type === 'photo') tags.push(el('span', { class: 'tag', text: '🎙️ hang' }));
  if ((item.ops || []).some((o) => o.k === 'dir')) tags.push(el('span', { class: 'tag', text: '⇨ útirány' }));

  return el('button', { class: 'item', type: 'button', onclick: () => openViewer(item.id) }, [
    thumb,
    el('div', { class: 'item-body' }, [
      el('div', { class: 'item-title', text: item.title || describeItem(item) || typeLabel(item.type) }),
      el('div', { class: 'item-sub', text: sub.join(' · ') }),
      extraSub ? el('div', { class: 'item-sub muted', text: extraSub }) : null,
      tags.length ? el('div', { class: 'card-tags' }, tags) : null,
    ]),
  ]);
}

/* --------------------------------------------------------- elem-nézet */

let viewerItem = null;

/** Honnan való a helyadat, és mennyire megbízható. */
function positionNote(item) {
  if (item.lat == null) return '';
  const parts = [];
  const src = {
    gps: 'GPS',
    'gps-cached': 'GPS, tárolt mérés',
    exif: 'a kép EXIF-adatából',
    manual: 'kézzel megadva',
    track: 'nyomvonalról',
  }[item.posSource];
  if (src) parts.push(src);
  if (item.acc != null) parts.push('±' + item.acc + ' m');
  if (item.posAt && Math.abs(item.created - item.posAt) > 60000) {
    parts.push('mérés: ' + formatDateTime(item.posAt));
  }
  return parts.length ? ` (${parts.join(', ')})` : '';
}

/** Helyadat pótlása vagy javítása: nyomvonalról, friss méréssel, vagy kézzel. */
async function editItemPosition(item) {
  const res = await modal({
    title: item.lat == null ? 'Hely megadása' : 'Hely javítása',
    text: item.lat == null
      ? 'Ehhez az elemhez nincs helyadat. Adja meg a koordinátát, vagy vegye át a nyomvonal legközelebbi pontját.'
      : 'A koordináta felülírható, ha a mért érték pontatlan volt.',
    fields: [
      { name: 'lat', label: 'Szélesség (lat)', inputmode: 'decimal', value: item.lat != null ? item.lat.toFixed(6) : '' },
      { name: 'lon', label: 'Hosszúság (lon)', inputmode: 'decimal', value: item.lon != null ? item.lon.toFixed(6) : '' },
      {
        name: 'mode', label: 'Vagy vegye át innen', type: 'select', value: '',
        options: [
          { value: '', label: '— a fenti koordinátát használom —' },
          { value: 'now', label: 'Friss GPS-mérés most' },
          { value: 'track', label: 'A nyomvonal időben legközelebbi pontja' },
        ],
      },
    ],
    okText: 'Mentés',
  });
  if (!res) return;

  let next = null;
  if (res.mode === 'now') {
    const p = await positionNow();
    if (p.lat == null) { toast('Nem sikerült helyadatot mérni.', 'error'); return; }
    next = p;
  } else if (res.mode === 'track') {
    if (!state.points.length) { toast('Ehhez a bejáráshoz nincs nyomvonal.', 'error'); return; }
    let best = state.points[0];
    for (const p of state.points) {
      if (Math.abs(p.t - item.created) < Math.abs(best.t - item.created)) best = p;
    }
    next = { lat: best.lat, lon: best.lon, acc: best.acc, posAt: best.t, posSource: 'track' };
  } else {
    const lat = Number(String(res.lat).replace(',', '.'));
    const lon = Number(String(res.lon).replace(',', '.'));
    if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      toast('Érvénytelen koordináta.', 'error');
      return;
    }
    next = { lat, lon, acc: null, posAt: Date.now(), posSource: 'manual' };
  }

  Object.assign(item, next);
  await db.saveItem(item);
  markUnsaved();
  renderItems();
  drawTrack();
  closeViewer();
  toast('Helyadat mentve.');
}

async function openViewer(id) {
  const item = state.items.find((i) => i.id === id) || (await db.getItem(id));
  if (!item) return;
  viewerItem = item;

  $('#viewer-title').textContent = item.title || typeLabel(item.type);
  const body = $('#viewer-body');
  const actions = $('#viewer-actions');
  body.innerHTML = '';
  actions.innerHTML = '';

  if (item.type === 'photo') {
    body.appendChild(el('img', { class: 'full-photo', src: objectUrl(item.flat || item.photo), alt: '' }));
  }
  if (item.audio) {
    body.appendChild(el('audio', { class: 'player', controls: true, src: objectUrl(item.audio) }));
  }

  const info = el('div', { class: 'meta-card' });
  const rows = [
    [item.importedAt ? 'Felvétel ideje' : 'Idő', formatDateTime(item.created)],
    ['Pozíció', formatCoord(item.lat, item.lon) + positionNote(item)],
  ];
  if (item.dims && item.dims.length) rows.push(['Méretek', item.dims.join(' · ')]);
  if (item.texts && item.texts.length) rows.push(['Feliratok', item.texts.join(' · ')]);
  if (item.note) rows.push(['Jegyzet', item.note]);
  for (const [k, v] of rows) {
    info.appendChild(el('div', { class: 'meta-row' }, [
      el('span', { class: 'meta-key', text: k }),
      el('span', { class: 'meta-val', text: v }),
    ]));
  }
  body.appendChild(info);

  if (item.type === 'photo') {
    actions.appendChild(el('button', { class: 'btn primary small', text: '✏️ Jelölés / méretek', onclick: async () => {
      closeViewer();
      await annotate(item.id);
    } }));
    actions.appendChild(el('button', { class: 'btn ghost small', text: '⬇️ Kép letöltése', onclick: () => {
      download(item.flat || item.photo, `${slug(state.session?.name)}-${item.id.slice(0, 6)}.jpg`);
    } }));
  }
  if (!item.audio) {
    actions.appendChild(el('button', { class: 'btn ghost small', text: '🎙️ Hangjegyzet', onclick: async () => {
      closeViewer();
      await recordAudio(item.id);
    } }));
  }
  actions.appendChild(el('button', { class: 'btn ghost small', text: '📝 Megjegyzés', onclick: () => editItemNote(item) }));
  actions.appendChild(el('button', {
    class: item.lat == null ? 'btn primary small' : 'btn ghost small',
    text: item.lat == null ? '📍 Hely megadása' : '📍 Hely javítása',
    onclick: () => editItemPosition(item),
  }));
  if (item.lat != null) {
    actions.appendChild(el('a', {
      class: 'btn ghost small',
      href: `https://www.google.com/maps/search/?api=1&query=${item.lat},${item.lon}`,
      target: '_blank', rel: 'noopener', text: '🗺️ Térképen',
    }));
  }

  $('#viewer').hidden = false;
  document.body.classList.add('modal-open');
}

function closeViewer() {
  $('#viewer').hidden = true;
  document.body.classList.remove('modal-open');
  viewerItem = null;
}

async function editItemNote(item) {
  const res = await modal({
    title: 'Megjegyzés szerkesztése',
    fields: [
      { name: 'title', label: 'Cím', value: item.title || '' },
      { name: 'note', label: 'Jegyzet', type: 'textarea', rows: 4, value: item.note || '' },
      { name: 'dims', label: 'Méretek (vesszővel)', value: (item.dims || []).join(', ') },
    ],
  });
  if (!res) return;
  item.title = res.title;
  item.note = res.note;
  item.dims = res.dims ? res.dims.split(',').map((s) => s.trim()).filter(Boolean) : [];
  await db.saveItem(item);
  markUnsaved();
  renderItems();
  closeViewer();
  toast('Mentve.');
}

async function deleteCurrentItem() {
  if (!viewerItem) return;
  const ok = await modal({
    title: 'Elem törlése?',
    text: 'A fotó/hangfelvétel véglegesen törlődik.',
    okText: 'Törlés',
  });
  if (!ok) return;
  await db.deleteItem(viewerItem.id);
  state.items = state.items.filter((i) => i.id !== viewerItem.id);
  markUnsaved();
  closeViewer();
  renderItems();
  drawTrack();
  toast('Elem törölve.');
}

/* ------------------------------------------------------------ keresés */

async function runSearch() {
  const q = $('#q').value.trim().toLowerCase();
  const f = state.searchFilter;
  const results = $('#search-results');
  results.innerHTML = '';

  const [sessions, items] = await Promise.all([db.listSessions(), db.allItems()]);
  const byId = Object.fromEntries(sessions.map((s) => [s.id, s]));

  const matches = items.filter((i) => {
    if (f === 'dim') { if (!(i.dims && i.dims.length)) return false; }
    else if (f !== 'all' && i.type !== f) return false;
    if (!q) return true;
    const s = byId[i.sessionId];
    const hay = [
      i.title, i.note, (i.dims || []).join(' '), (i.texts || []).join(' '),
      s ? s.name : '', s ? s.note : '', s ? vehicleSummary(s.vehicle || {}) : '',
      i.lat != null ? formatCoord(i.lat, i.lon) : '',
    ].join(' ').toLowerCase();
    return hay.includes(q);
  });

  matches.sort((a, b) => b.created - a.created);
  $('#search-empty').hidden = matches.length !== 0;

  for (const item of matches.slice(0, 300)) {
    const s = byId[item.sessionId];
    const card = itemCard(item, s ? s.name : '');
    card.addEventListener('click', async () => {
      if (!state.session || state.session.id !== item.sessionId) await openSession(item.sessionId);
      openViewer(item.id);
    }, { capture: true });
    results.appendChild(card);
  }
}

/* -------------------------------------------------------------- export */

async function exportGPX() {
  const gpx = toGPX(state.session, state.points, state.items);
  download(new Blob([gpx], { type: 'application/gpx+xml' }), `${slug(state.session.name)}.gpx`);
  toast('GPX letöltve.');
}

async function exportJSON() {
  toast('Mentés készítése… nagyobb bejárásnál eltarthat egy ideig.');
  const items = [];
  for (const i of state.items) {
    const copy = { ...i };
    for (const key of ['photo', 'flat', 'thumb', 'audio']) {
      if (i[key] instanceof Blob) copy[key] = await blobToDataURL(i[key]);
      else delete copy[key];
    }
    items.push(copy);
  }
  const data = {
    format: 'utvonalbejaras/1',
    exportedAt: new Date().toISOString(),
    session: state.session,
    points: state.points.map(({ id, ...p }) => p),
    items,
  };
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  download(blob, `${slug(state.session.name)}-mentes.json`);

  state.session.lastBackupAt = Date.now();
  await db.saveSession(state.session);
  renderBackupStatus();
  toast(`Mentés kész (${(blob.size / 1048576).toFixed(1).replace('.', ',')} MB).`);
}

async function importJSON(file) {
  try {
    const data = JSON.parse(await file.text());
    if (!data.session) throw new Error('ismeretlen fájlformátum');
    const oldId = data.session.id;
    const session = { ...data.session, id: db.uid(), name: data.session.name + ' (visszatöltve)' };
    await db.saveSession(session);

    for (const p of data.points || []) await db.addPoint({ ...p, sessionId: session.id });

    for (const raw of data.items || []) {
      const item = { ...raw, id: db.uid(), sessionId: session.id };
      for (const key of ['photo', 'flat', 'thumb', 'audio']) {
        if (typeof raw[key] === 'string' && raw[key].startsWith('data:')) {
          item[key] = await dataURLToBlob(raw[key]);
        }
      }
      await db.saveItem(item);
    }
    void oldId;
    toast('Mentés visszatöltve.');
    await openSession(session.id);
  } catch (err) {
    toast('A visszatöltés nem sikerült: ' + err.message, 'error');
  }
}

/* ------------------------------------------------- biztonsági mentés */

/** A bejárás változott a legutóbbi kimentés óta? */
function backupStale(s) {
  if (!s) return false;
  return !s.lastBackupAt || s.lastBackupAt < (s.updated || 0);
}

function markUnsaved() {
  if (!state.session) return;
  db.saveSession(state.session).catch(() => {}); // az `updated` azonnal frissül
  renderBackupStatus();
}

function renderBackupStatus() {
  const box = $('#backup-status');
  const s = state.session;
  if (!box || !s) return;
  const stale = backupStale(s);
  box.classList.toggle('warn', stale);
  box.textContent = s.lastBackupAt
    ? (stale
      ? `⚠️ Változott a legutóbbi mentés óta (${formatDateTime(s.lastBackupAt)}) — mentés kiírása`
      : `✓ Biztonsági mentés: ${formatDateTime(s.lastBackupAt)}`)
    : '⚠️ Még nincs biztonsági mentés — a böngészőadatok törlése mindent visz. Mentés kiírása';
}

/* ------------------------------------------------------- térképnézet */

/**
 * A ténylegesen bejárt vonal megjelenítése térképnézőben. A Google Maps
 * útvonaltervezője csak pontokat kap és maga tervez utat — ez viszont magát
 * a vonalat adja át, az elvetett és a berajzolt szakaszokkal együtt.
 */
async function openTrackOnMap() {
  const build = (tolerance) =>
    JSON.stringify(toGeoJSON(state.session, state.points, state.items, { tolerance }));

  let tolerance = 0.00004;
  let json = build(tolerance);
  if (JSON.parse(json).features.length === 0) {
    toast('Nincs megjeleníthető nyomvonal.', 'error');
    return;
  }
  // hosszú bejárásnál ritkítunk, hogy elférjen a hivatkozásban
  while (json.length > 30000 && tolerance < 0.002) {
    tolerance *= 2;
    json = build(tolerance);
  }

  const ok = await modal({
    title: 'Megnyitás térképnézőben',
    text: 'A nyomvonal a geojson.io oldalon jelenik meg, utcákkal és településekkel. '
      + 'Az adat a hivatkozás horgony részében utazik, amit a böngésző nem küld el a kiszolgálónak — '
      + 'de ez akkor is egy külső oldal. Megnyitjuk?',
    okText: 'Megnyitás',
  });
  if (!ok) return;

  window.open(
    'https://geojson.io/#data=data:application/json,' + encodeURIComponent(json),
    '_blank',
    'noopener'
  );
}

function exportGeoJSON() {
  const gj = toGeoJSON(state.session, state.points, state.items, { tolerance: 0 });
  download(
    new Blob([JSON.stringify(gj, null, 1)], { type: 'application/geo+json' }),
    `${slug(state.session.name)}.geojson`
  );
  toast('GeoJSON letöltve.');
}

function openInMaps() {
  // csak az érvényes útvonal: az elvetett szakaszokon nem kell végigvinni
  const pts = state.points.filter((p) => !isRejected(p));
  if (!pts.length) { toast('Nincs rögzített nyomvonal.', 'error'); return; }
  const origin = pts[0];
  const dest = pts[pts.length - 1];
  const step = Math.max(1, Math.floor(pts.length / 8));
  const way = [];
  for (let i = step; i < pts.length - 1 && way.length < 8; i += step) way.push(`${pts[i].lat},${pts[i].lon}`);
  toast('A Google Maps saját útvonalat tervez a megadott pontok között — ez közelítés, nem a bejárt vonal.');
  const url =
    `https://www.google.com/maps/dir/?api=1&origin=${origin.lat},${origin.lon}` +
    `&destination=${dest.lat},${dest.lon}` +
    (way.length ? `&waypoints=${encodeURIComponent(way.join('|'))}` : '') +
    '&travelmode=driving';
  window.open(url, '_blank', 'noopener');
}

async function deleteSession() {
  const ok = await modal({
    title: 'Bejárás törlése?',
    text: `„${state.session.name}” minden fotója, hangjegyzete és nyomvonala véglegesen törlődik.`,
    okText: 'Végleges törlés',
  });
  if (!ok) return;
  await stopRecording(true);
  await db.deleteSession(state.session.id);
  state.session = null;
  state.items = [];
  state.points = [];
  $('[data-screen="session"]').disabled = true;
  show('list');
  toast('Bejárás törölve.');
}

/* ------------------------------------------------------------ indítás */

function bind() {
  $('#new-session').addEventListener('click', newSession);
  $('#list-filter').addEventListener('input', renderSessionList);
  $('#back-btn').addEventListener('click', () => show('list'));

  for (const t of $$('.tab')) {
    t.addEventListener('click', () => { if (!t.disabled) show(t.dataset.screen); });
  }

  $('#rec-toggle').addEventListener('click', () => (state.recording ? stopRecording() : startRecording()));
  $('#rec-mark').addEventListener('click', markPoint);
  $('#edit-track').addEventListener('click', openTrackEditor);
  $('#reject-summary').addEventListener('click', openTrackEditor);
  $('#cap-photo').addEventListener('click', () => $('#photo-input').click());
  $('#photo-input').addEventListener('change', onPhotoSelected);
  $('#cap-audio').addEventListener('click', () => recordAudio(null));
  $('#cap-note').addEventListener('click', addNote);

  for (const c of $$('#item-filter .chip')) {
    c.addEventListener('click', () => {
      state.itemFilter = c.dataset.f;
      $$('#item-filter .chip').forEach((x) => x.classList.toggle('active', x === c));
      renderItems();
    });
  }
  for (const c of $$('#search-filter .chip')) {
    c.addEventListener('click', () => {
      state.searchFilter = c.dataset.f;
      $$('#search-filter .chip').forEach((x) => x.classList.toggle('active', x === c));
      runSearch();
    });
  }
  $('#q').addEventListener('input', debounce(runSearch, 200));

  $('#edit-session').addEventListener('click', editSessionData);
  $('#export-gpx').addEventListener('click', exportGPX);
  $('#export-geojson').addEventListener('click', exportGeoJSON);
  $('#export-json').addEventListener('click', exportJSON);
  $('#open-track-map').addEventListener('click', openTrackOnMap);
  $('#open-maps').addEventListener('click', openInMaps);
  $('#backup-status').addEventListener('click', exportJSON);
  $('#delete-session').addEventListener('click', deleteSession);

  $('#import-btn').addEventListener('click', () => $('#import-file').click());
  $('#import-file').addEventListener('change', (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (f) importJSON(f);
  });

  $('#viewer-close').addEventListener('click', closeViewer);
  $('#viewer-delete').addEventListener('click', deleteCurrentItem);

  $('#track-canvas').addEventListener('click', (e) => {
    if (!trackHit || !trackHit.hitboxes) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    const hit = trackHit.hitboxes.find((h) => Math.hypot(h.x - x, h.y - y) < h.r);
    if (hit) openViewer(hit.id);
  });

  window.addEventListener('resize', debounce(() => { if (state.screen === 'session') drawTrack(); }, 150));

  window.addEventListener('beforeunload', (e) => {
    if (state.recording) { e.preventDefault(); e.returnValue = ''; }
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && state.recording) keepAwake(true);
  });
}

function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

async function init() {
  bind();
  editor = new PhotoEditor($('#editor'));
  await renderSessionList();
  show('list');

  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persist().catch(() => {});
  }
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js')
      .then(() => checkOfflineReady())
      .catch((err) => setOfflineStatus('Offline készenlét: nem sikerült beállítani (' + err.message + ').', true));
  }
}

function setOfflineStatus(text, warn = false) {
  const box = $('#offline-status');
  if (!box) return;
  box.textContent = text;
  box.classList.toggle('warn-text', warn);
}

/**
 * Az offline készenlét ellenőrzése. Korábban a letöltési hibák némán
 * elvesztek, így nem lehetett tudni, tényleg használható-e terepen.
 */
async function checkOfflineReady() {
  try {
    const reg = await navigator.serviceWorker.ready;
    const sw = navigator.serviceWorker.controller || reg.active;
    if (!sw) {
      setOfflineStatus('Offline készenlét: még nem aktív — töltse újra az oldalt.', true);
      return;
    }
    const res = await new Promise((resolve, reject) => {
      const ch = new MessageChannel();
      const timer = setTimeout(() => reject(new Error('nincs válasz')), 4000);
      ch.port1.onmessage = (e) => { clearTimeout(timer); resolve(e.data); };
      sw.postMessage({ type: 'status' }, [ch.port2]);
    });
    if (res && res.cached >= res.expected) {
      setOfflineStatus(`✓ Offline használatra kész (${res.cached} fájl).`);
    } else {
      setOfflineStatus(
        `⚠️ Offline készenlét hiányos (${res ? res.cached : 0}/${res ? res.expected : '?'} fájl) — `
        + 'töltse újra az oldalt hálózaton.', true
      );
    }
  } catch (err) {
    setOfflineStatus('⚠️ Az offline készenlét nem ellenőrizhető: ' + err.message, true);
  }
}

init();
