# Rendszerterv — egységes túlméretes szállítás-kezelő

> Állapot: **tervezet, megbeszélésre**. Kód még nincs hozzá.
> Cél: a kísérési napló, az ÚVR-kapcsolat, az engedélylista a számlákkal, a
> CB-rádiós fordítás, a kísérői kompetencia, az engedélyelemző, az
> útvonalbejárás és az engedélybekérő **egy rendszerben**, közös adatokkal.

---

## 1. Az alapgondolat: minden egy „Szállítás” köré épül

Ma a modulok külön-külön élnek, ezért ugyanazt az adatot (rendszám, méretek,
útvonal, engedélyszám) többször kell beírni. Az egységes rendszerben egyetlen
központi tétel van: a **Szállítás (ügy)**. Minden más ehhez kapcsolódik.

```
                         ┌──────────────────────┐
     Ügyfél ────────────▶│      SZÁLLÍTÁS       │◀──────── Szerelvény
     (megrendelő)        │  (ügyszám, státusz)  │          (vontató + pótkocsi,
                         └──────────┬───────────┘           tengelyek, méretek)
          ┌──────────────┬──────────┼───────────┬───────────────┬──────────────┐
          ▼              ▼          ▼           ▼               ▼              ▼
     Útvonal-       Engedély-   Engedély(ek)  Kísérés      Kísérési        Számlák
     bejárás        kérelem     + feltételek  beosztás     napló           (be / ki)
     (fotók,        (ÚVR        (elemzett     (kísérők a   (GPS, események,
     akadályok)     mezők)      PDF)          kompetencia  CB-üzenetek)
                                              alapján)
```

Egy adatot **egyszer** kell rögzíteni, és minden modul onnan veszi:

| Adat | Hol keletkezik | Hol használjuk újra |
|---|---|---|
| Szerelvény méretei, tengelyterhelések | Törzsadat / kérelem | ÚVR-kérelem, díjkalkuláció, bejárás (szabad magasság ellenőrzése), napló |
| Útvonal | Bejárás vagy kérelem | ÚVR-kérelem, engedély összevetése, élő kísérés térképe, napló |
| Engedélyszám, érvényesség, feltételek | Engedélyelemző | Engedélylista, napló fejléce, kísérési feladatlista, számla |
| Kísérők | Kompetencia-nyilvántartás | Beosztás, napló, számla (munkaóra) |
| Napló adatai (km, idő) | Kísérési napló | Számla, kompetencia (tapasztalat), statisztika |

---

## 2. Modulok

### 2.1 Törzsadatok (alap, minden más erre épül)
- **Cég(ek)**, telephelyek.
- **Járművek**: vontató, pótkocsi/félpótkocsi, kísérőjármű — rendszám,
  tengelyszám, tengelytávok, saját tömeg, műszaki érvényesség.
- **Szerelvény-sablonok**: gyakori összeállítások egy kattintással
  (pl. „MAN + 4 tengelyes mélybölcsős”).
- **Ügyfelek** (megrendelők, számlázási adatokkal).
- **Személyek**: kísérők, sofőrök (külföldi sofőrnél: anyanyelv → CB-fordítóhoz).

### 2.2 Engedélybekérő (kérelem-előkészítő)
- A szállítás adataiból előtölti az **ÚVR E-Office mezőit**.
- **Díjkalkuláció** túlsúly / túlméret alapján, előre látható költség az
  ajánlathoz.
- **Egyéb hozzájárulások ellenőrzőlistája** — amit könnyű kihagyni:
  - nem Magyar Közút kezelésű utak (önkormányzati, fővárosi, magánút),
  - vasúti átjáró (pályavasút),
  - rendőri kísérés igénylése, ha az engedély előírja,
  - autópálya-matrica / útdíj (HU-GO) a szerelvény kategóriájára,
  - külföldi szakasz esetén a szomszédos ország engedélye.
- Ha volt bejárás: az akadályok és a mért szabad magasságok automatikusan a
  kérelem mellékletébe kerülnek.

