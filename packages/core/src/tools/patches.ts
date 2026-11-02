/**
 * Site Patches, "fix this site". The user points at an annoying element and
 * picks a safe, CSS/DOM-only action (hide, collapse, full-width, restyle). The
 * patch is stored per origin and re-applied on load. No arbitrary JavaScript,
 * nothing shared or synced. Targets carry fallbacks (tag + text + position) so
 * they survive minor markup changes; if a target is missing on reload the patch
 * is marked stale rather than mangling the page.
 */
import type { StorageAdapter } from '../types';
import { describeElement } from './friction';

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

const KEY = 'patches:v1';

function esc(s: string): string {
  try {
    if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(s);
  } catch {
    /* ignore */
  }
  return s.replace(/[^a-zA-Z0-9_-]/g, '\\$&');
}

const isStableId = (id: string): boolean =>
  !!id && id.length < 40 && !/[0-9]{4,}/.test(id) && !/^[a-z-]*[0-9a-f]{6,}$/i.test(id) && !/:r[0-9a-z]+:/i.test(id);

function stableClasses(el: Element): string[] {
  return Array.from(el.classList)
    .filter(
      (c) =>
        c.length > 1 &&
        c.length < 30 &&
        !/[0-9]{3,}/.test(c) &&
        !/^(css-|sc-|jsx-|svelte-|_)/i.test(c) &&
        !/[A-Za-z0-9]{10,}/.test(c),
    )
    .slice(0, 2);
}

export function buildTarget(el: Element): PatchTarget {
  const doc = el.ownerDocument;
  let selector = '';
  const elId = (el as HTMLElement).id;
  if (elId && isStableId(elId)) {
    selector = `#${esc(elId)}`;
  } else {
    const parts: string[] = [];
    let cur: Element | null = el;
    let depth = 0;
    while (cur && cur !== doc.body && depth < 4) {
      const id = (cur as HTMLElement).id;
      if (id && isStableId(id)) {
        parts.unshift(`#${esc(id)}`);
        break;
      }
      let part = cur.tagName.toLowerCase();
      const cls = stableClasses(cur);
      if (cls.length) part += '.' + cls.map(esc).join('.');
      const parent = cur.parentElement;
      if (parent) {
        const sameTag = Array.from(parent.children).filter((c) => c.tagName === cur!.tagName);
        if (sameTag.length > 1) part += `:nth-of-type(${sameTag.indexOf(cur) + 1})`;
      }
      parts.unshift(part);
      cur = cur.parentElement;
      depth++;
    }
    selector = parts.join(' > ');
  }

  const tag = el.tagName.toLowerCase();
  const text = (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60);
  let nth = 0;
  try {
    nth = Array.from(doc.querySelectorAll(tag))
      .filter((e) => (e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60) === text)
      .indexOf(el);
  } catch {
    /* ignore */
  }
  return { selector, tag, text, nth: Math.max(0, nth) };
}

export function resolveTarget(doc: Document, t: PatchTarget): Element | null {
  try {
    const el = doc.querySelector(t.selector);
    if (el) return el;
  } catch {
    /* invalid selector, fall through */
  }
  if (t.text) {
    try {
      const matches = Array.from(doc.querySelectorAll(t.tag)).filter(
        (e) => (e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60) === t.text,
      );
      if (matches.length) return matches[Math.min(t.nth, matches.length - 1)] || matches[0];
    } catch {
      /* ignore */
    }
  }
  return null;
}

const ACTION_CSS: Record<PatchAction, Record<string, string>> = {
  hide: { display: 'none' },
  collapse: { 'max-height': '0px', overflow: 'hidden', padding: '0', margin: '0', border: 'none' },
  fullwidth: { 'max-width': 'none', width: '100%', 'margin-left': '0', 'margin-right': '0', float: 'none' },
  restyle: { background: 'transparent', 'background-image': 'none', 'box-shadow': 'none', border: 'none' },
};

export function describeAction(a: PatchAction): string {
  return { hide: 'Hide', collapse: 'Collapse', fullwidth: 'Full width', restyle: 'Simplify' }[a];
}

