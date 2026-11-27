/**
 * Safe Storage Wrapper (Enterprise Iframe & Sandbox Resilience)
 *
 * In embedded preview iframes (e.g. Google AI Studio Preview), strict browser privacy
 * modes, or restricted corporate networks, direct access to `window.localStorage` or
 * `window.sessionStorage` can throw a `SecurityError` or `QuotaExceededError`, causing
 * a blank white screen on boot.
 *
 * This wrapper tests storage availability inside `try/catch` blocks and transparently
 * falls back to an isolated in-memory Map store whenever persistent browser storage
 * is blocked or unavailable.
 */

export interface SafeStorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): boolean;
  removeItem(key: string): void;
  clear(): void;
  key(index: number): string | null;
  get length(): number;
  getJSON<T>(key: string, fallback: T): T;
  setJSON(key: string, value: unknown): boolean;
  isPersistent(): boolean;
}

const STORAGE_PROBE_KEY = '__qaem_storage_probe__';

function createSafeStorageAdapter(
  kind: 'localStorage' | 'sessionStorage'
): SafeStorageAdapter {
  const memoryStore = new Map<string, string>();
  let nativeAvailable: boolean | null = null;

  const getNativeStorage = (): Storage | null => {
    if (typeof window === 'undefined') return null;
    try {
      const storage = window[kind];
      if (!storage) return null;
      if (nativeAvailable === null) {
        storage.setItem(STORAGE_PROBE_KEY, '1');
        storage.removeItem(STORAGE_PROBE_KEY);
        nativeAvailable = true;
      }
      return nativeAvailable ? storage : null;
    } catch {
      nativeAvailable = false;
      return null;
    }
  };

  return {
    getItem(key: string): string | null {
      const native = getNativeStorage();
      if (native) {
        try {
          const val = native.getItem(key);
          if (val !== null) return val;
        } catch {
          nativeAvailable = false;
        }
      }
      return memoryStore.has(key) ? (memoryStore.get(key) ?? null) : null;
    },

    setItem(key: string, value: string): boolean {
      const stringValue = String(value);
      memoryStore.set(key, stringValue);
      const native = getNativeStorage();
      if (native) {
        try {
          native.setItem(key, stringValue);
          return true;
        } catch {
          // QuotaExceededError or sandbox restriction: keep value safely in memoryStore
          return false;
        }
      }
      return false;
    },

    removeItem(key: string): void {
      memoryStore.delete(key);
      const native = getNativeStorage();
      if (native) {
        try {
          native.removeItem(key);
        } catch {
          // Ignore sandbox or security errors
        }
      }
    },

    clear(): void {
      memoryStore.clear();
      const native = getNativeStorage();
      if (native) {
        try {
          native.clear();
        } catch {
          // Ignore sandbox or security errors
        }
      }
    },

    key(index: number): string | null {
      const native = getNativeStorage();
      if (native) {
        try {
          return native.key(index);
        } catch {
          nativeAvailable = false;
        }
      }
      const keys = Array.from(memoryStore.keys());
      return index >= 0 && index < keys.length ? keys[index] : null;
    },

    get length(): number {
      const native = getNativeStorage();
      if (native) {
        try {
          return native.length;
        } catch {
          nativeAvailable = false;
        }
      }
      return memoryStore.size;
    },

    getJSON<T>(key: string, fallback: T): T {
      try {
        const raw = this.getItem(key);
        if (!raw) return fallback;
        return JSON.parse(raw) as T;
      } catch {
        return fallback;
      }
    },

    setJSON(key: string, value: unknown): boolean {
      try {
        return this.setItem(key, JSON.stringify(value));
      } catch {
        return false;
      }
    },

    isPersistent(): boolean {
      return getNativeStorage() !== null;
    },
  };
}

/** Drop-in safe replacement for `window.localStorage` with automatic in-memory fallback */
export const safeStorage: SafeStorageAdapter = createSafeStorageAdapter('localStorage');

/** Drop-in safe replacement for `window.sessionStorage` with automatic in-memory fallback */
export const safeSessionStorage: SafeStorageAdapter = createSafeStorageAdapter('sessionStorage');