### 2.3 ÚVR-kapcsolat
- **Fontos korlát**: amennyire tudható, az ÚVR E-Office-nak nincs nyilvános
  programozói felülete (API). Ezért a kapcsolat **félautomata**:
  1. a rendszer mezőnként kimásolható, sorrendben kitöltendő adatlapot ad
     (vagy böngésző-segéddel tölti ki a mezőket),
  2. a beadás után az ÚVR-ügyszámot be kell írni / beolvasni,
  3. a kiadott engedély PDF-je visszakerül a rendszerbe → **engedélyelemző**.
- Ha később lesz hivatalos interfész vagy e-mail-értesítés, a státuszkövetés
  automatizálható (beadva → hiánypótlás → kiadva).

### 2.4 Engedélyelemző
- A kiadott engedély PDF-jéből kinyeri:
  - engedélyszám, érvényesség (tól–ig), felhasználások száma,
  - engedélyezett útvonal (útszám + szelvény) → **térképre rajzolja**,
  - engedélyezett méretek és tömegek,
  - **feltételek**: kísérés fokozata, rendőri kíséret, napszak- és
    hétvégi tilalom, hídon áthaladás (sebesség, egyedül a hídon, középen haladás),
    előzetes bejelentési kötelezettségek.
- **Összevetés**: kérelem ↔ kiadott engedély — eltér-e az útvonal, méret, tömeg?
  Eltérésnél piros figyelmeztetés.
- **Összevetés**: engedélyezett útvonal ↔ bejárt útvonal — van-e nem bejárt szakasz?
- A feltételekből **feladatlista** lesz, ami a kísérési naplóban
  pipálandó tételként jelenik meg (pl. „Híd 12+300: max. 5 km/h, egyedül”).
  Élő kísérésnél ezek közeledéskor hangosan bemondva is megjelennek.

### 2.5 Engedélyek listája + számlák
- **Engedélynyilvántartás**: minden engedély egy sor, szűrhető ügyfélre,
  szerelvényre, státuszra, lejáratra.
- Státuszok: *előkészítés → beadva → hiánypótlás → kiadva → felhasználva / lejárt*.
- **Lejárat-figyelés**: X nappal előtte figyelmeztet.
- **Számlák az engedélyhez kötve**:
  - *bejövő*: közútkezelői díj, rendőri kísérés díja, egyéb hozzájárulás,
  - *kimenő*: kísérési szolgáltatás, engedélyintézés, továbbszámlázott díjak.
- Egy pillantásra: **mi van kifizetve, mi van továbbszámlázva, mi hiányzik**.
- Számlázóprogram-kapcsolat (pl. a cég által használt online számlázó) —
  a kimenő számla a napló adataiból (km, óra, kísérők) előtöltve.

### 2.6 Útvonalbejárás (meglévő app — `utvonalbejaras/`)
Már kész: GPS-nyomvonal, fotók méretekkel és útirány-nyíllal, iránytű,
állapot- és táblajegyzék, hangjegyzet, videó, Közút Word-űrlapok, élő kísérés,
úthálózati (NAP) adat, útra illesztett rajzolás.

Integrációban ami változik:
- a bejárás egy **Szállításhoz** tartozik (nem önálló tétel),
- a szerelvény adatai a törzsadatból jönnek, nem kell újra beírni,
- az eredménye (akadályok, mért magasságok) a kérelembe és az élő kísérésbe megy,
- több bejárás újrahasznosítható: ugyanazon az útvonalon a korábbi bejárás
  fotói előhívhatók (**saját akadály-adatbázis** épül idővel).

### 2.7 Kísérési napló
- Szállításonként digitális napló, a telefonon, **offline is**.
- Fejléc automatikusan: engedélyszám, szerelvény, rendszámok, kísérők,
  engedélyezett útvonal.
- Menet közben:
  - indulás/érkezés, megállók, várakozások **GPS-szel, időbélyeggel**,
  - események gyorsgombokkal (útlezárás, forgalomirányítás, akadály, műszaki hiba,
    rendőri ellenőrzés, baleset/kár),
  - fotó és hangjegyzet eseményhez,
  - az engedélyelemzőből jött **feltételek pipálása** a helyszínen,
  - fontos CB-üzenetek naplóba mentése (lásd 2.8).
