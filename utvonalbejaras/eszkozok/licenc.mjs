#!/usr/bin/env node
// Licenckulcs-kezelő eszköz. Szerver nem kell hozzá: a kulcsot a te privát
// kulcsoddal írjuk alá, az alkalmazás pedig a beágyazott nyilvános kulccsal
// ellenőrzi — offline, a felhasználó készülékén.
//
//   node eszkozok/licenc.mjs kulcspar
//       Egyszeri lépés: kulcspárt készít. A PRIVÁT kulcs fájlba kerül (ezt
//       őrizd meg és soha ne töltsd fel sehová), a nyilvános kulcs pedig
//       beíródik az alkalmazásba (js/licenc-kulcs.js).
//
//   node eszkozok/licenc.mjs kiad --ceg "Példa Kft." --lejarat 2027-12-31
//       Kiad egy licenckulcsot. Ezt kapja meg az ügyfél, és ezt illeszti be
//       az alkalmazás Licenc mezőjébe.
//
//   node eszkozok/licenc.mjs ellenoriz "UB1.…"
//       Megmutatja, mit tartalmaz egy kulcs, és érvényes-e az aláírása.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(here, '..');
const PUBLIC_KEY_FILE = path.join(appDir, 'js', 'licenc-kulcs.js');
const PRIVATE_KEY_FILE = path.resolve(appDir, '..', 'licenc-privat.json');

const b64url = (buf) => Buffer.from(buf).toString('base64')
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (s) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

function arg(name, fallback = null) {
  const i = process.argv.indexOf('--' + name);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function die(msg) {
  console.error('Hiba: ' + msg);
  process.exit(1);
}

/* ------------------------------------------------------------ kulcspár */

function kulcspar() {
  if (fs.existsSync(PRIVATE_KEY_FILE) && !process.argv.includes('--felulir')) {
    die(`már van privát kulcs itt: ${PRIVATE_KEY_FILE}\n`
      + '  Ha tényleg újat akarsz (a régi licencek ettől érvénytelenné válnak),\n'
      + '  add hozzá a --felulir kapcsolót.');
  }

  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const pub = publicKey.export({ format: 'jwk' });
  const priv = privateKey.export({ format: 'jwk' });

  fs.writeFileSync(PRIVATE_KEY_FILE, JSON.stringify(priv, null, 2));
  fs.chmodSync(PRIVATE_KEY_FILE, 0o600);

  fs.writeFileSync(PUBLIC_KEY_FILE,
    `// Az alkalmazás ezzel a nyilvános kulccsal ellenőrzi a licenckulcsokat.\n`
    + `// Nem titok: ebből licencet kiadni nem lehet, csak ellenőrizni.\n`
    + `// Készült: ${new Date().toISOString().slice(0, 10)} — eszkozok/licenc.mjs\n\n`
    + `export const PUBLIC_KEY = ${JSON.stringify({ kty: pub.kty, crv: pub.crv, x: pub.x, y: pub.y }, null, 2)};\n`);

  console.log('Kulcspár kész.\n');
  console.log('  PRIVÁT kulcs:    ' + PRIVATE_KEY_FILE);
  console.log('  Nyilvános kulcs: ' + PUBLIC_KEY_FILE + ' (ez kerül az alkalmazásba)\n');
  console.log('FONTOS: a privát kulcsot tedd biztonságos helyre, és soha ne töltsd');
  console.log('fel a tárolóba. Ha elveszik, a kiadott licencek érvényben maradnak,');
  console.log('de újat csak új kulcspárral tudsz kiadni — ami a régieket érvényteleníti.');
}

/* --------------------------------------------------------------- kiadás */

function privateKeyObject() {
  if (!fs.existsSync(PRIVATE_KEY_FILE)) {
    die(`nincs privát kulcs (${PRIVATE_KEY_FILE}).\n  Futtasd előbb: node eszkozok/licenc.mjs kulcspar`);
  }
  const jwk = JSON.parse(fs.readFileSync(PRIVATE_KEY_FILE, 'utf8'));
  return crypto.createPrivateKey({ key: jwk, format: 'jwk' });
}

function kiad() {
  const ceg = arg('ceg');
  const lejarat = arg('lejarat');
  if (!ceg) die('hiányzik a --ceg "Cégnév"');
  if (!lejarat || !/^\d{4}-\d{2}-\d{2}$/.test(lejarat)) die('a --lejarat formája ÉÉÉÉ-HH-NN');

  const payload = {
    c: ceg,
    e: lejarat,
    k: new Date().toISOString().slice(0, 10),
    id: crypto.randomUUID().slice(0, 8),
  };
  const note = arg('megjegyzes');
  if (note) payload.m = note;

  const data = Buffer.from(JSON.stringify(payload), 'utf8');
  const sig = crypto.sign('sha256', data, {
    key: privateKeyObject(),
    dsaEncoding: 'ieee-p1363',       // nyers r||s — ezt várja a böngésző WebCrypto
  });

  const licence = `UB1.${b64url(data)}.${b64url(sig)}`;
  console.log(`\nLicenc — ${ceg}, érvényes ${lejarat}-ig (azonosító: ${payload.id})\n`);
  console.log(licence);
  console.log('\nEzt kell beilleszteni az alkalmazásban: Bejárások → Licenc megadása.');
}

/* ----------------------------------------------------------- ellenőrzés */

function ellenoriz() {
  const text = process.argv[3];
  if (!text) die('add meg a kulcsot: node eszkozok/licenc.mjs ellenoriz "UB1.…"');
  if (!fs.existsSync(PUBLIC_KEY_FILE)) die('nincs nyilvános kulcs, futtasd: kulcspar');

  const src = fs.readFileSync(PUBLIC_KEY_FILE, 'utf8');
  const jwk = JSON.parse(src.slice(src.indexOf('{'), src.lastIndexOf('}') + 1));

  const [prefix, payload, sig] = text.trim().split('.');
  if (prefix !== 'UB1' || !payload || !sig) die('ez nem licenckulcs');

  const ok = crypto.verify('sha256', fromB64url(payload), {
    key: crypto.createPublicKey({ key: { ...jwk, kty: 'EC' }, format: 'jwk' }),
    dsaEncoding: 'ieee-p1363',
  }, fromB64url(sig));

  const data = JSON.parse(fromB64url(payload).toString('utf8'));
  console.log('Cég:      ' + data.c);
  console.log('Lejárat:  ' + data.e + (data.e < new Date().toISOString().slice(0, 10) ? '  (LEJÁRT)' : ''));
  console.log('Kiadva:   ' + data.k);
  if (data.m) console.log('Megjegyzés: ' + data.m);
  console.log('Aláírás:  ' + (ok ? 'érvényes' : 'ÉRVÉNYTELEN'));
  if (!ok) process.exit(1);
}

const cmd = process.argv[2];
if (cmd === 'kulcspar') kulcspar();
else if (cmd === 'kiad') kiad();
else if (cmd === 'ellenoriz') ellenoriz();
else {
  console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8')
    .split('\n').filter((l) => l.startsWith('//')).map((l) => l.slice(3)).join('\n'));
}
