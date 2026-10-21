# Útvonalbejárás

Önálló, telepíthető webalkalmazás (PWA) **túlméretes szállítmány útvonalbejárásához**.
A megadott útvonalon haladva rögzíti a nyomvonalat, fotókat készít, a fotókra
rajzolhat, méreteket írhat be, **halvány útirány-nyilat** húzhat, és
hangjegyzeteket vehet fel. Minden rögzített elem később visszakereshető.

Nincs szerver és nincs regisztráció: az adatok a készüléken maradnak
(IndexedDB), és offline is elérhetők. Az egyetlen külső forrás a választható
OpenStreetMap alaptérkép, amelynek csempéi szintén tárolódnak offline
használatra.

---

## Mit tud

| Funkció | Hol |
|---|---|
| **Nyomvonal rögzítése** GPS-szel, élő távolság / idő / pontszám / pontosság | Aktív bejárás → *Nyomvonal rögzítése* |
| **Nyomvonal utólagos szerkesztése**: szakasz elvetése indoklással vagy törlése | *Nyomvonal szerkesztése* |
| **Hiányzó szakasz berajzolása** a térképre, ahol nincs GPS-nyom | *Nyomvonal szerkesztése* → *Hiányzó szakasz berajzolása* |
| **Fotó** készítése menet közben, automatikus GPS-koordinátával | *Fotó* gomb (a telefon kameráját nyitja) |
| **Meglévő képek behozatala** (EXIF-ből GPS és idő), helyszín kijelölése a térképen | *Képek a gépről* gomb |
| **Rajzolás a képernyőn** a fotóra (szabadkéz, keret, jelölő nyíl) | Fotó → *Jelölés / méretek* |
| **Méretek beírása**: méretvonal két pont közé + beírt érték (m / cm / t) | Szerkesztő → *Méret* eszköz |
| **Halvány útirány-nyíl** — külön eszköz, saját beállításokkal | Szerkesztő → *Útirány* eszköz |
| **Égtáj (iránytű) minden fotón** — merre nézett a kamera | automatikus, Szerkesztő → *Iránytű* |
| **Hangjegyzet** felvétele a helyszínen, önállóan vagy fotóhoz csatolva | *Hangjegyzet* gomb, vagy fotó → *Hangjegyzet* |
| **Videós megjegyzés** a telefon kamerájával, bélyegképpel | *Videó* gomb |
| **Állapot- és táblarögzítés** kategóriával, állapottal, minősítéssel | *Állapot / tábla* gomb |
| **HTML-jegyzőkönyv** önálló fájlban, a közút felé átadható | *Riport (HTML)* gomb |
| **Közút Word-űrlapjainak kitöltése** (bejárás, részletező, itiner, jegyzék, rendkívüli jegyzék) | *Közút dokumentumok* gomb |
| **Élő kísérés a szállítás során**: közeledéskor szól, lejátssza a hangjegyzetet, előhozza a fotót/videót | *Élő kísérés* gomb |
| **Írott jegyzet** és pontjelölés a nyomvonalon | *Jegyzet*, *Pont jelölése* |
| **Visszakeresés** név, jegyzet, képre írt felirat, beírt méret és koordináta szerint | *Keresés* fül |
| **OpenStreetMap alaptérkép** a nyomvonal mögött, offline tárolt csempékkel | Nyomvonal szerkesztése → *Térkép* |
| **Export**: GPX, GeoJSON, teljes JSON mentés, egyedi képek | Aktív bejárás alján |

### Az útirány-nyíl (külön kezelve)

A kérés szerint ez nem egy a rajzeszközök közül, hanem saját panelt kap,
amely csak ennél az eszköznél jelenik meg:

- **Halványság csúszka (10–90%)** — alapérték 35%. A csúszka a képen már
  meglévő útirány-nyilakat is együtt állítja, hogy egységes maradjon a kép.
- **Az ív fogóponttal állítható**: a megrajzolt nyílon három fogópont jelenik
  meg — a két végpont, és középen egy sárga **hajlítás**-pont. Ez utóbbit húzva
  bármelyik irányba, tetszőleges mértékben meggörbíthető a nyíl, így pontosan
  követi a kanyart. A *Nyíl egyenesítése* gomb visszaállítja egyenesre. Egy
  meglévő nyílra koppintva később is előhívhatók a fogópontjai.
- **Gyors beszúrás**: *Balra / Jobbra / Előre / Hátra* — egy koppintással
  elhelyez egy kész nyilat, ami utána a fogópontokkal igazítható.
- A nyíl alapból **fehér**, vastagabb a többi vonalnál, és sötét kontúrt kap,
  így világos és sötét háttéren is látszik anélkül, hogy takarná a részleteket.

A rajzelemek a kép **arányos koordinátáin** tárolódnak, ezért a jelölés
bármekkora kijelzőn és a teljes felbontású exportban is pontosan ugyanoda esik.
A jelölések utólag szerkeszthetők: a fotó megnyitásakor a korábbi elemek
visszatöltődnek, egyenként törölhetők (*Törlés* eszköz), vagy visszavonhatók.

