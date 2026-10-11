// Élő kísérés: a kész bejárás használata a valódi szállítás közben.
//
// A kísérőautó/vezető elindítja, az app figyeli a pozíciót, és ahogy
// közeledünk egy korábban rögzített helyhez, előhozza, amit ott találtunk:
// lejátssza a hangjegyzetet, megmutatja a fotót és a videót. Menet közben
// új észrevétel is rögzíthető — ha például egy tábla azóta megsérült.
//
// Minden a készüléken marad, és offline is működik: az adat már letöltve
// van, a térképcsempék pedig a bejáráskor gyorsítótárba kerültek.

import {
  haversine, renderTrack, formatDistance, formatDuration, formatHeading,
  typeLabel, categoryLabel, severityLabel, isRejected,
} from './geo.js';
import { onTileLoad } from './tiles.js';
import { MapView } from './terkepnezet.js';
import { $, el, toast, modal, formatTime } from './ui.js';

/** Ennyire megközelítve szól (méter). */
const RADII = [150, 300, 500];
const OFF_ROUTE_METERS = 200;   // ennél messzebb már letértünk az útvonalról

export class EscortMode {
  constructor(root) {
    this.root = root;
    this.canvas = $('#escort-canvas', root);
    this.items = [];
    this.points = [];
    this.here = null;
    this.watchId = null;
    this.triggered = new Set();
    this.radius = 300;
    this.onlyCritical = false;
    this.sound = true;
    this.alertItem = null;
    this.urls = new Set();
    this.offRoute = false;
    this.follow = true;           // a térkép a saját pozíciót kövesse
    this.mapView = new MapView(this.canvas, {
      draw: () => this.draw(),
      onTap: (p) => this.tapMap(p),
      // ha a vezető maga húzza vagy csippenti a térképet, hagyjuk nála a
      // vezérlést — a 📍 gombbal kérheti vissza a követést
      onPan: () => this.setFollow(false),
    });
    this._bind();
  }

  /* ----------------------------------------------------------- életciklus */

  async open({ session, points, items, capture, onClose }) {
    this.session = session;
    this.points = points;
    this.items = items;           // ugyanaz a tömb, amit az app használ
    this.capture = capture || {};
    this.onClose = onClose;
    this.triggered = new Set();
    this.here = null;
    this.alertItem = null;
    this.startedAt = Date.now();
    this.mapView.reset();
    this.setFollow(true);

    try {
      this.radius = Number(localStorage.getItem('escortRadius')) || 300;
      this.onlyCritical = localStorage.getItem('escortCritical') === '1';
      this.sound = localStorage.getItem('escortSound') !== '0';
    } catch (_) { /* alapértékekkel megyünk */ }

    this.root.hidden = false;
    document.body.classList.add('modal-open');
    this._syncSettings();
    this._unlockSound();
    onTileLoad(() => { if (!this.root.hidden) this.draw(); });

    this.start();
    this.refresh();
    requestAnimationFrame(() => this.draw());
  }

  close() {
    this.stop();
    onTileLoad(null);
    this.releaseUrls();
    this.root.hidden = true;
    document.body.classList.remove('modal-open');
    if (this.onClose) this.onClose();
  }

  start() {
    if (!navigator.geolocation) {
      toast('A böngésző nem támogatja a helymeghatározást.', 'error');
      return;
    }
    if (this.watchId != null) return;
    this.watchId = navigator.geolocation.watchPosition(
      (pos) => this.onPosition(pos),
      (err) => {
        $('#escort-gps', this.root).textContent =
          err.code === 1 ? 'Nincs helymeghatározási engedély' : 'Nincs GPS-jel';
      },
      // maximumAge: 0 — a böngésző gyorsítótárában ott lehet az a fix, ahol
      // néhány perccel korábban álltunk (pl. ahol az utolsó pontot rögzítettük).
      // Azzal a kísérés rögtön „0 m”-rel riasztana egy olyan helyre, amit már
      // elhagytunk, ezért mindig friss mérést kérünk.
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
    );
    this.keepAwake(true);
  }

