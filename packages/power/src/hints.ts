/**
 * Click anything without a mouse.
 *
 * Press the shortcut and every link, button and field you can see gets a
 * short label. Type the label and it is clicked. That is the whole interaction,
 * and it changes what a keyboard can do on the web: Tab walks every control in
 * source order, often fifty presses to reach one button; this is two keys to
 * any of them.
 *
 * Who it is for, in the order it was designed for:
 *   - people who cannot use a mouse, or for whom a mouse hurts (tremor, RSI,
 *     limited reach, switch access),
 *   - voice control users, through number mode: "type 14" is a command every
 *     dictation system already understands,
 *   - anyone who would rather keep their hands on the keyboard.
 *
 * Two label styles. Letters use the home row and are as short as the count
 * allows, so most pages need two keys. Numbers count up from 1 and, because
 * digits leave the letters free, letters filter by the words on the control:
 * type "check" and only the controls saying "checkout" stay numbered.
 *
 * Holding Shift on the last key opens a link in a new tab instead.
 */
import { accessibleName } from './pageMap';

export type HintMode = 'letters' | 'numbers';

export interface HintOptions {
  mode?: HintMode;
  /** Open links in a new tab rather than following them. */
  newTab?: boolean;
  /** Called once the hints are gone, whatever removed them. */
  onDone?: (result: { clicked: Element | null }) => void;
  /** Characters letter labels are made from. Home row first. */
  alphabet?: string;
}

export interface HintSession {
  stop(): void;
  readonly count: number;
}

const CLICKABLE = [
  'a[href]',
  'area[href]',
  'button',
  'input:not([type="hidden"])',
  'select',
  'textarea',
  'summary',
  'label[for]',
  '[contenteditable=""]',
  '[contenteditable="true"]',
  '[role="button"]',
  '[role="link"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="switch"]',
  '[role="tab"]',
  '[role="menuitem"]',
  '[role="menuitemcheckbox"]',
  '[role="menuitemradio"]',
  '[role="option"]',
  '[role="treeitem"]',
  '[role="combobox"]',
  '[onclick]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * Labels for `n` targets, all the same length and none a prefix of another.
 * Same length matters as much as prefix-free: a page where some labels are one
 * key and some are two makes a person look at every label to know how many
 * keys to press.
 */
export function letterLabels(n: number, alphabet = 'sadfjklewcmpgh'): string[] {
  if (n <= 0) return [];
  const chars = [...new Set(alphabet.toLowerCase())];
  let len = 1;
  while (Math.pow(chars.length, len) < n) len++;
  const out: string[] = [];
  const walk = (prefix: string) => {
    if (out.length >= n) return;
    if (prefix.length === len) {
      out.push(prefix);
      return;
    }
    for (const c of chars) walk(prefix + c);
  };
  walk('');
  return out;
}

/** Every element in open shadow roots too: modern sites put buttons there. */
function deepQueryAll(root: Document | ShadowRoot, sel: string, out: Element[] = []): Element[] {
  for (const el of Array.from(root.querySelectorAll(sel))) out.push(el);
  for (const el of Array.from(root.querySelectorAll('*'))) {
    const sr = (el as HTMLElement).shadowRoot;
    // WebAble's own transient UI (the toast, the bar) is not part of the page.
    // closest() cannot see across a shadow boundary, so the host is checked here.
    if (sr && !el.hasAttribute('data-webable-ui')) deepQueryAll(sr, sel, out);
  }
  return out;
}

/**
 * Clickable things a person can actually see right now: in the viewport, not
 * covered by something else, not disabled. The covered check is what keeps
 * labels off a page that a modal is sitting on top of, where a click would
 * land on the modal anyway.
 */
export function visibleClickables(doc: Document): Element[] {
  const win = doc.defaultView!;
  const vw = win.innerWidth;
  const vh = win.innerHeight;
  const candidates = deepQueryAll(doc, CLICKABLE);

  // Things that look clickable without saying so: a div with a click handler
  // and a pointer cursor. Checked only for elements already on screen and with
  // a cap, because getComputedStyle on every node of a large page is slow.
  const extra: Element[] = [];
  let checked = 0;
  for (const el of Array.from(doc.querySelectorAll('div, span, li, img, svg'))) {
    if (checked++ > 2500) break;
    if (el.closest(CLICKABLE)) continue;
    const r = el.getBoundingClientRect();
    if (r.bottom < 0 || r.top > vh || r.width < 8 || r.height < 8 || r.width > vw * 0.8) continue;
    if (win.getComputedStyle(el).cursor !== 'pointer') continue;
    const parent = el.parentElement;
    if (parent && win.getComputedStyle(parent).cursor === 'pointer') continue;
    extra.push(el);
  }

  const out: Element[] = [];
  const seenRects = new Set<string>();
  for (const el of [...candidates, ...extra]) {
    if (el.closest('[data-webable-ui]')) continue;
    if ((el as HTMLButtonElement).disabled) continue;
    if (el.closest('[aria-hidden="true"], [inert]')) continue;
    // A label for an input that is itself clickable would get two hints for
    // one control.
    if (el.tagName === 'LABEL' && candidates.includes(doc.getElementById((el as HTMLLabelElement).htmlFor) as Element)) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 3 || r.height < 3) continue;
    if (r.bottom <= 0 || r.right <= 0 || r.top >= vh || r.left >= vw) continue;
    const key = `${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)}`;
    if (seenRects.has(key)) continue;
    if (!onTop(doc, el, r)) continue;
    seenRects.add(key);
    out.push(el);
  }
  return out;
}

