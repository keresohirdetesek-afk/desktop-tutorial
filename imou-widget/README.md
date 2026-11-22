# Imou hőmérő widget (Android)

Kezdőképernyő-widget, ami az Imou ZTM1 hőmérők (ZG1 gatewayen át)
hőmérsékletét és páratartalmát mutatja, anélkül hogy az Imou Life appot
meg kellene nyitni.

```
Nappali        21,4°   48%
Kint            3,8°   71%
                     ↻ 23:15
```

## Telepítés

1. A repó **Releases** oldalán (`imou-widget` kiadás) töltsd le a telefonon
   az `imou-homero.apk` fájlt, és nyisd meg. (Az Android rákérdez, hogy
   engeded-e az ismeretlen forrásból telepítést – engedélyezd a böngészőnek.)
2. Az <https://open.imoulife.com> oldalon jelentkezz be **ugyanazzal a
   fiókkal**, mint az Imou Life appban → *App Management* / *Create App* →
   másold ki az **AppId**-t és az **AppSecret**-et. (Ingyenes, havi 30 000
   lekérdezésig; a widget kb. 6 000-et használ két szenzorral.)
3. Nyisd meg az **Imou hőmérő** appot, írd be a két kulcsot, válaszd az
   **Európa** régiót, és nyomd meg a **Szenzorok keresése** gombot.
4. Pipáld ki a két ZTM1-et, adj nekik nevet, **Mentés**.
5. Kezdőképernyő hosszan nyomva → Widgetek → *Imou hőmérő*.

A widget 15 percenként frissül (az Android ennél gyakoribb háttérfrissítést
nem enged), koppintásra azonnal.

Samsungon érdemes az appot kivenni az akkumulátor-optimalizálás alól
(Beállítások → Alkalmazások → Imou hőmérő → Akkumulátor → Korlátlan),
különben a rendszer ritkábban engedi frissíteni.

## Hogyan működik

Az Imou Open API-t hívja (`accessToken`, `listDeviceDetailsByPage`,
`getIotDeviceProperties`). A ZTM1 hőmérséklete a `16000`, páratartalma a
`16100` tulajdonság – ugyanaz, amit az Imou hivatalos Home Assistant
könyvtára (pyimouapi) használ. Az AppId/AppSecret csak a telefonon, az app
saját tárhelyén van.
