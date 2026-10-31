/* Hirdetési felületek.

   Az oldal alapígérete, hogy nem követi a látogatót. Ez a hirdetésre is
   vonatkozik, ezért itt nincs hirdetési hálózat, nincs licit, nincs süti
   és nincs külső szkript: egy eladott felület egy kép és egy link, a
   saját kiszolgálónkról. A hirdető nem lát semmit a látogatóból, és mi
   sem mérünk kattintást.

   EGY ELADOTT HIRDETÉS BEÁLLÍTÁSA

   1. A képet tedd a `hirdetes/` mappába (a saját kiszolgálónkra, ne
      külső címre — lásd `sajatKiszolgalo` lent).
   2. Vegyél fel egy bejegyzést a HIRDETESEK tömbbe.
   3. Töltsd fel a `js/hirdetes.js` fájlt és a képet, és emeld a `sw.js`
      gyorsítótárnevét.

   Amelyik felületre nincs érvényes hirdetés, ott a „Hirdessen itt”
   felirat marad — az a felület kínálata.                              */

/* A négy felület azonosítója az index.html `data-slot` értéke:
   intro-also · meres-also · kalk-also · info-also
   A `barmelyik` minden szabad felületen megjelenhet.                  */
export const HIRDETESEK = [
  /* Minta — másold le, és vedd ki a megjegyzésből:

  {
    slot: 'barmelyik',
    kep: 'hirdetes/pelda-autosiskola.png',
    szeles: 600,                  // a kép VALÓDI mérete képpontban;
    magas: 150,                   // ettől nem ugrál a tartalom töltéskor
    alt: 'Példa Autósiskola — jogosítvány 3 hónap alatt',
    link: 'https://pelda-autosiskola.hu/',
    nev: 'Példa Autósiskola',     // a „Hirdetés · …” címkébe kerül
    lejar: '2026-12-31',          // ezen a napon még megjelenik
  },

  */
];

/* A hirdetés képe csak a saját kiszolgálónkról jöhet. Külső címről
   betöltött kép a hirdető (vagy a hálózata) felé elárulná a látogató
   IP-címét — pont az történne, amit az oldal nem csinál. Az ilyen
   bejegyzést kihagyjuk, és marad a „Hirdessen itt” felirat.          */
function sajatKiszolgalo(ut) {
  if (typeof ut !== 'string' || ut === '') return false;
  if (/^(https?:)?\/\//i.test(ut)) {
    try {
      return new URL(ut, location.href).origin === location.origin;
    } catch { return false; }
  }
  return !ut.startsWith('/') || ut.startsWith(location.pathname);
}

function ervenyes(h, ma) {
  if (!h || !sajatKiszolgalo(h.kep) || !h.link) return false;
  if (h.lejar && h.lejar < ma) return false;
  return true;
}

/** A mai nap ISO alakban, helyi idő szerint (nem UTC: éjfél környékén
    a UTC egy nappal arrébb járhat, és egy hirdetés idő előtt tűnne el). */
function maiNap(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Egy felületre szánt hirdetések, a legszűkebb találat előnyben:
    a felületre nevezett hirdetés megelőzi a `barmelyik`-et. */
function felulethez(slot, lista, ma) {
  const jo = lista.filter((h) => ervenyes(h, ma));
  const nevezett = jo.filter((h) => h.slot === slot);
  return nevezett.length ? nevezett : jo.filter((h) => h.slot === 'barmelyik');
}

function elemet(h) {
  const a = document.createElement('a');
  a.className = 'hirdetes hirdetes-elo';
  a.href = h.link;
  a.target = '_blank';
  /* `sponsored`: fizetett hivatkozás, ezt a keresők így várják el.
     `noopener`: a megnyíló oldal ne férjen hozzá a mi ablakunkhoz. */
  a.rel = 'sponsored noopener';

  const kep = document.createElement('img');
  kep.src = h.kep;
  kep.alt = h.alt || '';
  if (h.szeles) kep.width = h.szeles;
  if (h.magas) kep.height = h.magas;
  kep.loading = 'lazy';
  kep.decoding = 'async';
  a.appendChild(kep);

  /* A reklám felismerhetőségét jogszabály írja elő (2008. évi XLVIII.
     tv. a gazdasági reklámtevékenységről). A címke ezért nem opcionális
     díszítés: enélkül a hirdetés a tartalomtól megkülönböztethetetlen. */
  const cimke = document.createElement('span');
  cimke.className = 'hirdetes-cimke';
  cimke.textContent = h.nev ? `Hirdetés · ${h.nev}` : 'Hirdetés';
  a.appendChild(cimke);

  return a;
}

/** Kitölti a felületeket. Amelyikre nincs hirdetés, azt békén hagyja. */
export function hirdetesekBe(gyoker = document, lista = HIRDETESEK) {
  const ma = maiNap();
  for (const hely of gyoker.querySelectorAll('.hirdetes[data-slot]')) {
    const jeloltek = felulethez(hely.dataset.slot, lista, ma);
    if (!jeloltek.length) continue;
    /* Több érvényes hirdetésnél oldalbetöltésenként váltakoznak. Ehhez
       nem kell tárolni semmit: a véletlen választás elég ahhoz, hogy
       hosszú távon egyenletesen osszon. */
    const h = jeloltek[Math.floor(Math.random() * jeloltek.length)];
    const uj = elemet(h);
    uj.dataset.slot = hely.dataset.slot;
    hely.replaceWith(uj);
  }
}
