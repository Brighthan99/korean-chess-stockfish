// Local NNUE net storage (user-upload approach — plan §3.5, no redistribution)
// When the user uploads a .nnue file downloaded from the official page, it is stored
// in IndexedDB so it need not be re-uploaded on revisits. (10.7MB — too big for localStorage)

const DB_NAME = 'kc-nnue';
const STORE = 'files';
const KEY = 'net';

export interface StoredNnue {
  name: string;
  bytes: ArrayBuffer;
}

/** Validate the filename — the engine detects the variant from the filename prefix, so janggi* is required. */
export function isValidNnueFile(name: string, size: number): boolean {
  return /^janggi.*\.nnue$/i.test(name) && size > 1_000_000 && size < 100_000_000;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('indexedDB open failed'));
  });
}

function tx<T>(db: IDBDatabase, mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = run(t.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('indexedDB request failed'));
  });
}

export async function saveNnue(name: string, bytes: ArrayBuffer): Promise<void> {
  const db = await openDb();
  try {
    await tx(db, 'readwrite', s => s.put({ name, bytes } satisfies StoredNnue, KEY));
  } finally {
    db.close();
  }
}

export async function loadNnue(): Promise<StoredNnue | null> {
  try {
    const db = await openDb();
    try {
      const rec = (await tx(db, 'readonly', s => s.get(KEY))) as StoredNnue | undefined;
      return rec && rec.name && rec.bytes ? rec : null;
    } finally {
      db.close();
    }
  } catch {
    return null;
  }
}

export async function deleteNnue(): Promise<void> {
  try {
    const db = await openDb();
    try {
      await tx(db, 'readwrite', s => s.delete(KEY));
    } finally {
      db.close();
    }
  } catch {
    /* ignore */
  }
}
