/* Hangjelzés: figyelmeztetés, ha a szakaszátlag átlépi a megengedettet.

   Vezetés közben a telefon a zsebben vagy a tartóban van, a képernyőt nem
   nézi senki. A hang az egyetlen csatorna, ami akkor is elér.

   A hangot a böngésző szintetizálja, nincs hozzá letöltött fájl: így az
   offline működés és a „semmi nem megy ki a készülékről” elv sértetlen.
   A karakter a repülőgépek utastéri gongjáé — lágy felfutás, hosszú
   lecsengés, tiszta szinusz egy halk felharmonikussal. Nem riasztó, de
   a motorzajban is átjön.                                              */

const HANGOK = {
  // átlépted a megengedett átlagot: két hang, magasról mélyre
  figyelem: { hangok: [[880, 0], [660, 0.22]], hangero: 0.42, hossz: 0.75 },
  // bírságos tartomány: mélyebb, három ütés, sürgetőbb
  birsag: { hangok: [[660, 0], [523, 0.2], [440, 0.4]], hangero: 0.5, hossz: 0.9 },
  // visszatértél a megengedett alá: egyetlen, felfelé oldó hang
  rendben: { hangok: [[660, 0], [880, 0.16]], hangero: 0.3, hossz: 0.5 },
};

export class Gong {
  constructor() {
    this.ctx = null;
    this.be = true;
  }

  /** A böngésző csak felhasználói mozdulat után enged hangot: a mérés
      indításakor hívjuk, hogy később magától is meg tudjon szólalni. */
  async ebreszt() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
    }
    if (this.ctx.state === 'suspended') {
      try { await this.ctx.resume(); } catch { return false; }
    }
    return this.ctx.state === 'running';
  }

  /** @param {'figyelem'|'birsag'|'rendben'} fajta */
  szol(fajta) {
    const minta = HANGOK[fajta];
    if (!this.be || !minta || !this.ctx || this.ctx.state !== 'running') return;

    for (const [frekvencia, kesleltetes] of minta.hangok) {
      const t = this.ctx.currentTime + kesleltetes;
      const ki = this.ctx.createGain();
      ki.connect(this.ctx.destination);
      ki.gain.setValueAtTime(0.0001, t);
      ki.gain.exponentialRampToValueAtTime(minta.hangero, t + 0.012);
      ki.gain.exponentialRampToValueAtTime(0.0001, t + minta.hossz);

      // alaphang és egy halk oktáv: ettől lesz gongszerű, nem sípoló
      for (const [szorzo, arany] of [[1, 1], [2, 0.28]]) {
        const o = this.ctx.createOscillator();
        o.type = 'sine';
        o.frequency.setValueAtTime(frekvencia * szorzo, t);
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(arany, t);
        o.connect(g);
        g.connect(ki);
        o.start(t);
        o.stop(t + minta.hossz + 0.05);
      }
    }
  }

  /** Rezgés is, ha a készülék tudja: zsebben ez ér el leghamarabb. */
  rezeg(fajta) {
    if (!this.be || !navigator.vibrate) return;
    navigator.vibrate(fajta === 'birsag' ? [180, 90, 180, 90, 180] : [140, 80, 140]);
  }

  jelez(fajta) {
    this.szol(fajta);
    this.rezeg(fajta);
  }

  /** Kipróbáláshoz: felébreszti a hangot és rögtön meg is szólaltatja.
      @returns {Promise<boolean>} szólt-e; ha nem, a hívó megmondhatja, miért. */
  async probal(fajta = 'figyelem') {
    const megy = await this.ebreszt();
    if (!megy) return false;
    const volt = this.be;
    this.be = true;
    this.jelez(fajta);
    this.be = volt;
    return true;
  }
}
