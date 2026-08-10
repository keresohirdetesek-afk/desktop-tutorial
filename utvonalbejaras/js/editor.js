// Fotó-jelölő: szabadkézi rajz, jelölő nyíl, HALVÁNY ÚTIRÁNY-NYÍL,
// méretvonal beírható értékkel, szöveg, keret.
//
// A rajzelemek normalizált (0..1) képkoordinátákkal tárolódnak, így a
// jelölés bármekkora kijelzőn és exportnál is ugyanoda esik.

import { loadImage, canvasToBlob } from './media.js';
import { modal, toast, el, $ } from './ui.js';

const REF = 1000; // vonalvastagság / szövegméret referenciaszélessége

export const TOOLS = [
  { id: 'pen',   label: 'Rajz',        icon: '✏️' },
  { id: 'arrow', label: 'Jelölő nyíl', icon: '➔' },
  { id: 'dir',   label: 'Útirány',     icon: '⇨' },
  { id: 'dim',   label: 'Méret',       icon: '↔' },
  { id: 'text',  label: 'Szöveg',      icon: 'T' },
  { id: 'rect',  label: 'Keret',       icon: '▢' },
  { id: 'erase', label: 'Törlés',      icon: '⌫' },
];

const COLORS = ['#ff3b30', '#ffd60a', '#3ddc84', '#4da3ff', '#ffffff', '#111111'];

export class PhotoEditor {
  constructor(root) {
    this.root = root;
    this.canvas = $('#editor-canvas', root);
    this.ctx = this.canvas.getContext('2d');
    this.ops = [];
    this.redoStack = [];
    this.tool = 'pen';
    this.color = COLORS[0];
    // eszközönként megjegyzett szín: az útirány-nyíl alapból fehér,
    // mert halványra állítva az marad a legjobban olvasható
    this.colorByTool = { dir: '#ffffff' };
    this.width = 6;          // referencia-egységben
    this.dirAlpha = 0.35;    // az útirány-nyíl halványsága
    this.active = null;      // a fogópontokkal igazítható útirány-nyíl indexe
    this.drag = null;        // épp húzott fogópont
    this.draft = null;
    this.image = null;
    this.layout = { ox: 0, oy: 0, dw: 1, dh: 1 };
    this._bindStatic();
  }

  /* --------------------------------------------------------- megnyitás */

  open({ imageBlob, ops = [], title = 'Fotó jelölése' }) {
    return new Promise(async (resolve) => {
      this._resolve = resolve;
      this.ops = JSON.parse(JSON.stringify(ops || []));
      this.redoStack = [];
      this.active = null;
      this.drag = null;
      this.imageBlob = imageBlob;
      $('#editor-title', this.root).textContent = title;
      this.root.hidden = false;
      document.body.classList.add('modal-open');

      try {
        this.image = await loadImage(imageBlob);
      } catch (e) {
        toast('A kép nem tölthető be.', 'error');
        this.close(null);
        return;
      }
      this._syncToolUI();
      this.resize();
    });
  }

  close(value) {
    this.root.hidden = true;
    document.body.classList.remove('modal-open');
    if (this.image && this.image.close) this.image.close();
    this.image = null;
    const r = this._resolve;
    this._resolve = null;
    if (r) r(value);
  }

  /* ------------------------------------------------------------ vezérlés */

