// Önálló térképfájl a nyomvonalról.
//
// A „Pontos nyomvonal térképen” eddig a geojson.io oldalra vitte az adatot a
// hivatkozás horgonyában. Az külső oldal, a formátuma bármikor változhat —
// és változott is: a hosszabb nyomvonalat elvágta, hibát írt ki.
//
// Ehelyett az app maga készít egy önálló HTML-fájlt: benne a nyomvonal, az
// elvetett és a térképen megadott szakaszok, a rögzített elemek, alatta
// OpenStreetMap-alaptérkép. Nagyítható, mozgatható, bármelyik böngészőben
// megnyitható, és elküldhető — az adat nem megy át idegen kiszolgálón.

import { trackLength, formatDistance, typeLabel, isRejected, REJECTED } from './geo.js';
import { tileUrlTemplate, ATTRIBUTION } from './tiles.js';

const mapEsc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

/** Egybefüggő szakaszok állapot szerint (ok / elvetett / kimaradás). */
function segments(points) {
  const out = [];
  let cur = null;
  for (const p of points) {
    if (p.lat == null || p.lon == null) continue;
    const status = isRejected(p) ? REJECTED : p.gap ? 'gap' : 'ok';
    if (!cur || cur.status !== status) {
      // a szakaszok érjenek össze: az előző utolsó pontja az új első pontja
      const prev = cur && cur.pts.length ? cur.pts[cur.pts.length - 1] : null;
      cur = { status, pts: prev && status !== 'gap' ? [prev] : [] };
      out.push(cur);
    }
    cur.pts.push([Number(p.lat.toFixed(6)), Number(p.lon.toFixed(6))]);
  }
  return out.filter((s) => s.pts.length > 1);
}

