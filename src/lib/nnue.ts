// NNUE 넷 로컬 보관 (사용자 업로드 방식 — 기획서 §3.5, 재배포 없음)
// 사용자가 공식 페이지에서 받은 .nnue 파일을 업로드하면 IndexedDB에 저장해
// 재방문 시 다시 업로드하지 않아도 되게 한다. (10.7MB — localStorage 불가)

const DB_NAME = 'kc-nnue';
const STORE = 'files';
const KEY = 'net';

export interface StoredNnue {
  name: string;
  bytes: ArrayBuffer;
}

/** 파일명 검증 — 엔진이 파일명 접두사로 variant를 인식하므로 janggi* 필수. */
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
    /* 무시 */
  }
}
