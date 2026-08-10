# Útvonalbejárás

Önálló, telepíthető webalkalmazás (PWA) **túlméretes szállítmány útvonalbejárásához**.
A megadott útvonalon haladva rögzíti a nyomvonalat, fotókat készít, a fotókra
rajzolhat, méreteket írhat be, **halvány útirány-nyilat** húzhat, és
hangjegyzeteket vehet fel. Minden rögzített elem később visszakereshető.

Nincs szerver, nincs regisztráció, nincs külső szolgáltatás: az adatok a
készüléken maradnak (IndexedDB), és offline is elérhetők.

---

## Mit tud

| Funkció | Hol |
|---|---|
| **Nyomvonal rögzítése** GPS-szel, élő távolság / idő / pontszám / pontosság | Aktív bejárás → *Nyomvonal rögzítése* |
| **Nyomvonal utólagos szerkesztése**: szakasz elvetése indoklással vagy törlése | *Nyomvonal szerkesztése* |
| **Fotó** készítése menet közben, automatikus GPS-koordinátával | *Fotó* gomb (a telefon kameráját nyitja) |
| **Rajzolás a képernyőn** a fotóra (szabadkéz, keret, jelölő nyíl) | Fotó → *Jelölés / méretek* |
| **Méretek beírása**: méretvonal két pont közé + beírt érték (m / cm / t) | Szerkesztő → *Méret* eszköz |
| **Halvány útirány-nyíl** — külön eszköz, saját beállításokkal | Szerkesztő → *Útirány* eszköz |
| **Hangjegyzet** felvétele a helyszínen, önállóan vagy fotóhoz csatolva | *Hangjegyzet* gomb, vagy fotó → *Hangjegyzet* |
| **Írott jegyzet** és pontjelölés a nyomvonalon | *Jegyzet*, *Pont jelölése* |
| **Visszakeresés** név, jegyzet, képre írt felirat, beírt méret és koordináta szerint | *Keresés* fül |
| **Export**: GPX (nyomvonal + waypointok), teljes JSON mentés, egyedi képek | Aktív bejárás alján |

### Az útirány-nyíl (külön kezelve)

A kérés szerint ez nem egy a rajzeszközök közül, hanem saját panelt kap,
amely csak ennél az eszköznél jelenik meg:

- **Halványság csúszka (10–90%)** — alapérték 35%. A csúszka a képen már
  meglévő útirány-nyilakat is együtt állítja, hogy egységes maradjon a kép.
- **Ívelt nyíl** kapcsoló kanyar jelöléséhez.
- **Gyors beszúrás**: *Balra / Jobbra / Előre / Hátra* — egy koppintással
  elhelyez egy kész nyilat, ami utána a csúszkával hangolható.
- A nyíl alapból **fehér**, vastagabb a többi vonalnál, és sötét kontúrt kap,
  így világos és sötét háttéren is látszik anélkül, hogy takarná a részleteket.

A rajzelemek a kép **arányos koordinátáin** tárolódnak, ezért a jelölés
bármekkora kijelzőn és a teljes felbontású exportban is pontosan ugyanoda esik.
A jelölések utólag szerkeszthetők: a fotó megnyitásakor a korábbi elemek
visszatöltődnek, egyenként törölhetők (*Törlés* eszköz), vagy visszavonhatók.

### A nyomvonal utólagos szerkesztése

A kísérőautó útja nem feltétlenül a jóváhagyandó útvonal: akadály miatt vissza
kellett fordulni, kerülőt kellett keresni. Ezt utólag, térképen lehet rendbe
tenni — a *Nyomvonal szerkesztése* gombbal.

- **Szakasz kijelölése**: koppintson a nyomvonalra a szakasz elejénél, majd a
  végénél (az **A** és **B** fogópont jelzi). A két csúszkával pontosan
  ráhangolható. Két ujjal nagyíthat, húzással mozgathatja a térképet.
- **Elvetett szakasz**: a kijelölés kikerül a hivatalos útvonalból, de
  **benne marad a felvételben** — szaggatott narancs vonallal, a megadott
  indoklással együtt (pl. „3,8 m magasságkorlát a hídnál”). Bármikor
  visszaállítható érvényesre.
- **Törlés**: ha az adatra nincs szükség, a kijelölt pontok véglegesen
  törölhetők.

Ami ilyenkor a helyére kerül:

- a **Táv** mező az **érvényes** útvonal hosszát mutatja, a bejárt teljes út
  külön sorban szerepel az adatlapon;
- a bejárás adatlapján felsorolva látszik minden elvetett szakasz az
  indoklásával;
- a **GPX** fő nyomvonala csak az érvényes útvonalat tartalmazza (ott, ahol
  elvetett szakasz szakítja meg, új `trkseg` kezdődik), az elvetett részek
  pedig külön, elnevezett nyomvonalként maradnak a fájlban;
- a *Megnyitás térképen* is csak az érvényes útvonalat viszi át.