### Égtáj minden fotón

Egy terepi fotó sokszor csak akkor értelmezhető, ha tudni lehet, **merre
nézett a kamera**. Ezért minden képre rákerül egy iránytű-jel, beleégetve a
mentett képbe — így akkor is látszik, ha a fotót kiexportálva, az appon kívül
nézik.

- A korong tetején lévő **sárga háromszög a nézetirány**: azt jelöli, amit a
  képen látunk.
- A korongon belül a **piros tű az északra** mutat, a betűk (É, K, D, Ny)
  vele együtt fordulnak. Így egy pillantással látszik, hogy a képen látható
  dolog melyik égtáj felé esik.
- Alatta a felirat számmal is idézhető: pl. **DK 135°**.

Az irány forrása, sorrendben: a kép **EXIF-adata** (ha a telefon rögzítette),
a készülék **iránytűje**, végül menet közben a **haladási irány**. Az adatlapon
mindig látszik, melyikből származik.

**Ha nincs iránytű-adat** (nincs engedély, vagy a készülék nem ad ilyet), az
app szól, és az égtáj utólag megadható: Szerkesztő → *Iránytű* → *Irány
javítása*, ahol fok (`135`) és égtáj (`DK`) is beírható. Ugyanitt a jel a
képen áthelyezhető, ha eltakarna valamit.

> **iPhone:** az iránytűhöz a rendszer külön engedélyt kér, amit csak
> koppintásra lehet megadni — ezért az engedélykérés a *Fotó* gomb
> megnyomásakor jelenik meg. Ha egyszer elutasították, a Safari
> beállításaiban lehet visszakapcsolni.

Az égtáj a **keresésben** is szerepel: rá lehet keresni arra, hogy
„délkelet”, „DK” vagy „135”.

### Állapotok és táblajegyzék

A bejárás nemcsak az akadályokról szól: egy sérült útpadka vagy szalagkorlát
később vita tárgya lehet, ha csak a szállítás után derül ki. Az *Állapot /
tábla* gombbal rögzíthető a **bejáráskori állapot**:

- **Kategória**: közúti jelzőtábla, útpadka, szalagkorlát, burkolat, híd,
  légvezeték, növényzet, egyéb.
- **Állapot**: ép / sérült / hiányzik / takart.
- **Minősítés**: megfelelő / figyelendő / kritikus — ez adja a színjelölést a
  listán és a riportban.
- **Mért érték** és megjegyzés, majd felajánlja, hogy **fotót** is csatol
  ugyanehhez a bejegyzéshez (nem külön elemként).

A **táblajegyzék** ebből áll össze magától: minden „közúti jelzőtábla”
kategóriájú bejegyzés egy sor a riport táblázatában, GPS-koordinátával együtt.

> Többtagú mért értéket **pontosvesszővel** válasszon el
> (`szabad magasság: 3,80 m; útszélesség: 5,10 m`) — a vessző a tizedesjel.

### Videós megjegyzés

A *Videó* gomb a telefon saját kameraalkalmazását nyitja, és a kész felvételt
veszi át (nincs átkódolás, marad az eredeti minőség). Az app bélyegképet
készít belőle, és rögzíti a hosszát, a pozíciót és a kameairányt. 150 MB
fölött rákérdez, mert a teljes mentés és a riport is ekkorára nő.

### Otthoni szerkesztés — GPS nélkül, meglévő képekből

Ha a helyszínen nem az appot használták (hagyományos fényképezőgép, telefon
galériája), a teljes anyag utólag, otthon is összerakható:

1. **Új bejárás** a szerelvény adataival.
2. **📁 Képek a gépről** — a meglévő fotók behozatala (több is egyszerre). Ha
   a képben van GPS-adat (EXIF), az app átveszi; ha nincs, az elem
   *„📍 nincs helyszín”* jelzést kap.
3. **🗺️ Nyomvonal szerkesztése** — GPS-pont nélkül is megnyílik: az ország
   látszik, onnan rá lehet nagyítani a helyszínre (alaptérképpel, utcákkal),
   és a **✏️ Hiányzó szakasz berajzolása** gombbal megrajzolható a bejárt
   útvonal. Ez lesz a jegyzőkönyvben az útvonal.
4. **Helyszín a fotókhoz**: az elemre koppintva *📍 Hely megadása* →
   *Kijelölés a térképen* → ráközelítve koppintson a pontos helyre.
5. Innentől minden ugyanúgy megy, mint a GPS-es bejárásnál: jelölés és
   méretek a fotókon, iránytű, állapotok és táblák, **jegyzőkönyv**,
   **térképfájl**, **Közút-űrlapok**.

> A rajzolás közben a térkép nem ugrik el: az éppen rajzolt vonal nem
> mozdítja a nézetet, és egyetlen pont körül is értelmes nagyítás marad.

### Nagyítható térkép

Mindhárom térképnézet — a bejárás képernyőjén lévő kis térkép, a
nyomvonal-szerkesztő és az élő kísérés — ugyanúgy kezelhető:

