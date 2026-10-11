// Önálló HTML-riport a bejárásról.
//
// Egyetlen fájl, minden benne: térképkép, fotók, hangfelvételek, videók,
// táblajegyzék. Külső hivatkozás nélkül, hogy e-mailben elküldve vagy
// pendrive-on átadva is ugyanazt mutassa — ez a közút felé a lényeg.

import {
  lengthByStatus, rejectedSections, drawnLength, trackLength, renderTrack,
  formatDistance, formatDuration, formatCoord, formatHeading, cardinal,
  typeLabel, categoryLabel, conditionLabel, severityLabel, ATTRIBUTION_TEXT,
} from './geo.js';
import { tilesEnabled, setTilesEnabled, pendingTiles } from './tiles.js';

/** A jegyzőkönyvben használt jelölésszínek — a táblázatok ugyanezt viselik. */
const MARK_ITEM = '#0a6ed1';
const MARK_REJECTED = '#c2410c';
const MARK_DRAWN = '#1a7f45';

const rEsc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

function reportBlobToDataURL(blob) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = () => rej(fr.error);
    fr.readAsDataURL(blob);
  });
}

const dt = (t) => {
  if (!t) return '—';
  const d = new Date(t);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}. ${p(d.getHours())}:${p(d.getMinutes())}`;
};

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Térképkép a riporthoz: ugyanaz a rajzoló, csak kép-méretben, számozott
 * jelölésekkel. Az alaptérkép csempéit megvárjuk — a vaktérkép (csak a
 * vonal, utcák nélkül) a közút felé használhatatlan.
 */
async function mapImage(session, points, items, labels, width = 1100, height = 740) {
  const holder = document.createElement('div');
  holder.style.cssText = `position:fixed;left:-99999px;top:0;width:${width}px;height:${height}px`;
  const canvas = document.createElement('canvas');
  canvas.style.width = width + 'px';
  canvas.style.height = height + 'px';
  holder.appendChild(canvas);
  document.body.appendChild(holder);

  // a riporthoz akkor is kell az alaptérkép, ha a szerkesztőben vázlatra
  // volt kapcsolva — utána visszaállítjuk
  const tilesWere = tilesEnabled();
  setTilesEnabled(true);
  try {
    // a riport világos lapra kerül: a térképvázlat is ahhoz igazodjon
    const style = {
      drawn: session.drawn || [], labels, lineWidth: 4, bg: '#eef2f7', dim: '#5d6b7d',
    };
    let res = renderTrack(canvas, points, items, style);

    // az első rajzolás indítja el a csempék letöltését; megvárjuk őket.
    // Hosszú útvonalhoz több csempe kell, ezért a türelmi idő ahhoz igazodik.
    const wanted = (res.tiles && res.tiles.wanted) || 0;
    const deadline = Date.now() + Math.min(45000, 8000 + wanted * 300);
    let quiet = 0;
    while (Date.now() < deadline) {
      await wait(250);
      quiet = pendingTiles() === 0 ? quiet + 1 : 0;
      if (quiet >= 2) {
        // minden kérés lefutott — de egy újrarajzolás kérhet újabb csempéket
        res = renderTrack(canvas, points, items, style);
        if (pendingTiles() === 0) break;
        quiet = 0;
      }
    }
    res = renderTrack(canvas, points, items, style);
    return { url: canvas.toDataURL('image/jpeg', 0.85), tiles: res.tiles || { wanted: 0, drawn: 0 } };
  } finally {
    setTilesEnabled(tilesWere);
    holder.remove();
  }
}

/** Egy szakasz közepe — ide kerül a sorszámozott jelölés. */
function midPoint(pts = []) {
  const valid = pts.filter((p) => p && p.lat != null && p.lon != null);
  if (!valid.length) return null;
  return valid[Math.floor(valid.length / 2)];
}

/**
 * @param {object} opts { photos, audio, video } — mit ágyazzunk be
 * @param {(msg:string)=>void} progress
 */
export async function buildReport(session, points, items, opts = {}, progress = () => {}) {
  const include = { photos: true, audio: true, video: false, ...opts };
  const lic = opts.licence || { watermark: null, line: null };
  const len = lengthByStatus(points);
  const rejected = rejectedSections(points);
  const drawn = session.drawn || [];
  const ordered = items.slice().sort((a, b) => a.created - b.created);

  // a térképi jelölések és a táblázatok sorszámai ugyanazok
  const labels = [];
  ordered.forEach((it, i) => {
    if (it.lat != null) labels.push({ lat: it.lat, lon: it.lon, text: String(i + 1), color: MARK_ITEM });
  });
  rejected.forEach((r, i) => {
    const m = midPoint(points.slice(r.from, r.to + 1));
    if (m) labels.push({ lat: m.lat, lon: m.lon, text: 'E' + (i + 1), color: MARK_REJECTED });
  });
  drawn.forEach((d, i) => {
    const m = midPoint(d.pts || []);
    if (m) labels.push({ lat: m.lat, lon: m.lon, text: 'B' + (i + 1), color: MARK_DRAWN });
  });

  progress('Térképkép készítése… (alaptérkép letöltése)');
  let map = '';
  let mapTiles = { wanted: 0, drawn: 0 };
  try {
    const res = await mapImage(session, points, items, labels);
    map = res.url;
    mapTiles = res.tiles;
  } catch (_) { /* térkép nélkül is érvényes a riport */ }

  const media = [];
  for (let i = 0; i < ordered.length; i++) {
    const it = ordered[i];
    progress(`Elemek beágyazása… (${i + 1}/${ordered.length})`);
    const m = { img: null, audio: null, video: null };
    const picture = it.flat || it.photo;
    if (include.photos && picture) m.img = await reportBlobToDataURL(picture);
    else if (picture && it.thumb) m.img = await reportBlobToDataURL(it.thumb);
    if (include.audio && it.audio) m.audio = await reportBlobToDataURL(it.audio);
    if (include.video && it.video) m.video = await reportBlobToDataURL(it.video);
    else if (!include.video && it.video && it.thumb) m.img = m.img || await reportBlobToDataURL(it.thumb);
    media.push(m);
  }

  progress('Riport összeállítása…');
  const v = session.vehicle || {};
  const vehicleRows = [
    ['Rendszám / szerelvény', v.plate],
    ['Hossz', v.length && v.length + ' m'],
    ['Szélesség', v.width && v.width + ' m'],
    ['Magasság', v.height && v.height + ' m'],
    ['Össztömeg', v.weight && v.weight + ' t'],
    ['Max. tengelyterhelés', v.axleLoad && v.axleLoad + ' t'],
  ].filter(([, val]) => val);

  const signs = ordered.filter((i) => i.type === 'condition' && i.category === 'tabla');
  const conditions = ordered.filter((i) => i.type === 'condition' && i.category !== 'tabla');

  const itemBlocks = ordered.map((it, idx) => {
    const m = media[idx];
    const facts = [
      ['Idő', dt(it.created)],
      ['Pozíció', formatCoord(it.lat, it.lon)],
      it.heading != null ? ['Kameairány', `${cardinal(it.heading).name} (${formatHeading(it.heading)})`] : null,
      it.type === 'condition' ? ['Kategória', categoryLabel(it.category)] : null,
      it.type === 'condition' ? ['Állapot', conditionLabel(it.condition)] : null,
      it.type === 'condition' ? ['Minősítés', severityLabel(it.severity)] : null,
      (it.dims || []).length ? ['Mért értékek', it.dims.join(' · ')] : null,
      (it.texts || []).length ? ['Feliratok a képen', it.texts.join(' · ')] : null,
      it.note ? ['Megjegyzés', it.note] : null,
    ].filter(Boolean);

    const maps = it.lat != null
      ? `<a class="maplink" href="https://www.google.com/maps/search/?api=1&amp;query=${it.lat},${it.lon}" target="_blank" rel="noopener">Megnyitás térképen</a>`
      : '';

    return `<section class="item${it.type === 'condition' ? ' sev-' + rEsc(it.severity || '') : ''}" id="elem-${idx + 1}">
  <h3><span class="num">${idx + 1}</span> ${rEsc(it.title || typeLabel(it.type))}
    <span class="kind">${rEsc(typeLabel(it.type))}</span></h3>
  ${m.img ? `<img class="shot" src="${m.img}" alt="${rEsc(it.title || 'fotó')}">` : ''}
  ${m.video ? `<video class="shot" controls preload="none"${m.img ? ` poster="${m.img}"` : ''} src="${m.video}"></video>` : ''}
  ${!include.video && it.video ? '<p class="muted">Videófelvétel készült — a riportból helytakarékosságból kimaradt.</p>' : ''}
  ${m.audio ? `<audio controls src="${m.audio}"></audio>` : ''}
  ${!include.audio && it.audio ? '<p class="muted">Hangjegyzet készült — a riportból kimaradt.</p>' : ''}
  <table class="facts">${facts.map(([k, val]) => `<tr><th>${rEsc(k)}</th><td>${rEsc(val)}</td></tr>`).join('')}</table>
  ${maps}
