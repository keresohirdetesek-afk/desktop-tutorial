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
- **Digitális műszer, nem számlap.** A minta egy gyári műszeregység: sötét
  csatornában világító, vastag gyűrű, középen nagy fehér számmal. A
  világítást széles, halvány ívmásolat és a szám mögötti sugaras derengés
  adja, szűrő nélkül, hogy mobilon se akadjon. Az osztások a gyűrűbe vágott
  rovátkák, a bírságos tartomány pedig a csatornán is látszik, mint a
  fordulatszámmérő vörös mezője. Mutató nincs: a világító ív elülső élét
  világos vonás zárja. A pillanatnyi sebesség jele a gyűrű belső élén fut,
  a száma a műszer lábsorában áll, a sebességkorlátozó tábla mellett.
- **Sebességprofil a végén.** Az eredménykártyán és a kalkulátorban
  grafikon mutatja, hol mennyivel haladtál a korlátozáshoz képest. A nulla
  vonal a helyben érvényes korlátozás, ezért a korlátozás váltása nem
  billenti meg a képet: egy lakott területi 50-es és egy autópályás 130-as
  ugyanazon a nullán ül. A vonal fölötti piros terület a túllépés, alatta a
  zöld a ráhagyás. A felirat kimondja, hogy ez a pillanatnyi sebesség, nem
  a szakaszátlag: a bírság az átlagból lesz, a grafikon azt mutatja meg,
  hol keletkezett az az átlag. Kód: `js/profil.js`.
- **A grafikon nagyítható.** Valódi úton negyven fölötti korlátozásváltás
  is előfordul, telefon szélességében ezek egymásra csúsznak. A `1x 2x 4x
  8x` gombokkal a rajz szélesebb vászonra kerül (a betűk maradnak
  ugyanakkorák), és oldalt görgethető; ami így sem fér ki, annak a
  felirata elmarad, a vonása marad. A „Teljes képernyőn" gomb egy külön
  nézetet nyit 16x-ig, ahol a képernyő magasságához igazodik a rajz.
- **A grafikon rákerül a megosztható képre is.** A letöltött PNG-n
  ugyanaz a profil szerepel, mert a képen az a legbeszédesebb rész.
- **Egyetlen műszer mondja meg, lassíts-e.** Menet közben egy kérdés van:
  gyorsabban vagy lassabban? A gyűrű a *pillanatnyi* sebességet rajzolja,
  a színe pedig a **tartható tempóhoz** méri: az az a sebesség, amivel a
  szakasz hátralévő részét megtéve az átlagod épp a megengedetten marad
  (`celTempo()`). A tartható tempót világos jel mutatja a gyűrűn, a
  szakaszátlagot karikás Ø jel ugyanott, a bírság szerinti színnel.
  A nagy szám a pillanatnyi sebesség, fölötte kicsiben a szakaszátlag,
  a lábsorban pedig egyetlen utasítás: LASSÍTS / TARTSD / MEHETSZ, a
  célsebességgel. A cél sosem lehet több a helyi korlátozásnál, akkor sem,
  ha az átlagba még beleférne.
- **A műszerfalad többet mutat, mint a GPS.** A kilométeróra jogszabály
  szerint sosem mutathat kevesebbet a tényleges sebességnél, felfelé
  viszont eltérhet: legfeljebb a valós érték 110%-a plusz 4 km/h
  (ENSZ-EGB 39.). Ezért a Pillanatnyi érték alatt kiírjuk, nagyjából
  mennyit mutat ilyenkor a műszerfal, és a Tudnivalók elmagyarázza,
  miért a kisebb szám a valós.
- **A tábla a helyben érvényes korlátozást mutatja**, ha egyszer lekérted a
  határokat: ahogy az útépítési szakaszra érsz, 130-ról 80-ra vált. Ez
  független a „megengedett átlag" mezőtől, ami az egész szakaszra vonatkozó,
  hosszal súlyozott érték. A tábla bármikor felülírható koppintással.
