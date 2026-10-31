// A kísérőautó jelzésképei.
//
// A túlméretes szerelvény előtt-mögött menő kísérőautó tábláit („jelzésképek”)
// nem elég fejben tartani: a bejáráskor ott derül ki, hol kell előzési
// tilalmat vagy sebességkorlátozást kitenni, és ugyanezt a tervezéskor
// (otthon, térképen) is meg kell tudni adni. Ez a modul a táblakészlet és a
// táblák kirajzolása — egy helyen, hogy a térkép, a jegyzőkönyv, az élő
// kísérés és a Közút-űrlapok ugyanazt a képet használják.
//
// A rajzok sematikusak: a felismerést segítik, nem hivatalos KRESZ-ábrák.

const SGN_RED = '#d4171a';
const SGN_DARK = '#1b1b1b';
const SGN_GREY = '#8a8a8a';
const SGN_BLUE = '#0b4ea2';
const SGN_WHITE = '#ffffff';

/** Autó hátulnézetből, 44×38 egységben (utána méretezzük). */
const SGN_CAR = (fill) => `
  <path d="M7,23 L11,9 C11.6,6.5 13,5.5 15.5,5.5 H28.5 C31,5.5 32.4,6.5 33,9 L37,23 V33 H7 Z" fill="${fill}"/>
  <path d="M13.2,21.5 L15.8,11.5 H28.2 L30.8,21.5 Z" fill="${SGN_WHITE}"/>
  <rect x="8.5" y="32" width="7" height="5" rx="1.6" fill="${fill}"/>
  <rect x="28.5" y="32" width="7" height="5" rx="1.6" fill="${fill}"/>`;

/** Tehergépkocsi hátulnézetből: magasabb, zárt felépítmény, hátsó ajtókkal. */
const SGN_TRUCK = (fill) => `
  <path d="M6,2 H38 V31 H6 Z" fill="${fill}"/>
  <path d="M10,13 H34 V27 H10 Z" fill="${SGN_WHITE}"/>
  <rect x="21.2" y="13" width="1.6" height="14" fill="${fill}"/>
  <rect x="2.5" y="8" width="4" height="7" rx="1.2" fill="${fill}"/>
  <rect x="37.5" y="8" width="4" height="7" rx="1.2" fill="${fill}"/>
  <rect x="8" y="30" width="8" height="6" rx="1.8" fill="${fill}"/>
  <rect x="28" y="30" width="8" height="6" rx="1.8" fill="${fill}"/>`;

/** Két jármű egymás mellett a tábla közepén. */
const sgnPair = (left, right) =>
  `<g transform="translate(14.5,28) scale(0.79)">${left}</g>`
  + `<g transform="translate(50.3,28) scale(0.79)">${right}</g>`;

/** Átlós sávok a „vége” táblákhoz, a tábla körére vágva. */
const SGN_END_STRIPES = `
  <g clip-path="url(#sgnClip)" stroke="${SGN_GREY}" stroke-width="4.5" stroke-linecap="butt">
    <line x1="4" y1="78" x2="78" y2="4"/>
    <line x1="18" y1="86" x2="86" y2="18"/>
    <line x1="32" y1="94" x2="94" y2="32"/>
    <line x1="-4" y1="64" x2="64" y2="-4"/>
  </g>`;

const sgnNumber = (txt, color) =>
  `<text x="50" y="69" text-anchor="middle" font-family="Arial, Helvetica, sans-serif"
     font-size="${String(txt).length > 2 ? 44 : 54}" font-weight="700" fill="${color}">${txt}</text>`;

/**
 * A táblakészlet. `ring`: a karima színe, `inner`: a tábla belseje.
 * A `rajz` a 100×100-as tábla belsejébe kerül.
 */
