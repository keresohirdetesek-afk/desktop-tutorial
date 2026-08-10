// Földrajzi és formázó segédfüggvények. Minden számítás a böngészőben fut.

const R = 6371000; // Föld sugara méterben
const RAD = Math.PI / 180;

export function haversine(a, b) {
  const dLat = (b.lat - a.lat) * RAD;
  const dLon = (b.lon - a.lon) * RAD;
  const la1 = a.lat * RAD;
  const la2 = b.lat * RAD;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/* Rövid távokon (néhány száz méter) a gömbi számítás helyett elég a helyi
   síkvetület: a hosszúsági fokot a szélesség koszinuszával zsugorítjuk.
   Így a pont–szakasz távolság egyszerű vektorműveletté válik.          */
function planar(p, lat0) {
  return { x: p.lon * RAD * Math.cos(lat0 * RAD) * R, y: p.lat * RAD * R };
}

/** Egy pont távolsága az a–b szakasztól, méterben. */
export function pointToSegment(p, a, b) {
  const P = planar(p, p.lat);
  const A = planar(a, p.lat);
  const B = planar(b, p.lat);
  const vx = B.x - A.x;
  const vy = B.y - A.y;
  const len2 = vx * vx + vy * vy;
  let t = 0;
  if (len2 > 0) t = ((P.x - A.x) * vx + (P.y - A.y) * vy) / len2;
  t = Math.max(0, Math.min(1, t));
  const dx = P.x - (A.x + t * vx);
  const dy = P.y - (A.y + t * vy);
  return Math.sqrt(dx * dx + dy * dy);
}

/** Halmozott távolságok a nyomvonal mentén (az első elem mindig 0). */
export function cumulative(points) {
  const out = [0];
  for (let i = 1; i < points.length; i++) out.push(out[i - 1] + haversine(points[i - 1], points[i]));
  return out;
}

export function trackLength(points) {
  const c = cumulative(points);
  return c[c.length - 1] || 0;
}

/** Ritkított pontlista: legalább `minMeters` távolságra követik egymást. */
export function decimate(points, minMeters) {
  if (points.length === 0) return [];
  const out = [points[0]];
  for (const p of points) {
    if (haversine(out[out.length - 1], p) >= minMeters) out.push(p);
  }
  const last = points[points.length - 1];
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

/* ------------------------------------------------------------ formázás */

export function fmtSpeed(kmh) {
  if (!isFinite(kmh) || kmh < 0) return '—';
  return (kmh < 100 ? kmh.toFixed(1) : Math.round(kmh).toString()).replace('.', ',');
}

/** Mindig egy tizedessel — ahol a mért érték és a túllépés együtt szerepel,
    a kettő így ad ki pontosan kerek különbséget. */
export function fmtSpeed1(kmh) {
  if (!isFinite(kmh)) return '—';
  return kmh.toFixed(1).replace('.', ',');
}

export function fmtDistance(m) {
  if (!isFinite(m)) return '—';
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(m < 10000 ? 2 : 1).replace('.', ',')} km`;
}

/** Időtartam ezredmásodpercből: 1:23:45 vagy 23:45 alakban. */
export function fmtDuration(ms) {
  if (!isFinite(ms) || ms < 0) return '—';
  const s = Math.round(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

/** Emberi szöveg időtartamra: „2 perc 25 mp”. */
export function fmtDurationWords(ms) {
  const s = Math.round(Math.abs(ms) / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const parts = [];
  if (h) parts.push(`${h} óra`);
  if (m) parts.push(`${m} perc`);
  if (sec || parts.length === 0) parts.push(`${sec} mp`);
  return parts.join(' ');
}

export function fmtForint(n) {
  return `${Math.round(n).toLocaleString('hu-HU')} Ft`;
}

/** Sebesség km/h-ban két időbélyeges pont között (0, ha nincs eltelt idő). */
export function speedBetween(a, b) {
  const dt = (b.t - a.t) / 1000;
  if (dt <= 0) return 0;
  return (haversine(a, b) / dt) * 3.6;
}
