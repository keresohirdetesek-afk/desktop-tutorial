# desktop-tutorial

Két statikus webalkalmazás egy repóban. A gyökér egy indítóoldal, ahonnan
mindkettő elérhető.

## Átlagsebesség-kalkulátor

Bárki kipróbálhatja, hogy megbüntetnék-e — és mennyivel —, ha bevezetik
Magyarországon az átlagsebesség-mérést: GPS-szel lemeri a szakaszátlagot,
az útvonal menti *változó* sebességhatárokhoz (útépítés, település) méri, és
kiszámolja a bírságot. Semmit nem tárol: az adat a böngésző memóriájában él.

➡️ **[atlagsebesseg/](atlagsebesseg/)** — leírás, adatforrások, hirdetés-előkészítés:
[atlagsebesseg/README.md](atlagsebesseg/README.md)

---

## Útvonalbejárás

Túlméretes szállítmány útvonalbejárásához készült önálló webalkalmazás (PWA):
nyomvonal rögzítése GPS-szel, utólagos nyomvonal-szerkesztés (elvetett szakaszok,
hiányzó szakasz berajzolása), fotózás menet közben, rajzolás és **méretek
beírása** a képekre, **halvány útirány-nyíl** hajlítható ívvel, hangjegyzetek —
mind visszakereshetően, offline, a készüléken tárolva.

➡️ **[utvonalbejaras/](utvonalbejaras/)** — leírás, indítás és használat:
[utvonalbejaras/README.md](utvonalbejaras/README.md)

---

## Éles használat: GitHub Pages

Az app **tisztán statikus**: nincs szerver, nincs adatbázis, nincs bejelentkezés —
minden adat a telefonon marad. Ezért nem kell hozzá alkalmazás-hoszting
(Railway, Render, Heroku és társai): elég egy statikus fájlkiszolgáló.
A GitHub Pages ingyenes, HTTPS-t ad, és ugyanebből a repóból szolgál ki.

**HTTPS azért kell**, mert a böngésző csak biztonságos kapcsolaton engedi a
kamerát, a GPS-t és a mikrofont.

### Beállítás (egyszeri, kb. 2 perc)

1. A repó **Settings → Pages** oldalán:
   - **Source**: `Deploy from a branch`
   - **Branch**: `main`, mappa: `/ (root)` → **Save**
2. Várj kb. 1 percet, amíg a Pages lefuttatja a telepítést
   (a repó **Actions** fülén látszik).
3. Az app címe ezután:

   ```
   https://<felhasználónév>.github.io/desktop-tutorial/
   ```

   A gyökéren egy indítóoldal fogad, ahonnan mindkét app elérhető:
   `atlagsebesseg/` és `utvonalbejaras/`.

### Saját domain (pl. atlagsebesseg.hu)

A GitHub Pages egy repóhoz **egy** egyedi domaint enged, és az mindig a repó
gyökerét szolgálja ki. Ezért ha az `atlagsebesseg.hu` közvetlenül az
átlagsebesség-appot nyissa meg, két út van:

- **Külön repó** (ez a tisztább): az `atlagsebesseg/` mappa tartalma egy önálló
  repó gyökerébe kerül, és annak a Pages-beállításánál lesz megadva a domain.
  Az app így a `https://atlagsebesseg.hu/` címen nyílik.
- **Ebben a repóban maradva**: a domain a gyökérre mutat, az app pedig a
  `https://atlagsebesseg.hu/atlagsebesseg/` címen érhető el.

DNS oldalon a domain szolgáltatójánál: `A` rekordok a `185.199.108–111.153`
címekre, a `www` alá pedig `CNAME` a `<felhasználónév>.github.io` névre —
utána a Pages **Custom domain** mezőjébe beírva jön az ingyenes HTTPS
(*Enforce HTTPS*, néhány perc után).

### Telepítés a telefonra

Nyisd meg a fenti címet a telefon böngészőjében, majd:

- **Android / Chrome**: menü (⋮) → *Alkalmazás telepítése* vagy
  *Hozzáadás a kezdőképernyőhöz*
- **iPhone / Safari**: Megosztás ikon → *Add to Home Screen*

Ezután külön alkalmazásként indul, teljes képernyőn, és offline is működik.
Az első indításnál engedélyezd a **helymeghatározást**, a **kamerát** és a
**mikrofont**.

### Frissítés

Minden `main` ágra érkező módosítás után a Pages automatikusan újratelepít.
A telefonon a következő indításkor frissül az app (a service worker a háttérben
letölti az új változatot).

### Ha privát a repó

A GitHub Pages privát repóból csak fizetős csomaggal (Pro / Team) publikál.
Két megoldás: állítsd a repót publikusra (a benne lévő kód nem tartalmaz
titkot), vagy tedd ki az `utvonalbejaras/` mappát bármilyen más statikus
tárhelyre (Netlify, Cloudflare Pages, saját webtárhely) — mindegyik jó, amíg
HTTPS-en szolgál ki.
