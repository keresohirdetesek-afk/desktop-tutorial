// Beépített országos szelvényadat — a felhasználónak nincs vele dolga.
//
// Az alkalmazással együtt érkezik a NAP „szelvényjelek” adatcsomagjából
// készült tömör állomány (adatok/szelvenyjelek.json). Az app első
// indításkor feldolgozza és elteszi a készülékre; onnantól offline megy,
// és minden ponthoz kiírja az útszámot és a km szelvényt.
//
// Az állomány hetente frissül a tárolóban (GitHub Actions), így a
// készüléken lévő is magától megújul — letöltés és feltöltés nélkül.
//
// Forrás: Nemzeti Adathozzáférési Pont (NAP), CC BY 4.0.

import { buildNetwork } from './uthalozat.js';
import * as db from './db.js';

const FAJL = 'adatok/szelvenyjelek.json';

// A feldolgozó változata. Ha itt emelünk, a készüléken lévő adat egyszer
// újraépül — akkor is, ha maga a NAP-állomány nem változott. (2: pályakód
// is bekerül a hálózatba, ebből látszik az osztott pályán, melyik pálya.)
const EPITO = 2;

/** A tömör, oszlopos alakból a feldolgozó által várt pontréteg. */
function geoJsonBol(adat) {
  const features = [];
  for (let i = 0; i < adat.darab; i++) {
    features.push({
      type: 'Feature',
      properties: {
        kszam: adat.utak[adat.ut[i]],
        pkod: adat.pk[i],
        kmjel: adat.km[i],
      },
      geometry: { type: 'Point', coordinates: [adat.lon[i], adat.lat[i]] },
    });
  }
  return { type: 'FeatureCollection', features };
}

/** Kell-e telepíteni vagy frissíteni a beépített adatot? */
function frissitendo(meglevo, adat) {
  if (!meglevo) return true;
  // kézzel betöltött állományt nem írunk felül
  if (!meglevo.beepitett) return false;
  if (Number(meglevo.epito || 1) !== EPITO) return true;
  return String(meglevo.beepitettKeszult || '') !== String(adat.keszult || '');
}

/**
 * A beépített adat telepítése, ha kell. Hálózat nélkül csendben kilép —
 * a már eltett adat ilyenkor is megvan.
 *
 * @returns {Promise<{allapot:string, net?:object}>}
 *   allapot: 'telepitve' | 'frissitve' | 'megvolt' | 'sajat' | 'nincs'
 */
export async function beepitettAdat(progress = () => {}) {
  // kikapcsolható: aki kizárólag a saját állományával akar dolgozni
  try {
    if (localStorage.getItem('beepitettAdat') === '0') {
      return { allapot: 'kikapcsolva', net: await db.getNetwork().catch(() => null) };
    }
  } catch (_) { /* privát ablakban nincs tárolás — menjen tovább */ }

  let meglevo = null;
  try { meglevo = await db.getNetwork(); } catch (_) { /* nincs még */ }

  let adat = null;
  try {
    // az egyfájlos változatban az adat a lapba van sütve, nincs mit letölteni
    if (globalThis.__UB_SZELVENY) {
      adat = globalThis.__UB_SZELVENY;
    } else {
      const res = await fetch(FAJL, { cache: 'no-cache' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      adat = await res.json();
    }
  } catch (_) {
    // offline vagy hiányzik az állomány — ami megvan, az marad
    return { allapot: meglevo ? 'megvolt' : 'nincs', net: meglevo };
  }

  if (!frissitendo(meglevo, adat)) {
    return { allapot: meglevo && !meglevo.beepitett ? 'sajat' : 'megvolt', net: meglevo };
  }

  progress(meglevo ? 'Országos szelvényadat frissítése…' : 'Országos szelvényadat előkészítése…');
  const net = await buildNetwork(
    { name: 'NAP szelvényjelek', arrayBuffer: async () => new TextEncoder().encode(JSON.stringify(geoJsonBol(adat))).buffer },
    null,
    () => {}
  );
  net.name = `NAP szelvényjelek (${adat.keszult})`;
  net.beepitett = true;
  net.epito = EPITO;
  net.beepitettKeszult = adat.keszult;
  net.forrasSzoveg = adat.forras;
  net.licenc = adat.licenc;
  await db.saveNetwork(net);
  return { allapot: meglevo ? 'frissitve' : 'telepitve', net };
}
