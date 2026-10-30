/**
 * A minimal observable store. No dependencies, small enough to ship into a
 * host page. Holds a single immutable-ish state object; `set` shallow-merges a
 * patch (or runs an updater) and notifies subscribers synchronously.
 */
export type Updater<T> = Partial<T> | ((prev: T) => T);

export interface Store<T extends object> {
  get(): T;
  set(updater: Updater<T>): void;
  /** Subscribe to changes. Returns an unsubscribe function. */
  subscribe(fn: (state: T) => void): () => void;
}

export function createStore<T extends object>(initial: T): Store<T> {
  let state = initial;
  const listeners = new Set<(state: T) => void>();

  return {
    get: () => state,
    set(updater) {
      const patch = typeof updater === 'function' ? updater(state) : updater;
      if (patch === state) return;
      state = { ...state, ...patch };
      for (const fn of listeners) {
        try {
          fn(state);
        } catch {
          // A misbehaving subscriber must never break the others or the engine.
        }
      }
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
