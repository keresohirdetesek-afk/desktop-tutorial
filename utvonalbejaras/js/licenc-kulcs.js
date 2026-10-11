// Az alkalmazás ezzel a nyilvános kulccsal ellenőrzi a licenckulcsokat.
//
// Amíg itt null áll, a LICENCELÉS KI VAN KAPCSOLVA: az alkalmazás
// korlátozás és vízjel nélkül működik, és a licencsáv meg sem jelenik.
//
// Bekapcsolás, ha majd aktuális lesz:
//   node eszkozok/licenc.mjs kulcspar
// Ez ide beírja a nyilvános kulcsot, a privát kulcsot pedig a tárolón
// kívülre menti. (A korábban használt nyilvános kulcs a tároló
// előzményeiben megvan, így a már kiadott licencek visszahozhatók.)

export const PUBLIC_KEY = null;
