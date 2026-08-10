// Nyomvonal-szerkesztő: a rögzített nyomvonalon utólag kijelölhető egy
// szakasz, amely elvetetté tehető (megmarad, indoklással, de nem számít
// bele a hivatalos útvonalba) vagy véglegesen törölhető.
//
// A kísérőautó útja nem feltétlenül a jóváhagyandó útvonal: akadály miatt
// vissza kellett fordulni, kerülőt kellett keresni. Ezt csak utólag,
// térképen lehet rendbe tenni.

import {
  renderTrack, lengthByStatus, rejectedSections, trackLength,
  formatDistance, formatDuration, REJECTED, isRejected,
} from './geo.js';
import { $, el, toast, modal } from './ui.js';

const MIN_ZOOM = 1;
const MAX_ZOOM = 40;

export class TrackEditor {
  constructor(root) {
    this.root = root;
    this.canvas = $('#trackedit-canvas', root);
    this.points = [];
    this.items = [];
    this.sel = null;                  // { from, to } — indexek a points tömbben
    this.view = { k: 1, tx: 0, ty: 0 };
    this.hit = null;
    this.pointers = new Map();
    this.pinch = null;
    this.dirty = false;
    this._bind();
  }

  /**
   * @returns {Promise<boolean>} true, ha változott a nyomvonal
   */
  open({ points, items = [], onApply }) {
    this.points = points;
    this.items = items;
    this.onApply = onApply;
    this.sel = null;
    this.view = { k: 1, tx: 0, ty: 0 };
    this.dirty = false;
    this.root.hidden = false;
    document.body.classList.add('modal-open');
    requestAnimationFrame(() => { this.draw(); this.renderPanel(); });
    return new Promise((resolve) => { this._resolve = resolve; });
  }

  close() {
    this.root.hidden = true;
    document.body.classList.remove('modal-open');
    const r = this._resolve;
    this._resolve = null;
    if (r) r(this.dirty);
  }

  /* ------------------------------------------------------------- vezérlés */

  _bind() {
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => this.onDown(e));
    c.addEventListener('pointermove', (e) => this.onMove(e));
    c.addEventListener('pointerup', (e) => this.onUp(e));
    c.addEventListener('pointercancel', (e) => this.onUp(e));
    c.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    c.addEventListener('contextmenu', (e) => e.preventDefault());

    $('#trackedit-close', this.root).addEventListener('click', () => this.close());
    $('#trackedit-zoom-in', this.root).addEventListener('click', () => this.zoomBy(1.5));
    $('#trackedit-zoom-out', this.root).addEventListener('click', () => this.zoomBy(1 / 1.5));
    $('#trackedit-fit', this.root).addEventListener('click', () => {
      this.view = { k: 1, tx: 0, ty: 0 };
      this.draw();
    });

    $('#trackedit-reject', this.root).addEventListener('click', () => this.markSelection(REJECTED));
    $('#trackedit-accept', this.root).addEventListener('click', () => this.markSelection('ok'));
    $('#trackedit-delete', this.root).addEventListener('click', () => this.deleteSelection());
    $('#trackedit-clear-sel', this.root).addEventListener('click', () => {
      this.sel = null;
      this.draw();
      this.renderPanel();
    });

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

  /* --------------------------------------------------- nagyítás, mozgatás */

  local(e) {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  onDown(e) {
    this.canvas.setPointerCapture(e.pointerId);
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
      const k = clamp(this.pinch.k * (dist / (this.pinch.dist || 1)), MIN_ZOOM, MAX_ZOOM);
      this.zoomAt(mid, k);
      return;
    }

    const p = this.local(e);
    if (!this.start) return;
    const dx = p.x - this.start.x, dy = p.y - this.start.y;
    if (Math.hypot(dx, dy) > 8) this.moved = true;
    if (this.moved) {
      this.view.tx = this.startView.tx + dx;
      this.view.ty = this.startView.ty + dy;
      this.draw();
    }
  }

  onUp(e) {
    const p = this.pointers.get(e.pointerId);
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinch = null;
    if (this.pointers.size === 0 && !this.moved && p) this.tap(p);
    if (this.pointers.size === 0) this.start = null;
  }

  onWheel(e) {
    e.preventDefault();
    const k = clamp(this.view.k * (e.deltaY < 0 ? 1.2 : 1 / 1.2), MIN_ZOOM, MAX_ZOOM);
    this.zoomAt(this.local(e), k);
  }

  zoomBy(f) {
    const r = this.canvas.getBoundingClientRect();
    this.zoomAt({ x: r.width / 2, y: r.height / 2 }, clamp(this.view.k * f, MIN_ZOOM, MAX_ZOOM));
  }

  /** Nagyítás úgy, hogy a megadott képernyőpont a helyén maradjon. */
  zoomAt(anchor, k) {
    const ratio = k / this.view.k;
    this.view.tx = anchor.x - (anchor.x - this.view.tx) * ratio;
    this.view.ty = anchor.y - (anchor.y - this.view.ty) * ratio;
    this.view.k = k;
    this.draw();
  }

  /* ------------------------------------------------------------ kijelölés */

  tap(p) {
    if (!this.hit || !this.hit.nearest) return;
    const { index, distance } = this.hit.nearest(p.x, p.y);
    if (index < 0 || distance > 44) return; // nem a nyomvonalra koppintott

    if (!this.sel) {
      this.sel = { from: index, to: index };
    } else {
      // a közelebbi fogópontot mozgatjuk
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
    this.hit = renderTrack(this.canvas, this.points, this.items, {
      view: this.view,
      selection: this.sel,
      lineWidth: 5,
    });
  }

  renderPanel() {
    const len = lengthByStatus(this.points);
    $('#te-ok', this.root).textContent = formatDistance(len.ok);
    $('#te-rejected', this.root).textContent = formatDistance(len.rejected);

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
            this.draw();
            this.renderPanel();
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

    const hasSel = !!this.sel;
    $('#trackedit-selinfo', this.root).hidden = !hasSel;
    $('#trackedit-hint', this.root).hidden = hasSel;
    for (const id of ['#trackedit-reject', '#trackedit-accept', '#trackedit-delete', '#trackedit-clear-sel']) {
      $(id, this.root).disabled = !hasSel;
    }
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
  }
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
