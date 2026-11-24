# Ide jönnek a NAP adatcsomagok

Két állomány készül belőlük:

| Állomány | Miből | Mire kell |
|---|---|---|
| `adatok/szelvenyjelek.json` | Szelvényjelek | útszám és km szelvény minden ponthoz |
| `adatok/szakaszadatok.json` | Hídhasználati feltételek · Tehergépjármű-korlátozások · Lakott területi szakaszok · Közút neve, kategóriája, kezelője · Burkolat típusa és szélessége · Forgalmi sávok száma | „Elfér a szerelvény?”, „Hol vagyok” képernyő, dokumentumok kitöltése |

A szakaszos csomagokat is ide kell tenni ZIP-ként (akármilyen néven, a
feldolgozó a mezőnevekből ismeri fel, melyik melyik). Amelyik hiányzik,
annak az adata változatlan marad.

## A szelvényjelek csomagja

A [Nemzeti Adathozzáférési Pont](https://napportal.kozut.hu/) statikus
adatcsomagjai csak bejelentkezés után tölthetők le, ezért a heti frissítés
nem tud magától beletúrni. Két út van:

1. **Ha van közvetlen letöltési címed** (a feliratkozás után megjelenő
   linken jobb gomb → „Hivatkozás címének másolása"), tedd be a tároló
   beállításai közé `NAP_SZELVENY_URL` néven. Onnantól hetente magától
   frissül, és ide nem kell semmit tenni.

2. **Ha nincs**, töltsd le a portálról a *szelvényjelek* adatcsomagot, és
   tedd ide ZIP-ként:

       szelvenyjelek.zip

   Benne a `.shp` és a `.dbf` fájl legyen (a `.shx` és a `.prj` nem baj).
   A ZIP pár száz kilobájt. Feltölthető a GitHub webes felületéről is:
   **Add file → Upload files**.

Feltöltés után a *NAP szelvényadat frissítése* munkafolyamat magától
lefut, átalakítja az app formátumára, és frissíti a
`utvonalbejaras/adatok/szelvenyjelek.json` állományt. A felhasználók a
következő oldalnyitáskor megkapják — nekik továbbra sincs dolguk vele.

Az adat CC BY 4.0 licenc alatt van: szabadon terjeszthető, de a forrást
meg kell nevezni. Ezt az alkalmazás és a jegyzőkönyv is megteszi.
