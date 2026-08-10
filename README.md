# desktop-tutorial

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

   A gyökér automatikusan átirányít az `utvonalbejaras/` mappára.

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
