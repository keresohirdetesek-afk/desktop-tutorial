# Publikálás — részletes leírás

Ez a dokumentum azt írja le, hogyan kerül az `atlagsebesseg/` mappa tartalma
élesbe az **atlagsebesseg.hu** címre, mit kell hozzá beállítani, mit kell
utána ellenőrizni, és mi az, ami később karbantartást igényel.

---

## 0. Kiindulási helyzet

**Az alkalmazás kész.** Statikus fájlok, nincs szerveroldal, nincs build:
amit a mappa tartalmaz, azt kell kitenni egy HTTPS-t adó tárhelyre.

| Amit tudunk | Érték |
| --- | --- |
| A domain regisztrálva van | `atlagsebesseg.hu` → `193.201.189.221` |
| `www.atlagsebesseg.hu` | ugyanoda mutat |
| Névszerverek | `ns1.introdns.hu` (193.201.191.136), `ns2.introdns.hu` (138.68.90.93) |
| A webkiszolgáló neve | `vtantalum.d3.hu` — megosztott tárhely |
| A repó | `keresohirdetesek-afk/desktop-tutorial`, az app az `atlagsebesseg/` almappában |
| Tesztek | 314 ellenőrzés, mind zöld |

Ebből három dolog következik:

1. **Nem kell domaint regisztrálni**, a név a tiéd, és a DNS él.
2. **A DNS és a webkiszolgáló ugyanannál a szolgáltatónál van.** A
   névszerverek (`193.201.191.136`) és a webkiszolgáló (`193.201.189.221`)
   egy IP-tartományban vannak, a kiszolgáló neve pedig `vtantalum.d3.hu`.
   Ez azt jelenti, hogy a domain mögött **nagy valószínűséggel már van
   tárhelycsomagod** — a fájlokat csak fel kell tölteni. A szolgáltató
   nevét a számládon vagy a domain ügyfélkapujában találod; a névszerver
   alapján `introdns.hu`, ami az INTRONET Kft.-hez köthető.
3. Az app minden hivatkozása (`og:url`, `canonical`, `sitemap.xml`, a
   megosztható képre írt cím) **a tartomány gyökerét** feltételezi:
   `https://atlagsebesseg.hu/`. Ha almappába kerül, ezek hamis címre
   mutatnak.

---

## 1. Melyik utat válaszd

### „A” — a meglévő tárhelyre töltöd fel *(neked ez a kézenfekvő)*

Ha az `atlagsebesseg.hu` mögött van fizetett tárhelyed (cPanel, Plesk vagy
hasonló), akkor **semmit nem kell átállítani**: az `atlagsebesseg/` mappa
tartalmát felmásolod a webgyökérbe, és kész.

- **Előny:** nincs DNS-változás, nincs várakozás, azonnal él. A HTTPS-t a
  szolgáltató Let's Encryptje adja, jellemzően egy kapcsolóval.
- **Hátrány:** a frissítés kézi (FTP/SFTP), nincs verziókövetés az élesben.
  Minden kiadásnál emlékezni kell a `sw.js` gyorsítótár-nevének emelésére.
- **Kinek való:** ha a tárhely már ki van fizetve, és nem akarsz DNS-hez
  nyúlni.

### „B” — GitHub Pages, külön repóban *(ezt ajánlom)*

Új repó, aminek a **gyökerében** áll az app, a domain oda mutat.

- **Előny:** ingyenes, a `git push` maga a kiadás, minden változás
  visszakövethető, a HTTPS automatikus. A jelenlegi fájlok minden
  hivatkozása helyes marad, mert az app a gyökérben lesz.
- **Hátrány:** egyszeri DNS-átállítás kell, és a terjedés pár óra.
- **Kinek való:** ha a projekt tovább fejlődik, és nem akarsz kézzel
  fájlokat másolgatni.

### „C” — marad ebben a repóban, almappában *(nem ajánlom)*

`keresohirdetesek-afk.github.io/desktop-tutorial/atlagsebesseg/` vagy
`atlagsebesseg.hu/atlagsebesseg/`.

- **Hátrány:** át kell írni az `og:url`, `canonical`, `robots.txt`,
  `sitemap.xml` értékeit és a megosztható képre írt címet, a látogató pedig
  egy csúnya, hosszú URL-t kap. A `www` és a gyökér üresen marad vagy a
  másik alkalmazást mutatja.
