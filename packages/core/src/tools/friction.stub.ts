/**
 * The widget's stand-in for tools/friction.ts.
 *
 * The friction log is extension-only: `FrictionBlock` renders only under
 * `config.surface === 'extension'` and reaches the panel through
 * extensionBlocks.tsx, which the widget build already swaps for a stub. So the
 * UI half was gone. What was left behind is the same shape Site Patches was in:
 * the engine constructs a friction store unconditionally, so the widget shipped
 * the entry list, the storage round trip, the id generation and the subscriber
 * set for a feature with no way to reach it, and re-exported the reasons and
 * `describeElement` beside it.
 *
 * Everything is a no-op with the same shape, so the engine needs no branch:
 * `ready` resolves, `list` is always empty, and the writers do nothing. Keep the
 * export surface in step with friction.ts; a rename that misses this file
 * surfaces as a widget build error, not a type error.
 *
 * Note what this is NOT. Nothing here is disabled at runtime by a flag, because
 * a flag would not remove the code: esbuild decides what to tree-shake before it
 * folds constants, which is the same reason extensionBlocks needs a stub rather
 * than a `surface` check. See apps/widget/build.mjs.
 */
import type { StorageAdapter } from '../types';

export interface FrictionEntry {
  id: string;
  url: string;
  reason: string;
  element: string;
  ts: number;
  screenshot?: string;
}

export const FRICTION_REASONS: string[] = [];

export function describeElement(_el: Element | null): string {
  return '(page)';
}

export interface FrictionStore {
  readonly ready: Promise<void>;
  list(): FrictionEntry[];
  add(e: { url: string; reason: string; element: string; screenshot?: string }): Promise<FrictionEntry>;
  remove(id: string): Promise<void>;
  clear(): Promise<void>;
  subscribe(fn: () => void): () => void;
}

export function createFrictionStore(_storage: StorageAdapter): FrictionStore {
  return {
    ready: Promise.resolve(),
    list: () => [],
    async add(e) {
      return { id: '', url: e.url, reason: e.reason, element: e.element, ts: 0 };
    },
    async remove() {},
    async clear() {},
    subscribe() {
      return () => {};
    },
  };
}
