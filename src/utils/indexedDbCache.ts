import type { Product, Sale } from '../types';
import { stripBase64ImagesDeep } from '../services/storageService';

export const IDB_DATABASE_NAME = 'servimotos_cache_db_v1';
const IDB_DATABASE_VERSION = 1;
const IDB_STORE_NAME = 'collections';

/**
 * Heavy data collections stored EXCLUSIVELY in IndexedDB (never localStorage).
 */
export const IDB_CACHE_KEYS = {
  PRODUCTS: 'servimotos_products_ve_v2',
  SALES: 'servimotos_sales_ve_v2',
  SERVICE_ORDERS: 'servimotos_service_orders_ve_v2',
  ONLINE_ORDERS: 'servimotos_online_orders_ve_v2',
  PURCHASE_ORDERS: 'servimotos_purchase_orders_ve_v1',
} as const;

export const FORBIDDEN_LOCALSTORAGE_KEYS: readonly string[] = [
  IDB_CACHE_KEYS.PRODUCTS,
  IDB_CACHE_KEYS.SALES,
  IDB_CACHE_KEYS.SERVICE_ORDERS,
  IDB_CACHE_KEYS.ONLINE_ORDERS,
  IDB_CACHE_KEYS.PURCHASE_ORDERS,
];

export const FORBIDDEN_LOCALSTORAGE_KEY_SET = new Set<string>(FORBIDDEN_LOCALSTORAGE_KEYS);

let dbPromise: Promise<IDBDatabase | null> | null = null;
let inMemoryProductsCatalog: Product[] = [];

export function setInMemoryProductsCatalog(products: Product[]): void {
  inMemoryProductsCatalog = Array.isArray(products) ? products : [];
}

export function getInMemoryProductsCatalog(): Product[] {
  return inMemoryProductsCatalog;
}

export function extractInvoiceSeq(invoiceNumber?: string): number {
  const match = String(invoiceNumber || '').match(/FACT-\d+-(\d+)/);
  if (!match) return 0;
  const parsed = parseInt(match[1], 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function openCacheDb(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !('indexedDB' in window)) {
    return Promise.resolve(null);
  }
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase | null>((resolve) => {
    try {
      const request = window.indexedDB.open(IDB_DATABASE_NAME, IDB_DATABASE_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(IDB_STORE_NAME)) {
          db.createObjectStore(IDB_STORE_NAME);
        }
      };

      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {
          db.close();
          dbPromise = null;
        };
        resolve(db);
      };

      request.onerror = () => {
        dbPromise = null;
        resolve(null);
      };

      request.onblocked = () => {
        dbPromise = null;
        resolve(null);
      };
    } catch {
      dbPromise = null;
      resolve(null);
    }
  });

  return dbPromise;
}