// Union of every property any action sets, so reverting an element never needs
// to know which action created it (handles removed/disabled patches cleanly).
const ALL_PROPS = Array.from(new Set(Object.values(ACTION_CSS).flatMap((o) => Object.keys(o))));

function revertEl(el: HTMLElement) {
  for (const k of ALL_PROPS) el.style.removeProperty(k);
  el.removeAttribute('data-wa-patch');
}

function revertAllDoc(doc: Document) {
  doc.querySelectorAll<HTMLElement>('[data-wa-patch]').forEach(revertEl);
}

export interface PatchStore {
  readonly ready: Promise<void>;
  list(): Patch[];
  add(p: { action: PatchAction; label: string; target: PatchTarget }): Promise<Patch>;
  remove(id: string): Promise<void>;
  toggle(id: string, on?: boolean): Promise<void>;
  applyAll(doc: Document): void;
  revertAll(doc: Document): void;
  subscribe(fn: () => void): () => void;
}

export function createPatchStore(storage: StorageAdapter): PatchStore {
  let patches: Patch[] = [];
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((fn) => fn());
  const persist = () => void storage.set(KEY, patches);

  const ready = storage
    .get<Patch[]>(KEY)
    .then((saved) => {
      if (Array.isArray(saved)) patches = saved;
    })
    .catch(() => undefined);

  function applyOne(doc: Document, p: Patch): boolean {
    const el = resolveTarget(doc, p.target) as HTMLElement | null;
    if (!el) return false;
    el.setAttribute('data-wa-patch', p.id);
    const css = ACTION_CSS[p.action];
    for (const k in css) el.style.setProperty(k, css[k], 'important');
    return true;
  }

  return {
    ready,
    list: () => patches.slice(),
    async add(p) {
      const patch: Patch = {
        id: `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
        action: p.action,
        label: p.label,
        target: p.target,
        enabled: true,
        createdAt: Date.now(),
      };
      patches = [...patches, patch];
      persist();
      emit();
      return patch;
    },
    async remove(id) {
      patches = patches.filter((p) => p.id !== id);
      persist();
      emit();
    },
    async toggle(id, on) {
      patches = patches.map((p) => (p.id === id ? { ...p, enabled: on === undefined ? !p.enabled : on } : p));
      persist();
      emit();
    },
    applyAll(doc) {
      revertAllDoc(doc);
      let changed = false;
      for (const p of patches) {
        if (!p.enabled) continue;
        const ok = applyOne(doc, p);
        if (!!p.stale !== !ok) {
          p.stale = !ok;
          changed = true;
        }
      }
      if (changed) {
        persist();
        emit();
      }
    },
    revertAll(doc) {
      revertAllDoc(doc);
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

export interface PatchPicker {
  stop(): void;
}

/**
 * Live element picker.
 *
 * Mouse: hover to highlight, click to pick. Keyboard: arrows to walk the page,
 * Enter or Space to pick. Escape cancels either way.
 *
 * The keyboard half was missing entirely. `current` was written in exactly one
 * place, by mousemove, so a keyboard-only user could arm the picker from the
 * panel and then had no way to select anything at all: the first Enter or Space
 * they pressed hit the capture-phase click handler with `current === null`,
 * which tore the picker down without picking, while also swallowing that
 * keypress from whatever control they were actually on. Hide, Collapse, Full
 * width and Simplify were unreachable without a pointer.
 *
 * The traversal is a document-order walk over candidate elements rather than a
 * geometric one: the point is to reach a specific thing predictably, and
 * "next element" is the model a screen reader user already has. Up and Down
 * step through siblings and their descendants; Left goes to the parent, Right
 * to the first child, so a container can be selected as easily as the leaf
 * inside it, which is what "hide this whole box" needs.
 */
export function startPatchPicker(doc: Document, onPick: (el: Element) => void): PatchPicker {
  const win = (doc.defaultView || window) as Window;
  const box = doc.createElement('div');
  box.setAttribute('data-webable', 'picker');
  box.style.cssText =
    'position:fixed;z-index:2147483646;pointer-events:none;border:2px solid #1e40af;background:rgba(30,64,175,.14);border-radius:4px;display:none';
  doc.documentElement.appendChild(box);

  // A live region, because the highlight box is the only feedback the picker
  // has and it says nothing to a screen reader. Announcing what is currently
  // selected is the whole difference between "walking the page" and "pressing
  // arrows and hoping".
  const live = doc.createElement('div');
  live.setAttribute('data-webable', 'picker-live');
  live.setAttribute('role', 'status');
  live.setAttribute('aria-live', 'assertive');
  live.style.cssText =
    'position:fixed;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0';
  doc.documentElement.appendChild(live);

  let current: Element | null = null;

  const ours = (el: Element | null) => !el || el === box || el === live || !!el.closest?.('#webable-widget-root');

  /** Worth stopping on: has a box, and is not our own UI or invisible chrome. */
  const usable = (el: Element | null): el is HTMLElement => {
    if (!el || ours(el)) return false;
    const tag = el.tagName;
    if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'LINK' || tag === 'META' || tag === 'HEAD') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  const show = (el: Element, announce: boolean) => {
    current = el;
    const r = el.getBoundingClientRect();
    box.style.display = 'block';
    box.style.left = `${r.left}px`;
    box.style.top = `${r.top}px`;
    box.style.width = `${r.width}px`;
    box.style.height = `${r.height}px`;
    if (announce) {
      try {
        (el as HTMLElement).scrollIntoView({ block: 'nearest', inline: 'nearest' });
      } catch {
        /* older engines */
      }
      live.textContent = describeElement(el);
    }
  };

  /** Every usable element in document order. Rebuilt per keypress so the walk
   *  stays correct on a page that is still changing under it. */
  const walkable = (): HTMLElement[] =>
    Array.from(doc.body ? doc.body.querySelectorAll<HTMLElement>('*') : []).filter(usable);

  const step = (delta: number) => {
    const all = walkable();
    if (!all.length) return;
    const i = current ? all.indexOf(current as HTMLElement) : -1;
    const next = all[Math.min(all.length - 1, Math.max(0, (i < 0 ? 0 : i + delta)))];
    if (next) show(next, true);
  };

  const move = (e: Event) => {
    const ev = e as MouseEvent;
    const el = doc.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null;
    if (!el || ours(el)) return;
    show(el, false);
  };

  const click = (e: Event) => {
    if ((e.target as HTMLElement)?.closest?.('#webable-widget-root')) return;
    e.preventDefault();
    e.stopPropagation();
    const picked = current;
    cleanup();
    if (picked) onPick(picked);
  };

  const key = (e: Event) => {
    const ev = e as KeyboardEvent;
    if (ev.key === 'Escape') {
      cleanup();
      return;
    }
    // Every branch below stops the event: while the picker is armed the page
    // must not also act on the keypress. This is why the old handler swallowing
    // Enter without picking was so bad.
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowRight') {
      ev.preventDefault();
      ev.stopPropagation();
      if (ev.key === 'ArrowRight' && current) {
        const child = Array.from(current.children).find(usable);
        if (child) return show(child, true);
      }
      return step(1);
    }
    if (ev.key === 'ArrowUp' || ev.key === 'ArrowLeft') {
      ev.preventDefault();
      ev.stopPropagation();
      if (ev.key === 'ArrowLeft' && current?.parentElement && usable(current.parentElement)) {
        return show(current.parentElement, true);
      }
      return step(-1);
    }
    if (ev.key === 'Enter' || ev.key === ' ' || ev.key === 'Spacebar') {
      ev.preventDefault();
      ev.stopPropagation();
      if (!current) {
        // Nothing selected yet: start the walk rather than cancelling, which is
        // what this used to do.
        return step(1);
      }
      const picked = current;
      cleanup();
      onPick(picked);
    }
  };

  function cleanup() {
    win.removeEventListener('mousemove', move, true);
    win.removeEventListener('click', click, true);
    win.removeEventListener('keydown', key, true);
    box.remove();
    live.remove();
  }

  win.addEventListener('mousemove', move, true);
  win.addEventListener('click', click, true);
  win.addEventListener('keydown', key, true);
  live.textContent = 'Element picker on. Arrow keys to choose, Enter to pick, Escape to cancel.';
  return { stop: cleanup };
}
