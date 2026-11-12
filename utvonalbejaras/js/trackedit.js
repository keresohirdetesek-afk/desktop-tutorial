// Nyomvonal-szerkesztő: a rögzített nyomvonalon utólag kijelölhető egy
// szakasz, amely elvetetté tehető (megmarad, indoklással, de nem számít
// bele a hivatalos útvonalba) vagy véglegesen törölhető.
//
// A kísérőautó útja nem feltétlenül a jóváhagyandó útvonal: akadály miatt
// vissza kellett fordulni, kerülőt kellett keresni. Ezt csak utólag,
// térképen lehet rendbe tenni.

import {
  renderTrack, lengthByStatus, rejectedSections, trackLength, drawnLength, detectTurnaround,
  formatDistance, formatDuration, formatCoord, mercator, rebaseView, REJECTED, isRejected,
} from './geo.js';
import { onTileLoad, setTilesEnabled, tilesEnabled, cachedTileCount } from './tiles.js';
import { MapView, clampZoom } from './terkepnezet.js';
import { $, el, toast, modal } from './ui.js';

const SNAP_PX = 26; // ennél közelebb a meglévő nyomvonalhoz odaillesztjük a csúcsot

export class TrackEditor {
  constructor(root) {
    this.root = root;
    this.canvas = $('#trackedit-canvas', root);
    this.points = [];
    this.items = [];
    this.sel = null;                  // { from, to } — indexek a points tömbben
    this.hit = null;
    this.dirty = false;
    this.mode = 'view';               // view | draw | add | select
    this.hoverPt = null;              // egérmutató a vásznon (előnézethez)
    this.mapView = new MapView(this.canvas, {
      draw: () => this.draw(),
      onTap: (p) => this.tap(p),
      onHover: (p) => this.onHover(p),
      doubleTap: false,   // itt a koppintás kijelöl / csúcsot rak le
    });
    // egérrel más a szöveg („kattintson”), mint ujjal („koppintson”)
    this.mouse = !!(window.matchMedia && window.matchMedia('(pointer: fine)').matches);
    this._bind();
  }

  /** A nagyítás/mozgatás állapota — a renderTrack ezt kapja meg. */
  get view() { return this.mapView.view; }

  /**
   * @returns {Promise<boolean>} true, ha változott a nyomvonal
   */
  /**
   * @param {object} o
   * @param {object} [o.pick]  helyszín kijelölése a térképen: { lat, lon, cim }
   *   — ilyenkor a szerkesztő egyetlen pont megadására szolgál (GPS nélküli,
   *   otthoni szerkesztéshez), és a kiválasztott koordinátával tér vissza.
   */
  open({ points, items = [], drawn = [], onApply, pick = null, onAddPoint = null,
    onOpenItem = null, resolvePlace = null, road = null }) {
    this.onAddPoint = onAddPoint;       // új pont felvétele a térképről
    this.onOpenItem = onOpenItem;       // meglévő jelölésre koppintva
    this.resolvePlace = resolvePlace;   // „ugrás helyre” feloldása
    this.road = road;                   // úthálózat: illesztés és útkövetés
    this.roadSnap = !!(road && road.ready && road.ready());
    this.points = points;
    this.items = items;
    this.drawn = drawn;
    this.onApply = onApply;
    this.pick = pick;
    this.adding = false;
    this.mode = 'view';
    this.hoverPt = null;
    this.picked = pick && pick.lat != null ? { lat: pick.lat, lon: pick.lon } : null;
    this.sel = null;
    this.draft = null;        // éppen rajzolt szakasz
    this.selectedDrawn = null;
    this.drawnSel = null;      // rész a berajzolt szakaszon belül
    this.mapView.reset();
    this.lastFit = null;
    this.dirty = false;
    this.root.hidden = false;
    document.body.classList.add('modal-open');
    this.syncMapButton();
    // a befutó csempék után újra kell rajzolni
    onTileLoad(() => { if (!this.root.hidden) this.draw(); });
    requestAnimationFrame(() => { this.draw(); this.renderPanel(); });
    return new Promise((resolve) => { this._resolve = resolve; });
  }

  close() {
    const bar = $('#trackedit-pickbar', this.root);
    if (bar) bar.hidden = true;
    this.hoverPt = null;
    onTileLoad(null);
    this.root.hidden = true;
    document.body.classList.remove('modal-open');
    const r = this._resolve;
    this._resolve = null;
    if (r) r(this.dirty);
  }

  /* ------------------------------------------------------------- vezérlés */

  _bind() {
    // a vászon gesztusait (csippentés, húzás, dupla koppintás, görgő) a
    // MapView kezeli — lásd a konstruktort

    $('#trackedit-close', this.root).addEventListener('click', () => this.close());
    $('#trackedit-map', this.root).addEventListener('click', () => this.toggleMap());
    $('#trackedit-zoom-in', this.root).addEventListener('click', () => this.mapView.zoomBy(1.5));
    $('#trackedit-zoom-out', this.root).addEventListener('click', () => this.mapView.zoomBy(1 / 1.5));
    $('#trackedit-fit', this.root).addEventListener('click', () => this.mapView.reset());

    $('#trackedit-reject', this.root).addEventListener('click', () => this.markSelection(REJECTED));
    $('#trackedit-accept', this.root).addEventListener('click', () => this.markSelection('ok'));
    $('#trackedit-delete', this.root).addEventListener('click', () => this.deleteSelection());
    $('#trackedit-clear-sel', this.root).addEventListener('click', () => {
      this.sel = null;
      this.draw();
      this.renderPanel();
    });

    $('#trackedit-turnaround', this.root).addEventListener('click', () => this.markTurnaround());

    // módválasztó: egyetlen helyen dől el, mit csinál a koppintás
    for (const b of this.root.querySelectorAll('#trackedit-modes .mode')) {
      b.addEventListener('click', () => this.setMode(b.dataset.mode));
    }

    // asztali gépen billentyűkkel is: Esc kilép, Enter kész, Ctrl+Z vissza
    this._onKey = (e) => {
      if (this.root.hidden || this.pick) return;
      const t = e.target;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        if (this.mode !== 'view') this.setMode('view');
        else this.close();
      } else if (e.key === 'Enter' && this.mode === 'draw' && this.draft && this.draft.pts.length > 1) {
        e.preventDefault();
        this.finishDraw();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && this.mode === 'draw') {
        e.preventDefault();
        this.undoVertex();
      }
    };
    document.addEventListener('keydown', this._onKey);

