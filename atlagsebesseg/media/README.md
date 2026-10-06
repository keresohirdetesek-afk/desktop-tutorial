# Médiaanyagok

Itt a közösségi felületekhez készült képek állnak. **Ezek nem kerülnek
fel a kiszolgálóra**: a látogatónak nincs rájuk szüksége, csak
feltöltésre és megosztásra valók. A `PUBLIKALAS.md` 2.1 pontja sorolja,
mi megy ki élesbe — ez a mappa nincs köztük.

## Facebook-borítókép

| Fájl | Mi ez |
| --- | --- |
| `facebook-borito.jpg` | **ezt töltsd fel** a Facebook-oldalra, 1640 × 924 |
| `facebook-borito.png` | ugyanaz veszteségmentesen, további szerkesztéshez |
| `borito.html` | a kép forrása — ebből készül a két kép |
| `jetbrains-mono-700.woff2` | a műszerbetű, amit a forrás betölt |
| `facebook-borito-korabbi.webp` | a korábbi, kézzel készített változat |

### Miért 1640 × 924

A Facebook **két különböző kivágást** mutat ugyanabból a képből:

| Hol | Arány | Mi látszik |
| --- | --- | --- |
| Mobil | ~16:9 | szinte a teljes kép |
| Asztali | ~2,7:1 | a magasság kb. harmada levágódik, felül és alul |

Ezért a kép 16:9 (a mobilnak), de **minden lényeges elem a középső
1640 × 624 képpontos sávban van** (a 150. és a 774. képpontsor között),
amit az asztali nézet is megtart. A kép alján futó úttest szándékosan a
vágott sávban van: csak díszítés, információt nem hordoz.

### Újrarajzolás szövegmódosítás után

A `borito.html` sima HTML; a képek fejlécmentes böngészővel készültek:

```js
const p = await b.newPage({ viewport: { width: 1640, height: 924 } });
await p.goto('file://.../borito.html');
await p.screenshot({ path: 'facebook-borito.jpg', type: 'jpeg', quality: 92 });
```

A betűtípus a konténerben elérhető **Liberation Sans** — a szóvédjegy az
oldalon a látogató rendszerbetűjével jelenik meg (Windowson Segoe UI),
ez áll hozzá a legközelebb.

### A szövegek megkötése

Az alkalmazás arról szól, mi *lenne*, **ha** Magyarországon bevezetnék az
átlagsebesség-mérést — ilyen rendszer ma nincs. A borítókép szövegei
ezért feltételesek, és csak olyat ígérnek, amit az app tud: a három
jellemző pontosan az app három fülének felel meg (GPS-mérés, kalkulátor,
tudnivalók). Olyan felirat, mint a „mérési szakaszok" egy kamerás
kapuzat mellett, azt sugallná, hogy az oldal a *meglévő* ellenőrzött
szakaszokat listázza — ez nem lenne igaz.