  stop() {
    if (this.watchId != null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
    this.keepAwake(false);
    if (this.player) { this.player.pause(); this.player = null; }
  }

  async keepAwake(on) {
    try {
      if (on && 'wakeLock' in navigator) this.wakeLock = await navigator.wakeLock.request('screen');
      else if (!on && this.wakeLock) { await this.wakeLock.release(); this.wakeLock = null; }
    } catch (_) { /* nem kritikus */ }
  }

  /* ---------------------------------------------------------- vezérlés */

  _bind() {
    $('#escort-close', this.root).addEventListener('click', () => this.close());
    $('#escort-alert-close', this.root).addEventListener('click', () => this.dismissAlert());

    $('#escort-zoom-in', this.root).addEventListener('click', () => this.mapView.zoomBy(1.6));
    $('#escort-zoom-out', this.root).addEventListener('click', () => this.mapView.zoomBy(1 / 1.6));
    $('#escort-follow', this.root).addEventListener('click', () => {
      this.setFollow(!this.follow);
      // követéskor legyen látható környezet is: ha teljesen ki van zoomolva,
      // közelítsünk rá a saját pozícióra
      if (this.follow && this.mapView.view.k < 1.2) this.mapView.zoomBy(4);
      else this.draw();
    });
    $('#escort-fit', this.root).addEventListener('click', () => {
      this.setFollow(false);
      this.mapView.reset();
    });

    $('#escort-radius', this.root).addEventListener('change', (e) => {
      this.radius = Number(e.target.value);
      try { localStorage.setItem('escortRadius', String(this.radius)); } catch (_) {}
      this.refresh();
    });
    $('#escort-critical', this.root).addEventListener('change', (e) => {
      this.onlyCritical = e.target.checked;
      try { localStorage.setItem('escortCritical', this.onlyCritical ? '1' : '0'); } catch (_) {}
      this.refresh();
    });
    $('#escort-sound', this.root).addEventListener('change', (e) => {
      this.sound = e.target.checked;
      try { localStorage.setItem('escortSound', this.sound ? '1' : '0'); } catch (_) {}
    });

    for (const [id, kind] of [
      ['#escort-add-photo', 'photo'], ['#escort-add-video', 'video'],
      ['#escort-add-audio', 'audio'], ['#escort-add-condition', 'condition'],
    ]) {
      $(id, this.root).addEventListener('click', () => {
        if (this.capture[kind]) this.capture[kind]();
      });
    }
  }

  _syncSettings() {
    $('#escort-radius', this.root).value = String(this.radius);
    $('#escort-critical', this.root).checked = this.onlyCritical;
    $('#escort-sound', this.root).checked = this.sound;
  }

  /** A böngésző csak felhasználói koppintás után enged hangot indítani. */
  _unlockSound() {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) {
        this.audioCtx = this.audioCtx || new Ctx();
        if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
      }
    } catch (_) {}
    try {
      const a = new Audio();
      a.muted = true;
      const p = a.play();
      if (p && p.catch) p.catch(() => {});
    } catch (_) {}
  }

  beep() {
    if (!this.sound || !this.audioCtx) return;
    try {
      const ctx = this.audioCtx;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.45);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.5);
    } catch (_) {}
  }

  /* -------------------------------------------------------- pozíció */

  onPosition(pos) {
    const c = pos.coords;
    this.here = {
      lat: c.latitude,
      lon: c.longitude,
      acc: c.accuracy == null ? null : Math.round(c.accuracy),
      heading: c.heading,
      speed: c.speed,
      t: pos.timestamp || Date.now(),
    };
    $('#escort-gps', this.root).textContent =
      `GPS ±${this.here.acc ?? '?'} m` + (c.speed != null ? ` · ${Math.round(c.speed * 3.6)} km/h` : '');

    this.checkOffRoute();
    this.refresh();
    this.draw();
  }

  /** Figyelmeztetés, ha letértünk a jóváhagyott útvonalról. */
  checkOffRoute() {
    const valid = this.points.filter((p) => !isRejected(p) && p.lat != null);
    if (!valid.length || !this.here) return;
    let min = Infinity;
    for (const p of valid) {
      const d = haversine(this.here, p);
      if (d < min) min = d;
    }
    const off = min > OFF_ROUTE_METERS;
    const box = $('#escort-offroute', this.root);
    box.hidden = !off;
    if (off) box.textContent = `⚠️ Letértünk az útvonalról — ${formatDistance(min)} a bejárt nyomvonaltól`;
    if (off && !this.offRoute) this.beep();
    this.offRoute = off;
  }

  /* ----------------------------------------------------- közelség */

  relevant() {
    return this.items.filter((i) => {
      if (i.lat == null) return false;
      if (!this.onlyCritical) return true;
      if (i.type === 'condition') return i.severity && i.severity !== 'megfelelo';
      return (i.dims || []).length > 0;
    });
  }

  refresh() {
    const list = $('#escort-next', this.root);
    list.innerHTML = '';

    const items = this.relevant();

    // amit most, a kísérés alatt rögzítettünk, arra ne riasszon: a vezető
    // épp az imént dokumentálta, fölösleges visszaszólni neki
    for (const i of items) {
      if (i.created >= this.startedAt) this.triggered.add(i.id);
    }
    $('#escort-count', this.root).textContent =
      `${items.length} figyelt pont · ${this.triggered.size} érintve`;

    if (!this.here) {
      list.appendChild(el('p', { class: 'hint', text: 'Helymeghatározás indul…' }));
      return;
    }

    const withDist = items
      .map((i) => ({ item: i, d: haversine(this.here, i) }))
      .sort((a, b) => a.d - b.d);

    // a nyitva lévő riasztás távolsága kövesse a mozgást
    if (this.alertItem) {
      const open = withDist.find((x) => x.item.id === this.alertItem.id);
      if (open) this.setAlertDistance(open.d);
    }

    for (const { item, d } of withDist.slice(0, 4)) {
      const done = this.triggered.has(item.id);
      list.appendChild(el('button', {
        class: 'escort-row' + (d <= this.radius ? ' near' : '') + (done ? ' done' : ''),
        type: 'button',
        onclick: () => this.showAlert(item, d, true),
      }, [
        el('span', { class: 'escort-dist', text: formatDistance(d) }),
        el('span', { class: 'escort-body' }, [
          el('span', { class: 'escort-title', text: item.title || typeLabel(item.type) }),
          el('span', { class: 'escort-sub', text: this.describe(item) }),
        ]),
        item.audio ? el('span', { class: 'escort-icon', text: '🎙️' }) : null,
        item.video ? el('span', { class: 'escort-icon', text: '🎬' }) : null,
      ]));
    }

    const next = withDist[0];
    $('#escort-headline', this.root).textContent = next
      ? `${formatDistance(next.d)} — ${next.item.title || typeLabel(next.item.type)}`
      : 'Nincs figyelt pont a közelben';

    // Riasztás a legközelebbire, ha hatótávon belül van és még nem szólt.
    // Ez a lista felépítése UTÁN jön: a showAlert újra frissít, és ha ezt
    // menet közben tennénk, a lista sorai megkettőződnének.
    const hit = withDist.find((x) => x.d <= this.radius && !this.triggered.has(x.item.id));
    if (hit && !this.alertItem) this.showAlert(hit.item, hit.d);
  }

  describe(item) {
    const bits = [];
    if (item.type === 'condition') {
      bits.push(categoryLabel(item.category));
      if (item.severity) bits.push(severityLabel(item.severity));
    } else {
      bits.push(typeLabel(item.type));
    }
    if ((item.dims || []).length) bits.push(item.dims.join(' · '));
    if (item.phase === 'transport') bits.push('szállítás közben rögzítve');
    return bits.join(' · ');
  }

  /* ------------------------------------------------------- riasztás */

  objectUrl(blob) {
    const u = URL.createObjectURL(blob);
    this.urls.add(u);
    return u;
  }

  releaseUrls() {
    for (const u of this.urls) URL.revokeObjectURL(u);
    this.urls.clear();
  }

  setAlertDistance(distance) {
    if (!this.alertItem) return;
    const near = distance == null ? '' : (this.alertManual ? '' : '⚠️ ') + formatDistance(distance) + ' · ';
    $('#escort-alert-dist', this.root).textContent = near + this.describe(this.alertItem);
  }

  showAlert(item, distance, manual = false) {
    this.alertItem = item;
    this.alertManual = manual;
    this.triggered.add(item.id);

    const card = $('#escort-alert', this.root);
    const body = $('#escort-alert-body', this.root);
    body.innerHTML = '';

    $('#escort-alert-title', this.root).textContent = item.title || typeLabel(item.type);
    this.setAlertDistance(distance);

    const picture = item.flat || item.photo;
    if (picture) body.appendChild(el('img', { class: 'escort-shot', src: this.objectUrl(picture), alt: '' }));
    if (item.video) {
      body.appendChild(el('video', {
        class: 'escort-shot', controls: true, playsinline: true,
        poster: item.thumb ? this.objectUrl(item.thumb) : null,
        src: this.objectUrl(item.video),
      }));
    }
    if (item.note) body.appendChild(el('p', { class: 'escort-note', text: item.note }));
    if ((item.dims || []).length) {
      body.appendChild(el('p', { class: 'escort-dims', text: '↔ ' + item.dims.join(' · ') }));
    }
    if (item.heading != null) {
      body.appendChild(el('p', { class: 'escort-sub', text: '🧭 kameairány: ' + formatHeading(item.heading) }));
    }

    if (item.audio) {
      const player = el('audio', { class: 'escort-audio', controls: true, src: this.objectUrl(item.audio) });
      body.appendChild(player);
      // a hangjegyzet magától induljon: ezért kellett a koppintásos feloldás
      if (this.sound) {
        const p = player.play();
        if (p && p.catch) p.catch(() => toast('A hangjegyzet lejátszásához koppintson a ▶ gombra.'));
      }
      this.player = player;
    }

    card.hidden = false;
    if (!manual) {
      this.beep();
      if (navigator.vibrate) { try { navigator.vibrate([180, 90, 180]); } catch (_) {} }
    }
    this.refresh();
  }

  dismissAlert() {
    if (this.player) { this.player.pause(); this.player = null; }
    this.alertItem = null;
    $('#escort-alert', this.root).hidden = true;
  }

  /* --------------------------------------------------------- kirajz */

  /** Követés be/ki — a gomb jelzi, mi van érvényben. */
  setFollow(on) {
    this.follow = on;
    const b = $('#escort-follow', this.root);
    if (b) b.classList.toggle('active', on);
  }

  /** Koppintás a térképre: ha jelölést talált, hozza elő, amit ott rögzítettünk. */
  tapMap(p) {
    if (!this.hit || !this.hit.hitboxes) return false;
    const box = this.hit.hitboxes.find((b) => Math.hypot(b.x - p.x, b.y - p.y) < b.r);
    if (!box) return false;
    const item = this.items.find((i) => i.id === box.id);
    if (!item) return false;
    this.showAlert(item, this.here ? haversine(this.here, item) : null, true);
    return true;
  }

  draw() {
    if (this.root.hidden || !this.canvas.clientWidth) return;
    const opts = {
      drawn: (this.session && this.session.drawn) || [],
      here: this.here,
      view: this.mapView.view,
      lineWidth: 4,
    };
    this.hit = renderTrack(this.canvas, this.points, this.relevant(), opts);

    // követés: a saját pozíció kerüljön a vászon közepére. A nézet eltolása
    // után újra kell rajzolni — így nagyításban is mindig magunkat látjuk.
    if (this.follow && this.here && this.hit.project) {
      const r = this.canvas.getBoundingClientRect();
      const p = this.hit.project(this.here.lat, this.here.lon);
      const dx = r.width / 2 - p.x, dy = r.height / 2 - p.y;
      if (Math.hypot(dx, dy) > 1.5) {
        this.mapView.panBy(dx, dy);
        this.hit = renderTrack(this.canvas, this.points, this.relevant(), opts);
      }
    }
  }
}
