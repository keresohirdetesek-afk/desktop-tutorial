// GPS: nyomvonal rögzítés, számítások, rajzolás, GPX export

const R = 6371000; // Föld sugara méterben

export function haversine(a, b) {
  const toRad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toRad;
  const dLon = (b.lon - a.lon) * toRad;
  const la1 = a.lat * toRad;
  const la2 = b.lat * toRad;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function bearing(a, b) {
  const toRad = Math.PI / 180;
  const la1 = a.lat * toRad;
  const la2 = b.lat * toRad;
  const dLon = (b.lon - a.lon) * toRad;
  const y = Math.sin(dLon) * Math.cos(la2);
  const x = Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dLon);
  return (Math.atan2(y, x) * 180) / Math.PI;
}

export function trackLength(points) {
  let d = 0;
  for (let i = 1; i < points.length; i++) d += haversine(points[i - 1], points[i]);
  return d;
}

/* ------------------------------------------------- érvényes / elvetett

A kísérőautó nyomvonala nem feltétlenül a jóváhagyandó útvonal: akadály
miatt vissza kellett fordulni, kerülőt kellett keresni. Az ilyen szakaszok
„elvetett” jelölést kapnak — az adat megmarad (indoklással együtt), de nem
számít bele a hivatalos útvonalba. Egy szakasz akkor is törölhető végleg,
ha nem hordoz hasznos információt.

Egy útszakasz mindig a *végpontja* állapotát viseli: ha egy pont elvetett,
akkor az odavezető szakasz is az.                                        */

export const REJECTED = 'rejected';

export const isRejected = (p) => !!p && p.status === REJECTED;

/** Egybefüggő, azonos állapotú vonaldarabok a rajzoláshoz. */
export function styledSegments(points) {
  const segs = [];
  for (let i = 1; i < points.length; i++) {
    const status = isRejected(points[i]) ? REJECTED : 'ok';
    const last = segs[segs.length - 1];
    if (last && last.status === status) last.pts.push(points[i]);
    else segs.push({ status, pts: [points[i - 1], points[i]] });
  }
  return segs;
}

/** Hossz állapotonként: { ok, rejected, total }. */
export function lengthByStatus(points) {
  const out = { ok: 0, rejected: 0, total: 0 };
  for (let i = 1; i < points.length; i++) {
    const d = haversine(points[i - 1], points[i]);
    out.total += d;
    if (isRejected(points[i])) out.rejected += d;
    else out.ok += d;
  }
  return out;
}

/** Az elvetett szakaszok listája indexhatárokkal, hosszal és indoklással. */
export function rejectedSections(points) {
  const out = [];
  let start = -1;
  for (let i = 0; i <= points.length; i++) {
    const rej = i < points.length && isRejected(points[i]);
    if (rej && start < 0) start = i;
    if (!rej && start >= 0) {
      const slice = points.slice(Math.max(0, start - 1), i);
      out.push({
        from: start,
        to: i - 1,
        count: i - start,
        length: trackLength(slice),
        reason: points[start].reason || '',
        t0: points[start].t,
        t1: points[i - 1].t,
      });
      start = -1;
    }
  }
  return out;
}

export function formatDistance(m) {
  if (!m || m < 1) return '0 m';
  if (m < 1000) return Math.round(m) + ' m';
  return (m / 1000).toFixed(m < 10000 ? 2 : 1).replace('.', ',') + ' km';
}

