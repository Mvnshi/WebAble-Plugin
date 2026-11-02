/**
 * The widget's stand-in for tools/patches.ts.
 *
 * Site Patches ("fix this site") is extension-only: it needs per-origin storage
 * the widget does not have, and its UI block is already swapped out of the
 * widget build. What was left behind was the engine, which constructs a patch
 * store unconditionally, so the widget shipped 5.5 KB of selector building,
 * target resolution and the element picker for a feature with no way to reach
 * it. apps/widget/build.mjs resolves the module here instead.
 *
 * Everything is a no-op with the same shape, so the engine needs no branch:
 * `patches.ready` resolves, `applyAll` and `revertAll` do nothing, and the list
 * is always empty. Keep the export surface in step with patches.ts; a rename
 * that misses this file surfaces as a widget build error, not a type error.
 */
import type { StorageAdapter } from '../types';

export type PatchAction = 'hide' | 'collapse' | 'fullwidth' | 'restyle';

export interface PatchTarget {
  selector: string;
  tag: string;
  text: string;
  nth: number;
}

export interface Patch {
  id: string;
  action: PatchAction;
  label: string;
  target: PatchTarget;
  enabled: boolean;
  createdAt: number;
  stale?: boolean;
}

export interface PatchStore {
  readonly ready: Promise<void>;
  list(): Patch[];
  add(p: Omit<Patch, 'id' | 'createdAt' | 'enabled'>): Promise<void>;
  remove(id: string): Promise<void>;
  toggle(id: string, on?: boolean): Promise<void>;
  applyAll(doc: Document): void;
  revertAll(doc: Document): void;
  subscribe(fn: () => void): () => void;
}

export interface PatchPicker {
  stop(): void;
}

const done = Promise.resolve();

export function createPatchStore(_storage: StorageAdapter): PatchStore {
  return {
    ready: done,
    list: () => [],
    add: () => done,
    remove: () => done,
    toggle: () => done,
    applyAll() {},
    revertAll() {},
    subscribe: () => () => {},
  };
}

export function buildTarget(_el: Element): PatchTarget {
  return { selector: '', tag: '', text: '', nth: 0 };
}
export function resolveTarget(_doc: Document, _t: PatchTarget): Element | null {
  return null;
}
export function describeAction(_a: PatchAction): string {
  return '';
}
export function startPatchPicker(_doc: Document, _onPick: (el: Element) => void): PatchPicker {
  return { stop() {} };
}