  _bindStatic() {
    const bar = $('#editor-tools', this.root);
    bar.innerHTML = '';
    for (const t of TOOLS) {
      const b = el('button', {
        class: 'tool',
        type: 'button',
        'data-tool': t.id,
        title: t.label,
        onclick: () => this.setTool(t.id),
      }, [el('span', { class: 'tool-icon', text: t.icon }), el('span', { class: 'tool-label', text: t.label })]);
      bar.appendChild(b);
    }

    const swatches = $('#editor-colors', this.root);
    swatches.innerHTML = '';
    for (const c of COLORS) {
      swatches.appendChild(
        el('button', {
          class: 'swatch',
          type: 'button',
          'data-color': c,
          style: `--sw:${c}`,
          onclick: () => { this.color = c; this.colorByTool[this.tool] = c; this._syncToolUI(); },
        })
      );
    }

    $('#editor-width', this.root).addEventListener('input', (e) => {
      this.width = Number(e.target.value);
      this.draw();
    });
    $('#editor-dir-alpha', this.root).addEventListener('input', (e) => {
      this.dirAlpha = Number(e.target.value) / 100;
      $('#editor-dir-alpha-val', this.root).textContent = Math.round(this.dirAlpha * 100) + '%';
      // a már megrajzolt útirány-nyilak együtt halványuljanak a beállítással
      for (const op of this.ops) if (op.k === 'dir') op.alpha = this.dirAlpha;
      this.draw();
    });
    $('#editor-dir-straight', this.root).addEventListener('click', () => {
      const op = this.activeOp();
      if (!op) { toast('Előbb rajzoljon vagy válasszon ki egy útirány-nyilat.'); return; }
      delete op.mid;
      this.draw();
    });
    $$('[data-quickdir]', this.root).forEach((btn) =>
      btn.addEventListener('click', () => this.quickDirection(btn.dataset.quickdir))
    );

    $('#editor-undo', this.root).addEventListener('click', () => this.undo());
    $('#editor-redo', this.root).addEventListener('click', () => this.redo());
    $('#editor-clear', this.root).addEventListener('click', async () => {
      if (!this.ops.length) return;
      const ok = await modal({
        title: 'Összes jelölés törlése?',
        text: 'A képre rajzolt elemek elvesznek. A fotó megmarad.',
        okText: 'Törlés',
      });
      if (ok) { this.redoStack = []; this.ops = []; this.draw(); }
    });
    $('#editor-cancel', this.root).addEventListener('click', () => this.close(null));
    $('#editor-save', this.root).addEventListener('click', () => this.save());

    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => this.onDown(e));
    c.addEventListener('pointermove', (e) => this.onMove(e));
    c.addEventListener('pointerup', (e) => this.onUp(e));
    c.addEventListener('pointercancel', () => { this.draft = null; this.draw(); });
    c.addEventListener('contextmenu', (e) => e.preventDefault());

    window.addEventListener('resize', () => { if (!this.root.hidden) this.resize(); });

