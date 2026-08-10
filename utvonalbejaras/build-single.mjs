// Egyfájlos változat készítése az appból.
//
//   node build-single.mjs                      -> utvonalbejaras-egyfajlban.html
//   node build-single.mjs --fragment <útvonal> -> ugyanaz <html>/<head>/<body> nélkül
//
// A modulokat egyetlen <script type="module"> blokkba fűzi (import/export
// nélkül), a CSS-t és az ikont beágyazza. Így az eredmény egyetlen fájl,
// amely megosztható és külön kiszolgáló nélkül megnyitható — a kamera, a
// GPS és a mikrofon viszont továbbra is https:// (vagy localhost) címet
// igényel, ezért éles használatra a rendes, több fájlos verzió való.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => fs.readFileSync(path.join(dir, p), 'utf8');

// a betöltési sorrend számít: az app.js indítja el a többit
const MODULES = ['js/ui.js', 'js/db.js', 'js/geo.js', 'js/media.js', 'js/editor.js', 'js/trackedit.js', 'js/app.js'];

// az app.js `db.valami()` alakban hivatkozik a tárolóra, ezért a modulok
// összefűzése után össze kell raknunk neki ezt a névteret
const DB_EXPORTS = [
  'uid', 'createSession', 'saveSession', 'getSession', 'listSessions', 'deleteSession',
  'addPoint', 'addPoints', 'updatePoints', 'deletePoints', 'getPoints',
  'saveItem', 'getItem', 'getItems', 'allItems', 'deleteItem', 'storageEstimate',
];

function stripModuleSyntax(src) {
  return src
    .replace(/^import[\s\S]*?from\s*'[^']*';[ \t]*\n/gm, '')   // import ... from '...'
    .replace(/^export\s*\{[^}]*\};[ \t]*\n/gm, '')             // export { ... }
    .replace(/^export\s+(?=(async\s+)?(function|const|let|class)\b)/gm, '');
}

function bundleScript() {
  const chunks = [];
  for (const file of MODULES) {
    let code = stripModuleSyntax(read(file));

    if (file === 'js/editor.js') {
      // az ui.js már ad azonos jelentésű $$ segédet, a másolat ütközne vele
      code = code.replace(
        /\nfunction \$\$\(sel, root\) \{ return Array\.from\(root\.querySelectorAll\(sel\)\); \}\n/,
        '\n'
      );
    }
    if (file === 'js/app.js') {
      // egyetlen fájlban nincs mit gyorsítótárazni
      code = code.replace(
        /\n[ \t]*if \('serviceWorker' in navigator[\s\S]*?\n[ \t]*\}\n/,
        '\n'
      );
    }

    if (file === 'js/db.js') {
      // saját hatókörbe zárva, mert néhány neve (pl. deleteSession) ütközik
      // az app.js függvényeivel; kifelé csak a db névtér látszik
      chunks.push({
        file,
        isolated: true,
        code: `const db = (() => {\n${code.trim()}\nreturn { ${DB_EXPORTS.join(', ')} };\n})();`,
      });
      continue;
    }
    chunks.push({ file, isolated: false, code: code.trim() });
  }

  checkCollisions(chunks);
  return chunks.map((c) => `/* ===== ${c.file} ===== */\n${c.code}`).join('\n\n');
}

/** A modulok közös hatókörbe kerülnek — a duplán deklarált nevek itt hibát okoznának. */
function checkCollisions(chunks) {
  const seen = new Map();
  const clashes = [];
  for (const chunk of chunks) {
    if (chunk.isolated) continue; // külön hatókörben van, nem ütközhet
    // csak a behúzás nélkül, blokk elején álló deklarációk kerülnek közös térbe
    for (const m of chunk.code.matchAll(/^(?:async\s+)?(?:function|class|const|let|var)\s+([A-Za-z_$][\w$]*)/gm)) {
      const id = m[1];
      if (seen.has(id)) clashes.push(`${id} (${seen.get(id)} és ${chunk.file})`);
      else seen.set(id, chunk.file);
    }
  }
  if (clashes.length) {
    console.error('Ütköző nevek a modulok között:\n  ' + clashes.join('\n  '));
    process.exit(1);
  }
}

function buildBody() {
  const html = read('index.html');
  const css = read('css/app.css');
  const body = html.slice(html.indexOf('<body>') + 6, html.lastIndexOf('</body>')).trim();

  return `<style>\n${css}\n</style>\n\n${
    body.replace(/<script type="module"[\s\S]*?<\/script>/, '').trim()
  }\n\n<script type="module">\n${bundleScript()}\n</script>\n`;
}

const iconDataUri =
  'data:image/svg+xml;base64,' + Buffer.from(read('icons/icon.svg')).toString('base64');

const bodyContent = buildBody();

const standalone = `<!DOCTYPE html>
<html lang="hu">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1">
<meta name="theme-color" content="#0b0f16">
<title>Útvonalbejárás</title>
<link rel="icon" href="${iconDataUri}" type="image/svg+xml">
</head>
<body>
${bodyContent}</body>
</html>
`;

const outFile = path.join(dir, 'utvonalbejaras-egyfajlban.html');
fs.writeFileSync(outFile, standalone);
console.log('kész:', outFile, (standalone.length / 1024).toFixed(0) + ' kB');

const fragIdx = process.argv.indexOf('--fragment');
if (fragIdx > -1 && process.argv[fragIdx + 1]) {
  const target = process.argv[fragIdx + 1];
  fs.writeFileSync(target, `<title>Útvonalbejárás</title>\n${bodyContent}`);
  console.log('kész:', target);
}