export async function idbGet<T>(key: string): Promise<T | null> {
  const db = await openCacheDb();
  if (!db) return null;

  return new Promise<T | null>((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE_NAME, 'readonly');
      const store = tx.objectStore(IDB_STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => {
        resolve(req.result !== undefined ? (req.result as T) : null);
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function idbSet<T>(key: string, value: T): Promise<boolean> {
  const db = await openCacheDb();
  if (!db) return false;

  return new Promise<boolean>((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE_NAME, 'readwrite');
      const store = tx.objectStore(IDB_STORE_NAME);
      store.put(value, key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

export async function idbDelete(key: string): Promise<boolean> {
  const db = await openCacheDb();
  if (!db) return false;

  return new Promise<boolean>((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE_NAME, 'readwrite');
      const store = tx.objectStore(IDB_STORE_NAME);
      store.delete(key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

export async function idbClear(): Promise<boolean> {
  const db = await openCacheDb();
  if (!db) return false;

  return new Promise<boolean>((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE_NAME, 'readwrite');
      const store = tx.objectStore(IDB_STORE_NAME);
      store.clear();
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

export async function idbGetMany(keys: readonly string[]): Promise<Record<string, unknown>> {
  const entries = await Promise.all(
    keys.map(async (k) => [k, await idbGet<unknown>(k)] as const)
  );
  const result: Record<string, unknown> = {};
  for (const [k, v] of entries) {
    if (v !== null && v !== undefined) {
      result[k] = v;
    }
  }
  return result;
}

/**
 * Upserts a single sale inside IndexedDB without loading or overwriting the full sales history in React memory.
 */
export async function idbAppendSale(sale: Sale): Promise<boolean> {
  try {
    const existing = await idbGet<Sale[]>(IDB_CACHE_KEYS.SALES);
    const list = Array.isArray(existing) ? existing : [];
    const filtered = list.filter((s) => s && s.id !== sale.id);
    const next = [sale, ...filtered].sort((a, b) =>
      String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
    );
    return await idbSet(IDB_CACHE_KEYS.SALES, next);
  } catch {
    return false;
  }
}

/**
 * Computes only the max FACT-YYYY-NNNN invoice sequence from IndexedDB without retaining the list in React memory.
 */
export async function idbGetLatestInvoiceSeq(): Promise<number> {
  try {
    const existing = await idbGet<Sale[]>(IDB_CACHE_KEYS.SALES);
    if (!Array.isArray(existing) || existing.length === 0) return 100;
    let maxSeq = 100;
    for (let i = 0; i < existing.length; i++) {
      const seq = extractInvoiceSeq(existing[i]?.invoiceNumber);
      if (seq > maxSeq) maxSeq = seq;
    }
    return maxSeq;
  } catch {
    return 100;
  }
}

/**
 * Returns ONLY the latest `maxCount` matching sales from IndexedDB on demand.
 */
export async function idbGetRecentSales(
  maxCount = 15,
  searchTerm = '',
  deletedIds?: Set<string>
): Promise<{ sales: Sale[]; totalCount: number; latestInvoiceSeq: number }> {
  try {
    const existing = await idbGet<Sale[]>(IDB_CACHE_KEYS.SALES);
    if (!Array.isArray(existing) || existing.length === 0) {
      return { sales: [], totalCount: 0, latestInvoiceSeq: 100 };
    }
    let maxSeq = 100;
    const clean = existing
      .filter((s) => {
        if (!s || typeof s !== 'object' || typeof s.id !== 'string') return false;
        if (deletedIds && deletedIds.has(s.id)) return false;
        const seq = extractInvoiceSeq(s.invoiceNumber);
        if (seq > maxSeq) maxSeq = seq;
        return true;
      })
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

    const term = searchTerm.trim().toLowerCase();
    const matched = term
      ? clean.filter((s) => {
          return (
            String(s.invoiceNumber || '').toLowerCase().includes(term) ||
            String(s.customerName || '').toLowerCase().includes(term) ||
            String(s.customerDocument || '').toLowerCase().includes(term) ||
            String(s.customerPhone || '').toLowerCase().includes(term)
          );
        })
      : clean;

    return {
      sales: matched.slice(0, Math.max(1, maxCount)),
      totalCount: matched.length,
      latestInvoiceSeq: maxSeq,
    };
  } catch {
    return { sales: [], totalCount: 0, latestInvoiceSeq: 100 };
  }
}

/**
 * Permanently removes products, sales, orders, and any base64 image payloads from localStorage.
 */
export function purgeForbiddenLocalStorageKeys(): void {
  if (typeof window === 'undefined') return;
  try {
    const storage = window.localStorage;
    if (!storage) return;
    for (const key of FORBIDDEN_LOCALSTORAGE_KEYS) {
      try {
        storage.removeItem(key);
      } catch {
        // ignore
      }
    }
    // Strip any base64 images from cart if present from older versions
    const rawCart = storage.getItem('servimotos_cart_ve_v2');
    if (rawCart && rawCart.includes('data:image/')) {
      try {
        const cleaned = stripBase64ImagesDeep(JSON.parse(rawCart));
        storage.setItem('servimotos_cart_ve_v2', JSON.stringify(cleaned));
      } catch {
        storage.removeItem('servimotos_cart_ve_v2');
      }
    }
  } catch {
    // ignore
  }
}

/**
 * One-time seamless migration from legacy localStorage keys into IndexedDB,
 * followed by immediate permanent deletion from localStorage.
 */
let migrationPromise: Promise<void> | null = null;
export function migrateLegacyLocalStorageToIdb(): Promise<void> {
  if (migrationPromise) return migrationPromise;

  migrationPromise = (async () => {
    if (typeof window === 'undefined') return;
    try {
      const storage = window.localStorage;
      if (!storage) return;

      for (const key of FORBIDDEN_LOCALSTORAGE_KEYS) {
        try {
          const raw = storage.getItem(key);
          if (raw) {
            const existingInIdb = await idbGet<unknown>(key);
            if (existingInIdb === null) {
              try {
                const parsed = JSON.parse(raw);
                const sanitized = stripBase64ImagesDeep(parsed);
                await idbSet(key, sanitized);
              } catch {
                // Corrupt legacy entry: discard
              }
            }
            storage.removeItem(key);
          }
        } catch {
          try {
            storage.removeItem(key);
          } catch {
            // ignore
          }
        }
      }
    } finally {
      purgeForbiddenLocalStorageKeys();
    }
  })();

  return migrationPromise;
}