    $('#trackedit-roadsnap', this.root).addEventListener('click', () => this.toggleRoadSnap());
    $('#trackedit-goto', this.root).addEventListener('click', () => this.gotoPlace());
    $('#trackedit-draw-undo', this.root).addEventListener('click', () => this.undoVertex());
    $('#trackedit-draw-done', this.root).addEventListener('click', () => this.finishDraw());
    $('#trackedit-draw-cancel', this.root).addEventListener('click', () => {
      this.draft = { pts: [] };
      this.draw();
      this.renderPanel();
      toast('Eldobva. Kattintson az első pontra, ha újrakezdi.');
    });
    $('#trackedit-drawnsel-del', this.root).addEventListener('click', () => this.deleteDrawnRange());
    $('#trackedit-drawnsel-split', this.root).addEventListener('click', () => this.splitDrawn());
    $('#trackedit-drawnsel-clear', this.root).addEventListener('click', () => {
      this.drawnSel = null;
      this.draw();
      this.renderPanel();
    });
    $('#trackedit-drawn-delete', this.root).addEventListener('click', () => this.deleteDrawn());
    $('#trackedit-drawn-rename', this.root).addEventListener('click', () => this.renameDrawn());

    for (const id of ['#trackedit-from', '#trackedit-to']) {
      $(id, this.root).addEventListener('input', (e) => {
        if (!this.sel) return;
        const v = Number(e.target.value);
        if (id === '#trackedit-from') this.sel.from = Math.min(v, this.sel.to);
        else this.sel.to = Math.max(v, this.sel.from);
        this.draw();
        this.renderPanel();
      });
    }

