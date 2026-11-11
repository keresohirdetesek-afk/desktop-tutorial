<?php
/**
 * Híd a Magyar Közút útszámkeresőjéhez.
 *
 * MIÉRT KELL
 *
 * Az útszámkereső oldala mögött van egy JSON-végpont, ami EOV-koordinátára
 * megadja az útszámot és a km szelvényt. A böngésző viszont nem engedi, hogy
 * egy másik címen futó oldal (az útvonalbejárás app) közvetlenül hívja: a
 * válasz nem engedélyezi az idegen eredetet (CORS). Ezt a tiltást csak
 * szerveroldalról lehet megkerülni — ez a fájl ennyit tesz: a saját
 * tárhelyen fut, továbbítja a kérést, és a választ visszaadja az appnak.
 *
 * TELEPÍTÉS
 *
 *   1. Másold fel ezt a fájlt a tárhelyedre, pl.
 *      public_html/kozut-hid.php  →  https://a-sajat-domained/kozut-hid.php
 *   2. Az appban: kezdőképernyő → „Útszámkereső-híd” → írd be ezt a címet.
 *
 * ELLENŐRZÉS
 *
 *   A ?diag=1 paraméterrel a fájl kiírja, mit próbált és mit kapott —
 *   ebből látszik, ha a tárhely nem enged kimenő kérést, vagy ha a Közút
 *   megváltoztatta a végpontját:
 *
 *      https://a-sajat-domained/kozut-hid.php?lat=47.376131&lon=18.190796&diag=1
 *
 * Nem tárol semmit a lekérdezőről, nem naplóz koordinátát, és csak ezt az
 * egyetlen, nyilvános végpontot éri el — nem használható másra.
 */

declare(strict_types=1);

// --------------------------------------------------------- beállítások

/** Melyik oldalak hívhatják. '*' = bárki; szigorúbb: a saját domained. */
const ENGEDETT_EREDET = '*';

/** A Közút végpontjai: EOV-ban és WGS84-ben (lat/lon) is fogad pontot. */
const KOZUT_URL_EOV = 'https://utszamkereso.kozut.hu/api/geolocator/eov/point';
const KOZUT_URL_WGS = 'https://utszamkereso.kozut.hu/api/geolocator/wgs84/point';

/**
 * A pontos kérésformát nem közli senki, és változhat is. Ezért több
 * változatot végigpróbálunk, amíg az egyik értelmes választ nem ad, és a
 * nyerteset megjegyezzük — a következő kérés már egyből azzal megy.
 */
function valtozatok(bool $wgs, float $lat, float $lon, float $y, float $x): array
{
    $eov = [
        ['POST', KOZUT_URL_EOV, ['y' => $y, 'x' => $x]],
        ['POST', KOZUT_URL_EOV, ['eovY' => $y, 'eovX' => $x]],
        ['GET',  KOZUT_URL_EOV . '?y=' . $y . '&x=' . $x, null],
    ];
    $wgsVariansok = [
        ['POST', KOZUT_URL_WGS, ['lat' => $lat, 'lon' => $lon]],
        ['POST', KOZUT_URL_WGS, ['lat' => $lat, 'lng' => $lon]],
        ['GET',  KOZUT_URL_WGS . '?lat=' . $lat . '&lon=' . $lon, null],
    ];
    // ha van értelmes WGS-koordináta, azzal kezdünk, de az EOV is sorra kerül
    return $wgs ? array_merge($wgsVariansok, $eov) : array_merge($eov, $wgsVariansok);
}

/** Ennyi másodpercig tartjuk meg a választ (a szelvény nem változik naponta). */
const CACHE_MP = 2592000;      // 30 nap

/** Egy IP ennyi kérést adhat fel percenként (a Közút felé is tisztesség). */
const PERC_LIMIT = 40;

$cacheDir = sys_get_temp_dir() . '/utszam-cache';

// ------------------------------------------------------------- válasz

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: ' . ENGEDETT_EREDET);
header('Access-Control-Allow-Headers: content-type');
header('Access-Control-Max-Age: 86400');
header('Cache-Control: public, max-age=86400');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

function hiba(int $kod, string $uzenet): void
{
    http_response_code($kod);
    echo json_encode(['hiba' => $uzenet], JSON_UNESCAPED_UNICODE);
    exit;
}

// ------------------------------------------------------------ bemenet

$szam = static fn (string $kulcs): float =>
    isset($_GET[$kulcs]) ? (float) str_replace(',', '.', (string) $_GET[$kulcs]) : 0.0;

$lat = $szam('lat');
$lon = $szam('lon');
$y = $szam('y');
$x = $szam('x');

// WGS84 (lat/lon) a kényelmesebb: nem kell átszámítani. Ha az nincs, EOV.
$wgs = ($lat >= 45.5 && $lat <= 48.7 && $lon >= 16.0 && $lon <= 23.0);
$eov = ($y >= 400000 && $y <= 950000 && $x >= 40000 && $x <= 400000);

if (!$wgs && !$eov) {
    hiba(400, 'Érvénytelen koordináta. Várt: lat/lon (WGS84) vagy y/x (EOV).');
}

$url = $wgs ? KOZUT_URL_WGS : KOZUT_URL_EOV;
$kulcsAlap = $wgs ? sprintf('w%.5f|%.5f', $lat, $lon) : sprintf('e%.1f|%.1f', $y, $x);

// ------------------------------------------------------- sebességkorlát