- Lezáráskor: **aláírás** (kísérő, sofőr), PDF a hatályos előírás szerinti
  formában, archiválás.
- A napló adatai mennek tovább: számlázás, kompetencia (tapasztalat), statisztika.
- **Egyeztetni kell**: a hivatalos kísérési napló kötelező tartalma és
  formája — a digitális változatnak ennek meg kell felelnie.

### 2.8 CB-rádiós fordítás
Célja: a magyar kísérő és a külföldi sofőr megértse egymást menet közben.

Két szint, mert az élő fordítás nem mindig megbízható (zaj, nincs térerő):
1. **Kész mondattár (offline, megbízható)**: előre felvett, lefordított
   utasítások gombnyomásra lejátszva a sofőr nyelvén —
   „Állj!”, „Lassíts 10-re”, „Húzódj jobbra”, „Szembeforgalom”, „Híd jön, egyedül
   haladj”, „Mehetsz”, „Kanyar balra, nagy ív” stb.
   A sofőr nyelve a törzsadatból jön.
2. **Élő fordítás (internettel)**: a rádióból jövő beszéd szövegre, fordításra,
   és felolvasásra/kiírásra kerül mindkét irányban.

Hardver: telefon a CB-rádió mellett (hangszóró + mikrofon), vagy kábeles
csatlakozás a jobb hangminőségért — ezt ki kell próbálni.
Kiválasztott üzenetek a **kísérési naplóba** menthetők (vitás helyzetre bizonyíték).

### 2.9 Kísérői kompetencia
- Kísérőnként: képesítések, vizsgák, jogosítvány-kategóriák, egyéb tanúsítványok
  (pl. elsősegély), **mind lejárati dátummal** → figyelmeztetés lejárat előtt.
- **Tapasztalat automatikusan a naplókból**: hány kísérés, km, éjszakai út,
  milyen szerelvénytípus, milyen kísérési fokozat.
- **Beosztásnál szűr**: csak az osztható be, akinek érvényes a képesítése és
  megvan a szükséges tapasztalata az adott engedély feltételeihez.
- Nyelvtudás → jól jön a CB-kommunikációnál.

---

## 3. Amit kihagytál — javasolt kiegészítések

| Modul | Miért kell |
|---|---|
| **Ütemezés / diszpécser-naptár** | Ki, mikor, melyik kísérőjárművel megy; ütközések jelzése; az engedély érvényességi ablakán belül |
| **Kísérőjármű-nyilvántartás** | Figyelmeztető berendezés, táblák, műszaki vizsga, biztosítás lejárata |
| **Dokumentumtár** | Forgalmi engedélyek, mérlegjegy, rakomány méretlap, szerződés — a szállításhoz csatolva |
| **Árajánlat / megrendelés** | Az engedély- és díjkalkulációból azonnal ajánlat az ügyfélnek |
| **Útinformáció-figyelés** | Útlezárás, útfelújítás, ideiglenes súlykorlátozás az engedélyezett útvonalon az indulás előtt |
| **Időjárás** | Szél, jegesedés — magas/széles rakománynál indulás előtti ellenőrzés |
| **Kár- és incidenskezelés** | A bejáráskori állapotfotó + naplóesemény együtt: bizonyíték, ha vita van |
| **Kimutatások** | Bevétel ügyfelenként, engedélydíjak, kísérői órák, leggyakoribb útvonalak |
| **Felhasználók és jogosultságok** | Iroda, diszpécser, kísérő, (opcionálisan) ügyfél és könyvelő más-más dolgot lát |
| **Mentés és adatvédelem (GDPR)** | Személyes adatok (kísérők, sofőrök), helyadatok — megőrzési idő, mentés |

---

## 4. Egy szállítás teljes útja a rendszerben