export function buildMapPage(session, points, items) {
  const data = {
    nev: session.name || 'Bejárás',
    hossz: formatDistance(trackLength(points.filter((p) => !isRejected(p)))),
    csempe: tileUrlTemplate(),
    kozeplat: (function () {
      const ls = points.filter((p) => p.lat != null).map((p) => p.lat);
      return ls.length ? Number((ls.reduce((a, b) => a + b, 0) / ls.length).toFixed(4)) : 47.5;
    })(),
    forras: ATTRIBUTION,
    vonalak: segments(points).map((s) => ({ allapot: s.status, pts: s.pts })),
    rajzolt: (session.drawn || []).map((d) => ({
      nev: d.nev || d.name || '',
      pts: (d.pts || []).filter((p) => p.lat != null).map((p) => [Number(p.lat.toFixed(6)), Number(p.lon.toFixed(6))]),
    })).filter((d) => d.pts.length > 1),
    elemek: items.filter((i) => i.lat != null).map((i, n) => ({
      n: n + 1,
      lat: Number(i.lat.toFixed(6)),
      lon: Number(i.lon.toFixed(6)),
      tipus: i.type,
      cim: i.title || typeLabel(i.type),
      leiras: [i.what, (i.dims || []).join(' · '), i.note].filter(Boolean).join(' · '),
      irany: i.heading == null ? null : Math.round(i.heading),
    })),
  };

  return `<!DOCTYPE html>
<html lang="hu">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${mapEsc(data.nev)} — nyomvonal térképen</title>
<style>
  html, body { margin:0; height:100%; background:#eef2f7; color:#13202e;
               font:14px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; }
  #wrap { position:fixed; inset:0; display:flex; flex-direction:column; }
  header { padding:8px 12px; background:#fff; border-bottom:1px solid #d7dee8;
           display:flex; gap:10px; align-items:baseline; flex-wrap:wrap; }
  header b { font-size:15px; }
  header span { color:#5d6b7d; font-size:13px; }
  #stage { position:relative; flex:1; min-height:0; }
  canvas { width:100%; height:100%; display:block; touch-action:none; }
  .zoom { position:absolute; right:10px; bottom:14px; display:flex; flex-direction:column; gap:6px; }
  .zoom button { width:40px; height:40px; font-size:19px; border-radius:10px; cursor:pointer;
                 border:1px solid #c8d2e0; background:rgba(255,255,255,.92); }
  #info { position:absolute; left:10px; right:60px; bottom:14px; background:rgba(255,255,255,.96);
          border:1px solid #c8d2e0; border-radius:10px; padding:9px 12px; display:none; }
  #info.on { display:block; }
  #info b { display:block; }
  #info small { color:#5d6b7d; }
  #info button { float:right; border:0; background:none; font-size:17px; cursor:pointer; }
  .legend { padding:6px 12px; background:#fff; border-top:1px solid #d7dee8; color:#5d6b7d; font-size:12.5px; }
</style>
</head>
<body>
<div id="wrap">
  <header><b>${mapEsc(data.nev)}</b><span>${mapEsc(data.hossz)} érvényes útvonal</span></header>
  <div id="stage">
    <canvas id="c"></canvas>
    <div class="zoom">
      <button id="in" title="Nagyítás" aria-label="Nagyítás">+</button>
      <button id="out" title="Kicsinyítés" aria-label="Kicsinyítés">−</button>
      <button id="fit" title="Teljes nyomvonal" aria-label="Teljes nyomvonal">⤢</button>
    </div>
    <div id="info"><button id="x" aria-label="Bezárás">✕</button><b></b><small></small></div>
  </div>
  <p class="legend">Kék: érvényes útvonal · narancs szaggatott: elvetett szakasz ·
     zöld: térképen megadott szakasz · pont: rögzített elem (koppintásra megnyílik). Térkép: ${mapEsc(data.forras)}</p>
</div>
<script>
var D = ${JSON.stringify(data)};
var TS = 256, MINK = 1, MAXK = 2000;
var c = document.getElementById('c'), g = c.getContext('2d');
var view = { k: 1, tx: 0, ty: 0 }, hits = [], tiles = {}, pending = 0;

function merc(lat, lon) {
  var s = Math.sin(lat * Math.PI / 180);
  s = Math.max(-0.9999, Math.min(0.9999, s));
  return { x: (lon + 180) / 360, y: 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI) };
}
function allPts() {
  var a = [];
  D.vonalak.forEach(function (v) { a = a.concat(v.pts); });
  D.rajzolt.forEach(function (v) { a = a.concat(v.pts); });
  D.elemek.forEach(function (e) { a.push([e.lat, e.lon]); });
  return a;
}
var box = (function () {
  var p = allPts(), b = { x0: 1, x1: 0, y0: 1, y1: 0 };
  if (!p.length) return { x0: 0, x1: 1, y0: 0, y1: 1 };
  p.forEach(function (q) {
    var m = merc(q[0], q[1]);
    b.x0 = Math.min(b.x0, m.x); b.x1 = Math.max(b.x1, m.x);
    b.y0 = Math.min(b.y0, m.y); b.y1 = Math.max(b.y1, m.y);
  });
  return b;
})();

var W = 0, H = 0, scale = 1, cx = 0, cy = 0;
function layout() {
  var dpr = window.devicePixelRatio || 1;
  W = c.clientWidth; H = c.clientHeight;
  c.width = Math.round(W * dpr); c.height = Math.round(H * dpr);
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  var sx = Math.max(box.x1 - box.x0, 1e-9), sy = Math.max(box.y1 - box.y0, 1e-9);
  scale = Math.min((W - 44) / sx, (H - 44) / sy);
  cx = (box.x0 + box.x1) / 2; cy = (box.y0 + box.y1) / 2;
}
function w2s(x, y) {
  return { x: (W / 2 + (x - cx) * scale) * view.k + view.tx,
           y: (H / 2 + (y - cy) * scale) * view.k + view.ty };
}
function s2w(x, y) {
  return { x: cx + ((x - view.tx) / view.k - W / 2) / scale,
           y: cy + ((y - view.ty) / view.k - H / 2) / scale };
}
function pr(lat, lon) { var m = merc(lat, lon); return w2s(m.x, m.y); }

function tile(z, x, y) {
  var n = Math.pow(2, z);
  if (y < 0 || y >= n) return null;
  var wx = ((x % n) + n) % n, key = z + '/' + wx + '/' + y, t = tiles[key];
  if (t) return t.ok ? t.img : null;
  var url = D.csempe.replace('{z}', z).replace('{x}', wx).replace('{y}', y);
  var img = new Image();
  tiles[key] = { img: img, ok: false };
  pending++;
  img.onload = function () { tiles[key].ok = true; pending--; draw(); };
  // CORS-szal kérjük (így a vászon nem szennyeződik), de ha a csempeszerver
  // nem küld CORS-fejlécet, egyszer megpróbáljuk anélkül is
  img.onerror = function () {
    pending--;
    if (img.crossOrigin) {
      var plain = new Image();
      tiles[key] = { img: plain, ok: false };
      pending++;
      plain.onload = function () { tiles[key].ok = true; pending--; draw(); };
      plain.onerror = function () { pending--; };
      plain.src = url;
    }
  };
  img.crossOrigin = 'anonymous';
  img.src = url;
  return null;
}
function paintTiles(px) {
  var z = Math.max(0, Math.min(19, Math.round(Math.log2(px / TS))));
  var n = Math.pow(2, z), tp = px / n;
  if (!isFinite(tp) || tp < 1) return;
  var a = s2w(0, 0), b = s2w(W, H);
  var x0 = Math.floor(a.x * n), x1 = Math.ceil(b.x * n);
  var y0 = Math.max(0, Math.floor(a.y * n)), y1 = Math.min(n - 1, Math.ceil(b.y * n));
  if ((x1 - x0) * (y1 - y0) > 400) return;
  for (var x = x0; x <= x1; x++) {
    for (var y = y0; y <= y1; y++) {
      var img = tile(z, x, y);
      if (!img) continue;
      var p = w2s(x / n, y / n);
      g.drawImage(img, Math.floor(p.x), Math.floor(p.y), Math.ceil(tp) + 1, Math.ceil(tp) + 1);
    }
  }
}
function stroke(pts, color, width, dash) {
  if (pts.length < 2) return;
  g.save();
  g.strokeStyle = color; g.lineWidth = width; g.lineJoin = 'round'; g.lineCap = 'round';
  g.setLineDash(dash || []);
  g.beginPath();
  for (var i = 0; i < pts.length; i++) {
    var p = pr(pts[i][0], pts[i][1]);
    if (i) g.lineTo(p.x, p.y); else g.moveTo(p.x, p.y);
  }
  g.stroke();
  g.restore();
}
function marker(p, r, fill) {
  g.beginPath(); g.arc(p.x, p.y, r, 0, Math.PI * 2);
  g.fillStyle = fill; g.fill();
  g.lineWidth = 2; g.strokeStyle = '#fff'; g.stroke();
}
function scalebar(px) {
  var mPerPx = 40075016.686 * Math.cos((D.kozeplat || 47.5) * Math.PI / 180) / px;
  var target = 90 * mPerPx, pow = Math.pow(10, Math.floor(Math.log10(target)));
  var nice = [1, 2, 5, 10].map(function (f) { return f * pow; })
    .filter(function (v) { return v >= target * 0.6; })[0] || pow;
  var w = nice / mPerPx;
  g.save();
  g.strokeStyle = '#1b1b1b'; g.fillStyle = '#1b1b1b'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(14, H - 14); g.lineTo(14 + w, H - 14);
  g.moveTo(14, H - 19); g.lineTo(14, H - 9);
  g.moveTo(14 + w, H - 19); g.lineTo(14 + w, H - 9);
  g.stroke();
  g.font = '12px system-ui, sans-serif';
  g.fillText(nice >= 1000 ? (nice / 1000) + ' km' : nice + ' m', 14, H - 22);
  g.restore();
}
function draw() {
  layout();
  g.fillStyle = '#eef2f7'; g.fillRect(0, 0, W, H);
  var px = scale * view.k;
  paintTiles(px);
  var lw = Math.max(3, Math.min(8, 4 * Math.sqrt(view.k)));
  D.vonalak.forEach(function (v) {
    if (v.allapot === 'ok') stroke(v.pts, '#0a6ed1', lw);
    else if (v.allapot === '${REJECTED}') stroke(v.pts, '#c2410c', lw * 0.85, [lw * 2, lw * 1.6]);
    else stroke(v.pts, '#8b98a9', lw * 0.5, [1.5, lw * 1.8]);
  });
  D.rajzolt.forEach(function (v) { stroke(v.pts, '#1a7f45', lw); });
  hits = [];
  D.elemek.forEach(function (e) {
    var p = pr(e.lat, e.lon);
    if (e.irany != null) {
      g.save(); g.translate(p.x, p.y); g.rotate(e.irany * Math.PI / 180);
      g.beginPath(); g.moveTo(0, -20); g.lineTo(-8, 7); g.lineTo(0, 3); g.lineTo(8, 7);
      g.closePath(); g.globalAlpha = 0.8; g.fillStyle = '#0a6ed1'; g.fill();
      g.globalAlpha = 1; g.lineWidth = 1.2; g.strokeStyle = '#fff'; g.stroke(); g.restore();
    }
    marker(p, 7, '#0a6ed1');
    g.fillStyle = '#fff'; g.font = 'bold 11px system-ui, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(String(e.n), p.x, p.y + 0.5);
    g.textAlign = 'start'; g.textBaseline = 'alphabetic';
    hits.push({ x: p.x, y: p.y, r: 15, e: e });
  });
  scalebar(px);
}

/* ------------------------------------------- nagyítás, mozgatás */
function zoomAt(ax, ay, k) {
  k = Math.max(MINK, Math.min(MAXK, k));
  var r = k / view.k;
  view.tx = ax - (ax - view.tx) * r;
  view.ty = ay - (ay - view.ty) * r;
  view.k = k;
  draw();
}
var ptrs = {}, count = 0, pinch = null, start = null, moved = false;
function local(e) { var r = c.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
c.addEventListener('pointerdown', function (e) {
  c.setPointerCapture(e.pointerId);
  ptrs[e.pointerId] = local(e); count++;
  if (count === 2) {
    var k = Object.keys(ptrs), a = ptrs[k[0]], b = ptrs[k[1]];
    pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), k: view.k }; moved = true;
  } else { start = local(e); moved = false; var v = view; pinch = null; start.tx = v.tx; start.ty = v.ty; }
});
c.addEventListener('pointermove', function (e) {
  if (!ptrs[e.pointerId]) return;
  ptrs[e.pointerId] = local(e);
  var k = Object.keys(ptrs);
  if (count === 2 && pinch) {
    var a = ptrs[k[0]], b = ptrs[k[1]];
    var d = Math.hypot(a.x - b.x, a.y - b.y);
    zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, pinch.k * (d / (pinch.d || 1)));
    return;
  }
  if (!start) return;
  var p = local(e), dx = p.x - start.x, dy = p.y - start.y;
  if (Math.hypot(dx, dy) > 7) moved = true;
  if (moved) { view.tx = start.tx + dx; view.ty = start.ty + dy; draw(); }
});
function up(e) {
  var p = ptrs[e.pointerId];
  delete ptrs[e.pointerId]; count = Math.max(0, count - 1);
  if (count < 2) pinch = null;
  if (count === 0) {
    if (!moved && p) pick(p);
    start = null;
  }
}
c.addEventListener('pointerup', up);
c.addEventListener('pointercancel', up);
c.addEventListener('wheel', function (e) {
  e.preventDefault();
  var p = local(e);
  zoomAt(p.x, p.y, view.k * (e.deltaY < 0 ? 1.25 : 1 / 1.25));
}, { passive: false });
c.addEventListener('dblclick', function (e) { var p = local(e); zoomAt(p.x, p.y, view.k * 2); });

function pick(p) {
  var best = null, bd = 1e9;
  hits.forEach(function (h) {
    var d = Math.hypot(h.x - p.x, h.y - p.y);
    if (d < h.r && d < bd) { bd = d; best = h.e; }
  });
  var box = document.getElementById('info');
  if (!best) { box.className = ''; return; }
  box.querySelector('b').textContent = best.n + '. ' + best.cim;
  box.querySelector('small').textContent =
    [best.leiras, best.lat.toFixed(6) + ', ' + best.lon.toFixed(6),
     best.irany != null ? 'kameairány: ' + best.irany + '°' : ''].filter(Boolean).join(' · ');
  box.className = 'on';
}
document.getElementById('x').onclick = function () { document.getElementById('info').className = ''; };
document.getElementById('in').onclick = function () { zoomAt(W / 2, H / 2, view.k * 1.6); };
document.getElementById('out').onclick = function () { zoomAt(W / 2, H / 2, view.k / 1.6); };
document.getElementById('fit').onclick = function () { view = { k: 1, tx: 0, ty: 0 }; draw(); };
window.addEventListener('resize', draw);
draw();
<\/script>
</body>
</html>`;
}
