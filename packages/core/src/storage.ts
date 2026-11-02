/**
 * Storage adapters. The engine persists through a `StorageAdapter` so the same
 * code backs the widget (localStorage), the extension (chrome.storage), and
 * tests (in-memory). This generalizes the old `webable-shim.js` chrome→local
 * polyfill into one clean seam.
 */
import type { StorageAdapter } from './types';

// Ambient, the extension runtime provides `chrome`; absent in page/test contexts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const chrome: any;

/** Browser localStorage, JSON-encoded. Degrades to no-op if storage is blocked. */
export function localStorageAdapter(namespace = 'webable'): StorageAdapter {
  const ls = (): Storage | null => {
    try {
      return typeof localStorage !== 'undefined' ? localStorage : null;
    } catch {
      // Safari private mode / sandboxed iframes throw on access.
      return null;
    }
  };
  const k = (key: string) => `${namespace}:${key}`;

  return {
    async get<T>(key: string): Promise<T | null> {
      const store = ls();
      if (!store) return null;
      try {
        const raw = store.getItem(k(key));
        return raw == null ? null : (JSON.parse(raw) as T);
      } catch {
        return null;
      }
    },
    async set<T>(key: string, value: T): Promise<void> {
      const store = ls();
      if (!store) return;
      try {
        store.setItem(k(key), JSON.stringify(value));
      } catch {
        // Quota exceeded or unavailable, silently skip; the widget still works.
      }
    },
    async remove(key: string): Promise<void> {
      const store = ls();
      if (!store) return;
      try {
        store.removeItem(k(key));
      } catch {
        /* ignore */
      }
    },
  };
}

/** In-memory adapter, for tests and SSR where no real storage exists. */
export function memoryAdapter(): StorageAdapter {
  const map = new Map<string, unknown>();
  return {
    async get<T>(key: string) {
      return (map.has(key) ? (map.get(key) as T) : null);
    },
    async set<T>(key: string, value: T) {
      map.set(key, value);
    },
    async remove(key: string) {
      map.delete(key);
    },
  };
}

/**
 * chrome.storage.local adapter for the extension. All WebAble data lives under
 * a single `namespace` key so per-origin reads/writes stay one round-trip.
 * Falls back to localStorage when chrome.storage is absent (e.g. dev page).
 */
/**
 * chrome.storage adapter. `which` selects the area: 'local' (default, large
 * quota, per-device) or 'sync' (roams across the user's signed-in devices,
 * tight quotas, 8KB/item, 100KB total). The extension keeps per-site feature
 * settings in 'local' and the small global preference blob in 'sync'.
 * Falls back to localStorage when chrome.storage is absent (e.g. a dev page).
 */
export function chromeStorageAdapter(namespace = 'webable', which: 'local' | 'sync' = 'local'): StorageAdapter {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c: any = typeof chrome !== 'undefined' ? chrome : undefined;
  const area = c?.storage?.[which] || c?.storage?.local;
  if (!area) return localStorageAdapter(namespace);

  const readBag = (): Promise<Record<string, unknown>> =>
    new Promise((resolve) => {
      try {
        area.get(namespace, (res: Record<string, unknown>) => {
          resolve((res && (res[namespace] as Record<string, unknown>)) || {});
        });
      } catch {
        resolve({});
      }
    });

  const writeBag = (bag: Record<string, unknown>): Promise<void> =>
    new Promise((resolve) => {
      try {
        area.set({ [namespace]: bag }, () => resolve());
      } catch {
        resolve();
      }
    });

  /**
   * Every edit is a read of the whole namespace bag, one key changed, and a
   * write back, because chrome.storage has no read-modify-write primitive and
   * everything here lives under a single key to keep reads to one round trip.
   *
   * Two of those in flight at once lose one of the two edits: both read
   * `{a:1}`, one writes `{a:1,b:2}`, the other writes `{a:1,c:3}`, and `b` is
   * gone. Nothing warns, and what the user sees is a setting they changed
   * quietly reverting. The engine writes settings on a debounce while panel
   * actions write their own keys, so two overlapping edits are ordinary rather
   * than exotic.
   *
   * Serialising the edits means each one reads what the last one wrote. Reads
   * stay off the queue: they take no lock and cannot lose anything.
   *
   * What this does NOT fix, said plainly rather than left to be discovered: two
   * separate JS contexts, a content script and the options page, each build
   * their own adapter and their own queue, so they can still interleave. The
   * durable fix for that is one storage item per key instead of one bag, which
   * is a storage format change and needs a migration.
   */
  let queue: Promise<unknown> = Promise.resolve();
  const edit = <T>(fn: () => Promise<T>): Promise<T> => {
    const next = queue.then(fn, fn);
    // The queue must survive a failed edit, or one rejection wedges every
    // later write behind it.
    queue = next.catch(() => {});
    return next;
  };

  return {
    async get<T>(key: string) {
      const bag = await readBag();
      return key in bag ? (bag[key] as T) : null;
    },
    set<T>(key: string, value: T) {
      return edit(async () => {
        const bag = await readBag();
        bag[key] = value;
        await writeBag(bag);
      });
    },
    remove(key: string) {
      return edit(async () => {
        const bag = await readBag();
        delete bag[key];
        await writeBag(bag);
      });
    },
  };
}

/** Picks the right adapter for the current runtime. */
export function defaultStorage(namespace = 'webable'): StorageAdapter {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c: any = typeof chrome !== 'undefined' ? chrome : undefined;
  if (c?.runtime?.id && c?.storage?.local) return chromeStorageAdapter(namespace);
  return localStorageAdapter(namespace);
}
