// Vonalas ikonkészlet az utvonalbejaras.hu arculatához.
//
// Miért nem emodzsi: az emodzsi minden rendszeren másképp néz ki (a Windows
// kék kameráját az Android sárgára rajzolja), nem lehet színezni, és
// nyomtatásban is ugyanaz a baj. Ezek vonalas SVG-k: mindenhol ugyanazok,
// a szöveg színét veszik fel, és a jelentésükhöz tartozó színt kapják.

/** A rajzok: 24×24-es rácson, csak körvonal. */
const IKON_RAJZ = {
  foto: '<path d="M3 8.5h3.2L8 6h8l1.8 2.5H21v10H3z"/><circle cx="12" cy="13" r="3.4"/>',
  hang: '<rect x="9" y="2.6" width="6" height="11" rx="3"/><path d="M5 11.5a7 7 0 0 0 14 0M12 18.5V21"/>',
  video: '<rect x="2.6" y="6.5" width="13" height="11" rx="2"/><path d="M15.6 11l5.8-3v8l-5.8-3z"/>',
  jegyzet: '<path d="M5 3.5h9l5 5V20a.5.5 0 0 1-.5.5h-13A.5.5 0 0 1 5 20z"/>'
    + '<path d="M14 3.5V9h5"/><path d="M8.5 13h7M8.5 16.5h4.5"/>',
  allapot: '<path d="M12 3.5 22 20H2z"/><path d="M12 9.5v4.5M12 17h.01"/>',
  jelzes: '<path d="M3 7.5h18v6H3z"/><path d="M3 7.5v12M21 7.5v12"/><path d="m5.5 13.5 5-6M11 13.5l5-6"/>',
  mappa: '<path d="M3 6.5h6l2 2.5h10V19a.5.5 0 0 1-.5.5h-15A.5.5 0 0 1 3 19z"/>',
  hely: '<path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.6"/>',
  terkep: '<path d="M3 6.5 9 4l6 2.5L21 4v13.5L15 20l-6-2.5L3 20z"/><path d="M9 4v13.5M15 6.5V20"/>',
  ceruza: '<path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17z"/><path d="M14.5 6 18 9.5"/>',
  kereses: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  vagolap: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h3"/>'
    + '<rect x="9" y="2.2" width="6" height="3.6" rx="1.2"/><path d="M8 11.5h5M8 15h3"/>',
  letoltes: '<path d="M12 3.5v11"/><path d="m7.5 10.5 4.5 4.5 4.5-4.5"/><path d="M4 19.5h16"/>',
  ut: '<path d="M7 3.5 4.5 20.5M17 3.5l2.5 17"/><path d="M12 4v3M12 10.5v3M12 17v3"/>',
  kuka: '<path d="M4 6.5h16"/><path d="M9 6.5V4h6v2.5"/>'
    + '<path d="M6 6.5 7 20a.5.5 0 0 0 .5.5h9a.5.5 0 0 0 .5-.5l1-13.5"/>',
  teherauto: '<path d="M3 7.5h10v8.5H3z"/><path d="M13 10.5h4l3 3v2.5h-7z"/>'
    + '<circle cx="7" cy="18" r="1.8"/><circle cx="17" cy="18" r="1.8"/>',
  bezar: '<path d="M5.5 5.5 18.5 18.5M18.5 5.5 5.5 18.5"/>',
};

/** Az ikon SVG-je szövegként — az `el(..., { html })` ezt várja. */
export function ikonSvg(nev, meret = 18) {
  const rajz = IKON_RAJZ[nev];
  if (!rajz) return '';
  return `<svg viewBox="0 0 24 24" width="${meret}" height="${meret}" fill="none" `
    + 'stroke="currentColor" stroke-width="1.8" stroke-linecap="round" '
    + `stroke-linejoin="round" aria-hidden="true">${rajz}</svg>`;
}

/**
 * Ikon elemként, gombba téve. A `szin` egy jelentéshez tartozó osztály
 * (pl. 'danger'), ha az ikon ne a szöveg színét vegye fel.
 */
export function ikonEl(nev, szin, meret = 18) {
  const s = document.createElement('span');
  s.className = 'btn-ikon' + (szin ? ' szin-' + szin : '');
  s.innerHTML = ikonSvg(nev, meret);
  s.setAttribute('aria-hidden', 'true');
  return s;
}

/** Gomb felirata ikonnal: az `el(...)` gyerekeiként adható át. */
export function ikonos(nev, szoveg, szin) {
  return [ikonEl(nev, szin), szoveg];
}

export const IKON_NEVEK = Object.keys(IKON_RAJZ);