- **két ujjal csippentés** nagyít/kicsinyít,
- **egy ujjal húzás** mozgatja a térképet (a bejárás képernyőjén addig, amíg
  nincs nagyítva, az egyujjas függőleges húzás az oldalt görgeti — nagyítás
  után a térképet mozgatja),
- **dupla koppintás** a megkoppintott helyre nagyít,
- a sarokban lévő **＋ / −** gombok, és a **⤢** gomb visszaáll a teljes
  nyomvonalra,
- asztali gépen az **egérgörgő** nagyít.

A nyomvonal-szerkesztőben a dupla koppintás szándékosan nem nagyít: ott a
koppintás jelöli ki a szakaszt és rakja le a berajzolt csúcsokat.

Az élő kísérésben a térkép alapból **követi a saját pozíciót** (📍 gomb). Ha
kézzel elhúzod vagy csippented, a követés kikapcsol — a 📍 gombbal bármikor
visszakérhető, a ⤢ gomb pedig a teljes útvonalat mutatja. A térképi jelölésre
koppintva előjön az ott rögzített anyag.

### A Magyar Közút dokumentumainak kitöltése

A Közút az adott engedélyre kiállított **Word-űrlapokat** küld: *Útvonal
bejárás*, *Útvonal bejárási részletező*, *Itiner*, *Jegyzék* és *Rendkívüli
jegyzék*. Ezek a Közút saját dokumentumai — fejléccel, iktatószámmal, a
szerelvény adataival és a bejárandó útvonallal. Az app **nem írja át őket**,
csak kitölti a kitöltésre váró helyeket, a többi karakter változatlan marad.

A bejárás adatlapján a **📋 Közút dokumentumok kitöltése** gomb nyitja meg:

1. **Fájlok betöltése** — a kapott `.docx` fájlok. Az app a tartalmuk alapján
   felismeri, melyik melyik, és a bejáráshoz menti őket (újratöltés és
   mentés/visszatöltés után is megmaradnak).
2. **Közös adatok** — a bejárást végző(k) neve és elérhetősége, dátum, a
   bejárási nyilatkozat szövege, a kritikus helyszínek vizsgálata, és az
   itiner mezői (kiinduló állomás, indulás, vasúti átkelés, megállók,
   mögöttes forgalom elengedése, érkezés, célállomás, zárási terv). Amit a
   bejárásból tudni lehet — időpontok, kiinduló és célkoordináta, a bejárt
   hossz, a kritikus helyszínek száma —, az előre ki van töltve.
