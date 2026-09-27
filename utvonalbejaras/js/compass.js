// Iránytű: merre nézett a kamera a fotó készítésekor.
//
// A GPS „heading” csak mozgás közben értelmes, és a *jármű* haladási irányát
// adja — nem azt, amerre a telefont tartottuk. A kameairányhoz a készülék
// tájolásérzékelője kell.
//
// iOS 13-tól ehhez külön engedély kell, amit csak felhasználói koppintásból
// lehet kérni; ezért a Fotó gomb megnyomásakor indítjuk el.

let current = null;          // { heading, at }
let listening = false;
let permissionState = 'unknown';   // unknown | granted | denied | unsupported

const MAX_AGE = 15000;       // ennél régebbi mérés már nem használható

function screenAngle() {
  const o = window.screen && window.screen.orientation;
  if (o && typeof o.angle === 'number') return o.angle;
  if (typeof window.orientation === 'number') return window.orientation;
  return 0;
}

function onOrientation(e) {
  let h = null;

  // iOS: kész iránytű-érték, fokban, északtól az óramutató irányában
  if (typeof e.webkitCompassHeading === 'number' && !Number.isNaN(e.webkitCompassHeading)) {
    h = e.webkitCompassHeading;
  } else if (e.absolute && typeof e.alpha === 'number') {
    // Android: az alpha északtól az óramutatóval ellentétesen nő
    h = 360 - e.alpha;
  }
  if (h == null) return;

  // fekvő tartásnál a kijelző elfordulását is bele kell számolni
  h = (h + screenAngle()) % 360;
  current = { heading: (h + 360) % 360, at: Date.now() };
  permissionState = 'granted';
}

/**
 * Iránytű indítása. iOS-en engedélyt kér, ezért csak felhasználói
 * eseményből hívható.
 * @returns {Promise<boolean>} sikerült-e elindítani
 */
export async function startCompass() {
  if (listening) return true;
  if (typeof window.DeviceOrientationEvent === 'undefined') {
    permissionState = 'unsupported';
    return false;
  }
  try {
    const req = window.DeviceOrientationEvent.requestPermission;
    if (typeof req === 'function') {
      const res = await req.call(window.DeviceOrientationEvent);
      if (res !== 'granted') { permissionState = 'denied'; return false; }
    }
  } catch (_) {
    permissionState = 'denied';
    return false;
  }

  window.addEventListener('deviceorientationabsolute', onOrientation, true);
  window.addEventListener('deviceorientation', onOrientation, true);
  listening = true;
  return true;
}

export function stopCompass() {
  if (!listening) return;
  window.removeEventListener('deviceorientationabsolute', onOrientation, true);
  window.removeEventListener('deviceorientation', onOrientation, true);
  listening = false;
}

/** A legutóbbi, még friss iránytű-érték fokban, vagy null. */
export function compassHeading() {
  if (!current) return null;
  if (Date.now() - current.at > MAX_AGE) return null;
  return current.heading;
}

export function compassState() {
  return { state: permissionState, listening, heading: compassHeading() };
}