@mkdir($cacheDir, 0700, true);
$ipKulcs = $cacheDir . '/ip-' . md5((string) ($_SERVER['REMOTE_ADDR'] ?? '?')) . '-' . date('YmdHi');
$db = (int) @file_get_contents($ipKulcs);
if ($db >= PERC_LIMIT) {
    hiba(429, 'Túl sok kérés egy perc alatt. Várjon egy kicsit.');
}
@file_put_contents($ipKulcs, (string) ($db + 1));

// ------------------------------------------------------- gyorsítótár

// az ellenőrző mód mindig friss kérést küld, különben a tárolt válasz jönne
$diag = isset($_GET['diag']);

$kulcs = $cacheDir . '/pt-' . md5($kulcsAlap) . '.json';
if (!$diag && is_file($kulcs) && (time() - (int) filemtime($kulcs)) < CACHE_MP) {
    $mentett = @file_get_contents($kulcs);
    if ($mentett !== false && $mentett !== '') {
        header('X-Forras: cache');
        echo $mentett;
        exit;
    }
}

// --------------------------------------------------------- továbbítás

/** Egy kérés elküldése; a választ és a körülményeit is visszaadja. */
function keres(string $modszer, string $url, ?array $torzs): array
{
    $ch = curl_init($url);
    $opts = [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 12,
        CURLOPT_CONNECTTIMEOUT => 6,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS => 3,
        CURLOPT_USERAGENT => 'utvonalbejaras-hid/1.0',
        CURLOPT_HTTPHEADER => ['Accept: application/json'],
    ];
    if ($modszer === 'POST') {
        $opts[CURLOPT_POST] = true;
        $opts[CURLOPT_POSTFIELDS] = json_encode($torzs, JSON_UNESCAPED_UNICODE);
        $opts[CURLOPT_HTTPHEADER] = ['Accept: application/json', 'Content-Type: application/json'];
    }
    curl_setopt_array($ch, $opts);
    $valasz = curl_exec($ch);
    $out = [
        'modszer' => $modszer,
        'url' => preg_replace('#^https://[^/]+#', '', $url),
        'torzs' => $torzs === null ? '' : json_encode($torzs, JSON_UNESCAPED_UNICODE),
        'allapot' => (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE),
        'curl_hiba' => curl_error($ch),
        'valasz' => $valasz === false ? '' : (string) $valasz,
    ];
    curl_close($ch);
    return $out;
}

/** Értelmes-e a válasz: 200, JSON, és van benne valami adat. */
function jo(array $r): bool
{
    if ($r['allapot'] !== 200 || $r['valasz'] === '') {
        return false;
    }
    $adat = json_decode($r['valasz'], true);
    return is_array($adat) && $adat !== [];
}

if (!function_exists('curl_init')) {
    hiba(501, 'A tárhelyen nincs bekapcsolva a curl bővítmény, enélkül a híd nem tud '
        . 'kérést küldeni a Közút felé. Kérje a tárhelyszolgáltatótól.');
}

$nyertesFajl = $cacheDir . '/nyertes.json';
$sorrend = valtozatok($wgs, $lat, $lon, $y, $x);

// a korábban bevált változat előre kerül
$nyertes = @json_decode((string) @file_get_contents($nyertesFajl), true);
if (!$diag && is_array($nyertes) && isset($nyertes['i']) && isset($sorrend[$nyertes['i']])) {
    $elso = $sorrend[$nyertes['i']];
    array_splice($sorrend, $nyertes['i'], 1);
    array_unshift($sorrend, $elso);
}

$probak = [];
$siker = null;
foreach ($sorrend as $i => [$modszer, $url, $torzs]) {
    $r = keres($modszer, $url, $torzs);
    $probak[] = [
        'modszer' => $r['modszer'],
        'utvonal' => $r['url'],
        'torzs' => $r['torzs'],
        'allapot' => $r['allapot'],
        'curl_hiba' => $r['curl_hiba'],
        'valasz_eleje' => mb_substr($r['valasz'], 0, 160),
    ];
    if (jo($r)) {
        $siker = $r;
        @file_put_contents($nyertesFajl, json_encode(['i' => $i]));
        break;
    }
    // ha a tárhely egyáltalán nem enged kimenő kapcsolatot, ne próbálkozzunk tovább
    if ($r['curl_hiba'] !== '' && $r['allapot'] === 0) {
        break;
    }
}

if ($diag) {
    echo json_encode([
        'php' => PHP_VERSION,
        'curl' => function_exists('curl_version') ? (curl_version()['version'] ?? '?') : 'nincs',
        'koordinata' => $wgs ? ['lat' => $lat, 'lon' => $lon] : ['y' => $y, 'x' => $x],
        'sikerult' => $siker !== null,
        'probak' => $probak,
    ], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    exit;
}

if ($siker === null) {
    $elso = $probak[0] ?? [];
    $reszlet = ($elso['curl_hiba'] ?? '') !== ''
        ? 'a tárhely nem tudott kapcsolódni: ' . $elso['curl_hiba']
        : 'a szolgáltatás ' . ($elso['allapot'] ?? 0) . ' választ adott';
    http_response_code(502);
    echo json_encode([
        'hiba' => 'A Közút szolgáltatását nem sikerült elérni (' . $reszlet . '). '
            . 'Részletek: tegyen &diag=1-et a cím végére.',
        'probak' => $probak,
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

@file_put_contents($kulcs, $siker['valasz']);
header('X-Forras: kozut');
echo $siker['valasz'];