- **Hangjelzés, ha átléped a megengedettet.** A böngésző szintetizálja
  (nincs hangfájl, offline is szól): lágy, gongszerű kettős hang, mint a
  repülőgépek utastéri jelzése, rezgéssel együtt. Csak romló irányban szól,
  a bírságos tartományban félpercenként emlékeztet, visszalassuláskor egy
  feloldó hang zárja. Egy koppintással némítható a mérőkártyán.
  A Haladó beállítások alatt **kipróbálható** gombbal, mert menet közben
  csak valódi túllépéskor szólal meg.
  **Korlátok:** a képernyő a mérés alatt ébren marad, de ha kikapcsolod a
  kijelzőt vagy más appra váltasz, a böngésző felfüggesztheti a lapot, és a
  hang elmarad; iPhone-on ez biztosan így van. Szintén iPhone-on a néma
  kapcsoló a webes hangot is elnémítja, a média-hangerőtől függetlenül.
- **Előrejelzés:** „ha innen 130 km/h-val haladsz tovább, várhatóan
  126 km/h lesz a szakaszátlagod".
- **Egy szakasz, egy bírság.** A szakaszellenőrzés a szakasz egészét méri,
  és egy áthaladás egy szabálysértés, ezért a részenkénti tételek **nem**
  adódnak össze: a bírságot a legsúlyosabb rész szabja meg. A többi
  túllépés a részletes listában és a „Számok részletesen" alatt látszik,
  csak nem növeli az összeget. Az `app.js` `birsagOsszeg()` egyetlen helyen
  dönti el ezt; a `js/birsag.js` `osszegHalmozott` mezője megmarad, ha
  valaha mégis halmozó modellre kellene váltani.
- **Világos és sötét téma.** A fejléc gombja körbelépteti a rendszer, a
  világos és a sötét beállítást; a Tudnivalók között gombsorral is
  választható. A választás a `<html data-theme>` attribútumba kerül, a
  térkép csempekészlete pedig azonnal követi.
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
- **Kalkulátor GPS nélkül**, a mérőképernyővel azonos műszer-nyelven:
  ugyanaz a sebességóra mutatja az átlagot, alatta státuszsáv, majd a
  szakasz arányos képe (a szélesség a hossz, a szín az ítélet), végül a
  projekt legjobban megosztható üzenete két csempén: *ennyit nyersz* és
  *ennyibe kerül*. A részletes számok lenyithatók.
  Vegyes korlátozásnál a megengedett átlag nem közúti táblában jelenik meg,
  hanem semleges `Ø` jelként: az az érték sehol nincs kitáblázva.
- **Megosztható eredménykép.** A böngésző rajzolja vászonra a készüléken
  (1080×1180, álló), és a telefon megosztólapjával küldhető; ahol az nincs,
  letöltésként. Semmilyen adat nem megy szerverre, és a megosztást is a
  felhasználó indítja.
- **Műszer-tipográfia.** A számok táblázatos számjegyű betűvel (JetBrains
  Mono, OFL, helyben tárolva, ~42 KB), így változáskor nem ugrálnak.
- **Sima mozgás.** A mutató forgatott csoportban ül, ezért a CSS át tudja
  úsztatni; a nagy szám átszámlál. Mozgásérzékeny beállításnál mindkettő
  azonnalira vált.
- **Sötét térkép sötét témában** (CARTO dark, ingyenes, kulcs nélküli), hogy
  éjszaka ne vakítson. Témaváltáskor magától cserél.
- **Telepíthető (PWA), offline is működik** — a térképcsempéken kívül.

## Épeszűségi korlát: 250 km/h

Személyautóval reálisan elérhető felső sebesség. Ennél nagyobb érték nem
vezetésből származik, hanem GPS-ugrásból: alagútból kilépve, sűrű városban
vagy hídon a vevő néha több száz métert téved egy fix alatt. Ha ezt
beszámolnánk, a nyomvonal hossza és vele az átlag maradandóan elromlana.

Ezért a `MAX_SEBESSEG` (`js/geo.js`) három helyen fog:

- **Mérés közben** eldobjuk azt a fixet, ami a előzőhöz képest 250 km/h
  fölötti elmozdulást jelentene. Öt egymás utáni eldobás után mégis
  elfogadunk egyet, hogy hosszabb jelkiesés után ne akadjunk el.
