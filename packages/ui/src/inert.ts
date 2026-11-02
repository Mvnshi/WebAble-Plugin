/**
 * Makes the host page inert while the panel is open.
 *
 * The panel has always declared `role="dialog" aria-modal="true"`, and nothing
 * behind it was ever inert or aria-hidden. aria-modal is a promise to assistive
 * technology, not a mechanism: a screen reader user could keep arrowing through
 * the whole page underneath, reading a document the dialog claims has been
 * taken away from them. On an accessibility product, a modal that is only
 * modal on paper is the wrong kind of bug to ship.
 *
 * What this does: every top-level element in <body>, plus every sibling of our
 * own host under <html>, gets `inert` and `aria-hidden="true"` on open, and has
 * them removed on close. Our host is skipped, so the panel and launcher stay
 * reachable.
 *
 * Why the whole subtree and not a focus trap alone: the trap in Panel.tsx keeps
 * Tab inside the dialog, but virtual cursors, rotors, and touch exploration do
 * not use Tab. `inert` is the only thing that removes content from all of them
 * at once, and it is supported everywhere the widget runs (Chrome/Edge 102+,
 * Firefox 112+, Safari 15.5+). `aria-hidden` is set alongside it so a browser
 * without `inert` still hides the content from assistive tech, even though its
 * keyboard focus would remain: that is a strictly better failure than today's.
 *
 * Elements the host page had already marked are left exactly as found, so
 * closing the panel never reveals something the site had deliberately hidden.
 */

const MARK = 'data-webable-inerted';

interface Applied {
  el: HTMLElement;
  /** The element already carried aria-hidden; do not touch it on restore. */
  hadAriaHidden: boolean;
  hadInert: boolean;
}

let applied: Applied[] | null = null;
let watcher: MutationObserver | null = null;

/** Everything a screen reader could reach that is not our own UI. */
function siblingsToHide(doc: Document, host: Element | null): HTMLElement[] {
  const out: HTMLElement[] = [];
  const roots: Element[] = [];
  if (doc.body) roots.push(...Array.from(doc.body.children));
  // The widget mounts its host as a sibling of <body> under <html>, so anything
  // else parked up there (other widgets, portals) has to be covered too.
  if (doc.documentElement) {
    for (const el of Array.from(doc.documentElement.children)) {
      if (el.tagName !== 'BODY' && el.tagName !== 'HEAD') roots.push(el);
    }
  }
  for (const el of roots) {
    if (host && (el === host || el.contains(host))) continue;
    out.push(el as HTMLElement);
  }
  return out;
}

/** Mark one element, recording what it already carried. */
function mark(el: HTMLElement, list: Applied[]): void {
  if (el.hasAttribute(MARK)) return;
  const hadAriaHidden = el.hasAttribute('aria-hidden');
  const hadInert = el.hasAttribute('inert');
  if (!hadAriaHidden) el.setAttribute('aria-hidden', 'true');
  if (!hadInert) el.setAttribute('inert', '');
  el.setAttribute(MARK, '');
  list.push({ el, hadAriaHidden, hadInert });
}

/** Hide everything except our host from assistive tech and from focus. */
export function applyInert(doc: Document, host: Element | null): void {
  if (applied) return; // already on; open() is idempotent
  const list: Applied[] = [];
  for (const el of siblingsToHide(doc, host)) mark(el, list);
  applied = list;

  // The barrier used to be a single snapshot taken at open, so a cookie
  // banner, a chat widget, or an SPA re-render that mounted a top-level
  // element while the panel was open sat outside it: fully reachable behind a
  // dialog that calls itself modal. Watch for new top-level children and mark
  // them too. childList only, not subtree: `inert` and `aria-hidden` are
  // inherited by descendants, so marking the root of each new tree is enough
  // and a subtree observer on a live page is a needless cost.
  const Ctor =
    (doc.defaultView as (Window & { MutationObserver?: typeof MutationObserver }) | null)?.MutationObserver ||
    (typeof MutationObserver === 'undefined' ? undefined : MutationObserver);
  if (!Ctor) return;
  watcher = new Ctor(() => {
    if (!applied) return;
    for (const el of siblingsToHide(doc, host)) mark(el, applied);
  });
  for (const root of [doc.body, doc.documentElement]) {
    if (root) watcher.observe(root, { childList: true });
  }
}

/** Give the page back. Safe to call when nothing was applied. */
export function releaseInert(doc: Document): void {
  watcher?.disconnect();
  watcher = null;
  const list = applied;
  applied = null;
  for (const { el, hadAriaHidden, hadInert } of list || []) {
    if (!hadAriaHidden) el.removeAttribute('aria-hidden');
    if (!hadInert) el.removeAttribute('inert');
    el.removeAttribute(MARK);
  }
  // Then sweep by marker regardless. If an SPA route change replaced the DOM
  // while the panel was open, the recorded list no longer points at the nodes
  // on screen, and leaving the page inert would lock the user out of the site.
  // Nothing may leave this function with our marker still on it.
  doc.querySelectorAll(`[${MARK}]`).forEach((el) => {
    el.removeAttribute('aria-hidden');
    el.removeAttribute('inert');
    el.removeAttribute(MARK);
  });
}
