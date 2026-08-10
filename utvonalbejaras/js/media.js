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