/** Whether a click at this element's visible centre would reach it. */
function onTop(doc: Document, el: Element, r: DOMRect): boolean {
  const win = doc.defaultView!;
  const x = Math.min(Math.max(r.left + Math.min(r.width / 2, 12), 0), win.innerWidth - 1);
  const y = Math.min(Math.max(r.top + r.height / 2, 0), win.innerHeight - 1);
  let hit = doc.elementFromPoint(x, y);
  // Descend into open shadow roots, where elementFromPoint stops at the host.
  while (hit && (hit as HTMLElement).shadowRoot) {
    const inner = (hit as HTMLElement).shadowRoot!.elementFromPoint(x, y);
    if (!inner || inner === hit) break;
    hit = inner;
  }
  if (!hit) return true; // no layout (tests): assume visible
  if (hit.closest('[data-webable-ui]')) return true;
  return el === hit || el.contains(hit) || hit.contains(el);
}

const STYLE = `
:host { all: initial; }
.layer { position: fixed; inset: 0; pointer-events: none; z-index: 2147483646; }
.hint {
  position: fixed; transform: translate(-4px, -4px);
  font: 700 13px/1 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  letter-spacing: .04em; text-transform: uppercase;
  padding: 3px 5px 3px; border-radius: 6px;
  color: #0a1020; background: #ffd84d;
  border: 1.5px solid #0a1020;
  box-shadow: 0 2px 6px rgba(0,0,0,.35);
  white-space: nowrap;
}
.hint .typed { color: #0a1020; opacity: .35; }
.hint.num { background: #2f80ff; color: #fff; border-color: #fff; }
.hint.num .typed { color: #fff; }
.hint.dim { opacity: 0; }
.bar {
  position: fixed; left: 50%; top: 16px; transform: translateX(-50%);
  font: 600 14px/1.3 system-ui, -apple-system, Segoe UI, sans-serif;
  color: #fff; background: rgba(10,16,32,.92); border: 1px solid rgba(255,255,255,.18);
  padding: 9px 14px; border-radius: 999px; box-shadow: 0 10px 30px rgba(0,0,0,.35);
  display: flex; gap: 10px; align-items: center; pointer-events: none;
}
.bar kbd {
  font: 600 12px ui-monospace, Menlo, monospace; padding: 1px 6px; border-radius: 5px;
  background: rgba(255,255,255,.14); border: 1px solid rgba(255,255,255,.25);
}
.bar .q { color: #ffd84d; font-family: ui-monospace, Menlo, monospace; }
@media (prefers-reduced-motion: no-preference) {
  .hint { animation: pop .12s ease-out; }
  @keyframes pop { from { transform: translate(-4px, -4px) scale(.6); opacity: 0; } }
}
`;