export const SIGNS = [
  {
    id: 'elozni-tilos', nev: 'Előzni tilos', rovid: 'Előzni tilos',
    csoport: 'Előzési tilalom', ring: SGN_RED, inner: SGN_WHITE,
    rajz: () => sgnPair(SGN_CAR(SGN_RED), SGN_CAR(SGN_DARK)),
  },
  {
    id: 'teher-elozni-tilos', nev: 'Tehergépkocsival előzni tilos', rovid: 'Teherrel előzni tilos',
    csoport: 'Előzési tilalom', ring: SGN_RED, inner: SGN_WHITE,
    rajz: () => sgnPair(SGN_TRUCK(SGN_RED), SGN_CAR(SGN_DARK)),
  },
  {
    id: 'elozes-vege', nev: 'Előzési tilalom vége', rovid: 'Előzés vége',
    csoport: 'Előzési tilalom', ring: SGN_GREY, inner: SGN_WHITE,
    rajz: () => sgnPair(SGN_CAR(SGN_GREY), SGN_CAR(SGN_GREY)) + SGN_END_STRIPES,
  },
  ...[10, 20, 30, 40, 50, 60, 70, 80, 90].map((v) => ({
    id: 'seb-' + v,
    nev: `Sebességkorlátozás ${v} km/h`,
    rovid: `${v} km/h`,
    csoport: 'Sebességkorlátozás',
    ring: SGN_RED, inner: SGN_WHITE,
    rajz: () => sgnNumber(String(v), SGN_DARK),
  })),
  {
    id: 'seb-vege', nev: 'Sebességkorlátozás vége', rovid: 'Korlátozás vége',
    csoport: 'Sebességkorlátozás', ring: SGN_GREY, inner: SGN_WHITE,
    rajz: () => sgnNumber('50', SGN_GREY) + SGN_END_STRIPES,
  },
  {
    id: 'kikerules-balra', nev: 'Balra kikerülni kötelező', rovid: 'Kikerülés balra',
    csoport: 'Terelés', ring: SGN_BLUE, inner: SGN_BLUE,
    rajz: () => `<path d="M74,56 H48 V70 L22,50 L48,30 V44 H74 Z" fill="${SGN_WHITE}"/>`,
  },
  {
    id: 'kikerules-jobbra', nev: 'Jobbra kikerülni kötelező', rovid: 'Kikerülés jobbra',
    csoport: 'Terelés', ring: SGN_BLUE, inner: SGN_BLUE,
    rajz: () => `<g transform="translate(100,0) scale(-1,1)"><path d="M74,56 H48 V70 L22,50 L48,30 V44 H74 Z" fill="${SGN_WHITE}"/></g>`,
  },
  {
    id: 'egyeb', nev: 'Egyéb jelzéskép', rovid: 'Egyéb',
    csoport: 'Egyéb', ring: SGN_DARK, inner: SGN_WHITE, szoveges: true,
    rajz: (text) => {
      const t = String(text || '?').slice(0, 4);
      return `<text x="50" y="62" text-anchor="middle" font-family="Arial, Helvetica, sans-serif"
        font-size="${t.length > 2 ? 26 : 38}" font-weight="700" fill="${SGN_DARK}">${sgnEsc(t)}</text>`;
    },
  },
];

const sgnEsc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const signById = (id) => SIGNS.find((s) => s.id === id) || null;

/** A tábla neve; az „egyéb” a beírt szöveget mutatja. */
export function signName(id, text) {
  const s = signById(id);
  if (!s) return 'Jelzéskép';
  if (s.szoveges) return text ? `Egyéb jelzéskép: ${text}` : s.nev;
  return s.nev;
}

export function signShort(id, text) {
  const s = signById(id);
  if (!s) return 'Jelzés';
  if (s.szoveges) return text || s.rovid;
  return s.rovid;
}

/** Egy elem összes tábláját egy sorban („Előzni tilos + 30 km/h”). */
export function signsLabel(item) {
  const ids = itemSigns(item);
  if (!ids.length) return 'Jelzéskép';
  return ids.map((id) => signShort(id, item.signText)).join(' + ');
}

/** A jelzésképek listája egy elemből (a régi, egytáblás alak is jó). */
export function itemSigns(item) {
  if (!item) return [];
  if (Array.isArray(item.signs)) return item.signs.filter((id) => signById(id));
  return item.signId && signById(item.signId) ? [item.signId] : [];
}

export const isSignItem = (item) => !!item && item.type === 'jelzes';

let sgnClipSeq = 0;

/**
 * A tábla SVG-je. A kör r=46, hogy a karima széle épp a 100×100-as nézetbe
 * essen; a vékony szürke kontúr azért kell, hogy világos alaptérképen vagy
 * fehér papíron is látszódjon a tábla széle.
 */
export function signSvg(id, { size = 72, text, title } = {}) {
  const s = signById(id);
  if (!s) return '';
  const label = title === false ? '' : `<title>${sgnEsc(signName(id, text))}</title>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${size}" height="${size}" role="img">`
    + label
    + `<defs><clipPath id="sgnClip"><circle cx="50" cy="50" r="46"/></clipPath></defs>`
    + `<circle cx="50" cy="50" r="46" fill="${s.inner}"/>`
    + `<circle cx="50" cy="50" r="41" fill="none" stroke="${s.ring}" stroke-width="10"/>`
    + `<circle cx="50" cy="50" r="45.2" fill="none" stroke="rgba(0,0,0,.35)" stroke-width="1.6"/>`
    + s.rajz(text)
    + `</svg>`;
  // Egy lapon több tábla is lehet, és az azonos id-vel megadott vágás
  // összekeverednék köztük — ezért minden táblának saját azonosítót adunk.
  sgnClipSeq += 1;
  return svg.replace(/sgnClip/g, 'sgnClip' + sgnClipSeq);
}

