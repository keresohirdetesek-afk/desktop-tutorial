// Licencellenőrzés — szerver nélkül.
//
// A kulcsot a kiadó privát kulcsával írták alá; itt csak a nyilvános
// kulccsal ellenőrizzük. Ez offline működik, viszont — mivel a kód a
// felhasználó készülékén fut — nem feltörhetetlen. A védelem igazi ereje
// nem a zár, hanem a névre szólóság: a licencelt cég neve rákerül a
// jegyzőkönyvre, licenc nélkül pedig „PRÓBAVERZIÓ” vízjelet kap.
//
// Alapelv: a lejárt licenc SOHA nem zárja ki a felhasználót a saját
// adataiból. Új bejárást nem indíthat, a riport vízjeles lesz, de minden
// korábbi munkája megmarad, megnyitható és kimenthető.

import { PUBLIC_KEY } from './licenc-kulcs.js';

const STORAGE_KEY = 'licenc';
const PREFIX = 'UB1.';

/** Próbaverzióban ennyi bejárás hozható létre. */
export const TRIAL_SESSIONS = 1;

let cached = null;   // { status, company, expiry, issued, note, raw }

const fromB64url = (s) => {
  const pad = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(pad + '==='.slice((pad.length + 3) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

const today = () => new Date().toISOString().slice(0, 10);

/** Be van-e egyáltalán állítva licencelés ebben a példányban? */
export function licencingConfigured() {
  return !!(PUBLIC_KEY && PUBLIC_KEY.x && PUBLIC_KEY.y);
}

/**
 * Kulcs ellenőrzése.
 * @returns {Promise<{ok:boolean, reason?:string, data?:object}>}
 */
export async function verifyLicence(text) {
  const raw = String(text || '').trim().replace(/\s+/g, '');
  if (!raw.startsWith(PREFIX)) return { ok: false, reason: 'Ez nem licenckulcs.' };
  if (!licencingConfigured()) return { ok: false, reason: 'Ebben a példányban nincs licencelés beállítva.' };

  const [, payload, sig] = raw.split('.');
  if (!payload || !sig) return { ok: false, reason: 'A kulcs hiányos — valószínűleg nem másolódott be teljesen.' };

  try {
    const key = await crypto.subtle.importKey(
      'jwk',
      { kty: 'EC', crv: 'P-256', x: PUBLIC_KEY.x, y: PUBLIC_KEY.y, ext: true },
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify']
    );
    const valid = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      fromB64url(sig),
      fromB64url(payload)
    );
    if (!valid) return { ok: false, reason: 'A kulcs aláírása érvénytelen.' };

    const data = JSON.parse(new TextDecoder().decode(fromB64url(payload)));
    if (!data.c || !data.e) return { ok: false, reason: 'A kulcs tartalma hiányos.' };
    return { ok: true, data };
  } catch (err) {
    return { ok: false, reason: 'A kulcs nem olvasható: ' + err.message };
  }
}

/** Kulcs mentése a készülékre, ha érvényes. */
export async function saveLicence(text) {
  const res = await verifyLicence(text);
  if (!res.ok) return res;
  try {
    localStorage.setItem(STORAGE_KEY, String(text).trim().replace(/\s+/g, ''));
  } catch (_) { /* privát ablakban nem baj, csak a munkamenetre él */ }
  cached = null;
  await licence();
  return res;
}

export function clearLicence() {
  try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
  cached = null;
}

/**
 * A példány licencállapota.
 * @returns {Promise<{status:'unconfigured'|'none'|'valid'|'expired',
 *                    company?:string, expiry?:string, daysLeft?:number}>}
 */
export async function licence() {
  if (cached) return cached;

  if (!licencingConfigured()) {
    cached = { status: 'unconfigured' };
    return cached;
  }

  let stored = null;
  try { stored = localStorage.getItem(STORAGE_KEY); } catch (_) {}
  if (!stored) {
    cached = { status: 'none' };
    return cached;
  }

  const res = await verifyLicence(stored);
  if (!res.ok) {
    cached = { status: 'none', problem: res.reason };
    return cached;
  }

  const expiry = res.data.e;
  const expired = expiry < today();
  const daysLeft = Math.round((new Date(expiry) - new Date(today())) / 86400000);
  cached = {
    status: expired ? 'expired' : 'valid',
    company: res.data.c,
    expiry,
    issued: res.data.k,
    issuedId: res.data.id || 'nincs',
    // alkalmankénti vásárlásnál ennyi bejárás dokumentációja áll ki vele
    credits: Number(res.data.d) > 0 ? Number(res.data.d) : 0,
    note: res.data.m,
    daysLeft,
  };
  return cached;
}

/** Indítható-e új bejárás? */
export async function canCreateSession(existingCount) {
  const l = await licence();
  if (l.status === 'unconfigured' || l.status === 'valid') return { ok: true };
  if (l.status === 'expired') {
    return {
      ok: false,
      title: 'Lejárt licenc',
      message: `A(z) ${l.company} licence ${l.expiry}-án lejárt, ezért új bejárás nem indítható. `
        + 'A meglévő bejárások továbbra is megnyithatók és kimenthetők. '
        + 'A megújításhoz kérjen új licenckulcsot.',
    };
  }
  if (existingCount >= TRIAL_SESSIONS) {
    return {
      ok: false,
      title: 'Próbaverzió',
      message: `Licenc nélkül ${TRIAL_SESSIONS} bejárás hozható létre, és a jegyzőkönyv `
        + '„PRÓBAVERZIÓ” vízjelet kap. A meglévő bejárás továbbra is használható. '
        + 'A teljes változathoz licenckulcs kell.',
    };
  }
  return { ok: true };
}

/* ----------------------------------------------------------- kreditek

Alkalmankénti vásárlás: a kulcs `d` mezője megmondja, hány bejárás
dokumentációja állítható ki vele. Egy bejárás egyszer visz el kreditet,
akárhányszor készül belőle riport vagy Közút-dokumentum — a javítás,
újranyomtatás nem kerül újra pénzbe.

Ha a kulcsban nincs `d`, akkor időalapú (havi/éves) a licenc: a lejáratig
korlátlan. A felhasznált kreditek nyilvántartása a készüléken van, tehát
nem feltörhetetlen; a védelem itt is a névre szólóság és a vízjel.      */

const USED_KEY = 'licenc-fizetett';

function usedMap() {
  try {
    return JSON.parse(localStorage.getItem(USED_KEY) || '{}') || {};
  } catch (_) {
    return {};
  }
}

function usedIds(keyId) {
  const m = usedMap();
  return Array.isArray(m[keyId]) ? m[keyId] : [];
}

/** Hány kredit van a kulcson, mennyi fogyott, mennyi maradt. */
export async function creditInfo() {
  const l = await licence();
  if (l.status !== 'valid' || !l.credits) return null;
  const used = usedIds(l.issuedId).length;
  return { total: l.credits, used, left: Math.max(0, l.credits - used) };
}

/**
 * Kiállítható-e dokumentum ehhez a bejáráshoz?
 * @returns {Promise<{ok:boolean, mode:string, left?:number, title?:string, message?:string}>}
 *   mode: 'unconfigured' | 'trial' | 'unlimited' | 'already' | 'credit' | 'none'
 */
export async function documentAccess(sessionId) {
  const l = await licence();
  if (l.status === 'unconfigured') return { ok: true, mode: 'unconfigured' };

  if (l.status === 'none') {
    // nincs kulcs: kiállítható, de „PRÓBAVERZIÓ” vízjellel
    return { ok: true, mode: 'trial' };
  }
  if (l.status === 'expired') {
    return {
      ok: false,
      mode: 'none',
      title: 'Lejárt licenc',
      message: `A(z) ${l.company} licence ${l.expiry}-án lejárt, ezért hivatalos dokumentum `
        + 'nem állítható ki. A bejárás adatai megmaradnak és kimenthetők. '
        + 'A folytatáshoz kérjen új kulcsot.',
    };
  }

  if (!l.credits) return { ok: true, mode: 'unlimited' };

  if (sessionId && usedIds(l.issuedId).includes(sessionId)) {
    // ezt a bejárást már kifizették — újranyomtatás ingyen van
    const info = await creditInfo();
    return { ok: true, mode: 'already', left: info ? info.left : 0 };
  }

  const info = await creditInfo();
  if (!info || info.left <= 0) {
    return {
      ok: false,
      mode: 'none',
      title: 'Elfogytak a kreditek',
      message: `A(z) ${l.company} kulcsán mind a(z) ${info ? info.total : 0} kredit elfogyott. `
        + 'A korábban kifizetett bejárások dokumentumai továbbra is kiállíthatók. '
        + 'Új kreditekhez kérjen új kulcsot.',
    };
  }
  return { ok: true, mode: 'credit', left: info.left };
}

/** Kredit felhasználása erre a bejárásra. Ugyanarra többször nem von le. */
export async function useCredit(sessionId) {
  const l = await licence();
  if (!sessionId || l.status !== 'valid' || !l.credits) return null;
  const m = usedMap();
  const lista = Array.isArray(m[l.issuedId]) ? m[l.issuedId] : [];
  if (lista.includes(sessionId)) return await creditInfo();
  lista.push(sessionId);
  m[l.issuedId] = lista;
  try { localStorage.setItem(USED_KEY, JSON.stringify(m)); } catch (_) {}
  return await creditInfo();
}

/** A jegyzőkönyv fejléce és vízjele a licencállapot szerint. */
export async function reportLicence() {
  const l = await licence();
  if (l.status === 'valid') {
    return { watermark: null, line: `Kiadva: ${l.company} — licenc érvényes ${l.expiry}-ig` };
  }
  if (l.status === 'expired') {
    return { watermark: 'LEJÁRT LICENC', line: `${l.company} — a licenc ${l.expiry}-án lejárt` };
  }
  if (l.status === 'none') {
    return { watermark: 'PRÓBAVERZIÓ', line: 'Próbaverzióval készült — nem hivatalos példány' };
  }
  return { watermark: null, line: null };
}