</section>`;
  }).join('\n');

  const signTable = signs.length ? `
<h2>Táblajegyzék</h2>
<table class="grid">
  <thead><tr><th>Jel a térképen</th><th>Tábla</th><th>Állapot</th><th>Minősítés</th><th>Mért érték</th><th>Pozíció</th></tr></thead>
  <tbody>${signs.map((s) => {
    const idx = ordered.indexOf(s) + 1;
    return `<tr><td><a class="mark elem" href="#elem-${idx}">${idx}</a></td><td>${rEsc(s.what || 'jelzőtábla')}</td>`
      + `<td>${rEsc(conditionLabel(s.condition))}</td><td class="sev ${rEsc(s.severity || '')}">${rEsc(severityLabel(s.severity))}</td>`
      + `<td>${rEsc((s.dims || []).join(', '))}</td><td>${rEsc(formatCoord(s.lat, s.lon))}</td></tr>`;
  }).join('')}</tbody>
</table>` : '';

  const conditionTable = conditions.length ? `
<h2>Rögzített állapotok</h2>
<table class="grid">
  <thead><tr><th>Jel a térképen</th><th>Mi</th><th>Megnevezés</th><th>Állapot</th><th>Minősítés</th><th>Pozíció</th></tr></thead>
  <tbody>${conditions.map((c) => {
    const idx = ordered.indexOf(c) + 1;
    return `<tr><td><a class="mark elem" href="#elem-${idx}">${idx}</a></td><td>${rEsc(categoryLabel(c.category))}</td>`
      + `<td>${rEsc(c.what || '')}</td><td>${rEsc(conditionLabel(c.condition))}</td>`
      + `<td class="sev ${rEsc(c.severity || '')}">${rEsc(severityLabel(c.severity))}</td>`
      + `<td>${rEsc(formatCoord(c.lat, c.lon))}</td></tr>`;
  }).join('')}</tbody>
