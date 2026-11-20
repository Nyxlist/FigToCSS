/**
 * Tiny persistent key/value cache on IndexedDB with an in-memory fallback
 * (private mode, blocked storage, etc.). Values are stored with a timestamp.
 */

const DB_NAME = 'figtocss';
const STORE = 'cache';
const memory = new Map();
let dbPromise = null;

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      try {
        if (typeof indexedDB === 'undefined') {
          resolve(null);
          return;
        }
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }
  return dbPromise;
}

function run(db, mode, action) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = action(tx.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Returns the cached value, or null if missing or older than maxAgeMs.
 * @returns {Promise<{ value: any, savedAt: number } | null>}
 */
export async function cacheGet(key, maxAgeMs = 0) {
  let entry = memory.get(key) || null;
  if (!entry) {
    const db = await openDb();
    if (db) {
      try {
        entry = (await run(db, 'readonly', (store) => store.get(key))) || null;
      } catch {
        entry = null;
      }
    }
  }
  if (!entry) return null;
  if (maxAgeMs > 0 && Date.now() - entry.savedAt > maxAgeMs) return null;
  return entry;
}

export async function cacheSet(key, value) {
  const entry = { value, savedAt: Date.now() };
  memory.set(key, entry);
  const db = await openDb();
  if (!db) return;
  try {
    await run(db, 'readwrite', (store) => store.put(entry, key));
  } catch {
    // Quota or serialization errors: the in-memory copy still works.
  }
}

/** Deletes every entry whose key starts with prefix. */
export async function cacheDeletePrefix(prefix) {
  [...memory.keys()].forEach((key) => {
    if (key.startsWith(prefix)) memory.delete(key);
  });
  const db = await openDb();
  if (!db) return;
  try {
    const range = IDBKeyRange.bound(prefix, `${prefix}￿`);
    await run(db, 'readwrite', (store) => store.delete(range));
  } catch {
    // Nothing else to clean up.
  }
}
