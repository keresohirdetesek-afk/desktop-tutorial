# Hirdetés — értékesítési kézikönyv

Ez a belső anyag: **nem kerül fel a kiszolgálóra**. A hirdetőnek szánt,
nyilvános leírás a `hirdetes.html`.

---

## 1. Hogyan kerül ki egy eladott hirdetés

Három lépés, körülbelül öt perc.

**1. A kép.** Tedd a hirdető képét az `atlagsebesseg/hirdetes/` mappába,
beszédes néven (pl. `pelda-autosiskola-2026-11.png`). A kép **csak a
saját kiszolgálónkról jöhet** — ha külső címet adsz meg, a kód kihagyja
a hirdetést, és marad a „Hirdessen itt” felirat. Ez szándékos védelem:
egy külső kép a hirdető felé elárulná a látogató IP-címét.

**2. A bejegyzés.** A `js/hirdetes.js` tetején a `HIRDETESEK` tömbbe:

```js
{
  slot: 'barmelyik',          // vagy: intro-also | meres-also | kalk-also | info-also
  kep: 'hirdetes/pelda-autosiskola-2026-11.png',
  szeles: 600, magas: 150,    // a kép VALÓDI mérete — enélkül ugrál a lap
  alt: 'Példa Autósiskola — jogosítvány 3 hónap alatt',
  link: 'https://pelda-autosiskola.hu/',
  nev: 'Példa Autósiskola',   // a „Hirdetés · …” címkébe kerül
  lejar: '2026-11-30',        // ezen a napon még látszik, utána magától eltűnik
}
```

**3. Kiadás.** Emeld a `sw.js` gyorsítótárnevét (`atlagsebesseg-vNN`),
és töltsd fel. A `lejar` dátum után a hirdetés **magától eltűnik** — nem
kell emlékezni rá.

Több érvényes hirdetés esetén oldalbetöltésenként váltakoznak. A
felületre nevezett hirdetés megelőzi a `barmelyik`-et.

---

## 2. Árazás

**Előre: ma nincs mit árazni.** A látogatottsági adat a tárhely
AWStats-ából jön, és ez még nincs bekapcsolva. Amíg nincs szám, ne adj
ki árat — kérdezz vissza, hogy milyen időszakra gondol, és küldd az
árat, amikor már van mit mellékelni.

Az alábbi sávok **becslések** a magyar piacon szokásos nagyságrendek
alapján, nem mért adatok:

| Havi oldalletöltés | Mind a négy felület, havi díj | Megjegyzés |
| --- | --- | --- |
| 1000 alatt | 10–15 000 Ft vagy csere | „alapító hirdető” áron, hosszabb időre |
| 1 000 – 5 000 | 25–40 000 Ft | itt már lehet számot mutatni |
| 5 000 – 20 000 | 60–120 000 Ft | egy felület külön is eladható |
| 20 000 fölött | egyedi | érdemes több hirdetőt egymás mellé |

Néhány szabály, ami többet ér az árnál:

- **Soha ne kerekíts fölfelé.** Egy hirdető, aki rajtakap egy felnagyított
  számon, nemcsak téged ejt, hanem beszél is róla. Az oldal egész
  üzenete az őszinteség — ez az értékesítésre is vonatkozik.
- **Hosszabb időre adj kedvezményt**, ne alacsonyabb alapárat. Három
  hónapra −15%, hat hónapra −25%.
- **Az első hirdető a legnehezebb és a legértékesebb.** Adj neki olcsón
  hosszú időt, cserébe kérj referenciát, akit a következőnek
  megnevezhetsz.
- **Ne adj kizárólagosságot ingyen.** Ha valaki nem akar versenytársat a
  felületen, az felár.

---

## 3. Kiket érdemes megkeresni

Fontossági sorrendben, az ügyfélérték szerint:

1. **Közlekedési szabálysértésekre szakosodott ügyvéd.** Egy ügyfél sok
   tízezer forintot ér neki, tehát a hirdetési költséget könnyen
   megtéríti. A közönség egyezése tökéletes.
2. **Biztosítási alkusz** — a bírság, a pontok és a kárelőzmény összefügg
   a díjjal; természetes kapcsolódás.
3. **Autósiskola.** Helyi, jól megszólítható, és a KRESZ-téma rokon.
   Megyénként más-más, tehát sok potenciális hirdető.
4. **Fedélzeti kamera, GPS, autóelektronika kereskedő.**
5. **Gumi- és autószerviz** — nagy számban vannak, de kisebb
   hirdetési költségvetéssel.

Hol találod őket: a saját megyédben kezdj, mert személyesen is be tudsz
menni — egy szemtől szembeni megkeresés nagyságrenddel többet ér, mint
egy hideg e-mail.

---

## 4. Megkereső levél

Rövid, konkrét, és **nem állít olyat, amit nem tudsz bizonyítani**.

> **Tárgy:** Hirdetési lehetőség egy magyar autós oldalon
>
> Tisztelt [Név]!
>
> Tóth András vagyok, az atlagsebesseg.hu üzemeltetője. Az oldal azt
> mutatja meg az autósnak, mi lenne az eredménye, ha Magyarországon
> bevezetnék az átlagsebesség-mérést: lemérheti a saját útját, és
> megnézheti a bírságtáblázatot.
>
> A látogató tehát jogosítvánnyal rendelkező autós, akit épp a
> közlekedési szabályok és a bírságok érdekelnek. Úgy gondolom, ez
> egybeesik az Önök közönségével.
>
> Az oldalon négy hirdetési felület van. Egy hirdetés nálunk egy kép és
> egy link — nincs süti, nincs követés, nincs hirdetési hálózat.
> A részletek: https://atlagsebesseg.hu/hirdetes.html
>
> Ha érdekli, küldöm az aktuális látogatottsági adatokat és az árat.
> Nyitott vagyok arra is, hogy egy hónapot próbaképp vigyenek.
>
> Üdvözlettel,
> Tóth András
> atlagsebesseg@gmail.com

**Emlékeztető levél** (egy hét múlva, egyszer, utána hagyd):

> Tisztelt [Név]!
>
> A múlt heti levelemre visszatérve: ha most nem aktuális, jelzem, hogy
> év elején szoktunk áron felülvizsgálni — ha addig gondolkodnak rajta,
> a mostani feltételt tartom.
>
> Üdvözlettel, Tóth András

---

## 5. Amit a hirdetőtől be kell kérni

- a kép (PNG/JPG, 600 × 150 ajánlott, legfeljebb 150 KB)
- a céloldal webcíme
- egy mondat képleírás (vak felhasználóknak, és ez jogilag is helyes)
- a cégnév pontosan, ahogy a „Hirdetés · …” címkében szerepeljen
- számlázási adatok, és hogy melyik hónap(ok)ra szól

Küldd vissza neki a kész felület képernyőképét, mielőtt élesítenéd.

---

## 6. Amit nem vállalunk

A `hirdetes.html` nyilvánosan is kimondja, de itt a rövid lista:
nincs előugró ablak, nincs teljes képernyős hirdetés, nincs magától
induló hang vagy videó, nincs politikai hirdetés, szerencsejáték,
dohány- és alkoholreklám. Vezetés közbeni felületen semmi nem villog.

Ezek nem udvariassági szabályok: az oldal értéke abból jön, hogy a
látogató megbízik benne. Egy agresszív hirdetés többet ront a
hitelességen, mint amennyit a díja hoz.