- Csak akkor éri meg, ha kifejezetten a két app közös listáját akarod a
  gyökérben tartani.

---

## 2. „A” út — feltöltés a meglévő tárhelyre

Ez a legrövidebb út: **a DNS már jó helyre mutat**, nincs mit átállítani,
nincs terjedési várakozás. Csak a fájlok hiányoznak.

### 2.1 Mit tölts fel

A feltöltendő állomány a repó `atlagsebesseg/` mappája, **teszt és
dokumentáció nélkül** — pontosan ez a 34 fájl:

```
.htaccess           index.html          adatvedelem.html
manifest.webmanifest  sw.js             robots.txt          sitemap.xml
css/app.css
js/  (11 modul)     icons/ (5 fájl)     vendor/ (leaflet + fonts)
```

Ez a csomag külön ki van gyűjtve, és a teljes tesztkészlet lefut rajta
önmagában is — tehát ha ezt felmásolod, semmi nem hiányzik.

A `teszt/` mappát, a `README.md`-t és ezt a `PUBLIKALAS.md`-t **ne** töltsd
fel: az élesben semmit nem csinálnak.

### 2.2 A feltöltés menete

1. **Lépj be a szolgáltató ügyfélkapujába.** A névszerver
   (`ns1.introdns.hu`) alapján ez az INTRONET Kft. rendszere; a pontos
   belépési címet a számlád vagy a domainregisztrációs visszaigazoló
   levél tartalmazza.
2. **Keresd meg a tárhelycsomagot.** Ha van, tartozik hozzá FTP-fiók vagy
   fájlkezelő. Ha nincs tárhelycsomagod — csak a domain —, akkor vagy
   rendelsz egyet, vagy a „B” utat választod (GitHub Pages, ingyenes).
3. **Töltsd fel a fájlokat a webgyökérbe.** A mappa neve
   szolgáltatófüggő: `public_html`, `www`, `web` vagy `htdocs`. Fontos,
   hogy a **mappa tartalma** kerüljön oda, ne maga a mappa — az
   `index.html`-nek közvetlenül a gyökérben kell lennie.
4. **A rejtett fájlokat is töltsd fel.** A `.htaccess` ponttal kezdődik,
   ezért sok FTP-kliens alapból elrejti. FileZillában:
   *Kiszolgáló → Rejtett fájlok kényszerített megjelenítése*.
