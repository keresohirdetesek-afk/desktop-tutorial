// IndexedDB réteg — bejárások, nyomvonalpontok, elemek (fotó / hang / jegyzet)

const DB_NAME = 'utvonalbejaras';
const DB_VER = 1;

let dbPromise = null;

export function uid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = () => {
      const db = req.result;

      if (!db.objectStoreNames.contains('sessions')) {
        const s = db.createObjectStore('sessions', { keyPath: 'id' });
        s.createIndex('created', 'created');
      }
      if (!db.objectStoreNames.contains('points')) {
        const p = db.createObjectStore('points', { keyPath: 'id', autoIncrement: true });
        p.createIndex('sessionId', 'sessionId');
        p.createIndex('sessionTime', ['sessionId', 't']);
      }
      if (!db.objectStoreNames.contains('items')) {
        const i = db.createObjectStore('items', { keyPath: 'id' });
        i.createIndex('sessionId', 'sessionId');
        i.createIndex('sessionCreated', ['sessionId', 'created']);
        i.createIndex('type', 'type');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function tx(stores, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(stores, mode);
    let out;
    t.oncomplete = () => resolve(out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
    const names = Array.isArray(stores) ? stores : [stores];
    const handles = names.map((n) => t.objectStore(n));
    Promise.resolve(fn(...handles))
      .then((r) => { out = r; })
      .catch((e) => { try { t.abort(); } catch (_) {} reject(e); });
  });
}

const wrap = (req) => new Promise((res, rej) => {
  req.onsuccess = () => res(req.result);
  req.onerror = () => rej(req.error);
});

/* ---------------------------------------------------------- bejárások */

export async function createSession(data = {}) {
  const now = Date.now();
  const session = {
    id: uid(),
    name: data.name || 'Névtelen bejárás',
    created: now,
    updated: now,
    note: data.note || '',
    // túlméretes szerelvény adatai
    vehicle: Object.assign(
      { plate: '', length: '', width: '', height: '', weight: '', axleLoad: '' },
      data.vehicle || {}
    ),
    // összegzett nyomvonal-statisztika (a felvétel alatt frissül)
    stats: { distance: 0, points: 0, startedAt: null, endedAt: null },
  };
  await tx('sessions', 'readwrite', (s) => wrap(s.put(session)));
  return session;
}

export async function saveSession(session) {
  session.updated = Date.now();
  await tx('sessions', 'readwrite', (s) => wrap(s.put(session)));
  return session;
}

export async function getSession(id) {
  return tx('sessions', 'readonly', (s) => wrap(s.get(id)));
}

export async function listSessions() {
  const all = await tx('sessions', 'readonly', (s) => wrap(s.getAll()));
  return all.sort((a, b) => b.created - a.created);
}

export async function deleteSession(id) {
  await tx(['sessions', 'points', 'items'], 'readwrite', async (sessions, points, items) => {
    await wrap(sessions.delete(id));
    const pKeys = await wrap(points.index('sessionId').getAllKeys(IDBKeyRange.only(id)));
    for (const k of pKeys) points.delete(k);
    const iKeys = await wrap(items.index('sessionId').getAllKeys(IDBKeyRange.only(id)));
    for (const k of iKeys) items.delete(k);
  });
}

/* ------------------------------------------------------ nyomvonalpont */

export async function addPoint(point) {
  return tx('points', 'readwrite', (p) => wrap(p.add(point)));
}

export async function addPoints(list) {
  if (!list.length) return;
  return tx('points', 'readwrite', (p) => {
    for (const pt of list) p.add(pt);
  });
}

/** Meglévő pontok módosítása (pl. szakasz elvetése). */
export async function updatePoints(list) {
  if (!list.length) return;
  return tx('points', 'readwrite', (p) => {
    for (const pt of list) p.put(pt);
  });
}

/** Pontok végleges törlése. */
export async function deletePoints(ids) {
  if (!ids.length) return;
  return tx('points', 'readwrite', (p) => {
    for (const id of ids) p.delete(id);
  });
}

export async function getPoints(sessionId) {
  const pts = await tx('points', 'readonly', (p) =>
    wrap(p.index('sessionId').getAll(IDBKeyRange.only(sessionId)))
  );
  return pts.sort((a, b) => a.t - b.t);
}

/* -------------------------------------------------------------- elemek */

export async function saveItem(item) {
  item.updated = Date.now();
  await tx('items', 'readwrite', (s) => wrap(s.put(item)));
  return item;
}

export async function getItem(id) {
  return tx('items', 'readonly', (s) => wrap(s.get(id)));
}

export async function getItems(sessionId) {
  const list = await tx('items', 'readonly', (s) =>
    wrap(s.index('sessionId').getAll(IDBKeyRange.only(sessionId)))
  );
  return list.sort((a, b) => a.created - b.created);
}

export async function allItems() {
  return tx('items', 'readonly', (s) => wrap(s.getAll()));
}

export async function deleteItem(id) {
  await tx('items', 'readwrite', (s) => wrap(s.delete(id)));
}

/* ------------------------------------------------------------ statisztika */

export async function storageEstimate() {
  if (!navigator.storage || !navigator.storage.estimate) return null;
  try {
    return await navigator.storage.estimate();
  } catch (_) {
    return null;
  }
}
