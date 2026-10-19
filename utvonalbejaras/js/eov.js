// GPS-koordináta átszámítása EOV-ba (Egységes Országos Vetület, EPSG:23700).
//
// A Magyar Közút útszámkeresője (utszamkereso.kozut.hu) a koordinátakeresőben
// EOV Y és X értéket vár — abból mondja meg az útszámot és a szelvényt, ami a
// bejárási dokumentumokhoz kell. A telefon GPS-e viszont WGS84 szerinti
// szélességet és hosszúságot ad, ezért itt számoljuk át.
//
// Lépések: WGS84 földrajzi → geocentrikus → HD72 (GRS67) eltolással →
// földrajzi → ferde tengelyű, szögtartó hengervetület (somerc).
// A képletek a szokásos EPSG:23700 paraméterekkel dolgoznak:
//   +proj=somerc +lat_0=47.144393722 +lon_0=19.048571778 +k_0=0.99993
//   +x_0=650000 +y_0=200000 +ellps=GRS67 +towgs84=52.17,-71.82,-14.9
//
// Ellenőrzés (az útszámkereső adata): 47.376131, 18.190796 →
// y = 585310.16, x = 226147.28 — ettől a számításunk 10 cm-en belül van.

const RAD = Math.PI / 180;

/** @returns {{y: number, x: number}} EOV koordináta méterben */
export function wgs84ToEov(lat, lon) {
  // 1. WGS84 földrajzi → geocentrikus (a tengerszint feletti magasságtól
  //    vízszintben alig függ, ezért h = 0)
  const aW = 6378137.0;
  const e2W = (1 / 298.257223563) * (2 - 1 / 298.257223563);
  const sl = Math.sin(lat * RAD);
  const cl = Math.cos(lat * RAD);
  const Nw = aW / Math.sqrt(1 - e2W * sl * sl);
  const X = Nw * cl * Math.cos(lon * RAD) - 52.17;
  const Y = Nw * cl * Math.sin(lon * RAD) + 71.82;
  const Z = Nw * (1 - e2W) * sl + 14.9;

  // 2. geocentrikus → GRS67 (HD72) földrajzi
  const a = 6378160.0;
  const f = 1 / 298.247167427;
  const e2 = f * (2 - f);
  const p = Math.hypot(X, Y);
  let phi = Math.atan2(Z, p * (1 - e2));
  for (let i = 0; i < 6; i++) {
    const s = Math.sin(phi);
    const N = a / Math.sqrt(1 - e2 * s * s);
    const h = p / Math.cos(phi) - N;
    phi = Math.atan2(Z, p * (1 - (e2 * N) / (N + h)));
  }
  const lam = Math.atan2(Y, X);

  // 3. vetületbe: Gauss-gömb, majd ferde tengelyű henger
  const lat0 = 47.14439372222222 * RAD;
  const lon0 = 19.04857177777778 * RAD;
  const k0 = 0.99993;
  const e = Math.sqrt(e2);
  const c = Math.sqrt(1 + (e2 * Math.cos(lat0) ** 4) / (1 - e2));
  const b0 = Math.asin(Math.sin(lat0) / c);
  const iso = (p0) => Math.log(Math.tan(Math.PI / 4 + p0 / 2))
    - (e / 2) * Math.log((1 + e * Math.sin(p0)) / (1 - e * Math.sin(p0)));
  const K = Math.log(Math.tan(Math.PI / 4 + b0 / 2)) - c * iso(lat0);
  const R = (k0 * a * Math.sqrt(1 - e2)) / (1 - e2 * Math.sin(lat0) ** 2);

  const b = 2 * (Math.atan(Math.exp(c * iso(phi) + K)) - Math.PI / 4);
  const L = c * (lam - lon0);
  const I = Math.atan2(Math.sin(L), Math.sin(b0) * Math.tan(b) + Math.cos(b0) * Math.cos(L));
  const j = Math.asin(Math.cos(b0) * Math.sin(b) - Math.sin(b0) * Math.cos(b) * Math.cos(L));

  return {
    y: R * I + 650000,
    x: (R / 2) * Math.log((1 + Math.sin(j)) / (1 - Math.sin(j))) + 200000,
  };
}

/** „585310.16, 226147.28” — ebben a sorrendben várja az útszámkereső. */
export function formatEov(lat, lon) {
  if (lat == null || lon == null) return '';
  const p = wgs84ToEov(lat, lon);
  return `${p.y.toFixed(2)}, ${p.x.toFixed(2)}`;
}

/**
 * Visszafelé: EOV → WGS84. A NAP úthálózati állományai gyakran EOV-ban
 * vannak, a bejárás viszont GPS-koordinátákkal dolgozik.
 */
export function eovToWgs84(y, x) {
  const a = 6378160.0;
  const f = 1 / 298.247167427;
  const e2 = f * (2 - f);
  const e = Math.sqrt(e2);
  const lat0 = 47.14439372222222 * RAD;
  const lon0 = 19.04857177777778 * RAD;
  const k0 = 0.99993;

  const c = Math.sqrt(1 + (e2 * Math.cos(lat0) ** 4) / (1 - e2));
  const b0 = Math.asin(Math.sin(lat0) / c);
  const iso = (p0) => Math.log(Math.tan(Math.PI / 4 + p0 / 2))
    - (e / 2) * Math.log((1 + e * Math.sin(p0)) / (1 - e * Math.sin(p0)));
  const K = Math.log(Math.tan(Math.PI / 4 + b0 / 2)) - c * iso(lat0);
  const R = (k0 * a * Math.sqrt(1 - e2)) / (1 - e2 * Math.sin(lat0) ** 2);

  // a hengerről vissza a Gauss-gömbre
  const j = 2 * (Math.atan(Math.exp((x - 200000) / R)) - Math.PI / 4);
  const I = (y - 650000) / R;
  const b = Math.asin(Math.cos(b0) * Math.sin(j) + Math.sin(b0) * Math.cos(j) * Math.cos(I));
  const L = Math.atan2(Math.sin(I), Math.cos(b0) * Math.cos(I) - Math.sin(b0) * Math.tan(j));

  // gömbi szélességből ellipszoidi (iterációval)
  const target = (Math.log(Math.tan(Math.PI / 4 + b / 2)) - K) / c;
  let phi = b;
  for (let i = 0; i < 12; i++) {
    const d = iso(phi) - target;
    const dd = 1 / Math.cos(phi) / (1 - e2 * Math.sin(phi) ** 2) * (1 - e2);
    phi -= d / (dd || 1);
  }
  const lam = lon0 + L / c;

  // HD72 → WGS84 (az eltolás visszafelé)
  const sl = Math.sin(phi);
  const N = a / Math.sqrt(1 - e2 * sl * sl);
  const X = N * Math.cos(phi) * Math.cos(lam) + 52.17;
  const Y = N * Math.cos(phi) * Math.sin(lam) - 71.82;
  const Z = N * (1 - e2) * sl - 14.9;

  const aW = 6378137.0;
  const e2W = (1 / 298.257223563) * (2 - 1 / 298.257223563);
  const p = Math.hypot(X, Y);
  let lat = Math.atan2(Z, p * (1 - e2W));
  for (let i = 0; i < 6; i++) {
    const s = Math.sin(lat);
    const Nn = aW / Math.sqrt(1 - e2W * s * s);
    const h = p / Math.cos(lat) - Nn;
    lat = Math.atan2(Z, p * (1 - (e2W * Nn) / (Nn + h)));
  }
  return { lat: lat / RAD, lon: Math.atan2(Y, X) / RAD };
}