5. **Kapcsold be a HTTPS-t** (Let's Encrypt) a vezérlőpultban. GPS-hez
   kötelező: titkosítatlan oldalon a böngésző nem ad helyzetet.
6. Ugorj a **4. fejezetre** (ellenőrzés).

### 2.3 A `.htaccess`

A csomagban van egy `.htaccess`, ami Apache alatt elintézi a következőket:

- **HTTP → HTTPS** átirányítás,
- **`www` → `www` nélküli** alak (az oldal `canonical`-ja ez),
- helyes MIME-típus a `.webmanifest` és a `.woff2` fájloknak,
- **a `sw.js` nem gyorsítótárazódik** — ez a legfontosabb sor: ha a
  böngésző a régi service workert kapja vissza, az app frissítése hetekre
  elakadhat,
- tömörítés, könyvtárlistázás tiltása.

Ha a szolgáltató nem Apache-ot használ (nginx vagy saját konfigurációjú
LiteSpeed), a fájl hatástalan — akkor ugyanezt a vezérlőpultban vagy a
támogatásnál kell kérni. **A `sw.js` gyorsítótárazásának tiltását akkor is
érdemes elintézni.**

### 2.4 Kötelező: a tárhelyszolgáltató neve a tájékoztatóban

Az `adatvedelem.html` **két helyen** a GitHub, Inc.-et nevezi meg
tárhelyszolgáltatóként (a 4/a pontban és az impresszum „Tárhely” sorában,
mindkettő HTML-megjegyzéssel megjelölve). Ha a meglévő magyar tárhelyre
töltesz fel, **ez valótlan állítás lesz** — az Elker tv. szerint a
tárhelyszolgáltató megnevezése kötelező eleme az impresszumnak.

A 4/a pont helyére ez a szöveg való (a szögletes zárójeles részeket a
szolgáltatód cégadataira cserélve, amik a számládon szerepelnek):

```html
<h4 class="jog-alcim">a) Tárhely</h4>
<p>
  Az oldal fájljait a [Szolgáltató teljes cégneve] ([székhely címe])
  szolgálja ki. A kiszolgálás során a szolgáltató naplózhatja a kérés
  IP-címét, idejét és a böngésző azonosítóját — ez minden weboldalnál így
  van, üzemeltetési és biztonsági célból.
  <strong>Ezekhez a naplókhoz mi nem férünk hozzá.</strong> A szolgáltató
  kiszolgálói Magyarországon vannak, tehát az adatok nem hagyják el az
  Európai Gazdasági Térséget.
</p>
```

Az impresszum „Tárhely” sorába pedig:

```html
<dt>Tárhely</dt><dd>[Szolgáltató teljes cégneve], [székhely], [e-mail]</dd>
```

Ha ezt megvan, írd át a tájékoztató tetején a „Hatályos:” dátumot a
kiadás napjára.

### 2.5 Ha nincs tárhelyed, csak a domain

Ekkor a DNS-t kell a GitHub Pages felé fordítani — a névszerverek
maradhatnak az `introdns.hu`-nál, csak az **A rekordokat** kell átírni a
szolgáltató DNS-kezelőjében. A pontos értékek a 3.3 pontban.

---

## 3. „B” út — GitHub Pages, lépésről lépésre

### 3.1 Az új repó

A GitHub felületén hozz létre egy **publikus** repót, például
`atlagsebesseg`. Ne adj hozzá README-t, hogy üres maradjon.

Utána, a gépeden:

```bash
# 1. új, üres munkakönyvtár
mkdir ~/atlagsebesseg-web && cd ~/atlagsebesseg-web
git init -b main

# 2. az app tartalma — a mappa TARTALMA, nem a mappa
cp -r /útvonal/desktop-tutorial/atlagsebesseg/. .

# 3. ami nem való élesbe
rm -rf teszt

# 4. GitHub Pages ne próbálja Jekyllel feldolgozni
touch .nojekyll

# 5. a saját domain
echo "atlagsebesseg.hu" > CNAME

git add -A
git commit -m "Átlagsebesség.hu első kiadás"
git remote add origin https://github.com/keresohirdetesek-afk/atlagsebesseg.git
git push -u origin main
```

> A `teszt/` mappát azért veszem ki, mert az élesben semmit nem csinál. Ha
> viszont a teszteket is verziókövetve akarod tartani, hagyd bent — nem árt,
> csak pár tíz kilobájt, és nem hivatkozik rá semmi.

> A `.nojekyll` fájl nélkül a GitHub Pages kihagyja az aláhúzással kezdődő
> fájlokat és mappákat. Most nincs ilyen, de olcsó biztosíték.

### 3.2 Pages bekapcsolása

A repó **Settings → Pages** oldalán:

- **Source:** *Deploy from a branch*
- **Branch:** `main`, mappa: `/ (root)`
- **Save**

Egy-két perc múlva megjelenik a `https://keresohirdetesek-afk.github.io/atlagsebesseg/`
cím. **Ezen ellenőrizd először**, hogy minden betölt — DNS előtt.

> Almappás címen az `og:url` és a `canonical` még hibás lesz. Ez normális,
> a domain rákötése után lesz helyes. A működést viszont már itt látod.

A **Custom domain** mezőbe írd be: `atlagsebesseg.hu`, majd **Save**. Ez
létrehozza (vagy felülírja) a `CNAME` fájlt a repóban — ezért is tettük bele
előre ugyanazt az értéket.

### 3.3 DNS — a lényegi lépés

A domain regisztrátorod DNS-kezelőjében **cseréld le** a mostani rekordokat.
Ez az a pont, ahol az oldal átvált a régi tárhelyről.

**Töröld** a gyökérre (`@` vagy üres név) mutató jelenlegi `A` rekordot
(`193.201.189.221`), majd vedd fel ezt a négyet:

| Típus | Név | Érték | TTL |
| --- | --- | --- | --- |
| A | `@` | `185.199.108.153` | 3600 |
| A | `@` | `185.199.109.153` | 3600 |
| A | `@` | `185.199.110.153` | 3600 |
| A | `@` | `185.199.111.153` | 3600 |

Ha a szolgáltatód kezel IPv6-ot, vedd fel ezeket is:

| Típus | Név | Érték |
| --- | --- | --- |
| AAAA | `@` | `2606:50c0:8000::153` |
| AAAA | `@` | `2606:50c0:8001::153` |
| AAAA | `@` | `2606:50c0:8002::153` |
| AAAA | `@` | `2606:50c0:8003::153` |

És a `www` alnév:

| Típus | Név | Érték |
| --- | --- | --- |
| CNAME | `www` | `keresohirdetesek-afk.github.io.` (a záró ponttal együtt) |

**Amit ne csinálj:** ne hagyj bent `*` (wildcard) rekordot, és ne maradjon
ott a régi `A` rekord a négy új mellett — a látogatók egy része a régi
tárhelyre futna.

A terjedés a régi rekord TTL-jétől függ: jellemzően **10 perctől néhány
óráig**. Ha türelmetlen vagy, a váltás előtti napon vedd le a régi rekord
TTL-jét 300 másodpercre.

### 3.4 HTTPS

Amikor a DNS beállt, a **Settings → Pages** oldalon megjelenik az
**Enforce HTTPS** kapcsoló — kapcsold be. A tanúsítványt a GitHub kéri a
Let's Encrypttől, ez pár perctől pár óráig tart. Amíg nincs kész, a kapcsoló
szürke; ilyenkor csak várni kell.

**Ez nem opcionális:** titkosítás nélkül a böngésző nem ad helyzetet, tehát
a GPS-es szimuláció, vagyis az app lényege nem működne.

---

## 4. Ellenőrzés publikálás után

### 4.0 Először: a megosztási meta-adatok visszaállítása

Amíg az `atlagsebesseg.hu` nem élt, a link megoszthatósága miatt az
`index.html` két sora ideiglenesen a GitHub Pages-címre mutat. Ezeket a
domain élesítésekor **vissza kell írni**, különben minden megosztott link
és minden előnézeti kép a régi tesztcímre visz:

```html
<meta property="og:url"   content="https://atlagsebesseg.hu/">
<meta property="og:image" content="https://atlagsebesseg.hu/icons/og.png">
```

Mindkét sor felett HTML-megjegyzés jelzi, hogy ideiglenes. A `canonical`
már most is a végleges domainre mutat, azt nem kell bántani.

Visszaállítás után a Facebook a régi adatokat gyorsítótárazva tartja: a
<https://developers.facebook.com/tools/debug/> oldalon beillesztve az új
címet és a **Scrape Again** gombbal lehet frissíttetni. Ugyanez WhatsApp
és Messenger esetén magától frissül pár nap alatt.

### 4.1 Parancssorból

```bash
# a DNS a négy GitHub-címre mutat-e
dig +short atlagsebesseg.hu
dig +short www.atlagsebesseg.hu

# él-e a HTTPS, és jön-e a helyes fejléc
curl -sSI https://atlagsebesseg.hu/ | head -20

# a fontos fájlok kint vannak-e
for u in / adatvedelem.html manifest.webmanifest sw.js robots.txt \
         sitemap.xml icons/og.png icons/icon-512.png; do
  printf '%-28s %s\n' "$u" "$(curl -s -o /dev/null -w '%{http_code}' https://atlagsebesseg.hu/$u)"
done
```

Mind a nyolcnak `200`-at kell adnia.

### 4.2 A tesztkészlet az éles ellen

A tesztek nem csak helyben futtathatók:

```bash
ATLAG_URL=https://atlagsebesseg.hu/index.html node atlagsebesseg/teszt/tesztek.mjs
```

> Az Overpass- és térképcsempe-kéréseket a teszt magától letiltja, tehát
> ez a futtatás nem terheli a külső szolgáltatókat.

### 4.3 Kézzel, igazi telefonon

Ezt semmi nem váltja ki. Menetrend:

1. **Nyisd meg a telefonon**, engedélyezd a helymeghatározást.
2. **Tedd ki a kezdőképernyőre** (Chrome: ⋮ → *Alkalmazás telepítése*;
   Safari: Megosztás → *Főképernyőhöz adás*). Ellenőrizd, hogy az ikon az új
   logó, és a felirata „Átlagsebesség”.
3. **Indíts egy mérést egy rövid úton.** Nézd, hogy:
   - a mutató követi a sebességet,
   - a tábla a helyben érvényes határt mutatja,
   - a képernyő nem alszik el,
   - más appra váltás, majd visszatérés után **sem** alszik el.
4. **Állj meg legalább 70 másodpercre** (piros lámpa, vasúti átjáró): jöjjön
   a „Felfüggesszük?" kérdés, nyomj IGEN-t, majd indulj el — magától
   folytatnia kell.
5. **Zárd le a mérést**, töltsd le az eredményképet, és oszd meg magadnak.
6. **Repülő üzemmódban** nyisd meg újra: el kell indulnia (a térkép marad
   üres, az normális).
7. **Illeszd be a linket** Messengerbe vagy Facebookra: a fekete előnézeti
   képnek és a „Szabályosan érnél célba?" címnek kell megjelennie. Ha nem
   frissül, a Facebook
   [Sharing Debuggerével](https://developers.facebook.com/tools/debug/)
   lehet újrakéretni.

### 4.4 Google

- **Search Console:** vedd fel a `https://atlagsebesseg.hu/` tulajdont
  (DNS-rekordos vagy HTML-fájlos igazolással), és add be a
  `https://atlagsebesseg.hu/sitemap.xml` címet. Enélkül hetekig is eltarthat,
  míg megtalálják.
- Az indexelés első megjelenése tipikusan pár nap.

---

## 5. Kiadás után: ami karbantartást igényel

### 5.1 A service worker gyorsítótára

**Minden kiadásnál, ahol fájl kerül be vagy tűnik el, emelni kell a
`sw.js`-ben a `CACHE` nevét** (`atlagsebesseg-v18` → `v19`). Enélkül a
visszatérő látogatóknál a régi fájllista marad érvényben.

Tartalmi változásnál (csak a szöveg módosul) nem kötelező: az app
hálózat-először tölt, 2,5 másodperces türelemmel, tehát a friss verzió
magától megjön. A fájllista bővülése viszont csak névemeléssel érvényesül.

### 5.2 Az adatvédelmi tájékoztató dátuma

Az `adatvedelem.html` tetején álló „Hatályos: …" dátumot minden olyan
változásnál át kell írni, ami az adatkezelést érinti — új külső szolgáltatás,
hirdetés bekötése, új tárolt érték.

### 5.3 Látogatottság: a kiszolgáló naplójából

Az oldalon **nincs követőszkript és nincs süti**, ezért a látogatószámot a
tárhely saját hozzáférési naplójából nézzük. A cPanel/Plesk vezérlőpultban
ez általában **AWStats** vagy **Webalizer** néven van meg, a nyers naplók
pedig letölthetők.

**Mit ad:** látogatószám, oldalletöltés, honnan érkeztek (hivatkozó
oldalak), böngésző és eszköz megoszlása, melyik oldal a népszerű.

**Amit tudni kell róla, mert ez az app sajátossága:**

- **A service worker miatt a visszatérő látogatók alig generálnak
  kérést.** Az app fájljai a böngésző gyorsítótárában vannak. Szerencsére
  a service worker *hálózat-először* tölt, tehát az induláskor mégis
  megüti a szervert — de ha valakinek nincs térereje, a látogatása nem
  látszik a naplóban.
- **A botok felduzzasztják a számot.** Az AWStats szűri a ismert
  keresőrobotokat, a nyers napló nem. Ha a szám gyanúsan nagy, ez az oka.
- **Az „egyedi látogató” IP-alapú becslés.** Mobilhálózaton több
  felhasználó oszthat egy IP-t, egy felhasználó pedig válthat wifi és
  mobilnet közt — tehát tájékozódásra jó, pontos főre nem.
- **A kezdőképernyőről indított app** ugyanúgy látszik, mint a böngészős
  megnyitás: mindkettő rendes HTTP-kérés.

**GDPR:** az adatvédelmi tájékoztató 4/a pontja kimondja, hogy a naplóból
készülő összesített statisztikát megtekintjük, és megnevezi a jogalapot
(jogos érdek). Ha erről a megoldásról később JS-alapú analitikára váltasz,
**azt a pontot és a főoldal „nincs követőszkript” állítását is át kell
írni** — különben az oldal valótlant állít magáról.

### 5.4 Overpass API — ez a legvalószínűbb üzemeltetési gond

Mérés közben az app **nagyjából 1200 méterenként** kér egy 1,8 km sugarú
körre sebességhatárokat. Autópályán ez percenként két-három kérés, egy órányi
vezetés alatt körülbelül száz.

A nyilvános Overpass-kiszolgáló
[méltányos használati elve](https://dev.overpass-api.de/overpass-doc/en/preface/commons.html)
felhasználónként **napi ~10 000 kérést és ~1 GB letöltést** enged, és
egyszerre egy futó lekérdezést. Mivel a kérés a látogató böngészőjéből megy,
a keret **felhasználónként** számít — egyetlen sofőr ezt nem éri el.

Amire figyelni kell:

- Ha a szolgáltató mégis korlátoz, a kérés `429`-cel jön vissza. Az app ezt
  ma **elnyeli**: a határsor „hiba" állapotba megy, és a beállított
  alapértékkel számol tovább. Nem omlik össze, de a felhasználó pontatlanabb
  eredményt kap.
- Ha az oldal komolyabb forgalmat kap, a tisztességes megoldás **saját
  Overpass-példány** üzemeltetése, vagy a magyarországi `maxspeed` adatok
  előre legyártott, statikus csomagja az oldal mellé. Ez utóbbi ráadásul
  gyorsabb is lenne, és megszüntetné az utolsó olyan külső kérést, ami a
  felhasználó helyzetét kiadja.
- **Rövid távú fék, ha kell:** a `js/app.js`-ben az `UJRA_TAVOLSAG` értékét
  1200-ról feljebb véve (például 2500 m) felezhető a kérésszám, a
  pontosság érdemi romlása nélkül.

### 5.5 Térképcsempék

Sötét témában a csempék a CARTO-tól jönnek, világosban az OpenStreetMap
csempekiszolgálójától. Az OSM
[csempehasználati elve](https://operations.osmfoundation.org/policies/tiles/)
tiltja a nagy forgalmú, kereskedelmi felhasználást. Ha az oldal komolyan
beindul, ez a második dolog, amit ki kell váltani (fizetős csempeszolgáltató
vagy saját proxy).

### 5.6 Ha jön a hirdetés

A jelenlegi app **egyetlen sütit sem tesz le**. A hirdetéskód igen, ezért az
EU-ban IAB TCF szerinti hozzájárulás-kezelő (CMP) kell mellé, és az
`adatvedelem.html` 7. pontját át kell írni. Ezt a hirdetés bekötésével
**egy menetben** kell megcsinálni, nem utána.

---

## 6. Amit érdemes még átgondolni

| Téma | Állapot | Megjegyzés |
| --- | --- | --- |
| Google Play | elhalasztva | 25 USD egyszeri díj, 12 tesztelő × 14 nap. A weben előbb legyen forgalom. |
| Saját Overpass | nincs | Csak nagyobb forgalomnál kell. |
| Hirdetés | előkészítve | A felületek megvannak, „Hirdessen itt" felirattal. |
| Analitika | **nincs, és ez szándékos** | A márkaígéret része. Ha mégis kell szám, szerveroldali naplóelemzés süti nélkül is ad látogatószámot. |
| Háttérfutás | nem megoldható | Böngészőből nincs rá mód; ez a webplatform korlátja, nem hiba. |

---

## 7. Gyorslista

- [ ] Eldöntve: „A" (meglévő tárhely) vagy „B" (GitHub Pages)
- [ ] **Az `adatvedelem.html` tárhelyszolgáltatója a valóságot írja.** Két
      helyen szerepel — a 4/a pontban és az impresszum „Tárhely” sorában —,
      mindkettőnél HTML-megjegyzés jelzi. Ma a GitHub, Inc. van bent; ha az
      „A" utat választod, ezt a tényleges magyar szolgáltatóra kell írni,
      különben az impresszum valótlant állít.
- [ ] **Az `index.html` `og:url` és `og:image` sora visszaáll
      `https://atlagsebesseg.hu/`-ra** (lásd 4.0), utána Facebook
      Sharing Debugger → Scrape Again
- [ ] Az `adatvedelem.html` „Hatályos:” dátuma a kiadás napja
- [ ] Fájlok kint, `teszt/` nélkül
- [ ] `CNAME` a domainnel (csak „B" esetén)
- [ ] DNS a négy GitHub-címre (csak „B" esetén)
- [ ] HTTPS él, HTTP átirányít
- [ ] `www` és a gyökér közül az egyik átirányít a másikra
- [ ] Mind a nyolc kulcsfájl `200`-at ad
- [ ] Tesztkészlet lefutott az éles cím ellen
- [ ] Telefonos kézi próba megvolt (telepítés, mérés, megállás, offline)
- [ ] Link-előnézet rendben Messengerben
- [ ] Search Console tulajdon + sitemap beadva
