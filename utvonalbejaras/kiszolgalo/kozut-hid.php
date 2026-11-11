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
 *      public_html/utszam.php  →  https://a-sajat-domained/utszam.php
 *   2. Az appban: kezdőképernyő → „Útszámkereső-híd” → írd be ezt a címet.
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

$kulcs = $cacheDir . '/pt-' . md5($kulcsAlap) . '.json';
if (is_file($kulcs) && (time() - (int) filemtime($kulcs)) < CACHE_MP) {
    $mentett = @file_get_contents($kulcs);
    if ($mentett !== false && $mentett !== '') {
        header('X-Forras: cache');
        echo $mentett;
        exit;
    }
}

// --------------------------------------------------------- továbbítás

$torzs = json_encode(
    $wgs ? ['lat' => $lat, 'lon' => $lon] : ['y' => $y, 'x' => $x],
    JSON_UNESCAPED_UNICODE
);

$ch = curl_init($url);
curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => $torzs,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 12,
    CURLOPT_CONNECTTIMEOUT => 6,
    CURLOPT_FOLLOWLOCATION => false,
    CURLOPT_HTTPHEADER => [
        'Content-Type: application/json',
        'Accept: application/json',
    ],
]);
$valasz = curl_exec($ch);
$kod = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
$curlHiba = curl_error($ch);
curl_close($ch);

if ($valasz === false || $kod >= 400) {
    hiba(502, 'A Közút szolgáltatása nem válaszolt' . ($curlHiba !== '' ? ': ' . $curlHiba : ' (' . $kod . ').'));
}

// csak érvényes JSON-t adunk tovább
$ellenorzes = json_decode((string) $valasz, true);
if ($ellenorzes === null && json_last_error() !== JSON_ERROR_NONE) {
    hiba(502, 'A válasz nem értelmezhető.');
}

@file_put_contents($kulcs, $valasz);
header('X-Forras: kozut');
echo $valasz;