```
 1. Ajánlatkérés      → ügyfél + szerelvény + honnan-hová → díjbecslés, ajánlat
 2. Szállítás létrehozása (ügyszám)
 3. Útvonalbejárás    → fotók, akadályok, mért magasságok
 4. Engedélybekérő    → ÚVR-mezők + egyéb hozzájárulások listája
 5. ÚVR beadás        → ügyszám rögzítése, státuszkövetés
 6. Engedély kiadva   → PDF be → ENGEDÉLYELEMZŐ → feltételek, útvonal, eltérések
 7. Bejövő számla     → közútkezelői díj rögzítése az engedélyhez
 8. Beosztás          → kísérők a kompetencia szerint, kísérőjármű, időpont
 9. Indulás előtt     → útinfó + időjárás ellenőrzés, feltétel-lista
10. Szállítás napja   → élő kísérés + KÍSÉRÉSI NAPLÓ + CB-fordító
11. Lezárás           → aláírt napló PDF, engedély „felhasználva”
12. Kimenő számla     → a napló adataiból előtöltve
13. Archív            → statisztika, tapasztalat a kísérőkhöz, akadály-adatbázis
```

---

## 5. Felépítés (technikai irány, nagy vonalakban)

**Egy alkalmazás, szerepkör szerinti kezdőképernyővel** — nem több külön app.

- **Iroda (asztali böngésző)**: engedélyek, kérelmek, számlák, ütemezés, kimutatások.
- **Kísérő (telefon, PWA, offline)**: mai feladat, élő kísérés, napló, CB-fordító, bejárás.
- **Sofőr (opcionális, telefon)**: csak a CB-fordító kijelzője a saját nyelvén.

**A legfontosabb döntés: kell-e szerver?**
A mostani appok szándékosan szerver nélküliek (minden a telefonon). Ez egy
embernek tökéletes, de az egységes rendszerhez — ahol az iroda látja, amit a
kísérő a terepen rögzít, és a számla a naplóból készül — **közös adattár kell**.

Javaslat: **offline-első + szinkron**. A telefon továbbra is net nélkül
működik (útközben ez elengedhetetlen), és amikor van kapcsolat, szinkronizál
egy központi adattárral. A meglévő útvonalbejárás kódja (térkép, NAP
úthálózat, Közút-űrlapok, élő kísérés, licenc) változatlanul átvehető modulként.

---

## 6. Ütemezés — javasolt sorrend

| Fázis | Tartalom | Miért ebben a sorrendben |
|---|---|---|
| **1** | Közös adatmodell, törzsadatok, Szállítás, **engedélylista + számlák**, a meglévő adatok áthozatala | Ez az a gerinc, amire minden más rákötődik; azonnal hasznos az irodában |
| **2** | **Engedélyelemző** + engedélybekérő (ÚVR-mezők, díj) | Itt a legtöbb kézi munka és hibalehetőség |
| **3** | **Kísérési napló** + kompetencia + ütemezés; útvonalbejárás bekötése | A terepi rész, a feltétel-lista már az elemzőből jön |
| **4** | **CB-fordító** (először mondattár, aztán élő fordítás) | Önállóan is tesztelhető, hardverpróba kell hozzá |
| **5** | Számlázó-kapcsolat, útinfó/időjárás, kimutatások, ügyfélportál | Kényelmi és bővítő funkciók |

---

## 7. Nyitott kérdések (ezek döntik el a részleteket)

1. **Hány felhasználó?** Csak te / egy kis csapat / több cég (értékesíteni is akarod)?
2. **Szerver vállalható-e?** (Lásd 5. pont — havi költség, adatkezelés.)
3. **A meglévő modulok hol vannak most?** (Külön appok, Excel-táblák, papír?)
   — Az útvonalbejárás itt van a repóban; a többit is látni kellene.
4. **Kísérési napló**: van hivatalos minta, aminek meg kell felelnie?
5. **Számlázás**: melyik számlázóprogramot használjátok?
6. **CB-fordító**: mely nyelvek kellenek leginkább?
7. **ÚVR**: elég a félautomata kitöltés, vagy próbáljunk böngésző-segédet?