/** Adaturl — térképre rajzoláshoz, jegyzőkönyvbe beágyazáshoz. */
const sgnUrlCache = new Map();
export function signDataUrl(id, text) {
  const key = id + '|' + (text || '');
  if (!sgnUrlCache.has(key)) {
    const svg = signSvg(id, { size: 100, text, title: false });
    sgnUrlCache.set(key, 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg));
  }
  return sgnUrlCache.get(key);
}

/* ------------------------------------------------- rajzolás vászonra

A térkép vászonra rajzol, ezért a táblákat képként kell betölteni. Az
adaturl miatt ez azonnali, de mégis aszinkron — ezért a betöltött képeket
eltároljuk, és a térkép induláskor előre betölti őket. Amíg nincs kész,
a térkép egy egyszerűsített jelet rajzol a tábla helyére.                */

const sgnImgCache = new Map();

export function signImage(id, text) {
  const key = id + '|' + (text || '');
  if (sgnImgCache.has(key)) return sgnImgCache.get(key);
  const img = new Image();
  img.decoding = 'sync';
  img.src = signDataUrl(id, text);
  sgnImgCache.set(key, img);
  return img;
}

/** Betöltött-e már (a térkép csak ilyenkor rajzolja ki). */
export const signReady = (id, text) => {
  const img = signImage(id, text);
  return img.complete && img.naturalWidth > 0;
};

/** Minden tábla betöltése — a jegyzőkönyv és a térképfájl ezt bevárja. */
export function preloadSigns(extra = []) {
  const jobs = SIGNS.map((s) => signImage(s.id)).concat(extra.map((e) => signImage(e.id, e.text)));
  return Promise.all(jobs.map((img) => (
    img.complete && img.naturalWidth > 0
      ? Promise.resolve()
      : new Promise((res) => {
          img.addEventListener('load', res, { once: true });
          img.addEventListener('error', res, { once: true });
          setTimeout(res, 1500);
        })
  )));
}

/** PNG a Word-űrlapokhoz (a .docx nem tud SVG-t megjeleníteni). */
export async function signPng(id, { px = 160, text } = {}) {
  const img = signImage(id, text);
  if (!(img.complete && img.naturalWidth > 0)) await preloadSigns(text ? [{ id, text }] : []);
  const canvas = document.createElement('canvas');
  canvas.width = px;
  canvas.height = px;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = SGN_WHITE;
  ctx.fillRect(0, 0, px, px);
  try { ctx.drawImage(img, 0, 0, px, px); } catch (_) { return null; }
  return new Promise((res) => canvas.toBlob((b) => res(b), 'image/png'));
}

/** Rajzolás a térkép vásznára, a pont fölé. */
export function drawSign(ctx, p, ids, text, size = 26) {
  const list = ids.length ? ids : ['egyeb'];
  // több tábla egy ponton: enyhén egymás mellé csúsztatva, hogy mindegyik
  // látszódjon, de a pont helye azért felismerhető maradjon
  const step = size * 0.72;
  const x0 = p.x - ((list.length - 1) * step) / 2;
  list.forEach((id, i) => {
    const x = x0 + i * step;
    const y = p.y - size * 0.95;
    const img = signImage(id, text);
    if (img.complete && img.naturalWidth > 0) {
      ctx.drawImage(img, x - size / 2, y - size / 2, size, size);
    } else {
      const s = signById(id);
      ctx.beginPath();
      ctx.arc(x, y, size / 2, 0, Math.PI * 2);
      ctx.fillStyle = SGN_WHITE;
      ctx.fill();
      ctx.lineWidth = size * 0.14;
      ctx.strokeStyle = (s && s.ring) || SGN_RED;
      ctx.stroke();
    }
  });
  // szár a tábla és a pont között: látszódjon, hová tartozik
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  ctx.lineTo(p.x, p.y - size * 0.5);
  ctx.strokeStyle = SGN_DARK;
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(p.x, p.y, 3.2, 0, Math.PI * 2);
  ctx.fillStyle = SGN_DARK;
  ctx.fill();
}
