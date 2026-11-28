import {
  FORBIDDEN_LOCALSTORAGE_KEYS,
  FORBIDDEN_LOCALSTORAGE_KEY_SET,
  purgeForbiddenLocalStorageKeys,
  idbClear,
} from './indexedDbCache';
import { stripBase64ImagesDeep } from '../services/storageService';

/**
 * Strips any inline base64 data:image/* URLs before writing to localStorage so
 * images are NEVER stored in localStorage under any key.
 */
export function stripHeavyBase64ForCache<T>(input: T): T {
  return stripBase64ImagesDeep(input);
}

/**
 * Removes forbidden heavy collections (products, sales, orders) from localStorage.
 */
export function compactHeavyLocalStorageKeys(): void {
  purgeForbiddenLocalStorageKeys();
}

/**
 * Safely writes lightweight settings/session data to localStorage without ever throwing QuotaExceededError.
 * - Strictly BLOCKS writing products, sales, or orders into localStorage (those live in IndexedDB).
 * - Strictly STRIPS any base64 data:image/* strings from all remaining localStorage keys.
 */
export function safeSetStorageItem(key: string, rawValue: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const storage = window.localStorage;
    if (!storage) return false;

    // Never allow products, sales, or heavy order collections in localStorage
    if (FORBIDDEN_LOCALSTORAGE_KEY_SET.has(key)) {
      try {
        storage.removeItem(key);
      } catch {
        // ignore
      }
      return false;
    }

    let valueToStore = rawValue;
    // Never allow base64 images inside localStorage under any key
    if (valueToStore.includes('data:image/')) {
      try {
        const parsed = JSON.parse(valueToStore);
        valueToStore = JSON.stringify(stripBase64ImagesDeep(parsed));
      } catch {
        // Reject raw base64 strings
        if (valueToStore.trim().toLowerCase().startsWith('data:image/')) {
          return false;
        }
      }
    }

    try {
      storage.setItem(key, valueToStore);
      return true;
    } catch {
      // QuotaExceededError fallback: purge any forbidden legacy keys and retry once
      purgeForbiddenLocalStorageKeys();
      try {
        storage.setItem(key, valueToStore);
        return true;
      } catch {
        return false;
      }
    }
  } catch {
    return false;
  }
}

export function safeSetStorageJson(key: string, value: unknown): boolean {
  if (FORBIDDEN_LOCALSTORAGE_KEY_SET.has(key)) {
    purgeForbiddenLocalStorageKeys();
    return false;
  }
  try {
    return safeSetStorageItem(key, JSON.stringify(stripBase64ImagesDeep(value)));
  } catch {
    return false;
  }
}

export function clearHeavyLocalCaches(): void {
  purgeForbiddenLocalStorageKeys();
  idbClear().catch(() => {});
  if (typeof window !== 'undefined') {
    try {
      for (const key of FORBIDDEN_LOCALSTORAGE_KEYS) {
        try {
          window.localStorage.removeItem(key);
        } catch {
          // ignore
        }
      }
    } catch {
      // ignore
    }
  }
}