    if (window.ResizeObserver) {
      let pending = false;
      new ResizeObserver(() => {
        if (this.root.hidden || pending) return;
        pending = true;
        requestAnimationFrame(() => { pending = false; this.draw(); });
      }).observe($('#trackedit-stage', this.root));
    }
  }

  /** Alaptérkép be/ki — offline vagy takarékos használathoz kikapcsolható. */
  async toggleMap() {
    const on = !tilesEnabled();
    setTilesEnabled(on);
    try { localStorage.setItem('tiles', on ? '1' : '0'); } catch (_) {}
    this.syncMapButton();
    this.draw();
    if (on) {
      toast('Térkép bekapcsolva — a betöltött csempék offline is megmaradnak.');
    } else {
      const n = await cachedTileCount();
      toast(`Térkép kikapcsolva.${n ? ` ${n} csempe marad tárolva.` : ''}`);
    }
  }

  syncMapButton() {
    const b = $('#trackedit-map', this.root);
    const on = tilesEnabled();
    // a feliratot külön elem tartja, hogy keskeny kijelzőn elrejthető legyen
    b.innerHTML = '';
    b.append('🗺️', el('span', { class: 'lbl', text: on ? ' Térkép' : ' Vázlat' }));
    b.classList.toggle('active', on);
    b.title = on ? 'Alaptérkép kikapcsolása' : 'Alaptérkép bekapcsolása';
  }

  /** Egyetlen pont megadása a térképen — GPS nélküli szerkesztéshez. */
  renderPickPanel() {
    for (const id of ['#trackedit-drawbar', '#trackedit-normalbar', '#trackedit-modes',
      '#trackedit-selinfo', '#trackedit-sections-wrap', '#trackedit-drawn-wrap',
      '#trackedit-drawnsel',
      '#trackedit-turnaround', '#trackedit-keys', '#trackedit-badge']) {
      const node = $(id, this.root);
      if (node) node.hidden = true;
    }
    const hint = $('#trackedit-hint', this.root);
    hint.hidden = false;
    hint.textContent = this.picked
      ? `Kijelölve: ${formatCoord(this.picked.lat, this.picked.lon)} — `
        + 'koppintson máshova, ha módosítja, vagy mentse.'
      : (this.pick.cim ? `„${this.pick.cim}” helyszíne: ` : '')
        + 'nagyítson rá a helyre, és koppintson a pontos helyszínre.';

    let bar = $('#trackedit-pickbar', this.root);
    if (!bar) {
      bar = el('div', { class: 'editor-row', id: 'trackedit-pickbar' }, [
        el('button', {
          id: 'trackedit-pick-save', class: 'btn primary small', type: 'button',
          text: '✓ Helyszín mentése',
          onclick: () => {
            if (!this.picked) { toast('Koppintson a térképen a helyszínre.', 'error'); return; }
            const r = this._resolve;
            this._resolve = null;
            this.pick = null;
            this.root.hidden = true;
            document.body.classList.remove('modal-open');
            onTileLoad(null);
            if (r) r(this.picked);
          },
        }),
        el('button', {
          class: 'btn ghost small', type: 'button', text: 'Mégse',
          onclick: () => { this.pick = null; this.close(); },
        }),
      ]);
      hint.parentNode.insertBefore(bar, hint.nextSibling);
    }
    bar.hidden = false;
    $('#trackedit-pick-save', this.root).disabled = !this.picked;
  }

  /* ------------------------------------------------------------- módok

  A szerkesztőben ugyanaz a koppintás négyfélét jelenthet: megnézni egy
  jelölést, útvonalat rajzolni, új pontot letenni, szakaszt kijelölni.
  Ezért egyetlen módválasztó dönti el, mi történik — és az éppen aktív mód
  a térkép sarkában is látszik, a hozzá tartozó gombokkal együtt.        */

  setMode(mode, { quiet = false, force = false } = {}) {
    if (this.pick) return;
    if (mode === this.mode && !force) {
      // ugyanarra a módra koppintva vissza a nézegetéshez
      if (mode !== 'view') mode = 'view'; else return;
    }

    // a félbehagyott rajz ne vesszen el szó nélkül
    if (this.mode === 'draw' && this.draft && this.draft.pts.length > 1 && mode !== 'draw') {
      toast('A megkezdett szakasz megmaradt — a ✏️ gombbal folytathatja.');
    }
    this.mode = mode;
    this.adding = mode === 'add';
    this.hoverPt = null;

    if (mode === 'draw') {
      if (!this.draft) this.draft = { pts: [] };
      this.sel = null;
    } else if (mode !== 'select') {
      this.sel = null;
    }
    if (mode !== 'draw' && this.draft && !this.draft.pts.length) this.draft = null;

    const body = $('#trackedit-body', this.root);
    if (body) body.className = 'm-' + mode;
    if (!quiet && mode === 'draw' && this.draft && !this.draft.pts.length) {
      toast(this.roadSnap
        ? 'Rajzolás: elég a szakasz elejére és végére kattintani — a vonal az utat követi.'
        : 'Rajzolás: kattintson sorban a pontokra.');
    }
    this.draw();
    this.renderPanel();
  }

  /**
   * Úthoz illesztés be/ki. Ha egyik forrás sincs meg, nem némán nem
   * csinálunk semmit: felajánljuk az online útkövetést, és elmondjuk, mi
   * jár vele.
   */
  async toggleRoadSnap() {
    const ready = !!(this.road && this.road.ready && this.road.ready());
    if (!ready) {
      const online = this.road && this.road.online;
      if (!online) {
        toast('Ehhez úthálózati adat kell: Közút dokumentumok → Úthálózati adat betöltése (NAP).');
        return;
      }
      const ok = await modal({
        title: 'Bekapcsoljuk az online kiegészítést?',
        text: 'Nincs betöltve úthálózati (NAP) adat, ezért a rajzolt vonal most egyenes '
          + 'szakaszokból áll, és az útszám sem derül ki. Bekapcsolható helyette az online '
          + 'kiegészítés, ami kettőt tud: a rajzolt vonal követi az utat, és a rögzített '
          + 'pontokra ráírja az útszámot (a kilométerkövekből a szelvényt is, becsült '
          + 'értékként, ≈ jellel).\n\n'
          + 'Amit tudni kell: internet kell hozzá, és a pontok koordinátái elhagyják a '
          + 'készüléket (a bejárás, a fotók, a jegyzetek NEM). A hiteles útszám-szelvény '
          + 'továbbra is a NAP-adat. Bármikor kikapcsolható.',
        okText: 'Bekapcsolom',
        cancelText: 'Most nem',
      });
      if (!ok) return;
      online.set(true);
      this.roadSnap = true;
      this.renderPanel();
      toast('Online kiegészítés bekapcsolva. Kattintson a szakasz elejére, majd a végére.');
      return;
    }

    this.roadSnap = !this.roadSnap;
    this.renderPanel();
    toast(this.roadSnap
      ? 'Úthoz illesztés bekapcsolva — a pontok az útra kerülnek, a vonal az utat követi.'
      : 'Úthoz illesztés kikapcsolva — a pontok oda kerülnek, ahová koppint.');
  }

  undoVertex() {
    if (!this.draft || !this.draft.pts.length) return;
    // az úton vezetett közbenső pontokat egyben vesszük vissza, különben
    // csúcsonként kellene kattintgatni visszafelé
    const pts = this.draft.pts;
    pts.pop();
    while (pts.length && pts[pts.length - 1].snap === 'road' && pts[pts.length - 1].routed) pts.pop();
    this.draw();
    this.renderPanel();
  }

  /** Egérmutató a vásznon — rajzoláskor előnézeti vonalat húzunk utána. */
  onHover(p) {
    if (this.mode !== 'draw' || !this.draft || !this.draft.pts.length) {
      if (this.hoverPt) { this.hoverPt = null; this.draw(); }
      return;
    }
    this.hoverPt = p;
    if (this._hoverRaf) return;
    this._hoverRaf = requestAnimationFrame(() => { this._hoverRaf = null; this.draw(); });
  }

  /**
   * Ugrás egy helyre: koordináta (GPS vagy EOV), útszám + szelvény, vagy
   * település — amit az app fel tud oldani.
   */
  async gotoPlace() {
    const res = await modal({
      title: 'Ugrás helyre',
      text: 'Írjon be koordinátát (47.4979, 19.0402), EOV-t (650000, 240000), '
        + 'útszámot szelvénnyel (81 27+387) vagy települést — ez utóbbi kettőhöz '
        + 'be kell tölteni az úthálózati adatot a Közút dokumentumoknál.',
      fields: [{ name: 'hely', label: 'Hely', value: '' }],
      okText: 'Ugrás',
    });
    if (!res || !res.hely.trim()) return;
    const at = this.resolvePlace ? await this.resolvePlace(res.hely.trim()) : null;
    if (!at) { toast('Ezt a helyet nem találom.', 'error'); return; }
    this.centerOn(at.lat, at.lon, at.span || 600);
    toast(at.cim ? `Ide ugrottunk: ${at.cim}` : 'Kész.');
  }

  /** A térkép a megadott pontra áll, kb. ennyi méter széles kivágattal. */
  centerOn(lat, lon, spanMeters = 600) {
    if (!this.hit || !this.hit.fit) return;
    const { scale, cx, cy } = this.hit.fit;
    const w = this.hit.width, h = this.hit.height;
    const m = mercator(lat, lon);
    const metersPerWorld = 40075016.686 * Math.cos((lat * Math.PI) / 180);
    const wanted = (w * metersPerWorld) / Math.max(50, spanMeters);   // képpont / világegység
    const k = clampZoom(wanted / scale);
    const view = this.mapView.view;
    view.k = k;
    view.tx = w / 2 - (w / 2 + (m.x - cx) * scale) * k;
    view.ty = h / 2 - (h / 2 + (m.y - cy) * scale) * k;
    this.mapView.changed();
    this.draw();
  }

  /* ------------------------------------------------------------ kijelölés */

  tap(p) {
    if (this.pick) {
      if (!this.hit || !this.hit.unproject) return;
      this.picked = this.hit.unproject(p.x, p.y);
      this.draw();
      this.renderPanel();
      return;
    }
    if (!this.hit || !this.hit.nearest) return;

    // rajzolás: a koppintás helyére kerül a következő csúcs
    if (this.mode === 'draw') { this.addVertex(p); return; }

    // pontfelvétel: a koppintás helyén új elem keletkezik
    if (this.mode === 'add' && this.hit.unproject) {
      const at = this.hit.unproject(p.x, p.y);
      if (this.onAddPoint) this.onAddPoint(at);
      return;
    }

    // meglévő jelölésre koppintva azt nyitjuk meg (minden módban)
    const box = (this.hit.hitboxes || []).find((b) => Math.hypot(b.x - p.x, b.y - p.y) < b.r + 4);
    if (box && this.onOpenItem) { this.onOpenItem(box.id); return; }

    // berajzolt szakaszra koppintva azt jelöljük ki
    const dn = this.hit.nearestDrawn(p.x, p.y);
    const { index, distance } = this.hit.nearest(p.x, p.y);
    if (dn.distance < 26 && dn.distance < distance) {
      // Kijelölő módban a berajzolt szakaszon belül is lehet részt kijelölni:
      // az első koppintás az egyik vége, a második a másik. Így a fölösleges
      // kerülő kivehető anélkül, hogy az egész szakaszt el kellene dobni.
      if (this.mode === 'select') {
        this.jeloldKirajzoltban(dn);
      } else {
        this.selectedDrawn = this.selectedDrawn === dn.id ? null : dn.id;
        this.drawnSel = null;
      }
      this.sel = null;
      this.draw();
      this.renderPanel();
      return;
    }

    // a nyomvonalon szakaszt csak a kijelölő módban jelölünk ki
    if (this.mode !== 'select') return;
    if (index < 0 || distance > 44) return; // nem a nyomvonalra koppintott
    this.selectedDrawn = null;

    if (!this.sel) {
      this.sel = { from: index, to: index };
      toast('Most jelölje ki a szakasz másik végét.');
    } else if (this.sel.from === this.sel.to) {
      // Az első koppintás az A pont, a második a B: a szakasz a kettő közt
      // van, akármelyik irányban. (Korábban a „közelebbi fogópont” szabály
      // ilyenkor ugyanazt a végét mozgatta, és a kijelölés egy pont maradt.)
      const a = this.sel.from;
      this.sel = { from: Math.min(a, index), to: Math.max(a, index) };
    } else {
      // kész szakasznál a közelebbi véget igazítjuk
      const dFrom = Math.abs(index - this.sel.from);
      const dTo = Math.abs(index - this.sel.to);
      if (dFrom <= dTo) this.sel.from = Math.min(index, this.sel.to);
      else this.sel.to = Math.max(index, this.sel.from);
    }
    this.draw();
    this.renderPanel();
  }

  selectedPoints() {
    if (!this.sel) return [];
    return this.points.slice(this.sel.from, this.sel.to + 1);
  }

  /* ------------------- rész kijelölése egy berajzolt szakaszon belül */

  /** Az első koppintás az egyik vég, a második a másik; utána a közelebbi. */
  jeloldKirajzoltban(dn) {
    this.selectedDrawn = dn.id;
    const d = this.drawnSel;
    if (!d || d.id !== dn.id) {
      this.drawnSel = { id: dn.id, from: dn.index, to: dn.index };
      toast('Most koppintson a kivenni kívánt rész másik végére.');
      return;
    }
    if (d.from === d.to) {
      this.drawnSel = {
        id: dn.id,
        from: Math.min(d.from, dn.index),
        to: Math.max(d.from, dn.index),
      };
      return;
    }
    // kész kijelölésnél a közelebbi véget igazítjuk
    if (Math.abs(dn.index - d.from) <= Math.abs(dn.index - d.to)) {
      this.drawnSel = { id: d.id, from: Math.min(dn.index, d.to), to: d.to };
    } else {
      this.drawnSel = { id: d.id, from: d.from, to: Math.max(dn.index, d.from) };
    }
  }

  /** A kijelölt rész pontjai — a panel és a megerősítés ebből számol. */
  drawnSelPts() {
    const d = this.drawnSel;
    if (!d) return [];
    const seg = this.drawn.find((s) => s.id === d.id);
    return seg ? seg.pts.slice(d.from, d.to + 1) : [];
  }

  /**
   * A kijelölt rész kivétele a berajzolt szakaszból. A két megmaradó vég
   * összeér: ha a kivett rész középen volt, egyenes köti össze őket — ezt
   * utána az „Úthoz illesztve” újrarajzolással lehet pontosítani.
   */
  async deleteDrawnRange() {
    const d = this.drawnSel;
    const seg = d && this.drawn.find((s) => s.id === d.id);
    if (!seg) return;
    const kivett = seg.pts.slice(d.from, d.to + 1);
    const marad = seg.pts.length - kivett.length;
    const kozepen = d.from > 0 && d.to < seg.pts.length - 1;

    const ok = await modal({
      title: 'Kijelölt rész törlése?',
      text: `${formatDistance(trackLength(kivett))} · ${kivett.length} pont kerül ki`
        + (marad < 2 ? '\n\nEzzel az egész berajzolt szakasz elfogy, tehát törlöm.' : '')
        + (kozepen && marad >= 2 ? '\n\nA két megmaradó vég egyenessel ér össze.' : ''),
      okText: 'Törlés',
    });
    if (!ok) return;

    if (marad < 2) {
      this.drawn = this.drawn.filter((s) => s.id !== seg.id);
      this.selectedDrawn = null;
    } else {
      seg.pts = seg.pts.slice(0, d.from).concat(seg.pts.slice(d.to + 1));
    }
    this.drawnSel = null;
    await this.onApply({ drawn: this.drawn });
    this.dirty = true;
    this.draw();
    this.renderPanel();
    toast(marad < 2 ? 'A berajzolt szakasz törölve.' : 'A kijelölt rész kivéve.');
  }

  /**
   * Kettévágás: a kijelölés elejénél kettészeli a szakaszt. Így a fölösleges
   * fele külön szakasz lesz, és egyben törölhető.
   */
  async splitDrawn() {
    const d = this.drawnSel;
    const seg = d && this.drawn.find((s) => s.id === d.id);
    if (!seg) return;
    const at = d.from;
    if (at < 1 || at > seg.pts.length - 2) {
      toast('A szakasz végén nincs mit kettévágni — koppintson beljebb.', 'error');
      return;
    }
    const masodik = {
      id: 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name: (seg.name || 'Szakasz') + ' (2)',
      note: seg.note || '',
      pts: seg.pts.slice(at),
    };
    seg.pts = seg.pts.slice(0, at + 1);
    this.drawn.push(masodik);
    this.drawnSel = null;
    this.selectedDrawn = masodik.id;
    await this.onApply({ drawn: this.drawn });
    this.dirty = true;
    this.draw();
    this.renderPanel();
    toast('Kettévágva. A két fele külön-külön törölhető.');
  }

  /* ------------------------------------------- kézzel berajzolt szakasz

  Ha a kísérőautó nem járta végig a helyes kerülőt, nincs róla GPS-nyom —
  ilyenkor a hiányzó szakasz közvetlenül a térképre rajzolható. A csúcsok a
  meglévő nyomvonalhoz illeszkednek, hogy hézag nélkül csatlakozzanak.    */

  async addVertex(p) {
    const un = this.hit.unproject(p.x, p.y);
    let pt = { lat: un.lat, lon: un.lon };

    // illesztés a meglévő nyomvonalhoz vagy egy másik berajzolt csúcshoz
    const nt = this.hit.nearest(p.x, p.y);
    const nd = this.hit.nearestDrawn(p.x, p.y);
    if (nt.index >= 0 && nt.distance < SNAP_PX && nt.distance <= nd.distance) {
      const s = this.points[nt.index];
      pt = { lat: s.lat, lon: s.lon, snap: 'track' };
    } else if (nd.distance < SNAP_PX) {
      pt = { lat: nd.point.lat, lon: nd.point.lon, snap: 'drawn' };
    }

    // illesztés az úthálózatra: a koppintott pont az útra kerül
    let utszam = null;
    if (!pt.snap && this.roadSnap && this.road && this.road.snap) {
      const hit = await this.road.snap(pt);
      if (hit) {
        pt = { lat: hit.lat, lon: hit.lon, snap: 'road' };
        utszam = hit.utszam;
      }
    }

    // a két pont közötti vonal kövesse az utat
    const prev = this.draft.pts[this.draft.pts.length - 1];
    let routed = 0;
    if (prev && this.roadSnap && this.road && this.road.route) {
      const mid = await this.road.route(prev, pt);
      if (mid && mid.length) {
        for (const m of mid) this.draft.pts.push({ lat: m.lat, lon: m.lon, snap: 'road', routed: true });
        routed = mid.length;
      } else if (mid === null) {
        const onlineForras = this.road.source && this.road.source() === 'online';
        toast(onlineForras
          ? 'Az útvonaltervező nem válaszolt (vagy nincs net) — egyenes vonallal kötöm össze.'
          : 'Az úthálózaton nem találtam ide utat — egyenes vonallal kötöm össze.');
      }
    }

    this.draft.pts.push(pt);
    if (routed) toast(`Úton vezetve: ${utszam ? utszam + ' · ' : ''}${routed + 1} pont.`);
    else if (pt.snap === 'road') toast(`Illesztve az útra${utszam ? ': ' + utszam : ''}.`);
    else if (pt.snap) toast('Illesztve a meglévő útvonalhoz.');
    this.draw();
    this.renderPanel();
  }

  async finishDraw() {
    const pts = this.draft ? this.draft.pts : [];
    if (pts.length < 2) {
      toast('Legalább két pont kell a szakaszhoz.', 'error');
      return;
    }
    const res = await modal({
      title: 'Berajzolt szakasz mentése',
      text: `${pts.length} pont · ${formatDistance(trackLength(pts))}`,
      fields: [
        { name: 'name', label: 'Megnevezés', placeholder: 'pl. kerülő a Fő utcán át' },
        { name: 'note', label: 'Megjegyzés', type: 'textarea', rows: 2,
          placeholder: 'pl. a bejáráskor nem hajtottunk végig rajta' },
      ],
      okText: 'Mentés',
    });
    if (!res) return;

    this.drawn.push({
      id: 'seg-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7),
      name: res.name,
      note: res.note,
      pts,
      created: Date.now(),
    });
    this.draft = this.mode === 'draw' ? { pts: [] } : null;
    await this.onApply({ drawn: this.drawn });
    this.dirty = true;
    this.draw();
    this.renderPanel();
    toast('Szakasz mentve. Rajzolhat továbbit, vagy válasszon másik módot.');
  }

  currentDrawn() {
    return this.drawn.find((s) => s.id === this.selectedDrawn) || null;
  }

  async renameDrawn() {
    const seg = this.currentDrawn();
    if (!seg) return;
    const res = await modal({
      title: 'Berajzolt szakasz',
      fields: [
        { name: 'name', label: 'Megnevezés', value: seg.name || '' },
        { name: 'note', label: 'Megjegyzés', type: 'textarea', rows: 2, value: seg.note || '' },
      ],
    });
    if (!res) return;
    seg.name = res.name;
    seg.note = res.note;
    await this.onApply({ drawn: this.drawn });
    this.dirty = true;
    this.renderPanel();
    toast('Mentve.');
  }

  async deleteDrawn() {
    const seg = this.currentDrawn();
    if (!seg) return;
    const ok = await modal({
      title: 'Berajzolt szakasz törlése?',
      text: `${seg.name || 'Névtelen szakasz'} — ${formatDistance(trackLength(seg.pts))}`,
      okText: 'Törlés',
    });
    if (!ok) return;
    this.drawn = this.drawn.filter((s) => s.id !== seg.id);
    this.selectedDrawn = null;
    await this.onApply({ drawn: this.drawn });
    this.dirty = true;
    this.draw();
    this.renderPanel();
    toast('Szakasz törölve.');
  }

  /**
   * Egy koppintás — kész szakasz. A fordulóponttól kiindulva megkeresi a
   * teljes zsákutcát (oda- és visszautat), megmutatja, és elvetteti.
   */
  async markTurnaround() {
    if (!this.sel) {
      toast('Előbb koppintson a nyomvonalra ott, ahol visszafordultak.', 'error');
      return;
    }
    const pivot = Math.round((this.sel.from + this.sel.to) / 2);
    const found = detectTurnaround(this.points, pivot);

    if (!found.ok) {
      toast('Itt nem látok oda-vissza utat. Jelölje ki a szakaszt kézzel az A és B ponttal.', 'error');
      return;
    }

    // előbb mutassuk meg, mit talált, és csak utána kérdezzünk
    this.sel = { from: found.from, to: found.to };
    this.draw();
    this.renderPanel();

    const pts = this.selectedPoints();
    const res = await modal({
      title: 'Zsákutca elvetése',
      text: `A fordulóponttól visszafelé és előre is megtaláltam az utat: `
        + `${pts.length} pont, ${formatDistance(found.length)}. `
        + 'Ez kikerül a hivatalos útvonalból, de megmarad a felvételben.',
      fields: [{
        name: 'reason',
        label: 'Miért kellett visszafordulni?',
        type: 'textarea',
        rows: 2,
        value: 'Visszafordulás — nem járható tovább',
        placeholder: 'pl. 3,8 m magasságkorlát a hídnál',
      }],
      okText: 'Elvetés',
    });
    if (!res) return;

    for (const p of pts) { p.status = REJECTED; p.reason = res.reason; }
    await this.onApply({ updated: pts });
    this.dirty = true;
    this.sel = null;
    this.draw();
    this.renderPanel();
    toast(`Zsákutca elvetve: ${formatDistance(found.length)}.`);
  }

  /* -------------------------------------------------------------- műveletek */

  async markSelection(status) {
    const pts = this.selectedPoints();
    if (pts.length < 2) {
      toast('Jelöljön ki legalább két pontot a nyomvonalon.', 'error');
      return;
    }

    let reason = '';
    if (status === REJECTED) {
      const prev = pts.find((p) => p.reason);
      const res = await modal({
        title: 'Szakasz elvetése',
        text: `${pts.length} pont, ${formatDistance(trackLength(pts))} — az adat megmarad, de nem számít bele a hivatalos útvonalba.`,
        fields: [{
          name: 'reason',
          label: 'Miért nem járható ez a szakasz?',
          type: 'textarea',
          rows: 3,
          value: prev ? prev.reason : '',
          placeholder: 'pl. 3,8 m magasságkorlát a hídnál, vissza kellett fordulni',
        }],
        okText: 'Elvetés',
      });
      if (!res) return;
      reason = res.reason;
    }

    for (const p of pts) {
      if (status === REJECTED) { p.status = REJECTED; p.reason = reason; }
      else { delete p.status; delete p.reason; }
    }
    await this.onApply({ updated: pts });
    this.dirty = true;
    this.draw();
    this.renderPanel();
    toast(status === REJECTED ? 'Szakasz elvetve.' : 'Szakasz visszaállítva érvényesre.');
  }

  async deleteSelection() {
    const pts = this.selectedPoints();
    if (!pts.length) return;
    const ok = await modal({
      title: 'Szakasz végleges törlése?',
      text: `${pts.length} nyomvonalpont (${formatDistance(trackLength(pts))}) törlődik. Ha az információra később szükség lehet, inkább vesse el a szakaszt törlés helyett.`,
      okText: 'Végleges törlés',
    });
    if (!ok) return;

    const ids = pts.map((p) => p.id).filter((id) => id != null);
    this.points.splice(this.sel.from, this.sel.to - this.sel.from + 1);
    await this.onApply({ deleted: ids });
    this.dirty = true;
    this.sel = null;
    this.draw();
    this.renderPanel();
    toast('Szakasz törölve.');
  }

  /* --------------------------------------------------------------- kirajz */

  draw() {
    if (this.root.hidden) return;
    const prevFit = this.lastFit;
    const last = this.draft && this.draft.pts.length
      ? this.draft.pts[this.draft.pts.length - 1]
      : null;
    const opts = {
      here: this.picked ? { ...this.picked, color: '#ffd60a' } : null,
      view: this.view,
      selection: this.sel,
      drawn: this.drawn,
      draft: this.draft,
      // egérrel: halvány vonal az utolsó ponttól a kurzorig
      ghost: this.mode === 'draw' && last && this.hoverPt ? { from: last, to: this.hoverPt } : null,
      selectedDrawn: this.selectedDrawn,
      drawnSel: this.drawnSel,
      lineWidth: 5,
    };
    this.hit = renderTrack(this.canvas, this.points, this.items, opts);

    // ha közben megváltozott a térkép illesztése (új pont, berajzolt szakasz),
    // a nézetet igazítsuk vissza, hogy ne ugorjon el a térkép
    if (prevFit && this.hit.fit
        && rebaseView(this.mapView.view, prevFit, this.hit.fit)) {
      this.mapView.changed();
      this.hit = renderTrack(this.canvas, this.points, this.items, opts);
    }
    this.lastFit = this.hit.fit;
  }

  renderPanel() {
    if (this.pick) {
      this.renderPickPanel();
      return;
    }
    const len = lengthByStatus(this.points);
    const drawnLen = drawnLength(this.drawn);
    $('#te-ok', this.root).textContent = formatDistance(len.ok);
    $('#te-rejected', this.root).textContent = formatDistance(len.rejected);
    $('#te-drawn', this.root).textContent = formatDistance(drawnLen);
    $('#te-drawn-item', this.root).hidden = !this.drawn.length && !this.draft;

    const mode = this.mode;
    const tap = this.mouse ? 'kattintson' : 'koppintson';
    const Tap = this.mouse ? 'Kattintson' : 'Koppintson';

    for (const b of this.root.querySelectorAll('#trackedit-modes .mode')) {
      b.classList.toggle('on', b.dataset.mode === mode);
      b.setAttribute('aria-selected', b.dataset.mode === mode ? 'true' : 'false');
    }
    const body = $('#trackedit-body', this.root);
    if (body) body.className = 'm-' + mode;

    // csak az aktuális módhoz tartozó gombok látszanak
    $('#trackedit-drawbar', this.root).hidden = mode !== 'draw';
    $('#trackedit-normalbar', this.root).hidden = mode !== 'select';
    $('#trackedit-turnaround', this.root).hidden = mode !== 'select';
    $('#trackedit-selinfo', this.root).hidden = mode !== 'select' || !this.sel;
    $('#trackedit-drawnsel', this.root).hidden = mode !== 'select' || !this.drawnSel;
    // a berajzolt vonalon belüli kijelölés csak a kijelölő módban él
    if (mode !== 'select') this.drawnSel = null;

    const hint = $('#trackedit-hint', this.root);
    const keys = $('#trackedit-keys', this.root);
    const badge = $('#trackedit-badge', this.root);
    keys.hidden = !this.mouse || mode === 'view';
    keys.textContent = mode === 'draw'
      ? 'Enter: szakasz kész · Ctrl+Z: egy pont vissza · Esc: kilépés a módból'
      : 'Esc: kilépés a módból · görgő: nagyítás';

    const snapReady = !!(this.road && this.road.ready && this.road.ready());
    const forras = snapReady && this.road.source ? this.road.source() : null;
    const snapBtn = $('#trackedit-roadsnap', this.root);
    snapBtn.hidden = mode !== 'draw';
    snapBtn.textContent = !snapReady
      ? '🛣️ Úthoz illesztés bekapcsolása'
      : !this.roadSnap ? '🛣️ Úthoz illesztés ki'
        : forras === 'online' ? '🛣️ Úthoz illesztve (online)' : '🛣️ Úthoz illesztve (NAP)';
    snapBtn.title = snapReady
      ? (forras === 'online'
        ? 'Online útvonaltervezővel. Útszámot és szelvényt a NAP-adat ad.'
        : 'A betöltött NAP úthálózati adatból, offline.')
      : 'Kattintson ide: vagy a NAP-adatot tölti be, vagy online útkövetést kapcsol be';
    snapBtn.classList.toggle('active', snapReady && this.roadSnap);

    this.renderDrawnList();
    this.renderSections();

    if (mode === 'draw') {
      const n = this.draft ? this.draft.pts.length : 0;
      const hossz = n ? formatDistance(trackLength(this.draft.pts)) : '';
      hint.hidden = false;
      hint.textContent = n
        ? `${n} pont · ${hossz} — ${tap} a következő pontra.`
        : snapReady && this.roadSnap
          ? `${Tap} a szakasz elejére, majd a végére — a vonal magától az utat követi.`
          : `${Tap} sorban a szakasz pontjaira. Ha az utat kövesse magától: „🛣️ Úthoz illesztés bekapcsolása”.`;
      badge.hidden = false;
      badge.innerHTML = `✏️ Útvonal rajzolása<span class="sub">${
        n ? ` · ${n} pont · ${hossz}` : (snapReady && this.roadSnap ? ' · úthoz illesztve' : '')
      }</span>`;
      $('#trackedit-draw-done', this.root).disabled = n < 2;
      $('#trackedit-draw-undo', this.root).disabled = n === 0;
      $('#trackedit-draw-cancel', this.root).disabled = n === 0;
      return;
    }

    if (mode === 'add') {
      hint.hidden = false;
      hint.textContent = `${Tap} a térképen oda, ahová az új pont kerüljön. Utána adhat hozzá `
        + 'fotót, jegyzetet, hangot, jelzésképet — ugyanúgy, mint a terepen. Több pont is '
        + 'felvehető egymás után.';
      badge.hidden = false;
      badge.innerHTML = '📍 Pont felvétele<span class="sub"> · ' + tap + ' a helyére</span>';
      return;
    }

    if (mode === 'select') {
      // berajzolt szakaszon belüli kijelölés: saját gombsor
      const dpts = this.drawnSelPts();
      const dbox = $('#trackedit-drawnsel', this.root);
      dbox.hidden = dpts.length === 0;
      if (dpts.length) {
        $('#trackedit-drawnsel-stats', this.root).textContent =
          `${dpts.length} pont · ${formatDistance(trackLength(dpts))}`;
        $('#trackedit-drawnsel-del', this.root).disabled = dpts.length < 1;
        $('#trackedit-drawnsel-split', this.root).disabled = dpts.length < 1;
        hint.hidden = false;
        hint.textContent = this.drawnSel.from === this.drawnSel.to
          ? `Most ${tap} a kivenni kívánt rész másik végére.`
          : 'A pirossal jelölt rész kerül ki. A két megmaradó vég összeér.';
        badge.hidden = false;
        badge.innerHTML = '✂️ Szakasz kijelölése<span class="sub"> · a berajzolt vonalon</span>';
        return;
      }

      const hasSel = !!this.sel;
      for (const id of ['#trackedit-reject', '#trackedit-accept', '#trackedit-delete',
                        '#trackedit-clear-sel', '#trackedit-turnaround']) {
        $(id, this.root).disabled = !hasSel;
      }
      hint.hidden = false;
      hint.textContent = hasSel
        ? 'A csúszkákkal pontosítható a két vég. Utána: elvetett, érvényes vagy törlés.'
        : `${Tap} a nyomvonalra — vagy a berajzolt vonalra — a kivenni kívánt `
          + 'rész elejénél, majd a végénél.';
      badge.hidden = false;
      badge.innerHTML = '✂️ Szakasz kijelölése<span class="sub"> · a bejárt nyomvonalon</span>';

      if (!hasSel) return;
      const pts = this.selectedPoints();
      const rejected = pts.filter(isRejected).length;
      $('#trackedit-selstats', this.root).textContent =
        `${pts.length} pont · ${formatDistance(trackLength(pts))} · ${
          formatDuration((pts[pts.length - 1]?.t || 0) - (pts[0]?.t || 0))
        }${rejected ? ` · ${rejected} már elvetett` : ''}`;

      const max = Math.max(0, this.points.length - 1);
      const from = $('#trackedit-from', this.root);
      const to = $('#trackedit-to', this.root);
      from.max = to.max = String(max);
      from.value = String(this.sel.from);
      to.value = String(this.sel.to);
      return;
    }

    // nézegetés
    badge.hidden = true;
    hint.hidden = false;
    hint.textContent = this.currentDrawn()
      ? 'Kijelölt berajzolt szakasz — átnevezhető vagy törölhető alább.'
      : 'Nagyítás, mozgatás, a jelölésekre ' + tap + ' a megnyitáshoz. '
        + 'Szerkesztéshez válasszon módot fent.';
  }

  /** Az elvetett szakaszok listája (koppintásra kijelöli). */
  renderSections() {
    const secs = rejectedSections(this.points);
    const list = $('#trackedit-sections', this.root);
    list.innerHTML = '';
    $('#trackedit-sections-wrap', this.root).hidden = secs.length === 0;
    secs.forEach((sec, i) => {
      list.appendChild(
        el('button', {
          class: 'section-row',
          type: 'button',
          onclick: () => {
            this.sel = { from: sec.from, to: sec.to };
            this.setMode('select', { quiet: true, force: true });
          },
        }, [
          el('span', { class: 'section-idx', text: String(i + 1) }),
          el('span', { class: 'section-body' }, [
            el('span', { class: 'section-reason', text: sec.reason || 'Elvetett szakasz (nincs indoklás)' }),
            el('span', { class: 'section-sub', text: `${formatDistance(sec.length)} · ${sec.count} pont` }),
          ]),
        ])
      );
    });
  }

  renderDrawnList() {
    const wrap = $('#trackedit-drawn-wrap', this.root);
    const list = $('#trackedit-drawn-list', this.root);
    wrap.hidden = this.drawn.length === 0;
    list.innerHTML = '';
    this.drawn.forEach((seg, i) => {
      const row = el('button', {
        class: 'section-row drawn' + (seg.id === this.selectedDrawn ? ' active' : ''),
        type: 'button',
        onclick: () => {
          this.selectedDrawn = seg.id === this.selectedDrawn ? null : seg.id;
          this.sel = null;
          this.draw();
          this.renderPanel();
        },
      }, [
        el('span', { class: 'section-idx', text: String(i + 1) }),
        el('span', { class: 'section-body' }, [
          el('span', { class: 'section-reason', text: seg.name || 'Berajzolt szakasz' }),
          el('span', { class: 'section-sub', text: `${formatDistance(trackLength(seg.pts))} · ${seg.pts.length} pont` }),
        ]),
      ]);
      list.appendChild(row);
    });
  }
}