    // a vászon a panel ki-be kapcsolásakor és forgatáskor is kövesse a helyet
    if (window.ResizeObserver) {
      let pending = false;
      new ResizeObserver(() => {
        if (this.root.hidden || pending) return;
        pending = true;
        requestAnimationFrame(() => { pending = false; this.resize(); });
      }).observe($('#editor-stage', this.root));
    }
  }

  setTool(id) {
    this.colorByTool[this.tool] = this.color;
    this.tool = id;
    this.color = this.colorByTool[id] || COLORS[0];
    if (id !== 'dir') this.active = null; // a fogópontok csak az útirány-eszköznél
    this._syncToolUI();
    this.draw();
  }

  /** A fogópontokkal éppen igazítható útirány-nyíl. */
  activeOp() {
    const op = this.active == null ? null : this.ops[this.active];
    return op && op.k === 'dir' ? op : null;
  }

  /** A nyíl három fogópontja normalizált koordinátákban. */
  handlesOf(op) {
    return [
      { key: 'a', p: op.a },
      { key: 'b', p: op.b },
      { key: 'mid', p: op.mid || [(op.a[0] + op.b[0]) / 2, (op.a[1] + op.b[1]) / 2] },
    ];
  }

  _syncToolUI() {
    $$('#editor-tools .tool', this.root).forEach((b) =>
      b.classList.toggle('active', b.dataset.tool === this.tool)
    );
    $$('#editor-colors .swatch', this.root).forEach((b) =>
      b.classList.toggle('active', b.dataset.color === this.color)
    );
    // az útirány-nyíl saját beállítópanelja csak a saját eszközénél látszik
    $('#editor-dir-panel', this.root).hidden = this.tool !== 'dir';
    $('#editor-width', this.root).value = this.width;
    $('#editor-dir-alpha', this.root).value = Math.round(this.dirAlpha * 100);
    $('#editor-dir-alpha-val', this.root).textContent = Math.round(this.dirAlpha * 100) + '%';
    $('#editor-hint', this.root).textContent = HINTS[this.tool] || '';
  }

  /* ------------------------------------------------------------ méretezés */

  resize() {
    if (!this.image) return;
    const wrap = $('#editor-stage', this.root);
    const availW = wrap.clientWidth;
    const availH = wrap.clientHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    this.canvas.width = Math.round(availW * dpr);
    this.canvas.height = Math.round(availH * dpr);
    this.canvas.style.width = availW + 'px';
    this.canvas.style.height = availH + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const iw = this.image.width, ih = this.image.height;
    const scale = Math.min(availW / iw, availH / ih);
    const dw = iw * scale, dh = ih * scale;
    this.layout = { ox: (availW - dw) / 2, oy: (availH - dh) / 2, dw, dh, cw: availW, ch: availH };
    this.draw();
  }

  toNorm(e) {
    const r = this.canvas.getBoundingClientRect();
    const { ox, oy, dw, dh } = this.layout;
    return [
      clamp01((e.clientX - r.left - ox) / dw),
      clamp01((e.clientY - r.top - oy) / dh),
    ];
  }

  /* --------------------------------------------------------- rajz-események */

  onDown(e) {
    if (!this.image) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    this.canvas.setPointerCapture(e.pointerId);
    const p = this.toNorm(e);

    if (this.tool === 'erase') { this.eraseAt(p); return; }

    if (this.tool === 'dir') {
      // meglévő nyíl fogópontjának megfogása, vagy másik nyíl kiválasztása
      const grabbed = this.grabHandle(p);
      if (grabbed) { this.drag = grabbed; return; }
      const idx = this.findDirAt(p);
      if (idx != null && idx !== this.active) {
        this.active = idx;
        this.dirAlpha = this.ops[idx].alpha ?? this.dirAlpha;
        this._syncToolUI();
        this.draw();
        return;
      }
    }

    if (this.tool === 'text') {
      this.addText(p);
      return;
    }
    if (this.tool === 'pen') {
      this.draft = { k: 'pen', pts: [p], color: this.color, w: this.width, alpha: 1 };
    } else if (this.tool === 'arrow') {
      this.draft = { k: 'arrow', a: p, b: p, color: this.color, w: this.width, alpha: 1 };
    } else if (this.tool === 'dir') {
      this.draft = {
        k: 'dir', a: p, b: p, color: this.color,
        w: Math.max(this.width * 2.6, 14), alpha: this.dirAlpha,
      };
    } else if (this.tool === 'dim') {
      this.draft = { k: 'dim', a: p, b: p, color: this.color, w: this.width, label: '' };
    } else if (this.tool === 'rect') {
      this.draft = { k: 'rect', a: p, b: p, color: this.color, w: this.width, alpha: 1 };
    }
    this.draw();
  }

  /** Fogópont a koppintás közelében? (képernyő-pixelben mérve) */
  grabHandle(p) {
    const op = this.activeOp();
    if (!op) return null;
    const { dw, dh } = this.layout;
    for (const h of this.handlesOf(op)) {
      const d = Math.hypot((h.p[0] - p[0]) * dw, (h.p[1] - p[1]) * dh);
      if (d < 26) return { key: h.key, index: this.active };
    }
    return null;
  }

  /** A koppintáshoz tartozó útirány-nyíl indexe, ha van ilyen. */
  findDirAt(p) {
    for (let i = this.ops.length - 1; i >= 0; i--) {
      if (this.ops[i].k === 'dir' && hitTest(this.ops[i], p)) return i;
    }
    return null;
  }

  onMove(e) {
    if (this.drag) {
      const op = this.ops[this.drag.index];
      const p = this.toNorm(e);
      if (this.drag.key === 'mid') op.mid = p;
      else op[this.drag.key] = p;
      this.draw();
      return;
    }
    if (!this.draft) return;
    const p = this.toNorm(e);
    if (this.draft.k === 'pen') {
      const last = this.draft.pts[this.draft.pts.length - 1];
      if (Math.hypot(p[0] - last[0], p[1] - last[1]) > 0.003) this.draft.pts.push(p);
    } else {
      this.draft.b = p;
    }
    this.draw();
  }

  async onUp(e) {
    if (this.drag) { this.drag = null; this.draw(); return; }
    if (!this.draft) return;
    const op = this.draft;
    this.draft = null;

    const tooShort =
      op.k !== 'pen' && Math.hypot(op.b[0] - op.a[0], op.b[1] - op.a[1]) < 0.02;
    if (tooShort || (op.k === 'pen' && op.pts.length < 2)) { this.draw(); return; }

    if (op.k === 'dim') {
      const value = await this.askDimension();
      if (!value) { this.draw(); return; }
      op.label = value;
    }
    this.commit(op);
    if (op.k === 'dir') {
      // a friss nyíl rögtön igazítható: fogópontok a végeken és az ívnél
      this.active = this.ops.length - 1;
      this.draw();
    }
  }

  async askDimension() {
    const res = await modal({
      title: 'Méret megadása',
      fields: [
        { name: 'value', label: 'Érték', type: 'text', inputmode: 'decimal', placeholder: 'pl. 4,20' },
        {
          name: 'unit', label: 'Mértékegység', type: 'select', value: 'm',
          options: [
            { value: 'm', label: 'méter (m)' },
            { value: 'cm', label: 'centiméter (cm)' },
            { value: 't', label: 'tonna (t)' },
            { value: '', label: '(nincs)' },
          ],
        },
        { name: 'prefix', label: 'Megnevezés (nem kötelező)', type: 'text', placeholder: 'pl. szabad magasság' },
      ],
      okText: 'Beírás',
    });
    if (!res || !res.value) return null;
    const num = res.value.replace('.', ',');
    const base = res.unit ? `${num} ${res.unit}` : num;
    return res.prefix ? `${res.prefix}: ${base}` : base;
  }

  async addText(p) {
    const res = await modal({
      title: 'Szöveg a képre',
      fields: [{ name: 'text', label: 'Szöveg', type: 'text', placeholder: 'pl. villanyoszlop, szűkület' }],
      okText: 'Beírás',
    });
    if (!res || !res.text) return;
    this.commit({ k: 'text', p, text: res.text, color: this.color, size: Math.max(this.width * 4, 22) });
  }

  /** Gyors, előre elhelyezett halvány útirány-nyíl (bal / jobb / fel). */
  quickDirection(dir) {
    const y = 0.82;
    const map = {
      right: { a: [0.15, y], b: [0.85, y] },
      left:  { a: [0.85, y], b: [0.15, y] },
      up:    { a: [0.5, 0.9], b: [0.5, 0.25] },
      down:  { a: [0.5, 0.25], b: [0.5, 0.9] },
    };
    const m = map[dir] || map.right;
    this.commit({
      k: 'dir', a: m.a, b: m.b, color: this.color,
      w: Math.max(this.width * 3.2, 18), alpha: this.dirAlpha,
    });
    this.active = this.ops.length - 1;
    this.draw();
    toast('Útirány-nyíl beszúrva — a fogópontokkal igazíthatja, a csúszkával halványíthatja.');
  }

  commit(op) {
    this.ops.push(op);
    this.redoStack = [];
    this.draw();
  }

  eraseAt(p) {
    for (let i = this.ops.length - 1; i >= 0; i--) {
      if (hitTest(this.ops[i], p)) {
        this.ops.splice(i, 1);
        this.redoStack = [];
        this.draw();
        return;
      }
    }
  }

  undo() {
    if (!this.ops.length) return;
    this.redoStack.push(this.ops.pop());
    this.draw();
  }

  redo() {
    if (!this.redoStack.length) return;
    this.ops.push(this.redoStack.pop());
    this.draw();
  }

  /* -------------------------------------------------------------- rajzolás */

  draw() {
    if (!this.image) return;
    const { ctx } = this;
    const { ox, oy, dw, dh, cw, ch } = this.layout;
    ctx.clearRect(0, 0, cw, ch);
    ctx.drawImage(this.image, ox, oy, dw, dh);
    const ops = this.draft ? this.ops.concat([this.draft]) : this.ops;
    for (const op of ops) drawOp(ctx, op, ox, oy, dw, dh);
    this.drawHandles(ctx, ox, oy, dw, dh);
    $('#editor-undo', this.root).disabled = !this.ops.length;
    $('#editor-redo', this.root).disabled = !this.redoStack.length;
    $('#editor-count', this.root).textContent = this.ops.length
      ? `${this.ops.length} jelölés`
      : 'Nincs jelölés';
  }

  /**
   * Az útirány-nyíl fogópontjai. Csak a szerkesztőben látszanak — a
   * lapított exportra nem kerülnek rá.
   */
  drawHandles(ctx, ox, oy, dw, dh) {
    const op = this.activeOp();
    if (!op || this.tool !== 'dir') return;
    ctx.save();
    for (const h of this.handlesOf(op)) {
      const x = ox + h.p[0] * dw, y = oy + h.p[1] * dh;
      const isMid = h.key === 'mid';
      ctx.beginPath();
      ctx.arc(x, y, isMid ? 11 : 9, 0, Math.PI * 2);
      ctx.fillStyle = isMid ? '#ffd60a' : '#ffffff';
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.stroke();
      if (isMid) {
        // hajlítás-jel: kis ív a fogópont közepén
        ctx.beginPath();
        ctx.arc(x, y + 3.5, 5, Math.PI * 1.15, Math.PI * 1.85);
        ctx.strokeStyle = '#0b0f16';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  /** Kép + jelölések teljes felbontású, lapított exportja. */
  async flatten() {
    const img = this.image || (await loadImage(this.imageBlob));
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    for (const op of this.ops) drawOp(ctx, op, 0, 0, img.width, img.height);
    return canvasToBlob(canvas, 'image/jpeg', 0.9);
  }

  async save() {
    const btn = $('#editor-save', this.root);
    btn.disabled = true;
    btn.textContent = 'Mentés…';
    try {
      const flat = await this.flatten();
      const dims = this.ops.filter((o) => o.k === 'dim' && o.label).map((o) => o.label);
      const texts = this.ops.filter((o) => o.k === 'text' && o.text).map((o) => o.text);
      this.close({ ops: this.ops, dims, texts, flat });
    } catch (e) {
      toast('A mentés nem sikerült: ' + e.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Mentés';
    }
  }
}

const HINTS = {
  pen: 'Húzza az ujját a képen a szabadkézi jelöléshez.',
  arrow: 'Húzással rajzolhat kiemelő nyilat.',
  dir: 'Húzza a haladás irányába, majd a középső sárga fogóponttal hajlítsa meg az ívet.',
  dim: 'Húzzon vonalat a két pont közé, majd írja be a méretet.',
  text: 'Koppintson oda, ahová a szöveg kerüljön.',
  rect: 'Húzással keretezhet be egy részletet.',
  erase: 'Koppintson egy jelölésre a törléséhez.',
};

/* ------------------------------------------------------ elemek kirajzolása */

export function drawOp(ctx, op, ox, oy, dw, dh) {
  const S = dw / REF;                       // méretskála a referenciához képest
  const X = (n) => ox + n[0] * dw;
  const Y = (n) => oy + n[1] * dh;
  const bounds = { x: ox, y: oy, w: dw, h: dh };
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.globalAlpha = op.alpha == null ? 1 : op.alpha;
  ctx.strokeStyle = op.color;
  ctx.fillStyle = op.color;
  ctx.lineWidth = Math.max(1, (op.w || 6) * S);

  if (op.k === 'pen') {
    ctx.beginPath();
    op.pts.forEach((p, i) => (i ? ctx.lineTo(X(p), Y(p)) : ctx.moveTo(X(p), Y(p))));
    ctx.stroke();
  } else if (op.k === 'rect') {
    const x1 = X(op.a), y1 = Y(op.a), x2 = X(op.b), y2 = Y(op.b);
    ctx.strokeRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
  } else if (op.k === 'arrow') {
    strokeArrow(ctx, X(op.a), Y(op.a), X(op.b), Y(op.b), ctx.lineWidth, false);
  } else if (op.k === 'dir') {
    // halvány útirány-nyíl: vastag test + sötét kontúr, hogy sötét és
    // világos háttéren is olvasható maradjon
    ctx.lineWidth = Math.max(2, (op.w || 18) * S);
    strokeArrow(ctx, X(op.a), Y(op.a), X(op.b), Y(op.b), ctx.lineWidth, true, controlPoint(op, X, Y));
  } else if (op.k === 'dim') {
    drawDimension(ctx, X(op.a), Y(op.a), X(op.b), Y(op.b), op, S, bounds);
  } else if (op.k === 'text') {
    drawLabel(ctx, X(op.p), Y(op.p), op.text, Math.max(10, (op.size || 24) * S), op.color, 'left', bounds);
  }
  ctx.restore();
}

/**
 * A hajlítás-fogópont a görbén ül (t=0,5), a Bézier vezérlőpont ebből
 * számolható: C = 2·M − (A+B)/2. Így a fogópont oda kerül, ahová húzzák.
 */
export function controlPoint(op, X, Y) {
  if (op.mid) {
    const mx = X(op.mid), my = Y(op.mid);
    return { x: 2 * mx - (X(op.a) + X(op.b)) / 2, y: 2 * my - (Y(op.a) + Y(op.b)) / 2 };
  }
  if (op.curve) {
    // korábbi verzió „ívelt” kapcsolója: merőleges eltolás a felezőpontnál
    const x1 = X(op.a), y1 = Y(op.a), x2 = X(op.b), y2 = Y(op.b);
    const len = Math.hypot(x2 - x1, y2 - y1) || 1;
    return {
      x: (x1 + x2) / 2 - ((y2 - y1) / len) * len * 0.36,
      y: (y1 + y2) / 2 + ((x2 - x1) / len) * len * 0.36,
    };
  }
  return null;
}

function strokeArrow(ctx, x1, y1, x2, y2, w, filled, ctrl) {
  const head = Math.max(w * (filled ? 1.9 : 2.6), 10);
  // a nyílhegy a görbe végponti érintőjének irányába néz
  const tx = ctrl ? x2 - ctrl.x : x2 - x1;
  const ty = ctrl ? y2 - ctrl.y : y2 - y1;
  const tl = Math.hypot(tx, ty) || 1;
  const ux = tx / tl, uy = ty / tl;
  const bx = x2 - ux * head * 0.85;
  const by = y2 - uy * head * 0.85;

  if (filled) {
    // sötét szegély a kontraszt kedvéért
    ctx.save();
    ctx.globalAlpha = Math.min(1, (ctx.globalAlpha || 1) * 0.55);
    ctx.strokeStyle = 'rgba(0,0,0,0.65)';
    ctx.lineWidth = w + Math.max(2, w * 0.25);
    strokeArrowPath(ctx, x1, y1, bx, by, ctrl);
    ctx.restore();
  }

  strokeArrowPath(ctx, x1, y1, bx, by, ctrl);

  // nyílhegy
  ctx.save();
  ctx.translate(x2, y2);
  ctx.rotate(Math.atan2(uy, ux));
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-head, head * 0.62);
  ctx.lineTo(-head * 0.65, 0);
  ctx.lineTo(-head, -head * 0.62);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function strokeArrowPath(ctx, x1, y1, x2, y2, ctrl) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  if (ctrl) ctx.quadraticCurveTo(ctrl.x, ctrl.y, x2, y2);
  else ctx.lineTo(x2, y2);
  ctx.stroke();
}

function drawDimension(ctx, x1, y1, x2, y2, op, S, bounds) {
  const ang = Math.atan2(y2 - y1, x2 - x1);
  const tick = Math.max(8, (op.w || 6) * S * 2.2);
  const nx = -Math.sin(ang), ny = Math.cos(ang);

  ctx.beginPath();
  ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
  // végjelek
  ctx.moveTo(x1 - nx * tick, y1 - ny * tick); ctx.lineTo(x1 + nx * tick, y1 + ny * tick);
  ctx.moveTo(x2 - nx * tick, y2 - ny * tick); ctx.lineTo(x2 + nx * tick, y2 + ny * tick);
  ctx.stroke();

  // nyílhegyek befelé
  const head = tick * 1.1;
  arrowTip(ctx, x1, y1, ang, head);
  arrowTip(ctx, x2, y2, ang + Math.PI, head);

  if (op.label) {
    const mx = (x1 + x2) / 2 + nx * tick * 1.8;
    const my = (y1 + y2) / 2 + ny * tick * 1.8;
    drawLabel(ctx, mx, my, op.label, Math.max(12, (op.w || 6) * S * 3.4), op.color, 'center', bounds);
  }
}

function arrowTip(ctx, x, y, ang, size) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(size, size * 0.4);
  ctx.lineTo(size, -size * 0.4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawLabel(ctx, x, y, text, size, color, align, bounds) {
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.font = `600 ${size}px system-ui, -apple-system, Segoe UI, sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';

  const tw = ctx.measureText(text).width;
  const padX = size * 0.35, padY = size * 0.28;
  const bw = tw + padX * 2, bh = size + padY * 2;
  let bx = align === 'center' ? x - bw / 2 : x - padX;
  let by = y - bh / 2;

  // a felirat maradjon a képen belül, különben exportnál levágódna
  if (bounds) {
    const m = size * 0.15;
    bx = Math.min(Math.max(bx, bounds.x + m), bounds.x + bounds.w - bw - m);
    by = Math.min(Math.max(by, bounds.y + m), bounds.y + bounds.h - bh - m);
  }

  ctx.fillStyle = 'rgba(0,0,0,0.62)';
  roundRect(ctx, bx, by, bw, bh, size * 0.25);
  ctx.fill();
  ctx.fillStyle = color === '#111111' ? '#ffffff' : color;
  ctx.fillText(text, bx + padX, by + bh / 2);
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) { ctx.roundRect(x, y, w, h, r); return; }
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* ------------------------------------------------------------- találat */

function hitTest(op, p) {
  const tol = 0.035;
  if (op.k === 'pen') return op.pts.some((q) => dist(q, p) < tol);
  if (op.k === 'text') return dist(op.p, p) < 0.08;
  if (op.k === 'rect') {
    const [x1, x2] = [Math.min(op.a[0], op.b[0]), Math.max(op.a[0], op.b[0])];
    const [y1, y2] = [Math.min(op.a[1], op.b[1]), Math.max(op.a[1], op.b[1])];
    const near = (v, a, b) => v > a - tol && v < b + tol;
    return near(p[0], x1, x2) && near(p[1], y1, y2) &&
      (Math.abs(p[0] - x1) < tol || Math.abs(p[0] - x2) < tol ||
       Math.abs(p[1] - y1) < tol || Math.abs(p[1] - y2) < tol);
  }
  if (op.k === 'dir' && op.mid) {
    // ívelt nyíl: a görbét mintavételezve mérünk, nem a húrhoz képest
    const c = [
      2 * op.mid[0] - (op.a[0] + op.b[0]) / 2,
      2 * op.mid[1] - (op.a[1] + op.b[1]) / 2,
    ];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12, u = 1 - t;
      const q = [
        u * u * op.a[0] + 2 * u * t * c[0] + t * t * op.b[0],
        u * u * op.a[1] + 2 * u * t * c[1] + t * t * op.b[1],
      ];
      if (dist(q, p) < 0.06) return true;
    }
    return false;
  }
  return segmentDistance(op.a, op.b, p) < (op.k === 'dir' ? 0.06 : tol);
}

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

function segmentDistance(a, b, p) {
  const vx = b[0] - a[0], vy = b[1] - a[1];
  const wx = p[0] - a[0], wy = p[1] - a[1];
  const len2 = vx * vx + vy * vy;
  let t = len2 ? (wx * vx + wy * vy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(a[0] + vx * t - p[0], a[1] + vy * t - p[1]);
}

const clamp01 = (n) => Math.max(0, Math.min(1, n));

function $$(sel, root) { return Array.from(root.querySelectorAll(sel)); }
