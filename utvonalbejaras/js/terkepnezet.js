// Nagyítás és mozgatás a térképes vásznakon.
//
// Ugyanaz a mozdulatkészlet kell mindenhol — a bejárás képernyőjén, a
// nyomvonal-szerkesztőben és az élő kísérésben is: két ujjal csippentés,
// egy ujjal húzás, dupla koppintás a nagyításhoz, asztali gépen görgő.
// Ezért egy helyen van megírva, és minden vászon ezt használja.

/** A nézet a renderTrack illesztett (teljes nyomvonalat befoglaló) képére ül rá. */
export const MIN_ZOOM = 1;
// A nagyítás a térkép illesztésére ül rá: ha az ország látszik (otthoni
// szerkesztés, még üres bejárás), utcaszintig több ezerszeres kell. A
// térképcsempék 19-es szintnél megállnak, onnan már csak nagyítva látszanak.
export const MAX_ZOOM = 5000;

export const clampZoom = (k) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, k));

const DRAG_PX = 8;           // ennyi elmozdulás fölött már húzás, nem koppintás
const DOUBLE_TAP_MS = 320;
const DOUBLE_TAP_PX = 28;

export class MapView {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} o
   * @param {Function} o.draw      újrarajzolás (a view-t a hívó adja át a renderTrack-nek)
   * @param {Function} [o.onTap]   koppintás a vászonra, {x, y} vászonkoordinátával
   * @param {Function} [o.onPan]   a felhasználó maga mozgatta/nagyította a térképet
   * @param {Function} [o.onChange] a nagyítás mértéke változott (gombok állításához)
   * @param {boolean} [o.doubleTap] dupla koppintás nagyítson-e. Ahol a
   *   koppintás maga a munkaeszköz (nyomvonal-szerkesztő: kijelölés, csúcs
   *   berajzolása), ott kikapcsolva — két gyors koppintás egymás mellé ott
   *   szándékos, nem nagyítani akarunk vele.
   */
  constructor(canvas, { draw, onTap, onPan, onChange, doubleTap = true } = {}) {
    this.canvas = canvas;
    this.drawFn = draw || (() => {});
    this.onTap = onTap;
    this.onPan = onPan;
    this.onChange = onChange;
    this.doubleTap = doubleTap;
    this.view = { k: 1, tx: 0, ty: 0 };
    this.pointers = new Map();
    this.pinch = null;
    this.moved = false;
    this.lastTap = 0;
    this.bind();
  }

  bind() {
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => this.onDown(e));
    c.addEventListener('pointermove', (e) => this.onMove(e));
    c.addEventListener('pointerup', (e) => this.onUp(e));
    c.addEventListener('pointercancel', (e) => this.onUp(e));
    c.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('dblclick', (e) => {
      if (!this.doubleTap) return;
      e.preventDefault();
      this.zoomAt(this.local(e), clampZoom(this.view.k * 2));
    });
  }

  /** Vászonon belüli koordináta az eseményből. */
  local(e) {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  isZoomed() { return this.view.k > 1.02; }

  reset() {
    this.view = { k: 1, tx: 0, ty: 0 };
    this.changed();
    this.drawFn();
  }

  changed() {
    // nagyított térképen az egyujjas húzás a térképet mozgatja, ezért ilyenkor
    // a böngésző saját görgetését ki kell kapcsolni a vásznon
    this.canvas.classList.toggle('zoomed', this.isZoomed());
    if (this.onChange) this.onChange(this.view.k);
  }

  zoomBy(f) {
    const r = this.canvas.getBoundingClientRect();
    this.zoomAt({ x: r.width / 2, y: r.height / 2 }, clampZoom(this.view.k * f));
  }

  /** Nagyítás úgy, hogy a megadott képernyőpont a helyén maradjon. */
  zoomAt(anchor, k) {
    const ratio = k / this.view.k;
    this.view.tx = anchor.x - (anchor.x - this.view.tx) * ratio;
    this.view.ty = anchor.y - (anchor.y - this.view.ty) * ratio;
    this.view.k = k;
    this.changed();
    this.drawFn();
  }

  /** Eltolás képpontban (pl. hogy a saját pozíció középre kerüljön). */
  panBy(dx, dy) {
    this.view.tx += dx;
    this.view.ty += dy;
  }

  /** Egérgörgő: nagyítás a kurzor helyére. */
  onWheel(e) {
    e.preventDefault();
    // a görgő egy „kattanása” böngészőnként más értéket ad; a lényeg az irány
    const factor = e.deltaY < 0 ? 1.25 : 1 / 1.25;
    this.zoomAt(this.local(e), clampZoom(this.view.k * factor));
    if (this.onPan) this.onPan();
  }

  onDown(e) {
    try { this.canvas.setPointerCapture(e.pointerId); } catch (_) {}
    this.pointers.set(e.pointerId, this.local(e));
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), k: this.view.k };
      this.moved = true;
    } else {
      this.start = this.local(e);
      this.startView = { ...this.view };
      this.moved = false;
    }
  }

  onMove(e) {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.set(e.pointerId, this.local(e));

    if (this.pointers.size === 2 && this.pinch) {
      const [a, b] = [...this.pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      this.zoomAt(mid, clampZoom(this.pinch.k * (dist / (this.pinch.dist || 1))));
      if (this.onPan) this.onPan();
      return;
    }

    if (!this.start) return;
    const p = this.local(e);
    const dx = p.x - this.start.x, dy = p.y - this.start.y;
    if (Math.hypot(dx, dy) > DRAG_PX) this.moved = true;
    if (this.moved) {
      this.view.tx = this.startView.tx + dx;
      this.view.ty = this.startView.ty + dy;
      if (this.onPan) this.onPan();
      this.drawFn();
    }
  }

  onUp(e) {
    const p = this.pointers.get(e.pointerId);
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinch = null;
    if (this.pointers.size === 0) {
      if (!this.moved && p) this.tap(p);
      this.start = null;
    }
  }

  /**
   * Koppintás: a második koppintás gyorsan ugyanoda nagyít. Ha az onTap
   * igazzal tér vissza (eltalált egy jelölést), az nem indít dupla
   * koppintást — a megnyitott elem a koppintás „eredménye”.
   */
  tap(p) {
    const prev = this.lastTapPoint;
    const quick = this.doubleTap && Date.now() - this.lastTap < DOUBLE_TAP_MS;
    const close = prev && Math.hypot(prev.x - p.x, prev.y - p.y) < DOUBLE_TAP_PX;

    if (quick && close) {
      this.lastTap = 0;                       // a harmadik koppintás már új gesztus
      if (this.onPan) this.onPan();
      this.zoomAt(p, clampZoom(this.view.k * 2));
      return;
    }

    const handled = this.onTap ? this.onTap(p) === true : false;
    this.lastTap = handled ? 0 : Date.now();
    this.lastTapPoint = p;
  }
}