/** Show hints, wait for keys, click, clean up. One session at a time. */
export function startHints(doc: Document, opts: HintOptions = {}): HintSession {
  const win = doc.defaultView!;
  const mode: HintMode = opts.mode || 'letters';
  let newTab = !!opts.newTab;

  const host = doc.createElement('webable-hints');
  host.setAttribute('data-webable-ui', 'hints');
  const root = host.attachShadow({ mode: 'closed' });
  const style = doc.createElement('style');
  style.textContent = STYLE;
  const layer = doc.createElement('div');
  layer.className = 'layer';
  // Hints are a visual tool. A screen reader user has better ways to reach a
  // control, and reading out two hundred two-letter codes would help nobody.
  layer.setAttribute('aria-hidden', 'true');
  const bar = doc.createElement('div');
  bar.className = 'bar';
  root.append(style, layer, bar);

  // A polite live region outside the shadow root, so the one thing a screen
  // reader does need to know (hints are up, how to leave) is announced.
  const live = doc.createElement('div');
  live.setAttribute('data-webable-ui', 'hints-live');
  live.setAttribute('role', 'status');
  Object.assign(live.style, { position: 'fixed', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0 0 0 0)' });

  const targets = visibleClickables(doc);
  const names = targets.map((el) => accessibleName(el).toLowerCase());
  let typed = '';
  let filter = '';
  let pendingTimer = 0;
  let done = false;

  type Shown = { el: Element; label: string; node: HTMLElement };
  let shown: Shown[] = [];

  function render(): void {
    layer.textContent = '';
    const pool = targets
      .map((el, i) => ({ el, name: names[i] }))
      .filter((t) => !filter || t.name.includes(filter));
    const labels = mode === 'letters' ? letterLabels(pool.length, opts.alphabet) : pool.map((_, i) => String(i + 1));
    shown = pool.map((t, i) => {
      const node = doc.createElement('div');
      node.className = mode === 'numbers' ? 'hint num' : 'hint';
      const r = t.el.getBoundingClientRect();
      node.style.left = `${Math.max(4, r.left)}px`;
      node.style.top = `${Math.max(4, r.top)}px`;
      layer.appendChild(node);
      return { el: t.el, label: labels[i], node };
    });
    paint();
  }

  function paint(): void {
    for (const s of shown) {
      const match = s.label.startsWith(typed);
      s.node.classList.toggle('dim', !match);
      s.node.textContent = '';
      if (match && typed) {
        const t = doc.createElement('span');
        t.className = 'typed';
        t.textContent = typed;
        s.node.append(t, s.label.slice(typed.length));
      } else {
        s.node.textContent = s.label;
      }
    }
    const left = shown.filter((s) => s.label.startsWith(typed)).length;
    bar.innerHTML = '';
    const msg = doc.createElement('span');
    msg.textContent =
      mode === 'numbers'
        ? filter
          ? `${left} matching`
          : 'Type a number, or words to filter'
        : `Type a label to click${newTab ? ' (new tab)' : ''}`;
    bar.append(msg);
    if (filter) {
      const q = doc.createElement('span');
      q.className = 'q';
      q.textContent = `"${filter}"`;
      bar.append(q);
    }
    const esc = doc.createElement('kbd');
    esc.textContent = 'Esc';
    bar.append(esc);
  }

  function activate(el: Element): void {
    stop(el);
    const h = el as HTMLElement;
    const link = el.closest('a[href]') as HTMLAnchorElement | null;
    if (link && newTab) {
      win.open(link.href, '_blank', 'noopener');
      return;
    }
    if (h.matches('input:not([type="button"]):not([type="submit"]):not([type="checkbox"]):not([type="radio"]):not([type="reset"]):not([type="file"]), textarea, select, [contenteditable=""], [contenteditable="true"]')) {
      h.focus();
      try {
        (h as HTMLSelectElement).showPicker?.();
      } catch {
        /* showPicker needs a user gesture in some browsers; focus is enough */
      }
      return;
    }
    try {
      h.focus({ preventScroll: true });
    } catch {
      /* not focusable, clicking is what matters */
    }
    // A full pointer sequence, not only click(): menus built on pointerdown or
    // mousedown (a lot of them) ignore a bare click event.
    const r = h.getBoundingClientRect();
    const init = { bubbles: true, cancelable: true, composed: true, view: win, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, button: 0 };
    for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup']) {
      const Ctor = type.startsWith('pointer') && 'PointerEvent' in win ? win.PointerEvent : win.MouseEvent;
      h.dispatchEvent(new Ctor(type, init));
    }
    h.click();
  }

  function onKey(e: KeyboardEvent): void {
    if (done) return;
    // Everything typed belongs to the hints while they are up; letting a key
    // through would fire the site's own shortcuts underneath.
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.key === 'Escape') return stop(null);
    if (e.key === 'Shift') {
      newTab = true;
      paint();
      return;
    }
    if (e.key === 'Backspace') {
      if (typed) typed = typed.slice(0, -1);
      else if (filter) {
        filter = filter.slice(0, -1);
        render();
        return;
      }
      paint();
      return;
    }
    if (e.key === 'Enter') {
      const hit = shown.filter((s) => s.label.startsWith(typed));
      if (hit[0]) activate(hit[0].el);
      return;
    }
    if (e.key.length !== 1) return;
    if (e.shiftKey) newTab = true;
    const k = e.key.toLowerCase();

    if (mode === 'numbers' && !/[0-9]/.test(k)) {
      // Letters and spaces filter by what the control says.
      filter += k;
      typed = '';
      render();
      // Words narrowed it to one control: that is the one they mean.
      if (shown.length === 1) activate(shown[0].el);
      return;
    }

    const next = typed + k;
    const matches = shown.filter((s) => s.label.startsWith(next));
    if (!matches.length) return; // a wrong key is ignored, not fatal
    typed = next;
    win.clearTimeout(pendingTimer);
    const exact = matches.find((s) => s.label === typed);
    if (exact && matches.length === 1) return activate(exact.el);
    if (exact) {
      // "1" when there is also a "12": wait a beat for the second digit.
      pendingTimer = win.setTimeout(() => activate(exact.el), 900);
    }
    paint();
  }

  function onKeyUp(e: KeyboardEvent): void {
    if (e.key === 'Shift' && !opts.newTab) {
      newTab = false;
      paint();
    }
  }

  function stop(clicked: Element | null): void {
    if (done) return;
    done = true;
    win.clearTimeout(pendingTimer);
    win.removeEventListener('keydown', onKey, true);
    win.removeEventListener('keyup', onKeyUp, true);
    win.removeEventListener('scroll', cancel, true);
    win.removeEventListener('resize', cancel);
    win.removeEventListener('blur', cancel);
    doc.removeEventListener('mousedown', cancel, true);
    host.remove();
    live.remove();
    opts.onDone?.({ clicked });
  }
  // Labels are placed against where things were. Once the page moves they
  // point at the wrong things, so moving it ends the session.
  const cancel = () => stop(null);

  if (!targets.length) {
    live.textContent = 'Nothing clickable is visible.';
    doc.documentElement.appendChild(live);
    win.setTimeout(() => live.remove(), 3000);
    opts.onDone?.({ clicked: null });
    return { stop: () => undefined, count: 0 };
  }

  doc.documentElement.append(host, live);
  render();
  live.textContent = `${targets.length} click hints shown. Type a ${mode === 'numbers' ? 'number' : 'label'}, or press Escape.`;
  win.addEventListener('keydown', onKey, true);
  win.addEventListener('keyup', onKeyUp, true);
  // Deferred a tick so the keypress that opened the hints cannot close them.
  win.setTimeout(() => {
    if (done) return;
    win.addEventListener('scroll', cancel, true);
    win.addEventListener('resize', cancel);
    win.addEventListener('blur', cancel);
    doc.addEventListener('mousedown', cancel, true);
  }, 50);

  return { stop: () => stop(null), count: targets.length };
}