---

## Indítás

Az alkalmazás statikus fájlokból áll, de **nem működik `file://` protokollról**
(ES-modulok és service worker miatt), és a kamera / mikrofon / GPS csak
`https://`-en vagy `localhost`-on érhető el.

### Helyben

```bash
cd utvonalbejaras
python3 -m http.server 8000
# majd: http://localhost:8000
```

### Telefonon (ajánlott)

Tegye ki a mappát bármilyen HTTPS-es helyre — például GitHub Pages
(Settings → Pages → a repó main ága), ekkor az app a
`https://<felhasználó>.github.io/<repó>/utvonalbejaras/` címen érhető el.
A böngésző menüjéből **„Hozzáadás a kezdőképernyőhöz”** — ezután
külön alkalmazásként, teljes képernyőn, offline is indul.

### Egyfájlos változat (gyors megnézéshez)

```bash
node build-single.mjs      # -> utvonalbejaras-egyfajlban.html
```

A szkript egyetlen HTML-fájlba fűzi a teljes appot (CSS, JS, ikon beágyazva),
így megosztható vagy e-mailben elküldhető. A funkciók ugyanazok, de a kamera,
a GPS és a mikrofon itt is csak `https://`-en vagy `localhost`-on érhető el,
ezért éles használatra a rendes, több fájlos verzió való.

### Engedélyek

Első használatkor a böngésző kéri a **helymeghatározás**, a **kamera** és a
**mikrofon** engedélyét. Enélkül az adott funkció nem működik, a többi igen.

---

## Használat menete

1. **Új bejárás indítása** — adja meg a szerelvény adatait (hossz, szélesség,
   magasság, össztömeg, tengelyterhelés, rendszám). Ezek később a keresésben is
   szerepelnek, és rákerülnek az exportra.
2. **Nyomvonal rögzítése** — indulás előtt nyomja meg. Az app 4 méterenként
   rögzít pontot, és kiszűri a 50 m-nél pontatlanabb méréseket.
   Menet közben tartsa nyitva az alkalmazást (a képernyőt igyekszik ébren tartani).
3. **Menet közben**: *Fotó*, *Hangjegyzet*, *Jegyzet*, *Pont jelölése*.
   Minden elem megkapja az aktuális koordinátát, és megjelenik a nyomvonalon
   (a térképvázlaton a pöttyre koppintva közvetlenül megnyílik).
4. **Fotó jelölése**: rajz, méretvonalak a beírt értékkel, útirány-nyíl, feliratok.
5. **Rögzítés leállítása** — a nyomvonal és a statisztika mentődik.
6. **Export**: GPX (bármely térképprogramba betölthető) vagy teljes JSON mentés,
   amely a fotókat és a hangfelvételeket is tartalmazza, és a
   *Mentés visszatöltése* gombbal másik készüléken is megnyitható.

---

## Adatkezelés

- Minden adat a böngésző **IndexedDB** tárolójában marad, a készüléken.
- Az app kéri a tartós tárolást (`navigator.storage.persist`), hogy a böngésző
  ne törölje a felvételeket helyszűke esetén.
- A fotók mentés előtt max. 2000 képpontra zsugorodnak (kb. 300–600 kB / kép),
  hogy egy hosszabb bejárás is elférjen.
- Külső hálózati hívás egyetlen helyen történik, és csak ha Ön kéri:
  a *Megnyitás térképen* / *Térképen* gombok Google Maps linket nyitnak.
- A böngészőadatok törlése a bejárásokat is törli — fontos anyagot mentsen ki
  JSON-ba vagy GPX-be.

## Fájlszerkezet

```
utvonalbejaras/
├── index.html              felület váza
├── manifest.webmanifest    PWA leíró
├── sw.js                   offline gyorsítótár
├── css/app.css             megjelenés (sötét/világos témával)
├── icons/                  alkalmazásikonok
└── js/
    ├── app.js              képernyők, bejárások, elemek, keresés, export
    ├── db.js               IndexedDB (sessions / points / items)
    ├── geo.js              GPS-rögzítés, távolság, nyomvonalrajz, GPX
    ├── editor.js           fotó-jelölő (rajz, méret, útirány-nyíl, szöveg)
    ├── media.js            képzsugorítás, bélyegkép, hangfelvétel
    └── ui.js               modális ablakok, értesítés, letöltés
```

## Korlátok

- A háttérben (más appra váltva, lezárt képernyővel) a böngésző felfüggesztheti
  a GPS-figyelést — ezért érdemes az appot előtérben hagyni.
- A nyomvonal saját, offline vázlaton jelenik meg (méretaránnyal és
  északjelzéssel), nem térképszelvényeken; utcaszintű háttérhez használja a
  *Megnyitás térképen* gombot vagy a GPX exportot.
- Az iOS Safari a hangfelvételt `audio/mp4`, a Chrome `audio/webm` formátumban
  menti — mindkettő lejátszható az appban és exportálható.
