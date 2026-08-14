/* Világos és sötét téma.

   Három állás van: `rendszer` (a készülék beállítását követi), `vilagos`
   és `sotet`. A választás mindig feloldódik egy konkrét témára, és a
   `<html data-theme="light|dark">` attribútumba kerül. Így a CSS-ben
   egyetlen világos blokk kell, nem kell mindent kétszer leírni.

   Ez az egyetlen dolog, amit az app eltárol a böngészőben: egy szó a
   választott témáról. Mérési adat, helyzet vagy azonosító soha. Privát
   ablakban a tárolás hibát dobhat, ezért mindenhol try/catch van: ha
   nem megy, a téma egyszerűen nem marad meg újratöltés után.        */

const KULCS = 'atlagsebesseg-tema';
const MODOK = ['rendszer', 'vilagos', 'sotet'];

const HATTER = { sotet: '#0e0e10', vilagos: '#eef0f5' };

const rendszerSotet = () =>
  window.matchMedia('(prefers-color-scheme: dark)').matches;

function betolt() {
  try {
    const v = localStorage.getItem(KULCS);
    return MODOK.includes(v) ? v : 'rendszer';
  } catch {
    return 'rendszer';
  }
}

let mod = betolt();
const figyelok = new Set();

/** A választott mód: 'rendszer' | 'vilagos' | 'sotet'. */
export const temaMod = () => mod;

/** A ténylegesen érvényes téma: igaz, ha sötét. */
export const sotetE = () => (mod === 'rendszer' ? rendszerSotet() : mod === 'sotet');

function alkalmaz() {
  const sotet = sotetE();
  document.documentElement.setAttribute('data-theme', sotet ? 'dark' : 'light');
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', sotet ? HATTER.sotet : HATTER.vilagos);
  for (const fn of figyelok) fn(sotet);
}

export function temaBeallit(uj) {
  if (!MODOK.includes(uj)) return;
  mod = uj;
  try {
    if (uj === 'rendszer') localStorage.removeItem(KULCS);
    else localStorage.setItem(KULCS, uj);
  } catch { /* privát ablakban nem baj, csak nem marad meg */ }
  alkalmaz();
}

/** Körbelépteti a három állást: rendszer, világos, sötét. */
export function temaValt() {
  temaBeallit(MODOK[(MODOK.indexOf(mod) + 1) % MODOK.length]);
  return mod;
}

/** Értesítés témaváltáskor (a térkép csempéihez). */
export function temaFigyel(fn) {
  figyelok.add(fn);
  return () => figyelok.delete(fn);
}

// Rendszerkövetéskor a készülék beállításának változása azonnal látszik.
window
  .matchMedia('(prefers-color-scheme: dark)')
  .addEventListener('change', () => { if (mod === 'rendszer') alkalmaz(); });

alkalmaz();