</table>` : '';

  const rejectedBlock = rejected.length ? `
<h2>Elvetett szakaszok</h2>
<p class="muted">A kísérőautó bejárta, de nem része a javasolt útvonalnak.</p>
<table class="grid">
  <thead><tr><th>Jel a térképen</th><th>Indoklás</th><th>Hossz</th><th>Hol</th></tr></thead>
  <tbody>${rejected.map((r, i) => {
    const m = midPoint(points.slice(r.from, r.to + 1));
    return `<tr><td><span class="mark rejected">E${i + 1}</span></td>`
      + `<td>${rEsc(r.reason || 'nincs indoklás')}</td><td>${rEsc(formatDistance(r.length))}</td>`
      + `<td>${m ? rEsc(formatCoord(m.lat, m.lon)) : '—'}</td></tr>`;
  }).join('')}</tbody>
</table>` : '';

  const drawnBlock = drawn.length ? `
<h2>Berajzolt szakaszok</h2>
<p class="muted">Térképen megadott útvonalrész, amelyen a bejáráskor nem haladtunk végig.</p>
<table class="grid">
  <thead><tr><th>Jel a térképen</th><th>Megnevezés</th><th>Megjegyzés</th><th>Hossz</th><th>Hol</th></tr></thead>
  <tbody>${drawn.map((d, i) => {
    const m = midPoint(d.pts || []);
    return `<tr><td><span class="mark drawn">B${i + 1}</span></td><td>${rEsc(d.name || '—')}</td>`
      + `<td>${rEsc(d.note || '')}</td><td>${rEsc(formatDistance(trackLength(d.pts || [])))}</td>`
      + `<td>${m ? rEsc(formatCoord(m.lat, m.lon)) : '—'}</td></tr>`;
  }).join('')}</tbody>
