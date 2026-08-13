# Átlagsebesség.hu

„Próbáld ki, hogy egy átlagsebesség-mérős szakaszon szabályosan érnél-e célba."

Az app GPS-szel lemeri a saját szakaszátlagot, az útvonal menti
sebességhatárokhoz méri, és megmutatja, hogyan működne nálad az
átlagsebesség-mérés, ha Magyarországon a jelenleg egyeztetett rendszer
bevezetésre kerül.

**Nincs regisztráció. Nem követünk. Csak számolunk.** A mérés a böngésző
memóriájában él, és az oldal bezárásával nyomtalanul eltűnik.

### Döntés: nincsenek fotók

Az oldalon szándékosan nincs fotó vagy illusztráció. A vizuális szerepet a
térkép, a mérőóra és a sebességtáblák töltik be. Külső képforrás (stock,
CDN) ütközne azzal, hogy az app csak két, kikapcsolható kérést indít, saját
képanyagot pedig nem tartunk fenn. Egy tervezői átnézés ezt hiányként
jelezheti; ez tudatos döntés, nem elmaradt munka.

### Márkanév és szövegezés

A megjelenő márkanév **Átlagsebesség.hu** (a cím `atlagsebesseg.hu`). A
szövegek szándékosan feltételes módban fogalmaznak: az átlagsebesség-mérés
gyakorlati bevezetéséről nincs végleges döntés, ezért az oldal sehol nem
sugallja, hogy a rendszer már működik vagy pontosan így fog működni. Új
szöveg írásakor ezt tartsuk.

## Mit tud

- **Egy mondat és egy gomb az induláskor.** Az első képernyőn nincs térkép
  és nincs kapcsoló: egy állítás, egy nagy CTA, majd választás „most vezetek"
  (GPS) és „csak kipróbálnám" (kalkulátor) között.
- **Műszerfal vezetés közben.** Felül a szakasz: két kapu, a hátralévő táv,
  a becsült idő és egy haladásjelző sáv. Alatta sebességóra, ami a
  *szakaszátlagot* mutatja — a skála a korlátozáshoz igazodik (110-es
  határnál 80–140), a színek a szabályos / túllépés-bírság-nélkül / bírságos
  tartományt jelölik, a fehér háromszög a korlátozás helyét, a sarokban
  pedig a sebességtábla. Utána a státuszsáv, végül hat adat: mért átlag,
  pillanatnyi sebesség, megengedett átlag, a helyben érvényes korlátozás,
  eltelt idő és a bírságveszély forintban.
- **Két mutató egy órán:** a vastag a szakaszátlagot, a vékony narancs az
  éppen mért sebességet mutatja — a kettő távolsága maga az információ.
- **A tábla a helyben érvényes korlátozást mutatja**, ha egyszer lekérted a
  határokat: ahogy az útépítési szakaszra érsz, 130-ról 80-ra vált. Ez
  független a „megengedett átlag" mezőtől, ami az egész szakaszra vonatkozó,
  hosszal súlyozott érték. A tábla bármikor felülírható koppintással.
- **Hangjelzés, ha átléped a megengedettet.** A böngésző szintetizálja
  (nincs hangfájl, offline is szól): lágy, gongszerű kettős hang, mint a
  repülőgépek utastéri jelzése, rezgéssel együtt. Csak romló irányban szól,
  a bírságos tartományban félpercenként emlékeztet, visszalassuláskor egy
  feloldó hang zárja. Egy koppintással némítható a mérőkártyán.
  **Korlát:** a képernyő a mérés alatt ébren marad, de ha kikapcsolod a
  kijelzőt vagy más appra váltasz, a böngésző felfüggesztheti a lapot, és a
  hang elmarad. iPhone-on ez biztosan így van.
- **Előrejelzés:** „ha innen 130 km/h-val haladsz tovább, várhatóan
  126 km/h lesz a szakaszátlagod".
- **Eredménykártya a végén:** szakasz, idő, átlag, megengedett átlag, és egy
  mondatos verdikt.
- A technikai kapcsolók (kiváltási sugár, alapértelmezett határ, Overpass
  lekérés, térképcsempék) a **Haladó beállítások** alatt vannak, nem az első
  képernyőn.
- **Élő mérés GPS-szel.** Két munkamód:
  - *kijelölt szakasz*: a térképen megjelölöd a szakasz elejét és végét, a
    mérés elhaladáskor magától indul és áll le (rezgésjelzéssel);
  - *kézi*: induláskor és érkezéskor gombnyomás.
- **Változó sebességhatárok kezelése.** Az útvonal nem egyetlen limittel
  számol: a nyomvonal sebességhatár szerinti szakaszokra bomlik (autópálya →
  útépítési korlátozás → település), és minden szakasz a *saját* határához
  mérve kap értékelést. A hatóság is így szankcionál, nem a teljes út vegyes
  átlagára.
- **A sebességhatárok magától jönnek le, menet közben.** A mérés indulásakor
  és utána nagyjából kilométerenként lekérdezi az app a jelenlegi helyzet
  körüli kb. 1,8 km-es kört az Overpass API-tól, és a részleteket összefűzi.
  Így a táblán végig a helyben érvényes érték áll, nem csak a szakasz végén
  derül ki, mi volt kint. A Haladó beállításokban kikapcsolható; kikapcsolva
  semmilyen kérés nem megy ki, és az app az alapértékkel számol.
  A gomb ott maradt „Frissítés most, a teljes nyomvonalra” néven, utólagos
  pontosításhoz.
- **Kézi felülírás:** a sebességtáblára koppintva feljön a gyakori korlátozások
  listája (30–130) meg egy egyéni mező, és ugyanez a lap nyílik a
  kalkulátor soraiban és a szakaszlistában is. Ahol mást láttál kint, két
  koppintás átírni.
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