3. **Helyszínek** — **minden rögzített elem egy sor**: a fotók is, nemcsak az
   állapotbejegyzések. Soronként: település, útszám, km szelvény (ezek a
   GPS-ből nem derülnek ki, itt adhatók meg — egy gombbal átmásolhatók a
   többi üres sorba), a leírás (a címből, a mért értékekből, a képre írt
   feliratokból és a megjegyzésből összeállítva), valamint két jelölő:
   *Kerüljön a részletezőbe* és *Jegyzékbe* (elbontandó tábla, érintett
   közúti jelzés — ott a helyreállítás technológiája is megadható). A beírt
   értékek a bejáráshoz mentődnek, legközelebb már ott vannak.
   Ha egy sorhoz nincs megadva település/útszám, a leírás végére a
   **koordináta** kerül, hogy a helyszín akkor is beazonosítható legyen.

   **Ha betöltötte az úthálózati adatot** (lásd a következő pontot), az
   útszám és a km szelvény magától megjelenik minden sornál, és egy gombbal
   beírható. Enélkül kézi úton:

   Úthálózati adat nélkül, az útszámkeresővel három lépés soronként:

   1. **🔎 Útszám és szelvény keresése** — a koordináta a vágólapra kerül
      (EOV-ban, mert a kereső azt várja), és megnyílik a kereső.
   2. A *Koordinátakeresőben*: **Beilleszt → Keres**, majd **rá kell
      kattintani a megjelölt pontra** — csak ekkor jön elő jobb oldalt az
      *Útszám* és a *Szelvény*.
   3. A panel szövegét kijelölve és kimásolva itt a **📋 Beillesztés a
      keresőből** gomb kiszedi belőle az útszámot és a szelvényt (ha a
      böngésző nem engedi a vágólap olvasását, kér egy beillesztő mezőt).

   A gombról bővebben: A Magyar Közút
   [útszámkeresője](https://utszamkereso.kozut.hu/) a *Koordinátakeresőben*
   **EOV** (Y, X) koordinátát vár, a telefon GPS-e viszont WGS84 szerinti
   szélességet és hosszúságot ad — az app ezért **átszámítja EOV-ba**, a
   vágólapra teszi, és megnyitja a keresőt (mindig ugyanabban a fülben).
   Ott: *Beilleszt* → *Keres*, és a jobb oldali panelen megjelenik az
   **Útszám** és a **Szelvény** (pl. „81” és „27 km + 387 m”), amit ide
   visszaírva a bejáráshoz mentődik. Az EOV koordináta a sorban is ott van,
   ha kézzel kell beírni.

   > Az átszámítás az EPSG:23700 szokásos paramétereivel dolgozik
   > (somerc vetület, GRS67 ellipszoid, 3 paraméteres HD72-eltolás). Az
   > útszámkereső saját adatán ellenőrizve az eltérés **10 cm alatti** — ezt
   > teszt is őrzi. Automatikus lekérdezés nincs: az útszámkeresőnek nincs
   > nyilvános, böngészőből hívható felülete.

#### Úthálózati adat (NAP) — az útszám és a szelvény magától

A [Nemzeti Adathozzáférési Pontról](https://napportal.kozut.hu/) (az EU által
előírt, országos adatkapu a közúti adatokhoz) regisztráció után ingyen
letölthető az **országos úthálózat vonalas állománya**, többek között GeoJSON
formátumban. A *Közút dokumentumok* képernyőn betöltve az app minden
rögzített ponthoz kiírja, melyik út melyik szelvényénél van:

- a fájl lehet **WGS84** vagy **EOV** vetületű — az app felismeri és
  átszámítja (ZIP-be csomagolt GeoJSON-t is elfogad);
- a mezőneveket (útszám, kezdő és vég szelvény, település) megpróbálja
  kitalálni — `KEZDOSZELVENY`, `km szelvény -tól`, `szelv_kezd`, `km_from`
  mind megy —, és a *Mezők módosítása* gombbal felül lehet bírálni;
- a szelvény a szakasz kezdő és vég szelvénye közé arányosan osztva, a
  ponthoz legközelebbi útszakaszon mérve adódik („27 km + 387 m”), a sorban
  az is látszik, hány méterre van a pont az úttól;
- egy gombbal minden üres mező kitölthető, soronként is beírható;
- a feldolgozott hálózat a készüléken marad (egyszer kell betölteni, nem
  bejárásonként), és **hálózat nélkül is működik**.

Minden dokumentum kártyáján látszik, **mi fog belekerülni** („Bekerül: 2 sor
az elvégzendő munkákhoz · dátum”), és ott a saját **Kitöltés** gombja: egy
koppintás, egy letöltés. (A böngészők az egymás után érkező letöltéseket
blokkolhatják, ezért érdemes egyesével; a *Mind kitöltése* gomb is megvan, de
ilyenkor engedélyezni kell a több fájl letöltését.) Kitöltés után a kártya
kiírja, hány helyen írt bele az app.

| Dokumentum | Mi kerül bele automatikusan |
|---|---|
| Útvonal bejárás | a bejárást végzők neve, a bejárási nyilatkozat, a kritikus helyszínek vizsgálata, dátum |
| Részletező | az *Elvégzendő munka* és a *Jegyzék* táblázat sorai, és a **fényképek** a „Fényképfelvétel a kritikus helyszínekről” rész alá, sorszámmal, helyszínnel, időponttal |
| Jegyzék | az elbontandó táblák, jelzések sorai (helyszín, megnevezés, technológia) |
| Itiner | kiinduló állomás, indulás és érkezés időpontja, megállók, zárási terv |
| Rendkívüli jegyzék | a **szállítás közben** (élő kísérésben) rögzített események: helyszín, időpont, leírás, jelleg |

A kész fájlok Wordben megnyithatók, kézzel tovább szerkeszthetők,
nyomtathatók és a Közút felé beadhatók. Ha egy adat nem derül ki a
bejárásból, a dokumentumban üresen marad — a Word-ben pótolható.

> Az app csak a kitöltésre váró helyeket írja: a táblázatok üres sorait, a
> pontozott kitöltőhelyeket és a feliratok alatti helyet. A Közút minden
> eredeti szövege, képe és formázása a helyén marad; ezt teszt ellenőrzi
> (az eredeti dokumentum minden szövegdarabjának meg kell lennie a
> kitöltöttben is).

### Pontos nyomvonal térképen (önálló térképfájl)

A bejárás adatlapján a **🗺️ Pontos nyomvonal térképen** gomb egy **önálló
HTML-térképet** készít és nyit meg: a ténylegesen bejárt vonal utcákkal,
településekkel, nagyítható és mozgatható, a rögzített elemek számozott
pöttyként — koppintásra kiírja, mi van ott, és merre nézett a kamera.

A fájl elküldhető (e-mailben, pendrive-on), és bármelyik böngészőben
megnyílik. **Az alaptérkép bele van csomagolva**, ezért hálózat nélkül is
látszik, és a fájl semmit nem kér a térképszolgáltatótól. (Ez nem kényelmi
kérdés: a saját gépről megnyitott fájl kéréseit az OpenStreetMap nyilvános
csempeszervere elutasítja — *„Access blocked: App is not following the tile
usage policy”* —, mert ott már nincs hivatkozó oldal. A csempéket ezért az
app gyűjti be a fájl készítésekor.)

A csomag az egész útvonalat lefedi áttekintő szinteken, a rögzített elemek
körül pedig utcaszinten is; amire nem jutott csempe, ott a fölöttes szint
nagyítódik ki (elmosódottan, de a tájékozódáshoz elég). Egy 140 km-es,
20 elemes bejárásnál ez nagyjából 180–190 csempe, néhány MB.

> Korábban ez a gomb a geojson.io oldalra vitte át az adatot a hivatkozásban.
> Az külső oldal: hosszabb nyomvonalnál elvágta az adatot
> („Unterminated string in JSON…”), ezért készít most az app saját fájlt.

### HTML-jegyzőkönyv a közút felé

A *Riport (HTML)* gomb **egyetlen, önálló fájlt** készít: térképpel, a
szerelvény adataival, összegzéssel, táblajegyzékkel, állapottáblázattal, az
elvetett és berajzolt szakaszokkal, majd sorszámozva minden rögzített elemmel
— a jelölt fotókkal, a hangfelvételekkel és (választhatóan) a videókkal
**beágyazva**. Külső hivatkozás nincs benne: e-mailben elküldve vagy
pendrive-on átadva is ugyanazt mutatja, és bármelyik böngészőből **PDF-be
nyomtatható**.

Készítéskor választható, mi kerüljön bele: teljes méretű fotók vagy csak
kisképek, hangjegyzetek igen/nem, videók igen/nem (ez utóbbi dönti el a
fájlméretet).

**A jegyzőkönyv térképe nem vaktérkép**: utcákkal, településekkel együtt
készül. Az alkalmazás a kép elkészítése előtt bevárja az alaptérkép csempéit
(akkor is, ha a szerkesztőben épp vázlatnézet volt bekapcsolva), ezért tart
pár másodpercig. Ha nincs hálózat és korábban sem töltődött le a terület, a
jegyzőkönyv ezt **kiírja a térkép alá** — így nem marad észrevétlen.

**A számok megmutatják, hol vannak, és kattinthatók.** A táblázatok sorszámai
rajta vannak a térképen is, ugyanazzal a jelöléssel — a térképi számra
kattintva a jegyzőkönyv a megfelelő sorra ugrik (és kiemeli):

| Jel | Mit jelöl |
|---|---|
| kék **1**, **2**, … | rögzített elem (fotó, hang, videó, jegyzet, állapot) — a számra kattintva a jegyzőkönyvben az adatlapjára ugrik |
| narancs **E1**, **E2**, … | elvetett szakasz |
| zöld **B1**, **B2**, … | berajzolt szakasz |

A táblázatokban a koordináta is szerepel, így a térképi jel mellett
számszerűen is visszakereshető a hely.

**Minden elemhez helyszínrajz tartozik**: a fotó mellett egy kis
térképkivágat mutatja, hol készült, és — ha az app tudta az irányt — merre
nézett a kamera (kék nyíl). Ez a jegyzőkönyv készítésekor kikapcsolható
(*Helyszínrajzok* → *Kihagyva*), ha gyorsabban kell elkészülnie.

**A fotók kisebb méretben jelennek meg, kattintásra teljes képernyőn
nyílnak** — a jegyzőkönyvben nem kell görgetni a nagy képek között.
Nyomtatáskor (PDF) a kisebb méret kerül a lapra.

### Élő kísérés a valós szállítás során

A kész bejárás nem csak jegyzőkönyv: a szállítás napján **navigációs
segédként** használható. A bejárás képernyőjén az *🚚 Élő kísérés* gombbal
indul, és utána magától dolgozik — nem kell kézzel keresgélni, hol mit
rögzítettünk.

Amit a kísérés közben mutat:

- **Térkép a saját pozícióval**: a nyomvonal, a figyelt pontok és egy kék
  jelölő, amely a haladási irányba fordul.
- **„Következő 4 pont”** távolsággal, 🎙️/🎬 jelzéssel — bármelyikre
  koppintva azonnal előjön az ott rögzített anyag.
- **Riasztás közeledéskor**: a beállított hatótávon (150 / 300 / 500 m)
  belülre érve rezeg, rövid hangjelzést ad, és felugrik az adatlap — a
  **hangjegyzet magától elindul**, mellette a fotó, a videó, a beírt méretek
  és a kameairány. Egy pont csak egyszer szól, hogy ne zavarjon.
- **Csak kritikus pontok** jelölővel szűkíthető a figyelt kör (a mérettel
  rögzített helyekre és a *figyelendő* / *kritikus* állapotokra).
- **Letérés jelzése**: ha 200 m-nél messzebbre kerülünk a jóváhagyott
  nyomvonaltól, figyelmeztet, és kiírja, mennyire tértünk le.

Menet közbeni rögzítés: az alsó sor négy gombjával (*Fotó*, *Videó*,
*Hangjegyzet*, *Állapot / tábla*) ugyanúgy felvehető új észrevétel — ha
például egy kritikus fordulóban azóta megsérült a tábla. Ezek az elemek
**„szállítás közben rögzítve”** megjelölést kapnak, így a jegyzőkönyvben és a
listában elkülönülnek a bejáráskori anyagtól. Amit most rögzítünk, arra a
kísérés nem riaszt vissza.

> A kísérés friss GPS-mérést kér (nem fogadja el a böngésző gyorsítótárából
> az előző helyszín koordinátáját), ezért indításkor nem riaszt olyan pontra,
> amit már elhagytunk. A képernyőt ébren tartja; a térkép a bejáráskor
> letöltött csempékből offline is kirajzolódik.

### A nyomvonal utólagos szerkesztése

A kísérőautó útja nem feltétlenül a jóváhagyandó útvonal: akadály miatt vissza
kellett fordulni, kerülőt kellett keresni. Ezt utólag, térképen lehet rendbe
tenni — a *Nyomvonal szerkesztése* gombbal.

- **↩️ Innen fordultunk vissza — egy koppintás.** A leggyakoribb esetre ez a
  gyors út: koppintson a nyomvonalon oda, ahol visszafordultak, majd nyomja meg
  a gombot. Az app a fordulóponttól kifelé haladva magától megkeresi a teljes
  zsákutcát — az odafelé és a visszafelé utat is —, egészen a becsatlakozásig,
  megmutatja kijelölve, és csak az indoklást kérdezi meg. Nem kell az A és B
  pontot külön beállítani.
- **Szakasz kijelölése kézzel**: koppintson a nyomvonalra a szakasz elejénél,
  majd a végénél (az **A** és **B** fogópont jelzi). A két csúszkával pontosan
  ráhangolható. Két ujjal nagyíthat, húzással mozgathatja a térképet.
- **Elvetett szakasz**: a kijelölés kikerül a hivatalos útvonalból, de
  **benne marad a felvételben** — szaggatott narancs vonallal, a megadott
  indoklással együtt (pl. „3,8 m magasságkorlát a hídnál”). Bármikor
  visszaállítható érvényesre.
- **Törlés**: ha az adatra nincs szükség, a kijelölt pontok véglegesen
  törölhetők.

**Hiányzó szakasz berajzolása.** Ha a helyes kerülőn a kísérőautó egyáltalán
nem ment végig, nincs róla GPS-nyom — ilyenkor a *Hiányzó szakasz berajzolása*
gombbal közvetlenül a térképre rajzolható. Koppintson sorban a szakasz
pontjaira; a meglévő nyomvonal (vagy egy másik berajzolt szakasz) közelében a
csúcs automatikusan **odailleszkedik**, így hézag nélkül csatlakozik. Az
*Utolsó pont* visszavon, a *Szakasz kész* menti névvel és megjegyzéssel. A kész
szakasz zölden jelenik meg, a listából kijelölhető, átnevezhető és törölhető.

Ami ilyenkor a helyére kerül:

- a **Táv** mező az **érvényes** útvonal hosszát mutatja, a bejárt teljes út
  külön sorban szerepel az adatlapon;
- a bejárás adatlapján felsorolva látszik minden elvetett szakasz az
  indoklásával;
- a **Pontos nyomvonal térképen** gomb a ténylegesen bejárt vonalat nyitja
  meg egy önálló térképfájlban, utcákkal (a Google Maps útvonaltervezője
  ezzel szemben csak pontokat kap és maga tervez utat — ezért az külön,
  *közelítő* jelöléssel szerepel);
- a **GPX** fő nyomvonala csak az érvényes útvonalat tartalmazza (ott, ahol
  elvetett szakasz szakítja meg, új `trkseg` kezdődik), az elvetett részek
  pedig külön, elnevezett nyomvonalként maradnak a fájlban (`<type>rejected</type>`),
  ahogy a berajzolt szakaszok is (`<type>drawn</type>`);
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
7. **A szállítás napján**: *🚚 Élő kísérés* — ugyanazt a bejárást használva az
   app szól a kritikus helyek előtt, lejátssza a hangjegyzetet, és menet közben
   új észrevétel is rögzíthető.

---

## Alaptérkép (OpenStreetMap)

A nyomvonal mögött **valódi térkép** jelenik meg utcákkal, településekkel —
OpenStreetMap-csempékből, külső térképkönyvtár nélkül, közvetlenül ugyanarra a
vászonra rajzolva. Terepen ez dönti el, hogy egy jelölés melyik útra esik.

- **Be/ki kapcsolható** a nyomvonal-szerkesztő fejlécében (*Térkép* ↔ *Vázlat*).
  A beállítás megjegyződik. Kikapcsolva marad a korábbi, adatforgalom nélküli
  vázlat méretaránnyal és északjelzéssel.
- **Ami letöltődött, offline is megmarad**: a csempék külön gyorsítótárba
  kerülnek, így a már megnézett terület hálózat nélkül is látszik. Ez a
  gyorsítótár az alkalmazás frissítésekor sem törlődik.
- **Nagyítás**: két ujjal, egérgörgővel vagy a +/− gombbal; az app a
  nagyításhoz illő csempeszintet kéri le.
- A térkép forrása fel van tüntetve a vásznon (*© OpenStreetMap
  közreműködők*), ahogy a licenc megköveteli.

### Saját csempeszerver (céges használathoz ajánlott)

Alapértelmezés az OSM nyilvános csempeszervere, ami **közösségi erőforrás**:
alkalmi használatra rendben van, rendszeres céges terheléshez viszont saját
vagy fizetős szolgáltató való. Átállítani a böngésző konzoljában lehet:

```js
localStorage.setItem('tileUrl', 'https://sajat-szerver.hu/{z}/{x}/{y}.png');
```

Ilyenkor a csempekérések oda mennek. Fontos: bekapcsolt térkép esetén a
csempeszerver látja, melyik területet nézi — a bejárás adatai (fotók, jegyzetek,
koordináták) viszont **továbbra sem hagyják el a készüléket**.

## Térképes megjelenítés és útvonaltervezés

Ez két különböző dolog, és érdemes szétválasztani:

| Cél | Eszköz | Pontkorlát |
|---|---|---|
| A bejárt vonal megnézése az appban | beépített OSM-alaptérkép | nincs |
| A bejárt vonal megosztása, nagy képernyőn | *Pontos nyomvonal térképen* (önálló HTML-térkép) | nincs |
| Navigáció a bejárt vonal mentén, terepen | **GPX export** → OsmAnd, Organic Maps | nincs |
| Új útvonal terveztetése | *Útvonalterv Google Maps* | **max. 9 köztes pont**, és újratervez |

A Google Maps hivatkozásos felülete legfeljebb 9 köztes pontot fogad, és a
megadott pontok között a saját útvonalát tervezi meg — ezért ott *közelítő*
jelzéssel szerepel. Ha a pontos vonalat kell követni menet közben, a **GPX
exportot** töltse be egy olyan navigációs alkalmazásba, amely nyomvonalat
tud követni (OsmAnd, Organic Maps): ezek pontszám-korlát nélkül kezelik a
nyomvonalat, és offline térképpel is működnek.

## Helyadatok megbízhatósága

A dokumentáció csak akkor ér valamit, ha a koordináta oda tartozik, ahová
állítja. Ezért:

- **Friss mérés minden elemhez.** Rögzítés közben a nyomvonal utolsó, 10
  másodpercnél nem régebbi fixe használható; egyébként új mérés indul, tárolt
  koordináta elfogadása nélkül. Ha csak tárolt fix érhető el, az elem
  „GPS, tárolt mérés” jelölést kap.
- **Importált képeknél a felvétel helye számít.** Galériából behozott
  fotóknál az app kiolvassa a kép EXIF-adatából a készítés helyét és idejét —
  nem a behozatal pillanatnyi helyét használja. Ha nincs EXIF-adat, az elem
  helyadat nélkül marad, és ezt jelzi is.
- **Kézi helymegadás.** Az elem adatlapján a *Hely megadása / javítása*
  gombbal a koordináta beírható, átvehető friss méréssel, vagy a nyomvonal
  időben legközelebbi pontjáról.
- Az adatlapon mindig látszik, **honnan** való a koordináta és mekkora a
  mérési pontosság.

### GPS-kimaradás

Ha a jel hosszabb időre elveszik (2 percnél tovább, és közben 250 méternél
nagyobbat ugrik a pozíció), vagy a rögzítést leállítják és később
újraindítják, a köztes szakaszt nem jártuk be igazolhatóan. Az ilyen rész
**pontozott, halvány vonalként** jelenik meg, **nem számít bele** a bejárt
távba, az adatlapon külön sorban szerepel, a GPX-ben és a GeoJSON-ban pedig
ott megszakad a nyomvonal. Így nem keletkezik légvonalbeli „szellemút”.

## Biztonsági mentés

Az adatok a böngésző helyi adatbázisában vannak — a böngészőadatok törlése
mindent visz. Ezért a bejárás adatlapján mindig látszik a **mentés állapota**:
mikor készült utoljára teljes mentés, és változott-e azóta bármi. A sávra
koppintva azonnal kiírható a JSON mentés; a rögzítés leállításakor az app
emlékeztet is rá.

## Licencelés

Az alkalmazás **szerver nélkül** ellenőrzi a jogosultságot: a licenckulcsot a
kiadó privát kulcsával aláírják, az app pedig a beágyazott nyilvános kulccsal
ellenőrzi — offline, a készüléken.

**Őszintén a korlátairól:** mivel a kód a felhasználó készülékén fut, aki ért
hozzá, ki tudja kerülni. A védelem igazi ereje nem a zár, hanem a **névre
szólóság**: a licencelt cég neve rákerül a jegyzőkönyvre, licenc nélkül pedig
nagy „PRÓBAVERZIÓ” vízjelet kap. Egy fuvarozó nem ad be a közútnak olyan
jegyzőkönyvet, amin más cég neve vagy ez a felirat szerepel.

### Állapotok

| Állapot | Mit tud |
|---|---|
| **Nincs beállítva** (`PUBLIC_KEY = null`) | Minden korlátozás nélkül — a licencelés ki van kapcsolva |
| **Próbaverzió** (nincs kulcs) | 1 bejárás; a jegyzőkönyv „PRÓBAVERZIÓ” vízjelet kap |
| **Érvényes licenc** | Minden; a jegyzőkönyvön a cég neve és a lejárat |
| **Lejárt licenc** | Új bejárás nem indítható; a jegyzőkönyv „LEJÁRT LICENC” vízjelet kap |

**Alapelv:** a lejárt licenc **soha nem zárja ki a felhasználót a saját
adataiból.** Minden korábbi bejárás megnyitható, és a GPX, a GeoJSON meg a
teljes JSON mentés minden állapotban működik. Csak az *új* munka és a
hivatalosnak látszó jegyzőkönyv van licenchez kötve.

### Kulcspár készítése (egyszeri)

```bash
node eszkozok/licenc.mjs kulcspar
```

A **privát** kulcs a tárolón kívülre kerül (`licenc-privat.json`, a
`.gitignore` kizárja), a **nyilvános** kulcs pedig beíródik a
`js/licenc-kulcs.js` fájlba. A privát kulcsot őrizd meg: ha elveszik, a már
kiadott licencek érvényben maradnak, de újat csak új kulcspárral tudsz
kiadni — ami viszont a régieket érvényteleníti.

### Licenc kiadása ügyfélnek

```bash
node eszkozok/licenc.mjs kiad --ceg "Példa Fuvar Kft." --lejarat 2027-12-31
node eszkozok/licenc.mjs ellenoriz "UB1.…"      # mit tartalmaz, érvényes-e
```

A kapott szöveget az ügyfél az alkalmazásban illeszti be: **Bejárások →
a licencsáv → Licenckulcs**. Internet nem kell hozzá, és a készüléken marad.

### Mire figyelj, ha eladod

- A **tároló legyen privát**, és a fizetős változat ne legyen elérhető
  nyilvános címen. Publikus tárolóból bárki elviheti az egészet.
- Ügyfelenként érdemes **saját példányt** átadni (`node build-single.mjs`),
  nem közös linket.
- A **térképcsempék** forrása ma az OSM közösségi szervere, ami üzleti
  terhelésre nem való — fizetős terméknél saját vagy vásárolt szolgáltató kell.

## Adatkezelés

- Minden adat a böngésző **IndexedDB** tárolójában marad, a készüléken.
- Az app kéri a tartós tárolást (`navigator.storage.persist`), hogy a böngésző
  ne törölje a felvételeket helyszűke esetén.
- A fotók mentés előtt max. 2000 képpontra zsugorodnak (kb. 300–600 kB / kép),
  hogy egy hosszabb bejárás is elférjen.
- A *Teljes mentés (JSON)* a fotókat, a hangjegyzeteket, a **videókat** és a
  Közúttól kapott Word-űrlapokat is tartalmazza — videóval ez nagy fájl lesz.
- Külső oldalt csak az *Útvonalterv Google Maps* és az elemek *Térképen*
  gombja nyit — ezek koordinátákat adnak át a Google-nek. A *Pontos nyomvonal
  térképen* saját fájlt készít: a bejárás adata nem hagyja el a készüléket, és
  a kész fájl sem kér semmit a hálózattól (az alaptérkép bele van csomagolva).
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
    ├── tiles.js            OSM-csempék betöltése és offline tárolása
    ├── compass.js          kameairány a készülék tájolásérzékelőjéből
    ├── report.js           önálló HTML-jegyzőkönyv összeállítása
    ├── kiseres.js          élő kísérés a szállítás során (közelségi riasztás)
    ├── terkepnezet.js      nagyítás/mozgatás a térképes vásznakon
    ├── terkepfajl.js       önálló, nagyítható HTML-térkép a nyomvonalról
    ├── docx.js             Word-fájlok (.docx) kibontása, kitöltése, mentése
    ├── eov.js              GPS ↔ EOV átszámítás (EPSG:23700)
    ├── uthalozat.js        NAP úthálózati adat: betöltés, útszám- és szelvénykeresés
    ├── kozut.js            a Közút űrlapjainak kitöltése a bejárás adataiból
    ├── media.js            képzsugorítás, bélyegkép, hangfelvétel
    └── ui.js               modális ablakok, értesítés, letöltés
```

## Korlátok

- **Lezárt képernyővel nem lehet rögzíteni.** Ha a képernyő lezár vagy más
  alkalmazásra vált, a böngésző felfüggeszti az oldalt, és a GPS-figyelés
  leáll; erre a webes platformon nincs megoldás. Amit az app tud: ébren
  tartja a képernyőt, és rögzítés közben felkínálja a **🌙 Képernyő
  elsötétítése** gombot — ilyenkor a kijelző szinte fekete (sokkal kevesebbet
  fogyaszt), a mérés viszont fut tovább, és a táv folyamatosan látszik.
  Valódi háttérrögzítéshez az appot natív alkalmazásba kellene csomagolni.
  Ugyanez igaz az **élő kísérésre**: a riasztásokhoz az appnak előtérben kell
  lennie (a képernyőt ébren tartja), ezért kísérés közben érdemes a telefont
  töltőre/tartóra tenni.
- Alaptérkép csak hálózaton tölthető le; offline az marad meg, amit korábban
  már megnézett (a csempék tárolódnak).
- Az iOS Safari a hangfelvételt `audio/mp4`, a Chrome `audio/webm` formátumban
  menti — mindkettő lejátszható az appban és exportálható.