export function formatDuration(ms) {
  if (!ms || ms < 0) ms = 0;
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

export function formatCoord(lat, lon) {
  if (lat == null || lon == null) return '—';
  return `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
}

/**
 * Folyamatos GPS-rögzítő. A pontokat callbackkel adja tovább,
 * a hibás/pontatlan méréseket kiszűri.
 */
export class TrackRecorder {
  constructor({ onPoint, onError, minDistance = 4, maxAccuracy = 50 } = {}) {
    this.onPoint = onPoint || (() => {});
    this.onError = onError || (() => {});
    this.minDistance = minDistance;
    this.maxAccuracy = maxAccuracy;
    this.watchId = null;
    this.last = null;
    this.paused = false;
  }

  get running() {
    return this.watchId != null;
  }

  start() {
    if (!navigator.geolocation) {
      this.onError(new Error('A böngésző nem támogatja a helymeghatározást.'));
      return false;
    }
    if (this.watchId != null) return true;
    this.watchId = navigator.geolocation.watchPosition(
      (pos) => this._handle(pos),
      (err) => this.onError(err),
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 }
    );
    return true;
  }

  stop() {
    if (this.watchId != null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
  }

  _handle(pos) {
    const c = pos.coords;
    const pt = {
      t: pos.timestamp || Date.now(),
      lat: c.latitude,
      lon: c.longitude,
      acc: c.accuracy == null ? null : Math.round(c.accuracy),
      alt: c.altitude == null ? null : Math.round(c.altitude),
      speed: c.speed == null ? null : c.speed,
      heading: c.heading == null ? null : c.heading,
    };
    this.current = pt;
    if (this.paused) return;
    if (pt.acc != null && pt.acc > this.maxAccuracy) return; // túl pontatlan
    if (this.last) {
      const d = haversine(this.last, pt);
      if (d < this.minDistance) return; // álló helyzet, ne szemetelje tele
      pt.step = d;
      if (pt.heading == null) pt.heading = bearing(this.last, pt);
    } else {
      pt.step = 0;
    }
    this.last = pt;
    this.onPoint(pt);
  }
}

/** Egyszeri pozíciólekérés (fotóhoz, hangjegyzethez). */
export function currentPosition(timeout = 8000) {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          acc: pos.coords.accuracy == null ? null : Math.round(pos.coords.accuracy),
          heading: pos.coords.heading,
          t: pos.timestamp || Date.now(),
        }),
      () => resolve(null),
      { enableHighAccuracy: true, maximumAge: 5000, timeout }
    );
  });
}

/* ------------------------------------------------------- térkép rajzolás */

/**
 * A nyomvonal kirajzolása vászonra (külső térképszolgáltatás nélkül,
 * így offline is működik). Visszaadja a vetítő függvényt, hogy a
 * hívó a markerekre tudjon kattintást kezelni.
 */
export function renderTrack(canvas, points, markers = [], opts = {}) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || 320;
  const h = canvas.clientHeight || 220;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const css = getComputedStyle(document.documentElement);
  const bg = opts.bg || css.getPropertyValue('--map-bg').trim() || '#0f1621';
  const line = opts.line || css.getPropertyValue('--accent').trim() || '#4da3ff';
  const dim = css.getPropertyValue('--muted').trim() || '#8b98a9';

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  const coords = points.filter((p) => p.lat != null && p.lon != null);
  const markerPts = markers.filter((m) => m.lat != null && m.lon != null);
  const drawn = opts.drawn || [];        // kézzel berajzolt szakaszok
  const draft = opts.draft || null;      // éppen rajzolt szakasz
  const drawnPts = drawn.flatMap((s) => s.pts).concat(draft ? draft.pts || [] : []);
  const all = coords.concat(markerPts, drawnPts);

  if (!all.length) {
    ctx.fillStyle = dim;
    ctx.font = '13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Nincs rögzített nyomvonal', w / 2, h / 2);
    return { project: null };
  }

  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
  for (const p of all) {
    minLat = Math.min(minLat, p.lat); maxLat = Math.max(maxLat, p.lat);
    minLon = Math.min(minLon, p.lon); maxLon = Math.max(maxLon, p.lon);
  }
  const midLat = (minLat + maxLat) / 2;
  const kx = Math.cos((midLat * Math.PI) / 180); // hosszúsági fok rövidülése

  // méterben mért kiterjedés
  let spanX = Math.max((maxLon - minLon) * kx, 1e-6);
  let spanY = Math.max(maxLat - minLat, 1e-6);
  const pad = 22;
  const scale = Math.min((w - 2 * pad) / spanX, (h - 2 * pad) / spanY);
  const cx = (minLon + maxLon) / 2;
  const cy = (minLat + maxLat) / 2;

  // a nagyítás/mozgatás az illesztett nézetre ül rá
  const view = opts.view || { k: 1, tx: 0, ty: 0 };
  const project = (lat, lon) => ({
    x: (w / 2 + (lon - cx) * kx * scale) * view.k + view.tx,
    y: (h / 2 - (lat - cy) * scale) * view.k + view.ty,
  });

  const rejectColor = opts.rejectLine || '#ff8a4d';
  const lineW = (opts.lineWidth || 4) * Math.min(2, Math.max(1, view.k * 0.5 + 0.5));

  // nyomvonal — az elvetett szakaszok szaggatottan, eltérő színnel
  if (coords.length > 1) {
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    for (const seg of styledSegments(coords)) {
      const rejected = seg.status === REJECTED;
      ctx.setLineDash(rejected ? [lineW * 2, lineW * 1.6] : []);
      ctx.strokeStyle = rejected ? rejectColor : line;
      ctx.globalAlpha = rejected ? 0.85 : 1;
      ctx.lineWidth = rejected ? lineW * 0.8 : lineW;
      ctx.beginPath();
      seg.pts.forEach((p, i) => {
        const { x, y } = project(p.lat, p.lon);
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      });
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    // haladási irány halvány nyilakkal a nyomvonalon
    ctx.globalAlpha = 0.45;
    const every = Math.max(1, Math.floor(coords.length / 8));
    for (let i = every; i < coords.length; i += every) {
      const a = project(coords[i - 1].lat, coords[i - 1].lon);
      const b = project(coords[i].lat, coords[i].lon);
      ctx.fillStyle = isRejected(coords[i]) ? rejectColor : line;
      drawArrowHead(ctx, a, b, 9);
    }
    ctx.globalAlpha = 1;

    // kijelölt szakasz kiemelése a szerkesztőben
    const sel = opts.selection;
    if (sel && sel.to >= sel.from) {
      const slice = coords.slice(sel.from, sel.to + 1);
      ctx.strokeStyle = opts.selectColor || '#ffd60a';
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = lineW * 2.6;
      ctx.beginPath();
      slice.forEach((p, i) => {
        const { x, y } = project(p.lat, p.lon);
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      });
      if (slice.length === 1) {
        const { x, y } = project(slice[0].lat, slice[0].lon);
        ctx.arc(x, y, lineW * 1.4, 0, Math.PI * 2);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;

      // fogópontok a szakasz két végén
      for (const [idx, label] of [[sel.from, 'A'], [sel.to, 'B']]) {
        const p = coords[idx];
        if (!p) continue;
        const s = project(p.lat, p.lon);
        dot(ctx, s, 10, '#ffd60a', '#0b0f16');
        ctx.fillStyle = '#0b0f16';
        ctx.font = 'bold 11px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, s.x, s.y + 0.5);
      }
      ctx.textBaseline = 'alphabetic';
    }

    // start / cél
    const s = project(coords[0].lat, coords[0].lon);
    const e = project(coords[coords.length - 1].lat, coords[coords.length - 1].lon);
    dot(ctx, s, 6, '#3ddc84');
    dot(ctx, e, 6, '#ff5f56');
  }

  // kézzel berajzolt szakaszok — ott, ahol nincs GPS-nyom, de ez a helyes út
  const drawColor = opts.drawnLine || '#3ddc84';
  const drawPoly = (pts, { color, width, dash, alpha = 1, vertices = false }) => {
    if (!pts || pts.length < 2) {
      if (pts && pts.length === 1) {
        dot(ctx, project(pts[0].lat, pts[0].lon), 5, color, '#0b0f16');
      }
      return;
    }
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.setLineDash(dash || []);
    ctx.lineJoin = ctx.lineCap = 'round';
    ctx.beginPath();
    pts.forEach((p, i) => {
      const s = project(p.lat, p.lon);
      i ? ctx.lineTo(s.x, s.y) : ctx.moveTo(s.x, s.y);
    });
    ctx.stroke();
    ctx.setLineDash([]);
    if (vertices) for (const p of pts) dot(ctx, project(p.lat, p.lon), 4, color, '#0b0f16');
    ctx.restore();
  };

  for (const seg of drawn) {
    const selected = opts.selectedDrawn === seg.id;
    drawPoly(seg.pts, {
      color: selected ? '#ffd60a' : drawColor,
      width: selected ? lineW * 1.8 : lineW,
      vertices: selected,
    });
  }
  if (draft) {
    drawPoly(draft.pts, { color: drawColor, width: lineW, dash: [2, lineW * 1.6], vertices: true });
  }

  // elem-markerek
  const hitboxes = [];
  markerPts.forEach((m) => {
    const p = project(m.lat, m.lon);
    const color = m.type === 'audio' ? '#ffbe4d' : m.type === 'note' ? '#c58cff' : '#ffffff';
    dot(ctx, p, 5, color, '#0b0f16');
    hitboxes.push({ id: m.id, x: p.x, y: p.y, r: 12 });
  });

  drawScaleBar(ctx, w, h, scale * view.k, kx, dim);
  drawNorth(ctx, w, dim);

  /** A képernyőponthoz legközelebbi nyomvonalpont indexe. */
  const nearest = (x, y) => {
    let best = -1, bestD = Infinity;
    for (let i = 0; i < coords.length; i++) {
      const p = project(coords[i].lat, coords[i].lon);
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < bestD) { bestD = d; best = i; }
    }
    return { index: best, distance: bestD };
  };

  /** Képernyőpont vissza földrajzi koordinátává (rajzoláshoz). */
  const unproject = (x, y) => ({
    lon: cx + ((x - view.tx) / view.k - w / 2) / (kx * scale),
    lat: cy - ((y - view.ty) / view.k - h / 2) / scale,
  });

  /** A legközelebbi berajzolt szakasz-csúcs (illesztéshez, kijelöléshez). */
  const nearestDrawn = (x, y) => {
    let best = null, bestD = Infinity;
    for (const seg of drawn) {
      seg.pts.forEach((pt, i) => {
        const p = project(pt.lat, pt.lon);
        const d = Math.hypot(p.x - x, p.y - y);
        if (d < bestD) { bestD = d; best = { id: seg.id, index: i, point: pt }; }
      });
    }
    return best ? { ...best, distance: bestD } : { distance: Infinity };
  };

  return { project, unproject, hitboxes, nearest, nearestDrawn, coords };
}

/** Kézzel berajzolt szakaszok együttes hossza. */
export function drawnLength(list = []) {
  return list.reduce((sum, s) => sum + trackLength(s.pts || []), 0);
}

function dot(ctx, p, r, fill, stroke) {
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.lineWidth = 2;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
}

function drawArrowHead(ctx, a, b, size) {
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.rotate(ang);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-size, size * 0.55);
  ctx.lineTo(-size, -size * 0.55);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawScaleBar(ctx, w, h, scale, kx, color) {
  // scale: képpont / fok(lat). 1 fok lat ≈ 111320 m
  const pxPerMeter = scale / 111320;
  const targets = [10, 25, 50, 100, 250, 500, 1000, 2000, 5000, 10000];
  let meters = targets[targets.length - 1];
  for (const t of targets) {
    if (t * pxPerMeter > 55) { meters = t; break; }
  }
  const len = meters * pxPerMeter;
  if (!isFinite(len) || len < 10) return;
  const x = 12, y = h - 14;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y - 5); ctx.lineTo(x, y); ctx.lineTo(x + len, y); ctx.lineTo(x + len, y - 5);
  ctx.stroke();
  ctx.font = '11px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(meters >= 1000 ? meters / 1000 + ' km' : meters + ' m', x, y - 8);
}

function drawNorth(ctx, w, color) {
  const x = w - 20, y = 22;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y + 10); ctx.lineTo(x, y - 10);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x, y - 14); ctx.lineTo(x - 4, y - 6); ctx.lineTo(x + 4, y - 6);
  ctx.closePath();
  ctx.fill();
  ctx.font = '10px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('É', x, y + 22);
  ctx.restore();
}

/* --------------------------------------------------------------- export */

const esc = (s) =>
  String(s == null ? '' : s).replace(/[<>&'"]/g, (c) =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c])
  );

export function toGPX(session, points, items = []) {
  const iso = (t) => new Date(t).toISOString();
  const wpts = items
    .filter((i) => i.lat != null && i.lon != null)
    .map(
      (i) => `  <wpt lat="${i.lat}" lon="${i.lon}">
    <time>${iso(i.created)}</time>
    <name>${esc(i.title || typeLabel(i.type))}</name>
    <desc>${esc(describeItem(i))}</desc>
    <sym>${i.type === 'photo' ? 'Photo' : 'Flag'}</sym>
  </wpt>`
    )
    .join('\n');

  const trkpt = (p) =>
    `      <trkpt lat="${p.lat}" lon="${p.lon}">${
      p.alt != null ? `<ele>${p.alt}</ele>` : ''
    }<time>${iso(p.t)}</time></trkpt>`;

  // Az érvényes útvonal a fő nyomvonal; ahol elvetett szakasz szakítja meg,
  // ott új trkseg kezdődik, hogy ne rajzolódjon át rajta egyenes.
  const validSegs = [];
  let run = [];
  for (const p of points) {
    if (isRejected(p)) {
      if (run.length > 1) validSegs.push(run);
      run = [];
    } else {
      run.push(p);
    }
  }
  if (run.length > 1) validSegs.push(run);

  const mainTrack = `  <trk>
    <name>${esc(session.name)}</name>
    <desc>Érvényes útvonal</desc>
${validSegs.map((seg) => `    <trkseg>\n${seg.map(trkpt).join('\n')}\n    </trkseg>`).join('\n')}
  </trk>`;

  // Az elvetett szakaszok külön nyomvonalként maradnak benne, hogy az
  // információ ne vesszen el, de ne keveredjen az érvényes útvonallal.
  const rejectedTracks = rejectedSections(points)
    .map((sec, i) => {
      const seg = points.slice(sec.from, sec.to + 1);
      if (seg.length < 2) return '';
      return `  <trk>
    <name>Elvetett szakasz ${i + 1}${sec.reason ? ' — ' + esc(sec.reason) : ''}</name>
    <desc>${esc(sec.reason || 'Nem járható / nem ez a végleges útvonal')} (${Math.round(sec.length)} m)</desc>
    <type>rejected</type>
    <trkseg>
${seg.map(trkpt).join('\n')}
    </trkseg>
  </trk>`;
    })
    .filter(Boolean)
    .join('\n');

  // Kézzel berajzolt szakaszok: ahol nem volt GPS-nyom, de ez a helyes út.
  const drawnTracks = (session.drawn || [])
    .filter((seg) => (seg.pts || []).length > 1)
    .map(
      (seg) => `  <trk>
    <name>Berajzolt szakasz${seg.name ? ' — ' + esc(seg.name) : ''}</name>
    <desc>${esc(seg.note || 'Térképen kézzel megadott útvonalszakasz')} (${Math.round(trackLength(seg.pts))} m)</desc>
    <type>drawn</type>
    <trkseg>
${seg.pts.map((p) => `      <trkpt lat="${p.lat}" lon="${p.lon}"></trkpt>`).join('\n')}
    </trkseg>
  </trk>`
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Útvonalbejárás" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${esc(session.name)}</name>
    <time>${iso(session.created)}</time>
    <desc>${esc(session.note)}</desc>
  </metadata>
${wpts}
${mainTrack}
${drawnTracks}
${rejectedTracks}
</gpx>`;
}

export function typeLabel(type) {
  return type === 'photo' ? 'Fotó' : type === 'audio' ? 'Hangjegyzet' : 'Jegyzet';
}

export function describeItem(i) {
  const parts = [];
  if (i.note) parts.push(i.note);
  if (i.dims && i.dims.length) parts.push('Méretek: ' + i.dims.join('; '));
  return parts.join(' | ');
}
