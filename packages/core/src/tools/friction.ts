/**
 * Friction log, one tap to record that something on a page was frustrating.
 * Local-first: entries (url, reason, element descriptor, timestamp, optional
 * screenshot) are stored on-device via the storage adapter. Nothing leaves the
 * device. Any future sharing/analytics must be a separate, explicit opt-in.
 */
import type { StorageAdapter } from '../types';

export interface FrictionEntry {
  id: string;
  url: string;
  reason: string;
  element: string;
  ts: number;
  screenshot?: string; // data URL, only when the user opts in per capture
}

export const FRICTION_REASONS = [
  "Couldn't find the button",
  'A popup blocked me',
  'The form broke',
  'Too cluttered',
  "Couldn't cancel or unsubscribe",
  'Confusing layout',
  'Something else',
];

const KEY = 'friction:v1';

export function describeElement(el: Element | null): string {
  if (!el) return '(page)';
  const tag = el.tagName.toLowerCase();
  const id = (el as HTMLElement).id ? `#${(el as HTMLElement).id}` : '';
  const cls = el.classList[0] ? `.${el.classList[0]}` : '';
  const txt = (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40);
  return `${tag}${id}${cls}${txt ? ` "${txt}"` : ''}`;
}

export interface FrictionStore {
  readonly ready: Promise<void>;
  list(): FrictionEntry[];
  add(e: { url: string; reason: string; element: string; screenshot?: string }): Promise<FrictionEntry>;
  remove(id: string): Promise<void>;
  clear(): Promise<void>;
  subscribe(fn: () => void): () => void;
}

export function createFrictionStore(storage: StorageAdapter): FrictionStore {
  let entries: FrictionEntry[] = [];
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((fn) => fn());
  const persist = () => void storage.set(KEY, entries);

  const ready = storage
    .get<FrictionEntry[]>(KEY)
    .then((saved) => {
      if (Array.isArray(saved)) entries = saved;
    })
    .catch(() => undefined);

  return {
    ready,
    list: () => entries.slice().reverse(),
    async add(e) {
      const entry: FrictionEntry = {
        id: `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
        url: e.url,
        reason: e.reason,
        element: e.element,
        ts: Date.now(),
        ...(e.screenshot ? { screenshot: e.screenshot } : {}),
      };
      entries = [...entries, entry].slice(-100);
      persist();
      emit();
      return entry;
    },
    async remove(id) {
      entries = entries.filter((x) => x.id !== id);
      persist();
      emit();
    },
    async clear() {
      entries = [];
      persist();
      emit();
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