</table>` : '';

  const counts = ordered.reduce((acc, i) => { acc[i.type] = (acc[i.type] || 0) + 1; return acc; }, {});

  return `<!DOCTYPE html>
<html lang="hu">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Útvonalbejárási jegyzőkönyv — ${rEsc(session.name)}</title>
<style>
  :root { --ink:#13202e; --muted:#5d6b7d; --line:#d7dee8; --accent:#0a6ed1;
          --ok:#1a7f45; --warn:#9a6400; --bad:#b3261e; }
  * { box-sizing:border-box; }
  body { margin:0; background:#f4f6f9; color:var(--ink);
         font:15px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; }
  .page { max-width:980px; margin:0 auto; padding:28px 20px 60px; background:#fff;
          box-shadow:0 1px 4px rgba(0,0,0,.08); }
  h1 { font-size:24px; margin:0 0 4px; }
  h2 { font-size:18px; margin:30px 0 10px; padding-bottom:6px; border-bottom:2px solid var(--line); }
  h3 { font-size:16px; margin:0 0 10px; display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
  .sub { color:var(--muted); margin:0 0 18px; }
  .muted { color:var(--muted); }
  table { border-collapse:collapse; width:100%; }
  .facts th { width:150px; text-align:left; color:var(--muted); font-weight:500;
              vertical-align:top; padding:3px 10px 3px 0; }
  .facts td { padding:3px 0; }
  .grid { margin:10px 0 4px; font-size:14px; }
  .grid th, .grid td { border:1px solid var(--line); padding:6px 9px; text-align:left; }
  .grid thead th { background:#eef2f7; }
  .sev.kritikus { color:var(--bad); font-weight:600; }
  .sev.figyelendo { color:var(--warn); font-weight:600; }
  .sev.megfelelo { color:var(--ok); }
  .summary { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:10px; margin:14px 0; }
  .summary div { border:1px solid var(--line); border-radius:8px; padding:10px 12px; }
  .summary b { display:block; font-size:19px; }
  .map { width:100%; border:1px solid var(--line); border-radius:8px; }
  .legend { font-size:13px; color:var(--muted); margin:6px 0 0; }
  .warnbox { border:1px solid #e6c200; background:#fffbe6; color:#6b5200;
             border-radius:8px; padding:8px 11px; margin-top:8px; }
  /* a térképi jelölésekkel azonos jelek a táblázatokban */
  .mark { display:inline-grid; place-items:center; min-width:26px; height:22px;
          padding:0 7px; border-radius:6px; color:#fff; font-size:12.5px;
          font-weight:700; text-decoration:none;
          -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  .mark.elem { background:${MARK_ITEM}; }
  .mark.rejected { background:${MARK_REJECTED}; }
  .mark.drawn { background:${MARK_DRAWN}; }
  .item { border:1px solid var(--line); border-left:4px solid var(--accent);
          border-radius:8px; padding:14px 16px; margin:14px 0; page-break-inside:avoid; }
  .item.sev-kritikus { border-left-color:var(--bad); }
  .item.sev-figyelendo { border-left-color:var(--warn); }
  .num { background:var(--accent); color:#fff; border-radius:999px; min-width:26px;
         height:26px; display:inline-grid; place-items:center; font-size:13px; }
  .kind { font-size:12px; color:var(--muted); font-weight:400; }
  .shot { width:100%; max-width:720px; border-radius:6px; display:block; margin:0 0 10px; }
  audio { width:100%; max-width:720px; margin:0 0 10px; }
  .maplink { font-size:13px; }
  footer { margin-top:34px; padding-top:12px; border-top:1px solid var(--line);
           color:var(--muted); font-size:13px; }
  .licence { margin:-10px 0 18px; font-size:13px; color:var(--muted); }
  .licence.invalid { color:var(--bad); font-weight:600; }
  /* a próbaverzió vízjele átlósan ismétlődik, nyomtatásban is megmarad */
  .watermark {
    position:fixed; inset:0; z-index:9999; pointer-events:none;
    display:flex; align-items:center; justify-content:center;
    font-size:min(13vw,120px); font-weight:800; letter-spacing:.08em;
    color:rgba(179,38,30,.16); transform:rotate(-30deg);
    white-space:nowrap; -webkit-print-color-adjust:exact; print-color-adjust:exact;
  }
  @media print {
    body { background:#fff; }
    .page { box-shadow:none; max-width:none; padding:0; }
    .item { break-inside:avoid; }
    a { color:inherit; text-decoration:none; }
  }
</style>
</head>
<body>
<div class="page">
  ${lic.watermark ? `<div class="watermark" aria-hidden="true">${rEsc(lic.watermark)}</div>` : ''}
  <h1>Útvonalbejárási jegyzőkönyv</h1>
  <p class="sub">${rEsc(session.name)} · bejárás ideje: ${dt(session.created)} · készült: ${dt(Date.now())}</p>
  ${lic.line ? `<p class="licence${lic.watermark ? ' invalid' : ''}">${rEsc(lic.line)}</p>` : ''}

  ${vehicleRows.length ? `<h2>Szerelvény adatai</h2>
  <table class="grid"><tbody>${vehicleRows.map(([k, val]) =>
    `<tr><th>${rEsc(k)}</th><td>${rEsc(val)}</td></tr>`).join('')}</tbody></table>` : ''}

  <h2>Összegzés</h2>
  <div class="summary">
    <div><b>${rEsc(formatDistance(len.ok))}</b>érvényes útvonal</div>
    ${drawn.length ? `<div><b>${rEsc(formatDistance(drawnLength(drawn)))}</b>berajzolt szakasz</div>` : ''}
    ${rejected.length ? `<div><b>${rEsc(formatDistance(len.rejected))}</b>elvetett szakasz</div>` : ''}
    ${len.gaps ? `<div><b>${rEsc(formatDistance(len.gap))}</b>GPS-kimaradás</div>` : ''}
    <div><b>${counts.photo || 0}</b>fotó</div>
    ${counts.video ? `<div><b>${counts.video}</b>videó</div>` : ''}
    ${counts.audio ? `<div><b>${counts.audio}</b>hangjegyzet</div>` : ''}
    ${counts.condition ? `<div><b>${counts.condition}</b>állapotbejegyzés</div>` : ''}
  </div>
  ${session.note ? `<p>${rEsc(session.note)}</p>` : ''}

  ${map ? `<h2>Útvonal</h2>
  <img class="map" src="${map}" alt="A bejárt útvonal térképen">
  <p class="legend">Kék vonal: érvényes útvonal · narancs szaggatott: elvetett szakasz ·
     zöld: berajzolt szakasz.<br>
     A térképen lévő számok a táblázatok sorszámai:
     <span class="mark elem">1</span> rögzített elem (fotó, hang, állapot) ·
     <span class="mark rejected">E1</span> elvetett szakasz ·
     <span class="mark drawn">B1</span> berajzolt szakasz.
     ${mapTiles.drawn ? rEsc(ATTRIBUTION_TEXT) : ''}</p>
  ${mapTiles.drawn === 0 ? `<p class="legend warnbox">Az alaptérkép (utcák, települések) nem
     töltődött be — a jegyzőkönyv készítésekor nem volt hálózat, vagy a térképszolgáltató nem
     válaszolt. A nyomvonal és a jelölések így is pontosak. Ha az alaptérkép is kell a képre:
     nyissa meg a bejárást hálózaton, nézze meg a nyomvonalat térképnézetben, és készítse el
     újra a jegyzőkönyvet.</p>` : mapTiles.drawn < mapTiles.wanted ? `<p class="legend warnbox">Az
     alaptérkép egy része nem töltődött be (${mapTiles.drawn}/${mapTiles.wanted} csempe).</p>` : ''}` : ''}

  ${signTable}
  ${conditionTable}
  ${rejectedBlock}
  ${drawnBlock}

  <h2>Rögzített elemek (${ordered.length})</h2>
  ${itemBlocks || '<p class="muted">Nincs rögzített elem.</p>'}

  <footer>
    ${lic.line ? rEsc(lic.line) + '<br>' : ''}
    Készítette az Útvonalbejárás alkalmazás. A jegyzőkönyv önálló fájl:
    a képek, hangfelvételek${include.video ? ' és videók' : ''} benne vannak,
    külön melléklet nélkül megnyitható.
  </footer>
</div>
</body>
</html>`;
}