- **A kijelzett pillanatnyi sebesség** erre az értékre van vágva.
- **A kalkulátor** nem számol bírságot irreális tempóra: megmondja, hogy a
  megadott hossz vagy menetidő hibás lehet.

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

## Frissítés és a service worker

A service worker az app saját fájljait **hálózat-először** szolgálja ki, 2,5
másodperces türelemmel, utána a gyorsítótárból. Ez fontos: korábban
gyorsítótár-először ment, és emiatt egy kiadás után az első indítás még a
régi appot futtatta, az új kód csak a következő indításkor jelent meg. Aki
kipróbált egy frissen kitett funkciót, nem találta.

Offline vagy lassú kapcsolatnál a türelmi idő után a gyorsítótár válaszol,
tehát a repülős/alagutas működés megmarad. A `CACHE` nevét (`atlagsebesseg-vN`)
minden olyan kiadásnál emeljük, ahol a fájllista változik.

## Tesztek

A `teszt/tesztek.mjs` 140 ellenőrzést futtat végig 22 témában: bírságtáblázat
sávonként, kapus és kézi mérés, megállás a végkapuban, GPS-ugrás és
kiesés, tartható tempó, kalkulátor mindkét megadási módban, sebességprofil
és nagyítás, megosztható kép, téma, elrendezés négy kijelzőszélességen és
két témán, hozzáférhetőség, offline működés, valamint hat valósághű
menetszimuláció (autópálya, lakott terület, dugó utáni gyorsítás).

A GPS-t egy menetprofil-lejátszó helyettesíti: szakaszok listája
`[sebesség km/h, hossz méter]` alakban, két másodperces fixekkel. Így egy
tízperces út két másodperc alatt lejátszható.

```
python3 -m http.server 8768 --directory atlagsebesseg
node atlagsebesseg/teszt/tesztek.mjs
```

A Playwright nem függősége a projektnek (az app maga függőségmentes marad),
ezért vagy legyen telepítve a `playwright-core`, vagy add meg a helyét:
`ATLAG_PW=/út/playwright-core/index.js`. A kiszolgáló címe az `ATLAG_URL`,
a böngészőé az `ATLAG_CHROME` változóval állítható.

## Fájlok

```
atlagsebesseg/
├── index.html          képernyők: mérés, kalkulátor, tudnivalók
├── css/app.css
├── js/
│   ├── app.js          összefogó réteg, megjelenítés
│   ├── profil.js       sebességprofil a korlátozáshoz mérve
│   ├── tema.js         világos/sötét téma, a fejléc gombja
│   ├── birsag.js       410/2007. bírságtáblázat és értékelés
│   ├── geo.js          távolság, pont–szakasz vetítés, formázás
│   ├── limits.js       OSM/Overpass lekérés, maxspeed, szakaszokra bontás
│   ├── map.js          Leaflet-térkép
│   └── track.js        GPS-rögzítés, automatikus szakaszhatár-figyelés
├── teszt/tesztek.mjs   szimulációs tesztkészlet (140 ellenőrzés)
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
- Egyetlen kulcs kerül a `localStorage`-ba: `atlagsebesseg-tema`, értéke
  `vilagos` vagy `sotet`. Enélkül a téma minden újratöltéskor visszaugrana.
  Nem személyes adat, nem azonosító, és a rendszerkövetés visszaállításakor
  törlődik. Ha ez sem fér bele, egyetlen sor a `js/tema.js`-ben (a
  `localStorage.setItem` hívás) kiveszi, és a választás csak a lap
  bezárásáig él.
- Külső kérés csak kettő fordul elő, mindkettő kikapcsolható:
  a térképcsempék (OpenStreetMap) és a sebességhatárok lekérése
  (Overpass API, csak gombnyomásra).
- A service worker kizárólag az app saját fájljait gyorsítótárazza.

## Jogi

Tájékoztató eszköz, nem hatósági mérőműszer és nem jogi tanácsadás.
A megjelenített összegek a 410/2007. (XII. 29.) Korm. rendelet szerinti
tájékoztató értékek.
