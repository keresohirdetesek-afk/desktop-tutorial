# Átlagsebesség-kalkulátor

Bárki kipróbálhatja, hogy **megbüntetnék-e, és mennyivel**, ha Magyarországon
bevezetik az átlagsebesség-mérést (szakaszellenőrzést). Az app GPS-szel
lemeri a saját szakaszátlagot, az útvonal menti sebességhatárokhoz méri, és
kiszámolja a 410/2007. (XII. 29.) Korm. rendelet szerinti bírságot.

**Nincs szerver, nincs adatbázis, nincs süti.** A mérés a böngésző
memóriájában él, és az oldal bezárásával nyomtalanul eltűnik.

## Mit tud

- **Élő mérés GPS-szel.** Két munkamód:
  - *kijelölt szakasz*: a térképen megjelölöd a szakasz elejét és végét, a
    mérés elhaladáskor magától indul és áll le (rezgésjelzéssel);
  - *kézi*: induláskor és érkezéskor gombnyomás.
- **Változó sebességhatárok kezelése.** Az útvonal nem egyetlen limittel
  számol: a nyomvonal sebességhatár szerinti szakaszokra bomlik (autópálya →
  útépítési korlátozás → település), és minden szakasz a *saját* határához
  mérve kap értékelést. A hatóság is így szankcionál, nem a teljes út vegyes
  átlagára.
- **Sebességhatárok lekérése** az OpenStreetMapből (Overpass API), kézi
  felülírással — ahol mást láttál kint, egy mezőben átírod.
- **Élő tanács vezetés közben:** „a hátralévő kb. 6,4 km-en legfeljebb
  84 km/h átlaggal maradsz a bírsághatár alatt”.
- **Kalkulátor GPS nélkül:** szakaszhossz(ok) + menetidő vagy tempó →
  átlagsebesség, bírság, bírságmentes minimum menetidő, és hogy a nyert
  időnek mennyi az ára forintban.
- **Telepíthető (PWA), offline is működik** — a térképcsempéken kívül.

## Használat

Statikus oldal, elég egy HTTPS-t adó fájlkiszolgáló. Helyi próbához:

```bash
cd atlagsebesseg
python3 -m http.server 8765
# http://127.0.0.1:8765
```

A GPS-hez **HTTPS kell** (vagy `localhost`) — a böngésző máshol nem adja meg
a helyzetet.

## Honnan jönnek a sebességhatárok?

Ez a projekt legkényesebb pontja, ezért érdemes tudni, mi a helyzet:

| Forrás | Mit ad | Állapot |
| --- | --- | --- |
| **OpenStreetMap / Overpass API** | `maxspeed`, `maxspeed:type`, `zone:maxspeed`, lakott területi 50-esek, zónák, `temporary:maxspeed` (útépítés) | **Beépítve.** Ingyenes, böngészőből hívható, szerver nélkül működik. Nem teljes körű, és a friss útépítési korlátozásokat ritkán tartalmazza. |
| **Útinform / Magyar Közút (Nemzeti Hozzáférési Pont, DATEX II)** | hiteles, napra kész útépítések, lezárások, ideiglenes korlátozások | Ez a hatósági forrás. Böngészőből közvetlenül nem hívható (nincs CORS, regisztrációhoz kötött), ezért egy vékony gyűjtő-proxy kellene hozzá, ami naponta letölti és statikus JSON-ná alakítja. |
| **Közúti jelzőtábla-kataszter** | minden kitáblázott korlátozás pontos helye | Nem nyilvános adat. |
| **HERE / TomTom Speed Limits API** | teljes körű sebességhatár + útépítés | Fizetős, API-kulcsos, forgalom szerint díjazott. |

Rövid válasz: **most az OpenStreetMap a reális forrás**, és a kézi felülírás
pótolja a hiányzó adatot. Ha az app beindul, a következő lépés az Útinform /
NAP adatainak napi letöltése egy statikus JSON-ba (ez nem sérti a
„semmit nem tárolunk a felhasználóról” elvet: nem személyes adat, és csak
letöltés irányban mozog).

Az OSM-lekérés helye egy fájlban van: `js/limits.js` (`OVERPASS_VEGPONTOK`,
`utHatara`). Új forrás bekötéséhez csak ezt kell bővíteni.

## A bírságtáblázat

Egyetlen helyen, a `js/birsag.js` fájlban van, dátumozva. Ha a rendelet
módosul, elég az ottani számokat átírni — az egész app követi.

## Fájlok

```
atlagsebesseg/
├── index.html          képernyők: mérés, kalkulátor, tudnivalók
├── css/app.css
├── js/
│   ├── app.js          összefogó réteg, megjelenítés
│   ├── birsag.js       410/2007. bírságtáblázat és értékelés
│   ├── geo.js          távolság, pont–szakasz vetítés, formázás
│   ├── limits.js       OSM/Overpass lekérés, maxspeed, szakaszokra bontás
│   ├── map.js          Leaflet-térkép
│   └── track.js        GPS-rögzítés, automatikus szakaszhatár-figyelés
├── vendor/leaflet/     a térképkönyvtár helyben (nem CDN)
├── icons/  manifest.webmanifest  sw.js
```

## Hirdetések

A helyek elő vannak készítve: `.hirdetes` osztályú dobozok (`data-slot`
attribútummal) a mérés, a kalkulátor és a tudnivalók képernyő alján. Fix
minimummagasságot foglalnak, hogy a betöltődő hirdetés ne ugráltassa a
tartalmat.

Bekötés előtt két dolog kell:

1. **Sütibanner / hozzájárulás-kezelő (CMP).** A jelenlegi app egyetlen
   sütit sem tesz le; a hirdetéskód viszont igen, ezért az EU-ban IAB TCF
   szerinti hozzájárulás kell hozzá.
2. **Adatvédelmi tájékoztató oldal**, amit a hirdetési rendszerek megkövetelnek.
   A „Tudnivalók” képernyő adatvédelmi része ennek az alapja — ki kell
   egészíteni a hirdetési partnerek adatkezelésével.

Amíg ez nincs meg, a dobozok üresen maradnak, és az app végig süti- és
követésmentes.

## Adatvédelem

- Nincs regisztráció, nincs bejelentkezés, nincs analitika.
- A GPS-pontok kizárólag a memóriában vannak — se `localStorage`, se
  IndexedDB, se fájl.
- Külső kérés csak kettő fordul elő, mindkettő kikapcsolható:
  a térképcsempék (OpenStreetMap) és a sebességhatárok lekérése
  (Overpass API, csak gombnyomásra).
- A service worker kizárólag az app saját fájljait gyorsítótárazza.

## Jogi

Tájékoztató eszköz, nem hatósági mérőműszer és nem jogi tanácsadás.
A megjelenített összegek a 410/2007. (XII. 29.) Korm. rendelet szerinti
tájékoztató értékek.
