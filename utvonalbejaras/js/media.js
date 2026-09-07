// Kép- és hangkezelés: átméretezés, bélyegkép, hangrögzítés

/** Kép betöltése blobból (bitmap, ha lehet — gyorsabb és memóriakímélőbb). */
export async function loadImage(blob) {
  if (window.createImageBitmap) {
    try {
      return await createImageBitmap(blob);
    } catch (_) { /* fallback lejjebb */ }
  }
  const url = URL.createObjectURL(blob);
  try {
    return await new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = () => rej(new Error('A kép nem olvasható.'));
      img.src = url;
    });
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

function canvasToBlob(canvas, type = 'image/jpeg', quality = 0.85) {
  return new Promise((res) => canvas.toBlob((b) => res(b), type, quality));
}

/** Nagy kamerafotó zsugorítása, hogy a tárhely és a rajzolás gyors maradjon. */
export async function shrinkImage(blob, maxSide = 2000, quality = 0.86) {
  const img = await loadImage(blob);
  const w = img.width, h = img.height;
  const scale = Math.min(1, maxSide / Math.max(w, h));
  if (scale === 1 && blob.size < 3_000_000) return { blob, width: w, height: h };
  const cw = Math.round(w * scale), ch = Math.round(h * scale);
  const canvas = document.createElement('canvas');
  canvas.width = cw; canvas.height = ch;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, cw, ch);
  if (img.close) img.close();
  const out = await canvasToBlob(canvas, 'image/jpeg', quality);
  return { blob: out || blob, width: cw, height: ch };
}

/** Bélyegkép a listákhoz. */
export async function makeThumb(blob, maxSide = 360) {
  const img = await loadImage(blob);
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  const cw = Math.max(1, Math.round(img.width * scale));
  const ch = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = cw; canvas.height = ch;
  canvas.getContext('2d').drawImage(img, 0, 0, cw, ch);
  if (img.close) img.close();
  return (await canvasToBlob(canvas, 'image/jpeg', 0.72)) || blob;
}

export { canvasToBlob };

/* ------------------------------------------------------------- EXIF

Egy korábban készült, galériából behozott képnél a telefon aktuális helye
félrevezető lenne. A JPEG EXIF-fejlécéből kiolvasható a felvétel helye és
ideje — ha van benne, azt használjuk, és jelezzük, hogy onnan származik. */

/** @returns {Promise<{lat?:number, lon?:number, takenAt?:number}|null>} */
export async function readExif(file) {
  try {
    // az EXIF a fájl elején van; néhány száz kB bőven elég hozzá
    const head = await file.slice(0, 256 * 1024).arrayBuffer();
    const view = new DataView(head);
    if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return null; // nem JPEG

    let offset = 2;
    while (offset + 4 < view.byteLength) {
      if (view.getUint8(offset) !== 0xff) break;
      const marker = view.getUint8(offset + 1);
      const size = view.getUint16(offset + 2);
      if (marker === 0xe1) {
        const start = offset + 4;
        // "Exif\0\0"
        if (view.getUint32(start) !== 0x45786966) return null;
        return parseTiff(view, start + 6);
      }
      if (marker === 0xda) break; // képadat kezdete
      offset += 2 + size;
    }
  } catch (_) { /* sérült vagy szokatlan fejléc: nincs adat */ }
  return null;
}

function parseTiff(view, tiff) {
  if (tiff + 8 > view.byteLength) return null;
  const le = view.getUint16(tiff) === 0x4949;
  const u16 = (o) => view.getUint16(o, le);
  const u32 = (o) => view.getUint32(o, le);
  if (u16(tiff + 2) !== 0x002a) return null;

  const out = {};
  let gpsIfd = 0, exifIfd = 0;

  const readEntries = (dirOffset, handler) => {
    if (dirOffset + 2 > view.byteLength) return;
    const count = u16(dirOffset);
    for (let i = 0; i < count; i++) {
      const e = dirOffset + 2 + i * 12;
      if (e + 12 > view.byteLength) return;
      handler(u16(e), u16(e + 2), u32(e + 4), e + 8);
    }
  };

  const ratio = (o) => {
    const num = u32(o), den = u32(o + 4);
    return den ? num / den : 0;
  };
  const dms = (valueOffset) =>
    ratio(valueOffset) + ratio(valueOffset + 8) / 60 + ratio(valueOffset + 16) / 3600;

  const ascii = (count, valueOffset) => {
    let s = '';
    for (let i = 0; i < count - 1; i++) s += String.fromCharCode(view.getUint8(valueOffset + i));
    return s;
  };

  readEntries(tiff + u32(tiff + 4), (tag, _type, _count, valOff) => {
    if (tag === 0x8825) gpsIfd = tiff + u32(valOff);
    if (tag === 0x8769) exifIfd = tiff + u32(valOff);
  });

  if (gpsIfd) {
    let lat = null, lon = null, latRef = 'N', lonRef = 'E';
    readEntries(gpsIfd, (tag, type, count, valOff) => {
      const dataOff = type === 5 || count > 4 ? tiff + u32(valOff) : valOff;
      if (tag === 0x0001) latRef = String.fromCharCode(view.getUint8(valOff));
      if (tag === 0x0003) lonRef = String.fromCharCode(view.getUint8(valOff));
      if (tag === 0x0002) lat = dms(dataOff);
      if (tag === 0x0004) lon = dms(dataOff);
    });
    if (lat != null && lon != null && isFinite(lat) && isFinite(lon) && (lat || lon)) {
      out.lat = latRef === 'S' ? -lat : lat;
      out.lon = lonRef === 'W' ? -lon : lon;
    }
  }

  if (exifIfd) {
    readEntries(exifIfd, (tag, type, count, valOff) => {
      if (tag !== 0x9003 || type !== 2 || count < 19) return; // DateTimeOriginal
      const dataOff = count > 4 ? tiff + u32(valOff) : valOff;
      const s = ascii(count, dataOff); // "YYYY:MM:DD HH:MM:SS"
      const m = s.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
      if (m) {
        const t = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime();
        if (isFinite(t)) out.takenAt = t;
      }
    });
  }

  return Object.keys(out).length ? out : null;
}

/* ----------------------------------------------------------- hangjegyzet */

function pickAudioType() {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ];
  if (!window.MediaRecorder) return '';
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(c)) return c;
  }
  return '';
}

export class AudioRecorder {
  constructor({ onTick, onLevel } = {}) {
    this.onTick = onTick || (() => {});
    this.onLevel = onLevel || (() => {});
    this.recorder = null;
    this.stream = null;
    this.chunks = [];
    this.startedAt = 0;
    this.timer = null;
    this.audioCtx = null;
    this.raf = null;
  }

  get recording() {
    return !!this.recorder && this.recorder.state === 'recording';
  }

  static get supported() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
  }

  async start() {
    if (!AudioRecorder.supported) throw new Error('A böngésző nem támogatja a hangrögzítést.');
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    });
    const mimeType = pickAudioType();
    this.recorder = new MediaRecorder(this.stream, mimeType ? { mimeType } : undefined);
    this.chunks = [];
    this.recorder.ondataavailable = (e) => { if (e.data && e.data.size) this.chunks.push(e.data); };
    this.recorder.start(250);
    this.startedAt = Date.now();
    this.timer = setInterval(() => this.onTick(Date.now() - this.startedAt), 200);
    this._meter();
    return true;
  }

  _meter() {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      this.audioCtx = new Ctx();
      const src = this.audioCtx.createMediaStreamSource(this.stream);
      const analyser = this.audioCtx.createAnalyser();
      analyser.fftSize = 512;
      src.connect(analyser);
      const buf = new Uint8Array(analyser.frequencyBinCount);
      const loop = () => {
        analyser.getByteTimeDomainData(buf);
        let peak = 0;
        for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i] - 128));
        this.onLevel(Math.min(1, peak / 90));
        this.raf = requestAnimationFrame(loop);
      };
      loop();
    } catch (_) { /* a szintmérő nem kritikus */ }
  }

  async stop() {
    if (!this.recorder) return null;
    const rec = this.recorder;
    const duration = Date.now() - this.startedAt;
    const blob = await new Promise((resolve) => {
      rec.onstop = () => resolve(new Blob(this.chunks, { type: rec.mimeType || 'audio/webm' }));
      if (rec.state !== 'inactive') rec.stop();
      else resolve(new Blob(this.chunks, { type: rec.mimeType || 'audio/webm' }));
    });
    this._cleanup();
    return { blob, duration };
  }

  cancel() {
    try { if (this.recorder && this.recorder.state !== 'inactive') this.recorder.stop(); } catch (_) {}
    this._cleanup();
  }

  _cleanup() {
    clearInterval(this.timer);
    cancelAnimationFrame(this.raf);
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
    if (this.audioCtx) { try { this.audioCtx.close(); } catch (_) {} }
    this.recorder = null;
    this.stream = null;
    this.audioCtx = null;
  }
}
